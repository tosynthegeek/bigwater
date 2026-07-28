import Anthropic from "@anthropic-ai/sdk";
import z from "zod";

const anthropic = new Anthropic();

const relevanceSchema = z.object({
  score: z.number().min(0).max(100),
  sentence: z.string(),
});

export async function checkTaskRelevance(image: File, taskDescription: string) {
  const buf = await image.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const mediaType = toSupportedMediaType(image.type);

  const message = await anthropic.messages.create({
    model: Bun.env.CLAUDE_MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Task: "${taskDescription}"\n\nRate 0-100 how well this image satisfies the task. Respond ONLY with JSON, no markdown fences: {"score": <0-100>, "sentence": "<one sentence justification>"}`,
          },
        ],
      },
    ],
  });

  const text = message.content.find((b) => b.type === "text")?.text ?? "{}";
  return relevanceSchema.parse(JSON.parse(text));
}

const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

function toSupportedMediaType(mimeType: string): SupportedImageType {
  if ((SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    return mimeType as SupportedImageType;
  }
  throw new Error(`Unsupported image type for Claude vision: ${mimeType}`);
}
