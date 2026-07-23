import type { KeyboardEvent } from "react";

import type { ResourceCategory } from "../types";
import { CardGrid, type CardGridProps, type HomeCard } from "./CardGrid";

type ResourceLibraryViewProps = Omit<CardGridProps, "cards"> & {
  activeCategory: ResourceCategory;
  installerCards: HomeCard[];
  onSelectCategory: (category: ResourceCategory) => void;
  weightCards: HomeCard[];
};

export function ResourceLibraryView({
  activeCategory,
  downloadProgress,
  installerCards,
  isDownloadKey,
  onSelectCategory,
  openActionMenu,
  running,
  setOpenActionMenu,
  t,
  weightCards,
}: ResourceLibraryViewProps) {
  const cards = activeCategory === "installers" ? installerCards : weightCards;
  const activeTabId = `resource-tab-${activeCategory}`;

  function selectCategory(category: ResourceCategory) {
    setOpenActionMenu(null);
    onSelectCategory(category);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let nextCategory: ResourceCategory | null = null;
    if (event.key === "ArrowLeft" || event.key === "Home") nextCategory = "installers";
    if (event.key === "ArrowRight" || event.key === "End") nextCategory = "weights";
    if (!nextCategory) return;

    event.preventDefault();
    selectCategory(nextCategory);
    document.getElementById(`resource-tab-${nextCategory}`)?.focus();
  }

  return (
    <section className="contentSection resourceLibrarySection">
      <h2>{t.resourceLibrary}</h2>
      <div className="resourceTabs" role="tablist" aria-label={t.resourceLibrary}>
        <button
          id="resource-tab-installers"
          type="button"
          className={activeCategory === "installers" ? "isActive" : ""}
          role="tab"
          aria-controls="resource-card-panel"
          aria-selected={activeCategory === "installers"}
          tabIndex={activeCategory === "installers" ? 0 : -1}
          onClick={() => selectCategory("installers")}
          onKeyDown={handleTabKeyDown}
        >
          {t.installerFiles}
          <span>{installerCards.length}</span>
        </button>
        <button
          id="resource-tab-weights"
          type="button"
          className={activeCategory === "weights" ? "isActive" : ""}
          role="tab"
          aria-controls="resource-card-panel"
          aria-selected={activeCategory === "weights"}
          tabIndex={activeCategory === "weights" ? 0 : -1}
          onClick={() => selectCategory("weights")}
          onKeyDown={handleTabKeyDown}
        >
          {t.modelResources}
          <span>{weightCards.length}</span>
        </button>
      </div>
      <p className="resourceCategoryHint">
        {activeCategory === "installers" ? t.installerFilesDetail : t.modelResourcesDetail}
      </p>
      <div id="resource-card-panel" role="tabpanel" aria-labelledby={activeTabId}>
        <CardGrid
          cards={cards}
          downloadProgress={downloadProgress}
          isDownloadKey={isDownloadKey}
          openActionMenu={openActionMenu}
          running={running}
          setOpenActionMenu={setOpenActionMenu}
          t={t}
        />
      </div>
    </section>
  );
}
