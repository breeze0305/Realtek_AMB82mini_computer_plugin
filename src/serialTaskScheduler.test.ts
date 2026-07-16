import { afterEach, describe, expect, it, vi } from "vitest";

import { createSerialTaskScheduler } from "./serialTaskScheduler";

afterEach(() => {
  vi.useRealTimers();
});

describe("createSerialTaskScheduler", () => {
  it("waits for the current task and interval before starting the next task", async () => {
    vi.useFakeTimers();
    let finishTask: (() => void) | undefined;
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishTask = resolve;
        }),
    );
    const onError = vi.fn();
    const scheduler = createSerialTaskScheduler(task, 1_000, onError);

    scheduler.start();
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(task).toHaveBeenCalledTimes(1);

    finishTask?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(999);
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it("stops scheduling after an error", async () => {
    vi.useFakeTimers();
    const error = new Error("capture failed");
    const task = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const scheduler = createSerialTaskScheduler(task, 1_000, onError);

    scheduler.start();
    await vi.runAllTimersAsync();

    expect(task).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    expect(scheduler.isActive()).toBe(false);
  });

  it("cancels a pending run when stopped", async () => {
    vi.useFakeTimers();
    const task = vi.fn().mockResolvedValue(undefined);
    const scheduler = createSerialTaskScheduler(task, 1_000, vi.fn());

    scheduler.start();
    await Promise.resolve();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(task).toHaveBeenCalledTimes(1);
  });
});
