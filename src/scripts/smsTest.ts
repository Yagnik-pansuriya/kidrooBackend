/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║           KIDROO — SMS TEST MODULE (DEV ONLY)           ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Runs through the REAL production code path:
 *   smsTest.ts → sms.ts → msg91.ts → MSG91 API
 *
 * Usage:
 *   npx ts-node src/scripts/smsTest.ts <mobile> [test]
 *
 * Examples:
 *   npx ts-node src/scripts/smsTest.ts 9876543210          → runs all tests
 *   npx ts-node src/scripts/smsTest.ts 9876543210 otp      → OTP send only
 *   npx ts-node src/scripts/smsTest.ts 9876543210 resend   → OTP resend only
 *   npx ts-node src/scripts/smsTest.ts 9876543210 sms      → plain SMS only
 *   npx ts-node src/scripts/smsTest.ts 9876543210 format   → phone format check
 */

import "dotenv/config";
import { sendMsg91OTP, sendMsg91SMS, resendMsg91OTP } from "../utils/msg91";
import { sendOTP, resendOTP, sendSMS } from "../utils/sms";
import { normalizeToE164, getIndianMobile10 } from "../utils/phoneUtils";

// ── Helpers ────────────────────────────────────────────────────────────────────
const LINE  = "═".repeat(58);
const DASH  = "─".repeat(58);
const GREEN = "\x1b[32m";
const RED   = "\x1b[31m";
const YELLOW= "\x1b[33m";
const CYAN  = "\x1b[36m";
const RESET = "\x1b[0m";

function pass(msg: string)  { console.log(`${GREEN}  ✅ PASS${RESET} — ${msg}`); }
function fail(msg: string)  { console.log(`${RED}  ❌ FAIL${RESET} — ${msg}`); }
function info(msg: string)  { console.log(`${CYAN}  ℹ  ${RESET}${msg}`); }
function warn(msg: string)  { console.log(`${YELLOW}  ⚠  ${RESET}${msg}`); }
function section(title: string) {
  console.log(`\n${LINE}`);
  console.log(`  ${CYAN}${title}${RESET}`);
  console.log(DASH);
}

// ── Generate test OTP ──────────────────────────────────────────────────────────
function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Results tracker ────────────────────────────────────────────────────────────
const results: { test: string; status: "PASS" | "FAIL" | "SKIP"; detail: string }[] = [];

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
    pass(name);
    results.push({ test: name, status: "PASS", detail: "OK" });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    fail(`${name}\n     Error: ${msg}`);
    results.push({ test: name, status: "FAIL", detail: msg });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════════════════════

// ── [1] ENV Check ──────────────────────────────────────────────────────────────
async function testEnv() {
  section("TEST 1 — Environment Variables");

  const required: Record<string, string | undefined> = {
    MSG91_AUTH_KEY:        process.env.MSG91_AUTH_KEY,
    MSG91_OTP_TEMPLATE_ID: process.env.MSG91_OTP_TEMPLATE_ID,
    MSG91_TEMPLATE_ID:     process.env.MSG91_TEMPLATE_ID,
    MSG91_SENDER_ID:       process.env.MSG91_SENDER_ID,
    MSG91_ENTITY_ID:       process.env.MSG91_ENTITY_ID,
    SMS_PROVIDER:          process.env.SMS_PROVIDER,
    NODE_ENV:              process.env.NODE_ENV,
  };

  let allSet = true;
  for (const [key, val] of Object.entries(required)) {
    if (!val || val.includes("XXXXXXX")) {
      fail(`${key} is MISSING or placeholder`);
      allSet = false;
    } else {
      const display = key.includes("KEY") || key.includes("SECRET")
        ? val.slice(0, 8) + "***"
        : val;
      pass(`${key} = ${display}`);
    }
  }

  results.push({
    test: "ENV Variables",
    status: allSet ? "PASS" : "FAIL",
    detail: allSet ? "All set" : "Some missing",
  });
}

