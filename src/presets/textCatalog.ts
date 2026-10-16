/**
 * TEXT ANIMATION CATALOG (D43).
 *
 * Every preset here is DATA on top of the text-channel engine in
 * `player/frame.ts` — a preset is a composition of motion channels
 * (alpha/slide/scale/3D-rot/blur/track/wipe/split + stagger + typewriter/
 * scramble/glitch/shimmer/wave/float/marquee/parallax/extrude/path/...),
 * never bespoke rendering code. One primitive set → an entire vocabulary.
 *
 * The names follow the creator-facing catalog; scroll-driven web effects
 * are re-driven by the timeline (video has no scroll — the beat is the
 * driver). Variable-font axes are not animated (canvas cannot), and true
 * glyph-outline morphing is approximated with a warp (scale+blur) settle.
 * All randomness is seeded (preview ≡ export).
 */
import type { VisualPreset } from "@/core/model/types";

export interface TextFamily {
  id: string;
  label: string;
}

/** Picker groups — the first tag of every preset must be one of these. */
export const TEXT_FAMILIES: TextFamily[] = [
  { id: "reveal", label: "Reveals" },
  { id: "cine", label: "Cinematic" },
  { id: "gsap", label: "Stagger & motion" },
  { id: "beat", label: "Beat-driven (scroll-style)" },
  { id: "depth", label: "3D & depth" },
  { id: "glitch", label: "Glitch & digital" },
  { id: "kinetic", label: "Kinetic" },
  { id: "luxe", label: "Luxury & editorial" },
  { id: "adv", label: "Paths & gradients" },
  { id: "exit", label: "Exit animations" },
];

