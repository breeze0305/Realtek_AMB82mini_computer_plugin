import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { converterModelDefaults } from "../appConfig";
import { translations } from "../i18n";
import { ConverterView } from "./ConverterView";

type DragDropEvent =
  | { payload: { type: "enter"; paths: string[] } }
  | { payload: { type: "leave" } }
  | { payload: { type: "drop"; paths: string[] } };
type DragDropHandler = (event: DragDropEvent) => void;

const tauriMocks = vi.hoisted(() => ({
  dragDropHandler: null as DragDropHandler | null,
  onDragDropEvent: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: tauriMocks.onDragDropEvent }),
}));

function renderConverter(overrides: Partial<Parameters<typeof ConverterView>[0]> = {}) {
  const onChooseDroppedPath = vi.fn();
  const onChooseFile = vi.fn();
  const result = render(
    <ConverterView
      completedConversion={null}
      converterExtensions=".pt"
      converterFile={null}
      converterInputRef={createRef<HTMLInputElement>()}
      converterStatus=""
      converterTask={null}
      converterType="yolo"
      internetConnected
      isConverterBusy={false}
      modelConverterUrl="https://example.com"
      onChooseDroppedPath={onChooseDroppedPath}
      onChooseFile={onChooseFile}
      onDownloadCompletedConversion={vi.fn()}
      onOpenUrl={vi.fn()}
      onSelectType={vi.fn()}
      onStartModelConversion={vi.fn()}
      selectedConverterModel={converterModelDefaults.yolo}
      t={translations.en_US}
      {...overrides}
    />,
  );

  const dropZone = result.container.querySelector<HTMLElement>(".converterDropZone");
  if (!dropZone) throw new Error("Converter drop zone was not rendered");

  return { ...result, dropZone, onChooseDroppedPath, onChooseFile };
}

describe("ConverterView file selection", () => {
  beforeEach(() => {
    tauriMocks.dragDropHandler = null;
    tauriMocks.onDragDropEvent.mockReset();
    tauriMocks.unlisten.mockReset();
    tauriMocks.onDragDropEvent.mockImplementation((handler: DragDropHandler) => {
      tauriMocks.dragDropHandler = handler;
      return Promise.resolve(tauriMocks.unlisten);
    });
  });

  it("shows native drag activity on enter and clears it on leave", async () => {
    const { dropZone } = renderConverter();
    await act(async () => Promise.resolve());

    act(() => {
      tauriMocks.dragDropHandler?.({ payload: { type: "enter", paths: ["C:\\models\\model.pt"] } });
    });
    expect(dropZone).toHaveClass("isDropActive");

    act(() => {
      tauriMocks.dragDropHandler?.({ payload: { type: "leave" } });
    });
    expect(dropZone).not.toHaveClass("isDropActive");
  });

  it("passes only the first native dropped path to the parent", async () => {
    const { dropZone, onChooseDroppedPath } = renderConverter();
    await act(async () => Promise.resolve());

    act(() => {
      tauriMocks.dragDropHandler?.({
        payload: { type: "drop", paths: ["C:\\models\\first.pt", "C:\\models\\second.pt"] },
      });
    });

    expect(onChooseDroppedPath).toHaveBeenCalledOnce();
    expect(onChooseDroppedPath).toHaveBeenCalledWith("C:\\models\\first.pt");
    expect(dropZone).not.toHaveClass("isDropActive");
  });

  it("ignores native drops while conversion is busy", async () => {
    const { dropZone, onChooseDroppedPath } = renderConverter({ isConverterBusy: true });
    await act(async () => Promise.resolve());

    act(() => {
      tauriMocks.dragDropHandler?.({ payload: { type: "enter", paths: ["C:\\models\\model.pt"] } });
      tauriMocks.dragDropHandler?.({ payload: { type: "drop", paths: ["C:\\models\\model.pt"] } });
    });

    expect(onChooseDroppedPath).not.toHaveBeenCalled();
    expect(dropZone).not.toHaveClass("isDropActive");
  });

  it("unsubscribes from native drag events when unmounted", async () => {
    const { unmount } = renderConverter();
    await act(async () => Promise.resolve());

    unmount();

    expect(tauriMocks.unlisten).toHaveBeenCalledOnce();
  });

  it("keeps the DOM file input wired to onChooseFile", () => {
    const { container, onChooseFile } = renderConverter();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Converter file input was not rendered");
    const file = new File(["weights"], "model.pt", { type: "application/octet-stream" });

    fireEvent.change(input, {
      target: {
        files: {
          0: file,
          length: 1,
          item: (index: number) => (index === 0 ? file : null),
        },
      },
    });

    expect(onChooseFile).toHaveBeenCalledOnce();
    expect(onChooseFile).toHaveBeenCalledWith(file);
  });
});
