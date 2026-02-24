import { TRPCError } from '@trpc/server';
import { prisma } from '../../lib/prisma.js';
import { router, adminProcedure } from '../trpc.js';
import z from 'zod';
import { sleep } from '../../lib/sleep.js';
import type { Prisma } from '../../generated/prisma/browser.js';
export interface DayData {
  title: string;
  subtitle: string;
}
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
  createDraftTrip: adminProcedure.mutation(async ({ ctx }) => {
    const trip = await prisma.trip.create({
      data: {
        itinerary: [],
        images: [],
        categories: [],
      },
    });
    await sleep(2000);
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
