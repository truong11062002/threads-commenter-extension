const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "threads-ai-extension-"));
const destination = path.join(tempRoot, "load-unpacked-test");

const result = spawnSync("bash", [
  path.join(root, "scripts", "copy-extension.sh"),
  destination,
], {
  cwd: root,
  encoding: "utf8",
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /Copied extension files to:/);
assert.match(result.stdout, /Load unpacked:/);
assert.match(result.stdout, new RegExp(destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const expectedFiles = [
  "background.js",
  "content.js",
  "icons/icon128.png",
  "icons/icon16.png",
  "icons/icon48.png",
  "manifest.json",
  "popup/popup.css",
  "popup/popup.html",
  "popup/popup.js",
];

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listFiles(fullPath).map(file => path.join(entry.name, file));
      }
      return entry.name;
    })
    .sort();
}

assert.deepEqual(listFiles(destination), expectedFiles);
assert.equal(fs.existsSync(path.join(destination, "threads-ai-commenter")), false);
assert.equal(fs.existsSync(path.join(destination, "tests")), false);
assert.equal(fs.existsSync(path.join(destination, ".git")), false);

for (const file of expectedFiles) {
  assert.equal(
    fs.readFileSync(path.join(destination, file)).toString("binary"),
    fs.readFileSync(path.join(root, file)).toString("binary"),
    `${file} should match source`
  );
}
