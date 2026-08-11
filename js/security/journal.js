/**
 * AgroSentinel AI - Journal d'événements sécurisé
 *
 * Chaque événement produit par le capteur est :
 *   1. CHIFFRÉ vers la clé publique du gestionnaire (le capteur ne peut
 *      pas relire ce qu'il a écrit) ;
 *   2. CHAÎNÉ  — son empreinte inclut celle de l'événement précédent ;
 *   3. SIGNÉ   — avec la clé privée non exportable du capteur.
 *
 * L'empreinte porte sur le CHIFFRÉ, pas sur le clair : l'intégrité de la
 * chaîne est donc vérifiable par un tiers qui n'a pas le droit de lire le
 * contenu. C'est ce qui permet à une coopérative ou à un assureur
 * d'attester qu'un historique n'a pas été retouché sans accéder aux
 * données de l'exploitation.
 */

import {
  generateSensorKeyPair, deriveSensorId, exportPublicKey, importSignaturePublicKey,
  generateManagerKeyPair, importManagerPublicKey, fingerprintPublicKeyB64,
  deriveKeyFromPassphrase, wrapManagerPrivateKey, unwrapManagerPrivateKey,
  sealForManager, openAsManager,
  signText, verifyText, sha256Hex, randomBytes, toBase64, fromBase64,
} from './crypto.js';

const DB_NAME = "agrosentinel-secure";
// v2 : ajout du store "pending" (événements produits avant qu'un
// destinataire de chiffrement ne soit connu).
const DB_VERSION = 2;
const STORE_META = "meta";
const STORE_EVENTS = "events";
const STORE_PENDING = "pending";

/** Empreinte conventionnelle du maillon initial de la chaîne. */
export const GENESIS_HASH = "0".repeat(64);

let dbPromise = null;

// ─── Accès IndexedDB ─────────────────────────────────────────────────────────

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        db.createObjectStore(STORE_EVENTS, { keyPath: "seq" });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // Une version antérieure de la base est ouverte dans un autre onglet :
    // sans ce garde, la promesse ne se résout jamais et l'interface reste
    // bloquée sur « Lecture de l'état… » sans rien dire.
    request.onblocked = () => reject(new Error(
      "Une autre page AgroSentinel est ouverte : fermez-la puis rechargez."));
  });

  return dbPromise;
}

function transact(storeName, mode, action) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.onerror = () => reject(tx.error);
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      tx.oncomplete = () => resolve();
    }
  }));
}

const getMeta = id => transact(STORE_META, "readonly", s => s.get(id));
const putMeta = record => transact(STORE_META, "readwrite", s => s.put(record));

// ─── Identité du capteur ─────────────────────────────────────────────────────

let sensorCache = null;

/** Crée l'identité du capteur au premier lancement, puis la réutilise. */
export async function ensureSensorIdentity() {
  if (sensorCache) return sensorCache;

  let record = await getMeta("sensor");

  if (!record) {
    const keyPair = await generateSensorKeyPair();
    record = {
      id: "sensor",
      keyPair,
      sensorId: await deriveSensorId(keyPair.publicKey),
      publicKeyB64: await exportPublicKey(keyPair.publicKey),
      createdAt: new Date().toISOString(),
    };
    await putMeta(record);
  }

  sensorCache = record;
  return record;
}

// ─── Identité du gestionnaire ────────────────────────────────────────────────

export async function isManagerConfigured() {
  return Boolean(await getMeta("manager"));
}

/**
 * Clé publique du gestionnaire de CET appareil, avec son empreinte courte.
 * C'est ce couple que le gestionnaire transmet au capteur pour l'appairer.
 */
export async function getManagerIdentity() {
  const record = await getMeta("manager");
  if (!record) return null;

  return {
    publicKeyB64: record.publicKeyB64,
    fingerprint: await fingerprintPublicKeyB64(record.publicKeyB64, "MGR"),
    createdAt: record.createdAt,
  };
}

/**
 * Initialise le compte gestionnaire à partir d'une phrase de passe.
 * La phrase n'est stockée nulle part : elle sert à emballer la clé privée.
 */
