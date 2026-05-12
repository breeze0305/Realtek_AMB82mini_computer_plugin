import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Download,
  ExternalLink,
  FolderOpen,
  Languages,
  PackageCheck,
  Play,
  RefreshCcw,
  Square,
  Wifi,
  WifiOff,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type CSSProperties, useEffect, useRef, useState } from "react";

type Language = "zh_TW" | "en_US" | "ja_JP";
type View = "home" | "camera";

type Metadata = {
  author: string;
  contact: string;
  version: string;
  repository: string;
  arduino_ide_url: string;
  vlc_url: string;
  realtek_package_url: string;
  supported_languages: Language[];
};

type AppSettings = {
  capture_interval: number;
  language: Language;
};

type Dashboard = {
  metadata: Metadata;
  settings: AppSettings;
  realtek_folder: string | null;
  output_folder: string;
  internet_connected: boolean;
};

type ActionResult = {
  ok: boolean;
  message: string;
  path?: string | null;
};

type DownloadResult = {
  file_name: string;
  path: string;
  bytes: number;
};

type DownloadKey = "arduino" | "vlc";

type DownloadProgress = {
  key: DownloadKey;
  downloaded: number;
  total?: number | null;
};

type VersionCheck = {
  local: string;
  remote: string;
  is_latest: boolean;
  repository: string;
};

type RunningAction =
  | "driver"
  | "hand"
  | "japan"
  | "taiwan"
  | "arduino"
  | "vlc"
  | "folder"
  | "version"
  | "output"
  | null;

const translations = {
  zh_TW: {
    appTitle: "Realtek AMB82-mini工具",
    language: "語言",
    mainMenu: "主選單",
    files: "檔案取得",
    fileHint: "選擇項目後會開啟 Windows 存檔視窗",
    driver: "CH340/CH341安裝檔",
    hand: "手勢自走車追蹤程式碼/權重",
    japanModel: "影像分類權重(AMB盒子/日本硬幣/滑鼠)",
    taiwanModel: "影像分類權重(AMB盒子/台灣紙鈔/滑鼠)",
    arduino: "Arduino IDE安裝檔",
    vlc: "VLC 安裝檔",
    folder: "開啟AmebaPro2資料夾",
    camera: "AMB相機畫面擷取",
    modelConverter: "模型轉換網站",
    version: "版本檢查",
    github: "GitHub 倉庫",
    preference: "AMB Preference",
    copied: "已複製到剪貼簿",
    online: "外網已連線",
    offline: "外網未連線",
    unavailableOffline: "需要外網連線",
    back: "返回",
    save: "取得",
    open: "開啟",
    check: "檢查",
    preview: "預覽畫面",
    selectCamera: "選擇鏡頭",
    startCapture: "開始截圖",
    stopCapture: "停止截圖",
    noCamera: "尚未找到相機",
    output: "輸出資料夾",
    chooseOutput: "選擇資料夾",
    lastSaved: "最後儲存",
    savedPhoto: "已儲存第 {count} 張照片",
    cameraGuideTitle: "拍攝教學",
    ready: "就緒",
    latest: "目前為最新版本",
    update: "偵測到新版本",
  },
  en_US: {
    appTitle: "Realtek AMB82-mini Tool",
    language: "Language",
    mainMenu: "Main Menu",
    files: "Get Files",
    fileHint: "Each item opens a Windows save dialog",
    driver: "CH340/CH341 Installer",
    hand: "Gesture Car Tracking Code/Weight",
    japanModel: "Image Classification Weight (AMB box/Japan coin/mouse)",
    taiwanModel: "Image Classification Weight (AMB box/Taiwan banknote/mouse)",
    arduino: "Arduino IDE Installer",
    vlc: "VLC Installer",
    folder: "Open AmebaPro2 Folder",
    camera: "AMB Camera Capture",
    modelConverter: "Model Converter Website",
    version: "Version Check",
    github: "GitHub Repository",
    preference: "AMB Preference",
    copied: "Copied to clipboard",
    online: "Internet connected",
    offline: "Internet disconnected",
    unavailableOffline: "Internet required",
    back: "Back",
    save: "Get",
    open: "Open",
    check: "Check",
    preview: "Preview",
    selectCamera: "Select camera",
    startCapture: "Start capture",
    stopCapture: "Stop capture",
    noCamera: "No camera found",
    output: "Output folder",
    chooseOutput: "Choose folder",
    lastSaved: "Last saved",
    savedPhoto: "Saved photo #{count}",
    cameraGuideTitle: "Capture Guide",
    ready: "Ready",
    latest: "You are on the latest version",
    update: "New version available",
  },
  ja_JP: {
    appTitle: "Realtek AMB82-mini ツール",
    language: "言語",
    mainMenu: "メニュー",
    files: "ファイル取得",
    fileHint: "項目を選ぶと Windows の保存画面を開きます",
    driver: "CH340/CH341 インストーラー",
    hand: "ジェスチャーカー追跡コード/重み",
    japanModel: "画像分類重み(AMBボックス/日本硬貨/マウス)",
    taiwanModel: "画像分類重み(AMBボックス/台湾紙幣/マウス)",
    arduino: "Arduino IDE インストーラー",
    vlc: "VLC インストーラー",
    folder: "AmebaPro2 フォルダーを開く",
    camera: "AMB カメラ撮影",
    modelConverter: "モデル変換サイト",
    version: "バージョン確認",
    github: "GitHub リポジトリ",
    preference: "AMB Preference",
    copied: "クリップボードにコピーしました",
    online: "インターネット接続あり",
    offline: "インターネット接続なし",
    unavailableOffline: "インターネットが必要です",
    back: "戻る",
    save: "取得",
    open: "開く",
    check: "確認",
    preview: "プレビュー",
    selectCamera: "カメラを選択",
    startCapture: "撮影開始",
    stopCapture: "撮影停止",
    noCamera: "カメラが見つかりません",
    output: "出力フォルダー",
    chooseOutput: "フォルダー選択",
    lastSaved: "最後の保存",
    savedPhoto: "{count} 枚目の写真を保存しました",
    cameraGuideTitle: "撮影ガイド",
    ready: "準備完了",
    latest: "最新バージョンです",
    update: "新しいバージョンがあります",
  },
} satisfies Record<Language, Record<string, string>>;

