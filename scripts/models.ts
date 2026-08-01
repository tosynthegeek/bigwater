import { checkTaskRelevanceAcrossModels } from "@/services/ai/relevance";

const image = Bun.file(import.meta.dir + "/proof.png");

const file = new File([await image.arrayBuffer()], "proof.png", {
  type: image.type || "image/png",
});

const result = await checkTaskRelevanceAcrossModels(
  "local-test",
  file,
  `
Take a picture of yourself planting a tree.
`,
  "Plant a Tree",
);

console.dir(result, { depth: null });