export async function setupManager(passphrase) {
  // Régénérer la paire du gestionnaire rendrait TOUS les événements déjà
  // chiffrés définitivement illisibles. On refuse plutôt que de détruire
  // silencieusement l'historique.
  if (await isManagerConfigured()) {
    throw new Error("Un accès gestionnaire existe déjà sur cet appareil.");
  }

  const salt = randomBytes(16);
  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);
  const keyPair = await generateManagerKeyPair();
  const wrapped = await wrapManagerPrivateKey(keyPair.privateKey, wrappingKey);

  await putMeta({
    id: "manager",
    salt: toBase64(salt),
    wrapped,
    publicKeyB64: await exportPublicKey(keyPair.publicKey),
    createdAt: new Date().toISOString(),
  });

  await flushPending();
}

/**
 * Tente de déverrouiller la clé privée du gestionnaire.
 * @returns {Promise<CryptoKey|null>} null si la phrase est incorrecte.
 */
export async function unlockManager(passphrase) {
  const record = await getMeta("manager");
  if (!record) return null;

  try {
    const wrappingKey = await deriveKeyFromPassphrase(passphrase, fromBase64(record.salt));
    return await unwrapManagerPrivateKey(record.wrapped, wrappingKey);
  } catch {
    // AES-GCM échoue à l'authentification : la phrase est fausse.
    return null;
  }
}

// ─── Destinataire du chiffrement ─────────────────────────────────────────────

/**
 * Vers QUI le capteur chiffre-t-il ?
 *
 * Deux cas, et l'ordre compte :
 *   1. Une clé publique de gestionnaire IMPORTÉE — le vrai scénario terrain,
 *      où le gestionnaire est sur un autre appareil. Le capteur chiffre alors
 *      vers quelqu'un qu'il ne peut pas relire : c'est ce qui rend l'appareil
 *      volé réellement inexploitable.
 *   2. Le gestionnaire LOCAL, à défaut — pratique pour la démonstration sur
 *      une seule machine, mais la séparation des rôles n'y est que logique :
 *      le journal chiffré et la clé privée emballée cohabitent.
 */
export async function getRecipient() {
  const imported = await getMeta("recipient");
  if (imported) {
    return {
      publicKeyB64: imported.publicKeyB64,
      fingerprint: imported.fingerprint,
      source: "imported",
      importedAt: imported.importedAt,
    };
  }

  const local = await getMeta("manager");
  if (local) {
    return {
      publicKeyB64: local.publicKeyB64,
      fingerprint: await fingerprintPublicKeyB64(local.publicKeyB64, "MGR"),
      source: "local",
      importedAt: local.createdAt,
    };
  }

  return null;
}

/**
 * Appaire ce capteur à un gestionnaire distant.
 *
 * Les événements DÉJÀ écrits restent chiffrés pour le destinataire
 * précédent — on ne peut pas les rechiffrer sans les déchiffrer, et le
 * capteur n'en a précisément pas le droit. C'est la conséquence directe du
 * modèle, pas une limitation d'implémentation.
 *
 * @throws {Error} si la valeur fournie n'est pas une clé publique ECDH P-256.
 */
export async function setRecipientPublicKey(base64) {
  const clean = String(base64).replace(/\s+/g, "");
  if (!clean) throw new Error("Aucune clé fournie.");

  try {
    await importManagerPublicKey(clean);
  } catch {
    throw new Error("Clé invalide : ce n'est pas une clé publique ECDH P-256.");
  }

  const fingerprint = await fingerprintPublicKeyB64(clean, "MGR");
  await putMeta({
    id: "recipient",
    publicKeyB64: clean,
    fingerprint,
    importedAt: new Date().toISOString(),
  });

  await flushPending();
  return fingerprint;
}

/** Revient au gestionnaire local (démonstration mono-appareil). */
export async function clearRecipient() {
  await transact(STORE_META, "readwrite", s => s.delete("recipient"));
  notifyJournalChanged();
}

// ─── Écriture d'un événement ─────────────────────────────────────────────────

async function lastEvent() {
  const events = await listEvents();
  return events.length ? events[events.length - 1] : null;
}

/**
 * Les écritures sont sérialisées.
 *
 * Deux appels concurrents liraient le même dernier maillon, calculeraient le
 * même numéro de séquence, et le second écraserait le premier (le store a
 * pour clé `seq`) : un événement disparaîtrait sans que la chaîne paraisse
 * rompue. Cas réaliste — un diagnostic validé pendant une alerte caméra.
 */
