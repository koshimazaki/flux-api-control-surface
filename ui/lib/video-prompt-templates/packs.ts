import type { VideoPromptTemplate } from "./types";

/**
 * The shipped starter packs. Original, generic, public-safe scaffolds written
 * for this repository — never a private batch prompt, client brief, or
 * experiment log. Keyframes are addressed positionally so a permuted batch
 * keeps every prompt valid.
 */

const SIMPLE_TEMPLATES: VideoPromptTemplate[] = [
  {
    id: "video_simple_animate",
    name: "Animate this in {style}",
    category: "simple",
    summary: "The shortest useful video prompt: keep the frame, add motion.",
    body: "Animate image 1 in {style}. Keep its subject and framing exactly as they are and add only natural movement.",
    tags: ["starter", "one-liner"],
    hints: { style: "cinematic style, shallow depth of field" }
  },
  {
    id: "video_simple_subject_action",
    name: "Subject does one thing",
    category: "simple",
    summary: "One subject, one action, one locked-off take.",
    body: "The subject in image 1 {action}, in {style}. Locked-off camera, one continuous take.",
    tags: ["starter", "one-liner"],
    hints: { action: "drifts slowly across the frame" }
  },
  {
    id: "video_simple_first_to_last",
    name: "Image 1 to image 2",
    category: "simple",
    summary: "One continuous move between the first and last keyframe.",
    body: "Move from image 1 to image 2 in {style}. One continuous take, no cut, and the last frame lands exactly on image 2.",
    tags: ["starter", "one-liner", "keyframes"],
    hints: { style: "35mm film style, fine grain" }
  },
  {
    id: "video_simple_camera_move",
    name: "One camera move",
    category: "simple",
    summary: "Motion comes from the camera while the scene holds still.",
    body: "A slow {camera_move} across the scene in image 1, in {style}. Nothing else in the frame moves.",
    tags: ["starter", "camera"],
    hints: { camera_move: "push in" }
  },
  {
    id: "video_simple_loop",
    name: "Seamless loop",
    category: "simple",
    summary: "A repeating action whose last frame matches its first.",
    body: "Seamless loop starting and ending on image 1: {action} on repeat, in {style}. No cuts.",
    tags: ["starter", "loop"],
    hints: { action: "the sign flickers once and settles" }
  }
];

const DETAILED_TEMPLATES: VideoPromptTemplate[] = [
  {
    id: "video_detailed_shot",
    name: "Detailed shot",
    category: "detailed",
    summary: "Subject, framing, lens, light, motion, and finish in one spec.",
    body: [
      "Subject: {subject}, as framed in image 1, in {setting}, {style}.",
      "Camera: {shot_size} on a {lens} lens, {camera_move}.",
      "Light: {lighting}.",
      "Motion: {motion}, steady pace, one continuous take, no cuts.",
      "Finish: {grade}. No on-screen text and no watermark."
    ].join("\n"),
    tags: ["starter", "shot"],
    hints: {
      subject: "a ceramic vase",
      setting: "an empty gallery room",
      shot_size: "medium shot",
      lens: "50mm",
      camera_move: "slow dolly left",
      lighting: "soft north-window light with a long falloff",
      motion: "the vase turns a few degrees toward camera",
      grade: "neutral contrast, true-to-life color"
    },
    structure: {
      setup: "{subject} in {setting}, {style}.",
      camera: "{shot_size}, {lens} lens, {camera_move}",
      ambience: "{lighting}"
    }
  },
  {
    id: "video_detailed_product",
    name: "Product turntable",
    category: "detailed",
    summary: "Even orbit around a product with a still background.",
    body: [
      "The product in image 1 — {product} — centered on {surface}, {style}.",
      "Camera: slow {rotation_direction} orbit at product height, {lens} lens, constant distance.",
      "Light: {lighting}, clean highlight roll-off across {material}.",
      "Motion: the product rotates smoothly; the background stays completely still.",
      "Finish: no hands in frame, no added text, no logos beyond the product's own."
    ].join("\n"),
    tags: ["starter", "product"],
    hints: {
      product: "a matte metal water bottle",
      surface: "a pale stone plinth",
      rotation_direction: "clockwise",
      lens: "85mm",
      lighting: "large softbox above, white bounce card camera-left",
      material: "brushed aluminium"
    },
    structure: {
      setup: "{product} centered on {surface}, {style}.",
      camera: "slow {rotation_direction} orbit, {lens} lens, constant distance",
      ambience: "{lighting}"
    }
  },
  {
    id: "video_detailed_environment",
    name: "Establishing environment",
    category: "detailed",
    summary: "Wide location shot where only one element moves.",
    body: [
      "Establishing shot of the location in image 1 — {location} at {time_of_day} — {style}.",
      "Camera: {camera_move}, wide framing, horizon held level.",
      "Air: {weather}, with {atmosphere} drifting through the frame.",
      "Motion: only {moving_element} moves; the camera move stays slow and even."
    ].join("\n"),
    tags: ["starter", "environment"],
    hints: {
      location: "a flooded quarry",
      time_of_day: "first light",
      camera_move: "slow crane up",
      weather: "still air after rain",
      atmosphere: "low mist",
      moving_element: "the water surface"
    },
    structure: {
      setup: "Establishing shot of {location} at {time_of_day}, {style}.",
      camera: "{camera_move}, wide framing, horizon level",
      ambience: "{weather}, {atmosphere}"
    }
  },
  {
    id: "video_detailed_transition",
    name: "First frame to last frame",
    category: "detailed",
    summary: "Start and end states for a two-keyframe run, stated as exact frames.",
    body: [
      "Open on image 1: {first_frame}. Land on image 2: {last_frame}, {style}.",
      "The change happens once and evenly across the shot: {transition}.",
      "Camera: {camera_move}, continuous — no cut and no dissolve.",
      "The final frame must match image 2 exactly, style included."
    ].join("\n"),
    tags: ["starter", "keyframes"],
    hints: {
      first_frame: "a closed workshop door",
      last_frame: "the same door fully open onto daylight",
      transition: "the door swings open at a constant speed",
      camera_move: "static camera"
    },
    structure: {
      setup: "Open on image 1: {first_frame}. Land on image 2: {last_frame}.",
      camera: "{camera_move}, continuous"
    }
  }
];

