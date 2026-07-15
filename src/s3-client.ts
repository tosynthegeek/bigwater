import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

const AWS_BUCKET_REGION = Bun.env.AWS_BUCKET_REGION;
const AWS_ACCESS_KEY = Bun.env.AWS_ACCESS_KEY;
const AWS_ACCESS_SECRET = Bun.env.AWS_ACCESS_SECRET;

// Optional custom endpoint for any S3-compatible store (MinIO, Cloudflare R2,
// Supabase Storage, Backblaze B2, ...). When unset, the SDK talks to real AWS
// S3, so production can switch to native AWS with only env changes. Path-style
// addressing is required by most non-AWS providers (no virtual-hosted
// <bucket>.<host> style), so force it whenever a custom endpoint is set.
const AWS_S3_ENDPOINT = Bun.env.AWS_S3_ENDPOINT;

export const s3Client = new S3Client({
  region: AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_ACCESS_SECRET,
  },
  ...(AWS_S3_ENDPOINT
    ? { endpoint: AWS_S3_ENDPOINT, forcePathStyle: true }
    : {}),
} as S3ClientConfig);
