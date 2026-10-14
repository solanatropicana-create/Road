# Underfoot · desktop

An Electron shell around the web build, for a desktop release (Windows first; Linux and the Steam Deck through the same build).

```sh
npm run build:desktop          # at the repo root: vite build, copied into desktop/app
npm --prefix desktop install   # once
npm --prefix desktop start     # run it
npm --prefix desktop run dist:win    # release/Underfoot-<version>-win.zip
npm --prefix desktop run dist:linux  # release/linux-unpacked
```

- Saves, settings and the error log are the game's own (IndexedDB and localStorage), kept by Electron in the user-data folder.
- The window never navigates away from the game; links open in the system browser.
- If the page crashes it is noted in `crash.log` in the user-data folder and reloaded (the colony autosaves).
- Not yet: Steamworks (achievements, cloud saves), code signing, an installer.
