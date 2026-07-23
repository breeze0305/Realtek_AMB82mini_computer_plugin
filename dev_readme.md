# Realtek AMB82-mini Computer Plugin 開發交接文件

這份文件是未來理解與修改本專案的主要入口。讀完後應該能知道：這個程式有哪些功能、前後端怎麼分工、常見功能要改哪裡、版本號如何由 `version.txt` 統一管理，以及 commit / push 的工作習慣。

目前軟體版本：`3.12.2`

> 注意：`dev_readme.md` 目前會納入 git 追蹤。若交接內容或維護流程有變更，應和相關程式碼一起 commit。

## 專案定位

本專案是 Realtek AMB82-mini 開發用的 Windows 桌面工具，技術上是 Tauri 2 + React + TypeScript + Rust。它把原本偏 CLI / 手動操作的流程包成桌面 UI，協助使用者取得驅動與範例資源、下載常用工具、開啟 Realtek Arduino package、使用 AMB UVC 相機截圖，以及設定 AMB UVC device 輸出格式。

目前不使用 RTSP 預覽，也不使用 Windows Media Foundation worker。RTSP / Media Foundation 方案已廢除並回到 WebView `getUserMedia` 的 UVC 相機流程。

## 技術棧

- Frontend：React 18、TypeScript、Vite
- Desktop shell：Tauri 2
- Backend：Rust
- UI icon：`lucide-react`
- Windows bundle：Tauri NSIS

## Current frontend architecture (3.12.2)

This section is the authoritative source map for the current frontend. Some older notes below may still mention the pre-refactor shape where most UI lived in `src/App.tsx`; when in doubt, follow this section.

- `src/App.tsx`
  - App controller only: dashboard/view state, running action state, Tauri `invoke` calls, camera flow, converter flow, version-check state, and wiring child views together.
- `src/types.ts`
  - Shared frontend types for dashboard/settings/download/converter/version-check/view/action data.
- `src/i18n.ts`
  - `translations`, `languageNames`, `installActionLabels`, `cameraGuideSteps`, and `PREFERENCE_COPY_MESSAGE`.
- `src/appConfig.ts`
  - Frontend constants: toast timing, releases URL, localStorage keys, UVC options, and converter model defaults.
- `src/converterUtils.ts`
  - Pure helpers: UVC option label, saved-photo text, converter API URL normalization, file-extension checks, `wait`, and API JSON parsing.
- `src/homeCards.ts`
  - Home menu card composition. Add or change home cards here, including the version-check card.
- `src/components/`
  - `AppHeader.tsx`: app title, back button, language menu, settings entry.
  - `LinkPanel.tsx`: GitHub repository and AMB Preference link panel.
  - `HomeView.tsx`: home grid/card/split-action rendering.
  - `SettingsView.tsx`: settings page UI, including auto update check, Preference version, UVC format, and reset.
  - `CameraView.tsx`: camera page UI.
  - `ConverterView.tsx`: model converter page UI.
  - `AnnotationView.tsx`: object detection labeling UI, including folder loading, class management, image navigation, box drawing/moving/resizing, and current-image reset.
  - `NetworkStatus.tsx`: online/offline status indicator.
- `src/styles.css`
  - Shared styling for shell, header, home cards, settings, camera, converter, annotation workspace, toast, and network status.

Version-check behavior:

- Rust `check_version` still lives in `src-tauri/src/lib.rs`.
- Remote version URLs live in `src-tauri/endpoint_manifest.json`.
- The home version card is built in `src/homeCards.ts`.
- If a newer remote version is found, the card label changes from check to update and opens `RELEASES_URL`.
- Version-check results persist in browser `localStorage` under `VERSION_CHECK_STORAGE_KEY`.
- The settings page has an auto update check switch. It defaults to enabled and persists under `AUTO_UPDATE_CHECK_STORAGE_KEY`.
- When auto update check is enabled, startup automatically calls `check_version`; if a newer version exists, the app shows a toast and keeps the button in update mode.

