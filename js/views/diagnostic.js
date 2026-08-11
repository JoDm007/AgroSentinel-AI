/**
 * AgroSentinel AI - Vue "Diagnostic Assisté"
 *
 * Parcours en 3 étapes :
 *   1. L'agriculteur déclare sa culture (plus rapide et plus fiable qu'une
 *      reconnaissance automatique, et fonctionne hors connexion).
 *   2. Il pointe la caméra sur une feuille (ou charge une photo). Le contrôle
 *      de cadrage tourne en direct sur le flux vidéo.
 *   3. Il confirme le symptôme observé → fiche agronomique.
 *
 * ⚠️ L'analyse temps réel porte sur le CADRAGE, pas sur la maladie : voir
 * l'avertissement en tête de js/models/leafClassifier.js.
 */

import { CROPS, getDiseasesForCrop, DISEASE_DATABASE } from '../config.js';
import { checkImageQuality, isClassifierReady } from '../models/leafClassifier.js';
import { addLogItem } from '../utils/telemetry.js';
import { appendEvent } from '../security/journal.js';
import { sha256Hex } from '../security/crypto.js';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, none: 3 };

/** Intervalle entre deux analyses du flux vidéo (ms). */
const SCAN_INTERVAL_MS = 700;

let selectedCropKey = null;
let selectedDiseaseKey = null;

let leafStream = null;
let scanTimer = null;
let lastScanWasPlant = false;

/** Empreinte de la dernière photo analysée (l'image elle-même ne sort pas). */
let lastCaptureHash = null;

export function initDiagnosticView() {
  buildCropSelector();

  document.getElementById("file-input")
    ?.addEventListener("change", handleFileSelect);
  document.getElementById("btn-reset-diag")
    ?.addEventListener("click", resetDiagnostic);
  document.getElementById("btn-retake")
    ?.addEventListener("click", clearCapture);

  document.getElementById("btn-start-leaf-cam")
    ?.addEventListener("click", startLeafCamera);
  document.getElementById("btn-stop-leaf-cam")
    ?.addEventListener("click", () => stopLeafCamera());
  document.getElementById("btn-capture")
    ?.addEventListener("click", captureFrame);

  document.querySelectorAll("#capture-modes .mode-btn").forEach(btn => {
    btn.addEventListener("click", () => setCaptureMode(btn.dataset.mode));
  });

  updateStepBadge();
}

// ─── Étape 1 : sélection de la culture ───────────────────────────────────────

function buildCropSelector() {
  const container = document.getElementById("crop-selector");
  if (!container) return;

  container.innerHTML = "";

  Object.entries(CROPS).forEach(([cropKey, crop]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "crop-chip";
    button.dataset.cropKey = cropKey;
    button.innerHTML = `
      <span class="crop-emoji">${crop.emoji}</span>
      <span class="crop-label">${crop.label}</span>
    `;
    button.addEventListener("click", () => selectCrop(cropKey));
    container.appendChild(button);
  });
}

function selectCrop(cropKey) {
  selectedCropKey = cropKey;
  selectedDiseaseKey = null;

  document.querySelectorAll(".crop-chip").forEach(chip => {
    chip.classList.toggle("active", chip.dataset.cropKey === cropKey);
  });

  buildSymptomList(cropKey);
  hideResult();
  updateStepBadge();

  addLogItem("info", `Culture sélectionnée : ${CROPS[cropKey].label}.`);
}

// ─── Étape 2a : caméra en direct ─────────────────────────────────────────────

