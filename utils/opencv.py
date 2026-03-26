import os
import re
import threading
import time
from pathlib import Path

from .fn import clear_terminal
from .settings import find_uvcd_param_file, get_capture_interval_seconds

os.environ["OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS"] = "0"

CHECK_INTERVAL_SEC = 5 * 60


def patch_uvcd_param_file():
    try:
        file_path = find_uvcd_param_file()
        if file_path is None:
            return False

        text = file_path.read_text(encoding="utf-8")
        pattern = re.compile(r"^#define\s+(UVCD_\w+)\s+(\d+)", re.MULTILINE)

        def replace_define(match):
            name = match.group(1)
            if name == "UVCD_H264":
                return match.group(0)
            if name.startswith("UVCD_"):
                return f"#define {name} 0"
            return match.group(0)

        new_text = pattern.sub(replace_define, text)
        file_path.write_text(new_text, encoding="utf-8")
        return True
    except:
        return False


set_UVCD_pram_file = patch_uvcd_param_file


def start_background_uvcd_task():
    stop_event = threading.Event()

    def worker():
        while not stop_event.is_set():
            done = patch_uvcd_param_file()
            if done:
                break

            sleep_left = CHECK_INTERVAL_SEC
            while sleep_left > 0 and not stop_event.is_set():
                step = min(5, sleep_left)
                time.sleep(step)
                sleep_left -= step

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    return stop_event


def scan_available_cameras(cv2, _lang):
    available_cameras = []
    camera_previews = {}

    for camera_id in range(6):
        capture = cv2.VideoCapture(camera_id)
        try:
            if capture.isOpened():
                success, frame = capture.read()
                if success:
                    preview_frame = cv2.resize(frame, (640, 480))
                    preview_frame = cv2.putText(
                        preview_frame,
                        f"Camera {camera_id}",
                        (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        1,
                        (0, 255, 0),
                        2,
                    )
                    available_cameras.append(camera_id)
                    camera_previews[camera_id] = preview_frame
        finally:
            capture.release()

    return available_cameras, camera_previews


def choose_camera(cv2, lang, available_cameras, camera_previews):
    if not available_cameras:
        print(lang["capture_none"])
        return None

    if len(available_cameras) == 1:
        camera_id = available_cameras[0]
        print(lang["capture_one"].format(cam_id=camera_id))
        return camera_id

    print(lang["capture_multi"])
    stop_event = threading.Event()

    def show_cameras():
        while not stop_event.is_set():
            for camera_id, frame in camera_previews.items():
                cv2.imshow(f"camera_{camera_id}", frame)
            if cv2.waitKey(30) == 27:
                break
        cv2.destroyAllWindows()

    preview_thread = threading.Thread(target=show_cameras, daemon=True)
    preview_thread.start()

    try:
        while True:
            try:
                raw_choice = input(lang["capture_input"].format(default_id=available_cameras[0]))
                camera_id = int(raw_choice or str(available_cameras[0]))
                if camera_id in available_cameras:
                    print(lang["capture_selected"].format(cam_id=camera_id))
                    return camera_id
                print(lang["capture_invalid"])
            except ValueError:
                print(lang["capture_not_number"])
    finally:
        stop_event.set()
        preview_thread.join(timeout=1.0)
        cv2.destroyAllWindows()


def find_next_image_id(output_dir):
    max_id = 0
    for file_path in output_dir.glob("image_*.jpg"):
        parts = file_path.stem.split("_")
        if len(parts) > 1 and parts[1].isdigit():
            file_id = int(parts[1])
            if file_id > max_id:
                max_id = file_id
    return max_id + 1


def capture_loop(cv2, cap, output_dir, lang, start_image_id, interval_seconds):
    image_id = start_image_id
    try:
        while True:
            success, frame = cap.read()
            if not success:
                print(lang["capture_failed"])
                break

            filename = output_dir / f"image_{image_id:05d}.jpg"
            cv2.imwrite(str(filename), frame)
            print(lang["capture_saved"].format(filename=filename))
            image_id += 1
            time.sleep(interval_seconds)
    except KeyboardInterrupt:
        print(lang["capture_interrupt"])
        return
    finally:
        cap.release()


def capture_frame_from_amb(lang, output="./output"):
    import cv2

    output_dir = Path(output)
    output_dir.mkdir(parents=True, exist_ok=True)

    clear_terminal()
    print(lang["capture_scan"])

    available_cameras, camera_previews = scan_available_cameras(cv2, lang)
    camera_id = choose_camera(cv2, lang, available_cameras, camera_previews)
    if camera_id is None:
        return

    capture = cv2.VideoCapture(camera_id)
    interval_seconds = get_capture_interval_seconds()
    print(lang["capture_start"].format(cam_id=camera_id, interval=interval_seconds))

    next_image_id = find_next_image_id(output_dir)
    capture_loop(cv2, capture, output_dir, lang, next_image_id, interval_seconds)
