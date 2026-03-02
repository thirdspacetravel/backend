import { AccountStatus, Gender, MaritalStatus, ContactMethod } from '../generated/prisma/client.js';
// Define the input structure based on your data
interface UserProfileInput {
  email: string;
  passwordHash: string;
  fullName: string;
  dateOfBirth: Date | null;
  gender: Gender | null;
  nationality: string | null;
  maritalStatus: MaritalStatus | null;
  anniversaryDate: Date | null;
  avatarUrl: string | null;
  phoneNumber: string | null;
  altPhoneNumber: string | null;
  alternateEmail: string | null;
  upiId: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  status: AccountStatus;
  preferredContact: ContactMethod;
  receiveTripUpdates: boolean;
  receivePromoEmails: boolean;
}

export function validateUserProfile(data: Partial<UserProfileInput>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // --- Helper: Check if string is null, undefined, or empty after trim ---
  const isInvalidString = (value: any) =>
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim().length === 0);

  // --- Helper: Check if value is null or undefined ---
  const isMissing = (value: any) => value === null || value === undefined;

  // --- Strict Validation for Required Fields ---
  if (isInvalidString(data.email)) errors.push('Email is required.');
  if (isInvalidString(data.passwordHash)) errors.push('Password hash is required.');
  if (isInvalidString(data.fullName)) errors.push('Full name is required.');

  if (isMissing(data.dateOfBirth)) errors.push('Date of birth is required.');
  if (isMissing(data.gender)) errors.push('Gender is required.');
  if (isInvalidString(data.nationality)) errors.push('Nationality is required.');
  if (isMissing(data.maritalStatus)) errors.push('Marital status is required.');
  if (isMissing(data.anniversaryDate)) errors.push('Anniversary date is required.');
  if (isInvalidString(data.phoneNumber)) errors.push('Phone number is required.');
  if (isInvalidString(data.upiId)) errors.push('UPI ID is required.');
  if (isInvalidString(data.streetAddress)) errors.push('Street address is required.');
  if (isInvalidString(data.city)) errors.push('City is required.');
  if (isInvalidString(data.state)) errors.push('State is required.');
  if (isInvalidString(data.country)) errors.push('Country is required.');
  if (isInvalidString(data.zipCode)) errors.push('Zip code is required.');

  // --- Optional Fields (Allowed to be null) ---
  // No validation needed for alternateEmail and altPhoneNumber

  return {
    isValid: errors.length === 0,
    errors,
  };
}
