import { z } from "zod";

export const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(3, "Name must be at least 3 characters"),
    userName: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email("Invalid email format"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    role: z.enum(["user", "admin", "moderator"]).default("user"),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    name: z.string().min(3, "Name must be at least 3 characters").optional(),
    userName: z.string().min(3, "Username must be at least 3 characters").optional(),
    email: z.string().email("Invalid email format").optional(),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
    role: z.enum(["user", "admin", "moderator"]).optional(),
  }),
});
