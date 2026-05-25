import { ArrowLeft, ChevronDown, Languages, Settings as SettingsIcon } from "lucide-react";
import type { RefObject } from "react";

import { languageNames } from "../i18n";
import type { Dashboard, Language, View } from "../types";

type AppHeaderProps = {
  dashboard: Dashboard | null;
  isLanguageMenuOpen: boolean;
  language: Language;
  languageMenuRef: RefObject<HTMLDivElement>;
  onBackHome: () => void;
  onChangeLanguage: (language: Language) => void;
  onCloseLanguageMenu: () => void;
  onOpenSettings: () => void;
  onSettingsBack: () => void;
  onToggleLanguageMenu: () => void;
  t: Record<string, string>;
  view: View;
};

export function AppHeader({
  dashboard,
  isLanguageMenuOpen,
  language,
  languageMenuRef,
  onBackHome,
  onChangeLanguage,
  onCloseLanguageMenu,
  onOpenSettings,
  onSettingsBack,
  onToggleLanguageMenu,
  t,
  view,
}: AppHeaderProps) {
  return (
    <header className={`appHeader ${view === "settings" ? "settingsPageHeader" : ""}`}>
      {view === "settings" ? (
        <button type="button" className="settingsBackButton" onClick={onSettingsBack} title={t.back}>
          <ArrowLeft size={18} />
          <span>{t.settings}</span>
        </button>
      ) : (
        <>
          <button className="backButton" onClick={onBackHome} hidden={view === "home"} title={t.back}>
            <ArrowLeft size={18} />
            {t.back}
          </button>
          <h1>{t.appTitle}</h1>
          <div className="headerActions">
            <div
              className={`languageSelect ${isLanguageMenuOpen ? "isOpen" : ""}`}
              ref={languageMenuRef}
              onBlur={(event) => {
                const nextTarget = event.relatedTarget as Node | null;
                if (!nextTarget || !languageMenuRef.current?.contains(nextTarget)) {
                  onCloseLanguageMenu();
                }
              }}
            >
              <button
                type="button"
                className="languageSelectButton"
                aria-haspopup="listbox"
                aria-expanded={isLanguageMenuOpen}
                onClick={onToggleLanguageMenu}
              >
                <Languages size={17} />
                <span>{t.language}</span>
                <strong>{languageNames[language]}</strong>
                <ChevronDown size={17} />
              </button>
              {isLanguageMenuOpen && (
                <div className="languageMenu" role="listbox">
                  {dashboard?.metadata.supported_languages.map((item) => (
                    <button
                      type="button"
                      className={item === language ? "isSelected" : ""}
                      role="option"
                      aria-selected={item === language}
                      onClick={() => onChangeLanguage(item)}
                      key={item}
                    >
                      {languageNames[item]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="settingsIconButton"
              onClick={onOpenSettings}
              title={t.settings}
              aria-label={t.settings}
            >
              <SettingsIcon size={18} />
            </button>
          </div>
        </>
      )}
    </header>
  );
}
