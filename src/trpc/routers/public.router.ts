import { prisma } from '../../config/database.config.js';
import { router, publicProcedure } from '../trpc.js';
import type { DayData } from '../../types/admin.trpc.js';
export const publicRouter = router({
  fetchTrips: publicProcedure.query(async () => {
    const trips = await prisma.trip.findMany();
    return trips.map(trip => ({
      ...trip,
      itinerary: trip.itinerary as unknown as DayData[],
      categories: trip.categories as unknown as string[],
      images: trip.images as unknown as string[],
    }));
  }),
});
