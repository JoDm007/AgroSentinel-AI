/**
 * AgroSentinel AI - Vue "Journal sécurisé & destinataire" (côté capteur)
 *
 * Rend visible, depuis la page principale, ce qui constitue le cœur du
 * projet : vers qui le capteur chiffre, et combien d'événements sont
 * réellement signés. Sans cette vue, la couche cryptographique n'existait
 * qu'une page plus loin, dans la console du gestionnaire.
 *
 * C'est aussi ici que se fait l'APPAIRAGE : coller la clé publique d'un
 * gestionnaire distant fait basculer le capteur dans le vrai modèle de
 * menace — il chiffre alors vers quelqu'un qu'il ne peut pas relire, et un
 * appareil volé ne livre plus rien.
 */

import {
  getRecipient, setRecipientPublicKey, clearRecipient,
  countEvents, countPendingEvents, ensureSensorIdentity,
} from '../security/journal.js';
import { isCryptoAvailable } from '../security/crypto.js';
import { addLogItem } from '../utils/telemetry.js';

let sensorId = "…";

export async function initSecurityView() {
  if (!isCryptoAvailable()) {
    // Contexte non sécurisé : rien ne peut être signé ni chiffré. Le dire
    // franchement vaut mieux qu'un journal qui reste vide sans explication.
    setJournalBadge("unavailable", "Journal indisponible");
    showRecipient("error", "Web Crypto indisponible",
      "La page doit être servie en HTTPS (ou depuis localhost). Aucun événement ne peut être signé.");
    document.getElementById("btn-pair")?.setAttribute("disabled", "");
    return;
  }

  document.getElementById("btn-pair")?.addEventListener("click", onPair);
  document.getElementById("btn-unpair")?.addEventListener("click", onUnpair);

  // Le journal se remplit depuis la détection et le diagnostic : on écoute
  // plutôt que de sonder périodiquement.
  window.addEventListener("journal:changed", refreshSecurityView);

  try {
    sensorId = (await ensureSensorIdentity()).sensorId;
    const idEl = document.getElementById("sensor-id-sensorview");
    if (idEl) idEl.textContent = sensorId;
  } catch (err) {
    // IndexedDB refusé (navigation privée, quota, autre onglet ouvert) :
    // le dire, plutôt que de laisser le panneau tourner indéfiniment.
    setJournalBadge("unavailable", "Journal indisponible");
    showRecipient("error", "Stockage sécurisé inaccessible", err.message);
    return;
  }

  await refreshSecurityView();
}

// ─── État courant ────────────────────────────────────────────────────────────

async function refreshSecurityView() {
  try {
    await renderSecurityState();
  } catch (err) {
    console.warn("Lecture de l'état du journal impossible :", err);
    setJournalBadge("unavailable", "Journal indisponible");
    showRecipient("error", "Stockage sécurisé inaccessible", err.message);
  }
}

async function renderSecurityState() {
  const [recipient, signed, pending] = await Promise.all([
    getRecipient(),
    countEvents(),
    countPendingEvents(),
  ]);

  const countBadge = document.getElementById("journal-count-badge");
  if (countBadge) {
    countBadge.textContent = `${signed} signé${signed > 1 ? "s" : ""}`;
  }

  if (!recipient) {
    setJournalBadge("pending", pending ? `${pending} en attente` : "Aucun destinataire");
    showRecipient("warn", "Aucun destinataire configuré",
      pending
        ? `${pending} événement${pending > 1 ? "s" : ""} en file d'attente. Ils seront signés et chiffrés `
          + `dès qu'un gestionnaire sera connu — appairez-en un ci-dessous, ou créez la console `
          + `gestionnaire sur cet appareil.`
        : "Aucun événement ne sera chiffré tant qu'aucun gestionnaire n'est connu. "
          + "Appairez-en un ci-dessous, ou créez la console gestionnaire sur cet appareil.");
    toggleUnpair(false);
    return;
  }

  setJournalBadge("ready", `${signed} signé${signed > 1 ? "s" : ""}`);
  toggleUnpair(recipient.source === "imported");

  if (recipient.source === "imported") {
    showRecipient("ok", `Chiffré vers le gestionnaire ${recipient.fingerprint}`,
      `Capteur ${sensorId}. Ce capteur ne peut pas relire ce qu'il écrit : `
      + `la clé de déchiffrement est sur l'appareil du gestionnaire. `
      + `Vérifiez que l'empreinte ${recipient.fingerprint} est bien celle qu'il vous a annoncée.`);
  } else {
    showRecipient("warn", `Gestionnaire local ${recipient.fingerprint}`,
      `Capteur ${sensorId}. Les deux rôles cohabitent sur cet appareil : pratique pour la `
      + `démonstration, mais le journal chiffré et la clé privée emballée y sont réunis. `
      + `Appairez un gestionnaire distant pour la configuration réelle.`);
  }
}