const SEQUENCE_TEMPLATES: VideoPromptTemplate[] = [
  {
    id: "video_sequence_four_beat",
    name: "Four timed beats",
    category: "sequence",
    summary: "A four-entry time sheet over one continuous take.",
    body: [
      "{summary}, {style}. One continuous take.",
      "{t1}s: image 1 — {beat1}",
      "{t2}s: image 2 — {beat2}",
      "{t3}s: image 3 — {beat3}",
      "{t4}s: image 4 — {beat4}",
      "Hold the same subject, lighting, and lens through every beat."
    ].join("\n"),
    tags: ["starter", "timed"],
    hints: {
      summary: "a workshop bench through one short task",
      t1: "0",
      t2: "3",
      t3: "5",
      t4: "8",
      beat1: "hands rest beside the tools",
      beat2: "one tool is picked up",
      beat3: "the tool meets the material",
      beat4: "hands withdraw, the piece is left in frame"
    },
    structure: {
      setup: "{summary}, {style}.",
      beats: ["{t1}s: image 1 — {beat1}", "{t2}s: image 2 — {beat2}", "{t3}s: image 3 — {beat3}", "{t4}s: image 4 — {beat4}"]
    }
  },
  {
    id: "video_sequence_audio_markers",
    name: "Audio-marker beat sheet",
    category: "sequence",
    summary: "Beats land on imported audio markers, not on camera whims.",
    body: [
      "{summary}, {style}. The changes land on the audio, not on the camera.",
      "{t1}s: image 1 — {beat1}",
      "{t2}s: image 2 — {beat2}",
      "{t3}s: image 3 — {beat3}",
      "Each timestamp is a visible change on the beat; between beats the motion holds steady."
    ].join("\n"),
    tags: ["starter", "timed", "audio"],
    hints: {
      summary: "one object reacting to a short musical phrase",
      t1: "0",
      t2: "2.5",
      t3: "6",
      beat1: "the object sits still, fully in frame",
      beat2: "it shifts once, sharply, and settles",
      beat3: "it returns to the opening pose"
    },
    structure: {
      setup: "{summary}, {style}.",
      beats: ["{t1}s: image 1 — {beat1}", "{t2}s: image 2 — {beat2}", "{t3}s: image 3 — {beat3}"]
    }
  },
  {
    id: "video_sequence_two_frame",
    name: "Two timed keyframes",
    category: "sequence",
    summary: "The smallest time sheet: one move between two stated moments.",
    body: [
      "{summary}, {style}.",
      "{t1}s: image 1 — {beat1}",
      "{t2}s: image 2 — {beat2}",
      "One continuous move between the two moments; no cut and no repeat."
    ].join("\n"),
    tags: ["starter", "timed"],
    hints: {
      summary: "a curtain crossing a window",
      t1: "0",
      t2: "5",
      beat1: "the curtain is closed and still",
      beat2: "the curtain is fully drawn back"
    },
    structure: {
      setup: "{summary}, {style}.",
      beats: ["{t1}s: image 1 — {beat1}", "{t2}s: image 2 — {beat2}"]
    }
  },
  {
    id: "video_sequence_morph_chain",
    name: "Morph chain",
    category: "sequence",
    summary: "Staged transformation with believable volume at every stage.",
    body: [
      "A single continuous morph of {subject}, {style}.",
      "{t1}s: image 1 — {stage1}",
      "{t2}s: image 2 — {stage2}",
      "{t3}s: image 3 — {stage3}",
      "The form changes without ever cutting; silhouette and volume stay believable through each stage."
    ].join("\n"),
    tags: ["starter", "timed", "morph"],
    hints: {
      subject: "a folded paper shape",
      t1: "0",
      t2: "4",
      t3: "8",
      stage1: "a flat sheet resting on the table",
      stage2: "half-folded, edges lifting",
      stage3: "a finished closed form"
    },
    structure: {
      setup: "A single continuous morph of {subject}, {style}.",
      beats: ["{t1}s: image 1 — {stage1}", "{t2}s: image 2 — {stage2}", "{t3}s: image 3 — {stage3}"]
    }
  }
];

