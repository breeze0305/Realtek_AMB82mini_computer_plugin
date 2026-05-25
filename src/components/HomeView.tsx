import { ChevronDown, type LucideIcon, RefreshCcw } from "lucide-react";
import type { CSSProperties, Dispatch, SetStateAction } from "react";

import type { DownloadKey, RunningAction } from "../types";

export type HomeCard = {
  action: () => void;
  actionIcon: LucideIcon;
  detail: string;
  disabled: boolean;
  icon: LucideIcon;
  key: Exclude<RunningAction, null> | null;
  label: string;
  menuActions?: Array<{
    action: () => void;
    label: string;
  }>;
  title: string;
};

type HomeViewProps = {
  downloadProgress: Partial<Record<DownloadKey, number>>;
  isDownloadKey: (key: RunningAction) => key is DownloadKey;
  mainCards: HomeCard[];
  openActionMenu: "arduino" | "vlc" | null;
  running: RunningAction;
  setOpenActionMenu: Dispatch<SetStateAction<"arduino" | "vlc" | null>>;
  t: Record<string, string>;
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
      <div className="menuGrid">
        {mainCards.map((card, index) => {
          const Icon = card.icon;
          const isRunning = card.key !== null && running === card.key;
          const ActionIcon = card.actionIcon;
          const progress = isDownloadKey(card.key) ? downloadProgress[card.key] : undefined;
          const progressStyle =
            progress === undefined
              ? undefined
              : ({
                  "--card-progress": `${Math.max(4, Math.round(progress * 100))}%`,
                } as CSSProperties);

          return (
            <article
              className={`menuCard ${progress === undefined ? "" : "isDownloading"} ${
                openActionMenu === card.key ? "hasOpenActionMenu" : ""
              }`}
              key={card.title}
              style={progressStyle}
            >
              <span className="cardIndex">{String(index + 1).padStart(2, "0")}</span>
              <div className="cardIcon">
                <Icon size={24} />
              </div>
              <div className="cardText">
                <h3>{card.title}</h3>
                {(card.disabled || card.detail) && <p>{card.disabled ? t.unavailableOffline : card.detail}</p>}
              </div>
              {card.menuActions ? (
                <div
                  className={`splitAction ${openActionMenu === card.key ? "isOpen" : ""}`}
                  onBlur={(event) => {
                    const nextTarget = event.relatedTarget as Node | null;
                    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                      setOpenActionMenu(null);
                    }
                  }}
                >
                  <button className="primaryBtn splitMain" onClick={card.action} disabled={card.disabled || isRunning}>
                    {isRunning ? <RefreshCcw className="spin" size={17} /> : <ActionIcon size={17} />}
                    {card.label}
                  </button>
                  <button
                    type="button"
                    className="primaryBtn splitToggle"
                    aria-haspopup="menu"
                    aria-expanded={openActionMenu === card.key}
                    aria-label={card.title}
                    onClick={() => {
                      if (card.key !== "arduino" && card.key !== "vlc") return;
                      const menuKey = card.key;
                      setOpenActionMenu((current) => (current === menuKey ? null : menuKey));
                    }}
                    disabled={card.disabled || isRunning}
                  >
                    <ChevronDown size={17} />
                  </button>
                  {openActionMenu === card.key && (
                    <div className="actionMenu" role="menu">
                      {card.menuActions.map((item) => (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenActionMenu(null);
                            item.action();
                          }}
                          key={item.label}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button className="primaryBtn" onClick={card.action} disabled={card.disabled || isRunning}>
                  {isRunning ? <RefreshCcw className="spin" size={17} /> : <ActionIcon size={17} />}
                  {card.label}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
