<div align="center">

<a href="#readme">
  <img src="src-tauri/icons/icon.png" alt="Realtek AMB82-mini Computer Plugin" width="160">
</a>

</div>

# Realtek AMB82-mini Computer Plugin

Realtek AMB82-mini Computer Plugin 是一款 Windows 桌面工具，用來協助 Realtek AMB82-mini 開發者快速取得開發資源、設定 AMB UVC 格式、擷取相機畫面、進行物件偵測標註、批次轉換圖片、開啟模型轉換工具，並檢查軟體版本。

本專案由舊版 Python CLI 工具重構而來，保留原本的核心功能，但改以 Tauri + React 桌面介面重新設計。新版不再要求使用者安裝 Python、OpenCV 或其他開發環境，並把文字選單流程改成更直覺、可直接發佈的 Windows 應用程式。舊版程式碼仍保留在 `legacy/v2` 分支中。

## 主要功能

- 取得 CH340/CH341 驅動安裝檔。
- 取得手勢辨識、物件偵測、影像分類等範例程式碼與模型權重。
- 下載 Arduino IDE 與 VLC 安裝檔。
- 可選擇自動安裝 Arduino IDE / VLC。
- 開啟本機 Realtek AmebaPro2 Arduino 套件資料夾。
- 複製 AMB Preference package URL。
- 切換 AMB Preference release / beta 版本來源。
- 設定 AMB UVC device 輸出格式：`YUY2`、`NV12`、`MJPG`、`H264`、`H265`。
- 使用 AMB82-mini UVC 相機進行即時預覽與定時擷取。
- 使用物件偵測標註工具建立 YOLO 格式資料集。
- 遞迴轉換 `BMP`、`WebP`、`HEIC` 與採 HEVC 編碼的 `HEIF` 圖片，相容常見 Apple／iPhone HEIC 的 EXIF 包裝資料，並將方向資訊寫入像素。
- 開啟模型量化轉換網站。
- 檢查 GitHub 上的最新版本。
- 在所有頁面左下角固定顯示外網連線狀態；無外網時會停用需要網路的功能。
- 支援繁體中文、英文、日文介面。

## 使用方式

