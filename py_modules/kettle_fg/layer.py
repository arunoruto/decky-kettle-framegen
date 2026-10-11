"""Install, update and uninstall the bundled layer for the current user.

The plugin zip carries ``bin/<arch>/`` with the library, its manifest (``library_path``
relative to the manifest) and ``UPSTREAM`` (the kettle-framegen commit it was built from).
They go to ``$XDG_DATA_HOME/vulkan/implicit_layer.d``, where the Vulkan loader finds
implicit layers per user; ``/usr`` is read-only on bootc systems such as Armada.
"""

import hashlib
import json
import os
import platform
import shutil
import tempfile

LIB = "libVkLayer_kettle_framegen.so"
MANIFEST = "VkLayer_kettle_framegen.json"
LAYER_NAME = "VK_LAYER_KETTLE_framegen"
SYSTEM_DIRS = (
    "/usr/share/vulkan/implicit_layer.d",
    "/usr/local/share/vulkan/implicit_layer.d",
    "/etc/vulkan/implicit_layer.d",
)


def arch():
    m = platform.machine()
    return {"arm64": "aarch64", "amd64": "x86_64"}.get(m, m)


def bundled_dir(plugin_dir):
    return os.path.join(plugin_dir, "bin", arch())


def layer_dir(home):
    xdg = os.environ.get("XDG_DATA_HOME")
    base = xdg if xdg else os.path.join(home, ".local", "share")
    return os.path.join(base, "vulkan", "implicit_layer.d")


def _sha256(path):
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for block in iter(lambda: f.read(1 << 16), b""):
                h.update(block)
    except FileNotFoundError:
        return None
    return h.hexdigest()


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return None


def _system_copies():
    """Manifests outside the home directory that declare the same layer name."""
    found = []
    for d in SYSTEM_DIRS:
        try:
            names = os.listdir(d)
        except OSError:
            continue
        for name in names:
            if not name.endswith(".json"):
                continue
            try:
                with open(os.path.join(d, name), encoding="utf-8") as f:
                    if json.load(f).get("layer", {}).get("name") == LAYER_NAME:
                        found.append(os.path.join(d, name))
            except (OSError, ValueError, AttributeError):
                continue
    return found


def status(plugin_dir, home):
    src, dst = bundled_dir(plugin_dir), layer_dir(home)
    bundled = _sha256(os.path.join(src, LIB))
    installed = _sha256(os.path.join(dst, LIB))
    has_manifest = os.path.exists(os.path.join(dst, MANIFEST))
    return {
        "arch": arch(),
        "bundled": bundled is not None,
        "bundledUpstream": _read(os.path.join(src, "UPSTREAM")),
        "installed": installed is not None and has_manifest,
        "upToDate": installed is not None and installed == bundled and has_manifest,
        "path": dst,
        "systemCopies": _system_copies(),
    }


def _copy_atomic(src, dst, mode):
    """Copy through a temporary file and rename, so a running game keeps the file it mapped."""
    d = os.path.dirname(dst)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as out, open(src, "rb") as f:
            shutil.copyfileobj(f, out)
        os.chmod(tmp, mode)
        os.replace(tmp, dst)
    except BaseException:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def install(plugin_dir, home):
    src, dst = bundled_dir(plugin_dir), layer_dir(home)
    if not os.path.exists(os.path.join(src, LIB)):
        raise RuntimeError(f"this plugin build has no layer for {arch()}")
    os.makedirs(dst, exist_ok=True)
    # library first: the manifest makes the loader look for it
    _copy_atomic(os.path.join(src, LIB), os.path.join(dst, LIB), 0o755)
    _copy_atomic(os.path.join(src, MANIFEST), os.path.join(dst, MANIFEST), 0o644)
    return status(plugin_dir, home)


def uninstall(plugin_dir, home):
    dst = layer_dir(home)
    # manifest first, so the loader never finds a manifest without its library
    for name in (MANIFEST, LIB):
        try:
            os.unlink(os.path.join(dst, name))
        except FileNotFoundError:
            pass
    return status(plugin_dir, home)
