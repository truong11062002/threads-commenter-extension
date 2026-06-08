const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...values) {
    values.forEach(value => this.values.add(value));
  }

  remove(...values) {
    values.forEach(value => this.values.delete(value));
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName, text = "") {
    this.tagName = tagName.toUpperCase();
    this.textContent = text;
    this.innerText = text;
    this.innerHTML = "";
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.title = "";
    this.listeners = {};
    this.classList = new FakeClassList();
  }

  appendChild(child) {
    this.children.push(child);
    if (child.id) fakeDocument.elementsById[child.id] = child;
    return child;
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  dispatchEvent(event) {
    this.dispatchedEvents ||= [];
    this.dispatchedEvents.push(event);
    return true;
  }

  focus() {
    this.focused = true;
  }

  querySelectorAll(selector) {
    if (selector === "p") return this.children.filter(child => child.tagName === "P");
    return [];
  }

  querySelector() {
    return null;
  }
}

const commandCalls = [];
const timeoutCallbacks = [];
const fakeDocument = {
  elementsById: {},
  body: new FakeElement("body"),
  head: new FakeElement("head"),
  documentElement: { clientWidth: 390 },
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  createTextNode(textContent) {
    return { nodeType: 3, textContent };
  },
  createRange() {
    return {
      selectNodeContents() {},
      collapse() {},
    };
  },
  getElementById(id) {
    return this.elementsById[id] || null;
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
  addEventListener() {},
  execCommand(command) {
    commandCalls.push(command);
    return command === "insertParagraph";
  },
};

function loadContentScript() {
  const context = {
    console,
    window: {
      scrollX: 0,
      scrollY: 0,
      innerWidth: 390,
      getSelection: () => ({
        removeAllRanges() {},
        addRange() {},
      }),
    },
    location: {
      href: "https://www.threads.com/@user/post/abc",
      pathname: "/@user/post/abc",
      origin: "https://www.threads.com",
    },
    document: fakeDocument,
    chrome: {
      runtime: {
        onMessage: {
          addListener() {},
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
    KeyboardEvent: class {
      constructor(type, options = {}) {
        this.type = type;
        Object.assign(this, options);
      }
    },
    setTimeout: callback => {
      timeoutCallbacks.push(callback);
      return timeoutCallbacks.length;
    },
    clearTimeout() {},
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  vm.runInContext(source, context);
  return context;
}

const context = loadContentScript();

assert.equal(context.countWords, undefined);
assert.equal(context.validateWordCount, undefined);

const editor = new FakeElement("div");
editor.children = [
  new FakeElement("p", "one two three"),
  new FakeElement("p", "one two three four five six seven"),
  new FakeElement("p", "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen"),
];

context.attachCommentFormatter(editor);
assert.equal(fakeDocument.getElementById("threads-word-counter"), null);
assert.equal(editor.children[0].classList.contains("tai-line-too-short"), false);
assert.equal(editor.children[1].classList.contains("tai-line-valid"), false);
assert.equal(editor.children[2].classList.contains("tai-line-too-long"), false);

const event = {
  key: "Enter",
  shiftKey: true,
  preventDefaultCalled: false,
  stopImmediatePropagationCalled: false,
  preventDefault() {
    this.preventDefaultCalled = true;
  },
  stopImmediatePropagation() {
    this.stopImmediatePropagationCalled = true;
  },
};
editor.listeners.keydown(event);
assert.equal(event.preventDefaultCalled, true);
assert.equal(event.stopImmediatePropagationCalled, true);
assert.deepEqual(commandCalls, ["insertParagraph"]);
assert.equal(fakeDocument.getElementById("threads-word-counter"), null);

editor.innerText = "this sentence is ready. ";
context.maybeShowSentenceEndHint(editor);
const hint = fakeDocument.getElementById("threads-format-hint");
assert.equal(hint.style.display, "block");
assert.match(hint.textContent, /Shift\+Enter/);
