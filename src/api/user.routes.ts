import { Router } from 'express';
import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { upload } from '../middleware/upload.middleware.js';
import { authenticateUser } from '../middleware/authentication.middleware.js';
import { fileTypeFromFile } from 'file-type';
import fs from 'fs';

const userRouter = Router();
const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

userRouter.post('/upload', authenticateUser, (req: Request, res: Response, next: NextFunction) => {
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
});

export default userRouter;
