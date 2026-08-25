import { fileTypeFromBuffer } from "file-type";

// Authoritative image-upload validation. This is the security boundary for
// user-submitted proof images (POST /api/submissions/send and the Telegram
// submission path) — it inspects actual file bytes (magic-number sniffing),
// never the client-supplied `file.type`/filename, which is fully
// attacker-controlled (e.g. a script renamed to "evil.jpg" reports
// `image/jpeg` from the browser regardless of its real content).
//
// Known limitation: signature sniffing only proves the file *starts* with a
// valid image header — it does not defend against polyglots (e.g. a valid
// image header followed by an embedded script). Defeating that requires
// decode-then-re-encode (e.g. via `sharp`), tracked as a follow-up.
//
// GIF is intentionally not supported — product decision.
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"] as const;

export const MAX_IMAGE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB, matches the product limit

export type ImageValidationResult =
  | { ok: true; mime: (typeof ALLOWED_IMAGE_MIME_TYPES)[number]; ext: string }
  | { ok: false; reason: string };

export async function detectAndValidateImage(
  file: File,
): Promise<ImageValidationResult> {
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { ok: false, reason: "Image size must not exceed 1MB." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);

  // This checks the file's actual bytes, not its extension or the
  // browser-reported `file.type` — so a file named "photo.png" can still
  // land here if its real content isn't a PNG (a mislabeled/converted file,
  // one mangled by a screenshot/clipboard tool, or an unsupported format
  // like WEBP/HEIC/BMP saved with a ".png" name). Say what we actually saw
  // so a legitimate-looking rejection is diagnosable, not just "invalid".
  if (!detected) {
    return {
      ok: false,
      reason:
        "We couldn't recognize this file as an image. It may be corrupted, or not actually an image — try re-saving or re-exporting it and uploading again.",
    };
  }

  if (
    !ALLOWED_IMAGE_MIME_TYPES.includes(
      detected.mime as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
    )
  ) {
    return {
      ok: false,
      reason: `This file's content is actually ${detected.mime} (.${detected.ext}), not JPEG or PNG. Please convert it or choose a different photo.`,
    };
  }

  return {
    ok: true,
    mime: detected.mime as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
    ext: detected.ext,
  };
}
