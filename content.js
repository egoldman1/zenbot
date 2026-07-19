const ZENBOT_ID = "zenbot-omnipanel-item";
const PANEL_HTML = fetch(chrome.runtime.getURL("panel.html")).then((response) => {
  if (!response.ok) throw new Error(`Zenbot could not load its panel (${response.status}).`);
  return response.text();
});
let panelMounting = false;
const DEFAULT_SETTINGS = {
  signature: "",
  toneInstructions: "",
  responseLength: "balanced",
  autoSummarize: true,
  useSummaryForResponse: false,
  summaryDetail: "medium",
  summaryModel: "gpt-5.6-luna",
  responseModel: "gpt-5.6-sol",
};

const SETTING_INFO = globalThis.ZENBOT_SETTING_INFO;

new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
mount();

async function mount() {
  if (panelMounting || document.getElementById(ZENBOT_ID)) return;
  panelMounting = true;
  let panelHtml;
  try {
    panelHtml = await PANEL_HTML;
  } catch (error) {
    console.error(error);
    return;
  } finally {
    panelMounting = false;
  }

  const selector = document.querySelector('[data-test-id="omnipanel-selector-wrapper"]');
  const apps = selector?.querySelector('[data-test-id="omnipanel-selector-item-apps"]');
  const list = apps?.closest("ul");
  const section = selector?.parentElement;
  if (!list || !section || document.getElementById(ZENBOT_ID)) return;

  const item = document.createElement("li");
  item.id = ZENBOT_ID;
  const railButton = document.createElement("button");
  railButton.type = "button";
  railButton.setAttribute("aria-label", "Zenbot");
  railButton.title = "Zenbot";
  railButton.textContent = "Z";
  item.append(railButton);
  apps.closest("li").after(item);

  const panel = document.createElement("div");
  panel.id = "zenbot-panel";
  panel.innerHTML = panelHtml;
  section.append(panel);

  item.querySelector("button").addEventListener("click", () => openPanel(section, panel, item));
  panel.querySelector("#zenbot-generate").addEventListener("click", () => generate(panel));
  panel.querySelector("#zenbot-note").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!panel.querySelector("#zenbot-generate").disabled) generate(panel);
  });
  panel.querySelector("#zenbot-summarize").addEventListener("click", () => summarize(panel, true));
  panel.querySelector("#zenbot-home-tab").addEventListener("click", () => selectTab(panel, "home"));
  panel.querySelector("#zenbot-settings-tab").addEventListener("click", () => selectTab(panel, "settings"));
  panel.querySelector("#zenbot-settings-form").addEventListener("submit", (event) => saveSettings(event, panel));
  for (const button of panel.querySelectorAll("[data-info]")) {
    button.addEventListener("click", () => {
      panel.zenbotInfoTrigger = button;
      openSettingInfo(panel, button.dataset.info);
    });
  }
  panel.querySelector("#zenbot-info-close").addEventListener("click", () => closeSettingInfo(panel));
  panel.querySelector("#zenbot-info-overlay").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeSettingInfo(panel);
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.querySelector("#zenbot-info-overlay").hidden) closeSettingInfo(panel);
  });
  panel.zenbotSettingsPromise = loadSettings(panel);
  list.addEventListener("click", (event) => {
    if (!item.contains(event.target)) setTimeout(() => closePanel(section, panel, item));
  });
}

function openSettingInfo(panel, key) {
  const info = SETTING_INFO[key];
  if (!info) return;
  panel.querySelector("#zenbot-info-title").textContent = info.title;
  const content = panel.querySelector("#zenbot-info-content");
  content.replaceChildren(...info.options.map(([title, description]) => {
    const section = document.createElement("section");
    section.className = "zenbot-info-option";
    const heading = document.createElement("h4");
    heading.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = description;
    section.append(heading, paragraph);
    return section;
  }));
  const overlay = panel.querySelector("#zenbot-info-overlay");
  overlay.hidden = false;
  overlay.style.display = "flex";
  panel.querySelector("#zenbot-info-close").focus();
}

