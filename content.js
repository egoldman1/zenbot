const ZENBOT_CLASS = "zenbot-omnipanel-item";
const PANEL_HTML = fetch(chrome.runtime.getURL("panel.html")).then((response) => {
  if (!response.ok) throw new Error(`Zenbot could not load its panel (${response.status}).`);
  return response.text();
});
let panelMounting = false;
const mountedUis = new WeakMap();
const observedLists = new WeakMap();
const mountedPanels = new Set();
const ticketDrafts = new Map();
let activeUi = null;
const DEFAULT_SETTINGS = {
  signature: "",
  toneInstructions: "",
  responseLength: "balanced",
  autoSummarize: true,
  useSummaryForResponse: false,
  summaryDetail: "medium",
  summaryModel: "gpt-6-luna",
  summaryReasoningEffort: "none",
  responseModel: "gpt-6-luna",
  responseReasoningEffort: "none",
};

const SETTING_INFO = globalThis.ZENBOT_SETTING_INFO;
const MODEL_REASONING_EFFORTS = {
  "gpt-6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
};

new MutationObserver(mount).observe(document.body, {
  childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-expanded", "aria-hidden"],
});
window.addEventListener("resize", () => { if (activeUi) positionPanel(activeUi); });
window.addEventListener("popstate", mount);
mount();

async function mount() {
  if (panelMounting) return;
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

  for (const selector of document.querySelectorAll('[data-test-id="omnipanel-selector-wrapper"]')) {
    mountSidebar(selector, panelHtml);
  }
  for (const ui of mountedPanels) {
    if (!ui.section.isConnected) {
      closePanel(ui.section, ui.panel, ui.item);
      ui.panel.remove();
      ui.resizeObserver?.disconnect();
      mountedPanels.delete(ui);
      mountedUis.delete(ui.section);
    }
  }
  if (activeUi) {
    if (!isVisible(activeUi.selector) || activeUi.ticketPath !== location.pathname) {
      closePanel(activeUi.section, activeUi.panel, activeUi.item);
    } else positionPanel(activeUi);
  }
}

function mountSidebar(selector, panelHtml) {
  const apps = selector?.querySelector('[data-test-id="omnipanel-selector-item-apps"]');
  const list = apps?.closest("ul");
  const appsItem = apps?.closest("li");
  const section = selector?.parentElement;
  if (!list || !appsItem || !section) return;

  // Zendesk can rebuild the rail without replacing the surrounding panel.
  // Reattach our existing nodes so drafts and settings survive that update.
  const existing = mountedUis.get(section);
  if (existing) {
    const { item, panel } = existing;
    if (item.parentElement !== list) appsItem.after(item);
    existing.selector = selector;
    observeSidebarSize(existing, selector);
    if (panel.parentElement !== document.body) document.body.append(panel);
    observeList(list, existing);
    return;
  }

  const item = document.createElement("li");
  item.className = ZENBOT_CLASS;
  const railButton = document.createElement("button");
  railButton.type = "button";
  railButton.setAttribute("aria-label", "Zenbot");
  railButton.title = "Zenbot";
  railButton.textContent = "Z";
  item.append(railButton);
  appsItem.after(item);

  const panel = document.createElement("div");
  panel.className = "zenbot-panel";
  panel.innerHTML = panelHtml;
  panel.querySelector("[data-zenbot-version]").textContent = `v${chrome.runtime.getManifest().version}`;
  // A body-level panel escapes Zendesk's collapsed, overflow-clipped sidebar.
  document.body.append(panel);
  const ui = { section, selector, panel, item };
  mountedUis.set(section, ui);
  mountedPanels.add(ui);
  observeSidebarSize(ui, section);
  observeSidebarSize(ui, selector);

  item.querySelector("button").addEventListener("click", (event) => {
    // This is our control, not a native Zendesk pane selector. Letting its
    // click reach Zendesk's delegated handlers can toggle the customer pane
    // (and collapse the sidebar) after we have positioned Zenbot.
    event.stopPropagation();
    if (activeUi === ui) closePanel(section, panel, item);
    else openPanel(section, panel, item);
  });
  panel.querySelector("#zenbot-close").addEventListener("click", () => closePanel(section, panel, item));
  panel.querySelector("#zenbot-generate").addEventListener("click", () => generate(panel));
  panel.querySelector("#zenbot-note").addEventListener("input", () => saveTicketDraft(panel));
  panel.querySelector("#zenbot-note").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!panel.querySelector("#zenbot-generate").disabled) generate(panel);
  });
  panel.querySelector("#zenbot-summarize").addEventListener("click", () => summarize(panel, true));
  panel.querySelector("#zenbot-home-tab").addEventListener("click", () => selectTab(panel, "home"));
  panel.querySelector("#zenbot-settings-tab").addEventListener("click", () => selectTab(panel, "settings"));
  panel.querySelector("#zenbot-settings-form").addEventListener("submit", (event) => saveSettings(event, panel));
  for (const type of ["summary", "response"]) {
    panel.querySelector(`#zenbot-${type}-reasoning`).addEventListener("input", () => updateReasoningLabel(panel, type));
  }
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
    if (event.key !== "Escape") return;
    if (!panel.querySelector("#zenbot-info-overlay").hidden) closeSettingInfo(panel);
    else closePanel(section, panel, item);
  });
  panel.zenbotSettingsPromise = loadSettings(panel);
  observeList(list, ui);
}