Object detection annotation behavior:

- The home annotation card is built in `src/homeCards.ts` and opens `view === "annotator"`.
- `src/components/AnnotationView.tsx` owns the annotation workspace UI and local interaction state.
- Tauri drag/drop is enabled in `src-tauri/tauri.conf.json` so a folder path can be received by `getCurrentWebview().onDragDropEvent`.
- Rust annotation commands live in `src-tauri/src/lib.rs`: `select_annotation_folder`, `load_annotation_folder`, `read_annotation_image`, `save_annotation_classes`, `save_annotation_file`, and `save_annotation_workspace`.
- The backend creates `{image-folder-name}_labels` beside the selected image folder, reads/writes `classes.txt`, and stores one YOLO `.txt` file per image.
- The frontend reads image bytes through `read_annotation_image`, converts them to a Blob URL, and avoids `assetProtocol` permissions.
- Label rows use YOLO normalized values: `<class_id> <x_center> <y_center> <width> <height>`.
- Box edits autosave silently; save errors still surface through the shared toast.


## 重要檔案

- `src/App.tsx`
  - 前端主 UI。
  - 多語系文字表。
  - 主選單卡片。
  - 語言切換。
  - 設定頁。
  - AMB 相機預覽與截圖流程。
  - Tauri command 呼叫。

- `src/styles.css`
  - 可調整視窗的 UI 與 responsive 樣式。
  - 主選單卡片、語言 dropdown、設定頁、相機頁、toast、網路狀態燈。

- `src-tauri/src/lib.rs`
  - Tauri command 實作。
  - metadata / dashboard。
  - 檔案另存、下載、版本檢查。
  - 輸出資料夾管理。
  - 相機截圖儲存。
  - UVC device 格式設定持久化。
- `UVCD_pram.h` 背景覆寫。
- AMB Preference release / beta 版本連結切換。
  - 內嵌資源讀取。

- `src-tauri/src/main.rs`
  - Tauri 程式入口。
  - release 使用 Windows GUI subsystem，不顯示黑色 terminal。

- `src-tauri/tauri.conf.json`
  - 視窗大小、bundle 設定、產品名稱、Tauri app version。
  - 主視窗預設為 `1180 × 760`，最小為 `1120 × 640`；最小寬度會保持首頁卡片雙欄排列，並容納標註工作區的正常三欄版面。

- `src-tauri/endpoint_manifest.json`
  - 外部端點集中設定。
  - 包含 GitHub repository、版本檢查 URL、Arduino / VLC 下載 URL 與 fallback、Realtek package URL、模型轉換服務 URL、網路檢查 URL。
  - 若外部服務改版、下載來源失效、需要新增 mirror，優先改這裡。

- `src-tauri/Cargo.toml`
  - Rust crate 設定與 Tauri 版本鎖定。

- `package.json`
  - Node scripts、前端依賴、npm package version。

- `resource/`
  - 建置時被 Rust `include_bytes!` 內嵌進 exe 的原始資源。
  - 目前包含 CH341SER、手勢追蹤程式碼/權重、影像分類權重。

- `readme.md`
  - 使用者面向 README。

- `version.txt`
  - 遠端版本檢查會讀 GitHub main branch 上的這個檔案。

## 目前功能總覽

### 主畫面

主畫面由 `src/App.tsx` 的 `mainCards` 與 `fileCards` 組成。

目前功能卡包含：

- CH340/CH341 安裝檔
- 手勢-自走車追蹤程式碼/權重
- 影像分類權重（日本版本）
- 影像分類權重（台灣版本）
- Arduino IDE 安裝檔
- VLC 安裝檔
- 開啟 AmebaPro2 資料夾
- AMB 相機畫面擷取
- 模型轉換網站
- 版本檢查

設定入口不是主選單卡片。設定按鈕位於右上角語言選單旁邊。

### 語言切換

