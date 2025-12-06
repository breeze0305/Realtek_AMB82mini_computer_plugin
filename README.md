# Realtek AMB82-mini Computer Plugin (Assistant Tool)

這是一個專為 Realtek AMB82-mini 開發板設計的電腦端輔助工具 (CLI)。旨在簡化開發流程，提供驅動安裝、影像串流擷取、環境設定及資源下載等功能。

This is a CLI-based assistant tool designed for Realtek AMB82-mini developers. It simplifies the development workflow by providing features like driver installation, video frame capturing, environment configuration, and resource downloading.

## 🚀 功能特點 (Features)

* **Driver Installation**: 內建 CH341SER 驅動程式安裝功能。
* **Quick Navigation**: 快速開啟 Arduino15 中的 Realtek AMB82-mini 硬體資料夾。
* **Video Frame Capture**: 透過 OpenCV 擷取開發板串流影像，並支援自動儲存 (預設每秒一張)。
* **Auto Configuration**: 自動修改 `UVCD_pram.h` 參數設定，優化影像傳輸配置。
* **Download Helper**: 整合 Arduino IDE 與 VLC Player 下載連結。
* **Multi-language Support**: 支援繁體中文 (zh_TW)、English (en_US) 與日文 (ja_JP)。
* **Hidden Settings**: 包含隱藏的開發者選項 (更改 FPS、強制切換語言)。

## 📥 下載與使用 (Download & Usage)

### 方法 1：直接執行 (推薦)
如果您不想安裝 Python 環境，可以直接下載編譯好的執行檔：

1.  前往本專案的 **Releases 頁面**。
2.  下載最新的 `.exe` 檔案 (例如 `main.exe`)。
3.  直接雙擊執行即可 (無需安裝 Python)。

### 方法 2：原始碼執行
如果您希望修改程式碼或自行執行：

1.  Clone 此專案：
    ```bash
    git clone [https://github.com/breeze0305/Realtek_AMB82mini_computer_plugin.git](https://github.com/breeze0305/Realtek_AMB82mini_computer_plugin.git)
    cd Realtek_AMB82mini_computer_plugin
    ```

2.  安裝依賴套件：
    ```bash
    pip install opencv-python requests tqdm
    ```

3.  執行程式：
    ```bash
    python main.py
    ```

## 🛠 編譯方式 (Building from Source)

如果您想要自行打包 `.exe` 檔案，請確保已安裝 `pyinstaller`，並使用以下指令進行編譯。此指令會將語言包與驅動程式一同打包進執行檔中。

### 前置需求
```bash
pip install pyinstaller
```

### 編譯指令

請在終端機 (Terminal/CMD) 中執行以下指令：

```bash
pyinstaller --onefile --console --add-data "CH341SER.EXE;." --add-data "lang/zh_TW.json;lang" --add-data "lang/en_US.json;lang" --add-data "gesture_recognition/hand_code.txt;gesture_recognition" --add-data "gesture_recognition/hand_weight.nb;gesture_recognition" main.py
```

> **注意**:
>
>   * Windows 使用者請確保指令中的分隔符號為分號 `;` (如上所示)。
>   * 編譯完成後，執行檔將位於 `dist/` 資料夾中。

## 🤫 隱藏功能 (Hidden Features)

在主選單輸入 **`ntnu`** 即可進入隱藏設定模式：

  * 查看全域設定資訊 (Global Info)。
  * 修改拍照/擷取影像的速度 (FPS)。
  * 強制切換預設語言。

## 📂 專案結構 (Project Structure)

  * `main.py`: 程式進入點，處理選單邏輯。
  * `utils.py`: 核心功能實作 (OpenCV 擷取、檔案下載、參數修改等)。
  * `settings.py`: 全域設定、語言包載入邏輯與資源路徑處理。
  * `lang/`: 存放語言設定檔 (`.json`)。
  * `gesture_recognition/`: 存放手勢辨識相關檔案。

## 📝 需求環境 (Requirements)

  * Python 3.x
  * opencv-python
  * requests
  * tqdm

## 👤 作者 (Author)

  * **Author**: NTNU Feng
  * **Email**: benfeng99@gmail.com
  * **Version**: 2.1.0

