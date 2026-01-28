import os
import shutil
import requests
from tqdm import tqdm
from pathlib import Path

from .settings import GLOBAL_SETTINGS, resource_path
from .fn import clear_terminal

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