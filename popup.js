const apiKey = document.getElementById("apiKey");
const status = document.getElementById("status");
document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;

chrome.storage.local.get("apiKey", (saved) => apiKey.value = saved.apiKey || "");
document.getElementById("save").addEventListener("click", async () => {
  if (!apiKey.value.trim()) return status.textContent = "Enter an API key.";
  await chrome.storage.local.set({ apiKey: apiKey.value.trim() });
  status.textContent = "Saved.";
});
