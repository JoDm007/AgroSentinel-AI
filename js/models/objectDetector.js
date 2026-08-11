/**
 * AgroSentinel AI - Moteur de Détection d'Objets & Surveillance (COCO-SSD)
 */

import { CONFIG } from '../config.js';
import { playScareSound } from '../utils/audioSynth.js';
import { addLogItem, calculateFps, incrementIntruders, incrementPests } from '../utils/telemetry.js';
import { appendEvent } from '../security/journal.js';
import { sha256Hex } from '../security/crypto.js';

const PEST_CLASSES = ["bird", "cat", "dog", "cow", "sheep", "horse", "elephant", "bear", "zebra"];
const IDENTITY_TRANSFORM = { scale: 1, offsetX: 0, offsetY: 0 };

/** Hauteur réservée au bandeau d'alerte HUD, en pixels canvas. */
const HUD_SAFE_TOP = 72;

let cocoModel = null;
let animationFrameId = null;
let isLoopRunning = false;
let lastIntruderAlert = 0;
let lastPestAlert = 0;
let lastFrameStamp = 0;
let demoAngle = 0;

/** Source visuelle courante, utilisée pour l'empreinte des preuves. */
let fingerprintSource = null;
let inSimulation = false;

export async function loadObjectDetectorModel() {
  // Poids embarqués dans le dépôt : aucun téléchargement distant, donc
  // fonctionnement garanti sans réseau (cœur de l'argument "Edge AI").
  cocoModel = await cocoSsd.load({
    base: 'lite_mobilenet_v2',
    modelUrl: new URL('../../models/coco-ssd/model.json', import.meta.url).href,
  });
  return cocoModel;
}

export function startDetectionLoop(webcamElement, canvasElement, isDemoModeRef) {
  // Garantit qu'une seule boucle tourne à la fois (évite le cumul de rAF).
  stopDetectionLoop();

  const canvasCtx = canvasElement.getContext("2d");
  const minInterval = 1000 / CONFIG.TARGET_FPS;
  isLoopRunning = true;
  lastFrameStamp = 0;

  async function loop(timestamp) {
    if (!isLoopRunning) return;

    if (timestamp - lastFrameStamp >= minInterval) {
      lastFrameStamp = timestamp;

      inSimulation = isDemoModeRef();
      fingerprintSource = inSimulation ? canvasElement : webcamElement;

      if (inSimulation) {
        runDemoLoop(canvasElement, canvasCtx);
      } else if (cocoModel && webcamElement.readyState >= 2 && webcamElement.videoWidth > 0) {
        resizeCanvas(webcamElement, canvasElement);
        const predictions = await cocoModel.detect(webcamElement);

        // La boucle a pu être arrêtée pendant l'await : on ne redessine
        // pas et surtout on ne replanifie pas de frame.
        if (!isLoopRunning) return;

        renderPredictions(
          predictions,
          canvasElement,
          canvasCtx,
          getVideoTransform(webcamElement, canvasElement)
        );
        calculateFps();
      }
    }

    animationFrameId = requestAnimationFrame(loop);
  }

  animationFrameId = requestAnimationFrame(loop);
}

