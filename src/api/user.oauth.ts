import { signJwt } from '../utils/jwt.js';
import { config } from '../config/env.config.js';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/database.config.js';
import type { GoogleUserInfo } from '@/types/oauth.js';
import { hashPassword } from '../utils/password.js';
import { AccountStatus } from '../generated/prisma/enums.js';
const client = new OAuth2Client(config.googleClientId, config.googleClientSecret, 'postmessage');
const userOAuthRouter = Router();
userOAuthRouter.post('/auth/google', async (req: Request, res: Response) => {
  const { code } = req.body;

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const userRes = await client.request<GoogleUserInfo>({
      url: 'https://www.googleapis.com/oauth2/v3/userinfo',
    });
    const userData = userRes.data;
    let user = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (!user) {
      const passwordHash = await hashPassword(userData.sub);
      user = await prisma.user.create({
        data: {
          fullName: userData.name,
          email: userData.email,
          passwordHash,
          status: userData.email_verified
            ? AccountStatus.VERIFIED
            : AccountStatus.PENDING_VERIFICATION,
        },
      });
    }
    const token = signJwt({
      id: user.id,
      username: user.fullName,
      role: 'user',
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    return res.status(200).json({
      success: true,
      message: 'Authentication successful',
    });
  } catch (error) {
    res.status(400).json({ message: 'Authentication failed' });
  }
});

export default userOAuthRouter;
