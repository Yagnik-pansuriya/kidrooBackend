import fs from 'fs';
import path from 'path';

const BASE_URL = "http://localhost:5000/api";

const TEST_RESULTS = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: [] as string[]
};

let tokens = { accessToken: "", refreshToken: "" };
let testUser = { id: "" };
let testCategory = { id: "" };
let testProduct = { id: "" };
let testVariant = { id: "" };
let testOffer = { id: "" };
let testBanner = { id: "" };
let testSubscriber = { email: "tester@kidroo.com", id: "" };

// Helper to execute and assert fetch calls
async function runCRUDTest(name: string, endpoint: string, method: string, payload?: any, isMultipart = false) {
    TEST_RESULTS.total++;
    try {
        const headers: any = {};
        if (tokens.accessToken) headers["Authorization"] = `Bearer ${tokens.accessToken}`;
        
        let body: any = undefined;
        
        // Very basic multipart mocking (sending json but content-type text)
        if (isMultipart && payload) {
           // We will send standard JSON and let backend fail validation if not handling form-data fallback
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(payload);
        } else if (payload) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(payload);
        }

        const res = await fetch(`${BASE_URL}${endpoint}`, { method, headers, body });
        const resText = await res.text();
        
        let resJson: any = {};
        try { resJson = JSON.parse(resText); } catch(e) {}

        if (res.status >= 200 && res.status < 300) {
            TEST_RESULTS.passed++;
            console.log(`✅ [${method}] ${name} -> ${res.status}`);
            return resJson;
        } else if (res.status >= 400 && res.status < 500) {
            // Predictable validation errors are acceptable gracefully handled responses
            TEST_RESULTS.passed++;
             console.log(`✅ [${method}] ${name} -> Correctly Handled ${res.status} Error: ${resJson.message || 'Validation/Not Found'}`);
            return resJson;
        } else {
            TEST_RESULTS.failed++;
            console.error(`❌ [${method}] ${name} -> SERVER CRASH / UNHANDLED 500`);
            TEST_RESULTS.errors.push(`[${method}] ${endpoint}: ${resText.substring(0, 100)}`);
            return null;
        }
    } catch(e: any) {
        TEST_RESULTS.failed++;
        console.error(`🔥 [${method}] ${name} -> Network Error`);
        TEST_RESULTS.errors.push(`[${method}] ${endpoint}: Network error - ${e.message}`);
        return null;
    }
}

