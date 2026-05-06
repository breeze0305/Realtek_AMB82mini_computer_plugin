# Realtek AMB82-mini Computer Plugin 需求整理

## 1. 文件目的

- 本文件整理目前軟體的既有功能、使用流程、系統行為、技術依賴與改版需求。
- 本文件可提供給外部軟體公司，作為重新設計 UI/UX、後端架構與產品體驗的需求依據。
- 目前版本為 `2.2.2`，此項目上傳至github後，會有一個 `version.txt` 檔案用來記錄當前的版本，如果版本有更新，需要修改此檔案內容中的版本編號。

## 2. 產品定位

- 本軟體是 Windows 平台上的 Realtek AMB82-mini 開發輔助工具。
- 目前為命令列互動式 CLI 程式，主要協助使用者完成 AMB82-mini 開發前置環境、相機擷取、資源複製、外部工具下載與版本檢查。

## 3. 目前軟體型態

- 應用程式型態：
  - Python CLI 程式。
  - 可透過 PyInstaller 打包為 Windows `.exe`。
  - 打包後執行檔名稱為 `amb_plugin.exe`。
- 目前支援語言：
  - 繁體中文 `zh_TW`
  - 英文 `en_US`
  - 日文 `ja_JP`

## 4. 目前主選單功能

- `1`：複製 CH340/CH341 驅動程式。
  - 將內建的 `CH341SER.EXE` 複製到目前工作目錄。
  - 目前只複製檔案，不會自動安裝驅動。

- `2`：開啟 Realtek AMB82-mini Arduino 套件資料夾。
  - 程式會搜尋：
    - `%USERPROFILE%\AppData\Local\Arduino15\packages\realtek\hardware\AmebaPro2`
  - 找到後使用 Windows `os.startfile()` 開啟資料夾。
  - 找不到時顯示錯誤訊息。

- `3`：顯示 AMB82 相機擷取教學。
  - 以文字方式提示使用者：
    - 將 AMB82 mini 的 CH340 USB 連接電腦。
    - 開啟 Arduino IDE。
    - 開啟 AMB82 mini 範例 `AmebaUSB / UVC_device`。
    - 將範例上傳到 AMB82 mini。
    - 上傳後改接 AMB USB 到 8735 的 USB 連接埠。
    - 回到本工具選擇 AMB82 Photo Capture 開始拍照。

- `4`：AMB82 相機影像擷取。
  - 建立或使用 `./output` 目錄。
  - 掃描本機相機 ID `0` 到 `5`。
  - 對可用相機讀取預覽影像。
  - 如果只找到一台相機，直接選用該相機。
  - 如果找到多台相機，顯示各相機預覽視窗並讓使用者輸入相機 ID。
  - 擷取時依照目前設定的秒數間隔自動儲存影像。
  - 檔名格式為 `image_00001.jpg`、`image_00002.jpg`，依序遞增。
  - 若 `output` 內已有既有影像，會接續最大編號繼續命名。
  - 使用者可按 `Ctrl+C` 中止擷取。
  - 讀取影像失敗時會停止擷取。

- `5`：下載 Arduino IDE。
  - 目前下載連結：
    - `https://downloads.arduino.cc/arduino-ide/arduino-ide_2.3.6_Windows_64bit.exe`
  - 下載檔名取自 URL 最後一段。
  - 使用 `requests` 串流下載，並使用 `tqdm` 顯示進度。
  - 目前沒有 timeout、重試、HTTP 狀態碼檢查。

- `6`：顯示 Realtek Preferences / package index 連結。
  - 顯示連結讓使用者手動複製到 Arduino IDE。
  - 目前連結：
    - `https://github.com/Ameba-AIoT/ameba-arduino-pro2/raw/dev/Arduino_package/package_realtek_amebapro2_early_index.json`

- `7`：下載 VLC Media Player。
  - 目前下載連結：
    - `https://free.nchc.org.tw/vlc/vlc/3.0.21/win64/vlc-3.0.21-win64.exe`
  - 下載行為與 Arduino IDE 相同。

- `8`：取得手勢辨識資源檔。
  - 將內建檔案複製到目前工作目錄：
    - `gesture_recognition/hand_code.txt` -> `hand_code.txt`
    - `gesture_recognition/hand_weight.nb` -> `hand_weight.nb`
  - 目前只複製檔案，不會自動整合到 Arduino 專案。

- `9`：取得影像分類模型。
  - 將內建檔案複製到目前工作目錄：
    - `image_classification_japan/img_class_cnn.nb` -> `img_class_cnn.nb`

- `10`：檢查是否有新版本。
  - 從 GitHub repository 推導 raw URL：
    - `https://raw.githubusercontent.com/breeze0305/Realtek_AMB82mini_computer_plugin/main/version.txt`
  - 與本機 `APP_METADATA["version"]` 比對。
  - 如果版本不同，提示 GitHub 版本、本機版本與下載網址。
  - 如果版本相同，提示目前為最新版本。
  - 目前沒有 timeout、重試、HTTP 狀態碼檢查。

