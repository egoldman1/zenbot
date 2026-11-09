# Changelog

## 0.3.1 — 2026-10-22

- Keep the Pending/status dropdown accessible by shortening Zenbot's panel while the menu is open, then restoring its height when it closes.
- Close Zenbot immediately when selecting Customer or another native sidebar panel.
- Prevent Zenbot button clicks from triggering Zendesk's sidebar toggles, so reopening Zenbot keeps the panel accessible beside the sidebar.
- Add browser regression checks for status-menu access, draft retention, and repeated switching between Zenbot and the customer panel.

## 0.3.0 — 2026-10-15

This release includes:

- **Rich text:** Replies support bold, italics, paragraphs, intentional line breaks, and bulleted or numbered lists. Structured replies are converted into formatted HTML for Zendesk's editor.
- **Automatic lists:** The prompt uses lists for parts, links, multiple requested details, and options, with numbering for sequential steps. Lists follow their introduction without an extra blank paragraph, while retaining spacing between items.
- **Complete references:** Full part/product names, numbers, addresses, vehicle details, and other identifiers use uninterrupted bold and italics, without truncation or partially formatted names. Unnecessary product-identification sections are discouraged.
- **Titled links:** Supplied HTTP/HTTPS URLs appear as page titles or descriptive hyperlinks. Relevant link destinations and exact identifiers are preserved in ticket context and summaries; destinations are validated before insertion.
- **Natural writing:** Replies greet the customer by name where known, use everyday language, and adapt to the situation: sympathetic for disappointing news, positive for meaningful good news, and warm but restrained for routine confirmations. Related decisions flow naturally without repetitive questions or generated closing boilerplate.
- **Relevant context:** Short operator notes are connected to the customer's request, current ticket stage, prior agreements, and supported next steps. Relevant order additions include the established parts-received notification milestone without inventing stock status, dates, or delivery promises.
- **Draft retention:** Draft instructions remain after insertion and are saved separately by ticket ID during the current page session. Returning to a ticket restores its draft, including when Zendesk reuses or rebuilds a sidebar. Refreshing the page clears session drafts.
- **Signatures:** Custom signatures retain their text and line breaks and are appended separately from the generated body. Saved closing sentences remain part of the signature.
- **Validation:** Added checks for formatting, list spacing, hyperlinks, escaped HTML, invalid model output, reply insertion, retained drafts, and separation between tickets. Existing ticket/editor identity checks remain in place.

Performance investigation only: a captured request took 6.42 seconds, used Medium reasoning, generated 411 reasoning tokens and 120 other output tokens, and reused 3,759 of 3,762 input tokens from cache. The capture did not establish the internal time split or explain the earlier 15-second request. No performance optimizations or reasoning-setting changes were made.

## 0.2.0 — 2026-10-15

### Models and settings

- Summaries and responses now use `gpt-6-luna` exclusively, including when older model preferences were saved.
- Removed both model dropdowns and updated the model help text.
- Kept separate reasoning-effort sliders for summaries and responses.

### Open tickets and replies

- Load Zenbot throughout Zendesk's agent pages so navigation from Home or Views to a ticket works without a page refresh.
- Keep a separate Zenbot button and panel for each open ticket sidebar, preserving its note and summary while switching tickets.
- Restore buttons and panels when Zendesk rebuilds the sidebar, without accumulating click handlers.
- Read the visible ticket conversation and select its visible Public reply editor rather than the first editor in the page.
- Bind reply insertion to the original ticket ID and composer. Block insertion if the active ticket or editor changes during generation.
- Reject summaries from another ticket or an earlier ticket version, and discard summaries that finish after the ticket changes.

### Panel layout

- Display Zenbot in a floating panel outside Zendesk's sidebar clipping containers.
- Match the underlying native menu's width and left edge, and follow resizing. When collapsed, reuse the last measured width or default to 400px until a measurement is available.
- End the panel at the measured top edge of the submit toolbar, removing the excess bottom gap while keeping ticket controls accessible.
- If the toolbar cannot be identified, use the native menu's bottom edge or an 80px fallback allowance.
- Close the panel with the close button, Escape, the Z button, or by switching tickets; remove floating panels when their sidebar is destroyed.

### Versioning and validation

- Display the installed version in the Zendesk panel and extension popup, using `manifest.json` as the single source.
- Start the `MAJOR.MINOR.PATCH` release numbering policy documented in the README.
- Add mounting, ticket-routing, and browser layout regression checks covering multiple tickets, clipped sidebars, resizing, and submit-button access.

## 0.1.0

- Original extension version before the changes above.
