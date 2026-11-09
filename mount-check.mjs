import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Minimal DOM fixture for mounting only; no ticket data or API calls are used.
class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.isConnected = true;
    this.children = [];
    this.listeners = [];
    const properties = new Map();
    this.style = {
      setProperty(name, value, priority = "") { properties.set(name, [value, priority]); },
      getPropertyValue(name) { return properties.get(name)?.[0] || ""; },
      getPropertyPriority(name) { return properties.get(name)?.[1] || ""; },
      removeProperty(name) { properties.delete(name); },
    };
    const classes = new Set();
    this.classList = {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    };
    this.controls = new Map();
  }
  append(child) {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
  }
  remove() {
    if (this.parentElement) {
      const siblings = this.parentElement.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    }
  }
  after(child) {
    const parent = this.parentElement;
    child.remove();
    child.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, child);
  }
  closest(tag) {
    return this.tag === tag ? this : this.parentElement?.closest(tag);
  }
  querySelector(selector) {
    if (selector === '[data-test-id="omnipanel-selector-item-apps"]') return this.apps;
    if (selector === "button") return this.children.find((child) => child.tag === "button");
    if (!this.controls.has(selector)) this.controls.set(selector, new Element());
    return this.controls.get(selector);
  }
  querySelectorAll() { return []; }
  matches(selector) { return selector.includes("omnipanel-selector-wrapper") && !!this.apps; }
  getBoundingClientRect() { return { left: 960, top: 80 }; }
  getClientRects() { return this.visible ? [{}] : []; }
  addEventListener(...args) { this.listeners.push(args); }
  setAttribute() {}
  getAttribute() { return ""; }
  removeAttribute() {}
}

function sidebar() {
  const section = new Element();
  const selector = new Element();
  const list = new Element("ul");
  const appsItem = new Element("li");
  const apps = new Element("button");
  section.append(selector);
  selector.append(list);
  list.append(appsItem);
  appsItem.append(apps);
  selector.apps = apps;
  selector.visible = true;
  return { section, selector, list, appsItem };
}

