/**
 * AgroSentinel AI - Télémétrie & Journalisation des évènements
 */

import { CONFIG } from '../config.js';

let intruderCount = 0;
let pestCount = 0;
let lastFrameTime = performance.now();
let frameCount = 0;

export function addLogItem(type, message) {
  const logList = document.getElementById("log-list");
  if (!logList) return;

  const li = document.createElement("li");
  const timeStr = new Date().toLocaleTimeString();

  li.className = `log-item ${type}`;
  li.innerHTML = `<span class="time">[${timeStr}]</span> <span>${message}</span>`;

  logList.insertBefore(li, logList.firstChild);

  if (logList.children.length > CONFIG.MAX_LOGS) {
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
