import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const version = readFileSync(join(root, "version.txt"), "utf8").trim();
const semverPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const checkOnly = process.argv.includes("--check");
const changedPaths = [];

if (!semverPattern.test(version)) {
  throw new Error(`version.txt must contain a semantic version, received: ${version}`);
}

function updateFile(relativePath, createNext) {
  const path = join(root, relativePath);
  const current = readFileSync(path, "utf8");
  const next = createNext(current);
  if (next === current) return;

  changedPaths.push(relativePath);
  if (!checkOnly) writeFileSync(path, next);
}

function updateJson(relativePath, update) {
  updateFile(relativePath, (current) => {
    const data = JSON.parse(current);
    const before = JSON.stringify(data);
    update(data);
    if (JSON.stringify(data) === before) return current;
    return `${JSON.stringify(data, null, 2)}\n`;
  });
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

updateFile("src-tauri/Cargo.toml", (content) => content.replace(/^(version\s*=\s*)"[^"]+"/m, `$1"${version}"`));

updateFile("src-tauri/Cargo.lock", (content) =>
  content.replace(
    /(\[\[package\]\]\r?\nname = "amb82-mini-computer-plugin"\r?\nversion = ")[^"]+("\r?\n)/,
    `$1${version}$2`,
  ),
);

updateFile("readme.md", (content) => content.replace(/目前版本：`[^`]+`/, `目前版本：\`${version}\``));

updateFile("dev_readme.md", (content) =>
  content
    .replace(/目前軟體版本：`[^`]+`/, `目前軟體版本：\`${version}\``)
    .replace(/Current frontend architecture \([^)]+\)/, `Current frontend architecture (${version})`)
    .replace(/目前版本是 `[^`]+`/, `目前版本是 \`${version}\``),
);

if (changedPaths.length === 0) {
  console.log(`Project version is already synchronized at ${version}`);
} else if (checkOnly) {
  console.error(`Project version ${version} is not synchronized: ${changedPaths.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Synchronized project version to ${version}: ${changedPaths.join(", ")}`);
}