function setCaptureMode(mode) {
  document.querySelectorAll("#capture-modes .mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  const cameraPane = document.getElementById("capture-camera");
  const filePane = document.getElementById("capture-file");

  if (mode === "camera") {
    cameraPane.classList.remove("hidden");
    filePane.classList.add("hidden");
  } else {
    stopLeafCamera({ silent: true });
    cameraPane.classList.add("hidden");
    filePane.classList.remove("hidden");
  }
}

async function startLeafCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    // Cas typique : page servie en http:// depuis un smartphone.
    showQualityStatus("error", "Caméra inaccessible", window.isSecureContext
      ? "Ce navigateur n'expose pas l'API caméra."
      : "La page doit être servie en HTTPS (ou depuis localhost) pour accéder à la caméra.");
    return;
  }

  try {
    leafStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

    const video = document.getElementById("leaf-video");
    video.srcObject = leafStream;
    await video.play();

    document.getElementById("camera-placeholder").classList.add("hidden");
    document.getElementById("leaf-video-wrapper").classList.remove("hidden");
    document.getElementById("capture-actions").classList.remove("hidden");
    document.getElementById("capture-result").classList.add("hidden");
    document.getElementById("quality-check").className = "quality-check hidden";

    startLiveScan();
    addLogItem("info", "Caméra d'analyse foliaire activée.");
  } catch (err) {
    console.warn("Caméra foliaire indisponible :", err);
    showQualityStatus("error", "Caméra indisponible",
      err?.name === "NotAllowedError"
        ? "Accès refusé. Autorisez la caméra, ou utilisez le mode Fichier."
        : "Aucune caméra détectée. Utilisez le mode Fichier.");
  }
}

export function stopLeafCamera({ silent = false } = {}) {
  stopLiveScan();

  if (leafStream) {
    leafStream.getTracks().forEach(track => track.stop());
    leafStream = null;
    if (!silent) addLogItem("info", "Caméra d'analyse foliaire arrêtée.");
  }

  const video = document.getElementById("leaf-video");
  if (video) video.srcObject = null;

  document.getElementById("leaf-video-wrapper")?.classList.add("hidden");
  document.getElementById("capture-actions")?.classList.add("hidden");

  // On ne réaffiche l'invite que si aucune capture n'est en cours d'examen.
  const hasCapture = !document.getElementById("capture-result")?.classList.contains("hidden");
  if (!hasCapture) {
    document.getElementById("camera-placeholder")?.classList.remove("hidden");
  }
}

/** Analyse le flux en continu pour guider le cadrage de l'agriculteur. */
function startLiveScan() {
  stopLiveScan();

  scanTimer = setInterval(async () => {
    const video = document.getElementById("leaf-video");
    if (!leafStream || !video || video.readyState < 2) return;

    if (!isClassifierReady()) {
      setScanState("pending", "Chargement du modèle…");
      return;
    }

    try {
      const result = await checkImageQuality(video);
      lastScanWasPlant = result.isPlantLike;

      if (result.isPlantLike) {
        setScanState("ok", `Feuille détectée — ${shorten(result.matchedLabel)}`);
      } else {
        setScanState("warn", `Aucun végétal — ${shorten(result.topLabel)}`);
      }
    } catch {
      setScanState("pending", "Analyse…");
    }

    // Le bouton s'illumine quand le cadrage est bon : l'agriculteur sait
    // à quel moment déclencher sans avoir à interpréter le texte.
    document.getElementById("btn-capture")?.classList.toggle("ready", lastScanWasPlant);
  }, SCAN_INTERVAL_MS);
}

function stopLiveScan() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
  lastScanWasPlant = false;
  document.getElementById("btn-capture")?.classList.remove("ready");
}

function setScanState(state, label) {
  const hud = document.getElementById("scan-hud");
  const icon = document.getElementById("scan-icon");
  const text = document.getElementById("scan-text");
  if (!hud) return;

  const icons = {
    ok: "fa-solid fa-circle-check",
    warn: "fa-solid fa-triangle-exclamation",
    pending: "fa-solid fa-spinner fa-spin",
  };

  hud.className = `scan-hud ${state}`;
  if (icon) icon.className = icons[state] ?? icons.pending;
  if (text) text.textContent = label;
}

/** Le libellé ImageNet est verbeux : on n'en garde que le premier terme. */
function shorten(label) {
  if (!label) return "inconnu";
  return label.split(",")[0].trim();
}

/** Fige l'image courante du flux et la soumet à l'analyse. */
async function captureFrame() {
  const video = document.getElementById("leaf-video");
  if (!video || video.readyState < 2 || video.videoWidth === 0) return;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  stopLeafCamera({ silent: true });
  document.getElementById("camera-placeholder")?.classList.add("hidden");

  await displayCapture(dataUrl);
  addLogItem("info", "Image de feuille capturée depuis la caméra.");
}

