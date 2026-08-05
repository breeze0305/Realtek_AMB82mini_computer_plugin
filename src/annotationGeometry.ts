export type AnnotationPoint = {
  x: number;
  y: number;
};

export type AnnotationDisplayGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type AnnotationImageSize = {
  width: number;
  height: number;
};

export function compensateForCssZoom(screenPixels: number, zoom: number) {
  if (!Number.isFinite(screenPixels) || screenPixels < 0 || !Number.isFinite(zoom) || zoom <= 0) {
    return 0;
  }
  return screenPixels / zoom;
}

export function stagePointToImage(
  point: AnnotationPoint,
  geometry: AnnotationDisplayGeometry | null,
  image: AnnotationImageSize,
  zoom: number,
  clampToImage = true,
): AnnotationPoint | null {
  if (
    !geometry ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(zoom) ||
    zoom <= 0 ||
    !Number.isFinite(geometry.left) ||
    !Number.isFinite(geometry.top) ||
    !Number.isFinite(geometry.width) ||
    !Number.isFinite(geometry.height) ||
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height) ||
    geometry.width <= 0 ||
    geometry.height <= 0 ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    return null;
  }

  const centerX = geometry.left + geometry.width / 2;
  const centerY = geometry.top + geometry.height / 2;
  const localX = (point.x - centerX) / zoom + geometry.width / 2;
  const localY = (point.y - centerY) / zoom + geometry.height / 2;
  const x = (localX / geometry.width) * image.width;
  const y = (localY / geometry.height) * image.height;

  if (!clampToImage && (x < 0 || x > image.width || y < 0 || y > image.height)) {
    return null;
  }

  return {
    x: clamp(x, 0, image.width),
    y: clamp(y, 0, image.height),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
