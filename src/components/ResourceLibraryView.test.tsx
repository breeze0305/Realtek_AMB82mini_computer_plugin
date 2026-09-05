import { Box, CheckCircle2 } from "lucide-react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const resources = [
  { key: "hand", nameKey: "hand", summaryKey: "resourceHandGuideSummary" },
  { key: "box", nameKey: "objectBoxTracking", summaryKey: "resourceBoxGuideSummary" },
  { key: "japan", nameKey: "japanModel", summaryKey: "resourceJapanGuideSummary" },
  { key: "taiwan", nameKey: "taiwanModel", summaryKey: "resourceTaiwanGuideSummary" },
  { key: "singapore", nameKey: "singaporeModel", summaryKey: "resourceSingaporeGuideSummary" },
] as const;

function createWeightCards(t = translations.en_US) {
  return resources.map(({ key, nameKey }) => ({
    ...createCard(`resource-${key}`, t[nameKey], key),
    detail: `${key}_code.txt / ${key}_weights.nb`,
  }));
}

function renderResourceLibrary(
  category: ResourceCategory,
  running: RunningAction = null,
  cards = category === "installers" ? [createCard("installer", "Installer card", "arduino")] : createWeightCards(),
) {
  return render(
    <ResourceLibraryView
      cards={cards}
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
  it("renders the installer page without a shared category switcher and preserves its action", async () => {
    const user = userEvent.setup();
    const card = createCard("installer", "Installer card", "arduino");
    renderResourceLibrary("installers", null, [card]);

    expect(screen.getByRole("heading", { name: "Installers" })).toBeInTheDocument();
    expect(screen.getByText("Installer card")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View guide:/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(card.action).toHaveBeenCalledOnce();
  });

  it("blocks resource actions during another operation while allowing guide selection", async () => {
    const user = userEvent.setup();
    const cards = createWeightCards();
    renderResourceLibrary("weights", "arduino", cards);

    expect(screen.getByRole("heading", { name: "Code & Model Weights" })).toBeInTheDocument();
    for (const action of screen.getAllByRole("button", { name: "Open" })) {
      expect(action).toBeDisabled();
      await user.click(action);
    }
    expect(screen.queryByText("Installer card")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText(translations.en_US.installerFilesDetail)).not.toBeInTheDocument();

    const secondGuideButton = screen.getByRole("button", { name: `View guide: ${cards[1].title}` });
    expect(secondGuideButton).toBeEnabled();
    await user.click(secondGuideButton);

    expect(screen.getByRole("complementary", { name: cards[1].title })).toBeInTheDocument();
    expect(secondGuideButton).toHaveAttribute("aria-pressed", "true");
    for (const card of cards) expect(card.action).not.toHaveBeenCalled();
  });

  it("shows the first guide by default and switches each card's text and image without retrieving files", async () => {
    const user = userEvent.setup();
    const cards = createWeightCards();
    renderResourceLibrary("weights", null, cards);

    expect(screen.getByRole("complementary", { name: cards[0].title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `View guide: ${cards[0].title}` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    for (const [index, card] of cards.entries()) {
      const button = screen.getByRole("button", { name: `View guide: ${card.title}` });
      await user.click(button);

      const guide = screen.getByRole("complementary", { name: card.title });
      expect(button).toHaveAttribute("aria-controls", guide.id);
      expect(within(guide).getByText(translations.en_US[resources[index].summaryKey])).toBeInTheDocument();
      expect(within(guide).getByText(card.detail)).toBeInTheDocument();
      expect(
        within(guide).getByRole("img", { name: `Weight placement illustration for ${card.title}` }),
      ).toBeInTheDocument();
      for (const other of cards) {
        expect(screen.getByRole("button", { name: `View guide: ${other.title}` })).toHaveAttribute(
          "aria-pressed",
          String(other.id === card.id),
        );
        expect(other.action).not.toHaveBeenCalled();
      }
    }
  });

  it("supports Enter and Space for selecting a guide", async () => {
    const user = userEvent.setup();
    const cards = createWeightCards();
    renderResourceLibrary("weights", null, cards);

    screen.getByRole("button", { name: `View guide: ${cards[1].title}` }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("complementary", { name: cards[1].title })).toBeInTheDocument();

    screen.getByRole("button", { name: `View guide: ${cards[2].title}` }).focus();
    await user.keyboard(" ");
    expect(screen.getByRole("complementary", { name: cards[2].title })).toBeInTheDocument();
    for (const card of cards) expect(card.action).not.toHaveBeenCalled();
  });

  it("keeps each retrieve button connected to its original action independently of the selected guide", async () => {
    const user = userEvent.setup();
    const cards = createWeightCards();
    renderResourceLibrary("weights", null, cards);

    const cardTitle = screen.getByRole("heading", { name: cards[1].title });
    const card = cardTitle.closest("article");
    expect(card).not.toBeNull();
    await user.click(within(card!).getByRole("button", { name: "Open" }));

    expect(cards[1].action).toHaveBeenCalledOnce();
    expect(screen.getByRole("complementary", { name: cards[0].title })).toBeInTheDocument();
    for (const other of cards.filter((item) => item.id !== cards[1].id)) {
      expect(other.action).not.toHaveBeenCalled();
    }
  });
});
