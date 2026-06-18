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
assert.equal(textbox.clearCount, 0);
assert.deepEqual(commands, [
  { command: "selectAll", value: undefined },
  { command: "delete", value: undefined },
  {
    command: "insertText",
    value: "wow, that's an awesome start!\n\nbuilding in public is such a brave way to grow.",
  },
]);
assert.deepEqual(textbox.appendedNodes, []);
assert.deepEqual(textbox.events, ["input", "change"]);
assert.equal(selection.removed, true);
assert.equal(selection.addedRange, range);
assert.equal(range.selectedNode, textbox);
assert.equal(range.collapsedToEnd, true);

commands.length = 0;
const lexicalDispatches = [];
const insertTextCommand = { type: "INSERT_TEXT_COMMAND" };
const lexicalTextbox = {
  focusCount: 0,
  clickCount: 0,
  clearCount: 0,
  events: [],
  appendedNodes: [],
  __lexicalEditor: {
    _commands: new Map([[insertTextCommand, []]]),
    dispatchCommand(command, payload) {
      lexicalDispatches.push({ type: command.type, payload });
      return true;
    },
  },
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

assert.equal(context.injectTextIntoReplyBox(
  lexicalTextbox,
  "this should update lexical state before enter posts"
), true);
assert.deepEqual(commands, [
  { command: "selectAll", value: undefined },
  { command: "delete", value: undefined },
  {
    command: "insertText",
    value: "this should update lexical state before enter posts",
  },
]);
assert.deepEqual(lexicalDispatches, []);
assert.equal(lexicalTextbox.clearCount, 0);
assert.deepEqual(lexicalTextbox.appendedNodes, []);
assert.deepEqual(lexicalTextbox.events, ["input", "change"]);

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

commands.length = 0;

assert.equal(context.injectTextIntoReplyBox(
  secondTextbox,
  "- That's a great point! Honestly this is useful - it compounds. Second idea? Third. Fourth."
), true);
assert.deepEqual(commands, [
  { command: "selectAll", value: undefined },
  { command: "delete", value: undefined },
  {
    command: "insertText",
    value: "this is useful, it compounds.\n\nsecond idea?\n\nthird.",
  },
]);
assert.deepEqual(secondTextbox.appendedNodes, []);

function makeButton(label) {
  return {
    label,
    clickCount: 0,
    disabled: false,
    getAttribute(name) {
      return name === "aria-label" ? this.label : null;
    },
    click() {
      this.clickCount += 1;
    },
  };
}

function makeComposerTextbox(attrs = {}) {
  const expandButton = makeButton("Expand composer");
  const submitButton = makeButton("Reply");
  const composer = {
    parentElement: null,
    querySelectorAll(selector) {
      return selector === "button" || selector === 'button, [role="button"]'
        ? [expandButton, submitButton]
        : [];
    },
  };
  const textbox = {
    focusCount: 0,
    clickCount: 0,
    clearCount: 0,
    events: [],
    appendedNodes: [],
    parentElement: composer,
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    closest() {
      return composer;
    },
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
  return { textbox, expandButton, submitButton };
}

(async () => {
  const genericComposer = makeComposerTextbox({ "aria-placeholder": "Search" });
  const replyComposer = makeComposerTextbox({
    "aria-placeholder": "Empty text field. Type to compose a new post.",
  });
  context.document.querySelectorAll = selector => (
    selector === '[role="textbox"][contenteditable="true"]'
      ? [genericComposer.textbox, replyComposer.textbox]
      : []
  );

  assert.equal(context.findReplyTextbox(), replyComposer.textbox);
  commands.length = 0;

  const result = await context.postReplyText("Thanks for sharing this");
  assert.equal(result.success, true);
  assert.equal(result.error, undefined);
  assert.equal(replyComposer.textbox.focusCount, 1);
  assert.equal(replyComposer.expandButton.clickCount, 1);
  assert.equal(replyComposer.submitButton.clickCount, 1);
  assert.deepEqual(commands, [
    { command: "selectAll", value: undefined },
    { command: "delete", value: undefined },
    { command: "insertText", value: "thanks for sharing this" },
  ]);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
