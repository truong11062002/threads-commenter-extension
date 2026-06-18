// background.js — Service Worker
// Handles backend API calls (avoids CORS issues from content scripts)

const API_BASE_URL = "https://threads-commenter-extension.fastapicloud.dev";

const TONE_CONFIGS = {
  simple: {
    label: "💬 Simple",
    temperature: 0.55,
    systemPrompt: `You are a clear, friendly social commenter.
Write exactly 1 sentence. Keep it simple, specific to the post, and under 15 words.
Use the same language as the post.`,
  },
  friendly: {
    label: "😊 Friendly",
    temperature: 0.65,
    systemPrompt: `You are warm, natural, and easy to talk to.
Write exactly 1 sentence that feels friendly and specific to the post. No generic praise.
Use the same language as the post.`,
  },
  funny: {
    label: "😂 Funny",
    temperature: 0.92,
    systemPrompt: `You are a witty internet commenter with sharp humor.
Write exactly 1 punchy sentence. Use internet culture, memes, or clever wordplay.
No hashtags. No emojis unless perfect. Use the same language as the post.`,
  },
  insightful: {
    label: "🧠 Insightful",
    temperature: 0.6,
    systemPrompt: `You add genuine value to conversations.
Write 1 sentence (max 2 if needed) with a real insight or smart observation.
No filler phrases. Use the same language as the post.`,
  },
  curious: {
    label: "❓ Curious",
    temperature: 0.7,
    systemPrompt: `You ask great follow-up questions.
Write exactly 1 question that makes the author want to reply. Not basic, not obvious.
Use the same language as the post.`,
  },
  relatable: {
    label: "😮‍💨 Relatable",
    temperature: 0.8,
    systemPrompt: `You deeply relate to this post.
Write exactly 1 sentence expressing genuine relatability or shared experience.
No corporate positivity. Use the same language as the post.`,
  },
  contrarian: {
    label: "🔥 Contrarian",
    temperature: 0.85,
    systemPrompt: `You respectfully challenge assumptions.
Write exactly 1 sentence with a counterpoint or unpopular-but-defensible take.
Be bold, not rude. Use the same language as the post.`,
  },
  supportive: {
    label: "💪 Supportive",
    temperature: 0.68,
    systemPrompt: `You are supportive without sounding fake.
Write exactly 1 sentence that encourages with a specific reason.
Keep it grounded. Use the same language as the post.`,
  },
  expert: {
    label: "🎯 Expert",
    temperature: 0.58,
    systemPrompt: `You are an expert with a concise take.
Write exactly 1 sentence with a practical, high-signal perspective.
No jargon. Use the same language as the post.`,
  },
  visionary: {
    label: "🚀 Visionary",
    temperature: 0.78,
    systemPrompt: `You see the bigger picture.
Write exactly 1 sentence connecting the post to a larger trend or possibility.
Not grandiose. Use the same language as the post.`,
  },
  analytical: {
    label: "📊 Analytical",
    temperature: 0.52,
    systemPrompt: `You think in patterns and tradeoffs.
Write exactly 1 sentence with a clear analytical angle or useful distinction.
Keep it human. Use the same language as the post.`,
  },
  meme: {
    label: "🐸 Meme",
    temperature: 0.95,
    systemPrompt: `You are fluent in internet meme energy.
Write exactly 1 short sentence that feels like a natural meme-style reply.
Be context-aware, not random. Use the same language as the post.`,
  },
};

const DEFAULT_USER_VOICE = [
  "positive energy, grounded and encouraging",
  "congratulate people when they share a win or make progress",
  "share small personal experiences when relevant",
  "show openness to connect, collaborate, or learn from each other",
  "keep the reply useful and human, not salesy",
  "occasionally add a small light joke when it fits naturally",
].join("\n");

