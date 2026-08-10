/**
 * AgroSentinel AI - Vue "Diagnostic Assisté"
 *
 * Parcours en 3 étapes :
 *   1. L'agriculteur déclare sa culture (plus rapide et plus fiable qu'une
 *      reconnaissance automatique, et fonctionne hors connexion).
 *   2. Photo optionnelle → contrôle de cadrage par MobileNet.
 *   3. L'agriculteur confirme le symptôme observé → fiche agronomique.
 */

import { CROPS, getDiseasesForCrop, DISEASE_DATABASE } from '../config.js';
import { checkImageQuality, isClassifierReady } from '../models/leafClassifier.js';
import { addLogItem } from '../utils/telemetry.js';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, none: 3 };

let selectedCropKey = null;
let selectedDiseaseKey = null;

export function initDiagnosticView() {
  buildCropSelector();

  document.getElementById("file-input")
    ?.addEventListener("change", handleFileSelect);

  document.getElementById("btn-reset-diag")
    ?.addEventListener("click", resetDiagnostic);

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

// ─── Étape 2 : photo optionnelle & contrôle de cadrage ───────────────────────

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => displayPreview(e.target.result);
  reader.onerror = () => {
    addLogItem("danger", "Impossible de lire le fichier image sélectionné.");
  };
  reader.readAsDataURL(file);
}

function displayPreview(src) {
  const prompt = document.getElementById("drop-zone-prompt");
  const img = document.getElementById("preview-image");

  img.src = src;
  img.classList.remove("hidden");
  prompt.classList.add("hidden");

  img.decode()
    .then(() => runQualityCheck(img))
    .catch(() => showQualityStatus("error", "Image illisible",
      "Le fichier n'a pas pu être décodé. Essayez un autre format (JPG, PNG)."));
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
  addLogItem("info", `Diagnostic retenu : ${disease.name}.`);
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

  document.querySelectorAll(".crop-chip").forEach(c => c.classList.remove("active"));

  const symptomList = document.getElementById("symptom-list");
  if (symptomList) {
    symptomList.innerHTML =
      `<p class="symptom-placeholder">Choisissez d'abord une culture à l'étape 1.</p>`;
  }

  const img = document.getElementById("preview-image");
  const fileInput = document.getElementById("file-input");
  img.src = "";
  img.classList.add("hidden");
  fileInput.value = "";
  document.getElementById("drop-zone-prompt").classList.remove("hidden");
  document.getElementById("quality-check").className = "quality-check hidden";

  hideResult();
  updateStepBadge();
}

function updateStepBadge() {
  const badge = document.getElementById("diag-step-badge");
  if (!badge) return;

  const step = selectedDiseaseKey ? 3 : (selectedCropKey ? 2 : 1);
  badge.textContent = `Étape ${step} / 3`;
}
