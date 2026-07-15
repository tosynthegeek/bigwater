import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { mkdir } from "node:fs/promises";
import { s3Client } from "@/s3-client";
import { v4 as uuid } from "uuid";

const AWS_CLOUDFRONT_URL = Bun.env.AWS_CLOUDFRONT_URL;
const AWS_BUCKET_NAME = Bun.env.AWS_BUCKET_NAME;

// Storage driver: "s3" (default — AWS or any S3-compatible endpoint) or "local"
// (write to a directory on the host disk, served by GET /uploads/:filename).
// The local driver is a zero-dependency store for staging/demo where standing
// up S3/MinIO isn't worth it; PUBLIC_BASE_URL must be the API's public origin.
const STORAGE_DRIVER = Bun.env.STORAGE_DRIVER ?? "s3";
const UPLOAD_DIR = Bun.env.UPLOAD_DIR ?? "./uploads";
const PUBLIC_BASE_URL = Bun.env.PUBLIC_BASE_URL ?? "";

export async function uploadFileToS3(imageFile: File) {
  const key = uuid();
  const extension = imageFile.type.split("/")[1];
  const filename = `${key}.${extension}`;

  if (STORAGE_DRIVER === "local") {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await Bun.write(`${UPLOAD_DIR}/${filename}`, imageFile);
    return `${PUBLIC_BASE_URL}/uploads/${filename}`;
  }

  const buffer = await imageFile.arrayBuffer();
  const object = Buffer.from(buffer);
  const putObjectCommand = new PutObjectCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: `${key}.${extension}`,
    ContentType: imageFile.type,
    ContentEncoding: "base64",
    Body: object,
  });

  try {
    await s3Client.send(putObjectCommand);

    return `${AWS_CLOUDFRONT_URL}/${key}.${extension}`;
  } catch (error) {
    console.error("Failed to upload file to S3: ", error);
    throw new Error("Failed to upload files to S3");
  }
}

export async function deleteFileFromS3(objectKey: string) {
  const deleteObjectCommand = new DeleteObjectCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: objectKey,
  });

  try {
    await s3Client.send(deleteObjectCommand);
  } catch (error) {
    console.error("Failed to delete file from S3: ", error);
    throw new Error("Failed to delete file from S3");
  }
}
