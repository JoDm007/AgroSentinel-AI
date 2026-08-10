/**
 * AgroSentinel AI - Synthétiseur Audio d'Alarmes (Web Audio API)
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  // Les navigateurs créent le contexte en état "suspended" tant qu'aucune
  // interaction utilisateur n'a eu lieu : sans ce resume(), les alertes
  // automatiques seraient silencieuses.
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

/**
 * Débloque le moteur audio dès la première interaction de l'utilisateur,
 * pour que les alertes automatiques soient audibles immédiatement.
 */
export function primeAudioEngine() {
  getAudioContext();
}

export function playScareSound(type) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "bird") {
      // Balayage haute fréquence répulsif pour les oiseaux
      osc.type = "sine";
      osc.frequency.setValueAtTime(2200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(3500, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
    else if (type === "person") {
      // Sirène de sécurité bitonale pour les intrus
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.25);
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    }
  } catch (e) {
    console.warn("Contexte audio bloqué par le navigateur", e);
  }
}
