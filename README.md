# 🌾 AgroSentinel AI

> **Hackathon Togo IT Days — Mission 6 : AgroCyber**  
> *Surveillance Edge-AI des cultures et journal d'exploitation cryptographiquement vérifiable, exécutés **entièrement dans le navigateur**, **sans serveur** et **sans connexion internet**.*

---

## 📌 Le problème

L'agriculture togolaise se digitalise — paiement mobile, traçabilité, objets connectés — et hérite au passage de risques qu'elle n'avait pas : alertes falsifiées, historiques retouchés, fuite de données d'exploitation, matériel volé qui livre tout son contenu.

Deux constats ont guidé nos choix :

1. **Le réseau n'est pas une hypothèse fiable.** Une solution qui exige une connexion permanente ne fonctionne pas au champ.
2. **Une base centralisée d'alertes agricoles est une cible.** Positions des exploitations, périodes de vulnérabilité, rendements : c'est exactement ce qu'un attaquant veut. Nous avons donc décidé de ne pas en créer.

## 💡 Notre réponse

Deux applications complémentaires, un seul dépôt, **zéro serveur** :

| | Rôle | Page |
|---|---|---|
| 🎥 **Capteur** | Surveille le champ, diagnostique les cultures, **signe et chiffre** chaque événement | `index.html` |
| 🛡️ **Console gestionnaire** | S'authentifie, **déchiffre**, vérifie l'intégrité, transmet à un tiers | `dashboard.html` |

---

## 🔐 Le modèle de confiance

C'est le cœur du projet. Deux rôles, deux jeux de clés, des capacités volontairement asymétriques :

```
┌── CAPTEUR (au champ) ──────────────┐   ┌── GESTIONNAIRE (console) ─────────┐
│  ECDSA P-256                       │   │  ECDH P-256                        │
│  clé privée NON EXPORTABLE         │   │  clé privée emballée par la        │
│  → signe chaque événement          │   │    phrase de passe (PBKDF2)        │
│                                    │   │                                    │
│  Clé publique du gestionnaire      │   │  → SEUL à pouvoir déchiffrer       │
│  → chiffre chaque événement        │   │                                    │
│  → NE PEUT PAS LE RELIRE           │   │                                    │
└────────────────────────────────────┘   └────────────────────────────────────┘
```

### L'appairage

Le capteur doit savoir **vers qui** chiffrer. La console affiche sa clé publique et son empreinte courte (`MGR-XXXXXX`) ; le capteur la colle dans *Journal sécurisé & destinataire*. Aucune autorité de certification n'intervient : les deux personnes **comparent l'empreinte de vive voix**. C'est le seul ancrage de confiance, et il est explicite dans l'interface plutôt que sous-entendu.

À défaut d'appairage, le capteur chiffre vers la console du même appareil. C'est commode pour démontrer sur une seule machine, mais la séparation des rôles n'y est alors que logique — l'interface le signale au lieu de le taire.

**Trois conséquences vérifiables :**

1. **Un capteur volé ne livre aucun historique** — dès lors qu'il est appairé à un gestionnaire distant. Il n'a jamais possédé la clé de déchiffrement.
2. **Nul ne peut forger une alerte.** La clé de signature est générée non exportable : même le code JavaScript de l'application ne peut pas la lire.
3. **L'intégrité se vérifie sans droit de lecture.** Le chaînage SHA-256 porte sur le *chiffré* : une coopérative ou un assureur peut attester qu'un historique n'a pas été retouché **sans accéder au contenu de l'exploitation**.

### Le flux de données

Ce n'est pas l'image qui voyage — c'est une preuve.

```
Détection IA locale
   ↓  l'image RESTE sur l'appareil
Empreinte SHA-256 de l'image
   ↓
Événement chiffré (ECDH → AES-GCM) vers le gestionnaire
   ↓
Chaînage : hash = SHA256(seq | ts | capteur | chiffré | hash précédent)
   ↓
Signature ECDSA P-256
   ↓
File d'attente locale (IndexedDB)
   ↓  transport indifférent : fichier, HTTPS, hors ligne
Console gestionnaire → vérifie → ✓ Vérifié / ✗ Falsifié
```

Environ **580 octets par événement**, mesurés (clé éphémère 88 o, signature 88 o, deux empreintes de 64 o, chiffré ~180 o, et le reste en métadonnées). L'`imageHash` permet de prouver plus tard qu'une photo présentée correspond bien à une alerte, **sans que la photo ait jamais circulé** — à condition d'avoir conservé le fichier exact, l'empreinte portant sur l'encodage JPEG produit à la capture.

### Menaces et contre-mesures

