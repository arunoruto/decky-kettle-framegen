import asyncio
import json
import os
import re

import decky

from kettle_fg import conf, layer, status

SETTINGS = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")

# Allowed values per key, as the UI offers them; the layer accepts more.
_NUM = re.compile(r"^\d+(\.\d+)?$")
VALIDATE = {
    "multiplier": lambda v: v in ("1", "2", "3", "auto"),
    "refresh": lambda v: v == "" or (_NUM.match(v) and 0 < float(v) <= 1000),
    "min_fps": lambda v: bool(_NUM.match(v)) and float(v) <= 1000,
    "flow_scale": lambda v: bool(_NUM.match(v)) and 0.1 <= float(v) <= 1,
    "mode": lambda v: v in ("motion", "blend"),
    "latency": lambda v: v in ("normal", "low"),
    "stats": lambda v: v in ("true", "false"),
    "fifo": lambda v: v in ("true", "false"),
    "preserve_images": lambda v: v in ("true", "false"),
}


def _home():
    return decky.DECKY_USER_HOME


def _appid(appid):
    s = str(appid)
    if not s.isdigit():
        raise ValueError(f"bad app id {appid!r}")
    return s


def _clean(values):
    """Validated settings; an empty value removes the key (the layer's default applies)."""
    out = {}
    for key, value in values.items():
        if key not in VALIDATE:
            raise ValueError(f"unknown setting {key!r}")
        value = None if value is None else str(value).strip()
        if value is None or value == "":
            out[key] = None
        elif not VALIDATE[key](value):
            raise ValueError(f"bad value for {key}: {value!r}")
        else:
            out[key] = value
    return out


def _load_settings():
    try:
        with open(SETTINGS, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except (OSError, ValueError):
        pass
    return {}


def _save_settings(data):
    conf.write_atomic(SETTINGS, json.dumps(data, indent=2, sort_keys=True) + "\n")


class Plugin:
    # ---------- layer ----------

    async def get_layer_status(self):
        return layer.status(decky.DECKY_PLUGIN_DIR, _home())

    async def install_layer(self):
        st = await asyncio.to_thread(layer.install, decky.DECKY_PLUGIN_DIR, _home())
        settings = _load_settings()
        settings["layerWanted"] = True
        _save_settings(settings)
        decky.logger.info("layer installed to %s", st["path"])
        return st

    async def uninstall_layer(self):
        st = await asyncio.to_thread(layer.uninstall, decky.DECKY_PLUGIN_DIR, _home())
        settings = _load_settings()
        settings["layerWanted"] = False
        _save_settings(settings)
        decky.logger.info("layer removed from %s", st["path"])
        return st

    # ---------- settings ----------

    async def get_defaults(self):
        return {**conf.PLUGIN_DEFAULTS, **_load_settings().get("defaults", {})}

    async def set_defaults(self, values):
        settings = _load_settings()
        merged = {**settings.get("defaults", {}), **_clean(values)}
        settings["defaults"] = {k: v for k, v in merged.items() if v is not None}
        _save_settings(settings)
        return await self.get_defaults()

    async def get_game(self, appid):
        appid = _appid(appid)
        path = conf.config_path(_home(), appid)
        values = conf.read(path)
        return {
            "path": path,
            "exists": os.path.exists(path),
            "values": values,
            "effective": {**conf.DEFAULTS, **values},
        }

    async def ensure_game(self, appid):
        """Create the game's file from the defaults if it has none yet."""
        appid = _appid(appid)
        path = conf.config_path(_home(), appid)
        if not os.path.exists(path):
            defaults = await self.get_defaults()
            conf.update(path, {k: v for k, v in defaults.items() if v != ""})
            decky.logger.info("created %s", path)
        return await self.get_game(appid)

    async def set_game(self, appid, values):
        appid = _appid(appid)
        await self.ensure_game(appid)
        conf.update(conf.config_path(_home(), appid), _clean(values))
        return await self.get_game(appid)

    async def config_path(self, appid):
        return conf.config_path(_home(), _appid(appid))

    async def list_configured(self):
        try:
            names = os.listdir(conf.config_dir(_home()))
        except OSError:
            return []
        return sorted(n[:-5] for n in names if n.endswith(".conf") and n[:-5].isdigit())

    # Games the user turned on, to notice when another tool removed the launch option
    async def get_enabled(self):
        return _load_settings().get("enabled", [])

    async def set_enabled(self, appid, enabled):
        appid = _appid(appid)
        settings = _load_settings()
        games = set(settings.get("enabled", []))
        if enabled:
            games.add(appid)
        else:
            games.discard(appid)
        settings["enabled"] = sorted(games, key=int)
        _save_settings(settings)
        return settings["enabled"]

    # ---------- running game ----------

    async def get_status(self, appid):
        return await asyncio.to_thread(status.game_status, _appid(appid))

    async def get_log(self, appid, lines=12):
        return await asyncio.to_thread(status.log_tail, _home(), _appid(appid), int(lines))

    # ---------- lifecycle ----------

    async def _main(self):
        # Decky runs _uninstall before installing a new version over this one, so an update
        # removes the layer; put it back (updated) if the user had it installed.
        if _load_settings().get("layerWanted"):
            try:
                st = layer.status(decky.DECKY_PLUGIN_DIR, _home())
                if st["bundled"] and not st["upToDate"]:
                    await asyncio.to_thread(layer.install, decky.DECKY_PLUGIN_DIR, _home())
                    decky.logger.info("layer (re)installed to %s", st["path"])
            except Exception:
                decky.logger.exception("could not install the layer")

    async def _unload(self):
        pass

    async def _uninstall(self):
        # Also runs before an update; _main of the new version reinstalls it then.
        try:
            layer.uninstall(decky.DECKY_PLUGIN_DIR, _home())
            decky.logger.info("layer removed")
        except Exception:
            decky.logger.exception("could not remove the layer")
