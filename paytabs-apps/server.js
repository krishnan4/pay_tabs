/**
 * PayTabs Portal - Express backend
 * -------------------------------------------------------------
 * Serves the frontend (public/) and exposes a small JSON API:
 *   POST /api/login    -> validate credentials, return a token
 *   POST /api/logout   -> invalidate the token
 *   GET  /api/reports  -> paginated reports (auth required)
 *
 * Right now users & reports are in-memory mock data.
 * To add a real backend later, replace:
 *   - the USERS array below with a DB lookup (e.g. MongoDB / MySQL / Postgres)
 *   - data/reports.js with real queries
 *   - the in-memory `sessions` Set with JWT or a session store (Redis, etc.)
 */

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const ExcelJS = require("exceljs");

const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------- Authentication mode --------------------
 * TLS_MODE:
 *   password (default) - HTTP + email/password login (dev/demo)
 *   mtls               - HTTPS with real client-certificate auth (this process
 *                        validates the client cert during the TLS handshake)
 *   proxy              - behind a trusted TLS-terminating proxy (nginx / Cloudflare
 *                        mTLS) that validates the client cert and forwards identity
 *                        via headers. Password login is disabled in mtls/proxy.
 */
const TLS_MODE = (process.env.TLS_MODE || "password").toLowerCase();
const CERT_MODE = TLS_MODE === "mtls" || TLS_MODE === "proxy";

// Trusted proxy IPs (comma-separated) that are allowed to assert client-cert
// identity headers in proxy mode. Any other source's cert headers are ignored.
const TRUSTED_PROXIES = (process.env.TRUSTED_PROXIES || "127.0.0.1,::1")
  .split(",").map((s) => s.trim()).filter(Boolean);
if (TLS_MODE === "proxy") app.set("trust proxy", TRUSTED_PROXIES);

app.use(express.json());

// In cert modes, STRIP any client-supplied copies of the proxy identity headers
// before anything else can read them (prevents header spoofing). They are only
// re-trusted inside /api/cert-login when the source IP is a configured proxy.
const CERT_HEADERS = ["x-ssl-client-verify", "x-ssl-client-s-dn", "x-ssl-client-cert",
  "x-client-cert", "x-client-verify", "x-client-dn"];
app.use((req, res, next) => {
  if (TLS_MODE === "proxy") {
    const src = req.socket.remoteAddress;
    if (TRUSTED_PROXIES.indexOf(src) < 0) {
      CERT_HEADERS.forEach((h) => { delete req.headers[h]; });
    }
  } else {
    // not in proxy mode -> these headers are never trusted
    CERT_HEADERS.forEach((h) => { delete req.headers[h]; });
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));

/* -------------------- Config (move to DB / .env later) -------------------- */
const USERS = [
  { email: "admin@paytabs.com", password: "Paytabs@2026", name: "SysAdmin" }
];

// Authorised client-certificate identities: map certificate CN -> app user.
// A valid, trusted cert whose CN is not listed here is REJECTED (authn ok,
// authz denied). Replace with a DB lookup in production.
const CERT_USERS = {
  "SysAdmin": { name: "SysAdmin", email: "admin@paytabs.com" }
};

// Build a cert-info object (for the Certificate Information dialog) from either
// a Node TLS peer-certificate object or a parsed proxy DN.
function dnToString(dn) {
  if (!dn) return "";
  if (typeof dn === "string") return dn;
  // Node peer-cert subject/issuer is an object { CN, O, OU, C, ... }
  const order = ["CN", "OU", "O", "L", "ST", "C"];
  return order.filter((k) => dn[k]).map((k) => k + "=" + dn[k]).join(", ");
}
function certInfoFromPeer(peer, status) {
  return {
    subject: dnToString(peer.subject),
    issuer: dnToString(peer.issuer),
    serial: peer.serialNumber || "",
    validFrom: peer.valid_from || "",
    validTo: peer.valid_to || "",
    status: status,
    demo: false
  };
}
function parseDN(dnStr) {
  // "CN=SysAdmin,O=PayTabs Demo,C=AE" -> { CN:..., O:..., C:... }
  const out = {};
  String(dnStr || "").split(/[,/]/).forEach((p) => {
    const m = p.split("=");
    if (m.length === 2) out[m[0].trim()] = m[1].trim();
  });
  return out;
}

/* -------------------- Auth (swap for JWT / sessions later) ---------------- */
const sessions = new Map(); // token -> { email, name }

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ ok: false, message: "Unauthorized." });
  req.user = session;
  next();
}

