import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { upload } from '../middleware/upload.middleware.js';
import { authenticateAdmin } from '../middleware/authentication.middleware.js';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type';
import fs from 'fs';

const adminRouter = Router();
const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// --- ADMIN ONLY: Uploading sensitive images ---
adminRouter.post(
  '/upload',
  authenticateAdmin,
  (req: Request, res: Response, next: NextFunction) => {
    // Wrap upload in a function to catch Multer-specific errors before the route logic
    upload.single('image')(req, res, async err => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `Multer Error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }
      const determinedType = await fileTypeFromFile(file.path);
      if (!determinedType || !allowed.includes(determinedType.mime)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({
          success: false,
          message: 'Security Alert: File signature does not match extension.',
        });
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
