import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

import {
  AUTO_UPDATE_CHECK_STORAGE_KEY,
  converterModelDefaults,
  RELEASES_URL,
  TOAST_DISPLAY_MS,
  TOAST_FADE_MS,
  VERSION_CHECK_STORAGE_KEY,
  uvcdFormatOptions,
} from "./appConfig";
import { cameraGuideSteps, PREFERENCE_COPY_MESSAGE, translations } from "./i18n";
import {
  converterApiUrl,
  fileMatchesExtensions,
  readApiJson,
  savedPhotoText,
  wait,
} from "./converterUtils";
import { AppHeader } from "./components/AppHeader";
import { AnnotationView } from "./components/AnnotationView";
import { CameraView } from "./components/CameraView";
import { ConverterView } from "./components/ConverterView";
import { HomeView } from "./components/HomeView";
import { LinkPanel } from "./components/LinkPanel";
import { NetworkStatus } from "./components/NetworkStatus";
import { SettingsView } from "./components/SettingsView";
import { createHomeCards } from "./homeCards";
import type {
  ActionResult,
  AppSettings,
  CompletedConversion,
  ConversionCreateResponse,
  ConversionStatusResponse,
  ConverterModel,
  ConverterModelsResponse,
  Dashboard,
  DownloadKey,
  DownloadProgress,
  DownloadResult,
  Language,
  ModelType,
  PreferenceVersion,
  RunningAction,
  SettingsResetResult,
  UvcdFormat,
  UvcdResult,
  VersionCheck,
  View,
} from "./types";

function isStoredVersionCheck(value: unknown): value is VersionCheck {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<VersionCheck>;
  return (
    typeof data.local === "string" &&
    typeof data.remote === "string" &&
    typeof data.is_latest === "boolean" &&
    typeof data.is_beta === "boolean" &&
    typeof data.repository === "string"
  );
}

