# Project Initialization Notes

## Scan Snapshot

- Scan date: 2026-03-27
- Project root: `C:\Users\breeze0305\Downloads\amb工具back`
- Git state at scan time: clean working tree after commit `4dd20c7` (`refactor: clean up CLI and bump to 2.2.1`)
- Python syntax check: `python -c "..."` successfully parsed `main.py` and all `utils/*.py`
- Primary platform assumption: Windows

## Project Summary

This repository is a Windows-oriented CLI assistant for Realtek AMB82-mini development. The tool bundles driver/helper assets, opens the local Arduino package folder, guides camera capture setup, captures frames from connected cameras with OpenCV, copies gesture-recognition resources, exports an image-classification model, checks remote version info, and downloads external installers.

The program is interactive and menu-driven. It relies on local Windows behavior such as `os.startfile`, `cls`, `AppData\Local\Arduino15`, and packaged resource lookup compatible with PyInstaller.

Current release version is `2.2.2`.

## Top-Level Layout

- `.gitignore`
  - Ignores `build/`, `dist/`, `__pycache__/`, `*.pyc`, and several local-only files.
- `main.py`
  - Program entry point.
  - Selects startup language, loads translations, starts the background UVCD patch task, then runs the main menu dispatch loop.
- `utils/`
  - Main application logic split by concern.
- `lang/`
  - Language packs: `zh_TW.json`, `en_US.json`, `ja_JP.json`.
  - These currently drive menu text and prompts; `camera_label` is no longer part of the language schema.
- `gesture_recognition/`
  - Bundled gesture model assets: `hand_code.txt`, `hand_weight.nb`.
- `image_classification_japan/`
  - Bundled image-classification model asset: `img_class_cnn.nb`.
- `CH341SER.EXE`
  - Bundled USB/serial driver installer copied out by the tool.
- `icon.ico`
  - Icon used during packaging.
- `version.txt`
  - Repository version marker, currently `2.2.2`.
  - Keep this in sync with `APP_METADATA["version"]` in `utils/settings.py`.
- `main.spec`
  - PyInstaller spec file for Windows executable packaging.
- `build/`, `dist/`
  - Existing packaging artifacts; treat as generated output, not source of truth.
- `README.md`
  - Human-facing project overview and build notes.
- `agents.md`
  - This file; a current project-state snapshot for future operators/agents.

## Runtime Flow

1. `main.py` calls `select_startup_language()`.
2. The selected locale code is stored in `APP_STATE["language_default"]`.
3. `load_language(APP_STATE["language_default"])` loads the active language pack.
4. `start_background_uvcd_task()` begins a daemon thread that keeps retrying the UVCD patch until it succeeds.
5. The main loop prints menu options from `lang["main_options"]`, reads user input, and dispatches through `_build_main_actions()`.
6. Hidden settings are available by typing `ntnu` at the main prompt.
7. Hidden settings can update both the active language and the actual capture interval used by the OpenCV capture loop.

## Module Responsibilities

### `utils/__init__.py`

Re-exports the public app surface used by `main.py`. This file now exposes both the newer function names and compatibility aliases for older names.

### `utils/settings.py`

Owns configuration, runtime state, path discovery, resource handling, and version checks:

- `APP_METADATA`
  - Author/contact/runtime version metadata.
- `APP_LINKS`
  - GitHub repo URL plus external download/index URLs.
- `APP_STATE`
  - Runtime mutable state such as capture interval, default language, and supported locales.
- `GLOBAL_SETTINGS`
  - A derived merged view used for CLI display in hidden settings.
- `sync_global_settings()`
  - Refreshes `GLOBAL_SETTINGS` from metadata, links, and runtime state.
- `set_language_default()`
  - Updates the selected locale and refreshes the merged settings view.
- `set_capture_interval_seconds()`
  - Updates the runtime capture interval and refreshes the merged settings view.
- `get_capture_interval_seconds()`
  - Returns the active capture interval for the OpenCV capture loop.
- `resource_path()`
  - Resolves bundled files for both source mode and PyInstaller mode.
- `load_language()`
  - Loads translation JSON with fallback to `zh_TW`.
- `select_startup_language()`
  - Startup prompt for language selection.
- `copy_amb_driver()` / `load_amb_driver()`
  - Copies `CH341SER.EXE` into the current working directory.
- `find_amebapro2_root()`
  - Finds the local Arduino Realtek `AmebaPro2` package root.
- `find_uvcd_param_file()`
  - Locates the `UVCD_pram.h` file inside the installed Arduino package.
- `verify_resources()`
  - Checks presence of required bundled files.
- `check_new_version()`
  - Fetches remote `version.txt` from GitHub raw content and compares it with `APP_METADATA["version"]`.

### `utils/fn.py`

General CLI and convenience actions:

- `clear_terminal()`
  - Clears the console.
