const API = {
  async get(path) {
    const res = await fetch(path);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  }
};

// Tabs
for (const btn of document.querySelectorAll(".tab-btn")) {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active", "text-cyan-400"));
    btn.classList.add("active", "text-cyan-400");
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));
    document.getElementById(`tab-${tab}`).classList.remove("hidden");
    if (tab === "contexts") loadContexts();
    if (tab === "brain") loadWorkingMemory();
    if (tab === "maintenance") loadStats();
  });
}

// Namespace
API.get("/api/namespace").then((data) => {
  document.getElementById("namespace").textContent = data.namespace;
});

// Contexts
async function loadContexts() {
  const data = await API.get("/api/contexts");
  const list = document.getElementById("contexts-list");
  list.innerHTML = "";
  for (const ctx of data.contexts || []) {
    const el = document.createElement("div");
    el.className = "context-item bg-gray-800 rounded p-3 flex justify-between items-center";
    el.innerHTML = `<span class="font-mono text-sm text-cyan-300">${ctx.uri}</span><span class="text-xs text-gray-500">★${ctx.priority}</span>`;
    el.addEventListener("click", () => browseContext(ctx.uri));
    list.appendChild(el);
  }
}

async function browseContext(uri) {
  const data = await API.get(`/api/contexts/browse?uri=${encodeURIComponent(uri)}`);
  const list = document.getElementById("contexts-list");
  list.innerHTML = `<div class="mb-2 text-gray-400">Browsing: ${uri}</div>`;
  if (!data.children?.length) {
    list.innerHTML += `<div class="text-gray-500">No children.</div>`;
    return;
  }
  for (const child of data.children) {
    const el = document.createElement("div");
    el.className = "context-item bg-gray-800 rounded p-3 ml-4";
    el.innerHTML = `<div class="font-mono text-sm text-cyan-300">${child.domain}://${child.path}</div><div class="text-xs text-gray-400">${child.content_snippet}</div>`;
    el.addEventListener("click", () => browseContext(`${child.domain}://${child.path}`));
    list.appendChild(el);
  }
}

document.getElementById("search-btn").addEventListener("click", async () => {
  const q = document.getElementById("search-input").value;
  if (!q) return;
  const data = await API.get(`/api/contexts/search?q=${encodeURIComponent(q)}&limit=20`);
  const list = document.getElementById("contexts-list");
  list.innerHTML = `<div class="mb-2 text-gray-400">Search: "${q}"</div>`;
  for (const r of data.results || []) {
    const el = document.createElement("div");
    el.className = "context-item bg-gray-800 rounded p-3";
    el.innerHTML = `<div class="font-mono text-sm text-cyan-300">${r.uri} <span class="text-xs text-gray-500">(${r.source})</span></div><div class="text-xs text-gray-400">${r.snippet}</div>`;
    list.appendChild(el);
  }
});

// Brain
async function loadWorkingMemory() {
  const data = await API.get("/api/brain/working-memory");
  const container = document.getElementById("wm-slots");
  container.innerHTML = "";
  for (const slot of data.slots || []) {
    const el = document.createElement("div");
    el.className = "wm-slot bg-gray-900 rounded p-2 text-sm";
    el.innerHTML = `<div class="text-cyan-300 font-mono">${slot.uri}</div><div class="text-xs text-gray-400">score: ${slot.relevance_score.toFixed(2)} | source: ${slot.activation_source}</div>`;
    container.appendChild(el);
  }
  if (!data.slots?.length) container.innerHTML = `<div class="text-gray-500">Empty</div>`;
}

document.getElementById("activation-btn").addEventListener("click", async () => {
  const q = document.getElementById("activation-input").value;
  if (!q) return;
  const data = await API.get(`/api/brain/activations?q=${encodeURIComponent(q)}`);
  const container = document.getElementById("activation-results");
  container.innerHTML = "";
  for (const a of data.activations || []) {
    const el = document.createElement("div");
    el.className = "bg-gray-900 rounded p-2";
    el.innerHTML = `<div class="font-mono text-xs text-cyan-300">${a.uri || a.node_uuid} <span class="text-gray-500">score: ${a.score.toFixed(3)}</span></div>
      <div class="activation-bar mt-1"><div style="width:${Math.round(a.score * 100)}%"></div></div>`;
    container.appendChild(el);
  }
});

// Maintenance
async function loadStats() {
  const data = await API.get("/api/maintenance/stats");
  document.getElementById("stat-nodes").textContent = data.stats?.nodes ?? "-";
  document.getElementById("stat-memories").textContent = data.stats?.memories ?? "-";
  document.getElementById("stat-edges").textContent = data.stats?.edges ?? "-";
  document.getElementById("stat-episodes").textContent = data.stats?.episodes ?? "-";
}

function log(msg) {
  const el = document.getElementById("maintenance-log");
  el.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

document.getElementById("btn-sync").addEventListener("click", () => log("Sync not yet implemented via web API. Use TUI /cce modal."));
document.getElementById("btn-dream").addEventListener("click", () => log("Dream not yet implemented via web API. Use TUI /cce modal."));
document.getElementById("btn-rebuild").addEventListener("click", () => log("Rebuild not yet implemented via web API. Use TUI /cce modal."));

// Initial load
loadContexts();
