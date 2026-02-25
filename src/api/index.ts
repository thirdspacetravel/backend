import { Router } from 'express';
import adminRouter from './admin.routes.js';
import userRouter from './user.routes.js';
import publicRouter from './public.routes.js';

const apiRouter = Router();

apiRouter.use('/admin', adminRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/public', publicRouter);

export { apiRouter };
