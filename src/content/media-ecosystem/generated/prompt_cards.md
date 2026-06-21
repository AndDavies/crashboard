# Prompt Generator Feed

Generated: 2026-06-21T20:19:18-03:00

Use `catalog.json` as the machine-readable source for your prompt generator.

## Prompt Templates

### adult_fine_art_still

Still-image prompt template for fictional adult fine-art editorial work.

**Positive**

```text
raw photorealistic fine-art editorial photograph of {avatar}, clearly adult fictional subject, {pose}, {setting}, {lighting}, natural skin texture, realistic proportions, calm confident expression, documentary lens realism, tasteful non-explicit erotic muse tone
```

**Negative**

```text
minor, teen, child, youth-coded, celebrity, public figure, real person likeness, explicit sex act, pornographic close-up, other people, clothing if not intended, cropped body, bad anatomy, plastic skin, CGI, watermark, text
```

### source_preserving_img2img

Img2img template for modifying an accepted source image without losing composition.

**Positive**

```text
preserve the source image identity, pose, camera angle, framing and lighting; change only {change_request}; photorealistic natural skin texture, subtle imperfections, realistic lens rendering
```

**Negative**

```text
changed pose, changed camera angle, changed face, changed body shape, plastic skin, over-smoothed, heavy retouching, bad anatomy, text, watermark
```

### masked_repair

Inpaint template for local repairs with a tight mask.

**Positive**

```text
repair only the masked area: {repair_goal}; preserve surrounding anatomy, lighting, skin tone, texture, pose and identity
```

**Negative**

```text
hard mask edge, color patch, red paint, overlay, changed pose, changed face, changed body, plastic skin, extra limbs, text, watermark
```

### i2v_subtle_motion

Image-to-video template for subtle motion tests from an accepted keyframe.

**Positive**

```text
preserve the source image identity, body shape, framing and lighting; subtle natural breathing, gentle hair movement, small camera drift, realistic continuity, no pose change
```

**Negative**

```text
warped body, changed face, changed pose, sudden camera jump, blur, flicker, melted anatomy, extra limbs, text, watermark
```

## Suggested Starting Workflows

- `04_Workflows/Favourites/00_current_best/Avery_Beach_Sunset_Wet_Golden_Control_ui.json` - masked_inpaint_or_repair / current_best_or_selected
- `04_Workflows/Favourites/00_current_best/Avery_Yoga_06_OpenPose_NudeXL_Canopus_Current_Best_api.json` - openpose_or_controlnet / current_best_or_selected
- `04_Workflows/Favourites/00_current_best/Avery_Yoga_06_OpenPose_NudeXL_Canopus_Current_Best_ui.json` - masked_inpaint_or_repair / current_best_or_selected
- `04_Workflows/Favourites/01_controls/Avery_Beach_Controls/Avery_Beach_Control_ALT_v07.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Beach_Controls/Avery_Beach_Control_SELECTED_v06.json` - masked_inpaint_or_repair / current_best_or_selected
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_1.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_10.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_10_api.json` - openpose_or_controlnet / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_11.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_11_api.json` - openpose_or_controlnet / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_12.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_12_api.json` - openpose_or_controlnet / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_13.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_13_api.json` - openpose_or_controlnet / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_2.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_3.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_4.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_5.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_6.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_7.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_7_api.json` - openpose_or_controlnet / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_8.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_8_api.json` - openpose_or_controlnet / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_9.json` - masked_inpaint_or_repair / candidate_or_favourite
- `04_Workflows/Favourites/01_controls/Avery_Yoga_Pose_Controls/Avery_Yoga_Pose_Control_9_api.json` - openpose_or_controlnet / candidate_or_favourite

## Pose Assets

- `03_Avatars/Avery Rested/avery_rested_odalisque_side_recline_openpose_896x1536.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/assets/references/supine-butterfly-overhead-head-up-openpose-896x1536.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_1.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_10.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_11.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_12.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_13.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_2.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_3.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_4.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_5.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_6.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_7.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_8.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_9.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_SELECTED_v12.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Current_Pack/outputs/reference_outputs/SDXL_Photoreal_OpenPose_Production_v18_API_00064_.png` (896x1536)
- `03_Avatars/Avery Yoga/RunPod_Package/assets/supine-butterfly-overhead-head-up-openpose-896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/ai_lab_fullbody_standing_openpose_640x1536.png` (640x1536)
- `05_Favourites/assets/openpose/ai_lab_pose_leaning_editorial_openpose_640x1536.png` (640x1536)
- `05_Favourites/assets/openpose/ai_lab_pose_leaning_editorial_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/avery_rested_odalisque_side_recline_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/classic_contrapposto_hand_hair_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/dancer_floor_stretch_long_line_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_depth_no_ankles_v1_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_depth_v3_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_depth_v4_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_mannequin_render_v3_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_mannequin_render_v4_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_openpose_no_ankles_v1_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_openpose_v2_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_outline_no_ankles_v1_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_outline_v3_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_outline_v4_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_silhouette_canny_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_silhouette_outline_canny_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_silhouette_soft_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_silhouette_v2_outline_canny_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_hair_tousle_silhouette_v2_soft_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_grounded_wide_knees_hair_tousle_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_side_scurve_arm_lift_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_tall_hands_hair_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/kneeling_wide_knees_hair_tousle_leanback_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/OPENPOSE_REFERENCE_CONTACT_SHEET_2026-06-21.png` (1158x3790)
- `05_Favourites/assets/openpose/prone_elbows_arch_legs_bent_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/reclined_elbow_prop_bent_knee_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/reclined_odalisque_side_recline_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/refined_arch/custom_reclined_arch_fullbody_feet_margin_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/refined_arch/custom_sidelean_arch_fullbody_feet_margin_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/refined_arch/reclined_elbow_arch_pullback_072_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/refined_arch/reclined_elbow_arch_pullback_078_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/refined_arch/reclined_side_lean_bent_knee_padded_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/refined_arch/supine_arched_fullbody_padded_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/refined_arch/supine_arched_fullbody_padded_openpose_896x1536_CANDIDATE_SOURCE.png` (896x1536)
- `05_Favourites/assets/openpose/seated_bed_edge_arms_back_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/seated_chair_leanback_cross_ankles_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/seated_floor_side_lean_one_knee_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/standing_back_arch_arms_overhead_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/standing_window_stretch_side_curve_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/supine-butterfly-overhead-head-up-openpose-896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/supine_butterfly_hands_hair_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/supine_twist_one_knee_raised_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/openpose/walking_waterline_long_stride_openpose_896x1536.png` (896x1536)
- `05_Favourites/assets/reference_outputs/cloud_smoke_tests/Avery_Yoga_Smoke_01_OpenPose_JugX_640x1088_24step_00001_.png` (640x1088)
- `05_Favourites/assets/reference_outputs/cloud_smoke_tests/Avery_Yoga_Smoke_02_OpenPose_Cyber_640x1088_24step_00001_.png` (640x1088)
- `05_Favourites/assets/reference_outputs/openpose_art_batch/Avery_OpenPose_Erotic_Art_2026_06_21_contact_sheet.png` (1100x1290)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_1.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_10.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_11.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_12.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_13.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_2.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_3.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_4.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_5.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_6.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_7.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_8.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_9.png` (896x1536)
- `05_Favourites/assets/reference_outputs/pose_controls/Avery_Yoga_Pose_Control_SELECTED_v12.png` (896x1536)
