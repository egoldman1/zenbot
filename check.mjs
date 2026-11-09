import {
  DEFAULT_SETTINGS,
  DRAFT_INSTRUCTIONS,
  MODEL_REASONING_EFFORTS,
  appendSignature,
  draftingPreferences,
  normalizeSettings,
  replyHtml,
  responseContext,
  summaryFromResponse,
  textFromResponse,
} from "./background.mjs";
import { readFileSync } from "node:fs";

const panelHtml = readFileSync(new URL("./panel.html", import.meta.url), "utf8");
const panelCss = readFileSync(new URL("./panel.css", import.meta.url), "utf8");
const settingsInfo = readFileSync(new URL("./settings-info.js", import.meta.url), "utf8");
console.assert(panelHtml.includes('id="zenbot-home"'));
console.assert(panelHtml.includes('id="zenbot-settings-form"'));
console.assert(panelHtml.includes('id="zenbot-generation-time"'));


console.assert(!panelHtml.includes("<script"));
console.assert(panelCss.includes("#zenbot-settings select"));
console.assert(settingsInfo.includes("ZENBOT_SETTING_INFO"));

console.assert(textFromResponse({ output_text: "  Hello Sam  " }) === "Hello Sam");
console.assert(textFromResponse({ output: [{ content: [{ type: "output_text", text: "Hi" }] }] }) === "Hi");
console.assert(replyHtml("Hi,\n\nThanks.\n\nRegards,\nSupport") ===
  "<p>Hi,</p><p>&nbsp;</p><p>Thanks.</p><p>&nbsp;</p><p>Regards,<br>Support</p>");
console.assert(DRAFT_INSTRUCTIONS.includes("what it is, why it is needed"));
console.assert(DRAFT_INSTRUCTIONS.includes("vehicle PR codes"));
console.assert(DRAFT_INSTRUCTIONS.includes("Never invent completed actions"));
console.assert(DRAFT_INSTRUCTIONS.includes("either the full ticket or a generated summary"));
console.assert(normalizeSettings({ responseLength: "invalid", autoSummarize: false }).responseLength === "balanced");
console.assert(normalizeSettings({ useSummaryForResponse: true }).useSummaryForResponse === true);
console.assert(normalizeSettings({ summaryModel: "unknown" }).summaryModel === DEFAULT_SETTINGS.summaryModel);
console.assert(normalizeSettings({ summaryModel: "unsupported-model" }).summaryModel === DEFAULT_SETTINGS.summaryModel);
console.assert(MODEL_REASONING_EFFORTS["gpt-6-luna"].includes("max"));
console.assert(draftingPreferences({ responseLength: "concise", toneInstructions: "Direct and calm.", signature: "Alex" }).includes("Direct and calm."));
console.assert(appendSignature("Hello", "Kind regards,\nAlex") === "Hello\n\nKind regards,\nAlex");
console.assert(responseContext({ useSummaryForResponse: false }, null, { subject: "Login", messages: "Cannot sign in" }).includes("FULL ZENDESK TICKET"));
console.assert(responseContext({ useSummaryForResponse: true }, { summary: ["Cannot sign in"], nextSteps: ["Ask for error"] }, null).includes("NEXT STEPS"));
console.assert(summaryFromResponse({ output_text: JSON.stringify({
  summary: ["Customer cannot log in.", "Password was reset."],
  nextSteps: ["Acknowledge the issue.", "Explain what information is needed."],
}) }).nextSteps.length === 2);
console.log("check passed");

for (const model of ["gpt-5.6-luna", "gpt-5.6-sol", "unknown"]) {
 const settings = normalizeSettings({summaryModel: model, responseModel: model, summaryReasoningEffort: "high", responseReasoningEffort: "max"});
 console.assert(settings.summaryModel === "gpt-6-luna" && settings.responseModel === "gpt-6-luna");
 console.assert(settings.summaryReasoningEffort === "high" && settings.responseReasoningEffort === "max");
}
console.assert(!/<select id="zenbot-(summary|response)-model"/.test(panelHtml));
console.assert(panelHtml.includes('id="zenbot-summary-reasoning"') && panelHtml.includes('id="zenbot-response-reasoning"'));
