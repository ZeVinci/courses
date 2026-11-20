/* Données privées : chiffrées (AES-256-GCM, clé dérivée du mot de passe par PBKDF2-SHA-256).
   Le mot de passe ne quitte jamais le navigateur ; sans lui, data/prive.json et photos/*.bin sont illisibles. */
window.Prive = (function () {
  "use strict";
  const STORE = "courses-cle";
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  let key = null, files = {}, header = null;
  const cache = new Map();

  async function getHeader() {
    if (header) return header;
    const r = await fetch("data/prive.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("absent");
    header = await r.json();
    return header;
  }
  async function open(k) {
    const h = await getHeader();
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(h.iv) }, k, b64(h.ct));
    const data = JSON.parse(new TextDecoder().decode(plain));
    key = k; files = data.fichiers || {};
    return data;
  }
  async function unlock(pw, remember) {
    const h = await getHeader();
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    const k = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: b64(h.salt), iterations: h.iter },
      base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
    const data = await open(k);
    if (remember) {
      try { localStorage.setItem(STORE, JSON.stringify({ salt: h.salt, k: toB64(await crypto.subtle.exportKey("raw", k)) })); } catch (e) { /* stockage indisponible */ }
    }
    return data;
  }
  async function resume() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { /* stockage indisponible */ }
    if (!saved) return null;
    try {
      const h = await getHeader();
      if (h.salt !== saved.salt) throw new Error("nouveau mot de passe");
      const k = await crypto.subtle.importKey("raw", b64(saved.k), { name: "AES-GCM" }, false, ["decrypt"]);
      return await open(k);
    } catch (e) { forget(); return null; }
  }
  function forget() { try { localStorage.removeItem(STORE); } catch (e) { /* stockage indisponible */ } }
  function photo(path) {
    if (!key || !files[path]) return Promise.reject(new Error("verrouillé"));
    if (!cache.has(path)) {
      cache.set(path, fetch(files[path]).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then((buf) => crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(buf, 0, 12) }, key, new Uint8Array(buf, 12)))
        .then((plain) => URL.createObjectURL(new Blob([plain], { type: "image/jpeg" }))));
    }
    return cache.get(path);
  }
  return { unlock, resume, forget, photo };
})();