- 前端文字在 `src/App.tsx` 的 `translations` 物件。
- 支援 `zh_TW`、`en_US`、`ja_JP`。
- 語言狀態會透過 Rust `set_language` 存進 `%LOCALAPPDATA%\AMB82 Mini Computer Plugin\settings.json`。

新增 UI 文字時，要同時補三種語言，否則 TypeScript 型別會報錯或 UI 文字不完整。

### 檔案取得

前端卡片對應後端 command：

| UI 項目 | 前端 command | 來源 | 預設檔名 |
| --- | --- | --- | --- |
| CH340/CH341 安裝檔 | `save_driver_as` | `resource/CH341SER.EXE` | `CH341SER.EXE` |
| 手勢-自走車追蹤程式碼/權重 | `save_hand_resources_as` | `resource/gesture_recognition/*` | `hand_code.txt`, `yolov7_tiny.nb` |
| AMB盒子-自走車追蹤程式碼/權重 | `save_object_detection_box_resources_as` | `resource/object_detection_box/*` | `code.txt`, `yolov7_tiny.nb` |
| 日本影像分類權重 | `save_image_model_japan_as` | `resource/image_classification_japan/img_class_cnn.nb` | `img_class_cnn.nb` |
| 台灣影像分類權重 | `save_image_model_taiwan_as` | `resource/image_classification_taiwan/img_class_cnn.nb` | `img_class_cnn.nb` |
| Arduino IDE | `download_arduino_ide_as` | Arduino 官方下載 URL | URL 檔名 |
| Arduino IDE 自動安裝 | `download_and_install_arduino_ide` | Arduino MSI URL | temp 目錄 |
| VLC | `download_vlc_as` | VLC 下載 URL | URL 檔名 |
| VLC 自動安裝 | `download_and_install_vlc` | VLC 下載 URL | temp 目錄 |

注意：

- `01` 到 `04` 使用內嵌資源，不需要外網。
- Arduino / VLC 需要外網，無外網時 UI 會停用。
- Arduino / VLC 的卡片都有 split button，主按鈕下載，旁邊選單自動安裝。
- VLC 自動安裝會下載 `vlc-3.0.23-win32.exe` 到 temp，然後用 `/S` 靜默安裝。
- 下載進度由 Rust emit `download-progress` event，前端顯示卡片覆蓋式進度。
- 內嵌資源優先邏輯：若 exe 同目錄附近有外部 `resource/` 覆寫檔，會優先使用外部檔；找不到才用 binary 內嵌 bytes。

### AMB 相機畫面擷取

相機頁在 `src/App.tsx`，使用 WebView 的 `navigator.mediaDevices`：

- 進入相機頁後自動要求 camera permission。
- 掃描 `videoinput` 裝置。
- 自動選第一個 camera 並開始預覽。
- 使用者可用下拉選單切換 camera。
- 按「開始截圖」後，前端把 `<video>` 畫到 canvas，再轉 JPEG bytes。
- JPEG bytes 呼叫 Rust `save_capture_image`。

截圖輸出：

- 預設輸出到程式工作目錄底下的 `output/`。
- 檔名格式：`image_00001.jpg`、`image_00002.jpg`。
- 若資料夾已有圖片，會接續最大序號。
- 使用者可在本次執行期間用「選擇資料夾」改 output 位置。
- 資料夾選擇器以主視窗為 owner-modal；開啟期間固定在 Plugin 上方並鎖住主視窗，取消或完成後恢復操作。
- output 位置目前只存在 runtime state，重開程式會回到預設。

相機頁底部有 UVC 相機設定教學，文字在 `cameraGuideSteps`。

### 設定頁、Preference version 與 UVC device 格式

設定入口在右上角語言選單旁的齒輪按鈕。設定頁目前包含 AMB Preference 版本切換、UVC device 屬性設定、簡易警告文字，以及恢復預設設定按鈕。

Preference version：

