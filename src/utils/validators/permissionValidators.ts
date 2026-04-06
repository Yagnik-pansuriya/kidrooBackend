import { z } from "zod";

export const permissionSchema = z.object({
  body: z.object({
    permissions: z.array(
      z.object({
        route: z.string().min(1, "Route is required"),
        label: z.string().min(1, "Label is required"),
        visible: z.boolean(),
        enabled: z.boolean(),
      })
    ).min(1, "At least one permission is required"),
  }),
});

export const checkAccessSchema = z.object({
  body: z.object({
    userId: z.string().min(1, "User ID is required"),
    route: z.string().min(1, "Route is required"),
  }),
});
