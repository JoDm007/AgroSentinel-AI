/**
 * AgroSentinel AI - Télémétrie & Journalisation des évènements
 */

import { CONFIG } from '../config.js';

let intruderCount = 0;
let pestCount = 0;
let lastFrameTime = performance.now();
let frameCount = 0;

/** Icône par gravité — remplace les émojis, dont le rendu varie d'un
 *  téléphone à l'autre alors que la fonte Font Awesome est embarquée. */
const LOG_ICONS = {
  info: "fa-solid fa-circle-info",
  warning: "fa-solid fa-triangle-exclamation",
  danger: "fa-solid fa-circle-exclamation",
};

export function addLogItem(type, message) {
  const logList = document.getElementById("log-list");
  if (!logList) return;

  const li = document.createElement("li");
  li.className = `log-item ${type}`;

  const icon = document.createElement("i");
  icon.className = `log-icon ${LOG_ICONS[type] ?? LOG_ICONS.info}`;

  const timeSpan = document.createElement("span");
  timeSpan.className = "time";
  timeSpan.textContent = `[${new Date().toLocaleTimeString()}]`;

  const textSpan = document.createElement("span");
  textSpan.textContent = message;

  li.append(icon, timeSpan, textSpan);
  logList.insertBefore(li, logList.firstChild);

  while (logList.children.length > CONFIG.MAX_LOGS) {
    logList.removeChild(logList.lastChild);
  }
}

export function calculateFps() {
  frameCount++;
  const now = performance.now();
  if (now - lastFrameTime >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
    const badge = document.getElementById("fps-badge");
    if (badge) badge.textContent = `${fps} FPS`;
    frameCount = 0;
    lastFrameTime = now;
  }
}

/** Remet le compteur à zéro quand la boucle de détection s'arrête. */
export function resetFps() {
  frameCount = 0;
  lastFrameTime = performance.now();
  const badge = document.getElementById("fps-badge");
  if (badge) badge.textContent = "-- FPS";
}

export function incrementIntruders() {
  intruderCount++;
  const el = document.getElementById("count-intruders");
  if (el) el.textContent = intruderCount;
}

export function incrementPests() {
  pestCount++;
  const el = document.getElementById("count-pests");
  if (el) el.textContent = pestCount;
}
