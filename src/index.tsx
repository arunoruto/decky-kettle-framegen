import {
  ButtonItem,
  ConfirmModal,
  DropdownItem,
  Field,
  PanelSection,
  PanelSectionRow,
  SliderField,
  ToggleField,
  showModal,
  staticClasses,
} from "@decky/ui";
import { definePlugin, toaster, useQuickAccessVisible } from "@decky/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaFilm } from "react-icons/fa";

import * as api from "./backend";
import {
  disableKettle,
  enableKettle,
  kettleEnabled,
  protonLogEnabled,
  setProtonLog,
  usesLsfg,
} from "./launchOptions";
import {
  GameRef,
  gameName,
  getLaunchOptions,
  isShortcut,
  recentGames,
  runningGame,
  setLaunchOptions,
} from "./steam";

const POLL_MS = 1500;

const small = { fontSize: "12px", lineHeight: "16px", opacity: 0.8 } as const;
const warn = { ...small, color: "#ffc82c", opacity: 1 } as const;

function Note({ children, style = small }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <PanelSectionRow>
      <div style={style}>{children}</div>
    </PanelSectionRow>
  );
}

function errorToast(title: string, e: unknown) {
  toaster.toast({ title, body: e instanceof Error ? e.message : String(e) });
}

// Decky unmounts the panel whenever the Quick Access menu isn't visible, which includes while a
// dropdown's menu or a modal is open, so state that has to outlive that lives here.
const kept = new Map<string, unknown>();

function useKept<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(kept.has(key) ? (kept.get(key) as T) : initial);
  const set = useCallback(
    (v: T) => {
      kept.set(key, v);
      setValue(v);
    },
    [key],
  );
  return [value, set];
}

// ---------- settings controls (per game and defaults) ----------

function withCurrent(options: { data: string; label: string }[], value: string) {
  return options.some((o) => o.data === value) ? options : [...options, { data: value, label: value }];
}

function useDebounced(fn: (v: api.Settings) => void, ms = 300) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<api.Settings>({});
  return useCallback(
    (v: api.Settings) => {
      pending.current = { ...pending.current, ...v };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const values = pending.current;
        pending.current = {};
        fn(values);
      }, ms);
    },
    [fn, ms],
  );
}

// Frames only come evenly when the game renders refresh / multiplier fps; below that it judders
function fillHint(refresh: string | undefined): string {
  const hz = Number(refresh);
  if (!(hz > 0)) return "Higher adds more lag, GPU load and heat";
  return `At ${hz} Hz, smooth needs ${Math.round(hz / 2)} rendered fps at 2x, ${Math.round(hz / 3)} at 3x. Higher adds lag and heat`;
}