const HUMAN_COMMENT_STYLE_PROMPT = `

STRICT RULES:
- Write ONLY 1 sentence. Rarely 2 very short sentences if absolutely needed.
- Total length: 5 to 20 words. NEVER exceed 20 words.
- Write in all lowercase. No capitalization.
- Write like a real person on their phone. Casual, direct, slightly imperfect.
- No bullet points, no lists, no markdown, no hashtags, no headings.
- Max 1 emoji only if it fits naturally.
- Leave the thought slightly open or unfinished.
- Tone: blunt, relatable, not trying to sound smart.
- Never toxic, never desperate for attention.
- You MAY use internet slang naturally: lol, lmao, btw, tbh, imo, fyi, idk, ikr, nvm, smh, fr, ngl, tbf, fomo, yolo, goat, irl, tldr, gg, fwiw, lmk, afaik, rn, ngl.
- For build-in-public / startup posts, you MAY use: mvp, saas, mrr, pmf, gtm, lfg, wip, ship, indie, solopreneur, churn, cac, ltv.
- Do NOT force abbreviations. Only use when natural.
- BANNED phrases: "that's a great point", "i completely agree", "this is such an important reminder", "in today's world", "exactly", "honestly", "definitely", "absolutely", "dive into", "love this", "so true".
- Use the same language as the post.`;

const X_ALGORITHM_GROWTH_PROMPT = `

X-style ranking strategy adapted for Threads:
- Optimize for real engagement signals: replies, likes, repost/share intent, profile clicks, dwell, and follow intent.
- Avoid negative signals: spammy repetition, copied/pasted wording, generic praise, rage bait, blocks, mutes, reports, and "not interested" reactions.
- Do not chase viral bait. Write the kind of reply that makes a real person pause, read, and maybe check the profile.
- Use author diversity: do not sound like the same reply under every post. Each comment must be specific to the original post.
- Build personal branding: each reply should quietly signal the user's values, taste, niche, and way of seeing the world.
- Prefer comments that make the account feel useful, positive, and follow-worthy.

Follower milestone strategy:
- 0 to 300 followers: earn trust and profile clicks. Reply with relatable observations, tiny personal experiences, and clear niche identity. Be easy to understand.
- 300 to 1000 followers: create repeatable angles people recognize. Add sharper observations, useful disagreement, or a concrete follow-up that invites replies.
- 1000 to 5000 followers: act more like a signal source. Add concise frameworks, pattern recognition, or lived lessons while keeping the tone human and not polished.

For every milestone, the best reply is short, specific, human, and conversation-worthy.`;

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "GENERATE_COMMENT") {
    handleGenerateComment(request, sendResponse);
    return true;
  }

  if (request.type === "GET_PREFERENCES") {
    handleGetPreferences(sendResponse);
    return true;
  }

  if (request.type === "GET_MODELS") {
    handleGetModels(sendResponse);
    return true;
  }

  if (request.type === "SAVE_PREFERENCES") {
    handleSavePreferences(request, sendResponse);
    return true;
  }

  if (request.type === "GET_TONES") {
    sendResponse({
      tones: Object.entries(TONE_CONFIGS).map(([key, val]) => ({
        key,
        label: val.label,
      })),
    });
    return false;
  }
});

async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get("deviceId");
  if (deviceId) return deviceId;

  const newId = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: newId });
  return newId;
}

async function getSelectedModel() {
  const { selectedModel } = await chrome.storage.local.get("selectedModel");
  return cleanString(selectedModel);
}

async function handleGetModels(sendResponse) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/models`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const data = await readJson(response);

    if (!response.ok || data?.ok === false) {
      sendResponse({
        error: readApiError(data, response) || "Could not load models.",
      });
      return;
    }

    sendResponse({
      defaultModel: cleanString(data?.defaultModel),
      models: normalizeModelOptions(data?.models),
    });
  } catch (err) {
    sendResponse({ error: `Network error: ${err.message}` });
  }
}

async function handleGetPreferences(sendResponse) {
  try {
    const deviceId = await getDeviceId();
    const response = await fetch(`${API_BASE_URL}/api/preferences?deviceId=${encodeURIComponent(deviceId)}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const data = await readJson(response);

    if (!response.ok || data?.ok === false) {
      sendResponse({
        error: readApiError(data, response) || "Could not load preferences.",
      });
      return;
    }

    sendResponse({
      preferences: normalizePreferences(data?.preferences, deviceId),
    });
  } catch (err) {
    sendResponse({ error: `Network error: ${err.message}` });
  }
}

