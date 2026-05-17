# Threads AI Commenter

Generate on-brand, context-aware replies on Threads without leaving the reply box.

<a href="https://postimg.cc/gxg7CtLQ" target="_blank"><img src="https://i.postimg.cc/DzhKbtvv/image.png" border="0" alt="Threads AI Commenter preview"></a>

Threads AI Commenter is a Chrome extension for creators, founders, indie hackers, and teams who want to reply faster while keeping their own voice. It reads the active Threads post, lets you choose a comment style, and inserts a short AI-generated reply directly into the Threads reply composer.

## Why It Exists

Building in public works best when you show up consistently. The hard part is not only posting; it is replying with comments that feel specific, useful, and human. This extension helps you turn more conversations into thoughtful replies without sounding generic.

## What You Can Do

- **Reply in your own voice**: save your writing style so comments sound more like you.
- **Optimize for real conversations**: use a Threads comment strategy that invites meaningful replies without spam or engagement bait.
- **Grow by milestone**: apply X-style engagement signals for `0 -> 300`, `300 -> 1000`, and `1000 -> 5000` follower stages.
- **Build personal brand**: replies aim to be useful, positive, grounded, and consistent with your values and niche.
- **Sound human on mobile**: comments stay lowercase, short, blunt, clear, and easy to scan, with a blank line between each sentence or thought.
- **Pick the right tone**: choose Funny, Insightful, Curious, Relatable, or Contrarian.
- **Use GPT-5.5**: select `gpt-5.5` for higher-quality replies through the OpenAI Responses API.
- **Stay in flow**: generate and insert replies directly from the Threads reply box.

## How It Works

1. Open a Threads post.
2. Click **Reply**.
3. Click the inline **AI** button or open the extension popup.
4. Choose a tone.
5. Review, insert, or copy the generated reply.

The extension uses your own OpenAI API key. Your key and personalization settings are stored locally in `chrome.storage.local`.

## Who It Is For

- Indie hackers building in public
- Founders replying to customers and community members
- Creators who want faster, more consistent engagement
- Growth teams testing comment styles on Threads
- Solo builders who want useful replies without sounding automated

## Tones Available

| Tone | Best For |
|------|----------|
| Funny / Meme | Light replies, internet humor, punchy one-liners |
| Insightful | Smart observations and added context |
| Curious | Follow-up questions that invite real conversation |
| Relatable | Warm, human, shared-experience comments |
| Contrarian | Respectful counterpoints and fresh angles |

## Growth Strategy

The default strategy is inspired by X-style ranking signals from `xai-org/x-algorithm`: replies, likes, repost/share intent, profile clicks, dwell, and follow intent. It also avoids negative signals such as spammy repetition, copied wording, generic praise, rage bait, blocks, mutes, reports, and not-interested reactions.

Every generated reply is also guided to support personal branding: useful to the reader, positive without sounding fake, grounded in a real observation, and consistent enough that people can recognize the account's point of view over time.

| Milestone | Comment Strategy |
|-----------|------------------|
| `0 -> 300` | Earn trust and profile clicks with relatable observations, tiny personal experiences, and clear niche identity |
| `300 -> 1000` | Build recognizable angles with sharper observations, useful disagreement, or concrete follow-ups |
| `1000 -> 5000` | Become a concise signal source with pattern recognition, simple frameworks, or lived lessons |

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.

## Setup

1. Click the extension icon in the Chrome toolbar.
2. Paste your OpenAI API key.
3. Choose your preferred model.
4. Add your personal voice in **Your voice**.
5. Adjust **Threads comment strategy** if you want a different reply style.

## Models

- Default: `gpt-4o-mini`
- Higher quality: `gpt-5.5`
- Other supported options: `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`

GPT-5.x models use the OpenAI Responses API. Older GPT-4 models continue using Chat Completions.

## Privacy

- Your OpenAI API key is stored locally.
- Your voice and strategy settings are stored locally.
- Post text is sent to OpenAI only when you generate a reply.
- No external analytics or tracking are included.

## Troubleshooting

**No post text found**  
Open a single Threads post page, then try again.

**No reply box found**  
Click **Reply** on the post before using **Use it** or the inline AI button.

**The AI button does not appear**  
Refresh the Threads page and open the reply box again.

## Project Structure

```text
threads-commenter-store/
├── manifest.json
├── background.js
├── content.js
├── icons/
└── popup/
    ├── popup.html
    ├── popup.css
    └── popup.js
```

## License

This project is licensed under the terms in [LICENSE](LICENSE).
