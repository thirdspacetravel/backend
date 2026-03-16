import { TRPCError } from '@trpc/server';
import { prisma } from '../../config/database.config.js';
import { router, adminProcedure, publicProcedure } from '../trpc.js';
import z from 'zod';
import fs from 'fs';
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
import { StorageManager } from '../../utils/StorageManager.js';
import { getDifference } from '../../utils/getdiff.js';
import path from 'path';
import { stringify } from 'csv-stringify';
import {
  getBookingSearchWhere,
  getEnquirySearchWhere,
  getTripSearchWhere,
  getUserSearchWhere,
} from '../../utils/where.prisma.js';
import { get } from 'http';
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
    .mutation(async ({ input, ctx }) => {
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
      const oldadmin = await prisma.adminUser.findUnique({
        where: { id: ctx.user.id },
        select: {
          avatarUrl: true,
        },
      });
      if (!oldadmin) {
        throw new TRPCError({ message: 'Admin not found', code: 'NOT_FOUND' });
      }
      try {
        const updatedAdmin = await prisma.adminUser.update({
          where: { id },
          data: updateData,
        });
        const { passwordHash: _, ...result } = updatedAdmin;
        if (updatedAdmin.avatarUrl !== oldadmin.avatarUrl) {
          if (oldadmin.avatarUrl) {
            try {
              await StorageManager.deletePersistentFile(oldadmin.avatarUrl);
            } catch (err: unknown) {
              if (err instanceof Error) {
                console.error(`Failed to delete image ${oldadmin.avatarUrl}:`, err.message);
              } else {
                console.error(`An unexpected error occurred:`, err);
              }
            }
          }
          if (updatedAdmin.avatarUrl) {
            try {
              await StorageManager.persistFile(updatedAdmin.avatarUrl);
            } catch (err: unknown) {
              if (err instanceof Error) {
                console.error(`Failed to move image ${updatedAdmin.avatarUrl}:`, err.message);
              } else {
                console.error(`An unexpected error occurred:`, err);
              }
            }
          }
        }
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
        keyword: z.string().optional(),
        status: z.enum(TripStatus).optional(),
      }),
    )
    .query(async ({ input }) => {
      const skip = (input.page - 1) * LIMIT;

      const where = getTripSearchWhere(input.keyword);

      const trips = await prisma.trip.findMany({
        where,
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

  getTripsCount: adminProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where = getTripSearchWhere(input.keyword);
      const count = await prisma.trip.count({ where });

      return {
        total: count,
        totalPages: Math.ceil(count / LIMIT),
      };
    }),
  fetchUsers: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        keyword: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const skip = (input.page - 1) * LIMIT;
      const where: Prisma.UserWhereInput = getUserSearchWhere(input.keyword);
      const users = await prisma.user.findMany({
        where,
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

  getUsersCount: adminProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where: Prisma.UserWhereInput = getUserSearchWhere(input.keyword);

      const count = await prisma.user.count({ where });
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
      const oldtrip = await prisma.trip.findUnique({ where: { id: input.id } });
      if (!oldtrip) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Trip with ID ${input.id} not found`,
        });
      }
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
      const oldimages = oldtrip.images as unknown as string[];
      const newimages = input.images as unknown as string[];
      const removedImages = getDifference(oldimages, newimages);
      const addedImages = getDifference(newimages, oldimages);
      if (removedImages.length > 0) {
        for (const img of removedImages) {
          try {
            await StorageManager.deletePersistentFile(img);
          } catch (err: unknown) {
            if (err instanceof Error) {
              console.error(`Failed to delete image ${img}:`, err.message);
            } else {
              console.error(`An unexpected error occurred:`, err);
            }
          }
        }
      }
      if (addedImages.length > 0) {
        for (const img of addedImages) {
          try {
            await StorageManager.persistFile(img);
          } catch (err: unknown) {
            if (err instanceof Error) {
              console.error(`Failed to move image ${img}:`, err.message);
            } else {
              console.error(`An unexpected error occurred:`, err);
            }
          }
        }
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
        keyword: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const skip = (input.page - 1) * LIMIT;
      const where = getBookingSearchWhere(input.keyword);
      const bookings = await prisma.booking.findMany({
        where,
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
  getBookingsCount: adminProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where = getBookingSearchWhere(input.keyword);
      const count = await prisma.booking.count({ where });
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
        keyword: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const skip = (input.page - 1) * LIMIT;
      const where = getEnquirySearchWhere(input.keyword);
      const enquiries = await prisma.enquiry.findMany({
        where,
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
  getEnquiriesCount: adminProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where = getEnquirySearchWhere(input.keyword);
      const count = await prisma.enquiry.count({ where });
      return {
        total: count,
        totalPages: Math.ceil(count / LIMIT),
      };
    }),

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
  exportBookings: publicProcedure.mutation(async () => {
    // 1. Internal Configuration
    const targetFolder = path.join(process.cwd(), 'uploads', 'tmp');
    // Adding a timestamp prevents file name collisions
    const internalFilename = `bookings_export_${Date.now()}.csv`;
    const filePath = path.join(targetFolder, internalFilename);

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const writableStream = fs.createWriteStream(filePath);
    const stringifier = stringify({ header: true });

    // 2. Wrap in Promise to ensure completion before responding
    const result = await new Promise<{ success: boolean; url: string }>((resolve, reject) => {
      stringifier.pipe(writableStream);

      // Standard Node.js error handling for streams
      writableStream.on('error', err => reject(err));
      stringifier.on('error', err => reject(err));

      // This fires when the file is fully written
      writableStream.on('finish', () => {
        resolve({
          success: true,
          url: `/exports/${internalFilename}`,
        });
      });

      // 3. Database Streaming Logic
      (async () => {
        try {
          let cursor: { id: string } | undefined = undefined;
          const batchSize = 2500;

          while (true) {
            const args: Prisma.BookingFindManyArgs = {
              take: batchSize,
              orderBy: { id: 'asc' },
            };
            if (cursor) {
              args.cursor = cursor;
              args.skip = 1; // Skip the cursor element itself
            }

            const bookings = await prisma.booking.findMany(args);

            if (bookings.length === 0) break;
            bookings.forEach(booking => stringifier.write(booking));
            const lastBooking = bookings[bookings.length - 1];
            cursor = lastBooking && lastBooking.id ? { id: lastBooking.id } : undefined;
          }
          stringifier.end();
        } catch (dbError) {
          stringifier.destroy();
          reject(dbError);
        }
      })();
    });

    return result;
  }),
});
