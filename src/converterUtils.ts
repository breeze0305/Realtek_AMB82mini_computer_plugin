import { translations } from "./i18n";
import type { Language, UvcdFormat } from "./types";

export function uvcdOptionLabel(option: { value: UvcdFormat; label: string }, defaultLabel: string) {
  return option.value === "MJPG" ? `${option.label} (${defaultLabel})` : option.label;
}

export function savedPhotoText(language: Language, path: string, fallback: string) {
  const match = path.match(/image_(\d+)\.jpg$/i);
  if (!match) return fallback;

  const count = Number.parseInt(match[1], 10);
  if (!Number.isFinite(count)) return fallback;

  return translations[language].savedPhoto.replace("{count}", String(count));
}

export function converterApiUrl(apiBase: string, path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/api/v1")
    ? path.slice("/api/v1".length)
    : path.startsWith("/")
      ? path
      : `/${path}`;
  return `${apiBase}${normalized}`;
}

export function fileMatchesExtensions(file: File, extensions: string[]) {
  const name = file.name.toLowerCase();
  return extensions.some((extension) => name.endsWith(extension.toLowerCase()));
}

export function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function readApiJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

