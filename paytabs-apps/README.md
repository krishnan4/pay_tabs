# PayTabs Portal (Node.js + Express)

A demo PayTabs portal: login page + SysAdmin **Reports** dashboard.
The frontend talks to an Express backend over a small JSON API, so you can
plug in a real database later without touching the UI.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000

**Login:**
- Email: `admin@paytabs.com`
- Password: `Paytabs@2026`

For auto-reload while developing: `npm run dev`

## Project structure

```
paytabs-app/
├── server.js            # Express server + API routes
├── package.json
├── data/
│   └── reports.js       # Mock reports data (replace with DB queries)
└── public/              # Frontend (served as static files)
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

## Screens (from PT2 screenshots)

- **Login** – PayTabs branded sign-in.
- **Home** – dashboard: 6 stat tiles, Previous-7-days & Last-8-hours bar charts,
  Top-8 merchants and Payment-methods bars, password-expiry banner.
- **Transactions → Search** – full search form (Title, Ref, Merchant ID, Acquirer,
  Method, Status, Type). Click a result row → **transaction detail** modal with
  Payment Method / Customer / Notes tabs, **Block Refund** and **Chargeback**.
- **Add Chargeback** modal – Full / Partial / No-debit, reason, AntiFraud
  (Block Card / Block Email) and Block Refund toggles. Submitting adds a system
  note to the transaction.
- **Finance → Accounting Search** – Title, Ref, Account ID, Merchant ID,
  Account Type (Primary/Secondary/PSP), Acquirer, Type → results.
- **Reports** – payout reports table; **click a title to download it as .xlsx**
  (works on localhost; browser download).

The sidebar items without a built screen (Merchants, Profiles, Terminals, Deposit,
Refund, Underwriting, Ongoing Screening, Resellers, Support) show a "not built yet"
toast — easy placeholders to extend.

## API

| Method | Route                               | Auth | Purpose                             |
|--------|-------------------------------------|------|-------------------------------------|
| POST   | `/api/login`                        | No   | `{ email, password }` → token       |
| POST   | `/api/logout`                       | Yes  | Invalidate token                    |
| GET    | `/api/dashboard`                    | Yes  | Dashboard tiles + chart data        |
| POST   | `/api/transactions/search`          | Yes  | Filter transactions → rows          |
| GET    | `/api/transactions/:ref`            | Yes  | One transaction's full detail       |
| POST   | `/api/transactions/:ref/chargeback` | Yes  | Add a chargeback + note             |
| POST   | `/api/accounting/search`            | Yes  | Finance accounting search → rows    |
| GET    | `/api/reports?page=N`               | Yes  | Paginated report rows               |
| GET    | `/api/reports/:id/download`         | Yes  | Download a report as **.xlsx**      |

Auth uses a `Bearer <token>` header. The token is returned by `/api/login`.

## Adding a real backend later

1. **Users** — in `server.js`, replace the `USERS` array with a DB lookup
   (MongoDB / MySQL / Postgres). Hash passwords (e.g. `bcrypt`).
2. **Sessions** — swap the in-memory `sessions` Map for JWT or a session
   store (Redis). 
3. **Reports** — in `data/reports.js`, replace `getReports(page)` with a real
   query using `LIMIT`/`OFFSET` for pagination.
4. Add a `.env` file for secrets (`PORT`, DB connection string, JWT secret).

The frontend (`public/js/app.js`) already calls these endpoints, so swapping
the mock data for real data needs no frontend changes.
