<a id="readme-top"></a>

[![Build][build-shield]][build-url]
[![Release][release-shield]][release-url]
[![Issues][issues-shield]][issues-url]
[![License][license-shield]][license-url]

<br />
<div align="center">
  <h3 align="center">decky-kettle-framegen</h3>

  <p align="center">
    Per-game frame generation for Vulkan games on Decky Loader handhelds, powered by
    <a href="https://github.com/kettlelinux/kettle-framegen">kettle-framegen</a>.
    <br />
    <br />
    <a href="#installation"><strong>Install it »</strong></a>
    &middot;
    <a href="https://github.com/arunoruto/decky-kettle-framegen/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/arunoruto/decky-kettle-framegen/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li>
      <a href="#usage">Usage</a>
      <ul>
        <li><a href="#settings">Settings</a></li>
        <li><a href="#things-to-know">Things to know</a></li>
        <li><a href="#how-it-works">How it works</a></li>
      </ul>
    </li>
    <li><a href="#development">Development</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

## About The Project

[kettle-framegen](https://github.com/kettlelinux/kettle-framegen) is a frame generation
Vulkan layer for DXVK, vkd3d-proton and native Vulkan games. This
[Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin manages it from the
Quick Access menu:

* Installs, updates and removes the layer for the current user. It is bundled in the plugin.
* Turns frame generation on or off per game.
* Edits the layer's per-game settings, which apply while the game runs.
* Shows whether the layer is active in the running game, and at which multiplier.

It was written for and tested on a Retroid Pocket 6 (Snapdragon 8 Gen 2, Adreno 740, Turnip)
running [Armada](https://github.com/armada-os/armada). Nothing in it is tied to Armada, but
the bundled layer is aarch64 only for now.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![Decky][decky-shield]][decky-url]
* [![React][react-shield]][react-url]
* [![TypeScript][ts-shield]][ts-url]
* [![Python][python-shield]][python-url]
* [![Vulkan][vulkan-shield]][vulkan-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

### Prerequisites

* An aarch64 Linux handheld with [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)
  and a Vulkan driver (tested: Turnip on Adreno 740)
* Games running through Vulkan: native, DXVK or vkd3d-proton

### Installation

1. In Decky's settings, turn on **Developer mode**.
2. Under **Developer**, use **Install plugin from URL** with:
   ```
   https://github.com/arunoruto/decky-kettle-framegen/releases/latest/download/decky-kettle-framegen.zip
   ```
3. Open **Kettle FG** in the Quick Access menu and press **Install** under **Layer**. It copies
   the layer to `~/.local/share/vulkan/implicit_layer.d/`, so it works with a read-only `/usr`.

To update, install from the same URL again. Decky doesn't check URL installs for updates on
its own. The layer is updated along with the plugin, and your settings stay.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

Start a game, open the Quick Access menu and pick **Kettle FG**. With no game running, pick
one from the list.

1. Turn on **Frame generation for this game**. It takes effect the next time the game starts.
2. Start the game. **Status** shows `Active, 2x` once generated frames go out.
3. Change the settings while you play. They apply within a second.

### Settings

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

**Defaults for new games** sets what a game starts with the first time you turn it on. See
[upstream's README](https://github.com/kettlelinux/kettle-framegen#settings) for details on
each setting.

### Things to know

* It needs about 50+ rendered fps. Below that, generated frames show more artifacts than they
  smooth.
* The layer's GPU work competes with the game, so a GPU-bound game renders fewer real frames.
* At 2x, the game should render half the refresh rate: 45 fps at 2x on 120 Hz judders, 45 fps
  at 2x on 90 Hz doesn't.
* HDR (FP16) swapchains turn the layer off.
* Don't use it together with Lossless Scaling (lsfg-vk) in the same game. The panel warns.

### How it works

The layer only loads in games whose environment has `KETTLE_FG=1`. The per-game toggle adds
that to the game's Steam launch options, in front of what is there:

```
KETTLE_FG=1 /usr/libexec/armada/armada-game-launch %command%
```

Turning it off removes it again and leaves the rest alone. Non-Steam shortcuts also get
`KETTLE_FG_CONFIG=<path>`, as their `SteamAppId` may be 0. If another tool resets the launch
options (Armada Control's per-game reset does), the plugin notices that a game it turned on
lost the option and offers to re-apply it.

Settings live in `~/.config/kettle-framegen/<appid>.conf`, the file the layer reads on its
own. The plugin creates it from the defaults the first time a game is turned on, and later
edits only the lines it changes, so comments and other keys stay. The layer rereads the file
twice a second, except `fifo` and `preserve_images`.

The status comes from `$XDG_RUNTIME_DIR/kettle-framegen/<pid>`, which the layer writes in the
game's process, and from `/proc/<pid>/maps` to tell whether the layer was loaded at all.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

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
current Vulkan-Headers, natively on an aarch64 runner in CI, where upstream's tests also run
on lavapipe. Release tags (`v*`) publish the zip, laid out like this:

```
decky-kettle-framegen/
  bin/aarch64/libVkLayer_kettle_framegen.so
  bin/aarch64/VkLayer_kettle_framegen.json    library_path relative to the manifest
  bin/aarch64/UPSTREAM                        kettle-framegen commit
  dist/index.js  main.py  py_modules/  package.json  plugin.json
  LICENSE  LICENSE.kettle-framegen  README.md
```

Another architecture would be another `bin/<arch>/` directory. The backend picks the one for
the machine it runs on.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- [x] Install, update and remove the layer per user
- [x] Per-game toggle through Steam launch options
- [x] Live settings and status in the Quick Access menu
- [ ] Test on more games and compat tools (x86 Proton through FEX, pressure-vessel)
- [ ] x86_64 builds (with a 32-bit copy for 32-bit games)
- [ ] A native toggle in Armada Control
- [ ] Submit to the Decky plugin store

See the [open issues](https://github.com/arunoruto/decky-kettle-framegen/issues) for known
issues and proposed features.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

Issues and pull requests are welcome. Results from other devices and games are especially
useful: the device, the game, its rendered fps with and without the layer, and the settings
you used.

1. Fork the project
2. Create your branch (`git checkout -b feat/my-change`)
3. Commit your changes (`git commit -m 'feat: my change'`)
4. Push the branch (`git push origin feat/my-change`)
5. Open a pull request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

BSD 3-Clause, see [LICENSE](LICENSE). The bundled kettle-framegen layer is BSD 3-Clause by
the Kettle Linux contributors ([upstream/kettle-framegen/LICENSE](upstream/kettle-framegen/LICENSE),
shipped in the zip as `LICENSE.kettle-framegen`).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Mirza Arnaut, [@arunoruto](https://github.com/arunoruto)

Project: [github.com/arunoruto/decky-kettle-framegen](https://github.com/arunoruto/decky-kettle-framegen)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

* [kettle-framegen](https://github.com/kettlelinux/kettle-framegen) by the Kettle Linux
  contributors, which does all the frame generation
* [Decky plugin template](https://github.com/SteamDeckHomebrew/decky-plugin-template)
* [Armada](https://github.com/armada-os/armada)
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

[build-shield]: https://img.shields.io/github/actions/workflow/status/arunoruto/decky-kettle-framegen/build.yml?branch=main&style=for-the-badge
[build-url]: https://github.com/arunoruto/decky-kettle-framegen/actions/workflows/build.yml
[release-shield]: https://img.shields.io/github/v/release/arunoruto/decky-kettle-framegen?style=for-the-badge
[release-url]: https://github.com/arunoruto/decky-kettle-framegen/releases/latest
[issues-shield]: https://img.shields.io/github/issues/arunoruto/decky-kettle-framegen.svg?style=for-the-badge
[issues-url]: https://github.com/arunoruto/decky-kettle-framegen/issues
[license-shield]: https://img.shields.io/github/license/arunoruto/decky-kettle-framegen.svg?style=for-the-badge
[license-url]: https://github.com/arunoruto/decky-kettle-framegen/blob/main/LICENSE
[decky-shield]: https://img.shields.io/badge/Decky_Loader-1A9FFF?style=for-the-badge&logo=steamdeck&logoColor=white
[decky-url]: https://github.com/SteamDeckHomebrew/decky-loader
[react-shield]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[react-url]: https://react.dev/
[ts-shield]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[ts-url]: https://www.typescriptlang.org/
[python-shield]: https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white
[python-url]: https://www.python.org/
[vulkan-shield]: https://img.shields.io/badge/Vulkan-AC162C?style=for-the-badge&logo=vulkan&logoColor=white
[vulkan-url]: https://www.vulkan.org/