- UI 是 release / beta 的雙切開關。
- 預設是 `beta`，開關顯示為 beta 開啟。
- 選 `beta` 時，主畫面常駐顯示的 AMB Preference link 使用 `REALTEK_PACKAGE_BETA_URL`。
- 選 `release` 時，主畫面常駐顯示的 AMB Preference link 使用 `REALTEK_PACKAGE_RELEASE_URL`。
- 設定會存進 `settings.json` 的 `preference_version`。
- 如果未來要換連結，改 `src-tauri/src/lib.rs` 的 `REALTEK_PACKAGE_BETA_URL` / `REALTEK_PACKAGE_RELEASE_URL`。

Reset：

- UI 文字提醒使用者：如果不知道這些設定用途，請不要變更。
- Reset 按鈕會把設定頁參數恢復成 `preference_version = beta`、`uvcd_format = MJPG`。
- Reset 會寫回 `settings.json`，並嘗試把 `UVCD_pram.h` 也修回 MJPG。
- Reset 不會變更語言設定。

可選格式：

- `YUY2`
- `NV12`
- `MJPG`，預設，UI 顯示 `MJPG (預設/default/既定)`
- `H264`
- `H265`

設定儲存位置：

```text
%LOCALAPPDATA%\AMB82 Mini Computer Plugin\settings.json
```

設定資料由 Rust `Settings` struct 管理，目前包含：

- `capture_interval`
- `language`
- `uvcd_format`
- `preference_version`

選擇格式後：

1. 前端呼叫 `set_uvcd_format`。
2. Rust 驗證格式是否合法。
3. Rust 寫入 `settings.json`。
4. Rust 立即嘗試修正 Realtek Arduino package 裡的 `UVCD_pram.h`。

### UVCD_pram.h 背景覆寫

程式啟動時，`src-tauri/src/lib.rs` 的 `run()` 會讀取 settings，並在 Tauri `.setup()` 裡啟動 `start_uvcd_worker`。

目標檔案位置：

```text
%USERPROFILE%\AppData\Local\Arduino15\packages\realtek\hardware\AmebaPro2\<版本>\libraries\USB\src\UVCD_pram.h
```

版本資料夾尋找方式：

- 進入 `AmebaPro2` 目錄。
- 讀取底下所有版本資料夾。
- 排序後取最後一個。

覆寫規則：

- 逐行匹配 `#define UVCD_* 數字`。
- 使用者選定格式對應的 define 設為 `1`。
- 其他 `UVCD_*` define 設為 `0`。
- 不會修改 `VIDEO_FHD_WIDTH_UVCD` 這類不是 `UVCD_` 開頭的 define。

範例，選 `MJPG`：

```c
#define UVCD_YUY2 0
#define UVCD_NV12 0
#define UVCD_MJPG 1
#define UVCD_H264 0
#define UVCD_H265 0
```

如果 Realtek Arduino package 還沒安裝或找不到 `UVCD_pram.h`：

- 啟動背景 worker 會每 300 秒重試。
- 設定頁選擇格式時仍會先儲存設定，再回報找不到檔案的訊息。

使用者改完格式後，仍需要重新燒錄 AmebaUSB / UVC_device，AMB 裝置才會用新格式重新列舉。

### 版本檢查

版本檢查卡呼叫 Rust `check_version`：

- 本機版本：Rust 以 `include_str!` 讀取 repo 根目錄的 `version.txt`。
- 遠端版本：`src-tauri/endpoint_manifest.json` 的 `version_check.urls` 指到 GitHub main branch 的 `version.txt`，並可依序嘗試 fallback URL。
- 版本比較會依序比較 major、minor、patch。
- 若遠端版本大於本機版本，顯示 `偵測到新版本: <遠端版本>`。
- 若本機版本大於遠端版本，視為開發者 / beta 版本，顯示 `當前為beta版本`。
- 若版本一致，顯示目前為最新版。

### Toast 與狀態回饋