function observeList(list, ui) {
  if (observedLists.has(list)) {
    observedLists.set(list, ui);
    return;
  }
  observedLists.set(list, ui);
  list.addEventListener("click", (event) => {
    const ui = observedLists.get(list);
    if (ui?.item.parentElement === list && !ui.item.contains(event.target)) {
      closePanel(ui.section, ui.panel, ui.item);
    }
  }, true);
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
  const ui = mountedUis.get(section);
  if (activeUi && activeUi !== ui) closePanel(activeUi.section, activeUi.panel, activeUi.item);
  saveTicketDraft(panel);
  const ticketId = location.pathname.match(/^\/agent\/tickets\/(\d+)(?:\/|$)/)?.[1];
  panel.zenbotDraftTicketId = ticketId;
  panel.querySelector("#zenbot-note").value = ticketId ? ticketDrafts.get(ticketId) || "" : "";
  activeUi = ui;
  ui.ticketPath = location.pathname;
  positionPanel(ui);
  panel.style.display = "block";
  item.querySelector("button").style.background = "#e8f4fa";
  item.querySelector("button").setAttribute("aria-pressed", "true");
  await panel.zenbotSettingsPromise;
  if (activeUi !== ui || ui.ticketPath !== location.pathname) return;
  if (panel.zenbotSettings.autoSummarize) summarize(panel);
  else if (!panel.zenbotSummary) setStatus(panel.querySelector("#zenbot-summary-status"), "Automatic summaries are off.");
}

function closePanel(section, panel, item) {
  saveTicketDraft(panel);
  if (activeUi?.panel === panel) activeUi = null;
  panel.style.display = "none";
  item.querySelector("button").style.background = "transparent";
  item.querySelector("button").removeAttribute("aria-pressed");
}

function saveTicketDraft(panel) {
  if (panel.zenbotDraftTicketId) {
    ticketDrafts.set(panel.zenbotDraftTicketId, panel.querySelector("#zenbot-note").value);
  }
}

function positionPanel(ui) {
  const rect = ui.selector.getBoundingClientRect();
  let menuRect = null;
  // The native menu can sit beside the rail's parent rather than inside it.
  for (let ancestor = ui.section; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
    const panes = [...ancestor.querySelectorAll('[data-test-id^="omnipanel-pane-wrapper-"]')]
      .filter(isVisible)
      .map((pane) => ({ pane, bounds: pane.getBoundingClientRect() }))
      .filter(({ bounds }) => bounds.width > 0 && Math.abs(bounds.right - rect.left) <= 8)
      .sort((a, b) => b.bounds.width - a.bounds.width);
    if (panes.length) {
      menuRect = panes[0].bounds;
      observeSidebarSize(ui, panes[0].pane);
      break;
    }
  }
  if (menuRect) ui.menuWidth = menuRect.width;
  const width = Math.min(menuRect?.width || ui.menuWidth || 400, window.innerWidth);
  const left = Math.max(0, Math.min(menuRect?.left ?? rect.left - width, window.innerWidth - width));
  const toolbarTop = ticketToolbarTop(ui, left, width);
  let bottom = Math.max(0, Math.min(window.innerHeight,
    toolbarTop ?? menuRect?.bottom ?? window.innerHeight - 80));
  // Submit status menus open upward over the sidebar. Keep their entire
  // hit area clear, including when Zendesk portals the menu to document.body.
  if (toolbarTop !== null) {
    for (const menu of document.querySelectorAll('[role="menu"], [role="listbox"]')) {
      if (ui.panel.contains(menu) || !isVisible(menu) || menu.getAttribute("aria-hidden") === "true") continue;
      const bounds = menu.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0 && bounds.right > left && bounds.left < left + width
        && bounds.top < toolbarTop && bounds.bottom >= toolbarTop - 16) {
        bottom = Math.min(bottom, bounds.top);
        observeSidebarSize(ui, menu);
      }
    }
  }
  const top = Math.max(0, Math.min(rect.top, bottom - 160));
  for (const [name, value] of Object.entries({
    "--zenbot-panel-left": `${left}px`,
    "--zenbot-panel-width": `${width}px`,
    "--zenbot-panel-top": `${top}px`,
    "--zenbot-panel-height": `${bottom - top}px`,
  })) {
    if (ui.panel.style.getPropertyValue(name) !== value) ui.panel.style.setProperty(name, value);
  }
}

