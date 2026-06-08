const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeElement {
  constructor(tagName, attrs = {}, text = "") {
    this.tagName = tagName.toUpperCase();
    this.attrs = attrs;
    this.textContent = text;
    this.innerText = text;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  contains(target) {
    if (this === target) return true;
    return this.children.some(child => child.contains?.(target));
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = node => {
      if (matches(node, selector)) results.push(node);
      (node.children || []).forEach(visit);
    };
    this.children.forEach(visit);
    return results;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (matches(node, selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
}

function matches(node, selector) {
  if (!node?.getAttribute) {
    return false;
  }
  if (selector.includes(",")) {
    return selector.split(",").some(part => matches(node, part.trim()));
  }
  if (selector === "div") {
    return node.tagName === "DIV";
  }
  if (selector === "span") {
    return node.tagName === "SPAN";
  }
  if (selector === "div, span") {
    return node.tagName === "DIV" || node.tagName === "SPAN";
  }
  if (selector === "[role=\"region\"][aria-label=\"Column body\"]") {
    return node.getAttribute("role") === "region"
      && node.getAttribute("aria-label") === "Column body";
  }
  if (selector === "[role=\"none\"]") {
    return node.getAttribute("role") === "none";
  }
  if (selector === "[role=\"textbox\"]") {
    return node.getAttribute("role") === "textbox";
  }
  if (selector === "[aria-hidden]") {
    return node.getAttribute("aria-hidden") !== null;
  }
  if (selector === "[aria-label=\"Like\"]") {
    return node.getAttribute("aria-label") === "Like";
  }
  if (selector === "[aria-label=\"Unlike\"]") {
    return node.getAttribute("aria-label") === "Unlike";
  }
  if (selector === "a[href^=\"/@\"]:not([href*=\"/post/\"])") {
    const href = node.getAttribute("href") || "";
    return node.tagName === "A" && href.startsWith("/@") && !href.includes("/post/");
  }
  if (selector === "a[href*=\"/post/\"]") {
    return node.tagName === "A" && (node.getAttribute("href") || "").includes("/post/");
  }
  if (selector === "a[href*=\"serp_type=tags\"]") {
    return node.tagName === "A" && (node.getAttribute("href") || "").includes("serp_type=tags");
  }
  if (selector === "a[href^=\"http\"]:not([href*=\"threads.com\"])") {
    const href = node.getAttribute("href") || "";
    return node.tagName === "A" && href.startsWith("http") && !href.includes("threads.com");
  }
  if (selector === "img[alt*=\"profile picture\"]") {
    return node.tagName === "IMG" && (node.getAttribute("alt") || "").includes("profile picture");
  }
  if (selector === "[data-pressable-container]") {
    return node.getAttribute("data-pressable-container") !== null;
  }
  if (selector === "span[dir=\"auto\"]") {
    return node.tagName === "SPAN" && node.getAttribute("dir") === "auto";
  }
  if (selector === "[dir=\"auto\"]") {
    return node.getAttribute("dir") === "auto";
  }
  if (selector === "a[href]") {
    return node.tagName === "A" && !!node.getAttribute("href");
  }
  if (selector === "time") {
    return node.tagName === "TIME";
  }
  const exactHref = selector.match(/^a\[href="([^"]+)"\]$/);
  if (exactHref) {
    return node.tagName === "A" && node.getAttribute("href") === exactHref[1];
  }
  return false;
}

function loadContentScript() {
  const document = new FakeElement("document");
  document.body = new FakeElement("body");
  document.head = new FakeElement("head");
  document.getElementById = () => ({ id: "tai-styles" });
  document.createTextNode = textContent => ({ nodeType: 3, textContent });
  document.createElement = tagName => new FakeElement(tagName);
  document.createRange = () => ({
    selectNodeContents() {},
    collapse() {},
  });
  document.addEventListener = () => {};

  const context = {
    console,
    window: {},
    location: {
      href: "https://www.threads.com/@bayecci/post/DZCHoOCjEq2",
      origin: "https://www.threads.com",
      pathname: "/@bayecci/post/DZCHoOCjEq2",
    },
    document,
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
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  vm.runInContext(source, context);
  return context;
}

function buildThreadsDom() {
  const root = new FakeElement("document");
  const container = root.appendChild(new FakeElement("div"));
  let node = container;
  for (let i = 0; i < 8; i += 1) {
    node = node.appendChild(new FakeElement("div"));
  }

  const authorLink = node.appendChild(new FakeElement("a", {
    href: "/@bayecci",
    role: "link",
  }, "bayecci"));
  authorLink.appendChild(new FakeElement("span", { dir: "auto" }, "bayecci"));

  const contentLink = container.appendChild(new FakeElement("a", {
    href: "/@bayecci/post/DZCHoOCjEq2",
    role: "link",
  }));
  contentLink.appendChild(new FakeElement("span", { dir: "auto" }, "Dear algorithm,"));
  contentLink.appendChild(new FakeElement("span", { dir: "auto" }, "Connect me with:"));
  contentLink.appendChild(new FakeElement("span", { dir: "auto" }, "AI startup founders"));
  contentLink.appendChild(new FakeElement("span", { dir: "auto" }, "AI startup founders"));
  contentLink.appendChild(new FakeElement("span", { dir: "auto" }, "1d"));
  contentLink.appendChild(new FakeElement("span", { dir: "auto" }, "19"));

  return root;
}

const context = loadContentScript();
const extracted = context.extractThreadsPostFromDom(buildThreadsDom(), context.location);

assert.equal(extracted.pageUrl, "https://www.threads.com/@bayecci/post/DZCHoOCjEq2");
assert.equal(extracted.mainPost.postId, "DZCHoOCjEq2");
assert.equal(extracted.mainPost.authorUsername, "@bayecci");
assert.equal(extracted.mainPost.authorName, "bayecci");
assert.equal(
  extracted.mainPost.fullText,
  "Dear algorithm,\nConnect me with:\nAI startup founders"
);
assert.deepEqual(Array.from(extracted.mainPost.textBlocks), [
  "Dear algorithm,",
  "Connect me with:",
  "AI startup founders",
]);

const pressableReply = new FakeElement("div", { "data-pressable-container": "true" });
const replyAuthorLink = pressableReply.appendChild(new FakeElement("a", {
  href: "/@replygal",
  role: "link",
}, "replygal"));
replyAuthorLink.appendChild(new FakeElement("span", { dir: "auto" }, "replygal"));
pressableReply.appendChild(new FakeElement("span", { dir: "auto" }, "Reply"));
pressableReply.appendChild(new FakeElement(
  "span",
  { dir: "auto" },
  "this launch detail is actually the useful part"
));
pressableReply.appendChild(new FakeElement("span", { dir: "auto" }, "2h"));
pressableReply.appendChild(new FakeElement("a", {
  href: "/@replygal/post/reply123",
  role: "link",
}, ""));

const extractedReply = context.extractPostFromPressableContainer(pressableReply, context.location);
assert.equal(extractedReply.postId, "reply123");
assert.equal(extractedReply.authorUsername, "@replygal");
assert.equal(extractedReply.authorName, "replygal");
assert.equal(extractedReply.fullText, "this launch detail is actually the useful part");

context.document.children = [];
context.document.body = new FakeElement("body");
context.document.appendChild(context.document.body);

const mainContainer = context.document.body.appendChild(new FakeElement("div", {
  "data-pressable-container": "true",
}));
const mainAuthor = mainContainer.appendChild(new FakeElement("a", { href: "/@mainuser" }, "mainuser"));
mainAuthor.appendChild(new FakeElement("span", { dir: "auto" }, "mainuser"));
mainContainer.appendChild(new FakeElement("span", { dir: "auto" }, "main post text should not be used"));

const targetReplyContainer = context.document.body.appendChild(new FakeElement("div", {
  "data-pressable-container": "true",
}));
const targetReplyAuthor = targetReplyContainer.appendChild(new FakeElement(
  "a",
  { href: "/@targetreply" },
  "targetreply"
));
targetReplyAuthor.appendChild(new FakeElement("span", { dir: "auto" }, "targetreply"));
targetReplyContainer.appendChild(new FakeElement(
  "span",
  { dir: "auto" },
  "reply text should drive the generated comment"
));
targetReplyContainer.appendChild(new FakeElement("a", { href: "/@targetreply/post/reply456" }, ""));

const replyComposer = context.document.body.appendChild(new FakeElement("div"));
const replyBox = replyComposer.appendChild(new FakeElement("div", {
  role: "textbox",
  contenteditable: "true",
}));

const replyContext = context.getActivePostContext(replyBox);
assert.equal(replyContext.authorUsername, "@targetreply");
assert.equal(replyContext.authorName, "targetreply");
assert.equal(replyContext.postId, "reply456");
assert.equal(replyContext.postText, "reply text should drive the generated comment");

const pressableFixtureBody = context.document.body;
const pressableFixtureChildren = Array.from(context.document.children);

function usePressableFixture() {
  context.document.body = pressableFixtureBody;
  context.document.children = Array.from(pressableFixtureChildren);
}

function appendDirText(parent, text, tagName = "span") {
  return parent.appendChild(new FakeElement(tagName, { dir: "auto" }, text));
}

function appendPostBlock(parent, {
  username,
  postId,
  timestamp,
  text,
  isAuthor = false,
  likeState = "Like",
  linkPreview = null,
  withComposer = false,
}) {
  const block = parent.appendChild(new FakeElement("div"));
  const header = block.appendChild(new FakeElement("div"));
  const profileLink = header.appendChild(new FakeElement("a", { href: `/@${username}` }, username));
  appendDirText(profileLink, username);
  const postLink = header.appendChild(new FakeElement("a", { href: `/@${username}/post/${postId}` }, timestamp));
  postLink.appendChild(new FakeElement("span", {}, timestamp));
  if (isAuthor) appendDirText(header, "Author");

  const content = block.appendChild(new FakeElement("div"));
  appendDirText(content, text);
  if (linkPreview) {
    const link = content.appendChild(new FakeElement("a", { href: linkPreview.url }));
    link.appendChild(new FakeElement("div", {}, linkPreview.title));
  }

  const actions = block.appendChild(new FakeElement("div"));
  actions.appendChild(new FakeElement("div", { "aria-label": likeState }, likeState));
  appendDirText(actions, "Reply");
  appendDirText(actions, "Repost");
  appendDirText(actions, "Share");

  if (withComposer) {
    const composer = block.appendChild(new FakeElement("div", { role: "none" }));
    composer.appendChild(new FakeElement("img", { alt: "charles.nguyenvn's profile picture" }));
    composer.appendChild(new FakeElement("div", {
      role: "textbox",
      contenteditable: "true",
      "aria-label": "Empty text field. Type to compose a new post.",
      "aria-placeholder": `Reply to ${username}...`,
    }));
  }

  return block;
}

context.location.href = "https://www.threads.com/@byanshsingh/post/focal4";
context.location.pathname = "/@byanshsingh/post/focal4";
context.document.children = [];
context.document.body = new FakeElement("body");
context.document.appendChild(context.document.body);
context.document.body.appendChild(new FakeElement("div", {
  role: "region",
  "aria-label": "Column body",
}));
const threadRegion = context.document.body.appendChild(new FakeElement("div", {
  role: "region",
  "aria-label": "Column body",
}));
appendPostBlock(threadRegion, {
  username: "charles.nguyenvn",
  postId: "root1",
  timestamp: "18h",
  text: "Looking to connect with solo founders building in public.",
});
appendPostBlock(threadRegion, {
  username: "byanshsingh",
  postId: "reply2",
  timestamp: "18h",
  text: "Currently building my personal brand around AI products.",
  likeState: "Unlike",
});
appendPostBlock(threadRegion, {
  username: "charles.nguyenvn",
  postId: "reply3",
  timestamp: "11h",
  text: "Currently working on 3 free tools for creators.",
  isAuthor: true,
  linkPreview: {
    url: "http://slidelabs.net/",
    title: "SlideLabs",
  },
});
appendPostBlock(threadRegion, {
  username: "byanshsingh",
  postId: "focal4",
  timestamp: "35m",
  text: "Rooting for you man 🤝",
  likeState: "Unlike",
  withComposer: true,
});

const realThreadContexts = context.extractThreadContext();
assert.equal(realThreadContexts.length, 4);
assert.equal(realThreadContexts[0].username, "charles.nguyenvn");
assert.equal(realThreadContexts[0].content, "Looking to connect with solo founders building in public.");
assert.equal(realThreadContexts[2].isAuthor, true);
assert.deepEqual(JSON.parse(JSON.stringify(realThreadContexts[2].linkPreviews)), [{
  url: "http://slidelabs.net/",
  title: "SlideLabs",
}]);
assert.equal(realThreadContexts[3].username, "byanshsingh");
assert.equal(realThreadContexts[3].isFocal, true);
assert.equal(realThreadContexts[3].hasComposer, true);
assert.equal(realThreadContexts[3].content, "Rooting for you man 🤝");

const realComposer = threadRegion.querySelector("[role=\"textbox\"]");
const activeRealContext = context.getActivePostContext(realComposer);
assert.equal(activeRealContext.authorUsername, "@byanshsingh");
assert.equal(activeRealContext.postText, "Rooting for you man 🤝");
assert.match(activeRealContext.threadContext, /THREAD CONTEXT:/);
assert.match(activeRealContext.threadContext, /\[FOCAL POST -- being replied to\] @byanshsingh \(35m\):/);
assert.match(activeRealContext.threadContext, /Looking to connect with solo founders/);
assert.match(activeRealContext.threadContext, /You are @charles\.nguyenvn, replying to @byanshsingh/);

const realThreadFixtureBody = context.document.body;
const realThreadFixtureChildren = Array.from(context.document.children);

function useRealThreadFixture() {
  context.document.body = realThreadFixtureBody;
  context.document.children = Array.from(realThreadFixtureChildren);
}

async function testGenerateUsesReplyBoxTargetContext() {
  usePressableFixture();
  let generatedRequest = null;
  context.chrome.runtime.sendMessage = async request => {
    generatedRequest = request;
    return { comment: "tiny generated reply" };
  };
  context.setTimeout = callback => {
    callback();
    return 1;
  };
  replyBox.isConnected = true;
  replyBox.focus = () => {};
  replyBox.click = () => {};
  replyBox.dispatchEvent = () => true;
  Object.defineProperty(replyBox, "innerHTML", {
    set() {
      this.children = [];
    },
  });

  const panel = {
    querySelectorAll: () => [],
  };
  const anchorBtn = {
    classList: {
      add() {},
      remove() {},
    },
  };

  await context.generateAndFill(
    { key: "friendly", label: "Friendly" },
    replyBox,
    panel,
    anchorBtn
  );

  assert.equal(generatedRequest.authorUsername, "@targetreply");
  assert.equal(generatedRequest.authorName, "targetreply");
  assert.equal(generatedRequest.postText, "reply text should drive the generated comment");
}

async function testGenerateSendsFullThreadContext() {
  useRealThreadFixture();
  let generatedRequest = null;
  context.chrome.runtime.sendMessage = async request => {
    generatedRequest = request;
    return { comment: "tiny generated reply" };
  };
  context.setTimeout = callback => {
    callback();
    return 1;
  };
  realComposer.isConnected = true;
  realComposer.focus = () => {};
  realComposer.click = () => {};
  realComposer.dispatchEvent = () => true;
  Object.defineProperty(realComposer, "innerHTML", {
    set() {
      this.children = [];
    },
  });

  const panel = {
    querySelectorAll: () => [],
  };
  const anchorBtn = {
    classList: {
      add() {},
      remove() {},
    },
  };

  await context.generateAndFill(
    { key: "friendly", label: "Friendly" },
    realComposer,
    panel,
    anchorBtn
  );

  assert.equal(generatedRequest.authorUsername, "@byanshsingh");
  assert.equal(generatedRequest.postText, "Rooting for you man 🤝");
  assert.match(generatedRequest.threadContext, /Currently building my personal brand/);
  assert.match(generatedRequest.threadContext, /\[FOCAL POST -- being replied to\]/);
  assert.equal(generatedRequest.targetUser, "byanshsingh");
  assert.equal(generatedRequest.loggedInUser, "charles.nguyenvn");
}

async function testGenerateShowsRefreshMessageWhenExtensionContextInvalidated() {
  usePressableFixture();
  context.chrome.runtime.sendMessage = async () => {
    throw new Error("Extension context invalidated.");
  };

  let panelError = null;
  const panel = {
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild(node) {
      panelError = node.textContent;
      return node;
    },
  };
  const anchorBtn = {
    classList: {
      add() {},
      remove() {},
    },
  };

  await context.generateAndFill(
    { key: "friendly", label: "Friendly" },
    replyBox,
    panel,
    anchorBtn
  );

  assert.equal(
    panelError,
    "Chrome reloaded the extension. Refresh this Threads tab and try again."
  );
}

async function runGenerateTests() {
  await testGenerateUsesReplyBoxTargetContext();
  await testGenerateSendsFullThreadContext();
  await testGenerateShowsRefreshMessageWhenExtensionContextInvalidated();
}

runGenerateTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
