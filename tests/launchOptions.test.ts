import { test } from "node:test";
import assert from "node:assert/strict";
import {
  disableKettle,
  enableKettle,
  getEnv,
  kettleEnabled,
  protonLogEnabled,
  setProtonLog,
  usesLsfg,
  withEnv,
} from "../src/launchOptions.ts";

const ARMADA = "/usr/libexec/armada/armada-game-launch %command%";

test("enable puts the variable in front of Armada's wrapper", () => {
  const on = enableKettle(ARMADA);
  assert.equal(on, `KETTLE_FG=1 ${ARMADA}`);
  assert.ok(kettleEnabled(on));
  assert.equal(enableKettle(on), on, "idempotent");
  assert.equal(disableKettle(on), ARMADA);
});

test("empty options", () => {
  assert.equal(enableKettle(""), "KETTLE_FG=1 %command%");
  assert.equal(disableKettle("KETTLE_FG=1 %command%"), "");
});

test("options without %command% are game arguments", () => {
  assert.equal(enableKettle("-novid -dx11"), "KETTLE_FG=1 %command% -novid -dx11");
  assert.equal(disableKettle("KETTLE_FG=1 %command% -novid -dx11"), "%command% -novid -dx11");
});

test("other variables and similar names are kept", () => {
  const opts = "MY_KETTLE_FG=1 DXVK_HUD=fps gamemoderun %command% --x KETTLE_FG=1x";
  const on = enableKettle(opts);
  assert.equal(on, `KETTLE_FG=1 ${opts}`);
  assert.equal(disableKettle(on), opts);
});

test("shortcut config path, quoted when needed", () => {
  const on = enableKettle(ARMADA, "/home/a b/.config/kettle-framegen/3000000000.conf");
  assert.equal(on, `KETTLE_FG=1 KETTLE_FG_CONFIG='/home/a b/.config/kettle-framegen/3000000000.conf' ${ARMADA}`);
  assert.equal(getEnv(on, "KETTLE_FG_CONFIG"), "/home/a b/.config/kettle-framegen/3000000000.conf");
  assert.equal(disableKettle(on), ARMADA);
});

test("an Armada Control re-wrap keeps the prefix", () => {
  // wrapLaunchOptions() replaces %command% with the wrapper when it is missing
  const on = enableKettle("");
  const wrapped = on.replace("%command%", ARMADA);
  assert.ok(kettleEnabled(wrapped));
});

test("PROTON_LOG", () => {
  const on = setProtonLog(enableKettle(ARMADA), true);
  assert.equal(on, `PROTON_LOG=1 KETTLE_FG=1 ${ARMADA}`);
  assert.ok(protonLogEnabled(on));
  assert.equal(setProtonLog(on, false), `KETTLE_FG=1 ${ARMADA}`);
  assert.equal(withEnv("PROTON_LOG=1 %command%", { PROTON_LOG: "1" }), "PROTON_LOG=1 %command%");
});

test("lsfg detection", () => {
  assert.ok(usesLsfg("~/lsfg %command%"));
  assert.ok(usesLsfg("/var/home/armada/lsfg /usr/libexec/armada/armada-game-launch %command%"));
  assert.ok(!usesLsfg(ARMADA));
});
