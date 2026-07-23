import { Box, CheckCircle2 } from "lucide-react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { translations } from "../i18n";
import type { DownloadKey, RunningAction } from "../types";
import type { HomeCard } from "./CardGrid";
import { HomeView } from "./HomeView";

function createCard(id: string, title: string): HomeCard {
  return {
    action: vi.fn(),
    actionIcon: CheckCircle2,
    detail: "",
    disabled: false,
    icon: Box,
    id,
    key: null,
    label: "Open",
    title,
  };
}

describe("HomeView", () => {
  it("numbers the two resource entries first and separates them from main functions", () => {
    const { container } = render(
      <HomeView
        downloadProgress={{}}
        isDownloadKey={(key: RunningAction): key is DownloadKey => key === "arduino" || key === "vlc"}
        mainCards={[createCard("camera", "Camera")]}
        openActionMenu={null}
        resourceEntryCards={[
          createCard("resource-installers", "Installers"),
          createCard("resource-weights", "Code & Model Weights"),
        ]}
        running={null}
        setOpenActionMenu={vi.fn()}
        t={translations.en_US}
      />,
    );

    expect(Array.from(container.querySelectorAll(".cardIndex")).map((item) => item.textContent)).toEqual([
      "01",
      "02",
      "03",
    ]);
    expect(screen.getByRole("separator", { name: "Main Functions" })).toBeInTheDocument();
  });
});
