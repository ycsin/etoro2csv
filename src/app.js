// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// UI for the eToro statement → CSV converter. Everything runs in the browser.
(function () {
  "use strict";
  const P = Object.assign({}, window.StatementExport, window.EtoroParser);
  const $ = (sel) => document.querySelector(sel);

  // Detail: "balance" (one returns row per month, the default), or rows by kind per
  // "month" or "day"; remembered in this browser.
  const MODE_KEY = "etoro-csv-group";
  const state = { workbook: null, file: null, error: null, result: null, mode: loadMode() };

  function loadMode() {
    try { const m = localStorage.getItem(MODE_KEY); return ["month", "day"].includes(m) ? m : "balance"; } catch { return "balance"; }
  }
  function setMode(mode) {
    state.mode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage unavailable */ }
    for (const b of document.querySelectorAll("#mode button")) {
      b.classList.toggle("on", b.dataset.mode === mode);
      b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    }
    recompute(true);
  }

  // ---------- reading the .xlsx ----------
  async function inflateRaw(data) {
    if (typeof DecompressionStream === "undefined") throw new Error("this browser can't decompress .xlsx files (no DecompressionStream); try a current Chrome, Edge, Firefox or Safari");
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function addFiles(fileList) {
    const file = [...fileList].find((f) => /\.xlsx$/i.test(f.name)) || fileList[0];
    if (!file) return;
    setBusy(`Reading ${file.name}…`);
    try {
      state.workbook = await Xlsx.read(new Uint8Array(await file.arrayBuffer()), inflateRaw);
      state.file = file.name; state.error = null;
    } catch (e) {
      state.workbook = null; state.file = file.name; state.error = String(e.message || e);
    }
    setBusy("");
    recompute(false);
  }

  function recompute(keepRange) {
    const prev = keepRange ? range() : null;
    state.result = state.workbook ? P.parseWorkbook(state.workbook, { group: state.mode }) : null;
    if (state.result && state.result.error) { state.error = state.result.error; state.result = null; }
    const months = state.result ? state.result.months : [];
    for (const id of ["from", "to"]) {
      const sel = $("#" + id), keep = prev && prev[id];
      sel.innerHTML = months.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join("");
      sel.value = keep && months.includes(keep) ? keep : id === "from" ? months[0] || "" : months[months.length - 1] || "";
    }
    render();
  }

  function range() {
    let from = $("#from").value, to = $("#to").value;
    if (from && to && from > to) [from, to] = [to, from];
    return { from, to };
  }
  const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const span = () => { const { from, to } = range(); return from === to ? from : `${from}_to_${to}`; };

  // ---------- files ----------
  function files() {
    const a = state.result.account;
    const { from, to } = range();
    const entries = a.entries.filter((e) => P.inRange(e.date, from, to));
    const anchors = a.anchors.filter((x) => P.inRange(x.date, from, to));
    const out = [];
    if (entries.length) out.push({ kind: "transactions", label: "Transactions CSV", name: `${a.name} - transactions - ${span()}.csv`, text: P.transactionsCsv(a.entries, from, to), count: entries.length });
    if (anchors.length) out.push({ kind: "balances", label: "Balances CSV", name: `${a.name} - balances - ${span()}.csv`, text: P.valuationsCsv(anchors.map((x) => [x.date, x.total]), from, to, a.currency), count: anchors.length });
    const start = P.openingBalance(a, from, to);
    // One QIF with the starting balance as its "Opening Balance" record.
    if (entries.length) out.splice(1, 0, { kind: "qif", label: "QIF", name: `${a.name} - ${span()}.qif`, text: P.qif(entries, start, a.name), count: entries.length });
    if (start) out.push({ kind: "accounts", label: "Accounts CSV", name: `${a.name} accounts - ${span()}.csv`, text: P.accountsCsv([{ type: "Investment", name: a.name, currency: a.currency, ...start }]), count: 1 });
    return { out, entries, anchors, start };
  }

  // ---------- rendering ----------
  function render() {
    const r = state.result;
    $("#empty").hidden = !!r || !!state.error;
    $("#results").hidden = !r;
    renderStatus();
    if (!r) return;
    const a = r.account;
    const { out, entries, anchors, start } = files();
    const n = (k) => entries.filter((e) => e.kind === k).length;
    const last = anchors[anchors.length - 1];
    const stats = [["Deposits / withdrawals", n("transfer")], ...(state.mode === "balance" ? [["Monthly adjustments", n("adjustment")]]
                     : [[state.mode === "day" ? "Daily rows" : "Monthly rows", n("income") + n("fee")], ["Unrealized updates", n("adjustment")]]),
                   [`Total equity ${last ? last.date : ""}`, last ? `${a.currency} ${fmtMoney(last.total)}` : "–"]];
    $("#cards").innerHTML = entries.length ? `
      <article class="card">
        <header><h3>${esc(a.name)}</h3><span class="tag investment">Investment</span></header>
        <dl>${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${typeof v === "number" ? fmtInt(v) : v}</dd></div>`).join("")}</dl>
        <p class="note">Starts at ${a.currency} ${fmtMoney(start.balance)} on ${start.date}. The balance equals total equity at each holdings snapshot and at the statement end, and follows realized equity in between.</p>
        <div class="buttons">${out.map((f) => `<button class="dl" data-kind="${f.kind}">${f.label}</button>`).join("")}</div>
      </article>` : `<p class="muted">No activity in the selected months.</p>`;
    $("#zip").disabled = !out.length;
    renderDiagnostics(r);
  }

  function renderStatus() {
    const el = $("#status");
    if (state.error) { el.innerHTML = `<p class="warn">${esc(state.file || "File")}: ${esc(state.error)}</p>`; return; }
    const r = state.result;
    if (!r) { el.innerHTML = ""; return; }
    el.innerHTML = `<p><strong>${esc(state.file)}</strong>, ${r.period.start || "?"} to ${r.period.end || "?"}, ${esc(r.account.currency)}</p>`
      + r.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join("");
  }

  function renderDiagnostics(r) {
    const how = (type, t) => {
      if (Math.abs(t.total) < 0.005) return "not exported (doesn't change realized equity)";
      const g = P.groupOf(type);
      if (g === null) return "exported one by one";
      return state.mode === "balance" ? "in the monthly returns row" : `summed into "${esc(g)}"`;
    };
    const rows = Object.entries(r.types).sort(([, a], [, b]) => b.count - a.count);
    $("#diagnostics").innerHTML = `
      <details>
        <summary>Activity types in the statement</summary>
        <ul>${rows.map(([type, t]) => `<li>${esc(type)}: ${fmtInt(t.count)} rows, ${fmtMoney(t.total)} ${esc(r.account.currency)} <span class="muted">(${how(type, t)})</span></li>`).join("")}</ul>
      </details>
      <details>
        <summary>Total equity checkpoints</summary>
        <ul>${r.account.anchors.map((x) => `<li>${x.date}: realized ${fmtMoney(x.realized)} + open positions ${fmtMoney(x.unrealized)} = ${fmtMoney(x.total)} <span class="muted">(${esc(x.source)})</span></li>`).join("")}</ul>
      </details>`;
  }

  // ---------- downloads ----------
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("#cards").addEventListener("click", (e) => {
    const b = e.target.closest("button.dl");
    if (!b) return;
    const f = files().out.find((x) => x.kind === b.dataset.kind);
    if (f) download(f.name, new Blob([f.text], { type: "text/csv" }));
  });
  $("#zip").addEventListener("click", () => download(`etoro-csv-${span()}.zip`, zip(files().out)));

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder();
    const chunks = [], central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const put = (view, fields) => fields.forEach(([o, v, s]) => (s === 4 ? view.setUint32(o, v, true) : view.setUint16(o, v, true)));
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      put(local, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dosTime, 2], [12, dosDate, 2], [14, crc, 4],
        [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]);
      const cen = new DataView(new ArrayBuffer(46));
      put(cen, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dosTime, 2], [14, dosDate, 2], [16, crc, 4],
        [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]);
      chunks.push(local, name, data);
      central.push(cen, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, c) => s + c.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    put(end, [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4], [20, 0, 2]]);
    return new Blob([...chunks, ...central, end], { type: "application/zip" });
  }

  // ---------- input ----------
  const drop = $("#drop"), picker = $("#picker");
  drop.addEventListener("click", () => picker.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); picker.click(); } });
  picker.addEventListener("change", () => { addFiles(picker.files); picker.value = ""; });
  for (const ev of ["dragenter", "dragover"]) document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || e.target === document.documentElement) drop.classList.remove("over"); });
  document.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  $("#mode").addEventListener("click", (e) => { const b = e.target.closest("button[data-mode]"); if (b) setMode(b.dataset.mode); });
  $("#from").addEventListener("change", render);
  $("#to").addEventListener("change", render);
  $("#clear").addEventListener("click", () => { state.workbook = null; state.file = null; state.error = null; recompute(false); });

  // ---------- helpers ----------
  function setBusy(msg) { $("#busy").textContent = msg || ""; $("#busy").hidden = !msg; }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
  const fmtInt = (n) => n.toLocaleString();
  const fmtMoney = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  setMode(state.mode);
})();
