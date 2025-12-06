import json
import requests
import sys
import os
import shutil

from copy import deepcopy
from pathlib import Path

GLOBAL_SETTINGS = {
    "author": "NTNU Feng",
    "contact_email": "benfeng99@gmail.com",
    "github_repo": "https://github.com/breeze0305/Realtek_AMB82mini_computer_plugin",
    "arduino_dl_link": "https://downloads.arduino.cc/arduino-ide/arduino-ide_2.3.6_Windows_64bit.exe",
    "vlc_dl_link": "https://free.nchc.org.tw/vlc/vlc/3.0.21/win64/vlc-3.0.21-win64.exe",
    "preference_link": "https://github.com/Ameba-AIoT/ameba-arduino-pro2/raw/dev/Arduino_package/package_realtek_amebapro2_early_index.json",
    "version": "2.1.0",
    "take_picture_fps": "1張 / 1秒",
    "language_default": "zh_TW",
    "language_support": ["zh_TW", "en_US", "ja_JP"],
}

# =========================================================
# 📂 通用資源路徑解析器（開發模式 / 打包模式 通用）
# =========================================================
def resource_path(relative_path: str) -> Path:
    """
    取得資源實際路徑：
      - 若程式被 PyInstaller 打包，會從 sys._MEIPASS 下找
      - 若為開發階段，則從當前模組所在資料夾取
    """
    if getattr(sys, 'frozen', False):  # PyInstaller 執行時
        base_path = Path(sys._MEIPASS)
    else:
        base_path = Path(__file__).parent
    return base_path / relative_path


# =========================================================
# 🌐 語言包載入器與選擇器
# =========================================================
def load_language(lang_code: str):
    """
    載入語言包 JSON 檔案。
    若指定語言不存在，會自動回退為 zh_TW。
    """
    lang_file = resource_path(f"lang/{lang_code}.json")

    if not lang_file.exists():
        # print(f"Warning: Language pack {lang_code} not found, defaulting to zh_TW.")
        lang_file = resource_path("lang/zh_TW.json")

    try:
        with open(lang_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading language file {lang_file}: {e}")
        return {"error": "Language file loading failed."}

def select_startup_language():
    """
    程式啟動時，強制要求使用者選擇語言。
    """
    os.system('cls' if os.name == 'nt' else 'clear')
    print("=== Select Language / 選擇語言 ===")
    
    # 動態列出支援的語言
    for idx, lang in enumerate(GLOBAL_SETTINGS["language_support"], start=1):
        print(f"{idx}. {lang}")
    
    while True:
        try:
            choice = input(f"Select (1-{len(GLOBAL_SETTINGS['language_support'])}): ")
            idx = int(choice)
            if 1 <= idx <= len(GLOBAL_SETTINGS["language_support"]):
                selected_lang = GLOBAL_SETTINGS["language_support"][idx - 1]
                GLOBAL_SETTINGS["language_default"] = selected_lang
                print(f"Language set to: {selected_lang}")
                break
            else:
                print("Invalid selection / 無效選擇")
        except ValueError:
             print("Please enter a number / 請輸入數字")


# =========================================================
# 🧩 驅動安裝程式（共用 resource_path）
# =========================================================
def load_amb_driver(lang):
    """
    將 CH341SER.EXE 從內部資源複製到目前工作資料夾。
    （打包後從 sys._MEIPASS 提取，開發時從原始檔案夾取）
    """
    try:
        print(lang["driver_start"])

        src = resource_path("CH341SER.EXE")
        dst = Path(os.getcwd()) / "CH341SER.EXE"

        shutil.copy(src, dst)
        print(lang["driver_success"])

    except Exception as e:
        print(lang["driver_error"], e)


# =========================================================
# 🧠 資源完整性檢查（建議打包前執行）
# =========================================================
def verify_resources():
    """
    檢查所有應被打包的外部資源是否存在。
    打包前可執行此函式以確保不會漏掉檔案。
    """
    required_files = [
        "CH341SER.EXE",
        "lang/zh_TW.json",
        "lang/en_US.json",
        "lang/ja_JP.json",
        "gesture_recognition/hand_code.txt",
        "gesture_recognition/hand_weight.nb",
    ]
    missing = [f for f in required_files if not Path(f).exists()]

    if missing:
        print("Warning: The following required files are missing:")
        for f in missing:
            print("  -", f)
    else:
        print("Check passed: All resources found.")
        
def check_new_version(lang):
    """
    檢查是否有新版本發布。
    """
    try:
        url = deepcopy(GLOBAL_SETTINGS["github_repo"])
        url = url.replace("github.com", "raw.githubusercontent.com") + "/main/version.txt"
        response = requests.get(url)
        github_version = response.text.strip()
        local_version = GLOBAL_SETTINGS["version"]
        
        if github_version != local_version:
            # 顯示有新版本
            x1 = lang["update_available"].format(github=github_version, local=local_version)
            x2 = lang["update_download"].format(repo=GLOBAL_SETTINGS["github_repo"])
            print(f"\033[31m{x1}\033[0m")
            print(f"\033[33m{x2}\033[0m")
        else:
            # 顯示已是最新版本
            # "\033[32m綠色字\033[0m"
            print(f"\033[32m{lang['update_latest']}\033[0m")
        
    except Exception as e:
        print("Error checking for new version:", e)