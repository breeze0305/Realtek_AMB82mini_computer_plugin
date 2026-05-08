# Realtek AMB82-mini Computer Plugin

Realtek AMB82-mini Computer Plugin 是一款 Windows 桌面工具，用來協助 AMB82-mini 使用者快速取得開發所需檔案、開啟 AmebaPro2 套件資料夾、進行相機畫面擷取，以及檢查軟體版本。

This is a Windows desktop assistant for Realtek AMB82-mini developers. It helps with driver distribution, camera capture, bundled resource extraction, Realtek environment navigation, and update/download utilities.

本專案由舊版 Python CLI 工具重構而來，保留原本的核心功能，但改以 Tauri + React 桌面介面重新設計。新版不再要求使用者安裝 Python、OpenCV 或其他開發環境，並把原本的文字選單流程改成更直覺、輕量、可直接發佈的 Windows 應用程式。

## 重構重點

- 從 Python CLI / PyInstaller 重構為 Tauri 桌面應用程式。
- 原本「複製到目前目錄」的資源功能改為 Windows 存檔視窗，讓使用者自行指定位置。
- 原本 OpenCV 相機視窗改為 WebView 即時預覽，可在畫面中直接選擇鏡頭與截圖輸出位置。
- 原本 `lang/*.json` 多語系檔改為前端內建翻譯表，減少外部資源。
- 必要離線資源內嵌到 exe，不需要額外附帶 `resource/` 資料夾。
- `UVCD_pram.h` 修正保留為背景工作，不顯示在使用者介面中干擾流程。

## 主要功能

- 取得 CH340/CH341 安裝檔。
- 取得手勢自走車追蹤程式碼與權重。
- 取得影像分類權重：
  - 硬幣 / 滑鼠 / 日本硬幣
  - 硬幣 / 滑鼠 / 台灣100紙鈔
- 下載 Arduino IDE 安裝檔。
- 下載 VLC 安裝檔。
- 開啟本機 Realtek AmebaPro2 Arduino 套件資料夾。
- AMB 相機畫面擷取：
  - 進入相機頁時自動掃描本機可用鏡頭
  - 下拉選單切換鏡頭
  - 即時預覽畫面
  - 可在相機頁選擇截圖輸出資料夾
  - 定時截圖並輸出為 `image_00001.jpg`、`image_00002.jpg` 等檔案
  - 內建 AMB82 mini UVC 相機設定教學
- 檢查 GitHub 上的最新版本。
- 顯示外網連線狀態；無外網時會停用需要網路的功能。
- 支援繁體中文、英文、日文介面。

## 使用方式

下載 release 版本後，直接執行：

```text
amb82-mini-computer-plugin.exe
```

此 exe 已內嵌必要資源，不需要額外附帶 `resource/` 資料夾，也不需要安裝 Node.js、Rust、Tauri、Python 或 OpenCV。

若你的 Windows 10 電腦沒有 WebView2 Runtime，程式可能無法啟動。這種情況可改用安裝版，或先安裝 Microsoft Edge WebView2 Runtime。

## 介面特色

- 固定大小視窗，不會因拖拉造成排版跑掉。
- 主選單卡片皆有 index 編號，方便對照操作項目。
- GitHub 倉庫連結可直接開啟網頁；AMB Preference 連結可一鍵複製。
- Arduino IDE 與 VLC 下載時，卡片會以覆蓋層顯示下載進度。
- 操作結果會以半透明提示浮窗顯示，並自動淡出。
- 語言切換支援繁體中文、英文、日文。

## 檔案輸出

檔案取得功能會開啟 Windows 存檔視窗，使用者可自行指定儲存位置。

相機擷取預設會在程式執行位置建立或使用：

```text
output/
```

也可以在相機頁按「選擇資料夾」指定 `output/` 要建立在哪個位置；例如選擇桌面後，照片會存到桌面底下的 `output/`。

截圖檔名會自動接續最大編號，避免覆蓋既有圖片。

## 開發技術

- Tauri 2
- React 18
- TypeScript
- Vite
- Rust

## 資源內容

程式內嵌並提供下列離線資源：

- `CH341SER.EXE`
- `gesture_recognition/hand_code.txt`
- `gesture_recognition/hand_weight.nb`
- `image_classification_japan/img_class_cnn.nb`
- `image_classification_taiwan/img_class_cnn.nb`

舊版 JSON 語言檔與舊版資源圖示已移除；目前多語系由前端內建翻譯表提供，應用程式圖示使用 Tauri bundle icon。

## 版本

目前版本：`2.2.2`

版本檢查來源：

```text
https://raw.githubusercontent.com/breeze0305/Realtek_AMB82mini_computer_plugin/main/version.txt
```

## 授權與注意事項

本工具用於輔助 Realtek AMB82-mini 開發流程。Arduino IDE、VLC、Realtek AmebaPro2 套件與相關第三方工具仍依各自官方授權與使用條款為準。
