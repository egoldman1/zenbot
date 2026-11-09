import assert from "node:assert/strict";
import vm from "node:vm";
import { REPLY_FORMAT, formattedReplyFromText, replyHtml } from "./rich-text.mjs";

const span = (text, bold = false, italic = false, href = null) => ({ text, bold, italic, href });
const paragraph = (...spans) => ({ type: "paragraph", spans });
const list = (type, spaced, ...items) => ({ type, spaced, items: items.map((spans) => ({ spans })) });
const reply = {
  blocks: [
    paragraph(span("Hi Sam,")),
    paragraph(span("Please confirm "), span("the delivery address", true), span(" and "), span("keep the receipt", false, true), span(".")),
    list("bulleted_list", true, [span("Address: ", true), span("Unit 2 & Warehouse <B>")], [span("Order: ", true), span("101")]),
    list("numbered_list", false, [span("Check the address.")], [span("Reply with confirmation.", true, true)]),
    paragraph(span("Thanks,\nSupport")),
    paragraph(span("Vehicle PR code guide", false, false, "https://example.com/guide?vehicle=1&code=2")),
  ],
};
const html = replyHtml(reply);
assert.ok(html.includes("<strong>the delivery address</strong>"));
assert.ok(html.includes("<em>keep the receipt</em>"));
assert.ok(html.includes("<strong><em>Reply with confirmation.</em></strong>"));
assert.ok(html.includes("<ul><li><strong>Address: </strong>Unit 2 &amp; Warehouse &lt;B&gt;<br><br></li>"));
assert.ok(html.includes("<ol><li>Check the address.</li><li>"));
assert.ok(html.includes("<p>Thanks,<br>Support</p>"));
assert.ok(html.includes('<a href="https://example.com/guide?vehicle=1&amp;code=2">Vehicle PR code guide</a>'));
assert.equal(replyHtml({ blocks: [paragraph(span('A "helpful" <guide>', true, true, "https://example.com/guide"))] }),
  '<p><a href="https://example.com/guide"><strong><em>A &quot;helpful&quot; &lt;guide&gt;</em></strong></a></p>');
assert.equal((html.match(/<li>/g) || []).length, 4, "List spacing must not create blank bullets or alter numbering");
assert.ok(html.includes("</p><p>&nbsp;</p><p>"), "Paragraphs retain the existing blank-line spacing");
assert.ok(!/<p>&nbsp;<\/p><(?:ul|ol)>/.test(html), "Do not insert blank paragraphs before lists");
assert.ok(html.includes("</p><ul>"), "The first list follows its introduction immediately");
assert.ok(html.includes("</ul><ol>"), "Consecutive lists do not gain a leading blank paragraph");
assert.deepEqual(formattedReplyFromText(JSON.stringify(reply)), reply);
assert.equal(replyHtml("Hello\r\n\r\nSupport"), "<p>Hello</p><p>&nbsp;</p><p>Support</p>");

const unsafe = { blocks: [paragraph(span('<script>alert("x")</script><img src=x onerror=alert(1)>', true))] };
assert.equal(replyHtml(unsafe), '<p><strong>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;</strong></p>');
assert.equal(replyHtml({ blocks: [paragraph(span("Hi"))], signature: "Kind regards,\nAlex <admin>" }),
  "<p>Hi</p><p>&nbsp;</p><p>Kind regards,<br>Alex &lt;admin&gt;</p>");
for (const invalid of [null, {}, { blocks: [] }, { blocks: [{ type: "html", spans: [span("Unsafe")] }] },
  { blocks: [paragraph({ text: "text", bold: "true", italic: false })] },
  { blocks: [paragraph(span(" "))] }, { blocks: [list("numbered_list", true)] },
  { blocks: [list("bulleted_list", "yes", [span("Item")])] }]) {
  assert.throws(() => formattedReplyFromText(JSON.stringify(invalid)), /invalid formatted reply/);
  assert.throws(() => replyHtml(invalid), /invalid formatted reply/);
}
assert.throws(() => formattedReplyFromText("Hello, not JSON"), /invalid formatted reply/);
for (const href of ["javascript:alert(1)", "data:text/html,test", "//example.com", "file:///tmp/file", "https://", "https://example.com\n", 'https://example.com/" onclick="alert(1)', "https://user:password@example.com", 12]) {
  assert.throws(() => replyHtml({ blocks: [paragraph(span("Guide", false, false, href))] }), /invalid formatted reply/);
}
// Replies from an earlier installed version can still be rendered.
assert.equal(replyHtml({ blocks: [paragraph({ text: "Earlier reply", bold: false, italic: false })] }), '<p>Earlier reply</p>');

// Exercise the real service-worker draft -> structured reply -> editor path.
const previousChrome = globalThis.chrome;
const previousFetch = globalThis.fetch;
let listener;
let request;
let inserted;
let responseText = JSON.stringify(reply);
const page = vm.createContext({
  location: { pathname: "/agent/tickets/123" },
  getComputedStyle: () => ({ visibility: "visible" }),
  document: { querySelectorAll: () => [{
    getClientRects: () => [{}],
    getAttribute: () => "composer-123",
    ckeditorInstance: { setData: (value) => { inserted = value; }, getData: () => inserted },
  }] },
});
try {
  globalThis.chrome = {
    runtime: { onMessage: { addListener: (value) => { listener = value; } } },
    storage: { local: { get: async () => ({ apiKey: "test-key", zenbotSettings: { signature: "Alex" } }) } },
    scripting: { executeScript: async ({ func, args }) => {
      const insert = vm.runInContext(`(${func.toString()})`, page);
      return [{ result: insert(...args) }];
    } },
  };
  globalThis.fetch = async (url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ output_text: responseText }) };
  };
  await import("./background.mjs?rich-text-check");
  const send = (message) => new Promise((resolve) => listener(message, { tab: { id: 1 } }, resolve));
  const result = await send({ type: "draft", note: "Bold the address and use a spaced list.", ticket: { id: "123", subject: "Delivery", messages: "Please confirm" } });
  assert.equal(result.error, undefined);
  assert.equal(result.reply.signature, "Alex");
  assert.deepEqual(request.text.format, REPLY_FORMAT);
  assert.equal(request.model, "gpt-6-luna");
  const insertion = await send({ type: "insert", reply: result.reply, ticketId: "123", composerToken: "composer-123" });
  assert.equal(insertion.ok, true);
  assert.equal(inserted, replyHtml({ ...reply, signature: "Alex" }));
  responseText = "Unstructured output";
  const invalid = await send({ type: "draft", note: "Reply", ticket: { subject: "Delivery", messages: "Hello" } });
  assert.match(invalid.error, /invalid formatted reply/);
} finally {
  if (previousChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = previousChrome;
  globalThis.fetch = previousFetch;
}
console.log("rich-text checks passed");
