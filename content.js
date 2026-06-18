// content.js — Injected into threads.com
// Injects "✦ AI" button into the reply bar on Threads post pages

// ─── Config ───────────────────────────────────────────────────────────────────

const TONES = [
  { key: "simple", emoji: "💬", label: "Simple", desc: "Clear reply" },
  { key: "friendly", emoji: "😊", label: "Friendly", desc: "Warm reply" },
  { key: "funny", emoji: "😂", label: "Funny", desc: "Quick laugh" },
  { key: "insightful", emoji: "🧠", label: "Insightful", desc: "Smart take" },
  { key: "curious", emoji: "❓", label: "Curious", desc: "Ask deeper" },
  { key: "relatable", emoji: "😮‍💨", label: "Relatable", desc: "Shared feeling" },
  { key: "contrarian", emoji: "🔥", label: "Contrarian", desc: "Hot take" },
  { key: "supportive", emoji: "💪", label: "Supportive", desc: "Encourage" },
  { key: "expert", emoji: "🎯", label: "Expert", desc: "Authority" },
  { key: "visionary", emoji: "🚀", label: "Visionary", desc: "Big picture" },
  { key: "analytical", emoji: "📊", label: "Analytical", desc: "Data angle" },
  { key: "meme", emoji: "🐸", label: "Meme", desc: "Internet energy" },
];

const EDITOR_SELECTOR = '[data-lexical-editor="true"]';
const REPLY_BOX_SELECTOR = '[role="textbox"][contenteditable="true"]';
const PRESSABLE_CONTAINER_SELECTOR = "[data-pressable-container]";
const THREAD_CONTEXT_MAX_CHARS = 3000;
const formatterHintTimers = new WeakMap();
const REPLY_COMPOSER_PLACEHOLDER = "Empty text field. Type to compose a new post.";

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

function getThreadRegion() {
  const regions = document.querySelectorAll('[role="region"][aria-label="Column body"]');
  return regions[1] || regions[0];
}

