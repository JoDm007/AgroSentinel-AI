/**
 * AgroSentinel AI - Tableau de bord Gestionnaire
 *
 * Rôle distinct de celui du capteur : le gestionnaire est le seul à
 * détenir la clé de déchiffrement. Le capteur écrit, il ne relit pas.
 *
 * Tout se passe hors ligne : aucun serveur n'authentifie, ne stocke ni ne
 * valide quoi que ce soit. La confiance repose entièrement sur la
 * cryptographie vérifiable côté client.
 */

import {
  ensureSensorIdentity, isManagerConfigured, setupManager, unlockManager,
  listEvents, verifyChain, decryptEvent, exportBundle, verifyBundle,
  tamperWithEvent, getManagerIdentity,
} from '../security/journal.js';
import { importSignaturePublicKey, isCryptoAvailable } from '../security/crypto.js';
import { registerServiceWorker } from '../utils/pwa.js';

let sensorRecord = null;
let managerPrivateKey = null;
let sensorPublicKey = null;

document.addEventListener("DOMContentLoaded", async () => {
  registerServiceWorker();

  if (!isCryptoAvailable()) {
    showAuthError("Web Crypto indisponible : la page doit être servie en HTTPS ou depuis localhost.");
    document.getElementById("btn-auth").disabled = true;
    return;
  }

  sensorRecord = await ensureSensorIdentity();
  sensorPublicKey = await importSignaturePublicKey(sensorRecord.publicKeyB64);
  document.getElementById("sensor-id").textContent = sensorRecord.sensorId;

  const configured = await isManagerConfigured();
  setAuthMode(configured ? "unlock" : "setup");

  document.getElementById("auth-form").addEventListener("submit", onAuthSubmit);
  document.getElementById("btn-verify").addEventListener("click", refreshConsole);
  document.getElementById("btn-export").addEventListener("click", onExport);
  document.getElementById("btn-tamper").addEventListener("click", onTamper);
  document.getElementById("bundle-input").addEventListener("change", onAuditBundle);
  document.getElementById("btn-copy-key").addEventListener("click", onCopyPublicKey);
});

// ─── Écran d'accès ───────────────────────────────────────────────────────────

let authMode = "unlock";

function setAuthMode(mode) {
  authMode = mode;
  const isSetup = mode === "setup";

  document.getElementById("auth-title").textContent =
    isSetup ? "Première configuration" : "Accès gestionnaire";
  document.getElementById("auth-lead").textContent = isSetup
    ? "Choisissez la phrase de passe qui protégera le journal de votre exploitation."
    : "Saisissez votre phrase de passe pour déchiffrer le journal.";
  document.getElementById("btn-auth-label").textContent =
    isSetup ? "Créer l'accès sécurisé" : "Déverrouiller";
  document.getElementById("confirm-field").classList.toggle("hidden", !isSetup);
  document.getElementById("passphrase").setAttribute(
    "autocomplete", isSetup ? "new-password" : "current-password");
}