| Menace | Contre-mesure |
|---|---|
| Fausse alerte injectée | Signature ECDSA — tout événement non signé par le capteur enregistré est rejeté |
| Alerte supprimée (le voleur efface sa trace) | Numéros de séquence — un trou entre 41 et 43 est signalé |
| Historique falsifié (litige assurance) | Chaînage par hachage — altérer un maillon invalide **tous les suivants** |
| Vol de l'appareil | Journal chiffré vers le gestionnaire ; le capteur ne peut pas le relire |
| Force brute sur la phrase de passe | PBKDF2-HMAC-SHA256, 310 000 itérations |
| Fuite de vie privée (personnes filmées) | Les images ne sont **ni stockées ni transmises** — seule leur empreinte |
| Démonstration présentée comme réelle | Le mode simulation est **tracé explicitement** dans le journal |

### L'authentification, sans serveur

```
Phrase de passe ──PBKDF2 (310 000 itérations)──> clé AES-GCM
                                                      │
                                    déballe la clé privée du gestionnaire
```

La phrase de passe n'est stockée **nulle part** — ni en clair, ni hachée. Il n'existe aucun serveur d'identité à compromettre, et le déverrouillage fonctionne hors ligne.

> ⚠️ **Limites assumées.**
>
> - Il s'agit d'un contrôle d'accès *par chiffrement*, pas d'une authentification arbitrée par un serveur. Quelqu'un qui détient l'appareil du gestionnaire peut tenter une attaque hors ligne — d'où le coût délibéré de la dérivation.
> - Une chaîne de hachage conservée sur le seul appareil ne protège pas contre son propriétaire : c'est le transfert vers un tiers qui fige la preuve.
> - **La vérification d'un lot établit sa cohérence interne, pas l'identité de son auteur.** Les signatures sont contrôlées avec la clé publique contenue dans le fichier ; c'est à l'auditeur de comparer l'empreinte `AGS-XXXXXX` affichée à celle que le capteur lui a communiquée par un autre canal. L'interface l'énonce explicitement plutôt que d'afficher un « authentique » trompeur.
> - **L'horodatage vient de l'horloge de l'appareil.** Il n'est arbitré par personne : qui contrôle le capteur peut antidater. Seul l'ordre des maillons est cryptographiquement contraint.
> - La dérivation ECDH alimente directement AES-GCM, comme le fait Web Crypto. Un ECIES canonique interposerait un HKDF ; ce n'est pas exploitable ici, mais c'est un écart assumé au profit du « zéro dépendance ».

---

## 🤖 Ce que fait — et ne fait pas — notre IA

| Fonction | Nature | Détail |
|---|---|---|
| Détection intrus / nuisibles | ✅ **IA réelle** | COCO-SSD (`lite_mobilenet_v2`), inférence live, ~15 img/s |
| Contrôle de cadrage de la photo | ✅ **IA réelle** | MobileNet v1 vérifie en direct la présence d'un végétal |
| Identification de la maladie | 🔶 **Parcours guidé** | Confirmation par l'agriculteur, adossée à la base agronomique |

**Pourquoi ce choix ?** MobileNet est entraîné sur ImageNet-1000, qui ne contient **aucune** classe *manioc*, *tomate*, *mil* ou *sorgho*, ni aucune maladie phytosanitaire. Un modèle généraliste ne peut pas diagnostiquer une culture vivrière togolaise. Plutôt que d'afficher un score de confiance dénué de sens agronomique, l'agriculteur déclare sa culture et confirme le symptôme observé : plus rapide, plus fiable, et opérationnel hors connexion.

**Roadmap** — classifieur dédié par transfer learning (MobileNetV2) sur le dataset *Cassava Leaf Disease*. Trois de ses classes correspondent déjà à notre base : `cmd` → Mosaïque du Manioc, `cbb` → Brûlure Bactérienne, `healthy` → Feuillage Sain.

---

## 🔥 Points forts

- **⚡ Edge AI, littéralement** — modèles et poids (23 Mo) embarqués dans le dépôt. Aucun CDN, aucune inférence distante.
- **📴 Fonctionne sans réseau** — PWA installable ; une seule visite suffit à la rendre autonome.
- **🔒 Confidentialité par conception** — aucune image ne quitte l'appareil. Il n'existe nulle part où l'envoyer.
- **🛡️ Sécurité démontrable** — un bouton falsifie volontairement un événement : la détection est immédiate et visible.
- **📱 Pensé pour le terrain** — interface tactile, caméra arrière par défaut, thème sombre lisible en plein soleil.
- **🌱 Base agronomique localisée** — 8 maladies sur les 5 cultures vivrières majeures du Togo, avec variétés résistantes réellement disponibles (TME 419, SOSAT-C88, IITA Streak Resistant).

---

## 🛠️ Stack technique

- **Frontend** : HTML5 sémantique, CSS3 responsive
- **Logique** : JavaScript ES6+, modules natifs — **aucun bundler, aucune dépendance npm**
- **IA** : TensorFlow.js 4.10 — `COCO-SSD` (détection) et `MobileNet v1 α0.50` (contrôle de cadrage)
- **Cryptographie** : **Web Crypto API native** — ECDSA P-256, ECDH P-256, AES-GCM 256, PBKDF2, SHA-256. Aucune bibliothèque tierce.
- **Stockage** : IndexedDB (journal chiffré, clés)
- **Hors ligne** : Service Worker + Cache API, manifeste PWA
- **Audio** : Web Audio API (effarouchement synthétisé, aucun fichier son)

