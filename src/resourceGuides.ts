import carWiringDiagram from "./assets/resource-guides/gesture/car-wiring-diagram.png";
import gestureClassList from "./assets/resource-guides/gesture/gesture-class-list.png";
import gestureModelSelection from "./assets/resource-guides/gesture/model-selection.png";
import gestureClassListTab from "./assets/resource-guides/gesture/object-class-list-tab.png";
import gestureOpenFolder from "./assets/resource-guides/gesture/open-amebapro2-folder.png";
import gestureWeightLocation from "./assets/resource-guides/gesture/weight-folder-location.png";

export type ResourceGuide = {
  isPlaceholder: boolean;
  summary: string;
  sections: Array<{
    title: string;
    body: string;
    codeExamples?: Array<{ label: string; code: string }>;
    image?: { src?: string; alt: string; caption?: string };
    link?: { label: string; url: string };
  }>;
};

type ResourceGuideDefinition = {
  isPlaceholder?: boolean;
  nameKey: string;
  summaryKey: string;
  sections: Array<{
    titleKey: string;
    bodyKey: string;
    codeExamples?: Array<{ labelKey: string; code: string }>;
    image?: { src?: string; altKey: string; captionKey?: string };
    link?: { labelKey: string; url: string };
  }>;
};

// Each resource owns its content keys, code examples, and bundled images.
// Set isPlaceholder to false when replacing a resource's placeholder guide.
const resourceGuides: Record<string, ResourceGuideDefinition> = {
  "resource-hand": {
    isPlaceholder: false,
    nameKey: "hand",
    summaryKey: "resourceHandGuideSummary",
    sections: [
      {
        titleKey: "resourceHandCodeTitle",
        bodyKey: "resourceHandCodeGuide",
        codeExamples: [
          {
            labelKey: "resourceGuideBeforeCode",
            code: "ObjDet.modelSelect(OBJECT_DETECTION, DEFAULT_YOLOV4TINY, NA_MODEL, NA_MODEL);",
          },
          {
            labelKey: "resourceGuideAfterCode",
            code: "ObjDet.modelSelect(OBJECT_DETECTION, CUSTOMIZED_YOLOV7TINY, NA_MODEL, NA_MODEL);",
          },
        ],
        image: {
          src: gestureModelSelection,
          altKey: "resourceHandModelImageAlt",
          captionKey: "resourceHandModelImageCaption",
        },
      },
      {
        titleKey: "resourceHandClassTabTitle",
        bodyKey: "resourceHandClassTabBody",
        image: {
          src: gestureClassListTab,
          altKey: "resourceHandTabImageAlt",
          captionKey: "resourceHandTabImageCaption",
        },
      },
      {
        titleKey: "resourceHandClassesTitle",
        bodyKey: "resourceHandClassesBody",
        image: {
          src: gestureClassList,
          altKey: "resourceHandClassesImageAlt",
          captionKey: "resourceHandClassesImageCaption",
        },
      },
      {
        titleKey: "resourceHandOpenFolderTitle",
        bodyKey: "resourceHandOpenFolderBody",
        image: {
          src: gestureOpenFolder,
          altKey: "resourceHandOpenFolderImageAlt",
          captionKey: "resourceHandOpenFolderImageCaption",
        },
      },
      {
        titleKey: "resourceHandWeightLocationTitle",
        bodyKey: "resourceHandWeightLocationBody",
        image: {
          src: gestureWeightLocation,
          altKey: "resourceHandWeightLocationImageAlt",
          captionKey: "resourceHandWeightLocationImageCaption",
        },
      },
      {
        titleKey: "resourceHandCarTitle",
        bodyKey: "resourceHandCarBody",
      },
      {
        titleKey: "resourceHandWiringTitle",
        bodyKey: "resourceHandWiringBody",
        image: {
          src: carWiringDiagram,
          altKey: "resourceHandWiringImageAlt",
          captionKey: "resourceHandWiringImageCaption",
        },
      },
      {
        titleKey: "resourceHandAssemblyTitle",
        bodyKey: "resourceHandAssemblyBody",
        link: {
          labelKey: "resourceHandAssemblyLink",
          url: "https://www.youtube.com/watch?v=UpYyOiEFA0k",
        },
      },
    ],
  },
  "resource-box": {
    nameKey: "objectBoxTracking",
    summaryKey: "resourceBoxGuideSummary",
    sections: [
      { titleKey: "resourceCodeGuideTitle", bodyKey: "resourceBoxCodeGuide" },
      {
        titleKey: "resourceWeightGuideTitle",
        bodyKey: "resourceBoxWeightGuide",
        image: { altKey: "resourceWeightImageAlt", captionKey: "resourceWeightImageCaption" },
      },
    ],
  },
  "resource-japan": {
    nameKey: "japanModel",
    summaryKey: "resourceJapanGuideSummary",
    sections: [
      { titleKey: "resourceExampleGuideTitle", bodyKey: "resourceJapanCodeGuide" },
      {
        titleKey: "resourceWeightGuideTitle",
        bodyKey: "resourceJapanWeightGuide",
        image: { altKey: "resourceWeightImageAlt", captionKey: "resourceWeightImageCaption" },
      },
    ],
  },
  "resource-taiwan": {
    nameKey: "taiwanModel",
    summaryKey: "resourceTaiwanGuideSummary",
    sections: [
      { titleKey: "resourceExampleGuideTitle", bodyKey: "resourceTaiwanCodeGuide" },
      {
        titleKey: "resourceWeightGuideTitle",
        bodyKey: "resourceTaiwanWeightGuide",
        image: { altKey: "resourceWeightImageAlt", captionKey: "resourceWeightImageCaption" },
      },
    ],
  },
  "resource-singapore": {
    nameKey: "singaporeModel",
    summaryKey: "resourceSingaporeGuideSummary",
    sections: [
      { titleKey: "resourceExampleGuideTitle", bodyKey: "resourceSingaporeCodeGuide" },
      {
        titleKey: "resourceWeightGuideTitle",
        bodyKey: "resourceSingaporeWeightGuide",
        image: { altKey: "resourceWeightImageAlt", captionKey: "resourceWeightImageCaption" },
      },
    ],
  },
};

export function getResourceGuide(resourceId: string, t: Record<string, string>): ResourceGuide {
  const placeholder = t.resourceGuidePlaceholder ?? "Guide content coming soon";
  const definition = Object.prototype.hasOwnProperty.call(resourceGuides, resourceId)
    ? resourceGuides[resourceId]
    : undefined;

  if (!definition) {
    return {
      isPlaceholder: true,
      summary: placeholder,
      sections: [{ title: t.resourceGuideTitle ?? "Usage guide", body: placeholder }],
    };
  }

  const name = t[definition.nameKey] ?? "";
  const translate = (key: string) => (t[key] ?? placeholder).split("{resource}").join(name);

  return {
    isPlaceholder: definition.isPlaceholder ?? true,
    summary: translate(definition.summaryKey),
    sections: definition.sections.map((section) => ({
      title: translate(section.titleKey),
      body: translate(section.bodyKey),
      ...(section.link ? { link: { label: translate(section.link.labelKey), url: section.link.url } } : {}),
      ...(section.codeExamples
        ? {
            codeExamples: section.codeExamples.map((example) => ({
              label: translate(example.labelKey),
              code: example.code,
            })),
          }
        : {}),
      ...(section.image
        ? {
            image: {
              src: section.image.src,
              alt: translate(section.image.altKey),
              caption: section.image.captionKey ? translate(section.image.captionKey) : undefined,
            },
          }
        : {}),
    })),
  };
}
