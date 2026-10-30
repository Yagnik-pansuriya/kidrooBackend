// The store runs on Indian time; dates entered by the admin and day buckets in charts use IST.
export const STORE_TZ = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

/** YYYY-MM-DD for the given instant in IST */
export const istDayKey = (d: Date = new Date()) =>
  d.toLocaleDateString("en-CA", { timeZone: STORE_TZ });

/**
 * Parse an admin-entered offer date.
 * A bare date ("2026-11-30") means the start of that day for `from`, and the end of it for `to`,
 * so an offer "valid until 30 Nov" stays live all of 30 Nov in India.
 * Datetime strings without a zone ("2026-11-30T18:00") are read as IST.
 */
export const parseOfferDate = (value: unknown, edge: "start" | "end"): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  let iso = v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    iso = `${v}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}${IST_OFFSET}`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) {
    iso = `${v}${IST_OFFSET}`;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