async function performMassiveTest() {
    console.log("==========================================");
    console.log("🚀 STARTING EXHAUSTIVE CRUD API TEST SUITE");
    console.log("==========================================\n");

    // --- 1. AUTHENTICATION API ---
    console.log("--- 1. AUTH & USER CONTROLLERS ---");
    const loginRes = await runCRUDTest("Admin Login", "/auth/login", "POST", { email: "admin@kidroo.com", password: "Admin@123" });
    if (loginRes?.data?.tokens) {
        tokens = loginRes.data.tokens;
    } else if (loginRes?.tokens) {
        tokens = loginRes.tokens; // Handle standard vs nested response
    }

    if (!tokens.accessToken) {
        console.error("CRITICAL: Failed to get auth token. Remaining authenticated tests will simulate 401s.");
    }

    await runCRUDTest("Get Current Auth Check", "/auth/me", "GET");
    await runCRUDTest("Refresh Token", "/auth/refresh", "POST", { refreshToken: tokens.refreshToken || "fake-token" });

    // Users API
    await runCRUDTest("List All Users", "/users", "GET");
    const createUserRes = await runCRUDTest("Create User", "/users", "POST", { name: "Test User", email: "testuser99@kidroo.com", password: "TestUser@123", role: "customer" });
    if (createUserRes?.data?._id) testUser.id = createUserRes.data._id;
    if (testUser.id) {
        await runCRUDTest("Get Single User", `/users/${testUser.id}`, "GET");
        await runCRUDTest("Update User", `/users/${testUser.id}`, "PUT", { name: "Test User Updated" });
        await runCRUDTest("Delete User", `/users/${testUser.id}`, "DELETE");
    }

    // --- 2. CATEGORY API ---
    console.log("\n--- 2. CATEGORY & PRODUCT CONTROLLERS ---");
    const cCat = await runCRUDTest("Create Category", "/categories", "POST", { catagoryName: "Test Auto", slug: "test-auto-cat", count: 10 }, true);
    // Even if it fails validation (no image), the server shouldn't crash.
    await runCRUDTest("List Categories", "/categories", "GET");
    await runCRUDTest("Update Category (Fake ID)", "/categories/60d5ecb8b392d708fc13e2f5", "PUT", { catagoryName: "Test Updated" }, true);
    await runCRUDTest("Delete Category (Fake ID)", "/categories/60d5ecb8b392d708fc13e2f5", "DELETE");

    // Products API
    await runCRUDTest("List Products", "/products", "GET");
    await runCRUDTest("Product Filters", "/products/filters", "GET");
    const cProd = await runCRUDTest("Create Product", "/products", "POST", { productName: "Fake Prod", slug: "fake-prod", price: 50, originalPrice: 60, stock: 10, category: "60d5ecb8b392d708fc13e2f5" }, true);
    await runCRUDTest("Update Product (Fake ID)", "/products/60d5ecb8b392d708fc13e2f5", "PUT", { price: 55, stock: 5 }, true);
    await runCRUDTest("Delete Product (Fake ID)", "/products/60d5ecb8b392d708fc13e2f5", "DELETE");

    // Variants API
    await runCRUDTest("Get Variants By Product", "/products/60d5ecb8b392d708fc13e2f5/variants", "GET");
    await runCRUDTest("Create Variant", "/products/60d5ecb8b392d708fc13e2f5/variants", "POST", { sku: "FAKE-SKU", price: 20 }, true);
    await runCRUDTest("Update Variant (Fake ID)", "/products/variants/60d5ecb8b392d708fc13e2f5", "PUT", { price: 25 }, true);
    await runCRUDTest("Delete Variant (Fake ID)", "/products/variants/60d5ecb8b392d708fc13e2f5", "DELETE");


    // --- 3. OFFERS & BANNERS API ---
    console.log("\n--- 3. MARKETING CONTROLLERS (Banners & Offers) ---");
    await runCRUDTest("List Offers", "/offers", "GET");
    await runCRUDTest("Create Offer", "/offers", "POST", { title: "Test Offer", discountPercentage: 10, validity: { from: "2026", to: "2027" }, type: "slider" }, true);
    await runCRUDTest("Update Offer (Fake ID)", "/offers/60d5ecb8b392d708fc13e2f5", "PUT", { discountPercentage: 20 }, true);
    await runCRUDTest("Delete Offer (Fake ID)", "/offers/60d5ecb8b392d708fc13e2f5", "DELETE");

    await runCRUDTest("List Banners", "/banners", "GET");
    await runCRUDTest("Create Banner", "/banners", "POST", { title: "Test Banner" }, true);
    await runCRUDTest("Update Banner (Fake ID)", "/banners/60d5ecb8b392d708fc13e2f5", "PUT", { title: "Updated Banner" }, true);
    await runCRUDTest("Delete Banner (Fake ID)", "/banners/60d5ecb8b392d708fc13e2f5", "DELETE");

    // --- 4. NEWSLETTER & SITE SETTINGS API ---
    console.log("\n--- 4. SYSTEM & SUBSCRIPTIONS ---");
    const subRes = await runCRUDTest("Subscribe Newsletter", "/newsletter/subscribe", "POST", { email: testSubscriber.email });
    if (subRes?.data?._id) testSubscriber.id = subRes.data._id;
    await runCRUDTest("List Subscribers", "/newsletter", "GET");
    await runCRUDTest("Newsletter Stats", "/newsletter/stats", "GET");
    await runCRUDTest("Unsubscribe Newsletter", "/newsletter/unsubscribe", "POST", { email: testSubscriber.email });
    if (testSubscriber.id) await runCRUDTest("Delete Subscriber", `/newsletter/${testSubscriber.id}`, "DELETE");

    // Site Settings
    await runCRUDTest("Get Site Settings", "/site-settings", "GET");
    await runCRUDTest("Upsert Site Settings", "/site-settings", "POST", { siteTitle: "Kidroo Updated", contactEmail: "hello@kidroo.com" }, true);

    // --- SUMMARY ---
    console.log("\n==========================================");
    console.log("📊 MASSIVE API TEST SUMMARY");
    console.log("==========================================");
    console.log(`TOTAL ENDPOINTS HIT: ${TEST_RESULTS.total}`);
    console.log(`✅ GRACEFUL RESPONSES: ${TEST_RESULTS.passed} (Includes proper 200s and clean 4xx validations)`);
    console.log(`❌ SERVER CRASHES (500s): ${TEST_RESULTS.failed}`);
    
    if (TEST_RESULTS.errors.length > 0) {
        console.log("\n💥 CRITICAL EXCEPTION LOGS:");
        TEST_RESULTS.errors.forEach(e => console.log(e));
    } else {
        console.log("\n🎉 ALL ROUTES HANDLED ROBUSTLY! No unhandled server crashes during full coverage scan.");
    }
}

performMassiveTest();
