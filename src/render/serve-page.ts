/**
 * The served preview page: the interaction shell of the vscode webview
 * (drag with stable ids, detail filters, pan and cursor zoom) with the
 * pipeline swapped for a round-trip — POST /render returns the SVG for
 * the current view state, /events reloads on file changes.
 */

export const PAGE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>plantuml preview</title>
<style>
  :root {
    --bg: #fdfdf6; --fg: #1c1c14; --panel: #f0efe4; --border: #c9c8ba;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #1e1e1e; --fg: #d4d4d4; --panel: #252526; --border: #3f3f46; }
  }
  body { margin: 0; background: var(--bg); color: var(--fg); overflow: hidden;
         font-family: ui-monospace, monospace; font-size: 12px; }
  #toolbar { position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    display: flex; gap: 14px; align-items: center; padding: 6px 10px;
    background: var(--panel); border-bottom: 1px solid var(--border);
    user-select: none; }
  #toolbar label { display: flex; gap: 4px; align-items: center; cursor: pointer; }
  #toolbar button { background: transparent; color: inherit;
    border: 1px solid var(--border); border-radius: 3px;
    padding: 2px 8px; cursor: pointer; font-size: 11px; }
  #status { color: color-mix(in srgb, var(--fg) 60%, transparent); }
  #stage { position: absolute; inset: 32px 0 0 0; overflow: hidden;
    cursor: grab; touch-action: none; }
  #root { position: absolute; transform-origin: 0 0; padding: 8px; }
  #root svg { display: block; }
  .pr-box, .pr-note, .pr-container { cursor: move; }
  #root { --pr-stroke: var(--fg); --pr-text: var(--fg);
    --pr-box-fill: var(--panel); --pr-note-fill: var(--panel);
    --pr-container-fill: transparent; --pr-font: ui-monospace, monospace; }
  .error { color: #d66; white-space: pre-wrap; padding: 2em; }
</style>
</head>
<body>
<div id="toolbar">
  <label><input type="checkbox" id="f-members" checked> members</label>
  <label><input type="checkbox" id="f-namespaces" checked> namespaces</label>
  <label><input type="checkbox" id="f-notes" checked> notes</label>
  <button id="reset-layout">reset layout</button>
  <button id="reset-view">reset view</button>
  <span id="status"></span>
</div>
<div id="stage"><div id="root">rendering…</div></div>
<script>
  const positions = {};
  const filters = { members: true, namespaces: true, notes: true };
  const view = { x: 0, y: 0, scale: 1 };
  const root = () => document.getElementById("root");
  const stage = () => document.getElementById("stage");

  let inFlight = false, again = false;
  async function rerender() {
    if (inFlight) { again = true; return; }
    inFlight = true;
    try {
      const res = await fetch("/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...filters, positions }),
      });
      const text = await res.text();
      root().innerHTML = res.ok
        ? text
        : '<pre class="error">' + text.replace(/</g, "&lt;") + "</pre>";
      applyView();
    } finally {
      inFlight = false;
      if (again) { again = false; rerender(); }
    }
  }
  function applyView() {
    root().style.transform =
      "translate(" + view.x + "px," + view.y + "px) scale(" + view.scale + ")";
  }

  let drag = null, panning = null, queued = false;
  function queueRender() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; rerender(); });
  }
  function draggableGroup(target) {
    let el = target;
    while (el && el.tagName !== "svg") {
      if (el.classList && (el.classList.contains("pr-box") ||
          el.classList.contains("pr-note") || el.classList.contains("pr-container"))) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }
  stage().addEventListener("pointerdown", (ev) => {
    const group = draggableGroup(ev.target);
    if (group) {
      const base = positions[group.id] || { dx: 0, dy: 0 };
      drag = { id: group.id, startX: ev.clientX, startY: ev.clientY,
               baseDx: base.dx, baseDy: base.dy };
    } else {
      panning = { startX: ev.clientX, startY: ev.clientY,
                  baseX: view.x, baseY: view.y };
    }
    stage().setPointerCapture(ev.pointerId);
  });
  stage().addEventListener("pointermove", (ev) => {
    if (drag) {
      positions[drag.id] = {
        dx: drag.baseDx + Math.round((ev.clientX - drag.startX) / view.scale),
        dy: drag.baseDy + Math.round((ev.clientY - drag.startY) / view.scale),
      };
      queueRender();
    } else if (panning) {
      view.x = panning.baseX + (ev.clientX - panning.startX);
      view.y = panning.baseY + (ev.clientY - panning.startY);
      applyView();
    }
  });
  stage().addEventListener("pointerup", () => { drag = null; panning = null; });
  stage().addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = Math.min(4, Math.max(0.2, view.scale * factor));
    const rect = stage().getBoundingClientRect();
    const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top;
    view.x = cx - ((cx - view.x) * next) / view.scale;
    view.y = cy - ((cy - view.y) * next) / view.scale;
    view.scale = next;
    applyView();
  }, { passive: false });

  for (const [id, key] of [["f-members", "members"],
      ["f-namespaces", "namespaces"], ["f-notes", "notes"]]) {
    document.getElementById(id).addEventListener("change", (ev) => {
      filters[key] = ev.target.checked;
      rerender();
    });
  }
  document.getElementById("reset-layout").addEventListener("click", () => {
    for (const key of Object.keys(positions)) delete positions[key];
    rerender();
  });
  document.getElementById("reset-view").addEventListener("click", () => {
    view.x = 0; view.y = 0; view.scale = 1; applyView();
  });

  const events = new EventSource("/events");
  events.onmessage = (ev) => { if (ev.data === "change") rerender(); };
  events.onerror = () => {
    document.getElementById("status").textContent = "server stopped";
  };
  rerender();
</script>
</body>
</html>
`;
