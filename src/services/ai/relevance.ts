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

type ModelRelevanceResult = {
  model: string;
  aiConfidence: number;
  aiVerdict: number;
  sentence: string;
};

const models = [""];
export const relevanceRes = new Map<
  string,
  Map<string, ModelRelevanceResult>
>();

function buildRelevanceMessages(
  base64: string,
  mediaType: string,
  taskDescription: string,
  taskTitle: string,
) {
  return [
    {
      role: "user" as const,
      content: [
        {
          type: "image_url" as const,
          image_url: {
            url: `data:${mediaType};base64,${base64}`,
          },
        },
        {
          type: "text" as const,
          text: `
            Task Title: ${taskTitle}
            Task Description:
            ${taskDescription}

            Evaluate how well this image satisfies the task.

            Return ONLY valid JSON in the following format:

            {
              "score": <integer between 0 and 100>,
              "sentence": "<one concise sentence explaining the score>"
            }

            Scoring guidelines:
            - 90-100: Clearly completes the task.
            - 70-89: Mostly completes the task with minor issues.
            - 40-69: Some relation to the task but significant issues.
            - 1-39: Weakly related or poor evidence.
            - 0: Completely unrelated.
          `.trim(),
        },
      ],
    },
  ];
}

async function callModelForRelevance(
  model: string,
  base64: string,
  mediaType: string,
  taskDescription: string,
  taskTitle: string,
) {
  const completion = await openrouter.chat.completions.create({
    model,
    max_tokens: 200,
    messages: buildRelevanceMessages(
      base64,
      mediaType,
      taskDescription,
      taskTitle,
    ),
  });

  const text = completion.choices[0]?.message?.content ?? "{}";
  return relevanceSchema.parse(JSON.parse(text));
}

export async function checkTaskRelevance(
  image: File,
  taskDescription: string,
  taskTitle: string,
) {
  const buf = await image.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const mediaType = image.type;

  return callModelForRelevance(
    Bun.env.OPENROUTER_MODEL,
    base64,
    mediaType,
    taskDescription,
    taskTitle,
  );
}

export async function checkTaskRelevanceAcrossModels(
  submissionId: string,
  image: File,
  taskDescription: string,
  taskTitle: string,
) {
  const buf = await image.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const mediaType = image.type;

  const perModelResults = new Map<string, ModelRelevanceResult>();
  relevanceRes.set(submissionId, perModelResults);

  for (const model of models) {
    if (!model) continue;

    try {
      const { score, sentence } = await callModelForRelevance(
        model,
        base64,
        mediaType,
        taskDescription,
        taskTitle,
      );

      perModelResults.set(model, {
        model,
        aiConfidence: score,
        aiVerdict: score,
        sentence,
      });
    } catch (error) {
      console.error(
        `checkTaskRelevanceAcrossModels: model "${model}" failed`,
        error,
      );
    }
  }

  return perModelResults;
}
