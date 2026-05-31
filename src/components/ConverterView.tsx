import { Download, ExternalLink, RefreshCcw, UploadCloud } from "lucide-react";
import type { CSSProperties, RefObject } from "react";

import { converterModelOrder } from "../appConfig";
import type {
  CompletedConversion,
  ConversionStatusResponse,
  ConverterModel,
  ModelType,
} from "../types";

type ConverterViewProps = {
  completedConversion: CompletedConversion | null;
  converterExtensions: string;
  converterFile: File | null;
  converterInputRef: RefObject<HTMLInputElement>;
  converterProgress?: number;
  converterStatus: string;
  converterTask: ConversionStatusResponse | null;
  converterType: ModelType;
  internetConnected: boolean;
  isConverterBusy: boolean;
  modelConverterUrl: string;
  onChooseFile: (file?: File | null) => void;
  onDownloadCompletedConversion: () => void;
  onOpenUrl: (url?: string) => void;
  onSelectType: (type: ModelType) => void;
  onStartModelConversion: () => void;
  selectedConverterModel: ConverterModel;
  t: Record<string, string>;
};

export function ConverterView({
  completedConversion,
  converterExtensions,
  converterFile,
  converterInputRef,
  converterProgress,
  converterStatus,
  converterTask,
  converterType,
  internetConnected,
  isConverterBusy,
  modelConverterUrl,
  onChooseFile,
  onDownloadCompletedConversion,
  onOpenUrl,
  onSelectType,
  onStartModelConversion,
  selectedConverterModel,
  t,
}: ConverterViewProps) {
  return (
    <section className="contentSection converterSection">
      <div className="converterCard">
        <div className="converterTop">
          <h2>{t.converterTitle}</h2>
          <button type="button" className="secondaryBtn converterExternalBtn" onClick={() => onOpenUrl(modelConverterUrl)}>
            <ExternalLink size={17} />
            {t.openExternal}
          </button>
        </div>

        <div className="converterTabs" role="tablist" aria-label={t.modelConverter}>
          {converterModelOrder.map((type) => (
            <button
              type="button"
              role="tab"
              aria-selected={converterType === type}
              className={converterType === type ? "isSelected" : ""}
              onClick={() => onSelectType(type)}
              key={type}
            >
              {type === "yolo" ? t.objectDetection : t.classification}
            </button>
          ))}
        </div>

        <label
          className={`converterDropZone ${converterFile ? "hasFile" : ""}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onChooseFile(event.dataTransfer.files.item(0));
          }}
        >
          <input
            ref={converterInputRef}
            type="file"
            accept={selectedConverterModel.input_extensions.join(",")}
            onChange={(event) => onChooseFile(event.target.files?.item(0))}
          />
          <UploadCloud size={32} />
          <strong>{converterFile ? t.selectedFile : t.selectFile}</strong>
          <span>{converterFile?.name ?? t.supportsFiles.replace("{extensions}", converterExtensions)}</span>
          {!converterFile && <small>{t.dropFileHint}</small>}
        </label>

        <button
          type="button"
          className="converterStartBtn"
          onClick={() => (completedConversion ? onDownloadCompletedConversion() : onStartModelConversion())}
          disabled={isConverterBusy || !internetConnected || (!completedConversion && !converterFile)}
        >
          {isConverterBusy ? <RefreshCcw className="spin" size={18} /> : <Download size={18} />}
          {completedConversion ? t.downloadConverted : t.startConversion}
        </button>

        {(converterStatus || converterTask || converterProgress !== undefined) && (
          <div className="converterStatusPanel">
            {converterProgress !== undefined && (
              <div
                className="converterProgressBar"
                style={
                  {
                    "--converter-progress": `${Math.max(4, Math.round(converterProgress * 100))}%`,
                  } as CSSProperties
                }
              />
            )}
            <p>{converterStatus || t.ready}</p>
            {converterTask && (
              <dl>
                <div>
                  <dt>Task</dt>
                  <dd>{converterTask.task_id}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{converterTask.status}</dd>
                </div>
              </dl>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
