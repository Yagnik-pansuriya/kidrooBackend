const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "http://localhost:5000/api";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@kidroo.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";
const FIXTURE_PATH = path.join(__dirname, "assets", "product-test-image.svg");

const state = {
  accessToken: "",
  categoryId: "",
  createdCategory: false,
  productId: "",
  variantId: "",
};

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${state.accessToken}`,
    ...extra,
  };
}

async function expectJson(response, expectedStatuses, step) {
  const raw = await response.text();
  let json = null;

  try {
    json = raw ? JSON.parse(raw) : null;
  } catch (error) {
    throw new Error(`${step} returned non-JSON response (${response.status}): ${raw.slice(0, 200)}`);
  }

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${step} failed with status ${response.status}: ${json?.message || raw.slice(0, 200)}`,
    );
  }

  return json;
}

async function requestJson(step, url, options = {}, expectedStatuses = [200]) {
  try {
    const response = await fetch(url, options);
    return expectJson(response, expectedStatuses, step);
  } catch (error) {
    if (error && error.name === "TypeError") {
      throw new Error(
        `${step} could not reach ${url}. Make sure the backend is running and BASE_URL is correct.`,
      );
    }
    throw error;
  }
}

function makeImageFile(name = "product-test-image.svg") {
  const content = fs.readFileSync(FIXTURE_PATH);
  return new File([content], name, { type: "image/svg+xml" });
}

function makeProductForm(overrides = {}) {
  const slug = overrides.slug || `api-test-${Date.now()}`;
  const form = new FormData();

  const fields = {
    productName: "API Test Product",
    slug,
    description: "End-to-end product API test payload",
    price: "129.99",
    originalPrice: "159.99",
    stock: "8",
    categories: state.categoryId,
    featured: "true",
    newArrival: "false",
    bestSeller: "false",
    isActive: "true",
    hasVariants: "true",
    ageRange: JSON.stringify({ from: 5, to: 10 }),
    tags: JSON.stringify(["api-test", "backend", "toy"]),
    youtubeUrl: "https://example.com/demo",
    hasWarranty: "true",
    warrantyPeriod: "12",
    warrantyType: "manufacturer",
    hasGuarantee: "true",
    guaranteePeriod: "7",
    guaranteeTerms: "Replacement for manufacturing defects",
    ...overrides,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      form.append(key, value);
    }
  }

  form.append("images", makeImageFile());
  return form;
}

function makeVariantForm(overrides = {}) {
  const form = new FormData();
  const fields = {
    sku: `API-VAR-${Date.now()}`,
    barcode: `${Date.now()}`,
    attributes: JSON.stringify({ Color: "Blue", Edition: "API" }),
    price: "139.99",
    originalPrice: "169.99",
    stock: "4",
    lowStockAlert: "1",
    weight: "250",
    dimensions: JSON.stringify({ length: 10, width: 5, height: 4 }),
    status: "active",
    isDefault: "false",
    youtubeUrl: "https://example.com/variant-demo",
    ...overrides,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      form.append(key, value);
    }
  }

  form.append("images", makeImageFile("variant-test-image.svg"));
  return form;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureServerReady() {
  const healthUrl = BASE_URL.replace(/\/api\/?$/, "") + "/health";

  try {
    const response = await fetch(healthUrl);
    const json = await expectJson(response, [200], "Health check");
    assert(json?.status === "ok", "Health check did not return status ok");
    console.log(`PASS Health check (${healthUrl})`);
  } catch (error) {
    throw new Error(
      `Backend is not reachable at ${BASE_URL}. Start the API first, then rerun this test.\n` +
      `Try: npm run build && node dist/index.js`,
    );
  }
}

