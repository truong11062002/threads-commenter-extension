// popup.js

let selectedTone = null;
let isLoading = false;
let isIconLoading = false;
let currentPostText = null;
let activeTabId = null;

const DEFAULT_VIRAL_STRATEGY = [
  "Optimize for meaningful Threads replies, not cheap engagement bait.",
  "Write a comment that is specific to the post and gives people an easy reason to reply.",
  "Prefer one sharp observation, useful reframing, or thoughtful follow-up question.",
  "If asking a question, make it concrete and non-generic.",
  "Avoid spam, hashtags, emoji-only reactions, vague praise, rage bait, and obvious bait like 'agree?'.",
  "Keep it short enough to feel native to Threads.",
].join("\n");

const el = {
  apiKeyInput:       document.getElementById("apiKeyInput"),
  saveKeyBtn:        document.getElementById("saveKeyBtn"),
  keyStatus:         document.getElementById("keyStatus"),
  modelSelect:       document.getElementById("modelSelect"),
  userVoiceInput:    document.getElementById("userVoiceInput"),
  saveVoiceBtn:      document.getElementById("saveVoiceBtn"),
  voiceStatus:       document.getElementById("voiceStatus"),
  viralStrategyInput: document.getElementById("viralStrategyInput"),
  useViralStrategyToggle: document.getElementById("useViralStrategyToggle"),
  resetStrategyBtn:  document.getElementById("resetStrategyBtn"),
  strategyStatus:    document.getElementById("strategyStatus"),
  iconPromptInput:   document.getElementById("iconPromptInput"),
  generateIconBtn:   document.getElementById("generateIconBtn"),
  resetIconBtn:      document.getElementById("resetIconBtn"),
  iconPreview:       document.getElementById("iconPreview"),
  iconStatus:        document.getElementById("iconStatus"),
  tonesGrid:         document.getElementById("tonesGrid"),
  generateBtn:       document.getElementById("generateBtn"),
  generateBtnText:   document.getElementById("generateBtnText"),
  generateBtnLoader: document.getElementById("generateBtnLoader"),
  resultArea:        document.getElementById("resultArea"),
  resultText:        document.getElementById("resultText"),
  copyBtn:           document.getElementById("copyBtn"),
  injectBtn:         document.getElementById("injectBtn"),
  regenBtn:          document.getElementById("regenBtn"),
  errorArea:         document.getElementById("errorArea"),
  errorText:         document.getElementById("errorText"),
};

// ─── Init ─────────────────────────────────────────────────────
async function init() {
  const {
    openaiKey,
    openaiModel,
    userVoice,
    viralStrategy,
    useViralStrategy,
    replyIconPrompt,
    replyIconDataUrl,
  } = await chrome.storage.local.get([
    "openaiKey",
    "openaiModel",
    "userVoice",
    "viralStrategy",
    "useViralStrategy",
    "replyIconPrompt",
    "replyIconDataUrl",
  ]);

  if (openaiKey) {
    el.apiKeyInput.value = openaiKey;
    const masked = "sk-..." + openaiKey.slice(-4);
    el.keyStatus.textContent = `Saved · ${masked}`;
    el.keyStatus.classList.add("saved");
  }

  if (openaiModel) {
    el.modelSelect.value = openaiModel;
  }

  if (userVoice) {
    el.userVoiceInput.value = userVoice;
    el.voiceStatus.textContent = "Saved — applied to every generated comment";
    el.voiceStatus.classList.add("saved");
  }

  el.viralStrategyInput.value = viralStrategy || DEFAULT_VIRAL_STRATEGY;
  el.useViralStrategyToggle.checked = useViralStrategy !== false;
  el.strategyStatus.textContent = el.useViralStrategyToggle.checked
    ? "Active — AI will optimize for meaningful replies"
    : "Paused — AI will use tone and voice only";
  el.strategyStatus.classList.toggle("saved", el.useViralStrategyToggle.checked);

  if (replyIconPrompt) {
    el.iconPromptInput.value = replyIconPrompt;
  }

  renderIconPreview(replyIconDataUrl);
  if (replyIconDataUrl) {
    el.iconStatus.textContent = "Saved — visible in the Threads reply bar";
    el.iconStatus.classList.add("saved");
  }

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id;

  // Try to prefetch post text silently
  const isThreads = tab?.url?.includes("threads.com") || tab?.url?.includes("threads.net");
  if (isThreads && activeTabId) {
    try {
      const res = await chrome.tabs.sendMessage(activeTabId, { type: "GET_POST_TEXT" });
      if (res?.text) currentPostText = res.text;
    } catch { /* silent — content script may not be ready */ }
  }
}

