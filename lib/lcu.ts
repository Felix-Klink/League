// LCU-Connector (League Client Update API) — NUR serverseitig nutzen.
// Liest die lokalen Client-Credentials (Lockfile bzw. Prozess-Kommandozeile)
// und spricht mit der lokalen Client-REST-API. So lesen Porofessor/U.GG/Blitz
// den Champ-Select live aus. Läuft nur, wenn dieser Server auf DEMSELBEN PC
// wie der League-Client läuft.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { laneShares } from "./proData";

export interface LcuCreds {
  port: number;
  password: string; // "remoting auth token", User ist immer "riot"
}

// Einmal gefundene Credentials cachen — Polling soll keinen Prozess-Scan je
// Request auslösen. Bei Fehlern (Client neu gestartet) wird invalidiert.
let cached: LcuCreds | null = null;

const DEFAULT_LOCKFILES = [
  "C:\\Riot Games\\League of Legends\\lockfile",
  path.join(
    os.homedir(),
    "Applications",
    "League of Legends.app",
    "Contents",
    "LoL",
    "lockfile",
  ), // macOS
];

function parseLockfile(content: string): LcuCreds | null {
  // Format: LeagueClient:<pid>:<port>:<password>:<protocol>
  const parts = content.trim().split(":");
  if (parts.length < 5) return null;
  const port = Number(parts[2]);
  const password = parts[3];
  if (!port || !password) return null;
  return { port, password };
}

async function fromLockfile(): Promise<LcuCreds | null> {
  const candidates = [
    process.env.LCU_LOCKFILE, // expliziter Pfad-Override
    ...DEFAULT_LOCKFILES,
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      const content = await readFile(file, "utf8");
      const creds = parseLockfile(content);
      if (creds) return creds;
    } catch {
      // Datei nicht da -> nächster Kandidat
    }
  }
  return null;
}

// Fallback: Credentials aus der Kommandozeile des laufenden Client-Prozesses
// ziehen. Pfad-unabhängig (funktioniert auch bei Nicht-Standard-Installation).
function fromProcess(): Promise<LcuCreds | null> {
  return new Promise((resolve) => {
    const platform = process.platform;
    let cmd: string;
    let args: string[];
    if (platform === "win32") {
      cmd = "powershell";
      args = [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"name = 'LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine",
      ];
    } else {
      // macOS / Linux: ps nach dem Ux-Prozess durchsuchen
      cmd = "sh";
      args = ["-c", "ps -A -o args | grep -i 'LeagueClientUx' | grep -v grep"];
    }
    execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const port = stdout.match(/--app-port=(\d+)/)?.[1];
      const password = stdout.match(/--remoting-auth-token=([\w-]+)/)?.[1];
      if (port && password) resolve({ port: Number(port), password });
      else resolve(null);
    });
  });
}

async function discoverCreds(): Promise<LcuCreds | null> {
  // 1) Direkte ENV-Overrides (z.B. App läuft separat vom Client)
  if (process.env.LCU_PORT && process.env.LCU_PASSWORD)
    return { port: Number(process.env.LCU_PORT), password: process.env.LCU_PASSWORD };
  // 2) Lockfile am Standardpfad
  const lf = await fromLockfile();
  if (lf) return lf;
  // 3) Laufenden Prozess scannen (pfad-unabhängig)
  return fromProcess();
}

/** Roher GET gegen die LCU. Wirft bei Verbindungs-/HTTP-Fehlern. */
function lcuGet<T>(creds: LcuCreds, apiPath: string): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`riot:${creds.password}`).toString("base64");
    const req = https.request(
      {
        hostname: "127.0.0.1",
        port: creds.port,
        path: apiPath,
        method: "GET",
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        rejectUnauthorized: false, // self-signed Riot-Zertifikat
        timeout: 4000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const body = data ? (JSON.parse(data) as T) : (null as T);
            resolve({ status: res.statusCode ?? 0, body });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: null as T });
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("LCU timeout")));
    req.end();
  });
}

export type LcuStatus =
  | "client_not_running"
  | "not_in_champ_select"
  | "in_champ_select";

export interface ChampSelectCell {
  cellId: number;
  championId: number; // 0 = noch nichts ausgewählt/sichtbar
  position: Lane | null;
  locked: boolean; // true = gelockt, false = nur gehovered (Pick-Intent)
  isLocalPlayer: boolean;
}

export interface ChampSelectState {
  status: LcuStatus;
  allies: ChampSelectCell[];
  enemies: ChampSelectCell[];
  bans: number[];
}

type Lane = "top" | "jungle" | "middle" | "bottom" | "support";
const ALL_LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];