let writeChain = Promise.resolve();

function enqueueWrite(task) {
  const next = writeChain.then(task);
  writeChain = next.catch(() => {});
  return next;
}

/**
 * Ajoute un événement au journal : chiffrement, chaînage, signature.
 *
 * Tant qu'aucun destinataire n'est connu, l'événement est mis en file
 * DANS INDEXEDDB — pas en mémoire : la vue capteur et la console sont deux
 * pages distinctes, et une file en mémoire serait perdue à la navigation.
 */
export function appendEvent(payload) {
  return enqueueWrite(() => writeEvent(payload));
}

async function writeEvent(payload) {
  const recipient = await getRecipient();
  if (!recipient) {
    await transact(STORE_PENDING, "readwrite",
      s => s.add({ payload, queuedAt: new Date().toISOString() }));
    notifyJournalChanged();
    return null;
  }

  const sensor = await ensureSensorIdentity();
  const managerPublicKey = await importManagerPublicKey(recipient.publicKeyB64);

  const previous = await lastEvent();
  const seq = previous ? previous.seq + 1 : 1;
  const prevHash = previous ? previous.hash : GENESIS_HASH;
  const ts = new Date().toISOString();

  const sealed = await sealForManager(managerPublicKey, payload);
  const hash = await computeHash({ seq, ts, sensorId: sensor.sensorId, sealed, prevHash });
  const sig = await signText(sensor.keyPair.privateKey, hash);

  const event = { seq, ts, sensorId: sensor.sensorId, sealed, prevHash, hash, sig };
  await transact(STORE_EVENTS, "readwrite", s => s.put(event));
  notifyJournalChanged();
  return event;
}

// ─── File d'attente persistante ──────────────────────────────────────────────

export async function countPendingEvents() {
  const rows = await transact(STORE_PENDING, "readonly", s => s.getAll());
  return (rows || []).length;
}

/** Écrit les événements en attente, dans leur ordre d'arrivée. */
function flushPending() {
  return enqueueWrite(async () => {
    const rows = (await transact(STORE_PENDING, "readonly", s => s.getAll())) || [];
    rows.sort((a, b) => a.id - b.id);

    for (const row of rows) {
      // writeEvent, pas appendEvent : on est déjà dans la file d'écriture.
      const written = await writeEvent(row.payload);
      if (!written) return; // toujours aucun destinataire : on garde la file
      await transact(STORE_PENDING, "readwrite", s => s.delete(row.id));
    }
  });
}

/**
 * Signale un changement du journal aux vues qui l'affichent.
 * Évite de faire remonter l'état par un sondage périodique.
 */
function notifyJournalChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("journal:changed"));
  }
}

