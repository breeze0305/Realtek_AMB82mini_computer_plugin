import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { translations } from "../i18n";
import type { RunningAction } from "../types";
import { SettingsView } from "./SettingsView";

const t = translations.zh_TW;

function renderSettings(running: RunningAction = null, onClearWeightRecords = vi.fn()) {
  return render(
    <SettingsView
      autoCheckUpdates
      onChangeAutoCheckUpdates={vi.fn()}
      onChangePreferenceVersion={vi.fn()}
      onChangeUvcdFormat={vi.fn()}
      onClearWeightRecords={onClearWeightRecords}
      onResetSettings={vi.fn()}
      running={running}
      selectedPreferenceVersion="beta"
      selectedUvcdFormat="MJPG"
      t={t}
    />,
  );
}

describe("SettingsView", () => {
  it("shows the model-weight cleanup control and runs it directly", () => {
    const onClearWeightRecords = vi.fn();
    renderSettings(null, onClearWeightRecords);

    expect(screen.getByText(t.clearWeightRecordsDescription)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.clearWeightRecords }));

    expect(onClearWeightRecords).toHaveBeenCalledOnce();
  });

  it("locks settings actions and shows progress while model weights are being cleared", () => {
    renderSettings("weightCleanup");

    expect(screen.getByRole("button", { name: t.clearingWeightRecords })).toBeDisabled();
    expect(screen.getByRole("button", { name: t.releaseVersion })).toBeDisabled();
    expect(screen.getByRole("button", { name: t.betaVersion })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: t.uvcDeviceSettings })).toBeDisabled();
    expect(screen.getByRole("button", { name: t.resetSettings })).toBeDisabled();
  });

  it("prevents cleanup from overlapping another action", () => {
    renderSettings("hand");

    expect(screen.getByRole("button", { name: t.clearWeightRecords })).toBeDisabled();
  });
});