// Picks ohne von der LCU gelieferte Lane (Blind/Normal sowie fast alle Gegner)
// per Champion-Playrate auf die noch freien Lanes des Teams verteilen. Greedy:
// stärkstes (Champ, Lane)-Paar zuerst, sodass jede Lane nur einmal vergeben
// wird. Champs ohne Playrate-Daten füllen die übrigen Lanes auf.
function assignLanesByPlayrate(cells: ChampSelectCell[]): void {
  const taken = new Set<Lane>();
  for (const c of cells) if (c.position) taken.add(c.position);

  const open = cells.filter((c) => c.championId && !c.position);
  const pairs: { cell: ChampSelectCell; lane: Lane; score: number }[] = [];
  for (const c of open) {
    const shares = laneShares(c.championId);
    for (const lane of ALL_LANES)
      pairs.push({ cell: c, lane, score: shares[lane] ?? 0 });
  }
  pairs.sort((a, b) => b.score - a.score);

  const done = new Set<ChampSelectCell>();
  for (const p of pairs) {
    if (p.score <= 0) continue; // keine Daten -> Fallback unten
    if (done.has(p.cell) || taken.has(p.lane)) continue;
    p.cell.position = p.lane;
    taken.add(p.lane);
    done.add(p.cell);
  }
  // Fallback für Champs ohne Playrate-Daten: erste freie Lane.
  for (const c of open) {
    if (done.has(c)) continue;
    const free = ALL_LANES.find((l) => !taken.has(l));
    if (!free) break;
    c.position = free;
    taken.add(free);
    done.add(c);
  }
}

function mapPosition(p: string): Lane | null {
  switch (p) {
    case "top":
      return "top";
    case "jungle":
      return "jungle";
    case "middle":
      return "middle";
    case "bottom":
      return "bottom";
    case "utility":
      return "support";
    default:
      return null; // "" in Blind/Normal -> Lane unbekannt
  }
}

interface RawCell {
  cellId: number;
  championId: number;
  championPickIntent?: number;
  assignedPosition: string;
  summonerId?: number;
}
interface RawSession {
  myTeam: RawCell[];
  theirTeam: RawCell[];
  localPlayerCellId: number;
  bans?: { myTeamBans?: number[]; theirTeamBans?: number[] };
  actions?: { actorCellId: number; championId: number; completed: boolean; type: string }[][];
}

function toCell(c: RawCell, localCellId: number): ChampSelectCell {
  const locked = c.championId > 0;
  return {
    cellId: c.cellId,
    championId: locked ? c.championId : c.championPickIntent ?? 0,
    position: mapPosition(c.assignedPosition),
    locked,
    isLocalPlayer: c.cellId === localCellId,
  };
}

/** Aktuellen Champ-Select-Zustand holen (oder Status, warum nicht). */
export async function getChampSelect(): Promise<ChampSelectState> {
  const empty = (status: LcuStatus): ChampSelectState => ({
    status,
    allies: [],
    enemies: [],
    bans: [],
  });

  let creds = cached ?? (await discoverCreds());
  if (!creds) {
    cached = null;
    return empty("client_not_running");
  }

  // Mit (ggf. gecachten) Credentials versuchen; bei Verbindungsfehler 1x neu
  // entdecken (Client wurde evtl. neu gestartet -> neuer Port/Token).
  let res;
  try {
    res = await lcuGet<RawSession>(creds, "/lol-champ-select/v1/session");
    cached = creds;
  } catch {
    cached = null;
    creds = await discoverCreds();
    if (!creds) return empty("client_not_running");
    try {
      res = await lcuGet<RawSession>(creds, "/lol-champ-select/v1/session");
      cached = creds;
    } catch {
      return empty("client_not_running");
    }
  }

  // 404 = Client läuft, aber gerade kein Champ-Select aktiv.
  if (res.status === 404) return empty("not_in_champ_select");
  if (res.status === 401) {
    cached = null;
    return empty("client_not_running");
  }
  if (res.status !== 200 || !res.body) return empty("not_in_champ_select");

  const session = res.body;
  const local = session.localPlayerCellId;
  const allies = (session.myTeam ?? []).map((c) => toCell(c, local));
  const enemies = (session.theirTeam ?? []).map((c) => toCell(c, local));
  // Fehlende Lanes (Blind/Normal, Gegnerteam) per Playrate auffüllen.
  assignLanesByPlayrate(allies);
  assignLanesByPlayrate(enemies);
  const bans = [
    ...(session.bans?.myTeamBans ?? []),
    ...(session.bans?.theirTeamBans ?? []),
  ].filter((b) => b > 0);

  return { status: "in_champ_select", allies, enemies, bans };
}
