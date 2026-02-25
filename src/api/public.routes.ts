import { Router } from 'express';

const publicRouter = Router();

publicRouter.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default publicRouter;