// ─── API Key ──────────────────────────────────────────────────
el.saveKeyBtn.addEventListener("click", async () => {
  const key = el.apiKeyInput.value.trim();
  if (!key) { showError("Please enter your OpenAI API key."); return; }
  if (!key.startsWith("sk-")) { showError("API key should start with sk-"); return; }

  await chrome.storage.local.set({ openaiKey: key });
  hideError();

  el.saveKeyBtn.textContent = "Saved ✓";
  el.keyStatus.textContent = "sk-..." + key.slice(-4);
  el.keyStatus.classList.add("saved");
  setTimeout(() => { el.saveKeyBtn.textContent = "Save"; }, 1500);
});

// ─── Model Select ─────────────────────────────────────────────
el.modelSelect.addEventListener("change", async () => {
  await chrome.storage.local.set({ openaiModel: el.modelSelect.value });
});

// ─── User Voice ───────────────────────────────────────────────
el.saveVoiceBtn.addEventListener("click", async () => {
  const userVoice = el.userVoiceInput.value.trim();
  await chrome.storage.local.set({ userVoice });
  hideError();

  el.saveVoiceBtn.textContent = "Saved ✓";
  el.voiceStatus.textContent = userVoice
    ? "Saved — applied to every generated comment"
    : "Cleared — comments use tone only";
  el.voiceStatus.classList.toggle("saved", !!userVoice);
  setTimeout(() => { el.saveVoiceBtn.textContent = "Save voice"; }, 1500);
});

el.viralStrategyInput.addEventListener("change", saveViralStrategy);
el.useViralStrategyToggle.addEventListener("change", saveViralStrategy);
el.resetStrategyBtn.addEventListener("click", async () => {
  el.viralStrategyInput.value = DEFAULT_VIRAL_STRATEGY;
  el.useViralStrategyToggle.checked = true;
  await saveViralStrategy();
});

async function saveViralStrategy() {
  const viralStrategy = el.viralStrategyInput.value.trim() || DEFAULT_VIRAL_STRATEGY;
  const useViralStrategy = el.useViralStrategyToggle.checked;
  await chrome.storage.local.set({ viralStrategy, useViralStrategy });
  el.strategyStatus.textContent = useViralStrategy
    ? "Active — AI will optimize for meaningful replies"
    : "Paused — AI will use tone and voice only";
  el.strategyStatus.classList.toggle("saved", useViralStrategy);
  hideError();
}

// ─── Reply Icon ───────────────────────────────────────────────
el.generateIconBtn.addEventListener("click", generateReplyIcon);
el.resetIconBtn.addEventListener("click", resetReplyIcon);

async function generateReplyIcon() {
  if (isIconLoading) return;

  const { openaiKey } = await chrome.storage.local.get("openaiKey");
  if (!openaiKey) { showError("Add your OpenAI API key above first."); return; }

  const prompt = el.iconPromptInput.value.trim();
  if (!prompt) { showError("Describe the reply icon you want first."); return; }

  setIconLoading(true);
  hideError();
  el.iconStatus.textContent = "Generating icon...";
  el.iconStatus.classList.remove("saved");

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: "GENERATE_REPLY_ICON",
      apiKey: openaiKey,
      prompt,
    });
  } catch (err) {
    response = { error: "Extension error: " + err.message };
  }

  setIconLoading(false);

  if (!response || response.error) {
    el.iconStatus.textContent = "Icon was not changed";
    showError(response?.error || "No response from the extension background worker.");
    return;
  }

  const iconDataUrl = await resizeIconDataUrl(response.iconDataUrl);

  await chrome.storage.local.set({
    replyIconPrompt: prompt,
    replyIconDataUrl: iconDataUrl,
  });

  renderIconPreview(iconDataUrl);
  el.iconStatus.textContent = "Saved — visible in the Threads reply bar";
  el.iconStatus.classList.add("saved");
}

async function resetReplyIcon() {
  await chrome.storage.local.remove(["replyIconPrompt", "replyIconDataUrl"]);
  el.iconPromptInput.value = "";
  renderIconPreview(null);
  el.iconStatus.textContent = "Reset — using default ✦ icon";
  el.iconStatus.classList.remove("saved");
  hideError();
}