// ─── Étape 2b : chargement d'un fichier ──────────────────────────────────────

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => displayCapture(e.target.result);
  reader.onerror = () => {
    addLogItem("danger", "Impossible de lire le fichier image sélectionné.");
  };
  reader.readAsDataURL(file);
}

// ─── Analyse d'une image figée ───────────────────────────────────────────────

async function displayCapture(src) {
  const img = document.getElementById("preview-image");
  const result = document.getElementById("capture-result");

  img.src = src;
  result.classList.remove("hidden");
  document.getElementById("drop-zone-prompt")?.classList.add("hidden");

  // Empreinte de la photo : elle seule entrera dans le journal sécurisé.
  lastCaptureHash = "sha256:" + (await sha256Hex(src));

  try {
    await img.decode();
    await runQualityCheck(img);
  } catch {
    showQualityStatus("error", "Image illisible",
      "Le fichier n'a pas pu être décodé. Essayez un autre format (JPG, PNG).");
  }

  // On amène l'agriculteur directement à l'étape suivante.
  document.getElementById("symptom-list")?.scrollIntoView({
    behavior: "smooth", block: "center",
  });
}

function clearCapture() {
  const img = document.getElementById("preview-image");
  const fileInput = document.getElementById("file-input");

  img.src = "";
  if (fileInput) fileInput.value = "";

  document.getElementById("capture-result")?.classList.add("hidden");
  document.getElementById("drop-zone-prompt")?.classList.remove("hidden");
  document.getElementById("quality-check").className = "quality-check hidden";

  const cameraActive = !document.getElementById("capture-camera")?.classList.contains("hidden");
  if (cameraActive) document.getElementById("camera-placeholder")?.classList.remove("hidden");
}

async function runQualityCheck(imageElement) {
  if (!isClassifierReady()) {
    showQualityStatus("warn", "Contrôle indisponible",
      "Le modèle de contrôle n'est pas encore chargé. Le diagnostic guidé reste utilisable.");
    return;
  }

  showQualityStatus("checking", "Analyse du cadrage…", "");

  try {
    const result = await checkImageQuality(imageElement);
    const percent = Math.round(result.topProbability * 100);

    if (result.isPlantLike) {
      showQualityStatus(
        "ok",
        "Contexte végétal détecté",
        `Label ImageNet le plus probable : « ${result.topLabel} » (${percent} %).`
      );
    } else {
      showQualityStatus(
        "warn",
        "Aucun élément végétal clairement identifié",
        `Label ImageNet le plus probable : « ${result.topLabel} » (${percent} %). Rapprochez-vous de la feuille et photographiez en pleine lumière.`
      );
    }
  } catch (err) {
    console.error("Contrôle de cadrage échoué :", err);
    showQualityStatus("error", "Contrôle impossible",
      "L'analyse de l'image a échoué. Le diagnostic guidé reste utilisable.");
  }
}

function showQualityStatus(state, title, detail) {
  const box = document.getElementById("quality-check");
  const icon = document.getElementById("quality-icon");
  if (!box) return;

  const icons = {
    checking: "fa-solid fa-spinner fa-spin",
    ok: "fa-solid fa-circle-check",
    warn: "fa-solid fa-triangle-exclamation",
    error: "fa-solid fa-circle-xmark",
  };

  box.className = `quality-check ${state}`;
  icon.className = icons[state] ?? icons.warn;
  // textContent : le label provient du modèle, jamais injecté en HTML.
  document.getElementById("quality-title").textContent = title;
  document.getElementById("quality-detail").textContent = detail;
}

// ─── Étape 3 : confirmation du symptôme ──────────────────────────────────────

