/**
 * Reports data layer (mock).
 * Builds a deterministic set of "UAE Payouts" reports, each with a payout count.
 * Replace the builders with real DB queries when you add a backend.
 */

const PER_PAGE = 20;
const TOTAL_PAGES = 9;

const MERCHANTS = [
  "Beyond Links Portal", "HKS Global Group DMCC", "Heathrow Trading LLC",
  "Al Noor Retail", "Gulf Mart Online", "Desert Rose Trading",
  "Skyline Electronics", "Oasis Fashion House", "Pearl Logistics",
  "Falcon Pay Services", "Marina Hospitality", "Zenith Auto Parts"
];
const BANKS = [
  "Commercial Bank of Dubai", "Emirates NBD", "Abu Dhabi Commercial Bank",
  "Mashreq Bank", "First Abu Dhabi Bank", "Dubai Islamic Bank"
];

function pad(n) { return n < 10 ? "0" + n : "" + n; }

// Page 1 mirrors the real PayTabs screenshot exactly.
const page1 = [
  { id: 376188, day: 29, count: 49 },
  { id: 376032, day: 28, count: 159 },
  { id: 375874, day: 27, count: 5 },
  { id: 375787, day: 26, count: 2 },
  { id: 375688, day: 25, count: 46 },
  { id: 375595, day: 24, count: 40 },
  { id: 375504, day: 23, count: 32 },
  { id: 375407, day: 22, count: 44 },
  { id: 375189, day: 21, count: 159 },
  { id: 375090, day: 20, count: 8 },
  { id: 375004, day: 19, count: 1 },
  { id: 374814, day: 18, count: 37 },
  { id: 374618, day: 17, count: 43 },
  { id: 374719, day: 16, count: 40 },
  { id: 374628, day: 15, count: 37 },
  { id: 374401, day: 14, count: 162 },
  { id: 371030, day: 13, count: 6 },
  { id: 370945, day: 12, count: 0 },
  { id: 370846, day: 11, count: 44 },
  { id: 370741, day: 10, count: 54 }
];

// Build all reports (180) once, deterministically.
const ALL = [];
const counts = [1, 2, 5, 6, 8, 32, 37, 40, 43, 44, 46, 49, 54, 159, 162];

function makeReport(id, dayOffset, count) {
  // dayOffset counts back from 29/Sep/2026
  const base = new Date(Date.UTC(2026, 8, 29)); // month 8 = September
  base.setUTCDate(base.getUTCDate() - dayOffset);
  const dd = pad(base.getUTCDate());
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][base.getUTCMonth()];
  const dateStr = dd + "/" + mon + "/" + base.getUTCFullYear();
  return {
    id,
    title: "UAE Payouts " + dateStr,
    date: dateStr,
    generatedOn: dateStr + " 11:0" + (id % 6),
    count
  };
}

// Page 1
page1.forEach(function (r, i) {
  ALL.push(makeReport(r.id, 29 - r.day, r.count));
});
// Pages 2..9
for (let p = 2; p <= TOTAL_PAGES; p++) {
  for (let i = 0; i < PER_PAGE; i++) {
    const dayOffset = (p - 1) * PER_PAGE + i; // continues back in time
    const id = 370741 - ((p - 2) * PER_PAGE + i + 1) * 97;
    const cnt = (dayOffset % 11 === 0) ? 0 : counts[(p * 3 + i) % counts.length];
    ALL.push(makeReport(id, dayOffset, cnt));
  }
}

function getReports(page) {
  const start = (page - 1) * PER_PAGE;
  return ALL.slice(start, start + PER_PAGE).map(function (r) {
    return [
      r.id,
      r.title,
      r.generatedOn,
      r.count > 0 ? "Number of payouts: " + r.count : "No payouts"
    ];
  });
}

function getReportById(id) {
  return ALL.find(function (r) { return r.id === id; }) || null;
}

/**
 * Generate the detailed payout rows that go inside the Excel file for a report.
 * Deterministic from the report id + count so downloads are stable.
 */
function getPayoutRows(report) {
  const rows = [];
  let seed = report.id;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  for (let i = 0; i < report.count; i++) {
    const merchant = MERCHANTS[Math.floor(rnd() * MERCHANTS.length)];
    const bank = BANKS[Math.floor(rnd() * BANKS.length)];
    const merchantId = 50000 + Math.floor(rnd() * 49999);
    const accountId = 8000 + Math.floor(rnd() * 1999);
    const gross = Math.round((50 + rnd() * 9950) * 100) / 100;
    const feeRate = 0.021;
    const fees = Math.round(gross * feeRate * 100) / 100;
    const tax = Math.round(fees * 0.05 * 100) / 100;
    const net = Math.round((gross - fees - tax) * 100) / 100;
    const ref = "PTB" + (23000000000 + Math.floor(rnd() * 999999999));
    rows.push({
      ref: ref,
      merchantId: merchantId,
      merchant: merchant,
      accountId: accountId,
      currency: "AED",
      gross: gross,
      fees: fees,
      tax: tax,
      net: net,
      bank: bank,
      valueDate: report.date,
      status: "Paid"
    });
  }
  return rows;
}

module.exports = { getReports, getReportById, getPayoutRows, TOTAL_PAGES };
