import express from "express";
import helmet, { xssFilter } from "helmet";
import cors from "cors";
import compression from "compression";
import hpp from "hpp";
import pinoHttp from "pino-http";
import { v4 as uuidv4 } from "uuid";
import cookieParser from "cookie-parser";
import { globalErrorHandler } from "./middlewares/globle.middleware";
import { limiter } from "./middlewares/rateLimiter";
import authRoutes from "./routes/authRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import swaggerRoutes from "./routes/swaggerRoutes";
import indexRoutes from "./routes/index";

const app = express();

app.disable("x-powered-by");

// **** Environment-based configuration ****
const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV === "development";

// Security: helmet configuration
app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
          },
        }
      : true,
    hsts: isProduction
      ? {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        }
      : undefined,
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// CORS: Restrict origins to trusted domains only
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [
      "http://localhost:3000",
      "http://localhost:5000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5000",
    ];

app.use(
  cors({
    origin: function (origin, callback) {
      // In development, allow all origins
      if (!isProduction) {
        callback(null, true);
        return;
      }
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS policy: Origin not allowed"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    maxAge: 86400, // 24 hours
  }),
);

app.use(hpp());

app.use((req, res, next) => {
  // Only sanitize JSON body payloads — multipart/form-data is parsed by Multer
  // and the raw string fields (like attributes JSON) must reach controllers intact.
  const ct = req.headers["content-type"] || "";
  if (!ct.includes("application/json")) return next();

  const sanitizeValue = (value: any): any => {
    if (typeof value === "string") {
      return value.replace(/\$/g, "_").replace(/\./g, "_");
    }
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      }
      const sanitized: any = {};
      for (const key in value) {
        const sanitizedKey = key.replace(/[\$.]/g, "_");
        sanitized[sanitizedKey] = sanitizeValue(value[key]);
      }
      return sanitized;
    }
    return value;
  };

  if (req.body) req.body = sanitizeValue(req.body);
  next();
});

app.use(xssFilter());

app.use(compression());

app.use(cookieParser());

app.use(limiter);

app.use(
  pinoHttp({
    level: isProduction ? "warn" : "debug",
  }),
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

app.use(
  express.json({
    limit: "10kb",
    strict: true, 
  }),
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10kb",
  }),
);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the Kidroo Toys API!",
  });
});

app.use("/api", indexRoutes);

app.use("/docs", swaggerRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});
app.use(globalErrorHandler);

export default app;
