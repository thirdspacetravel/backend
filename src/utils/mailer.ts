import { config } from './../config/env.config.js';
import nodemailer from 'nodemailer';

// Define the shape of our email options
interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html: string;
}

// 1. Create a transporter
// Replace these settings with your SMTP provider (Gmail, SendGrid, Mailtrap, etc.)

// Helper to check if we are in production
const isProduction = config.env === 'production';

const transporter = nodemailer.createTransport({
  host: config.emailHost,
  // Port must be a number; the + converts the string to a number
  port: +(config.emailPort || 587),
  // Secure is true for 465, false for other ports (like 587)
  // Here we force true in production if you're using a secure port
  secure: isProduction && config.emailPort === '465',
  auth: {
    user: config.emailUser,
    pass: config.emailPass,
  },
  // Optional: Add logging in development to see what's happening
  debug: !isProduction,
  logger: !isProduction,
});

/**
 * Sends an email using the configured transporter
 */
export const sendEmail = async ({ to, subject, text, html }: EmailOptions) => {
  try {
    const info = await transporter.sendMail({
      from: `"Your App Name" <${config.emailUser}>`,
      to,
      subject,
      text,
      html,
    });

    console.log('Message sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
};
