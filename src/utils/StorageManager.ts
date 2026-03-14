import { TMP_DIR, PERSISTENT_DIR } from '../middleware/upload.middleware.js';
import fs from 'fs/promises';
import path from 'path';

export class StorageManager {
  static async persistFile(fileName: string): Promise<void> {
    const tmpPath = path.join(TMP_DIR, fileName);
    const destPath = path.join(PERSISTENT_DIR, fileName);

    try {
      await fs.rename(tmpPath, destPath);
    } catch (error) {
      throw new Error(`Failed to persist file: ${fileName}. Ensure it exists in tmp.`);
    }
  }

  static async runGarbageCollection(maxAgeMs: number = 2 * 60 * 60 * 1000): Promise<void> {
    try {
      const files = await fs.readdir(TMP_DIR);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(TMP_DIR, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      console.error('GC Error:', error);
    }
  }
  static async deletePersistentFile(fileName: string): Promise<void> {
    const filePath = path.join(PERSISTENT_DIR, fileName);

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      console.log(`Successfully deleted persistent file: ${fileName}`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.warn(`File not found, nothing to delete: ${fileName}`);
      } else {
        throw new Error(`Failed to delete persistent file: ${error.message}`);
      }
    }
  }
}