// ── [2] Phone Format Validation ────────────────────────────────────────────────
async function testPhoneFormat(mobile: string) {
  section("TEST 2 — Phone Number Format Validation");

  const formats = [
    mobile,              // raw input
    `91${mobile}`,       // with country code
    `+91${mobile}`,      // E.164
    `0${mobile}`,        // with leading 0 (should fail)
  ];

  for (const fmt of formats) {
    try {
      const e164    = normalizeToE164(fmt);
      const mobile10 = getIndianMobile10(fmt);
      pass(`Input "${fmt}" → E.164: ${e164} | 10-digit: ${mobile10}`);
    } catch (err: any) {
      if (fmt.startsWith("0")) {
        warn(`Input "${fmt}" correctly rejected: ${err.message}`);
      } else {
        fail(`Input "${fmt}" failed: ${err.message}`);
      }
    }
  }
}

// ── [3] OTP Send via Real Code Path ───────────────────────────────────────────
async function testOTPSend(mobile: string) {
  section("TEST 3 — OTP Send (via sms.ts → msg91.ts → MSG91 API)");

  const otp = generateOTP();
  info(`Generated OTP : ${YELLOW}${otp}${RESET}`);
  info(`Sending to    : +91${mobile}`);
  info(`Provider      : ${process.env.SMS_PROVIDER || "msg91"}`);
  info(`Template ID   : ${process.env.MSG91_OTP_TEMPLATE_ID}`);
  console.log("");

  await runTest("sendOTP() — verification context", async () => {
    await sendOTP(mobile, otp, "verification");
  });

  info(`\n  OTP ${YELLOW}${otp}${RESET} should have arrived on ${YELLOW}+91${mobile}${RESET}`);
  info("  Check your phone now ☝️");
}

// ── [4] OTP Resend ─────────────────────────────────────────────────────────────
async function testOTPResend(mobile: string) {
  section("TEST 4 — OTP Resend");

  const otp = generateOTP();
  info(`Resending with OTP : ${YELLOW}${otp}${RESET}`);
  info(`To                 : +91${mobile}`);
  console.log("");

  await runTest("resendOTP() — should send fresh OTP", async () => {
    await resendOTP(mobile, otp, "verification");
  });
}

// ── [5] Direct MSG91 OTP API (bypasses sms.ts router) ─────────────────────────
async function testDirectMsg91OTP(mobile: string) {
  section("TEST 5 — Direct MSG91 OTP API (msg91.ts only)");

  const otp = generateOTP();
  info(`OTP     : ${YELLOW}${otp}${RESET}`);
  info(`Mobile  : +91${mobile}`);
  console.log("");

  await runTest("sendMsg91OTP() — direct call", async () => {
    await sendMsg91OTP(mobile, otp);
  });
}

// ── [6] Plain SMS (non-OTP transactional) ─────────────────────────────────────
async function testPlainSMS(mobile: string) {
  section("TEST 6 — Plain Transactional SMS (non-OTP)");

  const message = `Kidroo Test SMS — ${new Date().toLocaleTimeString("en-IN")}. Ignore this message.`;
  info(`Message : "${message}"`);
  info(`To      : +91${mobile}`);
  console.log("");

  await runTest("sendSMS() — plain transactional", async () => {
    await sendSMS(mobile, message);
  });

  await runTest("sendMsg91SMS() — direct call", async () => {
    await sendMsg91SMS(mobile, message);
  });
}

// ── [7] Password Reset OTP ─────────────────────────────────────────────────────
async function testPasswordResetOTP(mobile: string) {
  section("TEST 7 — Password Reset OTP");

  const otp = generateOTP();
  info(`OTP     : ${YELLOW}${otp}${RESET}`);
  info(`Mobile  : +91${mobile}`);
  info(`Context : password reset`);
  console.log("");

  await runTest("sendOTP() — password reset context", async () => {
    await sendOTP(mobile, otp, "password reset");
  });
}

// ── [8] Edge Cases ─────────────────────────────────────────────────────────────
async function testEdgeCases(mobile: string) {
  section("TEST 8 — Edge Cases");

  // Invalid mobile numbers — should throw
  const invalid = ["1234567890", "5012345678", "abc", "99999999999999"];
  for (const num of invalid) {
    try {
      normalizeToE164(num);
      fail(`"${num}" should have been rejected but was accepted`);
      results.push({ test: `Reject invalid: ${num}`, status: "FAIL", detail: "Was accepted" });
    } catch {
      pass(`Correctly rejected invalid number: "${num}"`);
      results.push({ test: `Reject invalid: ${num}`, status: "PASS", detail: "Rejected" });
    }
  }
}

