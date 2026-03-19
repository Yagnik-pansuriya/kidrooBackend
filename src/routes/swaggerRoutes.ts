import { Router, Request, Response, NextFunction } from "express";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "../config/swagger";

interface SwaggerSpec {
  openapi: string;
  info: any;
  servers: any[];
  components: any;
  security: any[];
  paths: Record<string, any>;
  tags?: any[];
}

const router = Router();

// Debug logging
const pathCount =
  (swaggerSpec as SwaggerSpec) && (swaggerSpec as SwaggerSpec).paths
    ? Object.keys((swaggerSpec as SwaggerSpec).paths).length
    : 0;
console.log(`Swagger spec initialized with ${pathCount} paths`);
console.log(`Swagger spec keys:`, Object.keys(swaggerSpec || {}));

// Serve Swagger UI static files
router.use("/", swaggerUi.serve);

// Main Swagger UI endpoint
router.get("/", (req: Request, res: Response, next: NextFunction) => {
  try {
    const setupOptions = {
      customCss: `.swagger-ui .topbar { display: none }`,
      customSiteTitle: "Kidroo Toys API Documentation",
    };

    const handler = swaggerUi.setup((swaggerSpec as any) || {}, setupOptions);
    handler(req, res, next);
  } catch (error) {
    console.error("Error in Swagger setup:", error);
    res.status(500).json({
      success: false,
      message: "Swagger UI is temporarily unavailable",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
});

// JSON specification endpoint
router.get("/json", (req: Request, res: Response) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.json((swaggerSpec as any) || {});
  } catch (error) {
    console.error("Error serving Swagger JSON:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve Swagger specification",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
});

// YAML specification endpoint
router.get("/yaml", (req: Request, res: Response) => {
  try {
    res.setHeader("Content-Type", "application/yaml; charset=utf-8");
    res.send(JSON.stringify((swaggerSpec as any) || {}, null, 2));
  } catch (error) {
    console.error("Error serving Swagger YAML:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve Swagger YAML",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
});

export default router;
