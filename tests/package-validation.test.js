const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  collectRuntimeFiles,
  validateManifest,
  validateZipEntries,
} = require("../scripts/build-store-package");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
const popupHtml = fs.readFileSync(path.join(__dirname, "..", "popup", "popup.html"), "utf8");
const popupCss = fs.readFileSync(path.join(__dirname, "..", "popup", "popup.css"), "utf8");
const storeListing = fs.readFileSync(path.join(__dirname, "..", "docs", "chrome-web-store-listing.md"), "utf8");

const runtimeFiles = collectRuntimeFiles(manifest);

assert.deepEqual(runtimeFiles, [
  "manifest.json",
  "background.js",
  "content.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "popup/popup.css",
  "popup/popup.html",
  "popup/popup.js",
]);

assert.match(popupCss, /--bg:\s*#f[0-9a-f]{5}/i);
assert.match(popupCss, /linear-gradient/);
assert.doesNotMatch(popupCss, /\/\* popup\.css — Dark editorial aesthetic \*\//);

assert.match(popupHtml, /id="settingsPanel"/);
assert.match(popupHtml, /id="sparkReplyTemplateBtn"/);
assert.match(popupHtml, /Specific Reply/);
assert.match(popupHtml, /Observation-first reply/);
assert.match(popupHtml, /id="valueDropTemplateBtn"/);
assert.match(popupHtml, /Value Drop/);
assert.match(popupHtml, /Add value \+ soft CTA/);
assert.match(popupHtml, /id="hotTakeTemplateBtn"/);
assert.match(popupHtml, /Hot Take/);
assert.match(popupHtml, /Contrarian \+ credibility/);
assert.doesNotMatch(popupHtml, /Optimize for replies/);
assert.doesNotMatch(popupHtml, /id="useViralStrategyToggle"/);
assert.doesNotMatch(popupHtml, /Use default/);
assert.doesNotMatch(popupHtml, /Pick a tone/);
assert.doesNotMatch(popupHtml, /Select a tone/);
assert.doesNotMatch(popupHtml, /Meme energy/);
assert.doesNotMatch(popupHtml, /class="tone-btn"/);
assert.doesNotMatch(popupHtml, /id="tonesGrid"/);
assert.doesNotMatch(popupHtml, /id="generateBtn"/);
assert.doesNotMatch(popupHtml, /id="resultArea"/);
assert.doesNotMatch(popupCss, /\.tone-btn\b/);
assert.doesNotMatch(popupCss, /\.generate-btn\b/);
assert.doesNotMatch(popupHtml, /id="loginGate"/);
assert.doesNotMatch(popupHtml, /id="loginPageBtn"/);
assert.doesNotMatch(popupHtml, /id="signOutBtn"/);
assert.doesNotMatch(popupHtml, /id="authCredits"/);
assert.doesNotMatch(popupHtml, /Sign in|Sign out|Log in|Log out/i);
assert.doesNotMatch(popupHtml, /id="authEmailInput"/);
assert.doesNotMatch(popupHtml, /id="authPasswordInput"/);
assert.doesNotMatch(popupHtml, /id="authSubmitBtn"/);
assert.doesNotMatch(popupHtml, /id="authModeToggle"/);
assert.doesNotMatch(popupHtml, /id="authGoogleBtn"/);
assert.ok(!manifest.permissions.includes("identity"));
assert.ok(manifest.host_permissions.includes("https://threads-commenter-extension.fastapicloud.dev/*"));
assert.equal(manifest.externally_connectable, undefined);
assert.ok(!manifest.host_permissions.includes("https://ep-still-dust-aoa3xfzz.neonauth.c-2.ap-southeast-1.aws.neon.tech/*"));
assert.ok(!manifest.host_permissions.includes("https://api.openai.com/*"));
assert.equal(
  manifest.description,
  "Generate on-brand Threads replies in your voice with AI tones and saved comment strategies."
);
assert.ok(manifest.description.length <= 132);

assert.match(storeListing, /Summary/);
assert.match(storeListing, /Generate on-brand Threads replies in your voice/);
assert.match(storeListing, /12 tone options/);
assert.match(storeListing, /Your voice/);
assert.match(storeListing, /Threads comment strategy/);
assert.match(storeListing, /Specific Reply/);
assert.match(storeListing, /Value Drop/);
assert.match(storeListing, /Hot Take/);
assert.doesNotMatch(storeListing, /5 high-engagement tones/i);
assert.doesNotMatch(storeListing, /your own OpenAI API key/i);
assert.doesNotMatch(storeListing, /5-15 words/i);

assert.doesNotThrow(() => validateManifest(manifest));

assert.throws(
  () => validateZipEntries(["threads-commenter-store/manifest.json", "threads-commenter-store/content.js"], runtimeFiles),
  /manifest\.json must be at the ZIP root/
);

assert.throws(
  () => validateZipEntries(["manifest.json", ".DS_Store", "content.js"], runtimeFiles),
  /disallowed file in package: \.DS_Store/
);

assert.doesNotThrow(() => validateZipEntries(runtimeFiles, runtimeFiles));

const tempPackage = path.join(os.tmpdir(), "threads-ai-commenter.crx");
assert.throws(
  () => validateZipEntries(runtimeFiles, runtimeFiles, tempPackage),
  /Chrome Web Store upload must be a ZIP file/
);
