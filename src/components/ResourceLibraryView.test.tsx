import { Box, CheckCircle2 } from "lucide-react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { translations } from "../i18n";
import type { DownloadKey, ResourceCategory, RunningAction } from "../types";
import type { HomeCard } from "./CardGrid";
import { ResourceLibraryView } from "./ResourceLibraryView";

function createCard(id: string, title: string, key: HomeCard["key"] = null): HomeCard {
  return {
    action: vi.fn(),
    actionIcon: CheckCircle2,
    detail: "",
    disabled: false,
    icon: Box,
    id,
    key,
    label: "Open",
    title,
  };
}

type ResourceLibraryHarnessProps = {
  running?: RunningAction;
};

function ResourceLibraryHarness({ running = null }: ResourceLibraryHarnessProps) {
  const [activeCategory, setActiveCategory] = useState<ResourceCategory>("installers");

  return (
    <ResourceLibraryView
      activeCategory={activeCategory}
      downloadProgress={{}}
      installerCards={[createCard("installer", "Installer card", "arduino")]}
      isDownloadKey={(key: RunningAction): key is DownloadKey => key === "arduino" || key === "vlc"}
      onSelectCategory={setActiveCategory}
      openActionMenu={null}
      running={running}
      setOpenActionMenu={vi.fn()}
      t={translations.en_US}
      weightCards={[createCard("weight", "Weight card", "hand")]}
    />
  );
}

describe("ResourceLibraryView", () => {
  it("switches between installer and weight cards without rendering both groups together", () => {
    render(<ResourceLibraryHarness />);

    expect(screen.getByText("Installer card")).toBeInTheDocument();
    expect(screen.queryByText("Weight card")).not.toBeInTheDocument();

    const weightTab = screen.getByRole("tab", { name: /Code & Model Weights/ });
    fireEvent.click(weightTab);

    expect(weightTab).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Installer card")).not.toBeInTheDocument();
    expect(screen.getByText("Weight card")).toBeInTheDocument();
  });

  it("blocks another resource action while one resource operation is running", () => {
    render(<ResourceLibraryHarness running="arduino" />);

    fireEvent.click(screen.getByRole("tab", { name: /Code & Model Weights/ }));
    const weightCard = screen.getByText("Weight card").closest("article");
    expect(weightCard?.querySelector("button")).toBeDisabled();
  });

  it("supports arrow-key navigation between category tabs", () => {
    render(<ResourceLibraryHarness />);

    const installerTab = screen.getByRole("tab", { name: /Installers/ });
    const weightTab = screen.getByRole("tab", { name: /Code & Model Weights/ });
    installerTab.focus();
    fireEvent.keyDown(installerTab, { key: "ArrowRight" });

    expect(weightTab).toHaveFocus();
    expect(weightTab).toHaveAttribute("aria-selected", "true");
    expect(weightTab).toHaveAttribute("tabindex", "0");
    expect(installerTab).toHaveAttribute("tabindex", "-1");
  });
});