function closeSettingInfo(panel) {
  const overlay = panel.querySelector("#zenbot-info-overlay");
  overlay.hidden = true;
  overlay.style.display = "none";
  panel.zenbotInfoTrigger?.focus();
}

async function openPanel(section, panel, item) {
  for (const pane of section.children) if (pane !== panel && !pane.matches('[data-test-id="omnipanel-selector-wrapper"]')) pane.style.display = "none";
  for (const button of section.querySelectorAll('[data-cy-test-id="omnipanel-selector-item"]')) button.removeAttribute("aria-pressed");
  panel.style.display = "block";
  item.querySelector("button").style.background = "#e8f4fa";
  item.querySelector("button").setAttribute("aria-pressed", "true");
  await panel.zenbotSettingsPromise;
  if (panel.zenbotSettings.autoSummarize) summarize(panel);
  else if (!panel.zenbotSummary) setStatus(panel.querySelector("#zenbot-summary-status"), "Automatic summaries are off.");
}

function closePanel(section, panel, item) {
  panel.style.display = "none";
  item.querySelector("button").style.background = "transparent";
  item.querySelector("button").removeAttribute("aria-pressed");
  for (const pane of section.querySelectorAll('[data-test-id^="omnipanel-pane-wrapper-"]')) pane.style.removeProperty("display");
}

function selectTab(panel, tab) {
  const homeSelected = tab === "home";
  panel.querySelector("#zenbot-home").hidden = !homeSelected;
  panel.querySelector("#zenbot-settings").hidden = homeSelected;
  for (const [name, selected] of [["home", homeSelected], ["settings", !homeSelected]]) {
    const button = panel.querySelector(`#zenbot-${name}-tab`);
    button.setAttribute("aria-selected", String(selected));
    button.style.color = selected ? "#1f73b7" : "#68737d";
    button.style.borderBottomColor = selected ? "#1f73b7" : "transparent";
  }
  if (homeSelected && panel.zenbotSettings?.autoSummarize && !panel.zenbotSummary) summarize(panel);
}

async function loadSettings(panel) {
  const saved = await chrome.storage.local.get("zenbotSettings");
  panel.zenbotSettings = { ...DEFAULT_SETTINGS, ...(saved.zenbotSettings || {}) };
  populateSettingsForm(panel, panel.zenbotSettings);
  updateReplyAvailability(panel);
  if (!panel.zenbotSettings.autoSummarize) {
    setStatus(panel.querySelector("#zenbot-summary-status"), "Automatic summaries are off.");
  }
}

function populateSettingsForm(panel, settings) {
  panel.querySelector("#zenbot-signature").value = settings.signature;
  panel.querySelector("#zenbot-tone").value = settings.toneInstructions;
  panel.querySelector("#zenbot-response-length").value = settings.responseLength;
  panel.querySelector("#zenbot-auto-summarize").checked = settings.autoSummarize;
  panel.querySelector("#zenbot-use-summary").checked = settings.useSummaryForResponse;
  panel.querySelector("#zenbot-summary-detail").value = settings.summaryDetail;
  panel.querySelector("#zenbot-summary-model").value = settings.summaryModel;
  panel.querySelector("#zenbot-response-model").value = settings.responseModel;
}

