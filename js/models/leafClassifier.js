/**
 * AgroSentinel AI - Contrôle qualité de l'image de feuille (MobileNet v1)
 *
 * ⚠️ PÉRIMÈTRE ASSUMÉ
 * MobileNet est entraîné sur ImageNet-1000, un jeu de données généraliste
 * qui ne contient aucune classe "manioc", "tomate", "mil" ou "sorgho", et
 * encore moins de classes de maladies phytosanitaires. Il est donc
 * techniquement incapable d'établir un diagnostic agricole.
 *
 * Nous l'utilisons uniquement pour ce qu'il sait faire de façon fiable :
 * indiquer si la photo soumise contient, ou non, un contexte végétal
 * (feuille, plante, fleur, insecte de culture...). C'est un contrôle de
 * CADRAGE, jamais un diagnostic.
 *
 * Le diagnostic lui-même repose sur la base agronomique de config.js,
 * validée pour les cultures vivrières du Togo, et sur la confirmation
 * visuelle de l'agriculteur (parcours guidé — voir js/views/diagnostic.js).
 *
 * Note d'implémentation : le modèle est chargé directement via
 * tf.loadLayersModel plutôt que par @tensorflow-models/mobilenet. Ce paquet
 * bascule sur loadGraphModel dès qu'une modelUrl est fournie, ce qui est
 * incompatible avec le modèle v1 au format "layers" embarqué ici.
 */

import { CONFIG, PLANT_GATE_KEYWORDS } from '../config.js';
import { IMAGENET_CLASSES } from './imagenetClasses.js';

const MODEL_URL = new URL('../../models/mobilenet/model.json', import.meta.url).href;
const INPUT_SIZE = 224;

/** MobileNet v1 attend des pixels normalisés dans [-1, 1]. */
const INPUT_MIN = -1;
const NORMALIZATION = 2 / 255;

let model = null;

// ─── Chargement du modèle ─────────────────────────────────────────────────────

export async function loadLeafClassifierModel() {
  // Poids embarqués dans le dépôt (~5 Mo) : aucun accès réseau requis.
  model = await tf.loadLayersModel(MODEL_URL);

  // Une première inférence à vide compile les kernels : la toute première
  // analyse réelle n'est plus ralentie devant le jury.
  const warmup = tf.zeros([1, INPUT_SIZE, INPUT_SIZE, 3]);
  const result = model.predict(warmup);
  await result.data();
  tf.dispose([warmup, result]);

  return model;
}

export function isClassifierReady() {
  return model !== null;
}

// ─── Inférence ────────────────────────────────────────────────────────────────

/**
 * Classe une image et retourne les `topK` meilleures prédictions ImageNet.
 * @returns {Promise<Array<{className: string, probability: number}>>}
 */
async function classify(imageElement, topK = 10) {
  const output = tf.tidy(() => {
    const input = tf.browser
      .fromPixels(imageElement)
      .resizeBilinear([INPUT_SIZE, INPUT_SIZE], true)
      .toFloat()
      .mul(NORMALIZATION)
      .add(INPUT_MIN)
      .expandDims(0);

    const prediction = model.predict(input).squeeze();

    // Selon la variante exportée, MobileNet v1 sort 1000 valeurs (ImageNet
    // strict) ou 1001 (avec une classe "background" en tête). On s'aligne
    // sur la sortie réelle plutôt que sur une hypothèse.
    const outputSize = prediction.shape[prediction.shape.length - 1];
    const offset = outputSize > IMAGENET_CLASSES.length ? 1 : 0;

    return prediction.slice([offset], [IMAGENET_CLASSES.length]);
  });

  const raw = await output.data();
  output.dispose();

  const probabilities = toProbabilities(raw);

  return Array.from(probabilities)
    .map((probability, index) => ({
      className: IMAGENET_CLASSES[index],
      probability,
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, topK);
}

/**
 * Normalise la sortie du modèle en probabilités.
 *
 * Certains exports de MobileNet terminent déjà par une couche softmax.
 * Ré-appliquer une softmax sur des probabilités écrase la distribution
 * (tous les scores tombent autour de 1/1000) et rend le résultat inutile :
 * on ne l'applique donc que si la sortie est bien constituée de logits.
 */
function toProbabilities(raw) {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const value of raw) {
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const alreadyNormalized = min >= 0 && Math.abs(sum - 1) < 0.1;
  if (alreadyNormalized) return raw;

  const exponentials = new Float32Array(raw.length);
  let total = 0;
  for (let i = 0; i < raw.length; i++) {
    exponentials[i] = Math.exp(raw[i] - max);
    total += exponentials[i];
  }
  for (let i = 0; i < exponentials.length; i++) exponentials[i] /= total;

  return exponentials;
}

// ─── Contrôle de cadrage ──────────────────────────────────────────────────────

/**
 * Vérifie que l'image soumise contient un contexte végétal.
 *
 * @param {HTMLImageElement} imageElement
 * @returns {Promise<{isPlantLike: boolean, topLabel: string,
 *                    topProbability: number, matchedLabel: string|null}>}
 */
export async function checkImageQuality(imageElement) {
  if (!model) throw new Error("Modèle MobileNet non initialisé.");

  // Sans cette attente, l'inférence peut porter sur une image dont le
  // décodage n'est pas terminé (clic rapide après l'upload).
  if (!imageElement.complete || imageElement.naturalWidth === 0) {
    await imageElement.decode();
  }

  const predictions = await classify(imageElement, 10);

  const matched = predictions
    .filter(pred => pred.probability >= CONFIG.PLANT_GATE_MIN_PROBABILITY)
    .find(pred => {
      const label = pred.className.toLowerCase();
      return PLANT_GATE_KEYWORDS.some(keyword => label.includes(keyword));
    });

  return {
    isPlantLike: Boolean(matched),
    topLabel: predictions[0]?.className ?? "inconnu",
    topProbability: predictions[0]?.probability ?? 0,
    matchedLabel: matched?.className ?? null,
  };
}
