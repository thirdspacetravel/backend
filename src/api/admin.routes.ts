import { Router } from 'express';
import { upload } from '../middleware/upload.middleware.js';
import { authenticateAdmin } from '../middleware/authentication.middleware.js';

const adminRouter = Router();

// --- ADMIN ONLY: Uploading sensitive images ---
adminRouter.post('/upload', authenticateAdmin, upload.single('image'), (req, res) => {
  res.json({ success: true, message: 'Admin upload successful', file: req.file?.filename });
});

export default adminRouter;
