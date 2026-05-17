/**
 * Converts a string into a URL-friendly slug.
 * - Converts to lowercase
 * - Replaces spaces and underscores with hyphens
 * - Removes all non-alphanumeric characters (except hyphens)
 * - Collapses multiple consecutive hyphens into one
 * - Trims leading/trailing hyphens
 *
 * Examples:
 *   "Soft Toy"           → "soft-toy"
 *   "Eaque libero elit u" → "eaque-libero-elit-u"
 *   "Hello--World!"      → "hello-world"
 *   "  LED Lights & Décor " → "led-lights-decor"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")          // Replace spaces and underscores with hyphens
    .replace(/[^\w-]+/g, "")          // Remove all non-word chars (except hyphens)
    .replace(/--+/g, "-")             // Collapse multiple hyphens
    .replace(/^-+/, "")               // Trim leading hyphens
    .replace(/-+$/, "");              // Trim trailing hyphens
}