const languageNames: Record<Language, string> = {
  zh_TW: "繁體中文",
  en_US: "English",
  ja_JP: "日本語",
};

const arduinoActionLabels: Record<Language, { autoInstall: string }> = {
  zh_TW: {
    autoInstall: "自動安裝",
  },
  en_US: {
    autoInstall: "Auto install",
  },
  ja_JP: {
    autoInstall: "自動インストール",
  },
};

const MODEL_CONVERTER_URL = "https://modelconverter.ntnu-aiot.com/";

function savedPhotoText(language: Language, path: string, fallback: string) {
  const match = path.match(/image_(\d+)\.jpg$/i);
  if (!match) return fallback;

  const count = Number.parseInt(match[1], 10);
  if (!Number.isFinite(count)) return fallback;

  return translations[language].savedPhoto.replace("{count}", String(count));
}

const cameraGuideSteps: Record<Language, string[]> = {
  zh_TW: [
    "將 AMB82 mini 的 CH340 端口插入 USB 線，並連接至電腦。",
    "打開 Arduino IDE。",
    "開啟 AMB82 mini 範例中的 AmebaUSB / UVC_device。",
    "將程式碼直接燒錄到 AMB82 mini 開發板。",
    "燒錄完成後，將 AMB82 mini 的 USB 線插入另一個 8735 USB 端口。",
    "回到此頁面，即可選擇 AMB82 mini 作為拍攝鏡頭。",
  ],
  en_US: [
    "Plug a USB cable into the CH340 port on the AMB82 mini, then connect it to the computer.",
    "Open Arduino IDE.",
    "Open AmebaUSB / UVC_device from the AMB82 mini examples.",
    "Upload the sketch directly to the AMB82 mini development board.",
    "After the upload finishes, move the AMB82 mini USB cable to the other 8735 USB port.",
    "Return to this page and select AMB82 mini as the capture camera.",
  ],
  ja_JP: [
    "AMB82 mini の CH340 ポートに USB ケーブルを接続し、コンピューターにつなぎます。",
    "Arduino IDE を開きます。",
    "AMB82 mini のサンプルから AmebaUSB / UVC_device を開きます。",
    "スケッチを AMB82 mini 開発ボードへ直接書き込みます。",
    "書き込み完了後、AMB82 mini の USB ケーブルをもう一方の 8735 USB ポートに差し替えます。",
    "このページに戻ると、AMB82 mini を撮影用カメラとして選択できます。",
  ],
};

