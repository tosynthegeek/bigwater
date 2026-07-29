import OpenAI from "openai";
import z from "zod";

const openrouter = new OpenAI({
  apiKey: Bun.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});
const relevanceSchema = z.object({
  score: z.number().min(0).max(100),
  sentence: z.string(),
});

export async function checkTaskRelevance(image: File, taskDescription: string) {
  const buf = await image.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const mediaType = image.type;

  const completion = await openrouter.chat.completions.create({
    model: Bun.env.OPENROUTER_MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mediaType};base64,${base64}` },
          },
          {
            type: "text",
            text: `Task: "${taskDescription}"\n\nRate 0-100 how well this image satisfies the task. Respond ONLY with JSON, no markdown fences: {"score": <0-100>, "sentence": "<one sentence justification>"}`,
          },
        ],
      },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "{}";
  return relevanceSchema.parse(JSON.parse(text));
}
