<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Media Workflow Reference

When Media Creation workflows, RunPod-visible models, favourite workflow syncs, pod smoke outputs, prompt success notes, or selected workflow recommendations change, update the dashboard workflow reference before shipping. Run `npm run media:workflows` from this repo to rebuild `src/content/media-workflows/generated/reference.json`, then verify `/dashboard/tools/workflow-reference` and `/dashboard/tools/prompt-builder` (Prompt Lab) still reflect the current project state.
