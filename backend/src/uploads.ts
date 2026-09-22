import multer from "multer";
import { extname } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { countPdfPages } from "./pdf.js";
import { defaultLimits } from "./quota-config.js";
import { AppError } from "./errors.js";

const allowed: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/pdf": [".pdf"],
};
export function disposeUploads(files: Express.Multer.File[]) {
  for (const file of files) {
    file.buffer?.fill(0);
    file.buffer = Buffer.alloc(0);
  }
}
export function createUpload(limits = defaultLimits) {
  const storage = multer.memoryStorage();
  const remove = storage._removeFile.bind(storage);
  storage._removeFile = (req, file, cb) => {
    file.buffer?.fill(0);
    remove(req, file, cb);
  };
  return multer({
    storage,
    limits: {
      fileSize: limits.MAX_FILE_BYTES,
      files: limits.MAX_FILES,
      fields: 0,
      parts: limits.MAX_FILES + 1,
      headerPairs: limits.MULTIPART_HEADER_PAIRS,
    },
    fileFilter: (_req, file, cb) => {
      if (
        !allowed[file.mimetype]?.includes(
          extname(file.originalname).toLowerCase(),
        )
      )
        return cb(new AppError("INVALID_FILE", 415));
      cb(null, true);
    },
  }).array("files", limits.MAX_FILES);
}
export async function validateUploads(
  files: Express.Multer.File[],
  signal?: AbortSignal,
  limits = defaultLimits,
) {
  if (!files.length) throw new AppError("INVALID_REQUEST", 400);
  if (files.length > limits.MAX_FILES) throw new AppError("TOO_MANY_PAGES", 413);
  if (files.reduce((size, file) => size + file.size, 0) > limits.MAX_TOTAL_BYTES)
    throw new AppError("FILE_TOO_LARGE", 413);
  let pages = 0;
  for (const file of files) {
    if (file.size > limits.MAX_FILE_BYTES) throw new AppError("FILE_TOO_LARGE", 413);
    let detected;
    try {
      detected = await fileTypeFromBuffer(file.buffer);
    } catch {
      throw new AppError("INVALID_FILE", 415);
    }
    if (
      !detected ||
      detected.mime !== file.mimetype ||
      !allowed[file.mimetype]?.includes(
        extname(file.originalname).toLowerCase(),
      )
    )
      throw new AppError("INVALID_FILE", 415);
    if (file.mimetype === "application/pdf") {
      pages += await countPdfPages(file.buffer, signal, limits);
    } else pages++;
    if (pages > limits.MAX_PAGES) throw new AppError("TOO_MANY_PAGES", 413);
  }
}
