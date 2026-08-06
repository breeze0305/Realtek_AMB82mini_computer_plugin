import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { translations } from "../i18n";
import type { ImageConversionProgress, ImageConversionSummary } from "../types";
import { ImageConversionView } from "./ImageConversionView";

type DragEvent = { payload: { type: "enter" | "leave" } } | { payload: { type: "drop"; paths: string[] } };
type DragHandler = (event: DragEvent) => void;

const tauriMocks = vi.hoisted(() => ({
  channels: [] as Array<{ onmessage: (progress: ImageConversionProgress) => void }>,
  dragHandler: null as DragHandler | null,
  invoke: vi.fn(),
  onDragDropEvent: vi.fn(),
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

const summary: ImageConversionSummary = {
  total: 10000,
  converted: 420,
  normalized: 18,
  skipped: 9561,
  failed: 1,
  failed_files: ["C:\\photos\\conflict.jpg"],
};

describe("ImageConversionView", () => {
  beforeEach(() => {
    tauriMocks.channels.length = 0;
    tauriMocks.dragHandler = null;
    tauriMocks.invoke.mockReset();
    tauriMocks.onDragDropEvent.mockReset();
    tauriMocks.onDragDropEvent.mockImplementation((handler: DragHandler) => {
      tauriMocks.dragHandler = handler;
      return Promise.resolve(vi.fn());
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns to the initial picker without an error when folder selection is canceled", async () => {
    const onStatus = vi.fn();
    const onBackHome = vi.fn();
    tauriMocks.invoke.mockResolvedValueOnce(null);

    render(<ImageConversionView language="zh_TW" onBackHome={onBackHome} onStatus={onStatus} t={translations.zh_TW} />);
    fireEvent.click(screen.getByRole("button", { name: "打開資料夾" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "打開資料夾" })).toBeInTheDocument());
    expect(tauriMocks.invoke).toHaveBeenCalledOnce();
    expect(tauriMocks.invoke).toHaveBeenCalledWith("select_image_conversion_folder");
    expect(onStatus).not.toHaveBeenCalled();
    expect(onBackHome).not.toHaveBeenCalled();
  });

  it("shows conversion progress and returns home with a completion summary", async () => {
    const pendingConversion = deferred<ImageConversionSummary>();
    const onStatus = vi.fn();
    const onBackHome = vi.fn();
    tauriMocks.invoke.mockImplementation((command: string) => {
      if (command === "select_image_conversion_folder") return Promise.resolve("C:\\photos");
      if (command === "convert_image_folder") return pendingConversion.promise;
      throw new Error(`Unexpected command: ${command}`);
    });

    render(<ImageConversionView language="en_US" onBackHome={onBackHome} onStatus={onStatus} t={translations.en_US} />);
    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() =>
      expect(tauriMocks.invoke).toHaveBeenCalledWith(
        "convert_image_folder",
        expect.objectContaining({ path: "C:\\photos", onProgress: expect.anything() }),
      ),
    );
    const progressbar = screen.getByRole("progressbar", { name: "Image conversion progress" });
    expect(progressbar).not.toHaveAttribute("aria-valuenow");

    act(() => {
      tauriMocks.channels[0].onmessage({
        phase: "converting",
        processed: 2500,
        total: 10000,
        converted: 100,
        normalized: 8,
        skipped: 2391,
        failed: 1,
        current_file: "C:\\photos\\album\\photo.webp",
      });
    });

    await waitFor(() => expect(progressbar).toHaveAttribute("aria-valuenow", "2500"));
    expect(screen.getByText("2,500 / 10,000 (25%)")).toBeInTheDocument();
    expect(screen.getByText("C:\\photos\\album\\photo.webp")).toBeInTheDocument();

    await act(async () => {
      pendingConversion.resolve(summary);
      await pendingConversion.promise;
    });

    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("converted to JPG: 420"));
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("orientation fixed: 18"));
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("First failed file"));
    expect(onBackHome).toHaveBeenCalledOnce();
  });

  it("starts from a dropped folder and ignores repeat drops while conversion is active", async () => {
    const pendingConversion = deferred<ImageConversionSummary>();
    const onBackHome = vi.fn();
    tauriMocks.invoke.mockImplementation((command: string) => {
      if (command === "convert_image_folder") return pendingConversion.promise;
      throw new Error(`Unexpected command: ${command}`);
    });

    render(<ImageConversionView language="zh_TW" onBackHome={onBackHome} onStatus={vi.fn()} t={translations.zh_TW} />);
    await waitFor(() => expect(tauriMocks.dragHandler).not.toBeNull());

    act(() => {
      tauriMocks.dragHandler?.({ payload: { type: "drop", paths: ["C:\\photos"] } });
      tauriMocks.dragHandler?.({ payload: { type: "drop", paths: ["C:\\other"] } });
    });

    await waitFor(() => expect(screen.getByRole("progressbar", { name: "圖片轉檔進度" })).toBeInTheDocument());
    expect(tauriMocks.invoke).toHaveBeenCalledOnce();
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "convert_image_folder",
      expect.objectContaining({ path: "C:\\photos" }),
    );

    await act(async () => {
      pendingConversion.resolve({ ...summary, failed: 0, failed_files: [] });
      await pendingConversion.promise;
    });
    expect(onBackHome).toHaveBeenCalledOnce();
  });
});