/** L'empreinte couvre le chiffré : vérifiable sans déchiffrer. */
export function computeHash({ seq, ts, sensorId, sealed, prevHash }) {
  return sha256Hex([seq, ts, sensorId, sealed.epk, sealed.iv, sealed.ct, prevHash].join("|"));
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

export async function listEvents() {
  const events = await transact(STORE_EVENTS, "readonly", s => s.getAll());
  return (events || []).sort((a, b) => a.seq - b.seq);
}

export async function countEvents() {
  return (await listEvents()).length;
}

// ─── Vérification ────────────────────────────────────────────────────────────

/**
 * Contrôle chaque maillon : empreinte recalculée, signature, continuité
 * du chaînage et des numéros de séquence.
 *
 * @param {Array} events
 * @param {CryptoKey} sensorPublicKey
 * @returns {Promise<Array<{seq, ok, problems: string[]}>>}
 */
export async function verifyChain(events, sensorPublicKey) {
  const results = [];
  let expectedPrev = GENESIS_HASH;
  let expectedSeq = 1;

  for (const event of events) {
    const problems = [];

    const recomputed = await computeHash(event);
    if (recomputed !== event.hash) problems.push("Contenu altéré");

    if (event.prevHash !== expectedPrev) problems.push("Chaînage rompu");

    if (event.seq !== expectedSeq) {
      problems.push(event.seq > expectedSeq
        ? `Événement manquant (n°${expectedSeq})`
        : "Numéro de séquence incohérent");
    }

    const signatureValid = await verifyText(sensorPublicKey, event.hash, event.sig);
    if (!signatureValid) problems.push("Signature invalide");

    results.push({ seq: event.seq, ok: problems.length === 0, problems });

    // On enchaîne sur l'empreinte RECALCULÉE, pas sur celle stockée :
    // sans cela, altérer un maillon ne compromettrait pas les suivants,
    // ce qui viderait le chaînage de son intérêt.
    expectedPrev = recomputed;
    expectedSeq = event.seq + 1;
  }

  return results;
}

/** Déchiffre le contenu d'un événement (gestionnaire déverrouillé requis). */
export async function decryptEvent(event, managerPrivateKey) {
  try {
    return await openAsManager(managerPrivateKey, event.sealed);
  } catch {
    return null;
  }
}

// ─── Export vers un tiers (coopérative, assureur) ────────────────────────────

/**
 * Produit un lot signé, transférable par fichier — donc sans réseau.
 * Le destinataire vérifie l'origine et l'intégrité avec la clé publique
 * incluse, sans jamais avoir besoin de nous contacter.
 */
export async function exportBundle() {
  const sensor = await ensureSensorIdentity();
  const events = await listEvents();

  const bundle = {
    format: "agrosentinel-journal-v1",
    exportedAt: new Date().toISOString(),
    sensorId: sensor.sensorId,
    sensorPublicKey: sensor.publicKeyB64,
    genesis: GENESIS_HASH,
    events,
  };

  bundle.bundleHash = await sha256Hex(JSON.stringify(bundle.events));
  bundle.bundleSignature = await signText(sensor.keyPair.privateKey, bundle.bundleHash);
  return bundle;
}

/**
 * Vérifie un lot reçu d'un capteur tiers.
 *
 * ⚠️ CE QUE CETTE VÉRIFICATION PROUVE — ET CE QU'ELLE NE PROUVE PAS.
 * Les signatures sont vérifiées avec la clé publique CONTENUE DANS LE LOT.
 * Cela établit la cohérence interne du fichier : il a bien été produit d'un
 * seul tenant par le détenteur de cette clé, et n'a pas été retouché depuis.
 *
 * Cela n'établit PAS que cette clé est celle du capteur attendu : sans
 * autorité de certification, rien dans le fichier ne peut le dire. C'est à
 * l'auditeur de comparer l'empreinte renvoyée ici (`derivedSensorId`) à
 * l'identifiant que le capteur lui a communiqué par un autre canal.
 *
 * `sensorIdMatches` détecte le cas grossier où le lot affiche un identifiant
 * qui ne correspond pas à sa propre clé.
 */
export async function verifyBundle(bundle) {
  const sensorPublicKey = await importSignaturePublicKey(bundle.sensorPublicKey);
  const expectedHash = await sha256Hex(JSON.stringify(bundle.events));

  const bundleIntact = expectedHash === bundle.bundleHash
    && await verifyText(sensorPublicKey, bundle.bundleHash, bundle.bundleSignature);

  const derivedSensorId = await fingerprintPublicKeyB64(bundle.sensorPublicKey, "AGS");

  return {
    bundleIntact,
    sensorPublicKey,
    derivedSensorId,
    claimedSensorId: bundle.sensorId,
    sensorIdMatches: derivedSensorId === bundle.sensorId,
    results: await verifyChain(bundle.events, sensorPublicKey),
  };
}

// ─── Démonstration de détection d'altération ─────────────────────────────────

/**
 * Modifie volontairement un événement stocké, pour prouver en direct que
 * la falsification est détectée. Aucune signature n'est recalculée :
 * c'est exactement ce que ferait un attaquant sans la clé privée.
 */
export async function tamperWithEvent(seq) {
  const event = await transact(STORE_EVENTS, "readonly", s => s.get(seq));
  if (!event) return false;

  const bytes = fromBase64(event.sealed.ct);
  bytes[0] ^= 0xff; // un seul octet suffit
  event.sealed = { ...event.sealed, ct: toBase64(bytes) };

  await transact(STORE_EVENTS, "readwrite", s => s.put(event));
  return true;
}

/** Remet le journal à zéro (préparation d'une démonstration). */
export async function clearEvents() {
  await transact(STORE_EVENTS, "readwrite", s => s.clear());
}
