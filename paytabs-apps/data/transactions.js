/**
 * Transactions data layer (mock).
 * A deterministic pool of transactions with search + detail + chargeback.
 * Swap the generator for real DB queries later.
 */

const MERCHANTS = [
  { id: 112812, name: "BEYOND LINKS PORTAL" },
  { id: 76486, name: "HKS GLOBAL GROUP DMCC" },
  { id: 137913, name: "Heathrow Trading LLC" },
  { id: 55880, name: "Beyond Links Portal" },
  { id: 90321, name: "Gulf Mart Online" },
  { id: 84510, name: "Skyline Electronics" },
  { id: 99102, name: "Oasis Fashion House" },
  { id: 71234, name: "Falcon Pay Services" }
];
const TYPES = ["Sale", "Auth", "Capture", "Void", "Refund", "Chargeback"];
const METHODS = ["Visa", "MasterCard", "ApplePay", "Mada", "Amex"];
const ACQUIRERS = ["NI", "Amex", "Mada", "Checkout"];
const STATUSES = ["A", "E", "H", "D"]; // Authorised / Error / Hold / Declined
const CHANNELS = ["Transaction API", "Hosted Payment Page", "Shopify", "MOTO"];

function pad(n) { return n < 10 ? "0" + n : "" + n; }
function fmtDate(d) {
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return pad(d.getUTCDate()) + "/" + mon + "/" + d.getUTCFullYear();
}

// seeded RNG for deterministic data
function makeRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const CUSTOM_REFS = {
  "PTB2310292909164": "74382316186828132429401",
  "PTB2333061129630": "74382316186828132433495",
  "PTB2397695621658": "74382316186828132431876",
  "PTB2322003227073": "74382316211857325782903"
  
};

const POOL = [];
(function build() {
  const rng = makeRng(20260929);
  for (let i = 0; i < 220; i++) {
    const m = MERCHANTS[Math.floor(rng() * MERCHANTS.length)];
    const type = TYPES[Math.floor(rng() * TYPES.length)];
    const method = METHODS[Math.floor(rng() * METHODS.length)];
    const acquirer = ACQUIRERS[Math.floor(rng() * ACQUIRERS.length)];
    const status = (type === "Chargeback" && rng() > 0.6) ? "E" : STATUSES[Math.floor(rng() * 2)];
    const amount = Math.round((20 + rng() * 4980) * 100) / 100;
    const fees = Math.round(amount * 0.021 * 100) / 100;
    const tax = Math.round(fees * 0.05 * 100) / 100;
    const d = new Date(Date.UTC(2026, 8, 29));
    d.setUTCDate(d.getUTCDate() - Math.floor(rng() * 60));
    const ref = "PTB" + (2300000000000 + Math.floor(rng() * 99999999999));
    const authCode = String(100000 + Math.floor(rng() * 899999));
    const accountId = 8000 + Math.floor(rng() * 1999);
    const hh = pad(Math.floor(rng() * 24));
    const mm = pad(Math.floor(rng() * 60));

    POOL.push({
      ref,
      merchantId: m.id,
      merchant: m.name,
      profileId: m.id,
      accountId,
      type,
      method,
      acquirer,
      channel: CHANNELS[Math.floor(rng() * CHANNELS.length)],
      status,
      currency: "AED",
      amount, fees, tax,
      authCode,
      cartId: (62000000000000 + Math.floor(rng() * 9999999999)).toString(),
      description: type + " of " + (62000000000000 + Math.floor(rng() * 9999999999)),
      txDate: fmtDate(d),
      txTime: hh + ":" + mm,
      accDate: fmtDate(d),
      cardMask: "5294 15## #### " + (1000 + Math.floor(rng() * 8999)),
      expiry: "0" + (1 + Math.floor(rng() * 9)) + "/202" + (6 + Math.floor(rng() * 3)),
      issuerCountry: ["Saudi Arabia", "United Arab Emirates", "Kuwait", "Qatar"][Math.floor(rng() * 4)],
      issuerName: ["National Commercial Bank", "Emirates NBD", "Mashreq Bank", "Dubai Islamic Bank"][Math.floor(rng() * 4)],
      email: "customer" + (100 + Math.floor(rng() * 899)) + "@example.com",
      phone: "+9715" + (10000000 + Math.floor(rng() * 89999999)),
      chargeback: null,   // filled when a chargeback is added
      notes: []
    });
  }

  // Map of original mock ref -> custom ref
  for (const [origRef, newRef] of Object.entries(CUSTOM_REFS)) {
    const item = POOL.find(t => t.ref === origRef);
    if (item) {
      item.ref = newRef;
    }
  }

  // Prioritize target1 at top if desired
  const targetIdx = POOL.findIndex(t => t.ref === "74382316186828132429401");
  if (targetIdx !== -1) {
    const [target] = POOL.splice(targetIdx, 1);
    POOL.unshift(target);
  }
})();

