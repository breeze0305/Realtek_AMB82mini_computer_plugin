import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnotationLoadProgress, AnnotationLoadResult } from "../types";
import { AnnotationView } from "./AnnotationView";

type DragHandler = (event: { payload: { type: "drop"; paths: string[] } }) => void;

type ResizeObserverHarness = {
  observed: Element[];
  disconnect: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  emit: (target: Element, width: number, height: number) => void;
};

let svgPointerCaptureDescriptor: PropertyDescriptor | undefined;

const tauriMocks = vi.hoisted(() => ({
  animationFrame: vi.fn(),
  channels: [] as Array<{ onmessage: (progress: AnnotationLoadProgress) => void }>,
  dragHandler: null as DragHandler | null,
  invoke: vi.fn(),
  onDragDropEvent: vi.fn(),
  resizeObservers: [] as ResizeObserverHarness[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class MockChannel {
    onmessage = () => undefined;

    constructor() {
      tauriMocks.channels.push(this);
    }
  },
  invoke: tauriMocks.invoke,
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: tauriMocks.onDragDropEvent }),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const loadResult: AnnotationLoadResult = {
  workspace: {
    image_folder: "C:\\images",
    labels_folder: "C:\\images_labels",
    images: [],
    classes: [],
    annotations: {},
    invalid_class_ids: [],
  },
  summary: {
    total: 1000,
    corrected: 12,
    failed: 1,
    failed_files: ["broken.jpg"],
  },
};

function populatedLoadResult(imageCount: number, withBox = false): AnnotationLoadResult {
  const images = Array.from({ length: imageCount }, (_, index) => ({
    name: `image${index.toString().padStart(5, "0")}.jpg`,
    path: `C:\\images\\image${index.toString().padStart(5, "0")}.jpg`,
    annotation_count: withBox && index === 0 ? 1 : 0,
  }));
  return {
    workspace: {
      image_folder: "C:\\images",
      labels_folder: "C:\\images_labels",
      images,
      classes: ["object"],
      annotations: Object.fromEntries(
        images.map((image, index) => [
          image.name,
          withBox && index === 0 ? [{ class_id: 0, x_center: 0.2, y_center: 0.2, width: 0.2, height: 0.2 }] : [],
        ]),
      ),
      invalid_class_ids: [],
    },
    summary: { total: imageCount, corrected: 0, failed: 0, failed_files: [] },
  };
}

function installImageLoadingMocks() {
  const NativeUrl = URL;
  class UrlMock extends NativeUrl {}
  Object.defineProperty(UrlMock, "createObjectURL", { value: vi.fn(() => "blob:annotation-image") });
  Object.defineProperty(UrlMock, "revokeObjectURL", { value: vi.fn() });
  vi.stubGlobal("URL", UrlMock);

  vi.stubGlobal(
    "Image",
    class ImageMock {
      naturalWidth = 1000;
      naturalHeight = 1000;
      onload: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
}

function mockPopulatedWorkspace(result: AnnotationLoadResult) {
  tauriMocks.invoke.mockImplementation((command: string) => {
    if (command === "select_annotation_folder") return Promise.resolve("C:\\images");
    if (command === "load_annotation_folder") return Promise.resolve(result);
    if (command === "read_annotation_image") return Promise.resolve({ mime: "image/jpeg", bytes: [1, 2, 3] });
    if (command === "save_annotation_file") return Promise.resolve({ path: "C:\\images_labels\\image.txt", count: 1 });
    throw new Error(`Unexpected command: ${command}`);
  });
}

describe("AnnotationView folder preparation", () => {
  beforeEach(() => {
    svgPointerCaptureDescriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, "setPointerCapture");
    tauriMocks.channels.length = 0;
    tauriMocks.dragHandler = null;
    tauriMocks.invoke.mockReset();
    tauriMocks.onDragDropEvent.mockReset();
    tauriMocks.onDragDropEvent.mockImplementation((handler: DragHandler) => {
      tauriMocks.dragHandler = handler;
      return Promise.resolve(vi.fn());
    });
    tauriMocks.resizeObservers.length = 0;

    tauriMocks.animationFrame.mockReset();
    tauriMocks.animationFrame.mockImplementation((callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal("requestAnimationFrame", tauriMocks.animationFrame);
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        observed: Element[] = [];
        disconnect = vi.fn();
        unobserve = vi.fn();
        callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
          tauriMocks.resizeObservers.push(this);
        }

        observe(element: Element) {
          this.observed.push(element);
        }

        emit(target: Element, width: number, height: number) {
          this.callback(
            [
              {
                target,
                contentRect: { width, height },
              } as ResizeObserverEntry,
            ],
            this,
          );
        }
      },
    );
  });

  afterEach(() => {
    if (svgPointerCaptureDescriptor) {
      Object.defineProperty(SVGElement.prototype, "setPointerCapture", svgPointerCaptureDescriptor);
    } else {
      Reflect.deleteProperty(SVGElement.prototype, "setPointerCapture");
    }
    vi.unstubAllGlobals();
  });

  it("shows request-scoped EXIF progress, blocks reentry, and applies the workspace only after completion", async () => {
    const pendingLoad = deferred<AnnotationLoadResult>();
    const onStatus = vi.fn();
    tauriMocks.invoke.mockImplementation((command: string) => {
      if (command === "select_annotation_folder") return Promise.resolve("C:\\images");
      if (command === "load_annotation_folder") return pendingLoad.promise;
      throw new Error(`Unexpected command: ${command}`);
    });

    const { container } = render(<AnnotationView onBackHome={vi.fn()} onStatus={onStatus} />);
    const folderButton = screen.getByRole("button", { name: "打開資料夾" });
    fireEvent.click(folderButton);
    fireEvent.click(folderButton);

    await waitFor(() =>
      expect(tauriMocks.invoke).toHaveBeenCalledWith(
        "load_annotation_folder",
        expect.objectContaining({ path: "C:\\images", onProgress: expect.anything() }),
      ),
    );
    expect(tauriMocks.invoke.mock.calls.filter(([command]) => command === "select_annotation_folder")).toHaveLength(1);
    expect(container.querySelector(".annotationWorkspace")).not.toBeInTheDocument();

    const progressbar = screen.getByRole("progressbar", { name: "圖片 EXIF 方向處理進度" });
    expect(progressbar).not.toHaveAttribute("aria-valuenow");

    act(() => {
      tauriMocks.channels[0].onmessage({
        phase: "normalizing",
        processed: 250,
        total: 1000,
        corrected: 4,
        failed: 0,
        current_file: "image_00250.jpg",
      });
    });

    await waitFor(() => expect(progressbar).toHaveAttribute("aria-valuenow", "250"));
    expect(screen.getByText("250 / 1,000（25%）")).toBeInTheDocument();
    expect(screen.getByText("image_00250.jpg")).toBeInTheDocument();

    await act(async () => {
      pendingLoad.resolve(loadResult);
      await pendingLoad.promise;
    });

    await waitFor(() => expect(container.querySelector(".annotationWorkspace")).toBeInTheDocument());
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("12 張"));
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("1 張處理失敗"));
  });

  it("returns to the folder picker without loading or reporting an error when selection is canceled", async () => {
    const onStatus = vi.fn();
    tauriMocks.invoke.mockResolvedValueOnce(null);

    render(<AnnotationView onBackHome={vi.fn()} onStatus={onStatus} />);
    fireEvent.click(screen.getByRole("button", { name: "打開資料夾" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "打開資料夾" })).toBeInTheDocument());
    expect(tauriMocks.invoke).toHaveBeenCalledTimes(1);
    expect(tauriMocks.invoke).toHaveBeenCalledWith("select_annotation_folder");
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("rebinds ResizeObserver to the new annotation stage after reloading an open workspace", async () => {
    const pendingReload = deferred<AnnotationLoadResult>();
    let loadCount = 0;
    tauriMocks.invoke.mockImplementation((command: string) => {
      if (command === "select_annotation_folder") return Promise.resolve("C:\\images");
      if (command === "load_annotation_folder") {
        loadCount += 1;
        return loadCount === 1 ? Promise.resolve(loadResult) : pendingReload.promise;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const { container } = render(<AnnotationView onBackHome={vi.fn()} onStatus={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打開資料夾" }));
    await waitFor(() => expect(container.querySelector(".annotationWorkspace")).toBeInTheDocument());
    await waitFor(() => expect(tauriMocks.dragHandler).not.toBeNull());

    const firstStage = container.querySelector(".annotationStage");
    expect(firstStage).not.toBeNull();
    expect(tauriMocks.resizeObservers).toHaveLength(1);
    expect(tauriMocks.resizeObservers[0].observed).toContain(firstStage);

    act(() => {
      tauriMocks.dragHandler?.({ payload: { type: "drop", paths: ["C:\\images"] } });
    });
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());
    expect(tauriMocks.resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingReload.resolve(loadResult);
      await pendingReload.promise;
    });
    await waitFor(() => expect(container.querySelector(".annotationWorkspace")).toBeInTheDocument());
    await waitFor(() => expect(tauriMocks.resizeObservers).toHaveLength(2));

    const secondStage = container.querySelector(".annotationStage");
    expect(secondStage).not.toBeNull();
    expect(secondStage).not.toBe(firstStage);
    expect(tauriMocks.resizeObservers[1].observed).toContain(secondStage);
  });

  it("virtualizes ten thousand image rows and scrolls a newly selected distant image into view", async () => {
    installImageLoadingMocks();
    mockPopulatedWorkspace(populatedLoadResult(10_000));

    const { container } = render(<AnnotationView onBackHome={vi.fn()} onStatus={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打開資料夾" }));
    const panel = await screen.findByLabelText("圖片列表");

    await waitFor(() => expect(container.querySelectorAll(".imageListItem")).toHaveLength(19));
    expect(panel.clientHeight).toBe(0);
    expect(screen.getByRole("button", { name: "image00000.jpg，0 個標記" })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("button", { name: "image09999.jpg，0 個標記" })).not.toBeInTheDocument();

    panel.scrollTop = 5000 * 52;
    fireEvent.scroll(panel);
    const distantImage = await screen.findByRole("button", { name: "image05000.jpg，0 個標記" });
    fireEvent.click(distantImage);
    await waitFor(() => expect(distantImage).toHaveAttribute("aria-current", "true"));

    panel.scrollTop = 0;
    fireEvent.scroll(panel);
    await screen.findByRole("button", { name: "image00000.jpg，0 個標記" });
    fireEvent.keyDown(window, { key: "d" });

    await waitFor(() => expect(panel.scrollTop).toBe(5001 * 52 + 42 - 720));
    expect(await screen.findByRole("button", { name: "image05001.jpg，0 個標記" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(container.querySelectorAll(".imageListItem").length).toBeLessThanOrEqual(30);
  });

  it("coalesces box pointer moves into one frame and saves only the pointer-up position", async () => {
    installImageLoadingMocks();
    mockPopulatedWorkspace(populatedLoadResult(1, true));
    Object.defineProperty(SVGElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    const { container } = render(<AnnotationView onBackHome={vi.fn()} onStatus={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "打開資料夾" }));
    const stage = await waitFor(() => {
      const element = container.querySelector(".annotationStage");
      expect(element).not.toBeNull();
      return element as HTMLDivElement;
    });
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0 }),
    });
    act(() => tauriMocks.resizeObservers[0].emit(stage, 1000, 1000));

    const box = await waitFor(() => {
      const element = container.querySelector(".annotationBox");
      expect(element).not.toBeNull();
      return element as SVGRectElement;
    });
    tauriMocks.animationFrame.mockClear();
    tauriMocks.invoke.mockClear();

    fireEvent.pointerDown(box, { pointerId: 7, clientX: 150, clientY: 150 });
    fireEvent.pointerMove(stage, { pointerId: 7, clientX: 250, clientY: 150 });
    fireEvent.pointerMove(stage, { pointerId: 7, clientX: 300, clientY: 150 });
    fireEvent.pointerMove(stage, { pointerId: 7, clientX: 350, clientY: 150 });

    expect(tauriMocks.animationFrame).toHaveBeenCalledTimes(1);
    expect(tauriMocks.invoke).not.toHaveBeenCalledWith("save_annotation_file", expect.anything());
    await waitFor(() => expect(box).toHaveAttribute("x", "300"));
    expect(tauriMocks.invoke).not.toHaveBeenCalledWith("save_annotation_file", expect.anything());

    fireEvent.pointerUp(stage, { pointerId: 7, clientX: 400, clientY: 150 });
    await waitFor(() =>
      expect(tauriMocks.invoke).toHaveBeenCalledWith(
        "save_annotation_file",
        expect.objectContaining({
          annotations: [expect.objectContaining({ x_center: 0.45 })],
        }),
      ),
    );
    expect(tauriMocks.invoke.mock.calls.filter(([command]) => command === "save_annotation_file")).toHaveLength(1);
    expect(box).toHaveAttribute("x", "350");
  });
});
