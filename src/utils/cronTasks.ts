import cron from 'node-cron';
import { StorageManager } from './StorageManager.js';
import { prisma } from '../config/database.config.js';
import { TransactionStatus } from '../generated/prisma/browser.js';
import { phonePeProvider } from './phonepe.service.js';

export const initCronJobs = () => {
  cron.schedule('0 * * * *', async () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Starting hourly garbage collection...`);

    try {
      await StorageManager.runGarbageCollection();
      console.log(`[${timestamp}] GC completed.`);
    } catch (error) {
      console.error(`[${timestamp}] GC failed:`, error);
    }
  });
  cron.schedule('*/5 * * * *', async () => {
    console.log('--- Starting Status Sync for Pending Transactions ---');

    try {
      // 1. Fetch all pending transactions from your DB
      const pendingOrders = await prisma.booking.findMany({
        where: {
          resultStatus: TransactionStatus.TXN_PENDING,
        },
        // Optional: only check orders created in the last 24 hours to save API calls
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      if (pendingOrders.length === 0) {
        console.log('No pending transactions found.');
        return;
      }

      for (const order of pendingOrders) {
        try {
          // 2. Check status via PhonePe Manager
          const response = await phonePeProvider.checkOrderStatus(order.id);
          // 3. Map PhonePe states to your TransactionStatus enum
          let newStatus: TransactionStatus = TransactionStatus.TXN_PENDING;

          if (response.state === 'COMPLETED') {
            newStatus = TransactionStatus.TXN_SUCCESS;
          } else if (response.state === 'FAILED') {
            newStatus = TransactionStatus.TXN_FAILURE;
          }

          // 4. Update DB if the status has changed
          if (newStatus !== TransactionStatus.TXN_PENDING) {
            await prisma.booking.update({
              where: { id: order.id },
              data: {
                resultStatus: newStatus,
                txnId: response.paymentDetails[0]?.transactionId,
                txnDate: new Date(response.paymentDetails[0]?.timestamp || Date.now()),
              },
            });
            console.log(`Updated Order ${order.id} to ${newStatus}`);
          }
        } catch (error) {
          console.error(`Failed to sync order ${order.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Cron job failed:', error);
    }
  });
};