const DIALOGUE_TEMPLATES: VideoPromptTemplate[] = [
  {
    id: "video_dialogue_single_line",
    name: "One spoken line",
    category: "dialogue_sound",
    summary: "A single synchronized line with room tone under it.",
    body: [
      "{speaker}, as seen in image 1, in {setting}, {style}.",
      '{speaker} says: "{line}"',
      "Delivery: {tone}, lips synchronized to the line, natural pauses.",
      "Sound: {room_tone} under the voice, no music."
    ].join("\n"),
    tags: ["starter", "dialogue"],
    hints: {
      speaker: "a night-shift radio host",
      setting: "a small broadcast booth",
      line: "We are still here, if anyone is listening.",
      tone: "quiet and unhurried",
      room_tone: "soft desk hum and distant traffic"
    },
    structure: {
      setup: "{speaker} in {setting}, {style}.",
      dialogue: '{speaker}: "{line}"',
      sound: "{room_tone}"
    }
  },
  {
    id: "video_dialogue_two_speaker",
    name: "Two-line exchange",
    category: "dialogue_sound",
    summary: "Two speakers, one framing, one line each.",
    body: [
      "{speaker_a} and {speaker_b}, as framed in image 1, face each other in {setting}, {style}.",
      '{speaker_a}: "{line_a}"',
      '{speaker_b}: "{line_b}"',
      "The camera holds one framing through both lines; each mouth matches only its own line.",
      "Sound: {room_tone}, no music."
    ].join("\n"),
    tags: ["starter", "dialogue"],
    hints: {
      speaker_a: "a dock worker",
      speaker_b: "a ferry pilot",
      setting: "a rain-slick jetty",
      line_a: "Last run of the day?",
      line_b: "Last run of the season.",
      room_tone: "rain on metal, water against pilings"
    },
    structure: {
      setup: "{speaker_a} and {speaker_b} in {setting}, {style}.",
      dialogue: '{speaker_a}: "{line_a}" / {speaker_b}: "{line_b}"',
      sound: "{room_tone}"
    }
  },
  {
    id: "video_sound_design",
    name: "Sound design, no dialogue",
    category: "dialogue_sound",
    summary: "Nobody speaks; the sound carries the shot.",
    body: [
      "{subject} from image 1, in {setting}, {style}. Nobody speaks.",
      "Sound: {key_sound} in front, {ambience} underneath, and {sound_detail} once near the end.",
      "Motion: {motion}, timed so the picture and the sound agree."
    ].join("\n"),
    tags: ["starter", "sound"],
    hints: {
      subject: "an old projector",
      setting: "an empty screening room",
      key_sound: "the shutter ticking over",
      ambience: "a low room hum",
      sound_detail: "a single reel click",
      motion: "the take-up reel turns and slows"
    },
    structure: {
      setup: "{subject} in {setting}, {style}.",
      sound: "{key_sound}, {sound_detail}",
      ambience: "{ambience}"
    }
  },
  {
    id: "video_dialogue_voiceover",
    name: "Voice-over over action",
    category: "dialogue_sound",
    summary: "Off-screen narration above on-screen action.",
    body: [
      "{subject} from image 1 {action} in {setting}, {style}.",
      'Voice-over, off screen, {tone}: "{line}"',
      "No one on screen speaks; the voice sits above {ambience}."
    ].join("\n"),
    tags: ["starter", "dialogue", "voiceover"],
    hints: {
      subject: "a lone cyclist",
      action: "climbs a switchback road",
      setting: "a coastal headland at dusk",
      tone: "flat and matter-of-fact",
      line: "It is always further than it looks from the bottom.",
      ambience: "wind and distant surf"
    },
    structure: {
      setup: "{subject} {action} in {setting}, {style}.",
      dialogue: 'Voice-over: "{line}"',
      ambience: "{ambience}"
    }
  }
];

export const VIDEO_PROMPT_TEMPLATES: VideoPromptTemplate[] = [
  ...SIMPLE_TEMPLATES,
  ...DETAILED_TEMPLATES,
  ...SEQUENCE_TEMPLATES,
  ...DIALOGUE_TEMPLATES
];

