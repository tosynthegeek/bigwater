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

import { randomUUID } from "crypto";
import { appendBenchmarkRun } from "@/utils/benchmark";

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
  const started = performance.now();
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

  const latencyMs = performance.now() - started;

  const rawResponse = completion.choices[0]?.message?.content ?? "{}";

  const parsed = relevanceSchema.parse(extractJson(rawResponse));

  return {
    ...parsed,
    latencyMs,
    usage: {
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
    },
    finishReason: completion.choices[0]?.finish_reason,
    rawResponse,
  };
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
  const runId = randomUUID();

  const buf = await image.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const mediaType = image.type;

  const perModelResults = new Map<string, ModelRelevanceResult>();

  relevanceRes.set(submissionId, perModelResults);

  for (const model of models) {
    try {
      const result = await callModelForRelevance(
        model,
        base64,
        mediaType,
        taskDescription,
        taskTitle,
      );

      perModelResults.set(model, {
        model,
        success: true,

        aiConfidence: result.score,
        aiVerdict: result.score,
        sentence: result.sentence,

        latencyMs: result.latencyMs,

        usage: result.usage,

        finishReason: result.finishReason,

        rawResponse: result.rawResponse,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);

      perModelResults.set(model, {
        model,
        success: false,
        latencyMs: 0,
        error,
      });

      console.error(`${model} failed`, err);
    }
  }

  await appendBenchmarkRun({
    id: runId,
    timestamp: new Date().toISOString(),

    taskTitle,
    taskDescription,

    results: [...perModelResults.values()],
  });

  return perModelResults;
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
