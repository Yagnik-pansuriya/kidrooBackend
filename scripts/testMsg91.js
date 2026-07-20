/**
 * ============================================================
 * MSG91 SMS DIAGNOSTIC SCRIPT
 * ============================================================
 * Run: node scripts/testMsg91.js <your_10_digit_mobile>
 * Example: node scripts/testMsg91.js 9876543210
 *
 * This script tests MSG91 directly and shows the EXACT
 * response from MSG91 so you know what is wrong.
 * ============================================================
 */

const https = require("https");
require("dotenv").config();

// ── Config from .env ─────────────────────────────────────────
const AUTH_KEY        = process.env.MSG91_AUTH_KEY;
const OTP_TEMPLATE_ID = process.env.MSG91_OTP_TEMPLATE_ID;
const SMS_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;
const SENDER_ID       = process.env.MSG91_SENDER_ID;
const ENTITY_ID       = process.env.MSG91_ENTITY_ID;
const ROUTE           = process.env.MSG91_ROUTE || "4";

// ── Mobile from command line ──────────────────────────────────
const MOBILE_RAW = process.argv[2];

if (!MOBILE_RAW) {
  console.error("\n❌ Usage: node scripts/testMsg91.js <10_digit_mobile>");
  console.error("   Example: node scripts/testMsg91.js 9876543210\n");
  process.exit(1);
}

const MOBILE_10 = MOBILE_RAW.replace(/\D/g, "").slice(-10);
const MOBILE_91 = `91${MOBILE_10}`;
const TEST_OTP  = "482913"; // fixed test OTP

