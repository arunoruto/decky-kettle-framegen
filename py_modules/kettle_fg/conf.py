"""Per-game settings files of kettle-framegen.

The layer reads ``key = value`` lines; ``#`` starts a comment at the start of a line or
after whitespace, quotes and whitespace around keys and values are trimmed, and the last
line for a key wins. Edits here change only the lines of the keys they touch, so comments,
unknown keys and their order survive.
"""

import os
import re
import tempfile

# Keys the plugin edits, with the layer's defaults (README "Settings").
DEFAULTS = {
    "multiplier": "2",
    "refresh": "",
    "min_fps": "0",
    "mode": "motion",
    "flow_scale": "0.5",
    "fifo": "true",
    "preserve_images": "false",
    "stats": "false",
    "latency": "normal",
}

# What a game gets when it is first enabled, unless the user changed the defaults.
# refresh: Adreno 740 has no VK_EXT_present_timing, so auto and min_fps need it set.
# latency: low, as frame generation adds a frame of latency and in Ori on an Adreno 740 the
# previous frame was still queued at 100% of presents (low then held the game ~20 ms later).
PLUGIN_DEFAULTS = {
    "multiplier": "2",
    "refresh": "120",
    "min_fps": "0",
    "mode": "motion",
    "flow_scale": "0.5",
    "latency": "low",
}

_KEY = re.compile(r"^[a-z_]+$")


def config_dir(home):
    xdg = os.environ.get("XDG_CONFIG_HOME")
    base = xdg if xdg else os.path.join(home, ".config")
    return os.path.join(base, "kettle-framegen")


def config_path(home, appid):
    """The file the layer reads for this app id (``default`` for none or 0)."""
    name = str(appid) if appid and str(appid) != "0" else "default"
    return os.path.join(config_dir(home), f"{name}.conf")


def _strip_comment(line):
    for i, ch in enumerate(line):
        if ch == "#" and (i == 0 or line[i - 1].isspace()):
            return line[:i]
    return line


def _trim(s):
    return s.strip().strip('"').strip()


def _parse_line(line):
    """(key, value) of a setting line, else None."""
    body = _strip_comment(line)
    if "=" not in body:
        return None
    key, value = body.split("=", 1)
    return _trim(key), _trim(value)


def parse(text):
    values = {}
    for line in text.splitlines():
        kv = _parse_line(line)
        if kv:
            values[kv[0]] = kv[1]
    return values


def read(path):
    """Settings in the file, or {} when it doesn't exist."""
    try:
        with open(path, encoding="utf-8") as f:
            return parse(f.read())
    except FileNotFoundError:
        return {}


def edit(text, changes):
    """``text`` with ``changes`` applied: a str value sets the key, None removes it.

    Every line of a changed key is rewritten (the layer takes the last one), a comment after
    the value is kept, and keys not in the file yet are appended.
    """
    for key in changes:
        if not _KEY.match(key):
            raise ValueError(f"bad key {key!r}")
    for key, value in changes.items():
        if value is not None and ("\n" in str(value) or "#" in str(value)):
            raise ValueError(f"bad value for {key}: {value!r}")
    lines = text.splitlines()
    out, seen = [], set()
    for line in lines:
        kv = _parse_line(line)
        if not kv or kv[0] not in changes:
            out.append(line)
            continue
        key = kv[0]
        seen.add(key)
        if changes[key] is None:
            continue
        body = _strip_comment(line)
        comment = line[len(body):]
        out.append(f"{key} = {changes[key]}" + (" " + comment.lstrip() if comment else ""))
    for key, value in changes.items():
        if key not in seen and value is not None:
            out.append(f"{key} = {value}")
    return "\n".join(out) + "\n" if out else ""


def write_atomic(path, text):
    """Replace ``path`` in one step, so the layer never reads half a file."""
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def update(path, changes):
    """Apply ``changes`` to the file (created if missing) and return its settings."""
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except FileNotFoundError:
        text = "# kettle-framegen settings, written by decky-kettle-framegen\n"
    text = edit(text, changes)
    write_atomic(path, text)
    return parse(text)
