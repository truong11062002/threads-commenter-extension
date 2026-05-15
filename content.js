// content.js — Injected into threads.com
// Injects "✦ AI" button into the reply bar on Threads post pages

// ─── Config ───────────────────────────────────────────────────────────────────

const TONES = [
  { key: "funny",      emoji: "😂", label: "Funny",      desc: "Meme energy" },
  { key: "insightful", emoji: "🧠", label: "Insightful", desc: "Smart take" },
  { key: "curious",   emoji: "❓", label: "Curious",    desc: "Ask deeper" },
  { key: "relatable", emoji: "😤", label: "Relatable",  desc: "Shared pain" },
  { key: "contrarian",emoji: "🔥", label: "Contrarian", desc: "Hot take" },
];

let currentReplyIconDataUrl = null;

const DEFAULT_VIRAL_STRATEGY = [
  "Goal: grow a small X or Threads account from 0 to 300 followers through real human replies.",
  "Write a short comment in all lowercase.",
  "Use 1 to 3 short sentences.",
  "Put one blank line between every sentence or thought.",
  "Sound like a real observation from personal experience.",
  "Do not use emoji, hashtags, bullets, hyphens, or list structures.",
  "Do not fully conclude the thought; leave it slightly open or add another angle.",
  "Tone: blunt, relatable, and not trying to sound smart.",
  "Avoid: exactly, honestly, definitely, absolutely, dive into.",
].join("\n");

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

function getThreadRegion() {
  const regions = document.querySelectorAll('[role="region"][aria-label="Column body"]');
  return regions[1] || regions[0];
}

