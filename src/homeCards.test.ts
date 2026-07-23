import { describe, expect, it, vi } from "vitest";

import { createHomeCardGroups } from "./homeCards";
import { translations } from "./i18n";

function createGroups(internetConnected: boolean) {
  const onOpenResources = vi.fn();
  const groups = createHomeCardGroups({
    dashboard: null,
    internetConnected,
    language: "zh_TW",
    onOpenAnnotator: vi.fn(),
    onOpenCamera: vi.fn(),
    onOpenConverter: vi.fn(),
    onOpenResources,
    onOpenVersionUpdate: vi.fn(),
    onVersionChecked: vi.fn(),
    runAction: async () => undefined,
    t: translations.zh_TW,
    versionCheck: null,
  });

  return { groups, onOpenResources };
}

describe("createHomeCardGroups", () => {
  it("keeps one resource entry on the home page and explicitly groups all resource cards", () => {
    const { groups, onOpenResources } = createGroups(true);

    expect(groups.mainCards.map((card) => card.id)).toEqual([
      "camera",
      "converter",
      "annotator",
      "realtek-folder",
      "resources",
      "version",
    ]);
    expect(groups.installerCards.map((card) => card.key)).toEqual(["driver", "arduino", "vlc"]);
    expect(groups.weightCards.map((card) => card.key)).toEqual(["hand", "box", "japan", "taiwan", "singapore"]);

    groups.mainCards.find((card) => card.id === "resources")?.action();
    expect(onOpenResources).toHaveBeenCalledOnce();
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
