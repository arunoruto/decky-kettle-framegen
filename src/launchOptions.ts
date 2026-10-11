// Edits Steam launch options to set environment variables for a game.
//
// Assignments go in front of everything else: on Armada the options are
// `/usr/libexec/armada/armada-game-launch %command%`, and the wrapper keeps the environment when
// it execs the game, so `KETTLE_FG=1 /usr/libexec/armada/armada-game-launch %command%` reaches it.
// Steam runs the options through a shell; options without %command% are arguments for the game,
// so those get `%command%` put in front of them.

const COMMAND = "%command%";

function quote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A `NAME=value` word (value unquoted or in single or double quotes) at the start or after a space
function assignmentRe(name: string): RegExp {
  return new RegExp(`(^|\\s)${escapeRe(name)}=(?:'[^']*'|"[^"]*"|[^\\s'"]*)(?=\\s|$)`, "g");
}

// Assignments only count before %command%; after it everything is the game's arguments, and
// without it all options are.
function split(options: string): [string, string] {
  const i = (options || "").indexOf(COMMAND);
  return i < 0 ? ["", options || ""] : [options.slice(0, i), options.slice(i)];
}

export function getEnv(options: string, name: string): string | undefined {
  const m = split(options)[0].match(new RegExp(`(?:^|\\s)${escapeRe(name)}=('[^']*'|"[^"]*"|[^\\s'"]*)(?=\\s|$)`));
  if (!m) return undefined;
  const v = m[1];
  return /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v;
}

function tidy(options: string): string {
  return options.replace(/\s+/g, " ").trim();
}

// `options` without assignments to these names
export function withoutEnv(options: string, names: string[]): string {
  let [head, rest] = split(options);
  for (const name of names) head = head.replace(assignmentRe(name), "$1");
  const out = tidy(`${head} ${rest}`);
  return out === COMMAND ? "" : out;
}

// `options` with these assignments in front (replacing earlier ones of the same names)
export function withEnv(options: string, env: Record<string, string>): string {
  const names = Object.keys(env);
  if (!names.length) return withoutEnv(options, []);
  let base = withoutEnv(options, names);
  if (!base.includes(COMMAND)) base = tidy(`${COMMAND} ${base}`);
  const prefix = names.map((n) => `${n}=${quote(env[n])}`).join(" ");
  return `${prefix} ${base}`;
}

export const KETTLE_ENV = ["KETTLE_FG", "KETTLE_FG_CONFIG"];

export function kettleEnabled(options: string): boolean {
  return getEnv(options, "KETTLE_FG") === "1";
}

// configPath is for non-Steam shortcuts, whose SteamAppId may be 0
export function enableKettle(options: string, configPath?: string): string {
  const env: Record<string, string> = { KETTLE_FG: "1" };
  if (configPath) env.KETTLE_FG_CONFIG = configPath;
  return withEnv(withoutEnv(options, KETTLE_ENV), env);
}

export function disableKettle(options: string): string {
  return withoutEnv(options, KETTLE_ENV);
}

export function protonLogEnabled(options: string): boolean {
  const v = getEnv(options, "PROTON_LOG");
  return v !== undefined && v !== "" && v !== "0";
}

export function setProtonLog(options: string, on: boolean): string {
  return on ? withEnv(options, { PROTON_LOG: "1" }) : withoutEnv(options, ["PROTON_LOG"]);
}

// Decky LSFG-VK starts games through its ~/lsfg script
export function usesLsfg(options: string): boolean {
  return /(^|[\s/])lsfg(\s|$)/.test(options || "") || getEnv(options, "LSFG_PROCESS") !== undefined;
}
