/**
 * Accounting data layer (mock) for the Finance module.
 * Confirmed transactions + Quick/Advanced search + CSV/XLSX export.
 * Replace the generated POOL with real DB queries when the backend is ready.
 */

const ACQUIRERS = [
  "ADCB", "ADIB", "Alinma", "Al Rajhi Bank", "Aman", "Amex KSA", "Amex MENA",
  "ANB", "Bank Muscat", "Banque Misr", "BroadSpectrum", "BSF", "CIB", "FAB",
  "Fawry", "GIB", "MEPS", "NI", "QNB", "ValU Egypt"
];
const ACCOUNT_TYPES = ["Primary", "Secondary", "PSP"];
const TYPES   = ["Auth", "Capture", "Void", "Refund", "Chargeback", "Original Credit", "Sale"];
const CLASSES = ["Sale", "Capture", "Refund", "Chargeback"];
const METHODS = ["MasterCard", "Visa", "ValU", "Merchant Wallet", "ApplePay", "MEPS", "Mada"];
const STATUSES = ["A", "E", "H"]; // Confirmed / Error / Hold

const PROFILES = [135406, 116879, 124906, 127874, 118489, 112812, 137913, 90321];
const ACCOUNTS = [10681, 8072, 9773, 8950, 8948, 10063, 8168, 9200];
const CUR_BY_ACQ = {
  "CIB": "EGP", "Banque Misr": "EGP", "Fawry": "EGP", "ValU Egypt": "EGP", "Aman": "EGP",
  "Al Rajhi Bank": "SAR", "Alinma": "SAR", "ANB": "SAR", "BSF": "SAR", "GIB": "SAR",
  "Amex KSA": "SAR", "Bank Muscat": "OMR", "QNB": "QAR", "MEPS": "JOD"
};
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function pad(n) { return n < 10 ? "0" + n : "" + n; }
function fmt(d) { return pad(d.getUTCDate()) + "/" + MON[d.getUTCMonth()] + "/" + d.getUTCFullYear(); }
function iso(d) { return d.toISOString().slice(0, 10); }
function rng(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// Weighted acquirer pool: core acquirers appear far more often (realistic:
// a few acquirers carry most volume), so multi-filter searches still match data.
// Every acquirer still appears at least occasionally.
const ACQ_WEIGHTED = [];
const CORE_ACQ = ["ADIB", "ADCB", "NI", "CIB", "Al Rajhi Bank", "ANB", "FAB", "ValU Egypt"];
ACQUIRERS.forEach(function (a) { ACQ_WEIGHTED.push(a); });          // 1x each
CORE_ACQ.forEach(function (a) { for (let k = 0; k < 7; k++) ACQ_WEIGHTED.push(a); }); // +7x core

// Spread data across EVERY month (last 14 months), each month well populated,
// so searching/viewing any month returns records.
const MONTHS_BACK      = 14;   // Sep 2025 .. Oct 2026
const PER_MONTH_MIN    = 6;    // at least 6 per month
const PER_MONTH_EXTRA  = 12;   // + up to this many more, for search richness
const ANCHOR_Y = 2026, ANCHOR_M = 9, ANCHOR_D = 10;  // "today" = 10/Oct/2026

const POOL = [];
(function build() {
  const r = rng(26092026);
  let i = 0;
  for (let mi = 0; mi < MONTHS_BACK; mi++) {
    const base = new Date(Date.UTC(ANCHOR_Y, ANCHOR_M - mi, 1));
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const maxDay = (mi === 0) ? ANCHOR_D : daysInMonth;   // current month capped at today
    const perMonth = PER_MONTH_MIN + Math.floor(r() * (PER_MONTH_EXTRA + 1));

    for (let k = 0; k < perMonth; k++) {
      i++;
      const acquirer = ACQ_WEIGHTED[Math.floor(r() * ACQ_WEIGHTED.length)];
      const currency = CUR_BY_ACQ[acquirer] || "AED";
      const type = TYPES[Math.floor(r() * TYPES.length)];
      const cls = CLASSES[Math.floor(r() * CLASSES.length)];
      const method = METHODS[Math.floor(r() * METHODS.length)];
      const accType = ACCOUNT_TYPES[Math.floor(r() * ACCOUNT_TYPES.length)];
      const status = r() > 0.82 ? STATUSES[1 + Math.floor(r() * 2)] : "A";
      const amount = Math.round((1 + r() * 2999) * 100) / 100;
      const fees = Math.round(amount * (0.015 + r() * 0.02) * 100) / 100;
      const tax = Math.round(fees * 0.05 * 100) / 100;

      const day = 1 + Math.floor(r() * maxDay);
      const d = new Date(Date.UTC(year, month, day));
      const acc = new Date(d.getTime());
      acc.setUTCDate(acc.getUTCDate() + Math.floor(r() * 2));
      const hh = pad(Math.floor(r() * 24)), mm = pad(Math.floor(r() * 60));

      POOL.push({
        ref: "EXP" + (2600000000000 + Math.floor(r() * 99999999999)),
        title: type + " transaction " + (1000 + i),
        txDate: fmt(d), txIso: iso(d), time: hh + ":" + mm,
        accDate: fmt(acc),
        type, class: cls, method, acquirer, accountType: accType,
        profile: PROFILES[Math.floor(r() * PROFILES.length)],
        account: ACCOUNTS[Math.floor(r() * ACCOUNTS.length)],
        merchantId: 50000 + Math.floor(r() * 49999),
        currency, amount, fees, tax, status
      });
    }
  }
  POOL.sort(function (a, b) { return b.txIso < a.txIso ? -1 : 1; });
})();

// ---- Confirmed list (status A), newest first; show every month ----
function getConfirmed(limit) {
  return POOL.filter(function (t) { return t.status === "A"; })
    .slice(0, limit || 200);
}

// ---- Date helpers for range filtering (DD/Mon/YYYY -> comparable) ----
function parseDMY(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2})[\/\s-]([A-Za-z]{3})[\/\s-](\d{4})/);
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  const mi = MON.findIndex(function (x) { return x.toLowerCase() === m[2].toLowerCase(); });
  if (mi < 0) return null;
  return m[3] + "-" + pad(mi + 1) + "-" + pad(parseInt(m[1], 10));
}

