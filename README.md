# Zenbot

Zenbot is a lightweight Chrome extension for Zendesk support agents. It reads the open ticket, creates a concise summary and suggested next steps, and turns a short agent instruction into a complete customer reply.

Generated replies are inserted into Zendesk's **Public reply** composer for review. Zenbot never submits a ticket automatically.

## Features

- Summarises the currently open Zendesk ticket
- Separates key ticket facts from suggested next steps
- Generates polished customer replies from short agent instructions
- Inserts generated content into Zendesk's Public reply editor
- Supports custom tone instructions, response length and email signatures
- Can generate from either the full ticket or a prepared summary
- Provides configurable summary detail and model selection
- Stores settings locally in Chrome
- Uses no frontend framework, build process or runtime dependencies

## Requirements

- Google Chrome or another Chromium browser that supports Manifest V3
- Access to Zendesk Agent Workspace
- An OpenAI API key
- Node.js for running the optional development checks

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the `zenbot-extension-mvp` directory.
6. Open the Zenbot extension from the Chrome toolbar.
7. Enter your OpenAI API key and select **Save key**.

After changing extension files, select **Reload** on the Chrome extensions page and refresh the Zendesk ticket.

## Usage

1. Open a Zendesk URL matching `https://*.zendesk.com/agent/tickets/*`.
2. Select the **Z** icon added to the right-hand Zendesk panel.
3. Review the ticket summary and suggested next steps.
4. Enter a short instruction describing what the response should say.
5. Press **Enter** or select **Generate reply**.
6. Review the generated reply in Zendesk's Public reply composer.
7. Edit and submit it manually when satisfied.

Use **Shift+Enter** to add a new line to the instruction instead of generating a reply.
Zenbot displays the model-generation time beside the Generate reply button after each successful response.

## Settings

Settings are available from the **Settings** tab inside the Zenbot panel.

### Personalisation

- Custom email signature
- Custom tone instructions
- Concise, balanced or detailed responses

### Workflow

- Automatically summarise tickets when Zenbot opens
- Generate responses from the full ticket or the prepared summary
- Low, medium or high summary detail

When summary-based response generation is enabled, Zenbot disables the reply controls until a summary has been created.

### Advanced

- Summary model selection
- Response-generation model selection
- Reasoning-effort controls for supported models

Each setting includes an information button explaining the available options and their trade-offs.

## Project structure

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome Manifest V3 configuration and permissions |
| `content.js` | Mounts Zenbot in Zendesk and handles panel interactions |
| `panel.html` | Zenbot panel markup |
| `panel.css` | Panel and settings styling |
| `settings-info.js` | Explanatory settings content |
| `background.mjs` | OpenAI requests, reply formatting and CKEditor insertion |
| `popup.html` / `popup.js` | OpenAI API-key setup |
| `check.mjs` | Lightweight regression checks |

## Development

The project intentionally has no package dependencies or build step. Run the checks directly with Node.js:

```powershell
node check.mjs
node --check background.mjs
node --check content.js
node --check settings-info.js
node --check popup.js
```

Then reload the unpacked extension and refresh Zendesk for manual testing.

## How it works

Zenbot runs a content script on Zendesk ticket pages and reads the ticket messages rendered in Agent Workspace. Summary and response requests are sent to the OpenAI Responses API by the extension service worker.

Generated replies are inserted through Zendesk's CKEditor model rather than by changing the page HTML directly. This lets the content remain editable in the Public reply composer.

## Privacy and security

- The OpenAI API key and Zenbot preferences are stored in Chrome's local extension storage.
- Ticket content is sent to OpenAI when Zenbot creates a summary or generates a response from the full ticket.
- When summary-based generation is selected, the generated summary and next steps are sent for response generation instead of the full ticket.
- OpenAI requests use `store: false`.
- Zenbot does not submit Zendesk tickets automatically.

The direct API-key design is intended for trusted internal MVP use. Add an authenticated backend and appropriate organisational controls before distributing Zenbot more broadly.

## Known limitations

- Ticket extraction is limited to messages currently rendered in Zendesk's DOM.
- Very long, collapsed or virtualised ticket histories may be incomplete.
- Zendesk DOM selectors can change after Agent Workspace updates.
- The extension currently supports Zendesk ticket URLs only.
- The API key is stored locally rather than managed by a backend.

## Troubleshooting

If the Zenbot icon or latest interface does not appear:

1. Open `chrome://extensions`.
2. Select **Reload** for Zenbot.
3. Refresh the Zendesk ticket page.
4. Confirm the page URL is a Zendesk agent ticket.

If reply insertion fails, confirm the Zendesk composer is set to **Public reply** before generating.
