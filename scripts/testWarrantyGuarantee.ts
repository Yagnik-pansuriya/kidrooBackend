import * as dotenv from "dotenv";

dotenv.config();

const BASE_URL = "http://localhost:5000/api";
let accessToken = "";

async function getAdminToken() {
  console.log("--- Authenticating ---");
  try {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@kidroo.com", password: "Admin@123" }) // Use default seed admin
    });
    
    if (loginRes.ok) {
        const loginData = await loginRes.json();
        console.log("✅ Login Success!");
        accessToken = loginData.data?.tokens?.accessToken || loginData.tokens?.accessToken;
    } else {
        console.log("⚠️ Login failed. Ensure admin@kidroo.com exists.");
    }
  } catch(e) { console.log("🔥 Fetch Login Auth Exception", e); }
}

async function runTests() {
  console.log("🚀 Starting Kidroo API Warranty & Guarantee Tests...\n");
  await getAdminToken();

  if (!accessToken) {
    console.error("❌ Cannot proceed without admin token.");
    return;
  }

  const reqHeaders: any = { 
    "Authorization": `Bearer ${accessToken}`
  };

  const createFormData = (data: any) => {
    const formData = new FormData();
    for (const key in data) {
      if (Array.isArray(data[key]) || typeof data[key] === 'object') {
        formData.append(key, JSON.stringify(data[key]));
      } else {
        formData.append(key, data[key]);
      }
    }
    // Need dummy image file to pass validation
    const blob = new Blob(["test"], { type: "text/plain" });
    formData.append("images", blob, "test.jpg");
    return formData;
  };


  console.log("\n--- 1. Backward Compatibility (No Warranty/Guarantee Data) ---");
  try {
    const fd = createFormData({
      productName: "Test Product Legacy",
      slug: "test-product-legacy-" + Date.now(),
      description: "Legacy product without new fields",
      price: 19.99,
      stock: 10,
      tags: ["test"],
      isActive: true
    });

    const res = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` },
      body: fd
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      console.log(`✅ Passed: Legacy product created.`);
      console.log(`   hasWarranty: ${data.data.hasWarranty}, hasGuarantee: ${data.data.hasGuarantee}`);
      if (data.data.hasWarranty === false && data.data.hasGuarantee === false) {
          console.log(`   ✅ Default values confirmed.`);
      } else {
          console.log(`   ❌ Default values mismatch.`);
      }
    } else {
      console.log(`❌ Failed: Status ${res.status} -`, data.message);
    }
  } catch (e: any) { console.log("Exception:", e.message); }

  console.log("\n--- 2. Create Product with Warranty Only ---");
  try {
    const fd = createFormData({
      productName: "Test Product Warranty",
      slug: "test-product-warranty-" + Date.now(),
      description: "Appliance with warranty",
      price: 49.99,
      stock: 10,
      tags: ["test"],
      isActive: true,
      hasWarranty: true,
      warrantyPeriod: 12,
      warrantyType: "manufacturer"
    });

    const res = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` },
      body: fd
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      console.log(`✅ Passed: Product with warranty created.`);
      console.log(`   hasWarranty: ${data.data.hasWarranty}, warrantyPeriod: ${data.data.warrantyPeriod}, warrantyType: ${data.data.warrantyType}`);
    } else {
      console.log(`❌ Failed: Status ${res.status} -`, data.message);
    }
  } catch (e: any) { console.log("Exception:", e.message); }

  console.log("\n--- 3. Create Product with Guarantee Only ---");
  try {
    const fd = createFormData({
      productName: "Test Product Guarantee",
      slug: "test-product-guarantee-" + Date.now(),
      description: "Item with guarantee",
      price: 29.99,
      stock: 10,
      tags: ["test"],
      isActive: true,
      hasGuarantee: true,
      guaranteePeriod: 30,
      guaranteeTerms: "Money back guarantee"
    });

    const res = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` },
      body: fd
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      console.log(`✅ Passed: Product with guarantee created.`);
      console.log(`   hasGuarantee: ${data.data.hasGuarantee}, guaranteePeriod: ${data.data.guaranteePeriod}`);
    } else {
      console.log(`❌ Failed: Status ${res.status} -`, data.message);
    }
  } catch (e: any) { console.log("Exception:", e.message); }

  console.log("\n--- 4. Create Product with Both Enabled ---");
  try {
    const fd = createFormData({
      productName: "Test Product Both",
      slug: "test-product-both-" + Date.now(),
      description: "Item with both",
      price: 99.99,
      stock: 10,
      tags: ["test"],
      isActive: true,
      hasWarranty: true,
      warrantyPeriod: 24,
      warrantyType: "seller",
      hasGuarantee: true,
      guaranteePeriod: 15
    });

    const res = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` },
      body: fd
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      console.log(`✅ Passed: Product with both created.`);
      console.log(`   Warranty: ${data.data.warrantyPeriod} months ${data.data.warrantyType}`);
      console.log(`   Guarantee: ${data.data.guaranteePeriod} days`);
    } else {
      console.log(`❌ Failed: Status ${res.status} -`, data.message);
    }
  } catch (e: any) { console.log("Exception:", e.message); }


  console.log("\n--- 5. Invalid Inputs (Missing Required Fields) ---");
  try {
    const fd = createFormData({
      productName: "Test Product Invalid",
      slug: "test-product-invalid-" + Date.now(),
      description: "Invalid fields",
      price: 19.99,
      stock: 10,
      tags: ["test"],
      isActive: true,
      hasWarranty: true // Missing period and type
    });

    const res = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` },
      body: fd
    });
    
    const data = await res.json();
    if (res.status === 400 || !res.ok) {
      console.log(`✅ Passed: Correctly rejected invalid data.`);
      console.log(`   Error reported:`, data.message || data.error || data.errors);
    } else {
      console.log(`❌ Failed: System allowed invalid data.`);
    }
  } catch (e: any) { console.log("Exception:", e.message); }
}

runTests();
