import os

import pytest

from kettle_fg import conf

SAMPLE = """# kettle-framegen defaults (reread while the game runs)
multiplier = 2      # 1 = off, 2, 3 or auto
refresh = 120
dump = /tmp/a#b
custom_thing = keep me
"""


def test_parse_matches_layer_rules():
    v = conf.parse(SAMPLE + 'mode = "blend"\n#flow_scale = 0.3\n')
    assert v["multiplier"] == "2"
    assert v["refresh"] == "120"
    assert v["dump"] == "/tmp/a#b"  # '#' not after whitespace is part of the value
    assert v["mode"] == "blend"
    assert "flow_scale" not in v


def test_last_line_wins():
    assert conf.parse("multiplier = 2\nmultiplier = 3\n")["multiplier"] == "3"


def test_edit_keeps_comments_order_and_unknown_keys():
    out = conf.edit(SAMPLE, {"multiplier": "3", "flow_scale": "0.25"})
    lines = out.splitlines()
    assert lines[0].startswith("# kettle-framegen")
    assert lines[1] == "multiplier = 3 # 1 = off, 2, 3 or auto"
    assert "custom_thing = keep me" in lines
    assert "dump = /tmp/a#b" in lines
    assert lines[-1] == "flow_scale = 0.25"
    assert conf.parse(out)["multiplier"] == "3"


def test_edit_rewrites_every_duplicate_and_removes():
    out = conf.edit("multiplier = 2\nrefresh = 90\nmultiplier = 3\n", {"multiplier": "1", "refresh": None})
    assert out == "multiplier = 1\nmultiplier = 1\n"


def test_edit_rejects_injection():
    with pytest.raises(ValueError):
        conf.edit("", {"multiplier": "2\nstats = true"})
    with pytest.raises(ValueError):
        conf.edit("", {"bad key": "1"})


def test_update_creates_and_is_atomic(tmp_path):
    path = tmp_path / "kettle-framegen" / "123.conf"
    values = conf.update(str(path), {"multiplier": "auto"})
    assert values == {"multiplier": "auto"}
    assert path.read_text().startswith("#")
    assert [p for p in os.listdir(path.parent) if p.endswith(".tmp")] == []


def test_config_path(monkeypatch):
    monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
    assert conf.config_path("/h", "1057090") == "/h/.config/kettle-framegen/1057090.conf"
    assert conf.config_path("/h", "0") == "/h/.config/kettle-framegen/default.conf"
    monkeypatch.setenv("XDG_CONFIG_HOME", "/x")
    assert conf.config_path("/h", "5") == "/x/kettle-framegen/5.conf"
