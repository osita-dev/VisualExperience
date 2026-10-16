/**
 * The SFX CATALOG (D41) — pure data: every sound effect a creator can
 * attach to a slot cut, an effect, a transition or a text. Sounds are
 * synthesized procedurally by the player (zero binary assets ship with
 * the project: D8/D17); this list is the single source of truth that
 * validation (V8) and the builder's pickers agree on.
 *
 * 8 categories · 85 sounds — the common video-editing SFX vocabulary.
 * Ten ids double as the built-in preset sounds (whooshes, hits, shutter…),
 * so everything validation ever meets is inside this catalog.
 */

export type SfxCategory =
  | "cuts"
  | "transitions"
  | "visual"
  | "text"
  | "speed"
  | "cinematic"
  | "photography"
  | "ui";

export const SFX_CATEGORIES: { id: SfxCategory; label: string }[] = [
  { id: "cuts", label: "Cuts" },
  { id: "transitions", label: "Transitions" },
  { id: "visual", label: "Visual Effects" },
  { id: "text", label: "Logo & Text Reveals" },
  { id: "speed", label: "Speed Ramps & Zooms" },
  { id: "cinematic", label: "Cinematic" },
  { id: "photography", label: "Photography & Studio" },
  { id: "ui", label: "UI & Motion Graphics" },
];

export interface SfxDef {
  /** `sfx.<snake_case>` — what the schedule and synth agree on */
  id: string;
  /** display name in the picker */
  name: string;
  category: SfxCategory;
}