> [!IMPORTANT]
> **下載最新版請到 GitHub Releases：** [Realtek AMB82mini Plugin Releases](https://github.com/breeze0305/Realtek_AMB82mini_plugin/releases)
>
> 進入頁面後，請點開最新版本底下的 `Assets`，下載 `amb82-mini-computer-plugin.exe` 或安裝檔。

下載 release 版本後，直接執行：

```text
amb82-mini-computer-plugin.exe
```

> [!WARNING]
> 此工具會依照設定頁選擇修改使用者的 AMB UVC device 格式，預設為 `MJPG`。每次打開工具時，都會嘗試修正 Realtek AmebaPro2 套件中的 `UVCD_pram.h`。

## 功能說明

### 開發資源

程式內嵌並提供下列離線資源：

- `CH341SER.EXE`
- `gesture_recognition/hand_code.txt`
- `gesture_recognition/yolov7_tiny.nb`
- `object_detection_box/code.txt`
- `object_detection_box/yolov7_tiny.nb`
- `image_classification_japan/img_class_cnn.nb`
- `image_classification_taiwan/img_class_cnn.nb`
- `image_classification_singapore/img_class_cnn.nb`

檔案取得功能會開啟 Windows 存檔視窗，使用者可自行指定儲存位置。

首頁提供兩個可整張卡片點擊的獨立入口：`01`「安裝檔」與 `02`「程式碼與權重」。兩張入口卡與一般功能卡之間以分隔線區隔，進入後只會顯示該類別的資源；未來新增資源也會依類型放入對應頁面。

### Arduino IDE 與 VLC

Arduino IDE 與 VLC 支援兩種方式：

- 下載安裝檔到使用者指定位置。
- 自動下載並啟動安裝流程。

Arduino IDE 或 VLC 第一次下載完成後，安裝檔會保留在應用程式的私有快取中。之後再次取得或安裝同一版本時，程式會先驗證快取檔案的 SHA-256；驗證通過便直接重用，不需重複下載，且可在離線時使用。若快取已損壞或遭修改，程式不會使用該檔案，並會在可連線時重新下載。

Arduino IDE 會透過官方 release metadata 解析最新版安裝檔及其 SHA-256；VLC 使用專案設定的固定版本與可信 SHA-256。CH340/CH341 驅動仍隨程式內嵌，不需網路下載。

下載來源、VLC 固定雜湊與 Arduino fallback 資訊定義在 `src-tauri/endpoint_manifest.json`。

### AMB Preference 與 UVC 格式

設定頁可切換 AMB Preference 來源：

- `Release version`
- `Beta version`

設定頁也可切換 UVC device 格式：

- `YUY2`
- `NV12`
- `MJPG`
- `H264`
- `H265`

設定會儲存在：

```text
%LOCALAPPDATA%\AMB82 Mini Computer Plugin\settings.json
```

### AMB 相機擷取

相機頁提供：

- 自動掃描本機可用鏡頭。
- 進入頁面後可重新偵測新接上的鏡頭，不需要離開相機頁。
- 下拉選單切換鏡頭。
- 即時預覽畫面。
- 定時擷取 JPEG 圖片。
- 選擇截圖輸出資料夾。
- AMB82-mini UVC 相機設定教學。

相機擷取預設會在程式執行位置建立或使用：

```text
output/
```

也可以在相機頁按「選擇資料夾」指定 `output/` 要建立在哪個位置。截圖檔名會自動接續最大編號，避免覆蓋既有圖片：

```text
image_00001.jpg
image_00002.jpg
image_00003.jpg
```

### 物件偵測標註

物件偵測標註工具可用來建立 YOLO 格式資料集：

- 選擇或拖曳圖片資料夾。
- 支援 `jpg`、`jpeg`、`png`、`bmp` 圖片。
- 進入標註頁面前會逐張檢查圖片方向，並以進度條顯示目前處理進度，適合載入包含大量圖片的資料夾。
- 圖片具有 EXIF Orientation `2`～`8` 時，會把相同的顯示方向寫入圖片像素並移除對方向標籤的依賴；沒有方向標籤或不需旋轉的圖片會直接略過。
- 單張圖片處理失敗時會保留原始檔案並繼續檢查其他圖片，完成後顯示失敗數量。
- 動畫 PNG（APNG）不會以單張圖片流程改寫；若它含有需要處理的方向標籤，程式會保留原檔並將它列入失敗摘要，避免遺失動畫幀。
- 建立、重新命名、刪除 class。
- `classes.txt` 遺失時，會依現有標註自動建立 `object1`、`object2` 等暫用名稱並補回檔案。
- 在圖片上繪製 bounding box。
- 移動、縮放、刪除、重設目前圖片的標註框。
- 縮放圖片時，標註框維持固定的畫面線寬。
- 十字游標提供延伸至圖片邊緣的水平與垂直輔助虛線。
- 使用 `A` / `D` 切換上一張 / 下一張圖片。
- 自動儲存標註結果。

標註輸出會建立在圖片資料夾旁邊：

```text
<image-folder-name>_labels/
```

每張圖片會有一個同名 `.txt` 標註檔，`classes.txt` 則存放 class 名稱。標註列使用 YOLO normalized 格式：

```text
<class_id> <x_center> <y_center> <width> <height>
```

### 圖片轉檔

圖片轉檔工具可選擇或拖入一個資料夾，並遞迴處理其中所有子資料夾：

> [!WARNING]
> `BMP`、`WebP`、`HEIC`、`HEIF` 會在新 JPG 完成寫入與驗證後移除原格式來源。若需要保留原始格式，請先備份資料夾。同名 JPG 已存在或處理失敗時，程式不會覆蓋檔案，來源也會保留。

- `BMP`、靜態 `WebP`、`HEIC`，以及採 HEVC（`hvc1`）編碼的 `HEIF` 會轉成同目錄、同檔名的 `.jpg`；單獨的容器鏡像或旋轉屬性也支援。
- 已相容常見 Apple／iPhone HEIC 所使用的 EXIF 包裝資料；程式會先驗證並正規化 EXIF，再套用圖片方向並移除 Orientation 標籤。EXIF 結構損壞或不受支援時，會保留來源並列入失敗摘要。
- `JPG`、`JPEG`、`PNG` 不會改變格式；只有存在 EXIF Orientation `2`～`8` 時才會把方向寫入像素。
- 轉檔後的圖片維持原本顯示方向，EXIF Orientation 不會再控制圖片旋轉。
- 透明像素會合成在白色背景上，因為 JPEG 不支援透明度。
- 動畫 `WebP` 不會被轉成單一影格；程式會保留原檔並列入失敗摘要。
- 若同目錄已存在同名 `.jpg`，或多個來源會產生同一個 `.jpg`，程式不會覆蓋任何檔案。
- 程式不會跟隨 symbolic link、Windows junction 或其他 reparse point，避免處理到所選資料夾以外的圖片。
- 處理期間會阻止其他程式同時寫入該張來源圖；若圖片正被可寫入方式開啟，該檔會保留並列為失敗。
- 每張新 JPEG 都會先寫入同目錄暫存檔，完成解碼、尺寸、EXIF 與 ICC 驗證後才取代來源；JPG／PNG 也會以鎖定檔案身分的安全交易替換，失敗時復原或保留原圖並繼續處理其他檔案。

處理畫面會顯示總數、目前進度、轉檔／方向修正／略過／失敗數量。全部完成後會自動回到主選單並顯示摘要。

> [!NOTE]
> `HEIF` 是容器格式；目前內建解碼器支援常見 HEVC `hvc1` 圖片，以及主要圖片單獨關聯的 `imir` 鏡像或 `irot` 旋轉。若主要圖片同時關聯 `imir` 與 `irot`，或重複關聯其中一種 transform，程式會安全保留原檔並列為失敗；僅屬於輔助圖片或 tile 的 transform 不受此限制。這是目前固定解碼器版本的組合方向限制。容器沒有方向 transform 時才會使用 EXIF Orientation 作為顯示方向備援，避免重複旋轉。

### 模型量化轉換

模型量化轉換功能會開啟或呼叫：

```text
https://modelconverter.ntnu-aiot.com/
```

目前支援的模型類型會從 model converter API 載入。轉換完成後，可將產生的 `.nb` 模型下載到使用者指定位置。

## 開發技術

- Tauri 2
- React 18
- TypeScript
- Vite
- Rust 1.97.0（由 `rust-toolchain.toml` 固定）
- lucide-react

開發環境需使用 Node.js `^20.19.0` 或 `>=22.12.0`；CI 使用 Node.js 24。

## 安全性設定

- Tauri CSP 已限制 WebView 可連線來源。
- 外部網址開啟功能只允許預期 HTTPS 網域。
- Model converter 輪詢會在切頁、換檔、重新開始轉換或卸載時取消，避免舊任務覆蓋新狀態。

## 版本

目前版本：`3.14.2`

版本檢查來源：

```text
https://raw.githubusercontent.com/breeze0305/Realtek_AMB82mini_plugin/main/version.txt
```

版本號由 repo 根目錄的 `version.txt` 統一管理。執行 build 前會自動同步到 `package.json`、`Cargo.toml`、`tauri.conf.json` 與相關文件。

## 開發指令

安裝依賴：

```powershell
npm.cmd install
```

前端建置：

```powershell
npm.cmd run build
```

前端 lint、格式、測試與 production build：

```powershell
npm.cmd run check
```

Rust 測試：

```powershell
cargo test --manifest-path src-tauri\Cargo.toml --locked
```

產生 Windows release exe 與 NSIS installer：

```powershell
npm.cmd run tauri build
```

輸出位置：

```text
src-tauri/target/release/amb82-mini-computer-plugin.exe
src-tauri/target/release/bundle/nsis/AMB82 Mini Computer Plugin_<version>_x64-setup.exe
```

## 授權與注意事項

本工具用於輔助 Realtek AMB82-mini 開發流程。Arduino IDE、VLC、Realtek AmebaPro2 套件與相關第三方工具仍依各自官方授權與使用條款為準。隨安裝包提供的 `THIRD_PARTY_NOTICES.txt` 記載新增原生元件的第三方授權。

## 貢獻者

### 主要貢獻者

- NTNU Feng
- Email: benfeng99@gmail.com

### 共同貢獻者

- 賴彥廷
- 范哲瑋
- 陳柏序
- 李易修
- 黃琮善
- 陳品妤
- 余品誼
- 李鍇灝
- 吳祐安
- 王威達
- 吳子安
