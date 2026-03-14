import { prisma } from '../config/database.config.js';
import { config } from '../config/env.config.js';
import { Router } from 'express';

const phonepeRouter = Router();

phonepeRouter.post('/callback', async (req, res) => {});

export default phonepeRouter;
