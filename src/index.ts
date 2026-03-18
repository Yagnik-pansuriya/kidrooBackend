import dotenv from "dotenv";
dotenv.config();
import { connectDB, gracefulShutdown } from "./config/db";
import app, { getActiveRequests } from "./app";
import http from "http";

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const startServer = async () => {
  await connectDB();

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();

const shutdown = (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  console.log(`Active requests: ${getActiveRequests()}`);

  server.close(async () => {
    console.log("HTTP server closed");

    await gracefulShutdown();

    console.log("Shutdown complete");

    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGUSR2", shutdown);
