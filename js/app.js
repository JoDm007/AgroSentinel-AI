/**
 * AgroSentinel AI - Contrôleur Principal Application (ES Module)
 *
 * Responsabilités :
 *   - amorçage des modèles TensorFlow.js
 *   - navigation entre les onglets
 *   - machine à états de la surveillance (caméra ⇄ mode démo)
 *
 * La logique de l'onglet 2 vit dans js/views/diagnostic.js.
 */

import {
  loadObjectDetectorModel,
  startDetectionLoop,
  stopDetectionLoop,
  resetOverlay,
} from './models/objectDetector.js';
import { loadLeafClassifierModel } from './models/leafClassifier.js';
import { playScareSound, primeAudioEngine } from './utils/audioSynth.js';
import { addLogItem, resetFps } from './utils/telemetry.js';
import { registerServiceWorker } from './utils/pwa.js';
import { initDiagnosticView, stopLeafCamera } from './views/diagnostic.js';
import { initSecurityView } from './views/security.js';

// La caméra et le mode démo sont mutuellement exclusifs : deux drapeaux
// distincts, jamais détournés l'un pour l'autre.
let isCameraRunning = false;
let isDemoMode = false;

/** "environment" = caméra arrière (usage terrain), "user" = caméra frontale. */
let cameraFacingMode = "environment";
let hasMultipleCameras = false;

let webcamElement = null;
let canvasElement = null;

document.addEventListener("DOMContentLoaded", () => {
  webcamElement = document.getElementById("webcam");
  canvasElement = document.getElementById("detection-canvas");

  bindEventListeners();
  initDiagnosticView();
  syncSurveillanceUI();

  // Indépendant du chargement des modèles : le journal doit afficher son
  // état même si TensorFlow.js échoue.
  initSecurityView();

  registerServiceWorker().then(ok => {
    if (!ok) setOfflineStatus("unavailable", "Non supporté");
  });
  bootstrapModels();
});

// ─── Mode hors ligne (PWA) ───────────────────────────────────────────────────

/**
 * ⚠️ DOIT rester aligné sur VERSION dans sw.js.
 *
 * Le service worker purge à l'activation TOUT cache dont le nom ne commence
 * pas par sa VERSION : un nom désaligné ici ferait effacer les 23 Mo de
 * poids préchauffés à chaque redéploiement, et les stockerait en double
 * (une fois par la page, une fois par le service worker).
 */
const SW_VERSION = "agrosentinel-v4";
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

/**
 * Demande au service worker actif le nom réel de son cache runtime.
 *
 * Filet de sécurité contre la désynchronisation : si la constante ci-dessus
 * venait à diverger, le nom fourni par le service worker fait foi. Repli sur
 * la constante quand aucun service worker ne contrôle encore la page (premier
 * chargement) ou quand la réponse tarde.
 */
async function resolveRuntimeCacheName() {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return RUNTIME_CACHE;

  try {
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error("timeout")), 1000);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        resolve(event.data?.runtime || RUNTIME_CACHE);
      };
      controller.postMessage({ type: "GET_CACHE_NAMES" }, [channel.port2]);
    });
  } catch {
    return RUNTIME_CACHE;
  }
}

/**
 * Met explicitement en cache les poids des modèles.
 *
 * Au tout premier chargement, le service worker ne contrôle pas encore la
 * page : les requêtes de poids lui échappent et ne seraient pas mises en
 * cache. On pilote donc le cache depuis la page, ce qui rend l'état
 * hors-ligne déterministe au lieu de dépendre du cycle de vie du SW.
 */
async function warmOfflineCache() {
  if (!("caches" in window)) {
    setOfflineStatus("unavailable", "Non supporté");
    return;
  }

  try {
    setOfflineStatus("pending", "Mise en cache…");
    const cache = await caches.open(await resolveRuntimeCacheName());

    const manifests = ["./models/coco-ssd/model.json", "./models/mobilenet/model.json"];
    const urls = [];

    for (const manifestUrl of manifests) {
      urls.push(manifestUrl);
      const manifest = await (await fetch(manifestUrl)).json();
      const dir = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
      for (const group of manifest.weightsManifest) {
        for (const path of group.paths) urls.push(dir + path);
      }
    }

    let cached = 0;
    for (const url of urls) {
      if (await cache.match(url)) { cached++; continue; }

      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch {
        /*
         * Écriture ignorée volontairement. Depuis que la page et le service
         * worker partagent le même cache, tous deux écrivent la même clé :
         * la requête de la page est relayée par le service worker, qui met
         * lui aussi la réponse en cache. Deux `put` concurrents sur une même
         * clé font échouer l'un des deux ("Entry already exists") alors que
         * l'entrée est bien présente.
         */
      }

      // On compte donc sur l'état RÉEL du cache, pas sur le succès de notre
      // propre écriture : peu importe qui a gagné la course, seule compte la
      // disponibilité du fichier hors ligne.
      if (await cache.match(url)) cached++;
    }

    if (cached === urls.length) {
      setOfflineStatus("ready", "Hors ligne prêt");
      addLogItem("info", `Mode hors ligne prêt (${cached} fichiers en cache).`);
    } else {
      setOfflineStatus("pending", `${cached}/${urls.length}`);
    }
  } catch (err) {
    console.warn("Mise en cache hors ligne incomplète :", err);
    setOfflineStatus("unavailable", "Incomplet");
  }
}

