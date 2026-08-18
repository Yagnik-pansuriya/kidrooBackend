const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

export interface IShiprocketCourier {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  cod: number;
  etd: string;
  rating: number;
}

class ShiprocketService {
  private token: string | null = null;
  private tokenExpiry: number = 0; // Timestamp in milliseconds

  /**
   * Validate Shiprocket credentials.
   * Throws if they are not set or are default placeholders.
   */
  private validateCredentials(): { email: string; password: string } {
    const email = (process.env.SHIPROCKET_EMAIL || "").replace(/"/g, "").trim();
    const password = (process.env.SHIPROCKET_PASSWORD || "").replace(/"/g, "").trim();

    if (!email || !password || email.includes("your_") || password.includes("your_")) {
      throw new Error("Shiprocket credentials are not configured or are placeholder values in env variables.");
    }
    return { email, password };
  }

  /**
   * Authenticate and get JWT Token from Shiprocket.
   * Caches token in memory to avoid login limit throttling.
   */
  async getAuthToken(): Promise<string> {
    // Check if token exists and is valid (with 5-minute buffer)
    const now = Date.now();
    if (this.token && this.tokenExpiry > now + 300000) {
      return this.token;
    }

    const { email, password } = this.validateCredentials();

    try {
      console.log("[Shiprocket] Authenticating with Shiprocket API...");
      const response = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        let msg = `Authentication failed with status ${response.status}`;
        if (response.status === 401 || response.status === 403) {
          msg += ". Please verify that your SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in .env are correct and correspond to a dedicated 'API User' (created under Settings -> API in the Shiprocket dashboard), NOT your main account login credentials.";
        }
        throw new Error(msg);
      }

      const data = await response.json();
      if (!data.token) {
        throw new Error("Token not found in login response");
      }

      this.token = data.token;
      // Tokens are valid for 10 days (240 hours). We set cache to 9 days to be safe.
      this.tokenExpiry = now + 9 * 24 * 60 * 60 * 1000;
      console.log("[Shiprocket] Token generated successfully.");
      return data.token;
    } catch (err: any) {
      console.error("[Shiprocket] Login Error:", err.message);
      throw new Error(`Shiprocket Authentication failed: ${err.message}`);
    }
  }

  /**
   * Helper to perform authorized fetch calls.
   */
  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const token = await this.getAuthToken();

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    };

