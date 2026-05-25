import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const version = readFileSync(join(root, "version.txt"), "utf8").trim();
const semverPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

if (!semverPattern.test(version)) {
  throw new Error(`version.txt must contain a semantic version, received: ${version}`);
}

function updateJson(relativePath, update) {
  const path = join(root, relativePath);
  const data = JSON.parse(readFileSync(path, "utf8"));
  update(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function updateText(relativePath, update) {
  const path = join(root, relativePath);
  const current = readFileSync(path, "utf8");
  const next = update(current);
  writeFileSync(path, next);
}

updateJson("package.json", (data) => {
  data.version = version;
});

updateJson("package-lock.json", (data) => {
  data.version = version;
  if (data.packages?.[""]) {
    data.packages[""].version = version;
  }
});

updateJson("src-tauri/tauri.conf.json", (data) => {
  data.version = version;
});

updateText("src-tauri/Cargo.toml", (content) =>
  content.replace(/^(version\s*=\s*)"[^"]+"/m, `$1"${version}"`),
);

updateText("src-tauri/Cargo.lock", (content) =>
  content.replace(
    /(\[\[package\]\]\r?\nname = "amb82-mini-computer-plugin"\r?\nversion = ")[^"]+(")/,
    `$1${version}$2`,
  ),
);

updateText("readme.md", (content) =>
  content.replace(/目前版本：`[^`]+`/, `目前版本：\`${version}\``),
);

updateText("dev_readme.md", (content) =>
  content
    .replace(/目前軟體版本：`[^`]+`/, `目前軟體版本：\`${version}\``)
    .replace(/目前版本是 `[^`]+`/, `目前版本是 \`${version}\``),
);

console.log(`Synchronized project version to ${version}`);