// ─── Appairage ───────────────────────────────────────────────────────────────

async function onPair() {
  const input = document.getElementById("recipient-input");
  const value = input?.value ?? "";

  if (!value.trim()) {
    showPairing("warn", "Aucune clé saisie",
      "Collez la clé publique affichée par la console du gestionnaire.");
    return;
  }

  try {
    const fingerprint = await setRecipientPublicKey(value);
    input.value = "";
    showPairing("ok", `Appairé au gestionnaire ${fingerprint}`,
      "Les événements en attente viennent d'être signés et chiffrés pour lui. "
      + "Les événements antérieurs restent chiffrés pour le destinataire précédent : "
      + "ils ne peuvent pas être rechiffrés sans être lus, ce que le capteur n'a pas le droit de faire.");
    addLogItem("info", `Journal appairé au gestionnaire ${fingerprint}.`);
    await refreshSecurityView();
  } catch (err) {
    showPairing("error", "Appairage refusé", err.message);
  }
}

async function onUnpair() {
  await clearRecipient();
  showPairing("warn", "Retour au gestionnaire local",
    "Les nouveaux événements seront chiffrés vers la console de cet appareil. "
    + "Ceux déjà écrits restent destinés au gestionnaire distant.");
  addLogItem("warning", "Appairage distant retiré.");
  await refreshSecurityView();
}

// ─── Rendu ───────────────────────────────────────────────────────────────────

const STATE_ICONS = {
  ok: "fa-solid fa-circle-check",
  warn: "fa-solid fa-triangle-exclamation",
  error: "fa-solid fa-circle-xmark",
};

function showRecipient(state, title, detail) {
  const box = document.getElementById("recipient-state");
  if (!box) return;

  box.className = `quality-check ${state}`;
  document.getElementById("recipient-icon").className = STATE_ICONS[state] ?? STATE_ICONS.warn;
  document.getElementById("recipient-title").textContent = title;
  document.getElementById("recipient-detail").textContent = detail;
}

function showPairing(state, title, detail) {
  const box = document.getElementById("pairing-result");
  if (!box) return;

  box.className = `quality-check ${state}`;
  document.getElementById("pairing-icon").className = STATE_ICONS[state] ?? STATE_ICONS.warn;
  document.getElementById("pairing-title").textContent = title;
  document.getElementById("pairing-detail").textContent = detail;
}

function toggleUnpair(visible) {
  document.getElementById("btn-unpair")?.classList.toggle("hidden", !visible);
}

/** Badge de la barre supérieure : le journal doit être visible sans scroller. */
function setJournalBadge(state, label) {
  const badge = document.getElementById("journal-status");
  const icon = document.getElementById("journal-icon");
  const text = document.getElementById("journal-text");
  if (!badge) return;

  const icons = {
    ready: "fa-solid fa-file-shield",
    pending: "fa-solid fa-clock-rotate-left",
    unavailable: "fa-solid fa-circle-minus",
  };

  badge.className = `status-badge offline-${state}`;
  if (icon) icon.className = icons[state] ?? icons.pending;
  if (text) text.textContent = label;
}
