import { router } from '../trpc.js';
import { adminAuthRouter } from './adminauth.js';
import { userAuthRouter } from './userAuth.js';
import { adminRouter } from './admin.js';
import { userRouter } from './user.js';

export const appRouter = router({
  adminAuth: adminAuthRouter,
  userAuth: userAuthRouter,
  admin: adminRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
