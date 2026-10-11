# decky-kettle-framegen

A [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin for
[kettle-framegen](https://github.com/kettlelinux/kettle-framegen), a frame generation Vulkan
layer for DXVK, vkd3d-proton and native Vulkan games. From the Quick Access menu it:

- installs, updates and removes the layer for the current user (it is bundled in the plugin),
- turns frame generation on or off per game,
- edits the layer's per-game settings, which apply while the game runs,
- shows whether the layer is active in the running game, and at which multiplier.

Written for and tested on a Retroid Pocket 6 (Snapdragon 8 Gen 2, Adreno 740, Turnip) running
[Armada](https://github.com/armada-os/armada). Nothing in it is tied to Armada, but the
bundled layer is aarch64 only for now.

## Install

In Decky's settings, turn on Developer mode, then under Developer use "Install plugin from
URL" with:

```
https://github.com/arunoruto/decky-kettle-framegen/releases/latest/download/decky-kettle-framegen.zip
```

Installing from the same URL again updates to the newest release. Decky doesn't check URL
installs for updates on its own.

Then open the plugin in the Quick Access menu and press **Install** under Layer. It copies
the layer to `~/.local/share/vulkan/implicit_layer.d/`, so it works with a read-only `/usr`.

## How it works

The layer only loads in games whose environment has `KETTLE_FG=1`. The per-game toggle adds
that to the game's Steam launch options, in front of what is there:

```
KETTLE_FG=1 /usr/libexec/armada/armada-game-launch %command%
```

Turning it off removes it again and leaves the rest alone. A change takes effect the next
time the game starts. Non-Steam shortcuts also get `KETTLE_FG_CONFIG=<path>`, as their
`SteamAppId` may be 0.

If another tool resets the launch options (Armada Control's per-game reset does), the plugin
notices that a game it turned on lost the option and offers to re-apply it.

Settings live in `~/.config/kettle-framegen/<appid>.conf`, the file the layer reads on its
own. The plugin creates it from the defaults the first time a game is turned on, and later
edits only the lines it changes, so comments and other keys stay. The layer rereads the file
twice a second, so changes apply live, except `fifo` and `preserve_images`.

The status comes from `$XDG_RUNTIME_DIR/kettle-framegen/<pid>`, which the layer writes in the
game's process, and from `/proc/<pid>/maps` to tell whether the layer was loaded at all.

## Settings

| Setting | Notes |
| --- | --- |
| Multiplier | 1 (off), 2x, 3x, or Auto |
| Display refresh | Adreno 740 can't report it (no `VK_EXT_present_timing`), so set it for Auto and min fps |
| Flow scale | Resolution of the motion estimate, 0.1 to 1. Lower costs less GPU time |
| Min fps | Below this rendered rate, no generated frames. 0 = no floor (the plugin's default) |
| Latency | Low waits for the previous frame to be shown before the game starts the next |
| Mode | Motion, or Blend (no motion estimation) |
| Stats | Logs GPU time per stage every 2 s |
| Log to file | Adds `PROTON_LOG=1`, so the layer's log lands in `~/steam-<appid>.log`; the panel shows its last lines |

See [upstream's README](https://github.com/kettlelinux/kettle-framegen#settings) for the
details.

Things to know:

- It needs about 50+ rendered fps. Below that, generated frames show more artifacts than they
  smooth.
- The layer's GPU work competes with the game, so a GPU-bound game renders fewer real frames.
- At 2x, the game should render half the refresh rate: 45 fps at 2x on 120 Hz judders, 45 fps
  at 2x on 90 Hz doesn't.
- HDR (FP16) swapchains turn the layer off.
- Don't use it together with Lossless Scaling (lsfg-vk) in the same game; the panel warns.

## Development

The tools come from [devenv](https://devenv.sh) (`devenv shell`, or direnv with the
included `.envrc`). Recipes are in the `justfile`:

```sh
just setup        # pnpm install, upstream submodule
just test         # typecheck, frontend and backend tests
just layer        # build the layer into bin/<arch>/ (Linux only)
just fetch-layer  # or download the aarch64 build from CI
just package      # out/decky-kettle-framegen.zip
just deploy       # copy it to the device and restart Decky (asks for sudo there)
just logs         # follow the plugin's log on the device
just status       # running games with the layer and their multiplier
```

`DECK_HOST` picks the device (default `armada@armada.local`).

The layer is built from the `upstream/kettle-framegen` submodule (pinned commit) against
current Vulkan-Headers, natively on an aarch64 runner in CI, where upstream's tests also run on
lavapipe. Release tags (`v*`) publish the zip.

Layout of the plugin zip:

```
decky-kettle-framegen/
  bin/aarch64/libVkLayer_kettle_framegen.so
  bin/aarch64/VkLayer_kettle_framegen.json    library_path relative to the manifest
  bin/aarch64/UPSTREAM                        kettle-framegen commit
  dist/index.js  main.py  py_modules/  package.json  plugin.json
  LICENSE  LICENSE.kettle-framegen  README.md
```

Other architectures would be another `bin/<arch>/` directory; the backend picks the one for
the machine it runs on.

## Credits and license

kettle-framegen is by the Kettle Linux contributors, under the BSD 3-Clause license
([LICENSE.kettle-framegen](upstream/kettle-framegen/LICENSE), shipped in the zip). This
plugin is BSD 3-Clause too ([LICENSE](LICENSE)) and started from the
[Decky plugin template](https://github.com/SteamDeckHomebrew/decky-plugin-template).