async function login() {
  const body = JSON.stringify({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  const json = await requestJson(
    "Admin login",
    `${BASE_URL}/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
    [200],
  );

  state.accessToken = json?.data?.accessToken || "";
  assert(state.accessToken, "Login did not return an access token");
  console.log("PASS Admin login");
}

async function provisionCategory() {
  const slug = `api-test-category-${Date.now()}`;
  const form = new FormData();
  form.append("catagoryName", `API Test Category ${Date.now()}`);
  form.append("slug", slug);
  form.append("count", "0");
  form.append("image", makeImageFile("category-image.svg"));
  form.append("icon", makeImageFile("category-icon.svg"));

  const json = await requestJson(
    "Create category fixture",
    `${BASE_URL}/categories`,
    {
      method: "POST",
      headers: authHeaders(),
      body: form,
    },
    [201],
  );

  state.categoryId = json?.data?._id;
  state.createdCategory = true;
  assert(state.categoryId, "Category fixture was not created");
  console.log(`PASS Create category fixture (${state.categoryId})`);
}

async function createProduct() {
  const form = makeProductForm();
  const json = await requestJson(
    "Create product",
    `${BASE_URL}/products`,
    {
      method: "POST",
      headers: authHeaders(),
      body: form,
    },
    [201],
  );

  state.productId = json?.data?._id;
  assert(state.productId, "Create product did not return product id");
  assert(Array.isArray(json?.data?.variants) && json.data.variants.length > 0, "Created product is missing auto-created default variant");
  console.log(`PASS Create product (${state.productId})`);
}

async function verifyCreatedProduct() {
  const json = await requestJson(
    "Get product by id after create",
    `${BASE_URL}/products/${state.productId}`,
    {},
    [200],
  );

  const product = json?.data;
  assert(product?.slug, "Fetched product is missing slug");
  assert(Array.isArray(product?.categories) && product.categories.length > 0, "Fetched product is missing categories array");
  console.log("PASS Verify created product");
}

async function createVariant() {
  const form = makeVariantForm();
  const json = await requestJson(
    "Create variant",
    `${BASE_URL}/products/${state.productId}/variants`,
    {
      method: "POST",
      headers: authHeaders(),
      body: form,
    },
    [201],
  );

  state.variantId = json?.data?._id;
  assert(state.variantId, "Create variant did not return variant id");
  console.log(`PASS Create variant (${state.variantId})`);
}

async function updateVariant() {
  const form = new FormData();
  form.append("price", "149.99");
  form.append("stock", "6");
  form.append("attributes", JSON.stringify({ Color: "Green", Edition: "Updated API" }));
  form.append("existingImages", JSON.stringify([]));
  form.append("images", makeImageFile("variant-update-image.svg"));

  const json = await requestJson(
    "Update variant",
    `${BASE_URL}/products/variants/${state.variantId}`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: form,
    },
    [200],
  );

  assert(json?.data?.price === 149.99, "Variant update did not persist price");
  assert(json?.data?.stock === 6, "Variant update did not persist stock");
  console.log("PASS Update variant");
}

async function verifyVariantListing() {
  const json = await requestJson(
    "List variants by product",
    `${BASE_URL}/products/${state.productId}/variants`,
    {},
    [200],
  );

  const variant = (json?.data || []).find((item) => item._id === state.variantId);
  assert(variant, "Created variant not found in variant listing");
  console.log("PASS Verify variant listing");
}

async function updateProduct() {
  const form = new FormData();
  form.append("productName", "API Test Product Updated");
  form.append("price", "119.99");
  form.append("originalPrice", "149.99");
  form.append("stock", "5");
  form.append("categories", state.categoryId);
  form.append("featured", "false");
  form.append("newArrival", "true");
  form.append("bestSeller", "true");
  form.append("tags", JSON.stringify(["api-test", "updated"]));
  form.append("ageRange", JSON.stringify({ from: 6, to: 12 }));

  const json = await requestJson(
    "Update product",
    `${BASE_URL}/products/${state.productId}`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: form,
    },
    [200],
  );

  assert(json?.data?.productName === "API Test Product Updated", "Product update did not persist productName");
  console.log("PASS Update product");
}

async function verifyUpdatedProduct() {
  const json = await requestJson(
    "Get product by id after update",
    `${BASE_URL}/products/${state.productId}`,
    {},
    [200],
  );

  const product = json?.data;
  assert(product?.productName === "API Test Product Updated", "Fetched product does not contain updated name");
  const updatedVariant = (product?.variants || []).find((item) => item._id === state.variantId);
  assert(updatedVariant?.price === 149.99, "Updated variant data missing from product details");
  console.log("PASS Verify updated product");
}

async function reorderProducts() {
  const body = JSON.stringify({
    items: [{ id: state.productId, position: 999 }],
  });

  await requestJson(
    "Reorder products",
    `${BASE_URL}/products/reorder`,
    {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body,
    },
    [200],
  );

  console.log("PASS Reorder products");
}

async function deleteVariant() {
  if (!state.variantId) return;

  await requestJson(
    "Delete variant",
    `${BASE_URL}/products/variants/${state.variantId}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
    [200],
  );

  console.log("PASS Delete variant");
  state.variantId = "";
}

async function deleteProduct() {
  if (!state.productId) return;

  await requestJson(
    "Delete product",
    `${BASE_URL}/products/${state.productId}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
    [200],
  );

  console.log("PASS Delete product");
  state.productId = "";
}

async function deleteCategory() {
  if (!state.categoryId || !state.createdCategory) return;

  await requestJson(
    "Delete category fixture",
    `${BASE_URL}/categories/${state.categoryId}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
    [200],
  );

  console.log("PASS Delete category fixture");
  state.categoryId = "";
  state.createdCategory = false;
}

async function verifyDeletion() {
  const response = await fetch(`${BASE_URL}/products/${state.productId}`);
  await expectJson(response, [404], "Verify product deletion");
  console.log("PASS Verify product deletion");
}

async function cleanup() {
  try {
    await deleteVariant();
  } catch (error) {
    console.warn(`WARN Cleanup variant failed: ${error.message}`);
  }

  try {
    await deleteProduct();
  } catch (error) {
    console.warn(`WARN Cleanup product failed: ${error.message}`);
  }

  try {
    await deleteCategory();
  } catch (error) {
    console.warn(`WARN Cleanup category failed: ${error.message}`);
  }
}

async function main() {
  try {
    await ensureServerReady();
    await login();
    await provisionCategory();
    await createProduct();
    await verifyCreatedProduct();
    await createVariant();
    await updateVariant();
    await verifyVariantListing();
    await updateProduct();
    await verifyUpdatedProduct();
    await reorderProducts();
    const deletedProductId = state.productId;
    await deleteVariant();
    await deleteProduct();
    await deleteCategory();
    state.productId = deletedProductId;
    await verifyDeletion();
    console.log("\nPASS Product API end-to-end flow completed successfully");
  } catch (error) {
    console.error(`\nFAIL ${error.message}`);
    await cleanup();
    process.exitCode = 1;
  }
}

main();
