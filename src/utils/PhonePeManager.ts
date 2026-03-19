import axios from 'axios';
import crypto from 'crypto';

interface PaymentFlow {
  type: 'PG_CHECKOUT';
  message?: string;
  merchantUrls: {
    redirectUrl: string;
  };
  paymentModeConfig?: {
    enabledPaymentModes?: any[];
    disabledPaymentModes?: any[];
  };
}

interface MetaInfo {
  [key: string]: string;
}

class PhonePeManager {
  private clientId: string;
  private clientSecret: string;
  private clientVersion: string;
  private env: 'sandbox' | 'production';
  private baseUrl: string;
  private oauthUrl: string;
  private pgBaseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(
    clientId: string,
    clientSecret: string,
    clientVersion: string,
    env: 'sandbox' | 'production' = 'sandbox',
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.clientVersion = clientVersion;
    this.env = env;

    if (this.env === 'production') {
      this.baseUrl = 'https://api.phonepe.com';
      this.oauthUrl = `${this.baseUrl}/apis/identity-manager/v1/oauth/token`;
      this.pgBaseUrl = `${this.baseUrl}/apis/pg/checkout/v2`;
    } else {
      this.baseUrl = 'https://api-preprod.phonepe.com';
      this.oauthUrl = `${this.baseUrl}/apis/pg-sandbox/v1/oauth/token`;
      this.pgBaseUrl = `${this.baseUrl}/apis/pg-sandbox/checkout/v2`;
    }
  }

  /**
   * Generates or refreshes the O-Bearer Token
   */
  private async getValidToken(): Promise<string> {
    const currentTime = Math.floor(Date.now() / 1000);

    if (!this.accessToken || currentTime >= this.tokenExpiry) {
      const params = new URLSearchParams();
      params.append('client_id', this.clientId);
      params.append('client_version', this.clientVersion);
      params.append('client_secret', this.clientSecret);
      params.append('grant_type', 'client_credentials');

      try {
        const response = await axios.post(this.oauthUrl, params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        this.accessToken = response.data.access_token;
        // Use expires_at from response, fallback to 1 hour
        this.tokenExpiry = response.data.expires_at || currentTime + 3600;
      } catch (error: any) {
        throw new Error(`PhonePe OAuth Failed: ${error.response?.data?.message || error.message}`);
      }
    }

    return this.accessToken!;
  }

  /**
   * 1. Initiate Payment
   */
  async initiatePayment(payload: {
    merchantOrderId: string;
    amount: number; // in Paisa
    redirectUrl: string;
    paymentModes?: any[];
    metaInfo?: MetaInfo;
  }) {
    const token = await this.getValidToken();
    const url = `${this.pgBaseUrl}/pay`;

    const requestBody = {
      merchantOrderId: payload.merchantOrderId,
      amount: payload.amount,
      expireAfter: 900, // 15 minutes expiry
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: {
          redirectUrl: payload.redirectUrl,
        },
        ...(payload.paymentModes && {
          paymentModeConfig: { enabledPaymentModes: payload.paymentModes },
        }),
      },
      ...(payload.metaInfo && { metaInfo: payload.metaInfo }),
    };

    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `O-Bearer ${token}`,
      },
    });

    return response.data;
  }

  /**
   * 2. Check Order Status
   */
  async checkOrderStatus(merchantOrderId: string, details: boolean = false) {
    const token = await this.getValidToken();
    const url = `${this.pgBaseUrl}/order/${merchantOrderId}/status`;

    const response = await axios.get(url, {
      params: { details },
      headers: {
        'Content-Type': 'application/json',
        Authorization: `O-Bearer ${token}`,
      },
    });

    return response.data;
  }

  /**
   * 3. Handle Callback Webhook
   * PhonePe V2 Webhooks use Basic Auth or Hashed credentials.
   * Check your dashboard for the specific validation method required.
   */
  handleWebhook(authHeader: string, webhookUser: string, webhookPass: string) {
    // Standard validation: SHA256 of "user:pass"
    const expectedAuth = crypto
      .createHash('sha256')
      .update(`${webhookUser}:${webhookPass}`)
      .digest('hex');

    if (authHeader !== expectedAuth) {
      return { success: false, message: 'Invalid Authorization' };
    }

    return { success: true };
  }
}

export default PhonePeManager;
