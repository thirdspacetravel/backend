import { prisma } from '../../config/database.config.js';
import { router, publicProcedure } from '../trpc.js';
import type { DayData } from '../../types/admin.trpc.js';
import z from 'zod';
import { TRPCError } from '@trpc/server';
export const publicRouter = router({
  fetchLiveTrips: publicProcedure.query(async () => {
    const liveTrips = await prisma.trip.findMany({
      where: {
        status: {
          not: 'DRAFT',
        },
      },
      orderBy: {
        tripNo: 'desc',
      },
    });

    return liveTrips.map(trip => ({
      ...trip,
      itinerary: trip.itinerary as unknown as DayData[],
      categories: trip.categories as unknown as string[],
      images: trip.images as unknown as string[],
    }));
  }),
  fetchTripById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
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
});
