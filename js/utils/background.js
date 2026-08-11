/**
 * AgroSentinel AI - Arrière-plan interactif
 *
 * Un halo vert citron suit le pointeur (ou le doigt), son pendant cyan se
 * déplace en miroir. Le calque est peint en CSS (body::before) : ici on ne
 * fait qu'animer deux variables --glow-x / --glow-y.
 *
 * Contraintes assumées, l'application visant des téléphones modestes :
 *   - aucun élément DOM ajouté, aucun canvas ;
 *   - requestAnimationFrame ne tourne QUE pendant le glissement vers la
 *     cible, jamais en continu ;
 *   - au repos, une dérive lente réveille le halo toutes les 4 s — l'écran
 *     « respire » en démonstration sans consommer ;
 *   - prefers-reduced-motion coupe tout : le dégradé reste alors statique.
 */

export function initInteractiveBackground() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const root = document.documentElement;

  // Position courante et cible, en % du viewport.
  let x = 22, y = 12;
  let targetX = x, targetY = y;
  let rafId = null;
  let lastPointerAt = 0;

  function tick() {
    x += (targetX - x) * 0.06;
    y += (targetY - y) * 0.06;
    root.style.setProperty("--glow-x", x.toFixed(2) + "%");
    root.style.setProperty("--glow-y", y.toFixed(2) + "%");

    // La boucle s'éteint dès que la cible est atteinte : zéro coût au repos.
    if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.08) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  function wake() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  window.addEventListener("pointermove", event => {
    lastPointerAt = performance.now();
    targetX = (event.clientX / window.innerWidth) * 100;
    targetY = (event.clientY / window.innerHeight) * 100;
    wake();
  }, { passive: true });

  // Dérive de repos : sans interaction depuis 6 s, le halo décrit une
  // lente ellipse (période ≈ 1 min). Cadence volontairement basse.
  setInterval(() => {
    if (document.hidden) return;
    if (performance.now() - lastPointerAt < 6000) return;
    const t = performance.now() / 1000;
    targetX = 50 + 34 * Math.sin(t / 9);
    targetY = 26 + 16 * Math.cos(t / 13);
    wake();
  }, 4000);
}
