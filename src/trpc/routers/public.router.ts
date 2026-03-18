import { prisma } from '../../config/database.config.js';
import { router, publicProcedure } from '../trpc.js';
import type { DayData } from '../../types/admin.trpc.js';
import z from 'zod';
import { TRPCError } from '@trpc/server';
import { EnquiryType } from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';
interface FormDataType {
  fullName: string;
  institutionName: string;
  designation: string;
  email: string;
  subject: string;
  destination: string;
  groupSize: string | number;
  travelDates: string;
  phoneNumber: string;
  message: string;
}

type ValidationErrors = Partial<Record<keyof FormDataType, string>>;

const validateForm = (formData: FormDataType): { isValid: boolean; errors: ValidationErrors } => {
  const errors: ValidationErrors = {};
  let isValid = true;
  const requiredFields: (keyof FormDataType)[] = ['fullName', 'subject', 'email', 'message'];

  requiredFields.forEach(field => {
    if (!formData[field] || String(formData[field]).trim() === '') {
      errors[field] = `${field.replace(/([A-Z])/g, ' $1').trim()} is required`;
      isValid = false;
    }
  });
  if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
    errors.email = 'Email address is invalid';
    isValid = false;
  }
  if (formData.phoneNumber && !/^\d{7,15}$/.test(formData.phoneNumber.replace(/\D/g, ''))) {
    errors.phoneNumber = 'Phone number is invalid (7-15 digits)';
    isValid = false;
  }

  return { isValid, errors };
};
export const publicRouter = router({
  fetchLiveTrips: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
        cursor: z.number().nullish(),
        destination: z.string().nullish(),
        duration: z.number().nullish(),
        month: z.string().nullish(),
      }),
    )
    .query(async ({ input }) => {
      const { limit, cursor, destination, duration, month } = input;

      const where: any = {
        status: { not: 'DRAFT' },
        tripType: 1,
      };

      if (destination) {
        where.destination = { contains: destination };
      }
      if (duration) {
        where.days = duration;
      }
      if (month) {
        const startDate = new Date(month);
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
        where.startDateTime = { gte: startDate, lt: endDate };
      }

      // Build query arguments dynamically to satisfy strict TS rules
      const queryArgs: any = {
        take: limit + 1,
        where,
        orderBy: { tripNo: 'desc' },
      };

      if (typeof cursor === 'number') {
        queryArgs.cursor = { tripNo: cursor };
        queryArgs.skip = 1; // Skip the cursor itself
      }

      const items = await prisma.trip.findMany(queryArgs);

      let nextCursor: number | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.tripNo;
      }

      const trips = items.map(trip => ({
        ...trip,
        itinerary: trip.itinerary as unknown as any[],
        categories: trip.categories as unknown as string[],
        images: trip.images as unknown as string[],
      }));

      return {
        trips,
        nextCursor,
      };
    }),
  tripFilters: publicProcedure.query(async () => {
    const tripFilters = await prisma.trip.findMany({
      where: {
        status: {
          not: 'DRAFT',
        },
        tripType: 1,
      },
      select: {
        destination: true,
        days: true,
        startDateTime: true,
      },
      take: 1000,
    });
    const destinations = [...new Set(tripFilters.map(t => t.destination))].sort();
    const durations = [...new Set(tripFilters.filter(t => t.days !== null).map(t => t.days))].sort(
      (a, b) => a! - b!,
    );
    const months = [
      ...new Set(
        tripFilters
          .filter(t => t.startDateTime !== null)
          .map(t => {
            const date = new Date(t.startDateTime!);
            return date.toLocaleString('default', { month: 'long', year: 'numeric' });
          }),
      ),
    ].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return { destinations, durations, months };
  }),
  fetchUpcomingTrips: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ input }) => {
      const LIMIT = 10;
      const skip = (input.page - 1) * LIMIT;
      const liveTrips = await prisma.trip.findMany({
        take: LIMIT,
        skip: skip,
        where: {
          status: 'PUBLISHED',
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          _count: {
            select: {
              bookings: {
                where: {
                  resultStatus: 'TXN_SUCCESS',
                },
              },
            },
          },
        },
      });
      return liveTrips.map(trip => {
        const { createdAt, updatedAt, _count, ...tripWithoutSensitiveData } = trip;
        return {
          ...tripWithoutSensitiveData,
          itinerary: trip.itinerary as unknown as DayData[],
          categories: trip.categories as unknown as string[],
          images: trip.images as unknown as string[],
          bookedSeats: _count.bookings,
        };
      });
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
  createEnquiry: publicProcedure
    .input(
      z.object({
        fullName: z.string().optional(),
        institutionName: z.string().optional(),
        designation: z.string().optional(),
        email: z.string().optional(),
        phoneNumber: z.string().optional(),
        subject: z.string().optional(),
        destination: z.string().optional(),
        groupSize: z.string().optional(),
        travelDates: z.string().optional(),
        message: z.string().optional(),
        type: z.enum(EnquiryType),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dataToValidate: FormDataType = {
        fullName: input.fullName || '',
        institutionName: input.institutionName || '',
        designation: input.designation || '',
        email: input.email || '',
        subject: input.subject || '',
        destination: input.destination || '',
        groupSize: input.groupSize || '',
        travelDates: input.travelDates || '',
        phoneNumber: input.phoneNumber || '',
        message: input.message || '',
      };
      if (validateForm(dataToValidate).isValid === false) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: JSON.stringify(validateForm(dataToValidate).errors),
        });
      }
      const enquiry = await prisma.enquiry.create({
        data: {
          fullName: input.fullName || '',
          institutionName: input.institutionName ?? null,
          designation: input.designation ?? null,
          email: input.email || '',
          subject: input.subject || '',
          destination: input.destination ?? null,
          groupSize: input.groupSize ?? null,
          travelDates: input.travelDates ?? null,
          phoneNumber: input.phoneNumber || null,
          message: input.message || '',
          type: input.type,
        },
      });
      if (!enquiry) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to submit enquiry. Please try again later.',
        });
      }
      return { success: true, message: 'Enquiry submitted successfully!' };
    }),
  fetchStats: publicProcedure.query(async () => {
    const totalTrips = await prisma.trip.count({
      where: {
        status: 'PUBLISHED',
      },
    });
    const successSummary = await prisma.booking.aggregate({
      where: {
        resultStatus: 'TXN_SUCCESS',
      },
      _count: {
        bookingno: true, // Counts total bookings
      },
      _sum: {
        amount: true, // Sums the amount
      },
    });
    const totalUsers = await prisma.user.count({
      where: {
        status: {
          notIn: ['DELETED', 'SUSPENDED'],
        },
      },
    });
    return {
      totalTrips,
      totalBookings: successSummary._count.bookingno,
      totalUsers,
      totalRevenue: successSummary._sum.amount ?? 0,
    };
  }),
  subscribeToNewsletter: publicProcedure
    .input(z.object({ email: z.email() }))
    .mutation(async ({ input }) => {
      try {
        const newsletter = await prisma.newsLetter.create({
          data: {
            email: input.email,
          },
        });

        return {
          success: true,
          message: 'Successfully subscribed to newsletter!',
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This email is already subscribed.',
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to subscribe to newsletter. Please try again later.',
        });
      }
    }),
});
