# Ukraine Alarm Tray

A cross-platform desktop tray app for Ukrainian air-raid alerts (drones and missiles).
Pick the oblasts and raions you care about and the tray icon tells you their status at a
glance — red during an alert, green when clear. Hover for the details.

![Settings window](docs/screenshot-settings.png)

## Features

- **Per-region subscriptions.** Choose any combination of oblasts and raions. Selecting an
  oblast covers every raion inside it, and an oblast-wide alert still reaches you if you
  subscribed to just one raion within it.
- **Colour-coded tray icon** — red on alert, green when clear, amber when the status is
  unknown. Switchable to a single neutral icon if you would rather it never change.
- **Hover details.** The tooltip lists every active alert: threat type, region, and how long
  it has been running. The same lines are mirrored into the tray menu (see
  [Linux tooltips](#linux-tooltips)).
- **Optional desktop notifications**, with a separate toggle for the all-clear.
- **Optional sound** — a siren on alert, a softer chime on all-clear, with a volume slider,
  a test button and a mute switch in the tray menu.
- **Two data sources**, switchable at runtime (see [Data sources](#data-sources)).
- **Ukrainian and English** interface. Ukrainian is the default.

## Install

### Ubuntu / Debian (recommended)

Download `ukrainealarm-tray-<version>-amd64.deb` from the
[Releases](https://github.com/Killerkiss/ukrainealarm-tray-app/releases) page, then:

```bash
sudo apt install ./ukrainealarm-tray-0.1.0-amd64.deb
```

Use `apt install ./file.deb` rather than `dpkg -i` so that apt pulls in the dependencies.
The app then appears in your application menu as **Ukraine Alarm Tray**.

To update, install the newer `.deb` over the top. To remove it:

```bash
sudo apt remove ukrainealarm-tray-app
```

Your settings live in `~/.config/Ukraine Alarm Tray/settings.json` and are left behind on
removal — delete that directory too for a clean uninstall.

### AppImage (any Linux, no root)

Useful for a machine where you would rather not install anything system-wide:

```bash
chmod +x ukrainealarm-tray-0.1.0-x86_64.AppImage
./ukrainealarm-tray-0.1.0-x86_64.AppImage
```

The AppImage is self-contained, so it does not create a menu entry by itself. If you want
one, [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) will add it.

### If the tray icon does not appear

GNOME has no built-in tray. Install the indicator extension once per machine:

```bash
sudo apt install gnome-shell-extension-appindicator
```

Then log out and back in, and enable *AppIndicator and KStatusNotifierItem Support* in the
Extensions app. KDE, XFCE, Cinnamon and MATE need nothing extra.

### Build it yourself

```bash
git clone https://github.com/Killerkiss/ukrainealarm-tray-app.git
cd ukrainealarm-tray-app
npm install
npm start              # run from source
npm run package:linux  # writes .deb and .AppImage into release/
```

## Data sources

| | Public mirror (default) | api.ukrainealarm.com |
|---|---|---|
| API key | not needed | required, free |
| Granularity | oblast and raion | oblast, raion and hromada |
| Threat types | air raid only | air raid, artillery, urban fighting, chemical, nuclear |

The app ships with the **public mirror** selected, so it works the moment you launch it. To
use the official API, get a free key from the [`@ukrainealarm_bot`](https://t.me/ukrainealarm_bot)
Telegram bot and paste it into Settings → Data source.

Region ids differ between the two sources, so **switching provider clears your selection** —
you will need to pick your regions again.

> This app reports what its data source reports. Treat it as a convenience, not as your
> primary warning system, and always follow official civil-defence guidance.

## Development

```bash
npm run dev        # Vite dev server + Electron, with main-process auto-restart
npm test           # unit tests (node:test, no framework)
npm run typecheck  # both tsconfigs
npm run build      # compile main + preload, bundle renderer
npm run package    # build an installer for the current platform
```

### Layout

```
src/main/       Electron main process: tray, polling, notifications, sound, settings
src/main/alerts/  pluggable data providers and the polling engine
src/preload/    the single contextBridge surface exposed to the renderer
src/renderer/   settings window (plain TypeScript + CSS, no framework)
src/shared/     types, i18n and settings validation used by both sides
scripts/        asset generators and the dev runner
```

### Generated assets

Tray icons and notification sounds are **generated**, not committed as opaque binaries:

```bash
npm run assets   # rewrites assets/icons and assets/sounds
```

`scripts/generate-icons.mjs` rasterises the warning-triangle mark into PNGs with a small
in-repo encoder (no `sharp`/`canvas` dependency), and `scripts/generate-sounds.mjs`
synthesises the siren and chime as WAV files. Edit the scripts, re-run, commit the result —
CI checks that the committed assets match what the scripts produce.

### Security posture

Context isolation is on, Node integration is off, and the renderer talks to the main process
through six explicit IPC channels. Settings arriving over IPC are re-validated in the main
process rather than trusted, and only `http(s)` URLs are ever handed to the OS handler.

## Platform notes

### Linux tooltips

Tray tooltips are a Windows and macOS feature. Most Linux desktops use app indicators, which
have no hover event at all, so `setToolTip` does nothing there. The app therefore mirrors the
same detail lines into the top of the tray context menu — one click instead of a hover.

You may also need an indicator extension for the tray icon to appear on GNOME
(e.g. AppIndicator and KStatusNotifierItem Support).

### macOS

The app runs as a menu-bar app with no Dock icon (`LSUIElement`).

## License

MIT — see [LICENSE](LICENSE).
