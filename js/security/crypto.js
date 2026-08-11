/**
 * AgroSentinel AI - Noyau cryptographique (Web Crypto API native)
 *
 * MODÈLE DE CONFIANCE
 *
 *   Capteur (au champ)                Gestionnaire (dashboard)
 *   ──────────────────                ────────────────────────
 *   • Paire ECDSA P-256               • Paire ECDH P-256
 *     → SIGNE chaque événement          → clé privée CHIFFRÉE par
 *     → clé privée non exportable         la phrase de passe (PBKDF2)
 *   • Clé publique du gestionnaire    • DÉCHIFFRE les événements
 *     → CHIFFRE chaque événement
 *     → ne peut PAS les relire
 *
 * Conséquences directes, vérifiables :
 *   1. Un capteur volé ne livre pas l'historique : il n'a jamais eu la
 *      clé de déchiffrement.
 *   2. Nul ne peut forger une alerte sans la clé privée du capteur,
 *      qui est générée non exportable et ne quitte jamais l'appareil.
 *   3. L'intégrité de la chaîne se vérifie SANS déchiffrer : un auditeur
 *      peut prouver la non-altération sans accéder au contenu.
 *
 * Aucune bibliothèque tierce : tout repose sur crypto.subtle, présent
 * nativement dans les navigateurs (contexte sécurisé requis : HTTPS
 * ou localhost).
 */

const ECDSA_KEYGEN = { name: "ECDSA", namedCurve: "P-256" };
const ECDSA_SIGN = { name: "ECDSA", hash: "SHA-256" };
const ECDH_KEYGEN = { name: "ECDH", namedCurve: "P-256" };
const AES_PARAMS = { name: "AES-GCM", length: 256 };

/**
 * OWASP recommande au moins 310 000 itérations pour PBKDF2-HMAC-SHA256.
 * C'est ce qui rend une attaque hors ligne par force brute coûteuse si
 * quelqu'un s'empare de l'appareil.
 */
const PBKDF2_ITERATIONS = 310_000;

// ─── Utilitaires d'encodage ──────────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Empreinte SHA-256 d'une chaîne, en hexadécimal. */
export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return toHex(digest);
}

/** Empreinte SHA-256 d'un binaire (utilisée pour les images). */
export async function sha256HexOfBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

export function isCryptoAvailable() {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

// ─── Identité du capteur : signature ─────────────────────────────────────────

/**
 * Génère la paire de signature du capteur.
 * La clé privée est créée NON EXPORTABLE : même le code JavaScript de
 * l'application ne peut pas la lire ni l'exfiltrer.
 */
export async function generateSensorKeyPair() {
  return crypto.subtle.generateKey(ECDSA_KEYGEN, false, ["sign", "verify"]);
}

export async function exportPublicKey(publicKey) {
  return toBase64(await crypto.subtle.exportKey("raw", publicKey));
}

export async function importSignaturePublicKey(base64) {
  return crypto.subtle.importKey("raw", fromBase64(base64), ECDSA_KEYGEN, true, ["verify"]);
}

/**
 * Empreinte courte et lisible d'une clé publique déjà exportée en base64.
 *
 * C'est cette valeur que deux personnes comparent de vive voix pour
 * s'assurer qu'elles parlent bien de la même clé — le seul moyen, sans
 * autorité de certification, d'ancrer la confiance sur autre chose que
 * ce que le fichier prétend être.
 */
export async function fingerprintPublicKeyB64(base64, prefix) {
  const digest = await crypto.subtle.digest("SHA-256", fromBase64(base64));
  return `${prefix}-` + toHex(digest).slice(0, 6).toUpperCase();
}

/** Identifiant court et stable du capteur, dérivé de sa clé publique. */
export async function deriveSensorId(publicKey) {
  return fingerprintPublicKeyB64(await exportPublicKey(publicKey), "AGS");
}

export async function signText(privateKey, text) {
  const signature = await crypto.subtle.sign(ECDSA_SIGN, privateKey, encoder.encode(text));
  return toBase64(signature);
}

export async function verifyText(publicKey, text, signatureB64) {
  try {
    return await crypto.subtle.verify(
      ECDSA_SIGN, publicKey, fromBase64(signatureB64), encoder.encode(text));
  } catch {
    return false;
  }
}

// ─── Identité du gestionnaire : chiffrement ──────────────────────────────────

export async function generateManagerKeyPair() {
  // extractable = true : la clé privée doit pouvoir être emballée
  // (wrapKey) par la phrase de passe avant d'être stockée.
  return crypto.subtle.generateKey(ECDH_KEYGEN, true, ["deriveKey", "deriveBits"]);
}

export async function importManagerPublicKey(base64) {
  return crypto.subtle.importKey("raw", fromBase64(base64), ECDH_KEYGEN, true, []);
}

/** Dérive une clé d'emballage AES-GCM à partir de la phrase de passe. */
export async function deriveKeyFromPassphrase(passphrase, saltBytes) {
  const material = await crypto.subtle.importKey(
    "raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    AES_PARAMS,
    false,
    ["wrapKey", "unwrapKey"]
  );
}

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Emballe la clé privée du gestionnaire. Seule la version chiffrée est
 * stockée : la phrase de passe n'est écrite nulle part, ni en clair ni
 * hachée. Une phrase de passe erronée ne « refuse » pas l'accès — elle
 * produit simplement des octets inexploitables.
 */
export async function wrapManagerPrivateKey(privateKey, wrappingKey) {
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey(
    "pkcs8", privateKey, wrappingKey, { name: "AES-GCM", iv });
  return { iv: toBase64(iv), key: toBase64(wrapped) };
}

export async function unwrapManagerPrivateKey(wrapped, wrappingKey) {
  return crypto.subtle.unwrapKey(
    "pkcs8",
    fromBase64(wrapped.key),
    wrappingKey,
    { name: "AES-GCM", iv: fromBase64(wrapped.iv) },
    ECDH_KEYGEN,
    false,
    ["deriveKey"]
  );
}

// ─── Enveloppe : le capteur chiffre vers le gestionnaire ─────────────────────

/**
 * Chiffre une charge utile à destination du gestionnaire (schéma ECIES).
 *
 * Une paire ECDH éphémère est générée pour CHAQUE événement : deux
 * événements identiques produisent des chiffrés différents, et la
 * compromission d'un événement n'expose pas les autres.
 *
 * @returns {{epk: string, iv: string, ct: string}}
 */
export async function sealForManager(managerPublicKey, payloadObject) {
  const ephemeral = await crypto.subtle.generateKey(ECDH_KEYGEN, true, ["deriveKey"]);

  const sharedKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: managerPublicKey },
    ephemeral.privateKey,
    AES_PARAMS,
    false,
    ["encrypt"]
  );

  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    encoder.encode(JSON.stringify(payloadObject))
  );

  return {
    epk: await exportPublicKey(ephemeral.publicKey),
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
  };
}

/** Déchiffre une enveloppe avec la clé privée du gestionnaire. */
export async function openAsManager(managerPrivateKey, sealed) {
  const ephemeralPublic = await importManagerPublicKey(sealed.epk);

  const sharedKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: ephemeralPublic },
    managerPrivateKey,
    AES_PARAMS,
    false,
    ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv) },
    sharedKey,
    fromBase64(sealed.ct)
  );

  return JSON.parse(decoder.decode(plaintext));
}
