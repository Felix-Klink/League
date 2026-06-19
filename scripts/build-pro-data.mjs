// Precompute: Oracle's Elixir CSV -> lib/data/proData.json (keyed by Riot cid).
// Einmalig laufen lassen, wenn eine neue CSV in League_data/ liegt:
//   node scripts/build-pro-data.mjs
//
// Enthält: Pro-Pick-Frequenz je Champ/Lane, Pair-Lift (Pro-Cores),
// echte Team-Ebenen-Archetyp-Verteilung. Bundled JSON, kein Live-Call nötig.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CSV = path.join(
  ROOT,
  "League_data",
  "2026_LoL_esports_match_data_from_OraclesElixir.csv",
);
const OUT = path.join(ROOT, "lib", "data", "proData.json");

// Archetyp-Listen (Spiegel von lib/archetypes.ts SETS)
const SETS = {
  teamfight: ["Malphite","Amumu","Orianna","Kennen","Yasuo","MissFortune","Sett","Rell","Galio","Diana","Neeko","Seraphine","Sona","Gragas","Zac","Maokai","Sejuani","Leona","Nautilus","Alistar","Wukong","JarvanIV","Ornn","Hecarim","Yone","Samira","Rumble","Vladimir","Brand","Zyra","AurelionSol","KSante","Annie"],
  poke: ["Xerath","Velkoz","Zoe","Jayce","Caitlyn","Ezreal","Lux","Varus","Ziggs","Corki","Nidalee","Karma","Janna","Jhin","Vex","Senna","Ashe","Swain","Teemo","Heimerdinger","Zeri","Smolder","Vladimir"],
  dive: ["Camille","Hecarim","Diana","Kennen","Irelia","JarvanIV","Vi","Wukong","Zac","Rengar","Khazix","Akali","Kayn","Pantheon","Jax","LeeSin","XinZhao","Elise","Nocturne","Rakan","Alistar","Briar","Viego","Belveth","Yone","Naafiri","Sylas","Akshan","Fizz"],
  pick: ["Thresh","Blitzcrank","Pyke","Ahri","Morgana","Nautilus","Elise","Twitch","Evelynn","Leblanc","Zed","Talon","Fizz","Katarina","Rengar","Khazix","Nocturne","Neeko","Lissandra","Skarner","Warwick","Bard","TwistedFate","Veigar","Syndra","Vex","Naafiri"],
  protect: ["Lulu","Janna","Soraka","Nami","Yuumi","Milio","Karma","Renata","Sona","Taric","Braum","TahmKench","Jinx","KogMaw","Aphelios","Twitch","Vayne","Kayle","Zeri","Kindred","Cassiopeia"],
  splitpush: ["Camille","Fiora","Jax","Tryndamere","Yorick","Trundle","Nasus","Sion","Gangplank","Tristana","Quinn","Jayce","Kayle","MasterYi","Olaf","Shen","Singed","Kled","Riven","Gwen","Yone"],
};
const ARCH = Object.keys(SETS);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ROLE = { top: "top", jng: "jungle", mid: "middle", bot: "bottom", sup: "support" };

function parseLine(l) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
  }
  out.push(cur); return out;
}

const dd = (await (await fetch("https://ddragon.leagueoflegends.com/cdn/16.12.1/data/en_US/champion.json")).json()).data;
const ddVersion = "16.12.1";
const nameToCid = {}; const idArch = {};
for (const k in dd) {
  const cid = Number(dd[k].key);
  nameToCid[norm(dd[k].name)] = cid;
  idArch[cid] = ARCH.filter((a) => SETS[a].includes(dd[k].id));
}

const csv = fs.readFileSync(CSV, "utf8");
const lines = csv.split(/\r?\n/);
const H = parseLine(lines[0]); const idx = {}; H.forEach((h, i) => (idx[h] = i));
const cGame = idx.gameid, cSide = idx.side, cPos = idx.position, cChamp = idx.champion, cDate = idx.date;