function readStoredVersionCheck(currentVersion: string) {
  try {
    const raw = window.localStorage.getItem(VERSION_CHECK_STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as unknown;
    if (isStoredVersionCheck(data) && data.local === currentVersion) {
      return data;
    }

    window.localStorage.removeItem(VERSION_CHECK_STORAGE_KEY);
  } catch {
    window.localStorage.removeItem(VERSION_CHECK_STORAGE_KEY);
  }

  return null;
}

function writeStoredVersionCheck(result: VersionCheck) {
  try {
    window.localStorage.setItem(VERSION_CHECK_STORAGE_KEY, JSON.stringify(result));
  } catch {
    // The in-memory state still updates if local storage is unavailable.
  }
}

function readStoredAutoCheckUpdates() {
  try {
    const raw = window.localStorage.getItem(AUTO_UPDATE_CHECK_STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

function writeStoredAutoCheckUpdates(enabled: boolean) {
  try {
    window.localStorage.setItem(AUTO_UPDATE_CHECK_STORAGE_KEY, String(enabled));
  } catch {
    // The setting remains active for the current session if local storage is unavailable.
  }
}

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
  const [openActionMenu, setOpenActionMenu] = useState<"arduino" | "vlc" | null>(null);
  const [lastSaved, setLastSaved] = useState("");
  const [converterModels, setConverterModels] = useState<Record<ModelType, ConverterModel>>(converterModelDefaults);
  const [converterMaxFileSizeMb, setConverterMaxFileSizeMb] = useState(120);
  const [converterType, setConverterType] = useState<ModelType>("yolo");
  const [converterFile, setConverterFile] = useState<File | null>(null);
  const [converterTask, setConverterTask] = useState<ConversionStatusResponse | null>(null);
  const [completedConversion, setCompletedConversion] = useState<CompletedConversion | null>(null);
  const [converterStatus, setConverterStatus] = useState("");
  const [isConverterBusy, setIsConverterBusy] = useState(false);
  const [versionCheck, setVersionCheck] = useState<VersionCheck | null>(null);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(readStoredAutoCheckUpdates);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const converterInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoCheckStartedRef = useRef(false);
  const converterAbortRef = useRef<AbortController | null>(null);
  const converterRunIdRef = useRef(0);

  const language = dashboard?.settings.language ?? "zh_TW";
  const t = translations[language];
  const selectedUvcdFormat = dashboard?.settings.uvcd_format ?? "MJPG";
  const selectedPreferenceVersion = dashboard?.settings.preference_version ?? "beta";
  const selectedConverterModel = converterModels[converterType];
  const converterExtensions = selectedConverterModel.input_extensions.join(", ");
  const modelConverterUrl = dashboard?.metadata.model_converter_url ?? "";
  const modelConverterApiBase = dashboard?.metadata.model_converter_api_base ?? "";

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
      cancelModelConversionRequest({ resetUi: false });
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!status) return;
    setIsFeedbackLeaving(false);
    const displayMs = status === PREFERENCE_COPY_MESSAGE ? TOAST_DISPLAY_MS * 2 : TOAST_DISPLAY_MS;
    const leaveTimer = window.setTimeout(() => setIsFeedbackLeaving(true), displayMs);
    const clearTimer = window.setTimeout(() => setStatus(""), displayMs + TOAST_FADE_MS);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(clearTimer);
    };
  }, [status]);

  useEffect(() => {
    if (view === "camera") {
      void scanCameras();
    }
    if (view === "converter" && modelConverterApiBase) {
      void loadConverterModels();
    }
    if (view !== "converter") {
      cancelModelConversionRequest();
    }
  }, [view, modelConverterApiBase]);

  async function refreshDashboard() {
    const data = await invoke<Dashboard>("get_dashboard");
    setDashboard(data);
    setInternetConnected(data.internet_connected);
    setVersionCheck(readStoredVersionCheck(data.metadata.version));
    setStatus("");
    if (autoCheckUpdates && !autoCheckStartedRef.current) {
      autoCheckStartedRef.current = true;
      void checkVersionOnStartup(data.settings.language);
    }
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

  async function changeUvcdFormat(format: UvcdFormat) {
    try {
      setRunning("settings");
      const result = await invoke<UvcdResult>("set_uvcd_format", { format });
      setDashboard((current) =>
        current
          ? {
              ...current,
              settings: {
                ...current.settings,
                uvcd_format: result.format,
              },
            }
          : current,
      );
      const label = uvcdFormatOptions.find((item) => item.value === result.format)?.label ?? result.format;
      setStatus(result.path ? `${t.uvcdSaved}: ${label}` : result.message);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setRunning(null);
    }
  }

  async function changePreferenceVersion(version: PreferenceVersion) {
    if (version === selectedPreferenceVersion) return;

    try {
      setRunning("settings");
      const next = await invoke<Dashboard>("set_preference_version", { version });
      setDashboard(next);
      setInternetConnected(next.internet_connected);
      setStatus(`${t.preferenceSaved}: ${version === "beta" ? t.betaVersion : t.releaseVersion}`);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setRunning(null);
    }
  }

  async function resetSettings() {
    try {
      setRunning("settings");
      const result = await invoke<SettingsResetResult>("reset_settings");
      setDashboard(result.dashboard);
      setInternetConnected(result.dashboard.internet_connected);
      changeAutoCheckUpdates(true);
      setStatus(result.uvcd.path ? t.settingsReset : `${t.settingsReset}: ${result.uvcd.message}`);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setRunning(null);
    }
  }

  async function copyText(text?: string, message = t.copied) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus(message);
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
    return key === "arduino" || key === "vlc" || key === "converter";
  }

  function openCameraView() {
    cancelModelConversionRequest();
    stopCamera();
    setCameras([]);
    setSelectedCamera("");
    setLastSaved("");
    setView("camera");
  }

  function openSettingsView() {
    cancelModelConversionRequest();
    stopCamera();
    setView("settings");
  }

  function openConverterView() {
    stopCamera();
    setConverterStatus("");
    setConverterTask(null);
    setView("converter");
  }

  function openAnnotationView() {
    cancelModelConversionRequest();
    stopCamera();
    setView("annotator");
  }

  async function loadConverterModels() {
    try {
      if (!modelConverterApiBase) {
        throw new Error("Model converter endpoint is not configured");
      }
      setConverterStatus((current) => current || t.loadingModels);
      const response = await fetch(`${modelConverterApiBase}/models`);
      const data = await readApiJson<ConverterModelsResponse>(response);
      const nextModels = data.models.reduce<Record<ModelType, ConverterModel>>(
        (models, model) => {
          if (model.type === "yolo" || model.type === "classification") {
            models[model.type] = model;
          }
          return models;
        },
        { ...converterModelDefaults },
      );
      setConverterModels(nextModels);
      setConverterMaxFileSizeMb(data.max_file_size_mb || 120);
      setConverterStatus("");
    } catch (error) {
      setConverterModels(converterModelDefaults);
      setConverterStatus(String(error));
    }
  }

  function rememberVersionCheck(result: VersionCheck) {
    writeStoredVersionCheck(result);
    setVersionCheck(result);
  }

  function changeAutoCheckUpdates(enabled: boolean) {
    writeStoredAutoCheckUpdates(enabled);
    setAutoCheckUpdates(enabled);
  }

  function clearConverterProgress() {
    setDownloadProgress((current) => {
      const nextProgress = { ...current };
      delete nextProgress.converter;
      return nextProgress;
    });
  }

  function cancelModelConversionRequest({ resetUi = true } = {}) {
    if (converterAbortRef.current) {
      converterAbortRef.current.abort();
      converterAbortRef.current = null;
      converterRunIdRef.current += 1;
    }

    if (resetUi) {
      setIsConverterBusy(false);
      clearConverterProgress();
    }
  }

  function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError";
  }

  async function checkVersionOnStartup(language: Language) {
    try {
      const result = await invoke<VersionCheck>("check_version");
      rememberVersionCheck(result);
      if (!result.is_latest && !result.is_beta) {
        setStatus(`${translations[language].update}: ${result.remote}`);
      }
      await refreshInternet();
    } catch {
      // Startup checks should not interrupt users when the network is unavailable.
    }
  }

  function selectConverterType(type: ModelType) {
    if (type === converterType) return;
    cancelModelConversionRequest();
    setConverterType(type);
    setConverterFile(null);
    setConverterTask(null);
    setCompletedConversion(null);
    setConverterStatus("");
    if (converterInputRef.current) {
      converterInputRef.current.value = "";
    }
  }

  function chooseConverterFile(file?: File | null) {
    if (!file) return;
    cancelModelConversionRequest();
    setConverterTask(null);
    setCompletedConversion(null);
    const model = converterModels[converterType];
    if (!fileMatchesExtensions(file, model.input_extensions)) {
      setConverterFile(null);
      setConverterStatus(t.invalidFileType);
      return;
    }
    if (file.size > converterMaxFileSizeMb * 1024 * 1024) {
      setConverterFile(null);
      setConverterStatus(`File exceeds ${converterMaxFileSizeMb} MB`);
      return;
    }
    setConverterFile(file);
    setConverterStatus("");
  }

  async function startModelConversion() {
    if (!converterFile) {
      setConverterStatus(t.noFileSelected);
      return;
    }

    const model = converterModels[converterType];
    if (!fileMatchesExtensions(converterFile, model.input_extensions)) {
      setConverterStatus(t.invalidFileType);
      return;
    }

    cancelModelConversionRequest({ resetUi: false });
    const controller = new AbortController();
    const signal = controller.signal;
    const runId = converterRunIdRef.current + 1;
    converterRunIdRef.current = runId;
    converterAbortRef.current = controller;
    const isCurrentRun = () =>
      converterAbortRef.current === controller && converterRunIdRef.current === runId && !signal.aborted;

    try {
      setIsConverterBusy(true);
      setDownloadProgress((current) => ({ ...current, converter: 0 }));
      setConverterStatus(t.uploadQueued);
      setConverterTask(null);
      setCompletedConversion(null);

      const form = new FormData();
      form.append("model_type", model.type);
      form.append("file", converterFile);
      if (!modelConverterApiBase) {
        throw new Error("Model converter endpoint is not configured");
      }
      const createResponse = await fetch(`${modelConverterApiBase}/conversions`, {
        method: "POST",
        body: form,
        signal,
      });
      const task = await readApiJson<ConversionCreateResponse>(createResponse);
      if (!isCurrentRun()) return;
      setConverterStatus(t.uploadQueued);

      let statusData: ConversionStatusResponse | null = null;
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const statusResponse = await fetch(converterApiUrl(modelConverterApiBase, task.status_url), { signal });
        statusData = await readApiJson<ConversionStatusResponse>(statusResponse);
        if (!isCurrentRun()) return;
        setConverterTask(statusData);

        if (statusData.status === "success") break;
        if (statusData.status === "failed" || statusData.status === "expired") {
          throw new Error(statusData.error?.message || "Conversion failed");
        }

        setConverterStatus(statusData.status === "queued" ? t.uploadQueued : t.conversionRunning);
        await wait(2000, signal);
        if (!isCurrentRun()) return;
      }

      if (!isCurrentRun()) return;
      if (!statusData || statusData.status !== "success") {
        throw new Error("Conversion timed out");
      }

      setConverterStatus(t.conversionSuccess);
      const downloadUrl = converterApiUrl(modelConverterApiBase, statusData.download_url ?? task.download_url);
      setCompletedConversion({
        downloadUrl,
        fileName: statusData.download_name || model.download_name,
      });
    } catch (error) {
      if (signal.aborted || isAbortError(error) || !isCurrentRun()) return;
      setConverterStatus(String(error));
      setStatus(String(error));
    } finally {
      if (converterAbortRef.current === controller && converterRunIdRef.current === runId) {
        converterAbortRef.current = null;
        setIsConverterBusy(false);
        clearConverterProgress();
      }
    }
  }

  async function downloadCompletedConversion() {
    if (!completedConversion) return;

    try {
      setIsConverterBusy(true);
      setDownloadProgress((current) => ({ ...current, converter: 0.02 }));
      const result = await invoke<DownloadResult>("download_model_conversion_as", {
        url: completedConversion.downloadUrl,
        fileName: completedConversion.fileName,
      });
      setConverterStatus(`${t.conversionSaved}: ${result.path}`);
      setStatus(`${t.conversionSaved}: ${result.path}`);
    } catch (error) {
      setConverterStatus(String(error));
      setStatus(String(error));
    } finally {
      setIsConverterBusy(false);
      setDownloadProgress((current) => {
        const nextProgress = { ...current };
        delete nextProgress.converter;
        return nextProgress;
      });
    }
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

  const mainCards = createHomeCards({
    dashboard,
    internetConnected,
    language,
    onOpenAnnotator: () => void openAnnotationView(),
    onOpenCamera: () => void openCameraView(),
    onOpenConverter: () => void openConverterView(),
    onOpenVersionUpdate: () => void openUrl(RELEASES_URL),
    onVersionChecked: rememberVersionCheck,
    runAction,
    t,
    versionCheck,
  });
  return (
    <main
      className={`appShell ${view === "settings" ? "settingsShell" : ""} ${view === "converter" ? "converterShell" : ""} ${
        view === "annotator" ? "annotationShell" : ""
      }`}
    >
      {view !== "annotator" && (
        <AppHeader
          dashboard={dashboard}
          isLanguageMenuOpen={isLanguageMenuOpen}
          language={language}
          languageMenuRef={languageMenuRef}
          onBackHome={() => {
            stopCamera();
            setView("home");
          }}
          onChangeLanguage={(nextLanguage) => void changeLanguage(nextLanguage)}
          onCloseLanguageMenu={() => setIsLanguageMenuOpen(false)}
          onOpenSettings={() => void openSettingsView()}
          onSettingsBack={() => setView("home")}
          onToggleLanguageMenu={() => setIsLanguageMenuOpen((current) => !current)}
          t={t}
          view={view}
        />
      )}

      {view !== "settings" && view !== "converter" && view !== "annotator" && (
        <LinkPanel
          onCopyText={(text, message) => void copyText(text, message)}
          onOpenUrl={(url) => void openUrl(url)}
          preferenceCopyMessage={PREFERENCE_COPY_MESSAGE}
          realtekPackageUrl={dashboard?.metadata.realtek_package_url}
          repository={dashboard?.metadata.repository}
          t={t}
        />
      )}

      {status && <div className={`feedbackToast ${isFeedbackLeaving ? "leaving" : ""}`}>{status}</div>}

      {view === "home" && (
        <HomeView
          downloadProgress={downloadProgress}
          isDownloadKey={isDownloadKey}
          mainCards={mainCards}
          openActionMenu={openActionMenu}
          running={running}
          setOpenActionMenu={setOpenActionMenu}
          t={t}
        />
      )}

      {view === "settings" && (
        <SettingsView
          autoCheckUpdates={autoCheckUpdates}
          onChangeAutoCheckUpdates={changeAutoCheckUpdates}
          onChangePreferenceVersion={(version) => void changePreferenceVersion(version)}
          onChangeUvcdFormat={(format) => void changeUvcdFormat(format)}
          onResetSettings={() => void resetSettings()}
          running={running}
          selectedPreferenceVersion={selectedPreferenceVersion}
          selectedUvcdFormat={selectedUvcdFormat}
          t={t}
        />
      )}

      {view === "converter" && (
        <ConverterView
          completedConversion={completedConversion}
          converterExtensions={converterExtensions}
          converterFile={converterFile}
          converterInputRef={converterInputRef}
          converterProgress={downloadProgress.converter}
          converterStatus={converterStatus}
          converterTask={converterTask}
          converterType={converterType}
          internetConnected={internetConnected}
          isConverterBusy={isConverterBusy}
          modelConverterUrl={modelConverterUrl}
          onChooseFile={chooseConverterFile}
          onDownloadCompletedConversion={() => void downloadCompletedConversion()}
          onOpenUrl={(url) => void openUrl(url)}
          onSelectType={selectConverterType}
          onStartModelConversion={() => void startModelConversion()}
          selectedConverterModel={selectedConverterModel}
          t={t}
        />
      )}

      {view === "annotator" && (
        <AnnotationView
          onBackHome={() => {
            setView("home");
          }}
          onStatus={setStatus}
        />
      )}

      {view === "camera" && (
        <CameraView
          cameraGuideSteps={cameraGuideSteps[language]}
          cameras={cameras}
          isCapturing={isCapturing}
          isPreviewing={isPreviewing}
          lastSaved={lastSaved}
          onOpenOutputFolder={() =>
            void runAction<ActionResult>("output", "open_output_folder", (result) => result.path ?? result.message)
          }
          onSelectCamera={(deviceId) => void selectCamera(deviceId)}
          onSelectOutputFolder={() => void selectOutputFolder()}
          onStartCapture={() => void startCapture()}
          onStopCaptureTimer={stopCaptureTimer}
          outputFolder={dashboard?.output_folder ?? ""}
          running={running}
          selectedCamera={selectedCamera}
          t={t}
          videoRef={videoRef}
        />
      )}

      {view !== "settings" && view !== "converter" && view !== "annotator" && (
        <NetworkStatus internetConnected={internetConnected} t={t} />
      )}
    </main>
  );
}

export default App;
