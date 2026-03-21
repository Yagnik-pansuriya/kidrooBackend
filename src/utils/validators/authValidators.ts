import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password cannot be empty"),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password cannot be empty"),
    newPassword: z.string().min(8, "Password must be at least 8 characters long"),
    passwordConfirm: z.string().min(8, "Password must be at least 8 characters long"),
  }).refine((data) => data.newPassword === data.passwordConfirm, {
    message: "New password and confirm password do not match",
    path: ["passwordConfirm"],
  }),
});
