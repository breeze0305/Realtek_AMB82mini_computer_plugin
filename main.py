#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from utils import (
    APP_LINKS,
    APP_STATE,
    capture_frame_from_amb,
    check_new_version,
    clear_terminal,
    copy_amb_driver,
    copy_hand_gesture_files,
    copy_image_classification_model,
    download_file,
    load_language,
    open_amb82_package_folder,
    select_startup_language,
    show_capture_frame_tutorial,
    show_hidden_settings,
    show_preference_link,
    start_background_uvcd_task,
)


def _download_filename(url):
    return url.rsplit("/", 1)[-1]


def _run_lang_action(action, lang):
    action(lang)
    return lang, True


def _run_download(url, lang):
    download_file(url, _download_filename(url))
    return lang, True


def _check_version(lang):
    clear_terminal()
    check_new_version(lang)
    return lang, True


def _open_hidden_settings(lang):
    return show_hidden_settings(lang), True


def _exit_app(lang):
    print(lang["main_exit"])
    return lang, False


def _build_main_actions(lang):
    return {
        "1": lambda: _run_lang_action(copy_amb_driver, lang),
        "2": lambda: _run_lang_action(open_amb82_package_folder, lang),
        "3": lambda: _run_lang_action(show_capture_frame_tutorial, lang),
        "4": lambda: _run_lang_action(capture_frame_from_amb, lang),
        "5": lambda: _run_download(APP_LINKS["arduino_dl_link"], lang),
        "6": lambda: _run_lang_action(show_preference_link, lang),
        "7": lambda: _run_download(APP_LINKS["vlc_dl_link"], lang),
        "8": lambda: _run_lang_action(copy_hand_gesture_files, lang),
        "9": lambda: _run_lang_action(copy_image_classification_model, lang),
        "10": lambda: _check_version(lang),
        "11": lambda: _exit_app(lang),
        "ntnu": lambda: _open_hidden_settings(lang),
    }


def _handle_menu_choice(choice, lang):
    action = _build_main_actions(lang).get(choice.lower())
    if action is None:
        print(lang["error_invalid_choice"])
        return lang, True
    return action()


def main():
    select_startup_language()
    lang = load_language(APP_STATE["language_default"])

    uvcd_stop_event = start_background_uvcd_task()

    while True:
        clear_terminal()
        print(lang["main_title"])
        for key, value in lang["main_options"].items():
            print(f"{key}. {value}")

        choice = input(lang["main_input"])
        lang, keep_running = _handle_menu_choice(choice, lang)

        if not keep_running:
            break

        input(lang["main_back"])


if __name__ == "__main__":
    main()