const selectors = [];
let notifyMutation;
const context = vm.createContext({
  console,
  setTimeout,
  window: { innerWidth: 1024, innerHeight: 768, addEventListener() {} },
  location: { pathname: "/agent/tickets/123" },
  getComputedStyle: () => ({ visibility: "visible" }),
  ResizeObserver: class { observe() {} disconnect() {} },
  fetch: async () => ({ ok: true, text: async () => "<panel fixture>" }),
  chrome: { runtime: { getURL: (path) => path, getManifest: () => JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")) } },
  MutationObserver: class {
    constructor(callback) { notifyMutation = callback; }
    observe() {}
  },
  document: {
    body: new Element(),
    querySelectorAll: () => selectors,
    createElement: (tag) => new Element(tag),
  },
});
// Stub preferences loading to isolate sidebar lifecycle from form behaviour.
vm.runInContext(readFileSync(new URL("./content.js", import.meta.url), "utf8") +
  "\nasync function loadSettings() {}", context);
const flush = async () => { await new Promise(setImmediate); };
const ui = (section) => {
  context.testSection = section;
  return vm.runInContext("mountedUis.get(testSection)", context);
};
await flush();
assert.equal(ui({}), undefined, "Starting on an agent page without a rail is safe");

const first = sidebar();
selectors.push(first.selector);
await notifyMutation();
const original = ui(first.section);
assert.equal(original.item.parentElement, first.list, "Mount when a ticket rail appears");
assert.equal(original.panel.parentElement, context.document.body);
assert.equal(original.panel.querySelector("[data-zenbot-version]").textContent,
  `v${JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")).version}`);

await notifyMutation();
assert.equal(ui(first.section), original, "Unrelated DOM changes must not recreate the panel");
assert.equal(first.list.listeners.length, 1, "Do not accumulate click handlers");

original.item.remove();
await notifyMutation();
assert.equal(original.item.parentElement, first.list, "Restore a removed button");

first.list.remove();
const replacement = sidebar();
replacement.selector.remove();
first.section.append(replacement.selector);
first.selector.remove();
selectors.splice(0, 1, replacement.selector);
original.panel.savedDraft = "Keep this note";
await notifyMutation();
assert.equal(ui(first.section), original, "Keep panel state when only the rail is replaced");
assert.equal(original.item.parentElement, replacement.list);
assert.equal(original.panel.savedDraft, "Keep this note");
assert.equal(replacement.list.listeners.length, 1);

original.panel.remove();
await notifyMutation();
assert.equal(original.panel.parentElement, context.document.body, "Restore a removed panel");

replacement.selector.visible = false;
const next = sidebar();
selectors.push(next.selector);
await notifyMutation();
const nextUi = ui(next.section);
assert.equal(nextUi.section, next.section, "Mount a separate button for the next ticket");
assert.notEqual(nextUi.panel, original.panel, "Each ticket has its own panel");
assert.equal(original.item.parentElement, replacement.list, "Keep the original ticket's button while hidden");
assert.equal(original.panel.parentElement, context.document.body, "Keep the original ticket's panel while hidden");
nextUi.panel.savedDraft = "Second ticket note";
replacement.selector.visible = true;
next.selector.visible = false;
await notifyMutation();
assert.equal(ui(first.section), original, "Returning to the first ticket reuses its panel");
assert.equal(original.panel.savedDraft, "Keep this note", "Preserve the first ticket's note");
assert.equal(nextUi.panel.savedDraft, "Second ticket note", "Keep the second ticket's note separate");
assert.equal(original.item.parentElement, replacement.list);
assert.equal(nextUi.item.parentElement, next.list, "The second ticket also retains its button");
assert.equal(next.list.listeners.length, 1);

// An inactive ticket can lose its rail contents during Zendesk updates too.
nextUi.item.remove();
await notifyMutation();
assert.equal(nextUi.item.parentElement, next.list, "Restore buttons on inactive open tickets too");

// The panel is outside the clipped ticket sidebar and only one is shown.
const nativePane = new Element();
nativePane.style.setProperty("display", "flex", "important");
next.section.append(nativePane);
original.panel.zenbotSettings = nextUi.panel.zenbotSettings = { autoSummarize: false };
original.panel.zenbotSummary = nextUi.panel.zenbotSummary = {};
context.testUi = original;
await vm.runInContext("openPanel(testUi.section, testUi.panel, testUi.item)", context);
context.testUi = nextUi;
context.location.pathname = "/agent/tickets/456";
await vm.runInContext("openPanel(testUi.section, testUi.panel, testUi.item)", context);
assert.equal(nextUi.panel.parentElement, context.document.body, "Escape the sidebar clipping ancestors");
assert.equal(nextUi.panel.style.display, "block");
assert.equal(original.panel.style.display, "none", "Hide the old ticket's floating panel");
assert.equal(nativePane.style.getPropertyValue("display"), "flex", "Leave Zendesk's own panes visible");
assert.equal(nextUi.panel.style.getPropertyValue("--zenbot-panel-left"), "560px");
assert.equal(nextUi.panel.style.getPropertyValue("--zenbot-panel-height"), "608px", "Leave 80px for Zendesk's bottom controls");
context.location.pathname = "/agent/tickets/789";
await notifyMutation();
assert.equal(nextUi.panel.style.display, "none", "Close the panel when the active ticket changes");
context.testUi = original;
context.location.pathname = "/agent/tickets/123";
await vm.runInContext("openPanel(testUi.section, testUi.panel, testUi.item)", context);
assert.equal(original.panel.savedDraft, "Keep this note");
vm.runInContext("closePanel(testUi.section, testUi.panel, testUi.item)", context);
assert.equal(original.panel.style.display, "none");
next.section.isConnected = false;
selectors.splice(selectors.indexOf(next.selector), 1);
await notifyMutation();
assert.equal(nextUi.panel.parentElement, null, "Remove floating panels when their ticket sidebar is destroyed");
const css = readFileSync(new URL("./panel.css", import.meta.url), "utf8");
assert.match(css, /position: fixed;/);
assert.match(css, /width: var\(--zenbot-panel-width,/);

const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
assert.deepEqual(manifest.content_scripts[0].matches, ["https://*.zendesk.com/agent/*"]);
console.log("mount checks passed");
