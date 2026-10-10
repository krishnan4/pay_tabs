/* PayTabs Portal - frontend SPA.
   Router + all PDF screens. Talks to the Express API. */

(function () {
  var token = null;
  var content = document.getElementById("content");
  var breadcrumb = document.getElementById("breadcrumb");

  /* -------------------- helpers -------------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function money(n) { return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: "Bearer " + token }, opts.headers || {});
    if (opts.body && !opts.method) opts.method = "POST"; // never GET with a body
    if (opts.body && typeof opts.body !== "string") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { sessionExpired(); }   // stale/expired session -> back to login
      return r.json();
    });
  }
  // --- session persistence so URL deep-links survive a reload (for automation) ---
  function saveSession(tok, name) {
    try { localStorage.setItem("pt_token", tok); localStorage.setItem("pt_user", name || "SysAdmin"); } catch (e) {}
  }
  function clearSession() { try { localStorage.removeItem("pt_token"); localStorage.removeItem("pt_user"); } catch (e) {} }
  function sessionExpired() {
    token = null; clearSession();
    closeUserMenu();
    document.getElementById("app").hidden = true;
    document.getElementById("login").hidden = false;
    if (loginErr) loginErr.textContent = "Session expired — please sign in again.";
  }

  // ---- user menu / logout ----
  function closeUserMenu() {
    var d = document.getElementById("userDropdown");
    if (d) d.hidden = true;
  }
  function logout() {
    token = null; clearSession(); closeUserMenu();
    document.getElementById("password").value = "";
    if (loginErr) loginErr.textContent = "";
    document.getElementById("app").hidden = true;
    document.getElementById("login").hidden = false;
    if (window.history && window.history.pushState) window.history.pushState({}, "", "/");
    window.scrollTo(0, 0);
  }
  (function wireUserMenu() {
    var btn = document.getElementById("avatarBtn");
    var dd = document.getElementById("userDropdown");
    if (btn) btn.addEventListener("click", function (e) {
      e.stopPropagation();
      dd.hidden = !dd.hidden;
    });
    var lo = document.getElementById("logoutBtn");
    if (lo) lo.addEventListener("click", logout);
    document.addEventListener("click", function (e) {
      var m = document.getElementById("userMenu");
      if (m && !m.contains(e.target)) closeUserMenu();
    });
  })();
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function crumbs(parts) {
    // parts: array of strings; last is current
    breadcrumb.innerHTML = parts.map(function (p, i) {
      return i === parts.length - 1
        ? '<span class="here">' + esc(p) + "</span>"
        : '<span class="crumb">' + esc(p) + "</span>";
    }).join(" / ");
  }

  /* -------------------- LOGIN -------------------- */
  var loginForm = document.getElementById("loginForm");
  var loginErr = document.getElementById("loginErr");
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    loginErr.textContent = "";
    api("/api/login", {
      method: "POST",
      body: {
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value.trim()
      }
    }).then(function (d) {
      if (!d.ok) { loginErr.textContent = d.message || "Login failed."; return; }
      // Hold the session until a certificate is selected & confirmed.
      pendingAuth = { token: d.token, user: d.user || { name: "SysAdmin" } };
      certList = d.certificates || (d.certificate ? [d.certificate] : []);
      selectedIdx = 0;
      showCertSelect();
    }).catch(function () { loginErr.textContent = "Cannot reach server. Is it running?"; });
  });

  // ---- "Select a certificate" dialog (DEMO; mimics the browser picker) ----
  var pendingAuth = null;
  var certList = [];
  var selectedIdx = 0;

  function showCertSelect() {
    var host = (location.host || "admin.paytabs.com") ;
    var rows = certList.map(function (c, i) {
      return '<tr class="certsel-row' + (i === selectedIdx ? " sel" : "") + '" data-i="' + i + '">' +
        "<td>" + esc(c.cn || c.issuedTo || "—") + "</td>" +
        "<td>" + esc(c.org || c.issuedBy || "—") + "</td>" +
        '<td class="serial">' + esc((c.serial || "").replace(/\s+/g, "").slice(-8)) + "</td></tr>";
    }).join("");

    document.getElementById("certSelectCard").innerHTML =
      '<div class="certsel-head"><span>Select a certificate</span>' +
        '<button class="modal-x" data-cs-cancel>&times;</button></div>' +
      '<div class="certsel-sub">Select a certificate to authenticate yourself to ' + esc(host) + "</div>" +
      '<div class="certsel-table-wrap"><table class="certsel-table">' +
        "<thead><tr><th>Subject</th><th>Issuer</th><th>Serial</th></tr></thead>" +
        "<tbody>" + rows + "</tbody></table></div>" +
      '<div class="certsel-foot">' +
        '<button class="btn-outline" data-cs-info>Certificate information</button>' +
        '<span style="flex:1"></span>' +
        '<button class="btn-primary" data-cs-ok>OK</button>' +
        '<button class="btn-grey" data-cs-cancel>Cancel</button>' +
      "</div>";

    var card = document.getElementById("certSelectCard");
    card.querySelectorAll(".certsel-row").forEach(function (tr) {
      tr.addEventListener("click", function () {
        selectedIdx = +tr.getAttribute("data-i");
        card.querySelectorAll(".certsel-row").forEach(function (x) { x.classList.remove("sel"); });
        tr.classList.add("sel");
      });
      tr.addEventListener("dblclick", finishLogin);
    });
    card.querySelector("[data-cs-ok]").addEventListener("click", finishLogin);
    card.querySelectorAll("[data-cs-cancel]").forEach(function (b) { b.addEventListener("click", cancelCert); });
    card.querySelector("[data-cs-info]").addEventListener("click", function () {
      showCertDialog(certList[selectedIdx] || {});
    });

    document.getElementById("certSelectModal").hidden = false;
  }
  document.getElementById("certSelectModal").addEventListener("click", function (e) {
    if (e.target.id === "certSelectModal") cancelCert();
  });

  // ---- Certificate Information viewer (professional; opened from the picker) ----
  function showCertDialog(cert) {
    cert = cert || {};
    var detailRows = [
      ["Version", cert.version],
      ["Serial number", cert.serial],
      ["Signature algorithm", cert.signatureAlgorithm],
      ["Issuer", cert.issuer],
      ["Valid from", cert.validFrom],
      ["Valid to", cert.validTo],
      ["Subject", cert.subject],
      ["Public key", cert.publicKey],
      ["Key usage", cert.keyUsage],
      ["Enhanced key usage", cert.enhancedKeyUsage],
      ["Thumbprint", cert.thumbprint]
    ];
    var detailsHtml = detailRows.map(function (r) {
      return '<tr><td class="dk">' + esc(r[0]) + '</td><td class="dv">' + esc(r[1] || "—") + "</td></tr>";
    }).join("");

    document.getElementById("certCard").innerHTML =
      '<div class="cert-head">' +
        '<svg class="cert-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="M12 5.5 13.1 7.7l2.4.3-1.75 1.7.4 2.4L12 11l-2.15 1.1.4-2.4L8.5 8l2.4-.3z"/><path d="M8.5 14.5 7 22l5-2.3L17 22l-1.5-7.5"/></svg>' +
        "<span>Certificate</span>" +
        '<button class="modal-x" data-cert-close>&times;</button>' +
      "</div>" +
      '<div class="cert-body">' +
        '<div class="cert-purpose">' +
          '<div class="cert-seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="M8.5 14.5 7 22l5-2.3L17 22l-1.5-7.5"/></svg></div>' +
          '<div><div class="cert-ptitle">This certificate is intended for the following purpose(s):</div>' +
            '<ul class="cert-plist"><li>' + esc(cert.intendedPurpose || "Client Authentication") + "</li></ul></div>" +
        "</div>" +
        '<div class="cert-rule"></div>' +
        '<table class="cert-idblock">' +
          '<tr><td class="il">Issued to</td><td class="iv">' + esc(cert.issuedTo || "—") + "</td></tr>" +
          '<tr><td class="il">Issued by</td><td class="iv">' + esc(cert.issuedBy || "—") + "</td></tr>" +
          '<tr><td class="il">Valid</td><td class="iv">' + esc(cert.validFrom) + " &nbsp;to&nbsp; " + esc(cert.validTo) + "</td></tr>" +
        "</table>" +
        '<div class="cert-status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> ' +
          esc(cert.statusNote || "This certificate is OK.") + ' <span class="cert-vtag">' + esc(cert.status || "Verified") + "</span></div>" +
        '<details class="cert-details"><summary>Details</summary>' +
          '<table class="cert-dtable">' + detailsHtml + "</table></details>" +
        '<div class="cert-demo-note">Demo certificate — this screen does not perform real client-certificate (mTLS) verification.</div>' +
      "</div>" +
      '<div class="cert-foot">' +
        '<button class="btn-primary" data-cert-close>OK</button>' +
      "</div>";

    document.getElementById("certCard").querySelectorAll("[data-cert-close]").forEach(function (b) {
      b.addEventListener("click", closeCertDetails);
    });
    document.getElementById("certModal").hidden = false;
  }
  function closeCertDetails() {
    // Just close the viewer and return to the "Select a certificate" dialog.
    document.getElementById("certModal").hidden = true;
  }
  document.getElementById("certModal").addEventListener("click", function (e) {
    if (e.target.id === "certModal") closeCertDetails();
  });

  function finishLogin() {
    if (!pendingAuth) return;
    token = pendingAuth.token;
    var nm = pendingAuth.user.name || "SysAdmin";
    document.getElementById("userName").textContent = nm;
    document.getElementById("udName").textContent = nm;
    pendingAuth = null;
    document.getElementById("certModal").hidden = true;
    document.getElementById("certSelectModal").hidden = true;
    document.getElementById("login").hidden = true;
    document.getElementById("app").hidden = false;
    saveSession(token, document.getElementById("userName").textContent);
    window.scrollTo(0, 0);
    applyPath();   // go to the screen in the URL (deep-link), else home
  }
  function cancelCert() {
    pendingAuth = null;                 // discard the held session
    token = null;
    document.getElementById("certModal").hidden = true;
    document.getElementById("certSelectModal").hidden = true;
    loginErr.textContent = "Sign-in cancelled at certificate step.";
    document.getElementById("password").value = "";
  }

  /* -------------------- SIDEBAR -------------------- */
  var menu = [
    ["Home", "home", "M3 11l9-8 9 8M5 10v10h14V10"],
    ["Merchants", "", "M3 9l1-5h16l1 5M5 9v11h14V9M3 9h18"],
    ["Profiles", "", "M4 20c0-4 4-6 8-6s8 2 8 6M12 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
    ["Terminals", "", "M4 4h16v12H4zM2 20h20M9 20v-4h6v4"],
    ["Transactions", "transactions", "M4 7h13l-3-3M20 17H7l3 3"],
    ["Deposit", "", "M3 10h18v9H3zM3 10l2-5h14l2 5M12 13v3"],
    ["Refund", "", "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 6 6"],
    ["Underwriting", "", "M6 2h9l5 5v15H6zM14 2v6h6"],
    ["Ongoing Screening", "", "M3 5h18v11H3zM8 20h8M12 16v4"],
    ["Finance", "accounting", "M12 2v20M7 6h8a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8"],
    ["Reports", "reports", "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4"],
    ["Resellers", "", "M4 20c0-3 3-5 6-5s6 2 6 5M16 13c2 0 4 1 4 4M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M17 9a2.5 2.5 0 1 0 0-5"],
    ["Support", "", "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z"]
  ];
  var nav = document.getElementById("nav");
  menu.forEach(function (m) {
    var a = document.createElement("a");
    a.href = "#";
    a.dataset.route = m[1];
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + m[2] + '"/></svg><span>' + m[0] + "</span>";
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (m[1]) route(m[1]);
      else toast(m[0] + " screen is not built in this demo yet.");
    });
    nav.appendChild(a);
  });
  function setActive(r) {
    nav.querySelectorAll("a").forEach(function (a) {
      a.classList.toggle("active", a.dataset.route === r && r !== "");
    });
  }

  /* ==================================================================
     ROUTER  (URL-based, so each screen has its own link for automation)
  ================================================================== */
  var PATHS = {
    home: "/home",
    transactions: "/transactions",
    accounting: "/finance",
    reports: "/reports"
  };

  // Render a top-level screen and (optionally) push its URL.
  function route(name, push) {
    setActive(name);
    if (push !== false && window.history && window.history.pushState) {
      var p = PATHS[name] || "/home";
      if (location.pathname !== p) window.history.pushState({ view: name }, "", p);
    }
    if (name === "home") return renderHome();
    if (name === "transactions") return renderTxnSearch();
    if (name === "accounting") return renderFinance();
    if (name === "reports") return renderReports();
  }

  // Small helper to set the URL without re-rendering (used by sub-screens).
  function setPath(p) {
    if (window.history && window.history.pushState && location.pathname !== p) {
      window.history.pushState({}, "", p);
    }
  }

  // Resolve the current URL to a screen (used on load, on deep-link, back/forward).
  function applyPath() {
    var p = (location.pathname || "/home").replace(/\/+$/, "") || "/home";
    if (p === "/finance/accounting/search") { setActive("accounting"); return renderAccountingSearch(false); }
    if (p === "/finance/accounting")        { setActive("accounting"); return renderConfirmedList(false); }
    if (p === "/finance")                   return route("accounting", false);
    if (p === "/transactions")              return route("transactions", false);
    if (p === "/reports")                   return route("reports", false);
    return route("home", false);
  }

  // Back / forward buttons (only meaningful once logged in).
  window.addEventListener("popstate", function () {
    if (!document.getElementById("app").hidden) applyPath();
  });

  /* ==================================================================
     HOME / DASHBOARD
  ================================================================== */
  function renderHome() {
    crumbs(["Home"]);
    content.innerHTML = '<div class="empty-msg">Loading dashboard…</div>';
    api("/api/dashboard").then(function (res) {
      var d = res.data;
      var t = d.tiles;
      var tiles = [
        [t.salesTotalToday, "Sales Total, Today"],
        [t.salesCountToday, "Sales Count, Today"],
        [t.salesTotalMTD, "Sales Total, Month-to-date"],
        [t.salesCountMTD, "Sales Count, Month-to-date"],
        [t.salesTotalYTD, "Sales Total, Year-to-date"],
        [t.salesCountYTD, "Sales Count, Year-to-date"]
      ].map(function (x) {
        return '<div class="tile"><div class="num">' + esc(x[0]) + '</div><div class="cap">' + esc(x[1]) + "</div></div>";
      }).join("");

      content.innerHTML =
        '<div class="page-alert">⚠ Your password will expire in ' + d.passwordExpiryDays + " days.</div>" +
        '<div class="tiles">' + tiles + "</div>" +
        '<div class="grid-2" style="margin-bottom:14px">' +
          '<div class="card-panel"><h3>Previous 7 Days Sale Transactions</h3>' + barChart(d.prev7) + "</div>" +
          '<div class="card-panel"><h3>Last 8 Hours Sale Transactions</h3>' + barChart(d.last8) + "</div>" +
        "</div>" +
        '<div class="grid-2">' +
          '<div class="card-panel"><h3>Top 8 Merchants, Month-to-date</h3>' + hBars(d.topMerchants, "AED ") + "</div>" +
          '<div class="card-panel"><h3>Payment Methods, Month-to-date</h3>' + hBars(d.paymentMethods, "", "%") + "</div>" +
        "</div>";
    });
  }
  function barChart(data) {
    var max = Math.max.apply(null, data.map(function (x) { return x.value; }));
    return '<div class="barchart">' + data.map(function (x) {
      var h = Math.round((x.value / max) * 100);
      return '<div class="bar-col"><span class="bar-val">' + x.value + '</span>' +
why_bar(h) + '<span class="bar-lbl">' + esc(x.label) + "</span></div>";
    }).join("") + "</div>";
  }
  function why_bar(h) { return '<div class="bar" style="height:' + h + '%"></div>'; }
  function hBars(data, prefix, suffix) {
    prefix = prefix || ""; suffix = suffix || "";
    var max = Math.max.apply(null, data.map(function (x) { return x.value; }));
    return '<div class="hbars">' + data.map(function (x) {
      var w = Math.round((x.value / max) * 100);
      return '<div class="hbar-row"><span class="hb-name">' + esc(x.name) + "</span>" +
        '<span class="hbar-track"><span class="hbar-fill" style="width:' + w + '%"></span></span>' +
        '<span class="hb-val">' + prefix + x.value.toLocaleString("en-US") + suffix + "</span></div>";
    }).join("") + "</div>";
  }

  /* ==================================================================
     TRANSACTION SEARCH
  ================================================================== */
  function renderTxnSearch() {
    crumbs(["Home", "Transactions", "Search"]);
    content.innerHTML =
      '<div class="search-panel"><h2>Transaction Search</h2>' +
      row("Title", inp("tTitle", "Title")) +
      row("Transaction Ref", inp("tRef", "Transaction Ref")) +
      row("Merchant ID", inp("tMerchant", "Merchant ID")) +
      row("Acquirer", sel("tAcquirer", ["", "NI", "Amex", "Mada", "Checkout"], "-- Select Acquirer --")) +
      row("Method", sel("tMethod", ["", "Visa", "MasterCard", "ApplePay", "Mada", "Amex"], "-- Select Method --")) +
      row("Status", sel("tStatus", ["", "A", "E", "H", "D"], "-- Any --", statusName)) +
      row("Type", sel("tType", ["", "Sale", "Auth", "Capture", "Void", "Refund", "Chargeback"], "-- Any --")) +
      '<div class="form-actions"><button class="btn-search" id="tSearch">Search</button></div>' +
      "</div>" +
      '<div class="results-wrap" id="tResults"></div>';

    document.getElementById("tSearch").addEventListener("click", function () {
      var body = {
        title: val("tTitle"), ref: val("tRef"), merchantId: val("tMerchant"),
        acquirer: val("tAcquirer"), method: val("tMethod"),
        status: val("tStatus"), type: val("tType")
      };
      var box = document.getElementById("tResults");
      box.innerHTML = '<div class="empty-msg">Searching…</div>';
      api("/api/transactions/search", { method: "POST", body: body }).then(function (res) {
        renderTxnResults(res.rows, box);
      });
    });
  }

  function renderTxnResults(rows, box) {
    if (!rows.length) { box.innerHTML = '<div class="card-panel"><div class="empty-msg">No transactions found.</div></div>'; return; }
    var head = "<tr><th>Ref</th><th>Tx Date</th><th>Type</th><th>Method</th><th>Acquirer</th><th>Profile</th><th>Account</th><th>Amount</th><th>Fees</th><th>Tax</th><th>Acc Date</th><th>Status</th></tr>";
    var body = rows.map(function (r) {
      return '<tr data-ref="' + esc(r.ref) + '">' +
        '<td><a class="link">' + esc(r.ref) + "</a></td>" +
        "<td>" + esc(r.txDate) + "</td><td>" + esc(r.type) + "</td><td>" + esc(r.method) + "</td>" +
        "<td>" + esc(r.acquirer) + "</td><td>" + esc(r.profile) + "</td><td>" + esc(r.account) + "</td>" +
        "<td>" + esc(r.currency) + " " + money(r.amount) + "</td><td>" + money(r.fees) + "</td><td>" + money(r.tax) + "</td>" +
        "<td>" + esc(r.accDate) + "</td>" +
        '<td><span class="status-pill st-' + esc(r.status) + '">' + esc(r.status) + "</span></td></tr>";
    }).join("");
    box.innerHTML =
      '<div class="card-panel"><h3>Transactions &nbsp;(' + rows.length + ' results)</h3>' +
      '<div class="table-scroll"><table class="grid"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div></div>";
    box.querySelectorAll("tbody tr").forEach(function (tr) {
      tr.addEventListener("click", function () { openTxn(tr.dataset.ref); });
    });
  }

  /* ==================================================================
     FINANCE MODULE  (landing -> confirmed list -> search -> results)
  ================================================================== */
  var finMeta = null;          // acquirers, types, etc.
  var lastSearch = null;       // last applied filters (for export)

  function ensureMeta() {
    if (finMeta) return Promise.resolve(finMeta);
    return api("/api/finance/meta").then(function (d) { finMeta = d; return d; });
  }

  // ---- Finance landing ----
  function renderFinance() {
    setActive("accounting");
    crumbs(["Home", "Finance"]);
    content.innerHTML =
      '<div class="fin-intro"><h2>FINANCE</h2><p>Additional options relating to Finance will be added to this section</p></div>' +
      '<div class="fin-cards">' +
        '<div class="fin-card"><h4>Accounts</h4>' +
          '<a href="#" class="disabled">Account Balances</a>' +
          '<a href="#" id="goAccountingSearch">Accounting Search</a>' +
        "</div>" +
        '<div class="fin-card"><h4>Rates</h4>' +
          '<a href="#" class="disabled">Terminal Rates</a>' +
        "</div>" +
        '<div class="fin-card"><h4>System Tools</h4>' +
          '<a href="#" class="disabled">FX Rates</a>' +
          '<a href="#" class="disabled">Card Lookup</a>' +
        "</div>" +
      "</div>";
    document.getElementById("goAccountingSearch").addEventListener("click", function (e) {
      e.preventDefault(); renderConfirmedList();
    });
    content.querySelectorAll("a.disabled").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); toast(a.textContent + " is not built in this demo yet."); });
    });
  }

  // ---- Accounting Confirmed Transaction List ----
  function renderConfirmedList(push) {
    setActive("accounting");
    if (push !== false) setPath("/finance/accounting");
    crumbs(["Home", "Finance", "Confirmed Transactions"]);
    content.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<div class="panel-title">ACCOUNTING CONFIRMED TRANSACTION LIST</div>' +
          '<button class="icon-btn" id="goAcctSearch" title="Search">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>' +
          "</button>" +
        "</div>" +
        '<div class="table-scroll" id="confBody"><div class="empty-msg">Loading…</div></div>' +
      "</div>";
    document.getElementById("goAcctSearch").addEventListener("click", function () { renderAccountingSearch(); });

    api("/api/accounting/confirmed").then(function (d) {
      var head = "<tr><th>Ref</th><th>Tx Date</th><th>Type</th><th>Method</th><th>Acquirer</th>" +
        "<th>Profile</th><th>Account</th><th>Currency</th><th>Amount</th><th>Fees</th><th>Tax</th><th>Acc Date</th><th>Status</th></tr>";
      var body = d.rows.map(function (t) {
        return "<tr>" +
          '<td><a class="link">' + esc(t.ref) + "</a></td>" +
          "<td>" + esc(t.txDate) + "</td><td>" + esc(t.type) + "</td><td>" + esc(t.method) + "</td>" +
          "<td>" + esc(t.acquirer) + "</td>" +
          '<td><a class="link">' + esc(t.profile) + "</a></td>" +
          '<td><a class="link">' + esc(t.account) + "</a></td>" +
          "<td>" + esc(t.currency) + "</td><td>" + money(t.amount) + "</td><td>" + money(t.fees) + "</td><td>" + money(t.tax) + "</td>" +
          "<td>" + esc(t.accDate) + "</td>" +
          '<td><span class="status-pill st-' + esc(t.status) + '">' + (t.status === "A" ? "✓" : esc(t.status)) + "</span></td></tr>";
      }).join("");
      document.getElementById("confBody").innerHTML =
        '<table class="grid"><thead>' + head + "</thead><tbody>" + body + "</tbody></table>";
    });
  }

  // ---- Accounting Search (Quick / Advanced tabs) ----
  var advMs = null;   // advanced multi-select getters, built once per page visit

  function renderAccountingSearch(push) {
    setActive("accounting");
    if (push !== false) setPath("/finance/accounting/search");
    crumbs(["Home", "Finance", "Confirmed Transactions", "Accounting Search"]);
    ensureMeta().then(function (m) {
      // Build the page shell with BOTH forms mounted (hidden-toggle keeps each
      // tab's state independent and preserved across switches).
      content.innerHTML =
        '<div class="search-panel"><h2>ACCOUNTING SEARCH</h2>' +
          '<div class="tabs-bar">' +
            '<button data-tab="quick">Quick</button>' +
            '<button data-tab="advanced">Advanced</button>' +
          "</div>" +
          '<div id="quickForm"></div>' +
          '<div id="advForm" hidden></div>' +
        "</div>" +
        '<div class="results-wrap" id="aResults"></div>';

      buildQuick(document.getElementById("quickForm"));
      advMs = buildAdvanced(document.getElementById("advForm"), m);

      function showTab(which) {
        content.querySelectorAll(".tabs-bar button").forEach(function (b) {
          b.classList.toggle("active", b.dataset.tab === which);
        });
        document.getElementById("quickForm").hidden = which !== "quick";
        document.getElementById("advForm").hidden = which !== "advanced";
      }
      content.querySelectorAll(".tabs-bar button").forEach(function (b) {
        b.addEventListener("click", function () { showTab(b.dataset.tab); });
      });
      showTab("quick");
    });
  }

  // ---- Quick form (own state) ----
  function buildQuick(host) {
    host.innerHTML =
      '<div class="quick-row">' +
        '<select id="qCriteria"><option>Transaction Ref</option><option>Account ID</option></select>' +
        '<input type="text" id="qValue" placeholder="Search...">' +
        '<input type="text" id="qFrom" class="date-in" placeholder="From (DD/Mon/YYYY)">' +
        '<span class="sep">···</span>' +
        '<input type="text" id="qTo" class="date-in" placeholder="To (DD/Mon/YYYY)">' +
        '<button class="btn-search" id="qSearch">Search</button>' +
      "</div>" +
      '<div class="field-err" id="qErr"></div>';
    document.getElementById("qSearch").addEventListener("click", function () {
      var value = val("qValue"), from = val("qFrom"), to = val("qTo");
      var err = document.getElementById("qErr"); err.textContent = "";
      if (!value && !from && !to) { err.textContent = "Enter a search value or a date range."; return; }
      var dv = validateDates(from, to); if (dv) { err.textContent = dv; return; }
      doSearch({ mode: "quick", criteria: val("qCriteria"), value: value, fromDate: from, toDate: to });
    });
  }

  // ---- Advanced form (own state, multi-selects) ----
  function buildAdvanced(host, m) {
    host.innerHTML = "";
    function textRow(label, id, ph) {
      var r = document.createElement("div"); r.className = "form-row";
      r.innerHTML = '<label>' + esc(label) + '</label><input id="' + id + '" placeholder="' + esc(ph) + '">';
      host.appendChild(r);
    }
    function msRow(label, opts, ph, labeller) {
      var r = document.createElement("div"); r.className = "form-row";
      var lab = document.createElement("label"); lab.textContent = label; r.appendChild(lab);
      var ms = multiSelect(opts, ph, labeller);
      r.appendChild(ms.el); host.appendChild(r);
      return ms;
    }
    textRow("Title", "aTitle", "Title");
    textRow("Transaction Ref", "aRef", "Transaction Ref");
    textRow("Account ID", "aAccount", "Account ID");
    textRow("Merchant ID", "aMerchant", "Merchant ID");
    var msAccType = msRow("Account Type", m.accountTypes, "Select Account Type");
    var msAcquirer = msRow("Acquirer", m.acquirers, "Select Acquirer");
    var msStatus = msRow("Status", m.statuses, "Select Status", statusName);
    var msType = msRow("Type", m.types, "Select Type");
    var msClass = msRow("Class", m.classes, "Select Class");

    var dr = document.createElement("div"); dr.className = "form-row";
    dr.innerHTML = '<label>Date <span style="color:var(--ink-soft);font-weight:400">(optional)</span></label><div class="two">' +
      '<input id="aFrom" placeholder="From (DD/Mon/YYYY)">' +
      '<input id="aTo" placeholder="To (DD/Mon/YYYY)"></div>';
    host.appendChild(dr);

    var err = document.createElement("div"); err.className = "field-err"; err.id = "aErr"; host.appendChild(err);
    var act = document.createElement("div"); act.className = "form-actions";
    act.innerHTML = '<button class="btn-search" id="aSearch">Search</button>'; host.appendChild(act);

    var getters = {
      title: function () { return val("aTitle"); },
      ref: function () { return val("aRef"); },
      accountId: function () { return val("aAccount"); },
      merchantId: function () { return val("aMerchant"); },
      accountType: msAccType.values, acquirer: msAcquirer.values,
      status: msStatus.values, type: msType.values, class: msClass.values,
      from: function () { return val("aFrom"); }, to: function () { return val("aTo"); }
    };

    document.getElementById("aSearch").addEventListener("click", function () {
      var f = {
        mode: "advanced",
        title: getters.title(), ref: getters.ref(),
        accountId: getters.accountId(), merchantId: getters.merchantId(),
        accountType: getters.accountType(), acquirer: getters.acquirer(),
        status: getters.status(), type: getters.type(), class: getters.class(),
        fromDate: getters.from(), toDate: getters.to()
      };
      err.textContent = "";
      var anyFilter = f.title || f.ref || f.accountId || f.merchantId ||
        f.accountType.length || f.acquirer.length || f.status.length ||
        f.type.length || f.class.length || f.fromDate || f.toDate;
      if (!anyFilter) { err.textContent = "Please select at least one search criterion."; return; }
      var dv = validateDates(f.fromDate, f.toDate); if (dv) { err.textContent = dv; return; }
      doSearch(f);
    });
    return getters;
  }

  // ---- reusable multi-select ----
  function multiSelect(options, placeholder, labeller) {
    var selected = [];
    var wrap = document.createElement("div"); wrap.className = "ms";
    var box = document.createElement("div"); box.className = "ms-box";
    var menu = document.createElement("div"); menu.className = "ms-menu"; menu.hidden = true;
    function lbl(o) { return labeller ? labeller(o) : o; }

    function renderBox() {
      box.innerHTML = "";
      if (!selected.length) {
        var ph = document.createElement("span"); ph.className = "ms-ph"; ph.textContent = placeholder; box.appendChild(ph);
      } else {
        selected.forEach(function (v) {
          var c = document.createElement("span"); c.className = "ms-chip";
          c.innerHTML = esc(lbl(v)) + ' <b data-x="' + esc(v) + '">×</b>';
          box.appendChild(c);
        });
      }
      var car = document.createElement("span"); car.className = "ms-caret"; car.textContent = "▾"; box.appendChild(car);
    }
    function renderMenu() {
      menu.innerHTML = options.map(function (o) {
        var on = selected.indexOf(o) >= 0;
        return '<div class="ms-opt' + (on ? " on" : "") + '" data-v="' + esc(o) + '">' +
          '<span class="tick">' + (on ? "✓" : "") + "</span>" + esc(lbl(o)) + "</div>";
      }).join("") + (selected.length ? '<div class="ms-clear">Clear all</div>' : "");
    }
    box.addEventListener("click", function (e) {
      var x = e.target.getAttribute && e.target.getAttribute("data-x");
      if (x) { selected = selected.filter(function (v) { return v !== x; }); renderBox(); renderMenu(); e.stopPropagation(); return; }
      var open = menu.hidden; menu.hidden = !open; wrap.classList.toggle("open", open);
    });
    menu.addEventListener("click", function (e) {
      if (e.target.classList.contains("ms-clear")) { selected = []; renderBox(); renderMenu(); return; }
      var opt = e.target.closest(".ms-opt"); if (!opt) return;
      var v = opt.getAttribute("data-v");
      var i = selected.indexOf(v);
      if (i >= 0) selected.splice(i, 1); else selected.push(v);
      renderBox(); renderMenu(); // keep menu open
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) { menu.hidden = true; wrap.classList.remove("open"); }
    });
    renderBox(); renderMenu();
    wrap.appendChild(box); wrap.appendChild(menu);
    return { el: wrap, values: function () { return selected.slice(); } };
  }

  // ---- date validation (DD/Mon/YYYY) ----
  function parseDateClient(s) {
    if (!s) return null;
    var m = String(s).match(/(\d{1,2})[\/\s-]([A-Za-z]{3})[\/\s-](\d{4})/);
    var MON = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    if (!m) return NaN;
    var mi = MON.indexOf(m[2].toLowerCase());
    if (mi < 0) return NaN;
    return new Date(Date.UTC(+m[3], mi, +m[1])).getTime();
  }
  function validateDates(from, to) {
    var f = parseDateClient(from), t = parseDateClient(to);
    if (from && isNaN(f)) return "From Date is not a valid date (use DD/Mon/YYYY).";
    if (to && isNaN(t)) return "To Date is not a valid date (use DD/Mon/YYYY).";
    if (f && t && f > t) return "From Date cannot be later than To Date.";
    return null;
  }

  function doSearch(filters) {
    lastSearch = filters;
    var box = document.getElementById("aResults");
    box.innerHTML = '<div class="empty-msg">Searching…</div>';
    api("/api/accounting/search", { method: "POST", body: filters }).then(function (res) {
      renderResults(res, box);
    }).catch(function () { box.innerHTML = '<div class="card-panel"><div class="empty-msg">Search failed.</div></div>'; });
  }

  // ---- Search Results (Search Details + table + export) ----
  function renderResults(res, box) {
    var exportDisabled = res.count === 0;
    var details =
      '<div class="search-details">' +
        '<div class="sd-head"><h3>SEARCH DETAILS</h3>' +
          '<div class="export-group">' +
            '<button class="xbtn" id="expXlsx"' + (exportDisabled ? " disabled" : "") + '>' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg> Excel</button>' +
            '<button class="xbtn" id="expCsv"' + (exportDisabled ? " disabled" : "") + '>' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg> CSV</button>' +
          "</div>" +
        "</div>" +
        '<div class="sd-grid">' +
          '<div><div class="lbl">Description</div><div class="val">' + esc(res.description) + "</div></div>" +
          '<div><div class="lbl">Date range</div><div class="val">' + esc(res.dateRange) + "</div></div>" +
          '<div><div class="lbl">Results</div><div class="val">' + res.count + "</div></div>" +
        "</div>" +
      "</div>";

    var table;
    if (!res.count) {
      table = '<div class="card-panel"><div class="empty-msg">' +
        "No transactions match all the selected filters.<br>" +
        '<span style="font-size:12px">Try removing a filter, selecting more values in a category, or widening the date range.</span>' +
        "</div></div>";
    } else {
      var head = "<tr><th>Ref</th><th>Profile</th><th>Type</th><th>Method</th><th>Acquirer</th>" +
        "<th>Currency</th><th>Amount</th><th>Date</th><th>Time</th><th>Status</th></tr>";
      var rows = res.rows.map(function (t) {
        return "<tr>" +
          '<td><a class="link">' + esc(t.ref) + "</a></td>" +
          '<td><a class="link">' + esc(t.profile) + "</a></td>" +
          "<td>" + esc(t.type) + "</td><td>" + esc(t.method) + "</td><td>" + esc(t.acquirer) + "</td>" +
          "<td>" + esc(t.currency) + "</td><td>" + money(t.amount) + "</td>" +
          "<td>" + esc(t.txDate) + "</td><td>" + esc(t.time) + "</td>" +
          '<td><span class="status-pill st-' + esc(t.status) + '">' + (t.status === "A" ? "✓" : esc(t.status)) + "</span></td></tr>";
      }).join("");
      table = '<div class="card-panel"><h3>TRANSACTIONS</h3>' +
        '<div class="table-scroll"><table class="grid"><thead>' + head + "</thead><tbody>" + rows + "</tbody></table></div></div>";
    }

    box.innerHTML = details + table;
    if (!exportDisabled) {
      document.getElementById("expXlsx").addEventListener("click", function () { exportResults("xlsx"); });
      document.getElementById("expCsv").addEventListener("click", function () { exportResults("csv"); });
    }
  }

  function exportResults(format) {
    var q = encodeURIComponent(JSON.stringify(lastSearch || {}));
    fetch("/api/accounting/export?format=" + format + "&q=" + q, {
      headers: { Authorization: "Bearer " + token }
    })
      .then(function (r) { if (!r.ok) throw new Error("bad"); return r.blob(); })
      .then(function (blob) {
        var today = new Date().toISOString().slice(0, 10);
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "accounting_search_results_" + today + "." + format;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        toast("Exported " + format.toUpperCase());
      })
      .catch(function () { toast("Export failed."); });
  }

  /* ==================================================================
     TRANSACTION DETAIL MODAL  (+ chargeback)
  ================================================================== */
  var currentRef = null;
  function openTxn(ref) {
    currentRef = ref;
    api("/api/transactions/" + encodeURIComponent(ref)).then(function (res) {
      if (!res.ok) { toast("Transaction not found."); return; }
      fillTxnModal(res.transaction, res.statusLabel);
      document.getElementById("txnModal").hidden = false;
    });
  }
  function fillTxnModal(t, statusLabel) {
    var ok = (t.status === "A");
    var notesRows = t.notes.length
      ? t.notes.map(function (n) {
          return '<tr><td>' + esc(n.date) + '</td><td class="nt-by">' + esc(n.by) + "</td><td>" + esc(n.text) + "</td></tr>";
        }).join("")
      : '<tr><td colspan="3" class="empty-msg">No notes yet.</td></tr>';

    var cbDisabled = t.chargeback ? "disabled" : "";
    var cbLabel = t.chargeback ? "Chargeback Added" : "Chargeback";

    document.getElementById("txnModalBody").innerHTML =
      '<div class="txn-status-bar">' +
        '<span class="txn-badge ' + (ok ? "ok" : "err") + '">' + (ok ? "AUTHORISED" : "NOT AUTHORISED") + "</span>" +
        '<span class="txn-title">ECOM ' + esc(t.type.toUpperCase()) + " " + esc(t.ref) + "</span>" +
        '<span class="spacer" style="flex:1"></span>' +
        '<button class="modal-x" id="txnClose">&times;</button>' +
      "</div>" +
      '<div class="txn-merchant">' + esc(t.merchantId) + ": " + esc(t.merchant) + "</div>" +
      '<table class="kv">' +
        kv("Date and Time", t.txDate + " " + t.txTime) +
        kv("Amount", t.currency + " " + money(t.amount)) +
        kv("Status", t.status + "  (" + esc(statusLabel) + ")") +
        kv("Authorization Code", t.authCode) +
        kv("Cart ID", t.cartId) +
        kv("Description", t.description) +
        kv("Fees / Tax", t.currency + " " + money(t.fees) + " / " + money(t.tax)) +
      "</table>" +
      '<div class="tabs-row">' +
        '<button class="tab-btn active" data-tab="pm">PAYMENT METHOD</button>' +
        '<button class="tab-btn" data-tab="cust">CUSTOMER DETAILS</button>' +
        '<button class="tab-btn" data-tab="notes">NOTES</button>' +
      "</div>" +
      '<div class="tab-pane" data-pane="pm">' +
        '<table class="kv">' +
          kv("Acquirer", t.acquirer) + kv("Channel", t.channel) + kv("Method", t.method) +
          kv("Card", t.cardMask) + kv("Expiry", t.expiry) +
          kv("Issuer Country", t.issuerCountry) + kv("Issuer Name", t.issuerName) +
        "</table>" +
      "</div>" +
      '<div class="tab-pane" data-pane="cust" hidden>' +
        '<table class="kv">' + kv("Email", t.email) + kv("Phone", t.phone) + "</table>" +
      "</div>" +
      '<div class="tab-pane" data-pane="notes" hidden>' +
        '<table class="notes-tbl">' + notesRows + "</table>" +
      "</div>" +
      '<div class="modal-actions">' +
        '<button class="btn-red" id="blockRefundBtn">Block Refund</button>' +
        '<button class="btn-green" id="openCbBtn" ' + cbDisabled + ">" + cbLabel + "</button>" +
      "</div>";

    document.getElementById("txnClose").onclick = closeTxn;
    document.getElementById("txnModalBody").querySelectorAll(".tab-btn").forEach(function (b) {
      b.onclick = function () {
        document.getElementById("txnModalBody").querySelectorAll(".tab-btn").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        document.getElementById("txnModalBody").querySelectorAll(".tab-pane").forEach(function (p) {
          p.hidden = (p.dataset.pane !== b.dataset.tab);
        });
      };
    });
    document.getElementById("blockRefundBtn").onclick = function () { toast("Refund blocked for " + t.ref); };
    var openCb = document.getElementById("openCbBtn");
    if (!t.chargeback) openCb.onclick = function () { document.getElementById("cbModal").hidden = false; };
  }
  function closeTxn() { document.getElementById("txnModal").hidden = true; }
  document.getElementById("txnModal").addEventListener("click", function (e) {
    if (e.target.id === "txnModal") closeTxn();
  });

  /* ---- Add Chargeback submit ---- */
  document.querySelectorAll("[data-close-cb]").forEach(function (b) {
    b.addEventListener("click", function () { document.getElementById("cbModal").hidden = true; });
  });
  document.getElementById("cbModal").addEventListener("click", function (e) {
    if (e.target.id === "cbModal") document.getElementById("cbModal").hidden = true;
  });
  document.getElementById("cbSubmit").addEventListener("click", function () {
    var body = {
      type: document.getElementById("cbType").value,
      reason: document.getElementById("cbReason").value.trim(),
      blockCard: document.getElementById("cbBlockCard").checked,
      blockEmail: document.getElementById("cbBlockEmail").checked,
      blockRefund: document.getElementById("cbBlockRefund").checked
    };
    api("/api/transactions/" + encodeURIComponent(currentRef) + "/chargeback", { method: "POST", body: body })
      .then(function (res) {
        if (!res.ok) { toast("Failed to add chargeback."); return; }
        document.getElementById("cbModal").hidden = true;
        document.getElementById("cbReason").value = "";
        document.getElementById("cbBlockCard").checked = false;
        document.getElementById("cbBlockEmail").checked = false;
        document.getElementById("cbBlockRefund").checked = false;
        toast("Chargeback added to " + currentRef);
        openTxn(currentRef); // refresh modal (shows note + disables button)
      });
  });

  /* ==================================================================
     REPORTS  (+ xlsx download)
  ================================================================== */
  var curPage = 1, TOTAL_PAGES = 9;
  function renderReports() {
    crumbs(["Home", "Reports"]);
    content.innerHTML =
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<div class="panel-title">REPORTS</div>' +
          '<div class="report-pick">' +
            '<select><option>PPD: Payout Details</option><option>TXN: Transaction Summary</option>' +
            '<option>SET: Settlement Report</option><option>REF: Refund Details</option></select>' +
            '<span class="folder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z"/></svg></span>' +
          "</div>" +
        "</div>" +
        '<div class="table-scroll"><table class="reports"><thead><tr>' +
          '<th style="width:90px">ID</th><th style="width:230px">Title</th>' +
          '<th style="width:170px">Generated On</th><th>Summary</th>' +
        "</tr></thead><tbody id=\"reportRows\"></tbody></table></div>" +
        '<div class="pager" id="pager"></div>' +
      "</div>";
    goPage(curPage);
  }
  function goPage(p) {
    if (p < 1 || p > TOTAL_PAGES) return;
    api("/api/reports?page=" + p).then(function (d) {
      if (!d.ok) return;
      curPage = d.page; TOTAL_PAGES = d.totalPages;
      var tb = document.getElementById("reportRows");
      tb.innerHTML = d.rows.map(function (r) {
        return '<tr><td class="muted">' + r[0] + "</td>" +
          '<td class="title"><a href="#" class="dl" data-id="' + r[0] + '" data-title="' + esc(r[1]) + '">' + esc(r[1]) + "</a></td>" +
          '<td class="muted">' + esc(r[2]) + "</td><td>" + esc(r[3]) + "</td></tr>";
      }).join("");
      tb.querySelectorAll("a.dl").forEach(function (a) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          downloadReport(a.dataset.id, a.dataset.title, a);
        });
      });
      renderPager();
    });
  }
  function renderPager() {
    var pager = document.getElementById("pager");
    function btn(label, opts) {
      var b = document.createElement("button");
      b.textContent = label;
      if (opts.active) b.className = "active";
      if (opts.disabled) b.disabled = true;
      if (opts.onClick) b.addEventListener("click", opts.onClick);
      return b;
    }
    pager.innerHTML = "";
    pager.appendChild(btn("First", { disabled: curPage === 1, onClick: function () { goPage(1); } }));
    pager.appendChild(btn("‹", { disabled: curPage === 1, onClick: function () { goPage(curPage - 1); } }));
    for (var p = 1; p <= TOTAL_PAGES; p++) (function (p) {
      pager.appendChild(btn(String(p), { active: p === curPage, onClick: function () { goPage(p); } }));
    })(p);
    pager.appendChild(btn("›", { disabled: curPage === TOTAL_PAGES, onClick: function () { goPage(curPage + 1); } }));
    pager.appendChild(btn("Last", { disabled: curPage === TOTAL_PAGES, onClick: function () { goPage(TOTAL_PAGES); } }));
  }
  function downloadReport(id, title, link) {
    var original = link.textContent;
    link.textContent = title + "  (downloading…)";
    fetch("/api/reports/" + id + "/download", { headers: { Authorization: "Bearer " + token } })
      .then(function (r) { if (!r.ok) throw new Error("bad"); return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = title.replace(/[\/\\:*?"<>|]/g, "-") + ".xlsx";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        link.textContent = original;
      })
      .catch(function () { link.textContent = original; toast("Download failed. Is the server running?"); });
  }

  /* -------------------- tiny form builders -------------------- */
  function row(label, field) { return '<div class="form-row"><label>' + esc(label) + "</label>" + field + "</div>"; }
  function inp(id, ph) { return '<input id="' + id + '" placeholder="' + esc(ph) + '">'; }
  function sel(id, opts, firstLabel, nameFn) {
    return '<select id="' + id + '">' + opts.map(function (o, i) {
      var label = (i === 0 && firstLabel) ? firstLabel : (nameFn ? nameFn(o) : o);
      return '<option value="' + esc(o) + '">' + esc(label) + "</option>";
    }).join("") + "</select>";
  }
  function statusName(s) { return ({ A: "Authorised", E: "Error", H: "Hold", D: "Declined" })[s] || s; }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
  function kv(k, v) { return '<tr><td class="k">' + esc(k) + '</td><td class="v">' + esc(v) + "</td></tr>"; }

  /* -------------------- restore session on load (deep-link friendly) -------------------- */
  (function restore() {
    var saved = null, name = "SysAdmin";
    try { saved = localStorage.getItem("pt_token"); name = localStorage.getItem("pt_user") || "SysAdmin"; } catch (e) {}
    if (!saved) return;                      // not logged in -> normal login flow
    token = saved;
    // Verify the token is still valid (server may have restarted) before showing the app.
    fetch("/api/finance/meta", { headers: { Authorization: "Bearer " + token } })
      .then(function (r) {
        if (r.status === 401) { sessionExpired(); return; }
        document.getElementById("userName").textContent = name;
        document.getElementById("udName").textContent = name;
        document.getElementById("login").hidden = true;
        document.getElementById("app").hidden = false;
        applyPath();                         // open the screen named in the URL
      })
      .catch(function () { /* offline -> stay on login */ });
  })();
})();