function setOfflineStatus(state, label) {
  const badge = document.getElementById("offline-status");
  const icon = document.getElementById("offline-icon");
  const text = document.getElementById("offline-text");
  if (!badge) return;

  const icons = {
    ready: "fa-solid fa-circle-check",
    pending: "fa-solid fa-cloud-arrow-down",
    unavailable: "fa-solid fa-circle-minus",
  };

  badge.className = `status-badge offline-${state}`;
  if (icon) icon.className = icons[state] ?? icons.pending;
  if (text) text.textContent = label;
}

// ─── Amorçage des modèles ────────────────────────────────────────────────────

async function bootstrapModels() {
  const loadingText = document.getElementById("loading-text");
  const statusEl = document.getElementById("models-loaded-text");

  try {
    await tf.ready();
    const backendEl = document.getElementById("backend-type");
    if (backendEl) backendEl.textContent = tf.getBackend().toUpperCase();

    if (loadingText) loadingText.textContent = "Chargement des modèles IA embarqués…";

    await Promise.all([
      loadObjectDetectorModel(),
      loadLeafClassifierModel(),
    ]);

    if (statusEl) {
      statusEl.textContent = "Prêts (COCO-SSD & MobileNet)";
      // Les couleurs restent définies dans style.css : le thème doit pouvoir
      // changer sans qu'on ait à retrouver des teintes codées en dur ici.
      statusEl.style.color = "var(--lime-ink)";
    }

    document.getElementById("loading-overlay")?.classList.add("hidden");
    addLogItem("info", "Modèles IA chargés avec succès.");

    await detectAvailableCameras();
    await warmOfflineCache();
  } catch (err) {
    console.error("Erreur d'initialisation IA:", err);

    if (statusEl) {
      statusEl.textContent = "Échec du chargement";
      statusEl.style.color = "var(--danger-ink)";
    }

    // L'overlay reste visible mais devient explicite au lieu de tourner
    // indéfiniment sur "Initialisation…".
    const spinner = document.querySelector("#loading-overlay .spinner");
    if (spinner) spinner.classList.add("hidden");
    if (loadingText) {
      loadingText.innerHTML =
        `<strong>Modèles IA indisponibles.</strong><br>` +
        `Rechargez la page. Le diagnostic assisté reste utilisable.`;
    }

    addLogItem("danger", "Échec d'initialisation des modèles TensorFlow.js.");
  }
}

/** Détermine s'il existe plusieurs caméras (smartphone : avant + arrière). */
async function detectAvailableCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    hasMultipleCameras = devices.filter(d => d.kind === "videoinput").length > 1;
  } catch {
    hasMultipleCameras = false;
  }
  syncSurveillanceUI();
}

// ─── Câblage des évènements (aucun onclick inline) ───────────────────────────

function bindEventListeners() {
  document.getElementById("tab-surveillance-btn")
    ?.addEventListener("click", () => switchTab("surveillance"));
  document.getElementById("tab-diagnostic-btn")
    ?.addEventListener("click", () => switchTab("diagnostic"));

  document.getElementById("btn-toggle-camera")
    ?.addEventListener("click", toggleCamera);
  document.getElementById("btn-flip-camera")
    ?.addEventListener("click", flipCamera);
  document.getElementById("demo-mode-toggle")
    ?.addEventListener("change", onDemoToggleChanged);

  document.querySelectorAll("[data-scare]").forEach(btn => {
    btn.addEventListener("click", () => playScareSound(btn.dataset.scare));
  });

  // Débloque le moteur audio dès la première interaction, pour que les
  // alertes automatiques ne soient pas muettes.
  document.addEventListener("pointerdown", primeAudioEngine, { once: true });
}

// ─── Navigation ──────────────────────────────────────────────────────────────

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

  document.getElementById(`tab-${tabName}-btn`)?.classList.add("active");
  document.getElementById(`tab-${tabName}`)?.classList.add("active");

  // Deux caméras ne peuvent pas tourner en parallèle sur un smartphone,
  // et laisser un flux actif hors écran vide la batterie pour rien.
  if (tabName !== "diagnostic") stopLeafCamera({ silent: true });
  if (tabName !== "surveillance" && isCameraRunning) stopCamera();
}

