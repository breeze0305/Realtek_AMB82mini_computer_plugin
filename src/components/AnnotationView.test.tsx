import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnotationLoadProgress, AnnotationLoadResult } from "../types";
import { AnnotationView } from "./AnnotationView";

type DragHandler = (event: { payload: { type: "drop"; paths: string[] } }) => void;

const tauriMocks = vi.hoisted(() => ({
  channels: [] as Array<{ onmessage: (progress: AnnotationLoadProgress) => void }>,
  dragHandler: null as DragHandler | null,
  invoke: vi.fn(),
  onDragDropEvent: vi.fn(),
  resizeObservers: [] as Array<{ observed: Element[]; disconnect: ReturnType<typeof vi.fn> }>,
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

describe("AnnotationView folder preparation", () => {
  beforeEach(() => {
    tauriMocks.channels.length = 0;
    tauriMocks.dragHandler = null;
    tauriMocks.invoke.mockReset();
    tauriMocks.onDragDropEvent.mockReset();
    tauriMocks.onDragDropEvent.mockImplementation((handler: DragHandler) => {
      tauriMocks.dragHandler = handler;
      return Promise.resolve(vi.fn());
    });
    tauriMocks.resizeObservers.length = 0;

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        observed: Element[] = [];
        disconnect = vi.fn();

        constructor() {
          tauriMocks.resizeObservers.push(this);
        }

        observe(element: Element) {
          this.observed.push(element);
        }
      },
    );
  });

  afterEach(() => {
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
});
