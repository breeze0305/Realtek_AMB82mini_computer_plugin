import os
os.environ["OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS"] = "0"
import re
import shutil
import requests
import time
import threading
from pathlib import Path
from tqdm import tqdm

from settings import GLOBAL_SETTINGS, load_language, resource_path

def clear_terminal():
    os.system('cls' if os.name == 'nt' else 'clear')

def open_amb82_folder(lang):
    base_dir = Path.home() / "AppData" / "Local" / "Arduino15"
    matches = list(base_dir.rglob("packages/realtek/hardware/AmebaPro2"))
    if matches:
        os.startfile(matches[0])
        print(lang["folder_success"])
    else:
        print(lang["folder_not_found"])

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

def _get_UVCD_pram_file():
    base_dir = Path.home() / "AppData" / "Local" / "Arduino15"
    matches = list(base_dir.rglob("packages/realtek/hardware/AmebaPro2"))

    ameba_dir = matches[0]
    subdirs = [d for d in ameba_dir.iterdir() if d.is_dir()]

    uvcd_path = subdirs[0] / "libraries" / "USB" / "src" / "UVCD_pram.h"
    return uvcd_path
    
def set_UVCD_pram_file():
    try:
        file_path = _get_UVCD_pram_file()

        text = file_path.read_text(encoding="utf-8")
        # 使用正規表示式匹配所有 UVCD_* 定義
        pattern = re.compile(r"^#define\s+(UVCD_\w+)\s+(\d+)", re.MULTILINE)

        def replace_define(match):
            name = match.group(1)
            value = match.group(2)
            if name == "UVCD_H264":
                return match.group(0)  # 保留原樣
            elif name.startswith("UVCD_"):
                return f"#define {name} 0"  # 改為0
            else:
                return match.group(0)

        # 套用修改
        new_text = pattern.sub(replace_define, text)

        # 寫回檔案
        file_path.write_text(new_text, encoding="utf-8")
    except:
        pass
    
def teach_for_capture_frame_from_amb(lang):
    clear_terminal()
    print(lang["teach_intro_1"])
    print(lang["teach_intro_2"])
    print(lang["teach_intro_3"])
    print(lang["teach_intro_4"])
    print(lang["teach_intro_5"])
    print(lang["teach_intro_6"])
    return


def capture_frame_from_amb(lang, output="./output"):
    import cv2
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    clear_terminal()
    print(lang["capture_scan"])

    available_cams = []
    cam_views = {}
    
    # 從語言檔獲取相機標籤，預設為 "Camera"
    cam_label = lang.get("camera_label", "Camera")

    for cam_id in range(6):
        cap = cv2.VideoCapture(cam_id)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret:
                available_cams.append(cam_id)
                frame = cv2.resize(frame, (640, 480))
                # 修正: 使用語言檔中的 camera_label
                frame = cv2.putText(frame, f"{cam_label} {cam_id}", (10, 30),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                cam_views[cam_id] = frame
            cap.release()

    if len(available_cams) == 0:
        print(lang["capture_none"])
        return
    elif len(available_cams) == 1:
        cam_choice = available_cams[0]
        print(lang["capture_one"].format(cam_id=cam_choice))
    else:
        print(lang["capture_multi"])
        stop_flag = False
        user_input = {"value": None}

        def show_cameras():
            while not stop_flag:
                for cam_id, frame in cam_views.items():
                    cv2.imshow(f"camera_{cam_id}", frame)
                if cv2.waitKey(30) == 27:
                    break
            cv2.destroyAllWindows()

        t = threading.Thread(target=show_cameras, daemon=True)
        t.start()

        while True:
            try:
                cam_choice = input(lang["capture_input"].format(default_id=available_cams[0])) or str(available_cams[0])
                cam_choice = int(cam_choice)
                if cam_choice in available_cams:
                    user_input["value"] = cam_choice
                    print(lang["capture_selected"].format(cam_id=cam_choice))
                    break
                else:
                    print(lang["capture_invalid"])
            except ValueError:
                print(lang["capture_not_number"])

        stop_flag = True
        t.join(timeout=1.0)
        cv2.destroyAllWindows()
        cam_choice = user_input["value"]

    cap = cv2.VideoCapture(cam_choice)
    interval = 1.0
    print(lang["capture_start"].format(cam_id=cam_choice, interval=interval))

    existing_files = list(output.glob("image_*.jpg"))
    if existing_files:
        # 安全地解析檔名編號
        max_id = 0
        for f in existing_files:
            parts = f.stem.split("_")
            if len(parts) > 1 and parts[1].isdigit():
                fid = int(parts[1])
                if fid > max_id:
                    max_id = fid
    else:
        max_id = 0

    img_id = max_id + 1
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print(lang["capture_failed"])
                break
            filename = output / f"image_{img_id:05d}.jpg"
            cv2.imwrite(str(filename), frame)
            print(lang["capture_saved"].format(filename=filename))
            img_id += 1
            time.sleep(interval)
    except KeyboardInterrupt:
        print(lang["capture_interrupt"])
        # 不直接 exit()，而是讓函數結束返回主選單
        return
    
def download_file(url, output_path):
    clear_terminal()
    # 送出 HTTP GET 請求，啟用 stream 模式
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get('content-length', 0))

    block_size = 1024  # 1 KB
    t = tqdm(total=total_size, unit='B', unit_scale=True, desc="Downloading")

    with open(output_path, 'wb') as file:
        for data in response.iter_content(block_size):
            file.write(data)
            t.update(len(data))


    t.close()
    return 

def get_preference_link(lang):
    clear_terminal()
    print(lang["copy_link"])
    link = GLOBAL_SETTINGS["preference_link"]
    print(link)
    print("======================")
    return

def get_hand_gesture_files(lang):
    """
    將 CH341SER.EXE 從內部資源複製到目前工作資料夾。
    （打包後從 sys._MEIPASS 提取，開發時從原始檔案夾取）
    """
    try:
        print(lang["hand_file_copy"])

        src1 = resource_path("gesture_recognition/hand_code.txt")
        src2 = resource_path("gesture_recognition/hand_weight.nb")
        dst1 = Path(os.getcwd()) / "hand_code.txt"
        dst2 = Path(os.getcwd()) / "hand_weight.nb"

        shutil.copy(src1, dst1)
        shutil.copy(src2, dst2)

    except Exception as e:
        print(lang["hand_file_error"], e)