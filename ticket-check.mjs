import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { insertReplyInPage } from "./background.mjs";

const writes = [];
function editor(token, visible = true) {
  return {
    token, visible,
    getClientRects() { return this.visible ? [{}] : []; },
    getAttribute() { return this.token; },
    ckeditorInstance: {
      setData(html) { writes.push({ token, html }); },
      getData() { return "reply"; },
    },
  };
}
const original = editor("original");
const hidden = editor("other-ticket", false);
const context = vm.createContext({
  location: { pathname: "/agent/tickets/123" },
  document: { querySelectorAll: () => [hidden, original] },
  getComputedStyle: () => ({ visibility: "visible" }),
});
const insert = vm.runInContext(`(${insertReplyInPage.toString()})`, context);
assert.equal(insert("<p>Reply</p>", "123", "original").ok, true);
assert.deepEqual(writes, [{ token: "original", html: "<p>Reply</p>" }], "Skip hidden editors even when they appear first");

context.location.pathname = "/agent/tickets/456";
original.visible = false;
hidden.visible = true;
assert.equal(insert("<p>Second ticket reply</p>", "456", "other-ticket").ok, true);
assert.deepEqual(writes[1], { token: "other-ticket", html: "<p>Second ticket reply</p>" },
  "Switching tickets routes the new reply to that ticket's corresponding editor");
original.visible = true;
hidden.visible = false;

writes.length = 0;
context.location.pathname = "/agent/tickets/456";
assert.ok(insert("Reply", "123", "original").error, "Reject a ticket switch during generation");
context.location.pathname = "/agent/tickets/123";
original.token = "replacement";
assert.ok(insert("Reply", "123", "original").error, "Reject a replaced or reused composer");
original.token = "original";
hidden.visible = true;
assert.ok(insert("Reply", "123", "original").error, "Reject ambiguous visible composers");
hidden.visible = false;
original.visible = false;
assert.ok(insert("Reply", "123", "original").error, "Reject a hidden original composer");
original.visible = true;
assert.ok(insert("Reply", undefined, "original").error, "Reject insertion without ticket identity");
assert.ok(insert("Reply", "123", undefined).error, "Reject insertion without composer identity");
context.location.pathname = "/agent/home";
assert.ok(insert("Reply", "123", "original").error);
assert.equal(writes.length, 0, "Rejected insertions must never write to any editor");

// Exercise ticket extraction and async generation with two retained ticket DOMs.
const source = readFileSync(new URL("./content.js", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("async function generate(panel)"));
function conversation(subject, messages, visible) {
  return {
    getClientRects: () => visible ? [{}] : [],
    querySelector: () => ({ value: subject }),
    querySelectorAll: () => messages.map((innerText) => ({ innerText, querySelectorAll: () => [] })),
  };
}
let visibleConversations = [conversation("Hidden", ["Wrong context"], false), conversation("Active", ["Right context"], true)];
const controls = new Map();
const panel = {
  zenbotSettings: { useSummaryForResponse: false },
  querySelector(selector) {
    if (!controls.has(selector)) controls.set(selector, { value: "Please reply", style: {}, setAttribute() {} });
    return controls.get(selector);
  },
};
let resolveDraft;
const requests = [];
const composer = {
  getClientRects: () => [{}],
  setAttribute(name, value) { this.token = value; },
  getAttribute() { return this.token; },
  removeAttribute() { this.token = null; },
};
const page = vm.createContext({
  location: { pathname: "/agent/tickets/123" },
  document: {
    querySelectorAll: (selector) => selector.includes("ticket-main-conversation") ? visibleConversations : [composer],
    title: "Zendesk",
  },
  getComputedStyle: () => ({ visibility: "visible" }),
  crypto: { randomUUID: () => "request-token" },
  performance: { now: () => 100 },
  updateReplyAvailability() {},
  chrome: { runtime: { sendMessage(message) {
    requests.push(message);
    return new Promise((resolve) => { resolveDraft = resolve; });
  } } },
  panel,
});
vm.runInContext(functions, page);
page.linkedMessage = {
  innerText: "Read the parts guide",
  querySelectorAll: () => [
    { innerText: "Parts guide", href: "https://example.com/parts?vehicle=1&part=2" },
    { innerText: "Parts guide", href: "https://example.com/parts?vehicle=1&part=2" },
    { innerText: "Other", href: "javascript:alert(1)" },
  ],
};
assert.equal(vm.runInContext("ticketMessageText(linkedMessage)", page),
  "Read the parts guide\n\nLINK DESTINATIONS:\nParts guide: https://example.com/parts?vehicle=1&part=2",
  "Preserve and deduplicate titled link destinations when reading the ticket");
assert.equal(vm.runInContext("readTicket().subject", page), "Active");
assert.equal(vm.runInContext("readTicket().messages", page), "Right context");
const pending = vm.runInContext("generate(panel)", page);
assert.equal(requests[0].ticket.id, "123");
page.location.pathname = "/agent/tickets/456";
resolveDraft({ text: "Generated for ticket 123" });
await pending;
assert.equal(requests.length, 1, "A ticket switch must prevent sending the insertion request");
assert.match(panel.querySelector("#zenbot-status").textContent, /active ticket changed/);
assert.equal(composer.token, null, "Release the composer marker after generation");

panel.zenbotSettings.useSummaryForResponse = true;
panel.zenbotSummary = { summary: ["Old ticket"] };
panel.zenbotTicketKey = "123\nActive\nRight context";
await vm.runInContext("generate(panel)", page);
assert.equal(requests.length, 1, "A previous ticket's summary must not be sent for drafting");
assert.match(panel.querySelector("#zenbot-status").textContent, /earlier ticket/);
const currentSummary = { summary: ["Ticket 456"], nextSteps: ["Ask for details"] };
const conversation456 = conversation("Ticket 456", ["Customer details"], true);
visibleConversations = [conversation456];
const pendingSummary = vm.runInContext("summarize(panel, true)", page);
page.location.pathname = "/agent/tickets/789";
resolveDraft({ summary: currentSummary });
await pendingSummary;
assert.equal(panel.zenbotSummary, null, "Discard a summary completed after switching tickets");
assert.match(panel.querySelector("#zenbot-summary-status").textContent, /ticket changed/);
page.location.pathname = "/agent/tickets/123";
visibleConversations = [conversation("Active", ["Right context"], true)];
panel.zenbotSettings.useSummaryForResponse = false;
panel.querySelector("#zenbot-note").value = "Confirm the address and ask for the rego.";
page.chrome.runtime.sendMessage = async (message) => message.type === "draft"
  ? { reply: { blocks: [{ type: "paragraph", spans: [{ text: "Hi Sam,", bold: false, italic: false, href: null }] }] } }
  : { ok: true };
await vm.runInContext("generate(panel)", page);
assert.match(panel.querySelector("#zenbot-status").textContent, /Inserted into Public reply/);
assert.equal(panel.querySelector("#zenbot-note").value, "Confirm the address and ask for the rego.",
  "Keep the draft instruction after successfully inserting a generated reply");
visibleConversations = [conversation("One", [], true), conversation("Two", [], true)];
assert.equal(vm.runInContext("readTicket()", page), null, "Reject ambiguous ticket context");
console.log("ticket checks passed");
