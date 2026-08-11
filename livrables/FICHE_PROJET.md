# Fiche Projet — AgroSentinel AI

> **Hackathon Togo IT Days 2026 — Mission 6 : AgroCyber**
> Surveillance Edge-AI des cultures et journal d'exploitation cryptographiquement vérifiable, exécutés entièrement dans le navigateur, sans serveur et sans connexion internet.
>
> **Dépôt** : <https://github.com/JoDm007/AgroSentinel-AI> · **Équipe** : [Nom de l'équipe] — [Membre 1], [Membre 2], [Membre 3]

---

## 1. Contexte et problématique

L'agriculture togolaise occupe une part majeure de la population active et constitue un pilier de l'économie nationale. Sa transformation numérique est engagée : paiement mobile, premiers services de traçabilité, capteurs connectés, conseil agricole par SMS. Mais cette digitalisation importe des risques que le monde agricole n'avait pas à gérer auparavant — et que la Mission AgroCyber met précisément en lumière :

- **Falsification des données** : une alerte phytosanitaire retouchée ou un historique de production modifié peut fausser une indemnisation d'assurance, un litige entre coopérateurs ou une certification.
- **Vol de matériel** : un appareil de terrain volé livre classiquement tout son contenu — historique, positions, habitudes de l'exploitation.
- **Centralisation des données sensibles** : une base nationale d'alertes agricoles (positions des parcelles, périodes de vulnérabilité, rendements) est une cible de choix pour un attaquant.
- **Dépendance au réseau** : la couverture internet en zone rurale est intermittente ; toute solution exigeant une connexion permanente est inutilisable au champ.

Deux constats ont structuré notre réponse :

1. **Le réseau n'est pas une hypothèse fiable.** La solution doit fonctionner intégralement hors ligne.
2. **La meilleure base de données à protéger est celle qui n'existe pas.** Plutôt que de sécuriser un serveur central, nous avons choisi de ne pas en créer : les données restent sur les appareils, chiffrées, et seules des **preuves** circulent.

## 2. Objectifs de la solution

| # | Objectif | Traduction concrète dans le prototype |
|---|---|---|
| 1 | Détecter les menaces au champ **sans réseau** | Détection d'intrus et de nuisibles par IA embarquée (COCO-SSD, ~15 img/s), 100 % locale |
| 2 | Aider au diagnostic phytosanitaire **hors ligne** | Parcours guidé adossé à une base de 8 maladies sur les 5 cultures vivrières majeures du Togo |
| 3 | Rendre chaque événement **infalsifiable** | Signature ECDSA P-256 (clé non exportable) + chaînage SHA-256 des événements |
| 4 | Garantir la **confidentialité par conception** | Chiffrement ECDH → AES-GCM vers le seul gestionnaire ; les images ne quittent jamais l'appareil |
| 5 | Rendre la sécurité **démontrable**, pas déclarative | Un bouton falsifie volontairement un événement ; la détection est immédiate et visible |

## 3. Bénéficiaires

- **Agriculteurs et exploitations familiales** : surveillance du champ, diagnostic guidé et fiches de traitement (variétés résistantes réellement disponibles : TME 419, SOSAT-C88, IITA Streak Resistant), sur un simple smartphone, sans abonnement ni compte.
- **Coopératives agricoles** : la console gestionnaire centralise les alertes de plusieurs capteurs et permet de vérifier l'intégrité d'un historique **sans avoir le droit de lire son contenu** (le chaînage porte sur le chiffré).
- **Assureurs agricoles et organismes de certification** : un historique chaîné et signé constitue une preuve opposable en cas de litige — un maillon altéré invalide tous les suivants, un événement supprimé laisse un trou de séquence détectable.
- **Institutions publiques et projets de e-agriculture** : un modèle « zéro serveur » qui élimine par construction le risque de fuite massive de données d'exploitation.

## 4. Architecture fonctionnelle

Deux applications complémentaires dans un seul dépôt, sans aucun composant serveur :

```
┌── VUE CAPTEUR (index.html) ────────────┐      ┌── CONSOLE GESTIONNAIRE (dashboard.html) ─┐
│                                        │      │                                          │
│  Caméra → IA locale (COCO-SSD)         │      │  Authentification par phrase de passe    │
│    → détection intrus / nuisibles      │      │    (PBKDF2, 310 000 itérations,          │
│  Diagnostic guidé (base agronomique)   │      │     aucun serveur d'identité)            │
│                                        │      │                                          │
│  Chaque événement :                    │      │  Déchiffre les événements (seul à        │
│   1. empreinte SHA-256 de l'image      │      │    détenir la clé privée ECDH)           │
│   2. chiffré ECDH → AES-GCM            │──►──│  Vérifie signatures, chaînage et         │
│   3. chaîné au précédent (SHA-256)     │      │    numéros de séquence                   │
│   4. signé ECDSA P-256                 │      │  Affiche ✓ Vérifié / ✗ Falsifié          │
│      (clé privée NON exportable)       │      │  Exporte le lot vers un tiers            │
│   5. file locale IndexedDB             │      │    (coopérative, assureur)               │
└────────────────────────────────────────┘      └──────────────────────────────────────────┘
         transport indifférent : fichier, HTTPS, hors ligne — ~580 octets par événement
```

