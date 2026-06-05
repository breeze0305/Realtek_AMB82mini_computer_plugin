import {
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  FileArchive,
  FolderOpen,
  PackageCheck,
  RefreshCcw,
  Tags,
} from "lucide-react";

import { installActionLabels } from "./i18n";
import type { HomeCard } from "./components/HomeView";
import type {
  ActionResult,
  Dashboard,
  DownloadResult,
  Language,
  RunningAction,
  VersionCheck,
} from "./types";

type RunAction = <T>(
  key: Exclude<RunningAction, null>,
  command: string,
  next: (result: T) => string,
) => Promise<void>;

type CreateHomeCardsParams = {
  dashboard: Dashboard | null;
  internetConnected: boolean;
  language: Language;
  onOpenAnnotator: () => void;
  onOpenCamera: () => void;
  onOpenConverter: () => void;
  onOpenVersionUpdate: () => void;
  onVersionChecked: (result: VersionCheck) => void;
  runAction: RunAction;
  t: Record<string, string>;
  versionCheck: VersionCheck | null;
};

export function createHomeCards({
  dashboard,
  internetConnected,
  language,
  onOpenAnnotator,
  onOpenCamera,
  onOpenConverter,
  onOpenVersionUpdate,
  onVersionChecked,
  runAction,
  t,
  versionCheck,
}: CreateHomeCardsParams): HomeCard[] {
  const hasVersionUpdate = versionCheck !== null && !versionCheck.is_latest && !versionCheck.is_beta;
  const fileCards = [
    {
      title: t.driver,
      detail: "CH341SER.EXE",
      command: "save_driver_as",
      key: "driver" as const,
      disabled: false,
    },
    {
      title: t.arduino,
      detail: "arduino-ide_2.3.8_Windows_64bit.exe",
      command: "download_arduino_ide_as",
      key: "arduino" as const,
      disabled: !internetConnected,
    },
    {
      title: t.vlc,
      detail: "vlc-3.0.23-win32.exe",
      command: "download_vlc_as",
      key: "vlc" as const,
      disabled: !internetConnected,
    },
    {
      title: t.hand,
      detail: "hand_code.txt / yolov7_tiny.nb",
      command: "save_hand_resources_as",
      key: "hand" as const,
      disabled: false,
    },
    {
      title: t.objectBoxTracking,
      detail: "code.txt / yolov7_tiny.nb",
      command: "save_object_detection_box_resources_as",
      key: "box" as const,
      disabled: false,
    },
    {
      title: t.japanModel,
      detail: "img_class_cnn.nb(box/money/mouse)",
      command: "save_image_model_japan_as",
      key: "japan" as const,
      disabled: false,
    },
    {
      title: t.taiwanModel,
      detail: "img_class_cnn.nb(box/money/mouse)",
      command: "save_image_model_taiwan_as",
      key: "taiwan" as const,
      disabled: false,
    },
    {
      title: t.singaporeModel,
      detail: "img_class_cnn.nb(box/money/mouse)",
      command: "save_image_model_singapore_as",
      key: "singapore" as const,
      disabled: false,
    },
  ];

  return [
    ...fileCards.map((card) => {
      const action = () =>
        void runAction<ActionResult | DownloadResult>(
          card.key,
          card.command,
          (result) => result.path ?? ("message" in result ? result.message : ""),
        );

      return {
        title: card.title,
        detail: card.detail,
        icon: PackageCheck,
        action,
        menuActions:
          card.key === "arduino" || card.key === "vlc"
            ? [
                {
                  label: installActionLabels[language].autoInstall,
                  action: () =>
                    void runAction<DownloadResult>(
                      card.key,
                      card.key === "arduino" ? "download_and_install_arduino_ide" : "download_and_install_vlc",
                      (result) => result.path,
                    ),
                },
              ]
            : undefined,
        label: t.save,
        disabled: card.disabled,
        key: card.key,
        actionIcon: Download,
      };
    }),
    {
      title: t.camera,
      detail: "",
      icon: Camera,
      action: onOpenCamera,
      label: t.open,
      disabled: false,
      key: null,
      actionIcon: CheckCircle2,
      menuActions: undefined,
    },
    {
      title: t.folder,
      detail: "",
      icon: FolderOpen,
      action: () => void runAction<ActionResult>("folder", "open_realtek_folder", (result) => result.path ?? result.message),
      label: t.open,
      disabled: false,
      key: "folder",
      actionIcon: CheckCircle2,
      menuActions: undefined,
    },
    {
      title: t.modelConverter,
      detail: "",
      icon: FileArchive,
      action: onOpenConverter,
      label: t.open,
      disabled: !internetConnected,
      key: null,
      actionIcon: CheckCircle2,
      menuActions: undefined,
    },
    {
      title: t.objectAnnotator,
      detail: "",
      icon: Tags,
      action: onOpenAnnotator,
      label: t.open,
      disabled: false,
      key: null,
      actionIcon: CheckCircle2,
      menuActions: undefined,
    },
    {
      title: t.version,
      detail: dashboard ? `v${dashboard.metadata.version}` : "",
      icon: RefreshCcw,
      action: hasVersionUpdate
        ? onOpenVersionUpdate
        : () =>
            void runAction<VersionCheck>("version", "check_version", (result) => {
              onVersionChecked(result);
              if (result.is_beta) return t.betaCurrent;
              if (result.is_latest) return `${t.latest}: ${result.local}`;
              return `${t.update}: ${result.remote}`;
            }),
      label: hasVersionUpdate ? t.updateButton : t.check,
      disabled: !internetConnected,
      key: "version",
      actionIcon: hasVersionUpdate ? ExternalLink : CheckCircle2,
      menuActions: undefined,
    },
  ];
}
