import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SEO from "@/components/SEO";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ThreeShowcase() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);

  // 用 ref 让实时状态同步进渲染循环，避免闭包陷阱
  const wireframeRef = useRef(wireframe);
  const autoRotateRef = useRef(autoRotate);
  wireframeRef.current = wireframe;
  autoRotateRef.current = autoRotate;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // --- 场景 / 相机 / 渲染器 ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);
    scene.fog = new THREE.Fog(0x05060a, 8, 22);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 7);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // --- 光照 ---
    scene.add(new THREE.AmbientLight(0x334455, 0.7));

    const keyLight = new THREE.PointLight(0x00f0ff, 60, 30);
    keyLight.position.set(4, 4, 4);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xff2dd1, 40, 30);
    rimLight.position.set(-4, -2, -3);
    scene.add(rimLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
    topLight.position.set(0, 5, 2);
    scene.add(topLight);

    // --- 主物体：三叶纽结 ---
    const geometry = new THREE.TorusKnotGeometry(1.1, 0.36, 220, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf0f4ff,
      metalness: 0.85,
      roughness: 0.2,
      envMapIntensity: 1.0,
    });
    const knot = new THREE.Mesh(geometry, material);
    scene.add(knot);

    // wireframe 副本：叠加时更有电子感
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    const wireMesh = new THREE.Mesh(geometry, wireMaterial);
    wireMesh.scale.setScalar(1.005);
    knot.add(wireMesh);

    // --- 地面辅助网格：呼应赛博氛围 ---
    const grid = new THREE.GridHelper(30, 30, 0x00f0ff, 0x1a1a3a);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.15;
    grid.position.y = -2.2;
    scene.add(grid);

    // --- 交互控制 ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 15;
    controls.enablePan = false;

    // --- 渲染循环 ---
    let rafId = 0;
    const clock = new THREE.Clock();
    const render = () => {
      const delta = clock.getDelta();
      if (autoRotateRef.current) {
        knot.rotation.y += delta * 0.4;
        knot.rotation.x += delta * 0.15;
      }
      wireMesh.visible = wireframeRef.current;
      material.wireframe = false; // 主体保持实心，只切换叠加线框可见性
      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(render);
    };
    render();

    // --- 响应式 ---
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // --- 清理：防止 HMR 泄漏 ---
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      wireMaterial.dispose();
      (grid.material as THREE.Material).dispose();
      grid.geometry.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <>
      <SEO
        title="Three.js 立体 Demo"
        path="/lab/three-showcase"
        description="用 three.js 搭建的交互式 3D 场景：三叶纽结、金属材质、双色点光、OrbitControls。"
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
            three.js · 02
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            立体 Demo · TorusKnot
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-3 text-sm md:text-base leading-relaxed max-w-2xl">
            换成 <code className="text-cyan-600 dark:text-cyan-300">three.js</code> 后，同样的 GPU
            管线可以在几十行内画出带光照、材质、可交互的立体物体。可拖拽旋转、滚轮缩放。
          </p>
        </header>

        {/* 效果 */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-gray-500 dark:text-cyan-300/80 cyber-num">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 dark:bg-fuchsia-400 dark:shadow-[0_0_8px_rgba(255,45,209,0.9)]" />
              Preview · 拖拽 / 滚轮
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoRotate((v) => !v)}
                className={`px-3 py-1 rounded-full text-[11px] cyber-num uppercase tracking-[0.2em] border transition-colors ${
                  autoRotate
                    ? "border-cyan-400/60 text-cyan-600 dark:text-cyan-200 bg-cyan-400/10"
                    : "border-gray-300/60 dark:border-cyan-400/20 text-gray-500 dark:text-cyan-300/70 hover:border-cyan-400/50"
                }`}
              >
                自转 {autoRotate ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                onClick={() => setWireframe((v) => !v)}
                className={`px-3 py-1 rounded-full text-[11px] cyber-num uppercase tracking-[0.2em] border transition-colors ${
                  wireframe
                    ? "border-fuchsia-400/60 text-fuchsia-600 dark:text-fuchsia-200 bg-fuchsia-400/10"
                    : "border-gray-300/60 dark:border-cyan-400/20 text-gray-500 dark:text-cyan-300/70 hover:border-fuchsia-400/50"
                }`}
              >
                线框 {wireframe ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div
            ref={containerRef}
            className="relative w-full aspect-[4/3] md:aspect-[16/10] rounded-2xl overflow-hidden border border-gray-200/70 dark:border-cyan-400/20 bg-[#05060a] shadow-lg dark:shadow-[0_0_30px_rgba(0,240,255,0.10)]"
          />
        </section>

        {/* 场景解构 */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-gray-500 dark:text-cyan-300/80 cyber-num">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400 dark:shadow-[0_0_8px_rgba(0,240,255,0.9)]" />
            Anatomy · 场景解构
          </div>

          <ol className="space-y-3 text-sm md:text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
            {[
              ["Scene + Camera + Renderer", "three.js 三件套。透视相机 45° FOV，ACES 色调映射让金属高光更耐看。"],
              ["Geometry", "TorusKnotGeometry 三叶纽结，参数 (半径, 管径, 分段, 径向分段) 决定精度。"],
              ["Material", "MeshStandardMaterial：PBR 材质，metalness=0.85 高金属度 + roughness=0.2 抛光感。"],
              ["Lighting", "双色点光（青 + 品红）营造赛博氛围 + 环境光提亮阴影 + 顶部方向光补白。"],
              ["Controls", "OrbitControls 一行接管拖拽 / 缩放，enableDamping 让运动带惯性。"],
              ["Loop + Dispose", "requestAnimationFrame 驱动；卸载时 dispose 所有资源，防止 HMR 泄漏。"],
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

        {/* 与手写 WebGL 对比 */}
        <section className="rounded-xl border border-gray-200/70 dark:border-cyan-400/15 bg-white/60 dark:bg-black/30 p-5 md:p-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-cyan-200 cyber-num uppercase tracking-[0.2em] mb-3">
            vs. 手写 WebGL
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            上一个 demo 里我们自己写了着色器、编译、缓冲、属性绑定。three.js 把这一整套封装成了
            <span className="text-gray-800 dark:text-gray-200"> Mesh = Geometry + Material</span>{" "}
            的心智模型。灯光、相机、控制器都是可组合的对象。原理不变，效率提升 10 倍。
          </p>
        </section>
      </article>
    </>
  );
}
