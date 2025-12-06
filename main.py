#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from utils import *
from settings import (GLOBAL_SETTINGS, 
                      load_language, 
                      load_amb_driver, 
                      select_startup_language, 
                      check_new_version)

def main():
    # 1. 程式啟動時，先進入語言選擇介面
    select_startup_language()

    # 2. 根據選擇結果載入語言包
    lang = load_language(GLOBAL_SETTINGS["language_default"])
    
    set_UVCD_pram_file()
    
    while True:
        clear_terminal()
        print(lang["main_title"])
        for k, v in lang["main_options"].items():
            print(f"{k}. {v}")
        choice = input(lang["main_input"])

        if choice == "1":
            load_amb_driver(lang)
        elif choice == "2":
            open_amb82_folder(lang)
        elif choice == "3":
            set_UVCD_pram_file()
            teach_for_capture_frame_from_amb(lang)
        elif choice == "4":
            capture_frame_from_amb(lang)
        elif choice == "5":
            link = GLOBAL_SETTINGS["arduino_dl_link"]
            download_file(link, link.split("/")[-1])
        elif choice == "6":
            get_preference_link(lang)
        elif choice == "7":
            link = GLOBAL_SETTINGS["vlc_dl_link"]
            download_file(link, link.split("/")[-1])
        elif choice == "8":
            get_hand_gesture_files(lang)
        elif choice == "9":
            clear_terminal()
            check_new_version(lang)
        elif choice == "10":
            print(lang["main_exit"])
            break
        
        
        elif choice.lower() == "ntnu":
            # hidden_settings 可能會改變語言，所以需要接收回傳值更新 lang
            lang = hidden_settings(lang)
        else:
            print(lang["error_invalid_choice"])

        input(lang["main_back"])

if __name__ == "__main__":
    main()