- `11`：離開程式。
  - 印出結束訊息並跳出主選單迴圈。

- `ntnu`：隱藏設定選單。
  - 主選單輸入 `ntnu` 可進入。
  - 詳細功能見「隱藏設定功能」。

## 5. 隱藏設定功能

- 進入方式：
  - 在主選單輸入 `ntnu`。

- 隱藏設定選單項目：
  - `1`：顯示全域資訊。
  - `2`：修改相機擷取速度。
  - `3`：切換系統語言。
  - `4`：返回主選單。

- 顯示全域資訊：
  - 作者。
  - 聯絡信箱。
  - 版本。
  - GitHub repository。
  - Arduino IDE 下載連結。
  - VLC 下載連結。
  - Realtek preferences/package index 連結。
  - 目前拍照頻率。
  - 預設語言。
  - 支援語言清單。

- 修改相機擷取速度：
  - 使用者輸入每張照片間隔秒數。
  - 只接受大於 `0` 的整數。
  - 設定會立即影響後續 AMB82 Photo Capture 功能。
  - 目前預設值為每 `1` 秒拍攝一張照片。

- 切換系統語言：
  - 顯示支援語言清單。
  - 使用者輸入語言編號。
  - 切換後立即重新載入語言檔。
  - 回到主選單後沿用新語言。

## 6. 背景 UVCD 修正功能

- 程式啟動後會自動開始背景執行緒。
- 目的：
  - 搜尋並修正 Arduino Realtek AMB82-mini 套件中的 `UVCD_pram.h`。
- 搜尋路徑：
  - `%USERPROFILE%\AppData\Local\Arduino15\packages\realtek\hardware\AmebaPro2`
  - 找到第一個版本資料夾後，推導目標檔案：
    - `libraries\USB\src\UVCD_pram.h`
- 修正規則：
  - 掃描 `#define UVCD_* 數字`。
  - `UVCD_H264` 保持不變。
  - 其他所有 `UVCD_*` 定義皆改為 `0`。
- 背景重試：
  - 如果尚未找到或修正失敗，每 `5` 分鐘重試一次。
  - 修正成功後停止背景重試。
- 目前限制：
  - 失敗時沒有詳細錯誤訊息。
  - 沒有詢問使用者是否允許修改 Arduino 套件檔案。
  - 主程式離開時沒有明確呼叫 stop event 停止背景任務。

## 7. 相機擷取詳細需求

- 必須能掃描本機可用相機。
- 目前掃描範圍為相機 ID `0` 到 `5`。
- 必須能在多相機環境下讓使用者選擇相機。
- 目前多相機時會顯示 OpenCV 預覽視窗：
  - 視窗名稱為 `camera_{camera_id}`。
  - 預覽畫面會縮放至 `640x480`。
  - 預覽畫面上疊加 `Camera {id}` 文字。
- 必須能自動建立輸出資料夾。
- 必須能依照指定間隔連續擷取影像。
- 必須能延續既有檔名序號，避免覆蓋舊照片。
- 必須能處理下列狀況：
  - 找不到相機。
  - 使用者輸入不存在的相機 ID。
  - 使用者輸入非數字。
  - 相機讀取 frame 失敗。
  - 使用者中止擷取。

## 8. 檔案與資源管理

- 內建必要資源：
  - `CH341SER.EXE`
  - `lang/zh_TW.json`
  - `lang/en_US.json`
  - `lang/ja_JP.json`
  - `gesture_recognition/hand_code.txt`
  - `gesture_recognition/hand_weight.nb`
  - `image_classification_japan/img_class_cnn.nb`
  - `icon.ico`

- 程式支援 source mode 與 PyInstaller 打包模式資源路徑：
  - Source mode：以專案根目錄為資源根目錄。
  - PyInstaller mode：以 `sys._MEIPASS` 為資源根目錄。

- 目前有 `verify_resources()` 可檢查資源是否存在。
  - 目前沒有在主流程中自動呼叫。

## 9. 多語系需求

- 目前所有主要選單、提示文字與錯誤訊息由 JSON 語系檔管理。
- 語系檔位置：
  - `lang/zh_TW.json`
  - `lang/en_US.json`
  - `lang/ja_JP.json`
- 當指定語言檔不存在時，會 fallback 到 `zh_TW`。

## 10. 打包與交付需求

- 目前使用 PyInstaller 打包。
- 打包模式：
  - one-file。
  - console application。
  - icon 使用 `icon.ico`。
  - 輸出名稱 `amb_plugin.exe`。
- 打包時必須包含：
  - CH341SER driver。
  - 三個語系檔。
  - 手勢辨識資源。
  - 影像分類模型。
  - icon。