    const response = await fetch(`${SHIPROCKET_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token might have expired, invalidate cached token and retry once
      this.token = null;
      const newToken = await this.getAuthToken();
      headers.Authorization = `Bearer ${newToken}`;
      const retryResponse = await fetch(`${SHIPROCKET_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });
      if (!retryResponse.ok) {
        const errBody = await retryResponse.text().catch(() => "");
        throw new Error(`Shiprocket API error (retry): ${retryResponse.statusText} (${retryResponse.status}) - ${errBody}`);
      }
      return retryResponse.json();
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Shiprocket API error: ${response.statusText} (${response.status}) - ${errBody}`);
    }

    return response.json();
  }

  /**
   * Check Courier Serviceability for delivery pincode.
   */
  async checkServiceability(
    deliveryPincode: string,
    weight: number = 0.5,
    cod: boolean = false
  ): Promise<IShiprocketCourier[]> {
    try {
      const codVal = cod ? 1 : 0;
      const pickupPincode = (process.env.SHIPROCKET_PICKUP_PINCODE || "395006").replace(/"/g, "").trim();
      const data = await this.request(
        `/courier/serviceability?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=${weight}&cod=${codVal}`,
        { method: "GET" }
      );

      if (data && data.status === 200 && data.data && data.data.available_courier_companies) {
        return data.data.available_courier_companies
          .map((c: any) => ({
            courier_company_id: c.courier_company_id,
            courier_name: c.courier_name,
            rate: Number(c.rate || 0),
            cod: Number(c.cod_charges || 0),
            etd: c.etd || "",
            rating: Number(c.courier_rating || 0),
          }))
          .filter(
            (c: IShiprocketCourier) =>
              c.courier_name.trim().toLowerCase() !== "xpressbees surface"
          );
      }
      throw new Error(`Invalid serviceability data returned: ${JSON.stringify(data)}`);
    } catch (err: any) {
      console.error("[Shiprocket] Serviceability Error:", err.message);
      throw err;
    }
  }

  /**
   * Create an adhoc order inside Shiprocket.
   */
  async createOrder(orderData: {
    order_id: string;
    order_date: string;
    pickup_location?: string;
    billing_customer_name: string;
    billing_last_name: string;
    billing_address: string;
    billing_city: string;
    billing_pincode: string;
    billing_state: string;
    billing_country: string;
    billing_email: string;
    billing_phone: string;
    shipping_is_billing: boolean;
    order_items: {
      name: string;
      sku: string;
      units: number;
      selling_price: number;
    }[];
    payment_method: "Prepaid" | "COD";
    sub_total: number;
    shipping_charges: number;
    total_discount?: number;
    weight: number;
    length: number;
    width: number;
    height: number;
  }): Promise<{ shiprocketOrderId: string; shipmentId: string } | null> {
    try {
      const payload = {
        ...orderData,
        pickup_location: orderData.pickup_location || "Primary Warehouse",
      };

      const response = await this.request("/orders/create/adhoc", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (response && response.order_id) {
        return {
          shiprocketOrderId: response.order_id.toString(),
          shipmentId: response.shipment_id.toString(),
        };
      }
      throw new Error(`Order creation failed. Invalid response: ${JSON.stringify(response)}`);
    } catch (err: any) {
      console.error("[Shiprocket] Create Order Error:", err.message);
      throw err;
    }
  }

  /**
   * Assign an AWB number to a shipment.
   */
  async assignAwb(shipmentId: string, courierId?: number): Promise<{ awbNumber: string; courierName: string } | null> {
    try {
      const body: any = { shipment_id: Number(shipmentId) };
      if (courierId) {
        body.courier_id = courierId;
      }

      const response = await this.request("/courier/assign/awb", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (response && response.status === 200 && response.response?.data) {
        const d = response.response.data;
        return {
          awbNumber: d.awb_code,
          courierName: d.courier_name || "",
        };
      }
      throw new Error(`AWB assignment failed. Invalid response: ${JSON.stringify(response)}`);
    } catch (err: any) {
      console.error("[Shiprocket] AWB Assignment Error:", err.message);
      throw err;
    }
  }

  /**
   * Schedule courier pickup.
   */
  async schedulePickup(shipmentId: string): Promise<boolean> {
    try {
      const response = await this.request("/courier/generate/pickup", {
        method: "POST",
        body: JSON.stringify({
          shipment_id: [Number(shipmentId)],
        }),
      });
      if (response && response.pickup_status === 1) {
        return true;
      }
      throw new Error(`Schedule pickup failed. Response: ${JSON.stringify(response)}`);
    } catch (err: any) {
      console.error("[Shiprocket] Schedule Pickup Error:", err.message);
      throw err;
    }
  }

  /**
   * Generate Shipping Label PDF.
   */
  async generateLabel(shipmentId: string): Promise<string | null> {
    try {
      const response = await this.request("/courier/generate/label", {
        method: "POST",
        body: JSON.stringify({
          shipment_id: [Number(shipmentId)],
        }),
      });
      if (response?.label_created === 1 && response.label_url) {
        return response.label_url;
      }
      throw new Error(`Label generation failed. Response: ${JSON.stringify(response)}`);
    } catch (err: any) {
      console.error("[Shiprocket] Label Generation Error:", err.message);
      throw err;
    }
  }

  /**
   * Generate Manifest PDF.
   */
  async generateManifest(shipmentId: string): Promise<string | null> {
    try {
      const response = await this.request("/manifests/generate", {
        method: "POST",
        body: JSON.stringify({
          shipment_ids: [Number(shipmentId)],
        }),
      });
      if (response?.status === 1 && response.manifest_url) {
        return response.manifest_url;
      }
      throw new Error(`Manifest generation failed. Response: ${JSON.stringify(response)}`);
    } catch (err: any) {
      console.error("[Shiprocket] Manifest Generation Error:", err.message);
      throw err;
    }
  }

  /**
   * Generate Invoice PDF.
   */
  async generateInvoice(orderId: string): Promise<string | null> {
    try {
      const response = await this.request("/orders/print/invoice", {
        method: "POST",
        body: JSON.stringify({
          ids: [Number(orderId)],
        }),
      });
      if (response?.is_invoice_created === 1 && response.invoice_url) {
        return response.invoice_url;
      }
      throw new Error(`Invoice generation failed. Response: ${JSON.stringify(response)}`);
    } catch (err: any) {
      console.error("[Shiprocket] Invoice Generation Error:", err.message);
      throw err;
    }
  }

  /**
   * Track Shipment in real-time.
   */
  async trackShipment(awbNumber: string): Promise<any> {
    try {
      const response = await this.request(`/courier/track/awb/${awbNumber}`, {
        method: "GET",
      });
      if (response && response.tracking_data) {
        const tr = response.tracking_data;
        const details = tr.shipment_track_activities || [];
        return {
          status: tr.shipment_status || "Pending",
          awb: awbNumber,
          courier: tr.courier_name || "",
          history: details.map((h: any) => ({
            status: h.status || "",
            location: h.location || "",
            date: h.date || "",
            activity: h.activity || "",
            done: true,
          })),
        };
      }
      throw new Error(`Tracking data not found for AWB: ${awbNumber}. Response: ${JSON.stringify(response)}`);
    } catch (err: any) {
      console.error("[Shiprocket] Tracking Error:", err.message);
      throw err;
    }
  }

  /**
   * Cancel an order.
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const response = await this.request("/orders/cancel", {
        method: "POST",
        body: JSON.stringify({
          ids: [Number(orderId)],
        }),
      });
      if (response && response.status_code === 200) {
        return true;
      }
      throw new Error(`Order cancellation failed. Response: ${JSON.stringify(response)}`);
    } catch (err: any) {
      console.error("[Shiprocket] Cancel Order Error:", err.message);
      throw err;
    }
  }
}

export const shiprocketService = new ShiprocketService();
