# Zenbot

Zenbot is a lightweight Chrome extension for Zendesk support agents. It reads the open ticket, creates a concise summary and suggested next steps, and turns a short agent instruction into a complete customer reply.

Generated replies are inserted into Zendesk's **Public reply** composer for review. Zenbot never submits a ticket automatically.

## Versions

The current release is **0.3.1**. The installed version appears beside the Zenbot title in both the Zendesk panel and Chrome toolbar popup. Both labels read `manifest.json`, so changing the release number there updates them together after reloading the extension.

Use `MAJOR.MINOR.PATCH`: PATCH for fixes, MINOR for new features or substantial improvements, and MAJOR for incompatible changes. Change the version only when the user explicitly requests a new version or release. Routine changes stay under the current version's entry in [CHANGELOG.md](CHANGELOG.md). When a new version is requested, update `manifest.json` and add a dated changelog entry.

## Features

- Summarises the currently open Zendesk ticket
- Separates key ticket facts from suggested next steps
- Generates polished customer replies from short agent instructions
- Formats replies with bold, italics, paragraphs, and compact or spaced bullet/numbered lists
- Inserts generated content into Zendesk's Public reply editor
- Supports custom tone instructions, response length and email signatures
- Can generate from either the full ticket or a prepared summary
- Provides configurable summary detail and reasoning effort
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

Zenbot formats replies automatically: lists for multiple items, spaced list items, title-style hyperlinks for supplied URLs, and both bold and italics for exact identifiers such as part numbers, addresses and vehicle details. You can add instructions to refine the presentation, including Markdown-style intent such as `**bold this**` or `*italicise this*`. Zenbot generates structured rich text and inserts formatted HTML into Zendesk; it does not paste Markdown markers or parse arbitrary Markdown documents. Formatting remains editable in the Public reply composer. Custom signatures retain their plain-text content and line breaks. Links use known page titles or descriptive labels; Zenbot does not browse pages or invent destinations.

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

- Summaries use gpt-6-luna
- Responses use gpt-6-luna
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
| `rich-text.mjs` | Structured reply format, validation, and escaped HTML conversion |
| `popup.html` / `popup.js` | OpenAI API-key setup |
| `check.mjs` | Lightweight regression checks |

## Development

The project intentionally has no package dependencies or build step. Run the checks directly with Node.js:

```powershell
node check.mjs
node mount-check.mjs
node ticket-check.mjs
node rich-text-check.mjs
node --check background.mjs
node --check content.js
node --check settings-info.js
node --check popup.js
```

Then reload the unpacked extension and refresh Zendesk for manual testing.

## How it works

Zenbot loads its content script throughout Zendesk's `/agent/` pages so it can attach when you navigate from Home or Views to a ticket without refreshing. It restores its button and panel when Zendesk rebuilds the sidebar, and reads ticket messages rendered in Agent Workspace. Summary and response requests are sent to the OpenAI Responses API by the extension service worker.

Each open ticket sidebar keeps its own Zenbot button and panel, including its note and summary, while you switch between tickets. Generating a reply uses the currently visible ticket and its corresponding Public reply editor.

The draft instruction remains after reply insertion so you can edit or reuse it. Drafts are kept separately by ticket ID during the current page session, even if Zendesk reuses the same sidebar for another ticket. Refreshing the page clears these session drafts.

The panel floats beside the ticket rail outside Zendesk's sidebar containers, so a collapsed sidebar cannot clip it. Close it with the × button, Escape, or the Z button. Switching tickets hides the previous ticket's panel and preserves its note.

When the native menu is expanded, Zenbot matches its width and left edge and follows menu resizing. If the menu is collapsed, Zenbot uses that ticket's last measured menu width, or 400px until a menu width is available. The panel ends at the measured top edge of the visible ticket submit toolbar and follows toolbar resizing. If the toolbar cannot be identified, it uses the native menu's bottom edge, or an 80px bottom allowance when neither measurement is available.

Generated replies are inserted through Zendesk's CKEditor model rather than by changing the page HTML directly. This lets the content remain editable in the Public reply composer.

Replies are bound to the ticket and visible composer where generation started. Zenbot blocks insertion if you switch tickets or the composer is replaced during generation. Return to the intended ticket and generate again. Summaries from another ticket cannot be used to generate a reply.

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
