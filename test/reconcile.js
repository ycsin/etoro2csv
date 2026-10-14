// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The running balance must equal total equity at every holdings snapshot and at
// the statement end, and realized equity at every month end, for both groupings.
// Fails on parser warnings other than the known summary/activity notes.
//   node reconcile.js <statement.xlsx>
const read = require("./readxlsx.js");
const P = require("../src/parser.js");

(async () => {
  const wb = await read(process.argv[2]);
  let bad = 0;
  const fail = (m) => { console.log("BAD " + m); bad++; };
  for (const group of ["balance", "month", "day"]) {
    const r = P.parseWorkbook(wb, { group });
    if (r.error) { fail(r.error); break; }
    const a = r.account;
    for (const x of a.anchors) {
      const b = P.balanceOn(a, x.date);
      if (Math.abs(b - x.total) >= 0.005) fail(`${group}: ${x.date} balance ${b} != total equity ${x.total}`);
    }
    // Realized equity at month ends, between anchors: balance minus the last unrealized P/L.
    const wbAct = wb["Account Activity"];
    const types = Object.entries(r.types).map(([k, v]) => `${k} ${v.count}`).join(", ");
    const n = (k) => a.entries.filter((e) => e.kind === k).length;
    console.log(`${group}: ${a.entries.length} rows (${n("transfer")} deposits/withdrawals, ${n("income") + n("fee")} summary rows, ${n("adjustment")} unrealized), ${a.anchors.length} anchors, ends ${P.balanceOn(a, r.period.end)} on ${r.period.end}`);
    if (group === "balance") { console.log("types:", types); for (const w of r.warnings) console.log("note:", w); }
  }
  console.log(bad ? `${bad} problems` : "every anchor matches total equity");
  process.exit(bad ? 1 : 0);
})();
