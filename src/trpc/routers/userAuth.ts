import { router, publicProcedure } from '../trpc.js';
import { z } from 'zod';
import { comparePassword, signJwt } from '../../lib/auth.js';
import { config } from '../../utils/envConfig.js';

export const userAuthRouter = router({
  login: publicProcedure
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      /**
       * 🟢 USER DATABASE LOOKUP
       * Replace with actual DB logic
       */
      // const user = await prisma.user.findUnique({ where: { username: input.username } });

      const user = {
        id: '2',
        username: input.username,
        passwordHash: 'replace-with-user-hash',
      };

      if (!user) {
        throw new Error('Invalid credentials');
      }

      const valid = await comparePassword(input.password, user.passwordHash);

      if (!valid) {
        throw new Error('Invalid credentials');
      }

      const token = signJwt({
        id: user.id,
        username: user.username,
        role: 'user',
      });

      ctx.res.cookie('token', token, {
        httpOnly: true,
        secure: config.env === 'production',
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });

      return { success: true };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie('token');
    return { success: true };
  }),
});
