import { describe, expect, it, vi } from "vitest";

import { createHomeCardGroups } from "./homeCards";
import { translations } from "./i18n";

function createGroups(internetConnected: boolean) {
  const onOpenResourceCategory = vi.fn();
  const groups = createHomeCardGroups({
    dashboard: null,
    internetConnected,
    language: "zh_TW",
    onOpenAnnotator: vi.fn(),
    onOpenCamera: vi.fn(),
    onOpenConverter: vi.fn(),
    onOpenResourceCategory,
    onOpenVersionUpdate: vi.fn(),
    onVersionChecked: vi.fn(),
    runAction: async () => undefined,
    t: translations.zh_TW,
    versionCheck: null,
  });

  return { groups, onOpenResourceCategory };
}

describe("createHomeCardGroups", () => {
  it("creates two independent resource entries before the five main functions", () => {
    const { groups, onOpenResourceCategory } = createGroups(true);

    expect(groups.resourceEntryCards.map((card) => card.id)).toEqual(["resource-installers", "resource-weights"]);
    expect(groups.mainCards.map((card) => card.id)).toEqual([
      "camera",
      "converter",
      "annotator",
      "realtek-folder",
      "version",
    ]);
    expect(groups.installerCards.map((card) => card.key)).toEqual(["driver", "arduino", "vlc"]);
    expect(groups.weightCards.map((card) => card.key)).toEqual(["hand", "box", "japan", "taiwan", "singapore"]);

    groups.resourceEntryCards[0].action();
    groups.resourceEntryCards[1].action();
    expect(onOpenResourceCategory.mock.calls).toEqual([["installers"], ["weights"]]);
  });

  it("keeps embedded resources available offline and disables only network installers", () => {
    const { groups } = createGroups(false);

    expect(groups.installerCards.map((card) => [card.key, card.disabled])).toEqual([
      ["driver", false],
      ["arduino", true],
      ["vlc", true],
    ]);
    expect(groups.weightCards.every((card) => !card.disabled)).toBe(true);
  });
});