function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [view, setView] = useState<View>("home");
  const [running, setRunning] = useState<RunningAction>(null);
  const [status, setStatus] = useState("");
  const [isFeedbackLeaving, setIsFeedbackLeaving] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Partial<Record<DownloadKey, number>>>({});
  const [internetConnected, setInternetConnected] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState<"arduino" | null>(null);
  const [lastSaved, setLastSaved] = useState("");
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const language = dashboard?.settings.language ?? "zh_TW";
  const t = translations[language];

  useEffect(() => {
    void refreshDashboard();
    const timer = window.setInterval(() => void refreshInternet(), 30000);
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<DownloadProgress>("download-progress", (event) => {
      const { key, downloaded, total } = event.payload;
      const progress = total && total > 0 ? Math.min(downloaded / total, 1) : 0.08;
      setDownloadProgress((current) => ({ ...current, [key]: progress }));
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
      } else {
        unlisten = nextUnlisten;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
      window.clearInterval(timer);
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!status) return;
    setIsFeedbackLeaving(false);
    const leaveTimer = window.setTimeout(() => setIsFeedbackLeaving(true), 1500);
    const clearTimer = window.setTimeout(() => setStatus(""), 1740);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(clearTimer);
    };
  }, [status]);

  useEffect(() => {
    if (view === "camera") {
      void scanCameras();
    }
  }, [view]);

  async function refreshDashboard() {
    const data = await invoke<Dashboard>("get_dashboard");
    setDashboard(data);
    setInternetConnected(data.internet_connected);
    setStatus("");
  }

  async function refreshInternet() {
    const online = await invoke<boolean>("check_internet");
    setInternetConnected(online);
  }

  async function changeLanguage(language: Language) {
    const next = await invoke<AppSettings>("set_language", { language });
    setDashboard((current) => (current ? { ...current, settings: next } : current));
    setIsLanguageMenuOpen(false);
    setStatus("");
  }

  async function copyText(text?: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus(t.copied);
  }

  async function openUrl(url?: string) {
    if (!url) return;
    try {
      await invoke<ActionResult>("open_url", { url });
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function runAction<T>(
    key: Exclude<RunningAction, null>,
    command: string,
    next: (result: T) => string,
  ) {
    try {
      setOpenActionMenu(null);
      setRunning(key);
      if (isDownloadKey(key)) {
        setDownloadProgress((current) => ({ ...current, [key]: 0.02 }));
      }
      const result = await invoke<T>(command);
      setStatus(next(result));
      if (command === "check_version") {
        await refreshInternet();
      }
    } catch (error) {
      setStatus(String(error));
    } finally {
      setRunning(null);
      if (isDownloadKey(key)) {
        window.setTimeout(() => {
          setDownloadProgress((current) => {
            const nextProgress = { ...current };
            delete nextProgress[key];
            return nextProgress;
          });
        }, 500);
      }
    }
  }

  async function selectOutputFolder() {
    try {
      setRunning("output");
      const result = await invoke<ActionResult>("select_output_folder");
      setDashboard((current) =>
        current ? { ...current, output_folder: result.path ?? current.output_folder } : current,
      );
      setStatus(result.path ?? result.message);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setRunning(null);
    }
  }

  function isDownloadKey(key: RunningAction): key is DownloadKey {
    return key === "arduino" || key === "vlc";
  }

  function openCameraView() {
    stopCamera();
    setCameras([]);
    setSelectedCamera("");
    setLastSaved("");
    setView("camera");
  }

  async function scanCameras() {
    try {
      stopCaptureTimer();
      stopPreviewStream();
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
      permissionStream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === "videoinput");
      const nextCamera =
        videoDevices.find((device) => device.deviceId === selectedCamera)?.deviceId ||
        videoDevices[0]?.deviceId ||
        "";
      setCameras(videoDevices);
      setSelectedCamera(nextCamera);
      setStatus(videoDevices.length ? `${videoDevices.length} camera(s)` : t.noCamera);
      if (nextCamera) await startPreview(nextCamera);
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function startPreview(deviceId = selectedCamera) {
    stopCaptureTimer();
    stopPreviewStream();
    if (!deviceId) {
      setStatus(t.noCamera);
      return false;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setIsPreviewing(true);
    setStatus(t.preview);
    return true;
  }

  async function startCapture() {
    try {
      if (!isPreviewing) {
        const started = await startPreview();
        if (!started) return;
      }
      await captureFrame();
      const interval = Math.max(1, dashboard?.settings.capture_interval ?? 1) * 1000;
      timerRef.current = window.setInterval(() => void captureFrame(), interval);
      setIsCapturing(true);
    } catch (error) {
      setStatus(String(error));
    }
  }

  function stopCaptureTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsCapturing(false);
  }

  function stopPreviewStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsPreviewing(false);
  }

  function stopCamera() {
    stopCaptureTimer();
    stopPreviewStream();
  }

  async function selectCamera(deviceId: string) {
    setSelectedCamera(deviceId);
    if (!deviceId) {
      stopCamera();
      return;
    }

    try {
      await startPreview(deviceId);
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) return;

    const buffer = await blob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));
    const result = await invoke<ActionResult>("save_capture_image", { bytes });
    const path = result.path ?? "";
    const savedText = savedPhotoText(language, path, result.message);
    setLastSaved(savedText);
    setStatus(savedText);
  }

  const fileCards = [
    {
      title: t.driver,
      detail: "CH341SER.EXE",
      command: "save_driver_as",
      key: "driver" as const,
      disabled: false,
    },
    {
      title: t.hand,
      detail: "hand_code.txt / hand_weight.nb",
      command: "save_hand_resources_as",
      key: "hand" as const,
      disabled: false,
    },
    {
      title: t.japanModel,
      detail: "img_class_cnn.nb(box/money/mouse)",
      command: "save_image_model_japan_as",
      key: "japan" as const,
      disabled: false,
    },
    {
      title: t.taiwanModel,
      detail: "img_class_cnn.nb(box/money/mouse)",
      command: "save_image_model_taiwan_as",
      key: "taiwan" as const,
      disabled: false,
    },
    {
      title: t.arduino,
      detail: "arduino-ide_2.3.8_Windows_64bit.exe",
      command: "download_arduino_ide_as",
      key: "arduino" as const,
      disabled: !internetConnected,
    },
    {
      title: t.vlc,
      detail: "vlc-3.0.21-win64.exe",
      command: "download_vlc_as",
      key: "vlc" as const,
      disabled: !internetConnected,
    },
  ];

  const mainCards = [
    ...fileCards.map((card) => {
      const action = () =>
        runAction<ActionResult | DownloadResult>(
          card.key,
          card.command,
          (result) => result.path ?? ("message" in result ? result.message : ""),
        );

      return {
        title: card.title,
        detail: card.detail,
        icon: PackageCheck,
        action,
        menuActions:
          card.key === "arduino"
            ? [
                {
                  label: arduinoActionLabels[language].autoInstall,
                  action: () =>
                    runAction<DownloadResult>(
                      "arduino",
                      "download_and_install_arduino_ide",
                      (result) => result.path,
                    ),
                },
              ]
            : undefined,
        label: t.save,
        disabled: card.disabled,
        key: card.key,
        actionIcon: Download,
      };
    }),
    {
      title: t.folder,
      detail: "",
      icon: FolderOpen,
      action: () =>
        runAction<ActionResult>("folder", "open_realtek_folder", (result) => result.path ?? result.message),
      label: t.open,
      disabled: false,
      key: "folder" as const,
      actionIcon: CheckCircle2,
      menuActions: undefined,
    },
    {
      title: t.camera,
      detail: "",
      icon: Camera,
      action: () => void openCameraView(),
      label: t.open,
      disabled: false,
      key: null,
      actionIcon: CheckCircle2,
      menuActions: undefined,
    },
    {
      title: t.modelConverter,
      detail: "",
      icon: ExternalLink,
      action: () => void openUrl(MODEL_CONVERTER_URL),
      label: t.open,
      disabled: !internetConnected,
      key: null,
      actionIcon: ExternalLink,
      menuActions: undefined,
    },
    {
      title: t.version,
      detail: dashboard ? `v${dashboard.metadata.version}` : "",
      icon: RefreshCcw,
      action: () =>
        runAction<VersionCheck>("version", "check_version", (result) =>
          result.is_latest ? `${t.latest}: ${result.local}` : `${t.update}: ${result.remote} / ${result.local}`,
        ),
      label: t.check,
      disabled: !internetConnected,
      key: "version" as const,
      actionIcon: CheckCircle2,
      menuActions: undefined,
    },
  ];

  return (
    <main className="appShell">
      <header className="appHeader">
        <button
          className="backButton"
          onClick={() => {
            stopCamera();
            setView("home");
          }}
          hidden={view === "home"}
          title={t.back}
        >
          <ArrowLeft size={18} />
          {t.back}
        </button>
        <h1>{t.appTitle}</h1>
        <div
          className={`languageSelect ${isLanguageMenuOpen ? "isOpen" : ""}`}
          ref={languageMenuRef}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget as Node | null;
            if (!nextTarget || !languageMenuRef.current?.contains(nextTarget)) {
              setIsLanguageMenuOpen(false);
            }
          }}
        >
          <button
            type="button"
            className="languageSelectButton"
            aria-haspopup="listbox"
            aria-expanded={isLanguageMenuOpen}
            onClick={() => setIsLanguageMenuOpen((current) => !current)}
          >
            <Languages size={17} />
            <span>{t.language}</span>
            <strong>{languageNames[language]}</strong>
            <ChevronDown size={17} />
          </button>
          {isLanguageMenuOpen && (
            <div className="languageMenu" role="listbox">
              {dashboard?.metadata.supported_languages.map((item) => (
                <button
                  type="button"
                  className={item === language ? "isSelected" : ""}
                  role="option"
                  aria-selected={item === language}
                  onClick={() => void changeLanguage(item)}
                  key={item}
                >
                  {languageNames[item]}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="linkPanel">
        <button onClick={() => void openUrl(dashboard?.metadata.repository)} title={t.github}>
          <span>{t.github}</span>
          <strong>{dashboard?.metadata.repository}</strong>
          <ExternalLink size={17} />
        </button>
        <button onClick={() => copyText(dashboard?.metadata.realtek_package_url)} title={t.preference}>
          <span>{t.preference}</span>
          <strong>{dashboard?.metadata.realtek_package_url}</strong>
          <Clipboard size={17} />
        </button>
      </section>

      {status && <div className={`feedbackToast ${isFeedbackLeaving ? "leaving" : ""}`}>{status}</div>}

      {view === "home" && (
        <section className="contentSection">
          <h2>{t.mainMenu}</h2>
          <div className="menuGrid">
            {mainCards.map((card, index) => {
              const Icon = card.icon;
              const isRunning = card.key !== null && running === card.key;
              const ActionIcon = card.actionIcon;
              const progress = isDownloadKey(card.key) ? downloadProgress[card.key] : undefined;
              const progressStyle =
                progress === undefined
                  ? undefined
                  : ({
                      "--card-progress": `${Math.max(4, Math.round(progress * 100))}%`,
                    } as CSSProperties);
              return (
                <article
                  className={`menuCard ${progress === undefined ? "" : "isDownloading"} ${
                    openActionMenu === card.key ? "hasOpenActionMenu" : ""
                  }`}
                  key={card.title}
                  style={progressStyle}
                >
                  <span className="cardIndex">{String(index + 1).padStart(2, "0")}</span>
                  <div className="cardIcon">
                    <Icon size={24} />
                  </div>
                  <div className="cardText">
                    <h3>{card.title}</h3>
                    {(card.disabled || card.detail) && <p>{card.disabled ? t.unavailableOffline : card.detail}</p>}
                  </div>
                  {card.menuActions ? (
                    <div
                      className={`splitAction ${openActionMenu === card.key ? "isOpen" : ""}`}
                      onBlur={(event) => {
                        const nextTarget = event.relatedTarget as Node | null;
                        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                          setOpenActionMenu(null);
                        }
                      }}
                    >
                      <button
                        className="primaryBtn splitMain"
                        onClick={card.action}
                        disabled={card.disabled || isRunning}
                      >
                        {isRunning ? <RefreshCcw className="spin" size={17} /> : <ActionIcon size={17} />}
                        {card.label}
                      </button>
                      <button
                        type="button"
                        className="primaryBtn splitToggle"
                        aria-haspopup="menu"
                        aria-expanded={openActionMenu === card.key}
                        aria-label={card.title}
                        onClick={() =>
                          setOpenActionMenu((current) => (current === "arduino" ? null : "arduino"))
                        }
                        disabled={card.disabled || isRunning}
                      >
                        <ChevronDown size={17} />
                      </button>
                      {openActionMenu === card.key && (
                        <div className="actionMenu" role="menu">
                          {card.menuActions.map((item) => (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenActionMenu(null);
                                item.action();
                              }}
                              key={item.label}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button className="primaryBtn" onClick={card.action} disabled={card.disabled || isRunning}>
                      {isRunning ? <RefreshCcw className="spin" size={17} /> : <ActionIcon size={17} />}
                      {card.label}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {view === "camera" && (
        <section className="contentSection cameraSection">
          <div className="sectionTop">
            <h2>{t.camera}</h2>
            <button
              className="secondaryBtn"
              onClick={() => runAction<ActionResult>("output", "open_output_folder", (result) => result.path ?? result.message)}
            >
              <FolderOpen size={17} />
              {t.output}
            </button>
          </div>
          <div className="videoFrame">
            <video ref={videoRef} muted playsInline />
            {!isPreviewing && <span>{t.preview}</span>}
          </div>
          <div className="cameraControls">
            <select value={selectedCamera} onChange={(event) => void selectCamera(event.target.value)} aria-label={t.selectCamera}>
              <option value="">{t.noCamera}</option>
              {cameras.map((device, index) => (
                <option value={device.deviceId} key={device.deviceId}>
                  {device.label || `Camera ${index}`}
                </option>
              ))}
            </select>
            <button className={isCapturing ? "dangerBtn" : "primaryBtn"} onClick={isCapturing ? stopCaptureTimer : startCapture}>
              {isCapturing ? <Square size={17} /> : <Play size={17} />}
              {isCapturing ? t.stopCapture : t.startCapture}
            </button>
            <button className="secondaryBtn" onClick={() => void selectOutputFolder()} disabled={isCapturing || running === "output"}>
              <FolderOpen size={17} />
              {t.chooseOutput}
            </button>
          </div>
          <dl className="pathList">
            <div>
              <dt>{t.output}</dt>
              <dd>{dashboard?.output_folder ?? ""}</dd>
            </div>
            <div>
              <dt>{t.lastSaved}</dt>
              <dd>{lastSaved || "-"}</dd>
            </div>
          </dl>
          <section className="cameraGuide">
            <h3>{t.cameraGuideTitle}</h3>
            <ol>
              {cameraGuideSteps[language].map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        </section>
      )}

      <div className={internetConnected ? "networkStatus online" : "networkStatus offline"}>
        {internetConnected ? <Wifi size={17} /> : <WifiOff size={17} />}
        {internetConnected ? t.online : t.offline}
      </div>
    </main>
  );
}

export default App;
