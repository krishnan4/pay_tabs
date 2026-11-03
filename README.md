# PayTabs-style SysAdmin App

A full-stack transaction management app with login, a sidebar menu, and a transaction-history table — built with **plain HTML/CSS/JS** on the front end and **Node.js + Express + SQLite** on the back end.

## Features
- Login screen (JWT auth + bcrypt password hashing)
- Dashboard with PayTabs-style sidebar menu
- Transaction history table (stored in SQLite)
- Add / Edit / Delete transactions (CRUD)
- Search + pagination
- Dashboard stat cards (total, amount, completed, pending)
- Ready to deploy on **Render** or **Railway**

## Demo login
```
Email:    admin@paytabs.com
Password: admin123
```

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000

## Project structure
```
paytabs-app/
├── server.js            # Express backend + SQLite + API
├── package.json
├── render.yaml          # Render deploy config
├── railway.json         # Railway deploy config
└── public/
    ├── index.html       # Login page
    ├── dashboard.html   # Dashboard + table
    ├── css/style.css
    └── js/
        ├── login.js
        └── dashboard.js
```

## API endpoints
| Method | Endpoint                | Description            |
|--------|-------------------------|------------------------|
| POST   | /api/login              | Login, returns JWT     |
| POST   | /api/register           | Create user            |
| GET    | /api/transactions       | List (search + page)   |
| POST   | /api/transactions       | Create                 |
| PUT    | /api/transactions/:id   | Update                 |
| DELETE | /api/transactions/:id   | Delete                 |
| GET    | /api/stats              | Dashboard stats        |

All transaction routes require `Authorization: Bearer <token>`.

---

## Deploy on Render
1. Push this folder to a GitHub repo.
2. Go to [render.com](https://render.com) → **New +** → **Web Service** → connect your repo.
3. Render auto-detects `render.yaml`. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. The `render.yaml` adds a 1GB persistent disk at `/var/data` so your SQLite DB survives restarts, and auto-generates `JWT_SECRET`.
5. Deploy. Done.

> Without `render.yaml`, just set Build = `npm install`, Start = `npm start`. (On the free tier without a disk, the DB resets on each redeploy — fine for a demo.)

## Deploy on Railway
1. Push to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Railway auto-detects Node and runs `npm start`.
4. (Optional) Add a **Volume** mounted at `/var/data`, then add env var `DB_PATH=/var/data/data.db` so data persists.
5. Add env var `JWT_SECRET` = any long random string.
6. Deploy. Railway gives you a public URL.

## Environment variables
| Variable      | Default                      | Purpose                     |
|---------------|------------------------------|-----------------------------|
| `PORT`        | 3000                         | Set automatically by host   |
| `JWT_SECRET`  | (dev fallback)               | Token signing secret        |
| `DB_PATH`     | ./data.db                    | SQLite file location        |

---
Built with Node.js + Express + better-sqlite3.
