const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadContentScript() {
  const commands = [];
  const appendedNodes = [];
  const injectedStyles = [];
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
      head: {
        appendChild(node) {
          injectedStyles.push(node);
          return node;
        },
      },
      getElementById: () => null,
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

  return { context, commands, injectedStyles, textbox, range, selection };
}

const { context, commands, injectedStyles, textbox, range, selection } = loadContentScript();

const tones = JSON.parse(vm.runInContext(
  "JSON.stringify(TONES.map(({ key, emoji, label }) => ({ key, emoji, label })))",
  context
));

assert.deepEqual(tones, [
  { key: "simple", emoji: "💬", label: "Simple" },
  { key: "friendly", emoji: "😊", label: "Friendly" },
  { key: "funny", emoji: "😂", label: "Funny" },
  { key: "insightful", emoji: "🧠", label: "Insightful" },
  { key: "curious", emoji: "❓", label: "Curious" },
  { key: "relatable", emoji: "😮‍💨", label: "Relatable" },
  { key: "contrarian", emoji: "🔥", label: "Contrarian" },
  { key: "supportive", emoji: "💪", label: "Supportive" },
  { key: "expert", emoji: "🎯", label: "Expert" },
  { key: "visionary", emoji: "🚀", label: "Visionary" },
  { key: "analytical", emoji: "📊", label: "Analytical" },
  { key: "meme", emoji: "🐸", label: "Meme" },
]);

assert.equal(injectedStyles.length, 1);
assert.match(injectedStyles[0].textContent, /\.tai-tone-grid\s*\{/);
assert.match(
  injectedStyles[0].textContent,
  /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/
);

const simpleIconMarkup = context.getToneIconMarkup({ emoji: "💬" });

assert.match(simpleIconMarkup, /💬/);
assert.doesNotMatch(simpleIconMarkup, /tai-tone-icon--simple/);
assert.doesNotMatch(simpleIconMarkup, /▫/);

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

const secondTextbox = {
  focusCount: 0,
  clickCount: 0,
  clearCount: 0,
  events: [],
  appendedNodes: [],
  set innerHTML(value) {
    assert.equal(value, "");
    this.clearCount += 1;
    this.appendedNodes.length = 0;
  },
  focus() {
    this.focusCount += 1;
  },
  click() {
    this.clickCount += 1;
  },
  appendChild(node) {
    this.appendedNodes.push(node);
    return node;
  },
  dispatchEvent(event) {
    this.events.push(event.type);
    return true;
  },
};

const formatted = context.formatHumanComment(
  "- That's a great point! Honestly this is useful - it compounds. Second idea? Third. Fourth."
);
assert.equal(formatted, "this is useful, it compounds.\n\nsecond idea?\n\nthird.");

assert.equal(context.injectTextIntoReplyBox(
  secondTextbox,
  "- That's a great point! Honestly this is useful - it compounds. Second idea? Third. Fourth."
), true);
assert.deepEqual(secondTextbox.appendedNodes, [
  { nodeType: 3, textContent: "this is useful, it compounds." },
  { nodeType: 1, tagName: "BR" },
  { nodeType: 3, textContent: "" },
  { nodeType: 1, tagName: "BR" },
  { nodeType: 3, textContent: "second idea?" },
  { nodeType: 1, tagName: "BR" },
  { nodeType: 3, textContent: "" },
  { nodeType: 1, tagName: "BR" },
  { nodeType: 3, textContent: "third." },
]);
