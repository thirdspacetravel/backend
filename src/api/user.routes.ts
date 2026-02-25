import { Router } from 'express';
import { upload } from '../middleware/upload.middleware.js';
import { authenticateUser } from '../middleware/authentication.middleware.js';

const userRouter = Router();

userRouter.post('/upload', authenticateUser, upload.single('image'), (req, res) => {
  res.json({ success: true, message: 'User upload successful', file: req.file?.filename });
});

export default userRouter;
