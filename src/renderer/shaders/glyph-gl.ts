/** WebGL2 vertex shader for rendering textured glyph quads. */
export const GLYPH_SHADER_GL_VERT = `#version 300 es
precision highp float;

uniform vec2 u_resolution;

layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec2 a_pos;
layout(location = 2) in vec2 a_size;
layout(location = 3) in vec2 a_uv0;
layout(location = 4) in vec2 a_uv1;
layout(location = 5) in vec4 a_color;
layout(location = 6) in vec4 a_bg;
layout(location = 7) in float a_slant;
layout(location = 8) in float a_mode;

out vec2 v_uv;
out vec4 v_color;
out vec4 v_bg;
out float v_mode;

void main() {
  vec2 pixel = a_pos + vec2(a_quad.x * a_size.x + a_slant * (1.0 - a_quad.y), a_quad.y * a_size.y);
  vec2 clip = vec2(
    (pixel.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (pixel.y / u_resolution.y) * 2.0
  );
  v_uv = a_uv0 + (a_uv1 - a_uv0) * a_quad;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
  v_bg = a_bg;
  v_mode = a_mode;
}
`;

/** WebGL2 fragment shader for sampling glyph atlas textures with linear filtering. */
export const GLYPH_SHADER_GL_FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_atlas;
uniform vec2 u_blend;

in vec2 v_uv;
in vec4 v_color;
in vec4 v_bg;
in float v_mode;
out vec4 fragColor;

// sRGB to linear conversion for proper blending
float srgbToLinear(float c) {
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return pow((c + 0.055) / 1.055, 2.4);
}

// Linear to sRGB conversion
float linearToSrgb(float c) {
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

vec3 srgbToLinear(vec3 c) {
  return vec3(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b));
}

vec3 linearToSrgb(vec3 c) {
  return vec3(linearToSrgb(c.r), linearToSrgb(c.g), linearToSrgb(c.b));
}

float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 atlasSample = texture(u_atlas, v_uv);
  bool useLinear = u_blend.x > 0.5;
  bool useCorrection = u_blend.y > 0.5;

  if (v_mode > 0.5) {
    vec4 color = atlasSample;
    if (useLinear) {
      color.rgb = srgbToLinear(color.rgb);
    }
    color.rgb *= color.a;
    fragColor = color;
    return;
  }

  vec4 fg = v_color;
  vec4 bg = v_bg;
  if (useLinear) {
    fg.rgb = srgbToLinear(fg.rgb);
    bg.rgb = srgbToLinear(bg.rgb);
  }
  fg.rgb *= fg.a;
  bg.rgb *= bg.a;

  float alpha = atlasSample.a;
  if (useCorrection && useLinear) {
    float fg_l = luminance(fg.rgb);
    float bg_l = luminance(bg.rgb);
    if (abs(fg_l - bg_l) > 0.001) {
      float blend_l = srgbToLinear(linearToSrgb(fg_l) * alpha + linearToSrgb(bg_l) * (1.0 - alpha));
      alpha = clamp((blend_l - bg_l) / (fg_l - bg_l), 0.0, 1.0);
    }
  }

  vec4 color = fg * alpha;
  fragColor = color;
}
`;
