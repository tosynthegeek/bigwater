import OpenAI from "openai";
import z from "zod";

const openrouter = new OpenAI({
  apiKey: Bun.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const evaluationSchema = z.object({
  score: z.number().min(0).max(100),
  sentence: z.string(),
});

type ModelRelevanceResult = {
  model: string;
  success: boolean;

  aiConfidence?: number;
  aiVerdict?: number;
  sentence?: string;

  latencyMs: number;

  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };

  finishReason?: string;

  rawResponse?: string;

  error?: string;
};

export type BenchmarkRun = {
  id: string;
  timestamp: string;

  taskTitle: string;
  taskDescription: string;

  results: ModelRelevanceResult[];
};

const models = [
  "google/gemini-2.5-flash-lite",
  "qwen/qwen3.6-flash",
  "anthropic/claude-sonnet-4.6",
  "deepseek/deepseek-v3.2",
  "openai/gpt-5.4-nano",
  "meta-llama/llama-4-scout",
];

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
            You are evaluating whether this image is valid proof that a user completed the task.
            Task Title:
            {taskTitle}

            Task Description:
            {taskDescription}

            Produce ONE overall score from 0–100 representing your confidence that this image should be accepted as valid evidence.

            Consider all of the following:

            - How well the image demonstrates completion of the task.
            - Whether the image appears to be a genuine photograph.
            - Whether there are indicators of AI generation, fabrication, or synthetic editing.
            - Whether the image provides convincing visual evidence.

            Scoring guidance:

            90-100
            Clearly authentic and clearly demonstrates completion of the task.

            70-89
            Likely authentic and mostly demonstrates completion.

            50-69
            Some evidence exists, but there are meaningful uncertainties regarding relevance or authenticity.

            20-49
            Weak evidence. The image is substantially unrelated to the task or shows strong indicators of AI generation or fabrication.

            0-19
            The image is clearly unrelated, provides no evidence of completing the task, or is very likely AI-generated.

            Important:

            - Strong evidence of AI generation should substantially lower the score even if the image matches the task.
            - Likewise, an authentic photo that is unrelated should receive a low score.
            - If authenticity is uncertain, avoid assuming the image is AI-generated.
            - Only assign scores above 90 when both authenticity and task relevance are very strong.

            Return ONLY valid JSON:

            {
              "score": 0,
              "sentence": ""
            }

            The sentence should be a single concise explanation (maximum 25 words) explaining the main reason for the score.
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

  const rawResponse = completion.choices[0]?.message?.content ?? "{}";

  const parsed = evaluationSchema.parse(extractJson(rawResponse));

  return parsed;
}

export async function checkTaskRelevance(
  image: File,
  taskDescription: string,
  taskTitle: string,
): Promise<{ score: number; sentence: string }> {
  const buf = await image.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const mediaType = image.type;

  const result = await callModelForRelevance(
    Bun.env.OPENROUTER_MODEL,
    base64,
    mediaType,
    taskDescription,
    taskTitle,
  );

  return result;
}

function extractJson(text: string) {
  text = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {}

  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error(`No JSON found:\n${text}`);
  }

  return JSON.parse(match[0]);
}

// export async function checkTaskRelevanceAcrossModels(
//   submissionId: string,
//   image: File,
//   taskDescription: string,
//   taskTitle: string,
// ) {
//   const runId = randomUUID();

//   const buf = await image.arrayBuffer();
//   const base64 = Buffer.from(buf).toString("base64");
//   const mediaType = image.type;

//   const perModelResults = new Map<string, ModelRelevanceResult>();

//   relevanceRes.set(submissionId, perModelResults);

//   for (const model of models) {
//     try {
//       const result = await callModelForRelevance(
//         model,
//         base64,
//         mediaType,
//         taskDescription,
//         taskTitle,
//       );

//       perModelResults.set(model, {
//         model,
//         success: true,

//         aiConfidence: result.score,
//         aiVerdict: result.score,
//         sentence: result.sentence,

//         latencyMs: result.latencyMs,

//         usage: result.usage,

//         finishReason: result.finishReason,

//         rawResponse: result.rawResponse,
//       });
//     } catch (err) {
//       const error = err instanceof Error ? err.message : String(err);

//       perModelResults.set(model, {
//         model,
//         success: false,
//         latencyMs: 0,
//         error,
//       });

//       console.error(`${model} failed`, err);
//     }
//   }

//   await appendBenchmarkRun({
//     id: runId,
//     timestamp: new Date().toISOString(),

//     taskTitle,
//     taskDescription,

//     results: [...perModelResults.values()],
//   });

//   return perModelResults;
// }
