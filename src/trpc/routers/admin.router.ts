import { TRPCError } from '@trpc/server';
import { prisma } from '../../config/database.config.js';
import { router, adminProcedure, publicProcedure } from '../trpc.js';
import z from 'zod';
import {
  EnquiryStatus,
  TripCategory,
  TripStatus,
  type Prisma,
} from '../../generated/prisma/browser.js';
import { config } from '../../config/env.config.js';
import { signJwt } from '../../utils/jwt.js';
import { comparePassword, hashPassword } from '../../utils/password.js';
import type { DayData } from '../../types/admin.trpc.js';
import { sendEmail } from '../../utils/mailer.js';
const LIMIT = 10;

function makeMail(updatedEnquiry: any, input: any) {
  let subject = '';
  let htmlContent = '';

  if (updatedEnquiry.type === 'CONTACT') {
    // --- CONTACT / QUERY ---
    subject = `Re: Regarding your query - ${updatedEnquiry.subject || 'Enquiry'}`;
    htmlContent = `
            <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
              <h2>Hello ${updatedEnquiry.fullName},</h2>
              <p>Thank you for reaching out to us. We have reviewed your query and here is our response:</p>
              <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <strong>Our Response:</strong>
                <p style="white-space: pre-wrap; margin-top: 10px;">${input.reply}</p>
              </div>
              <p>If you have any further questions, feel free to reply to this email.</p>
              <br />
              <p>Best Regards,<br /><strong>Third Space Travel</strong></p>
            </div>
          `;
  } else if (updatedEnquiry.type === 'REQUEST' && input.status === 'ACCEPTED') {
    subject = `Update regarding your request for ${updatedEnquiry.destination || 'your trip'}`;
    htmlContent = `
            <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
              <h2>Hello ${updatedEnquiry.fullName},</h2>
              <p>We are pleased to inform you that we are moving forward with your request for <strong>${updatedEnquiry.destination || 'your destination'}</strong>.</p>
              <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <strong>Next Steps & Details:</strong>
                <p style="white-space: pre-wrap; margin-top: 10px;">${input.reply}</p>
              </div>
              <p>We look forward to helping you plan a memorable journey.</p>
              <br />
              <p>Best Regards,<br /><strong>Third Space Travel</strong></p>
            </div>
          `;
  } else {
    // --- REQUEST REJECTED (REJECTED or others) ---
    subject = `Regarding your request for ${updatedEnquiry.destination || 'your trip'}`;
    htmlContent = `
            <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
              <h2>Hello ${updatedEnquiry.fullName},</h2>
              <p>Thank you for your interest in our services for your upcoming trip to <strong>${updatedEnquiry.destination || 'your destination'}</strong>.</p>
              <p>After reviewing the details, we are unfortunately unable to accommodate your specific request at this time.</p>
              <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <strong>Note from our team:</strong>
                <p style="white-space: pre-wrap; margin-top: 10px;">${input.reply}</p>
              </div>
              <p>We appreciate your understanding and hope to have the opportunity to serve you in the future.</p>
              <br />
              <p>Best Regards,<br /><strong>Third Space Travel</strong></p>
            </div>
          `;
  }
  return { subject, htmlContent };
}

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
  updateProfile: adminProcedure
    .input(
      z.object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        username: z.string(),
        password: z.string().min(6).optional().or(z.literal('')),
        avatarUrl: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, password, ...dataToUpdate } = input;
      const updateData: any = { ...dataToUpdate };

      if (password && password.length > 0) {
        if (password.length < 6) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Password must be at least 6 characters long',
          });
        }
        updateData.passwordHash = await hashPassword(password);
      }
      try {
        const updatedAdmin = await prisma.adminUser.update({
          where: { id },
          data: updateData,
        });
        const { passwordHash: _, ...result } = updatedAdmin;
        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update admin profile',
        });
      }
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

      return trips.map(trip => {
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

  getTripsCount: adminProcedure.query(async () => {
    const count = await prisma.trip.count();
    return {
      total: count,
      totalPages: Math.ceil(count / LIMIT),
    };
  }),
  fetchUsers: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ input }) => {
      const skip = (input.page - 1) * LIMIT;

      const users = await prisma.user.findMany({
        take: LIMIT,
        skip: skip,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          // Gets the total count of all bookings (Pending, Success, Failure)
          _count: {
            select: {
              bookings: {
                where: {
                  resultStatus: 'TXN_SUCCESS',
                },
              },
            },
          },
          // Gets only successful bookings to calculate the total spend
          bookings: {
            where: {
              resultStatus: 'TXN_SUCCESS',
            },
            select: {
              amount: true,
            },
          },
        },
      });

      return users.map(user => {
        const { updatedAt, passwordHash, bookings, _count, ...userWithoutSensitiveData } = user;

        const totalSpent = bookings.reduce((acc, curr) => {
          return acc + Number(curr.amount);
        }, 0);

        return {
          ...userWithoutSensitiveData,
          bookings: _count.bookings,
          totalSpent: totalSpent,
        };
      });
    }),

  getUsersCount: adminProcedure.query(async () => {
    const count = await prisma.user.count();
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
  deleteUser: adminProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      // Perform the suspension
      const deletedUser = await prisma.user.update({
        where: {
          id: input.id,
        },
        data: {
          status: 'SUSPENDED',
        },
      });
      if (!deletedUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found or already suspended.',
        });
      }
      return {
        success: true,
        message: `User ${deletedUser.fullName} has been suspended.`,
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
      if (!updatedTrip) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Trip with ID ${input.id} not found`,
        });
      }
      if (updatedTrip.status === 'CANCELLED') {
        await prisma.booking.updateMany({
          where: {
            tripid: updatedTrip.id,
            resultStatus: 'TXN_SUCCESS',
          },
          data: {
            resultStatus: 'TXN_CANCELLED',
          },
        });
      }
      return { success: true };
    }),

  deleteTrip: adminProcedure
    .input(
      z.object({
        id: z.string(),
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
  fetchBookings: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ input }) => {
      const skip = (input.page - 1) * LIMIT;

      const bookings = await prisma.booking.findMany({
        take: LIMIT,
        skip: skip,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: true,
          trip: true,
        },
      });

      return bookings.map(booking => {
        const { updatedAt, ...bookingWithoutTimestamps } = booking;
        return {
          ...bookingWithoutTimestamps,
          user: {
            id: booking.user.id,
            fullName: booking.user.fullName,
            email: booking.user.email,
            avatarUrl: booking.user.avatarUrl,
          },
          trip: {
            id: booking.trip.id,
            tripName: booking.trip.tripName,
            destination: booking.trip.destination,
          },
        };
      });
    }),
  getBookingsCount: adminProcedure.query(async () => {
    const count = await prisma.booking.count();
    return {
      total: count,
      totalPages: Math.ceil(count / LIMIT),
    };
  }),
  markAsRefunded: adminProcedure
    .input(
      z.object({
        bookingId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const { bookingId } = input;
      const updatedBooking = await prisma.booking.update({
        where: { id: bookingId },
        data: { refunded: true },
      });

      if (!updatedBooking) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Booking with ID ${bookingId} not found`,
        });
      }

      return { success: true };
    }),
  fetchEnquiries: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ input }) => {
      const skip = (input.page - 1) * LIMIT;

      const enquiries = await prisma.enquiry.findMany({
        take: LIMIT,
        skip: skip,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });
      return enquiries;
    }),
  fetchEnquiriesById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { id } = input;
      const enquiry = await prisma.enquiry.findUnique({
        where: { id },
      });

      if (!enquiry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Enquiry with ID ${id} not found`,
        });
      }
      if (enquiry.status === 'NEW') {
        await prisma.enquiry.update({
          where: { id },
          data: { status: 'PENDING' },
        });
      }
      return enquiry;
    }),
  updateEnquiryStatus: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(EnquiryStatus),
        reply: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const updatedEnquiry = await prisma.enquiry.update({
          where: { id: input.id },
          data: { status: input.status, reply: input.reply },
        });
        const { subject, htmlContent } = makeMail(updatedEnquiry, input);
        sendEmail({
          to: updatedEnquiry.email,
          subject: subject,
          text: input.reply,
          html: htmlContent,
        }).catch(err => console.error('Email delivery failed:', err));

        return updatedEnquiry;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update enquiry status',
        });
      }
    }),
  getEnquiriesCount: adminProcedure.query(async () => {
    const count = await prisma.enquiry.count();
    return {
      total: count,
      totalPages: Math.ceil(count / LIMIT),
    };
  }),

  // 3. Delete an enquiry by enquiryNo
  deleteEnquiry: adminProcedure
    .input(
      z.object({
        enquiryNo: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      await prisma.enquiry.delete({
        where: {
          enquiryNo: input.enquiryNo,
        },
      });
      return { success: true };
    }),
});
