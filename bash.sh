pyinstaller --onefile --console --name amb_plugin --icon="./icon.ico" --add-data "CH341SER.EXE;." --add-data "lang/zh_TW.json;lang" --add-data "lang/en_US.json;lang" --add-data "lang/ja_JP.json;lang" --add-data "gesture_recognition/hand_code.txt;gesture_recognition" --add-data "gesture_recognition/hand_weight.nb;gesture_recognition" --add-data "image_classification_japan/img_class_cnn.nb;image_classification_japan" main.py

print("\033[31m紅色字\033[0m")
print("\033[32m綠色字\033[0m")
print("\033[33m黃色字\033[0m")
print("\033[34m藍色字\033[0m")
print("\033[35m紫色字\033[0m")
print("\033[36m青色字\033[0m")
print("\033[1m粗體字\033[0m")
print("\033[4m底線字\033[0m")
