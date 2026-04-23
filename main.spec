# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('CH341SER.EXE', '.'), ('lang/zh_TW.json', 'lang'), ('lang/en_US.json', 'lang'), ('lang/ja_JP.json', 'lang'), ('gesture_recognition/hand_code.txt', 'gesture_recognition'), ('gesture_recognition/hand_weight.nb', 'gesture_recognition'), ('image_classification_japan/img_class_cnn.nb', 'image_classification_japan')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='main',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)
