const spanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "bold", "italic", "href"],
  properties: {
    text: { type: "string" },
    bold: { type: "boolean" },
    italic: { type: "boolean" },
    href: { type: ["string", "null"] },
  },
};
const spansSchema = { type: "array", minItems: 1, items: spanSchema };

export const REPLY_FORMAT = {
  type: "json_schema",
  name: "formatted_support_reply",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        minItems: 1,
        items: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "spans"],
              properties: { type: { type: "string", enum: ["paragraph"] }, spans: spansSchema },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "items", "spaced"],
              properties: {
                type: { type: "string", enum: ["bulleted_list", "numbered_list"] },
                spaced: { type: "boolean" },
                items: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["spans"],
                    properties: { spans: spansSchema },
                  },
                },
              },
            },
          ],
        },
      },
    },
  },
};

const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character]);

function validLink(href) {
  // Missing href remains compatible with replies generated before link support.
  if (href === undefined || href === null) return true;
  if (typeof href !== "string" || !/^https?:\/\//i.test(href) || /[\u0000-\u0020\u007f]/.test(href)) return false;
  try {
    const url = new URL(href);
    return ["http:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validSpans(spans) {
  return Array.isArray(spans) && spans.length > 0
    && spans.every((span) => span && typeof span.text === "string"
      && typeof span.bold === "boolean" && typeof span.italic === "boolean" && validLink(span.href))
    && spans.some((span) => span.text.trim());
}

function validateReply(reply) {
  if (!reply || !Array.isArray(reply.blocks) || !reply.blocks.length
    || (reply.signature !== undefined && typeof reply.signature !== "string")
    || !reply.blocks.every((block) => {
      if (!block) return false;
      if (block.type === "paragraph") return validSpans(block.spans);
      return ["bulleted_list", "numbered_list"].includes(block.type)
        && typeof block.spaced === "boolean"
        && Array.isArray(block.items) && block.items.length > 0
        && block.items.every((item) => item && validSpans(item.spans));
    })) {
    throw new Error("OpenAI returned an invalid formatted reply. Generate the reply again.");
  }
  return reply;
}

export function formattedReplyFromText(text) {
  try {
    return validateReply(JSON.parse(text));
  } catch {
    throw new Error("OpenAI returned an invalid formatted reply. Generate the reply again.");
  }
}

function spansHtml(spans) {
  return spans.map((span) => {
    let html = escapeHtml(span.text).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
    if (span.italic) html = `<em>${html}</em>`;
    if (span.bold) html = `<strong>${html}</strong>`;
    if (span.href) html = `<a href="${escapeHtml(span.href)}">${html}</a>`;
    return html;
  }).join("");
}

export function replyHtml(reply) {
  // Plain text still uses the original paragraph and signature formatting.
  if (typeof reply === "string") {
    return reply.trim().replace(/\r\n?/g, "\n").split(/\n{2,}/).map((paragraph) =>
      `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("<p>&nbsp;</p>");
  }
  validateReply(reply);
  const blocks = reply.blocks.map((block) => {
    if (block.type === "paragraph") return `<p>${spansHtml(block.spans)}</p>`;
    const tag = block.type === "numbered_list" ? "ol" : "ul";
    const items = block.items.map((item, index) => {
      // Soft breaks survive editors that strip CSS margins or list-item styles.
      const gap = block.spaced && index < block.items.length - 1 ? "<br><br>" : "";
      return `<li>${spansHtml(item.spans)}${gap}</li>`;
    }).join("");
    return `<${tag}>${items}</${tag}>`;
  });
  if (reply.signature?.trim()) blocks.push(replyHtml(reply.signature));
  return blocks.map((html, index) => {
    const isList = ["bulleted_list", "numbered_list"].includes(reply.blocks[index]?.type);
    return `${index > 0 && !isList ? "<p>&nbsp;</p>" : ""}${html}`;
  }).join("");
}