- 前端 `status` state 控制 toast。
- Toast 顯示 1.5 秒後淡出。
- 下載進度不是 toast，而是卡片覆蓋進度條。
- 主畫面 `AMB Preference` 連結點擊後會複製目前選定的 Realtek package URL，並顯示專用提示：
  `已複製，請到Arduino IDE左上角 File -> Preferences -> Additional boards manager URLs 貼上 建議版本選擇 4.0.9`
- `AMB Preference` 專用提示會顯示一般 toast 兩倍時間；相關常數在 `src/App.tsx` 的 `TOAST_DISPLAY_MS`、`TOAST_FADE_MS`、`PREFERENCE_COPY_MESSAGE`。

## 修改指南

### 新增主選單卡片

1. 如果是前端純操作，直接在 `src/App.tsx` 的 `mainCards` 新增項目。
2. 如果需要 Rust 功能：
   - 在 `src-tauri/src/lib.rs` 新增 `#[tauri::command]` function。
   - 加到 `tauri::generate_handler![...]`。
   - 前端用 `invoke<ReturnType>("command_name", args)` 呼叫。
3. 補 `translations` 三語文字。
4. 補 CSS，盡量沿用現有 card / button class。
5. 跑 `npm.cmd run build` 和必要的 Rust 測試。

### 新增可下載或可另存資源

內嵌資源流程：

1. 把檔案放到 `resource/`。
2. 在 `src-tauri/src/lib.rs` 的 `EMBEDDED_RESOURCES` 加一筆 `include_bytes!`。
3. 新增或重用 `save_one_resource_as` / `save_resource_set_as`。
4. 在前端新增卡片與 command 對應。

網路下載流程：

1. 在 `src-tauri/endpoint_manifest.json` 新增或更新 URL。
2. 每個 `urls` 陣列的第一個網址會用來決定預設檔名；後面的網址是 fallback mirror。
3. Rust 端使用 `download_url_as` / `download_to_path_with_fallback` 依序嘗試 `urls`。
4. 若要進度條，給固定 download key，並在前端 `DownloadKey` 加上該 key。
5. 若要自動安裝，新增對應的 `download_and_install_*` command，並在前端 `menuActions` 接 split button。

### 修改相機功能

前端相機流程集中在 `src/App.tsx`：

- `openCameraView`
- `scanCameras`
- `startPreview`
- `startCapture`
- `captureFrame`
- `selectCamera`
- `stopCamera`

後端儲存集中在 `src-tauri/src/lib.rs`：

- `save_capture_image`
- `output_dir`
- `next_image_path`
- `select_output_folder`
- `open_output_folder`

### 修改 UVC 格式設定

前端：

- `UvcdFormat` type
- `uvcdFormatOptions`
- `uvcdOptionLabel`
- `changeUvcdFormat`
- 設定頁 JSX

後端：

- `DEFAULT_UVCD_FORMAT`
- `SUPPORTED_UVCD_FORMATS`
- `Settings.uvcd_format`
- `set_uvcd_format`
- `normalize_uvcd_format`
- `repair_uvcd`
- `repair_uvcd_content`

測試：

- `repair_uvcd_content_enables_mjpg_and_disables_other_uvcd_formats`
- `repair_uvcd_content_enables_selected_format`
- `normalize_uvcd_format_accepts_yuy2`

### 修改 AMB Preference 版本切換

前端：

- `PreferenceVersion` type
- `selectedPreferenceVersion`
- `changePreferenceVersion`
- `resetSettings`
- 設定頁 `.segmentedToggle` JSX
- 主畫面 AMB Preference link 顯示 `dashboard.metadata.realtek_package_url`

後端：

- `src-tauri/endpoint_manifest.json`
  - `realtek_packages.beta.urls`
  - `realtek_packages.release.urls`
  - `version_check.urls`
  - `downloads.*.urls`
  - `model_converter.site_url`
  - `model_converter.api_base`
  - `internet_check_urls`
