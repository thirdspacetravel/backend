import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { upload } from '../middleware/upload.middleware.js';
import { authenticateAdmin } from '../middleware/authentication.middleware.js';
import multer from 'multer';

const adminRouter = Router();

// --- ADMIN ONLY: Uploading sensitive images ---
adminRouter.post(
  '/upload',
  authenticateAdmin,
  (req: Request, res: Response, next: NextFunction) => {
    // Wrap upload in a function to catch Multer-specific errors before the route logic
    upload.single('image')(req, res, err => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `Multer Error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      return res.json({
        success: true,
        message: 'File uploaded successfully',
        filename: file.filename,
      });
    });
  },
);

export default adminRouter;
