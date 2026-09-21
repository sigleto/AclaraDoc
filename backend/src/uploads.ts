import multer from "multer";
import { extname } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { countPdfPages } from "./pdf.js";
import { LIMITS } from "../../shared/analysis.js";
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
export function createUpload() {
  const storage = multer.memoryStorage();
  const remove = storage._removeFile.bind(storage);
  storage._removeFile = (req, file, cb) => {
    file.buffer?.fill(0);
    remove(req, file, cb);
  };
  return multer({
    storage,
    limits: {
      fileSize: LIMITS.fileBytes,
      files: LIMITS.files,
      fields: 0,
      parts: LIMITS.files + 1,
      headerPairs: 30,
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
  }).array("files", LIMITS.files);
}
export async function validateUploads(
  files: Express.Multer.File[],
  signal?: AbortSignal,
) {
  if (!files.length) throw new AppError("INVALID_REQUEST", 400);
  if (files.length > LIMITS.files) throw new AppError("TOO_MANY_PAGES", 413);
  if (files.reduce((size, file) => size + file.size, 0) > LIMITS.totalBytes)
    throw new AppError("FILE_TOO_LARGE", 413);
  let pages = 0;
  for (const file of files) {
    if (file.size > LIMITS.fileBytes) throw new AppError("FILE_TOO_LARGE", 413);
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
      pages += await countPdfPages(file.buffer, signal);
    } else pages++;
    if (pages > LIMITS.pages) throw new AppError("TOO_MANY_PAGES", 413);
  }
}