- `DEFAULT_PREFERENCE_VERSION`
- `SUPPORTED_PREFERENCE_VERSIONS`
- `Settings.preference_version`
- `set_preference_version`
- `reset_settings`
- `normalize_preference_version`
- `preference_url`
- `metadata(preference_version)`

測試：

- `preference_url_uses_beta_by_default_and_release_when_selected`

### 修改 UI 比例或樣式

主要改 `src/styles.css`。

常用區塊：

- app shell / header：`.appShell`, `.appHeader`, `.headerActions`
- 語言與設定按鈕：`.languageSelect*`, `.settingsIconButton`
- 主選單：`.menuGrid`, `.menuCard`, `.primaryBtn`
- 設定頁：`.settingsShell`, `.settingsPageHeader`, `.settingsSection`, `.settingsRow`, `.settingsField`, `.segmentedToggle`
- 相機頁：`.cameraSection`, `.videoFrame`, `.cameraControls`, `.cameraGuide`
- toast：`.feedbackToast`

UI 原則：

- 桌面工具要保持操作密度，不做 landing page。
- 避免卡片套卡片。
- 設定頁保持簡單，不顯示全局資訊。
- 用 lucide icon，不手刻 SVG icon。
- 固定尺寸控制，避免文字或 hover 造成 layout shift。

## 版本號更新清單

目前版本是 `3.12.2`。未來更新版本時，只手動修改 repo 根目錄的 `version.txt`。

`npm run sync-version` 會把 `version.txt` 同步到：

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `readme.md`
- `dev_readme.md`

Rust 執行時的本機版本與 HTTP user agent 會直接從 `version.txt` 讀取，不再於 `src-tauri/src/lib.rs` 維護一份版本常數。

`npm run dev` 與 `npm run build` 會各自透過 `predev` / `prebuild` 自動執行一次 `npm run sync-version`。Tauri 的 `beforeDevCommand` 與 `beforeBuildCommand` 會呼叫這兩個 script，因此不再另外使用 `pretauri` 重複同步。同步腳本只有在內容變更時才寫入檔案；`npm run check:version` 可在不寫檔的情況下檢查版本是否一致。

版本更新建議流程：

```powershell
npm.cmd run build
cargo test --manifest-path src-tauri\Cargo.toml
npm.cmd run tauri build
```

確認產物：

```text
src-tauri/target/release/amb82-mini-computer-plugin.exe
src-tauri/target/release/bundle/nsis/AMB82 Mini Computer Plugin_<version>_x64-setup.exe
```

常見踩坑：

- 如果 release exe 正在執行，Windows 會鎖住檔案，`npm.cmd run tauri build` 可能在 linker 階段出現 `LNK1104`。先關閉 AMB82 程式再 build。

## 開發與建置指令

安裝 Node 依賴：

```powershell
npm install
```

如果 PowerShell execution policy 擋住 `npm.ps1`，改用：

```powershell
npm.cmd install
```

前端 build：

```powershell
npm.cmd run build
```

前端 lint、格式檢查與測試：

```powershell
npm.cmd run lint
npm.cmd run format:check
npm.cmd run test
```

一次執行前端完整檢查：

```powershell
npm.cmd run check
```

GitHub Actions 會在 push 與 pull request 時於 Windows 執行前端完整檢查、Rust format、Clippy 與 Rust tests。

啟動前端 dev server：

```powershell
npm.cmd run dev
```

啟動 Tauri dev：

```powershell
npm.cmd run tauri dev
```

Rust check：

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```

Rust test：

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
```

產生 Windows release exe 與 NSIS installer：

```powershell
npm.cmd run tauri build
```

## 測試建議

基本測試：