- `show_hidden_settings()` / `hidden_settings()`
  - Hidden menu for showing merged settings, changing capture interval, and switching language.
- `open_amb82_package_folder()` / `open_amb82_folder()`
  - Opens the detected Arduino Realtek `AmebaPro2` package folder.
- `show_capture_frame_tutorial()` / `teach_for_capture_frame_from_amb()`
  - Prints the setup tutorial for camera capture.

### `utils/get_file.py`

Download and asset-copy helpers:

- `show_preference_link()` / `get_preference_link()`
  - Prints the Realtek package index URL.
- `copy_hand_gesture_files()` / `get_hand_gesture_files()`
  - Copies bundled gesture files to the current working directory.
- `copy_image_classification_model()` / `get_image_classification_model()`
  - Copies the bundled image-classification model to the current working directory.
- `download_file()`
  - Streams a remote download with `requests` and `tqdm`.

### `utils/opencv.py`

Camera and Arduino package patch logic:

- `patch_uvcd_param_file()` / `set_UVCD_pram_file()`
  - Searches the local Arduino Realtek package and rewrites `UVCD_pram.h`.
  - Leaves `UVCD_H264` unchanged and forces other `UVCD_*` defines to `0`.
- `start_background_uvcd_task()`
  - Starts a daemon thread that retries the UVCD patch every 5 minutes until successful.
- `scan_available_cameras()`
  - Scans camera IDs `0..5` and builds preview frames.
- `choose_camera()`
  - Handles camera selection UI when multiple cameras are detected.
- `find_next_image_id()`
  - Determines the next `image_XXXXX.jpg` sequence number under `./output`.
- `capture_loop()`
  - Writes captured frames to disk at the configured interval until interrupted or read failure.
- `capture_frame_from_amb()`
  - Orchestrates camera scan, selection, output directory setup, and timed capture.

## External Dependencies

### Python packages

- `opencv-python`
- `requests`
- `tqdm`
- `pyinstaller` for packaging only

### External paths and OS assumptions

- Windows shell behavior
- `Path.home() / AppData / Local / Arduino15`
- A locally installed Realtek Arduino package under `packages/realtek/hardware/AmebaPro2`
- One or more accessible camera devices for capture mode

### Remote network usage

- Arduino IDE download URL from `APP_LINKS`
- VLC download URL from `APP_LINKS`
- GitHub raw content for version checks
- Realtek/Ameba package index link output

## Packaged Resources

The executable packaging includes:

- `CH341SER.EXE`
- `lang/zh_TW.json`
- `lang/en_US.json`
- `lang/ja_JP.json`
- `gesture_recognition/hand_code.txt`
- `gesture_recognition/hand_weight.nb`
- `image_classification_japan/img_class_cnn.nb`
- `icon.ico`

`main.spec` reflects this packaging setup.

## Existing Build Artifacts

- `build/main/` contains PyInstaller analysis and intermediate files.
- `dist/` currently contains `amb_plugin.exe` and a copied `CH341SER.EXE`.

Note: `main.spec` names the packaged executable `main`, while the current `dist/` directory contains `amb_plugin.exe`. This suggests the checked-in artifact may come from an earlier or alternate packaging command.

## Observed Behaviors and Caveats

- Running the app does more than print menus: it immediately starts a background task that attempts to modify a file inside the user's Arduino package directory.
- Hidden settings now affect the actual capture interval used by `capture_frame_from_amb()`.
- Camera preview overlay text is currently hard-coded as `Camera {id}` in `scan_available_cameras()`.
- `download_file()` still does not include retry, timeout, or HTTP status validation.
- `check_new_version()` compares remote `version.txt` against `APP_METADATA["version"]`, so release changes should update both `version.txt` and `utils/settings.py`.
- Some hard-coded Chinese/Japanese text in `utils/settings.py` still appears garbled in this shell; this looks like an encoding/display issue rather than a syntax failure.
- `main.py` still creates `uvcd_stop_event` from `start_background_uvcd_task()`, but does not explicitly use it during shutdown.
- There is no formal automated test suite in this repository at scan time.

## Useful Operator Notes

- To run from source: `python main.py`
- To package on Windows, the project uses PyInstaller with bundled data files.
- Typing `ntnu` in the main menu opens hidden settings.
- Captured images are written to `./output`.
- Driver, gesture files, and the image-classification model are copied into the current working directory rather than launched or installed automatically.
- When bumping the release, update both `version.txt` and `APP_METADATA["version"]`.

## Suggested Next Maintenance Steps

- Normalize the hard-coded startup prompt strings in `utils/settings.py` if the garbled text reproduces outside this shell.
- Add timeout and HTTP status handling around `requests.get()` calls in `download_file()` and `check_new_version()`.
- Decide whether `build/` and `dist/` should remain in the repository snapshot or stay purely local.
- Consider adding a minimal smoke test or resource validation entrypoint.
