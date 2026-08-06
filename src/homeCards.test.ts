import { describe, expect, it, vi } from "vitest";

import { createHomeCardGroups } from "./homeCards";
import { translations } from "./i18n";

function createGroups(internetConnected: boolean) {
  const onOpenImageConverter = vi.fn();
  const onOpenResourceCategory = vi.fn();
  const groups = createHomeCardGroups({
    dashboard: null,
    internetConnected,
    language: "zh_TW",
    onOpenAnnotator: vi.fn(),
    onOpenCamera: vi.fn(),
    onOpenConverter: vi.fn(),
    onOpenImageConverter,
    onOpenResourceCategory,
    onOpenVersionUpdate: vi.fn(),
    onVersionChecked: vi.fn(),
    runAction: async () => undefined,
    t: translations.zh_TW,
    versionCheck: null,
  });

  return { groups, onOpenImageConverter, onOpenResourceCategory };
}

describe("createHomeCardGroups", () => {
  it("creates two independent resource entries before the six main functions", () => {
    const { groups, onOpenImageConverter, onOpenResourceCategory } = createGroups(true);

    expect(groups.resourceEntryCards.map((card) => card.id)).toEqual(["resource-installers", "resource-weights"]);
    expect(groups.resourceEntryCards.every((card) => card.wholeCardAction)).toBe(true);
    expect(groups.mainCards.map((card) => card.id)).toEqual([
      "camera",
      "converter",
      "annotator",
      "image-converter",
      "realtek-folder",
      "version",
    ]);
    expect(groups.installerCards.map((card) => card.key)).toEqual(["driver", "arduino", "vlc"]);
    expect(groups.installerCards.find((card) => card.key === "arduino")?.detail).toBe(
      "arduino-ide_latest_Windows_64bit.exe",
    );
    expect(groups.weightCards.map((card) => card.key)).toEqual(["hand", "box", "japan", "taiwan", "singapore"]);

    groups.resourceEntryCards[0].action();
    groups.resourceEntryCards[1].action();
    groups.mainCards.find((card) => card.id === "image-converter")?.action();
    expect(onOpenResourceCategory.mock.calls).toEqual([["installers"], ["weights"]]);
    expect(onOpenImageConverter).toHaveBeenCalledOnce();
  });

  it("keeps installer and embedded resource cards available offline", () => {
    const { groups } = createGroups(false);

    expect(groups.installerCards.map((card) => [card.key, card.disabled])).toEqual([
      ["driver", false],
      ["arduino", false],
      ["vlc", false],
    ]);
    expect(groups.weightCards.every((card) => !card.disabled)).toBe(true);
  });

  it("still disables unrelated network-only functions while offline", () => {
    const { groups } = createGroups(false);

    expect(groups.mainCards.find((card) => card.id === "converter")?.disabled).toBe(true);
    expect(groups.mainCards.find((card) => card.id === "version")?.disabled).toBe(true);
  });
});