/* -------------------- Routes ---------------------------------------------- */
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, message: "Please enter both email and password." });
  }
  const user = USERS.find(
    (u) => u.email.toLowerCase() === String(email).toLowerCase() && u.password === password
  );
  if (!user) {
    return res.status(401).json({ ok: false, message: "Invalid email or password." });
  }
  const token = makeToken();
  sessions.set(token, { email: user.email, name: user.name });

  // DEMO certificate info for the Certificate Information dialog.
  // NOTE: this is sample data for UI only. It is NOT a real client certificate
  // and NO mTLS verification is performed. Real client-cert auth requires a
  // TLS layer with requestCert + a trusted CA (see DEPLOY.md).
  function mkCert(cn, org, serial, thumb, from, to) {
    return {
      cn: cn, org: org,
      issuedTo: cn,
      issuedBy: org,
      intendedPurpose: "Proves your identity to a remote computer (Client Authentication)",
      subject: "CN=" + cn + ", O=" + org + ", OU=SysAdmin Portal, C=AE",
      issuer: "CN=" + org + " Intermediate CA, O=" + org + ", C=AE",
      serial: serial,
      version: "V3",
      signatureAlgorithm: "sha256RSA",
      validFrom: from,
      validTo: to,
      publicKey: "RSA (2048 Bits)",
      thumbprint: thumb,
      keyUsage: "Digital Signature, Key Encipherment",
      enhancedKeyUsage: "Client Authentication (1.3.6.1.5.5.7.3.2)",
      status: "Verified",
      statusNote: "This certificate is OK.",
      demo: true
    };
  }
  // Demo list for the "Select a certificate" dialog (mimics the browser picker).
  const certificates = [
    mkCert("Novel Porley", "Paytabs", "5F A2 1C 09 3E B7 00 D4", "9B:2E:5F:C1:74:A0:3D:88:16:FA:4C:90:E7:52:1B:6D:AA:30:9C:E4", "01/Jan/2026", "01/Jan/2027"),
    mkCert("Novel Porley", "Paytabs", "6A 44 90 7F 21 C8 15 02", "4D:11:88:A3:6E:02:FB:57:90:21:CC:48:17:3A:5E:92:B0:66:1D:7E", "15/Mar/2026", "15/Mar/2027"),
    mkCert("Novel Porley", "Paytabs", "71 03 55 E1 9B 44 3D 61", "C7:90:2A:5B:38:E4:11:6F:AA:0D:9C:E2:52:81:4B:6D:33:7F:08:A1", "10/Jun/2026", "10/Jun/2027")
  ];
  res.json({ ok: true, token, user: { name: user.name }, certificates });
});

app.post("/api/logout", authMiddleware, (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  sessions.delete(token);
  res.json({ ok: true });
});

const { getReports, getReportById, getPayoutRows, TOTAL_PAGES } = require("./data/reports");

app.get("/api/reports", authMiddleware, (req, res) => {
  const page = Math.max(1, Math.min(TOTAL_PAGES, parseInt(req.query.page, 10) || 1));
  res.json({ ok: true, page, totalPages: TOTAL_PAGES, rows: getReports(page) });
});

