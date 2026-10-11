import os

from kettle_fg import layer


def _bundle(tmp_path):
    plugin = tmp_path / "plugin"
    b = plugin / "bin" / layer.arch()
    b.mkdir(parents=True)
    (b / layer.LIB).write_bytes(b"\x7fELF v1")
    (b / layer.MANIFEST).write_text('{"layer": {"name": "VK_LAYER_KETTLE_framegen"}}')
    (b / "UPSTREAM").write_text("c900b56\n")
    return plugin


def test_install_update_uninstall(tmp_path, monkeypatch):
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)
    plugin, home = _bundle(tmp_path), tmp_path / "home"
    st = layer.status(str(plugin), str(home))
    assert st["bundled"] and not st["installed"] and st["bundledUpstream"] == "c900b56"

    st = layer.install(str(plugin), str(home))
    assert st["installed"] and st["upToDate"]
    lib = home / ".local/share/vulkan/implicit_layer.d" / layer.LIB
    assert os.stat(lib).st_mode & 0o777 == 0o755

    (plugin / "bin" / layer.arch() / layer.LIB).write_bytes(b"\x7fELF v2")
    assert not layer.status(str(plugin), str(home))["upToDate"]

    st = layer.uninstall(str(plugin), str(home))
    assert not st["installed"] and not lib.exists()
