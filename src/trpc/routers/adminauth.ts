import { router, publicProcedure } from '../trpc.js';
import { z } from 'zod';
import { comparePassword, signJwt } from '../../lib/auth.js';
import { prisma } from '../../lib/prisma.js';
import { TRPCError } from '@trpc/server';
import { config } from '../../utils/envConfig.js';
export const adminAuthRouter = router({
  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const admin = await prisma.adminUser.findUnique({
        where: { username: input.username },
      });

      if (!admin) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Admin user not found' });
      }

      const valid = await comparePassword(input.password, admin.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
      }

      const token = signJwt({
        id: admin.id,
        username: admin.username,
        role: 'admin',
      });

      ctx.res.cookie('token', token, {
        httpOnly: true,
        secure: config.env === 'production',
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });

      return { success: true };
    }),

  checkStatus: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user || ctx.user.role !== 'admin') {
      return { authenticated: false };
    }
    return { authenticated: true };
  }),
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie('token');
    return { success: true };
  }),
});
