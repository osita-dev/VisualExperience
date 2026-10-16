/**
 * MUSIC TONE CATALOG (the unlocked model) — short procedural melodies that
 * act as a SOUNDTRACK, never as a clock: no BPM anywhere in the model, no
 * grid, no beat budget. Pure data + pure math: no Web Audio, no DOM, so
 * validation, the builder dropdown and verify-core all read the same list.
 *
 * Every tone is note data authored in code (pitch + timing), synthesised by
 * the audio engine — zero audio files ship, same zero-binary-assets rule as
 * SFX (D8). Names are labels for motifs we compose in each style, not
 * copied recordings.
 *
 * Playback follows each tone's NATURE (settled): ringtones and melodies
 * `loop: true` and fill the whole video; alerts, beeps and one-shot
 * notification sounds `loop: false` and play once from the start.
 */

/** Synthesis character — one envelope/waveform family per voice. */
export type ToneVoice = "square" | "warble" | "poly" | "marimba" | "chime";

export type ToneGroup =
  | "nokia"
  | "samsung"
  | "tecno"
  | "infinix"
  | "china"
  | "notify"
  | "feature";

/** Dropdown group order + labels (the creator's catalog sections). */
export const TONE_GROUPS: { id: ToneGroup; label: string }[] = [
  { id: "nokia", label: "Classic Nokia Tones" },
  { id: "samsung", label: "Old Samsung Tones" },
  { id: "tecno", label: "Old Tecno Tones" },
  { id: "infinix", label: "Old Infinix Tones" },
  { id: "china", label: "Old Chinese Phone Tones" },
  { id: "notify", label: "Notification Sounds" },
  { id: "feature", label: "Feature Phone Sounds" },
];

/** A single note: [startBeat, lengthBeats, midiPitch]. */
export type ToneNote = [number, number, number];

export interface ToneDef {
  /** track id part — the template stores `tone:<id>` */
  id: string;
  /** display name in the dropdown */
  name: string;
  group: ToneGroup;
  voice: ToneVoice;
  /** true = loops to fill the video; false = plays once at the start */
  loop: boolean;
  /** seconds per beat — the motif's INTERNAL tempo (never surfaced as BPM) */
  spb: number;
  /** the motif, authored in beats of `spb` */
  notes: ToneNote[];
}

/* ------------------------------------------------------------------ *
 * The catalog — 7 groups. Group 4–7 entries beyond the user's paste are
 * faithful retro motifs, expandable later (settled: "later we add more").
 * ------------------------------------------------------------------ */

