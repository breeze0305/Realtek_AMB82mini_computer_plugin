import { FolderOpen, Play, Square } from "lucide-react";
import type { RefObject } from "react";

import type { RunningAction } from "../types";

type CameraViewProps = {
  cameraGuideSteps: string[];
  cameras: MediaDeviceInfo[];
  isCapturing: boolean;
  isPreviewing: boolean;
  lastSaved: string;
  onOpenOutputFolder: () => void;
  onSelectCamera: (deviceId: string) => void;
  onSelectOutputFolder: () => void;
  onStartCapture: () => void;
  onStopCaptureTimer: () => void;
  outputFolder: string;
  running: RunningAction;
  selectedCamera: string;
  t: Record<string, string>;
  videoRef: RefObject<HTMLVideoElement>;
};

export function CameraView({
  cameraGuideSteps,
  cameras,
  isCapturing,
  isPreviewing,
  lastSaved,
  onOpenOutputFolder,
  onSelectCamera,
  onSelectOutputFolder,
  onStartCapture,
  onStopCaptureTimer,
  outputFolder,
  running,
  selectedCamera,
  t,
  videoRef,
}: CameraViewProps) {
  return (
    <section className="contentSection cameraSection">
      <div className="sectionTop">
        <h2>{t.camera}</h2>
        <button className="secondaryBtn" onClick={onOpenOutputFolder}>
          <FolderOpen size={17} />
          {t.output}
        </button>
      </div>
      <div className="videoFrame">
        <video ref={videoRef} muted playsInline />
        {!isPreviewing && <span>{t.preview}</span>}
      </div>
      <div className="cameraControls">
        <select value={selectedCamera} onChange={(event) => onSelectCamera(event.target.value)} aria-label={t.selectCamera}>
          <option value="">{t.noCamera}</option>
          {cameras.map((device, index) => (
            <option value={device.deviceId} key={device.deviceId}>
              {device.label || `Camera ${index}`}
            </option>
          ))}
        </select>
        <button className={isCapturing ? "dangerBtn" : "primaryBtn"} onClick={isCapturing ? onStopCaptureTimer : onStartCapture}>
          {isCapturing ? <Square size={17} /> : <Play size={17} />}
          {isCapturing ? t.stopCapture : t.startCapture}
        </button>
        <button className="secondaryBtn" onClick={onSelectOutputFolder} disabled={isCapturing || running === "output"}>
          <FolderOpen size={17} />
          {t.chooseOutput}
        </button>
      </div>
      <dl className="pathList">
        <div>
          <dt>{t.output}</dt>
          <dd>{outputFolder}</dd>
        </div>
        <div>
          <dt>{t.lastSaved}</dt>
          <dd>{lastSaved || "-"}</dd>
        </div>
      </dl>
      <section className="cameraGuide">
        <h3>{t.cameraGuideTitle}</h3>
        <ol>
          {cameraGuideSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </section>
  );
}
