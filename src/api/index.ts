import { Router } from 'express';
import adminRouter from './admin.routes.js';
import userRouter from './user.routes.js';
import publicRouter from './public.routes.js';
import userOAuthRouter from './user.oauth.js';
import phonepeRouter from './phonepe.routes.js';

const apiRouter = Router();

apiRouter.use('/admin', adminRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/users', userOAuthRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/phonepe', phonepeRouter);

export { apiRouter };
