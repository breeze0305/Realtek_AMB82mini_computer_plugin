# 🧩 Realtek_AMB82mini_computer_plugin

> 🖥️ A lightweight CLI toolkit designed for **Realtek AMB82-mini** development.  
> 提供簡潔乾淨的命令列工具，用於驅動安裝、開啟 SDK 資料夾與多語系設定。

---

## 🚀 專案簡介

`Realtek_AMB82mini_computer_plugin` 是一款針對 **Realtek AmebaPro2 (AMB82-mini)** 開發板設計的電腦端輔助工具。  
此工具以 **Python CLI（命令列介面）** 為核心，透過簡潔互動式選單，讓使用者快速進行以下操作：

- ✅ 自動下載 CH340 / CH341SER 驅動程式  
- 📂 一鍵開啟 Realtek Arduino SDK 資料夾  
- ⚙️ 進入「隱藏設定模式」以修改語言、拍照速度等參數  
- 🌏 支援多語系（繁中 / 英文 / 日文）

本專案適合嵌入式工程師、學生與研究者快速配置開發環境。

---

## 📁 專案結構
```
Realtek_AMB82mini_computer_plugin/
├── main.py           # 主程式入口（主選單控制）
├── utils.py          # 工具功能（驅動安裝、開啟資料夾、隱藏設定）
├── settings.py       # 全域設定與語言載入
└── lang/             # 多語系 JSON 語言包
    ├── zh_TW.json    # 繁體中文
    ├── en_US.json    # 英文
    └── ja_JP.json    # 日文
```

---

## ⚙️ 安裝與使用方式

### 🔧 1. 安裝 Python
請確保系統已安裝 **Python 3.8 以上版本**。

### 📦 2. 下載專案
```bash
git clone https://github.com/<your-username>/Realtek_AMB82mini_computer_plugin.git
cd Realtek_AMB82mini_computer_plugin
```

### ▶️ 3. 執行程式
```bash
python main.py
```

### 🧭 執行畫面
```
=== 主選單 ===
1. 下載 CH340 驅動程式
2. 開啟 Realtek AMB82-mini 資料夾
3. 離開程式
請輸入選項:
```

---

## 🧰 功能介紹

### 1️⃣ 安裝 CH340 / CH341SER 驅動程式
自動將打包於程式內的驅動程式安裝檔 `CH341SER.EXE` 複製到當前資料夾。

### 2️⃣ 開啟 Realtek SDK 資料夾
快速尋找並開啟以下目錄：
```
C:\Users\<User>\AppData\Local\Arduino15\packages\realtek\hardware\AmebaPro2\
```

### 3️⃣ 隱藏設定模式
輸入 `ntnu` 進入隱藏選單，可執行：
- 顯示所有全域設定資訊  
- 修改拍攝間隔（FPS）  
- 切換系統語言  

---

## 🌏 語言支援

| 語言 | 檔案名稱 | 顯示範例 |
|------|------------|------------|
| 繁體中文 | `lang/zh_TW.json` | 主選單、設定說明 |
| English | `lang/en_US.json` | English CLI interface |
| 日本語 | `lang/ja_JP.json` | 日本語 CLI インターフェース |

可在隱藏設定中直接切換語系：
```
=== 隱藏設定 ===
1. 列印所有全局資訊
2. 修改拍攝速度
3. 修改系統語言
4. 返回主選單
```

---

## 🧑‍💻 作者資訊

| 項目 | 內容 |
|------|------|
| Author | NTNU Feng |
| Email | benfeng99@gmail.com |
| Version | 2.0.0 |
| License | MIT License |

---

## 💡 開發與貢獻

歡迎提交 Pull Request 或 Issue，一起改進此工具。  
若有新的 AMB82-mini 功能需求（例如 Wi-Fi 測試、燒錄工具整合等），可在 Issue 中討論。

---

## 🧱 未來版本規劃
- [ ] 新增自動燒錄（flash）功能  
- [ ] 支援 Linux / macOS 平台  
- [ ] 新增更多 Realtek Ameba 板支援  
- [ ] 提供圖形化界面（GUI 版）

---

## 🪪 授權 License
此專案採用 **MIT License**，可自由使用、修改與散佈。  
請於再發行版本中附上授權聲明。

---

## 🏁 範例截圖（CLI 介面）
```
=== 主選單 ===
1. 下載 CH340 驅動程式
2. 開啟 Realtek AMB82-mini 資料夾
3. 離開程式
請輸入選項: 1
正在複製 CH341SER.EXE...
✅ 驅動程式已複製到當前資料夾。
```

---

🧡 **Realtek_AMB82mini_computer_plugin — 讓 AMB82-mini 設定更簡單、更聰明。**
