import { router, protectedProcedure } from '../trpc.js';

export const userRouter = router({
  profile: protectedProcedure.query(({ ctx }) => {
    return ctx.user;
  }),
});
