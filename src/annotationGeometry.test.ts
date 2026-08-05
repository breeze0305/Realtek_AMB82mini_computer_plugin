import { describe, expect, it } from "vitest";

import { compensateForCssZoom, stagePointToImage } from "./annotationGeometry";

describe("annotation display geometry", () => {
  it.each([0.35, 1, 2, 6])("keeps normal and selected strokes constant at zoom %s", (zoom) => {
    expect(compensateForCssZoom(2, zoom) * zoom).toBeCloseTo(2);
    expect(compensateForCssZoom(4, zoom) * zoom).toBeCloseTo(4);
  });

  it("rejects invalid stroke compensation inputs", () => {
    expect(compensateForCssZoom(2, 0)).toBe(0);
    expect(compensateForCssZoom(-1, 2)).toBe(0);
  });

  it("maps stage points through zoom and pan without changing the image center", () => {
    const geometry = { left: 140, top: 80, width: 400, height: 200 };
    const imageSize = { width: 800, height: 400 };

    expect(stagePointToImage({ x: 340, y: 180 }, geometry, imageSize, 2, false)).toEqual({ x: 400, y: 200 });
    expect(stagePointToImage({ x: -60, y: -20 }, geometry, imageSize, 2, false)).toEqual({ x: 0, y: 0 });
    expect(stagePointToImage({ x: 740, y: 380 }, geometry, imageSize, 2, false)).toEqual({ x: 800, y: 400 });
  });

  it("hides an unclamped guide outside the image while drawing remains clamped", () => {
    const geometry = { left: 100, top: 50, width: 400, height: 200 };
    const imageSize = { width: 800, height: 400 };
    const outsidePoint = { x: 99.99, y: 251 };

    expect(stagePointToImage(outsidePoint, geometry, imageSize, 1, false)).toBeNull();
    expect(stagePointToImage(outsidePoint, geometry, imageSize, 1)).toEqual({ x: 0, y: 400 });
  });
});
