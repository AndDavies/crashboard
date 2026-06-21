# ComfyUI Starter Packs

Use these as practical starting lanes after refreshing the ecosystem index. The goal is to reduce the number of choices you need to hold in your head.

## 1. Best Existing Avery Still Control

Use when you want a strong still-image baseline with the least setup.

- Workflow: `04_Workflows/Favourites/00_current_best/Avery_Beach_Sunset_Wet_Golden_Control_ui.json`
- Useful for: high-quality still-image controls, lighting/CFG/ControlNet learning, comparing parameter changes against a known good output.
- Prompt strategy: keep the character and photographic style stable; change one variable at a time, such as setting, lighting, lens, or pose reference.
- Watch for: seed drift, overlong prompts, ControlNet weight overpowering natural anatomy.

Prompt seed:

```text
raw photorealistic fine-art editorial photograph of Avery, clearly adult fictional woman, {pose}, {setting}, {lighting}, natural skin texture with pores, freckles and subtle color variation, realistic adult proportions, calm confident expression, documentary lens realism, tasteful non-explicit erotic muse tone
```

## 2. New Pose From OpenPose

Use when you want to choose a pose reference first, then build a scene around it.

- Workflow: `04_Workflows/Favourites/00_current_best/Avery_Yoga_06_OpenPose_NudeXL_Canopus_Current_Best_ui.json`
- API workflow: `04_Workflows/Favourites/00_current_best/Avery_Yoga_06_OpenPose_NudeXL_Canopus_Current_Best_api.json`
- Pose assets: start with `05_Favourites/assets/openpose/`
- Useful for: full-body pose experiments, control pose testing, controlled bake-offs.
- Watch for: pose references that are too compressed, impossible anatomy, and prompts that fight the pose.

Prompt seed:

```text
raw photorealistic fine-art editorial photograph of Avery, clearly adult fictional woman, exactly following the OpenPose body placement, {setting}, {lighting}, full-body composition, realistic anatomy, natural skin texture, soft imperfect human detail, tasteful non-explicit erotic muse tone
```

## 3. Preserve A Good Image And Modify It

Use when an image is mostly working and you want controlled edits without losing the character.

- Workflow: `04_Workflows/Favourites/02_refinement_candidates/Avery_Yoga_08_CurrentBest_IPA_Img2Img_w035_d180_api.json`
- Useful for: softening rendered skin, adjusting lighting, nudging identity, small scene edits.
- Watch for: denoise too high changing the pose or face; denoise too low doing nothing.

Prompt seed:

```text
preserve the source image identity, pose, body shape, camera angle, framing and lighting; change only {change_request}; photorealistic natural skin texture, subtle imperfections, realistic lens rendering
```

## 4. Tight Mask Repair

Use when only one region is wrong: feet, hands, lower body, skin texture, mask-only detail, or small anatomy repairs.

- Workflow: `04_Workflows/Favourites/03_repair_and_detail/Avery_Yoga_02_Lower_Body_Inpaint_SELECTED_E_tight_d450_api.json`
- Feet workflows: `04_Workflows/Favourites/03_repair_and_detail/Avery_Yoga_09_Feet_Anatomy_Inpaint_d360_api.json` and `04_Workflows/Favourites/03_repair_and_detail/Avery_Yoga_10_Feet_Anatomy_Inpaint_Strong_d520_api.json`
- Useful for: masked local fixes while preserving the rest of the image.
- Watch for: mask edges, mask polarity, masks accidentally painted onto the source image rather than loaded as a separate black/white mask.

Prompt seed:

```text
repair only the masked area: {repair_goal}; preserve surrounding anatomy, lighting, skin tone, texture, pose and identity
```

## 5. Detail And Upscale Pass

Use after the image is already compositionally accepted.

- Workflow: `04_Workflows/Favourites/03_repair_and_detail/Avery_Yoga_04_Local_DetailPass_Upscale_api.json`
- Useful for: final detail, export candidates, micro-texture recovery.
- Watch for: artificial sharpness, waxy skin, face drift, and overprocessing.

Prompt seed:

```text
preserve the accepted image exactly; enhance only natural photographic detail, skin micro-texture, lens realism, soft tonal separation and clean final resolution
```

## 6. Subtle Image-To-Video Motion

Use when you have an accepted still and want restrained movement.

- Search: `python3 14_ComfyUI_Ecosystem_Index/scripts/find_ecosystem.py i2v --source workflows`
- Useful for: breathing, hair movement, small camera drift, continuity tests.
- Watch for: motion blur, flicker, pose drift, body warping.

Prompt seed:

```text
preserve the source image identity, body shape, framing and lighting; subtle natural breathing, gentle hair movement, small camera drift, realistic continuity, no pose change
```

## Simple Operating Loop

1. Refresh the index.
2. Pick one starter pack.
3. Pick one workflow.
4. Pick one pose/source/mask asset.
5. Change only one prompt or parameter variable.
6. Save the output and workflow together if the result is promising.
7. Re-run the index so the new candidate becomes searchable.
