import { RefreshCcw } from "lucide-react";

import { uvcdFormatOptions } from "../appConfig";
import { uvcdOptionLabel } from "../converterUtils";
import type { PreferenceVersion, RunningAction, UvcdFormat } from "../types";

type SettingsViewProps = {
  onChangePreferenceVersion: (version: PreferenceVersion) => void;
  onChangeUvcdFormat: (format: UvcdFormat) => void;
  onResetSettings: () => void;
  running: RunningAction;
  selectedPreferenceVersion: PreferenceVersion;
  selectedUvcdFormat: UvcdFormat;
  t: Record<string, string>;
};

export function SettingsView({
  onChangePreferenceVersion,
  onChangeUvcdFormat,
  onResetSettings,
  running,
  selectedPreferenceVersion,
  selectedUvcdFormat,
  t,
}: SettingsViewProps) {
  return (
    <section className="contentSection settingsSection">
      <div className="settingsRow">
        <p className="settingsNotice">{t.settingsNotice}</p>
        <div className="settingsField">
          <span className="settingsFieldLabel">{t.preferenceVersion}</span>
          <div className="segmentedToggle" role="group" aria-label={t.preferenceVersion}>
            <button
              type="button"
              className={selectedPreferenceVersion === "release" ? "isSelected" : ""}
              onClick={() => onChangePreferenceVersion("release")}
              disabled={running === "settings"}
            >
              {t.releaseVersion}
            </button>
            <button
              type="button"
              className={selectedPreferenceVersion === "beta" ? "isSelected" : ""}
              onClick={() => onChangePreferenceVersion("beta")}
              disabled={running === "settings"}
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
            disabled={running === "settings"}
          >
            {uvcdFormatOptions.map((item) => (
              <option value={item.value} key={item.value}>
                {uvcdOptionLabel(item, t.defaultOption)}
              </option>
            ))}
          </select>
        </div>
        <div className="settingsFooter">
          <button
            type="button"
            className="resetSettingsButton"
            onClick={onResetSettings}
            disabled={running === "settings"}
          >
            <RefreshCcw className={running === "settings" ? "spin" : undefined} size={17} />
            {t.resetSettings}
          </button>
        </div>
      </div>
    </section>
  );
}