export const SFX_LIBRARY: SfxDef[] = [
  /* ---- Cuts ---- */
  { id: "sfx.whoosh_hit", name: "Whoosh Hit", category: "cuts" },
  { id: "sfx.hit_02", name: "Impact Hit", category: "cuts" },
  { id: "sfx.punch", name: "Punch", category: "cuts" },
  { id: "sfx.glitch_sting", name: "Glitch Cut", category: "cuts" },
  { id: "sfx.record_scratch", name: "Record Scratch", category: "cuts" },
  { id: "sfx.click", name: "Click", category: "cuts" },
  { id: "sfx.snap", name: "Snap", category: "cuts" },
  { id: "sfx.bass_hit", name: "Bass Hit", category: "cuts" },
  { id: "sfx.hit_01", name: "Hard Hit", category: "cuts" },

  /* ---- Transitions ---- */
  { id: "sfx.whoosh_01", name: "Whoosh", category: "transitions" },
  { id: "sfx.sweep", name: "Sweep", category: "transitions" },
  { id: "sfx.swish", name: "Swish", category: "transitions" },
  { id: "sfx.whip_whoosh", name: "Whip Whoosh", category: "transitions" },
  { id: "sfx.riser", name: "Riser", category: "transitions" },
  { id: "sfx.reverse_cymbal", name: "Reverse Cymbal", category: "transitions" },
  { id: "sfx.bass_drop", name: "Bass Drop", category: "transitions" },
  { id: "sfx.impact_sub", name: "Sub Drop", category: "transitions" },
  { id: "sfx.transition_whoosh", name: "Transition Whoosh", category: "transitions" },
  { id: "sfx.cinematic_sweep", name: "Cinematic Sweep", category: "transitions" },
  { id: "sfx.air_whoosh", name: "Air Whoosh", category: "transitions" },
  { id: "sfx.whoosh_02", name: "Reverse Whoosh", category: "transitions" },

  /* ---- Visual Effects ---- */
  { id: "sfx.pop", name: "Pop", category: "visual" },
  { id: "sfx.glitch", name: "Glitch", category: "visual" },
  { id: "sfx.laser_zap", name: "Laser Zap", category: "visual" },
  { id: "sfx.magic_sparkle", name: "Magic Sparkle", category: "visual" },
  { id: "sfx.shimmer", name: "Shimmer", category: "visual" },
  { id: "sfx.ui_click", name: "UI Click", category: "visual" },
  { id: "sfx.digital_beep", name: "Digital Beep", category: "visual" },
  { id: "sfx.bubble_pop", name: "Bubble Pop", category: "visual" },
  { id: "sfx.electric_zap", name: "Electric Zap", category: "visual" },
  { id: "sfx.warp", name: "Warp", category: "visual" },
  { id: "sfx.mechanical_clunk", name: "Mechanical Clunk", category: "visual" },
  { id: "sfx.cartoon_boing", name: "Cartoon Boing", category: "visual" },
  { id: "sfx.typing", name: "Typing Sound", category: "visual" },
  { id: "sfx.notification_ping", name: "Notification Ping", category: "visual" },
  { id: "sfx.camera_flash", name: "Camera Flash", category: "visual" },

  /* ---- Logo & Text Reveals ---- */
  { id: "sfx.logo_reveal_impact", name: "Logo Reveal Impact", category: "text" },
  { id: "sfx.cinematic_hit", name: "Cinematic Hit", category: "text" },
  { id: "sfx.deep_boom", name: "Deep Boom", category: "text" },
  { id: "sfx.whoosh_impact", name: "Whoosh Impact", category: "text" },
  { id: "sfx.shimmer_reveal", name: "Shimmer Reveal", category: "text" },
  { id: "sfx.sparkle_hit", name: "Sparkle Hit", category: "text" },
  { id: "sfx.title_pop", name: "Title Pop", category: "text" },
  { id: "sfx.text_whoosh", name: "Text Whoosh", category: "text" },
  { id: "sfx.bass_impact", name: "Bass Impact", category: "text" },
  { id: "sfx.dramatic_riser", name: "Dramatic Riser", category: "text" },

  /* ---- Speed Ramps & Zooms ---- */
  { id: "sfx.speed_ramp_whoosh", name: "Speed Ramp Whoosh", category: "speed" },
  { id: "sfx.velocity", name: "Velocity", category: "speed" },
  { id: "sfx.fast_whoosh", name: "Fast Whoosh", category: "speed" },
  { id: "sfx.zoom_in", name: "Zoom In", category: "speed" },
  { id: "sfx.zoom_out", name: "Zoom Out", category: "speed" },
  { id: "sfx.punch_zoom", name: "Punch Zoom", category: "speed" },
  { id: "sfx.whip_pan", name: "Whip Pan", category: "speed" },
  { id: "sfx.fast_swish", name: "Fast Swish", category: "speed" },
  { id: "sfx.doppler_whoosh", name: "Doppler Whoosh", category: "speed" },

  /* ---- Cinematic ---- */
  { id: "sfx.cinematic_boom", name: "Cinematic Boom", category: "cinematic" },
  { id: "sfx.deep_impact", name: "Deep Impact", category: "cinematic" },
  { id: "sfx.dark_rumble", name: "Dark Rumble", category: "cinematic" },
  { id: "sfx.tension_riser", name: "Tension Riser", category: "cinematic" },
  { id: "sfx.epic_hit", name: "Epic Hit", category: "cinematic" },
  { id: "sfx.trailer_hit", name: "Trailer Hit", category: "cinematic" },
  { id: "sfx.low_bass_drop", name: "Low Bass Drop", category: "cinematic" },
  { id: "sfx.atmospheric_sweep", name: "Atmospheric Sweep", category: "cinematic" },
  { id: "sfx.thunder_impact", name: "Thunder Impact", category: "cinematic" },
  { id: "sfx.heavy_slam", name: "Heavy Slam", category: "cinematic" },

  /* ---- Photography & Studio ---- */
  { id: "sfx.shutter", name: "Camera Shutter", category: "photography" },
  { id: "sfx.dslr_shutter", name: "DSLR Shutter", category: "photography" },
  { id: "sfx.flash_pop", name: "Flash Pop", category: "photography" },
  { id: "sfx.film_click", name: "Film Camera Click", category: "photography" },
  { id: "sfx.focus_beep", name: "Camera Focus Beep", category: "photography" },
  { id: "sfx.lens_zoom", name: "Lens Zoom", category: "photography" },
  { id: "sfx.photo_snap", name: "Photo Snap", category: "photography" },
  { id: "sfx.polaroid_eject", name: "Polaroid Eject", category: "photography" },
  { id: "sfx.studio_ambience", name: "Studio Ambience", category: "photography" },
  { id: "sfx.light_switch", name: "Light Switch Click", category: "photography" },

  /* ---- UI & Motion Graphics ---- */
  { id: "sfx.button_click", name: "Button Click", category: "ui" },
  { id: "sfx.mouse_click", name: "Mouse Click", category: "ui" },
  { id: "sfx.digital_tick", name: "Digital Tick", category: "ui" },
  { id: "sfx.interface_beep", name: "Interface Beep", category: "ui" },
  { id: "sfx.notification_pop", name: "Notification Pop", category: "ui" },
  { id: "sfx.data_glitch", name: "Data Glitch", category: "ui" },
  { id: "sfx.digital_sweep", name: "Digital Sweep", category: "ui" },
  { id: "sfx.tech_whoosh", name: "Tech Whoosh", category: "ui" },
  { id: "sfx.futuristic_scan", name: "Futuristic Scan", category: "ui" },
  { id: "sfx.hologram", name: "Hologram Effect", category: "ui" },
];

/** Every sound asset id validation (V8) accepts — the catalog itself. */
export const SFX_ASSETS: string[] = SFX_LIBRARY.map((d) => d.id);

/** Display name for an asset id (pickers, validation messages). */
export function sfxName(asset: string): string {
  return SFX_LIBRARY.find((d) => d.id === asset)?.name ?? asset;
}
