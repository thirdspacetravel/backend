import PaytmChecksum, { type PaytmParamsBody } from 'paytmchecksum';

export interface PaytmCallbackResponse {
  MID: string;
  ORDERID: string;
  TXNAMOUNT: string;
  CURRENCY: string;
  STATUS: string;
  RESPCODE: string;
  RESPMSG: string;
  BANKTXNID: string;
  TXNDATE: string;
  GATEWAYNAME: string;
  BANKNAME: string;
  PAYMENTMODE: string;
  CHECKSUMHASH: string;
  [key: string]: string;
}

export const PaytmHelper = {
  generateSignature: async (
    paytmParamsBody: PaytmParamsBody,
    merchantKey: string,
  ): Promise<string> => {
    try {
      const checksum = await PaytmChecksum.generateSignature(
        JSON.stringify(paytmParamsBody),
        merchantKey,
      );
      return checksum;
    } catch (error) {
      throw new Error('Checksum Generation Failed: ' + (error as Error).message);
    }
  },
  verifySignature: async (
    responseData: Record<string, string>,
    merchantKey: string,
    checksumHash: string,
  ): Promise<boolean> => {
    const dataToVerify = { mid: responseData.MID, orderId: responseData.ORDERID };
    const isVerified = PaytmChecksum.verifySignature(
      JSON.stringify(dataToVerify),
      merchantKey,
      checksumHash,
    );
    return isVerified;
  },
};
