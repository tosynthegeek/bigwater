import { describe, expect, test } from "bun:test";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  detectAndValidateImage,
} from "./file-validation";

// Minimal-but-valid signatures for each allowed format, followed by a
// little padding so buffers aren't suspiciously tiny.
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
// A real minimal 1x1 PNG (file-type needs the signature plus enough of the
// IHDR chunk to confirm it, not just the 8-byte magic number).
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x04,
  0x00, 0x00, 0x00, 0xb5, 0x1c, 0x0c, 0x02, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44,
  0x41, 0x54, 0x78, 0xda, 0x63, 0x64, 0xf8, 0x0f, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x27, 0x18, 0xe3, 0x66, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
const GIF_BYTES = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
]);

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes], name, { type });
}

describe("detectAndValidateImage", () => {
  test("accepts a real JPEG", async () => {
    const result = await detectAndValidateImage(
      makeFile(JPEG_BYTES, "photo.jpg", "image/jpeg"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe("image/jpeg");
      expect(ALLOWED_IMAGE_MIME_TYPES).toContain(result.mime);
    }
  });

  test("accepts a real PNG", async () => {
    const result = await detectAndValidateImage(
      makeFile(PNG_BYTES, "photo.png", "image/png"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe("image/png");
  });

  test("rejects a real GIF — GIF is intentionally not a supported format", async () => {
    const result = await detectAndValidateImage(
      makeFile(GIF_BYTES, "photo.gif", "image/gif"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("image/gif");
    }
  });

  test("rejects a non-image file even when renamed and mislabeled as image/jpeg (the reported bug)", async () => {
    const scriptBytes = new TextEncoder().encode("#!/bin/sh\necho pwned\n");
    const spoofed = makeFile(scriptBytes, "evil.jpg", "image/jpeg");
    const result = await detectAndValidateImage(spoofed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("couldn't recognize this file as an image");
    }
  });

  test("rejects a recognized-but-unsupported image format with a specific message naming it", async () => {
    // Minimal valid WEBP: "RIFF"....."WEBP"
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20,
    ]);
    const result = await detectAndValidateImage(
      makeFile(webpBytes, "photo.png", "image/png"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("image/webp");
    }
  });

  test("rejects bytes with no recognizable signature", async () => {
    const junk = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    const result = await detectAndValidateImage(
      makeFile(junk, "junk.jpg", "image/jpeg"),
    );
    expect(result.ok).toBe(false);
  });

  test("rejects a file over the size limit, even with a valid signature", async () => {
    const oversized = new Uint8Array(MAX_IMAGE_SIZE_BYTES + 1);
    oversized.set(JPEG_BYTES, 0);
    const result = await detectAndValidateImage(
      makeFile(oversized, "big.jpg", "image/jpeg"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("1MB");
    }
  });

  // Known limitation, not a bug: signature sniffing only checks the header,
  // so a file with a valid image signature followed by other content still
  // passes here. Defeating true polyglots requires a decode/re-encode step
  // (tracked as a follow-up), not caught by this check.
  test("documents the polyglot limitation: valid JPEG header + trailing payload still passes", async () => {
    const payload = new TextEncoder().encode("<script>alert(1)</script>");
    const polyglot = new Uint8Array(JPEG_BYTES.length + payload.length);
    polyglot.set(JPEG_BYTES, 0);
    polyglot.set(payload, JPEG_BYTES.length);
    const result = await detectAndValidateImage(
      makeFile(polyglot, "polyglot.jpg", "image/jpeg"),
    );
    expect(result.ok).toBe(true);
  });
});
