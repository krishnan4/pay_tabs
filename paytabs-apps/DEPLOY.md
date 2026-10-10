# Deployment & Certificate Notes

## What the "Certificate Information" dialog is (and is NOT)

The login flow shows a **Certificate Information** dialog after valid credentials.
This is **demo UI only**:

- It displays sample certificate fields (Subject, Issuer, Serial, Valid From/To,
  Verification status) returned by the backend.
- It does **NOT** perform real client-certificate (mTLS) verification. No TLS
  handshake with a client cert happens, no CA chain is validated, no private-key
  possession is proven.
- Clicking **OK** continues into the app; **Cancel** aborts the sign-in.

The dialog itself says this, so no one mistakes it for real security.

## Running locally

```bash
npm install
npm start
# open http://127.0.0.1:3000
```

Login: `admin@paytabs.com` / `Paytabs@2026`

## Deploying to Render

1. Push this folder to a GitHub repo.
2. Render → **New → Web Service** → connect the repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node (Render sets `PORT` automatically — the app already
     reads `process.env.PORT`).
4. Deploy. Render gives an HTTPS URL. Server TLS (HTTPS) is handled by Render.

## Deploying to Railway

1. Push to GitHub.
2. Railway → **New Project → Deploy from GitHub repo**.
3. Railway detects Node and runs `npm install` then `npm start`.
   (A `Procfile` is included as a fallback: `web: npm start`.)
4. Railway provides an HTTPS domain; TLS is handled by Railway.

## Real client-certificate (mTLS) auth — important limitation

If you later want **real** client-certificate login (the browser presents a
client cert, the server validates it), note:

- **Render and Railway terminate TLS at their edge and do not pass the client
  certificate to your app.** So real mTLS client-cert auth is **not possible
  directly on those platforms.**
- The supported architectures are:
  1. An **external TLS-terminating proxy you control** (e.g. nginx/HAProxy on a
     VM) configured with `ssl_verify_client on` and a trusted CA, which then
     forwards the verified identity to the app via a trusted header — and the
     app must accept that header **only** from the proxy and strip any
     client-supplied copy.
  2. **Cloudflare mTLS** (Cloudflare Access / API Shield) in front of the app.
  3. An **enterprise identity provider** that supports certificate-based auth.
- A Node HTTPS server with `requestCert: true` + `rejectUnauthorized: true` +
  a CA bundle can do real mTLS **when you run the TLS yourself** (e.g. locally
  or on a VM), not behind Render/Railway's edge TLS.

This repo does **not** implement that; it implements the demo dialog only, as
requested. Ask if you want the real mTLS path built for a self-hosted/VM setup.