export const TONES: ToneDef[] = [
  /* ---------------- Classic Nokia Tones ---------------- */
  {
    id: "nokia.tune",
    name: "Nokia Tune (Original)",
    group: "nokia",
    voice: "square",
    loop: true,
    spb: 0.15,
    notes: [
      [0, 1, 88], [1, 1, 86], [2, 1, 90], [3, 1, 92],
      [4, 1, 90], [5, 1, 93], [6, 1, 96], [7, 2, 95],
      [9, 1, 98], [10, 1, 100], [11, 1, 103], [12, 3, 102],
    ],
  },
  {
    id: "nokia.tune_remix",
    name: "Nokia Tune Remix",
    group: "nokia",
    voice: "square",
    loop: true,
    spb: 0.11,
    notes: [
      [0, 1, 88], [1, 1, 86], [2, 1, 90], [3, 1, 92],
      [4, 1, 90], [5, 1, 93], [6, 1, 96], [7, 1, 95],
      [8, 1, 88], [9, 1, 95], [10, 1, 98], [11, 1, 95],
      [12, 2, 100], [14, 2, 103], [16, 3, 102],
    ],
  },
  {
    id: "nokia.grande_valse",
    name: "Nokia Grande Valse",
    group: "nokia",
    voice: "poly",
    loop: true,
    spb: 0.2,
    notes: [
      [0, 1, 81], [1, 1, 84], [2, 1, 88], [3, 2, 86],
      [5, 1, 84], [6, 1, 81], [7, 2, 79],
      [9, 1, 77], [10, 1, 81], [11, 1, 84], [12, 3, 81],
    ],
  },
  {
    id: "nokia.connecting_people",
    name: "Nokia Connecting People",
    group: "nokia",
    voice: "chime",
    loop: true,
    spb: 0.22,
    notes: [
      [0, 2, 76], [2, 2, 79], [4, 2, 83], [6, 4, 88],
      [10, 2, 86], [12, 4, 83],
    ],
  },
  {
    id: "nokia.sms",
    name: "Nokia SMS Tone",
    group: "nokia",
    voice: "square",
    loop: false,
    spb: 0.12,
    notes: [
      [0, 1, 93], [1.5, 1, 88], [3, 2, 93],
    ],
  },
  {
    id: "nokia.message",
    name: "Nokia Message Alert",
    group: "nokia",
    voice: "marimba",
    loop: false,
    spb: 0.13,
    notes: [
      [0, 1, 84], [1, 1, 88], [2, 2, 91],
    ],
  },
  {
    id: "nokia.alarm",
    name: "Nokia Alarm Tone",
    group: "nokia",
    voice: "square",
    loop: true,
    spb: 0.16,
    notes: [
      [0, 1, 88], [1, 1, 91], [2, 2, 88],
      [4, 1, 91], [5, 1, 94], [6, 2, 91],
      [8, 1, 88], [9, 1, 91], [10, 2, 88],
      [12, 1, 91], [13, 1, 94], [14, 2, 91],
    ],
  },
  {
    id: "nokia.ringing",
    name: "Nokia Classic Ringing",
    group: "nokia",
    voice: "warble",
    loop: true,
    spb: 0.18,
    notes: [
      [0, 2, 86], [2, 2, 81], [4, 2, 86], [6, 2, 81],
      [8, 2, 86], [10, 2, 81], [12, 2, 84], [14, 2, 79],
    ],
  },
  {
    id: "nokia.n3310",
    name: "Nokia 3310 Ringtone",
    group: "nokia",
    voice: "square",
    loop: true,
    spb: 0.14,
    notes: [
      [0, 1, 79], [1, 1, 83], [2, 1, 86], [3, 1, 88],
      [4, 2, 86], [6, 1, 83], [7, 1, 79],
      [8, 1, 81], [9, 1, 84], [10, 1, 88], [11, 2, 91],
      [13, 3, 88],
    ],
  },
  {
    id: "nokia.n5110",
    name: "Nokia 5110 Ringtone",
    group: "nokia",
    voice: "square",
    loop: true,
    spb: 0.15,
    notes: [
      [0, 1, 91], [1, 1, 88], [2, 1, 84], [3, 1, 81],
      [4, 2, 84], [6, 2, 88],
      [8, 1, 91], [9, 1, 88], [10, 2, 86], [12, 4, 83],
    ],
  },
  {
    id: "nokia.n6300",
    name: "Nokia 6300 Ringtone",
    group: "nokia",
    voice: "poly",
    loop: true,
    spb: 0.13,
    notes: [
      [0, 1, 76], [1, 1, 80], [2, 1, 83], [3, 1, 88],
      [4, 1, 83], [5, 1, 80], [6, 2, 76],
      [8, 1, 74], [9, 1, 78], [10, 1, 81], [11, 1, 86],
      [12, 1, 81], [13, 1, 78], [14, 2, 74],
    ],
  },
  {
    id: "nokia.n1110",
    name: "Nokia 1110 Ringtone",
    group: "nokia",
    voice: "warble",
    loop: true,
    spb: 0.12,
    notes: [
      [0, 1, 88], [1, 1, 89], [2, 1, 88], [3, 1, 89],
      [4, 2, 88], [6, 2, 84],
      [8, 1, 88], [9, 1, 89], [10, 1, 88], [11, 1, 89],
      [12, 4, 91],
    ],
  },
  {
    id: "nokia.xpresson",
    name: "Nokia Xpress-on Tones",
    group: "nokia",
    voice: "marimba",
    loop: true,
    spb: 0.14,
    notes: [
      [0, 1, 88], [1, 1, 90], [2, 1, 93], [3, 2, 90],
      [5, 1, 88], [6, 2, 85],
      [8, 1, 83], [9, 1, 85], [10, 1, 88], [11, 3, 85],
    ],
  },
  {
    id: "nokia.composer",
    name: "Nokia Composer Ringtone",
    group: "nokia",
    voice: "square",
    loop: true,
    spb: 0.16,
    notes: [
      [0, 1, 76], [1, 1, 76], [2, 2, 79], [4, 1, 76],
      [5, 1, 76], [6, 2, 83], [8, 1, 74], [9, 1, 74],
      [10, 2, 81], [12, 4, 79],
    ],
  },

  /* ---------------- Old Samsung Tones ---------------- */
  {
    id: "samsung.horizon_old",
    name: "Samsung Over the Horizon (Old Version)",
    group: "samsung",
    voice: "poly",
    loop: true,
    spb: 0.17,
    notes: [
      [0, 1, 79], [1, 1, 83], [2, 1, 86], [3, 1, 88],
      [4, 2, 86], [6, 2, 83],
      [8, 1, 81], [9, 1, 84], [10, 1, 88], [11, 2, 86],
      [13, 3, 83],
    ],
  },
  {
    id: "samsung.classic_ring",
    name: "Samsung Classic Ring",
    group: "samsung",
    voice: "warble",
    loop: true,
    spb: 0.19,
    notes: [
      [0, 2, 84], [2, 2, 88], [4, 2, 84], [6, 2, 88],
      [8, 2, 84], [10, 2, 88], [12, 2, 82], [14, 2, 86],
    ],
  },
  {
    id: "samsung.whistle",
    name: "Samsung Whistle",
    group: "samsung",
    voice: "chime",
    loop: true,
    spb: 0.21,
    notes: [
      [0, 1, 88], [1, 1, 91], [2, 2, 95], [4, 1, 93],
      [5, 1, 91], [6, 3, 88],
      [9, 1, 86], [10, 1, 88], [11, 3, 91],
    ],
  },
  {
    id: "samsung.morning_flower",
    name: "Samsung Morning Flower",
    group: "samsung",
    voice: "marimba",
    loop: true,
    spb: 0.18,
    notes: [
      [0, 1, 77], [1, 1, 81], [2, 1, 84], [3, 1, 88],
      [4, 2, 86], [6, 2, 84],
      [8, 1, 81], [9, 1, 84], [10, 1, 88], [11, 1, 91],
      [12, 4, 88],
    ],
  },
  {
    id: "samsung.message",
    name: "Samsung Message Alert",
    group: "samsung",
    voice: "chime",
    loop: false,
    spb: 0.14,
    notes: [
      [0, 1, 91], [1, 1, 95], [2, 2, 98],
    ],
  },
  {
    id: "samsung.old_sms",
    name: "Samsung Old SMS Tone",
    group: "samsung",
    voice: "square",
    loop: false,
    spb: 0.11,
    notes: [
      [0, 1, 96], [1.5, 1, 96], [3, 2, 93],
    ],
  },
  {
    id: "samsung.gt_s5230",
    name: "Samsung GT-S5230 Tone",
    group: "samsung",
    voice: "poly",
    loop: true,
    spb: 0.15,
    notes: [
      [0, 1, 81], [1, 1, 84], [2, 1, 88], [3, 1, 92],
      [4, 2, 90], [6, 2, 86],
      [8, 1, 84], [9, 1, 88], [10, 1, 91], [11, 3, 88],
    ],
  },
  {
    id: "samsung.e250",
    name: "Samsung E250 Ringtone",
    group: "samsung",
    voice: "square",
    loop: true,
    spb: 0.14,
    notes: [
      [0, 1, 84], [1, 1, 86], [2, 1, 88], [3, 2, 91],
      [5, 1, 88], [6, 1, 86], [7, 2, 84],
      [9, 1, 81], [10, 1, 84], [11, 1, 88], [12, 4, 86],
    ],
  },
  {
    id: "samsung.d500",
    name: "Samsung D500 Ringtone",
    group: "samsung",
    voice: "warble",
    loop: true,
    spb: 0.13,
    notes: [
      [0, 1, 88], [1, 1, 86], [2, 1, 88], [3, 1, 86],
      [4, 2, 84], [6, 2, 81],
      [8, 1, 88], [9, 1, 86], [10, 1, 88], [11, 1, 90],
      [12, 4, 91],
    ],
  },
  {
    id: "samsung.corby",
    name: "Samsung Corby Tone",
    group: "samsung",
    voice: "marimba",
    loop: true,
    spb: 0.16,
    notes: [
      [0, 1, 86], [1, 1, 89], [2, 1, 93], [3, 2, 89],
      [5, 1, 86], [6, 2, 82],
      [8, 1, 84], [9, 1, 87], [10, 1, 91], [11, 3, 87],
    ],
  },

  /* ---------------- Old Tecno Tones ---------------- */
  {
    id: "tecno.classic",
    name: "Tecno Classic Ringtone",
    group: "tecno",
    voice: "poly",
    loop: true,
    spb: 0.16,
    notes: [
      [0, 1, 76], [1, 1, 79], [2, 1, 83], [3, 1, 86],
      [4, 2, 83], [6, 2, 79],
      [8, 1, 77], [9, 1, 81], [10, 1, 84], [11, 2, 81],
      [13, 3, 79],
    ],
  },
  {
    id: "tecno.old_ring",
    name: "Tecno Old Phone Ring",
    group: "tecno",
    voice: "warble",
    loop: true,
    spb: 0.17,
    notes: [
      [0, 2, 84], [2, 2, 81], [4, 2, 84], [6, 2, 88],
      [8, 2, 84], [10, 2, 81], [12, 4, 79],
    ],
  },
  {
    id: "tecno.sms",
    name: "Tecno SMS Alert",
    group: "tecno",
    voice: "marimba",
    loop: false,
    spb: 0.12,
    notes: [
      [0, 1, 88], [1, 1, 91], [2, 2, 95],
    ],
  },
  {
    id: "tecno.message",
    name: "Tecno Message Tone",
    group: "tecno",
    voice: "chime",
    loop: false,
    spb: 0.13,
    notes: [
      [0, 1, 93], [1.5, 1, 90], [3, 2, 88],
    ],
  },
  {
    id: "tecno.phantom",
    name: "Tecno Phantom Classic Tone",
    group: "tecno",
    voice: "square",
    loop: true,
    spb: 0.14,
    notes: [
      [0, 1, 79], [1, 1, 83], [2, 1, 86], [3, 2, 83],
      [5, 1, 79], [6, 2, 74],
      [8, 1, 77], [9, 1, 81], [10, 1, 86], [11, 3, 83],
    ],
  },
  {
    id: "tecno.t301",
    name: "Tecno T301 Ringtone",
    group: "tecno",
    voice: "square",
    loop: true,
    spb: 0.15,
    notes: [
      [0, 1, 81], [1, 1, 84], [2, 1, 88], [3, 1, 84],
      [4, 2, 86], [6, 2, 81],
      [8, 1, 83], [9, 1, 86], [10, 1, 90], [11, 3, 86],
    ],
  },
  {
    id: "tecno.t340",
    name: "Tecno T340 Ringtone",
    group: "tecno",
    voice: "poly",
    loop: true,
    spb: 0.16,
    notes: [
      [0, 1, 84], [1, 1, 86], [2, 1, 88], [3, 1, 91],
      [4, 2, 88], [6, 2, 86],
      [8, 1, 84], [9, 1, 83], [10, 1, 81], [11, 4, 79],
    ],
  },

  /* ---------------- Old Infinix Tones ---------------- */
  {
    id: "infinix.classic",
    name: "Infinix Classic Ringtone",
    group: "infinix",
    voice: "poly",
    loop: true,
    spb: 0.15,
    notes: [
      [0, 1, 79], [1, 1, 84], [2, 1, 88], [3, 1, 91],
      [4, 2, 88], [6, 2, 84],
      [8, 1, 81], [9, 1, 86], [10, 1, 90], [11, 3, 86],
    ],
  },
  {
    id: "infinix.old_sms",
    name: "Infinix Old SMS",
    group: "infinix",
    voice: "square",
    loop: false,
    spb: 0.11,
    notes: [
      [0, 1, 95], [1.5, 1, 95], [3, 2, 91],
    ],
  },
  {
    id: "infinix.message",
    name: "Infinix Message Tone",
    group: "infinix",
    voice: "chime",
    loop: false,
    spb: 0.13,
    notes: [
      [0, 1, 90], [1, 1, 95], [2, 2, 98],
    ],
  },
  {
    id: "infinix.hot",
    name: "Infinix Hot Ringtone",
    group: "infinix",
    voice: "marimba",
    loop: true,
    spb: 0.14,
    notes: [
      [0, 1, 83], [1, 1, 86], [2, 1, 90], [3, 2, 93],
      [5, 1, 90], [6, 1, 86], [7, 2, 83],
      [9, 1, 81], [10, 1, 85], [11, 1, 88], [12, 3, 86],
    ],
  },
  {
    id: "infinix.note_alert",
    name: "Infinix Note Alert",
    group: "infinix",
    voice: "marimba",
    loop: false,
    spb: 0.14,
    notes: [
      [0, 1, 86], [1, 1, 90], [2, 1, 93], [3, 2, 90],
    ],
  },
  {
    id: "infinix.zero_tune",
    name: "Infinix Zero Tune",
    group: "infinix",
    voice: "square",
    loop: true,
    spb: 0.16,
    notes: [
      [0, 1, 76], [1, 1, 81], [2, 1, 84], [3, 1, 88],
      [4, 2, 86], [6, 2, 81],
      [8, 1, 79], [9, 1, 83], [10, 1, 86], [11, 4, 83],
    ],
  },

  /* ---------------- Old Chinese Phone Tones ---------------- */
  {
    id: "china.mtk_default",
    name: "MTK Default Ringtone",
    group: "china",
    voice: "poly",
    loop: true,
    spb: 0.15,
    notes: [
      [0, 1, 81], [1, 1, 84], [2, 1, 88], [3, 1, 91],
      [4, 1, 88], [5, 1, 84], [6, 2, 81],
      [8, 1, 79], [9, 1, 83], [10, 1, 86], [11, 1, 90],
      [12, 2, 86], [13, 1, 83], [14, 2, 79],
    ],
  },
  {
    id: "china.old_melody",
    name: "Old China Phone Melody",
    group: "china",
    voice: "warble",
    loop: true,
    spb: 0.18,
    notes: [
      [0, 2, 84], [2, 1, 86], [3, 1, 88], [4, 2, 84],
      [6, 2, 81],
      [8, 2, 79], [10, 1, 81], [11, 1, 84], [12, 4, 81],
    ],
  },
  {
    id: "china.dual_sim",
    name: "Dual SIM Ring Tone",
    group: "china",
    voice: "square",
    loop: true,
    spb: 0.13,
    notes: [
      [0, 1, 88], [1, 1, 84], [2, 1, 88], [3, 1, 91],
      [4, 2, 88], [6, 2, 84],
      [8, 1, 86], [9, 1, 83], [10, 1, 86], [11, 1, 90],
      [12, 4, 88],
    ],
  },
  {
    id: "china.mobile_classic",
    name: "China Mobile Classic",
    group: "china",
    voice: "poly",
    loop: true,
    spb: 0.17,
    notes: [
      [0, 1, 77], [1, 1, 81], [2, 1, 84], [3, 2, 88],
      [5, 1, 86], [6, 2, 84],
      [8, 1, 81], [9, 1, 84], [10, 1, 88], [11, 4, 86],
    ],
  },
  {
    id: "china.startup_chime",
    name: "China Phone Startup Chime",
    group: "china",
    voice: "chime",
    loop: false,
    spb: 0.16,
    notes: [
      [0, 1, 84], [1, 1, 88], [2, 1, 91], [3, 2, 96], [5, 3, 95],
    ],
  },
  {
    id: "china.poly_classic",
    name: "China Polyphonic Classic",
    group: "china",
    voice: "poly",
    loop: true,
    spb: 0.16,
    notes: [
      [0, 1, 83], [1, 1, 86], [2, 1, 90], [3, 1, 93],
      [4, 2, 90], [6, 1, 86], [7, 1, 83],
      [8, 1, 81], [9, 1, 85], [10, 1, 88], [11, 3, 85],
    ],
  },

  /* ---------------- Notification Sounds ---------------- */
  {
    id: "notify.sms_beep",
    name: "Classic SMS Beep",
    group: "notify",
    voice: "square",
    loop: false,
    spb: 0.1,
    notes: [
      [0, 1, 96], [1.5, 1, 96],
    ],
  },
  {
    id: "notify.alert_whistle",
    name: "Alert Whistle",
    group: "notify",
    voice: "chime",
    loop: false,
    spb: 0.13,
    notes: [
      [0, 1, 93], [1, 1, 96], [2, 1, 100], [3, 2, 98],
    ],
  },
  {
    id: "notify.chime",
    name: "Notification Chime",
    group: "notify",
    voice: "chime",
    loop: false,
    spb: 0.15,
    notes: [
      [0, 1, 88], [1, 1, 93], [2, 3, 96],
    ],
  },
  {
    id: "notify.ding_dong",
    name: "Ding Dong Alert",
    group: "notify",
    voice: "marimba",
    loop: false,
    spb: 0.18,
    notes: [
      [0, 2, 91], [2, 3, 86],
    ],
  },
  {
    id: "notify.ping",
    name: "Soft Ping",
    group: "notify",
    voice: "chime",
    loop: false,
    spb: 0.14,
    notes: [
      [0, 1, 100], [1, 3, 95],
    ],
  },
  {
    id: "notify.message_buzzer",
    name: "Old Message Buzzer",
    group: "notify",
    voice: "square",
    loop: false,
    spb: 0.09,
    notes: [
      [0, 1, 79], [1, 1, 79], [2, 1, 79], [3, 2, 79],
    ],
  },

  /* ---------------- Feature Phone Sounds ---------------- */
  {
    id: "feature.keypad",
    name: "Keypad Tone",
    group: "feature",
    voice: "square",
    loop: false,
    spb: 0.11,
    notes: [
      [0, 1, 93], [1, 1, 91], [2, 1, 89], [3, 1, 88], [4, 2, 86],
    ],
  },
  {
    id: "feature.busy",
    name: "Busy Signal",
    group: "feature",
    voice: "square",
    loop: false,
    spb: 0.12,
    notes: [
      [0, 1, 81], [1, 1, 81], [2, 1, 81], [3, 1, 81],
      [4, 1, 81], [5, 1, 81], [6, 1, 81], [7, 2, 81],
    ],
  },
  {
    id: "feature.ringback",
    name: "Ring Back Tone",
    group: "feature",
    voice: "warble",
    loop: false,
    spb: 0.25,
    notes: [
      [0, 2, 84], [3, 2, 88], [6, 3, 84],
    ],
  },
  {
    id: "feature.startup",
    name: "Feature Phone Startup",
    group: "feature",
    voice: "chime",
    loop: false,
    spb: 0.15,
    notes: [
      [0, 1, 79], [1, 1, 84], [2, 1, 88], [3, 2, 91], [5, 3, 96],
    ],
  },
  {
    id: "feature.low_battery",
    name: "Low Battery Beep",
    group: "feature",
    voice: "square",
    loop: false,
    spb: 0.16,
    notes: [
      [0, 1, 88], [2, 1, 88], [4, 1, 88], [6, 2, 88],
    ],
  },
  {
    id: "feature.power_off",
    name: "Power Off Jingle",
    group: "feature",
    voice: "chime",
    loop: false,
    spb: 0.15,
    notes: [
      [0, 1, 96], [1, 1, 91], [2, 1, 86], [3, 3, 79],
    ],
  },
];

const BY_ID = new Map(TONES.map((t) => [t.id, t]));

/** Look a tone up by its bare id (the part after `tone:`). */
export function getTone(id: string): ToneDef | undefined {
  return BY_ID.get(id);
}

/** Every valid bare tone id (validation references). */
export const TONE_IDS: string[] = TONES.map((t) => t.id);

/**
 * Length of ONE pass of the motif in seconds (last note end + release
 * tail). The audio engine loops this buffer for `loop` tones.
 */
export function tonePassSeconds(tone: ToneDef): number {
  let endBeat = 0;
  for (const [b, len] of tone.notes) endBeat = Math.max(endBeat, b + len);
  return endBeat * tone.spb + 0.2;
}
