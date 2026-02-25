import { router } from '../trpc.js';
import { adminRouter } from './admin.router.js';
import { publicRouter } from './public.router.js';
import { userRouter } from './user.router.js';

export const trpcRouter = router({
  admin: adminRouter,
  user: userRouter,
  public: publicRouter,
});
