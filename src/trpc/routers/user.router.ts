import { config } from '../../config/env.config.js';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { signJwt, signVerificationJwt, verifyJwt } from '../../utils/jwt.js';
import { comparePassword, hashPassword } from '../../utils/password.js';
import z from 'zod';
import { prisma } from '../../config/database.config.js';
import { TRPCError } from '@trpc/server';
import {
  AccountStatus,
  ContactMethod,
  Gender,
  MaritalStatus,
  type User,
} from '../../generated/prisma/browser.js';
import { sendEmail } from '../../utils/mailer.js';
import { validateUserProfile } from '../../utils/validator.js';
import axios from 'axios';
import { StorageManager } from '../../utils/StorageManager.js';

type UserDataType = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'passwordHash'>;

const packageOptions = ['Quad Sharing', 'Triple Sharing', 'Double Sharing'];

export const verificationEmailHtml = (url: string) => `
    <div
      style="
        font-family: &quot;Poppins&quot;, sans-serif;
        padding: 20px;
        color: #333;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
      "
    >
      <h2 style="color: #000">Welcome to Third Space Travel!</h2>
      <p>
        Please click the button below to verify your email address and activate
        your account.
      </p>
      <a
        href="${url}"
        style="
          display: inline-block;
          padding: 10px 20px;
          background-color: #333;
          color: white;
          text-decoration: none;
          border-radius: 12px;
          margin-top: 10px;
        "
        >Verify Email</a
      >
      <p style="margin-top: 20px; font-size: 12px; color: #9aa0a6">
        If you did not request this, please ignore this email.
      </p>
    </div>
`;

