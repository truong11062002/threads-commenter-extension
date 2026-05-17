const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadContentScript() {
  const commands = [];
  const appendedNodes = [];
  const range = {
    selectedNode: null,
    collapsedToEnd: null,
    selectNodeContents(node) {
      this.selectedNode = node;
    },
    collapse(toStart) {
      this.collapsedToEnd = toStart === false;
    },
  };
  const selection = {
    removed: false,
    addedRange: null,
    removeAllRanges() {
      this.removed = true;
    },
    addRange(nextRange) {
      this.addedRange = nextRange;
    },
  };
  const textbox = {
    focusCount: 0,
    clickCount: 0,
    clearCount: 0,
    events: [],
    appendedNodes,
    set innerHTML(value) {
      assert.equal(value, "");
      this.clearCount += 1;
      appendedNodes.length = 0;
    },
    focus() {
      this.focusCount += 1;
    },
    click() {
      this.clickCount += 1;
    },
    appendChild(node) {
      appendedNodes.push(node);
      return node;
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
      createTextNode: textContent => ({ nodeType: 3, textContent }),
      createElement: tagName => ({ nodeType: 1, tagName: tagName.toUpperCase() }),
      createRange: () => range,
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
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = !!options.bubbles;
      }
    },
    InputEvent: class {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = !!options.bubbles;
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

  context.window.getSelection = () => selection;

  return { context, commands, textbox, range, selection };
}

const { context, commands, textbox, range, selection } = loadContentScript();

const ok = context.injectTextIntoReplyBox(
  textbox,
  "wow, that's an awesome start!\n\nbuilding in public is such a brave way to grow."
);

assert.equal(ok, true);
assert.equal(textbox.focusCount, 1);
assert.equal(textbox.clickCount, 1);
assert.equal(textbox.clearCount, 1);
assert.deepEqual(commands, []);
assert.deepEqual(textbox.appendedNodes, [
  { nodeType: 3, textContent: "wow, that's an awesome start!" },
  { nodeType: 1, tagName: "BR" },
  { nodeType: 3, textContent: "" },
  { nodeType: 1, tagName: "BR" },
  { nodeType: 3, textContent: "building in public is such a brave way to grow." },
]);
assert.deepEqual(textbox.events, ["input", "change"]);
assert.equal(selection.removed, true);
assert.equal(selection.addedRange, range);
assert.equal(range.selectedNode, textbox);
assert.equal(range.collapsedToEnd, true);
