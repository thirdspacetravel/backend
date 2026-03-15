import { signJwt } from '../utils/jwt.js';
import { config } from '../config/env.config.js';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/database.config.js';
import type { GoogleUserInfo } from '../types/oauth.js';
import { hashPassword } from '../utils/password.js';
import { AccountStatus } from '../generated/prisma/enums.js';
import { v4 as uuidv4 } from 'uuid';
import { PERSISTENT_DIR } from '../middleware/upload.middleware.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const client = new OAuth2Client(config.googleClientId, config.googleClientSecret, 'postmessage');
const userOAuthRouter = Router();

async function downloadAvatar(url: string): Promise<string | null> {
  try {
    const fileName = `${uuidv4()}.jpg`;
    const filePath = path.join(PERSISTENT_DIR, fileName);
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
    });

    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      writer.on('finish', () => resolve(fileName));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Failed to download avatar:', error);
    return null;
  }
}

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
      let localAvatarName = null;
      if (userData.picture) {
        try {
          localAvatarName = await downloadAvatar(userData.picture);
        } catch (downloadErr) {
          console.error('Avatar download failed, proceeding without it:', downloadErr);
        }
      }
      const passwordHash = await hashPassword(userData.sub);
      user = await prisma.user.create({
        data: {
          fullName: userData.name,
          email: userData.email,
          passwordHash,
          status: userData.email_verified
            ? AccountStatus.VERIFIED
            : AccountStatus.PENDING_VERIFICATION,
          avatarUrl: localAvatarName,
        },
      });
    }
    if (user.status === AccountStatus.SUSPENDED) {
      return res.status(403).json({ message: 'Your account has been Suspended.' });
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
