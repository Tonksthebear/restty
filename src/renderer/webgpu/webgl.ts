import type { WebGLState } from "../types";
import {
  GLYPH_SHADER_GL_VERT,
  GLYPH_SHADER_GL_FRAG,
} from "../shaders/glyph-gl";
import {
  RECT_SHADER_GL_VERT,
  RECT_SHADER_GL_FRAG,
} from "../shaders/rect";

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

/** Initialize a WebGL2 fallback renderer state from a canvas. */
export function initWebGL(canvas: HTMLCanvasElement): WebGLState | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;

  const rectProgram = createProgram(gl, RECT_SHADER_GL_VERT, RECT_SHADER_GL_FRAG);
  const glyphProgram = createProgram(gl, GLYPH_SHADER_GL_VERT, GLYPH_SHADER_GL_FRAG);
  if (!rectProgram || !glyphProgram) return null;

  const rectResolutionLoc = gl.getUniformLocation(rectProgram, "u_resolution");
  const rectBlendLoc = gl.getUniformLocation(rectProgram, "u_blend");
  const glyphResolutionLoc = gl.getUniformLocation(glyphProgram, "u_resolution");
  const glyphBlendLoc = gl.getUniformLocation(glyphProgram, "u_blend");
  const glyphAtlasLoc = gl.getUniformLocation(glyphProgram, "u_atlas");
  if (
    !rectResolutionLoc ||
    !rectBlendLoc ||
    !glyphResolutionLoc ||
    !glyphBlendLoc ||
    !glyphAtlasLoc
  ) {
    return null;
  }

  // Quad vertices
  const quadVertices = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
  const quadBuffer = gl.createBuffer();
  if (!quadBuffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

  // Rect VAO
  const rectVao = gl.createVertexArray();
  if (!rectVao) return null;
  gl.bindVertexArray(rectVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const rectInstanceBuffer = gl.createBuffer();
  if (!rectInstanceBuffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, rectInstanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 1024, gl.DYNAMIC_DRAW);
  // a_pos
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 0);
  gl.vertexAttribDivisor(1, 1);
  // a_size
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 8);
  gl.vertexAttribDivisor(2, 1);
  // a_color
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 16);
  gl.vertexAttribDivisor(3, 1);
  gl.bindVertexArray(null);

  // Glyph VAO
  const glyphVao = gl.createVertexArray();
  if (!glyphVao) return null;
  gl.bindVertexArray(glyphVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const glyphInstanceBuffer = gl.createBuffer();
  if (!glyphInstanceBuffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, glyphInstanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 1024, gl.DYNAMIC_DRAW);
  // a_pos
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 72, 0);
  gl.vertexAttribDivisor(1, 1);
  // a_size
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 72, 8);
  gl.vertexAttribDivisor(2, 1);
  // a_uv0
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 72, 16);
  gl.vertexAttribDivisor(3, 1);
  // a_uv1
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 72, 24);
  gl.vertexAttribDivisor(4, 1);
  // a_color
  gl.enableVertexAttribArray(5);
  gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 72, 32);
  gl.vertexAttribDivisor(5, 1);
  // a_bg
  gl.enableVertexAttribArray(6);
  gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 72, 48);
  gl.vertexAttribDivisor(6, 1);
  // a_slant
  gl.enableVertexAttribArray(7);
  gl.vertexAttribPointer(7, 1, gl.FLOAT, false, 72, 64);
  gl.vertexAttribDivisor(7, 1);
  // a_mode
  gl.enableVertexAttribArray(8);
  gl.vertexAttribPointer(8, 1, gl.FLOAT, false, 72, 68);
  gl.vertexAttribDivisor(8, 1);
  gl.bindVertexArray(null);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return {
    gl,
    rectProgram,
    glyphProgram,
    rectResolutionLoc,
    rectBlendLoc,
    glyphResolutionLoc,
    glyphBlendLoc,
    glyphAtlasLoc,
    quadBuffer,
    rectVao,
    glyphVao,
    rectInstanceBuffer,
    glyphInstanceBuffer,
    rectCapacity: 1024,
    glyphCapacity: 1024,
    glyphAtlases: new Map(),
  };
}
