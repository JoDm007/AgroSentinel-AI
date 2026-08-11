# Pitch Deck — AgroSentinel AI

> **Hackathon Togo IT Days 2026 — Mission 6 : AgroCyber**
> Support de présentation (contenu diapo par diapo). Durée cible : **5 minutes de pitch + démonstration**.
> Chaque diapo tient en une idée ; les notes en italique sont le texte à dire, pas à afficher.

---

## Diapo 1 — Titre

# 🌾 AgroSentinel AI
### La sentinelle du champ qui n'a besoin ni d'internet, ni de serveur — et qui ne peut pas mentir.

**Équipe [Nom de l'équipe]** · Mission 6 : AgroCyber · Togo IT Days 2026

> *« Et si la meilleure base de données agricole à pirater… était celle qui n'existe pas ? »*

---

## Diapo 2 — Le problème

### L'agriculture togolaise se digitalise. Ses risques aussi.

- 🌐 **Le réseau n'est pas fiable au champ** — une solution qui exige une connexion permanente ne sert à rien en zone rurale.
- 📊 **Les données agricoles deviennent une cible** — positions des parcelles, alertes, rendements : tout ce qu'un attaquant veut.
- ✍️ **Un historique se falsifie** — une alerte retouchée fausse une indemnisation d'assurance ou un litige de coopérative.
- 📱 **Un appareil volé parle** — il livre classiquement tout son contenu.

> *Le point clé : la cybersécurité agricole ne se joue pas dans un datacenter à Lomé, elle se joue dans la poche de l'agriculteur.*

---

## Diapo 3 — Notre réponse en une phrase

### Deux applications, un dépôt, **zéro serveur**.

| | Rôle |
|---|---|
| 🎥 **Capteur** (au champ) | Surveille, diagnostique, **signe et chiffre** chaque événement — sans pouvoir le relire |
| 🛡️ **Console gestionnaire** | S'authentifie, **déchiffre**, vérifie l'intégrité, transmet la preuve à un tiers |

Les images ne quittent **jamais** l'appareil. Seules des **preuves** circulent (~580 octets par événement).

---

## Diapo 4 — Ce que voit le jury (démo en 3 actes)

1. **L'IA veille** — détection d'intrus et de nuisibles en direct, ~15 img/s, 100 % locale.
2. **Le journal se construit** — chaque événement est chiffré, chaîné, signé ; la console affiche **✓ Vérifié**.
3. **On attaque notre propre système** — un bouton falsifie un événement : bandeau rouge immédiat, maillons suivants invalidés.

> *La sécurité n'est pas affirmée sur une slide : elle est mise à l'épreuve en direct, devant vous.*

---

## Diapo 5 — Le modèle de confiance (le cœur du projet)

```
CAPTEUR                                GESTIONNAIRE
ECDSA P-256, clé NON exportable        ECDH P-256, clé emballée par
→ signe chaque événement               phrase de passe (PBKDF2 310 000 it.)
→ chiffre vers le gestionnaire         → SEUL à pouvoir déchiffrer
→ NE PEUT PAS relire son journal
```

**Trois conséquences vérifiables :**
- Un capteur **volé ne livre aucun historique** — il n'a jamais eu la clé de lecture.
- **Nul ne peut forger une alerte** — même notre propre code ne peut pas lire la clé de signature.
- L'intégrité se vérifie **sans droit de lecture** — le chaînage porte sur le chiffré : audit possible par un assureur sans divulguer l'exploitation.

---

## Diapo 6 — L'appairage : la confiance est un geste humain

- La console affiche son empreinte courte : **`MGR-XXXXXX`**
- Le capteur la colle, et les deux personnes **comparent l'empreinte de vive voix**.
- Aucune autorité de certification, aucun serveur d'identité, aucun compte.

> *La phrase de passe n'est stockée nulle part — ni en clair, ni hachée. Il n'existe aucun serveur à compromettre, et le déverrouillage fonctionne hors ligne.*

---

## Diapo 7 — Menaces ↔ contre-mesures

| Menace | Contre-mesure |
|---|---|
| Fausse alerte injectée | Signature ECDSA — événement non signé rejeté |
| Alerte supprimée | Numéros de séquence — un trou entre 41 et 43 est signalé |
| Historique falsifié (litige) | Chaînage SHA-256 — un maillon altéré invalide **tous les suivants** |
| Vol de l'appareil | Journal chiffré vers le gestionnaire uniquement |
| Force brute | PBKDF2-HMAC-SHA256, 310 000 itérations |
| Vie privée (personnes filmées) | Images ni stockées ni transmises — seule leur empreinte |

---

## Diapo 8 — Technologies : la sobriété comme sécurité

- **IA embarquée** : TensorFlow.js — COCO-SSD (détection) + MobileNet (contrôle de cadrage). Poids (~23 Mo) **dans le dépôt**, aucun CDN.
- **Cryptographie** : **Web Crypto API native** — ECDSA, ECDH, AES-GCM, PBKDF2, SHA-256. **Zéro bibliothèque tierce.**
- **Hors ligne** : PWA + Service Worker — une seule visite suffit, l'application devient autonome.
- **Zéro dépendance npm, zéro bundler, zéro backend.**

> *Chaque dépendance en moins est une attaque de chaîne d'approvisionnement en moins. En cybersécurité, la sobriété est une posture de défense.*

---

## Diapo 9 — Notre honnêteté technique (ce que l'IA ne fait pas)

- MobileNet est entraîné sur ImageNet-1000 : **aucune classe manioc, tomate, mil ou sorgho.**
- Un modèle généraliste **ne peut pas** diagnostiquer une culture vivrière togolaise.
- Nous avons refusé d'afficher un faux score de confiance : le diagnostic est un **parcours guidé confirmé par l'agriculteur**, adossé à une base de **8 maladies sur les 5 cultures vivrières majeures du Togo** — avec des variétés résistantes réellement disponibles (TME 419, SOSAT-C88, IITA Streak Resistant).

> *Roadmap : transfer learning sur le dataset Cassava Leaf Disease — trois de ses classes correspondent déjà à notre base.*

---

## Diapo 10 — Modèle de déploiement

1. **Aujourd'hui** : hébergement statique gratuit (GitHub Pages) → « Ajouter à l'écran d'accueil » → l'application fonctionne hors ligne pour toujours. **Coût d'infrastructure : 0 FCFA.**
2. **Demain** : diffusion par les coopératives — une console par coopérative, des capteurs appairés chez les membres ; les lots de preuves circulent par fichier, clé USB ou réseau opportuniste.
3. **Après-demain** : pilote sur une campagne agricole avec une coopérative et les structures d'encadrement (ICAT), classifieur phytosanitaire dédié, horodatage contresigné par un tiers.

---

## Diapo 11 — Impact attendu

- 👨🏾‍🌾 **Pour l'agriculteur** : une sentinelle et un conseiller phytosanitaire dans un téléphone, sans abonnement, sans compte, sans réseau.
- 🤝 **Pour la coopérative** : des alertes vérifiables et un audit d'intégrité **sans droit de lecture** sur les données des membres.
- 🏦 **Pour l'assureur** : un historique opposable en cas de litige — falsification et suppression détectables cryptographiquement.
- 🇹🇬 **Pour l'écosystème** : un modèle de e-agriculture **sans base centrale à protéger** — le risque de fuite massive est éliminé par construction, pas par promesse.

---

## Diapo 12 — Conclusion

# La sécurité ne se déclare pas. Elle se démontre.

- ✅ Prototype fonctionnel, hors ligne, reproductible
- ✅ Cryptographie native, vérifiable dans le code
- ✅ Falsification détectée **en direct devant vous**

**github.com/JoDm007/AgroSentinel-AI**

> *Merci. Nous sommes prêts pour vos questions — et pour refaire la démonstration d'attaque autant de fois que vous le souhaitez.*

---

## Annexe — Anticipation des questions du jury

| Question probable | Réponse courte |
|---|---|
| « Pourquoi pas de serveur ? C'est une limite, non ? » | C'est un choix de sécurité : une base centrale d'alertes agricoles est une cible. Nous faisons circuler des preuves, pas des données. Un serveur relais optionnel reste possible plus tard — chiffré de bout en bout, il n'aurait rien à lire. |
| « Votre IA diagnostique-t-elle vraiment les maladies ? » | Non, et nous le disons : détection d'intrus réelle (COCO-SSD), cadrage réel (MobileNet), diagnostic par parcours guidé. Un score de confiance inventé serait trompeur. Le transfer learning sur Cassava Leaf Disease est la suite naturelle. |
| « Que se passe-t-il si l'agriculteur perd sa phrase de passe ? » | Le journal chiffré devient illisible — c'est le prix de l'absence de serveur de récupération. En pratique, la console est tenue par la coopérative, pas par chaque agriculteur. |
| « L'horodatage est-il fiable ? » | L'horloge est locale, donc non arbitrée — seul l'**ordre** des maillons est cryptographiquement garanti. La contresignature périodique par un tiers est dans la roadmap. |
| « Pourquoi le navigateur et pas une app native ? » | Web Crypto et TensorFlow.js offrent le même socle sur tout smartphone récent, sans store, sans mise à jour forcée, et le code est auditable en un clic. |
