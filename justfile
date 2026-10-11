# Device to deploy to; override with DECK_HOST=user@host just deploy
host := env("DECK_HOST", "armada@armada.local")
plugin := "decky-kettle-framegen"
repo := "arunoruto/decky-kettle-framegen"

default:
    @just --list

# Install frontend dependencies and fetch the pinned upstream layer source
setup:
    git submodule update --init
    pnpm install

# Build the frontend into dist/
build:
    pnpm build

# Typecheck, then run the frontend and backend tests
test:
    pnpm typecheck
    pnpm test
    python -m pytest -q

# Build the layer into bin/<arch>/ (Linux only; the CI does this for aarch64)
layer *env:
    {{ env }} scripts/build-layer.sh

# Download the aarch64 layer from the latest successful CI build of this branch
fetch-layer branch="main":
    rm -rf bin/aarch64 && mkdir -p bin
    gh run download --repo {{ repo }} \
      $(gh run list --repo {{ repo }} --workflow build.yml --branch {{ branch }} --status success --limit 1 --json databaseId -q '.[0].databaseId') \
      --name layer-aarch64 --dir bin/aarch64
    ls -l bin/aarch64

# Build the plugin zip into out/
package: build
    scripts/package.sh

# Copy the packaged plugin to the device and restart Decky (asks for the sudo password there)
deploy: package
    rsync -a --delete out/{{ plugin }}/ {{ host }}:/tmp/{{ plugin }}/
    ssh -t {{ host }} 'sudo rsync -a --delete --chown=root:root /tmp/{{ plugin }}/ ~/homebrew/plugins/{{ plugin }}/ && sudo systemctl restart plugin_loader'

# Follow the plugin's backend log on the device
logs:
    ssh {{ host }} 'tail -n 50 -F "$(ls -t ~/homebrew/logs/{{ plugin }}/*.log | head -1)"'

# Show what the layer does in running games on the device
status:
    ssh {{ host }} 'for f in /run/user/$(id -u)/kettle-framegen/*; do [ -e "$f" ] || continue; p=${f##*/}; echo "pid $p: $(cat $f), app $(tr "\0" "\n" </proc/$p/environ 2>/dev/null | sed -n "s/^SteamAppId=//p"), maps $(grep -c kettle /proc/$p/maps 2>/dev/null)"; done; ls ~/.config/kettle-framegen/'

# Check that the installed layer loads (vulkaninfo on the device)
check-layer:
    ssh {{ host }} 'VK_LOADER_DEBUG=error,warn KETTLE_FG=1 vulkaninfo --summary 2>&1 | grep -i -E "kettle|error"'

clean:
    rm -rf dist out build bin
