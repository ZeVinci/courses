/* Onglet « Données » : graphiques dessinés en SVG, sans dépendance (la carte utilise Leaflet). */
window.renderDataView = function (courses, root) {
  "use strict";
  const toSec = t => { if (!t) return null; const p = t.split(":").map(Number); return p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p[0]*60 + p[1]; };
  const DATA = courses.map(c => { const r = c.preparation && c.preparation.resume;
    return Object.assign({}, c, {t: (c.chrono_officiel || c.chrono_strava) ? toSec(c.chrono_officiel || c.chrono_strava) : c.t, ll: c.depart || null},
      r ? {min_sem: r.min_sem, sorties: r.sorties, quali: r.quali} : {}); });
  const LATE = [];
const COL = {marathon:"#1F4FE0", trail:"#0B7A54", courte:"#B5651D"};
const CATL = {marathon:"Marathon", trail:"Trail", courte:"Course courte"};
const NS = "http://www.w3.org/2000/svg";
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const EXACT = courses.some(c => c.chrono_officiel || c.chrono_strava);
const hms = s => { if (!EXACT) { const m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0") : m + " min"; } s = Math.round(s); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return (h? h+":"+String(m).padStart(2,"0") : m) + ":" + String(x).padStart(2,"0"); };
const hmm = s => { const h = Math.floor(s/3600), m = Math.round(s%3600/60); return h+"h"+String(m).padStart(2,"0"); };
const pace = s => { s = Math.round(s); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); };
const hmin = m => Math.floor(m/60)+"h"+String(m%60).padStart(2,"0");
const dmy = d => d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4);
const yr = c => c.date.slice(0,4);
const MAR = DATA.filter(c => c.categorie === "marathon").sort((a,b) => a.date.localeCompare(b.date));
const SPECIAL = {"2013-09-07":"course festive (déguisée)", "2024-11-24":"couru avec un ami"};
const special = c => SPECIAL[c.date];
const short = c => c.nom.replace(/^Marathon (de la |du |de |d')/, "").replace("Liberté","Liberté (Caen)") + " " + yr(c);
const best = MAR.slice().sort((a,b) => a.t - b.t)[0];

// ---------- helpers ----------
function el(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function txt(parent, x, y, s, attrs = {}) { const t = el("text", Object.assign({x, y}, attrs), parent); t.textContent = s; return t; }
function linear(d0, d1, r0, r1) { const f = v => r0 + (v - d0) / (d1 - d0) * (r1 - r0); f.inv = p => d0 + (p - r0) / (r1 - r0) * (d1 - d0); return f; }
function niceTicks(a, b, n = 5) { const span = b - a, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0))); const err = step0 / mag; const step = (err >= 7 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1) * mag; const out = []; for (let v = Math.ceil(a/step)*step; v <= b + 1e-9; v += step) out.push(+v.toFixed(10)); return out; }
function frame(W, H, m) { const svg = el("svg", {viewBox:`0 0 ${W} ${H}`, role:"img", class:"ch"}); return {svg, x0:m.l, x1:W-m.r, y0:H-m.b, y1:m.t, W, H}; }
function yAxis(f, y, ticks, fmt, title) { ticks.forEach(v => { const p = y(v); el("line", {x1:f.x0, x2:f.x1, y1:p, y2:p, class:"gr"}, f.svg); txt(f.svg, f.x0-8, p+4, fmt(v), {"text-anchor":"end"}); }); if (title) txt(f.svg, f.x0-8, f.y1-10, title, {"text-anchor":"end"}); }
function xAxis(f, x, ticks, fmt, title) { el("line", {x1:f.x0, x2:f.x1, y1:f.y0, y2:f.y0, class:"ax"}, f.svg); ticks.forEach(v => { const p = x(v); el("line", {x1:p, x2:p, y1:f.y0, y2:f.y0+4, class:"ax"}, f.svg); txt(f.svg, p, f.y0+17, fmt(v), {"text-anchor":"middle"}); }); if (title) txt(f.svg, f.x1, f.y0+34, title, {"text-anchor":"end"}); }
function dot(f, cx, cy, r, color, tip, opts = {}) {
  const g = el("g", {}, f.svg);
  el("circle", {cx, cy, r: r + 2, fill: "#fff"}, g);
  el("circle", {cx, cy, r, fill: opts.hollow ? "#fff" : color, stroke: color, "stroke-width": opts.hollow ? 2 : 0}, g);
  const h = el("circle", {cx, cy, r: Math.max(r + 6, 11), class: "hit"}, g); h.dataset.tip = tip; if (opts.id) h.dataset.go = opts.id; return g;
}
function legend(items) { return `<div class="leg">${items.map(([c,l,cls]) => `<span><i class="${cls||""}" style="background:${c}"></i>${esc(l)}</span>`).join("")}</div>`; }
const tipC = c => `<b>${esc(c.nom)}</b><br>${dmy(c.date)} · ${esc(c.lieu || "")}<br>${(c.distance_km||0).toLocaleString("fr-FR",{maximumFractionDigits:1})} km · ${hms(c.t)}`;

// ---------- cards ----------

const CARDS = [];
let currentGroup = null;
function group(name) { const h = document.createElement("h2"); h.className = "viz-group"; h.textContent = name; root.appendChild(h); currentGroup = document.createElement("div"); currentGroup.className = "viz-grid"; root.appendChild(currentGroup); }
function card(no, title, desc, build, wide) {
  const c = document.createElement("section"); c.className = "viz-card" + (wide ? " wide" : ""); c.id = "g" + no;
  c.innerHTML = `<h3>${esc(title)}</h3><p class="d">${desc}</p><div class="body"></div>`;
  currentGroup.appendChild(c); build(c.querySelector(".body")); CARDS.push({no, title});
}

// 1. Courses par année
group("Vue d'ensemble");
card(1, "Courses par année", "Nombre de courses chaque année, réparties par catégorie.", body => {
  const years = []; for (let y = +yr(DATA.reduce((a,b)=>a.date<b.date?a:b)); y <= +yr(DATA.reduce((a,b)=>a.date>b.date?a:b)); y++) years.push(String(y));
  const cats = ["marathon","trail","courte"];
  const cnt = years.map(y => cats.map(k => DATA.filter(c => yr(c) === y && c.categorie === k)));
  const max = Math.max(...cnt.map(a => a.reduce((s,x)=>s+x.length,0)));
  body.innerHTML = legend(cats.map(k => [COL[k], CATL[k], "sq"]));
  const f = frame(520, 250, {l:30, r:6, t:16, b:30}); body.appendChild(f.svg);
  const y = linear(0, max, f.y0, f.y1); yAxis(f, y, niceTicks(0, max, 4).filter(v=>Number.isInteger(v)), v => v);
  const bw = (f.x1 - f.x0) / years.length;
  years.forEach((Y, i) => {
    let acc = 0; const x = f.x0 + i*bw + bw*0.18, w = bw*0.64;
    cats.forEach((k, j) => { const n = cnt[i][j].length; if (!n) return;
      const yTop = y(acc + n), yBot = y(acc); const r = el("rect", {x, y: yTop + 1, width: w, height: Math.max(1, yBot - yTop - 2), rx: 2, fill: COL[k]}, f.svg);
      r.dataset.tip = `<b>${Y} · ${CATL[k]}${n>1?"s":""} : ${n}</b><br>${cnt[i][j].map(c=>esc(c.nom)).join("<br>")}`; r.style.cursor = "pointer"; acc += n; });
    if (i % 2 === 0 || years.length < 14) txt(f.svg, x + w/2, f.y0 + 16, "’" + Y.slice(2), {"text-anchor":"middle"});
  });
  el("line", {x1:f.x0, x2:f.x1, y1:f.y0, y2:f.y0, class:"ax"}, f.svg);
});

// 2. Saisonnalité
card(2, "Saisonnalité", "Une pastille par course, placée par année et par mois.", body => {
  const years = [...new Set(DATA.map(yr))].sort();
  body.innerHTML = legend(["marathon","trail","courte"].map(k => [COL[k], CATL[k]]));
  const f = frame(520, 26 + years.length*17 + 10, {l:40, r:6, t:22, b:10}); body.appendChild(f.svg);
  const M = ["J","F","M","A","M","J","J","A","S","O","N","D"]; const cw = (f.x1 - f.x0) / 12;
  M.forEach((m,i) => { txt(f.svg, f.x0 + cw*i + cw/2, 12, m, {"text-anchor":"middle"}); if (i%2===0) el("rect", {x: f.x0 + cw*i, y: 18, width: cw, height: years.length*17 + 4, fill:"#F7F8FA"}, f.svg); });
  years.forEach((Y, j) => { const yy = 28 + j*17; txt(f.svg, f.x0 - 8, yy + 4, Y, {"text-anchor":"end"});
    const items = DATA.filter(c => yr(c) === Y).sort((a,b)=>a.date.localeCompare(b.date));
    const perM = {}; items.forEach(c => { const m = +c.date.slice(5,7) - 1; perM[m] = (perM[m]||0) + 1; const k = perM[m] - 1;
      dot(f, f.x0 + cw*m + cw/2 + (k ? (k%2 ? 9 : -9) : 0) * Math.ceil(k/2), yy, 5, COL[c.categorie], tipC(c), {id: c.id}); }); });
});

// 3. Carte
card(3, "Carte des courses", "Chaque course à son point de départ ; la taille du point suit la distance. Clique sur un point pour ouvrir la course.", body => {
  const m = document.createElement("div"); m.className = "viz-map"; body.appendChild(m);
  const sans = DATA.filter(c => !c.ll).length;
  body.insertAdjacentHTML("beforeend", `<p class="note">${sans} courses sans tracé GPS (avant Strava ou montre oubliée) n'apparaissent pas.</p>`);
  LATE.push(() => {
    const map = L.map(m, {scrollWheelZoom: false});
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 18, attribution: "© OpenStreetMap"}).addTo(map);
    const pts = DATA.filter(c => c.ll).sort((a,b) => b.distance_km - a.distance_km);
    pts.forEach(c => L.circleMarker(c.ll, {radius: 4 + Math.sqrt(c.distance_km) * 0.9, color: "#fff", weight: 1.5, fillColor: COL[c.categorie], fillOpacity: 0.7})
      .bindTooltip(tipC(c)).on("click", () => { location.hash = c.id; }).addTo(map));
    map.fitBounds(L.latLngBounds(pts.map(c => c.ll)).pad(0.08));
    return map;
  });
}, true);

