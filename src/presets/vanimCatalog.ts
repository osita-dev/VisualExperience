/**
 * VIDEO-ANIMATION CATALOG (D44) — "how the slot's media behaves".
 *
 * Not transitions: a video animation treats the slot's OWN media (the
 * layer the player already drew), while Effect/Motion stack alongside
 * it. Every preset is DATA on the renderer's treatment primitives in
 * `player/frame.ts`:
 *   grid (slice/cube/collage) · shatter · strip (wave/twist/bend/liquid/
 *   swirl) · pixelate · glitch · clone · ghost (directional motion blur)
 *   · plane (fake-3D) · zoom · depth (layer separation/parallax) · mask
 *   · camera (pan/dolly) · morph (cross-warp) — plus the time-map trio
 *   (freeze / slow-mo / speed-ramp) which remaps the clip's time in
 *   syncMedia instead of touching pixels.
 * All randomness is seeded (preview ≡ export); photos get everything
 * except the time-map trio (which is a harmless no-op on stills).
 */
import type { VisualPreset } from "@/core/model/types";

export interface VanimFamily {
  id: string;
  label: string;
}

/** Picker groups — the first tag of every preset must be one of these. */
export const VANIM_FAMILIES: VanimFamily[] = [
  { id: "slice", label: "3D Slicing & Panels" },
  { id: "frag", label: "Fragmentation & Disintegration" },
  { id: "fold", label: "3D Folding & Warping" },
  { id: "dup", label: "Duplication & Motion Trails" },
  { id: "morph", label: "Morphing & Scene Transformation" },
  { id: "plane", label: "3D Plane Animation" },
  { id: "distort", label: "Distortion & Warp" },
  { id: "split", label: "Split-Screen" },
  { id: "shatter", label: "Shattering & Reassembly" },
  { id: "rot", label: "3D Rotation, Flip & Perspective" },
  { id: "depth", label: "Layer Separation & Depth" },
  { id: "stretch", label: "Stretching, Twisting & Bending" },
  { id: "pixel", label: "Pixelation & Digital Disintegration" },
  { id: "glitchf", label: "Glitch & Digital Distortion" },
  { id: "timef", label: "Freeze-Frame & Time" },
  { id: "speed", label: "Speed Ramping & Slow-Motion" },
  { id: "mblur", label: "Motion Blur & Directional" },
  { id: "zoomf", label: "Zoom, Push-In & Pull-Out" },
  { id: "scene", label: "Seamless Scene Morphing" },
  { id: "clonef", label: "Cloning & Multi-Layer" },
  { id: "parallax", label: "Parallax" },
  { id: "cube", label: "3D Cube & Tile" },
  { id: "mask", label: "Masking & Reveal" },
  { id: "liquid", label: "Liquid, Wave & Ripple" },
  { id: "swirl", label: "Swirl & Spin" },
  { id: "camera", label: "Perspective Shift & Camera" },
  { id: "explode", label: "Explosion & Particles" },
  { id: "disasm", label: "Disassembly & Reconstruction" },
];

const v = (
  id: string,
  name: string,
  family: string,
  resolve: () => Record<string, unknown>,
): VisualPreset => ({ id, version: 1, kind: "block", name, tags: [family], resolve });