function buildSymptomList(cropKey) {
  const container = document.getElementById("symptom-list");
  if (!container) return;

  const diseases = getDiseasesForCrop(cropKey)
    .sort((a, b) => SEVERITY_ORDER[a.severityLevel] - SEVERITY_ORDER[b.severityLevel]);

  container.innerHTML = "";

  diseases.forEach(disease => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "symptom-card";
    card.dataset.diseaseKey = disease.key;
    card.innerHTML = `
      <span class="symptom-icon">${disease.symptomIcon}</span>
      <span class="symptom-text">
        <span class="symptom-line">${disease.symptom}</span>
        <span class="symptom-disease">${disease.name}</span>
      </span>
      <span class="severity-pill ${disease.severityLevel}">${disease.severity}</span>
    `;
    card.addEventListener("click", () => selectDisease(disease.key));
    container.appendChild(card);
  });
}

function selectDisease(diseaseKey) {
  const disease = DISEASE_DATABASE[diseaseKey];
  if (!disease) {
    console.error(`Maladie inconnue dans la base : ${diseaseKey}`);
    return;
  }

  selectedDiseaseKey = diseaseKey;

  document.querySelectorAll(".symptom-card").forEach(card => {
    card.classList.toggle("active", card.dataset.diseaseKey === diseaseKey);
  });

  renderDiagnostic(disease);
  updateStepBadge();
  addLogItem(disease.severityLevel === "none" ? "info" : "warning",
    `Diagnostic retenu : ${disease.name}.`);

  // Consigné dans le journal sécurisé : signé, chaîné et chiffré vers le
  // gestionnaire. Sert de preuve horodatée auprès d'un technicien agricole.
  appendEvent({
    kind: "diagnostic",
    crop: selectedCropKey,
    cropLabel: selectedCropKey ? CROPS[selectedCropKey].label : disease.crop,
    disease: diseaseKey,
    diseaseName: disease.name,
    severity: disease.severityLevel,
    imageHash: lastCaptureHash,
    method: "parcours-guide",
  }).catch(err => console.warn("Journalisation du diagnostic impossible :", err));

  document.getElementById("diagnostic-result")?.scrollIntoView({
    behavior: "smooth", block: "nearest",
  });
}

// ─── Rendu de la fiche agronomique ───────────────────────────────────────────

function renderDiagnostic(disease) {
  const result = document.getElementById("diagnostic-result");
  const emptyState = document.getElementById("diagnostic-empty");

  const header = document.getElementById("diagnosis-header-card");
  header.className = `diagnosis-header-card severity-${disease.severityLevel}`;

  document.getElementById("disease-name").textContent = disease.name;
  document.getElementById("disease-crop").textContent =
    selectedCropKey ? `Culture : ${CROPS[selectedCropKey].label}` : disease.crop;

  const severityBadge = document.getElementById("disease-severity");
  severityBadge.className = `severity-badge ${disease.severityLevel}`;
  severityBadge.textContent = `Sévérité : ${disease.severity}`;

  document.getElementById("treatment-description").textContent = disease.description;
  document.getElementById("remedy-title").textContent = disease.remedy;

  const stepsContainer = document.getElementById("action-steps");
  stepsContainer.innerHTML = "";
  disease.steps.forEach((step, index) => {
    const row = document.createElement("div");
    row.className = "action-step";
    row.innerHTML = `<span class="action-num">${index + 1}</span><span>${step}</span>`;
    stepsContainer.appendChild(row);
  });

  emptyState.classList.add("hidden");
  result.classList.remove("hidden");
}

function hideResult() {
  document.getElementById("diagnostic-result")?.classList.add("hidden");
  document.getElementById("diagnostic-empty")?.classList.remove("hidden");
}

// ─── Réinitialisation ────────────────────────────────────────────────────────

function resetDiagnostic() {
  selectedCropKey = null;
  selectedDiseaseKey = null;

  stopLeafCamera({ silent: true });

  document.querySelectorAll(".crop-chip").forEach(c => c.classList.remove("active"));

  const symptomList = document.getElementById("symptom-list");
  if (symptomList) {
    symptomList.innerHTML =
      `<p class="symptom-placeholder">Choisissez d'abord une culture à l'étape 1.</p>`;
  }

  clearCapture();
  hideResult();
  updateStepBadge();
}

function updateStepBadge() {
  const badge = document.getElementById("diag-step-badge");
  if (!badge) return;

  const step = selectedDiseaseKey ? 3 : (selectedCropKey ? 2 : 1);
  badge.textContent = `Étape ${step} / 3`;
}