// 4. Allure vs distance
group("Chrono et distance");
card(4, "Allure selon la distance", "Une course = un point. L'axe horizontal est en échelle logarithmique pour bien voir à la fois les 10 km et les 100 km. En « km-effort », 100 m de D+ comptent comme 1 km de plus, ce qui rapproche route et trail.", body => {
  body.innerHTML = `<div class="seg"><button type="button" aria-pressed="true" data-m="km">Distance réelle</button><button type="button" aria-pressed="false" data-m="ke">km-effort</button></div>` + legend(["marathon","trail","courte"].map(k => [COL[k], CATL[k]]));
  const holder = document.createElement("div"); body.appendChild(holder);
  function draw(mode) {
    holder.innerHTML = ""; const f = frame(520, 300, {l:44, r:10, t:20, b:40}); holder.appendChild(f.svg);
    const pts = DATA.filter(c => c.t && c.distance_km).map(c => { const d = mode === "ke" ? c.distance_km + (c.denivele_m||0)/100 : c.distance_km; return {c, d, p: c.t / d}; });
    const lx = linear(Math.log10(8), Math.log10(130), f.x0, f.x1), x = v => lx(Math.log10(v));
    const pmax = Math.ceil(Math.max(...pts.map(o=>o.p))/60)*60, pmin = Math.floor(Math.min(...pts.map(o=>o.p))/60)*60;
    const y = linear(pmin, pmax, f.y0, f.y1);
    const yt = []; for (let v = pmin; v <= pmax; v += (pmax-pmin > 360 ? 120 : 60)) yt.push(v);
    yAxis(f, y, yt, v => pace(v), "allure /km");
    xAxis(f, x, [10, 21.1, 42.2, 80, 100], v => v === 21.1 ? "semi" : v === 42.2 ? "marathon" : v + " km", mode === "ke" ? "km-effort" : "distance");
    pts.forEach(o => dot(f, x(o.d), y(o.p), 5, COL[o.c.categorie], tipC(o.c) + `<br>allure ${pace(o.p)} /km` + (mode === "ke" ? ` (km-effort : ${o.d.toFixed(1)})` : ""), {id: o.c.id}));
    txt(f.svg, f.x1, f.y1 + 2, "plus lent ↑", {"text-anchor":"end"});
  }
  draw("km");
  body.querySelectorAll(".seg button").forEach(b => b.onclick = () => { body.querySelectorAll(".seg button").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(b.dataset.m); });
});