function extractPostId(url) {
  return url?.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

function toThreadsPath(href, currentLocation = location) {
  if (!href || typeof href !== "string") return "";
  try {
    return new URL(href, currentLocation?.origin || "https://www.threads.com").pathname;
  } catch {
    return href;
  }
}

function extractPostPathParts(pathname) {
  const postId = pathname?.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
  const authorUsername = pathname?.match(/^\/(@[\w.]+)\//)?.[1] ?? null;
  return { postId, authorUsername };
}

function cleanDomText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueTexts(texts) {
  return texts.filter((text, index, arr) => arr.indexOf(text) === index);
}

function normalizeAuthorUsername(value) {
  const cleanValue = cleanDomText(value);
  if (!cleanValue) return null;
  return cleanValue.startsWith("@") ? cleanValue : `@${cleanValue}`;
}

function extractUsernameFromHref(href, currentLocation = location) {
  const path = toThreadsPath(href, currentLocation);
  const match = path.match(/^\/@([\w.]+)/);
  return match ? normalizeAuthorUsername(match[1]) : null;
}

function findAuthorLink(links, currentLocation = location) {
  return links.find(link => {
    const path = toThreadsPath(link.getAttribute?.("href") || link.href || "", currentLocation);
    return /^\/@[\w.]+\/?$/.test(path);
  }) || links.find(link => extractUsernameFromHref(
    link.getAttribute?.("href") || link.href || "",
    currentLocation
  ));
}

function isUiNoiseText(text, noiseTexts = new Set()) {
  if (!text || noiseTexts.has(text)) return true;
  return [
    /^reply$/i,
    /^like$/i,
    /^repost$/i,
    /^share$/i,
    /^send$/i,
    /^view activity$/i,
    /^top$/i,
    /^\d+$/,
    /^\d+[smhdwy]$/i,
  ].some(pattern => pattern.test(text));
}

function findMainPostContainer(authorLink) {
  let container = authorLink;
  for (let i = 0; i < 8; i += 1) {
    container = container?.parentElement;
    if (!container) break;
  }

  while (
    container?.parentElement &&
    Array.from(container.querySelectorAll?.('span[dir="auto"]') ?? []).length <= 1
  ) {
    container = container.parentElement;
  }

  return container;
}

function buildThreadsPostUrl(currentLocation, authorUsername, postId) {
  if (!authorUsername || !postId) return null;
  const origin = currentLocation?.origin || "https://www.threads.com";
  return `${origin}/${authorUsername}/post/${postId}`;
}

function extractPostFromPressableContainer(container, currentLocation = location) {
  if (!container) return null;

  const allLinks = Array.from(container.querySelectorAll?.("a[href]") ?? []);
  const authorLink = findAuthorLink(allLinks, currentLocation);
  if (!authorLink) return null;

  const authorUsername = extractUsernameFromHref(
    authorLink.getAttribute?.("href") || authorLink.href || "",
    currentLocation
  );
  if (!authorUsername) return null;

  const authorName = cleanDomText(authorLink.innerText || authorLink.textContent)
    || authorUsername.replace(/^@/, "");
  const postLink = allLinks.find(link => toThreadsPath(
    link.getAttribute?.("href") || link.href || "",
    currentLocation
  ).includes("/post/"));
  const postPath = toThreadsPath(postLink?.getAttribute?.("href") || postLink?.href || "", currentLocation);
  const postId = extractPostId(postPath);
  const postUrl = postId ? buildThreadsPostUrl(currentLocation, authorUsername, postId) : null;
  const timeEl = container.querySelector?.("time") ?? null;
  const timeText = cleanDomText(timeEl?.textContent);
  const noiseTexts = new Set([
    authorName,
    authorUsername,
    authorUsername.replace(/^@/, ""),
    timeText,
    "View activityView activity",
  ].filter(Boolean));
  const textBlocks = uniqueTexts(Array.from(container.querySelectorAll?.('span[dir="auto"]') ?? [])
    .map(el => cleanDomText(el.innerText || el.textContent))
    .filter(text => !isUiNoiseText(text, noiseTexts)));

  return {
    postId,
    postUrl,
    username: authorName,
    authorUsername,
    authorName,
    datetime: timeEl?.getAttribute?.("datetime") ?? null,
    fullText: textBlocks.join("\n"),
    textBlocks,
  };
}

function getThreadPostBlockElements(root) {
  const candidates = Array.from(root?.querySelectorAll?.("div") ?? [])
    .filter(div => findThreadProfileLink(div) && findThreadPostLink(div) && findThreadLikeButton(div));

  const minimalCandidates = candidates.filter(candidate => {
    const candidatePostId = getThreadBlockPostId(candidate);
    return !candidates.some(other => (
      other !== candidate
      && candidate.contains?.(other)
      && getThreadBlockPostId(other) === candidatePostId
    ));
  });

  const seen = new Set();
  return minimalCandidates.filter(block => {
    const postId = getThreadBlockPostId(block);
    if (!postId || seen.has(postId)) return false;
    seen.add(postId);
    return true;
  });
}

function findThreadProfileLink(block) {
  return block?.querySelector?.('a[href^="/@"]:not([href*="/post/"])') ?? null;
}

function findThreadPostLink(block) {
  return block?.querySelector?.('a[href*="/post/"]') ?? null;
}

function findThreadLikeButton(block) {
  return block?.querySelector?.('[aria-label="Like"], [aria-label="Unlike"]') ?? null;
}

function getThreadBlockPostId(block) {
  const postPath = findThreadPostLink(block)?.getAttribute?.("href") || "";
  return extractPostId(postPath);
}

function normalizeContextUsername(value) {
  return normalizeAuthorUsername(value)?.replace(/^@/, "") || "";
}

function parseThreadContextBlock(block, currentLocation = location, replyBox = null) {
  if (!block) return null;

  const profileLink = findThreadProfileLink(block);
  const username = normalizeContextUsername(
    profileLink?.getAttribute?.("href")?.replace(/^\/@/, "")
  );
  const authorUsername = username ? `@${username}` : "";
  const postAnchor = findThreadPostLink(block);
  const postPath = toThreadsPath(postAnchor?.getAttribute?.("href") || postAnchor?.href || "", currentLocation);
  const postId = extractPostId(postPath) || "";
  const timestampEl = block.querySelector?.("time")
    || postAnchor?.querySelector?.("span, [aria-hidden]")
    || postAnchor;
  const timestamp = cleanDomText(timestampEl?.textContent);
  const hasComposer = !!block.querySelector?.('[role="none"]') || !!block.contains?.(replyBox);
  const allTexts = Array.from(block.querySelectorAll?.('[dir="auto"], span, div') ?? [])
    .map(el => cleanDomText(el.textContent))
    .filter(Boolean);
  const isAuthor = allTexts.includes("Author");
  const hashtags = Array.from(block.querySelectorAll?.('a[href*="serp_type=tags"]') ?? [])
    .map(a => cleanDomText(a.textContent).replace(/^#/, ""))
    .filter(Boolean);
  const linkPreviews = Array.from(block.querySelectorAll?.('a[href^="http"]:not([href*="threads.com"])') ?? [])
    .map(a => ({
      url: a.getAttribute?.("href") || a.href || "",
      title: cleanDomText(a.querySelector?.("div, span")?.textContent || a.textContent),
    }))
    .filter(preview => preview.url && preview.title);
  const previewTitles = new Set(linkPreviews.map(preview => preview.title));
  const noiseTexts = new Set([
    username,
    authorUsername,
    timestamp,
    "Like",
    "Unlike",
    "Reply",
    "Replied",
    "Repost",
    "Share",
    "More",
    "Author",
    "No replies yet",
    "View activity",
    "Attach media",
    "Add a GIF",
    "Expand composer",
  ].filter(Boolean));
  const contentTexts = Array.from(block.querySelectorAll?.('[dir="auto"]') ?? [])
    .map(el => cleanDomText(el.textContent))
    .filter(text => (
      text.length > 1
      && !noiseTexts.has(text)
      && !previewTitles.has(text)
      && !/^\d+$/.test(text)
    ));
  const dedupedContent = contentTexts.filter((text, index) => index === 0 || text !== contentTexts[index - 1]);
  const isFocal = (!!postId && currentLocation?.pathname?.includes(postId)) || !!block.contains?.(replyBox);

  return {
    username,
    authorUsername,
    postId,
    postPath,
    timestamp,
    isAuthor,
    hashtags,
    content: dedupedContent.join("\n"),
    linkPreviews,
    isFocal,
    hasComposer,
  };
}

function extractThreadContext(root = document, currentLocation = location, replyBox = null) {
  const columnBodies = Array.from(root.querySelectorAll?.('[role="region"][aria-label="Column body"]') ?? []);
  const threadCol = columnBodies[1] || columnBodies[0] || getThreadRegion();
  if (!threadCol) return [];

  const contexts = getThreadPostBlockElements(threadCol)
    .map(block => parseThreadContextBlock(block, currentLocation, replyBox))
    .filter(context => context.username && context.content);

  if (contexts.some(context => context.isFocal) || !replyBox) return contexts;

  const composerBlock = contexts.find(context => context.hasComposer);
  if (!composerBlock) return contexts;
  return contexts.map(context => ({
    ...context,
    isFocal: context.postId === composerBlock.postId,
  }));
}

function buildThreadContextPrompt(contexts, loggedInUser, targetUser) {
  if (!Array.isArray(contexts) || contexts.length === 0) return "";

  const lines = ["THREAD CONTEXT:", "---"];

  contexts.forEach((context, index) => {
    const badgeText = context.isAuthor ? " [Thread Author]" : "";
    const hashtagText = context.hashtags?.length
      ? ` ${context.hashtags.map(tag => `#${tag.replace(/^#/, "")}`).join(" ")}`
      : "";
    const label = context.isFocal
      ? "[FOCAL POST -- being replied to]"
      : `[Post ${index + 1}]`;

    lines.push(`${label} @${context.username}${badgeText} (${context.timestamp || "unknown time"})${hashtagText}:`);
    lines.push(`"${context.content}"`);

    (context.linkPreviews || []).forEach(preview => {
      lines.push(`  [Link: ${preview.url} -- "${preview.title}"]`);
    });
    lines.push("");
  });

  lines.push("---");
  lines.push("TASK:");
  lines.push(`You are @${loggedInUser || "the logged-in user"}, replying to @${targetUser || "the focal author"}'s FOCAL POST above.`);
  lines.push("Write a short, natural, friendly reply (1-3 sentences max).");
  lines.push("Match the tone and language of the conversation. No hashtags. No emojis unless the conversation uses them. Plain text only.");

  const prompt = lines.join("\n");
  if (prompt.length <= THREAD_CONTEXT_MAX_CHARS) return prompt;

  const focalIndex = prompt.indexOf("[FOCAL POST");
  const taskIndex = prompt.indexOf("TASK:");
  if (focalIndex === -1 || taskIndex === -1) {
    return prompt.slice(-THREAD_CONTEXT_MAX_CHARS);
  }

  const tail = prompt.slice(focalIndex);
  const truncated = `THREAD CONTEXT:\n---\n[...earlier context truncated...]\n\n${tail}`;
  return truncated.length > THREAD_CONTEXT_MAX_CHARS
    ? truncated.slice(-THREAD_CONTEXT_MAX_CHARS)
    : truncated;
}

function getLoggedInUserFromComposer(replyBox = null) {
  const composer = replyBox?.closest?.('[role="none"]')
    || getThreadRegion()?.querySelector?.('[role="none"]');
  const avatarImg = composer?.querySelector?.('img[alt*="profile picture"]');
  const altText = cleanDomText(avatarImg?.getAttribute?.("alt") || avatarImg?.alt);
  const profileMatch = altText.match(/^(.+)'s profile picture$/);
  return normalizeContextUsername(profileMatch?.[1] || "");
}

function postToThreadContext(post, isFocal = false) {
  const username = normalizeContextUsername(post?.authorUsername || post?.username || post?.authorName);
  if (!username || !post?.fullText) return null;
  return {
    username,
    authorUsername: `@${username}`,
    postId: post.postId || "",
    postPath: post.postUrl || "",
    timestamp: "",
    isAuthor: false,
    hashtags: [],
    content: post.fullText,
    linkPreviews: [],
    isFocal,
    hasComposer: false,
  };
}

function getThreadContextForGeneration(postContext, replyBox = null) {
  if (!postContext?.postText) return {};

  let contexts = extractThreadContext(document, location, replyBox);
  if (contexts.length === 0) {
    const data = scrapeThreadsPostPage();
    contexts = [
      postToThreadContext(data?.mainPost, postContext.postId === data?.mainPost?.postId),
      ...((data?.replies || []).map(reply => postToThreadContext(reply, postContext.postId === reply.postId))),
    ].filter(Boolean);
  }

  const targetPostId = postContext.postId || "";
  const targetUsername = normalizeContextUsername(postContext.authorUsername || postContext.authorName);
  contexts = contexts.map(context => ({
    ...context,
    isFocal: context.isFocal
      || (!!targetPostId && context.postId === targetPostId)
      || (!targetPostId && context.username === targetUsername && context.content === postContext.postText),
  }));

  const focalPost = contexts.find(context => context.isFocal)
    || contexts.find(context => context.content === postContext.postText)
    || contexts[contexts.length - 1];
  const targetUser = focalPost?.username || targetUsername;
  const loggedInUser = getLoggedInUserFromComposer(replyBox);
  const threadContext = buildThreadContextPrompt(contexts, loggedInUser, targetUser);

  return {
    threadContext,
    targetUser,
    loggedInUser,
  };
}

function withThreadContext(postContext, replyBox = null) {
  if (!postContext) return null;
  return {
    ...postContext,
    ...getThreadContextForGeneration(postContext, replyBox),
  };
}

function scrapeThreadsPostPageFromPressableContainers(root = document, currentLocation = location) {
  const posts = Array.from(root.querySelectorAll?.(PRESSABLE_CONTAINER_SELECTOR) ?? [])
    .map(container => extractPostFromPressableContainer(container, currentLocation))
    .filter(post => post?.authorUsername && post.fullText);
  const uniquePosts = posts.filter((post, index, arr) => {
    const key = post.postUrl || `${post.authorUsername}\n${post.fullText}`;
    return arr.findIndex(candidate => (
      (candidate.postUrl || `${candidate.authorUsername}\n${candidate.fullText}`) === key
    )) === index;
  });

  if (uniquePosts.length === 0) return null;

  return {
    pageUrl: currentLocation?.href || null,
    mainPost: uniquePosts[0],
    replies: uniquePosts.slice(1),
  };
}

function extractThreadsPostFromDom(root = document, currentLocation = location) {
  const { postId, authorUsername } = extractPostPathParts(currentLocation?.pathname);
  if (!postId || !authorUsername) return null;

  const authorLink = root.querySelector?.(`a[href="/${authorUsername}"]`);
  if (!authorLink) return null;

  const authorName = cleanDomText(authorLink.innerText || authorLink.textContent)
    || cleanDomText(authorLink.querySelector?.("span")?.innerText)
    || authorUsername.replace(/^@/, "");
  const container = findMainPostContainer(authorLink);
  const spans = Array.from(container?.querySelectorAll?.('span[dir="auto"]') ?? []);
  const textBlocks = uniqueTexts(spans
    .map(span => cleanDomText(span.innerText || span.textContent))
    .filter(text =>
      text &&
      text.length > 5 &&
      text !== authorName &&
      text !== authorUsername &&
      !text.match(/^\d+[hd]$/) &&
      !text.match(/^\d+$/)
    ));

  const timeEl = container?.querySelector?.("time") ?? null;

  return {
    pageUrl: currentLocation?.href || null,
    mainPost: {
      postId,
      postUrl: buildThreadsPostUrl(currentLocation, authorUsername, postId),
      username: authorName,
      authorUsername,
      authorName,
      datetime: timeEl?.getAttribute?.("datetime") ?? null,
      fullText: textBlocks.join("\n"),
      textBlocks,
    },
    replies: [],
  };
}

function extractPostFromPagelet(pagelet) {
  const allLinks = [...pagelet.querySelectorAll('a[href]')];
  const profileLink = allLinks.find(a => {
    const href = a.getAttribute('href');
    return href?.startsWith('/@') && !href.includes('/post/');
  });
  const profileHref = profileLink?.getAttribute("href") ?? "";
  const authorUsername = profileHref.match(/^\/(@[\w.]+)/)?.[1] ?? null;
  const authorName = cleanDomText(profileLink?.innerText || profileLink?.textContent) || null;
  const username = authorName;
  const timeEl   = pagelet.querySelector('time');
  const timeText = timeEl?.textContent.trim() ?? null;
  const postLink = allLinks.find(a => a.getAttribute('href')?.includes('/post/'));
  const postUrl  = postLink ? 'https://www.threads.com' + postLink.getAttribute('href') : null;

  const UI_NOISE = new Set([username, authorUsername, timeText, 'Top', 'View activity', 'View activityView activity']);
  const textBlocks = [...pagelet.querySelectorAll('[dir="auto"]')]
    .map(el => el.textContent.trim())
    .filter(t => t.length > 0 && !UI_NOISE.has(t));

  return {
    postId: extractPostId(postUrl),
    postUrl,
    username,
    authorUsername,
    authorName,
    datetime: timeEl?.getAttribute('datetime') ?? null,
    fullText: textBlocks.join('\n'),
    textBlocks,
  };
}

function scrapeThreadsPostPage() {
  const directData = extractThreadsPostFromDom(document, location);
  const pressableData = scrapeThreadsPostPageFromPressableContainers(document, location);
  const region = getThreadRegion();
  if (!region) return pressableData || directData;
  const pagelets = [...region.querySelectorAll('[data-pagelet^="threads_post_page_"]')]
    .filter(p => p.querySelector('[data-interactive-id]'));
  if (pagelets.length === 0) return pressableData || directData;
  const [mainPagelet, ...replyPagelets] = pagelets;
  const pageletData = {
    pageUrl: location.href,
    mainPost: extractPostFromPagelet(mainPagelet),
    replies: replyPagelets.map(extractPostFromPagelet),
  };
  const replies = pageletData.replies.length > 0
    ? pageletData.replies
    : (pressableData?.replies || []);

  if (directData?.mainPost?.fullText) {
    return {
      ...directData,
      replies,
    };
  }

  return {
    ...pageletData,
    replies,
  };
}

function getActivePostText() {
  const data = getActivePostContext();
  if (data?.postText) return data.postText;
  return null;
}

function getActivePostContext(replyBox = null) {
  const replyTargetContext = getReplyTargetContext(replyBox);
  if (replyTargetContext?.postText) return withThreadContext(replyTargetContext, replyBox);

  const data = scrapeThreadsPostPage();
  if (data?.mainPost?.fullText) {
    return withThreadContext({
      postText: data.mainPost.fullText,
      authorName: data.mainPost.authorName || data.mainPost.username || null,
      authorUsername: data.mainPost.authorUsername || null,
      pageUrl: data.pageUrl || location.href,
      postId: data.mainPost.postId || null,
    }, replyBox);
  }

  const region = getThreadRegion() || document;
  for (const el of region.querySelectorAll('[dir="auto"]')) {
    const text = el.textContent.trim();
    if (text.length > 15 && !el.closest('[role="textbox"]') && !el.closest('nav')) {
      const { postId, authorUsername } = extractPostPathParts(location.pathname);
      return withThreadContext({
        postText: text,
        authorName: authorUsername?.replace(/^@/, "") || null,
        authorUsername,
        pageUrl: location.href,
        postId,
      }, replyBox);
    }
  }
  return null;
}

function getExtensionErrorMessage(error) {
  const message = error?.message || String(error || "");
  if (
    /extension context invalidated/i.test(message)
    || /extension runtime unavailable/i.test(message)
    || /cannot read properties of undefined \(reading 'sendMessage'\)/i.test(message)
  ) {
    return "Chrome reloaded the extension. Refresh this Threads tab and try again.";
  }
  return "Extension error: " + message;
}

async function sendRuntimeMessage(message) {
  if (typeof chrome === "undefined" || typeof chrome.runtime?.sendMessage !== "function") {
    throw new Error("Extension runtime unavailable.");
  }

  return chrome.runtime.sendMessage(message);
}

function getReplyTargetContext(replyBox) {
  if (!replyBox) return null;

  const threadBlock = findTargetThreadPostBlock(replyBox);
  const threadPost = parseThreadContextBlock(threadBlock, location, replyBox);
  if (threadPost?.content && threadPost.authorUsername) {
    return {
      postText: threadPost.content,
      authorName: threadPost.username,
      authorUsername: threadPost.authorUsername,
      pageUrl: threadPost.postPath
        ? `${location.origin || "https://www.threads.com"}${threadPost.postPath}`
        : location.href,
      postId: threadPost.postId || null,
    };
  }

  const container = findTargetPressableContainer(replyBox);
  const post = extractPostFromPressableContainer(container, location);
  if (!post?.fullText || !post.authorUsername) return null;

  return {
    postText: post.fullText,
    authorName: post.authorName || post.username || post.authorUsername.replace(/^@/, ""),
    authorUsername: post.authorUsername,
    pageUrl: post.postUrl || location.href,
    postId: post.postId || null,
  };
}

function findTargetThreadPostBlock(replyBox, root = document) {
  if (!replyBox) return null;

  const searchRoot = getThreadRegion() || root;
  const blocks = getThreadPostBlockElements(searchRoot);
  const containingBlock = blocks.find(block => block.contains?.(replyBox));
  if (containingBlock) return containingBlock;

  const priorBlocks = blocks.filter(block => appearsBeforeInDocumentOrder(block, replyBox, searchRoot));
  return priorBlocks[priorBlocks.length - 1] || null;
}

function findTargetPressableContainer(replyBox, root = document) {
  if (!replyBox) return null;

  const closestContainer = replyBox.closest?.(PRESSABLE_CONTAINER_SELECTOR);
  if (extractPostFromPressableContainer(closestContainer, location)?.fullText) {
    return closestContainer;
  }

  const searchRoot = getThreadRegion() || root;
  const containers = Array.from(searchRoot.querySelectorAll?.(PRESSABLE_CONTAINER_SELECTOR) ?? [])
    .filter(container => extractPostFromPressableContainer(container, location)?.fullText);
  const priorContainers = containers.filter(container => appearsBeforeInDocumentOrder(container, replyBox, searchRoot));
  return priorContainers[priorContainers.length - 1] || null;
}

function appearsBeforeInDocumentOrder(candidate, target, root = document) {
  if (!candidate || !target || candidate === target) return false;

  if (typeof candidate.compareDocumentPosition === "function") {
    return !!(candidate.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  const orderedNodes = [];
  const visit = node => {
    orderedNodes.push(node);
    Array.from(node?.children ?? []).forEach(visit);
  };
  visit(root?.body || root);

  const candidateIndex = orderedNodes.indexOf(candidate);
  const targetIndex = orderedNodes.indexOf(target);
  return candidateIndex !== -1 && targetIndex !== -1 && candidateIndex < targetIndex;
}

// ─── Inject Text into Reply Box ───────────────────────────────────────────────

function moveReplyCursorToEnd(textbox) {
  const selection = window.getSelection?.();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(textbox);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function formatHumanComment(rawComment) {
  if (!rawComment || typeof rawComment !== "string") return null;

  const cleaned = rawComment
    .trim()
    .toLowerCase()
    .replace(/\r\n/g, "\n")
    .replace(/^[ \t]*[-*•][ \t]+/gm, "")
    .replace(/([.!?])\s+-\s+/g, "$1\n")
    .replace(/([.!?])(?=\S)/g, "$1\n")
    .replace(/[ \t]*[—–][ \t]*/g, ", ")
    .replace(/[ \t]+-[ \t]+/g, ", ")
    .replace(/\b(that'?s a great point|this is a great point|i completely agree|this is such an important reminder|in today'?s world|exactly|honestly|definitely|absolutely|dive into)\b[,.!?]?\s*/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  const chunks = cleaned
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => splitIntoSentenceLikeChunks(line));

  if (chunks.length === 0) return null;

  return chunks.slice(0, 3).join("\n\n");
}

function splitIntoSentenceLikeChunks(text) {
  const pieces = text
    .split(/(?<=[.!?])\s*/)
    .map(piece => piece.trim())
    .filter(Boolean);

  return pieces.length > 0 ? pieces : [text];
}

function clearEditorWithNativeCommands() {
  const execCommand = document.execCommand?.bind(document);
  if (!execCommand) return false;

  execCommand("selectAll");
  execCommand("delete");
  return true;
}

function insertTextWithEditorCommands(textbox, formattedText) {
  const execCommand = document.execCommand?.bind(document);
  if (!execCommand) return false;

  clearEditorWithNativeCommands();
  return execCommand("insertText", false, formattedText) !== false;
}

function insertTextWithDomFallback(textbox, formattedText) {
  textbox.innerHTML = "";

  const lines = formattedText.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, index) => {
    textbox.appendChild(document.createTextNode(line));
    if (index < lines.length - 1) {
      textbox.appendChild(document.createElement("br"));
    }
  });
}

function injectTextIntoReplyBox(textbox, text) {
  try {
    const formattedText = formatHumanComment(text);
    if (!formattedText) return false;

    textbox.focus();
    textbox.click?.();

    if (!insertTextWithEditorCommands(textbox, formattedText)) {
      insertTextWithDomFallback(textbox, formattedText);
    }

    textbox.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: formattedText,
    }));
    textbox.dispatchEvent(new Event("change", { bubbles: true }));

    moveReplyCursorToEnd(textbox);

    return true;
  } catch (err) {
    console.error("[Threads AI] Could not inject reply text", err);
    return false;
  }
}

function typeInReplyBox(content) {
  const replyBox = findReplyTextbox();
  if (!replyBox) {
    console.error("[Threads AI] Không tìm thấy ô reply!");
    return false;
  }

  return injectTextIntoReplyBox(replyBox, content);
}

function findReplyTextbox(root = document) {
  const replyBoxes = Array.from(root.querySelectorAll?.(REPLY_BOX_SELECTOR) ?? []);
  return replyBoxes.find(isReplyTextbox) || replyBoxes[0] || null;
}

function isReplyTextbox(textbox) {
  const placeholder = [
    textbox?.getAttribute?.("aria-placeholder"),
    textbox?.getAttribute?.("placeholder"),
    textbox?.getAttribute?.("aria-label"),
  ].filter(Boolean).join(" ");

  return placeholder.includes(REPLY_COMPOSER_PLACEHOLDER)
    || /post your reply|reply to|compose a new post/i.test(placeholder);
}

function getButtonLabel(button) {
  return [
    button?.getAttribute?.("aria-label"),
    button?.innerText,
    button?.textContent,
  ].filter(Boolean).join(" ").trim();
}

function findReplyComposerRoot(replyBox) {
  let node = replyBox;
  for (let i = 0; i < 8 && node?.parentElement; i += 1) {
    node = node.parentElement;
    if (Array.from(node.querySelectorAll?.("button") ?? []).some(isReplySubmitButton)) {
      return node;
    }
  }
  return replyBox?.closest?.('[role="dialog"], [role="none"]') || document;
}

function findExpandComposerButton(replyBox) {
  const root = findReplyComposerRoot(replyBox);
  const buttons = Array.from(root.querySelectorAll?.('button, [role="button"]') ?? []);
  return buttons.find(button => /expand composer|expand/i.test(getButtonLabel(button))) || null;
}

function isReplySubmitButton(button) {
  const label = getButtonLabel(button);
  return /^reply$/i.test(label) || /\bpost reply\b/i.test(label);
}

function findReplySubmitButton(replyBox) {
  const root = findReplyComposerRoot(replyBox);
  const scopedButtons = Array.from(root.querySelectorAll?.('button, [role="button"]') ?? []);
  return scopedButtons.find(isReplySubmitButton)
    || Array.from(document.querySelectorAll?.('button, [role="button"]') ?? []).find(isReplySubmitButton)
    || null;
}

function waitForReplySubmitButton(replyBox, timeoutMs = 1200) {
  const existing = findReplySubmitButton(replyBox);
  if (existing) return Promise.resolve(existing);

  return new Promise(resolve => {
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(findReplySubmitButton(replyBox));
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      const button = findReplySubmitButton(replyBox);
      if (!button) return;
      clearTimeout(timeoutId);
      observer.disconnect();
      resolve(button);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function postReplyText(content) {
  const replyBox = findReplyTextbox();
  if (!replyBox) {
    return { success: false, error: "No reply box found" };
  }

  const filled = injectTextIntoReplyBox(replyBox, content);
  if (!filled) {
    return { success: false, error: "Reply text is empty or could not be inserted" };
  }

  findExpandComposerButton(replyBox)?.click?.();
  const submitButton = await waitForReplySubmitButton(replyBox);
  if (!submitButton) {
    return { success: false, error: "Reply button not found" };
  }

  if (submitButton.disabled || submitButton.getAttribute?.("aria-disabled") === "true") {
    return { success: false, error: "Reply button is disabled" };
  }

  submitButton.click?.();
  return { success: true };
}

// ─── Inline UI Injection ──────────────────────────────────────────────────────

// Inject styles once
function injectStyles() {
  if (document.getElementById("tai-styles")) return;
  const style = document.createElement("style");
  style.id = "tai-styles";
  style.textContent = `
    .tai-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 13px;
      border-radius: 20px;
      border: none;
      background: #1a1a1a;
      color: #c8f55a;
      box-shadow: 0 1px 6px rgba(0,0,0,0.25);
      font-size: 12px;
      font-weight: 700;
      font-family: system-ui, sans-serif;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
      line-height: 1;
      flex-shrink: 0;
    }
    .tai-btn:hover {
      background: #2a2a2a;
      transform: scale(1.04);
    }
    .tai-btn.loading {
      opacity: 0.6;
      cursor: wait;
    }
    /* Tone picker panel */
    .tai-panel {
      position: absolute;
      z-index: 2147483647;
      background: #131314;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px;
      padding: 12px;
      box-shadow: 0 18px 46px rgba(0,0,0,0.48);
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: min(352px, calc(100vw - 24px));
      animation: tai-pop 0.15s ease;
    }
    @keyframes tai-pop {
      from { opacity: 0; transform: scale(0.95) translateY(4px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    .tai-panel-title {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.7px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.3);
      padding: 2px 2px 0;
      font-family: system-ui, sans-serif;
    }
    .tai-tone-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .tai-tone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-width: 0;
      min-height: 66px;
      padding: 8px 5px;
      border-radius: 12px;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s, transform 0.12s;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.035);
      color: #f0f0f0;
      width: 100%;
      text-align: center;
    }
    .tai-tone:hover {
      background: rgba(255,255,255,0.08);
      border-color: rgba(200,245,90,0.28);
      transform: translateY(-1px);
    }
    .tai-tone-icon {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 10px;
      background: rgba(255,255,255,0.06);
      font-size: 21px;
      line-height: 1;
      flex-shrink: 0;
    }
    .tai-tone-name {
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 10.5px;
      font-weight: 700;
      color: #f0f0f0;
      font-family: system-ui, sans-serif;
      line-height: 1.1;
    }

    /* Loading spinner inside tone button */
    .tai-spin {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(200,245,90,0.3);
      border-top-color: #c8f55a;
      border-radius: 50%;
      animation: tai-rotate 0.7s linear infinite;
    }
    @keyframes tai-rotate { to { transform: rotate(360deg); } }

    /* Error toast inside panel */
    .tai-error {
      font-size: 11px;
      color: #ff8080;
      padding: 6px 8px;
      background: rgba(255,80,80,0.08);
      border-radius: 6px;
      font-family: system-ui, sans-serif;
      line-height: 1.4;
    }
    .tai-format-hint {
      position: fixed;
      right: 18px;
      z-index: 2147483647;
      color: #f8fafc;
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 12px 30px rgba(0,0,0,0.38);
      font-family: system-ui, sans-serif;
      backdrop-filter: blur(12px);
    }
    .tai-format-hint {
      bottom: 42px;
      max-width: 260px;
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(19, 19, 20, 0.9);
      color: #c8f55a;
      font-size: 12px;
      font-weight: 700;
      display: none;
    }
  `;
  document.head.appendChild(style);
}

function getToneIconMarkup(tone) {
  return `<span class="tai-tone-icon tai-tone-emoji" aria-hidden="true">${tone.emoji || "✦"}</span>`;
}

function restoreToneIcon(button, tone) {
  const icon = button.querySelector(".tai-tone-icon");
  if (icon) icon.outerHTML = getToneIconMarkup(tone);
}

// Find the icon row next to a reply box (the row with GIF, image buttons)
function findIconRowNearReplyBox(replyBox) {
  // Walk up from textbox to find the reply bar container
  let node = replyBox;
  for (let i = 0; i < 8; i++) {
    node = node?.parentElement;
    if (!node) break;
    // The icon row contains GIF button — use that as signal
    const gifBtn = node.querySelector('img[alt="GIF"], [aria-label*="GIF"], [aria-label*="gif"]');
    if (gifBtn) return gifBtn.closest('[role="button"]')?.parentElement || gifBtn.parentElement;
  }
  return null;
}

// ─── Core: inject AI button next to reply box ─────────────────────────────────

let activePanel = null;

function closePanel() {
  activePanel?.remove();
  activePanel = null;
}

function injectAIButton(replyBox) {
  // Don't inject twice
  if (replyBox.parentElement?.querySelector(".tai-btn")) return;

  const iconRow = findIconRowNearReplyBox(replyBox);
  if (!iconRow) return;

  const btn = document.createElement("button");
  btn.className = "tai-btn";
  btn.title = "Generate AI comment";
  btn.innerHTML = `<span>✦</span><span>AI</span>`;

  // Insert as first child of icon row
  iconRow.insertBefore(btn, iconRow.firstChild);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (activePanel) {
      closePanel();
      return;
    }

    showTonePanel(btn, replyBox);
  });
}

function showTonePanel(anchorBtn, replyBox) {
  closePanel();

  const panel = document.createElement("div");
  panel.className = "tai-panel";

  const title = document.createElement("div");
  title.className = "tai-panel-title";
  title.textContent = "Pick a tone";
  panel.appendChild(title);

  const toneGrid = document.createElement("div");
  toneGrid.className = "tai-tone-grid";
  panel.appendChild(toneGrid);

  TONES.forEach(tone => {
    const btn = document.createElement("button");
    btn.className = "tai-tone";
    btn.type = "button";
    btn.title = `${tone.label} - ${tone.desc}`;
    btn.setAttribute("aria-label", `${tone.label}: ${tone.desc}`);
    btn.innerHTML = `
      ${getToneIconMarkup(tone)}
      <span class="tai-tone-name">${tone.label}</span>
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      generateAndFill(tone, replyBox, panel, anchorBtn);
    });
    toneGrid.appendChild(btn);
  });

  // Position panel above the anchor button
  document.body.appendChild(panel);
  activePanel = panel;

  const rect = anchorBtn.getBoundingClientRect();
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 360;
  const panelW = panel.offsetWidth || 352;
  const panelH = panel.offsetHeight || 260;
  const gutter = 12;
  const minLeft = scrollX + gutter;
  const maxLeft = scrollX + viewportWidth - panelW - gutter;
  const preferredLeft = rect.left + scrollX - 8;
  const left = Math.min(Math.max(preferredLeft, minLeft), Math.max(minLeft, maxLeft));
  let top = rect.top + scrollY - panelH - 10;
  if (top < scrollY + gutter) {
    top = rect.bottom + scrollY + 10;
  }
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", closePanel, { once: true });
  }, 0);
}

async function generateAndFill(tone, replyBox, panel, anchorBtn) {
  // Show loading state
  panel.querySelectorAll(".tai-tone").forEach(b => b.style.opacity = "0.4");
  const clickedBtn = [...panel.querySelectorAll(".tai-tone")]
    .find(b => b.querySelector(".tai-tone-name")?.textContent === tone.label);
  if (clickedBtn) {
    clickedBtn.style.opacity = "1";
    const icon = clickedBtn.querySelector(".tai-tone-icon");
    if (icon) icon.outerHTML = '<span class="tai-tone-icon"><span class="tai-spin"></span></span>';
  }
  anchorBtn.classList.add("loading");

  // Get post context
  const postContext = getActivePostContext(replyBox);
  if (!postContext?.postText) {
    showPanelError(panel, "Could not read post text. Try refreshing.");
    anchorBtn.classList.remove("loading");
    return;
  }
  if (!postContext.authorName || !postContext.authorUsername) {
    showPanelError(panel, "Could not read author details. Try refreshing.");
    anchorBtn.classList.remove("loading");
    return;
  }

  // Generate comment via background
  let comment;
  try {
    const response = await sendRuntimeMessage({
      type: "GENERATE_COMMENT",
      tone: tone.key,
      postText: postContext.postText,
      authorName: postContext.authorName,
      authorUsername: postContext.authorUsername,
      pageUrl: postContext.pageUrl,
      threadContext: postContext.threadContext,
      targetUser: postContext.targetUser,
      loggedInUser: postContext.loggedInUser,
    });

    if (response.error) {
      showPanelError(panel, response.error);
      anchorBtn.classList.remove("loading");
      return;
    }
    comment = response.comment;
  } catch (err) {
    showPanelError(panel, getExtensionErrorMessage(err));
    anchorBtn.classList.remove("loading");
    return;
  }

  // Fill reply box — re-query in case Threads re-rendered the DOM during the API call
  closePanel();
  anchorBtn.classList.remove("loading");
  const freshReplyBox = replyBox.isConnected
    ? replyBox
    : document.querySelector('[role="textbox"][contenteditable="true"]');
  if (freshReplyBox) {
    freshReplyBox.focus();
    await new Promise(r => setTimeout(r, 50));
    injectTextIntoReplyBox(freshReplyBox, comment);
  } else {
    injectTextIntoReplyBox(replyBox, comment);
    replyBox.focus();
  }
}

function showPanelError(panel, msg) {
  // Remove existing errors
  panel.querySelector(".tai-error")?.remove();
  panel.querySelectorAll(".tai-tone").forEach(b => { b.style.opacity = "1"; });
  // Restore emojis
  TONES.forEach((t, i) => {
    const btns = panel.querySelectorAll(".tai-tone");
    if (btns[i]) restoreToneIcon(btns[i], t);
  });

  const err = document.createElement("div");
  err.className = "tai-error";
  err.textContent = msg;
  panel.appendChild(err);
}

// ─── Comment Formatter: Shift+Enter New Line ────────────────────────────────

function getFormatHintUI() {
  let ui = document.getElementById("threads-format-hint");
  if (ui) return ui;

  ui = document.createElement("div");
  ui.id = "threads-format-hint";
  ui.className = "tai-format-hint";
  ui.textContent = "Nhấn Shift+Enter để xuống dòng mới";
  document.body.appendChild(ui);
  return ui;
}

function maybeShowSentenceEndHint(editor) {
  const text = String(editor.innerText || editor.textContent || "");
  if (!/[.!?]\s$/.test(text)) return;

  const ui = getFormatHintUI();
  ui.style.display = "block";

  const existingTimer = formatterHintTimers.get(editor);
  if (existingTimer) clearTimeout(existingTimer);
  formatterHintTimers.set(editor, setTimeout(() => {
    ui.style.display = "none";
  }, 2200));
}

function insertFormatterNewLine(editor) {
  editor.focus?.();
  const inserted = document.execCommand?.("insertParagraph", false, null);
  if (!inserted) {
    document.execCommand?.("insertLineBreak", false, null);
  }
  editor.dispatchEvent?.(new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    inputType: "insertParagraph",
    data: null,
  }));
}

function handleFormatterKeydown(event, editor) {
  if (event.key !== "Enter" || !event.shiftKey) return;

  event.preventDefault();
  event.stopImmediatePropagation?.();
  insertFormatterNewLine(editor);

  const hint = document.getElementById("threads-format-hint");
  if (hint) hint.style.display = "none";
}

function attachCommentFormatter(editor) {
  if (!editor || editor.dataset.taiFormatterInjected === "1") return;

  editor.dataset.taiFormatterInjected = "1";
  editor.addEventListener("keydown", event => handleFormatterKeydown(event, editor), true);
  editor.addEventListener("input", () => {
    maybeShowSentenceEndHint(editor);
  }, true);
}

// ─── Observer: watch for reply boxes appearing ────────────────────────────────

injectStyles();

// Debounce — prevents hammering on rapid DOM mutations
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function scanAndInject() {
  const replyBoxes = document.querySelectorAll(REPLY_BOX_SELECTOR);
  replyBoxes.forEach(rb => {
    if (rb.dataset.taiInjected) return; // skip already-processed boxes
    rb.dataset.taiInjected = "1";
    injectAIButton(rb);
  });

  const editors = document.querySelectorAll(EDITOR_SELECTOR);
  editors.forEach(attachCommentFormatter);
}

// Initial scan
scanAndInject();

// Only re-scan when nodes are actually added, with 300ms debounce
const debouncedScan = debounce(scanAndInject, 300);
const observer = new MutationObserver((mutations) => {
  if (mutations.some(m => m.addedNodes.length > 0)) debouncedScan();
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: false,
  characterData: false,
});

// ─── Message Handler (for popup compatibility) ────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_POST_TEXT" || msg.action === "SCRAPE_NOW") {
    const data = scrapeThreadsPostPage();
    const context = getActivePostContext();
    sendResponse({ text: context?.postText || null, url: location.href,
      postId: context?.postId || data?.mainPost?.postId || null,
      username: data?.mainPost?.username || context?.authorName || null,
      authorName: context?.authorName || data?.mainPost?.authorName || null,
      authorUsername: context?.authorUsername || data?.mainPost?.authorUsername || null,
      pageUrl: context?.pageUrl || location.href,
      success: !!data, data });
    return false;
  }
  if (msg.type === "INJECT_COMMENT") {
    const tb = findReplyTextbox();
    if (!tb) { sendResponse({ success: false, error: "No reply box found" }); return false; }
    injectTextIntoReplyBox(tb, msg.comment);
    sendResponse({ success: true });
    return false;
  }
  if (msg.type === "POST_REPLY") {
    postReplyText(msg.comment || msg.text || msg.value)
      .then(sendResponse)
      .catch(error => sendResponse({
        success: false,
        error: error?.message || "Could not post reply",
      }));
    return true;
  }
  if (msg.type === "PING") {
    sendResponse({ alive: true, url: location.href });
    return false;
  }
  return true;
});

window.__threadsAI = {
  scrapeThreadsPostPage,
  extractThreadsPostFromDom,
  getActivePostText,
  getActivePostContext,
  findReplyTextbox,
  findReplySubmitButton,
  postReplyText,
  typeInReplyBox,
};
console.log("[Threads AI] Content script ready ✦");
