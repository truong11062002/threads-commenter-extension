#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(PROJECT_ROOT, "dist");
const NATURAL_SORT = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function normalizeArchivePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function addFile(files, filePath) {
  if (!filePath || typeof filePath !== "string") return;
  if (/^(https?:)?\/\//i.test(filePath) || filePath.startsWith("data:")) return;
  files.add(normalizeArchivePath(filePath));
}

function addHtmlAssets(files, htmlFile, rootDir = PROJECT_ROOT) {
  const htmlPath = path.join(rootDir, htmlFile);
  if (!fs.existsSync(htmlPath)) return;

  const html = fs.readFileSync(htmlPath, "utf8");
  const assetPattern = /\b(?:href|src)=["']([^"']+)["']/g;
  const htmlDir = path.posix.dirname(normalizeArchivePath(htmlFile));

  for (const match of html.matchAll(assetPattern)) {
    const asset = match[1];
    if (!asset || asset.startsWith("#") || /^(https?:)?\/\//i.test(asset) || asset.startsWith("data:")) {
      continue;
    }

    const withoutQuery = asset.split(/[?#]/, 1)[0];
    addFile(files, path.posix.normalize(path.posix.join(htmlDir, withoutQuery)));
  }
}

function collectRuntimeFiles(manifest, rootDir = PROJECT_ROOT) {
  const files = new Set(["manifest.json"]);

  addFile(files, manifest.background?.service_worker);
  addFile(files, manifest.action?.default_popup);

  for (const iconPath of Object.values(manifest.icons || {})) {
    addFile(files, iconPath);
  }

  for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
    addFile(files, iconPath);
  }

  for (const script of manifest.content_scripts || []) {
    for (const jsFile of script.js || []) addFile(files, jsFile);
    for (const cssFile of script.css || []) addFile(files, cssFile);
  }

  for (const file of Array.from(files)) {
    if (file.endsWith(".html")) addHtmlAssets(files, file, rootDir);
  }

  return Array.from(files).sort((a, b) => {
    if (a === "manifest.json") return -1;
    if (b === "manifest.json") return 1;
    return NATURAL_SORT.compare(a, b);
  });
}

function validateManifest(manifest) {
  if (manifest.manifest_version !== 3) {
    throw new Error("manifest_version must be 3 for a Manifest V3 Chrome Web Store submission.");
  }

  for (const field of ["name", "version", "description"]) {
    if (typeof manifest[field] !== "string" || manifest[field].trim() === "") {
      throw new Error(`manifest.${field} must be a non-empty string.`);
    }
  }

  if (!/^\d+(?:\.\d+){0,3}$/.test(manifest.version)) {
    throw new Error("manifest.version must use Chrome's numeric dotted version format.");
  }

  if (manifest.description.length > 132) {
    throw new Error("manifest.description must be 132 characters or fewer.");
  }

  if (!manifest.background?.service_worker) {
    throw new Error("manifest.background.service_worker is required.");
  }

  if (!manifest.action?.default_popup) {
    throw new Error("manifest.action.default_popup is required.");
  }

  if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
    throw new Error("At least one content script is required for Threads page functionality.");
  }
}

function isDisallowedEntry(entry) {
  return (
    entry === ".DS_Store" ||
    entry.includes("/.DS_Store") ||
    entry.startsWith("__MACOSX/") ||
    entry === ".git" ||
    entry.startsWith(".git/") ||
    entry.includes("/.git/") ||
    entry.endsWith(".crx") ||
    entry.startsWith("tests/") ||
    entry.startsWith("scripts/") ||
    entry === "README.md" ||
    entry === "package.json"
  );
}

function validateZipEntries(entries, expectedFiles, packagePath = "extension.zip") {
  if (path.extname(packagePath).toLowerCase() !== ".zip") {
    throw new Error("Chrome Web Store upload must be a ZIP file, not a CRX or another archive type.");
  }

  const files = entries
    .map(normalizeArchivePath)
    .filter(Boolean)
    .filter(entry => !entry.endsWith("/"));

  if (!files.includes("manifest.json")) {
    const nestedManifest = files.find(entry => entry.endsWith("/manifest.json"));
    if (nestedManifest) {
      throw new Error("manifest.json must be at the ZIP root, not inside a folder.");
    }
    throw new Error("manifest.json is missing from the ZIP root.");
  }

  for (const file of files) {
    if (isDisallowedEntry(file)) {
      throw new Error(`disallowed file in package: ${file}`);
    }
  }

  const actual = [...files].sort();
  const expected = [...expectedFiles].sort();
  const missing = expected.filter(file => !actual.includes(file));
  const extra = actual.filter(file => !expected.includes(file));

  if (missing.length > 0) {
    throw new Error(`package is missing required file(s): ${missing.join(", ")}`);
  }

  if (extra.length > 0) {
    throw new Error(`package contains unexpected file(s): ${extra.join(", ")}`);
  }
}

function readManifest(rootDir = PROJECT_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
}

function validateSourceTree(rootDir = PROJECT_ROOT) {
  const manifest = readManifest(rootDir);
  validateManifest(manifest);

  const runtimeFiles = collectRuntimeFiles(manifest, rootDir);
  const missing = runtimeFiles.filter(file => !fs.existsSync(path.join(rootDir, file)));

  if (missing.length > 0) {
    throw new Error(`source tree is missing required file(s): ${missing.join(", ")}`);
  }

  return { manifest, runtimeFiles };
}

function listZipEntries(zipPath) {
  const output = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  return output.split(/\r?\n/).filter(Boolean);
}

function verifyZip(zipPath, rootDir = PROJECT_ROOT) {
  const { runtimeFiles } = validateSourceTree(rootDir);
  validateZipEntries(listZipEntries(zipPath), runtimeFiles, zipPath);
  return runtimeFiles;
}

function buildStorePackage(rootDir = PROJECT_ROOT, distDir = DIST_DIR) {
  const { manifest, runtimeFiles } = validateSourceTree(rootDir);
  fs.mkdirSync(distDir, { recursive: true });

  const packageName = `threads-ai-commenter-v${manifest.version}.zip`;
  const packagePath = path.join(distDir, packageName);

  if (fs.existsSync(packagePath)) {
    fs.unlinkSync(packagePath);
  }

  execFileSync("zip", ["-X", "-q", packagePath, ...runtimeFiles], { cwd: rootDir });
  verifyZip(packagePath, rootDir);

  return { packagePath, runtimeFiles };
}

function main(argv) {
  const [command, target] = argv;

  if (command === "--check") {
    const { runtimeFiles } = validateSourceTree(PROJECT_ROOT);
    console.log(`Source tree OK. Runtime files: ${runtimeFiles.join(", ")}`);
    return;
  }

  if (command === "--verify") {
    if (!target) throw new Error("Usage: node scripts/build-store-package.js --verify dist/file.zip");
    const runtimeFiles = verifyZip(path.resolve(PROJECT_ROOT, target), PROJECT_ROOT);
    console.log(`Package OK. Runtime files: ${runtimeFiles.join(", ")}`);
    return;
  }

  if (command) {
    throw new Error(`Unknown option: ${command}`);
  }

  const { packagePath, runtimeFiles } = buildStorePackage(PROJECT_ROOT, DIST_DIR);
  console.log(`Created ${path.relative(PROJECT_ROOT, packagePath)}`);
  console.log(`Included ${runtimeFiles.length} runtime files.`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  collectRuntimeFiles,
  validateManifest,
  validateSourceTree,
  validateZipEntries,
  verifyZip,
  buildStorePackage,
};
