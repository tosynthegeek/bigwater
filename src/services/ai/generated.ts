import { z } from "zod";

const sightengineResponseSchema = z.object({
  status: z.string(),
  type: z.object({ ai_generated: z.number() }).optional(),
});

export async function checkAiGenerated(image: File) {
  const form = new FormData();
  form.append("media", image, image.name);
  form.append("models", "genai");
  form.append("api_user", Bun.env.SIGHTENGINE_USER);
  form.append("api_secret", Bun.env.SIGHTENGINE_SECRET);

  const res = await fetch("https://api.sightengine.com/1.0/check.json", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    // Sightengine's 4xx/5xx bodies carry { error: { type, code, message } }
    // (e.g. argument_error "Incorrect API user or API secret", media_error,
    // plan_error). Without it a 400 is undiagnosable.
    throw new Error(
      `Sightengine request failed: ${res.status} ${await describeErrorBody(res)}`,
    );
  }

  const json = await res.json();
  const parsed = sightengineResponseSchema.parse(json);

  if (parsed.status !== "success" || !parsed.type) {
    throw new Error(
      `Sightengine returned non-success response: ${JSON.stringify(parsed)}`,
    );
  }

  const aiGenProbability = parsed.type.ai_generated;
  const score = Math.round((1 - aiGenProbability) * 100);
  const sentence =
    aiGenProbability > 0.7
      ? `Image shows strong indicators of AI generation (${Math.round(aiGenProbability * 100)}% probability).`
      : aiGenProbability > 0.3
        ? `Image has some indicators of AI generation (${Math.round(aiGenProbability * 100)}% probability).`
        : `Image appears authentic (${Math.round(aiGenProbability * 100)}% AI-generation probability).`;

  return { score, sentence };
}

async function describeErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const body = JSON.parse(text) as {
        error?: { type?: string; code?: number; message?: string };
      };
      if (body.error) {
        const { type, code, message } = body.error;
        return `(${type ?? "unknown_error"}/${code ?? "?"}: ${message ?? "no message"})`;
      }
    } catch {
      // not JSON — fall through to the raw text
    }
    return `(body: ${text.slice(0, 300)})`;
  } catch {
    return "(could not read response body)";
  }
}
