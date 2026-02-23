import { TRPCError } from '@trpc/server';
import { prisma } from '../../lib/prisma.js';
import { router, adminProcedure } from '../trpc.js';

export const adminRouter = router({
  getMe: adminProcedure.query(async ({ ctx }) => {
    const admin = await prisma.adminUser.findUnique({
      where: { id: ctx.user.id },
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
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Admin record missing' });
    }

    return admin;
  }),

  dashboardStats: adminProcedure.query(async () => {
    return { users: 100, revenue: 5000 };
  }),
});
