import type { BenchmarkRun } from "@/services/ai/relevance";

const BENCHMARK_FILE = "./benchmarks.json";

export async function appendBenchmarkRun(run: BenchmarkRun) {
  let data: { runs: BenchmarkRun[] } = {
    runs: [],
  };

  const file = Bun.file(BENCHMARK_FILE);

  if (await file.exists()) {
    data = await file.json();
  }

  data.runs.push(run);

  await Bun.write(BENCHMARK_FILE, JSON.stringify(data, null, 2));
}