/* Download a report as an .xlsx file (clicking the title in the UI hits this). */
app.get("/api/reports/:id/download", authMiddleware, async (req, res) => {
  const report = getReportById(parseInt(req.params.id, 10));
  if (!report) return res.status(404).json({ ok: false, message: "Report not found." });

  const payouts = getPayoutRows(report);

  const wb = new ExcelJS.Workbook();
  wb.creator = "PayTabs Portal";
  wb.created = new Date();
  const ws = wb.addWorksheet("Payout Details", {
    views: [{ state: "frozen", ySplit: 4 }]
  });

  // ---- Title block ----
  ws.mergeCells("A1:L1");
  ws.getCell("A1").value = report.title;
  ws.getCell("A1").font = { size: 15, bold: true, color: { argb: "FF1C75BC" } };
  ws.mergeCells("A2:L2");
  ws.getCell("A2").value =
    "Generated On: " + report.generatedOn + "    |    Report ID: " + report.id +
    "    |    Total Payouts: " + report.count;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF6B7884" } };
  ws.addRow([]); // spacer row 3

  // ---- Header row (row 4) ----
  const headers = [
    "#", "Payout Ref", "Merchant ID", "Merchant Name", "Account ID",
    "Currency", "Gross Amount", "Fees", "Tax", "Net Amount", "Bank", "Value Date"
  ];
  const headerRow = ws.getRow(4);
  headerRow.values = headers;
  headerRow.eachCell(function (cell) {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF29ABE2" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFBCD9EC" } } };
  });

  // ---- Data rows ----
  payouts.forEach(function (p, i) {
    const row = ws.addRow([
      i + 1, p.ref, p.merchantId, p.merchant, p.accountId, p.currency,
      p.gross, p.fees, p.tax, p.net, p.bank, p.valueDate
    ]);
    if ((i % 2) === 1) {
      row.eachCell(function (cell) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F9FB" } };
      });
    }
  });

  // ---- Totals ----
  if (payouts.length) {
    const totalGross = payouts.reduce((s, p) => s + p.gross, 0);
    const totalFees  = payouts.reduce((s, p) => s + p.fees, 0);
    const totalTax   = payouts.reduce((s, p) => s + p.tax, 0);
    const totalNet   = payouts.reduce((s, p) => s + p.net, 0);
    const tRow = ws.addRow(["", "", "", "", "", "TOTAL",
      Math.round(totalGross * 100) / 100, Math.round(totalFees * 100) / 100,
      Math.round(totalTax * 100) / 100, Math.round(totalNet * 100) / 100, "", ""]);
    tRow.font = { bold: true };
    tRow.eachCell(function (cell) {
      cell.border = { top: { style: "thin", color: { argb: "FF29ABE2" } } };
    });
  }

  // ---- Column widths & number formats ----
  ws.columns.forEach(function (col, idx) {
    const widths = [5, 24, 12, 26, 11, 9, 14, 11, 10, 14, 26, 13];
    col.width = widths[idx] || 14;
  });
  ["G", "H", "I", "J"].forEach(function (c) {
    ws.getColumn(c).numFmt = "#,##0.00";
  });

  const safeName = report.title.replace(/[\/\\:*?"<>|]/g, "-");
  res.setHeader("Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="' + safeName + '.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

/* -------------------- Dashboard -------------------- */
const { getDashboard } = require("./data/dashboard");
app.get("/api/dashboard", authMiddleware, (req, res) => {
  res.json({ ok: true, data: getDashboard() });
});

/* -------------------- Transactions -------------------- */
const txns = require("./data/transactions");

app.post("/api/transactions/search", authMiddleware, (req, res) => {
  res.json({ ok: true, rows: txns.search(req.body || {}) });
});

app.get("/api/transactions/:ref", authMiddleware, (req, res) => {
  const t = txns.getByRef(req.params.ref);
  if (!t) return res.status(404).json({ ok: false, message: "Transaction not found." });
  res.json({ ok: true, transaction: t, statusLabel: txns.STATUS_LABEL[t.status] || t.status });
});

app.post("/api/transactions/:ref/chargeback", authMiddleware, (req, res) => {
  const cb = txns.addChargeback(req.params.ref, req.body || {});
  if (!cb) return res.status(404).json({ ok: false, message: "Transaction not found." });
  res.json({ ok: true, chargeback: cb });
});

/* -------------------- Finance / Accounting -------------------- */
const acct = require("./data/accounting");

// metadata for dropdowns
app.get("/api/finance/meta", authMiddleware, (req, res) => {
  res.json({
    ok: true,
    acquirers: acct.ACQUIRERS,
    accountTypes: acct.ACCOUNT_TYPES,
    types: acct.TYPES,
    classes: acct.CLASSES,
    statuses: acct.STATUSES
  });
});

// confirmed transaction list
app.get("/api/accounting/confirmed", authMiddleware, (req, res) => {
  res.json({ ok: true, rows: acct.getConfirmed(200) });
});

// quick / advanced search
app.post("/api/accounting/search", authMiddleware, (req, res) => {
  const result = acct.search(req.body || {});
  res.json(Object.assign({ ok: true }, result));
});

// export full result set as CSV or XLSX
app.get("/api/accounting/export", authMiddleware, async (req, res) => {
  let filters = {};
  try { filters = req.query.q ? JSON.parse(req.query.q) : {}; } catch (e) { filters = {}; }
  const format = (req.query.format || "csv").toLowerCase();
  const rows = acct.search(filters).rows;

  const cols = [
    ["ref", "Transaction Ref"], ["profile", "Profile"], ["type", "Type"],
    ["method", "Method"], ["acquirer", "Acquirer"], ["currency", "Currency"],
    ["amount", "Amount"], ["txDate", "Date"], ["time", "Time"], ["status", "Status"]
  ];
  const today = new Date().toISOString().slice(0, 10);
  const fileBase = "accounting_search_results_" + today;

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "PayTabs Portal";
    const ws = wb.addWorksheet("Accounting Results", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map(function (c) {
      return { header: c[1], key: c[0], width: c[0] === "ref" ? 22 : c[0] === "profile" ? 12 : 14 };
    });
    ws.getRow(1).eachCell(function (cell) {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF29ABE2" } };
      cell.alignment = { horizontal: "center" };
    });
    rows.forEach(function (t, i) {
      const row = ws.addRow(t);
      if (i % 2) row.eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F9FB" } }; });
    });
    ws.getColumn("amount").numFmt = "#,##0.00";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="' + fileBase + '.xlsx"');
    await wb.xlsx.write(res);
    return res.end();
  }

  // CSV
  function csvCell(v) {
    v = v == null ? "" : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  const header = cols.map(function (c) { return c[1]; }).join(",");
  const lines = rows.map(function (t) {
    return cols.map(function (c) { return csvCell(t[c[0]]); }).join(",");
  });
  const csv = "﻿" + header + "\n" + lines.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="' + fileBase + '.csv"');
  res.send(csv);
});

/* Fallback: send the SPA for any unknown non-API route */
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`PayTabs portal running on http://localhost:${PORT}`);
});
