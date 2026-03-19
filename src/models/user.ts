import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { hashPassword, comparePassword } from "../utils/password";

interface IUser extends mongoose.Document {
  name: string;
  userName: string;
  email: string;
  password: string;
  role: string;
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [3, "Name must be at least 3 characters"],
    },
    userName: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Invalid email format",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Don't return password by default
    },
    role: {
      type: String,
      enum: ["user", "admin", "moderator"],
      default: "user",
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre<IUser>("save", async function () {
  // Only hash if password was modified
  if (!this.isModified("password")) {
    return;
  }

  try {
    const hashedPassword = await hashPassword(this.password);
    this.password = hashedPassword;
  } catch (error: any) {
    throw error;
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  try {
    // Ensure password field exists
    if (!this.password) {
      console.error("Password field not found on user document");
      return false;
    }

    // Ensure candidate password is provided
    if (!candidatePassword) {
      console.error("Candidate password not provided");
      return false;
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    return isMatch;
  } catch (error: any) {
    console.error("Password comparison error:", error.message);
    return false;
  }
};

// Override toJSON to exclude password
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const User = mongoose.model<IUser>("User", userSchema);

export default User;
