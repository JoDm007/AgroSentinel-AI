/**
 * AgroSentinel AI - Cycle de vie du service worker
 *
 * Le cache est agressif par conception (l'application doit fonctionner
 * sans réseau). La contrepartie : sans ce module, un appareil ayant déjà
 * visité l'application continuerait d'afficher l'ancienne version après
 * un redéploiement.
 *
 * ⚠️ VERSION dans sw.js doit être incrémentée à CHAQUE déploiement :
 * c'est elle qui invalide les caches précédents.
 */

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return false;

  // Un rechargement automatique n'a de sens que si une version tournait
  // déjà : au tout premier chargement, la prise de contrôle est normale
  // et ne doit pas provoquer de rechargement.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  try {
    const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    // Vérifie immédiatement s'il existe une version plus récente.
    registration.update?.().catch(() => {});
    return true;
  } catch (err) {
    console.warn("Service worker non enregistré :", err);
    return false;
  }
}
