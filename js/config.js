/**
 * AgroSentinel AI - Configuration & Base de Connaissances Agronomique
 */

export const CONFIG = {
  /** Score minimum COCO-SSD pour retenir une détection. */
  DETECTION_THRESHOLD: 0.5,
  /** Nombre maximum d'entrées conservées dans le journal. */
  MAX_LOGS: 15,
  /** Cadence cible de la boucle de détection (bride le CPU/GPU). */
  TARGET_FPS: 15,
  /** Délai minimum entre deux alertes d'un même type (ms). */
  ALERT_COOLDOWN_MS: 4000,
  /** Probabilité minimale d'un label MobileNet pour être pris en compte. */
  PLANT_GATE_MIN_PROBABILITY: 0.05,
};

/**
 * Cultures supportées par la base agronomique.
 * L'agriculteur déclare sa culture : c'est plus rapide et plus fiable
 * qu'une reconnaissance automatique, et cela fonctionne sans réseau.
 */
export const CROPS = {
  maize:   { label: "Maïs",      emoji: "🌽" },
  millet:  { label: "Petit Mil", emoji: "🌾" },
  tomato:  { label: "Tomate",    emoji: "🍅" },
  cassava: { label: "Manioc",    emoji: "🥔" },
  sorghum: { label: "Sorgho",    emoji: "🌿" },
};

/**
 * Mots-clés ImageNet indiquant un contexte végétal.
 *
 * ⚠️ Usage strictement limité au CONTRÔLE DE CADRAGE de la photo :
 * MobileNet est entraîné sur ImageNet-1000, qui ne contient aucune classe
 * "manioc", "tomate", "mil" ni "sorgho". Il ne peut donc pas — et ne doit pas —
 * établir un diagnostic phytosanitaire. Il sert uniquement à signaler
 * à l'utilisateur si sa photo semble ne contenir aucun végétal.
 *
 * ⚠️ Ces termes sont comparés en MOTS ENTIERS, jamais en sous-chaînes :
 * "bear" contient "ear", "spotlight" contient "pot" et "figure" contient
 * "fig". Une comparaison par sous-chaîne déclarait un projecteur "végétal".
 */
export const PLANT_GATE_KEYWORDS = [
  // Organes et termes génériques
  "leaf", "leaves", "plant", "flower", "blossom", "bud", "stalk", "stem",
  "seed", "vine", "shrub", "tree", "foliage", "herb", "sprout", "seedling",
  // Cultures et plantes présentes dans ImageNet
  "corn", "ear", "spike", "capitulum", "hay", "rapeseed", "cardoon",
  "artichoke", "broccoli", "cauliflower", "cabbage", "zucchini", "courgette",
  "cucumber", "cuke", "pepper", "acorn", "buckeye", "hip", "rosehip",
  "daisy", "orchid", "nettle", "fern", "moss", "fig", "pineapple",
  "banana", "strawberry", "pomegranate", "jackfruit",
  // Champignons (contexte de terrain)
  "mushroom", "agaric", "bolete", "earthstar", "stinkhorn", "fungus",
  // Contenants et lieux de culture
  "flowerpot", "greenhouse", "glasshouse", "nursery",
  // Insectes indissociables du feuillage
  "leafhopper", "grasshopper", "mantis", "mantid", "caterpillar",
];

/**
 * Base de données des maladies par culture.
 *
 * `severityLevel` alimente le code couleur de l'interface.
 * `symptom` est la description visuelle courte présentée à l'agriculteur.
 * `alsoAffects` liste les cultures secondaires touchées par la même maladie.
 */
