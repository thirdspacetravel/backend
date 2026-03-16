import type { Prisma } from '../generated/prisma/client.js';

export function getTripSearchWhere(keyword?: string): Prisma.TripWhereInput {
  if (!keyword || keyword.trim() === '') return {};

  const search = keyword.trim();
  const searchLower = search.toLowerCase();

  // Check if it's a valid ID search trigger
  // We check if it starts with # AND (is just a partial prefix OR starts with #tr)
  const isIdSearch =
    searchLower.startsWith('#') &&
    (searchLower === '#' || '#tr-'.startsWith(searchLower) || searchLower.startsWith('#tr'));

  if (isIdSearch) {
    // 1. Strip the prefix '#tr-' (case insensitive)
    let idPart = search.replace(/^#tr-?/i, '');

    // Also handle if they just typed '#' or '#t' which doesn't match the regex above
    if (idPart.startsWith('#')) {
      idPart = idPart.replace(/^#t?/i, '');
    }

    // 2. Remove hyphens from the user input to match raw DB IDs
    const sanitizedId = idPart.replace(/-/g, '');

    // 3. If they typed characters after the prefix, filter by ID
    if (sanitizedId.length > 0) {
      return {
        id: {
          startsWith: sanitizedId,
        },
      };
    }

    // If it was just "#", "#t", or "#tr-", return empty (matches all rows)
    return {};
  }

  // Normal Search Mode (for "London" or "#fgh" or "Trip 101")
  return {
    OR: [{ tripName: { contains: search } }, { destination: { contains: search } }],
  };
}

export function getUserSearchWhere(keyword?: string): Prisma.UserWhereInput {
  if (!keyword || keyword.trim() === '') return {};

  const search = keyword.trim();
  const searchLower = search.toLowerCase();

  // Define the target prefix
  const prefix = '#cst-';

  // Check if it's a valid ID search trigger:
  // 1. Starts with #
  // 2. AND is either a partial of "#cst-" (like "#cs") OR starts with "#cst"
  const isIdSearch =
    searchLower.startsWith('#') &&
    (prefix.startsWith(searchLower) || searchLower.startsWith('#cst'));

  if (isIdSearch) {
    // 1. Strip the prefix "#cst-" (case insensitive)
    // This handles #, #c, #cs, #cst, and #cst-
    const idPart = search.replace(/^#cst-?/i, '').replace(/^#c?s?t?/i, ''); // Cleanup for partials

    // 2. Remove internal hyphens to match raw database IDs
    const sanitizedId = idPart.replace(/-/g, '');

    // 3. Search ID if user provided characters after the prefix
    if (sanitizedId.length > 0) {
      return {
        id: {
          startsWith: sanitizedId,
        },
      };
    }

    // Return empty filter for just the prefix (shows all users)
    return {};
  }

  // Normal Search Mode: fullName or email
  return {
    OR: [{ fullName: { contains: search } }, { email: { contains: search } }],
  };
}

export function getEnquirySearchWhere(keyword?: string): Prisma.EnquiryWhereInput {
  if (!keyword || keyword.trim() === '') return {};

  const search = keyword.trim();
  const searchLower = search.toLowerCase();

  // Define the target prefix for Enquiries
  const prefix = '#enq-';

  // Logic:
  // 1. Must start with '#'
  // 2. Must either be a partial of "#enq-" (e.g., "#en") OR start with "#enq"
  const isIdSearch =
    searchLower.startsWith('#') &&
    (prefix.startsWith(searchLower) || searchLower.startsWith('#enq'));

  if (isIdSearch) {
    // 1. Strip the prefix "#enq-" or partials "#e", "#en", "#enq"
    let idPart = search.replace(/^#enq-?/i, '');

    // Safety check for very short partials like "#e" or "#en"
    if (idPart.startsWith('#')) {
      idPart = idPart.replace(/^#e?n?q?/i, '');
    }

    // 2. Remove hyphens to match the raw database ID format
    const sanitizedId = idPart.replace(/-/g, '');

    // 3. Search ID if there are characters after the prefix
    // If it's just "#enq-", it returns an empty object (shows all)
    if (sanitizedId.length > 0) {
      return {
        id: {
          startsWith: sanitizedId,
        },
      };
    }

    return {};
  }

  // Fallback: Normal search for names or emails
  return {
    OR: [{ fullName: { contains: search } }, { email: { contains: search } }],
  };
}

export function getBookingSearchWhere(keyword?: string): Prisma.BookingWhereInput {
  if (!keyword || keyword.trim() === '') return {};

  const search = keyword.trim();
  const searchLower = search.toLowerCase();
  const prefix = '#bk-';

  // 1. Check if it's an ID search trigger (#, #b, #bk, #bk-)
  const isIdSearch =
    searchLower.startsWith('#') &&
    (prefix.startsWith(searchLower) || searchLower.startsWith('#bk'));

  if (isIdSearch) {
    // Strip prefix and partials
    const idPart = search.replace(/^#bk-?/i, '').replace(/^#b?k?/i, '');

    // Remove hyphens to match the raw UUID in the database
    const sanitizedId = idPart.replace(/-/g, '');

    if (sanitizedId.length > 0) {
      return {
        id: {
          startsWith: sanitizedId,
        },
      };
    }
    // If just the prefix is typed, return everything
    return {};
  }

  // 2. Fallback: Search across relations (User and Trip)
  return {
    OR: [
      {
        user: {
          fullName: { contains: search },
        },
      },
      {
        trip: {
          OR: [{ tripName: { contains: search } }, { destination: { contains: search } }],
        },
      },
    ],
  };
}
