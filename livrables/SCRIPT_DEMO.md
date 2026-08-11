# Script de Démonstration — AgroSentinel AI

> **Hackathon Togo IT Days 2026 — Mission 6 : AgroCyber**
> Déroulé minuté de la démonstration devant jury. Durée cible : **6 minutes**, plan de secours inclus.

---

## Avant de passer (checklist — à faire 15 minutes avant)

- [ ] Application déployée (GitHub Pages) **et** copie locale servie par `python -m http.server 3000` en secours.
- [ ] `VERSION` incrémentée dans `sw.js` si un correctif a été poussé depuis la dernière visite (sinon les appareils affichent l'ancien cache).
- [ ] **Deux appareils si possible** : un smartphone (vue capteur) + un ordinateur (console gestionnaire). À défaut, deux onglets sur la même machine — l'interface signale alors elle-même que la séparation des rôles est logique, pas matérielle.
- [ ] Console gestionnaire **déjà créée** (phrase de passe choisie et retenue) : le capteur ne peut chiffrer que vers un destinataire connu. **L'ordre compte.**
- [ ] Appairage fait : clé publique de la console collée dans *Vue capteur → Journal sécurisé & destinataire*, empreintes `MGR-XXXXXX` comparées.
- [ ] Caméra testée (HTTPS obligatoire sur mobile), luminosité de la salle vérifiée.
- [ ] Objet de test pour la détection (une personne suffit : classe « person » de COCO-SSD).
- [ ] Feuille ou photo de feuille pour le parcours diagnostic.
- [ ] Mode avion prêt à être activé pour la preuve hors ligne.

---

## Déroulé minuté

### T+0:00 — Accroche (30 s)

> « Voici un champ togolais. Pas de réseau, pas de serveur, pas de compte. Tout ce que vous allez voir tourne dans ce téléphone — et à la fin, nous attaquerons notre propre système devant vous. »

Montrer les deux écrans : vue capteur à gauche, console gestionnaire à droite.

### T+0:30 — Acte 1 : l'IA veille (1 min 30)

1. Vue capteur → **Démarrer Caméra**.
2. Passer devant l'objectif : la détection « person » s'affiche en direct (~15 img/s), l'alarme d'effarouchement se déclenche (Web Audio, aucun fichier son).
3. Montrer le badge **Journal** qui s'incrémente : *chaque détection vient d'être chiffrée, chaînée et signée — personne, pas même ce téléphone, ne peut la relire.*

> Si la caméra pose problème : basculer en **Mode Démo** en une phrase — « le mode simulation est tracé explicitement dans le journal, il ne se fait jamais passer pour du réel ».

### T+2:00 — Acte 2 : le diagnostic guidé (1 min)

1. **Diagnostic** → choisir la culture (ex. Manioc) → photographier la feuille.
2. Montrer le contrôle de cadrage (MobileNet vérifie qu'un végétal est présent).
3. Confirmer le symptôme → la fiche s'affiche : **Mosaïque du Manioc (CMD)**, sévérité, traitement, variété résistante TME 419.

> Une phrase d'honnêteté qui marque les jurys : « Notre IA ne prétend pas diagnostiquer — aucun modèle généraliste ne connaît le manioc. Elle cadre, l'agriculteur confirme, la base agronomique répond. »

### T+3:00 — Acte 3 : la preuve (1 min 30)

1. Console gestionnaire → saisir la phrase de passe → le journal se déchiffre.
2. Montrer les badges **✓ Vérifié** sur chaque événement et le bandeau **Chaîne intègre**.
3. Montrer l'empreinte du capteur (`AGS-XXXXXX`) : *c'est elle que l'auditeur compare, par un autre canal — la confiance est un geste humain, pas une case cochée.*

### T+4:30 — Le moment clé : l'attaque (1 min)

1. Cliquer **« Falsifier un événement »**.
2. Bandeau rouge immédiat : contenu illisible, signature invalide, **tous les maillons suivants invalidés**.
3. Conclure :

> « Une alerte falsifiée, un historique retouché, un événement supprimé : tout est détecté. La sécurité de ce prototype n'est pas une slide — vous venez de la voir résister. »

### T+5:30 — Preuve hors ligne (30 s, si le temps le permet)

Activer le **mode avion** → recharger l'application → tout fonctionne (PWA + Service Worker). *« Une seule visite a suffi : cette application n'aura plus jamais besoin d'internet. »*

---

## Plans de secours

| Incident | Réaction |
|---|---|
| Caméra refusée / absente | **Mode Démo** — assumé à voix haute : il est tracé comme simulation dans le journal |
| Wi-Fi de la salle défaillant | Rien ne change : l'application est 100 % hors ligne — le dire, c'est un argument, pas une excuse |
| Cache obsolète affiché | Recharger avec la version locale `http.server` ; vérifier `VERSION` dans `sw.js` |
| Console vide | Vérifier que l'accès gestionnaire a été créé **avant** les détections ; la file IndexedDB écrit les événements en attente dès qu'un destinataire existe |
| Un seul appareil disponible | Deux onglets ; préciser que le capteur affiche alors « Chiffré pour un autre gestionnaire » sur deux appareils réels |

---

## Répartition des rôles (à adapter)

| Rôle | Qui | Fait quoi |
|---|---|---|
| Orateur principal | [Membre 1] | Accroche, narration, conclusion |
| Manipulateur capteur | [Membre 2] | Caméra, détection, diagnostic |
| Manipulateur console | [Membre 3] | Authentification, vérification, falsification |

*Règle d'or : celui qui parle ne manipule pas. Et le sixième temps — la falsification — n'est jamais coupé, même si le temps manque : c'est lui qui prouve tout le reste.*
