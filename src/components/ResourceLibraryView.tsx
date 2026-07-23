import type { ResourceCategory } from "../types";
import { CardGrid, type CardGridProps, type HomeCard } from "./CardGrid";

type ResourceLibraryViewProps = Omit<CardGridProps, "cards"> & {
  cards: HomeCard[];
  category: ResourceCategory;
};

export function ResourceLibraryView({
  cards,
  category,
  downloadProgress,
  isDownloadKey,
  openActionMenu,
  running,
  setOpenActionMenu,
  t,
}: ResourceLibraryViewProps) {
  return (
    <section className="contentSection resourceLibrarySection">
      <h2>{category === "installers" ? t.installerFiles : t.modelResources}</h2>
      <p className="resourceCategoryHint">
        {category === "installers" ? t.installerFilesDetail : t.modelResourcesDetail}
      </p>
      <CardGrid
        cards={cards}
        downloadProgress={downloadProgress}
        isDownloadKey={isDownloadKey}
        openActionMenu={openActionMenu}
        running={running}
        setOpenActionMenu={setOpenActionMenu}
        t={t}
      />
    </section>
  );
}
