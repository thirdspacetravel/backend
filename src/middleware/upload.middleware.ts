import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const TMP_DIR = path.join(UPLOAD_DIR, 'tmp');
const PERSISTENT_DIR = path.join(UPLOAD_DIR, 'persistent');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}
if (!fs.existsSync(PERSISTENT_DIR)) {
  fs.mkdirSync(PERSISTENT_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, TMP_DIR),
  filename: (_, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(null, true);
  },
});

export { UPLOAD_DIR, TMP_DIR, PERSISTENT_DIR };
