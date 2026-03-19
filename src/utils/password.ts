import bcrypt from "bcryptjs";
import AppError from "./appError";

/**
 * Hash password using bcrypt
 * @param password - Plain text password
 * @param saltRounds - Number of salt rounds (default: 10)
 * @returns Hashed password
 */
export const hashPassword = async (
  password: string,
  saltRounds: number = 10,
): Promise<string> => {
  try {
    // Validate password strength
    if (password.length < 8) {
      throw new AppError("Password must be at least 8 characters long", 400);
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`Error hashing password: ${error.message}`, 500);
  }
};

/**
 * Compare plain text password with hashed password
 * @param plainPassword - Plain text password to compare
 * @param hashedPassword - Hashed password from database
 * @returns True if passwords match, false otherwise
 */
export const comparePassword = async (
  plainPassword: string,
  hashedPassword: string,
): Promise<boolean> => {
  try {
    if (!plainPassword || !hashedPassword) {
      return false;
    }

    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error: any) {
    throw new AppError(`Error comparing passwords: ${error.message}`, 500);
  }
};

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns Object with validation status and error messages
 */
export const validatePasswordStrength = (password: string) => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[!@#$%^&*]/.test(password)) {
    errors.push(
      "Password must contain at least one special character (!@#$%^&*)",
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
