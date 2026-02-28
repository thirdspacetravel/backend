import { config } from '../../config/env.config.js';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { signJwt } from '../../utils/jwt.js';
import { comparePassword, hashPassword } from '../../utils/password.js';
import z from 'zod';
import { prisma } from '../../config/database.config.js';
import { TRPCError } from '@trpc/server';
import { AccountStatus, ContactMethod, type User } from '../../generated/prisma/browser.js';

type UserDataType = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'passwordHash'>;

export const userData = z.object({
  email: z.email(),
  alternateEmail: z.email().nullable(),
  status: z.enum(AccountStatus),
  fullName: z.string().min(1),
  dateOfBirth: z.coerce.date().nullable(),
  gender: z.string().nullable(),
  nationality: z.string().nullable(),
  maritalStatus: z.string().nullable(),
  anniversaryDate: z.coerce.date().nullable(),
  avatarUrl: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  altPhoneNumber: z.string().nullable(),
  preferredContact: z.enum(ContactMethod),
  streetAddress: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  zipCode: z.string().nullable(),
  receiveTripUpdates: z.boolean(),
  receivePromoEmails: z.boolean(),
});

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
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
    if (!user) {
      throw new TRPCError({ message: 'User not found', code: 'NOT_FOUND' });
    }
    const { id, createdAt, updatedAt, passwordHash, ...userWithoutSensitiveData } = user;
    return userWithoutSensitiveData as Omit<
      typeof user,
      'id' | 'createdAt' | 'updatedAt' | 'passwordHash'
    >;
  }),
  updateMe: protectedProcedure.input(userData).mutation(async ({ input, ctx }) => {
    const updatedUser = await prisma.user.update({
      where: { id: ctx.user.id },
      data: input as UserDataType,
    });
    return updatedUser;
  }),
  checkStatus: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user || ctx.user.role !== 'user') {
      return { authenticated: false, user: null };
    }
    const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
    if (!user) {
      return { authenticated: false, user: null };
    }
    return {
      authenticated: true,
      user: { fullName: user.fullName, email: user.email, avatar: user.avatarUrl },
    };
  }),
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string().min(8, 'New password must be at least 8 characters'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { currentPassword, newPassword } = input;

      // 1. Find the user in the database
      const user = await prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const isPasswordMatch = await comparePassword(currentPassword, user.passwordHash);

      if (!isPasswordMatch) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'The current password you entered is incorrect.',
        });
      }

      const hashedPassword = await hashPassword(newPassword);

      await prisma.user.update({
        where: { id: ctx.user.id },
        data: {
          passwordHash: hashedPassword,
        },
      });

      return { success: true, message: 'Password updated successfully!' };
    }),
  updateSettings: protectedProcedure
    .input(
      z.object({
        key: z.enum(['receiveTripUpdates', 'receivePromoEmails']),
        value: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { key, value } = input;
      await prisma.user.update({
        where: { id: ctx.user.id },
        data: {
          [key]: value,
        },
      });
      return true;
    }),
});
