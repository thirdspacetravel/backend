import { prisma } from '../config/database.config.js';
import { config } from '../config/env.config.js';
import { PaytmHelper } from '../utils/paytmHelpher.js';
import { Router } from 'express';

const paytmRouter = Router();

paytmRouter.post('/callback', async (req, res) => {
  const receivedData = req.body as Record<string, any>;
  const existingBooking = await prisma.booking.findUnique({
    where: { id: receivedData.ORDERID },
  });

  if (!existingBooking) {
    res.status(404).send('Booking not found');
  }

  const checksumHash = receivedData.CHECKSUMHASH;

  if (!checksumHash) {
    return res.status(400).send('Missing CHECKSUMHASH');
  }

  // 4. Verify Signature (assuming sync based on lib behavior)
  const isValid = await PaytmHelper.verifySignature(
    receivedData,
    config.paytmMerchantKey,
    checksumHash,
  );
  if (isValid) {
    await prisma.booking.update({
      where: { id: receivedData.ORDERID },
      data: {
        resultStatus: receivedData.STATUS,
        txnId: receivedData.TXNID || `MOCK_TXN_${Date.now()}`,
        bankTxnId: receivedData.BANKTXNID || `MOCK_BANK_TXN_${Date.now()}`,
        gatewayName: receivedData.GATEWAYNAME || 'MOCK_GATEWAY',
        paymentMode: receivedData.PAYMENTMODE || 'MOCK_PAYMENT_MODE',
        txnDate: receivedData.TXNDATE,
      },
    });
    res.send('Callback Processed');
  } else {
    console.error('Invalid Signature detected');
    res.status(400).send('Invalid Signature');
  }
});

export default paytmRouter;
