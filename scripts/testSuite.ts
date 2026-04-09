// Kidroo Custom API Automation Tester
const BASE_URL = "http://localhost:5000/api";
let accessToken = "";
let categoryId = "";
let productId = "";

async function runTests() {
  console.log("🚀 Starting Kidroo API Security & Functionality Tests...\n");

  // 1. Auth Test (Assuming seed admin user)
  console.log("--- 1. Auth & Login ---");
  try {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@kidroo.com", password: "Admin@123" })
    });
    
    if (loginRes.ok) {
        const loginData = await loginRes.json();
        console.log("✅ Login Success!");
        accessToken = loginData.data?.tokens?.accessToken || loginData.tokens?.accessToken;
    } else {
        console.log("⚠️ Login failed. Response:", await loginRes.text());
    }
  } catch(e) { console.log("🔥 Fetch Login Auth Exception", e); }

  console.log("\n--- 2. Public Endpoints Verification ---");
  const publicRoutes = [
    { name: "Products", url: "/products" },
    { name: "Categories", url: "/categories" },
    { name: "Settings", url: "/settings" },
    { name: "Offers", url: "/offers" },
    { name: "Banners", url: "/banners" }
  ];

  for(const route of publicRoutes) {
      try {
        const res = await fetch(`${BASE_URL}${route.url}`);
        const data = await res.json();
        if(res.ok && data.success) {
            console.log(`✅ GET ${route.url} - OK (${data.data?.length || 'Object'} items)`);
            // Store reference IDs for later DB Relation tests
            if (route.name === "Products" && data.data?.length > 0) {
                productId = data.data[0]._id;
                console.log(`     -> Found a sample product to test DB Relations: ${productId}`);
                if (data.data[0].category) console.log(`     -> Populated Category check PASSED.`);
                if (data.data[0].variants && data.data[0].variants.length > 0) console.log(`     -> Populated Variants check PASSED.`);
            }
        } else {
            console.log(`❌ GET ${route.url} FAILED (Status: ${res.status}) -`, data.message);
        }
      } catch(e) {
          console.log(`🔥 GET ${route.url} Exception - API Unreachable`);
      }
  }

  console.log("\n--- 3. Validation Logic Constraints Check (Error Simulation) ---");
  try {
      // Trying to create a product without required fields using the auth token
      const reqHeaders: any = { "Content-Type": "application/json" };
      if (accessToken) reqHeaders["Authorization"] = `Bearer ${accessToken}`;

      const res = await fetch(`${BASE_URL}/products`, {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify({
             // Intentionally missing productName, slug, etc. 
             price: "not-a-number", // Bad type casting check
             stock: "0"
          })
      });
      const resJson = await res.json();
      if(res.status === 400 || res.status === 401 || res.status === 403 || res.status === 500) {
          let errorType = res.status === 500 ? "⚠️ INTERNAL SERVER CRASH" : "✅ Clean API Error Response";
          console.log(`${errorType} on /products (Status: ${res.status}): ${resJson.message}`);
      } else {
          console.log(`❌ Missing Validation! Product API wrongly accepted missing schema! Status: ${res.status}`);
      }
  } catch(e) {}

  console.log("\n--- 4. Database Relation Retrieval Deep Dive ---");
  if (productId) {
     try {
         const singleProdRes = await fetch(`${BASE_URL}/products/${productId}`);
         const prodData = await singleProdRes.json();
         if (prodData.success) {
             const pd = prodData.data;
             console.log(`✅ Single Product Fetched: ${pd.productName}`);
             console.log(`   - Populated Category Reference: typeof string/object -> ${typeof pd.category === 'object' ? '✅ Full Nested Object' : '❌ Just ID string'}`);
             console.log(`   - Variants Linkage: ${pd.variants?.length ? `✅ Contains ${pd.variants.length} variant document(s)` : '⚠️ No variants attached'}`);
         }
     } catch(e) {}
  } else {
      console.log("⚠️ No product ID available to test detail deep dive check.");
  }
}

runTests();
