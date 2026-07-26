// update-check.js — poll version.json and reload when a new deploy is live.
// Works with stamped ?v= assets so the full ES module graph is cache-busted.

const VERSION_URL = '/version.json';
const STORAGE_KEY = 'turbolane_build';
const POLL_MS = 30_000;

export function startUpdateChecker() {
  let current = null;
  let timer = null;
  let checking = false;

  async function readRemote() {
    const url = `${VERSION_URL}?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`version.json ${res.status}`);
    const data = await res.json();
    if (!data || typeof data.v !== 'string') throw new Error('bad version payload');
    return data.v;
  }

  function reloadFor(build) {
    try {
      localStorage.setItem(STORAGE_KEY, build);
    } catch (_) { /* private mode */ }
    const u = new URL(window.location.href);
    u.searchParams.set('_v', build);
    // Full navigation so stamped module URLs load from network
    window.location.replace(u.toString());
  }

  async function check() {
    if (checking) return;
    checking = true;
    try {
      const remote = await readRemote();
      if (!current) {
        current = remote;
        try {
          const prev = localStorage.getItem(STORAGE_KEY);
          localStorage.setItem(STORAGE_KEY, remote);
          // Tab had an older build remembered → force one reload onto stamped assets
          if (prev && prev !== remote) {
            reloadFor(remote);
            return;
          }
        } catch (_) { /* ignore */ }
        return;
      }
      if (remote !== current) {
        reloadFor(remote);
      }
    } catch (_) {
      // offline / first deploy without version.json — ignore
    } finally {
      checking = false;
    }
  }

  check();
  timer = window.setInterval(check, POLL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);

  return () => {
    if (timer) window.clearInterval(timer);
  };
}
