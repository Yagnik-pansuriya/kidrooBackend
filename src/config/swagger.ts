import swaggerJsdoc from "swagger-jsdoc";

interface SwaggerSpec {
  openapi: string;
  info: any;
  servers: any[];
  components: any;
  security: any[];
  paths: Record<string, any>;
  tags?: any[];
}

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Kidroo Toys API",
      version: "1.0.0",
      description: "Complete API documentation for Kidroo Toys backend",
      contact: {
        name: "Support",
        email: "support@kidroo.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: "Development Server",
      },
      {
        url: "https://api.kidroo.com",
        description: "Production Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token in Authorization header",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "accessToken",
          description: "JWT token in httpOnly cookie",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "User ID",
            },
            name: {
              type: "string",
              description: "User's full name",
            },
            userName: {
              type: "string",
              description: "User's username",
            },
            email: {
              type: "string",
              format: "email",
              description: "User's email address",
            },
            role: {
              type: "string",
              enum: ["user", "admin", "moderator"],
              description: "User's role",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "User creation date",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "User update date",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              description: "Success status",
            },
            message: {
              type: "string",
              description: "Error message",
            },
          },
        },
        SuccessResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              description: "Success status",
            },
            message: {
              type: "string",
              description: "Success message",
            },
            data: {
              type: "object",
              description: "Response data",
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
      {
        cookieAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/controller/*.ts"],
};

let swaggerSpec: SwaggerSpec | any;
try {
  swaggerSpec = swaggerJsdoc(options) as SwaggerSpec;
  console.log("Swagger spec generated successfully");
  console.log(
    `Paths found: ${Object.keys((swaggerSpec as SwaggerSpec).paths || {}).length}`,
  );
} catch (error) {
  console.error("Error generating Swagger spec:", error);
  swaggerSpec = {
    openapi: "3.0.0",
    info: {
      title: "Kidroo Toys API",
      version: "1.0.0",
      description: "Fallback API specification - Check logs for errors",
    },
    servers: [
      { url: "http://localhost:5000", description: "Development Server" },
    ],
    components: { securitySchemes: {} },
    security: [],
    paths: {
      "/api/auth/register": {
        post: {
          summary: "Register a new user",
          tags: ["Authentication"],
          responses: {
            201: { description: "User registered successfully" },
          },
        },
      },
      "/api/auth/login": {
        post: {
          summary: "Login user",
          tags: ["Authentication"],
          responses: {
            200: { description: "Login successful" },
          },
        },
      },
    },
  } as SwaggerSpec;
}

export default swaggerSpec as SwaggerSpec;