// ── HTTP helpers ─────────────────────────────────────────────
function postJson(url, payload, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(url, {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(data),
        ...headers,
      },
    }, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function getReq(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", headers: headers || {} }, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

function separator(title) {
  console.log("\n" + "=".repeat(60));
  console.log("  " + title);
  console.log("=".repeat(60));
}

function printResult(label, result) {
  console.log("\n  HTTP Status : " + result.status);
  try {
    const parsed = JSON.parse(result.body);
    console.log("  Response    :", JSON.stringify(parsed, null, 4));
    if (parsed && parsed.type === "success") {
      console.log("\n  [SUCCESS] " + label + " worked!");
    } else if (parsed && parsed.type === "error") {
      console.log("\n  [FAILED]  " + label);
      console.log("  Reason    : " + (parsed.message || parsed.code || result.body));
    }
  } catch (e) {
    console.log("  Raw Body    : " + result.body);
  }
}

// ── MAIN ─────────────────────────────────────────────────────
async function runDiagnostics() {
  console.log("\n========================================");
  console.log("        MSG91 SMS DIAGNOSTICS");
  console.log("========================================");
  console.log("  Mobile        : +" + MOBILE_91);
  console.log("  Auth Key      : " + (AUTH_KEY ? AUTH_KEY.slice(0,8) + "..." : "MISSING!"));
  console.log("  OTP Template  : " + (OTP_TEMPLATE_ID || "MISSING!"));
  console.log("  SMS Template  : " + (SMS_TEMPLATE_ID || "MISSING!"));
  console.log("  Sender ID     : " + (SENDER_ID || "MISSING!"));
  console.log("  Entity ID     : " + (ENTITY_ID || "MISSING!"));
  console.log("  Test OTP      : " + TEST_OTP);

  if (!AUTH_KEY) {
    console.error("\n CRITICAL: MSG91_AUTH_KEY is missing from .env. Cannot continue.");
    process.exit(1);
  }

  // ── TEST 1: Auth Key check ──────────────────────────────────
  separator("TEST 1 — Auth Key Validity");
  console.log("  Checking if your MSG91 auth key is valid...");
  try {
    const res = await getReq(
      "https://control.msg91.com/api/balance.php?authkey=" + AUTH_KEY + "&type=json",
      {}
    );
    console.log("  HTTP Status : " + res.status);
    console.log("  Response    : " + res.body);
    if (res.status === 200) {
      console.log("\n  [OK] Auth key appears valid");
    } else {
      console.log("\n  [FAIL] Auth key may be invalid or expired");
    }
  } catch (err) {
    console.log("  [ERROR] " + err.message);
  }

  // ── TEST 2: OTP API v5 — authkey in URL (correct way) ──────
  separator("TEST 2 — OTP API v5 (authkey in URL) [CORRECT METHOD]");
  if (!OTP_TEMPLATE_ID) {
    console.log("  SKIPPED — MSG91_OTP_TEMPLATE_ID not set in .env");
  } else {
    const url2 =
      "https://control.msg91.com/api/v5/otp" +
      "?template_id=" + encodeURIComponent(OTP_TEMPLATE_ID) +
      "&mobile=" + MOBILE_91 +
      "&authkey=" + encodeURIComponent(AUTH_KEY);
    const payload2 = { OTP: TEST_OTP };
    console.log("  URL     : " + url2.replace(AUTH_KEY, "***HIDDEN***"));
    console.log("  Payload : " + JSON.stringify(payload2));
    try {
      const res = await postJson(url2, payload2, {});
      printResult("OTP API v5 (authkey in URL)", res);
    } catch (err) {
      console.log("  [ERROR] " + err.message);
    }
  }

  // ── TEST 3: OTP API v5 — authkey in header (old wrong way) ──
  separator("TEST 3 — OTP API v5 (authkey in header) [OLD METHOD]");
  if (!OTP_TEMPLATE_ID) {
    console.log("  SKIPPED — MSG91_OTP_TEMPLATE_ID not set in .env");
  } else {
    const url3 =
      "https://control.msg91.com/api/v5/otp" +
      "?template_id=" + encodeURIComponent(OTP_TEMPLATE_ID) +
      "&mobile=" + MOBILE_91;
    const payload3 = { OTP: TEST_OTP };
    console.log("  URL     : " + url3);
    console.log("  Payload : " + JSON.stringify(payload3));
    try {
      const res = await postJson(url3, payload3, { authkey: AUTH_KEY });
      printResult("OTP API v5 (authkey in header)", res);
    } catch (err) {
      console.log("  [ERROR] " + err.message);
    }
  }

  // ── TEST 4: Plain SMS API v2 ────────────────────────────────
  separator("TEST 4 — Plain SMS API v2 (Transactional)");
  if (!SENDER_ID) {
    console.log("  SKIPPED — MSG91_SENDER_ID not set in .env");
  } else {
    const url4 = "https://api.msg91.com/api/v2/sendsms?country=91";
    const payload4 = {
      sender:  SENDER_ID,
      route:   ROUTE,
      country: "91",
      sms: [{
        message: "Your Kidroo Toys OTP is " + TEST_OTP + ". Valid for 10 minutes. Do not share with anyone. - Team Kidroo",
        to: [MOBILE_10],
      }],
    };
    if (SMS_TEMPLATE_ID) payload4.DLT_TE_ID = SMS_TEMPLATE_ID;
    if (ENTITY_ID)       payload4.DLT_PE_ID = ENTITY_ID;

    console.log("  URL     : " + url4);
    console.log("  Payload : " + JSON.stringify(payload4, null, 2));
    try {
      const res = await postJson(url4, payload4, { authkey: AUTH_KEY });
      printResult("Plain SMS API v2", res);
    } catch (err) {
      console.log("  [ERROR] " + err.message);
    }
  }

  // ── DIAGNOSIS TABLE ─────────────────────────────────────────
  separator("WHAT THE ERRORS MEAN");
  console.log([
    "",
    "  MSG91 Response Message        | Fix",
    "  ──────────────────────────────┼──────────────────────────────────",
    "  type:success                  | SMS sent! Check your phone",
    "  Authentication failed         | Auth key wrong/expired → get new key",
    "  PE-TM Chain Error on DLT      | Header not linked on Airtel DLT portal",
    "  Template not found            | Wrong OTP template ID in .env",
    "  Insufficient balance          | Recharge MSG91 wallet",
    "  Sender not found/approved     | KIDROO not linked in MSG91 sender IDs",
    "  Request not found             | Mobile format wrong (must be 91XXXXXXXXXX)",
    "",
  ].join("\n"));

  console.log("  Share the TEST 2 result above and we fix the exact error.\n");
}

runDiagnostics().catch(err => {
  console.error("\n CRASH: " + err.message);
  process.exit(1);
});
