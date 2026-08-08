import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { Dashboard } from "./types";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriMocks.listen,
}));

vi.mock("./components/AppHeader", () => ({
  AppHeader: ({ onBackHome, view }: { onBackHome: () => void; view: string }) =>
    view === "camera" ? <button onClick={onBackHome}>back-home</button> : null,
}));

vi.mock("./components/HomeView", () => ({
  HomeView: ({
    mainCards,
  }: {
    mainCards: Array<{
      action: () => void;
      id: string;
    }>;
  }) => <button onClick={() => mainCards.find((card) => card.id === "camera")?.action()}>open-camera</button>,
}));

vi.mock("./components/CameraView", () => ({
  CameraView: ({
    cameras,
    isPreviewing,
    videoRef,
  }: {
    cameras: MediaDeviceInfo[];
    isPreviewing: boolean;
    videoRef: RefObject<HTMLVideoElement>;
  }) => (
    <section data-testid="camera-view">
      <video ref={videoRef} />
      <span data-testid="camera-count">{cameras.length}</span>
      <span data-testid="preview-state">{String(isPreviewing)}</span>
    </section>
  ),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const dashboard: Dashboard = {
  metadata: {
    author: "",
    contact: "",
    version: "3.14.2",
    repository: "",
    arduino_ide_url: "",
    vlc_url: "",
    realtek_package_url: "",
    model_converter_url: "",
    model_converter_api_base: "",
    supported_languages: ["zh_TW"],
  },
  settings: {
    capture_interval: 1,
    language: "zh_TW",
    uvcd_format: "MJPG",
    preference_version: "beta",
  },
  realtek_folder: null,
  output_folder: "",
  internet_connected: true,
};

function createDeferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function createStream() {
  const stop = vi.fn();
  const stream = {
    getTracks: () => [{ stop }],
  } as unknown as MediaStream;
  return { stop, stream };
}

function createCameraDevice() {
  return {
    deviceId: "camera-1",
    groupId: "",
    kind: "videoinput",
    label: "Test camera",
    toJSON: () => ({}),
  } as MediaDeviceInfo;
}

async function openCamera() {
  fireEvent.click(screen.getByRole("button", { name: "open-camera" }));
  await waitFor(() => expect(screen.getByTestId("camera-view")).toBeInTheDocument());
}

function leaveCamera() {
  fireEvent.click(screen.getByRole("button", { name: "back-home" }));
}

describe("camera session cleanup", () => {
  beforeEach(() => {
    window.localStorage.setItem("amb82-mini-auto-update-check", "false");
    tauriMocks.invoke.mockImplementation((command: string) => {
      if (command === "get_dashboard") return Promise.resolve(dashboard);
      if (command === "check_internet") return Promise.resolve(true);
      return Promise.resolve(undefined);
    });
    tauriMocks.listen.mockResolvedValue(vi.fn());
  });

  it("stops a permission stream that resolves after leaving the camera view", async () => {
    const permissionRequest = createDeferred<MediaStream>();
    const permissionStream = createStream();
    const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>().mockResolvedValue([]);
    const getUserMedia = vi.fn<() => Promise<MediaStream>>().mockReturnValue(permissionRequest.promise);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { enumerateDevices, getUserMedia },
    });

    render(<App />);
    await openCamera();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    leaveCamera();

    await act(async () => {
      permissionRequest.resolve(permissionStream.stream);
      await permissionRequest.promise;
    });

    await waitFor(() => expect(permissionStream.stop).toHaveBeenCalledTimes(1));
    expect(enumerateDevices).not.toHaveBeenCalled();
    expect(screen.queryByTestId("camera-view")).not.toBeInTheDocument();
  });

  it("does not use devices returned by an obsolete enumeration request", async () => {
    const devicesRequest = createDeferred<MediaDeviceInfo[]>();
    const permissionStream = createStream();
    const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>().mockReturnValue(devicesRequest.promise);
    const getUserMedia = vi.fn<() => Promise<MediaStream>>().mockResolvedValue(permissionStream.stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { enumerateDevices, getUserMedia },
    });

    render(<App />);
    await openCamera();
    await waitFor(() => expect(enumerateDevices).toHaveBeenCalledTimes(1));
    leaveCamera();

    await act(async () => {
      devicesRequest.resolve([createCameraDevice()]);
      await devicesRequest.promise;
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("1 camera(s)")).not.toBeInTheDocument();
  });

  it("stops a preview stream that resolves after leaving the camera view", async () => {
    const previewRequest = createDeferred<MediaStream>();
    const permissionStream = createStream();
    const previewStream = createStream();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const getUserMedia = vi
      .fn<() => Promise<MediaStream>>()
      .mockResolvedValueOnce(permissionStream.stream)
      .mockReturnValueOnce(previewRequest.promise);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([createCameraDevice()]),
        getUserMedia,
      },
    });

    render(<App />);
    await openCamera();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    leaveCamera();

    await act(async () => {
      previewRequest.resolve(previewStream.stream);
      await previewRequest.promise;
    });

    await waitFor(() => expect(previewStream.stop).toHaveBeenCalledTimes(1));
    expect(play).not.toHaveBeenCalled();
    expect(screen.queryByText("預覽畫面")).not.toBeInTheDocument();
  });

  it("does not restore preview state after an obsolete video play request completes", async () => {
    const playRequest = createDeferred<void>();
    const permissionStream = createStream();
    const previewStream = createStream();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockReturnValue(playRequest.promise);
    const getUserMedia = vi
      .fn<() => Promise<MediaStream>>()
      .mockResolvedValueOnce(permissionStream.stream)
      .mockResolvedValueOnce(previewStream.stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([createCameraDevice()]),
        getUserMedia,
      },
    });

    render(<App />);
    await openCamera();
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    leaveCamera();
    expect(previewStream.stop).toHaveBeenCalled();

    await act(async () => {
      playRequest.resolve();
      await playRequest.promise;
    });

    expect(screen.queryByText("預覽畫面")).not.toBeInTheDocument();
    expect(screen.queryByTestId("camera-view")).not.toBeInTheDocument();
  });
});

describe("native dialog state", () => {
  beforeEach(() => {
    window.localStorage.setItem("amb82-mini-auto-update-check", "false");
    tauriMocks.invoke.mockImplementation((command: string) => {
      if (command === "get_dashboard") return Promise.resolve(dashboard);
      if (command === "check_internet") return Promise.resolve(true);
      return Promise.resolve(undefined);
    });
  });

  it("makes the entire app inert only while a native dialog is open", async () => {
    let nativeDialogHandler: ((event: { payload: boolean }) => void) | undefined;
    tauriMocks.listen.mockImplementation((eventName: string, handler: (event: { payload: boolean }) => void) => {
      if (eventName === "native-dialog-state") {
        nativeDialogHandler = handler;
      }
      return Promise.resolve(vi.fn());
    });

    const { container } = render(<App />);
    await waitFor(() => expect(nativeDialogHandler).toBeDefined());
    const app = container.querySelector("main");
    expect(app).not.toHaveAttribute("inert");

    act(() => nativeDialogHandler?.({ payload: true }));
    expect(app).toHaveAttribute("inert");
    expect(app).toHaveAttribute("aria-busy", "true");

    act(() => nativeDialogHandler?.({ payload: false }));
    expect(app).not.toHaveAttribute("inert");
    expect(app).toHaveAttribute("aria-busy", "false");
  });
});
