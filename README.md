# Zenbot extension MVP

1. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this folder.
2. Click the Zenbot extension once, enter your OpenAI API key, and save it.
3. Open a Zendesk agent ticket and select the **Z** icon in the right-hand panel.
4. Zenbot summarizes the ticket and shows the suggested next steps.
5. Write a short instruction and click **Generate reply**. Zenbot reuses the summary and inserts the result into **Public reply** for review.

The key is stored only in Chrome's local extension storage. The current ticket page text is sent to OpenAI when you generate a reply. This direct-key approach is for an internal MVP; use a small authenticated backend before distributing the extension to other users.

Zenbot never submits the ticket. Run the self-check with `node check.mjs`.
