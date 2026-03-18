import express from "express";
import helmet, { xssFilter } from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import mongoSanitize from "express-mongo-sanitize";
import pinoHttp from "pino-http";
import { v4 as uuidv4 } from "uuid";
import { globalErrorHandler } from "./middlewares/globle.middleware";

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use(hpp());

app.use(mongoSanitize());

app.use(xssFilter());

app.use(compression());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

app.use(
  pinoHttp({
    level: "info",
  })
);

let activeRequests = 0;

app.use((req, res, next) => {
  activeRequests++;

  res.on("finish", () => {
    activeRequests--;
  });

  next();
});

export const getActiveRequests = () => activeRequests;

app.use((req, res, next) => {
  req.headers["x-request-id"] = uuidv4();
  next();
});

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));


app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the Redis Integrations API!",
  });
});


app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});
app.use(globalErrorHandler);

export default app;