**Points d'architecture décisifs :**

- **Appairage explicite** : la console affiche sa clé publique et son empreinte courte (`MGR-XXXXXX`) ; le capteur la colle, et les deux personnes comparent l'empreinte de vive voix. La confiance est un geste humain assumé, pas une autorité invisible.
- **Asymétrie voulue des capacités** : le capteur signe et chiffre mais **ne peut pas relire** son propre journal ; le gestionnaire est le seul à déchiffrer. Un capteur volé ne livre donc aucun historique.
- **Ce n'est pas l'image qui voyage, c'est une preuve** : seule l'empreinte SHA-256 de la photo est journalisée. Elle permet de prouver plus tard qu'une photo présentée correspond bien à une alerte, sans que la photo ait jamais circulé.
- **Intégrité vérifiable sans droit de lecture** : le chaînage porte sur le chiffré, ce qui permet un audit d'intégrité par un tiers sans divulgation du contenu.

## 5. Technologies utilisées

| Couche | Choix | Justification |
|---|---|---|
| Frontend | HTML5, CSS3, JavaScript ES6+ (modules natifs) | Aucun bundler, aucune dépendance npm : surface d'attaque et de panne minimale |
| IA embarquée | TensorFlow.js 4.10 — COCO-SSD (`lite_mobilenet_v2`) + MobileNet v1 α0.50 | Inférence 100 % locale (~15 img/s) ; poids (~23 Mo) embarqués dans le dépôt, aucun CDN |
| Cryptographie | **Web Crypto API native** : ECDSA P-256, ECDH P-256, AES-GCM 256, PBKDF2-HMAC-SHA256 (310 000 itérations), SHA-256 | Primitives auditées du navigateur, clés non exportables, zéro bibliothèque tierce |
| Stockage | IndexedDB | Journal chiffré et clés persistants hors ligne |
| Hors ligne | Service Worker + Cache API, manifeste PWA | Une seule visite suffit : l'application devient autonome et installable |
| Audio | Web Audio API | Alarme d'effarouchement synthétisée, aucun fichier son |

**Honnêteté technique assumée** — MobileNet (ImageNet-1000) ne contient aucune classe manioc, tomate, mil ou sorgho : il ne peut pas diagnostiquer une culture vivrière togolaise. Nous l'utilisons uniquement pour le contrôle de cadrage de la photo ; le diagnostic repose sur un parcours guidé confirmé par l'agriculteur, adossé à la base agronomique. Afficher un faux score de confiance aurait été plus impressionnant — et trompeur.

## 6. Perspectives d'évolution

1. **Classifieur phytosanitaire dédié** : transfer learning (MobileNetV2) sur le dataset *Cassava Leaf Disease* — trois classes correspondent déjà à notre base (`cmd` → Mosaïque du Manioc, `cbb` → Brûlure Bactérienne, `healthy` → Feuillage Sain).
2. **Synchronisation opportuniste** : transmission automatique des lots chiffrés dès qu'un réseau apparaît (Background Sync), le format d'événement (~580 octets) étant déjà compatible SMS/USSD à terme.
3. **Horodatage ancré** : contresignature périodique de la tête de chaîne par un tiers (coopérative) pour opposer une date certaine, l'horloge locale n'étant pas arbitrée.
4. **Multi-capteurs par exploitation** : agrégation de plusieurs capteurs sous une même console, cartographie des alertes par parcelle.
5. **Pilote terrain** : expérimentation avec une coopérative togolaise sur une campagne agricole, en partenariat avec les structures d'encadrement agricole (ICAT, instituts de recherche).
6. **Durcissement** : interposition d'un HKDF (ECIES canonique) dans la dérivation ECDH → AES-GCM, rotation de clés gestionnaire.

---

*Document remis dans le cadre des livrables du Hackathon Togo IT Days 2026. Le prototype est fonctionnel, hors ligne et reproductible : voir le [README](../README.md) pour le lancement en local et le [script de démonstration](SCRIPT_DEMO.md) pour le déroulé devant jury.*