export const userData = z
  .object({
    email: z.email(),
    fullName: z.string().trim().min(1, 'Full name is required'),
    alternateEmail: z.email().nullable().or(z.literal('')),
    dateOfBirth: z.preprocess(arg => (arg === '' ? null : arg), z.coerce.date().nullable()),
    gender: z.enum(Gender).nullable().or(z.literal('')),
    nationality: z.string().trim().nullable().or(z.literal('')),
    maritalStatus: z.enum(MaritalStatus).nullable().or(z.literal('')),
    anniversaryDate: z.preprocess(arg => (arg === '' ? null : arg), z.coerce.date().nullable()),
    avatarUrl: z.string().nullable().or(z.literal('')),
    phoneNumber: z.string().trim().nullable().or(z.literal('')),
    altPhoneNumber: z.string().trim().nullable().or(z.literal('')),
    upiId: z.string().trim().nullable().or(z.literal('')),
    streetAddress: z.string().trim().nullable().or(z.literal('')),
    city: z.string().trim().nullable().or(z.literal('')),
    state: z.string().trim().nullable().or(z.literal('')),
    country: z.string().trim().nullable().or(z.literal('')),
    zipCode: z.string().trim().nullable().or(z.literal('')),
    status: z.enum(AccountStatus).default(AccountStatus.PENDING_VERIFICATION),
    preferredContact: z.enum(ContactMethod).default(ContactMethod.EMAIL),
    receiveTripUpdates: z.boolean().default(true),
    receivePromoEmails: z.boolean().default(false),
  })
  .transform(data => {
    return {
      ...data,
      alternateEmail: data.alternateEmail === '' ? null : data.alternateEmail,
      nationality: data.nationality === '' ? null : data.nationality,
      avatarUrl: data.avatarUrl === '' ? null : data.avatarUrl,
      phoneNumber: data.phoneNumber === '' ? null : data.phoneNumber,
      altPhoneNumber: data.altPhoneNumber === '' ? null : data.altPhoneNumber,
      upiId: data.upiId === '' ? null : data.upiId,
      streetAddress: data.streetAddress === '' ? null : data.streetAddress,
      city: data.city === '' ? null : data.city,
      state: data.state === '' ? null : data.state,
      country: data.country === '' ? null : data.country,
      zipCode: data.zipCode === '' ? null : data.zipCode,
    };
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
      if (user.status === 'SUSPENDED') {
        throw new TRPCError({
          message: 'This account is suspended. Please contact support.',
          code: 'FORBIDDEN',
        });
      }
      if (user.status !== 'VERIFIED') {
        const token = signVerificationJwt({ id: user.id });
        const url = `${config.frontendUrl}/verify/${token}`;

        const result = await sendEmail({
          to: user.email,
          subject: 'Verify your Email for Third Space Travel',
          text: `Click this link to verify: ${url}`,
          html: verificationEmailHtml(url),
        });
        if (!result) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to send verification email. Please try again later.',
          });
        }
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: `Please verify your email to log in. A new verification email has been sent to ${user.email}.`,
        });
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
      const existingUser = await prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true, status: true },
      });
      if (existingUser) {
        if (existingUser.status === 'SUSPENDED') {
          throw new TRPCError({
            message: 'This email is suspended. Please contact support.',
            code: 'FORBIDDEN',
          });
        } else {
          throw new TRPCError({ message: 'Email already in use', code: 'CONFLICT' });
        }
      }
      const passwordHash = await hashPassword(input.password);
      const newUser = await prisma.user.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          passwordHash,
        },
      });
      const token = signVerificationJwt({ id: newUser.id });
      const url = `${config.frontendUrl}/verify/${token}`;

      const result = await sendEmail({
        to: newUser.email,
        subject: 'Verify your Email for Third Space Travel',
        text: `Click this link to verify: ${url}`,
        html: verificationEmailHtml(url),
      });
      if (!result) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to send verification email. Please try again later.',
        });
      }
      return { success: true, emailSent: result.success };
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
    const { email, ...inputWithoutEmail } = input;
    const olduser = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { avatarUrl: true },
    });
    if (!olduser) {
      throw new TRPCError({ message: 'User not found', code: 'NOT_FOUND' });
    }
    const updatedUser = await prisma.user.update({
      where: { id: ctx.user.id },
      data: inputWithoutEmail as Omit<UserDataType, 'email'>,
    });
    if (updatedUser.avatarUrl !== olduser.avatarUrl) {
      if (olduser.avatarUrl) {
        try {
          await StorageManager.deletePersistentFile(olduser.avatarUrl);
        } catch (err: unknown) {
          if (err instanceof Error) {
            console.error(`Failed to delete image ${olduser.avatarUrl}:`, err.message);
          } else {
            console.error(`An unexpected error occurred:`, err);
          }
        }
      }
      if (updatedUser.avatarUrl) {
        try {
          await StorageManager.persistFile(updatedUser.avatarUrl);
        } catch (err: unknown) {
          if (err instanceof Error) {
            console.error(`Failed to move image ${updatedUser.avatarUrl}:`, err.message);
          } else {
            console.error(`An unexpected error occurred:`, err);
          }
        }
      }
    }
    return updatedUser;
  }),
  checkStatus: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user || ctx.user.role !== 'user') {
      return { authenticated: false, user: null };
    }
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { status: true, fullName: true, email: true, avatarUrl: true },
    });
    if (!user || user.status === 'SUSPENDED') {
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
  initializePayment: protectedProcedure
    .input(
      z.object({
        tripId: z.string(),
        roomType: z.number().min(1).max(3),
        adults: z.number().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const trip = await prisma.trip.findUnique({
        where: {
          id: input.tripId,
        },
      });
      if (!trip) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid trip ID provided.',
        });
      }
      if (trip.status !== 'PUBLISHED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot book a cancelled/completed trip.',
        });
      }
      if (!trip.isAcceptingBookings) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This trip is not accepting bookings at the moment.',
        });
      }
      if (trip.priceQuad === null && trip.priceTriple === null && trip.priceDouble === null) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Trip pricing information is incomplete.',
        });
      }
      const user = await prisma.user.findUnique({
        where: { id: ctx.user.id },
      });
      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User not found.',
        });
      }
      const userdatavalid = validateUserProfile(user);
      if (userdatavalid.isValid === false) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message:
            'Please complete your profile information before booking a trip.' +
            JSON.stringify(userdatavalid.errors),
        });
      }
      const prices = [trip.priceQuad, trip.priceTriple, trip.priceDouble];
      const price = prices[input.roomType - 1];
      if (!price) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid room type selected.',
        });
      }
      const adults = input.adults;
      const totalAmount = Number(price) * Number(adults);

      if (isNaN(totalAmount) || totalAmount <= 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid calculation of total amount.',
        });
      }
      const booking = await prisma.booking.create({
        data: {
          tripid: input.tripId,
          userid: ctx.user.id,
          roomtype: packageOptions[input.roomType - 1] || 'Quad Sharing',
          adults: input.adults,
          amount: totalAmount,
        },
      });
      if (!booking) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create booking record.',
        });
      }

      try {
        return {
          txnToken: 'dfg' as string,
          orderId: booking.id,
          mid: config.phonepeCid,
          amount: totalAmount.toFixed(2),
        };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error('Axios Error Data:', error.response?.data);
          console.error('Axios Error Status:', error.response?.status);
        } else {
          console.error('Generic Error:', error);
        }
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            resultStatus: 'TXN_FAILURE',
          },
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to communicate with payment gateway.',
        });
      }
    }),
  sendVerificationEmail: protectedProcedure
    .input(z.object({ email: z.email() }))
    .mutation(async ({ input }) => {
      const { email } = input;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      const token = signVerificationJwt({ id: user.id });
      const url = `${config.frontendUrl}/verify/${token}`;
      console.log('Generated verification Token:', token);
      await sendEmail({
        to: email,
        subject: 'Verify your Email for Third Space Travel',
        text: `Click this link to verify: ${url}`,
        html: verificationEmailHtml(url),
      });

      return { success: true };
    }),
  verifyEmail: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { token } = input;

      try {
        const payload = verifyJwt(token);
        console.log('Decoded JWT payload:', payload);
        const user = await prisma.user.findUnique({
          where: { id: payload.id },
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }
        if (user.status === 'SUSPENDED') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'This account is suspended. Please contact support.',
          });
        }

        await prisma.user.update({
          where: { id: payload.id },
          data: { status: 'VERIFIED' },
        });
        const logintoken = signJwt({
          id: user.id,
          username: user.fullName,
          role: 'user',
        });

        ctx.res.cookie('token', logintoken, {
          httpOnly: true,
          secure: config.env === 'production',
          sameSite: 'strict',
          maxAge: 1000 * 60 * 60 * 24 * 7,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired verification token',
        });
      }
    }),
});