// ─── Tone Selection ───────────────────────────────────────────
el.tonesGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".tone-btn");
  if (!btn) return;
  document.querySelectorAll(".tone-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  selectedTone = btn.dataset.tone;
  el.generateBtn.disabled = false;
  el.generateBtnText.textContent = "Generate comment";
  hideError();
});

// ─── Generate ─────────────────────────────────────────────────
el.generateBtn.addEventListener("click", generateComment);
el.regenBtn.addEventListener("click", generateComment);

async function generateComment() {
  if (isLoading || !selectedTone) return;

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
  if (!openaiKey) { showError("Add your OpenAI API key above first."); return; }

  if (!currentPostText && activeTabId) {
    try {
      const res = await chrome.tabs.sendMessage(activeTabId, { type: "GET_POST_TEXT" });
      if (res?.text) currentPostText = res.text;
    } catch {}
  }

  if (!currentPostText) {
    showError("No post text found. Open a Threads post page first.");
    return;
  }

  setLoading(true);
  hideError();
  el.resultArea.style.display = "none";

  const response = await chrome.runtime.sendMessage({
    type: "GENERATE_COMMENT",
    tone: selectedTone,
    postText: currentPostText,
    apiKey: openaiKey,
    model: openaiModel || "gpt-4o-mini",
    userVoice: userVoice || "",
    viralStrategy: useViralStrategy === false ? "" : (viralStrategy || DEFAULT_VIRAL_STRATEGY),
  });

  setLoading(false);

  if (!response) showError("No response from the extension background worker.");
  else if (response.error) showError(response.error);
  else if (response.comment) showResult(response.comment);
}

// ─── Result ───────────────────────────────────────────────────
function showResult(comment) {
  el.resultText.textContent = comment;
  el.resultArea.style.display = "block";
  hideError();
}

el.copyBtn.addEventListener("click", async () => {
  const text = el.resultText.textContent;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  const orig = el.copyBtn.innerHTML;
  el.copyBtn.innerHTML = "✓ Copied";
  setTimeout(() => { el.copyBtn.innerHTML = orig; }, 1500);
});

el.injectBtn.addEventListener("click", async () => {
  const comment = el.resultText.textContent;
  if (!comment || !activeTabId) return;
  try {
    const res = await chrome.tabs.sendMessage(activeTabId, { type: "INJECT_COMMENT", comment });
    if (res?.success) {
      el.injectBtn.innerHTML = "✓ Done!";
      el.injectBtn.style.background = "var(--accent)";
      el.injectBtn.style.color = "#0e0e0f";
      setTimeout(() => {
        el.injectBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg> Use it`;
        el.injectBtn.style.background = "";
        el.injectBtn.style.color = "";
      }, 1800);
    } else {
      showError(res?.error || "Click 'Reply' on a post first.");
    }
  } catch {
    showError("Click 'Reply' on a Threads post to open the reply box.");
  }
});

// ─── Loading ──────────────────────────────────────────────────
function setLoading(state) {
  isLoading = state;
  el.generateBtn.disabled = state;
  el.generateBtnText.style.display = state ? "none" : "";
  el.generateBtnLoader.style.display = state ? "flex" : "none";
}

function setIconLoading(state) {
  isIconLoading = state;
  el.generateIconBtn.disabled = state;
  el.resetIconBtn.disabled = state;
  el.generateIconBtn.textContent = state ? "Generating..." : "Generate icon";
}

function renderIconPreview(iconDataUrl) {
  el.iconPreview.textContent = "";
  if (iconDataUrl) {
    const img = document.createElement("img");
    img.src = iconDataUrl;
    img.alt = "Reply icon preview";
    img.addEventListener("error", () => renderIconPreview(null), { once: true });
    el.iconPreview.appendChild(img);
    return;
  }
  el.iconPreview.textContent = "✦";
}

function resizeIconDataUrl(iconDataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 128, 128);
      ctx.drawImage(img, 0, 0, 128, 128);
      resolve(canvas.toDataURL("image/webp", 0.9));
    };
    img.onerror = () => resolve(iconDataUrl);
    img.src = iconDataUrl;
  });
}

// ─── Error ────────────────────────────────────────────────────
function showError(msg) {
  el.errorText.textContent = msg;
  el.errorArea.style.display = "flex";
}
function hideError() {
  el.errorArea.style.display = "none";
}

init();