async function saveSettings(event, panel) {
  event.preventDefault();
  const previous = { ...DEFAULT_SETTINGS, ...(panel.zenbotSettings || {}) };
  const settings = {
    signature: panel.querySelector("#zenbot-signature").value.trim(),
    toneInstructions: panel.querySelector("#zenbot-tone").value.trim(),
    responseLength: panel.querySelector("#zenbot-response-length").value,
    autoSummarize: panel.querySelector("#zenbot-auto-summarize").checked,
    useSummaryForResponse: panel.querySelector("#zenbot-use-summary").checked,
    summaryDetail: panel.querySelector("#zenbot-summary-detail").value,
    summaryModel: panel.querySelector("#zenbot-summary-model").value,
    responseModel: panel.querySelector("#zenbot-response-model").value,
  };
  await chrome.storage.local.set({ zenbotSettings: settings });
  panel.zenbotSettings = settings;

  if (previous.summaryDetail !== settings.summaryDetail || previous.summaryModel !== settings.summaryModel) {
    panel.zenbotSummary = null;
    panel.zenbotTicketKey = null;
    panel.querySelector("#zenbot-summary").replaceChildren();
    panel.querySelector("#zenbot-next-steps").replaceChildren();
    setStatus(panel.querySelector("#zenbot-summary-status"), "Summary settings changed. Summarize the ticket again.");
    panel.querySelector("#zenbot-summarize").textContent = "Summarize ticket";
  } else if (!settings.autoSummarize && !panel.zenbotSummary) {
    setStatus(panel.querySelector("#zenbot-summary-status"), "Automatic summaries are off.");
  }
  updateReplyAvailability(panel);
  setStatus(panel.querySelector("#zenbot-settings-status"), "Settings saved.");
}

function updateReplyAvailability(panel) {
  const needsSummary = panel.zenbotSettings?.useSummaryForResponse === true;
  const waitingForSummary = needsSummary && !panel.zenbotSummary;
  panel.querySelector("#zenbot-note").disabled = waitingForSummary || panel.zenbotGenerating === true;
  panel.querySelector("#zenbot-generate").disabled = waitingForSummary || panel.zenbotGenerating === true;
  panel.querySelector("#zenbot-reply-requirement").style.display = waitingForSummary ? "block" : "none";
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
  if (panel.zenbotSettings.useSummaryForResponse && !panel.zenbotSummary) {
    return setStatus(status, "Create a ticket summary before generating a reply.", true);
  }

  panel.zenbotGenerating = true;
  updateReplyAvailability(panel);
  button.textContent = "Generating…";
  setStatus(status, "Generating reply…");
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
    panel.zenbotGenerating = false;
    updateReplyAvailability(panel);
    button.textContent = "Generate reply";
  }
}

async function summarize(panel, force = false) {
  const ticket = readTicket();
  const status = panel.querySelector("#zenbot-summary-status");
  const summarizeButton = panel.querySelector("#zenbot-summarize");
  if (!ticket) return setStatus(status, "Zenbot could not read this ticket.", true);
  if (panel.zenbotSummarizing) return;

  const ticketKey = `${ticket.subject}\n${ticket.messages}`;
  if (!force && panel.zenbotTicketKey === ticketKey && panel.zenbotSummary) return;
  panel.zenbotSummary = null;
  panel.zenbotSummarizing = true;
  updateReplyAvailability(panel);
  summarizeButton.disabled = true;
  summarizeButton.textContent = "Summarizing…";
  setStatus(status, "Reading ticket…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "summary", ticket });
    if (result.error) throw new Error(result.error);
    panel.zenbotSummary = result.summary;
    panel.zenbotTicketKey = ticketKey;
    renderList(panel.querySelector("#zenbot-summary"), result.summary.summary);
    renderList(panel.querySelector("#zenbot-next-steps"), result.summary.nextSteps);
    status.textContent = "";
    updateReplyAvailability(panel);
    summarizeButton.textContent = "Refresh summary";
  } catch (error) {
    setStatus(status, error.message || String(error), true);
    summarizeButton.textContent = "Try summary again";
  } finally {
    panel.zenbotSummarizing = false;
    updateReplyAvailability(panel);
    summarizeButton.disabled = false;
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
    item.className = "zenbot-summary-item";
    return item;
  }));
}

function setStatus(element, message, error = false) {
  element.textContent = message;
  element.style.color = error ? "#cc3340" : "#68737d";
}
