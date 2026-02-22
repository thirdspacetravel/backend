import { router, publicProcedure } from '../trpc.js';
import { z } from 'zod';
import { comparePassword, signJwt, verifyJwt } from '../../lib/auth.js'; // Ensure verifyJwt is exported
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

  check: publicProcedure.query(async ({ ctx }) => {
    const token = ctx.req.cookies.token;
    if (!token) {
      return null;
    }

    try {
      const decoded = verifyJwt(token) as { id: string; username: string; role: string };
      if (decoded.role !== 'admin') {
        return null;
      }
      return { success: true };
    } catch (err) {
      return null;
    }
  }),
  getAdminDetails: publicProcedure.query(async ({ ctx }) => {
    const token = ctx.req.cookies.token;
    if (!token) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No token found' });
    }

    try {
      const decoded = verifyJwt(token) as { id: string; username: string; role: string };
      if (decoded.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const admin = await prisma.adminUser.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          email: true,
          avatarUrl: true,
          newBookingAlerts: true,
          paymentConfirmations: true,
          weeklyDigest: true,
          role: true,
        },
      });

      if (!admin) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Admin not found' });
      }
      return admin;
    } catch (err) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    }
  }),
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie('token');
    return { success: true };
  }),
});
