import { TRPCError } from '@trpc/server';
import { prisma } from '../../config/database.config.js';
import { router, adminProcedure, publicProcedure } from '../trpc.js';
import z from 'zod';
import type { Prisma } from '../../generated/prisma/browser.js';
import { config } from '../../config/env.config.js';
import { signJwt } from '../../utils/jwt.js';
import { comparePassword } from '../../utils/password.js';
import type { DayData } from '../../types/admin.trpc.js';
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
    return {
      ...trip,
      itinerary: trip.itinerary as unknown as DayData[],
      categories: trip.categories as unknown as string[],
      images: trip.images as unknown as string[],
    };
  }),
  fetchTrips: adminProcedure.query(async () => {
    const trips = await prisma.trip.findMany();
    return trips.map(trip => ({
      ...trip,
      itinerary: trip.itinerary as unknown as DayData[],
      categories: trip.categories as unknown as string[],
      images: trip.images as unknown as string[],
    }));
  }),
  fetchTripById: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const trip = await prisma.trip.findUnique({
      where: { id: input.id },
    });
    if (!trip) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Trip not found' });
    }
    return {
      ...trip,
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
        status: z.number(),
        isFeatured: z.boolean(),
        isAcceptingBookings: z.boolean(),
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
        },
      });
      return { success: true };
    }),
});