// shared marathon-time axis
function timeY(f, list, pad = 300) { const lo = Math.floor((Math.min(...list.map(c=>c.t)) - pad/2)/600)*600, hi = Math.ceil((Math.max(...list.map(c=>c.t)) + pad/4)/600)*600; const y = linear(lo, hi, f.y0, f.y1); const t = []; for (let v = lo; v <= hi; v += 900) t.push(v); yAxis(f, y, t, hmm); return y; }
const marTip = c => tipC(c) + (special(c) ? `<br><i>${special(c)}</i>` : "");
const marLegend = () => legend([["#1F4FE0","Marathon"],["#fff","Médoc et La Rochelle 2024 (allure non cherchée)","ring"]]);

// 5. Marathons dans le temps
card(5, "Mes marathons dans le temps", "Le chrono de chaque marathon, du plus ancien au plus récent. Le record est mis en avant.", body => {
  body.innerHTML = marLegend();
  const f = frame(520, 280, {l:44, r:14, t:22, b:34}); body.appendChild(f.svg);
  const t0 = new Date(MAR[0].date.slice(0,4)+"-01-01").getTime(), t1 = new Date((+MAR[MAR.length-1].date.slice(0,4) + 1) + "-01-01").getTime();
  const x = linear(t0, t1, f.x0, f.x1), X = c => x(new Date(c.date).getTime());
  const y = timeY(f, MAR);
  const yrs = []; for (let Y = +MAR[0].date.slice(0,4); Y <= +MAR[MAR.length-1].date.slice(0,4); Y += 2) yrs.push(Y);
  xAxis(f, v => x(new Date(v+"-01-01").getTime()), yrs, v => v);
  el("line", {x1:f.x0, x2:f.x1, y1:y(best.t), y2:y(best.t), stroke:"#1F4FE0", "stroke-dasharray":"3 4", "stroke-width":1}, f.svg);
  txt(f.svg, f.x1, y(best.t) + 14, "record " + hms(best.t), {"text-anchor":"end", class:"lbl"});
  el("polyline", {points: MAR.filter(c=>!special(c)).map(c => X(c)+","+y(c.t)).join(" "), fill:"none", stroke:"#A9B9EF", "stroke-width":2}, f.svg);
  MAR.forEach(c => dot(f, X(c), y(c.t), c === best ? 7 : 5, "#1F4FE0", marTip(c), {hollow: !!special(c), id: c.id}));
});