function ticketToolbarTop(ui, left, width) {
  for (const button of document.querySelectorAll('button, [role="button"]')) {
    const label = (button.innerText || button.textContent || button.getAttribute("aria-label") || "").trim();
    if (!/^Submit(?:\s|$)/i.test(label) || !isVisible(button)) continue;
    let toolbar = button;
    let bounds = button.getBoundingClientRect();
    if (bounds.top < window.innerHeight / 2 || bounds.right <= left || bounds.left >= left + width) continue;
    // Find the surrounding bottom action bar, including its padding/border,
    // rather than stopping at the submit button's own top edge.
    for (let parent = button.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const rect = parent.getBoundingClientRect();
      if (rect.top < window.innerHeight / 2 || rect.height > window.innerHeight / 3) break;
      if (rect.width > 0 && rect.height > 0) {
        toolbar = parent;
        bounds = rect;
      }
    }
    observeSidebarSize(ui, toolbar);
    return bounds.top;
  }
  return null;
}

function observeSidebarSize(ui, element) {
  if (!ui.resizeObserver) {
    ui.observedSizes = new WeakSet();
    ui.resizeObserver = new ResizeObserver(() => {
      if (activeUi === ui) positionPanel(ui);
    });
  }
  if (!ui.observedSizes.has(element)) {
    ui.observedSizes.add(element);
    ui.resizeObserver.observe(element);
  }
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
  const settings = { ...DEFAULT_SETTINGS, ...(saved.zenbotSettings || {}) };
  for (const type of ["summary", "response"]) {
    const modelKey = `${type}Model`;
    const effortKey = `${type}ReasoningEffort`;
    settings[modelKey] = DEFAULT_SETTINGS[modelKey];
    if (!MODEL_REASONING_EFFORTS[settings[modelKey]].includes(settings[effortKey])) {
      settings[effortKey] = DEFAULT_SETTINGS[effortKey];
    }
  }
  panel.zenbotSettings = settings;
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
  configureReasoningControl(panel, "summary", settings.summaryReasoningEffort);
  configureReasoningControl(panel, "response", settings.responseReasoningEffort);
}

function configureReasoningControl(panel, type, preferredEffort) {
  const model = DEFAULT_SETTINGS[`${type}Model`];
  const efforts = MODEL_REASONING_EFFORTS[model] || [];
  const slider = panel.querySelector(`#zenbot-${type}-reasoning`);
  const control = slider.closest(".zenbot-reasoning-control");
  slider.disabled = efforts.length === 0;
  control.classList.toggle("is-disabled", slider.disabled);
  slider.max = String(Math.max(0, efforts.length - 1));
  const selectedEffort = preferredEffort || selectedReasoningEffort(panel, type);
  slider.value = String(Math.max(0, efforts.indexOf(selectedEffort)));
  updateReasoningLabel(panel, type);
}

function selectedReasoningEffort(panel, type) {
  const model = DEFAULT_SETTINGS[`${type}Model`];
  const efforts = MODEL_REASONING_EFFORTS[model] || [];
  return efforts[Number(panel.querySelector(`#zenbot-${type}-reasoning`).value)] || null;
}

