# Threads AI Commenter

Generate on-brand, context-aware replies on Threads without leaving the reply box.

<a href="https://postimg.cc/gxg7CtLQ" target="_blank"><img src="https://i.postimg.cc/DzhKbtvv/image.png" border="0" alt="Threads AI Commenter preview"></a>

Threads AI Commenter is a Chrome extension for creators, founders, indie hackers, and teams who want to reply faster while keeping their own voice. It reads the active Threads post, lets you choose a comment style, and inserts a short AI-generated reply directly into the Threads reply composer.

## Why It Exists

Building in public works best when you show up consistently. The hard part is not only posting; it is replying with comments that feel specific, useful, and human. This extension helps you turn more conversations into thoughtful replies without sounding generic.

## What You Can Do

- **Reply in your own voice**: save your writing style so comments sound more like you.
- **Choose the AI model**: load the available model list from the backend and pick the model from the extension popup.
- **Optimize for real conversations**: use a Threads comment strategy that invites meaningful replies without spam or engagement bait.
- **Grow by milestone**: apply X-style engagement signals for `0 -> 300`, `300 -> 1000`, and `1000 -> 5000` follower stages.
- **Build personal brand**: replies aim to be useful, positive, grounded, and consistent with your values and niche.
- **Sound human on mobile**: comments stay lowercase, short, blunt, clear, and easy to scan, with a blank line between each sentence or thought.
- **Pick the right tone**: choose from 12 quick tones, including Simple, Friendly, Funny, Insightful, Curious, Relatable, Contrarian, Supportive, Expert, Visionary, Analytical, and Meme.
- **Format comments cleanly**: use `Shift+Enter` for a new line while composing inside Threads.
- **Stay in flow**: generate and insert replies directly from the Threads reply box.

## How It Works

1. Open the extension popup.
2. Open a Threads post and click **Reply**.
3. Click the inline **AI** button in the reply box.
4. Choose a tone.
5. Review, insert, or copy the generated reply.
6. Use `Shift+Enter` inside the Threads composer to split each sentence onto its own line.

The extension stores a generated device ID locally, then saves voice and strategy preferences through `https://threads-commenter-extension.fastapicloud.dev/api/preferences`. Comment generation goes through `https://threads-commenter-extension.fastapicloud.dev/api/comments/generate` with the focal post plus the visible thread context, and uses the saved backend preferences for that device.

Chrome Web Store product copy is available in [`docs/chrome-web-store-listing.md`](docs/chrome-web-store-listing.md).

## Who It Is For

- Indie hackers building in public
- Founders replying to customers and community members
- Creators who want faster, more consistent engagement
- Growth teams testing comment styles on Threads
- Solo builders who want useful replies without sounding automated

## Tones Available

| Tone | Best For |
|------|----------|
| 💬 Simple | Clear, useful replies that are easy to understand |
| 😊 Friendly | Warm, easygoing replies that feel natural |
| 😂 Funny | Light humor and punchy one-liners |
| 🧠 Insightful | Smart observations and added context |
| ❓ Curious | Follow-up questions that invite real conversation |
| 😮‍💨 Relatable | Warm, human, shared-experience comments |
| 🔥 Contrarian | Respectful counterpoints and fresh angles |
| 💪 Supportive | Grounded encouragement and validation |
| 🎯 Expert | Practical, credible, high-signal replies |
| 🚀 Visionary | Big-picture angles and future-facing takes |
| 📊 Analytical | Pattern-based, evidence-aware replies |
| 🐸 Meme | Playful internet energy |

## Growth Strategy

The default strategy is inspired by X-style ranking signals from `xai-org/x-algorithm`: replies, likes, repost/share intent, profile clicks, dwell, and follow intent. It also avoids negative signals such as spammy repetition, copied wording, generic praise, rage bait, blocks, mutes, reports, and not-interested reactions.

Every generated reply is also guided to support personal branding: useful to the reader, positive without sounding fake, grounded in a real observation, and consistent enough that people can recognize the account's point of view over time.

| Milestone | Comment Strategy |
|-----------|------------------|
| `0 -> 300` | Earn trust and profile clicks with relatable observations, tiny personal experiences, and clear niche identity |
| `300 -> 1000` | Build recognizable angles with sharper observations, useful disagreement, or concrete reply angles |
| `1000 -> 5000` | Become a concise signal source with pattern recognition, simple frameworks, or lived lessons |

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.

## Chrome Web Store Submission

Build the upload package from the project root:

```bash
node scripts/build-store-package.js
```

Upload the generated file in `dist/`, for example:

```text
dist/threads-ai-commenter-v1.3.0.zip
```

Do not upload a `.crx` file, and do not zip the parent folder manually. The generated ZIP keeps `manifest.json` at the archive root and includes only the extension runtime files.

To verify an existing package before upload:

```bash
node scripts/build-store-package.js --verify dist/threads-ai-commenter-v1.3.0.zip
```

## Setup

1. Click the extension icon in the Chrome toolbar.
2. Add your personal voice in **Your voice**.
3. Adjust **Threads comment strategy** if you want a different reply style.
4. Open a Threads post and click **Reply**.
5. Pick a tone and generate a comment.

The default voice uses positive energy, celebrates other people's wins, shares relevant personal experience, stays open to connection or collaboration, and occasionally adds a light joke when it fits.

## API

- Base URL: `https://threads-commenter-extension.fastapicloud.dev`
- Models: `GET /api/models`
- Preferences: `GET /api/preferences`, `PUT /api/preferences`
- Generation: `POST /api/comments/generate`

## Privacy

- Your generated device ID is stored locally.
- Your voice and strategy settings are saved by the Threads AI Commenter API for that device, with a local cache in the extension.
- The focal post text and visible thread context are sent to the Threads AI Commenter API only when you generate a reply.
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
