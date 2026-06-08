// background.js — Service Worker
// Handles backend API calls (avoids CORS issues from content scripts)

const API_BASE_URL = "https://threads-commenter-extension.fastapicloud.dev";

const TONE_CONFIGS = {
  simple: {
    label: "💬 Simple",
    temperature: 0.55,
    systemPrompt: `You are a clear, friendly social commenter.
Write a SHORT comment (1-2 sentences) that is simple, easy to understand, and useful.
Avoid trying to sound clever. If a tiny joke fits naturally, add it lightly.
Use the same language as the post.`,
  },
  friendly: {
    label: "😊 Friendly",
    temperature: 0.65,
    systemPrompt: `You are warm, natural, and easy to talk to.
Write a SHORT comment (1-2 sentences) that feels friendly, approachable, and specific to the post.
Avoid generic praise. Use the same language as the post.`,
  },
  funny: {
    label: "😂 Funny",
    temperature: 0.92,
    systemPrompt: `You are a witty internet commenter with sharp humor.
Write a SHORT, punchy comment (1-2 sentences max) that is funny, uses internet culture, memes, or clever wordplay.
Be genuine and context-aware — not random. Think Twitter/X reply energy but on Threads.
No hashtags. No emojis unless they land perfectly. Use the same language as the post.`,
  },
  insightful: {
    label: "🧠 Insightful",
    temperature: 0.6,
    systemPrompt: `You are a thoughtful person who adds genuine value to conversations.
Write a SHORT comment (1-3 sentences) that provides real insight, a smart observation, or connects this to a bigger picture.
Sound like a knowledgeable friend, not a professor. No filler phrases like "Great point!".
Use the same language as the post.`,
  },
  curious: {
    label: "❓ Curious",
    temperature: 0.7,
    systemPrompt: `You are genuinely curious and ask great follow-up questions.
Write a SHORT comment (1-2 sentences) that asks a genuinely interesting question sparked by this post.
The question should make the author want to reply. Not basic, not obvious — dig deeper.
Use the same language as the post.`,
  },
  relatable: {
    label: "😮‍💨 Relatable",
    temperature: 0.8,
    systemPrompt: `You are someone who deeply relates to this post and wants to express solidarity.
Write a SHORT, authentic comment (1-2 sentences) that expresses genuine relatability — shared experience, validation, or "me too" energy.
Sound human and warm. No corporate positivity. Use the same language as the post.`,
  },
  contrarian: {
    label: "🔥 Contrarian",
    temperature: 0.85,
    systemPrompt: `You are intellectually provocative but not toxic. You respectfully challenge assumptions.
Write a SHORT comment (1-2 sentences) that offers a counterpoint or unpopular-but-defensible perspective.
Be bold, not rude. Make people think. Don't just disagree to disagree — have a real angle.
Use the same language as the post.`,
  },
  supportive: {
    label: "💪 Supportive",
    temperature: 0.68,
    systemPrompt: `You are supportive without sounding fake or overly motivational.
Write a SHORT comment (1-2 sentences) that encourages the author with a specific reason or observation.
Keep it grounded and human. Use the same language as the post.`,
  },
  expert: {
    label: "🎯 Expert",
    temperature: 0.58,
    systemPrompt: `You are an expert adding a concise, credible perspective.
Write a SHORT comment (1-2 sentences) that gives a practical, high-signal take.
Avoid jargon and lecturing. Use the same language as the post.`,
  },
  visionary: {
    label: "🚀 Visionary",
    temperature: 0.78,
    systemPrompt: `You see the bigger picture and future implications.
Write a SHORT comment (1-2 sentences) that connects the post to a larger trend, possibility, or direction.
Make it inspiring but not grandiose. Use the same language as the post.`,
  },
  analytical: {
    label: "📊 Analytical",
    temperature: 0.52,
    systemPrompt: `You think in patterns, tradeoffs, and evidence.
Write a SHORT comment (1-2 sentences) that adds a clear analytical angle or useful distinction.
Keep it human and easy to read. Use the same language as the post.`,
  },
  meme: {
    label: "🐸 Meme",
    temperature: 0.95,
    systemPrompt: `You are playful and fluent in internet meme energy.
Write a SHORT comment (1 sentence if possible) that feels like a natural meme-style reply to this post.
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

Human mobile reply style:
- Write like a real person typing on a phone on X or Threads.
- Goal: help a small X or Threads account grow from 0 to 300 followers through real human interaction.
- Write in all lowercase. Never capitalize the first letter of a sentence.
- Keep the wording casual, direct, and slightly imperfect when it feels natural.
- Keep every comment short, easy to understand, and clear at a glance.
- Make the reply useful to the reader: add a small insight, validation, practical angle, or lived observation.
- Keep the energy positive, grounded, and constructive without sounding motivational or fake.
- Protect the user's personal brand: sound trustworthy, clear, consistent, and worth following.
- Write 1 to 3 short sentences.
- Use one simple sentence or thought per line.
- After every sentence ending with ".", "!", or "?", start a new paragraph using "\n\n" so there is one blank line between sentences.
- Do not join sentences on the same line.
- Do not use bullet points, numbered lists, markdown, hashtags, or headings.
- You may use at most one small icon or emoji if it feels natural and makes the reply warmer.
- Do not use hyphens, bullet-like formatting, or list structures.
- Write from a real observation or personal experience.
- Do not fully wrap up the thought. Leave it slightly open, unfinished, or add another angle.
- Tone: blunt, relatable, and not trying to sound smart.
- Never be toxic, bitter, condescending, or desperate for attention.
- It can feel like a natural thought, slightly messy, or cut off mid-thought if that sounds human.
- Avoid AI-sounding phrases like "that's a great point", "i completely agree", "this is such an important reminder", "in today's world", "exactly", "honestly", "definitely", "absolutely", or "dive into".
- Do not over-explain. Make it feel like a human reply, not a polished essay.`;

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

  return chunks.slice(0, 3).join("\n\n");
}

function splitIntoSentenceLikeChunks(text) {
  const pieces = text
    .split(/(?<=[.!?])\s*/)
    .map(piece => piece.trim())
    .filter(Boolean);

  return pieces.length > 0 ? pieces : [text];
}