// 6. Même course
card(6, "Même course, plusieurs éditions", "La Rochelle (5 fois) et Paris (4 fois) : même parcours, donc la comparaison la plus juste.", body => {
  const S = [["La Rochelle","#1F4FE0"],["Paris","#0B8A5F"]];
  body.innerHTML = legend(S.map(([n,c]) => [c, "Marathon de " + n]));
  const f = frame(520, 280, {l:44, r:80, t:22, b:34}); body.appendChild(f.svg);
  const list = MAR.filter(c => /La Rochelle|Paris/.test(c.nom));
  const yMax = +list[list.length-1].date.slice(0,4) + 0.8; const x = linear(+list[0].date.slice(0,4) - 0.5, yMax, f.x0, f.x1); const y = timeY(f, list);
  xAxis(f, x, niceTicks(+list[0].date.slice(0,4), yMax, 5).filter(Number.isInteger), v => v);
  S.forEach(([n, col]) => { const L = list.filter(c => c.nom.includes(n)); const X = c => x(+c.date.slice(0,4) + (+c.date.slice(5,7)-1)/12);
    el("polyline", {points: L.map(c => X(c)+","+y(c.t)).join(" "), fill:"none", stroke: col, "stroke-width":2, "stroke-opacity":0.6}, f.svg);
    L.forEach(c => dot(f, X(c), y(c.t), 5, col, marTip(c), {hollow: !!special(c), id: c.id}));
    const last = L[L.length-1]; txt(f.svg, X(last) + 10, y(last.t) + 4, n, {class:"lbl"}); });
});

// 7. Chrono selon l'âge
card(7, "Chrono selon l'âge", "Âge le jour de la course (né en 1978, âge calculé à l'année près).", body => {
  body.innerHTML = marLegend();
  const f = frame(520, 260, {l:44, r:30, t:22, b:40}); body.appendChild(f.svg);
  const age = c => +c.date.slice(0,4) - 1978 + (+c.date.slice(5,7)-1)/12 - 0.5;
  const x = linear(30, Math.max(49, ...MAR.map(age)) + 0.5, f.x0, f.x1); const y = timeY(f, MAR);
  xAxis(f, x, [30, 35, 40, 45], v => v + " ans", "âge");
  MAR.forEach(c => dot(f, x(age(c)), y(c.t), 5, "#1F4FE0", marTip(c) + `<br>${Math.round(age(c))} ans environ`, {hollow: !!special(c), id: c.id}));
});

