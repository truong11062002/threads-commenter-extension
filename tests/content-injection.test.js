const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadContentScript() {
  const commands = [];
  const textbox = {
    focusCount: 0,
    events: [],
    focus() {
      this.focusCount += 1;
    },
    dispatchEvent(event) {
      this.events.push(event.type);
      return true;
    },
  };

  const context = {
    console,
    window: {},
    location: { href: "https://www.threads.com/@user/post/abc" },
    document: {
      body: {},
      getElementById: () => ({ id: "tai-styles" }),
      querySelectorAll: () => [],
      execCommand(command, _showUI, value) {
        commands.push({ command, value });
        return ["selectAll", "delete", "insertText", "insertLineBreak", "insertHTML"].includes(command);
      },
      addEventListener: () => {},
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener: () => {},
        },
      },
    },
    MutationObserver: class {
      observe() {}
    },
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    InputEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
    DataTransfer: class {
      setData() {}
    },
    ClipboardEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  vm.runInContext(source, context);

  return { context, commands, textbox };
}

const { context, commands, textbox } = loadContentScript();

const ok = context.injectTextIntoReplyBox(
  textbox,
  "wow, that's an awesome start!\n\nbuilding in public is such a brave way to grow."
);

assert.equal(ok, true);
assert.equal(textbox.focusCount, 1);
assert.deepEqual(commands, [
  { command: "selectAll", value: null },
  { command: "delete", value: null },
  { command: "insertText", value: "wow, that's an awesome start!" },
  { command: "insertLineBreak", value: null },
  { command: "insertLineBreak", value: null },
  { command: "insertText", value: "building in public is such a brave way to grow." },
]);
assert.deepEqual(textbox.events, ["input"]);
