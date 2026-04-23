import os
import shutil
from pathlib import Path

import requests
from tqdm import tqdm

from .fn import clear_terminal
from .settings import APP_LINKS, resource_path


def show_preference_link(lang):
    clear_terminal()
    print(lang["copy_link"])
    print(APP_LINKS["preference_link"])
    print("======================")


get_preference_link = show_preference_link


def copy_hand_gesture_files(lang):
    try:
        print(lang["hand_file_copy"])

        source_code = resource_path("gesture_recognition/hand_code.txt")
        source_weight = resource_path("gesture_recognition/hand_weight.nb")
        destination_code = Path(os.getcwd()) / "hand_code.txt"
        destination_weight = Path(os.getcwd()) / "hand_weight.nb"

        shutil.copy(source_code, destination_code)
        shutil.copy(source_weight, destination_weight)

    except Exception as exc:
        print(lang["hand_file_error"], exc)


get_hand_gesture_files = copy_hand_gesture_files


def copy_image_classification_model(lang):
    try:
        print(lang["image_class_copy"])

        source_model = resource_path("image_classification_japan/img_class_cnn.nb")
        destination_model = Path(os.getcwd()) / "img_class_cnn.nb"

        shutil.copy(source_model, destination_model)
        print(lang["image_class_success"])

    except Exception as exc:
        print(lang["image_class_error"], exc)


get_image_classification_model = copy_image_classification_model


def download_file(url, output_path):
    clear_terminal()
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get("content-length", 0))

    block_size = 1024
    progress = tqdm(total=total_size, unit="B", unit_scale=True, desc="Downloading")

    with open(output_path, "wb") as file:
        for data in response.iter_content(block_size):
            file.write(data)
            progress.update(len(data))

    progress.close()