export const TEXT_ANIMATIONS: VisualPreset[] = [
  /* ---------------- Reveals ---------------- */
  {
    id: "text.word_reveal", version: 1, kind: "text", name: "Word-by-Word Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.6, ease: "out", stag: { by: "word", amt: 0.55 }, ch: { alpha: [0, 1], dy: [0.035, 0] } }),
  },
  {
    id: "text.letter_reveal", version: 1, kind: "text", name: "Letter-by-Letter Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.63, ease: "out", stag: { by: "char", amt: 0.6 }, ch: { alpha: [0, 1], dy: [0.03, 0] } }),
  },
  {
    id: "text.line_reveal", version: 1, kind: "text", name: "Line-by-Line Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.65, ease: "out", stag: { by: "line", amt: 0.5 }, ch: { alpha: [0, 1], dy: [0.04, 0] } }),
  },
  {
    id: "text.mask_reveal", version: 1, kind: "text", name: "Mask Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.6, ease: "inOut", ch: { wipe: [0, 1], alpha: [1, 1] }, wipeAxis: "y", feather: 0.9 }),
  },
  {
    id: "text.split_reveal", version: 1, kind: "text", name: "Split Text Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.55, ease: "out", ch: { dxSplit: [-0.45, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.clip_reveal", version: 1, kind: "text", name: "Clip-Path Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.5, ease: "out", ch: { wipe: [0, 1] }, wipeAxis: "y", feather: 0 }),
  },
  {
    id: "text.wipe_reveal", version: 1, kind: "text", name: "Text Wipe Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.5, ease: "out", ch: { wipe: [0, 1] }, wipeAxis: "x", feather: 0 }),
  },
  {
    id: "text.blur_clear", version: 1, kind: "text", name: "Blur-to-Clear Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.55, ease: "out", ch: { blur: [1.4, 0], alpha: [0, 1], scale: [1.06, 1] } }),
  },
  {
    id: "text.fade_in", version: 1, kind: "text", name: "Fade-In Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.5, ease: "inOut", ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.slide_up", version: 1, kind: "text", name: "Slide-Up Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.5, ease: "out", ch: { dy: [0.09, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.char_stagger", version: 1, kind: "text", name: "Character Stagger Reveal", tags: ["reveal"],
    resolve: () => ({ inFrac: 0.7, ease: "overshoot", stag: { by: "char", amt: 0.7, order: "center" }, ch: { alpha: [0, 1], scale: [0.7, 1] } }),
  },

  /* ---------------- Cinematic ---------------- */
  {
    id: "text.cine_title", version: 1, kind: "text", name: "Cinematic Title Reveal", tags: ["cine"],
    resolve: () => ({ inFrac: 0.8, ease: "inOut", ch: { wipe: [0, 1], track: [-0.06, 0], alpha: [0, 1] }, wipeAxis: "x", feather: 0.6 }),
  },
  {
    id: "text.dramatic", version: 1, kind: "text", name: "Dramatic Text Reveal", tags: ["cine"],
    resolve: () => ({ inFrac: 0.7, ease: "out", ch: { alpha: [0, 1], scale: [1.25, 1], blur: [0.8, 0] } }),
  },
  {
    id: "text.slow_motion", version: 1, kind: "text", name: "Slow Motion Text Reveal", tags: ["cine"],
    resolve: () => ({ inFrac: 0.9, ease: "inOut", ch: { alpha: [0, 1], dy: [0.05, 0] } }),
  },
  {
    id: "text.track_expand", version: 1, kind: "text", name: "Tracking Expansion", tags: ["cine"],
    resolve: () => ({ inFrac: 0.7, ease: "inOut", ch: { track: [-0.12, 0.02], alpha: [0, 1] } }),
  },
  {
    id: "text.track_compress", version: 1, kind: "text", name: "Tracking Compression", tags: ["cine"],
    resolve: () => ({ inFrac: 0.7, ease: "out", ch: { track: [0.14, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.focus_pull", version: 1, kind: "text", name: "Focus Pull Text", tags: ["cine"],
    resolve: () => ({ inFrac: 0.75, ease: "out", ch: { blur: [2.2, 0], scale: [1.12, 1], alpha: [0, 1] } }),
  },
  {
    id: "text.cine_3d", version: 1, kind: "text", name: "3D Text Reveal", tags: ["cine"],
    resolve: () => ({ inFrac: 0.7, ease: "out", ch: { rotX: [-85, 0], alpha: [0, 1] }, extrude: 3 }),
  },
  {
    id: "text.perspective", version: 1, kind: "text", name: "Perspective Text Reveal", tags: ["cine"],
    resolve: () => ({ inFrac: 0.7, ease: "out", ch: { rotY: [-70, 0], dx: [0.06, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.floating", version: 1, kind: "text", name: "Floating Text", tags: ["cine"],
    resolve: () => ({ inFrac: 0.6, ease: "inOut", ch: { alpha: [0, 1] }, float: { amp: 0.008, freq: 0.35, speed: 1 } }),
  },
  {
    id: "text.epic_title", version: 1, kind: "text", name: "Epic Title Reveal", tags: ["cine"],
    resolve: () => ({ inFrac: 0.85, ease: "inOut", stag: { by: "line", amt: 0.4 }, ch: { wipe: [0, 1], track: [-0.05, 0.01], alpha: [0, 1] }, wipeAxis: "x", feather: 0.5 }),
  },

  /* ---------------- Stagger & motion (GSAP-style) ---------------- */
  {
    id: "text.splittext_stagger", version: 1, kind: "text", name: "SplitText Stagger", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.6, ease: "out", stag: { by: "char", amt: 0.65 }, ch: { dx: [-0.06, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.fade_up", version: 1, kind: "text", name: "Staggered Fade-Up", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.55, ease: "out", stag: { by: "word", amt: 0.5 }, ch: { alpha: [0, 1], dy: [0.05, 0] } }),
  },
  {
    id: "text.slide_in", version: 1, kind: "text", name: "Staggered Slide-In", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.55, ease: "out", stag: { by: "word", amt: 0.5 }, ch: { dx: [-0.12, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.scale_up", version: 1, kind: "text", name: "Staggered Scale-Up", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.6, ease: "overshoot", stag: { by: "word", amt: 0.55 }, ch: { scale: [0.4, 1], alpha: [0, 1] } }),
  },
  {
    id: "text.rot_stagger", version: 1, kind: "text", name: "Staggered Rotation", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.65, ease: "overshoot", stag: { by: "word", amt: 0.55 }, ch: { rot: [-35, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.elastic", version: 1, kind: "text", name: "Elastic Text Entrance", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.8, ease: "elastic", stag: { by: "char", amt: 0.6 }, ch: { scale: [0.3, 1], alpha: [0, 1] } }),
  },
  {
    id: "text.bounce_in", version: 1, kind: "text", name: "Bounce-In Text", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.7, ease: "bounce", stag: { by: "word", amt: 0.5 }, ch: { scale: [0.3, 1], alpha: [0, 1] } }),
  },
  {
    id: "text.scramble", version: 1, kind: "text", name: "Scramble Text", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.7, ease: "linear", stag: { by: "char", amt: 0.35 }, scram: true, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.decode", version: 1, kind: "text", name: "Decode Text", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.8, ease: "linear", stag: { by: "char", amt: 0.8 }, scram: true, type: true }),
  },
  {
    id: "text.flip_in", version: 1, kind: "text", name: "Flip-In Text", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.65, ease: "out", stag: { by: "char", amt: 0.6 }, ch: { rotY: [-95, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.char_wave", version: 1, kind: "text", name: "Character Wave", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.4, ease: "out", ch: { alpha: [0, 1] }, wave: { amp: 0.22, freq: 3.5, speed: 1.4 } }),
  },
  {
    id: "text.morph", version: 1, kind: "text", name: "Text Morphing", tags: ["gsap"],
    resolve: () => ({ inFrac: 0.7, ease: "out", morph: 1, ch: { alpha: [0, 1], scale: [1.5, 1], blur: [0.6, 0] } }),
  },

  /* ---------------- Beat-driven (scroll-style, re-driven by the timeline) ---------------- */
  {
    id: "text.beat_word", version: 1, kind: "text", name: "Beat-Triggered Word Reveal", tags: ["beat"],
    resolve: () => ({ inFrac: 0.8, ease: "linear", stag: { by: "word", amt: 0.7 }, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.beat_char", version: 1, kind: "text", name: "Beat-Triggered Char Reveal", tags: ["beat"],
    resolve: () => ({ inFrac: 0.8, ease: "linear", stag: { by: "char", amt: 0.75 }, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.parallax", version: 1, kind: "text", name: "Text Parallax", tags: ["beat"],
    resolve: () => ({ inFrac: 0.6, ease: "out", ch: { alpha: [0, 1], dy: [0.02, 0] }, parallax: 3 }),
  },
  {
    id: "text.marquee_h", version: 1, kind: "text", name: "Horizontal Marquee Text", tags: ["beat"],
    resolve: () => ({ inFrac: 0.25, ease: "linear", ch: { alpha: [0, 1] }, marquee: { speed: 0.14, gap: 0.6 } }),
  },
  {
    id: "text.loop_v", version: 1, kind: "text", name: "Vertical Loop Text", tags: ["beat"],
    resolve: () => ({ inFrac: 0.5, ease: "inOut", ch: { alpha: [0, 1] }, float: { amp: 0.03, freq: 0.6, speed: 1.2 } }),
  },
  {
    id: "text.scale_reveal", version: 1, kind: "text", name: "Text Scale Reveal", tags: ["beat"],
    resolve: () => ({ inFrac: 0.6, ease: "out", ch: { scale: [0.6, 1], alpha: [0, 1] } }),
  },
  {
    id: "text.color_fill", version: 1, kind: "text", name: "Color Fill Sweep", tags: ["beat"],
    resolve: () => ({ inFrac: 0.8, ease: "inOut", ch: { alpha: [0, 1] }, fill: "gradient", tint: "#7DD3FC" }),
  },
  {
    id: "text.highlight", version: 1, kind: "text", name: "Highlight Sweep", tags: ["beat"],
    resolve: () => ({ inFrac: 0.5, ease: "out", ch: { alpha: [0, 1] }, shimmer: 1 }),
  },

  /* ---------------- 3D & depth (canvas fake-3D) ---------------- */
  {
    id: "text.flip3d", version: 1, kind: "text", name: "3D Flip Text", tags: ["depth"],
    resolve: () => ({ inFrac: 0.65, ease: "out", ch: { rotX: [-90, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.persp_flip", version: 1, kind: "text", name: "Perspective Flip Text", tags: ["depth"],
    resolve: () => ({ inFrac: 0.65, ease: "out", ch: { rotY: [88, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.depth_zoom", version: 1, kind: "text", name: "Depth-Zoom Reveal", tags: ["depth"],
    resolve: () => ({ inFrac: 0.7, ease: "out", ch: { scale: [2.4, 1], blur: [1.6, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.rotating", version: 1, kind: "text", name: "Rotating Text Reveal", tags: ["depth"],
    resolve: () => ({ inFrac: 0.8, ease: "out", ch: { rot: [-160, 0], scale: [0.6, 1], alpha: [0, 1] } }),
  },
  {
    id: "text.extruded", version: 1, kind: "text", name: "Extruded Text Reveal", tags: ["depth"],
    resolve: () => ({ inFrac: 0.6, ease: "out", ch: { alpha: [0, 1], dy: [0.03, 0] }, extrude: 5 }),
  },
  {
    id: "text.y_axis", version: 1, kind: "text", name: "Y-Axis Rotation", tags: ["depth"],
    resolve: () => ({ inFrac: 0.7, ease: "out", stag: { by: "char", amt: 0.6 }, ch: { rotY: [-90, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.x_axis", version: 1, kind: "text", name: "X-Axis Rotation", tags: ["depth"],
    resolve: () => ({ inFrac: 0.7, ease: "out", stag: { by: "char", amt: 0.6 }, ch: { rotX: [-90, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.layered_depth", version: 1, kind: "text", name: "Layered Depth Reveal", tags: ["depth"],
    resolve: () => ({ inFrac: 0.65, ease: "out", stag: { by: "line", amt: 0.4 }, ch: { alpha: [0, 1], dx: [-0.03, 0] }, parallax: 3 }),
  },

  /* ---------------- Glitch & digital ---------------- */
  {
    id: "text.glitch_reveal", version: 1, kind: "text", name: "Glitch Reveal", tags: ["glitch"],
    resolve: () => ({ inFrac: 0.6, ease: "linear", stag: { by: "char", amt: 0.5 }, glitch: { rgb: 0.8, rows: 0.7, scan: 0.5, flicker: 0.6 }, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.rgb_split", version: 1, kind: "text", name: "RGB Split Reveal", tags: ["glitch"],
    resolve: () => ({ inFrac: 0.5, ease: "out", glitch: { rgb: 1 }, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.terminal", version: 1, kind: "text", name: "Terminal Typing", tags: ["glitch"],
    resolve: () => ({ inFrac: 0.85, ease: "linear", stag: { by: "char", amt: 0.9 }, type: true, font: "Courier New", tint: "#7CFFB2", glitch: { scan: 0.6 } }),
  },
  {
    id: "text.hologram", version: 1, kind: "text", name: "Holographic Text", tags: ["glitch"],
    resolve: () => ({ inFrac: 0.7, ease: "out", glitch: { flicker: 0.5, scan: 0.7 }, shimmer: 0.6, tint: "#67E8F9", ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.data_stream", version: 1, kind: "text", name: "Data Stream Reveal", tags: ["glitch"],
    resolve: () => ({ inFrac: 0.9, ease: "linear", stag: { by: "char", amt: 0.9 }, scram: true, tint: "#86EFAC", glitch: { scan: 0.4 }, wave: { amp: 0.06, freq: 2, speed: 1 } }),
  },
  {
    id: "text.flicker", version: 1, kind: "text", name: "Flicker Reveal", tags: ["glitch"],
    resolve: () => ({ inFrac: 0.55, ease: "linear", glitch: { flicker: 0.9 }, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.scanline", version: 1, kind: "text", name: "Scanline Reveal", tags: ["glitch"],
    resolve: () => ({ inFrac: 0.6, ease: "out", glitch: { scan: 1 }, ch: { wipe: [0, 1] }, wipeAxis: "y", feather: 0 }),
  },
  {
    id: "text.signal", version: 1, kind: "text", name: "Signal Interference", tags: ["glitch"],
    resolve: () => ({ inFrac: 0.6, ease: "linear", stag: { by: "word", amt: 0.6 }, glitch: { rows: 0.9, rgb: 0.5, flicker: 0.4 }, ch: { alpha: [0, 1] } }),
  },

  /* ---------------- Kinetic ---------------- */
  {
    id: "text.word_bounce", version: 1, kind: "text", name: "Word Bounce", tags: ["kinetic"],
    resolve: () => ({ inFrac: 0.75, ease: "bounce", stag: { by: "word", amt: 0.6 }, ch: { dy: [0.06, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.letter_wave", version: 1, kind: "text", name: "Letter Wave", tags: ["kinetic"],
    resolve: () => ({ inFrac: 0.6, ease: "out", stag: { by: "char", amt: 0.4 }, ch: { alpha: [0, 1], scale: [0.9, 1] }, wave: { amp: 0.28, freq: 4, speed: 1.6 } }),
  },
  {
    id: "text.stretch", version: 1, kind: "text", name: "Stretch Reveal", tags: ["kinetic"],
    resolve: () => ({ inFrac: 0.55, ease: "out", stag: { by: "char", amt: 0.5 }, ch: { scaleX: [2.4, 1], alpha: [0, 1] } }),
  },
  {
    id: "text.explosion", version: 1, kind: "text", name: "Text Explosion", tags: ["kinetic"],
    resolve: () => ({ inFrac: 0.7, ease: "out", burst: 0.55, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.assembly", version: 1, kind: "text", name: "Assembly Reveal", tags: ["kinetic"],
    resolve: () => ({ inFrac: 0.7, ease: "out", ch: { dxSplit: [-0.25, 0], scale: [1.3, 1], alpha: [0, 1] } }),
  },
  {
    id: "text.disintegration", version: 1, kind: "text", name: "Disintegration Reveal", tags: ["kinetic"],
    resolve: () => ({ inFrac: 0.8, ease: "linear", stag: { by: "char", amt: 0.8, order: "rand" }, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.shatter", version: 1, kind: "text", name: "Shatter Reveal", tags: ["kinetic"],
    resolve: () => ({ inFrac: 0.7, ease: "overshoot", stag: { by: "char", amt: 0.5 }, burst: 0.35, ch: { rot: [-40, 0], scale: [0.6, 1], alpha: [0, 1] } }),
  },
  {
    id: "text.gravity", version: 1, kind: "text", name: "Gravity Drop", tags: ["kinetic"],
    resolve: () => ({ inFrac: 0.75, ease: "bounce", stag: { by: "char", amt: 0.5 }, ch: { dy: [-0.12, 0], alpha: [0, 1] } }),
  },

  /* ---------------- Luxury & editorial ---------------- */
  {
    id: "text.elegant_fade_up", version: 1, kind: "text", name: "Elegant Fade-Up", tags: ["luxe"],
    resolve: () => ({ inFrac: 0.75, ease: "inOut", ch: { alpha: [0, 1], dy: [0.03, 0], track: [-0.03, 0] } }),
  },
  {
    id: "text.slow_mask", version: 1, kind: "text", name: "Slow Mask Reveal", tags: ["luxe"],
    resolve: () => ({ inFrac: 0.9, ease: "inOut", ch: { wipe: [0, 1] }, wipeAxis: "x", feather: 0.9 }),
  },
  {
    id: "text.spacing_reveal", version: 1, kind: "text", name: "Letter Spacing Reveal", tags: ["luxe"],
    resolve: () => ({ inFrac: 0.7, ease: "out", ch: { track: [0.06, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.soft_blur", version: 1, kind: "text", name: "Soft Blur Reveal", tags: ["luxe"],
    resolve: () => ({ inFrac: 0.75, ease: "inOut", ch: { blur: [0.9, 0], alpha: [0, 1] } }),
  },
  {
    id: "text.minimal_line", version: 1, kind: "text", name: "Minimalist Line Reveal", tags: ["luxe"],
    resolve: () => ({ inFrac: 0.7, ease: "out", stag: { by: "line", amt: 0.5 }, ch: { alpha: [0, 1], dy: [0.025, 0] } }),
  },
  {
    id: "text.gold_shimmer", version: 1, kind: "text", name: "Gold Shimmer", tags: ["luxe"],
    resolve: () => ({ inFrac: 0.6, ease: "out", shimmer: 1, tint: "#F5D67B", ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.luxury_title", version: 1, kind: "text", name: "Luxury Brand Title Reveal", tags: ["luxe"],
    resolve: () => ({ inFrac: 0.95, ease: "inOut", shimmer: 0.45, ch: { wipe: [0, 1], track: [-0.09, 0] }, wipeAxis: "x", feather: 0.8 }),
  },
  {
    id: "text.serif_reveal", version: 1, kind: "text", name: "Serif Cinematic Reveal", tags: ["luxe"],
    resolve: () => ({ inFrac: 0.75, ease: "out", stag: { by: "word", amt: 0.45 }, font: "Georgia", ch: { alpha: [0, 1], dy: [0.025, 0] } }),
  },

  /* ---------------- Paths & gradients (SVG-style → canvas) ---------------- */
  {
    id: "text.text_path", version: 1, kind: "text", name: "Text on a Path", tags: ["adv"],
    resolve: () => ({ inFrac: 0.7, ease: "out", stag: { by: "char", amt: 0.5 }, path: { shape: "arc", bend: 1.1, speed: 0.2 }, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.motion_path", version: 1, kind: "text", name: "Text Along a Motion Path", tags: ["adv"],
    resolve: () => ({ inFrac: 0.85, ease: "out", stag: { by: "char", amt: 0.85 }, path: { shape: "wave", amp: 0.3, freq: 1.2, speed: 0.5 }, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.grad_text", version: 1, kind: "text", name: "Animated Text Gradient", tags: ["adv"],
    resolve: () => ({ inFrac: 0.6, ease: "out", fill: "gradient", tint: "#7DD3FC", shimmer: 0.3, ch: { alpha: [0, 1] } }),
  },
  {
    id: "text.gradient_mask", version: 1, kind: "text", name: "Gradient Mask Text", tags: ["adv"],
    resolve: () => ({ inFrac: 0.7, ease: "inOut", fill: "gradient", tint: "#C4B5FD", ch: { wipe: [0, 1] }, wipeAxis: "x", feather: 0.7 }),
  },
  {
    id: "text.kinetic_timeline", version: 1, kind: "text", name: "Kinetic Typography Timeline", tags: ["adv"],
    resolve: () => ({ inFrac: 0.7, ease: "out", stag: { by: "word", amt: 0.5 }, shimmer: 0.5, wave: { amp: 0.12, freq: 2, speed: 1.2 }, ch: { alpha: [0, 1] } }),
  },
];

/** Exit animations (D43) — played over the slot's final beats. */
export const TEXT_EXITS: VisualPreset[] = [
  {
    id: "text.fade_out", version: 1, kind: "text", name: "Fade-Out", tags: ["exit"],
    resolve: () => ({ outFrac: 0.35, ease: "in", ch: { alpha: [1, 0] } }),
  },
  {
    id: "text.slide_out", version: 1, kind: "text", name: "Slide-Out", tags: ["exit"],
    resolve: () => ({ outFrac: 0.3, ease: "in", ch: { alpha: [1, 0], dx: [0, 0.14] } }),
  },
  {
    id: "text.blur_out", version: 1, kind: "text", name: "Blur-Out", tags: ["exit"],
    resolve: () => ({ outFrac: 0.35, ease: "in", ch: { blur: [0, 1.2], alpha: [1, 0] } }),
  },
  {
    id: "text.masked_exit", version: 1, kind: "text", name: "Masked Exit", tags: ["exit"],
    resolve: () => ({ outFrac: 0.3, ease: "inOut", ch: { wipe: [1, 0] }, wipeAxis: "x", feather: 0 }),
  },
  {
    id: "text.letter_gone", version: 1, kind: "text", name: "Letter-by-Letter Disappear", tags: ["exit"],
    resolve: () => ({ outFrac: 0.45, ease: "in", stag: { by: "char", amt: 0.7 }, ch: { alpha: [1, 0] } }),
  },
  {
    id: "text.word_exit", version: 1, kind: "text", name: "Word-by-Word Exit", tags: ["exit"],
    resolve: () => ({ outFrac: 0.4, ease: "in", stag: { by: "word", amt: 0.6 }, ch: { alpha: [1, 0], dy: [0, 0.03] } }),
  },
  {
    id: "text.scatter_out", version: 1, kind: "text", name: "Scatter Out", tags: ["exit"],
    resolve: () => ({ outFrac: 0.35, ease: "in", burst: 0.5, ch: { alpha: [1, 0], rot: [0, 30] } }),
  },
  {
    id: "text.collapse", version: 1, kind: "text", name: "Collapse Exit", tags: ["exit"],
    resolve: () => ({ outFrac: 0.28, ease: "in", ch: { scale: [1, 0.15], alpha: [1, 0] } }),
  },
  {
    id: "text.scale_down", version: 1, kind: "text", name: "Scale-Down Exit", tags: ["exit"],
    resolve: () => ({ outFrac: 0.3, ease: "in", ch: { scale: [1, 0.6], alpha: [1, 0] } }),
  },
  {
    id: "text.rotation_exit", version: 1, kind: "text", name: "Rotation Exit", tags: ["exit"],
    resolve: () => ({ outFrac: 0.35, ease: "in", ch: { rot: [0, -40], scale: [1, 0.8], alpha: [1, 0] } }),
  },
  {
    id: "text.glitch_out", version: 1, kind: "text", name: "Glitch-Out", tags: ["exit"],
    resolve: () => ({ outFrac: 0.35, ease: "linear", glitch: { rgb: 1, rows: 0.8, flicker: 0.7 }, ch: { alpha: [1, 0] } }),
  },
  {
    id: "text.dissolve_out", version: 1, kind: "text", name: "Dissolve Out", tags: ["exit"],
    resolve: () => ({ outFrac: 0.5, ease: "linear", stag: { by: "char", amt: 0.85, order: "rand" }, ch: { alpha: [1, 0] } }),
  },
  {
    id: "text.wipe_out", version: 1, kind: "text", name: "Wipe-Out", tags: ["exit"],
    resolve: () => ({ outFrac: 0.3, ease: "inOut", ch: { wipe: [1, 0] }, wipeAxis: "y", feather: 0.5 }),
  },
  {
    id: "text.char_drop", version: 1, kind: "text", name: "Character Drop-Out", tags: ["exit"],
    resolve: () => ({ outFrac: 0.4, ease: "in", stag: { by: "char", amt: 0.6 }, ch: { dy: [0, 0.1], alpha: [1, 0] } }),
  },
];
