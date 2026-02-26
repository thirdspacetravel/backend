import { config } from '../config/env.config.js';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(config.googleClientId, config.googleClientSecret, 'postmessage');
const userOAuthRouter = Router();
userOAuthRouter.post('/auth/google', async (req: Request, res: Response) => {
  const { code } = req.body;

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const userRes = await client.request({
      url: 'https://www.googleapis.com/oauth2/v3/userinfo',
    });
    const userData = userRes.data;
    console.log('User Authenticated:', userData);
    res.status(200).json({ user: userData, tokens });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(400).json({ message: 'Authentication failed' });
  }
});
export default userOAuthRouter;
