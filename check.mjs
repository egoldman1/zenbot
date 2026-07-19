import { DRAFT_INSTRUCTIONS, replyHtml, summaryFromResponse, textFromResponse } from "./background.mjs";

console.assert(textFromResponse({ output_text: "  Hello Sam  " }) === "Hello Sam");
console.assert(textFromResponse({ output: [{ content: [{ type: "output_text", text: "Hi" }] }] }) === "Hi");
console.assert(replyHtml("Hi,\n\nThanks.\n\nRegards,\nSupport") ===
  "<p>Hi,</p><p>&nbsp;</p><p>Thanks.</p><p>&nbsp;</p><p>Regards,<br>Support</p>");
console.assert(DRAFT_INSTRUCTIONS.includes("what it is, why it is needed"));
console.assert(DRAFT_INSTRUCTIONS.includes("vehicle PR codes"));
console.assert(DRAFT_INSTRUCTIONS.includes("Never invent completed actions"));
console.assert(DRAFT_INSTRUCTIONS.includes("summary and next steps as your response plan"));
console.assert(summaryFromResponse({ output_text: JSON.stringify({
  summary: ["Customer cannot log in.", "Password was reset."],
  nextSteps: ["Acknowledge the issue.", "Explain what information is needed."],
}) }).nextSteps.length === 2);
console.log("check passed");
