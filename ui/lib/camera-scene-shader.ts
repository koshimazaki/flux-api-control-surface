/**
 * The shot view's look shader. Order: frame motion (gate weave, tape
 * tracking, pixel grid, fisheye); then, per view, focus from that view's own
 * depth, glow, whip, flare, tape bleed and media; then the views combine
 * (split screen, dissolve, double exposure) and the whole frame takes the
 * grade and format. Each stage is an illustration of the term, labelled as
 * such in `preview-support.ts`.
 */
export const LOOK_FRAGMENT = /* glsl */ `
#include <packing>
varying vec2 vUv;
uniform sampler2D tA;
uniform sampler2D tDepth;
uniform sampler2D tB;
uniform sampler2D tDepthB;
uniform sampler2D tHistory;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uTime;
uniform int uFocusMode;
uniform float uFocusDistance;
uniform float uFocusDistanceB;
uniform float uFocusNear;
uniform float uAperture;
uniform float uMaxBlur;
uniform float uBarrel;
uniform float uFlare;
uniform float uMix;
uniform float uSplit;
uniform float uDouble;
uniform float uFade;
uniform float uWhip;
uniform float uTrail;
uniform int uGrade;
uniform int uFormat;
uniform float uLetterbox;
uniform int uMedia;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 toDisplay(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float depthAt(sampler2D depth, vec2 uv) {
  return -perspectiveDepthToViewZ(texture2D(depth, uv).x, uNear, uFar);
}

// Blur radius in pixels: from depth for shallow, rack and split-diopter focus; from height for tilt-shift.
float blurRadius(sampler2D depth, vec2 uv, vec2 screen, float focusDistance) {
  float scale = uMaxBlur * uResolution.y / 400.0;
  if (uFocusMode == 1 || uFocusMode == 4) {
    float dist = depthAt(depth, uv);
    // The diopter covers the left third, where the near marker stands; the subject stays in the far half.
    float focus = (uFocusMode == 4 && screen.x < 0.36) ? uFocusNear : focusDistance;
    return clamp(uAperture * abs(dist - focus) / max(dist, 0.05), 0.0, 1.0) * scale;
  }
  if (uFocusMode == 3) return smoothstep(0.06, 0.38, abs(screen.y - 0.5)) * scale;
  return 0.0;
}

vec3 focused(sampler2D colour, sampler2D depth, vec2 uv, vec2 screen, float focusDistance) {
  vec3 base = texture2D(colour, uv).rgb;
  float radius = blurRadius(depth, uv, screen, focusDistance);
  if (radius < 0.4) return base;
  vec3 sum = base;
  float total = 1.0;
  for (int i = 0; i < 28; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 28.0) * radius;
    float a = fi * 2.39996323;
    vec2 offset = vec2(cos(a), sin(a)) * r / uResolution;
    // A sharp neighbour does not bleed into a blurred pixel; its own blur sets its reach.
    float w = clamp(blurRadius(depth, uv + offset, screen + offset, focusDistance) / radius + 0.15, 0.0, 1.0);
    sum += texture2D(colour, uv + offset).rgb * w;
    total += w;
  }
  return sum / total;
}

vec3 diffused(sampler2D colour, vec2 uv, float pixels) {
  vec3 sum = vec3(0.0);
  float radius = pixels * uResolution.y / 400.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 16.0) * radius;
    float a = fi * 2.39996323;
    sum += texture2D(colour, uv + vec2(cos(a), sin(a)) * r / uResolution).rgb;
  }
  return sum / 16.0;
}

vec3 whipBlur(sampler2D colour, vec2 uv) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    sum += texture2D(colour, uv + vec2((float(i) / 13.0 - 0.5) * uWhip, 0.0)).rgb;
  }
  return sum / 14.0;
}

// Anamorphic streak: bright highlights smeared sideways in a cool blue. Jittered taps avoid beading.
vec3 flare(sampler2D colour, vec2 uv) {
  float sum = 0.0;
  float jitter = hash(uv * uResolution) - 0.5;
  for (int i = 0; i < 24; i++) {
    float o = ((float(i) + jitter) / 23.0 - 0.5) * 0.5;
    float l = luma(texture2D(colour, vec2(uv.x + o, uv.y)).rgb);
    sum += max(l - 0.85, 0.0) * (1.0 - abs(o) * 3.6);
  }
  return sum / 24.0 * vec3(0.35, 0.6, 1.0) * 5.0 * uFlare;
}

vec2 barrel(vec2 uv) {
  float aspect = uResolution.x / uResolution.y;
  vec2 c = (uv - 0.5) * vec2(aspect, 1.0);
  // Normalised so the frame's side edges land inside the source: the centre bulges, the corners go dark.
  float edge = 0.25 * aspect * aspect * 0.55;
  c *= (1.0 + uBarrel * dot(c, c)) / (1.0 + uBarrel * edge);
  return c / vec2(aspect, 1.0) + 0.5;
}

float edgeAt(sampler2D depth, vec2 uv) {
  vec2 px = 1.5 / uResolution;
  float d = depthAt(depth, uv);
  float dx = abs(depthAt(depth, uv + vec2(px.x, 0.0)) - depthAt(depth, uv - vec2(px.x, 0.0)));
  float dy = abs(depthAt(depth, uv + vec2(0.0, px.y)) - depthAt(depth, uv - vec2(0.0, px.y)));
  return smoothstep(0.035, 0.11, (dx + dy) / max(d, 0.1));
}

// Fewer tones without hue shifts: posterise brightness, keep each pixel's colour.
vec3 posterise(vec3 c, float steps) {
  float l = luma(c);
  float q = floor(l * steps + 0.5) / steps;
  return clamp(c * (q / max(l, 0.02)), 0.0, 1.0);
}

// Media styles read the same view they finish, so a second view never leaks into the first.
vec3 media(vec3 c, sampler2D colour, sampler2D depth, vec2 uv) {
  if (uMedia == 1) return posterise(c, 6.0);
  if (uMedia == 2) {
    // Watercolour: soft wash, pigment pooling at edges, granulation, paper.
    vec3 wash = toDisplay(diffused(colour, uv, 3.0));
    c = mix(c, wash, 0.55);
    c = mix(vec3(luma(c)), c, 0.8);
    c = 1.0 - (1.0 - c) * 0.82;
    c *= 1.0 - edgeAt(depth, uv) * 0.35;
    c *= 0.93 + 0.07 * hash(floor(uv * uResolution / 3.0));
    return c * vec3(0.99, 0.97, 0.92);
  }
  if (uMedia == 3) {
    // Paper cut-out: flat tones, card grain, a cast shadow under each layer's edge.
    c = posterise(c, 4.0);
    vec2 lift = vec2(-3.0, 4.0) / uResolution;
    float shadow = step(0.25, depthAt(depth, uv) - depthAt(depth, uv + lift));
    c *= 1.0 - shadow * 0.28;
    return c * (0.95 + 0.05 * hash(floor(uv * uResolution / 2.0)));
  }
  if (uMedia == 4) {
    // Anime: bold ink outlines on the toon shading.
    c = mix(vec3(luma(c)), c, 1.2);
    return mix(c, vec3(0.04, 0.04, 0.06), edgeAt(depth, uv) * 0.9);
  }
  return c;
}

/** Everything that belongs to one camera's picture, finished in display space before views combine. */
vec3 viewColour(sampler2D colour, sampler2D depth, vec2 uv, vec2 screen, float focusDistance) {
  vec3 col = focused(colour, depth, uv, screen, focusDistance);
  if (uFocusMode == 2) {
    vec3 glow = diffused(colour, uv, 7.0);
    col = mix(col, glow, 0.35) + max(glow - vec3(0.5), vec3(0.0)) * 0.6;
  }
  if (uWhip > 0.0) col = mix(col, whipBlur(colour, uv), clamp(uWhip * 30.0, 0.0, 1.0));
  if (uFlare > 0.0) col += flare(colour, uv);
  if (uFormat == 3) {
    float o = 2.5 / uResolution.x;
    col.r = mix(col.r, texture2D(colour, uv + vec2(o, 0.0)).r, 0.7);
    col.b = mix(col.b, texture2D(colour, uv - vec2(o, 0.0)).b, 0.7);
  }
  return media(toDisplay(col), colour, depth, uv);
}

vec3 grade(vec3 c) {
  float l = luma(c);
  if (uGrade == 1) {
    float s = smoothstep(0.06, 0.9, l);
    return vec3(s * s * (3.0 - 2.0 * s));
  }
  if (uGrade == 2) return mix(mix(vec3(l), c, 0.6), vec3(1.0), 0.28) * vec3(1.0, 0.97, 1.02);
  if (uGrade == 3) {
    vec3 tone = mix(vec3(0.0, 0.55, 0.6), vec3(1.0, 0.6, 0.3), smoothstep(0.15, 0.75, l));
    c = mix(c, tone * (l * 1.6 + 0.12), 0.45);
    return clamp(mix(vec3(luma(c)), c, 1.25), 0.0, 1.0);
  }
  if (uGrade == 4) return mix(vec3(l), c, smoothstep(0.08, 0.26, c.r - max(c.g, c.b)));
  if (uGrade == 5) return mix(c, vec3(l) * vec3(0.95, 0.98, 1.03), 0.45);
  if (uGrade == 6) return c * vec3(1.06, 1.0, 0.9);
  return c;
}

vec3 formatLook(vec3 c, vec2 screen) {
  vec2 q = screen - 0.5;
  if (uFormat == 1) {
    // 16mm: fine grain at 24 fps, warm, lifted blacks, a soft vignette.
    float g = hash(floor(screen * uResolution) + floor(uTime * 24.0)) - 0.5;
    c = c * vec3(1.05, 1.0, 0.9) * 0.95 + 0.03 + g * 0.05;
    return c * (1.0 - dot(q, q) * 0.55);
  }
  if (uFormat == 2) {
    // Super 8: coarse grain, 18 fps flicker, a faded warm cast and a rounded gate.
    float frame = floor(uTime * 18.0);
    float g = hash(floor(screen * uResolution / 2.5) + frame) - 0.5;
    float flicker = 1.0 + (hash(vec2(frame, 3.0)) - 0.5) * 0.12;
    c = (c * vec3(1.08, 0.98, 0.82) * 0.88 + 0.06 + g * 0.1) * flicker;
    float corner = length(max(abs(q) - vec2(0.44), vec2(0.0))) - 0.06;
    return c * (1.0 - dot(q, q) * 1.1) * (1.0 - smoothstep(-0.004, 0.004, corner));
  }
  if (uFormat == 3) {
    // VHS: scanlines, line noise, oversaturated colour and a raised black level.
    float line = 0.9 + 0.1 * sin(screen.y * uResolution.y * 1.6);
    float n = hash(vec2(floor(screen.y * 240.0), floor(uTime * 30.0))) - 0.5;
    c = mix(vec3(luma(c)), c, 1.3) * line + n * 0.05;
    return c * 0.92 + 0.04;
  }
  return c;
}

void main() {
  vec2 screen = vUv;
  vec2 uv = screen;
  if (uFormat == 1) uv += vec2(sin(uTime * 7.0) * 0.0008, sin(uTime * 11.0 + 1.0) * 0.0012);
  if (uFormat == 2) uv += vec2(sin(uTime * 9.0) * 0.002, sin(uTime * 13.0) * 0.003 + (hash(vec2(floor(uTime * 18.0), 1.0)) - 0.5) * 0.003);
  if (uFormat == 3) {
    uv.x += smoothstep(0.12, 0.0, uv.y) * 0.012 * sin(uTime * 30.0 + uv.y * 80.0);
    uv.x += (hash(vec2(floor(uv.y * 90.0), floor(uTime * 24.0))) - 0.5) * 0.0025;
  }
  if (uMedia == 1) {
    vec2 grid = vec2(96.0, 54.0);
    uv = (floor(uv * grid) + 0.5) / grid;
  }
  if (uBarrel > 0.0) uv = barrel(uv);
  bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;

  vec3 c;
  if (uSplit > 0.5) {
    bool right = screen.x >= 0.5;
    vec2 half_uv = vec2(uv.x + (right ? -0.25 : 0.25), uv.y);
    c = right ? viewColour(tB, tDepthB, half_uv, screen, uFocusDistanceB) : viewColour(tA, tDepth, half_uv, screen, uFocusDistance);
  } else {
    c = viewColour(tA, tDepth, uv, screen, uFocusDistance);
    if (uMix > 0.0 || uDouble > 0.0) {
      vec3 second = viewColour(tB, tDepthB, uv, screen, uFocusDistanceB);
      if (uMix > 0.0) c = mix(c, second, uMix);
      // Double exposure: the second view screened over the first, as two exposures add light.
      if (uDouble > 0.0) c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - clamp(second, 0.0, 1.0) * 0.85);
    }
  }

  c = formatLook(grade(c), screen);
  if (uLetterbox > 0.5 && abs(screen.y - 0.5) > 0.372) c = vec3(0.0);
  if (outside) c = vec3(0.0);
  if (uSplit > 0.5 && abs(screen.x - 0.5) < 1.5 / uResolution.x) c = vec3(0.02);
  c *= 1.0 - uFade;
  if (uTrail > 0.0) c = mix(c, texture2D(tHistory, screen).rgb, uTrail);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
