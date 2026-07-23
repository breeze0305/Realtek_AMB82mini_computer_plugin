import { CardGrid, type CardGridProps, type HomeCard } from "./CardGrid";

type HomeViewProps = Omit<CardGridProps, "cards"> & {
  mainCards: HomeCard[];
};

export function HomeView({
  downloadProgress,
  isDownloadKey,
  mainCards,
  openActionMenu,
  running,
  setOpenActionMenu,
  t,
}: HomeViewProps) {
  return (
    <section className="contentSection">
      <h2>{t.mainMenu}</h2>
      <CardGrid
        cards={mainCards}
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
