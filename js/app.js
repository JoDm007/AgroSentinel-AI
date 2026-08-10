/**
 * AgroSentinel AI - Contrôleur Principal Application (ES Module)
 */

import { loadObjectDetectorModel, startDetectionLoop, stopDetectionLoop } from './models/objectDetector.js';
import { loadLeafClassifierModel, classifyLeafImage } from './models/leafClassifier.js';
import { playScareSound } from './utils/audioSynth.js';
import { addLogItem } from './utils/telemetry.js';

let isCameraRunning = false;
let isDemoMode = false;
let webcamElement = null;
let canvasElement = null;
let selectedImageElement = null;

document.addEventListener("DOMContentLoaded", async () => {
  webcamElement = document.getElementById("webcam");
  canvasElement = document.getElementById("detection-canvas");
  selectedImageElement = document.getElementById("preview-image");

  // Expose UI Functions globally for HTML inline onclick handlers
  window.switchTab = switchTab;
  window.toggleCamera = toggleCamera;
  window.toggleDemoMode = toggleDemoMode;
  window.playScareSound = playScareSound;
  window.handleFileSelect = handleFileSelect;
  window.loadSampleImage = loadSampleImage;
  window.analyzeLeaf = analyzeLeaf;

  try {
    await tf.ready();
    const backendEl = document.getElementById("backend-type");
    if (backendEl) backendEl.textContent = tf.getBackend().toUpperCase();

    // Load AI models in parallel
    await Promise.all([
      loadObjectDetectorModel(),
      loadLeafClassifierModel()
    ]);

    const statusEl = document.getElementById("models-loaded-text");
    if (statusEl) {
      statusEl.textContent = "Prêts (COCO-SSD & MobileNet)";
      statusEl.style.color = "#34d399";
    }

    const loader = document.getElementById("loading-overlay");
    if (loader) loader.classList.add("hidden");

    addLogItem("info", "Modèles IA chargés avec succès.");
  } catch (err) {
    console.error("Erreur d'initialisation IA:", err);
    addLogItem("danger", "Échec d'initialisation des modèles TensorFlow.js.");
  }
});

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

  if (tabName === 'surveillance') {
    document.getElementById("tab-surveillance-btn").classList.add("active");
    document.getElementById("tab-surveillance").classList.add("active");
  } else {
    document.getElementById("tab-diagnostic-btn").classList.add("active");
    document.getElementById("tab-diagnostic").classList.add("active");
  }
}

async function toggleCamera() {
  const btn = document.getElementById("btn-toggle-camera");

  if (isCameraRunning) {
    stopCamera();
    btn.innerHTML = `<i class="fa-solid fa-camera"></i> Démarrer Caméra`;
    btn.classList.remove("btn-danger");
    btn.classList.add("btn-outline");
  } else {
    const success = await startCamera();
    if (success) {
      btn.innerHTML = `<i class="fa-solid fa-stop"></i> Arrêter Caméra`;
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-danger");
    }
  }
}

async function startCamera() {
  try {
    if (isDemoMode) {
      document.getElementById("demo-mode-toggle").checked = false;
      isDemoMode = false;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "environment" },
      audio: false
    });

    webcamElement.srcObject = stream;

    return new Promise((resolve) => {
      webcamElement.onloadedmetadata = () => {
        webcamElement.play();
        isCameraRunning = true;
        startDetectionLoop(webcamElement, canvasElement, () => isDemoMode);
        addLogItem("info", "Caméra en direct activée.");
        resolve(true);
      };
    });
  } catch (err) {
    console.warn("Webcam indisponible, passage au mode démo:", err);
    addLogItem("warning", "Webcam non détectée. Activation du Mode Démo.");
    document.getElementById("demo-mode-toggle").checked = true;
    toggleDemoMode();
    return false;
  }
}

function stopCamera() {
  isCameraRunning = false;
  if (webcamElement && webcamElement.srcObject) {
    webcamElement.srcObject.getTracks().forEach(track => track.stop());
    webcamElement.srcObject = null;
  }
  stopDetectionLoop();
}

function toggleDemoMode() {
  const toggle = document.getElementById("demo-mode-toggle");
  isDemoMode = toggle.checked;

  if (isDemoMode) {
    if (isCameraRunning) stopCamera();
    isCameraRunning = true;
    startDetectionLoop(webcamElement, canvasElement, () => isDemoMode);
    addLogItem("info", "Mode Démo activé (Simulation de menace).");
  } else {
    stopCamera();
    addLogItem("info", "Mode Démo désactivé.");
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      displayPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  }
}

function displayPreview(src) {
  const prompt = document.getElementById("drop-zone-prompt");
  const img = document.getElementById("preview-image");
  const btnAnalyze = document.getElementById("btn-analyze");

  img.src = src;
  img.classList.remove("hidden");
  prompt.classList.add("hidden");
  btnAnalyze.disabled = false;
}

function loadSampleImage(diseaseType) {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext("2d");

  if (diseaseType === "cassava_mosaic") {
    ctx.fillStyle = "#2d5a27";
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = "#eab308";
    for (let i = 0; i < 35; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 380 + 10, Math.random() * 280 + 10, Math.random() * 25 + 10, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (diseaseType === "blight_leaf") {
    ctx.fillStyle = "#3f6212";
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = "#78350f";
    for (let i = 0; i < 25; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * 360 + 20, Math.random() * 260 + 20, 30, 15, Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(200, 150, 80, 0, Math.PI * 2);
    ctx.fill();
  }

  const dataUrl = canvas.toDataURL("image/jpeg");
  displayPreview(dataUrl);
  selectedImageElement.dataset.sampleType = diseaseType;
}

async function analyzeLeaf() {
  const btnAnalyze = document.getElementById("btn-analyze");
  btnAnalyze.disabled = true;
  btnAnalyze.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Analyse IA en cours...`;

  try {
    await classifyLeafImage(selectedImageElement);
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'analyse.");
  } finally {
    btnAnalyze.disabled = false;
    btnAnalyze.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Lancer le Diagnostic IA`;
  }
}
