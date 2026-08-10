/**
 * AgriSentinel AI - Moteur de Détection d'Objets & Surveillance (COCO-SSD)
 */

import { playScareSound } from '../utils/audioSynth.js';
import { addLogItem, calculateFps, incrementIntruders, incrementPests } from '../utils/telemetry.js';

let cocoModel = null;
let animationFrameId = null;
let lastAlertTime = 0;
let demoAngle = 0;

export async function loadObjectDetectorModel() {
  cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
  return cocoModel;
}

export function startDetectionLoop(webcamElement, canvasElement, isDemoModeRef) {
  const canvasCtx = canvasElement.getContext("2d");

  async function loop() {
    if (isDemoModeRef()) {
      runDemoLoop(canvasElement, canvasCtx);
    } else if (cocoModel && webcamElement.readyState === 4) {
      resizeCanvas(webcamElement, canvasElement);
      const predictions = await cocoModel.detect(webcamElement);
      renderPredictions(predictions, canvasElement, canvasCtx);
      calculateFps();
    }
    animationFrameId = requestAnimationFrame(loop);
  }

  loop();
}

export function stopDetectionLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function runDemoLoop(canvasElement, canvasCtx) {
  resizeCanvas(null, canvasElement);
  demoAngle += 0.03;

  const predictions = [
    {
      class: "person",
      score: 0.95,
      bbox: [
        Math.abs(Math.sin(demoAngle)) * (canvasElement.width - 140) + 20,
        60,
        110,
        210
      ]
    },
    {
      class: "bird",
      score: 0.89,
      bbox: [
        Math.abs(Math.cos(demoAngle)) * (canvasElement.width - 80) + 10,
        40,
        60,
        50
      ]
    }
  ];

  renderPredictions(predictions, canvasElement, canvasCtx);
  calculateFps();
}

function renderPredictions(predictions, canvasElement, canvasCtx) {
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  let detectedIntruder = false;
  let detectedPest = false;

  predictions.forEach(pred => {
    if (pred.score < 0.5) return;

    const [x, y, width, height] = pred.bbox;
    const objectClass = pred.class.toLowerCase();

    let color = "#06b6d4";
    let labelText = `${pred.class.toUpperCase()} (${Math.round(pred.score * 100)}%)`;

    if (objectClass === "person") {
      color = "#ef4444";
      labelText = `🚨 INTRUS: PERSONNE (${Math.round(pred.score * 100)}%)`;
      detectedIntruder = true;
    } else if (["bird", "cat", "dog", "cow", "sheep", "horse"].includes(objectClass)) {
      color = "#f59e0b";
      labelText = `🦅 NUISIBLE: ${objectClass.toUpperCase()} (${Math.round(pred.score * 100)}%)`;
      detectedPest = true;
    }

    // Canvas drawing
    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 3;
    canvasCtx.shadowColor = color;
    canvasCtx.shadowBlur = 10;
    canvasCtx.strokeRect(x, y, width, height);

    canvasCtx.fillStyle = color;
    const textWidth = canvasCtx.measureText(labelText).width;
    canvasCtx.fillRect(x, y > 25 ? y - 25 : y, textWidth + 16, 24);

    canvasCtx.fillStyle = "#000000";
    canvasCtx.font = "bold 13px 'Outfit', sans-serif";
    canvasCtx.fillText(labelText, x + 8, y > 25 ? y - 8 : y + 16);
    canvasCtx.restore();
  });

  handleAlertStates(detectedIntruder, detectedPest);
}

function handleAlertStates(hasIntruder, hasPest) {
  const alertBanner = document.getElementById("alert-banner");
  const alertIcon = document.getElementById("alert-icon");
  const alertMsg = document.getElementById("alert-message");
  const autoSound = document.getElementById("auto-sound-toggle")?.checked;

  const now = Date.now();

  if (hasIntruder) {
    if (alertBanner) alertBanner.className = "hud-badge danger";
    if (alertIcon) alertIcon.className = "fa-solid fa-triangle-exclamation";
    if (alertMsg) alertMsg.textContent = "ALERTE SÉCURITÉ : Intrus humain détecté !";

    if (now - lastAlertTime > 4000) {
      incrementIntruders();
      addLogItem("danger", "🚨 Intrus détecté dans la zone sécurisée !");
      if (autoSound) playScareSound("person");
      lastAlertTime = now;
    }
  } else if (hasPest) {
    if (alertBanner) alertBanner.className = "hud-badge warning";
    if (alertIcon) alertIcon.className = "fa-solid fa-crow";
    if (alertMsg) alertMsg.textContent = "ALERTE NUISIBLES : Oiseaux / Animaux détectés !";

    if (now - lastAlertTime > 4000) {
      incrementPests();
      addLogItem("warning", "🦅 Nuisibles détectés ! Signal effaroucheur activé.");
      if (autoSound) playScareSound("bird");
      lastAlertTime = now;
    }
  } else {
    if (alertBanner) alertBanner.className = "hud-badge normal";
    if (alertIcon) alertIcon.className = "fa-solid fa-circle-check";
    if (alertMsg) alertMsg.textContent = "Zone Sécurisée — Aucune menace détectée";
  }
}

function resizeCanvas(webcamElement, canvasElement) {
  const rect = webcamElement ? webcamElement.getBoundingClientRect() : canvasElement.parentElement.getBoundingClientRect();
  canvasElement.width = rect.width || 640;
  canvasElement.height = rect.height || 360;
}
