// Steam client access: game names, the running game, launch options.

import { Router } from "@decky/ui";

const SHORTCUT_APP_TYPE = 1073741824;

export interface GameRef {
  appid: string;
  name: string;
}

export function gameName(appid: string): string {
  try {
    return window.appStore?.GetAppOverviewByAppID(Number(appid))?.display_name || `App ${appid}`;
  } catch {
    return `App ${appid}`;
  }
}

export function isShortcut(appid: string): boolean {
  try {
    const o = window.appStore?.GetAppOverviewByAppID(Number(appid));
    if (o) return o.app_type === SHORTCUT_APP_TYPE;
  } catch {
    // fall through
  }
  return Number(appid) >= 2 ** 31;
}

export function runningGame(): GameRef | null {
  const app = Router.MainRunningApp;
  if (!app || !app.appid) return null;
  return { appid: String(app.appid), name: app.display_name || gameName(String(app.appid)) };
}

// Recently played installed games, newest first. collectionStore isn't typed by @decky/ui, so
// this is defensive; the picker also lists games that have a settings file.
export function recentGames(limit = 25): GameRef[] {
  try {
    const store = (window as any).collectionStore;
    const apps: any[] = Array.from(store?.localGamesCollection?.allApps ?? []);
    return apps
      .filter((a) => a && a.appid && a.display_name)
      .sort((a, b) => (b.rt_last_time_played || 0) - (a.rt_last_time_played || 0))
      .slice(0, limit)
      .map((a) => ({ appid: String(a.appid), name: a.display_name }));
  } catch {
    return [];
  }
}

export function getLaunchOptions(appid: string, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    let reg: { unregister(): void } | null = null;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      // unregister after the callback returns, the client may still be inside it
      setTimeout(() => reg?.unregister(), 0);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      reg = SteamClient.Apps.RegisterForAppDetails(Number(appid), (details) => {
        clearTimeout(timer);
        finish(details?.strLaunchOptions ?? "");
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

// Sets the options and reads them back, as Steam applies them asynchronously.
export async function setLaunchOptions(appid: string, options: string): Promise<boolean> {
  SteamClient.Apps.SetAppLaunchOptions(Number(appid), options);
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 150));
    if ((await getLaunchOptions(appid)) === options) return true;
  }
  return false;
}