export const DISEASE_DATABASE = {

  // ─── MANIOC ───────────────────────────────────────────────────────────────
  cassava_mosaic: {
    name: "Mosaïque du Manioc (CMD)",
    crop: "Manioc",
    cropKey: "cassava",
    severity: "Élevée",
    severityLevel: "high",
    symptomIcon: "🟡",
    symptom: "Marbrures jaunes et vertes, feuilles déformées et rabougries.",
    description: "Maladie virale transmise par les mouches blanches (Bemisia). Provoque des déformations et marbrures jaunes sur les feuilles.",
    remedy: "Traitement biologique & préventif",
    steps: [
      "Arracher immédiatement les plants fortement déformés et les brûler hors du champ.",
      "Planter des variétés de manioc certifiées résistantes à la mosaïque (ex: TME 419).",
      "Pulvériser de l'huile de Neem biologique pour contrôler les mouches blanches.",
    ]
  },
  cassava_blight: {
    name: "Brûlure Bactérienne du Manioc (Xanthomonas)",
    crop: "Manioc",
    cropKey: "cassava",
    severity: "Moyenne",
    severityLevel: "medium",
    symptomIcon: "🟤",
    symptom: "Taches anguleuses humides sous les feuilles, extrémités desséchées.",
    description: "Infection bactérienne causant des taches angulaires humides sous les feuilles et dessèchement des extrémités.",
    remedy: "Mesures de contrôle recommandées",
    steps: [
      "Pratiquer la rotation des cultures avec des légumineuses.",
      "Utiliser du compost mûr et éviter les excès d'azote.",
      "Appliquer un fongicide biologique à base de cuivre organique en début de saison.",
    ]
  },

  // ─── MAÏS ─────────────────────────────────────────────────────────────────
  maize_streak: {
    name: "Striure du Maïs (Maize Streak Virus)",
    crop: "Maïs",
    cropKey: "maize",
    severity: "Élevée",
    severityLevel: "high",
    symptomIcon: "🟨",
    symptom: "Fines stries jaunes continues, parallèles aux nervures.",
    description: "Virus transmis par les cicadelles. Les feuilles présentent des stries jaunes parallèles aux nervures.",
    remedy: "Actions recommandées",
    steps: [
      "Planter des variétés de maïs résistantes à la striure (ex: IITA Streak Resistant).",
      "Contrôler les cicadelles vecteurs avec des insecticides homologués.",
      "Détruire les résidus de récolte infestés pour limiter la propagation.",
    ]
  },
  maize_blight: {
    name: "Brûlure des Feuilles du Maïs (Turcicum)",
    crop: "Maïs",
    cropKey: "maize",
    severity: "Moyenne",
    severityLevel: "medium",
    symptomIcon: "🟫",
    symptom: "Grandes lésions elliptiques gris-brun, aspect de feuille brûlée.",
    description: "Champignon causant de grandes lésions elliptiques grisâtres sur les feuilles, réduisant la photosynthèse.",
    remedy: "Traitement fongicide",
    steps: [
      "Appliquer un fongicide foliaire à base de mancozèbe dès les premiers symptômes.",
      "Assurer un espacement suffisant entre les plants pour réduire l'humidité foliaire.",
      "Effectuer une rotation des cultures avec du soja ou de l'arachide.",
    ]
  },

  // ─── PETIT MIL / SORGHO ───────────────────────────────────────────────────
  millet_downy_mildew: {
    name: "Mildiou du Mil (Sclerospora graminicola)",
    crop: "Petit Mil",
    cropKey: "millet",
    severity: "Élevée",
    severityLevel: "high",
    symptomIcon: "⚪",
    symptom: "Blanchiment des feuilles, duvet blanc au revers, épis déformés.",
    description: "Champignon oomycète causant un blanchiment et une déformation des plants ('feuille folle'). Très destructeur.",
    remedy: "Lutte intégrée",
    steps: [
      "Traiter les semences avec du métalaxyl avant le semis.",
      "Arracher et détruire immédiatement les plants atteints ('crazy seedling').",
      "Utiliser des variétés tolérantes comme SOSAT-C88 ou HKP.",
    ]
  },
  sorghum_smut: {
    name: "Charbon du Sorgho (Sporisorium sorghi)",
    crop: "Sorgho / Mil",
    cropKey: "sorghum",
    alsoAffects: ["millet"],
    severity: "Moyenne",
    severityLevel: "medium",
    symptomIcon: "⚫",
    symptom: "Grains remplacés par des masses de spores noires poudreuses.",
    description: "Champignon remplaçant les grains par des masses de spores noires, causant des pertes de rendement importantes.",
    remedy: "Prévention et traitement",
    steps: [
      "Utiliser des semences saines certifiées et traitées.",
      "Pratiquer une rotation avec des légumineuses (niébé, arachide).",
      "Appliquer du thirame ou du mancozèbe en traitement de semences.",
    ]
  },

  // ─── TOMATE ───────────────────────────────────────────────────────────────
  tomato_blight: {
    name: "Mildiou de la Tomate (Phytophthora infestans)",
    crop: "Tomate",
    cropKey: "tomato",
    severity: "Très Élevée",
    severityLevel: "critical",
    symptomIcon: "🟠",
    symptom: "Taches brunes huileuses sur feuilles, tiges et fruits.",
    description: "Oomycète dévastateur causant des taches brunes huileuses sur les feuilles, tiges et fruits, surtout en saison humide.",
    remedy: "Traitement d'urgence",
    steps: [
      "Retirer et détruire immédiatement toutes les parties atteintes.",
      "Pulvériser un fongicide à base de cuivre (bouillie bordelaise) dès les premiers symptômes.",
      "Éviter l'arrosage par aspersion et préférer l'irrigation au goutte-à-goutte.",
    ]
  },
  tomato_mosaic: {
    name: "Virus de la Mosaïque de la Tomate (ToMV)",
    crop: "Tomate",
    cropKey: "tomato",
    severity: "Élevée",
    severityLevel: "high",
    symptomIcon: "🟡",
    symptom: "Mosaïque jaune-vert, plants rabougris, feuilles en forme de fougère.",
    description: "Virus très contagieux causant des mosaïques jaune-vert et un rabougrissement des plants.",
    remedy: "Mesures de contrôle",
    steps: [
      "Utiliser des semences hybrides résistantes (ex: F1 Xewel).",
      "Se laver les mains et désinfecter les outils avant de toucher les plants.",
      "Éliminer les aphides vecteurs avec du savon insecticide biologique.",
    ]
  },

  // ─── ÉTAT SAIN ────────────────────────────────────────────────────────────
  healthy_leaf: {
    name: "Feuillage Sain — Aucune Maladie Détectée",
    crop: "Culture Générale",
    cropKey: null,
    severity: "Aucune",
    severityLevel: "none",
    symptomIcon: "✅",
    symptom: "Vert uniforme, aucune tache, aucune déformation.",
    description: "Le feuillage présente une coloration verte uniforme et une photosynthèse optimale sans signe de parasite.",
    remedy: "Recommandations d'entretien",
    steps: [
      "Maintenir un arrosage régulier au pied des plantes.",
      "Conserver un paillage organique pour protéger l'humidité du sol.",
      "Surveiller régulièrement l'apparition de symptômes foliaires.",
    ]
  },
};

/**
 * Retourne les maladies pertinentes pour une culture donnée,
 * suivies de l'état sain (toujours proposé en dernier).
 */
export function getDiseasesForCrop(cropKey) {
  const diseases = Object.entries(DISEASE_DATABASE)
    .filter(([key, data]) =>
      key !== "healthy_leaf" &&
      (data.cropKey === cropKey || (data.alsoAffects || []).includes(cropKey)))
    .map(([key, data]) => ({ key, ...data }));

  return [...diseases, { key: "healthy_leaf", ...DISEASE_DATABASE.healthy_leaf }];
}
