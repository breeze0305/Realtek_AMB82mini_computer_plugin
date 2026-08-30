import { describe, expect, it } from "vitest";

import {
  converterApiUrl,
  fileMatchesExtensions,
  fileNameFromPath,
  fileNameMatchesExtensions,
  savedPhotoText,
} from "./converterUtils";

describe("converter utilities", () => {
  it("normalizes relative conversion API paths", () => {
    expect(converterApiUrl("https://example.com/api/v1", "/api/v1/conversions/42")).toBe(
      "https://example.com/api/v1/conversions/42",
    );
    expect(converterApiUrl("https://example.com/api/v1", "conversions/42")).toBe(
      "https://example.com/api/v1/conversions/42",
    );
  });

  it("matches file extensions without case sensitivity", () => {
    expect(fileMatchesExtensions(new File([], "MODEL.ONNX"), [".onnx"])).toBe(true);
    expect(fileMatchesExtensions(new File([], "MODEL.TXT"), [".onnx"])).toBe(false);
    expect(fileNameMatchesExtensions("模型.PT", [".pt"])).toBe(true);
  });

  it("extracts model file names from Windows and Unix paths", () => {
    expect(fileNameFromPath("C:\\models\\模型.PT")).toBe("模型.PT");
    expect(fileNameFromPath("/home/user/model.h5")).toBe("model.h5");
  });

  it("formats a saved capture number and falls back for unexpected paths", () => {
    expect(savedPhotoText("en_US", "C:\\captures\\image_00012.jpg", "fallback")).toContain("12");
    expect(savedPhotoText("en_US", "C:\\captures\\photo.jpg", "fallback")).toBe("fallback");
  });
});
