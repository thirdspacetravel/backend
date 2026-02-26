import { config } from '../../config/env.config.js';
import { router, publicProcedure } from '../trpc.js';
import { signJwt } from '../../utils/jwt.js';
import { comparePassword, hashPassword } from '../../utils/password.js';
import z from 'zod';
import { prisma } from '../../config/database.config.js';
import { TRPCError } from '@trpc/server';

export const userRouter = router({
  login: publicProcedure
    .input(
      z.object({
        email: z.email(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUnique({ where: { email: input.email } });

      if (!user) {
        throw new TRPCError({ message: 'Invalid credentials', code: 'UNAUTHORIZED' });
      }

      const valid = await comparePassword(input.password, user.passwordHash);

      if (!valid) {
        throw new TRPCError({ message: 'Invalid credentials', code: 'UNAUTHORIZED' });
      }

      const token = signJwt({
        id: user.id,
        username: user.fullName,
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
  signup: publicProcedure
    .input(
      z.object({
        fullName: z.string(),
        email: z.email(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
      if (existingUser) {
        throw new TRPCError({ message: 'Email already in use', code: 'CONFLICT' });
      }
      const passwordHash = await hashPassword(input.password);
      const newUser = await prisma.user.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          passwordHash,
        },
      });
      return { success: true };
    }),
  checkStatus: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user || ctx.user.role !== 'user') {
      return { authenticated: false };
    }
    return { authenticated: true };
  }),
});
