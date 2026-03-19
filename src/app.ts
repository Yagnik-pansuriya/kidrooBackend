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
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:3000"
).split(",");

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || !isProduction) {
        callback(null, true);
      } else {
        callback(new Error("CORS policy: Origin not allowed"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
    maxAge: 86400, // 24 hours
  }),
);

app.use(hpp());

// Custom NoSQL injection prevention for Express 5.x (mongoSanitize causes issues with read-only query)
app.use((req, res, next) => {
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
  if (req.params) req.params = sanitizeValue(req.params);
  next();
});

app.use(xssFilter());

app.use(compression());

// Cookie parser middleware
app.use(cookieParser());

// Rate limiting
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

// Body parser with strict limit
app.use(
  express.json({
    limit: "10kb",
    strict: true, // Only parse valid JSON
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

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);

// API Documentation
app.use("/docs", swaggerRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});
app.use(globalErrorHandler);

export default app;
