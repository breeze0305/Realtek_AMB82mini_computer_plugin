import os

from .settings import (
    APP_STATE,
    GLOBAL_SETTINGS,
    find_amebapro2_root,
    load_language,
    set_capture_interval_seconds,
    set_language_default,
)


def clear_terminal():
    os.system("cls" if os.name == "nt" else "clear")


def show_hidden_settings(lang):
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
            print(current_lang["global_info_title"])
            for key, value in GLOBAL_SETTINGS.items():
                print(f"{key}: {value}")
        elif choice == "2":
            try:
                seconds = int(input(current_lang["hidden_input_speed"]))
                if seconds > 0:
                    set_capture_interval_seconds(seconds)
                    print(current_lang["hidden_speed_updated"].format(sec=seconds))
                else:
                    print(current_lang["error_invalid_choice"])
            except ValueError:
                print(current_lang["error_invalid_choice"])
        elif choice == "3":
            print(current_lang["hidden_lang_list"])
            supported_languages = APP_STATE["language_support"]
            for index, lang_code in enumerate(supported_languages, start=1):
                print(f"{index}. {lang_code}")
            try:
                selected_index = int(input(current_lang["hidden_input_lang"]))
                if 1 <= selected_index <= len(supported_languages):
                    selected_lang = supported_languages[selected_index - 1]
                    set_language_default(selected_lang)
                    print(current_lang["hidden_lang_updated"].format(lang=APP_STATE["language_default"]))
                    current_lang = load_language(APP_STATE["language_default"])
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


hidden_settings = show_hidden_settings


def open_amb82_package_folder(lang):
    ameba_root = find_amebapro2_root()
    if ameba_root is not None:
        os.startfile(ameba_root)
        print(lang["folder_success"])
    else:
        print(lang["folder_not_found"])


open_amb82_folder = open_amb82_package_folder


def show_capture_frame_tutorial(lang):
    clear_terminal()
    tutorial_keys = (
        "teach_intro_1",
        "teach_intro_2",
        "teach_intro_3",
        "teach_intro_4",
        "teach_intro_5",
        "teach_intro_6",
    )
    for key in tutorial_keys:
        print(lang[key])


teach_for_capture_frame_from_amb = show_capture_frame_tutorial
