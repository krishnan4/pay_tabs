/**
 * Generate a development PKI for client-certificate (mTLS) authentication:
 *   certs/ca.crt , ca.key            - the dev Root CA (trust anchor)
 *   certs/server.crt , server.key    - HTTPS server cert (CN=localhost)
 *   certs/client.crt , client.key    - a client cert (CN=SysAdmin)
 *   certs/client.p12                 - PKCS#12 bundle to import into the browser
 *
 * Pure JS (node-forge) so it works on Windows/macOS/Linux without openssl.
 * These are DEV certificates. Never commit them or use them in production.
 */

const fs = require("fs");
const path = require("path");
const forge = require("node-forge");

const OUT = path.join(__dirname, "..", "certs");
const CLIENT_P12_PASSWORD = process.env.CLIENT_P12_PASSWORD || "paytabs";
const CLIENT_CN = process.env.CLIENT_CN || "SysAdmin";

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function rnSerial() {
  // positive hex serial
  return "00" + forge.util.bytesToHex(forge.random.getBytesSync(8));
}
function daysFrom(base, days) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function makeCert(keys, subjectAttrs, issuerAttrs, signingKey, opts) {
  opts = opts || {};
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = rnSerial();
  const now = new Date();
  cert.validity.notBefore = daysFrom(now, -1);
  cert.validity.notAfter = daysFrom(now, opts.days || 365);
  cert.setSubject(subjectAttrs);
  cert.setIssuer(issuerAttrs);
  const ext = [];
  if (opts.ca) {
    ext.push({ name: "basicConstraints", cA: true, critical: true });
    ext.push({ name: "keyUsage", keyCertSign: true, cRLSign: true, digitalSignature: true, critical: true });
  } else {
    ext.push({ name: "basicConstraints", cA: false });
    ext.push({ name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true });
    if (opts.serverAuth) ext.push({ name: "extKeyUsage", serverAuth: true });
    if (opts.clientAuth) ext.push({ name: "extKeyUsage", clientAuth: true });
  }
  if (opts.altNames) ext.push({ name: "subjectAltName", altNames: opts.altNames });
  cert.setExtensions(ext);
  cert.sign(signingKey, forge.md.sha256.create());
  return cert;
}

console.log("Generating dev PKI into", OUT, "…");

// ---- Root CA ----
const caKeys = forge.pki.rsa.generateKeyPair(2048);
const caAttrs = [
  { name: "commonName", value: "PayTabs Dev Root CA" },
  { name: "organizationName", value: "PayTabs Demo" },
  { name: "countryName", value: "AE" }
];
const caCert = makeCert(caKeys, caAttrs, caAttrs, caKeys.privateKey, { ca: true, days: 3650 });

// ---- Server cert (CN=localhost, SAN localhost + 127.0.0.1) ----
const srvKeys = forge.pki.rsa.generateKeyPair(2048);
const srvAttrs = [
  { name: "commonName", value: "localhost" },
  { name: "organizationName", value: "PayTabs Demo" },
  { name: "countryName", value: "AE" }
];
const srvCert = makeCert(srvKeys, srvAttrs, caAttrs, caKeys.privateKey, {
  serverAuth: true, days: 825,
  altNames: [
    { type: 2, value: "localhost" },        // DNS
    { type: 7, ip: "127.0.0.1" }            // IP
  ]
});

// ---- Client cert (CN=SysAdmin) ----
const cliKeys = forge.pki.rsa.generateKeyPair(2048);
const cliAttrs = [
  { name: "commonName", value: CLIENT_CN },
  { name: "organizationName", value: "PayTabs Demo" },
  { name: "organizationalUnitName", value: "SysAdmin Portal" },
  { name: "countryName", value: "AE" }
];
const cliCert = makeCert(cliKeys, cliAttrs, caAttrs, caKeys.privateKey, { clientAuth: true, days: 825 });

// ---- Write PEM files ----
function w(name, pem) { fs.writeFileSync(path.join(OUT, name), pem); }
w("ca.crt", forge.pki.certificateToPem(caCert));
w("ca.key", forge.pki.privateKeyToPem(caKeys.privateKey));
w("server.crt", forge.pki.certificateToPem(srvCert));
w("server.key", forge.pki.privateKeyToPem(srvKeys.privateKey));
w("client.crt", forge.pki.certificateToPem(cliCert));
w("client.key", forge.pki.privateKeyToPem(cliKeys.privateKey));

// ---- Client PKCS#12 (import into browser) ----
const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
  cliKeys.privateKey, [cliCert, caCert], CLIENT_P12_PASSWORD,
  { algorithm: "3des", friendlyName: "PayTabs " + CLIENT_CN }
);
fs.writeFileSync(path.join(OUT, "client.p12"),
  Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), "binary"));

console.log("Done.");
console.log("  CA:        certs/ca.crt (trust this in your OS/browser)");
console.log("  Server:    certs/server.crt / server.key");
console.log("  Client:    certs/client.crt / client.key");
console.log("  Browser:   certs/client.p12  (password: " + CLIENT_P12_PASSWORD + ", CN=" + CLIENT_CN + ")");