// ─── Surveillance : caméra ───────────────────────────────────────────────────

async function toggleCamera() {
  if (isCameraRunning) {
    stopCamera();
    return;
  }
  await startCamera();
}

async function startCamera() {
  // La démo doit être coupée proprement AVANT de lancer une seconde boucle.
  stopDemoMode({ silent: true });

  if (!navigator.mediaDevices?.getUserMedia) {
    // Cas typique : page servie en http:// depuis un smartphone. Le
    // navigateur n'expose l'API caméra que dans un contexte sécurisé.
    const insecure = !window.isSecureContext;
    addLogItem("danger", insecure
      ? "Caméra bloquée : la page doit être servie en HTTPS (ou depuis localhost)."
      : "API caméra indisponible sur ce navigateur.");
    startDemoMode();
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 360 },
        facingMode: cameraFacingMode,
      },
      audio: false,
    });

    webcamElement.srcObject = stream;
    await webcamElement.play();

    isCameraRunning = true;
    startDetectionLoop(webcamElement, canvasElement, () => isDemoMode);
    addLogItem("info", cameraFacingMode === "user"
      ? "Caméra frontale activée."
      : "Caméra arrière activée.");

    // Les libellés des caméras ne sont exposés qu'après autorisation.
    await detectAvailableCameras();
    syncSurveillanceUI();
    return true;
  } catch (err) {
    console.warn("Webcam indisponible, bascule en mode démo :", err);
    const denied = err?.name === "NotAllowedError";
    addLogItem("warning", denied
      ? "Accès caméra refusé. Activation du Mode Démo."
      : "Webcam non détectée. Activation du Mode Démo.");
    startDemoMode();
    return false;
  }
}

/** Bascule entre caméra avant et arrière (utile en démo sur smartphone). */
async function flipCamera() {
  cameraFacingMode = cameraFacingMode === "environment" ? "user" : "environment";

  if (!isCameraRunning) {
    syncSurveillanceUI();
    return;
  }

  stopDetectionLoop();
  if (webcamElement?.srcObject) {
    webcamElement.srcObject.getTracks().forEach(track => track.stop());
    webcamElement.srcObject = null;
  }
  isCameraRunning = false;

  await startCamera();
}

function stopCamera() {
  isCameraRunning = false;

  if (webcamElement?.srcObject) {
    webcamElement.srcObject.getTracks().forEach(track => track.stop());
    webcamElement.srcObject = null;
  }

  stopDetectionLoop();
  resetOverlay(canvasElement);
  resetFps();
  addLogItem("info", "Caméra arrêtée.");
  syncSurveillanceUI();
}

// ─── Surveillance : mode démo ────────────────────────────────────────────────

function onDemoToggleChanged(event) {
  if (event.target.checked) startDemoMode();
  else stopDemoMode();
}

function startDemoMode() {
  if (isCameraRunning) stopCamera();

  isDemoMode = true;
  startDetectionLoop(webcamElement, canvasElement, () => isDemoMode);
  addLogItem("info", "Mode Démo activé (simulation de menace).");
  syncSurveillanceUI();
}

function stopDemoMode({ silent = false } = {}) {
  if (!isDemoMode) return;

  isDemoMode = false;
  stopDetectionLoop();
  resetOverlay(canvasElement);
  resetFps();
  if (!silent) addLogItem("info", "Mode Démo désactivé.");
  syncSurveillanceUI();
}

// ─── Synchronisation de l'interface ──────────────────────────────────────────

/** Source de vérité unique de l'UI de surveillance. */
function syncSurveillanceUI() {
  const btn = document.getElementById("btn-toggle-camera");
  const flip = document.getElementById("btn-flip-camera");
  const toggle = document.getElementById("demo-mode-toggle");

  if (toggle) toggle.checked = isDemoMode;

  if (btn) {
    btn.disabled = isDemoMode;
    btn.innerHTML = isCameraRunning
      ? `<i class="fa-solid fa-stop"></i> Arrêter Caméra`
      : `<i class="fa-solid fa-camera"></i> Démarrer Caméra`;
    btn.classList.toggle("btn-danger", isCameraRunning);
    btn.classList.toggle("btn-outline", !isCameraRunning);
  }

  // Bascule avant/arrière : utile uniquement sur un appareil multi-caméras.
  if (flip) {
    flip.classList.toggle("hidden", !hasMultipleCameras || isDemoMode);
    flip.title = cameraFacingMode === "environment"
      ? "Passer à la caméra frontale"
      : "Passer à la caméra arrière";
  }
  // Volontairement pas d'effet miroir sur la vidéo frontale : le canvas
  // de détection ne serait plus aligné avec les bounding boxes.
}
