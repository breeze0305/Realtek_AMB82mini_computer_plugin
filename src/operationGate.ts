export type OperationGate = {
  begin: () => () => void;
  isBusy: () => boolean;
};

export function createOperationGate(onBusyChange: (isBusy: boolean) => void): OperationGate {
  let activeOperations = 0;

  return {
    begin() {
      activeOperations += 1;
      if (activeOperations === 1) onBusyChange(true);

      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        activeOperations -= 1;

        if (activeOperations === 0) {
          onBusyChange(false);
        }
      };
    },
    isBusy() {
      return activeOperations > 0;
    },
  };
}
