import { Box, CheckCircle2 } from "lucide-react";
import { render, screen } from "@testing-library/react";
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

function renderResourceLibrary(category: ResourceCategory, running: RunningAction = null) {
  const card =
    category === "installers"
      ? createCard("installer", "Installer card", "arduino")
      : createCard("weight", "Weight card", "hand");

  return render(
    <ResourceLibraryView
      cards={[card]}
      category={category}
      downloadProgress={{}}
      isDownloadKey={(key: RunningAction): key is DownloadKey => key === "arduino" || key === "vlc"}
      openActionMenu={null}
      running={running}
      setOpenActionMenu={vi.fn()}
      t={translations.en_US}
    />,
  );
}

describe("ResourceLibraryView", () => {
  it("renders the installer page without a shared category switcher", () => {
    renderResourceLibrary("installers");

    expect(screen.getByRole("heading", { name: "Installers" })).toBeInTheDocument();
    expect(screen.getByText("Installer card")).toBeInTheDocument();
    expect(screen.queryByText("Weight card")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("renders the weight page independently and blocks actions while another resource operation is running", () => {
    renderResourceLibrary("weights", "arduino");

    expect(screen.getByRole("heading", { name: "Code & Model Weights" })).toBeInTheDocument();
    const weightCard = screen.getByText("Weight card").closest("article");
    expect(weightCard?.querySelector("button")).toBeDisabled();
    expect(screen.queryByText("Installer card")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