export function stopDetectionLoop() {
  isLoopRunning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

/** Efface les bounding boxes et remet le bandeau HUD à l'état neutre. */
export function resetOverlay(canvasElement) {
  if (canvasElement) {
    const ctx = canvasElement.getContext("2d");
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  }
  handleAlertStates(false, false);
}

function runDemoLoop(canvasElement, canvasCtx) {
  resizeCanvas(null, canvasElement);
  demoAngle += 0.05;

  const width = canvasElement.width;
  const height = canvasElement.height;

  // Dimensions proportionnelles : la simulation reste correcte quelle que
  // soit la taille du panneau. Les boîtes démarrent sous le bandeau HUD
  // pour que leurs étiquettes restent lisibles.
  const personWidth = width * 0.15;
  const personHeight = height * 0.5;
  const birdWidth = width * 0.09;
  const birdHeight = height * 0.12;

  const predictions = [
    {
      class: "person",
      score: 0.95,
      bbox: [
        Math.abs(Math.sin(demoAngle)) * (width - personWidth - 40) + 20,
        height * 0.34,
        personWidth,
        personHeight
      ]
    },
    {
      class: "bird",
      score: 0.89,
      bbox: [
        Math.abs(Math.cos(demoAngle)) * (width - birdWidth - 20) + 10,
        height * 0.22,
        birdWidth,
        birdHeight
      ]
    }
  ];

  // Les coordonnées de démo sont déjà exprimées dans l'espace du canvas.
  renderPredictions(predictions, canvasElement, canvasCtx, IDENTITY_TRANSFORM, true);
  calculateFps();
}

/**
 * Fond de simulation : évite le rectangle noir vide quand aucune caméra
 * n'est connectée, et rappelle explicitement qu'il s'agit d'une simulation.
 */
function drawDemoBackdrop(canvasElement, canvasCtx) {
  const { width, height } = canvasElement;

  const gradient = canvasCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0d2b1c");
  gradient.addColorStop(1, "#061410");
  canvasCtx.fillStyle = gradient;
  canvasCtx.fillRect(0, 0, width, height);

  canvasCtx.strokeStyle = "rgba(16, 185, 129, 0.10)";
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();
  for (let x = 0; x <= width; x += 40) {
    canvasCtx.moveTo(x, 0);
    canvasCtx.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += 40) {
    canvasCtx.moveTo(0, y);
    canvasCtx.lineTo(width, y);
  }
  canvasCtx.stroke();

  canvasCtx.fillStyle = "rgba(255, 255, 255, 0.35)";
  canvasCtx.font = "600 11px 'Outfit', sans-serif";
  canvasCtx.textBaseline = "alphabetic";
  canvasCtx.fillText("SIMULATION — AUCUNE CAMÉRA CONNECTÉE", 14, height - 14);
}

/**
 * COCO-SSD renvoie des bbox dans l'espace intrinsèque de la vidéo
 * (videoWidth × videoHeight), alors que le canvas est dimensionné en pixels
 * CSS. Sans cette conversion, les cadres sont décalés et trop petits.
 * La vidéo étant affichée en `object-fit: cover`, on reproduit le même
 * recadrage : facteur d'échelle maximal + centrage.
 */
function getVideoTransform(webcamElement, canvasElement) {
  const videoWidth = webcamElement.videoWidth || canvasElement.width;
  const videoHeight = webcamElement.videoHeight || canvasElement.height;

  const scale = Math.max(
    canvasElement.width / videoWidth,
    canvasElement.height / videoHeight
  );

  return {
    scale,
    offsetX: (canvasElement.width - videoWidth * scale) / 2,
    offsetY: (canvasElement.height - videoHeight * scale) / 2,
  };
}

function renderPredictions(predictions, canvasElement, canvasCtx, transform, withBackdrop = false) {
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (withBackdrop) drawDemoBackdrop(canvasElement, canvasCtx);

  let detectedIntruder = false;
  let detectedPest = false;

  predictions.forEach(pred => {
    if (pred.score < CONFIG.DETECTION_THRESHOLD) return;

    const [rawX, rawY, rawWidth, rawHeight] = pred.bbox;
    const x = rawX * transform.scale + transform.offsetX;
    const y = rawY * transform.scale + transform.offsetY;
    const width = rawWidth * transform.scale;
    const height = rawHeight * transform.scale;

    const objectClass = pred.class.toLowerCase();
    const percent = Math.round(pred.score * 100);

    // Les cadres sont dessinés sur le flux vidéo, seule zone sombre de
    // l'interface : ces teintes sont choisies pour tenir sur du noir, avec
    // une étiquette en texte noir par-dessus.
    let color = "#a3e635";
    let labelText = `${pred.class.toUpperCase()} (${percent}%)`;

    if (objectClass === "person") {
      color = "#ef4444";
      labelText = `INTRUS : PERSONNE (${percent}%)`;
      detectedIntruder = true;
    } else if (PEST_CLASSES.includes(objectClass)) {
      color = "#f59e0b";
      labelText = `NUISIBLE : ${objectClass.toUpperCase()} (${percent}%)`;
      detectedPest = true;
    }

    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 3;
    canvasCtx.shadowColor = color;
    canvasCtx.shadowBlur = 10;
    canvasCtx.strokeRect(x, y, width, height);

    // La police doit être définie AVANT measureText, sinon la largeur est
    // calculée avec la police par défaut et le texte déborde du fond.
    canvasCtx.shadowBlur = 0;
    canvasCtx.font = "bold 13px 'Outfit', sans-serif";
    canvasCtx.textBaseline = "middle";
    const textWidth = canvasCtx.measureText(labelText).width;

    // L'étiquette est maintenue dans le cadre du canvas : sans ce calage,
    // une détection près d'un bord voyait son texte tronqué, et une
    // détection en haut passait sous le bandeau d'alerte HUD.
    const labelWidth = textWidth + 16;
    const labelX = Math.min(Math.max(x, 0), Math.max(0, canvasElement.width - labelWidth));
    const labelY = y - 25 >= HUD_SAFE_TOP
      ? y - 25
      : Math.min(y + height + 1, canvasElement.height - 24);

    canvasCtx.fillStyle = color;
    canvasCtx.fillRect(labelX, labelY, labelWidth, 24);

    canvasCtx.fillStyle = "#000000";
    canvasCtx.fillText(labelText, labelX + 8, labelY + 12);
    canvasCtx.restore();
  });

  handleAlertStates(detectedIntruder, detectedPest);
}

function handleAlertStates(hasIntruder, hasPest) {
  const alertBanner = document.getElementById("alert-banner");
  const alertIcon = document.getElementById("alert-icon");
  const alertMsg = document.getElementById("alert-message");
  const autoSound = document.getElementById("auto-sound-toggle")?.checked;

  const now = Date.now();

  // ── Bandeau HUD : l'intrus humain est prioritaire sur le nuisible
  if (hasIntruder) {
    if (alertBanner) alertBanner.className = "hud-badge danger";
    if (alertIcon) alertIcon.className = "fa-solid fa-triangle-exclamation";
    if (alertMsg) alertMsg.textContent = "ALERTE SÉCURITÉ : Intrus humain détecté !";
  } else if (hasPest) {
    if (alertBanner) alertBanner.className = "hud-badge warning";
    if (alertIcon) alertIcon.className = "fa-solid fa-crow";
    if (alertMsg) alertMsg.textContent = "ALERTE NUISIBLES : Oiseaux / Animaux détectés !";
  } else {
    if (alertBanner) alertBanner.className = "hud-badge normal";
    if (alertIcon) alertIcon.className = "fa-solid fa-circle-check";
    if (alertMsg) alertMsg.textContent = "Zone Sécurisée — Aucune menace détectée";
  }

  // ── Journal, compteurs et son : un cooldown indépendant par type,
  //    pour qu'une alerte intrus ne masque pas un nuisible simultané.
  if (hasIntruder && now - lastIntruderAlert > CONFIG.ALERT_COOLDOWN_MS) {
    incrementIntruders();
    addLogItem("danger", "Intrus détecté dans la zone sécurisée !");
    if (autoSound) playScareSound("person");
    lastIntruderAlert = now;
    recordThreat("intrusion", "person");
  }

  if (hasPest && now - lastPestAlert > CONFIG.ALERT_COOLDOWN_MS) {
    incrementPests();
    addLogItem("warning", "Nuisibles détectés ! Signal effaroucheur activé.");
    if (autoSound) playScareSound("bird");
    lastPestAlert = now;
    recordThreat("nuisible", "animal");
  }
}

/**
 * Consigne la menace dans le journal sécurisé.
 *
 * L'image n'est jamais stockée ni transmise : seule son empreinte
 * SHA-256 entre dans le journal. Elle suffira plus tard à prouver
 * qu'une photo présentée correspond bien à cette alerte, sans que la
 * photo ait jamais circulé.
 */
function recordThreat(threat, objectClass) {
  const source = fingerprintSource;
  const simulated = inSimulation;

  (async () => {
    try {
      const frameHash = await fingerprintFrame(source);
      await appendEvent({
        kind: "surveillance",
        threat,
        class: objectClass,
        frameHash,
        // Tracé explicitement : le journal ne présente jamais une
        // simulation comme une détection réelle.
        mode: simulated ? "simulation" : "camera",
      });
    } catch (err) {
      console.warn("Journalisation de l'alerte impossible :", err);
    }
  })();
}

async function fingerprintFrame(source) {
  if (!source) return null;

  const width = source.videoWidth || source.width;
  const height = source.videoHeight || source.height;
  if (!width || !height) return null;

  const frame = document.createElement("canvas");
  frame.width = width;
  frame.height = height;
  frame.getContext("2d").drawImage(source, 0, 0, width, height);

  return "sha256:" + (await sha256Hex(frame.toDataURL("image/jpeg", 0.8)));
}

function resizeCanvas(webcamElement, canvasElement) {
  const rect = (webcamElement || canvasElement.parentElement).getBoundingClientRect();
  const width = Math.round(rect.width) || 640;
  const height = Math.round(rect.height) || 360;

  // Réassigner width/height réinitialise le contexte : on ne le fait
  // que si la taille a réellement changé.
  if (canvasElement.width !== width || canvasElement.height !== height) {
    canvasElement.width = width;
    canvasElement.height = height;
  }
}
