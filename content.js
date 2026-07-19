const ZENBOT_ID = "zenbot-omnipanel-item";

new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
mount();

function mount() {
  const selector = document.querySelector('[data-test-id="omnipanel-selector-wrapper"]');
  const apps = selector?.querySelector('[data-test-id="omnipanel-selector-item-apps"]');
  const list = apps?.closest("ul");
  const section = selector?.parentElement;
  if (!list || !section || document.getElementById(ZENBOT_ID)) return;

  const item = document.createElement("li");
  item.id = ZENBOT_ID;
  item.style.cssText = "list-style:none;display:flex;justify-content:center";
  item.innerHTML = '<button type="button" aria-label="Zenbot" title="Zenbot" style="width:40px;height:40px;border:0;border-radius:4px;background:transparent;color:#68737d;font:700 16px system-ui;cursor:pointer">Z</button>';
  apps.closest("li").after(item);

  const panel = document.createElement("div");
  panel.id = "zenbot-panel";
  panel.style.cssText = "display:none;flex:1;min-width:0;height:100%;box-sizing:border-box;background:#fff";
  panel.innerHTML = `
    <div style="height:100%;overflow:auto;padding:20px;box-sizing:border-box;font:14px system-ui;color:#2f3941">
      <h2 style="margin:0 0 20px;font-size:18px">Zenbot</h2>
      <section style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #d8dcde">
        <h3 style="margin:0 0 8px;font-size:14px">Ticket summary</h3>
        <ul id="zenbot-summary" style="margin:0 0 16px;padding-left:20px;list-style:disc outside"></ul>
        <h3 style="margin:0 0 8px;font-size:14px">Next steps</h3>
        <ul id="zenbot-next-steps" style="margin:0;padding-left:20px;list-style:disc outside"></ul>
        <p id="zenbot-summary-status" role="status" aria-live="polite" style="margin:8px 0 0;color:#68737d">Reading ticket…</p>
      </section>
      <label for="zenbot-note" style="margin-bottom:6px;font-weight:600">What should the reply say?</label>
      <textarea id="zenbot-note" rows="7" placeholder="Apologise and tell them we'll investigate the login error." style="box-sizing:border-box;width:100%;padding:10px;border:1px solid #87929d;border-radius:4px;resize:vertical;font:inherit"></textarea>
      <button id="zenbot-generate" type="button" disabled style="margin-top:12px;padding:10px;border:0;border-radius:4px;background:#1f73b7;color:white;font:600 14px system-ui;cursor:pointer">Generate reply</button>
      <p id="zenbot-status" role="status" aria-live="polite" style="margin:12px 0 0;color:#68737d"></p>
    </div>`;
  section.append(panel);

  item.querySelector("button").addEventListener("click", () => openPanel(section, panel, item));
  panel.querySelector("#zenbot-generate").addEventListener("click", () => generate(panel));
  list.addEventListener("click", (event) => {
    if (!item.contains(event.target)) setTimeout(() => closePanel(section, panel, item));
  });
}

function openPanel(section, panel, item) {
  for (const pane of section.children) if (pane !== panel && !pane.matches('[data-test-id="omnipanel-selector-wrapper"]')) pane.style.display = "none";
  for (const button of section.querySelectorAll('[data-cy-test-id="omnipanel-selector-item"]')) button.removeAttribute("aria-pressed");
  panel.style.display = "block";
  item.querySelector("button").style.background = "#e8f4fa";
  item.querySelector("button").setAttribute("aria-pressed", "true");
  summarize(panel);
}

function closePanel(section, panel, item) {
  panel.style.display = "none";
  item.querySelector("button").style.background = "transparent";
  item.querySelector("button").removeAttribute("aria-pressed");
  for (const pane of section.querySelectorAll('[data-test-id^="omnipanel-pane-wrapper-"]')) pane.style.removeProperty("display");
}

async function generate(panel) {
  const note = panel.querySelector("#zenbot-note").value.trim();
  const button = panel.querySelector("#zenbot-generate");
  const status = panel.querySelector("#zenbot-status");
  const editor = document.querySelector('[role="textbox"][aria-label="Public reply composer"][contenteditable="true"]');
  const ticket = readTicket();

  if (!note) return setStatus(status, "Write a short instruction first.", true);
  if (!editor) return setStatus(status, "Switch the composer to Public reply first.", true);
  if (!ticket) return setStatus(status, "Zenbot could not read this ticket.", true);
  if (!panel.zenbotSummary) return setStatus(status, "Wait for the ticket summary to finish.", true);

  button.disabled = true;
  button.textContent = "Generating…";
  setStatus(status, "Reading the ticket…");
  try {
    const result = await chrome.runtime.sendMessage({
      type: "draft",
      note,
      ticket,
      summary: panel.zenbotSummary,
    });
    if (result.error) throw new Error(result.error);
    const insertion = await chrome.runtime.sendMessage({ type: "insert", text: result.text });
    if (insertion.error) throw new Error(insertion.error);
    panel.querySelector("#zenbot-note").value = "";
    setStatus(status, "Inserted into Public reply. Review it before submitting.");
  } catch (error) {
    setStatus(status, error.message || String(error), true);
  } finally {
    button.disabled = false;
    button.textContent = "Generate reply";
  }
}

async function summarize(panel) {
  const ticket = readTicket();
  const status = panel.querySelector("#zenbot-summary-status");
  const button = panel.querySelector("#zenbot-generate");
  if (!ticket) return setStatus(status, "Zenbot could not read this ticket.", true);

  const ticketKey = `${ticket.subject}\n${ticket.messages}`;
  if (panel.zenbotTicketKey === ticketKey && panel.zenbotSummary) return;
  panel.zenbotSummary = null;
  button.disabled = true;
  setStatus(status, "Reading ticket…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "summary", ticket });
    if (result.error) throw new Error(result.error);
    panel.zenbotSummary = result.summary;
    panel.zenbotTicketKey = ticketKey;
    renderList(panel.querySelector("#zenbot-summary"), result.summary.summary);
    renderList(panel.querySelector("#zenbot-next-steps"), result.summary.nextSteps);
    status.textContent = "";
    button.disabled = false;
  } catch (error) {
    setStatus(status, error.message || String(error), true);
  }
}

function readTicket() {
  const conversation = document.querySelector('[data-test-id="ticket-main-conversation"]');
  if (!conversation) return null;
  return {
    subject: conversation.querySelector('[aria-label="Subject"]')?.value || document.title,
    messages: [...conversation.querySelectorAll('[data-test-id="omni-log-comment-item"]')]
      .map((message) => message.innerText.trim()).join("\n\n"),
  };
}

function renderList(list, items) {
  list.replaceChildren(...items.map((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    item.style.cssText = "display:list-item;margin-bottom:6px";
    return item;
  }));
}

function setStatus(element, message, error = false) {
  element.textContent = message;
  element.style.color = error ? "#cc3340" : "#68737d";
}
