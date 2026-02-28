import { TRPCError } from '@trpc/server';
import { prisma } from '../../config/database.config.js';
import { router, adminProcedure, publicProcedure } from '../trpc.js';
import z from 'zod';
import { TripCategory, TripStatus, type Prisma } from '../../generated/prisma/browser.js';
import { config } from '../../config/env.config.js';
import { signJwt } from '../../utils/jwt.js';
import { comparePassword } from '../../utils/password.js';
import type { DayData } from '../../types/admin.trpc.js';
const LIMIT = 10;
export const adminRouter = router({
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
  createDraftTrip: adminProcedure.mutation(async ({ ctx }) => {
    const trip = await prisma.trip.create({
      data: {
        itinerary: [],
        images: [],
        categories: [],
      },
    });
    if (!trip) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create draft trip',
      });
    }
    return { success: true, tripId: trip.id };
  }),
  fetchTrips: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ input }) => {
      const skip = (input.page - 1) * LIMIT;

      const trips = await prisma.trip.findMany({
        take: LIMIT,
        skip: skip,
        orderBy: {
          tripNo: 'desc',
        },
      });

      return trips.map(trip => {
        const { createdAt, updatedAt, ...tripWithoutSensitiveData } = trip;
        return {
          ...tripWithoutSensitiveData,
          itinerary: trip.itinerary as unknown as DayData[],
          categories: trip.categories as unknown as string[],
          images: trip.images as unknown as string[],
        };
      });
    }),

  getTripsCount: adminProcedure.query(async () => {
    const count = await prisma.trip.count();
    return {
      total: count,
      totalPages: Math.ceil(count / LIMIT),
    };
  }),
  fetchTripById: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const trip = await prisma.trip.findUnique({
      where: { id: input.id },
    });
    if (!trip) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Trip not found' });
    }
    const { createdAt, updatedAt, ...tripWithoutSensitiveData } = trip;
    return {
      ...tripWithoutSensitiveData,
      itinerary: trip.itinerary as unknown as DayData[],
      categories: trip.categories as unknown as string[],
      images: trip.images as unknown as string[],
    };
  }),
  updateTrip: adminProcedure
    .input(
      z.object({
        id: z.string(),
        tripName: z.string(),
        destination: z.string(),
        tripType: z.number().nullable(),
        fullOverview: z.string(),
        days: z.number().nullable(),
        nights: z.number().nullable(),
        totalSeats: z.number().nullable(),
        pickupLocation: z.string(),
        dropOffLocation: z.string(),
        inclusions: z.string(),
        exclusions: z.string(),
        itinerary: z.array(
          z.object({
            title: z.string(),
            subtitle: z.string(),
          }),
        ),
        priceQuad: z.number().nullable(),
        priceTriple: z.number().nullable(),
        priceDouble: z.number().nullable(),
        categories: z.array(z.string()),
        images: z.array(z.string()),
        startDateTime: z.coerce.date().nullable(),
        endDateTime: z.coerce.date().nullable(),
        status: z.enum(TripStatus),
        isFeatured: z.boolean(),
        isAcceptingBookings: z.boolean(),
        featuredCategories: z.enum(TripCategory).nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      const updatedTrip = await prisma.trip.update({
        where: { id: input.id },
        data: {
          tripName: input.tripName,
          destination: input.destination,
          tripType: input.tripType,
          fullOverview: input.fullOverview,
          days: input.days,
          nights: input.nights,
          totalSeats: input.totalSeats,
          pickupLocation: input.pickupLocation,
          dropOffLocation: input.dropOffLocation,
          inclusions: input.inclusions,
          exclusions: input.exclusions,
          itinerary: input.itinerary as Prisma.InputJsonValue,
          categories: input.categories as Prisma.InputJsonValue,
          images: input.images as Prisma.InputJsonValue,
          priceQuad: input.priceQuad,
          priceTriple: input.priceTriple,
          priceDouble: input.priceDouble,
          startDateTime: input.startDateTime,
          endDateTime: input.endDateTime,
          status: input.status,
          isFeatured: input.isFeatured,
          isAcceptingBookings: input.isAcceptingBookings,
          featuredCategories: input.featuredCategories,
        },
      });
      return { success: true };
    }),
  deleteTrip: adminProcedure
    .input(
      z.object({
        id: z.string(), // or z.number() depending on your DB schema
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id } = input;

      try {
        // 1. Check if the trip exists (optional but recommended)
        const trip = await prisma.trip.findUnique({
          where: { id },
        });

        if (!trip) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Trip not found or already deleted.',
          });
        }

        // 2. Perform the deletion
        await prisma.trip.delete({
          where: { id },
        });

        return { success: true, deletedId: id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete trip. It might be linked to existing bookings.',
          cause: error,
        });
      }
    }),
});
