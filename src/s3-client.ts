import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

const AWS_BUCKET_REGION = Bun.env.AWS_BUCKET_REGION;
const AWS_ACCESS_KEY = Bun.env.AWS_ACCESS_KEY;
const AWS_ACCESS_SECRET = Bun.env.AWS_ACCESS_SECRET;

export const s3Client = new S3Client({
  region: AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_ACCESS_SECRET,
  },
} as S3ClientConfig);
