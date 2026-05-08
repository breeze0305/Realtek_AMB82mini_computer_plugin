import json
import os
import shutil
import sys
from pathlib import Path
from typing import Optional

import requests

APP_METADATA = {
    "author": "NTNU Feng",
    "contact_email": "benfeng99@gmail.com",
    "version": "2.2.3",
}

APP_LINKS = {
    "github_repo": "https://github.com/breeze0305/Realtek_AMB82mini_computer_plugin",
    "arduino_dl_link": "https://downloads.arduino.cc/arduino-ide/arduino-ide_2.3.6_Windows_64bit.exe",
    "vlc_dl_link": "https://free.nchc.org.tw/vlc/vlc/3.0.21/win64/vlc-3.0.21-win64.exe",
    "preference_link": "https://github.com/Ameba-AIoT/ameba-arduino-pro2/raw/dev/Arduino_package/package_realtek_amebapro2_early_index.json",
}

APP_STATE = {
    "capture_interval_seconds": 1,
    "language_default": "zh_TW",
    "language_support": ["zh_TW", "en_US", "ja_JP"],
}

GLOBAL_SETTINGS = {}


def format_capture_interval(seconds):
    return f"1 / {seconds}s"


def sync_global_settings():
    GLOBAL_SETTINGS.clear()
    GLOBAL_SETTINGS.update(APP_METADATA)
    GLOBAL_SETTINGS.update(APP_LINKS)
    GLOBAL_SETTINGS.update(
        {
            "take_picture_fps": format_capture_interval(APP_STATE["capture_interval_seconds"]),
            "language_default": APP_STATE["language_default"],
            "language_support": list(APP_STATE["language_support"]),
        }
    )


def set_language_default(lang_code):
    APP_STATE["language_default"] = lang_code
    sync_global_settings()


def set_capture_interval_seconds(seconds):
    APP_STATE["capture_interval_seconds"] = seconds
    sync_global_settings()


def get_capture_interval_seconds():
    return APP_STATE["capture_interval_seconds"]


sync_global_settings()


def resource_path(relative_path: str) -> Path:
    if getattr(sys, "frozen", False):
        base_path = Path(sys._MEIPASS)
    else:
        base_path = Path(__file__).parent.parent
    return base_path / relative_path


def load_language(lang_code: str):
    lang_file = resource_path(f"lang/{lang_code}.json")

    if not lang_file.exists():
        lang_file = resource_path("lang/zh_TW.json")

    try:
        with open(lang_file, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception as exc:
        print(f"Error loading language file {lang_file}: {exc}")
        return {"error": "Language file loading failed."}


def select_startup_language():
    os.system("cls" if os.name == "nt" else "clear")
    print("=== Select Language / 選擇語言 ===")

    supported_languages = APP_STATE["language_support"]
    for index, lang_code in enumerate(supported_languages, start=1):
        print(f"{index}. {lang_code}")

    while True:
        try:
            choice = input(f"Select (1-{len(supported_languages)}): ")
            selected_index = int(choice)
            if 1 <= selected_index <= len(supported_languages):
                selected_lang = supported_languages[selected_index - 1]
                set_language_default(selected_lang)
                print(f"Language set to: {selected_lang}")
                break
            print("Invalid selection / 無效的選擇")
        except ValueError:
            print("Please enter a number / 請輸入數字")


def copy_amb_driver(lang):
    try:
        print(lang["driver_start"])

        source = resource_path("CH341SER.EXE")
        destination = Path(os.getcwd()) / "CH341SER.EXE"

        shutil.copy(source, destination)
        print(lang["driver_success"])

    except Exception as exc:
        print(lang["driver_error"], exc)


load_amb_driver = copy_amb_driver


def find_amebapro2_root() -> Optional[Path]:
    base_dir = Path.home() / "AppData" / "Local" / "Arduino15"
    matches = list(base_dir.rglob("packages/realtek/hardware/AmebaPro2"))
    if not matches:
        return None
    return matches[0]


def find_uvcd_param_file() -> Optional[Path]:
    ameba_root = find_amebapro2_root()
    if ameba_root is None:
        return None

    subdirs = [directory for directory in ameba_root.iterdir() if directory.is_dir()]
    if not subdirs:
        return None

    return subdirs[0] / "libraries" / "USB" / "src" / "UVCD_pram.h"


def verify_resources():
    required_files = [
        "CH341SER.EXE",
        "lang/zh_TW.json",
        "lang/en_US.json",
        "lang/ja_JP.json",
        "gesture_recognition/hand_code.txt",
        "gesture_recognition/hand_weight.nb",
        "image_classification_japan/img_class_cnn.nb",
    ]
    missing = [file_name for file_name in required_files if not resource_path(file_name).exists()]

    if missing:
        print("Warning: The following required files are missing:")
        for file_name in missing:
            print("  -", file_name)
    else:
        print("Check passed: All resources found.")


def check_new_version(lang):
    try:
        url = APP_LINKS["github_repo"]
        url = url.replace("github.com", "raw.githubusercontent.com") + "/main/version.txt"
        response = requests.get(url)
        github_version = response.text.strip()
        local_version = APP_METADATA["version"]

        if github_version != local_version:
            message = lang["update_available"].format(github=github_version, local=local_version)
            download_message = lang["update_download"].format(repo=APP_LINKS["github_repo"])
            print(f"\033[31m{message}\033[0m")
            print(f"\033[33m{download_message}\033[0m")
        else:
            print(f"\033[32m{lang['update_latest']}\033[0m")

    except Exception as exc:
        print("Error checking for new version:", exc)