export const VANIM_PRESETS: VisualPreset[] = [
  /* 1 · 3D slicing & panels */
  v("vanim.slice_panels", "Slice Panels", "slice",
    () => ({ op: "grid", cols: 2, rows: 4, mode: "slice", stagger: 0.5, force: 0.5, rot: 8, inFrac: 0.45, ease: "out" })),
  v("vanim.angled_slices", "Angled Slices", "slice",
    () => ({ op: "grid", cols: 3, rows: 6, mode: "slice", stagger: 0.6, force: 0.65, rot: 16, inFrac: 0.5, ease: "out" })),
  v("vanim.panel_wipe", "Panel Wipe-In", "slice",
    () => ({ op: "grid", cols: 1, rows: 5, mode: "slice", stagger: 0.7, force: 0.3, rot: 0, inFrac: 0.5, ease: "out" })),

  /* 2 · fragmentation & disintegration */
  v("vanim.fragment_drift", "Fragment Drift", "frag",
    () => ({ op: "shatter", cols: 10, rows: 16, force: 0.25, gravity: 0.1, spin: 40, inFrac: 0.55, ease: "out" })),
  v("vanim.dust_disintegrate", "Dust Disintegration", "frag",
    () => ({ op: "shatter", cols: 14, rows: 22, force: 0.5, gravity: 0.25, spin: 90, inFrac: 0.6, ease: "out" })),
  v("vanim.fragment_settle", "Fragment Settle", "frag",
    () => ({ op: "shatter", cols: 8, rows: 12, force: 0.15, gravity: 0.05, spin: 20, inFrac: 0.45, ease: "out" })),

  /* 3 · 3D folding & warping */
  v("vanim.fold_panels", "Fold Panels", "fold",
    () => ({ op: "grid", cols: 3, rows: 1, mode: "cube", stagger: 0.45, inFrac: 0.45, ease: "out" })),
  v("vanim.soft_fold", "Soft Fold", "fold",
    () => ({ op: "strip", mode: "bend", amp: 0.12, power: 1.4, inFrac: 0.5, ease: "out" })),
  v("vanim.accordion", "Accordion Fold", "fold",
    () => ({ op: "strip", mode: "twist", amp: 0.1, power: 2.2, inFrac: 0.55, ease: "out" })),

  /* 4 · duplication & motion trails */
  v("vanim.offset_echo", "Offset Echo", "dup",
    () => ({ op: "clone", n: 3, dx: 0.05, dy: 0.03, echo: 0, inFrac: 0.4, ease: "out" })),
  v("vanim.motion_echo", "Motion Echo", "dup",
    () => ({ op: "clone", n: 5, dx: 0.08, dy: 0, echo: 1, inFrac: 0.45, ease: "out" })),
  v("vanim.double_vision", "Double Vision", "dup",
    () => ({ op: "clone", n: 2, dx: 0.02, dy: 0.012, echo: 0, inFrac: 0.35, ease: "out" })),

  /* 5 · morphing & scene transformation */
  v("vanim.cross_warp", "Cross-Warp Morph", "morph",
    () => ({ op: "morph", amount: 0.8, freq: 2.4, inFrac: 0.55, ease: "out" })),
  v("vanim.zoom_morph", "Zoom Morph", "morph",
    () => ({ op: "morph", amount: 1, freq: 1.6, inFrac: 0.6, ease: "out" })),
  v("vanim.soft_scene_morph", "Soft Scene Morph", "morph",
    () => ({ op: "morph", amount: 0.45, freq: 3, inFrac: 0.5, ease: "inOut" })),

  /* 6 · 3D plane animation */
  v("vanim.plane_tilt", "Plane Tilt", "plane",
    () => ({ op: "plane", ry: 0.5, inFrac: 0.5, ease: "out" })),
  v("vanim.plane_swing", "Plane Swing", "plane",
    () => ({ op: "plane", rz: 0.12, sway: 1, inFrac: 0.45, ease: "out" })),
  v("vanim.plane_drop", "Plane Drop", "plane",
    () => ({ op: "plane", rx: 0.7, inFrac: 0.55, ease: "out" })),

  /* 7 · distortion & warp */
  v("vanim.wave_warp", "Wave Warp", "distort",
    () => ({ op: "strip", mode: "wave", amp: 0.07, freq: 2.2, speed: 0.8, inFrac: 0.4, ease: "out" })),
  v("vanim.twist_warp", "Twist Warp", "distort",
    () => ({ op: "strip", mode: "twist", amp: 0.1, power: 1.6, inFrac: 0.5, ease: "out" })),
  v("vanim.bend_warp", "Bend Warp", "distort",
    () => ({ op: "strip", mode: "bend", amp: 0.16, power: 1, inFrac: 0.5, ease: "out" })),

  /* 8 · split-screen */
  v("vanim.split_panes", "Split Panes", "split",
    () => ({ op: "grid", cols: 2, rows: 1, mode: "collage", zoomVar: 0.14, stagger: 0.4, inFrac: 0.45, ease: "out" })),
  v("vanim.split_slide", "Split Slide", "split",
    () => ({ op: "grid", cols: 2, rows: 1, mode: "slice", stagger: 0.35, force: 0.4, rot: 0, inFrac: 0.4, ease: "out" })),
  v("vanim.quad_collage", "Quad Collage", "split",
    () => ({ op: "grid", cols: 2, rows: 2, mode: "collage", zoomVar: 0.18, stagger: 0.5, inFrac: 0.5, ease: "out" })),

  /* 9 · shattering & reassembly */
  v("vanim.shatter_in", "Shatter In", "shatter",
    () => ({ op: "shatter", cols: 6, rows: 9, force: 0.6, gravity: 0.12, spin: 60, inFrac: 0.55, ease: "out" })),
  v("vanim.burst_apart", "Burst Apart", "shatter",
    () => ({ op: "shatter", cols: 9, rows: 14, force: 0.9, gravity: 0.3, spin: 90, inFrac: 0.5, ease: "out" })),
  v("vanim.reassemble", "Reassemble", "shatter",
    () => ({ op: "shatter", cols: 7, rows: 11, force: 0.45, gravity: 0.08, spin: 35, inFrac: 0.65, ease: "out" })),

  /* 10 · 3D rotation, flip & perspective */
  v("vanim.flip_y", "3D Flip (Y)", "rot",
    () => ({ op: "plane", ry: 1.5, inFrac: 0.5, ease: "out" })),
  v("vanim.flip_x", "3D Flip (X)", "rot",
    () => ({ op: "plane", rx: 1.5, inFrac: 0.5, ease: "out" })),
  v("vanim.persp_spin", "Perspective Spin", "rot",
    () => ({ op: "plane", rz: 0.5, ry: 0.4, sway: 0.6, inFrac: 0.6, ease: "out" })),

  /* 11 · layer separation & depth */
  v("vanim.layer_sep", "Layer Separation", "depth",
    () => ({ op: "depth", layers: 3, zoomStep: 0.08, drift: 0.06, inFrac: 0.55, ease: "out" })),
  v("vanim.depth_drift", "Depth Drift", "depth",
    () => ({ op: "depth", layers: 2, zoomStep: 0.05, drift: 0.1, inFrac: 0.6, ease: "inOut" })),
  v("vanim.depth_pop", "Depth Pop", "depth",
    () => ({ op: "depth", layers: 3, zoomStep: 0.12, drift: 0.02, inFrac: 0.45, ease: "overshoot" })),

  /* 12 · stretching, twisting & bending */
  v("vanim.stretch_out", "Stretch Out", "stretch",
    () => ({ op: "strip", mode: "bend", amp: 0.3, power: 2, inFrac: 0.5, ease: "out" })),
  v("vanim.twist_stretch", "Twist Stretch", "stretch",
    () => ({ op: "strip", mode: "twist", amp: 0.12, power: 3, inFrac: 0.55, ease: "out" })),
  v("vanim.soft_bend", "Soft Bend", "stretch",
    () => ({ op: "strip", mode: "bend", amp: 0.1, power: 0.7, inFrac: 0.5, ease: "inOut" })),

  /* 13 · pixelation & digital disintegration */
  v("vanim.pixel_rise", "Pixel Rise", "pixel",
    () => ({ op: "pixelate", from: 0.12, to: 0, inFrac: 0.55, ease: "out" })),
  v("vanim.pixel_coarse", "Coarse Pixelate", "pixel",
    () => ({ op: "pixelate", from: 0.2, to: 0.02, inFrac: 0.6, ease: "out" })),
  v("vanim.pixel_blocks", "Block Fade", "pixel",
    () => ({ op: "pixelate", from: 0.08, to: 0.015, inFrac: 0.5, ease: "inOut" })),

  /* 14 · glitch & digital distortion */
  v("vanim.glitch_full", "Full Glitch", "glitchf",
    () => ({ op: "glitch", rgb: 0.8, rows: 1, scan: 0.5, flicker: 0.7, inFrac: 0.5, ease: "linear" })),
  v("vanim.glitch_rows", "Row Glitch", "glitchf",
    () => ({ op: "glitch", rows: 1, inFrac: 0.45, ease: "linear" })),
  v("vanim.glitch_rgb", "RGB Jitter", "glitchf",
    () => ({ op: "glitch", rgb: 1, scan: 0.4, inFrac: 0.45, ease: "linear" })),

  /* 15 · freeze-frame & time */
  v("vanim.freeze", "Freeze Frame", "timef",
    () => ({ tm: "freeze", tmWin: 1, inFrac: 0.1, ease: "linear" })),
  v("vanim.flash_freeze", "Flash Freeze", "timef",
    () => ({ tm: "freeze", tmWin: 0.35, inFrac: 0.1, ease: "linear" })),
  v("vanim.time_hitch", "Time Hitch", "timef",
    () => ({ tm: "ramp", tmCurve: "slowfast", inFrac: 0.1, ease: "linear" })),

  /* 16 · speed ramping & slow-motion */
  v("vanim.ramp_fastslow", "Fast-Slow-Fast Ramp", "speed",
    () => ({ tm: "ramp", tmCurve: "fastslow", inFrac: 0.1, ease: "linear" })),
  v("vanim.slow_build", "Slow-Motion Build", "speed",
    () => ({ tm: "slow", tmK: 0.5, inFrac: 0.1, ease: "linear" })),
  v("vanim.slow_drift", "Slow Drift", "speed",
    () => ({ tm: "slow", tmK: 0.35, inFrac: 0.1, ease: "linear" })),

  /* 17 · motion blur & directional */
  v("vanim.blur_x", "Directional Blur X", "mblur",
    () => ({ op: "ghost", n: 6, dx: 0.1, dy: 0, inFrac: 0.4, ease: "out" })),
  v("vanim.whip_blur", "Whip Blur", "mblur",
    () => ({ op: "ghost", n: 8, dx: 0.18, dy: 0.02, inFrac: 0.45, ease: "out" })),
  v("vanim.zoom_blur", "Zoom Blur", "mblur",
    () => ({ op: "ghost", n: 6, dx: 0, dy: 0, scaleStep: 0.035, inFrac: 0.4, ease: "out" })),

  /* 18 · zoom, push-in & pull-out */
  v("vanim.push_in", "Push-In", "zoomf",
    () => ({ op: "zoom", from: 1, to: 1.18, inFrac: 0.7, ease: "inOut" })),
  v("vanim.pull_out", "Pull-Out", "zoomf",
    () => ({ op: "zoom", from: 1.28, to: 1, inFrac: 0.7, ease: "inOut" })),
  v("vanim.punch_zoom", "Punch Zoom", "zoomf",
    () => ({ op: "zoom", from: 1, to: 1.35, inFrac: 0.25, ease: "out" })),

  /* 19 · seamless scene morphing */
  v("vanim.seamless_morph", "Seamless Morph", "scene",
    () => ({ op: "morph", amount: 0.35, freq: 2, inFrac: 0.6, ease: "inOut" })),
  v("vanim.dissolve_warp", "Dissolve Warp", "scene",
    () => ({ op: "morph", amount: 0.65, freq: 3.4, inFrac: 0.55, ease: "out" })),
  v("vanim.warp_cut", "Warp Cut", "scene",
    () => ({ op: "morph", amount: 0.9, freq: 1.4, inFrac: 0.25, ease: "out" })),

  /* 20 · cloning & multi-layer */
  v("vanim.clone_grid", "Clone Grid", "clonef",
    () => ({ op: "grid", cols: 2, rows: 2, mode: "collage", zoomVar: 0, stagger: 0.3, inFrac: 0.4, ease: "out" })),
  v("vanim.layered_clone", "Layered Clone", "clonef",
    () => ({ op: "clone", n: 3, dx: 0.04, dy: 0.02, echo: 0, inFrac: 0.4, ease: "out" })),
  v("vanim.echo_frame", "Echo Frame", "clonef",
    () => ({ op: "clone", n: 4, dx: 0.06, dy: 0, echo: 1, inFrac: 0.45, ease: "out" })),

  /* 21 · parallax */
  v("vanim.parallax_pan", "Parallax Pan", "parallax",
    () => ({ op: "depth", layers: 2, zoomStep: 0.06, drift: 0.12, inFrac: 0.65, ease: "inOut" })),
  v("vanim.parallax_zoom", "Parallax Zoom", "parallax",
    () => ({ op: "depth", layers: 3, zoomStep: 0.1, drift: 0.04, inFrac: 0.65, ease: "inOut" })),
  v("vanim.parallax_tilt", "Parallax Tilt", "parallax",
    () => ({ op: "plane", ry: 0.18, sway: 1, inFrac: 0.5, ease: "inOut" })),

  /* 22 · 3D cube & tile */
  v("vanim.cube_turn", "Cube Turn", "cube",
    () => ({ op: "grid", cols: 2, rows: 1, mode: "cube", stagger: 0.4, inFrac: 0.5, ease: "out" })),
  v("vanim.tile_flip", "Tile Flip", "cube",
    () => ({ op: "grid", cols: 3, rows: 3, mode: "cube", stagger: 0.6, inFrac: 0.55, ease: "out" })),
  v("vanim.cube_slow", "Slow Cube Turn", "cube",
    () => ({ op: "grid", cols: 2, rows: 1, mode: "cube", stagger: 0.8, inFrac: 0.7, ease: "inOut" })),

  /* 23 · masking & reveal */
  v("vanim.circle_reveal", "Circle Reveal", "mask",
    () => ({ op: "mask", shape: "circle", inFrac: 0.55, ease: "out" })),
  v("vanim.blinds_reveal", "Blinds Reveal", "mask",
    () => ({ op: "mask", shape: "blinds", inFrac: 0.5, ease: "out" })),
  v("vanim.diag_wipe", "Diagonal Wipe", "mask",
    () => ({ op: "mask", shape: "diag", inFrac: 0.5, ease: "out" })),

  /* 24 · liquid, wave & ripple */
  v("vanim.liquid_wave", "Liquid Wave", "liquid",
    () => ({ op: "strip", mode: "liquid", amp: 0.07, freq: 2, speed: 0.9, inFrac: 0.4, ease: "out" })),
  v("vanim.ripple", "Ripple", "liquid",
    () => ({ op: "strip", mode: "ripple", amp: 0.05, freq: 6, speed: 1.6, inFrac: 0.4, ease: "out" })),
  v("vanim.deep_ripple", "Deep Ripple", "liquid",
    () => ({ op: "strip", mode: "liquid", amp: 0.11, freq: 3.2, speed: 0.7, inFrac: 0.45, ease: "out" })),

  /* 25 · swirl & spin */
  v("vanim.swirl_in", "Swirl In", "swirl",
    () => ({ op: "strip", mode: "swirl", amp: 0.1, power: 1.2, inFrac: 0.55, ease: "out" })),
  v("vanim.swirl_out", "Swirl Reveal", "swirl",
    () => ({ op: "strip", mode: "swirl", amp: 0.1, power: -1.2, inFrac: 0.55, ease: "out" })),
  v("vanim.spin_distort", "Spin Distort", "swirl",
    () => ({ op: "strip", mode: "swirl", amp: 0.08, power: 0.8, inFrac: 0.5, ease: "out" })),

  /* 26 · perspective shift & camera */
  v("vanim.cam_pan", "Camera Pan", "camera",
    () => ({ op: "camera", x: [-0.06, 0.06], y: [0, 0], zoom: [1.06, 1.06], inFrac: 0.8, ease: "inOut" })),
  v("vanim.cam_dolly", "Camera Dolly", "camera",
    () => ({ op: "camera", x: [0.03, -0.02], y: [0.02, -0.01], zoom: [1.12, 1], inFrac: 0.75, ease: "inOut" })),
  v("vanim.cam_drift", "Camera Drift", "camera",
    () => ({ op: "camera", x: [0, 0.04], y: [-0.03, 0.02], zoom: [1.03, 1.08], inFrac: 0.85, ease: "linear" })),

  /* 27 · explosion & particles */
  v("vanim.explosion", "Explosion", "explode",
    () => ({ op: "shatter", cols: 12, rows: 18, force: 0.8, gravity: 0.4, spin: 120, inFrac: 0.5, ease: "out" })),
  v("vanim.particle_burst", "Particle Burst", "explode",
    () => ({ op: "shatter", cols: 16, rows: 24, force: 0.6, gravity: 0.5, spin: 200, inFrac: 0.55, ease: "out" })),
  v("vanim.blast_out", "Blast Out", "explode",
    () => ({ op: "shatter", cols: 10, rows: 14, force: 1, gravity: 0.2, spin: 80, inFrac: 0.45, ease: "out" })),

  /* 28 · disassembly & reconstruction */
  v("vanim.disassembly", "Disassembly", "disasm",
    () => ({ op: "shatter", cols: 7, rows: 11, force: 0.35, gravity: 0.06, spin: 45, inFrac: 0.6, ease: "out" })),
  v("vanim.reconstruction", "Reconstruction", "disasm",
    () => ({ op: "grid", cols: 3, rows: 5, mode: "slice", stagger: 0.7, force: 0.4, rot: 6, inFrac: 0.65, ease: "out" })),
  v("vanim.scene_rebuild", "Scene Rebuild", "disasm",
    () => ({ op: "shatter", cols: 5, rows: 8, force: 0.5, gravity: 0.15, spin: 30, inFrac: 0.7, ease: "out" })),
];
