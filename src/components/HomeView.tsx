import { CardGrid, type CardGridProps, type HomeCard } from "./CardGrid";

type HomeViewProps = Omit<CardGridProps, "cards"> & {
  mainCards: HomeCard[];
  resourceEntryCards: HomeCard[];
};

export function HomeView({
  downloadProgress,
  isDownloadKey,
  mainCards,
  openActionMenu,
  resourceEntryCards,
  running,
  setOpenActionMenu,
  t,
}: HomeViewProps) {
  return (
    <section className="contentSection homeMenuSection">
      <h2>{t.mainMenu}</h2>
      <div className="homeResourceEntries">
        <CardGrid
          cards={resourceEntryCards}
          downloadProgress={downloadProgress}
          isDownloadKey={isDownloadKey}
          openActionMenu={openActionMenu}
          running={running}
          setOpenActionMenu={setOpenActionMenu}
          t={t}
        />
      </div>
      <div className="homeSectionDivider" role="separator" aria-label={t.primaryFunctions}>
        <span>{t.primaryFunctions}</span>
      </div>
      <CardGrid
        cards={mainCards}
        downloadProgress={downloadProgress}
        isDownloadKey={isDownloadKey}
        openActionMenu={openActionMenu}
        running={running}
        setOpenActionMenu={setOpenActionMenu}
        startIndex={resourceEntryCards.length + 1}
        t={t}
      />
    </section>
  );
}
