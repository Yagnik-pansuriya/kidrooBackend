import mongoose from "mongoose";

const dbURL = process.env.DB_URL as string;
if (!dbURL) {
  throw new Error("DB_URL is not defined in environment variables");
}

let retries = 5;

//mongodb event listeners
mongoose.connection.on("connected", () => {
  console.log("MongoDB connection established");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

export const connectDB = async () => {
  try {
    await mongoose.connect(dbURL, {
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  } catch (error) {
    console.error("MongoDB connection ERROR! ==> ", error);

    if (retries > 0) {
      retries--;
      console.log(`Retrying MongoDB connection... attempts left: ${retries}`);
      setTimeout(connectDB, 6000);
    } else {
      console.error("Failed to connect to MongoDB after 5 attempts. Exiting.");
      process.exit(1);
    }
  }
};

export const gracefulShutdown = async () => {
  try {
    console.log("Mongo readyState:", mongoose.connection.readyState);
    console.log("Closing MongoDB connection...");
    await mongoose.connection.close();
    console.log("MongoDB connection closed due to app termination");
    process.exit(0);
  } catch (error) {
    console.error("Error closing MongoDB connection", error);
  }
};
