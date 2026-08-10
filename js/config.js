/**
 * AgriSentinel AI - Configuration & Base de Connaissances Agronomique
 */

export const CONFIG = {
  DETECTION_THRESHOLD: 0.5,
  MAX_LOGS: 15,
  DEMO_FPS: 30,
};

export const DISEASE_DATABASE = {
  cassava_mosaic: {
    name: "Mosaïque du Manioc (Cassava Mosaic Virus - CMD)",
    crop: "Manioc",
    severity: "Élevée",
    description: "Maladie virale transmise par les mouches blanches (Bemisias). Provoque des déformations et marbrures jaunes sur les feuilles.",
    remedy: "Traitement biologique & préventif :",
    steps: [
      "Arracher immédiatement les plants fortement déformés et les brûler hors du champ.",
      "Planter des variétés de manioc certifiées résistantes à la mosaïque.",
      "Pulvériser de l'huile de Neem biologique pour contrôler les populations de mouches blanches."
    ]
  },
  blight_leaf: {
    name: "Brûlure Bactérienne du Manioc (Xanthomonas)",
    crop: "Manioc / Céréales",
    severity: "Moyenne",
    description: "Infection bactérienne se manifestant par des taches angulaires humides sous les feuilles et le dessèchement des extrémités.",
    remedy: "Mesures de contrôle recommandé :",
    steps: [
      "Pratiquer la rotation des cultures avec des légumineuses.",
      "Utiliser du compost mûr et éviter les excès d'azote.",
      "Appliquer un fongicide biologique à base de cuivre organique en début de saison."
    ]
  },
  healthy_leaf: {
    name: "Feuille Saine - Aucune Maladie Détectée",
    crop: "Culture Générale",
    severity: "Aucune",
    description: "Le feuillage présente une coloration verte uniforme et une photosynthèse optimale sans signe de parasite.",
    remedy: "Recommandation d'entretien :",
    steps: [
      "Maintenir un arrosage régulier au pied des plantes.",
      "Conserver un paillage organique pour protéger l'humidité du sol."
    ]
  }
};
