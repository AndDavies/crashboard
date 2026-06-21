import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const mediaRoot =
  process.env.MEDIA_CREATION_ROOT?.trim() ||
  "/Users/andrewdavies/Documents/Media Creation";

const ecosystemRoot =
  process.env.MEDIA_ECOSYSTEM_INDEX_ROOT?.trim() ||
  path.join(mediaRoot, "14_ComfyUI_Ecosystem_Index");

const outputRoot = path.join(
  process.cwd(),
  "src/content/media-ecosystem/generated",
);

const files = [
  ["prompt_generator/catalog.json", "catalog.json"],
  ["inventory/pod_inventory.json", "pod_inventory.json"],
  ["inventory/ecosystem_summary.md", "ecosystem_summary.md"],
  ["prompt_generator/prompt_cards.md", "prompt_cards.md"],
  ["prompt_generator/starter_packs.md", "starter_packs.md"],
] as const;

mkdirSync(outputRoot, { recursive: true });

for (const [sourceRelative, targetName] of files) {
  const source = path.join(ecosystemRoot, sourceRelative);
  const target = path.join(outputRoot, targetName);
  if (!existsSync(source)) {
    throw new Error(`Missing ecosystem index source: ${source}`);
  }
  copyFileSync(source, target);
}

console.log(`Synced ComfyUI ecosystem index from ${ecosystemRoot}`);
console.log(`Wrote ${files.length} file(s) to ${outputRoot}`);