const games = {};
for (let li = 1; li < lines.length; li++) {
  if (!lines[li]) continue;
  const f = parseLine(lines[li]);
  const pos = f[cPos]; if (pos === "team" || !ROLE[pos]) continue;
  const champ = f[cChamp]; if (!champ) continue;
  const cid = nameToCid[norm(champ)]; if (!cid) continue;
  const key = f[cGame] + "|" + f[cSide];
  if (!games[key]) games[key] = { champs: [], lanes: {}, date: f[cDate] };
  games[key].champs.push(cid);
  games[key].lanes[cid] = ROLE[pos];
}
const comps = Object.values(games).filter((g) => g.champs.length === 5);
const dates = comps.map((c) => c.date).filter(Boolean).sort();

// Pick-Frequenz je Champ/Lane
const picks = {}; // cid -> { total, byLane }
for (const g of comps) {
  for (const cid of g.champs) {
    if (!picks[cid]) picks[cid] = { total: 0, byLane: {} };
    picks[cid].total++;
    const ln = g.lanes[cid];
    picks[cid].byLane[ln] = (picks[cid].byLane[ln] || 0) + 1;
  }
}

// Pair-Lift (Pro-Cores)
const N = comps.length;
const cnt = {}; const pairCnt = {};
for (const g of comps) {
  const u = [...new Set(g.champs)];
  for (const c of u) cnt[c] = (cnt[c] || 0) + 1;
  for (let i = 0; i < u.length; i++)
    for (let j = i + 1; j < u.length; j++) {
      const a = Math.min(u[i], u[j]), b = Math.max(u[i], u[j]);
      const k = a + "_" + b;
      pairCnt[k] = (pairCnt[k] || 0) + 1;
    }
}
const MIN_PAIR = 30;
const cores = {}; // cid -> [{cid, lift, count}]
for (const k in pairCnt) {
  const c = pairCnt[k]; if (c < MIN_PAIR) continue;
  const [a, b] = k.split("_").map(Number);
  const lift = (c * N) / (cnt[a] * cnt[b]);
  if (lift < 1.1) continue;
  (cores[a] ||= []).push({ cid: b, lift: +lift.toFixed(2), count: c });
  (cores[b] ||= []).push({ cid: a, lift: +lift.toFixed(2), count: c });
}
for (const cid in cores) {
  cores[cid].sort((x, y) => y.lift - x.lift);
  cores[cid] = cores[cid].slice(0, 8);
}

// Archetyp-Verteilung (Team-Ebene), roh + set-größen-normalisiert
const distRaw = {}; const distNorm = {};
ARCH.forEach((a) => { distRaw[a] = 0; distNorm[a] = 0; });
for (const g of comps) {
  const raw = {}; const nrm = {};
  ARCH.forEach((a) => { raw[a] = 0; nrm[a] = 0; });
  for (const cid of g.champs)
    for (const a of idArch[cid] || []) { raw[a]++; nrm[a] += 1 / SETS[a].length; }
  let br = null, mr = -1, bn = null, mn = -1;
  for (const a of ARCH) { if (raw[a] > mr) { mr = raw[a]; br = a; } if (nrm[a] > mn) { mn = nrm[a]; bn = a; } }
  if (br && mr > 0) distRaw[br]++;
  if (bn && mn > 0) distNorm[bn]++;
}
const frac = (d) => { const t = ARCH.reduce((s, a) => s + d[a], 0) || 1; const o = {}; ARCH.forEach((a) => (o[a] = +(d[a] / t).toFixed(4))); return o; };

const out = {
  meta: { source: "Oracle's Elixir 2026", games: N, dateFrom: dates[0], dateTo: dates[dates.length - 1], ddVersion, builtAt: new Date().toISOString() },
  totalComps: N,
  picks,
  maxPickLane: Math.max(...Object.values(picks).flatMap((p) => Object.values(p.byLane))),
  cores,
  archetypes: { raw: frac(distRaw), normalized: frac(distNorm) },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log("geschrieben:", OUT);
console.log("comps:", N, "| Zeitraum:", out.meta.dateFrom, "->", out.meta.dateTo);
console.log("Archetypen (normalisiert):", JSON.stringify(out.archetypes.normalized));
console.log("Champs mit Cores:", Object.keys(cores).length, "| Pairs >=" + MIN_PAIR + ":", Object.values(pairCnt).filter((c) => c >= MIN_PAIR).length);
