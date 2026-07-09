import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/s3-client";
import { v4 as uuid } from "uuid";

const AWS_CLOUDFRONT_URL = Bun.env.AWS_CLOUDFRONT_URL;
const AWS_BUCKET_NAME = Bun.env.AWS_BUCKET_NAME;

export async function uploadFileToS3(imageFile: File) {
  const buffer = await imageFile.arrayBuffer();
  const object = Buffer.from(buffer);
  const key = uuid();
  const extension = imageFile.type.split("/")[1];
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
