import { describe, expect, it, vi } from "vitest";

import { createOperationGate } from "./operationGate";

describe("createOperationGate", () => {
  it("stays busy until every overlapping operation finishes", () => {
    const onBusyChange = vi.fn();
    const gate = createOperationGate(onBusyChange);

    const finishFirst = gate.begin();
    const finishSecond = gate.begin();
    expect(gate.isBusy()).toBe(true);
    expect(onBusyChange).toHaveBeenCalledTimes(1);
    expect(onBusyChange).toHaveBeenLastCalledWith(true);

    finishFirst();
    expect(gate.isBusy()).toBe(true);
    expect(onBusyChange).toHaveBeenCalledTimes(1);

    finishSecond();
    expect(gate.isBusy()).toBe(false);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("ignores duplicate finish calls", () => {
    const onBusyChange = vi.fn();
    const gate = createOperationGate(onBusyChange);
    const finish = gate.begin();

    finish();
    finish();

    expect(gate.isBusy()).toBe(false);
    expect(onBusyChange).toHaveBeenCalledTimes(2);
  });
});
