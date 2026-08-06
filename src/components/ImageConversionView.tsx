import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ArrowLeft, FileImage, FolderOpen, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { ImageConversionProgress, ImageConversionSummary, Language } from "../types";

type ImageConversionViewProps = {
  language: Language;
  onBackHome: () => void;
  onStatus: (message: string) => void;
  t: Record<string, string>;
};

type ConversionState = {
  stage: "selecting" | "converting";
  progress: ImageConversionProgress | null;
};

const NUMBER_LOCALES: Record<Language, string> = {
  zh_TW: "zh-TW",
  en_US: "en-US",
  ja_JP: "ja-JP",
};

export function ImageConversionView({ language, onBackHome, onStatus, t }: ImageConversionViewProps) {
  const [conversion, setConversion] = useState<ConversionState | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const mountedRef = useRef(true);
  const operationCounterRef = useRef(0);
  const activeOperationRef = useRef<number | null>(null);
  const pendingProgressRef = useRef<{ operationId: number; progress: ImageConversionProgress } | null>(null);
  const progressFrameRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeOperationRef.current = null;
      pendingProgressRef.current = null;
      if (progressFrameRef.current !== null) cancelAnimationFrame(progressFrameRef.current);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (disposed) return;
        if (event.payload.type === "enter") {
          if (activeOperationRef.current === null) setDropActive(true);
          return;
        }
        if (event.payload.type === "leave") {
          setDropActive(false);
          return;
        }
        if (event.payload.type === "drop") {
          setDropActive(false);
          if (activeOperationRef.current !== null) return;
          const [path] = event.payload.paths;
          if (path) void convertPath(path);
        }
      })
      .then((nextUnlisten) => {
        if (disposed) nextUnlisten();
        else unlisten = nextUnlisten;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
    // The WebView drag/drop subscription belongs to this mounted tool page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function beginConversion(stage: ConversionState["stage"]) {
    if (activeOperationRef.current !== null) return null;

    const operationId = ++operationCounterRef.current;
    activeOperationRef.current = operationId;
    setDropActive(false);
    setConversion({ stage, progress: null });
    return operationId;
  }

  function operationIsActive(operationId: number) {
    return mountedRef.current && activeOperationRef.current === operationId;
  }

  function queueProgress(operationId: number, progress: ImageConversionProgress) {
    if (!operationIsActive(operationId)) return;
    pendingProgressRef.current = { operationId, progress };
    if (progressFrameRef.current !== null) return;

    progressFrameRef.current = requestAnimationFrame(() => {
      progressFrameRef.current = null;
      const pending = pendingProgressRef.current;
      pendingProgressRef.current = null;
      if (!pending || !operationIsActive(pending.operationId)) return;
      setConversion({ stage: "converting", progress: pending.progress });
    });
  }

  function finishConversion(operationId: number) {
    if (activeOperationRef.current !== operationId) return;

    activeOperationRef.current = null;
    pendingProgressRef.current = null;
    if (progressFrameRef.current !== null) {
      cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
    if (mountedRef.current) setConversion(null);
  }

  async function requestConversion(operationId: number, path: string) {
    if (!operationIsActive(operationId)) return;

    setConversion({ stage: "converting", progress: null });
    const onProgress = new Channel<ImageConversionProgress>();
    onProgress.onmessage = (progress) => queueProgress(operationId, progress);
    const summary = await invoke<ImageConversionSummary>("convert_image_folder", { path, onProgress });
    if (!operationIsActive(operationId)) return;

    onStatus(conversionSummaryMessage(summary, t, NUMBER_LOCALES[language]));
    finishConversion(operationId);
    onBackHome();
  }

  async function selectFolder() {
    const operationId = beginConversion("selecting");
    if (operationId === null) return;

    try {
      const path = await invoke<string | null>("select_image_conversion_folder");
      if (path && operationIsActive(operationId)) await requestConversion(operationId, path);
    } catch (error) {
      if (operationIsActive(operationId)) onStatus(String(error));
    } finally {
      finishConversion(operationId);
    }
  }

  async function convertPath(path: string) {
    const operationId = beginConversion("converting");
    if (operationId === null) return;

    try {
      await requestConversion(operationId, path);
    } catch (error) {
      if (operationIsActive(operationId)) onStatus(String(error));
    } finally {
      finishConversion(operationId);
    }
  }

  if (conversion) {
    const progress = conversion.progress;
    const total = progress?.total ?? 0;
    const processed = Math.min(progress?.processed ?? 0, total);
    const isDeterminate = total > 0;
    const percentage = isDeterminate ? Math.min(Math.round((processed / total) * 100), 100) : 0;
    const numberLocale = NUMBER_LOCALES[language];
    const formatNumber = (value: number) => value.toLocaleString(numberLocale);
    const phaseText =
      conversion.stage === "selecting"
        ? t.imageConversionSelectingFolder
        : progress?.phase === "discovering"
          ? t.imageConversionDiscovering
          : progress?.phase === "complete"
            ? t.imageConversionCompleting
            : t.imageConversionConverting;
    const progressText = isDeterminate
      ? formatMessage(t.imageConversionProgress, {
          processed: formatNumber(processed),
          total: formatNumber(total),
          percentage,
        })
      : conversion.stage === "selecting"
        ? t.imageConversionWaitingFolder
        : t.imageConversionBuildingList;

    return (
      <section className="annotationStart annotationPreparing imageConversionStart" aria-busy="true">
        <div className="annotationDropPanel annotationProgressPanel imageConversionProgressPanel">
          <LoaderCircle className="spin annotationProgressIcon" size={54} />
          <h2>{t.imageConversionProcessingTitle}</h2>
          <p>{phaseText}</p>
          <div
            className={`annotationExifProgress ${isDeterminate ? "" : "isIndeterminate"}`}
            role="progressbar"
            aria-label={t.imageConversionProgressLabel}
            aria-valuemin={0}
            aria-valuetext={progressText}
            {...(isDeterminate ? { "aria-valuemax": total, "aria-valuenow": processed } : {})}
          >
            <span style={{ "--annotation-progress": `${percentage}%` } as CSSProperties} />
          </div>
          <div className="annotationProgressStats imageConversionProgressStats">
            <strong>{progressText}</strong>
            {progress && (
              <span>
                {formatMessage(t.imageConversionStats, {
                  converted: formatNumber(progress.converted),
                  normalized: formatNumber(progress.normalized),
                  skipped: formatNumber(progress.skipped),
                })}
                {progress.failed > 0 && (
                  <em>
                    {formatMessage(t.imageConversionFailedStat, {
                      failed: formatNumber(progress.failed),
                    })}
                  </em>
                )}
              </span>
            )}
          </div>
          {progress?.current_file && (
            <small className="annotationProgressFile" title={progress.current_file}>
              {progress.current_file}
            </small>
          )}
          <small className="annotationProgressNote">{t.imageConversionSafetyNote}</small>
        </div>
      </section>
    );
  }

  return (
    <section className={`annotationStart imageConversionStart ${dropActive ? "isDropActive" : ""}`}>
      <button type="button" className="annotationBackButton" onClick={onBackHome}>
        <ArrowLeft size={18} />
        {t.imageConversionBackHome}
      </button>
      <div className="annotationDropPanel imageConversionDropPanel">
        <FileImage size={54} />
        <h2>{t.imageConverter}</h2>
        <p>{t.imageConversionIntro}</p>
        <ul className="imageConversionHints">
          <li>{t.imageConversionHintRecursive}</li>
          <li>{t.imageConversionHintFormats}</li>
          <li>{t.imageConversionHintOrientation}</li>
          <li>{t.imageConversionHintSafeReplace}</li>
        </ul>
        <button type="button" className="primaryBtn annotationFolderButton" onClick={() => void selectFolder()}>
          <FolderOpen size={19} />
          {t.imageConversionOpenFolder}
        </button>
      </div>
    </section>
  );
}

function conversionSummaryMessage(summary: ImageConversionSummary, t: Record<string, string>, numberLocale: string) {
  const formatNumber = (value: number) => value.toLocaleString(numberLocale);
  const message = formatMessage(t.imageConversionSummary, {
    total: formatNumber(summary.total),
    converted: formatNumber(summary.converted),
    normalized: formatNumber(summary.normalized),
    skipped: formatNumber(summary.skipped),
    failed: formatNumber(summary.failed),
  });
  const firstFailure = summary.failed_files[0];
  return firstFailure ? `${message}${formatMessage(t.imageConversionFirstFailure, { file: firstFailure })}` : message;
}

function formatMessage(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.split(`{${key}}`).join(String(value)),
    template,
  );
}