function SettingsControls({
  values,
  onChange,
}: {
  values: api.Settings;
  onChange: (v: api.Settings) => void;
}) {
  // sliders keep their own value while dragging; writes are debounced
  const [flow, setFlow] = useState(Number(values.flow_scale || 0.5));
  const [minFps, setMinFps] = useState(Number(values.min_fps || 0));
  useEffect(() => setFlow(Number(values.flow_scale || 0.5)), [values.flow_scale]);
  useEffect(() => setMinFps(Number(values.min_fps || 0)), [values.min_fps]);
  const debounced = useDebounced(onChange);

  return (
    <>
      <PanelSectionRow>
        <DropdownItem
          label="Multiplier"
          description={fillHint(values.refresh)}
          rgOptions={withCurrent(
            [
              { data: "1", label: "Off (1x)" },
              { data: "2", label: "2x" },
              { data: "3", label: "3x" },
              { data: "auto", label: "Auto" },
            ],
            values.multiplier || "2",
          )}
          selectedOption={values.multiplier || "2"}
          onChange={(o) => onChange({ multiplier: o.data })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label="Display refresh"
          description="Needed for Auto and min fps on Adreno 740"
          rgOptions={withCurrent(
            [
              { data: "", label: "Not set" },
              { data: "60", label: "60 Hz" },
              { data: "90", label: "90 Hz" },
              { data: "120", label: "120 Hz" },
            ],
            values.refresh || "",
          )}
          selectedOption={values.refresh || ""}
          onChange={(o) => onChange({ refresh: o.data })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label="Flow scale"
          description="Motion estimate resolution; lower is cheaper on the GPU"
          value={flow}
          min={0.1}
          max={1}
          step={0.05}
          showValue
          editableValue
          resetValue={0.5}
          onChange={(v) => {
            const r = Math.round(v * 100) / 100;
            setFlow(r);
            debounced({ flow_scale: String(r) });
          }}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label="Min fps"
          description="Below this rendered rate, no generated frames (0 = no floor)"
          value={minFps}
          min={0}
          max={90}
          step={5}
          showValue
          editableValue
          resetValue={0}
          onChange={(v) => {
            const r = Math.round(v);
            setMinFps(r);
            debounced({ min_fps: String(r) });
          }}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label="Latency"
          rgOptions={[
            { data: "normal", label: "Normal" },
            { data: "low", label: "Low" },
          ]}
          selectedOption={values.latency || "normal"}
          onChange={(o) => onChange({ latency: o.data })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label="Mode"
          rgOptions={[
            { data: "motion", label: "Motion" },
            { data: "blend", label: "Blend" },
          ]}
          selectedOption={values.mode || "motion"}
          onChange={(o) => onChange({ mode: o.data })}
        />
      </PanelSectionRow>
    </>
  );
}

// ---------- per game ----------

function statusText(
  layer: api.LayerStatus | null,
  st: api.GameStatus | null,
  wanted: boolean,
): string {
  if (layer && !layer.installed) return "Layer not installed";
  if (!st || !st.running) return wanted ? "On, starts with the game" : "Off";
  if (st.envDisabled) return "Forced off (DISABLE_KETTLE_FG=1)";
  if (!st.envEnabled) return wanted ? "Restart the game to turn it on" : "Off";
  if (!st.loaded) return "Not loaded (layer missing when the game started?)";
  const live = wanted ? "" : " until the game restarts";
  if (st.multiplier === null) return `Loaded, waiting for the first frame${live}`;
  if (st.multiplier <= 1) return `Loaded, generation off (1x)${live}`;
  return `Active, ${st.multiplier}x${live}`;
}

function GamePanel({
  game,
  layer,
  visible,
}: {
  game: GameRef;
  layer: api.LayerStatus | null;
  visible: boolean;
}) {
  const appid = game.appid;
  const [options, setOptions] = useState<string | null>(null);
  const [cfg, setCfg] = useState<api.GameConfig | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [st, setSt] = useState<api.GameStatus | null>(null);
  const [log, setLog] = useState<api.LogTail | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [opts, c, enabled] = await Promise.all([getLaunchOptions(appid), api.getGame(appid), api.getEnabled()]);
    setOptions(opts);
    setCfg(c);
    setRemembered(enabled.includes(appid));
  }, [appid]);

  useEffect(() => {
    setOptions(null);
    setCfg(null);
    setSt(null);
    setLog(null);
    reload().catch((e) => errorToast("Kettle FG", e));
  }, [reload]);

  const optsOn = options !== null && kettleEnabled(options);
  const logOn = options !== null && protonLogEnabled(options);

  useEffect(() => {
    if (!visible) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api.getStatus(appid);
        if (stop) return;
        setSt(s);
        if (logOn || s.protonLog) setLog(await api.getLog(appid, 6));
      } catch {
        // backend restarting; try again next tick
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [appid, visible, logOn]);

  const editOptions = async (fn: (o: string) => string) => {
    const current = (await getLaunchOptions(appid)) ?? "";
    const next = fn(current);
    if (next !== current && !(await setLaunchOptions(appid, next))) {
      throw new Error("Steam did not take the new launch options");
    }
  };

  const setOn = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        await api.ensureGame(appid);
        const path = isShortcut(appid) ? await api.configPath(appid) : undefined;
        await editOptions((o) => enableKettle(o, path));
      } else {
        await editOptions(disableKettle);
      }
      await api.setEnabled(appid, on);
      await reload();
    } catch (e) {
      errorToast("Could not change launch options", e);
    } finally {
      setBusy(false);
    }
  };

  const change = useCallback(
    async (v: api.Settings) => {
      try {
        setCfg(await api.setGame(appid, v));
      } catch (e) {
        errorToast("Could not save the setting", e);
      }
    },
    [appid],
  );

  const values = cfg?.effective ?? {};
  const missing = remembered && options !== null && !optsOn;

  return (
    <>
      <PanelSection title={game.name}>
        <PanelSectionRow>
          <ToggleField
            label="Frame generation for this game"
            description="Takes effect the next time the game starts"
            checked={optsOn}
            disabled={busy || options === null || (layer !== null && !layer.installed && !optsOn)}
            onChange={setOn}
          />
        </PanelSectionRow>
        {missing && (
          <>
            <Note style={warn}>
              The launch option was removed, maybe by a reset in another plugin.
            </Note>
            <PanelSectionRow>
              <ButtonItem layout="below" disabled={busy} onClick={() => setOn(true)}>
                Re-apply
              </ButtonItem>
            </PanelSectionRow>
          </>
        )}
        <PanelSectionRow>
          <Field label="Status" focusable={false}>
            {statusText(layer, st, optsOn)}
          </Field>
        </PanelSectionRow>
        {((options !== null && usesLsfg(options)) || st?.lsfg) && (
          <Note style={warn}>
            Lossless Scaling (lsfg-vk) is also set up for this game. Use one frame generator at a time.
          </Note>
        )}
      </PanelSection>

      <PanelSection title="Settings (apply live)">
        {cfg && <SettingsControls values={values} onChange={change} />}
        {cfg && <Note>{cfg.path}</Note>}
      </PanelSection>

      <PanelSection title="Diagnostics">
        <PanelSectionRow>
          <ToggleField
            label="Stats"
            description="Logs GPU time per stage every 2 s"
            checked={values.stats === "true"}
            onChange={(on) => change({ stats: on ? "true" : "false" })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Log to file"
            description={`For debugging: PROTON_LOG=1, to ~/steam-${appid}.log, which grows fast. Next game start.`}
            checked={logOn}
            disabled={busy || options === null}
            onChange={async (on) => {
              setBusy(true);
              try {
                await editOptions((o) => setProtonLog(o, on));
                await reload();
              } catch (e) {
                errorToast("Could not change launch options", e);
              } finally {
                setBusy(false);
              }
            }}
          />
        </PanelSectionRow>
        {log && log.lines.length > 0 && (
          <Note>
            <div style={{ fontFamily: "monospace", fontSize: "10px", lineHeight: "13px", wordBreak: "break-word" }}>
              {log.lines.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </Note>
        )}
      </PanelSection>
    </>
  );
}

// ---------- defaults and layer ----------

function DefaultsPanel() {
  const [open, setOpen] = useKept("defaultsOpen", false);
  const [values, setValues] = useState<api.Settings | null>(null);

  useEffect(() => {
    if (open && !values) api.getDefaults().then(setValues, (e) => errorToast("Kettle FG", e));
  }, [open, values]);

  const change = useCallback(async (v: api.Settings) => {
    try {
      setValues(await api.setDefaults(v));
    } catch (e) {
      errorToast("Could not save the defaults", e);
    }
  }, []);

  return (
    <PanelSection title="Defaults for new games">
      <PanelSectionRow>
        <ToggleField label="Show" checked={open} onChange={setOpen} />
      </PanelSectionRow>
      {open && values && (
        <>
          <Note>Used for a game's settings file when you first turn it on.</Note>
          <SettingsControls values={values} onChange={change} />
        </>
      )}
    </PanelSection>
  );
}

function LayerPanel({ layer, setLayer }: { layer: api.LayerStatus | null; setLayer: (l: api.LayerStatus) => void }) {
  const [busy, setBusy] = useState(false);
  if (!layer) return null;

  const run = async (fn: () => Promise<api.LayerStatus>, what: string) => {
    setBusy(true);
    try {
      setLayer(await fn());
    } catch (e) {
      errorToast(`Could not ${what} the layer`, e);
    } finally {
      setBusy(false);
    }
  };

  const state = !layer.bundled
    ? `No layer for ${layer.arch} in this build`
    : !layer.installed
      ? "Not installed"
      : layer.upToDate
        ? "Installed, up to date"
        : "Installed, update available";

  return (
    <PanelSection title="Layer">
      <PanelSectionRow>
        <Field label="kettle-framegen" description={layer.bundledUpstream ? `upstream ${layer.bundledUpstream.slice(0, 7)}` : undefined} focusable={false}>
          {state}
        </Field>
      </PanelSectionRow>
      {layer.bundled && !layer.upToDate && (
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy} onClick={() => run(api.installLayer, "install")}>
            {layer.installed ? "Update" : "Install"}
          </ButtonItem>
        </PanelSectionRow>
      )}
      {layer.installed && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={busy}
            onClick={() =>
              showModal(
                <ConfirmModal
                  strTitle="Uninstall the layer?"
                  strDescription="Games keep their launch options and settings files, but run without frame generation."
                  strOKButtonText="Uninstall"
                  onOK={() => run(api.uninstallLayer, "uninstall")}
                />,
              )
            }
          >
            Uninstall
          </ButtonItem>
        </PanelSectionRow>
      )}
      {layer.systemCopies.length > 0 && (
        <Note style={warn}>Also installed system-wide: {layer.systemCopies.join(", ")}</Note>
      )}
      <Note>
        Needs about 50+ rendered fps. It holds back one real frame, so it adds lag, and its GPU work
        costs real frames, heat and battery. HDR (FP16) swapchains turn it off.
      </Note>
    </PanelSection>
  );
}

