import re
import time
import threading
import os
os.environ["OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS"] = "0"
from pathlib import Path

from .fn import clear_terminal

CHECK_INTERVAL_SEC = 5 * 60

def set_UVCD_pram_file() -> bool:
    """
    回傳:
        True  表示已經完成修改（或已修改過），可以停止之後的輪詢
        False 表示暫時還不能完成（檔案不存在等），之後要再試
    """
    
    def _get_UVCD_pram_file():
        base_dir = Path.home() / "AppData" / "Local" / "Arduino15"
        matches = list(base_dir.rglob("packages/realtek/hardware/AmebaPro2"))

        ameba_dir = matches[0]
        subdirs = [d for d in ameba_dir.iterdir() if d.is_dir()]

        uvcd_path = subdirs[0] / "libraries" / "USB" / "src" / "UVCD_pram.h"
        return uvcd_path
    
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
        
        return True
    except:
        return False
    
def start_background_uvcd_task():
    """
    啟動一個背景 thread：
    - 每 10 分鐘呼叫一次 set_UVCD_pram_file()
    - 如果 set_UVCD_pram_file() 回傳 True，就停止檢查
    回傳:
        stop_event：若你想主動提早結束這個背景任務，可呼叫 stop_event.set()
    """
    stop_event = threading.Event()

    def worker():
        while not stop_event.is_set():
            # 試著修改 / 檢查
            done = set_UVCD_pram_file()
            if done:
                break

            sleep_left = CHECK_INTERVAL_SEC
            while sleep_left > 0 and not stop_event.is_set():
                step = min(5, sleep_left)
                time.sleep(step)
                sleep_left -= step

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return stop_event
    
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