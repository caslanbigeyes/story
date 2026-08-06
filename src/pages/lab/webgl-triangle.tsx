import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SEO from "@/components/SEO";

// --- 着色器源码 ---
// 顶点着色器：接收 2D 位置，透传颜色到片元
const VERTEX_SRC = `
attribute vec2 a_position;
attribute vec3 a_color;
varying vec3 v_color;
void main() {
  v_color = a_color;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`.trim();

// 片元着色器：直接输出插值后的颜色
const FRAGMENT_SRC = `
precision mediump float;
varying vec3 v_color;
void main() {
  gl_FragColor = vec4(v_color, 1.0);
}
`.trim();

// 编译单个着色器（SRP：只做一件事）
function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader failed");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile error: ${log}`);
  }
  return shader;
}

// 链接程序对象
function createProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const program = gl.createProgram();
  if (!program) throw new Error("createProgram failed");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`program link error: ${log}`);
  }
  return program;
}

export default function WebGLTriangle() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 处理 HiDPI：CSS 尺寸 × devicePixelRatio → 真实像素
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    resize();

    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) {
      setError("当前环境不支持 WebGL。");
      return;
    }
    const glCtx = gl as WebGLRenderingContext;

    let program: WebGLProgram;
    try {
      program = createProgram(glCtx, VERTEX_SRC, FRAGMENT_SRC);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    // 顶点数据：位置 (x, y) + 颜色 (r, g, b)，交错存储
    // 三个顶点分别是红、绿、蓝，插值后得到经典渐变三角形
    // prettier-ignore
    const vertices = new Float32Array([
      //  x     y      r    g    b
       0.0,  0.75,   1.0, 0.15, 0.35,
      -0.75, -0.6,   0.0, 0.85, 1.00,
       0.75, -0.6,   1.0, 0.20, 0.90,
    ]);

    const vbo = glCtx.createBuffer();
    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, vbo);
    glCtx.bufferData(glCtx.ARRAY_BUFFER, vertices, glCtx.STATIC_DRAW);

    glCtx.useProgram(program);

    // 绑定顶点属性
    const STRIDE = 5 * Float32Array.BYTES_PER_ELEMENT;
    const posLoc = glCtx.getAttribLocation(program, "a_position");
    glCtx.enableVertexAttribArray(posLoc);
    glCtx.vertexAttribPointer(posLoc, 2, glCtx.FLOAT, false, STRIDE, 0);

    const colorLoc = glCtx.getAttribLocation(program, "a_color");
    glCtx.enableVertexAttribArray(colorLoc);
    glCtx.vertexAttribPointer(
      colorLoc,
      3,
      glCtx.FLOAT,
      false,
      STRIDE,
      2 * Float32Array.BYTES_PER_ELEMENT,
    );

    // 绘制一帧
    const draw = () => {
      glCtx.viewport(0, 0, canvas.width, canvas.height);
      glCtx.clearColor(0.02, 0.03, 0.08, 1.0);
      glCtx.clear(glCtx.COLOR_BUFFER_BIT);
      glCtx.drawArrays(glCtx.TRIANGLES, 0, 3);
    };
    draw();

    const onResize = () => {
      resize();
      draw();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      glCtx.deleteBuffer(vbo);
      glCtx.deleteProgram(program);
    };
  }, []);

  return (
    <>
      <SEO
        title="手写 WebGL 三角形"
        path="/lab/webgl-triangle"
        description="从零手写 WebGL：着色器、缓冲、属性、绘制。图形学的 Hello World。"
      />

      <article className="space-y-10 animate-fade-up">
        {/* 面包屑 */}
        <nav className="text-xs text-gray-500 dark:text-cyan-300/70 cyber-num uppercase tracking-[0.25em]">
          <Link href="/lab" className="hover:text-cyan-600 dark:hover:text-cyan-200 transition-colors">
            ← Lab
          </Link>
        </nav>

        {/* 标题 */}
        <header>
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-cyan-300/80 uppercase tracking-[0.25em] mb-4 cyber-num">
            <span className="w-6 h-px bg-gray-400 dark:bg-cyan-400/70 dark:shadow-[0_0_6px_rgba(0,240,255,0.7)]" />
            WebGL · 01
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            手写 WebGL 三角形
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-3 text-sm md:text-base leading-relaxed max-w-2xl">
            不用任何三方库。原生 <code className="text-cyan-600 dark:text-cyan-300">WebGLRenderingContext</code>{" "}
            走完着色器 → 程序 → 缓冲 → 属性 → 绘制的完整链路。
          </p>
        </header>

        {/* 效果预览 */}
        <section>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-gray-500 dark:text-cyan-300/80 mb-3 cyber-num">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 dark:bg-fuchsia-400 dark:shadow-[0_0_8px_rgba(255,45,209,0.9)]" />
            Preview · 效果
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-gray-200/70 dark:border-cyan-400/20 bg-[#05060a] shadow-lg dark:shadow-[0_0_30px_rgba(0,240,255,0.10)]">
            <canvas
              ref={canvasRef}
              className="block w-full aspect-[4/3] md:aspect-[16/10]"
            />
            {error ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-red-300 bg-black/70 backdrop-blur">
                {error}
              </div>
            ) : null}
          </div>
        </section>

        {/* 核心步骤说明 */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-gray-500 dark:text-cyan-300/80 cyber-num">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400 dark:shadow-[0_0_8px_rgba(0,240,255,0.9)]" />
            Steps · 步骤
          </div>

          <ol className="space-y-3 text-sm md:text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
            {[
              ["写着色器", "顶点着色器决定顶点位置，片元着色器决定像素颜色。用 GLSL。"],
              ["编译 + 链接", "compileShader() 分别编译两段源码，attachShader() 挂到 program 上，再 linkProgram()。"],
              ["上传顶点数据", "把 [x, y, r, g, b] 交错数据丢进 ARRAY_BUFFER，一次上传 GPU。"],
              ["描述属性布局", "vertexAttribPointer 告诉 GPU：每个顶点占 5 float，位置在 offset=0，颜色在 offset=2。"],
              ["绘制", "useProgram + drawArrays(TRIANGLES, 0, 3)。GPU 光栅化，片元着色器插值出渐变。"],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="cyber-num text-fuchsia-500 dark:text-fuchsia-300/90 shrink-0 w-6">
                  0{i + 1}
                </span>
                <span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{title}</span>
                  <span className="text-gray-500 dark:text-gray-400"> — {body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* 源码：着色器 */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-cyan-200 cyber-num uppercase tracking-[0.2em]">
            Vertex Shader (GLSL)
          </h3>
          <pre className="text-xs md:text-sm p-4 rounded-lg overflow-x-auto bg-gray-900 dark:bg-black/60 text-gray-100 border border-gray-800 dark:border-cyan-400/15">
            <code>{VERTEX_SRC}</code>
          </pre>

          <h3 className="text-sm font-semibold text-gray-700 dark:text-cyan-200 cyber-num uppercase tracking-[0.2em] pt-2">
            Fragment Shader (GLSL)
          </h3>
          <pre className="text-xs md:text-sm p-4 rounded-lg overflow-x-auto bg-gray-900 dark:bg-black/60 text-gray-100 border border-gray-800 dark:border-cyan-400/15">
            <code>{FRAGMENT_SRC}</code>
          </pre>
        </section>

        {/* 结语 */}
        <section className="pt-4 border-t border-gray-200/60 dark:border-cyan-400/10 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          三角形是所有 3D 图形的原子。理解了这条链路，后面的 uniform、纹理、深度、矩阵变换、光照都只是往这条流水线上加零件。
        </section>
      </article>
    </>
  );
}
