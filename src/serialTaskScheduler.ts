export type SerialTaskScheduler = {
  start: () => void;
  stop: () => void;
  isActive: () => boolean;
};

export function createSerialTaskScheduler(
  task: () => Promise<void>,
  intervalMs: number,
  onError: (error: unknown) => void,
): SerialTaskScheduler {
  let active = false;
  let running = false;
  let timer: number | null = null;

  function scheduleNext() {
    timer = window.setTimeout(() => void run(), intervalMs);
  }

  async function run() {
    if (!active || running) return;
    running = true;

    try {
      await task();
    } catch (error) {
      active = false;
      onError(error);
    } finally {
      running = false;
    }

    if (active) scheduleNext();
  }

  return {
    start() {
      if (active) return;
      active = true;
      void run();
    },
    stop() {
      active = false;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    },
    isActive() {
      return active;
    },
  };
}
