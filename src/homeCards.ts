import {
  BrainCircuit,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  FileArchive,
  FolderOpen,
  PackageCheck,
  PackageOpen,
  RefreshCcw,
  Tags,
} from "lucide-react";

import type { HomeCard } from "./components/CardGrid";
import { installActionLabels } from "./i18n";
import type {
  ActionResult,
  Dashboard,
  DownloadResult,
  Language,
  ResourceCategory,
  RunningAction,
  VersionCheck,
} from "./types";

type RunAction = <T>(key: Exclude<RunningAction, null>, command: string, next: (result: T) => string) => Promise<void>;

type ResourceCardDefinition = {
  category: ResourceCategory;
  command: string;
  detail: string;
  disabled: boolean;
  key: Exclude<RunningAction, null>;
  title: string;
};

type CreateHomeCardGroupsParams = {
  dashboard: Dashboard | null;
  internetConnected: boolean;
  language: Language;
  onOpenAnnotator: () => void;
  onOpenCamera: () => void;
  onOpenConverter: () => void;
  onOpenResourceCategory: (category: ResourceCategory) => void;
  onOpenVersionUpdate: () => void;
  onVersionChecked: (result: VersionCheck) => void;
  runAction: RunAction;
  t: Record<string, string>;
  versionCheck: VersionCheck | null;
};

export type HomeCardGroups = {
  installerCards: HomeCard[];
  mainCards: HomeCard[];
  resourceEntryCards: HomeCard[];
  weightCards: HomeCard[];
};

export function createHomeCardGroups({
  dashboard,
  internetConnected,
  language,
  onOpenAnnotator,
  onOpenCamera,
  onOpenConverter,
  onOpenResourceCategory,
  onOpenVersionUpdate,
  onVersionChecked,
  runAction,
  t,
  versionCheck,
}: CreateHomeCardGroupsParams): HomeCardGroups {
  const hasVersionUpdate = versionCheck !== null && !versionCheck.is_latest && !versionCheck.is_beta;
  const resourceDefinitions: ResourceCardDefinition[] = [
    {
      category: "installers",
      title: t.driver,
      detail: "CH341SER.EXE",
      command: "save_driver_as",
      key: "driver",
      disabled: false,
    },
    {
      category: "installers",
      title: t.arduino,
      detail: "arduino-ide_2.3.8_Windows_64bit.exe",
      command: "download_arduino_ide_as",
      key: "arduino",
      disabled: !internetConnected,
    },
    {
      category: "installers",
      title: t.vlc,
      detail: "vlc-3.0.23-win32.exe",
      command: "download_vlc_as",
      key: "vlc",
      disabled: !internetConnected,
    },
    {
      category: "weights",
      title: t.hand,
      detail: "hand_code.txt / yolov7_tiny.nb",
      command: "save_hand_resources_as",
      key: "hand",
      disabled: false,
    },
    {
      category: "weights",
      title: t.objectBoxTracking,
      detail: "code.txt / yolov7_tiny.nb",
      command: "save_object_detection_box_resources_as",
      key: "box",
      disabled: false,
    },
    {
      category: "weights",
      title: t.japanModel,
      detail: "img_class_cnn.nb(box/money/mouse)",
      command: "save_image_model_japan_as",
      key: "japan",
      disabled: false,
    },
    {
      category: "weights",
      title: t.taiwanModel,
      detail: "img_class_cnn.nb(box/money/mouse)",
      command: "save_image_model_taiwan_as",
      key: "taiwan",
      disabled: false,
    },
    {
      category: "weights",
      title: t.singaporeModel,
      detail: "img_class_cnn.nb(box/money/mouse)",
      command: "save_image_model_singapore_as",
      key: "singapore",
      disabled: false,
    },
  ];

  function createResourceCard(card: ResourceCardDefinition): HomeCard {
    const action = () =>
      void runAction<ActionResult | DownloadResult>(
        card.key,
        card.command,
        (result) => result.path ?? ("message" in result ? result.message : ""),
      );

    return {
      id: `resource-${card.key}`,
      title: card.title,
      detail: card.detail,
      icon: card.category === "installers" ? PackageCheck : BrainCircuit,
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
  }

  const installerCards = resourceDefinitions.filter((card) => card.category === "installers").map(createResourceCard);
  const weightCards = resourceDefinitions.filter((card) => card.category === "weights").map(createResourceCard);

  const resourceEntryCards: HomeCard[] = [
    {
      id: "resource-installers",
      title: t.installerFiles,
      detail: t.installerFilesSummary,
      icon: PackageOpen,
      action: () => onOpenResourceCategory("installers"),
      label: t.open,
      disabled: false,
      key: null,
      actionIcon: CheckCircle2,
    },
    {
      id: "resource-weights",
      title: t.modelResources,
      detail: t.modelResourcesSummary,
      icon: BrainCircuit,
      action: () => onOpenResourceCategory("weights"),
      label: t.open,
      disabled: false,
      key: null,
      actionIcon: CheckCircle2,
    },
  ];

  const mainCards: HomeCard[] = [
    {
      id: "camera",
      title: t.camera,
      detail: "",
      icon: Camera,
      action: onOpenCamera,
      label: t.open,
      disabled: false,
      key: null,
      actionIcon: CheckCircle2,
    },
    {
      id: "converter",
      title: t.modelConverter,
      detail: "",
      icon: FileArchive,
      action: onOpenConverter,
      label: t.open,
      disabled: !internetConnected,
      key: null,
      actionIcon: CheckCircle2,
    },
    {
      id: "annotator",
      title: t.objectAnnotator,
      detail: "",
      icon: Tags,
      action: onOpenAnnotator,
      label: t.open,
      disabled: false,
      key: null,
      actionIcon: CheckCircle2,
    },
    {
      id: "realtek-folder",
      title: t.folder,
      detail: "",
      icon: FolderOpen,
      action: () =>
        void runAction<ActionResult>("folder", "open_realtek_folder", (result) => result.path ?? result.message),
      label: t.open,
      disabled: false,
      key: "folder",
      actionIcon: CheckCircle2,
    },
    {
      id: "version",
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
    },
  ];

  return {
    installerCards,
    mainCards,
    resourceEntryCards,
    weightCards,
  };
}
