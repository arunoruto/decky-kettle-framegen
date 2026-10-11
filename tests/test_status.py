from kettle_fg import status


def test_matches_steam_and_shortcut_ids():
    assert status._matches({"SteamAppId": "1057090"}, "1057090")
    assert not status._matches({"SteamAppId": "1"}, "1057090")
    shortcut = 3000000000
    gid = str((shortcut << 32) | 0x02000000)
    assert status._matches({"SteamAppId": "0", "SteamGameId": gid}, str(shortcut))


def test_log_tail(tmp_path):
    log = tmp_path / "steam-42.log"
    log.write_text(
        "noise\n"
        "1234.5:0110:fixme: VK_LAYER_KETTLE_framegen: on Turnip Adreno (TM) 740\n"
        "VK_LAYER_KETTLE_framegen: gpu ms: copy 0.2 pyramid 0.4\n"
    )
    out = status.log_tail(str(tmp_path), "42")
    assert out["exists"]
    assert out["lines"] == ["on Turnip Adreno (TM) 740", "gpu ms: copy 0.2 pyramid 0.4"]
    assert status.log_tail(str(tmp_path), "7")["exists"] is False


def test_read_multiplier(tmp_path):
    p = tmp_path / "123"
    p.write_text("multiplier=2\n")
    assert status._read_multiplier(str(p)) == 2
    assert status._read_multiplier(str(tmp_path / "missing")) is None
