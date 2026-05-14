// background.js — Service Worker
// Handles OpenAI API calls (avoids CORS issues from content scripts)

const TONE_CONFIGS = {
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

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GENERATE_COMMENT") {
    handleGenerateComment(request, sendResponse);
    return true; // Keep channel open for async response
  }

  if (request.type === "GENERATE_REPLY_ICON") {
    handleGenerateReplyIcon(request, sendResponse);
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
  const userVoice = typeof request.userVoice === "string" ? request.userVoice.trim() : "";
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
          instructions: config.systemPrompt + voiceInstruction + viralInstruction,
          input: `Here is the Threads post to comment on:\n\n"${postText}"\n\nWrite your comment now. Just the comment text, nothing else.`,
        }),
      });

      if (!response.ok) {
        const err = await readOpenAIError(response);
        sendResponse({ error: `OpenAI error: ${err.error?.message || response.statusText}` });
        return;
      }

      const data = await response.json();
      const comment = extractResponseText(data);

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
            content: config.systemPrompt + voiceInstruction + viralInstruction,
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
    const comment = data.choices?.[0]?.message?.content?.trim();

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

async function handleGenerateReplyIcon(request, sendResponse) {
  const { apiKey } = request;
  const iconPrompt = typeof request.prompt === "string" ? request.prompt.trim() : "";

  if (!apiKey) {
    sendResponse({ error: "No API key set. Please add your OpenAI key first." });
    return;
  }

  if (iconPrompt.length < 3) {
    sendResponse({ error: "Describe the icon you want first." });
    return;
  }

  const prompt = [
    "Create a simple, polished app icon for a Chrome extension button on Threads.",
    "The icon must work at 16-24px, use a clean centered symbol, no text, no letters, no watermark.",
    "Prefer transparent background if supported; otherwise use a simple high-contrast background.",
    `User idea: ${iconPrompt}`,
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.imageModel || "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "low",
        output_format: "png",
        background: "transparent",
      }),
    });

    if (!response.ok) {
      const err = await readOpenAIError(response);
      sendResponse({ error: `OpenAI image error: ${err.error?.message || response.statusText}` });
      return;
    }

    const data = await response.json();
    const image = data.data?.[0];
    const base64 = image?.b64_json;

    if (!base64) {
      sendResponse({ error: "OpenAI did not return an image. Try a simpler icon prompt." });
      return;
    }

    sendResponse({ iconDataUrl: `data:image/png;base64,${base64}` });
  } catch (err) {
    sendResponse({ error: `Network error: ${err.message}` });
  }
}

async function readOpenAIError(response) {
  try {
    return await response.json();
  } catch {
    return { error: { message: response.statusText } };
  }
}
