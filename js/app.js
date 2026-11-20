/* Historique de courses — page unique, sans dépendance hormis Leaflet. */
(function () {
  "use strict";

  const CATS = [
    { key: "all", label: "Toutes" },
    { key: "marathon", label: "Marathons" },
    { key: "trail", label: "Trails et ultras" },
    { key: "courte", label: "Courses courtes" },
  ];
  const CAT_LABEL = { marathon: "Marathon", trail: "Trail / ultra", courte: "Course courte" };
  const ACCENT = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1F4FE0";

  let courses = [];
  let cat = "all";
  let openId = null;
  let map = null;

  // ---------- Utilitaires ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toSec(t) {
    const p = t.split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }
  // Version publique : chrono arrondi à la minute (c.chrono, c.t).
  // Après connexion : chronos exacts issus des données chiffrées.
  const chrono = (c) => c.chrono_officiel || c.chrono_strava || c.chrono;
  const secs = (c) => (c.chrono_officiel || c.chrono_strava) ? toSec(c.chrono_officiel || c.chrono_strava) : c.t;
  function pace(c) {
    const s = secs(c) / c.distance_km;
    return Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
  }
  const fmtKm = (n, d = 1) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtInt = (n) => Math.round(n).toLocaleString("fr-FR");
  const dm = (d) => d.slice(8, 10) + "/" + d.slice(5, 7);
  const dmy = (d) => dm(d) + "/" + d.slice(0, 4);

  // Décodage d'un « encoded polyline » Google/Strava
  function decodePolyline(str) {
    const pts = [];
    let i = 0, lat = 0, lng = 0;
    while (i < str.length) {
      for (const k of [0, 1]) {
        let r = 0, sh = 0, b;
        do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
        const d = r & 1 ? ~(r >> 1) : r >> 1;
        if (k === 0) lat += d; else lng += d;
      }
      pts.push([lat / 1e5, lng / 1e5]);
    }
    return pts;
  }

  // ---------- En-tête ----------
  function renderHero() {
    const n = courses.length;
    const nm = courses.filter((c) => c.categorie === "marathon");
    const nt = courses.filter((c) => c.categorie === "trail").length;
    const n40 = courses.filter((c) => c.distance_km > 40).length;
    const n50 = courses.filter((c) => c.distance_km > 50).length;
    const best = nm.slice().sort((a, b) => secs(a) - secs(b))[0];
    const longest = courses.filter((c) => c.categorie === "trail").sort((a, b) => b.distance_km - a.distance_km)[0];
    const years = courses.map((c) => c.date.slice(0, 4)).sort();

    document.getElementById("eyebrow").textContent = "Mes courses · " + years[0] + " – " + years[years.length - 1];
    document.getElementById("hero").innerHTML = [
      [String(n), "courses depuis " + years[0]],
      [String(nm.length), "marathons" + (best ? " · record " + chrono(best) + ", " + best.lieu + " " + best.date.slice(0, 4) : "")],
      [String(nt), "trails" + (longest ? " · le plus long : " + fmtInt(longest.distance_km) + " km, " + longest.lieu + " " + longest.date.slice(0, 4) : "")],
      [String(n40), "courses de plus de 40 km, dont " + n50 + " de plus de 50 km"],
    ].filter(Boolean).map(([b, s], i) => `<div class="stat s${i}"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("");
  }

  function renderFilters() {
    const el = document.getElementById("cats");
    el.innerHTML = CATS.map((c) =>
      `<button type="button" data-cat="${c.key}" aria-pressed="${c.key === cat}">${esc(c.label)}</button>`).join("");
  }

  // ---------- Liste : un dossard par course ----------
  const TILTS = [-0.8, 0.6, -0.3, 0.9, -0.6, 0.4];
  let showPrep = false;
  try { showPrep = localStorage.getItem("prepa") === "1"; } catch (e) { /* stockage indisponible */ }

  const shownList = () => courses.filter((c) => cat === "all" || c.categorie === cat);

  function renderList() {
    const list = document.getElementById("list");
    const shown = shownList();
    list.classList.toggle("with-prep", showPrep);
    const byYear = new Map();
    shown.forEach((c) => { const y = c.date.slice(0, 4); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(c); });
    let k = 0, html = "";
    for (const [y, items] of byYear) {
      html += `<section class="yr"><h2><span>${y}</span><small>${items.length} course${items.length > 1 ? "s" : ""}</small></h2>
        <div class="bibs">${items.map((c) => bibHtml(c, k++)).join("")}</div></section>`;
    }
    list.innerHTML = shown.length ? html : `<p class="loading">Aucune course dans cette catégorie.</p>`;
    list.setAttribute("aria-busy", "false");
  }

  function bibHtml(c, i) {
    const nph = (c.photos || []).length;
    return `<button type="button" class="bib ${c.categorie}" id="${c.id}" data-id="${c.id}" style="--tilt:${TILTS[i % TILTS.length]}deg" aria-label="${esc(c.nom)} ${c.date.slice(0, 4)}, ${chrono(c)} : ouvrir la fiche">
      <span class="band"><span class="bn">${esc(c.nom)}</span><span>${c.date.slice(0, 4)}</span></span>
      <span class="num">${chrono(c)}</span>
      <span class="cap">${CAT_LABEL[c.categorie]} · ${fmtKm(c.distance_km)} km${c.denivele_m != null ? " · D+ " + fmtInt(c.denivele_m) + " m" : ""}</span>
      <span class="foot"><span>${dmy(c.date)} · ${esc(c.lieu || "—")}${nph ? ` · <span class="ph">${nph} photo${nph > 1 ? "s" : ""}</span>` : ""}</span>
        ${c.mini ? `<svg viewBox="0 0 160 110" aria-hidden="true"><path d="${c.mini}"/></svg>` : ""}</span>
      <span class="pin p1" aria-hidden="true"></span><span class="pin p2" aria-hidden="true"></span><span class="pin p3" aria-hidden="true"></span><span class="pin p4" aria-hidden="true"></span>
      ${prepStrip(c)}
    </button>`;
  }

  function prepStrip(c) {
    const r = c.preparation && c.preparation.resume;
    const txt = r ? `${hm(r.min_sem)}/sem · ${r.sorties} séances · ${r.quali} quali` : "pas de données";
    return `<span class="strip"><i>PRÉPA</i><span>${txt}</span></span>`;
  }

  function modalHtml(c) {
    const shown = shownList(), k = shown.findIndex((x) => x.id === c.id);
    const newer = shown[k - 1], older = shown[k + 1];
    return `<div class="sheet-bar">
        <div class="nav">
          <button type="button" data-m="go" data-to="${newer ? newer.id : ""}" ${newer ? "" : "disabled"}>← Plus récente</button>
          <button type="button" data-m="go" data-to="${older ? older.id : ""}" ${older ? "" : "disabled"}>Plus ancienne →</button>
        </div>
        <button type="button" class="x" data-m="close" aria-label="Fermer">×</button>
      </div>
      <div class="sheet-body">
        <div class="col-l">
          <div class="bib big ${c.categorie}">
            <span class="band"><span class="bn" id="m-title">${esc(c.nom)}</span><span>${c.date.slice(0, 4)}</span></span>
            <span class="num">${chrono(c)}</span>
            <span class="cap">${CAT_LABEL[c.categorie]}</span>
            <span class="foot"><span>${dmy(c.date)} · ${esc(c.lieu || "—")}</span></span>
          </div>
          <dl class="stats">
            ${unlocked
              ? `<div><dt>Chrono officiel</dt><dd>${c.chrono_officiel || "—"}</dd></div>
                 <div><dt>Chrono Strava</dt><dd>${c.chrono_strava || "—"}</dd></div>`
              : `<div><dt>${c.officiel ? "Chrono officiel" : "Chrono"}</dt><dd>${c.chrono}</dd></div>
                 <div><dt>Précision</dt><dd>à la minute</dd></div>`}
            <div><dt>Allure</dt><dd>${pace(c)} /km</dd></div>
            <div><dt>Distance · D+</dt><dd>${fmtKm(c.distance_km)} km${c.denivele_m != null ? " · " + fmtInt(c.denivele_m) + " m" : ""}</dd></div>
          </dl>
          ${c.notes ? `<p class="notes">${esc(c.notes)}</p>` : ""}
          ${c.strava_id ? `<a class="strava" href="https://www.strava.com/activities/${c.strava_id}" target="_blank" rel="noopener">Voir l'activité sur Strava →</a>` : ""}
        </div>
        <div class="col-r">
          ${c.trace ? `<div class="map" id="map" role="img" aria-label="Tracé GPS : ${esc(c.nom)}"></div>`
                    : `<div class="map empty">Pas de tracé GPS pour cette course</div>`}
          ${prepHtml(c)}
          ${photosHtml(c)}
        </div>
      </div>`;
  }

  // ---------- Préparation ----------
  const hm = (m) => m == null ? "—" : (m >= 60 ? Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0") : m + " min");

  function volumeChart(hebdo) {
    const W = 240, H = 64, gap = 4, n = hebdo.length;
    const bw = (W - gap * (n - 1)) / n;
    const max = Math.max(...hebdo.map((w) => w.km), 1);
    const bars = hebdo.map((w, i) => {
      const h = Math.max(2, Math.round((w.km / max) * (H - 4)));
      const x = i * (bw + gap);
      return `<rect x="${x.toFixed(1)}" y="${H - h}" width="${bw.toFixed(1)}" height="${h}" rx="2" class="${w.q ? "bq" : "b"}"><title>Semaine -${n - i} : ${w.km} km, ${w.n} sortie${w.n > 1 ? "s" : ""}${w.q ? ", " + w.q + " séance" + (w.q > 1 ? "s" : "") + " qualitative" + (w.q > 1 ? "s" : "") : ""}</title></rect>`;
    }).join("");
    return `<figure class="vol">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kilomètres par semaine sur les ${n} semaines avant la course">${bars}</svg>
      <figcaption><span>S-${n}</span><span>km par semaine · <i class="kq"></i> avec séance qualitative</span><span>S-1</span></figcaption>
    </figure>`;
  }

  function prepHtml(c) {
    const p = c.preparation;
    if (!p) return "";
    let head;
    if (p.dans_prepa_de) {
      const h = p.dans_prepa_de;
      head = `Course intégrée à la préparation de <a href="#${h.id}">${esc(h.nom)} ${h.date.slice(0, 4)}</a>`;
    } else if (!p.semaines) {
      head = "Pas de préparation spécifique";
    } else {
      head = `Préparation sur ${p.semaines} semaines` + (p.base === "sorties longues" ? " <span class=\"muted\">(d'après les sorties longues)</span>" : "");
    }
    const types = Object.entries(p.qualite_types || {});
    const qLabel = types.length
      ? `${p.qualite_semaine} par semaine` + " · " + types.map(([t, k]) => `${t} (${k})`).join(", ")
      : "aucune";
    const sorties = p.sorties_min !== p.sorties_max ? `${p.sorties_semaine} <small>(${p.sorties_min} à ${p.sorties_max})</small>` : `${p.sorties_semaine}`;
    const rows = [
      ["Sorties / semaine", sorties],
      ["Sortie longue", p.sl_moy ? `moy. ${hm(p.sl_moy)} · max ${hm(p.sl_max)}` : "—"],
      c.categorie === "marathon"
        ? ["Allure spécifique", p.as_moy ? `moy. ${hm(p.as_moy)} · max ${hm(p.as_max)} <small>(${p.as_seances} séance${p.as_seances > 1 ? "s" : ""})</small>` : "aucune repérée"]
        : null,
      ["Séances qualitatives", qLabel],
    ].filter(Boolean);
    return `<section class="prep" aria-label="Préparation">
      <h3><i class="tag">PRÉPA</i> ${head}</h3>
      ${p.dans_prepa_de ? "" : `<dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`}
      ${p.hebdo ? volumeChart(p.hebdo) : ""}
      <p class="fine">Analyse automatique des 12 semaines précédentes${p.estime_gps > 0.5 ? ", surtout d'après les données GPS (séances non nommées) : à prendre comme une estimation" : ", d'après les intitulés et les données GPS"}.</p>
    </section>`;
  }

  // ---------- Photos ----------
  function photosHtml(c) {
    const ph = c.photos || [];
    if (!ph.length) return "";
    return `<section class="photos" aria-label="Photos">
      <h3>Photos <span class="muted">(${ph.length})</span></h3>
      <div class="thumbs">${ph.map((p, i) =>
        `<button type="button" class="thumb" data-photo="${c.id}" data-i="${i}" aria-label="Agrandir la photo ${i + 1} sur ${ph.length}">
          <img data-enc="${p.min}" alt="" width="${Math.round(p.w / Math.max(p.w, p.h) * 480)}" height="${Math.round(p.h / Math.max(p.w, p.h) * 480)}">
        </button>`).join("")}</div>
    </section>`;
  }

  // Visionneuse plein écran
  const lb = { el: null, list: [], i: 0, last: null };
  function openLightbox(list, i, opener) {
    lb.list = list; lb.i = i; lb.last = opener;
    if (!lb.el) {
      lb.el = document.createElement("div");
      lb.el.className = "lightbox";
      lb.el.setAttribute("role", "dialog");
      lb.el.setAttribute("aria-modal", "true");
      lb.el.setAttribute("aria-label", "Photo");
      lb.el.innerHTML = `<img alt="">
        <button type="button" class="lb-close" aria-label="Fermer">×</button>
        <button type="button" class="lb-prev" aria-label="Photo précédente">‹</button>
        <button type="button" class="lb-next" aria-label="Photo suivante">›</button>
        <span class="lb-count"></span>`;
      document.body.appendChild(lb.el);
      lb.el.addEventListener("click", (e) => {
        if (e.target.closest(".lb-prev")) step(-1);
        else if (e.target.closest(".lb-next")) step(1);
        else if (e.target.closest(".lb-close") || e.target === lb.el) closeLightbox();
      });
      lb.el.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeLightbox();
        else if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "ArrowRight") step(1);
      });
    }
    showPhoto();
    lb.el.hidden = false;
    document.body.style.overflow = "hidden";
    lb.el.querySelector(".lb-close").focus();
  }
  function step(d) { lb.i = (lb.i + d + lb.list.length) % lb.list.length; showPhoto(); }
  function showPhoto() {
    const p = lb.list[lb.i];
    const img = lb.el.querySelector("img");
    img.removeAttribute("src");
    const want = lb.i;
    window.Prive.photo(p.src).then((u) => { if (lb.i === want) img.src = u; }).catch(() => {});
    lb.el.querySelector(".lb-count").textContent = `${lb.i + 1} / ${lb.list.length}`;
    const multi = lb.list.length > 1;
    lb.el.querySelector(".lb-prev").hidden = !multi;
    lb.el.querySelector(".lb-next").hidden = !multi;
  }
  function closeLightbox() {
    lb.el.hidden = true;
    document.body.style.overflow = "";
    if (lb.last) lb.last.focus();
  }

  // ---------- Carte ----------
  function closeMap() {
    if (map) { map.remove(); map = null; }
  }

  const traceCache = new Map();
  function loadTrace(c) {
    if (!traceCache.has(c.id)) {
      // c.trace est soit le chemin d'un fichier (data/traces/…), soit la polyline elle-même
      const p = c.trace.startsWith("data/")
        ? fetch(c.trace).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
        : Promise.resolve(c.trace);
      traceCache.set(c.id, p.then((s) => decodePolyline(s.trim())));
    }
    return traceCache.get(c.id);
  }

  function drawMap(c) {
    const el = document.getElementById("map");
    if (!el || !c.trace || typeof L === "undefined") return;
    loadTrace(c).then((pts) => {
      if (openId !== c.id || document.getElementById("map") !== el) return; // panneau fermé entre-temps
      renderMap(el, pts);
    }).catch(() => {
      el.classList.add("empty");
      el.textContent = "Tracé indisponible";
    });
  }

  function renderMap(el, pts) {
    map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const line = L.polyline(pts, { color: ACCENT, weight: 4, opacity: 0.9 }).addTo(map);
    L.circleMarker(pts[0], { radius: 6, color: ACCENT, weight: 3, fillColor: "#fff", fillOpacity: 1 })
      .bindTooltip("Départ").addTo(map);
    L.circleMarker(pts[pts.length - 1], { radius: 6, color: "#14171F", weight: 3, fillColor: "#14171F", fillOpacity: 1 })
      .bindTooltip("Arrivée").addTo(map);
    map.fitBounds(line.getBounds(), { padding: [16, 16] });
  }

  // ---------- Interactions ----------
  let lastFocus = null;
  function openModal(id) {
    const c = courses.find((x) => x.id === id);
    if (!c) return;
    if (cat !== "all" && c.categorie !== cat) { cat = "all"; renderFilters(); renderList(); }
    closeMap();
    if (!openId) lastFocus = document.activeElement;
    openId = id;
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* cadre restreint */ }
    const modal = document.getElementById("modal"), sheet = document.getElementById("sheet");
    sheet.innerHTML = modalHtml(c);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    sheet.scrollTop = 0;
    sheet.querySelector(".x").focus();
    drawMap(c);
    sheet.querySelectorAll("img[data-enc]").forEach((img) =>
      window.Prive.photo(img.dataset.enc).then((u) => { img.src = u; }).catch(() => {}));
  }
  function closeModal() {
    if (!openId) return;
    const id = openId;
    openId = null;
    closeMap();
    document.getElementById("modal").hidden = true;
    document.body.style.overflow = "";
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* cadre restreint */ }
    const b = document.getElementById(id);
    (b || lastFocus)?.focus();
  }

  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-cat]");
    if (f) { cat = f.dataset.cat; renderFilters(); renderList(); return; }
    const t = e.target.closest(".thumb[data-photo]");
    if (t) {
      const c = courses.find((x) => x.id === t.dataset.photo);
      if (c) openLightbox(c.photos, Number(t.dataset.i), t);
      return;
    }
    const m = e.target.closest("[data-m]");
    if (m) { if (m.dataset.m === "close") closeModal(); else if (m.dataset.to) openModal(m.dataset.to); return; }
    if (e.target.id === "modal") { closeModal(); return; }
    const r = e.target.closest(".bib[data-id]");
    if (r && !r.closest(".sheet")) openModal(r.dataset.id);
  });

  document.addEventListener("keydown", (e) => {
    if (!openId || (lb.el && !lb.el.hidden)) return;
    if (e.key === "Escape") closeModal();
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const shown = shownList(), k = shown.findIndex((x) => x.id === openId);
      const t = shown[k + (e.key === "ArrowLeft" ? -1 : 1)];
      if (t) openModal(t.id);
    }
  });
  document.getElementById("prep-toggle").addEventListener("change", (e) => {
    showPrep = e.target.checked;
    try { localStorage.setItem("prepa", showPrep ? "1" : "0"); } catch (err) { /* stockage indisponible */ }
    renderList();
  });

  // ---------- Vues : liste des courses / données ----------
  let view = "list", dataMaps = null;
  function resetDataView() {
    const d = document.getElementById("data");
    if (dataMaps) dataMaps.forEach((m) => m && m.remove());
    dataMaps = null; d.innerHTML = "";
    if (view === "data") setView("data");
  }
  function setView(v) {
    view = v;
    document.getElementById("list").hidden = v !== "list";
    document.getElementById("filters").hidden = v !== "list";
    const d = document.getElementById("data"); d.hidden = v !== "data";
    document.querySelectorAll(".tabs [data-view]").forEach((a) => {
      if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (v === "data") {
      if (!dataMaps) dataMaps = window.renderDataView(courses, d);
      dataMaps.forEach((m) => m && m.invalidateSize());
    }
  }
  function route() {
    const id = location.hash.slice(1);
    if (id === "donnees") { setView("data"); return; }
    if (view !== "list") setView("list");
    if (id && id !== openId && courses.some((c) => c.id === id)) openModal(id);
    else if (!id) closeModal();
  }
  window.addEventListener("hashchange", route);

  // ---------- Connexion ----------
  let unlocked = false;
  function applyPrivate(priv) {
    courses.forEach((c) => { const x = priv.courses[c.id]; if (x) Object.assign(c, x); });
    unlocked = true;
    refreshAll();
  }
  function refreshAll() {
    const b = document.getElementById("login-btn");
    b.querySelector("span").textContent = unlocked ? "Se déconnecter" : "Se connecter";
    b.classList.toggle("on", unlocked);
    renderHero(); renderList(); resetDataView();
    if (openId) { const id = openId; openId = null; openModal(id); }
  }
  const loginDlg = document.getElementById("login");
  function openLogin() {
    document.getElementById("login-err").textContent = "";
    loginDlg.hidden = false;
    document.getElementById("pw").value = "";
    document.getElementById("pw").focus();
  }
  function closeLogin() { loginDlg.hidden = true; document.getElementById("login-btn").focus(); }
  document.getElementById("login-btn").addEventListener("click", () => {
    if (!unlocked) { openLogin(); return; }
    window.Prive.forget();
    location.reload();
  });
  document.getElementById("login-cancel").addEventListener("click", closeLogin);
  loginDlg.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLogin(); });
  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const ok = document.getElementById("login-ok"), err = document.getElementById("login-err");
    ok.disabled = true; err.textContent = "Vérification…";
    window.Prive.unlock(document.getElementById("pw").value, document.getElementById("remember").checked)
      .then((priv) => { loginDlg.hidden = true; applyPrivate(priv); })
      .catch((x) => { err.textContent = x && x.message === "absent" ? "Les données privées ne sont pas encore générées sur ce site." : "Mot de passe incorrect."; })
      .finally(() => { ok.disabled = false; });
  });

  // ---------- Démarrage ----------
  fetch("data/courses.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      courses = data.sort((a, b) => b.date.localeCompare(a.date));
      const h = location.hash.slice(1);
      document.getElementById("prep-toggle").checked = showPrep;
      renderHero();
      renderFilters();
      renderList();
      if (courses.some((c) => c.id === h)) openModal(h);
      if (h === "donnees") setView("data");
      window.Prive.resume().then((priv) => { if (priv) applyPrivate(priv); }).catch(() => {});
    })
    .catch(() => {
      document.getElementById("list").innerHTML =
        '<p class="error">Impossible de charger data/courses.json. Ouvre la page via un serveur (GitHub Pages, ou « python -m http.server » en local).</p>';
    });
})();
