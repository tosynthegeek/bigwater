import z from "zod";

export const submissionFileSchema = z
  .instanceof(File, { message: "Uploaded file must be a valid image." })
  .refine(
    (file) =>
      ["image/jpeg", "image/jpg", "image/png", "image/gif"].includes(file.type),
    {
      message: "Invalid image type. Only JPEG, JPG, PNG, and GIF are allowed.",
    },
  )
  .refine((file) => file.size <= 1 * 1024 * 1024, {
    message: "Image size must not exceed 1MB.",
  });
