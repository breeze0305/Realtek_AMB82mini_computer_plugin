import { ExternalLink, Image as ImageIcon } from "lucide-react";
import { useId, useState } from "react";

import { getResourceGuide } from "../resourceGuides";
import type { ResourceCategory } from "../types";
import { CardGrid, type CardGridProps, type HomeCard } from "./CardGrid";

type ResourceLibraryViewProps = Omit<CardGridProps, "cards" | "selection"> & {
  cards: HomeCard[];
  category: ResourceCategory;
  onOpenUrl: (url: string) => void;
};

export function ResourceLibraryView({
  cards,
  category,
  downloadProgress,
  isDownloadKey,
  onOpenUrl,
  openActionMenu,
  running,
  setOpenActionMenu,
  t,
}: ResourceLibraryViewProps) {
  const [selectedCardId, setSelectedCardId] = useState(cards[0]?.id);
  const guideId = useId();
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? cards[0];
  const guide = selectedCard ? getResourceGuide(selectedCard.id, t) : null;
  const cardGrid = (
    <CardGrid
      cards={cards}
      downloadProgress={downloadProgress}
      isDownloadKey={isDownloadKey}
      openActionMenu={openActionMenu}
      running={running}
      setOpenActionMenu={setOpenActionMenu}
      selection={
        category === "weights" && selectedCard
          ? { cardId: selectedCard.id, onSelect: setSelectedCardId, panelId: guideId }
          : undefined
      }
      t={t}
    />
  );

  return (
    <section
      className={`contentSection resourceLibrarySection ${category === "weights" ? "resourceWeightsSection" : ""}`}
    >
      <h2>{category === "installers" ? t.installerFiles : t.modelResources}</h2>
      {category === "installers" && <p className="resourceCategoryHint">{t.installerFilesDetail}</p>}
      {category === "weights" ? (
        <>
          <p className="resourceGuideHint">{t.resourceGuideHint}</p>
          <div className="resourceWeightsLayout">
            <div className="resourceWeightsList">{cardGrid}</div>
            {selectedCard && guide && (
              <aside
                className="resourceGuide"
                id={guideId}
                aria-labelledby={`${guideId}-title`}
                key={selectedCard.id}
                tabIndex={0}
              >
                <div className="resourceGuideHeading">
                  <span className="resourceGuideEyebrow">{t.resourceGuideTitle}</span>
                  {guide.isPlaceholder && <span className="resourceGuideBadge">{t.resourceGuidePlaceholder}</span>}
                </div>
                <h3 id={`${guideId}-title`}>{selectedCard.title}</h3>
                <p className="resourceGuideSummary">{guide.summary}</p>
                <div className="resourceGuideFiles">
                  <span>{t.resourceGuideFiles}</span>
                  <code>{selectedCard.detail}</code>
                </div>
                {guide.sections.map((section, index) => (
                  <section className="resourceGuideStep" key={index}>
                    <h4>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {section.title}
                    </h4>
                    <p>{section.body}</p>
                    {section.codeExamples?.map((example) => (
                      <div className="resourceGuideCode" key={example.label}>
                        <span>{example.label}</span>
                        <pre>
                          <code>{example.code}</code>
                        </pre>
                      </div>
                    ))}
                    {section.image && (
                      <figure>
                        {section.image.src ? (
                          <img src={section.image.src} alt={section.image.alt} loading="lazy" decoding="async" />
                        ) : (
                          <div className="resourceGuideImagePlaceholder" role="img" aria-label={section.image.alt}>
                            <ImageIcon size={32} strokeWidth={1.5} aria-hidden="true" />
                            <span>{t.resourceImagePlaceholder}</span>
                          </div>
                        )}
                        {section.image.caption && <figcaption>{section.image.caption}</figcaption>}
                      </figure>
                    )}
                    {section.link && (
                      <button type="button" className="resourceGuideLink" onClick={() => onOpenUrl(section.link!.url)}>
                        <span>{section.link.label}</span>
                        <ExternalLink size={16} aria-hidden="true" />
                      </button>
                    )}
                  </section>
                ))}
              </aside>
            )}
          </div>
        </>
      ) : (
        cardGrid
      )}
    </section>
  );
}
