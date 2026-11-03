/**
 * PayTabs-style SysAdmin App
 * Node.js + Express + SQLite (better-sqlite3)
 * Features: Login (JWT + bcrypt), Transaction history table, CRUD API
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { DEFAULT_GENERATED_ON, REPORT_DATES, ID_DATES } = require('./config'); // ⬅️ config.js இருந்து date எடுக்கும்

// Helper: title-க்கு match ஆன date திரும்பும், இல்லன்னா default
function getGeneratedOn(title) {
  if (REPORT_DATES && title) {
    const matched = Object.keys(REPORT_DATES).find(
      key => title.toLowerCase().includes(key.toLowerCase())
    );
    if (matched) return REPORT_DATES[matched];
  }
  return DEFAULT_GENERATED_ON;
}

// Helper: config ID_DATES-ல் உள்ள records-ஐ DB-ல் update பண்ணும்
function applyIdDates() {
  if (!ID_DATES || Object.keys(ID_DATES).length === 0) return;
  const stmt = db.prepare('UPDATE transactions SET generated_on = ? WHERE id = ?');
  let count = 0;
  for (const [id, date] of Object.entries(ID_DATES)) {
    const info = stmt.run(date, parseInt(id, 10));
    if (info.changes > 0) count++;
  }
  if (count > 0) console.log(`[config] ID_DATES: ${count} record(s) updated.`);
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'paytabs_super_secret_change_me';

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Database ----------
// On Render/Railway/Vercel use persistent disk or /tmp if provided, else local file.
const DB_PATH = process.env.DB_PATH || (process.env.VERCEL ? path.join('/tmp', 'data.db') : path.join(__dirname, 'data.db'));
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    email    TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name     TEXT
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    generated_on TEXT NOT NULL,
    summary      TEXT NOT NULL,
    amount       REAL DEFAULT 0,
    status       TEXT DEFAULT 'Completed',
    created_at   TEXT DEFAULT (datetime('now'))
  );
`);

// ---------- Seed default admin + sample data ----------
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)')
      .run('admin@paytabs.com', hash, 'Sys Admin');
    console.log('Seeded default user -> email: admin@paytabs.com  password: admin123');
  }

  const txnCount = db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c;
  if (txnCount === 0) {
    const months = [
      ['03/Sep/2026 08:46', 'Aggregated transactions in Aug 2026', 125430.50],
      ['03/Aug/2026 08:45', 'Aggregated transactions in Jul 2026', 98250.00],
      ['03/Jul/2026 08:45', 'Aggregated transactions in Jun 2026', 110500.75],
      ['03/Jun/2026 08:45', 'Aggregated transactions in May 2026', 87600.25],
      ['03/May/2026 08:46', 'Aggregated transactions in Apr 2026', 143200.00],
      ['03/Apr/2026 08:45', 'Aggregated transactions in Mar 2026', 76890.40],
      ['03/Mar/2026 08:45', 'Aggregated transactions in Feb 2026', 65400.00],
      ['03/Feb/2026 08:45', 'Aggregated transactions in Jan 2026', 99120.60],
      ['03/Jan/2026 08:43', 'Aggregated transactions in Dec 2025', 132450.00],
      ['03/Dec/2025 08:42', 'Aggregated transactions in Nov 2025', 88000.00],
      ['03/Nov/2025 08:42', 'Aggregated transactions in Oct 2025', 101230.80],
      ['03/Oct/2025 08:43', 'Aggregated transactions in Sep 2025', 77650.00],
      ['03/Sep/2025 08:42', 'Aggregated transactions in Aug 2025', 94300.10],
      ['03/Aug/2025 08:42', 'Aggregated transactions in Jul 2025', 120800.00],
      ['03/Jul/2025 08:43', 'Aggregated transactions in Jun 2025', 68900.00],
      ['03/Jun/2025 08:43', 'Aggregated transactions in May 2025', 85600.00],
      ['03/May/2025 08:42', 'Aggregated transactions in Apr 2025', 112000.00],
      ['03/Apr/2025 08:38', 'Aggregated transactions in Mar 2025', 73400.00],
      ['03/Mar/2025 08:38', 'Aggregated transactions in Feb 2025', 59800.00],
      ['03/Feb/2025 08:38', 'Aggregated transactions in Jan 2025', 91200.00]
    ];
    const insert = db.prepare(
      'INSERT INTO transactions (title, generated_on, summary, amount, status) VALUES (?, ?, ?, ?, ?)'
    );
    const statuses = ['Completed', 'Completed', 'Pending', 'Completed'];
    months.forEach((m, i) => {
      insert.run('Accounting Aggregation Transactions', m[0], m[2] ? m[1] : m[1], m[2], statuses[i % statuses.length]);
    });
    console.log('Seeded ' + months.length + ' sample transactions.');
  }
}
seed();
applyIdDates(); // config.js-ல் ID_DATES → DB auto-update

// ---------- Auth helpers ----------
function auth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------- Routes ----------

// Register (optional)
app.post('/api/register', (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'User already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)')
    .run(email, hash, name || 'User');
  res.json({ id: info.lastInsertRowid, email });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// Get all transactions (with optional search + pagination)
app.get('/api/transactions', auth, (req, res) => {
  const search = (req.query.search || '').trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 15);
  const offset = (page - 1) * limit;

  let where = '';
  let params = [];
  if (search) {
    where = 'WHERE title LIKE ? OR summary LIKE ? OR generated_on LIKE ?';
    params = [`%${search}%`, `%${search}%`, `%${search}%`];
  }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM transactions ${where}`).get(...params).c;
  const rows = db.prepare(
    `SELECT * FROM transactions ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ data: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// Get single transaction
app.get('/api/transactions/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// Create transaction
app.post('/api/transactions', auth, (req, res) => {
  const { title, generated_on, summary, amount, status } = req.body || {};
  if (!title || !summary) return res.status(400).json({ error: 'Title and summary required' });
  const now = generated_on || getGeneratedOn(title); // title-க்கு match ஆன date use ஆகும்
  const info = db.prepare(
    'INSERT INTO transactions (title, generated_on, summary, amount, status) VALUES (?, ?, ?, ?, ?)'
  ).run(title, now, summary, amount || 0, status || 'Pending');
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

// Update transaction
app.put('/api/transactions/:id', auth, (req, res) => {
  const { title, generated_on, summary, amount, status } = req.body || {};
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    'UPDATE transactions SET title=?, generated_on=?, summary=?, amount=?, status=? WHERE id=?'
  ).run(
    title ?? existing.title,
    generated_on ?? existing.generated_on,
    summary ?? existing.summary,
    amount ?? existing.amount,
    status ?? existing.status,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id));
});

// Delete transaction
app.delete('/api/transactions/:id', auth, (req, res) => {
  const info = db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Stats for dashboard cards
app.get('/api/stats', auth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c;
  const sum = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM transactions').get().s;
  const completed = db.prepare("SELECT COUNT(*) AS c FROM transactions WHERE status='Completed'").get().c;
  const pending = db.prepare("SELECT COUNT(*) AS c FROM transactions WHERE status='Pending'").get().c;
  res.json({ total, sum, completed, pending });
});

// Health check for deployment platforms
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Fallback to login page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PayTabs app running on http://localhost:${PORT}`);
});

module.exports = app;