async function handleSavePreferences(request, sendResponse) {
  const deviceId = await getDeviceId();
  const payload = {
    deviceId,
    userVoice: cleanString(request.userVoice),
    viralStrategy: cleanString(request.viralStrategy),
    useViralStrategy: request.useViralStrategy !== false,
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/preferences`, {
      method: "PUT",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await readJson(response);

    if (!response.ok || data?.ok === false) {
      sendResponse({
        error: readApiError(data, response) || "Could not save preferences.",
      });
      return;
    }

    const preferences = normalizePreferences(data?.preferences || payload, deviceId);
    await chrome.storage.local.set({
      userVoice: preferences.userVoice,
      viralStrategy: preferences.viralStrategy,
      useViralStrategy: preferences.useViralStrategy,
    });
    sendResponse({ preferences });
  } catch (err) {
    sendResponse({ error: `Network error: ${err.message}` });
  }
}

async function handleGenerateComment(request, sendResponse) {
  const postText = cleanString(request.postText);
  const tone = cleanString(request.tone);
  const authorName = cleanString(request.authorName);
  const authorUsername = normalizeAuthorUsername(request.authorUsername);

  if (!postText || postText.length < 5 || postText.length > 4000) {
    sendResponse({ error: "Post text must be 5-4000 characters." });
    return;
  }

  if (!authorName || !authorUsername) {
    sendResponse({ error: "Could not extract author details. Try refreshing the Threads post." });
    return;
  }

  if (!TONE_CONFIGS[tone]) {
    sendResponse({ error: "Unsupported tone" });
    return;
  }

  const deviceId = await getDeviceId();
  const selectedModel = cleanString(request.model) || await getSelectedModel();

  const payload = {
    postText,
    authorName,
    authorUsername,
    tone,
    deviceId,
  };

  const pageUrl = cleanString(request.pageUrl);
  const userVoice = cleanString(request.userVoice);
  const viralStrategy = cleanString(request.viralStrategy);
  const threadContext = cleanString(request.threadContext);
  const targetUser = cleanString(request.targetUser);
  const loggedInUser = cleanString(request.loggedInUser);
  if (pageUrl) payload.pageUrl = pageUrl;
  if (userVoice) payload.userVoice = userVoice;
  if (viralStrategy) payload.viralStrategy = viralStrategy;
  if (threadContext) payload.threadContext = threadContext;
  if (targetUser) payload.targetUser = targetUser;
  if (loggedInUser) payload.loggedInUser = loggedInUser;
  if (selectedModel) payload.model = selectedModel;

  try {
    const response = await fetch(`${API_BASE_URL}/api/comments/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await readJson(response);

    if (!response.ok || data?.ok === false) {
      sendResponse({
        error: readApiError(data, response) || "Generation failed.",
      });
      return;
    }

    const comment = formatHumanComment(data?.comment);
    if (!comment) {
      sendResponse({ error: "Empty response from API. Try again." });
      return;
    }

    sendResponse({ comment });
  } catch (err) {
    sendResponse({ error: `Network error: ${err.message}` });
  }
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAuthorUsername(value) {
  const username = cleanString(value);
  if (!username) return "";
  return username.startsWith("@") ? username : `@${username}`;
}

function normalizePreferences(rawPreferences, fallbackDeviceId) {
  return {
    deviceId: cleanString(rawPreferences?.deviceId) || fallbackDeviceId,
    userVoice: cleanString(rawPreferences?.userVoice),
    viralStrategy: cleanString(rawPreferences?.viralStrategy),
    useViralStrategy: rawPreferences?.useViralStrategy !== false,
  };
}

function normalizeModelOptions(rawModels) {
  if (!Array.isArray(rawModels)) return [];

  return rawModels
    .map(model => ({
      key: cleanString(model?.key),
      label: cleanString(model?.label),
      description: cleanString(model?.description),
    }))
    .filter(model => model.key && model.label);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readApiError(data, response) {
  return data?.error?.message
    || data?.detail?.message
    || (typeof data?.detail === "string" ? data.detail : "")
    || data?.message
    || response?.statusText
    || "";
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

  return chunks.slice(0, 2).join("\n\n");
}

function splitIntoSentenceLikeChunks(text) {
  const pieces = text
    .split(/(?<=[.!?])\s*/)
    .map(piece => piece.trim())
    .filter(Boolean);

  return pieces.length > 0 ? pieces : [text];
}
