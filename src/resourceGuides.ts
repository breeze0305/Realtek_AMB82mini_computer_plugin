export type ResourceGuide = {
  summary: string;
  sections: Array<{
    title: string;
    body: string;
    image?: { src?: string; alt: string; caption?: string };
  }>;
};

type ResourceGuideDefinition = {
  nameKey: string;
  summaryKey: string;
  sections: Array<{
    titleKey: string;
    bodyKey: string;
    image?: { src?: string; altKey: string; captionKey?: string };
  }>;
};

// Each resource owns its content keys and optional images. Replace a placeholder
// in i18n.ts, then set that resource's image.src to a bundled image when ready.
const resourceGuides: Record<string, ResourceGuideDefinition> = {
  "resource-hand": {
    nameKey: "hand",
    summaryKey: "resourceHandGuideSummary",
    sections: [
      { titleKey: "resourceCodeGuideTitle", bodyKey: "resourceHandCodeGuide" },
      {
        titleKey: "resourceWeightGuideTitle",
        bodyKey: "resourceHandWeightGuide",
        image: { altKey: "resourceWeightImageAlt", captionKey: "resourceWeightImageCaption" },
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
      summary: placeholder,
      sections: [{ title: t.resourceGuideTitle ?? "Usage guide", body: placeholder }],
    };
  }

  const name = t[definition.nameKey] ?? "";
  const translate = (key: string) => (t[key] ?? placeholder).split("{resource}").join(name);

  return {
    summary: translate(definition.summaryKey),
    sections: definition.sections.map((section) => ({
      title: translate(section.titleKey),
      body: translate(section.bodyKey),
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