// ── Summary Table ──────────────────────────────────────────────────────────────
function printSummary() {
  section("FINAL SUMMARY");

  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const skipped = results.filter(r => r.status === "SKIP").length;

  console.log(`\n  ${"Test".padEnd(40)} ${"Status".padEnd(8)}`);
  console.log(`  ${"─".repeat(40)} ${"─".repeat(8)}`);

  for (const r of results) {
    const icon   = r.status === "PASS" ? `${GREEN}✅ PASS${RESET}` :
                   r.status === "FAIL" ? `${RED}❌ FAIL${RESET}` :
                   `${YELLOW}⏭  SKIP${RESET}`;
    const name   = r.test.slice(0, 39).padEnd(39);
    console.log(`  ${name} ${icon}`);
  }

  console.log(`\n  ${DASH.slice(0,40)}`);
  console.log(`  ${GREEN}Passed : ${passed}${RESET}`);
  console.log(`  ${RED}Failed : ${failed}${RESET}`);
  if (skipped) console.log(`  ${YELLOW}Skipped: ${skipped}${RESET}`);

  if (failed === 0) {
    console.log(`\n  ${GREEN}🎉 ALL TESTS PASSED — MSG91 is fully working!${RESET}`);
  } else {
    console.log(`\n  ${RED}⚠️  ${failed} test(s) failed — check errors above.${RESET}`);
  }

  console.log(`\n${LINE}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  const mobile  = process.argv[2];
  const testArg = (process.argv[3] || "all").toLowerCase();

  // ── Validate input ───────────────────────────────────────────────────────────
  if (!mobile) {
    console.error(`\n${RED}❌ Usage: npx ts-node src/scripts/smsTest.ts <mobile> [test]${RESET}`);
    console.error(`\nTests: all | otp | resend | sms | format | edge\n`);
    process.exit(1);
  }

  const mobile10 = mobile.replace(/\D/g, "").slice(-10);
  if (mobile10.length !== 10 || !/^[6-9]/.test(mobile10)) {
    console.error(`\n${RED}❌ Invalid mobile number: ${mobile}${RESET}`);
    console.error(`   Must be 10 digits starting with 6-9\n`);
    process.exit(1);
  }

  // ── Header ───────────────────────────────────────────────────────────────────
  console.log(`\n${LINE}`);
  console.log(`  ${CYAN}KIDROO SMS TEST MODULE${RESET}`);
  console.log(LINE);
  console.log(`  Mobile  : ${YELLOW}+91${mobile10}${RESET}`);
  console.log(`  Test    : ${YELLOW}${testArg}${RESET}`);
  console.log(`  Time    : ${new Date().toLocaleString("en-IN")}`);
  console.log(`  Env     : ${process.env.NODE_ENV || "development"}`);
  console.log(`  Provider: ${process.env.SMS_PROVIDER || "msg91"}`);
  console.log(LINE);

  // ── Run selected tests ───────────────────────────────────────────────────────
  switch (testArg) {
    case "all":
      await testEnv();
      await testPhoneFormat(mobile10);
      await testOTPSend(mobile10);
      await testOTPResend(mobile10);
      await testDirectMsg91OTP(mobile10);
      await testPlainSMS(mobile10);
      await testPasswordResetOTP(mobile10);
      await testEdgeCases(mobile10);
      break;

    case "otp":
      await testEnv();
      await testOTPSend(mobile10);
      break;

    case "resend":
      await testOTPResend(mobile10);
      break;

    case "direct":
      await testDirectMsg91OTP(mobile10);
      break;

    case "sms":
      await testPlainSMS(mobile10);
      break;

    case "format":
      await testPhoneFormat(mobile10);
      break;

    case "edge":
      await testEdgeCases(mobile10);
      break;

    case "env":
      await testEnv();
      break;

    default:
      warn(`Unknown test "${testArg}". Running all tests.`);
      await testEnv();
      await testPhoneFormat(mobile10);
      await testOTPSend(mobile10);
      await testPlainSMS(mobile10);
      await testEdgeCases(mobile10);
  }

  printSummary();
}

main().catch((err) => {
  console.error(`\n${RED}❌ CRASH: ${err.message}${RESET}\n`);
  process.exit(1);
});
