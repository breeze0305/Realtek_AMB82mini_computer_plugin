# Realtek AMB82-mini Computer Plugin

這是一個專為 Realtek AMB82-mini 開發板設計的 Windows CLI 輔助工具，目的是把常見的環境準備、驅動複製、相機擷取、資源下載與開發流程提示集中到同一個介面。

This is a Windows-oriented CLI assistant for Realtek AMB82-mini developers. It helps with driver distribution, camera capture, bundled resource extraction, Realtek environment navigation, and basic update/download utilities.

## Features

- Driver helper: 將 `CH341SER.EXE` 複製到目前工作目錄，方便手動安裝。
- Realtek folder quick open: 快速開啟 `%USERPROFILE%\\AppData\\Local\\Arduino15` 下的 Realtek AMB82-mini 套件資料夾。
- Capture tutorial: 提供 AMB82 相機擷取教學流程。
- Camera capture: 掃描可用攝影機，支援預覽與選擇，並將影像連續存到 `output/`。
- Background UVCD patch: 啟動時會背景尋找並修改 `UVCD_pram.h`，將大多數 `UVCD_*` 參數改為 `0`，保留 `UVCD_H264`。
- Download helper: 提供 Arduino IDE、VLC 與 Realtek package index 相關下載或連結資訊。
- Gesture resource copy: 將 `gesture_recognition/` 內的模型檔複製到目前工作目錄。
- Image classification model copy: 將 `image_classification_japan/img_class_cnn.nb` 複製到目前工作目錄。
- Multi-language UI: 內建 `zh_TW`、`en_US`、`ja_JP` 三種語系。
- Hidden menu: 在主選單輸入 `ntnu` 可查看全域設定、切換語言，並調整實際擷取間隔。

## Requirements

- Windows
- Python 3.x
- `opencv-python`
- `requests`
- `tqdm`

安裝依賴：

```bash
pip install opencv-python requests tqdm
```

## Run From Source

```bash
git clone https://github.com/breeze0305/Realtek_AMB82mini_computer_plugin.git
cd Realtek_AMB82mini_computer_plugin
python main.py
```

程式啟動後會先讓使用者選擇語言，接著在背景執行 UVCD 設定檔搜尋與修補，再進入主選單。

## Tutorial

- 使用教學影片: https://youtu.be/sqhTgFAhslU

## Main Menu Summary

- `1`: 複製 `CH341SER.EXE` 到目前目錄
- `2`: 開啟 Realtek AMB82-mini Arduino 套件資料夾
- `3`: 顯示 AMB82 影像擷取教學
- `4`: 啟動相機擷取並將影像輸出到 `output/`
- `5`: 下載 Arduino IDE
- `6`: 顯示 Realtek preferences/package index 連結
- `7`: 下載 VLC
- `8`: 複製手勢辨識檔案到目前目錄
- `9`: 複製 `img_class_cnn.nb` 到目前目錄
- `10`: 檢查 GitHub 上是否有新版本
- `11`: 離開程式
- `ntnu`: 進入隱藏設定，可切換語言與調整實際擷取間隔

## Build

若要打包成可執行檔，先安裝：

```bash
pip install pyinstaller
```

建議直接使用既有 spec：

```bash
pyinstaller main.spec
```

如果需要手動打包，也可使用：

```bash
pyinstaller --onefile --console --icon="./icon.ico" --add-data "CH341SER.EXE;." --add-data "lang/zh_TW.json;lang" --add-data "lang/en_US.json;lang" --add-data "lang/ja_JP.json;lang" --add-data "gesture_recognition/hand_code.txt;gesture_recognition" --add-data "gesture_recognition/hand_weight.nb;gesture_recognition" --add-data "image_classification_japan/img_class_cnn.nb;image_classification_japan" main.py
```

## Project Structure

- `main.py`: 程式入口與主選單流程
- `utils/__init__.py`: 匯出主要功能給 `main.py`
- `utils/settings.py`: 全域設定、執行期狀態、語系載入、資源路徑、版本檢查與 Arduino 路徑 helper
- `utils/fn.py`: 一般 CLI 功能、隱藏設定、資料夾開啟、教學文字
- `utils/get_file.py`: 檔案下載、下載連結顯示、手勢檔案與影像分類模型複製
- `utils/opencv.py`: UVCD 設定修補、背景執行緒、相機掃描與影像擷取
- `lang/`: 多語系 JSON 檔
- `gesture_recognition/`: 手勢辨識模型與對應資源
- `image_classification_japan/`: 影像分類模型資源
- `CH341SER.EXE`: 驅動安裝程式
- `icon.ico`: PyInstaller 打包圖示
- `version.txt`: 倉庫中的版本文字檔；更新檢查會抓取遠端 `version.txt`，本地版本定義在 `utils/settings.py`

## Notes

- 這個專案目前以 Windows 為主要執行平台。
- 啟動程式後會嘗試修改使用者本機 Arduino 套件中的 `UVCD_pram.h`。
- 相機擷取的實際儲存間隔預設為每秒一張，可在隱藏設定中修改。
- 隱藏設定中的擷取速度會套用到實際擷取迴圈。
- 驅動、手勢檔案與影像分類模型功能都是「複製到目前目錄」，不是自動執行安裝。

## Author

- Author: NTNU Feng
- Email: benfeng99@gmail.com

