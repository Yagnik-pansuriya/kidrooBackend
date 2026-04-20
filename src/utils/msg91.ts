import https from "https";
import AppError from "./appError";
import { normalizeToE164 } from "./twilio";

const postJson = (url: string, payload: unknown, headers: Record<string, string>) =>
  new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const data = JSON.stringify(payload);
    const request = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 500,
            body,
          });
        });
      }
    );

    request.on("error", reject);
    request.write(data);
    request.end();
  });

const getIndianMobile = (mobile: string): string => normalizeToE164(mobile).replace(/^\+91/, "");

export const sendMsg91SMS = async (to: string, body: string): Promise<void> => {
  const authKey = process.env.MSG91_AUTH_KEY;
  const senderId = process.env.MSG91_SENDER_ID;
  const route = process.env.MSG91_ROUTE || "4";
  const country = process.env.MSG91_COUNTRY || "91";
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const entityId = process.env.MSG91_ENTITY_ID;
  const mobile = getIndianMobile(to);

  if (!authKey || !senderId) {
    throw new AppError(
      "MSG91 is not configured. Set MSG91_AUTH_KEY and MSG91_SENDER_ID.",
      500
    );
  }

  const payload: Record<string, unknown> = {
    sender: senderId,
    route,
    country,
    sms: [
      {
        message: body,
        to: [mobile],
      },
    ],
  };

  if (templateId) {
    payload.DLT_TE_ID = templateId;
  }

  if (entityId) {
    payload.DLT_PE_ID = entityId;
  }

  try {
    const response = await postJson(`https://api.msg91.com/api/v2/sendsms?country=${country}`, payload, {
      authkey: authKey,
    });

    if (response.statusCode >= 400) {
      throw new AppError(
        `MSG91 request failed with status ${response.statusCode}: ${response.body || "Unknown MSG91 error"}`,
        500
      );
    }
  } catch (err: any) {
    if (err instanceof AppError) {
      throw err;
    }

    throw new AppError(
      `Failed to send SMS: ${err.message ?? "Unknown MSG91 error"}`,
      500
    );
  }
};