// ---------- panel ----------

function Content() {
  const visible = useQuickAccessVisible();
  const [layer, setLayer] = useKept<api.LayerStatus | null>("layer", null);
  const [running, setRunning] = useState<GameRef | null>(runningGame());
  const [choices, setChoices] = useKept<GameRef[]>("choices", []);
  // a game picked from the list, until the running game changes
  const [pick, setPick] = useKept<{ appid: string; running: string | null } | null>("pick", null);
  const picked = pick && pick.running === (running?.appid ?? null) ? pick.appid : null;
  const setPicked = (appid: string | null) =>
    setPick(appid === null ? null : { appid, running: running?.appid ?? null });

  useEffect(() => {
    if (!visible) return;
    setRunning(runningGame());
    api.getLayerStatus().then(setLayer, (e) => errorToast("Kettle FG", e));
    Promise.all([api.listConfigured(), api.getEnabled()])
      .then(([configured, enabled]) => {
        const seen = new Set<string>();
        const list: GameRef[] = [];
        const add = (g: GameRef) => {
          if (!seen.has(g.appid)) {
            seen.add(g.appid);
            list.push(g);
          }
        };
        [...enabled, ...configured].forEach((a) => add({ appid: a, name: gameName(a) }));
        recentGames().forEach(add);
        setChoices(list);
      })
      .catch(() => setChoices(recentGames()));
  }, [visible]);

  const appid = picked ?? running?.appid ?? null;
  const game = appid ? (running?.appid === appid ? running : { appid, name: gameName(appid) }) : null;
  const options = [
    ...(running ? [{ data: running.appid, label: `${running.name} (running)` }] : []),
    ...choices.filter((g) => g.appid !== running?.appid).map((g) => ({ data: g.appid, label: g.name })),
  ];

  return (
    <>
      <PanelSection>
        <PanelSectionRow>
          <DropdownItem
            label="Game"
            menuLabel="Game"
            strDefaultLabel="Pick a game"
            rgOptions={options}
            selectedOption={appid}
            onChange={(o) => setPicked(o.data === running?.appid ? null : o.data)}
          />
        </PanelSectionRow>
      </PanelSection>
      {game && <GamePanel key={game.appid} game={game} layer={layer} visible={visible} />}
      <DefaultsPanel />
      <LayerPanel layer={layer} setLayer={setLayer} />
    </>
  );
}

export default definePlugin(() => ({
  name: "Kettle Frame Generation",
  titleView: <div className={staticClasses.Title}>Kettle FG</div>,
  content: <Content />,
  icon: <FaFilm />,
}));