function extractPostId(url) {
  return url?.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

function extractPostFromPagelet(pagelet) {
  const allLinks = [...pagelet.querySelectorAll('a[href]')];
  const profileLink = allLinks.find(a => {
    const href = a.getAttribute('href');
    return href?.startsWith('/@') && !href.includes('/post/');
  });
  const username = profileLink?.textContent.trim() ?? null;
  const timeEl   = pagelet.querySelector('time');
  const timeText = timeEl?.textContent.trim() ?? null;
  const postLink = allLinks.find(a => a.getAttribute('href')?.includes('/post/'));
  const postUrl  = postLink ? 'https://www.threads.com' + postLink.getAttribute('href') : null;

  const UI_NOISE = new Set([username, timeText, 'Top', 'View activity', 'View activityView activity']);
  const textBlocks = [...pagelet.querySelectorAll('[dir="auto"]')]
    .map(el => el.textContent.trim())
    .filter(t => t.length > 0 && !UI_NOISE.has(t));

  return {
    postId: extractPostId(postUrl),
    postUrl,
    username,
    datetime: timeEl?.getAttribute('datetime') ?? null,
    fullText: textBlocks.join('\n'),
    textBlocks,
  };
}

function scrapeThreadsPostPage() {
  const region = getThreadRegion();
  if (!region) return null;
  const pagelets = [...region.querySelectorAll('[data-pagelet^="threads_post_page_"]')]
    .filter(p => p.querySelector('[data-interactive-id]'));
  if (pagelets.length === 0) return null;
  const [mainPagelet, ...replyPagelets] = pagelets;
  return {
    pageUrl: location.href,
    mainPost: extractPostFromPagelet(mainPagelet),
    replies: replyPagelets.map(extractPostFromPagelet),
  };
}

function getActivePostText() {
  const data = scrapeThreadsPostPage();
  if (data?.mainPost?.fullText) return data.mainPost.fullText;
  const region = getThreadRegion() || document;
  for (const el of region.querySelectorAll('[dir="auto"]')) {
    const text = el.textContent.trim();
    if (text.length > 15 && !el.closest('[role="textbox"]') && !el.closest('nav')) return text;
  }
  return null;
}

// ─── Inject Text into Reply Box ───────────────────────────────────────────────

function injectTextIntoReplyBox(textbox, text) {
  try {
    textbox.focus();
    // Clear existing content first
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);

    // Method 1: execCommand insertText
    const ok = document.execCommand("insertText", false, text);
    if (ok) return true;

    // Method 2: paste event (only if method 1 failed)
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    textbox.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    return true;
  } catch { return false; }
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
    .tai-btn-symbol {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      line-height: 1;
      flex-shrink: 0;
    }
    .tai-btn-icon {
      display: block;
      width: 16px;
      height: 16px;
      border-radius: 4px;
      object-fit: cover;
      flex-shrink: 0;
    }

    /* Tone picker panel */
    .tai-panel {
      position: absolute;
      z-index: 2147483647;
      background: #131314;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 14px;
      padding: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 190px;
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
      padding: 2px 6px 6px;
      font-family: system-ui, sans-serif;
    }
    .tai-tone {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.12s;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
    }
    .tai-tone:hover {
      background: rgba(255,255,255,0.07);
    }
    .tai-tone-emoji { font-size: 16px; line-height: 1; flex-shrink: 0; }
    .tai-tone-info  { display: flex; flex-direction: column; gap: 1px; }
    .tai-tone-name  { font-size: 13px; font-weight: 600; color: #f0f0f0; font-family: system-ui, sans-serif; }
    .tai-tone-desc  { font-size: 11px; color: rgba(255,255,255,0.4); font-family: system-ui, sans-serif; }

    /* Loading spinner inside tone button */
    .tai-spin {
      display: inline-block;
      width: 10px; height: 10px;
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
  `;
  document.head.appendChild(style);
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

function renderAIButtonContent(btn, iconDataUrl = currentReplyIconDataUrl) {
  btn.textContent = "";

  if (iconDataUrl) {
    const img = document.createElement("img");
    img.className = "tai-btn-icon";
    img.alt = "";
    img.src = iconDataUrl;
    img.addEventListener("error", () => renderAIButtonContent(btn, null), { once: true });
    btn.appendChild(img);
  } else {
    const symbol = document.createElement("span");
    symbol.className = "tai-btn-symbol";
    symbol.textContent = "✦";
    btn.appendChild(symbol);
  }

  const label = document.createElement("span");
  label.textContent = "AI";
  btn.appendChild(label);
}

function updateInjectedButtonIcons(iconDataUrl) {
  currentReplyIconDataUrl = iconDataUrl || null;
  document.querySelectorAll(".tai-btn").forEach(btn => renderAIButtonContent(btn));
}

function injectAIButton(replyBox) {
  // Don't inject twice
  if (replyBox.parentElement?.querySelector(".tai-btn")) return;

  const iconRow = findIconRowNearReplyBox(replyBox);
  if (!iconRow) return;

  const btn = document.createElement("button");
  btn.className = "tai-btn";
  btn.title = "Generate AI comment";
  renderAIButtonContent(btn);

  // Insert as first child of icon row
  iconRow.insertBefore(btn, iconRow.firstChild);

  chrome.storage.local.get("replyIconDataUrl").then(({ replyIconDataUrl }) => {
    if (replyIconDataUrl && replyIconDataUrl !== currentReplyIconDataUrl) {
      updateInjectedButtonIcons(replyIconDataUrl);
    }
  }).catch(() => {});

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

  TONES.forEach(tone => {
    const btn = document.createElement("button");
    btn.className = "tai-tone";
    btn.innerHTML = `
      <span class="tai-tone-emoji">${tone.emoji}</span>
      <span class="tai-tone-info">
        <span class="tai-tone-name">${tone.label}</span>
        <span class="tai-tone-desc">${tone.desc}</span>
      </span>
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      generateAndFill(tone, replyBox, panel, anchorBtn);
    });
    panel.appendChild(btn);
  });

  // Position panel above the anchor button
  document.body.appendChild(panel);
  activePanel = panel;

  const rect = anchorBtn.getBoundingClientRect();
  const panelH = panel.offsetHeight || 220;
  panel.style.left = `${rect.left + window.scrollX}px`;
  panel.style.top  = `${rect.top + window.scrollY - panelH - 8}px`;

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
    clickedBtn.querySelector(".tai-tone-emoji").innerHTML = `<span class="tai-spin"></span>`;
  }
  anchorBtn.classList.add("loading");

  // Get post text
  const postText = getActivePostText();
  if (!postText) {
    showPanelError(panel, "Could not read post text. Try refreshing.");
    anchorBtn.classList.remove("loading");
    return;
  }

  // Get settings
  const {
    openaiKey,
    openaiModel,
    userVoice,
    viralStrategy,
    useViralStrategy,
  } = await chrome.storage.local.get([
    "openaiKey",
    "openaiModel",
    "userVoice",
    "viralStrategy",
    "useViralStrategy",
  ]);
  if (!openaiKey) {
    showPanelError(panel, "No API key — click the extension icon ✦ to add it.");
    anchorBtn.classList.remove("loading");
    return;
  }

  // Generate comment via background
  let comment;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GENERATE_COMMENT",
      tone: tone.key,
      postText,
      apiKey: openaiKey,
      model: openaiModel || "gpt-4o-mini",
      userVoice: userVoice || "",
      viralStrategy: useViralStrategy === false ? "" : (viralStrategy || DEFAULT_VIRAL_STRATEGY),
    });

    if (response.error) {
      showPanelError(panel, response.error);
      anchorBtn.classList.remove("loading");
      return;
    }
    comment = response.comment;
  } catch (err) {
    showPanelError(panel, "Extension error: " + err.message);
    anchorBtn.classList.remove("loading");
    return;
  }

  // Fill reply box
  closePanel();
  anchorBtn.classList.remove("loading");
  injectTextIntoReplyBox(replyBox, comment);
  replyBox.focus();
}

