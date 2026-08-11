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
  generateManagerKeyPair, importManagerPublicKey,
  deriveKeyFromPassphrase, wrapManagerPrivateKey, unwrapManagerPrivateKey,
  sealForManager, openAsManager,
  signText, verifyText, sha256Hex, randomBytes, toBase64, fromBase64,
} from './crypto.js';

const DB_NAME = "agrosentinel-secure";
const DB_VERSION = 1;
const STORE_META = "meta";
const STORE_EVENTS = "events";

/** Empreinte conventionnelle du maillon initial de la chaîne. */
export const GENESIS_HASH = "0".repeat(64);

/** Événements produits avant l'initialisation du gestionnaire. */
const pendingPayloads = [];

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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

// ─── Écriture d'un événement ─────────────────────────────────────────────────

async function lastEvent() {
  const events = await listEvents();
  return events.length ? events[events.length - 1] : null;
}

/**
 * Ajoute un événement au journal : chiffrement, chaînage, signature.
 * Si le gestionnaire n'est pas encore configuré, l'événement est mis de
 * côté en mémoire et sera écrit dès l'initialisation.
 */
export async function appendEvent(payload) {
  const managerRecord = await getMeta("manager");
  if (!managerRecord) {
    pendingPayloads.push(payload);
    return null;
  }

  const sensor = await ensureSensorIdentity();
  const managerPublicKey = await importManagerPublicKey(managerRecord.publicKeyB64);

  const previous = await lastEvent();
  const seq = previous ? previous.seq + 1 : 1;
  const prevHash = previous ? previous.hash : GENESIS_HASH;
  const ts = new Date().toISOString();

  const sealed = await sealForManager(managerPublicKey, payload);
  const hash = await computeHash({ seq, ts, sensorId: sensor.sensorId, sealed, prevHash });
  const sig = await signText(sensor.keyPair.privateKey, hash);

  const event = { seq, ts, sensorId: sensor.sensorId, sealed, prevHash, hash, sig };
  await transact(STORE_EVENTS, "readwrite", s => s.put(event));
  return event;
}

async function flushPending() {
  while (pendingPayloads.length) {
    await appendEvent(pendingPayloads.shift());
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

/** Vérifie un lot reçu d'un capteur tiers. */
export async function verifyBundle(bundle) {
  const sensorPublicKey = await importSignaturePublicKey(bundle.sensorPublicKey);
  const expectedHash = await sha256Hex(JSON.stringify(bundle.events));

  const bundleIntact = expectedHash === bundle.bundleHash
    && await verifyText(sensorPublicKey, bundle.bundleHash, bundle.bundleSignature);

  return {
    bundleIntact,
    sensorPublicKey,
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
