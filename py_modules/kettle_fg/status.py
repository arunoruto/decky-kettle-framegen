"""What the layer does in a running game.

A game's processes carry ``SteamAppId`` (``SteamGameId`` for non-Steam shortcuts, with the
shortcut's app id in its upper 32 bits). The process that loaded the layer writes
``$XDG_RUNTIME_DIR/kettle-framegen/<pid>`` with ``multiplier=<n>``. In a container such as
pressure-vessel that is the container's runtime dir and the pid is the one in the
container's pid namespace, so it is read through ``/proc/<pid>/root``.
"""

import os

LIB = "libVkLayer_kettle_framegen.so"
LSFG_LIB = "liblsfg-vk"
LOG_PREFIX = "VK_LAYER_KETTLE_framegen:"


def _environ(pid):
    try:
        with open(f"/proc/{pid}/environ", "rb") as f:
            raw = f.read()
    except OSError:
        return None
    env = {}
    for item in raw.split(b"\0"):
        k, sep, v = item.partition(b"=")
        if sep:
            env[k.decode(errors="replace")] = v.decode(errors="replace")
    return env


def _matches(env, appid):
    if env.get("SteamAppId") == appid:
        return True
    gid = env.get("SteamGameId", "")
    if gid == appid:
        return True
    # non-Steam shortcut: 64-bit game id, app id in the upper half
    if gid.isdigit() and int(gid) > 0xFFFFFFFF and str(int(gid) >> 32) == appid:
        return True
    return False


def _maps_has(pid, *names):
    found = set()
    try:
        with open(f"/proc/{pid}/maps", encoding="utf-8", errors="replace") as f:
            for line in f:
                for n in names:
                    if n in line:
                        found.add(n)
    except OSError:
        pass
    return found


def _ns_pid(pid):
    """The pid as the process itself sees it (innermost pid namespace)."""
    try:
        with open(f"/proc/{pid}/status", encoding="utf-8") as f:
            for line in f:
                if line.startswith("NSpid:"):
                    return line.split()[-1]
    except OSError:
        pass
    return str(pid)


def _read_multiplier(path):
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                k, _, v = line.strip().partition("=")
                if k == "multiplier" and v.strip().lstrip("-").isdigit():
                    return int(v)
    except OSError:
        pass
    return None


def _status_file(pid, env):
    rt = env.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
    host = os.path.join(rt, "kettle-framegen", str(pid))
    m = _read_multiplier(host)
    if m is not None:
        return m
    inner = f"/proc/{pid}/root{rt}/kettle-framegen/{_ns_pid(pid)}"
    return _read_multiplier(inner)


def game_status(appid):
    """Status of the layer in the game with this app id (a string)."""
    appid = str(appid)
    result = {
        "running": False,
        "envEnabled": False,
        "envDisabled": False,
        "loaded": False,
        "multiplier": None,
        "lsfg": False,
        "protonLog": False,
        "pids": [],
    }
    try:
        pids = [p for p in os.listdir("/proc") if p.isdigit()]
    except OSError:
        return result
    me = str(os.getpid())
    for pid in pids:
        if pid == me:
            continue
        env = _environ(pid)
        if not env or not _matches(env, appid):
            continue
        result["running"] = True
        kfg = env.get("KETTLE_FG") == "1"
        disabled = env.get("DISABLE_KETTLE_FG") == "1"
        result["envEnabled"] |= kfg
        result["envDisabled"] |= disabled
        result["protonLog"] |= env.get("PROTON_LOG", "") not in ("", "0")
        if env.get("LSFG_PROCESS"):
            result["lsfg"] = True
        names = (LIB, LSFG_LIB) if kfg and not disabled else (LSFG_LIB,)
        found = _maps_has(pid, *names)
        if LSFG_LIB in found:
            result["lsfg"] = True
        if LIB not in found:
            continue
        result["loaded"] = True
        result["pids"].append(int(pid))
        m = _status_file(pid, env)
        if m is not None and (result["multiplier"] is None or m > result["multiplier"]):
            result["multiplier"] = m
    return result



def log_tail(home, appid, lines=12, max_bytes=512 * 1024):
    """The layer's last log lines from Proton's log (``PROTON_LOG=1``), oldest first."""
    path = os.path.join(home, f"steam-{appid}.log")
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - max_bytes))
            data = f.read().decode(errors="replace")
    except OSError:
        return {"path": path, "exists": False, "lines": []}
    out = []
    for line in data.splitlines():
        i = line.find(LOG_PREFIX)
        if i >= 0:
            out.append(line[i + len(LOG_PREFIX):].strip())
    return {"path": path, "exists": True, "lines": out[-lines:]}
