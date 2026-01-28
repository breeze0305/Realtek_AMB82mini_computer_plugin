import os
from pathlib import Path


from .settings import GLOBAL_SETTINGS, load_language

def clear_terminal():
    os.system('cls' if os.name == 'nt' else 'clear')
    
def hidden_settings(lang):
    # 如果在內部切換了語言，需要更新外部的 lang 引用，這裡透過回傳新的 lang 來達成
    current_lang = lang
    while True:
        clear_terminal()
        print(current_lang["hidden_title"])
        print("1.", current_lang["hidden_show_info"])
        print("2.", current_lang["hidden_change_speed"])
        print("3.", current_lang["hidden_change_lang"])
        print("4.", current_lang["hidden_back"])
        choice = input(current_lang["hidden_input"])

        if choice == "1":
            clear_terminal()
            print(current_lang["global_info_title"]) # 修正: 使用 JSON 導入
            for k, v in GLOBAL_SETTINGS.items():
                print(f"{k}: {v}")
        elif choice == "2":
            try:
                sec = int(input(current_lang["hidden_input_speed"]))
                if sec > 0:
                    GLOBAL_SETTINGS["take_picture_fps"] = f"1 / {sec}s"
                    print(current_lang["hidden_speed_updated"].format(sec=sec))
                else:
                    print(current_lang["error_invalid_choice"])
            except ValueError:
                print(current_lang["error_invalid_choice"])
        elif choice == "3":
            print(current_lang["hidden_lang_list"])
            for i, l in enumerate(GLOBAL_SETTINGS["language_support"], start=1):
                print(f"{i}. {l}")
            try:
                idx = int(input(current_lang["hidden_input_lang"]))
                if 1 <= idx <= len(GLOBAL_SETTINGS["language_support"]):
                    GLOBAL_SETTINGS["language_default"] = GLOBAL_SETTINGS["language_support"][idx - 1]
                    print(current_lang["hidden_lang_updated"].format(lang=GLOBAL_SETTINGS["language_default"]))
                    # 重新載入語言包
                    current_lang = load_language(GLOBAL_SETTINGS["language_default"])
                else:
                    print(current_lang["error_invalid_choice"])
            except ValueError:
                print(current_lang["error_invalid_choice"])
                
        elif choice == "4":
            break
        else:
            print(current_lang["error_invalid_choice"])
        input(current_lang["main_back"])
    return current_lang

def open_amb82_folder(lang):
    base_dir = Path.home() / "AppData" / "Local" / "Arduino15"
    matches = list(base_dir.rglob("packages/realtek/hardware/AmebaPro2"))
    if matches:
        os.startfile(matches[0])
        print(lang["folder_success"])
    else:
        print(lang["folder_not_found"])
        
def teach_for_capture_frame_from_amb(lang):
    clear_terminal()
    print(lang["teach_intro_1"])
    print(lang["teach_intro_2"])
    print(lang["teach_intro_3"])
    print(lang["teach_intro_4"])
    print(lang["teach_intro_5"])
    print(lang["teach_intro_6"])
    return