---

## 📂 Arborescence

```text
AgroSentinel-AI/
├── index.html                   # Vue capteur : surveillance + diagnostic
├── dashboard.html               # Console gestionnaire : journal sécurisé
├── style.css
├── sw.js                        # Service worker (hors ligne)
├── manifest.webmanifest
│
├── js/
│   ├── app.js                   # Contrôleur capteur, machine à états, PWA
│   ├── config.js                # Base agronomique & paramètres
│   │
│   ├── security/                # ── Noyau cryptographique ──
│   │   ├── crypto.js            # Clés, signature, chiffrement, dérivation
│   │   └── journal.js           # Journal chaîné, vérification, export
│   │
│   ├── models/
│   │   ├── objectDetector.js    # Surveillance temps réel (COCO-SSD)
│   │   ├── leafClassifier.js    # Contrôle de cadrage (MobileNet)
│   │   └── imagenetClasses.js   # Libellés ImageNet-1000
│   │
│   ├── views/
│   │   ├── diagnostic.js        # Parcours guidé + capture caméra
│   │   ├── security.js          # Journal & appairage (côté capteur)
│   │   └── dashboard.js         # Console gestionnaire
│   │
│   └── utils/
│       ├── audioSynth.js        # Synthétiseur d'alarmes
│       ├── telemetry.js         # Journal d'interface & FPS
│       └── pwa.js               # Cycle de vie du service worker
│
├── models/                      # Poids IA embarqués (~23 Mo)
├── vendor/                      # TensorFlow.js, polices, icônes (~2 Mo)
├── icons/                       # Icônes PWA
└── tools/serve-https.py         # Serveur HTTPS local (test caméra mobile)
```

---

## 🚀 Lancement

### Sur ordinateur

Un serveur statique est nécessaire : les modules ES ne se chargent pas via `file://`.

```bash
python -m http.server 3000
```

- Vue capteur : **http://localhost:3000**
- Console gestionnaire : **http://localhost:3000/dashboard.html**

### Sur smartphone

> ⚠️ **HTTPS obligatoire.** Les navigateurs mobiles n'exposent la caméra et Web Crypto que dans un *contexte sécurisé*. Une adresse `http://192.168.x.x:3000` sera **refusée**.

**Voie recommandée — GitHub Pages** : *Settings → Pages → Branch `main` → `/ (root)`*, puis ouvrir l'URL publiée et **« Ajouter à l'écran d'accueil »**. L'application fonctionne ensuite entièrement hors ligne.

**Dépannage local** — pour tester la caméra sans déployer :

```bash
python tools/serve-https.py     # https://<ip-locale>:8443
```

Le certificat est auto-signé : le téléphone affiche un avertissement à accepter. Chrome refusant d'enregistrer un service worker sur un certificat non approuvé, **le mode hors ligne ne fonctionne pas dans ce mode** — c'est un dépannage caméra, pas un substitut au déploiement.

### ⚠️ À chaque déploiement

Incrémenter `VERSION` dans [`sw.js`](sw.js). C'est cette valeur qui invalide les caches : sans elle, un appareil ayant déjà visité l'application continue d'afficher l'ancienne version.

---

## 🎬 Démonstration

> L'ordre compte. Le capteur ne peut chiffrer que vers un destinataire connu : **créez l'accès gestionnaire d'abord.** Les événements produits avant sont conservés dans une file persistante (IndexedDB) et écrits dès qu'un destinataire existe — mais la console reste vide jusque-là, et le badge *Journal* de la vue capteur l'indique.

1. **Console gestionnaire** → phrase de passe → l'accès est créé
2. *(deux appareils)* copier la clé publique de la console → la coller dans **Vue capteur → Journal sécurisé & destinataire** → comparer l'empreinte `MGR-XXXXXX` de vive voix
3. **Vue capteur** → *Démarrer Caméra* (ou *Mode Démo*) → le badge *Journal* s'incrémente à chaque détection
4. **Diagnostic** → culture → caméra → symptôme → fiche de traitement
5. **Console gestionnaire** → journal, badges **✓ Vérifié**, bandeau *Chaîne intègre*
6. **« Falsifier un événement »** → bandeau rouge, contenu illisible, maillons suivants invalidés

Le sixième temps est le plus important : la sécurité n'est pas affirmée, **elle est mise à l'épreuve en direct**.

Si la démonstration se fait sur deux appareils, la console du gestionnaire déchiffre ce qu'elle reçoit et le capteur, lui, affiche *« Chiffré pour un autre gestionnaire »* sur son propre matériel : la séparation des rôles devient visible plutôt que revendiquée.

---

## 👥 Équipe

Prototype conçu et réalisé lors du **Hackathon Togo IT Days — Mission 6 : AgroCyber**.
- **Repository** : [JoDm007/AgroSentinel-AI](https://github.com/JoDm007/AgroSentinel-AI)
