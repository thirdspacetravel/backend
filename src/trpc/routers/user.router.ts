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
import { StorageManager } from '../../utils/StorageManager.js';
import { phonePeProvider } from '../../utils/phonepe.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { v4 as uuid } from 'uuid';

type UserDataType = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'passwordHash'>;

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
        email: z.email('Invalid email address'),
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
        fullName: z.string().min(1, 'Full name is required'),
        email: z.email('Invalid email address'),
        password: z.string().min(6, 'Password must be at least 6 characters long'),
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
          throw new TRPCError({ message: 'Email already exists.', code: 'CONFLICT' });
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
      // We wrap everything in a transaction to ensure atomicity
      return await prisma.$transaction(
        async tx => {
          // 1. Fetch Trip with a Row-Level Lock
          // This prevents other concurrent transactions from modifying this trip until we are done.
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

          const trip = await tx.trip.findUnique({
            where: { id: input.tripId },
            include: {
              bookings: {
                where: {
                  OR: [
                    { resultStatus: 'TXN_SUCCESS' },
                    {
                      resultStatus: 'TXN_PENDING',
                      createdAt: { gte: fifteenMinutesAgo },
                    },
                  ],
                },
                select: { adults: true, resultStatus: true },
              },
            },
          });

          if (!trip || trip.status !== 'PUBLISHED' || !trip.isAcceptingBookings) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Trip unavailable.' });
          }

          // 2. Calculate Occupancy
          const confirmedAdults = trip.bookings
            .filter(b => b.resultStatus === 'TXN_SUCCESS')
            .reduce((sum, b) => sum + b.adults, 0);

          const pendingAdults = trip.bookings
            .filter(b => b.resultStatus === 'TXN_PENDING')
            .reduce((sum, b) => sum + b.adults, 0);

          const totalOccupied = confirmedAdults + pendingAdults;
          if (!trip || trip.status !== 'PUBLISHED' || !trip.isAcceptingBookings) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Trip unavailable.' });
          }

          if (!trip.totalSeats) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Trip capacity not defined.' });
          }

          // 3. Scenario-based Error Messages
          if (confirmedAdults + input.adults > trip.totalSeats) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Sorry, this trip is now fully booked.',
            });
          }

          if (totalOccupied + input.adults > trip.totalSeats) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Some spots are currently held by other users in checkout. Please try again in 15 minutes.`,
            });
          }
          // 3. Pricing Logic
          const priceMap = { 1: trip.priceQuad, 2: trip.priceTriple, 3: trip.priceDouble };
          const price = priceMap[input.roomType as keyof typeof priceMap];
          if (!price) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pricing tier unavailable.' });
          }
          const totalAmount = Number(price) * input.adults;

          // 4. Profile Validation
          const user = await tx.user.findUnique({ where: { id: ctx.user.id } });
          if (!user) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
          }
          const userdatavalid = validateUserProfile(user);
          if (!userdatavalid.isValid) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Profile incomplete: ${userdatavalid.errors.join(', ')}`,
            });
          }
          const existingBooking = await tx.booking.findUnique({
            where: {
              userid_tripid: {
                userid: ctx.user.id,
                tripid: input.tripId,
              },
            },
          });

          if (existingBooking?.resultStatus === 'TXN_SUCCESS') {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'You have already successfully booked this trip.',
            });
          }
          // 2. Logic for reusing PENDING payment links
          if (existingBooking?.resultStatus === 'TXN_PENDING' && existingBooking.paymentUrl) {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000); // 10-minute safety buffer

            // If the booking was created within the last 10 minutes, reuse the URL
            if (existingBooking.createdAt > tenMinutesAgo) {
              return existingBooking.paymentUrl;
            }
          }
          const newId = uuid();
          // 6. External Gateway Call
          try {
            const response = await phonePeProvider.initiatePayment({
              amount: totalAmount * 100,
              merchantOrderId: newId,
              redirectUrl: `${config.frontendUrl}/trip/${trip.id}`,
              paymentModes: [{ type: 'UPI_INTENT' }, { type: 'UPI_QR' }, { type: 'UPI_COLLECT' }],
            });

            // 4. Update the existing record or create a new one
            await tx.booking.upsert({
              where: {
                userid_tripid: {
                  userid: ctx.user.id,
                  tripid: input.tripId,
                },
              },
              update: {
                id: newId,
                createdAt: new Date(), // Reset timestamp for the new link
                paymentUrl: response.redirectUrl,
                resultStatus: 'TXN_PENDING', // Ensure status is pending
                amount: totalAmount, // Update amount in case price changed
              },
              create: {
                id: newId,
                tripid: input.tripId,
                userid: ctx.user.id,
                resultStatus: 'TXN_PENDING',
                roomtype:
                  input.roomType === 1 ? 'Quad' : input.roomType === 2 ? 'Triple' : 'Double',
                adults: input.adults,
                amount: totalAmount,
                paymentUrl: response.redirectUrl,
              },
            });

            return response.redirectUrl;
          } catch (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Payment gateway initialization failed.',
            });
          }
        },
        {
          timeout: 10000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    }),
  pendingPayment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return await prisma.$transaction(
        async tx => {
          try {
            const repsonse = await phonePeProvider.checkOrderStatus(input.id);
            if (!repsonse.state) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message:
                  'Invalid Booking ID or unable to fetch payment status. Please try again later.',
              });
            }
            if (repsonse.state === 'COMPLETED') {
              await prisma.booking.update({
                where: { id: input.id },
                data: {
                  resultStatus: 'TXN_SUCCESS',
                  txnId: repsonse.paymentDetails[0]?.transactionId,
                  txnDate: new Date(repsonse.paymentDetails[0]?.timestamp || Date.now()),
                },
              });
              return { hasPendingPayment: false, hasPaymentFailed: false };
            }
            if (repsonse.state === 'FAILED') {
              await prisma.booking.update({
                where: { id: input.id },
                data: { resultStatus: 'TXN_FAILURE' },
              });
              return { hasPendingPayment: false, hasPaymentFailed: true };
            }

            const booking = await prisma.booking.findUnique({
              where: {
                id: input.id,
              },
            });

            if (!booking) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'No pending payment found for this booking ID.',
              });
            }
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            if (booking.createdAt > tenMinutesAgo) {
              return { hasPendingPayment: !!booking, paymentUrl: booking.paymentUrl };
            }
            await prisma.booking.delete({
              where: {
                id: input.id,
              },
            });
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Payment Link Expired. Please try again.',
            });
          } catch (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to check payment status. Please try again later.',
            });
          }
        },
        {
          timeout: 10000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    }),
  fetchBookings: protectedProcedure.query(async ({ ctx }) => {
    const bookings = await prisma.booking.findMany({
      where: { userid: ctx.user.id, resultStatus: { not: 'TXN_FAILURE' } },
      include: {
        trip: {
          select: {
            id: true,
            tripName: true,
            images: true,
            startDateTime: true,
            endDateTime: true,
          },
        },
      },
    });
    return bookings.map(booking => ({
      ...booking,
      trip: {
        ...booking.trip,
        images: booking.trip.images as unknown as string[],
      },
    }));
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
