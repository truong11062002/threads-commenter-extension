# ✦ Threads AI Auto Commenter

A Chrome extension for generating contextual AI comments on Threads with five different tones, using your own OpenAI API key.

## Personalization Features

- **Your voice**: save your personal writing style so generated comments sound more like you.
- **Threads comment strategy**: add a conversation playbook that helps comments invite genuine replies without spam or engagement bait.
- **Reply icon**: generate a custom icon with the OpenAI Images API and use it in place of the default `✦` symbol on the AI button inside the Threads reply bar.
- **GPT-5.5 support**: select `gpt-5.5` from the model picker. GPT-5.x models use the OpenAI Responses API, while older GPT-4 models continue using Chat Completions.

## Tones Available

| Tone | Style |
|------|-------|
| 😂 Funny / Meme | Internet humor, meme culture, witty one-liners |
| 🧠 Insightful | Smart takes, connects to the bigger picture |
| ❓ Curious | Interesting follow-up questions |
| 😤 Relatable | Shared experience, "me too" energy |
| 🔥 Contrarian | Respectful hot takes that challenge assumptions |

## Setup

### 1. Install The Extension

1. Open Chrome and go to `chrome://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `threads-commenter-store` folder

### 2. Add Your API Key

1. Click the extension icon in the Chrome toolbar
2. Paste your OpenAI API key (`sk-proj-...`)
3. Click **Save**

Your key is stored in `chrome.storage.local` on your machine. It is only sent to OpenAI for generation requests.

### 3. Personalize Voice, Strategy, And Icon

1. In **Your voice**, describe how you naturally talk, then click **Save voice**
2. Adjust **Threads comment strategy** if you want comments that are more likely to start real conversations
3. Toggle **Optimize for replies** on or off as needed
4. In **Reply icon**, describe the icon you want for the inline AI button
5. Click **Generate icon** to create a new icon for the Threads reply bar
6. Click **Reset** to return to the default `✦` icon

### 4. Use It

1. Open [threads.net](https://threads.net) or [threads.com](https://threads.com)
2. Open a post you want to comment on
3. Click **Reply** to open the reply box
4. Pick a model, choose a tone, and click **Generate comment**
5. Use **Use it** to insert the comment into the reply box, or **Copy** to paste manually

You can also use the **AI** button injected directly beside the icons in the Threads reply box. That button uses your saved API key, model, voice, strategy, and custom reply icon.

## Cost Estimate

- Default model: `gpt-4o-mini`
- High-quality option: `gpt-5.5`
- Around 150 tokens per comment
- Roughly $0.001 per comment
- Around $1 per 1,000 comments

Image generation costs depend on the OpenAI image model and settings used.

## Troubleshooting

**"Refresh the Threads page"** → Reload the Threads tab, then try the extension again.

**"Click Reply on a post first"** → Open a reply box before inserting a generated comment.

**"Could not detect post text"** → Open the single-post view instead of using the feed view.

**Icon generation fails** → Check your API key, image model availability, and OpenAI account limits.

## File Structure

```text
threads-commenter-store/
├── manifest.json     # Extension config (Manifest V3)
├── background.js     # Service worker for OpenAI API calls
├── content.js        # Injected into Threads for DOM interaction
└── popup/
    ├── popup.html    # Extension popup UI
    ├── popup.css     # Dark editorial styling
    └── popup.js      # Popup logic and local state
```

## Technical Notes

- **Manifest V3**: uses a service worker instead of a background page.
- **No external dependencies**: vanilla JavaScript, no build step.
- **React DOM compatibility**: uses `execCommand` to trigger React-compatible text insertion.
- **API key security**: stored in `chrome.storage.local`, never hardcoded.
- **Personalization storage**: `userVoice`, `viralStrategy`, `useViralStrategy`, `replyIconPrompt`, and `replyIconDataUrl` are stored locally.
