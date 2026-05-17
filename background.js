// background.js — Service Worker
// Handles OpenAI API calls (avoids CORS issues from content scripts)

const TONE_CONFIGS = {
  simple: {
    label: "▫ Simple",
    temperature: 0.55,
    systemPrompt: `You are a clear, friendly social commenter.
Write a SHORT comment (1-2 sentences) that is simple, easy to understand, and useful.
Avoid trying to sound clever. If a tiny joke fits naturally, add it lightly.
Use the same language as the post.`,
  },
  funny: {
    label: "😂 Funny / Meme",
    temperature: 0.92,
    systemPrompt: `You are a witty internet commenter with sharp humor. 
Write a SHORT, punchy comment (1-2 sentences max) that is funny, uses internet culture, memes, or clever wordplay.
Be genuine and context-aware — not random. Think Twitter/X reply energy but on Threads.
No hashtags. No emojis unless they land perfectly. Use the same language as the post.`,
  },
  insightful: {
    label: "🧠 Insightful / Smart take",
    temperature: 0.6,
    systemPrompt: `You are a thoughtful person who adds genuine value to conversations.
Write a SHORT comment (1-3 sentences) that provides real insight, a smart observation, or connects this to a bigger picture.
Sound like a knowledgeable friend, not a professor. No filler phrases like "Great point!".
Use the same language as the post.`,
  },
  curious: {
    label: "❓ Curious / Question-driven",
    temperature: 0.7,
    systemPrompt: `You are genuinely curious and ask great follow-up questions.
Write a SHORT comment (1-2 sentences) that asks a genuinely interesting question sparked by this post.
The question should make the author want to reply. Not basic, not obvious — dig deeper.
Use the same language as the post.`,
  },
  relatable: {
    label: "😤 Relatable / Shared pain",
    temperature: 0.8,
    systemPrompt: `You are someone who deeply relates to this post and wants to express solidarity.
Write a SHORT, authentic comment (1-2 sentences) that expresses genuine relatability — shared experience, validation, or "me too" energy.
Sound human and warm. No corporate positivity. Use the same language as the post.`,
  },
  contrarian: {
    label: "🔥 Contrarian / Hot take",
    temperature: 0.85,
    systemPrompt: `You are intellectually provocative but not toxic. You respectfully challenge assumptions.
Write a SHORT comment (1-2 sentences) that offers a counterpoint or unpopular-but-defensible perspective.
Be bold, not rude. Make people think. Don't just disagree to disagree — have a real angle.
Use the same language as the post.`,
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
- After every sentence ending with ".", "!", or "?", start a new line using "\n".
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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GENERATE_COMMENT") {
    handleGenerateComment(request, sendResponse);
    return true; // Keep channel open for async response
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

async function handleGenerateComment(request, sendResponse) {
  const { tone, postText, apiKey } = request;
  const userVoice = typeof request.userVoice === "string" && request.userVoice.trim()
    ? request.userVoice.trim()
    : DEFAULT_USER_VOICE;
  const viralStrategy = typeof request.viralStrategy === "string" ? request.viralStrategy.trim() : "";
  const model = request.model || "gpt-4o-mini";

  if (!apiKey) {
    sendResponse({ error: "No API key set. Please add your OpenAI key in settings." });
    return;
  }

  if (!postText || postText.trim().length < 5) {
    sendResponse({ error: "Could not extract post text. Try clicking directly on a post." });
    return;
  }

  const config = TONE_CONFIGS[tone];
  if (!config) {
    sendResponse({ error: "Invalid tone selected." });
    return;
  }

  try {
    const voiceInstruction = userVoice
      ? `\n\nUser voice to follow:\n${userVoice}\n\nAdapt the reply to this voice: match the user's vocabulary, casual/formal level, language preference, rhythm, humor, boundaries, and personality. Keep it authentic; do not mention that you are following a voice profile.`
      : "";

    const viralInstruction = viralStrategy
      ? `\n\nThreads comment strategy:\n${viralStrategy}\n\nUse this as a quality strategy, not as manipulation. The comment should invite real back-and-forth when natural, add context or a fresh angle, and avoid engagement bait or spam.`
      : "";

    if (usesResponsesApi(model)) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_output_tokens: 150,
          instructions: config.systemPrompt + voiceInstruction + viralInstruction + HUMAN_COMMENT_STYLE_PROMPT + X_ALGORITHM_GROWTH_PROMPT,
          input: `Here is the Threads post to comment on:\n\n"${postText}"\n\nWrite your comment now. Just the comment text, nothing else.`,
        }),
      });

      if (!response.ok) {
        const err = await readOpenAIError(response);
        sendResponse({ error: `OpenAI error: ${err.error?.message || response.statusText}` });
        return;
      }

      const data = await response.json();
      const comment = formatHumanComment(extractResponseText(data));

      if (!comment) {
        sendResponse({ error: "Empty response from AI. Try again." });
        return;
      }

      sendResponse({ comment });
      return;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 150,
        temperature: config.temperature,
        messages: [
          {
            role: "system",
            content: config.systemPrompt + voiceInstruction + viralInstruction + HUMAN_COMMENT_STYLE_PROMPT + X_ALGORITHM_GROWTH_PROMPT,
          },
          {
            role: "user",
            content: `Here is the Threads post to comment on:\n\n"${postText}"\n\nWrite your comment now. Just the comment text, nothing else.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await readOpenAIError(response);
      sendResponse({ error: `OpenAI error: ${err.error?.message || response.statusText}` });
      return;
    }

    const data = await response.json();
    const comment = formatHumanComment(data.choices?.[0]?.message?.content);

    if (!comment) {
      sendResponse({ error: "Empty response from AI. Try again." });
      return;
    }

    sendResponse({ comment });
  } catch (err) {
    sendResponse({ error: `Network error: ${err.message}` });
  }
}

function usesResponsesApi(model) {
  return /^gpt-5(\.|-|$)/.test(model);
}

function extractResponseText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const outputText = data.output
    ?.flatMap(item => item.content || [])
    ?.filter(content => content.type === "output_text" && typeof content.text === "string")
    ?.map(content => content.text)
    ?.join("")
    ?.trim();

  return outputText || null;
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

  return chunks.slice(0, 3).join("\n");
}

function splitIntoSentenceLikeChunks(text) {
  const pieces = text
    .split(/(?<=[.!?])\s*/)
    .map(piece => piece.trim())
    .filter(Boolean);

  return pieces.length > 0 ? pieces : [text];
}

async function readOpenAIError(response) {
  try {
    return await response.json();
  } catch {
    return { error: { message: response.statusText } };
  }
}
