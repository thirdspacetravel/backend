import { prisma } from '../../config/database.config.js';
import { router, publicProcedure } from '../trpc.js';
import type { DayData } from '../../types/admin.trpc.js';
import z from 'zod';
import { TRPCError } from '@trpc/server';
import { EnquiryType } from '../../generated/prisma/enums.js';

interface FormDataType {
  fullName: string;
  institutionName: string;
  designation: string;
  email: string;
  subject: string;
  destination: string;
  groupSize: string | number; // Assuming input might be string from form
  travelDates: string;
  phoneNumber: string;
  message: string;
}

// 2. Define the interface for the validation errors
type ValidationErrors = Partial<Record<keyof FormDataType, string>>;

/**
 * Validates the form data based on specific rules.
 */
const validateForm = (formData: FormDataType): { isValid: boolean; errors: ValidationErrors } => {
  const errors: ValidationErrors = {};
  let isValid = true;

  // 1. Required Fields Check
  const requiredFields: (keyof FormDataType)[] = ['fullName', 'subject', 'email', 'message'];

  requiredFields.forEach(field => {
    if (!formData[field] || String(formData[field]).trim() === '') {
      // Basic formatting for error message
      errors[field] = `${field.replace(/([A-Z])/g, ' $1').trim()} is required`;
      isValid = false;
    }
  });

  // 2. Specific Format Checks

  // Email Validation
  if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
    errors.email = 'Email address is invalid';
    isValid = false;
  }

  // Phone Number Validation (Basic check for numbers and length)
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
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ input }) => {
      const skip = (input.page - 1) * input.limit;
      const liveTrips = await prisma.trip.findMany({
        take: input.limit,
        skip: skip,
        where: {
          status: {
            not: 'DRAFT',
          },
          tripType: 1,
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
        fullName: z.string(),
        institutionName: z.string().optional(),
        designation: z.string().optional(),
        email: z.email(),
        phoneNumber: z.string().optional(),
        subject: z.string(),
        destination: z.string().optional(),
        groupSize: z.string().optional(),
        travelDates: z.string().optional(),
        message: z.string(),
        type: z.enum(EnquiryType),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dataToValidate: FormDataType = {
        fullName: input.fullName,
        institutionName: input.institutionName || '',
        designation: input.designation || '',
        email: input.email,
        subject: input.subject,
        destination: input.destination || '',
        groupSize: input.groupSize || '',
        travelDates: input.travelDates || '',
        phoneNumber: input.phoneNumber || '',
        message: input.message,
      };
      if (validateForm(dataToValidate).isValid === false) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: JSON.stringify(validateForm(dataToValidate).errors),
        });
      }
      return await prisma.enquiry.create({
        data: {
          fullName: input.fullName,
          institutionName: input.institutionName ?? null,
          designation: input.designation ?? null,
          email: input.email,
          subject: input.subject,
          destination: input.destination ?? null,
          groupSize: input.groupSize ?? null,
          travelDates: input.travelDates ?? null,
          phoneNumber: input.phoneNumber || null,
          message: input.message,
          type: input.type,
        },
      });
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
});