// normalise a value into an array (drops empties); accepts array or scalar
function asArr(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(function (x) { return String(x).trim(); }).filter(Boolean);
  const s = String(v).trim();
  return s ? [s] : [];
}

// ---- Search (quick + advanced) ----
// Rule: AND across different filter categories, OR within one category (array).
function search(f) {
  f = f || {};
  const fromIso = parseDMY(f.fromDate);
  const toIso = parseDMY(f.toDate);

  // pre-compute advanced array filters
  const fAccType = asArr(f.accountType);
  const fAcquirer = asArr(f.acquirer);
  const fStatus = asArr(f.status);
  const fType = asArr(f.type);
  const fClass = asArr(f.class);

  let out = POOL.filter(function (t) {
    if (f.mode === "quick") {
      if (f.criteria === "Account ID" && f.value) {
        if (String(t.account) !== String(f.value).trim()) return false;
      } else if (f.value) { // default Transaction Ref (partial match)
        if (!t.ref.toLowerCase().includes(String(f.value).toLowerCase().trim())) return false;
      }
    } else {
      // advanced — each populated category is AND; arrays are OR within
      if (f.title && !t.title.toLowerCase().includes(String(f.title).toLowerCase().trim())) return false;
      if (f.ref && !t.ref.toLowerCase().includes(String(f.ref).toLowerCase().trim())) return false;
      if (f.accountId && String(t.account) !== String(f.accountId).trim()) return false;
      if (f.merchantId && String(t.merchantId) !== String(f.merchantId).trim()) return false;
      if (fAccType.length && fAccType.indexOf(t.accountType) < 0) return false;
      if (fAcquirer.length && fAcquirer.indexOf(t.acquirer) < 0) return false;
      if (fStatus.length && fStatus.indexOf(t.status) < 0) return false;
      if (fType.length && fType.indexOf(t.type) < 0) return false;
      if (fClass.length && fClass.indexOf(t.class) < 0) return false;
    }
    // date range (inclusive both ends; txIso is the transaction date)
    if (fromIso && t.txIso < fromIso) return false;
    if (toIso && t.txIso > toIso) return false;
    return true;
  });

  // human-readable description of applied criteria
  const parts = [];
  if (f.mode === "quick") {
    if (f.value) parts.push((f.criteria || "Transaction Ref") + ": " + f.value);
  } else {
    if (f.title) parts.push("Title: " + f.title);
    if (f.ref) parts.push("Ref: " + f.ref);
    if (f.accountId) parts.push("Account ID: " + f.accountId);
    if (f.merchantId) parts.push("Merchant ID: " + f.merchantId);
    if (fAccType.length) parts.push("Account Type: " + fAccType.join("/"));
    if (fAcquirer.length) parts.push("Acquirer: " + fAcquirer.join("/"));
    if (fStatus.length) parts.push("Status: " + fStatus.join("/"));
    if (fType.length) parts.push("Type: " + fType.join("/"));
    if (fClass.length) parts.push("Class: " + fClass.join("/"));
  }
  const dateRange = (f.fromDate || "-") + " - " + (f.toDate || "-");
  return {
    rows: out,
    count: out.length,
    description: parts.length ? parts.join(", ") : (f.fromDate || f.toDate ? "Date range only" : "All confirmed transactions"),
    dateRange
  };
}

module.exports = {
  ACQUIRERS, ACCOUNT_TYPES, TYPES, CLASSES, METHODS, STATUSES,
  getConfirmed, search
};