function showPanelError(panel, msg) {
  // Remove existing errors
  panel.querySelector(".tai-error")?.remove();
  panel.querySelectorAll(".tai-tone").forEach(b => { b.style.opacity = "1"; });
  // Restore emojis
  TONES.forEach((t, i) => {
    const btns = panel.querySelectorAll(".tai-tone");
    if (btns[i]) btns[i].querySelector(".tai-tone-emoji").textContent = t.emoji;
  });

  const err = document.createElement("div");
  err.className = "tai-error";
  err.textContent = msg;
  panel.appendChild(err);
}

// ─── Observer: watch for reply boxes appearing ────────────────────────────────

injectStyles();

chrome.storage.local.get("replyIconDataUrl").then(({ replyIconDataUrl }) => {
  currentReplyIconDataUrl = replyIconDataUrl || null;
  updateInjectedButtonIcons(currentReplyIconDataUrl);
}).catch(() => {});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.replyIconDataUrl) return;
  updateInjectedButtonIcons(changes.replyIconDataUrl.newValue || null);
});

// Debounce — prevents hammering on rapid DOM mutations
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function scanAndInject() {
  const replyBoxes = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
  replyBoxes.forEach(rb => {
    if (rb.dataset.taiInjected) return; // skip already-processed boxes
    rb.dataset.taiInjected = "1";
    injectAIButton(rb);
  });
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
    const text = data?.mainPost?.fullText || getActivePostText();
    sendResponse({ text: text || null, url: location.href,
      postId: data?.mainPost?.postId || null, username: data?.mainPost?.username || null,
      success: !!data, data });
    return false;
  }
  if (msg.type === "INJECT_COMMENT") {
    const tb = document.querySelector('[role="textbox"][contenteditable="true"]');
    if (!tb) { sendResponse({ success: false, error: "No reply box found" }); return false; }
    injectTextIntoReplyBox(tb, msg.comment);
    sendResponse({ success: true });
    return false;
  }
  if (msg.type === "PING") {
    sendResponse({ alive: true, url: location.href });
    return false;
  }
  return true;
});

window.__threadsAI = { scrapeThreadsPostPage, getActivePostText };
console.log("[Threads AI] Content script ready ✦");
