import { Box, CheckCircle2 } from "lucide-react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { translations } from "../i18n";
import type { DownloadKey, RunningAction } from "../types";
import type { HomeCard } from "./CardGrid";
import { HomeView } from "./HomeView";

function createCard(id: string, title: string, wholeCardAction = false): HomeCard {
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
    wholeCardAction,
  };
}

describe("HomeView", () => {
  it("makes the first two numbered resource cards fully clickable and separates them from main functions", () => {
    const openInstallers = vi.fn();
    const installerCard = createCard("resource-installers", "Installers", true);
    installerCard.action = openInstallers;

    const { container } = render(
      <HomeView
        downloadProgress={{}}
        isDownloadKey={(key: RunningAction): key is DownloadKey => key === "arduino" || key === "vlc"}
        mainCards={[createCard("camera", "Camera")]}
        openActionMenu={null}
        resourceEntryCards={[installerCard, createCard("resource-weights", "Code & Model Weights", true)]}
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

    const installerEntry = screen.getByRole("button", { name: /Installers/ });
    expect(installerEntry).toHaveClass("wholeCardAction");
    expect(within(installerEntry).queryByText("Open")).not.toBeInTheDocument();
    fireEvent.click(installerEntry);
    expect(openInstallers).toHaveBeenCalledOnce();
  });
});
