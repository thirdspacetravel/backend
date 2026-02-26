export interface GoogleUserInfo {
  sub: string; // Unique identifier for the user
  name: string;
  given_name: string;
  family_name: string;
  picture: string; // URL to profile photo
  email: string;
  email_verified: boolean;
  locale?: string;
}
