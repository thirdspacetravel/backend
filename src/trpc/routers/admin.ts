import { router, adminProcedure } from '../trpc.js';

export const adminRouter = router({
  dashboard: adminProcedure.query(() => {
    return { message: 'Admin dashboard data' };
  }),
});