async function onAuthSubmit(event) {
  event.preventDefault();
  hideAuthError();

  const button = document.getElementById("btn-auth");
  const passphrase = document.getElementById("passphrase").value;

  if (passphrase.length < 8) {
    showAuthError("La phrase de passe doit faire au moins 8 caractères.");
    return;
  }

  if (authMode === "setup") {
    const confirmation = document.getElementById("passphrase-confirm").value;
    if (passphrase !== confirmation) {
      showAuthError("Les deux saisies ne correspondent pas.");
      return;
    }
  }

  // 310 000 itérations PBKDF2 : volontairement lent, c'est la protection
  // contre une attaque hors ligne si l'appareil est volé.
  button.disabled = true;
  button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Dérivation de la clé…`;

  try {
    if (authMode === "setup") await setupManager(passphrase);

    managerPrivateKey = await unlockManager(passphrase);

    if (!managerPrivateKey) {
      showAuthError("Phrase de passe incorrecte. Le journal reste chiffré.");
      return;
    }

    document.getElementById("passphrase").value = "";
    document.getElementById("passphrase-confirm").value = "";
    openConsole();
  } catch (err) {
    console.error(err);
    showAuthError("Échec du déverrouillage : " + err.message);
  } finally {
    button.disabled = false;
    button.innerHTML =
      `<i class="fa-solid fa-unlock"></i> <span id="btn-auth-label">Déverrouiller</span>`;
    setAuthMode(authMode);
  }
}

function showAuthError(message) {
  document.getElementById("auth-error-text").textContent = message;
  document.getElementById("auth-error").classList.remove("hidden");
}

function hideAuthError() {
  document.getElementById("auth-error").classList.add("hidden");
}

// ─── Console ─────────────────────────────────────────────────────────────────

async function openConsole() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("console-screen").classList.remove("hidden");

  document.getElementById("session-icon").className = "fa-solid fa-lock-open";
  document.getElementById("session-text").textContent = "Session déverrouillée";
  document.getElementById("session-badge").classList.add("offline-ready");

  await showPairingKey();
  refreshConsole();
}

// ─── Appairage : publication de la clé publique ──────────────────────────────

/**
 * La clé PUBLIQUE seule est affichée. Elle ne permet que de chiffrer VERS
 * cette console : la diffuser est sans risque, c'est même le principe.
 */
async function showPairingKey() {
  const identity = await getManagerIdentity();
  if (!identity) return;

  document.getElementById("manager-pubkey").value = identity.publicKeyB64;
  document.getElementById("manager-fingerprint").textContent = identity.fingerprint;
}

async function onCopyPublicKey() {
  const field = document.getElementById("manager-pubkey");
  const button = document.getElementById("btn-copy-key");

  try {
    await navigator.clipboard.writeText(field.value);
  } catch {
    // Le presse-papiers est refusé hors contexte sécurisé (et sur certains
    // navigateurs mobiles) : la sélection manuelle reste possible.
    field.select();
    return;
  }

  button.innerHTML = `<i class="fa-solid fa-check"></i> Clé copiée`;
  setTimeout(() => {
    button.innerHTML = `<i class="fa-solid fa-copy"></i> Copier la clé publique`;
  }, 2000);
}

async function refreshConsole() {
  const events = await listEvents();
  const verdicts = await verifyChain(events, sensorPublicKey);

  renderIntegrity(verdicts, events.length);
  await renderEvents(events, verdicts);
}

function renderIntegrity(verdicts, total) {
  const panel = document.getElementById("integrity-panel");
  const icon = document.getElementById("integrity-icon");
  const title = document.getElementById("integrity-title");
  const detail = document.getElementById("integrity-detail");
  const badge = document.getElementById("chain-badge");

  const broken = verdicts.filter(v => !v.ok);

  if (total === 0) {
    panel.className = "panel integrity-panel";
    icon.className = "fa-solid fa-circle-info";
    title.textContent = "Journal vide";
    detail.textContent = "Lancez une détection depuis la vue capteur pour alimenter le journal.";
    badge.textContent = "chaîne —";
    badge.className = "badge badge-pulse-green";
    return;
  }

  if (broken.length === 0) {
    panel.className = "panel integrity-panel intact";
    icon.className = "fa-solid fa-shield-halved";
    title.textContent = `Chaîne intègre — ${total} événement${total > 1 ? "s" : ""} vérifié${total > 1 ? "s" : ""}`;
    detail.textContent = "Toutes les signatures sont valides et le chaînage est continu.";
    badge.textContent = "chaîne intègre";
    badge.className = "badge chain-ok";
  } else {
    panel.className = "panel integrity-panel broken";
    icon.className = "fa-solid fa-triangle-exclamation";
    title.textContent = `Altération détectée — ${broken.length} événement${broken.length > 1 ? "s" : ""} compromis`;
    detail.textContent = `Première anomalie au n°${broken[0].seq} : ${broken[0].problems.join(", ")}.`;
    badge.textContent = "chaîne rompue";
    badge.className = "badge chain-broken";
  }
}

async function renderEvents(events, verdicts) {
  const container = document.getElementById("event-list");
  container.innerHTML = "";

  const stats = { total: events.length, intrusion: 0, nuisible: 0, diagnostic: 0 };

  if (!events.length) {
    container.innerHTML =
      `<p class="symptom-placeholder">Aucun événement enregistré pour le moment.</p>`;
    updateStats(stats);
    return;
  }

  // Le plus récent en tête, comme dans un journal d'exploitation.
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    const verdict = verdicts[i];
    const payload = await decryptEvent(event, managerPrivateKey);

    if (payload?.kind === "diagnostic") stats.diagnostic++;
    else if (payload?.threat === "intrusion") stats.intrusion++;
    else if (payload?.threat === "nuisible") stats.nuisible++;

    container.appendChild(buildEventRow(event, verdict, payload));
  }

  updateStats(stats);
}

function buildEventRow(event, verdict, payload) {
  const row = document.createElement("div");
  row.className = `event-row ${verdict.ok ? "ok" : "broken"}`;

  const time = new Date(event.ts).toLocaleString("fr-FR");
  const badge = verdict.ok
    ? `<span class="verif-badge ok"><i class="fa-solid fa-circle-check"></i> Vérifié</span>`
    : `<span class="verif-badge broken"><i class="fa-solid fa-circle-xmark"></i> ${verdict.problems[0]}</span>`;

  let summary;
  let icon;

  if (!payload) {
    // Deux causes distinctes, à ne pas confondre : un maillon altéré est une
    // attaque, un maillon chiffré vers un autre gestionnaire est le
    // fonctionnement normal après un appairage.
    icon = "fa-solid fa-lock";
    summary = verdict.ok
      ? "Chiffré pour un autre gestionnaire — cette console n'a pas la clé"
      : "Contenu illisible — l'événement a été altéré";
  } else if (payload.kind === "diagnostic") {
    icon = "fa-solid fa-leaf";
    summary = `Diagnostic ${payload.cropLabel} — ${payload.diseaseName}`;
  } else if (payload.threat === "intrusion") {
    icon = "fa-solid fa-user-shield";
    summary = "Intrusion humaine détectée";
  } else {
    icon = "fa-solid fa-crow";
    summary = "Nuisible détecté";
  }

  const simulated = payload?.mode === "simulation"
    ? `<span class="sim-tag">simulation</span>` : "";

  const proof = payload?.frameHash || payload?.imageHash || null;

  row.innerHTML = `
    <div class="event-head">
      <span class="event-seq">#${event.seq}</span>
      <i class="${icon} event-type-icon"></i>
      <span class="event-summary"></span>
      ${simulated}
      ${badge}
    </div>
    <div class="event-meta">
      <span><i class="fa-regular fa-clock"></i> ${time}</span>
      <span><i class="fa-solid fa-microchip"></i> ${event.sensorId}</span>
    </div>
    <div class="event-hashes">
      <code title="Empreinte de ce maillon">hash ${event.hash.slice(0, 16)}…</code>
      <code title="Empreinte du maillon précédent">prev ${event.prevHash.slice(0, 12)}…</code>
      ${proof ? `<code title="Empreinte de l'image — l'image elle-même n'a jamais quitté l'appareil">preuve ${proof.replace("sha256:", "").slice(0, 12)}…</code>` : ""}
    </div>
  `;

  // textContent : le contenu déchiffré n'est jamais injecté en HTML.
  row.querySelector(".event-summary").textContent = summary;
  return row;
}

function updateStats({ total, intrusion, nuisible, diagnostic }) {
  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-intrusions").textContent = intrusion;
  document.getElementById("stat-pests").textContent = nuisible;
  document.getElementById("stat-diagnostics").textContent = diagnostic;
}

// ─── Transmission ────────────────────────────────────────────────────────────

async function onExport() {
  const bundle = await exportBundle();

  if (!bundle.events.length) {
    alert("Le journal est vide : rien à exporter.");
    return;
  }

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `agrosentinel-${bundle.sensorId}-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function onAuditBundle(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const bundle = JSON.parse(await file.text());
    const {
      bundleIntact, results, derivedSensorId, claimedSensorId, sensorIdMatches,
    } = await verifyBundle(bundle);
    const broken = results.filter(r => !r.ok);

    if (!sensorIdMatches) {
      // L'identifiant affiché ne correspond pas à la clé qui a signé :
      // incohérence grossière, le fichier a été bricolé à la main.
      showAudit("error", "Identifiant de capteur incohérent",
        `Le lot se présente comme « ${claimedSensorId} » alors que sa clé de signature `
        + `correspond à « ${derivedSensorId} ». Ce fichier a été modifié.`);
    } else if (!bundleIntact) {
      showAudit("error", "Signature du lot invalide",
        `Le contenu ne correspond pas à la signature qui l'accompagne : le fichier a été `
        + `modifié après sa production par ${derivedSensorId}.`);
    } else if (broken.length) {
      showAudit("warn", `${broken.length} événement(s) compromis`,
        `Première anomalie au n°${broken[0].seq} : ${broken[0].problems.join(", ")}.`);
    } else {
      // Formulation volontairement précise : la vérification établit la
      // cohérence interne du lot, pas l'identité de son auteur. Sans
      // autorité de certification, seul l'auditeur peut faire ce lien.
      showAudit("ok", `Lot cohérent — capteur ${derivedSensorId}`,
        `${results.length} événement(s) : signatures valides, chaînage continu, séquence complète. `
        + `Vérifiez que ${derivedSensorId} est bien l'identifiant que ce capteur vous a communiqué : `
        + `la signature prouve l'intégrité du lot, pas l'identité de son auteur.`);
    }
  } catch (err) {
    showAudit("error", "Fichier illisible", "Ce n'est pas un lot AgroSentinel valide.");
  } finally {
    event.target.value = "";
  }
}

function showAudit(state, title, detail) {
  const box = document.getElementById("audit-result");
  const icons = {
    ok: "fa-solid fa-circle-check",
    warn: "fa-solid fa-triangle-exclamation",
    error: "fa-solid fa-circle-xmark",
  };
  box.className = `quality-check ${state}`;
  document.getElementById("audit-icon").className = icons[state];
  document.getElementById("audit-title").textContent = title;
  document.getElementById("audit-detail").textContent = detail;
}

// ─── Démonstration d'attaque ─────────────────────────────────────────────────

async function onTamper() {
  const events = await listEvents();
  if (!events.length) {
    alert("Le journal est vide : générez d'abord des événements depuis la vue capteur.");
    return;
  }

  // On vise un événement du milieu : la rupture de chaînage se propage
  // ensuite sur tous les suivants, ce qui rend la démonstration parlante.
  const target = events[Math.floor(events.length / 2)];
  await tamperWithEvent(target.seq);

  await refreshConsole();
  document.getElementById("integrity-panel").scrollIntoView({ behavior: "smooth", block: "center" });
}