// 8 & 9. Préparation vs chrono
group("Chrono et préparation (marathons)");
function prepScatter(body, key, fmt, title) {
  body.innerHTML = marLegend();
  const f = frame(520, 290, {l:44, r:14, t:22, b:40}); body.appendChild(f.svg);
  const L = MAR.filter(c => c[key] != null); const vals = L.map(c => c[key]);
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.08;
  const x = linear(lo - pad, hi + pad, f.x0, f.x1); const y = timeY(f, L);
  xAxis(f, x, niceTicks(lo - pad, hi + pad, 5), fmt, title);
  // tendance (hors courses spéciales)
  const R = L.filter(c => !special(c)); const mx = R.reduce((s,c)=>s+c[key],0)/R.length, my = R.reduce((s,c)=>s+c.t,0)/R.length;
  const b = R.reduce((s,c)=>s+(c[key]-mx)*(c.t-my),0) / R.reduce((s,c)=>s+(c[key]-mx)**2,0);
  const r = R.reduce((s,c)=>s+(c[key]-mx)*(c.t-my),0) / Math.sqrt(R.reduce((s,c)=>s+(c[key]-mx)**2,0) * R.reduce((s,c)=>s+(c.t-my)**2,0));
  el("line", {x1:x(lo), x2:x(hi), y1:y(my + b*(lo-mx)), y2:y(my + b*(hi-mx)), stroke:"#8A93A3", "stroke-dasharray":"4 4", "stroke-width":1.5}, f.svg);
  const placed = L.map(c => ({x1: x(c[key]) - 6, x2: x(c[key]) + 6, y1: y(c.t) - 6, y2: y(c.t) + 6}));
  L.forEach(c => dot(f, x(c[key]), y(c.t), 5, "#1F4FE0", marTip(c) + `<br>${title} : ${fmt(c[key])}`, {hollow: !!special(c), id: c.id}));
  const order = L.slice().sort((a, b) => (special(b)?1:0) - (special(a)?1:0) || Math.abs(b.t - my) - Math.abs(a.t - my));
  order.forEach(c => { const s = short(c), w = s.length * 5.6, px = x(c[key]), py = y(c.t);
    for (const [dx, anchor] of [[9, "start"], [-9, "end"]]) { const bx = anchor === "start" ? px + dx : px + dx - w;
      const bb = {x1: bx, x2: bx + w, y1: py - 7, y2: py + 6};
      if (bb.x2 > f.W - 2 || bb.x1 < f.x0) continue;
      if (placed.some(p => !(bb.x2 < p.x1 || bb.x1 > p.x2 || bb.y2 < p.y1 || bb.y1 > p.y2))) continue;
      placed.push(bb); txt(f.svg, px + dx, py + 4, s, {"text-anchor": anchor, style:"font-size:10px"}); break; } });
  body.insertAdjacentHTML("beforeend", `<p class="note">Les noms qui se chevauchaient sont masqués : survole les points. Pointillés : tendance sur ${R.length} marathons (hors courses non chronométrées à fond), corrélation r = ${r.toFixed(2).replace(".",",")}. ${Math.abs(r) < 0.3 ? "Lien faible :" : "Tendance visible, mais"} avec si peu de points, c'est une indication, pas une preuve.</p>`);
}
card(8, "Volume d'entraînement et chrono", "Temps de course moyen par semaine pendant la préparation, face au chrono du marathon.", body => prepScatter(body, "min_sem", v => hmin(Math.round(v)), "temps / semaine"));
card(9, "Séances qualitatives et chrono", "Nombre total de séances qualitatives (fractionné, côtes, seuil) pendant la préparation.", body => prepScatter(body, "quali", v => Math.round(v), "séances quali"));