1. 啟動 exe，不出現黑色 terminal。
2. 視窗可以調整大小與最大化；縮小到 `1120 × 640` 後不能再縮小，首頁卡片仍維持雙欄排列。
3. 語言切換正常。
4. 右上設定按鈕可進入設定頁。
5. 設定頁切換 `YUY2`、`NV12`、`MJPG`、`H264`、`H265` 後，`settings.json` 有保存。
6. 設定頁切換格式後，`UVCD_pram.h` 被覆寫為選定格式 `1`、其他格式 `0`。
7. 主選單檔案另存功能正常。
8. 無外網時下載與版本檢查停用。
9. 有外網時 Arduino / VLC 下載進度正常。
10. 相機頁可掃描 camera、預覽、截圖。
11. 輸出圖片序號會接續既有最大編號。
12. 相機頁開啟「選擇資料夾」時，對話框保持在主視窗上方，主視窗不可操作；取消或完成後恢復操作。

## 已知限制

- 單檔 exe 仍需要 Windows WebView2 Runtime。
- 輸出資料夾目前只保存在 runtime state，重開程式會回到預設 `./output`。
- 拍照間隔目前沒有 UI 可調整。
- Arduino IDE / VLC 下載尚未做取消下載功能。
- UVCD 設定改完後，使用者仍需要重新燒錄 AMB82 mini 的 AmebaUSB / UVC_device。

## Tauri 版本鎖定

目前不要隨意升級 Tauri 相關套件。

原因：

- 之前使用較寬鬆版本時，Cargo 會拉到較新的 `tauri-utils`、`tauri-runtime` 等內部 crate。
- 這曾造成 `tauri-build 2.0.6` 與新版本內部 API 不相容，build 失敗。

目前 Rust 端鎖定：

- Rust toolchain `1.97.0`（根目錄 `rust-toolchain.toml`）
- `Cargo.toml` 的最低支援版本 `rust-version = 1.97`
- `tauri = 2.0.6`
- `tauri-build = 2.0.6`
- `tauri-codegen = 2.0.5`
- `tauri-macros = 2.0.5`
- `tauri-runtime = 2.1.1`
- `tauri-runtime-wry = 2.1.2`
- `tauri-utils = 2.2.0`

Node 端目前：

- Node.js `^20.19.0` 或 `>=22.12.0`（CI 使用 Node.js 24）
- `@tauri-apps/api = 2.0.3`
- `@tauri-apps/cli = 2.0.4`
- `vite = 8.x`
- `vitest = 4.x`

如果未來要升級到新版 Tauri，請一次升級整組 Tauri crates / npm packages，並重新跑完整 build。

## Commit 習慣

原則：

- 每次 commit 聚焦一個主題，例如：
  - `Add configurable UVC device format`
  - `Refine settings page layout`
  - `Document Arduino auto install and UVC warning`
- 不把 build 產物 commit 進 git。
  - `dist/`
  - `src-tauri/target/`
  - `.exe`
- `dev_readme.md` 是交接文件；若內容跟本次變更相關，應一起 commit。
- commit 前先看：

```powershell
git status --short
git diff --check
git diff --stat
```

建議驗證：

- 純前端 / UI 改動：跑 `npm.cmd run check`。
- Rust command / UVCD / 檔案流程改動：跑 `cargo test --manifest-path src-tauri\Cargo.toml`。
- 要給使用者測 exe：跑 `npm.cmd run tauri build`。

commit 指令：

```powershell
git add <files>
git commit -m "Short imperative summary"
```

Push 習慣：

- `git push` 一律由使用者自己做。
- Codex 不主動 push。

## 發佈前檢查

1. 版本號清單全部同步。
2. `npm.cmd run check` 成功。
3. `cargo fmt --manifest-path src-tauri\Cargo.toml --all -- --check` 成功。
4. `cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets --locked -- -D warnings` 成功。
5. `cargo test --manifest-path src-tauri\Cargo.toml --locked` 成功。
6. `npm.cmd run tauri build` 成功。
7. 確認 release exe 沒被舊 process 鎖住。
8. 確認 `UVCD_pram.h` 覆寫規則符合目前設定。
9. 確認 `readme.md` 的版本與警告文字仍正確。
