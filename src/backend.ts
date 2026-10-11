import { callable } from "@decky/api";

export type Settings = Record<string, string>;

export interface LayerStatus {
  arch: string;
  bundled: boolean;
  bundledUpstream: string | null;
  installed: boolean;
  upToDate: boolean;
  path: string;
  systemCopies: string[];
}

export interface GameConfig {
  path: string;
  exists: boolean;
  values: Settings;
  effective: Settings;
}

export interface GameStatus {
  running: boolean;
  envEnabled: boolean;
  envDisabled: boolean;
  loaded: boolean;
  multiplier: number | null;
  lsfg: boolean;
  protonLog: boolean;
  pids: number[];
}

export interface LogTail {
  path: string;
  exists: boolean;
  lines: string[];
}

export const getLayerStatus = callable<[], LayerStatus>("get_layer_status");
export const installLayer = callable<[], LayerStatus>("install_layer");
export const uninstallLayer = callable<[], LayerStatus>("uninstall_layer");

export const getDefaults = callable<[], Settings>("get_defaults");
export const setDefaults = callable<[values: Settings], Settings>("set_defaults");

export const getGame = callable<[appid: string], GameConfig>("get_game");
export const ensureGame = callable<[appid: string], GameConfig>("ensure_game");
export const setGame = callable<[appid: string, values: Settings], GameConfig>("set_game");
export const configPath = callable<[appid: string], string>("config_path");
export const listConfigured = callable<[], string[]>("list_configured");

export const getEnabled = callable<[], string[]>("get_enabled");
export const setEnabled = callable<[appid: string, enabled: boolean], string[]>("set_enabled");

export const getStatus = callable<[appid: string], GameStatus>("get_status");
export const getLog = callable<[appid: string, lines: number], LogTail>("get_log");
