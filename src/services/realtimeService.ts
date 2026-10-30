import jwt from "jsonwebtoken";
import Customer from "../models/customer";

/**
 * Live admin notifications through a Mercure hub (https://mercure.rocks).
 *
 * The backend publishes private updates; the admin panel subscribes with a
 * short-lived subscriber JWT from GET /api/admin/realtime/token.
 *
 * Env:
 *   MERCURE_HUB_URL             hub URL the backend publishes to (internal)
 *   MERCURE_PUBLIC_URL          hub URL the browser connects to (defaults to MERCURE_HUB_URL)
 *   MERCURE_PUBLISHER_JWT_KEY   must match the hub's publisher key
 *   MERCURE_SUBSCRIBER_JWT_KEY  must match the hub's subscriber key
 *   MERCURE_TOPIC_BASE          topic namespace (default https://kidroo.in)
 *
 * Publishing is fire-and-forget: a missing or down hub never breaks checkout.
 */

export type RealtimeEvent = "new-order" | "cart-add";

const TOPIC_BASE = (process.env.MERCURE_TOPIC_BASE || "https://kidroo.in").replace(/\/$/, "");

export const REALTIME_TOPICS = {
  orders: `${TOPIC_BASE}/admin/orders`,
  carts: `${TOPIC_BASE}/admin/carts`,
} as const;

const PUBLISH_TIMEOUT_MS = 3000;
const SUBSCRIBER_TOKEN_TTL = "12h";

const hubUrl = () => process.env.MERCURE_HUB_URL || "";

export const isRealtimeEnabled = () =>
  !!(hubUrl() && process.env.MERCURE_PUBLISHER_JWT_KEY && process.env.MERCURE_SUBSCRIBER_JWT_KEY);

let warnedDisabled = false;

// Publisher JWT is reused until shortly before it expires
let publisherToken: { value: string; expiresAt: number } | null = null;

const getPublisherToken = (): string => {
  const now = Date.now();
  if (publisherToken && publisherToken.expiresAt - 60_000 > now) return publisherToken.value;

  const value = jwt.sign(
    { mercure: { publish: Object.values(REALTIME_TOPICS) } },
    process.env.MERCURE_PUBLISHER_JWT_KEY as string,
    { algorithm: "HS256", expiresIn: "1h" },
  );
  publisherToken = { value, expiresAt: now + 60 * 60 * 1000 };
  return value;
};

/**
 * Subscriber JWT for an admin-panel user. Carts are admin-only (same as the
 * Carts page); every staff role gets orders.
 */
export const createSubscriberToken = (role: string) => {
  const topics = role === "admin"
    ? [REALTIME_TOPICS.orders, REALTIME_TOPICS.carts]
    : [REALTIME_TOPICS.orders];

  const token = jwt.sign(
    { mercure: { subscribe: topics } },
    process.env.MERCURE_SUBSCRIBER_JWT_KEY as string,
    { algorithm: "HS256", expiresIn: SUBSCRIBER_TOKEN_TTL },
  );

  return {
    hubUrl: process.env.MERCURE_PUBLIC_URL || hubUrl(),
    topics,
    token,
  };
};

/** Publish a private update. Never throws. */
export const publishRealtime = async (topic: string, type: RealtimeEvent, data: unknown) => {
  if (!isRealtimeEnabled()) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn("[Realtime] Mercure is not configured (MERCURE_* env vars); live admin alerts are disabled.");
    }
    return;
  }

  try {
    const body = new URLSearchParams({
      topic,
      type,
      private: "on",
      data: JSON.stringify({ type, at: new Date().toISOString(), ...(data as object) }),
    });

    const res = await fetch(hubUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getPublisherToken()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[Realtime] Mercure publish failed (${res.status}): ${await res.text().catch(() => "")}`);
    }
  } catch (err: any) {
    console.error("[Realtime] Mercure publish error:", err?.message || err);
  }
};

// ─── Domain events ────────────────────────────────────────────────

const customerName = (customer: any) =>
  customer ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Customer" : "Customer";

export const notifyNewOrder = (order: any) => {
  Customer.findById(order.customer)
    .select("firstName lastName")
    .lean()
    .catch(() => null)
    .then((customer) =>
      publishRealtime(REALTIME_TOPICS.orders, "new-order", {
        order: {
          _id: String(order._id),
          orderId: order.orderId,
          netAmount: order.netAmount,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          itemCount: (order.items || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0),
          city: order.shippingAddress?.city || "",
        },
        customer: {
          _id: String(order.customer),
          name: customer ? customerName(customer) : order.shippingAddress?.fullName || "Customer",
        },
      }),
    );
};

export const notifyCartAdd = (
  customer: any,
  added: { name: string; quantity: number; price: number }[],
  cartTotal: number,
) => {
  void publishRealtime(REALTIME_TOPICS.carts, "cart-add", {
    customer: { _id: String(customer._id), name: customerName(customer), mobile: customer.mobile || "" },
    added,
    cartTotal,
  });
};
