import { LoaderCircle, RefreshCcw, Trash2 } from "lucide-react";

import { uvcdFormatOptions } from "../appConfig";
import { uvcdOptionLabel } from "../converterUtils";
import type { PreferenceVersion, RunningAction, UvcdFormat } from "../types";

type SettingsViewProps = {
  autoCheckUpdates: boolean;
  onChangeAutoCheckUpdates: (enabled: boolean) => void;
  onChangePreferenceVersion: (version: PreferenceVersion) => void;
  onChangeUvcdFormat: (format: UvcdFormat) => void;
  onClearWeightRecords: () => void;
  onResetSettings: () => void;
  running: RunningAction;
  selectedPreferenceVersion: PreferenceVersion;
  selectedUvcdFormat: UvcdFormat;
  t: Record<string, string>;
};

export function SettingsView({
  autoCheckUpdates,
  onChangeAutoCheckUpdates,
  onChangePreferenceVersion,
  onChangeUvcdFormat,
  onClearWeightRecords,
  onResetSettings,
  running,
  selectedPreferenceVersion,
  selectedUvcdFormat,
  t,
}: SettingsViewProps) {
  const isClearingWeights = running === "weightCleanup";
  const areSettingsActionsBusy = running === "settings" || isClearingWeights;

  return (
    <section className="contentSection settingsSection">
      <div className="settingsRow">
        <p className="settingsNotice">{t.settingsNotice}</p>
        <div className="settingsField">
          <label className="settingsSwitch">
            <span className="settingsFieldLabel">{t.autoCheckUpdates}</span>
            <input
              type="checkbox"
              checked={autoCheckUpdates}
              onChange={(event) => onChangeAutoCheckUpdates(event.target.checked)}
            />
            <span className="settingsSwitchTrack" aria-hidden="true" />
          </label>
        </div>
        <div className="settingsField">
          <span className="settingsFieldLabel">{t.preferenceVersion}</span>
          <div className="segmentedToggle" role="group" aria-label={t.preferenceVersion}>
            <button
              type="button"
              className={selectedPreferenceVersion === "release" ? "isSelected" : ""}
              onClick={() => onChangePreferenceVersion("release")}
              disabled={areSettingsActionsBusy}
            >
              {t.releaseVersion}
            </button>
            <button
              type="button"
              className={selectedPreferenceVersion === "beta" ? "isSelected" : ""}
              onClick={() => onChangePreferenceVersion("beta")}
              disabled={areSettingsActionsBusy}
            >
              {t.betaVersion}
            </button>
          </div>
        </div>
        <div className="settingsField">
          <label className="settingsFieldLabel" htmlFor="uvcd-format">
            {t.uvcDeviceSettings}
          </label>
          <select
            id="uvcd-format"
            value={selectedUvcdFormat}
            onChange={(event) => onChangeUvcdFormat(event.target.value as UvcdFormat)}
            disabled={areSettingsActionsBusy}
          >
            {uvcdFormatOptions.map((item) => (
              <option value={item.value} key={item.value}>
                {uvcdOptionLabel(item, t.defaultOption)}
              </option>
            ))}
          </select>
        </div>
        <div className="settingsWeightCleanup">
          <div className="settingsWeightCleanupCopy">
            <span className="settingsFieldLabel">{t.weightFiles}</span>
            <p>{t.clearWeightRecordsDescription}</p>
          </div>
          <button
            type="button"
            className="dangerBtn settingsWeightCleanupButton"
            onClick={onClearWeightRecords}
            disabled={running !== null}
          >
            {isClearingWeights ? (
              <LoaderCircle className="spin" size={17} aria-hidden="true" />
            ) : (
              <Trash2 size={17} aria-hidden="true" />
            )}
            {isClearingWeights ? t.clearingWeightRecords : t.clearWeightRecords}
          </button>
        </div>
        <div className="settingsFooter">
          <button
            type="button"
            className="resetSettingsButton"
            onClick={onResetSettings}
            disabled={areSettingsActionsBusy}
          >
            <RefreshCcw className={running === "settings" ? "spin" : undefined} size={17} aria-hidden="true" />
            {t.resetSettings}
          </button>
        </div>
      </div>
    </section>
  );
}
