# 🌾 AgriSentinel AI — Surveillance Edge-AI & Diagnostic Agricole

> **Projet développé pour le Hackathon Togo IT Days**  
> *Solution de surveillance intelligente des champs et de diagnostic des maladies des cultures 100 % intégrée dans le navigateur (Edge-AI / Zéro Serveur).*

---

## 📌 Présentation du Projet

**AgriSentinel AI** est un système d'intelligence artificielle autonome conçu pour assister les agriculteurs en Afrique de l'Ouest (notamment au Togo) dans la protection et la gestion de leurs cultures.

L'application résout deux défis majeurs :
1. **Surveillance & Effarouchement (Temps Réel)** : Détection automatique des intrus humains et des animaux/oiseaux nuisibles avec déclenchement d'alarmes acousto-optiques.
2. **Diagnostic Phytosanitaire (Santé des Plantes)** : Identification précoce des maladies végétales (ex: *Mosaïque du Manioc*, *Brûlure Bactérienne*) à partir d'une simple photo de feuille avec recommandations de traitements biologiques.

---

## 🔥 Points Forts & Architecture "Zéro Serveur"

- **⚡ 100% Client-Side (TensorFlow.js)** : L'IA s'exécute directement dans le navigateur du client ou du Raspberry Pi grâce à l'accélération matériel WebGL (GPU).
- **🔒 Confidentialité & Hors-ligne** : Aucune donnée vidéo ou image n'est envoyée vers des serveurs distants.
- **🔊 Synthétiseur Audio Intégré (Web Audio API)** : Génération directe de fréquences d'effarouchement d'oiseaux et de sirènes d'alarme sans dépendance à des fichiers audio externes.
- **🛡️ Mode Démo Intégré** : Permet de simuler les détections même en l'absence de webcam active lors du pitch devant le jury.

---

## 🛠️ Stack Technique

- **Frontend** : HTML5 Semantic, CSS3 (Futuristic Dark UI, Glassmorphism)
- **Logique Client** : JavaScript ES6+ (Modules natifs `import`/`export`)
- **Moteur d'IA** : TensorFlow.js
  - `COCO-SSD` (Modèle de détection d'objets en temps réel)
  - `MobileNet` (Modèle de classification d'images pour le diagnostic)
- **Audio** : Web Audio API

---

## 📂 Arborescence du Projet

```text
HACKATHON_TOGO_IT_DAYS/
├── index.html                   # Interface HTML5 principale
├── style.css                    # Design Cyber-Agri Dark
├── README.md                    # Documentation officielle du projet
├── .gitignore                   # Exclusions Git (venv, caches)
│
└── js/                          # Architecture JavaScript Modulaire
    ├── config.js                # Base agronomique & paramètres système
    ├── app.js                   # Contrôleur principal
    │
    ├── models/                  # Moteurs d'IA TensorFlow.js
    │   ├── objectDetector.js    # Surveillance & bounding boxes (COCO-SSD)
    │   └── leafClassifier.js    # Diagnostic des maladies (MobileNet)
    │
    └── utils/                   # Modules utilitaires
        ├── audioSynth.js        # Synthétiseur d'alarmes sonores
        └── telemetry.js         # Gestion des logs & compteurs FPS
```

---

## 🚀 Installation & Lancement Rapide

Aucune installation complexe de dépendances Python ou OpenCV n'est nécessaire.

### 1. Cloner le dépôt
```bash
git clone https://github.com/JoDm007/AgroSentinel-AI.git
cd AgroSentinel-AI
```

### 2. Lancer le serveur local
Vous pouvez utiliser n'importe quel serveur web statique (ex: le serveur HTTP intégré à Python) :

```bash
python -m http.server 3000
```

### 3. Ouvrir dans le navigateur
Accédez à l'adresse : **[http://localhost:3000](http://localhost:3000)**

---

## 👥 Équipe

Projet conçu et réalisé lors du **Hackathon Togo IT Days**.
- **Projet** : AgriSentinel AI
- **Repository GitHub** : [JoDm007/AgroSentinel-AI](https://github.com/JoDm007/AgroSentinel-AI)