function updateReasoningLabel(panel, type) {
  const effort = selectedReasoningEffort(panel, type);
  panel.querySelector(`#zenbot-${type}-reasoning-value`).textContent = effort
    ? effort.replace("xhigh", "Extra high").replace(/^./, (character) => character.toUpperCase())
    : "Not available";
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
    summaryModel: DEFAULT_SETTINGS.summaryModel,
    summaryReasoningEffort: selectedReasoningEffort(panel, "summary"),
    responseModel: DEFAULT_SETTINGS.responseModel,
    responseReasoningEffort: selectedReasoningEffort(panel, "response"),
  };
  await chrome.storage.local.set({ zenbotSettings: settings });
  panel.zenbotSettings = settings;

  if (previous.summaryDetail !== settings.summaryDetail || previous.summaryModel !== settings.summaryModel
    || previous.summaryReasoningEffort !== settings.summaryReasoningEffort) {
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
  const generationTime = panel.querySelector("#zenbot-generation-time");
  const status = panel.querySelector("#zenbot-status");
  const editors = [...document.querySelectorAll('[aria-label="Public reply composer"][contenteditable="true"]')]
    .filter(isVisible);
  const editor = editors.length === 1 ? editors[0] : null;
  const ticket = readTicket();

  if (!note) return setStatus(status, "Write a short instruction first.", true);
  if (!editor) return setStatus(status, "Switch the composer to Public reply first.", true);
  if (!ticket) return setStatus(status, "Zenbot could not read this ticket.", true);
  if (panel.zenbotSettings.useSummaryForResponse && !panel.zenbotSummary) {
    return setStatus(status, "Create a ticket summary before generating a reply.", true);
  }
  if (panel.zenbotSettings.useSummaryForResponse && panel.zenbotTicketKey !== ticketKey(ticket)) {
    return setStatus(status, "This summary belongs to an earlier ticket or ticket version. Summarize this ticket again.", true);
  }

  const composerToken = crypto.randomUUID();
  editor.setAttribute("data-zenbot-composer-token", composerToken);
  panel.zenbotGenerating = true;
  updateReplyAvailability(panel);
  button.textContent = "Generating…";
  generationTime.textContent = "";
  setStatus(status, "Generating reply…");
  const startedAt = performance.now();
  try {
    const result = await chrome.runtime.sendMessage({
      type: "draft",
      note,
      ticket,
      summary: panel.zenbotSummary,
    });
    if (result.error) throw new Error(result.error);
    generationTime.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
    generationTime.setAttribute("aria-label", `Reply generated in ${generationTime.textContent}`);
    if (readTicket()?.id !== ticket.id) {
      throw new Error("The active ticket changed. Return to the original ticket and generate the reply again.");
    }
    const insertion = await chrome.runtime.sendMessage({
      type: "insert", reply: result.reply, text: result.text, ticketId: ticket.id, composerToken,
    });
    if (insertion.error) throw new Error(insertion.error);
    setStatus(status, "Inserted into Public reply. Review it before submitting.");
  } catch (error) {
    setStatus(status, error.message || String(error), true);
  } finally {
    if (editor.getAttribute("data-zenbot-composer-token") === composerToken) {
      editor.removeAttribute("data-zenbot-composer-token");
    }
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

  const key = ticketKey(ticket);
  if (!force && panel.zenbotTicketKey === key && panel.zenbotSummary) return;
  panel.zenbotSummary = null;
  panel.zenbotSummarizing = true;
  updateReplyAvailability(panel);
  summarizeButton.disabled = true;
  summarizeButton.textContent = "Summarizing…";
  setStatus(status, "Reading ticket…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "summary", ticket });
    if (result.error) throw new Error(result.error);
    const currentTicket = readTicket();
    if (!currentTicket || ticketKey(currentTicket) !== key) {
      throw new Error("The ticket changed while summarizing. Summarize the current ticket again.");
    }
    panel.zenbotSummary = result.summary;
    panel.zenbotTicketKey = key;
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

function isVisible(element) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
}

function ticketKey(ticket) {
  return `${ticket.id}\n${ticket.subject}\n${ticket.messages}`;
}

function readTicket() {
  const id = location.pathname.match(/^\/agent\/tickets\/(\d+)(?:\/|$)/)?.[1];
  const conversations = [...document.querySelectorAll('[data-test-id="ticket-main-conversation"]')]
    .filter(isVisible);
  if (!id || conversations.length !== 1) return null;
  const conversation = conversations[0];
  return {
    id,
    subject: conversation.querySelector('[aria-label="Subject"]')?.value || document.title,
    messages: [...conversation.querySelectorAll('[data-test-id="omni-log-comment-item"]')]
      .map(ticketMessageText).join("\n\n"),
  };
}

function ticketMessageText(message) {
  const text = message.innerText.trim();
  const links = [...message.querySelectorAll("a[href]")]
    .filter((anchor) => /^https?:\/\//i.test(anchor.href))
    .map((anchor) => `${(anchor.innerText || anchor.textContent || "Linked page").trim()}: ${anchor.href}`);
  const destinations = [...new Set(links)];
  return destinations.length ? `${text}\n\nLINK DESTINATIONS:\n${destinations.join("\n")}` : text;
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
