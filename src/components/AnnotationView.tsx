import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  MousePointer2,
  Move,
  Plus,
  RotateCcw,
  Tags,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from "react";

import { compensateForCssZoom, stagePointToImage, type AnnotationPoint as Point } from "../annotationGeometry";
import type { AnnotationBox, AnnotationImageData, AnnotationSaveResult, AnnotationWorkspace } from "../types";

type AnnotationViewProps = {
  onBackHome: () => void;
  onStatus: (message: string) => void;
};

type DrawingState = {
  pointerId: number;
  start: Point;
  current: Point;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BoxHandle = "nw" | "ne" | "sw" | "se";

type EditingState = {
  pointerId: number;
  boxIndex: number;
  mode: "move" | "resize";
  handle?: BoxHandle;
  start: Point;
  originalRect: Rect;
};

type PanState = {
  pointerId: number;
  start: Point;
  origin: Point;
};

type ClassMenuState = {
  classIndex: number;
  x: number;
  y: number;
} | null;

const CLASS_NAME_RE = /^[A-Za-z0-9]+$/;
const MIN_BOX_PIXELS = 4;
const HANDLE_SCREEN_PIXELS = 14;
const HANDLE_RADIUS_SCREEN_PIXELS = 3;
const CLASS_COLORS = [
  "#0f766e",
  "#b9473b",
  "#8a5f13",
  "#2f6fbd",
  "#8a3ffc",
  "#207a3c",
  "#c2410c",
  "#be185d",
  "#475569",
  "#047857",
];

export function AnnotationView({ onBackHome, onStatus }: AnnotationViewProps) {
  const [workspace, setWorkspace] = useState<AnnotationWorkspace | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [className, setClassName] = useState("");
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [panning, setPanning] = useState<PanState | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [classMenu, setClassMenu] = useState<ClassMenuState>(null);
  const [cursorStagePoint, setCursorStagePoint] = useState<Point | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const currentImage = workspace?.images[currentIndex] ?? null;
  const currentBoxes = currentImage && workspace ? (workspace.annotations[currentImage.name] ?? []) : [];
  const hasWorkspace = workspace !== null;
  const geometry = useMemo(() => computeGeometry(stageSize, imageSize, pan, zoom), [stageSize, imageSize, pan, zoom]);
  const guidePoint = useMemo(
    () =>
      cursorStagePoint && selectedClass !== null && !spaceDown && !panning && !editing
        ? stagePointToImage(cursorStagePoint, geometry, imageSize, zoom, false)
        : null,
    [cursorStagePoint, editing, geometry, imageSize, panning, selectedClass, spaceDown, zoom],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setStageSize({ width: rect.width, height: rect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [hasWorkspace]);

  useEffect(() => {
    let disposed = false;
    let previousUrl = "";

    async function loadImage() {
      if (!currentImage) {
        setImageUrl("");
        setImageSize({ width: 0, height: 0 });
        return;
      }

      try {
        const data = await invoke<AnnotationImageData>("read_annotation_image", { path: currentImage.path });
        if (disposed) return;
        const blob = new Blob([new Uint8Array(data.bytes)], { type: data.mime });
        const url = URL.createObjectURL(blob);
        previousUrl = url;

        const image = new Image();
        image.onload = () => {
          if (!disposed) {
            setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
          }
        };
        image.src = url;

        setImageUrl(url);
        setImageSize({ width: 0, height: 0 });
        setSelectedBox(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setCursorStagePoint(null);
      } catch (error) {
        onStatus(String(error));
      }
    }

    void loadImage();
    return () => {
      disposed = true;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    };
    // An annotation image is uniquely identified by its path; other object fields do not require a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImage?.path, onStatus]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter") {
          setDropActive(true);
          return;
        }
        if (event.payload.type === "leave") {
          setDropActive(false);
          return;
        }
        if (event.payload.type === "drop") {
          setDropActive(false);
          const [path] = event.payload.paths;
          if (path) void loadWorkspaceFromPath(path);
        }
      })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
    // The WebView drag/drop subscription is installed once for this mounted editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      if (event.code === "Space") {
        event.preventDefault();
        setSpaceDown(true);
      } else if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        goToImage(currentIndex - 1);
      } else if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        goToImage(currentIndex + 1);
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedBox !== null) {
        event.preventDefault();
        deleteSelectedBox();
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setSpaceDown(false);
        setPanning(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
    // These state values cover every changing value read by the local keyboard helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, selectedBox, workspace]);

  async function selectFolder() {
    try {
      const next = await invoke<AnnotationWorkspace>("select_annotation_folder");
      applyWorkspace(next);
    } catch (error) {
      onStatus(String(error));
    }
  }

  async function loadWorkspaceFromPath(path: string) {
    try {
      const next = await invoke<AnnotationWorkspace>("load_annotation_folder", { path });
      applyWorkspace(next);
    } catch (error) {
      onStatus(String(error));
    }
  }

  function applyWorkspace(next: AnnotationWorkspace) {
    const normalized = normalizeWorkspace(next);
    setWorkspace(normalized);
    setCurrentIndex(0);
    setSelectedClass(normalized.classes.length ? 0 : null);
    setClassName("");
    setClassMenu(null);
    const message = normalized.invalid_class_ids.length
      ? `標記檔案中有 class index ${normalized.invalid_class_ids.join(", ")}，請先建立對應 class。`
      : `已載入 ${normalized.images.length} 張圖片`;
    onStatus(message);
  }

  function normalizeWorkspace(next: AnnotationWorkspace): AnnotationWorkspace {
    const annotations = { ...next.annotations };
    const images = next.images.map((image) => {
      const boxes = annotations[image.name] ?? [];
      annotations[image.name] = boxes;
      return { ...image, annotation_count: boxes.length };
    });
    return { ...next, images, annotations };
  }

  function goToImage(index: number) {
    if (!workspace?.images.length) return;
    const nextIndex = Math.min(Math.max(index, 0), workspace.images.length - 1);
    setCurrentIndex(nextIndex);
    setSelectedBox(null);
    setDrawing(null);
    setEditing(null);
    setPanning(null);
  }

  function classColor(index: number) {
    return CLASS_COLORS[index % CLASS_COLORS.length];
  }

  function classCount(index: number) {
    return currentBoxes.filter((box) => box.class_id === index).length;
  }

  function validateClassName(name: string, existing: string[], ignoreIndex?: number) {
    const trimmed = name.trim();
    if (!CLASS_NAME_RE.test(trimmed)) {
      return "class 名稱只能是英文和數字，且不能為空";
    }
    const duplicate = existing.some(
      (item, index) => index !== ignoreIndex && item.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      return "class 名稱不能重複";
    }
    return "";
  }

  async function createClass() {
    if (!workspace) return;
    const name = className.trim();
    const error = validateClassName(name, workspace.classes);
    if (error) {
      onStatus(error);
      return;
    }

    const classes = [...workspace.classes, name];
    setWorkspace({ ...workspace, classes });
    setSelectedClass(classes.length - 1);
    setClassName("");
    await persistClasses(workspace.labels_folder, classes);
  }

  async function renameClass(classIndex: number) {
    if (!workspace) return;
    const original = workspace.classes[classIndex];
    const nextName = window.prompt("重新命名 class", original)?.trim();
    if (nextName === undefined || nextName === original) return;

    const error = validateClassName(nextName, workspace.classes, classIndex);
    if (error) {
      onStatus(error);
      return;
    }

    const classes = workspace.classes.map((item, index) => (index === classIndex ? nextName : item));
    setWorkspace({ ...workspace, classes });
    setClassMenu(null);
    await persistClasses(workspace.labels_folder, classes);
  }

  async function deleteClass(classIndex: number) {
    if (!workspace) return;
    const name = workspace.classes[classIndex];
    if (!window.confirm(`確定要刪除 ${name}？所有圖片中屬於這個 class 的框都會移除。`)) return;

    const classes = workspace.classes.filter((_, index) => index !== classIndex);
    const annotations = Object.fromEntries(
      Object.entries(workspace.annotations).map(([imageName, boxes]) => [
        imageName,
        boxes
          .filter((box) => box.class_id !== classIndex)
          .map((box) => ({
            ...box,
            class_id: box.class_id > classIndex ? box.class_id - 1 : box.class_id,
          })),
      ]),
    );
    const images = workspace.images.map((image) => ({
      ...image,
      annotation_count: annotations[image.name]?.length ?? 0,
    }));
    const nextWorkspace = { ...workspace, classes, annotations, images };
    setWorkspace(nextWorkspace);
    setClassMenu(null);
    setSelectedClass(classes.length ? Math.min(classIndex, classes.length - 1) : null);
    setSelectedBox(null);

    try {
      await invoke<AnnotationSaveResult>("save_annotation_workspace", {
        labelsFolder: workspace.labels_folder,
        classes,
        annotations,
      });
      onStatus("已刪除 class 並更新所有標記");
    } catch (error) {
      onStatus(String(error));
    }
  }

  async function persistClasses(labelsFolder: string, classes: string[]) {
    try {
      await invoke<AnnotationSaveResult>("save_annotation_classes", { labelsFolder, classes });
      onStatus("classes.txt 已更新");
    } catch (error) {
      onStatus(String(error));
    }
  }

  async function persistImageAnnotations(imageName: string, boxes: AnnotationBox[]) {
    if (!workspace) return;
    try {
      await invoke<AnnotationSaveResult>("save_annotation_file", {
        labelsFolder: workspace.labels_folder,
        imageFileName: imageName,
        annotations: boxes,
      });
    } catch (error) {
      onStatus(String(error));
    }
  }

  function setCurrentBoxes(boxes: AnnotationBox[]) {
    if (!workspace || !currentImage) return;
    const annotations = { ...workspace.annotations, [currentImage.name]: boxes };
    const images = workspace.images.map((image) =>
      image.name === currentImage.name ? { ...image, annotation_count: boxes.length } : image,
    );
    setWorkspace({ ...workspace, annotations, images });
  }

  function replaceCurrentBoxes(boxes: AnnotationBox[]) {
    if (!currentImage) return;
    setCurrentBoxes(boxes);
    void persistImageAnnotations(currentImage.name, boxes);
  }

  function deleteSelectedBox() {
    if (selectedBox === null) return;
    const nextBoxes = currentBoxes.filter((_, index) => index !== selectedBox);
    setSelectedBox(null);
    replaceCurrentBoxes(nextBoxes);
  }

  function resetCurrentImageBoxes() {
    if (!currentImage || currentBoxes.length === 0) return;
    setSelectedBox(null);
    setDrawing(null);
    setEditing(null);
    replaceCurrentBoxes([]);
  }

  function stagePoint(event: { clientX: number; clientY: number }) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function imagePoint(event: { clientX: number; clientY: number }) {
    const point = stagePoint(event);
    return point ? stagePointToImage(point, geometry, imageSize, zoom) : null;
  }

  function beginBoxEdit(
    event: PointerEvent<SVGElement>,
    boxIndex: number,
    mode: "move" | "resize",
    handle?: BoxHandle,
  ) {
    if (spaceDown) return;
    const start = imagePoint(event);
    if (!start) return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedBox(boxIndex);
    setDrawing(null);
    setEditing({
      pointerId: event.pointerId,
      boxIndex,
      mode,
      handle,
      start,
      originalRect: boxToRect(currentBoxes[boxIndex], imageSize),
    });
  }

  function editedBoxes(state: EditingState, current: Point) {
    const rect =
      state.mode === "move"
        ? moveRect(state.originalRect, current.x - state.start.x, current.y - state.start.y, imageSize)
        : resizeRect(state.originalRect, state.handle ?? "se", current, imageSize);
    const originalBox = currentBoxes[state.boxIndex];
    if (!originalBox) return currentBoxes;
    const nextBox = rectToBox(rect, originalBox.class_id, imageSize);
    return currentBoxes.map((box, index) => (index === state.boxIndex ? nextBox : box));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!currentImage || !imageUrl) return;
    setClassMenu(null);
    const point = stagePoint(event);
    if (!point) return;
    setCursorStagePoint(point);

    if (spaceDown) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPanning({ pointerId: event.pointerId, start: point, origin: pan });
      return;
    }

    if (selectedClass === null) {
      onStatus("請先建立並選擇一個 class");
      return;
    }

    const start = imagePoint(event);
    if (!start) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedBox(null);
    setEditing(null);
    setDrawing({ pointerId: event.pointerId, start, current: start });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    setCursorStagePoint(stagePoint(event));

    if (editing?.pointerId === event.pointerId) {
      const current = imagePoint(event);
      if (!current) return;
      setCurrentBoxes(editedBoxes(editing, current));
      return;
    }

    if (panning?.pointerId === event.pointerId) {
      const point = stagePoint(event);
      if (!point) return;
      setPan({
        x: panning.origin.x + point.x - panning.start.x,
        y: panning.origin.y + point.y - panning.start.y,
      });
      return;
    }

    if (drawing?.pointerId === event.pointerId) {
      const current = imagePoint(event);
      if (!current) return;
      setDrawing({ ...drawing, current });
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (editing?.pointerId === event.pointerId) {
      const current = imagePoint(event);
      if (current && currentImage) {
        const nextBoxes = editedBoxes(editing, current);
        setCurrentBoxes(nextBoxes);
        void persistImageAnnotations(currentImage.name, nextBoxes);
      }
      setEditing(null);
      return;
    }

    if (panning?.pointerId === event.pointerId) {
      setPanning(null);
      return;
    }

    if (!drawing || drawing.pointerId !== event.pointerId || selectedClass === null) return;
    const nextRect = rectFromPoints(drawing.start, drawing.current, imageSize);
    setDrawing(null);

    if (nextRect.width < MIN_BOX_PIXELS || nextRect.height < MIN_BOX_PIXELS) {
      return;
    }

    const nextBox = rectToBox(nextRect, selectedClass, imageSize);
    replaceCurrentBoxes([...currentBoxes, nextBox]);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!currentImage) return;
    event.preventDefault();
    setCursorStagePoint(stagePoint(event));
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom((current) => clamp(Number((current + direction * 0.12).toFixed(2)), 0.35, 6));
  }

  const draftRect = drawing ? rectFromPoints(drawing.start, drawing.current, imageSize) : null;
  const topText = workspace?.images.length ? `${currentIndex + 1} / ${workspace.images.length}` : "0 / 0";
  const normalBoxStrokeWidth = compensateForCssZoom(2, zoom);
  const selectedBoxStrokeWidth = compensateForCssZoom(4, zoom);
  const guideStrokeWidth = compensateForCssZoom(1.25, zoom);
  const guideDashArray = `${compensateForCssZoom(7, zoom)} ${compensateForCssZoom(5, zoom)}`;
  const draftDashArray = `${compensateForCssZoom(7, zoom)} ${compensateForCssZoom(5, zoom)}`;

  if (!workspace) {
    return (
      <section className={`annotationStart ${dropActive ? "isDropActive" : ""}`}>
        <button className="annotationBackButton" onClick={onBackHome}>
          <ArrowLeft size={18} />
          返回主介面
        </button>
        <div className="annotationDropPanel">
          <FolderOpen size={54} />
          <h2>物件偵測標記</h2>
          <p>拖入圖片資料夾，或點擊下方按鈕選擇資料夾。</p>
          <button className="primaryBtn annotationFolderButton" onClick={() => void selectFolder()}>
            打開資料夾
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="annotationWorkspace">
      <aside className="annotationSidebar">
        <button className="annotationBackButton" onClick={onBackHome}>
          <ArrowLeft size={18} />
          返回主介面
        </button>

        <div className="classPanel">
          <div className="classPanelHeader">
            <h2>類別Classes</h2>
            <button
              type="button"
              className="classResetButton"
              onClick={resetCurrentImageBoxes}
              disabled={!currentBoxes.length}
              title="Reset current image boxes"
              aria-label="Reset current image boxes"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="classList">
            {workspace.classes.map((name, index) => (
              <button
                type="button"
                className={`classItem ${selectedClass === index ? "isSelected" : ""}`}
                onClick={() => setSelectedClass(index)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setClassMenu({ classIndex: index, x: event.clientX, y: event.clientY });
                }}
                key={`${name}-${index}`}
              >
                <span className="classDot" style={{ "--class-color": classColor(index) } as CSSProperties} />
                <strong>{name}</strong>
                <em>{classCount(index)}</em>
              </button>
            ))}
          </div>
          <div className="classCreator">
            <input
              value={className}
              onChange={(event) => setClassName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createClass();
              }}
              placeholder="ClassName"
            />
            <button type="button" onClick={() => void createClass()} aria-label="新增 class">
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="annotationHelp">
          <h3>操作說明</h3>
          <p>系統將會於資料夾目錄旁，自動建立 labels 資料夾存放標記，資料夾名稱為「原始圖片資料夾名稱_labels」。</p>
          <p>重開資料夾後，系統會自動讀取上一次的標記檔案；若要移動圖片資料夾，請同步移動 labels 資料夾。</p>
          <p>A / D 切換上一張或下一張圖片，滑鼠滾輪可放大縮小。</p>
          <p>按住空白鍵可切換成拖曳模式，用於平移圖片。</p>
          <p>右鍵 class 名稱可重新命名或刪除 class。</p>
        </div>
      </aside>

      <main className="annotationCenter">
        <div className="annotationTopBar">
          <button type="button" onClick={() => goToImage(currentIndex - 1)} disabled={currentIndex === 0}>
            <ChevronLeft size={24} />
          </button>
          <strong>{`< ${topText} >`}</strong>
          <button
            type="button"
            onClick={() => goToImage(currentIndex + 1)}
            disabled={currentIndex >= workspace.images.length - 1}
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div
          className={`annotationStage ${spaceDown ? "isPanningMode" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            setDrawing(null);
            setEditing(null);
            setPanning(null);
            setCursorStagePoint(null);
          }}
          onPointerLeave={() => setCursorStagePoint(null)}
          onWheel={handleWheel}
          ref={stageRef}
        >
          {!currentImage && <span className="annotationEmpty">資料夾內沒有支援的圖片</span>}
          {currentImage && imageUrl && geometry && (
            <div
              className="annotationImageLayer"
              style={{
                left: geometry.left,
                top: geometry.top,
                width: geometry.width,
                height: geometry.height,
                transform: `scale(${zoom})`,
              }}
            >
              <img src={imageUrl} draggable={false} alt={currentImage.name} />
              <svg viewBox={`0 0 ${imageSize.width} ${imageSize.height}`} className="annotationOverlay">
                {guidePoint && (
                  <g className="annotationCrosshairGuides" aria-hidden="true">
                    <line
                      className="annotationGuideLine"
                      x1={0}
                      y1={guidePoint.y}
                      x2={imageSize.width}
                      y2={guidePoint.y}
                      strokeWidth={guideStrokeWidth}
                      strokeDasharray={guideDashArray}
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      className="annotationGuideLine"
                      x1={guidePoint.x}
                      y1={0}
                      x2={guidePoint.x}
                      y2={imageSize.height}
                      strokeWidth={guideStrokeWidth}
                      strokeDasharray={guideDashArray}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                )}
                {currentBoxes.map((box, index) => {
                  const rect = boxToRect(box, imageSize);
                  const color = classColor(box.class_id);
                  const handleSize = screenPixelsToImageUnits(HANDLE_SCREEN_PIXELS, geometry, imageSize, zoom);
                  const handleRadius = screenPixelsToImageUnits(HANDLE_RADIUS_SCREEN_PIXELS, geometry, imageSize, zoom);
                  const handleOffset = handleSize / 2;
                  return (
                    <g key={`${index}-${box.class_id}`}>
                      <rect
                        className={`annotationBox ${selectedBox === index ? "isSelected" : ""}`}
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        fill={color}
                        fillOpacity={0.18}
                        stroke={color}
                        strokeWidth={selectedBox === index ? selectedBoxStrokeWidth : normalBoxStrokeWidth}
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(event) => beginBoxEdit(event, index, "move")}
                      />
                      {selectedBox === index &&
                        boxHandles(rect).map((handle) => (
                          <rect
                            className={`annotationHandle annotationHandle-${handle.key}`}
                            x={handle.x - handleOffset}
                            y={handle.y - handleOffset}
                            width={handleSize}
                            height={handleSize}
                            rx={handleRadius}
                            fill="#fffdf8"
                            stroke={color}
                            strokeWidth={normalBoxStrokeWidth}
                            vectorEffect="non-scaling-stroke"
                            onPointerDown={(event) => beginBoxEdit(event, index, "resize", handle.key)}
                            key={handle.key}
                          />
                        ))}
                    </g>
                  );
                })}
                {draftRect && selectedClass !== null && (
                  <rect
                    x={draftRect.x}
                    y={draftRect.y}
                    width={draftRect.width}
                    height={draftRect.height}
                    fill={classColor(selectedClass)}
                    fillOpacity={0.16}
                    stroke={classColor(selectedClass)}
                    strokeDasharray={draftDashArray}
                    strokeWidth={normalBoxStrokeWidth}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
            </div>
          )}
          <div className="annotationModePill">
            {spaceDown ? <Move size={15} /> : <MousePointer2 size={15} />}
            {spaceDown ? "拖曳模式" : "標記模式"}
          </div>
        </div>
      </main>

      <aside className="imageListPanel">
        {workspace.images.map((image, index) => (
          <button
            type="button"
            className={`imageListItem ${index === currentIndex ? "isSelected" : ""}`}
            onClick={() => goToImage(index)}
            key={image.path}
          >
            <span>{image.name}</span>
            <em>{image.annotation_count}</em>
          </button>
        ))}
      </aside>

      {classMenu && (
        <div className="classContextMenu" style={{ left: classMenu.x, top: classMenu.y }}>
          <button type="button" onClick={() => void renameClass(classMenu.classIndex)}>
            <Tags size={15} />
            重新命名
          </button>
          <button type="button" onClick={() => void deleteClass(classMenu.classIndex)}>
            <Trash2 size={15} />
            刪除 class
          </button>
        </div>
      )}
    </section>
  );
}

function computeGeometry(
  stage: { width: number; height: number },
  image: { width: number; height: number },
  pan: Point,
  zoom: number,
) {
  if (!stage.width || !stage.height || !image.width || !image.height || !zoom) return null;
  const fit = Math.min(stage.width / image.width, stage.height / image.height);
  const width = image.width * fit;
  const height = image.height * fit;
  return {
    left: (stage.width - width) / 2 + pan.x,
    top: (stage.height - height) / 2 + pan.y,
    width,
    height,
  };
}

function screenPixelsToImageUnits(
  pixels: number,
  geometry: { width: number; height: number },
  image: { width: number; height: number },
  zoom: number,
) {
  const imageToScreenScale = (geometry.width / image.width) * zoom;
  return pixels / imageToScreenScale;
}

function rectFromPoints(start: Point, current: Point, image: { width: number; height: number }) {
  const x1 = clamp(Math.min(start.x, current.x), 0, image.width);
  const y1 = clamp(Math.min(start.y, current.y), 0, image.height);
  const x2 = clamp(Math.max(start.x, current.x), 0, image.width);
  const y2 = clamp(Math.max(start.y, current.y), 0, image.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function moveRect(rect: Rect, dx: number, dy: number, image: { width: number; height: number }): Rect {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, Math.max(0, image.width - rect.width)),
    y: clamp(rect.y + dy, 0, Math.max(0, image.height - rect.height)),
  };
}

function resizeRect(rect: Rect, handle: BoxHandle, point: Point, image: { width: number; height: number }): Rect {
  const minSize = MIN_BOX_PIXELS;
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (handle.includes("w")) {
    left = clamp(point.x, 0, right - minSize);
  }
  if (handle.includes("e")) {
    right = clamp(point.x, left + minSize, image.width);
  }
  if (handle.includes("n")) {
    top = clamp(point.y, 0, bottom - minSize);
  }
  if (handle.includes("s")) {
    bottom = clamp(point.y, top + minSize, image.height);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function rectToBox(rect: Rect, classId: number, image: { width: number; height: number }): AnnotationBox {
  return {
    class_id: classId,
    x_center: (rect.x + rect.width / 2) / image.width,
    y_center: (rect.y + rect.height / 2) / image.height,
    width: rect.width / image.width,
    height: rect.height / image.height,
  };
}

function boxToRect(box: AnnotationBox, image: { width: number; height: number }): Rect {
  const width = box.width * image.width;
  const height = box.height * image.height;
  return {
    x: box.x_center * image.width - width / 2,
    y: box.y_center * image.height - height / 2,
    width,
    height,
  };
}

function boxHandles(rect: Rect): Array<{ key: BoxHandle; x: number; y: number }> {
  return [
    { key: "nw", x: rect.x, y: rect.y },
    { key: "ne", x: rect.x + rect.width, y: rect.y },
    { key: "sw", x: rect.x, y: rect.y + rect.height },
    { key: "se", x: rect.x + rect.width, y: rect.y + rect.height },
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
