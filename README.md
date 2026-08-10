# 🌾 AgroSentinel AI — Surveillance Edge-AI & Diagnostic Agricole

> **Prototype développé pour le Hackathon Togo IT Days**  
> *Surveillance intelligente des cultures et diagnostic agronomique assisté, exécutés **entièrement dans le navigateur**, **sans serveur** et **sans connexion internet**.*

---

## 📌 Le problème

Au Togo, les pertes de récolte dues aux oiseaux granivores, aux animaux errants et aux intrusions humaines pèsent lourd sur de petites exploitations familiales. À cela s'ajoutent les maladies des cultures, souvent détectées trop tard faute d'accès à un technicien agricole.

Les solutions existantes supposent une connexion permanente et un serveur distant — deux hypothèses qui ne tiennent pas en zone rurale.

## 💡 Notre réponse

Deux fonctions, un seul outil, qui tourne sur un téléphone **hors ligne** :

1. **Surveillance & effarouchement en temps réel** — détection automatique des intrus humains et des nuisibles (oiseaux, animaux) sur le flux caméra, avec alerte visuelle et signal sonore d'effarouchement.
2. **Diagnostic agronomique assisté** — parcours guidé en 3 étapes menant du symptôme observé à une fiche de traitement adaptée aux variétés et intrants disponibles localement.

---

## 🔥 Points forts

- **⚡ Edge AI, littéralement** — les modèles TensorFlow.js et leurs poids sont **embarqués dans l'application**. Aucun appel à un CDN, aucune inférence distante, aucun serveur.
- **📴 Fonctionne sans réseau** — PWA installable sur l'écran d'accueil du téléphone. Une seule visite suffit à la rendre autonome.
- **🔒 Confidentialité par conception** — aucune image ni vidéo ne quitte l'appareil. Il n'y a nulle part où l'envoyer.
- **📱 Pensé pour le terrain** — interface tactile, caméra arrière par défaut, bascule avant/arrière, lisible en plein soleil grâce au thème sombre à fort contraste.
- **🌱 Base agronomique localisée** — 8 maladies sur les 5 cultures vivrières majeures du Togo, avec variétés résistantes réellement disponibles (TME 419, SOSAT-C88, IITA Streak Resistant…) et traitements biologiques accessibles.
- **🛡️ Mode démo intégré** — simule les détections sans webcam, pour un pitch fiable en toute circonstance.

---

## ⚠️ Ce que fait — et ne fait pas — notre IA

Nous préférons documenter honnêtement le périmètre de chaque brique.

| Fonction | Nature | Détail |
|---|---|---|
| Détection intrus / nuisibles | ✅ **IA réelle** | COCO-SSD (`lite_mobilenet_v2`), inférence live sur le flux caméra |
| Contrôle de cadrage de la photo | ✅ **IA réelle** | MobileNet v1 vérifie la présence d'un végétal dans l'image |
| Identification de la maladie | 🔶 **Parcours guidé** | Confirmation visuelle par l'agriculteur, adossée à la base agronomique |

**Pourquoi ce choix ?** MobileNet est entraîné sur ImageNet-1000, qui ne contient **aucune** classe *manioc*, *tomate*, *mil* ou *sorgho*, et aucune classe de maladie phytosanitaire. Un modèle généraliste ne peut donc pas diagnostiquer une culture vivrière togolaise. Plutôt que d'afficher un score de confiance dénué de sens agronomique, nous laissons l'agriculteur déclarer sa culture et confirmer le symptôme : c'est plus rapide, plus fiable, et cela fonctionne hors connexion.

**Roadmap v2** — classifieur dédié entraîné par transfer learning (MobileNetV2) sur le dataset *Cassava Leaf Disease* (photos de terrain, 5 classes). Trois de ses classes correspondent déjà à notre base : `cmd` → Mosaïque du Manioc, `cbb` → Brûlure Bactérienne, `healthy` → Feuillage Sain.

---

## 🛠️ Stack technique

- **Frontend** : HTML5 sémantique, CSS3 responsive (thème sombre, glassmorphism)
- **Logique** : JavaScript ES6+, modules natifs `import`/`export`, **aucun bundler, aucune dépendance npm**
- **IA** : TensorFlow.js 4.10
  - `COCO-SSD` (`lite_mobilenet_v2`) — détection d'objets temps réel
  - `MobileNet v1` (α 0.50) — contrôle de cadrage, chargé directement via `tf.loadLayersModel`
- **Audio** : Web Audio API (fréquences d'effarouchement synthétisées, aucun fichier son)
- **Hors ligne** : Service Worker + Cache API, manifeste PWA

Tout est servi depuis le dépôt : bibliothèques, poids des modèles, polices et icônes.

---

## 📂 Arborescence

```text
AgroSentinel-AI/
├── index.html                   # Interface principale
├── style.css                    # Design responsive desktop + mobile
├── sw.js                        # Service worker (mode hors ligne)
├── manifest.webmanifest         # Manifeste PWA
│
├── js/
│   ├── config.js                # Base agronomique & paramètres système
│   ├── app.js                   # Contrôleur, machine à états, PWA
│   ├── models/
│   │   ├── objectDetector.js    # Surveillance & bounding boxes (COCO-SSD)
│   │   ├── leafClassifier.js    # Contrôle de cadrage (MobileNet)
│   │   └── imagenetClasses.js   # Libellés ImageNet-1000
│   ├── views/
│   │   └── diagnostic.js        # Parcours de diagnostic assisté
│   └── utils/
│       ├── audioSynth.js        # Synthétiseur d'alarmes
│       └── telemetry.js         # Journal & compteur FPS
│
├── models/                      # Poids IA embarqués (~23 Mo)
│   ├── coco-ssd/
│   └── mobilenet/
├── vendor/                      # TensorFlow.js, polices, icônes (~2 Mo)
└── icons/                       # Icônes PWA
```

---

## 🚀 Lancement

### En local (ordinateur)

Un serveur statique est nécessaire : les modules ES ne se chargent pas via `file://`.

```bash
python -m http.server 3000
```

Puis ouvrir **http://localhost:3000**.

### Sur smartphone

> ⚠️ **Le HTTPS est obligatoire.** Les navigateurs mobiles ne donnent accès à la caméra que dans un *contexte sécurisé*. Une adresse `http://192.168.x.x:3000` sera **refusée**.

La voie la plus simple est **GitHub Pages** :

1. Pousser le dépôt sur GitHub.
2. *Settings → Pages → Source: `main` / `root`*.
3. Ouvrir `https://<utilisateur>.github.io/AgroSentinel-AI/` sur le téléphone.
4. Autoriser la caméra, puis **« Ajouter à l'écran d'accueil »**.

Après cette première visite, l'application fonctionne **entièrement hors ligne**. Le badge de l'en-tête passe à **« Hors ligne prêt »** une fois les poids mis en cache.

---

## 👥 Équipe

Prototype conçu et réalisé lors du **Hackathon Togo IT Days**.
- **Repository** : [JoDm007/AgroSentinel-AI](https://github.com/JoDm007/AgroSentinel-AI)
