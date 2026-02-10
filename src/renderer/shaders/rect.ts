/** WebGPU WGSL shader for rendering solid-color rectangles. */
export const RECT_SHADER = `
struct Uniforms {
  res: vec2f,
  _pad: vec2f,
  blend: vec2f,
  _pad2: vec2f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VSIn {
  @location(0) quad: vec2f,
  @location(1) pos: vec2f,
  @location(2) size: vec2f,
  @location(3) color: vec4f,
};

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

// sRGB to linear conversion for proper blending
fn srgbToLinear(c: f32) -> f32 {
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return pow((c + 0.055) / 1.055, 2.4);
}

fn srgbToLinear3(c: vec3f) -> vec3f {
  return vec3f(srgbToLinear(c.x), srgbToLinear(c.y), srgbToLinear(c.z));
}

@vertex
fn vsMain(input: VSIn) -> VSOut {
  let pixel = input.pos + input.quad * input.size;
  let clip = vec2f(
    (pixel.x / uniforms.res.x) * 2.0 - 1.0,
    1.0 - (pixel.y / uniforms.res.y) * 2.0
  );

  var out: VSOut;
  out.position = vec4f(clip.x, clip.y, 0.0, 1.0);
  out.color = input.color;
  return out;
}

@fragment
fn fsMain(input: VSOut) -> @location(0) vec4f {
  let useLinear = uniforms.blend.x > 0.5;
  var color = input.color;
  if (useLinear) {
    color = vec4f(srgbToLinear3(color.rgb), color.a);
  }
  color = vec4f(color.rgb * color.a, color.a);
  return color;
}
`;

/** WebGL2 vertex shader for rendering solid-color rectangles. */
export const RECT_SHADER_GL_VERT = `#version 300 es
precision highp float;

uniform vec2 u_resolution;

layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec2 a_pos;
layout(location = 2) in vec2 a_size;
layout(location = 3) in vec4 a_color;

out vec4 v_color;

void main() {
  vec2 pixel = a_pos + a_quad * a_size;
  vec2 clip = vec2(
    (pixel.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (pixel.y / u_resolution.y) * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
}
`;

/** WebGL2 fragment shader for rendering solid-color rectangles with alpha blending. */
export const RECT_SHADER_GL_FRAG = `#version 300 es
precision highp float;

uniform vec2 u_blend;

in vec4 v_color;
out vec4 fragColor;

// sRGB to linear conversion for proper blending
float srgbToLinear(float c) {
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return pow((c + 0.055) / 1.055, 2.4);
}

vec3 srgbToLinear(vec3 c) {
  return vec3(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b));
}

void main() {
  bool useLinear = u_blend.x > 0.5;
  vec4 color = v_color;
  if (useLinear) {
    color.rgb = srgbToLinear(color.rgb);
  }
  color.rgb *= color.a;
  fragColor = color;
}
`;
