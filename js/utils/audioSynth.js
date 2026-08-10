/**
 * AgriSentinel AI - Synthétiseur Audio d'Alarmes (Web Audio API)
 */

let audioCtx = null;

export function playScareSound(type) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "bird") {
      // Sweeping high pitch frequency repellent for birds
      osc.type = "sine";
      osc.frequency.setValueAtTime(2200, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(3500, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } 
    else if (type === "person") {
      // Loud dual-tone security siren for intruders
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.25);
      osc.frequency.linearRampToValueAtTime(440, audioCtx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    }
  } catch (e) {
    console.warn("Contexte audio bloqué par le navigateur", e);
  }
}