const STATUS_LABEL = { A: "Authorised", E: "Error", H: "Hold", D: "Declined" };

function listRow(t) {
  return {
    ref: t.ref, txDate: t.txDate, type: t.type, method: t.method,
    acquirer: t.acquirer, profile: t.profileId, account: t.accountId,
    currency: t.currency, amount: t.amount, fees: t.fees, tax: t.tax,
    accDate: t.accDate, status: t.status, merchant: t.merchant
  };
}

function search(f) {
  f = f || {};
  let out = POOL.filter(function (t) {
    if (f.title && !t.merchant.toLowerCase().includes(String(f.title).toLowerCase())) return false;
    if (f.ref) {
      const q = String(f.ref).toLowerCase();
      let match = t.ref.toLowerCase().includes(q) || ("ptb" + t.ref).toLowerCase().includes(q);
      if (!match) {
        for (const [origRef, newRef] of Object.entries(CUSTOM_REFS)) {
          if (t.ref === newRef && origRef.toLowerCase().includes(q)) {
            match = true;
            break;
          }
        }
      }
      if (!match) return false;
    }
    if (f.merchantId && String(t.merchantId) !== String(f.merchantId)) return false;
    if (f.accountId && String(t.accountId) !== String(f.accountId)) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.method && t.method !== f.method) return false;
    if (f.acquirer && t.acquirer !== f.acquirer) return false;
    if (f.status && t.status !== f.status) return false;
    return true;
  });
  return out.slice(0, 50).map(listRow);
}

function getByRef(ref) {
  return POOL.find(function (t) {
    if (t.ref === ref) return true;
    if (("ptb" + t.ref).toLowerCase() === String(ref).toLowerCase()) return true;
    for (const [origRef, newRef] of Object.entries(CUSTOM_REFS)) {
      if (t.ref === newRef && (origRef.toLowerCase() === String(ref).toLowerCase() || ("ptb" + newRef).toLowerCase() === String(ref).toLowerCase())) {
        return true;
      }
    }
    return false;
  }) || null;
}

function addChargeback(ref, data) {
  const t = getByRef(ref);
  if (!t) return null;
  t.chargeback = {
    type: data.type || "Full Chargeback",
    reason: data.reason || "",
    blockCard: !!data.blockCard,
    blockEmail: !!data.blockEmail,
    blockRefund: !!data.blockRefund,
    at: new Date().toISOString()
  };
  const stamp = fmtDate(new Date()) + " " + new Date().toISOString().slice(11, 16);
  t.notes.unshift({ date: stamp, by: "System", text: "Added Chargeback: " + t.chargeback.type + (data.reason ? " - " + data.reason : "") });
  if (data.blockRefund) t.notes.unshift({ date: stamp, by: "SysAdmin", text: "Refund Blocked: Chargeback" });
  return t.chargeback;
}

module.exports = {
  search, getByRef, addChargeback,
  STATUS_LABEL, TYPES, METHODS, ACQUIRERS,
  MERCHANTS
};
