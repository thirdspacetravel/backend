import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import { prisma } from '../config/database.config.js';
import z, { ZodError } from 'zod';
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Using a type guard and explicit casting to avoid the deprecation
        zodError: error.cause instanceof ZodError ? z.treeifyError(error.cause) : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'user') {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { id: true, status: true },
  });
  if (!dbUser) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  if (dbUser.status === 'SUSPENDED') {
    if (ctx.res) {
      ctx.res.clearCookie('token');
    }
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Account suspended. You have been logged out.',
    });
  }
  return next({
    ctx: {
      user: ctx.user,
      dbUser,
    },
  });
});

const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'admin') {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be an admin to perform this action.',
    });
  }
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const adminProcedure = t.procedure.use(isAdmin);
