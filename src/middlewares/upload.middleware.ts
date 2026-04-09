import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import AppError from "../utils/appError";

const uploadDir = "/tmp/uploads/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use high-resolution timer + crypto random to guarantee uniqueness
    // even when multiple files arrive in the same millisecond (same request)
    const [, nsec] = process.hrtime();
    const rand = crypto.randomBytes(8).toString("hex");
    const uniqueSuffix = `${Date.now()}-${nsec}-${rand}`;
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "video/mp4",
    "video/mpeg",
    "application/pdf",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${allowedMimes.join(", ")}`));
  }
};

// Create multer instance
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});


export const uploadSingle = (fieldName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const singleUpload = upload.single(fieldName);

    singleUpload(req as any, res as any, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new AppError("File size too large. Max 50MB", 400));
        }
        return next(new AppError(err.message, 400));
      } else if (err) {
        return next(new AppError(err.message, 400));
      }
      next();
    });
  };
};


export const uploadMultiple = (fieldName: string, maxCount: number = 5) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const multipleUpload = upload.array(fieldName, maxCount);

    multipleUpload(req as any, res as any, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new AppError("File size too large. Max 50MB", 400));
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return next(new AppError(`Max ${maxCount} files allowed`, 400));
        }
        return next(new AppError(err.message, 400));
      } else if (err) {
        return next(new AppError(err.message, 400));
      }
      next();
    });
  };
};