// 11. Gestion de course
group("Gestion de course (tracés GPS)");
card(11, "Écart entre les deux moitiés du marathon", "Combien la seconde moitié a été plus lente (barre vers la droite) ou plus rapide (vers la gauche) que la première, d'après la montre.", body => {
  const L = MAR.filter(c => c.split_ratio != null);
  const f = frame(innerWidth < 800 ? 520 : 1040, 30 + L.length * 22, {l:150, r:40, t:14, b:24}); body.appendChild(f.svg);
  const lo = Math.min(-15, ...L.map(c=>c.split_ratio) .map(v=>v-4)), hi = Math.max(16, ...L.map(c=>c.split_ratio));
  const x = linear(lo, hi, f.x0, f.x1);
  [-15,-10,-5,0,5,10,15].forEach(v => { el("line", {x1:x(v), x2:x(v), y1:f.y1, y2:f.y0, class: v ? "gr" : "ax"}, f.svg); txt(f.svg, x(v), f.y0 + 16, (v>0?"+":"") + v + " %", {"text-anchor":"middle"}); });
  L.forEach((c, i) => { const yy = f.y1 + i * 22 + 4, v = c.split_ratio, a = x(Math.min(0, v)), w = Math.abs(x(v) - x(0));
    txt(f.svg, f.x0 - 10, yy + 11, short(c), {"text-anchor":"end", class:"lbl"});
    const r = el("rect", {x:a, y:yy + 2, width: Math.max(2, w), height: 14, rx: 3, fill: special(c) ? "#C9D3F5" : "#1F4FE0"}, f.svg);
    r.dataset.go = c.id; r.dataset.tip = marTip(c) + `<br>2e moitié ${v>0?"plus lente":"plus rapide"} de ${Math.abs(v).toString().replace(".",",")} %`; r.style.cursor = "pointer";
    txt(f.svg, v >= 0 ? x(v) + 6 : x(v) - 6, yy + 13, (v>0?"+":"") + String(v).replace(".",","), {"text-anchor": v >= 0 ? "start" : "end"}); });
}, true);

// 12. Allure km par km
card(12, "Allure kilomètre par kilomètre", "Une petite courbe par marathon, toutes à la même échelle (plus haut = plus lent). La ligne grise est l'allure moyenne de la course.", body => {
  const L = MAR.filter(c => c.splits); const all = L.flatMap(c => c.splits.slice(0,42)).sort((a,b)=>a-b);
  const lo = all[Math.floor(all.length*0.01)] - 10, hi = all[Math.floor(all.length*0.985)] + 20;
  const box = document.createElement("div"); box.className = "viz-multi"; body.appendChild(box);
  L.slice().reverse().forEach(c => { const d = document.createElement("div"); d.className = "sm"; d.dataset.go = c.id; d.style.cursor = "pointer";
    d.innerHTML = `<b>${esc(short(c))}</b>${hms(c.t)}`; box.appendChild(d);
    const f = frame(160, 60, {l:2, r:2, t:4, b:4}); d.appendChild(f.svg);
    const x = linear(0, 41, f.x0, f.x1), y = linear(lo, hi, f.y0, f.y1), cl = v => Math.max(lo, Math.min(hi, v));
    const avg = c.splits.reduce((a,b)=>a+b,0) / c.splits.length;
    el("line", {x1:f.x0, x2:f.x1, y1:y(avg), y2:y(avg), stroke:"#C9CFD8", "stroke-width":1}, f.svg);
    el("polyline", {points: c.splits.map((v,i) => x(i)+","+y(cl(v))).join(" "), fill:"none", stroke: special(c) ? "#9DB0EE" : "#1F4FE0", "stroke-width":1.5, "stroke-linejoin":"round"}, f.svg);
    const hit = el("rect", {x:0, y:0, width:160, height:60, class:"hit"}, f.svg);
    hit.addEventListener("mousemove", e => { const r = f.svg.getBoundingClientRect(); const i = Math.max(0, Math.min(c.splits.length-1, Math.round(x.inv((e.clientX - r.left) / r.width * 160)))); hit.dataset.tip = `<b>${esc(c.nom)} ${yr(c)}</b><br>km ${i+1} : ${pace(c.splits[i])} /km<br>moyenne : ${pace(avg)} /km`; });
  });
  body.insertAdjacentHTML("beforeend", `<p class="note">Allures calculées d'après la montre (les pauses aux ravitaillements comptent). Les km au-delà de l'échelle sont écrêtés.</p>`);
}, true);


  // ---------- infobulle ----------
  let tip = document.getElementById("viz-tip");
  if (!tip) { tip = document.createElement("div"); tip.id = "viz-tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); }
  root.addEventListener("mousemove", e => { const t = e.target.closest && e.target.closest("[data-tip]"); if (!t) { tip.style.opacity = 0; return; }
    tip.innerHTML = t.dataset.tip; tip.style.opacity = 1; const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 14) + "px"; tip.style.top = (e.clientY + 16 + h > innerHeight ? e.clientY - h - 12 : e.clientY + 16) + "px"; });
  root.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
  root.addEventListener("click", e => { const t = e.target.closest("[data-go]"); if (t) { tip.style.opacity = 0; location.hash = t.dataset.go; } });
  return LATE.map(f => f());
};
