# etoro2csv

Converts an eToro account statement (the Excel `.xlsx` download) into CSV or QIF files for a
personal finance app.

**Use it at <https://ycsin.github.io/etoro2csv/>**, or download `index.html` and open it
locally. Drop the statement, pick the months, download. It's one self-contained file (no
libraries, no network access); the statement never leaves the browser.

**Unofficial, not affiliated with eToro.** Check the results against your statement before
relying on them.

## Output

One account, in the statement's currency. The running balance equals **total equity**
(realized equity plus open positions' profit/loss) at each holdings snapshot and at the
statement end, and follows realized equity in between: the statement only values open
positions at those dates.

- *Balance only* (default): every deposit and withdrawal, and one *Returns (month-end
  adjustment)* row per month with everything else (closed positions, dividends, overnight
  fees and refunds, interest, other fees and adjustments, change in open positions'
  profit/loss), broken down in the notes
- *By kind, monthly* / *By kind, daily*: deposits and withdrawals, one row per kind and
  month (or day), and a *Change in unrealized gain/loss* row at each snapshot
- **Balances CSV**: total equity at each of those dates (`date,balance,currency`)
- **QIF**: the same transactions, starting with an *Opening Balance* record (the balance just
  before the first entry). QIF has no currency field, so import it into an account of the
  statement's currency. Dates are `YYYY-MM-DD`; name → payee (`P`), notes → memo (`M`).
- **Accounts CSV**: `Account type,Name,Balance,Currency,Balance Date`, with the balance just
  before the first exported entry

Transactions are `date,amount,currency,name,notes` with inflows positive. Opening positions,
copy-trading moves and stock splits don't change realized equity and are not exported.

## How it works

- `Account Activity`: each row's *Realized Equity Change* is what moves the balance;
  deposits and withdrawals are kept one by one, the rest summed per period and kind
- `Holdings`: for each snapshot, every open position's profit/loss is its value less the
  amount invested (times leverage for CFDs; the other way round for shorts), with the
  invested amount from its *Open Position* row less any part closed by then
- `Account Summary`: period, currency, beginning and ending equity

The `.xlsx` is unzipped with the browser's `DecompressionStream` and read with a small
built-in parser (shared strings and cell values only).

## Development

- `src/xlsx.js`: zip + worksheet reader
- `src/parser.js`: statement parsing, entries, equity checkpoints
- `src/export.js`: CSV formats
- `src/app.js`, `src/index.template.html`: the UI
- `python3 build.py`: rebuilds `index.html` (inlines everything). Commit the result: GitHub
  Pages serves `index.html` as-is, and the *Build check* workflow fails if it's out of date.

Tests need your own statement and write private output; keep it outside the repo or in
`test/out/` (git-ignored). `cd test && npm install`, then:
- `node reconcile.js <statement.xlsx>`: the balance hits total equity at every checkpoint, in every mode
- `CHROME=<chrome-headless-shell> node e2e.js <statement.xlsx> <out dir>`: drive the page, save the zips

## License

Apache License 2.0, see [LICENSE](LICENSE). Not affiliated with or endorsed by eToro.
