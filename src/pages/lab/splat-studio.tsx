import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import SEO from "@/components/SEO";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  fileToOpenedModel,
  isTauriRuntime,
  openModelDialog,
  type OpenedModel,
} from "@/lib/openModel";

// Tauri × Three.js 3D Viewer 的 Web 版实现。第一阶段的 6 件事全部齐活：
// GLB 导入、OrbitControls、灯光、Grid+Axes、Transform 编辑、HUD。
// 所有 GPU 资源在 useEffect return 里 dispose，HMR 不泄漏。

type TransformMode = "translate" | "rotate" | "scale";

interface HudState {
  fps: number;
  objects: number;
  renderer: string;
  loaded: string | null;
  source: "web" | "tauri" | null;
}

interface SelectedInfo {
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

// 归一化：Box3 缩到目标尺寸并平移到原点。避免导入后模型跑到视野外。
function fitObjectToView(object: THREE.Object3D, targetSize = 2) {
  const bbox = new THREE.Box3().setFromObject(object);
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  object.scale.setScalar(scale);

  bbox.setFromObject(object);
  const center = bbox.getCenter(new THREE.Vector3());
  object.position.sub(center);
}

function countMeshes(root: THREE.Object3D) {
  let n = 0;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) n += 1;
  });
  return n;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      const anyMat = m as THREE.Material & { map?: THREE.Texture | null };
      anyMat.map?.dispose?.();
      anyMat.dispose?.();
    });
  });
}

// 从命中的最深 mesh 反向找到「可选中」的顶层：优先命中的 mesh 本身，
// 但如果命中的是导入的 gltf 子网格，选中根节点更符合直觉。
function pickSelectable(hit: THREE.Object3D, modelGroup: THREE.Group): THREE.Object3D {
  let cur: THREE.Object3D | null = hit;
  while (cur && cur.parent && cur.parent !== modelGroup) {
    cur = cur.parent;
  }
  return cur ?? hit;
}

function toTuple(v: THREE.Vector3 | THREE.Euler): [number, number, number] {
  return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
}

export default function SplatStudio() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [mode, setMode] = useState<TransformMode>("translate");
  const [selected, setSelected] = useState<SelectedInfo | null>(null);
  const [hud, setHud] = useState<HudState>({
    fps: 0,
    objects: 1,
    renderer: "WebGL",
    loaded: null,
    source: null,
  });
  const [loading, setLoading] = useState<null | { name: string; progress: number }>(null);
  const [error, setError] = useState<string | null>(null);

  // ref 版本用于渲染循环 / 事件回调，避免闭包陷阱。
  const autoRotateRef = useRef(autoRotate);
  const wireframeRef = useRef(wireframe);
  const showGridRef = useRef(showGrid);
  autoRotateRef.current = autoRotate;
  wireframeRef.current = wireframe;
  showGridRef.current = showGrid;

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const selectedObjRef = useRef<THREE.Object3D | null>(null);

  // 把选中物体最新的 transform 反映到 UI 面板。
  const syncSelectedFromObject = useCallback((obj: THREE.Object3D | null) => {
    if (!obj) {
      setSelected(null);
      return;
    }
    setSelected({
      name: obj.name || obj.type || "Object",
      position: toTuple(obj.position),
      rotation: toTuple(obj.rotation),
      scale: toTuple(obj.scale),
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // --- 三件套 ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);
    scene.fog = new THREE.Fog(0x05060a, 12, 32);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
    camera.position.set(3, 2.4, 4.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    // --- 灯光 ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(5, 8, 4);
    scene.add(keyLight);
    const cyanLight = new THREE.PointLight(0x00f0ff, 30, 30);
    cyanLight.position.set(-3, 2, 3);
    scene.add(cyanLight);
    const magentaLight = new THREE.PointLight(0xff2dd1, 20, 30);
    magentaLight.position.set(3, -1, -3);
    scene.add(magentaLight);

    // --- 场景辅助 ---
    const grid = new THREE.GridHelper(20, 20, 0x00f0ff, 0x1a1a3a);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.28;
    scene.add(grid);
    gridRef.current = grid;

    const axes = new THREE.AxesHelper(1.5);
    scene.add(axes);

    // --- 模型容器 ---
    const modelGroup = new THREE.Group();
    modelGroup.name = "ModelRoot";
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // 占位物：两个可选中的 mesh，直接给用户一个能点的东西。
    const placeholder = new THREE.Group();
    placeholder.name = "Placeholder";

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x00aaff, metalness: 0.4, roughness: 0.3 }),
    );
    cube.name = "Cube";
    cube.position.set(-0.9, 0.5, 0);
    placeholder.add(cube);

    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.45, 0.14, 120, 24),
      new THREE.MeshStandardMaterial({ color: 0xf7f7ff, metalness: 0.85, roughness: 0.18 }),
    );
    knot.name = "TorusKnot";
    knot.position.set(0.9, 0.6, 0);
    placeholder.add(knot);

    modelGroup.add(placeholder);

    // --- OrbitControls ---
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.minDistance = 1.2;
    orbit.maxDistance = 30;
    orbit.target.set(0, 0.4, 0);
    orbitRef.current = orbit;

    // --- TransformControls (Step 05) ---
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.8);
    // three r166+ 用 getHelper() 拿到可加到场景的 Object3D
    const tcAny = transform as unknown as { getHelper?: () => THREE.Object3D };
    const gizmo: THREE.Object3D = tcAny.getHelper
      ? tcAny.getHelper()
      : (transform as unknown as THREE.Object3D);
    scene.add(gizmo);
    transformRef.current = transform;

    // 拖 gizmo 时禁用 OrbitControls，避免相机被同时拖动。
    transform.addEventListener("dragging-changed", (event) => {
      const value = (event as { value: unknown }).value;
      orbit.enabled = !value;
    });
    // 拖动过程中把新 transform 同步到面板。
    transform.addEventListener("objectChange", () => {
      syncSelectedFromObject(selectedObjRef.current);
    });

    // --- Raycaster 点选：pointerdown/up 距离小于阈值才算点击 ---
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let downT = 0;

    const attachObject = (obj: THREE.Object3D | null) => {
      selectedObjRef.current = obj;
      if (obj) {
        transform.attach(obj);
        setAutoRotate(false);
        syncSelectedFromObject(obj);
      } else {
        transform.detach();
        syncSelectedFromObject(null);
      }
    };

    const canvas = renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
    };
    const onPointerUp = (e: PointerEvent) => {
      // 拖 gizmo 期间的 up 由 TransformControls 处理，不做点选判断。
      if (!orbit.enabled) return;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      const elapsed = performance.now() - downT;
      if (moved > 4 || elapsed > 400) return;

      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(modelGroup.children, true);
      if (hits.length > 0) {
        attachObject(pickSelectable(hits[0].object, modelGroup));
      } else {
        attachObject(null);
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);

    // --- 快捷键 W/E/R/Esc ---
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "w") {
        transform.setMode("translate");
        setMode("translate");
      } else if (key === "e") {
        transform.setMode("rotate");
        setMode("rotate");
      } else if (key === "r") {
        transform.setMode("scale");
        setMode("scale");
      } else if (key === "escape") {
        attachObject(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // --- 渲染循环 + FPS 采样 ---
    let rafId = 0;
    const clock = new THREE.Clock();
    let frameAccum = 0;
    let timeAccum = 0;

    const applyWireframe = (root: THREE.Object3D, on: boolean) => {
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const anyMat = m as THREE.Material & { wireframe?: boolean };
          if ("wireframe" in anyMat) anyMat.wireframe = on;
        });
      });
    };

    const render = () => {
      const delta = clock.getDelta();
      frameAccum += 1;
      timeAccum += delta;

      // 只有在没有选中物体时自转，避免拖 gizmo 时物体在动。
      if (autoRotateRef.current && !selectedObjRef.current) {
        modelGroup.rotation.y += delta * 0.35;
      }
      grid.visible = showGridRef.current;
      applyWireframe(modelGroup, wireframeRef.current);

      orbit.update();
      renderer.render(scene, camera);

      if (timeAccum >= 0.5) {
        const fps = Math.round(frameAccum / timeAccum);
        frameAccum = 0;
        timeAccum = 0;
        setHud((prev) => {
          const objects = countMeshes(modelGroup);
          if (prev.fps === fps && prev.objects === objects) return prev;
          return { ...prev, fps, objects };
        });
      }

      rafId = requestAnimationFrame(render);
    };
    render();

    // --- HUD 初始化 ---
    const gl = renderer.getContext();
    const isWebGL2 =
      typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    setHud((prev) => ({
      ...prev,
      renderer: isWebGL2 ? "WebGL2" : "WebGL",
      objects: countMeshes(modelGroup),
    }));

    // --- 响应式 ---
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w === 0 || h === 0) continue;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    observer.observe(container);

    // --- 拖拽 .glb 到 Viewer ---
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const opened = await fileToOpenedModel(file);
      void loadOpenedModel(opened);
    };
    container.addEventListener("dragover", onDragOver);
    container.addEventListener("drop", onDrop);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("dragover", onDragOver);
      container.removeEventListener("drop", onDrop);
      transform.detach();
      transform.dispose();
      orbit.dispose();
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      orbitRef.current = null;
      transformRef.current = null;
      modelGroupRef.current = null;
      gridRef.current = null;
      selectedObjRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载：接收统一的 OpenedModel（Web / Tauri 同一入口）。
  const loadOpenedModel = useCallback(async (opened: OpenedModel) => {
    const name = opened.name.toLowerCase();
    if (!/\.(glb|gltf)$/.test(name)) {
      setError("暂时只支持 .glb / .gltf。.ply / .splat 会在 Step 06 接入。");
      return;
    }
    const modelGroup = modelGroupRef.current;
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    const transform = transformRef.current;
    if (!modelGroup || !camera || !orbit || !transform) return;

    setError(null);
    setLoading({ name: opened.name, progress: 0 });

    try {
      // GLTFLoader.parse 直接吃 ArrayBuffer，跳过 URL 中转。
      const loader = new GLTFLoader();
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        loader.parse(opened.bytes, "", (g) => resolve(g), (err) => reject(err));
      });

      // 清空占位或上一次导入。
      transform.detach();
      selectedObjRef.current = null;
      setSelected(null);
      while (modelGroup.children.length > 0) {
        const child = modelGroup.children[0];
        modelGroup.remove(child);
        disposeObject(child);
      }

      gltf.scene.name = opened.name.replace(/\.[^.]+$/, "");
      fitObjectToView(gltf.scene, 2.2);
      modelGroup.add(gltf.scene);

      orbit.target.set(0, 0, 0);
      camera.position.set(3, 2.2, 4);
      orbit.update();

      setHud((prev) => ({
        ...prev,
        loaded: opened.name,
        source: opened.source,
        objects: countMeshes(modelGroup),
      }));
      setLoading({ name: opened.name, progress: 100 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }, []);

  const onPickFile = useCallback(async () => {
    const opened = await openModelDialog();
    if (opened) void loadOpenedModel(opened);
  }, [loadOpenedModel]);

  const onResetView = () => {
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    if (!camera || !orbit) return;
    camera.position.set(3, 2.4, 4.5);
    orbit.target.set(0, 0.4, 0);
    orbit.update();
  };

  const onSetMode = (m: TransformMode) => {
    const tc = transformRef.current;
    if (!tc) return;
    tc.setMode(m);
    setMode(m);
  };

  const onClearSelection = () => {
    const tc = transformRef.current;
    if (!tc) return;
    tc.detach();
    selectedObjRef.current = null;
    setSelected(null);
  };

  const tauriBadge = typeof window !== "undefined" && isTauriRuntime();

  return (
    <>
      <SEO
        title="Splat Studio · 3D Viewer 蓝图"
        path="/lab/splat-studio"
        description="Tauri + React + Three.js 跨平台 3D 场景查看器。GLB 导入、Transform 编辑、双端文件源、HUD 全上。"
      />

      <article className="space-y-10 animate-fade-up">
        {/* 面包屑 */}
        <nav className="text-xs text-gray-500 dark:text-cyan-300/70 cyber-num uppercase tracking-[0.25em]">
          <Link
            href="/lab"
            className="hover:text-cyan-600 dark:hover:text-cyan-200 transition-colors"
          >
            ← Lab
          </Link>
        </nav>

        {/* 标题 */}
        <header>
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-cyan-300/80 uppercase tracking-[0.25em] mb-4 cyber-num">
            <span className="w-6 h-px bg-gray-400 dark:bg-cyan-400/70 dark:shadow-[0_0_6px_rgba(0,240,255,0.7)]" />
            Tauri × Three.js · 03
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            Splat Studio · 3D Viewer
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-3 text-sm md:text-base leading-relaxed max-w-2xl">
            <span className="text-gray-800 dark:text-gray-100">Tauri + React + Three.js</span>{" "}
            跨平台 3D 场景查看器。GLB 导入、OrbitControls、TransformControls、双端统一文件源，
            全在这一页跑通。桌面壳换成 Tauri 时代码几乎不动。
          </p>
        </header>

        {/* Viewer 工具条 */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-gray-500 dark:text-cyan-300/80 cyber-num">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 dark:bg-fuchsia-400 dark:shadow-[0_0_8px_rgba(255,45,209,0.9)]" />
              Viewer · 拖入 .glb / 点击 mesh 编辑
              {tauriBadge && (
                <span className="ml-2 px-1.5 py-0.5 rounded border border-emerald-400/50 text-emerald-500 dark:text-emerald-300 text-[10px]">
                  Tauri Native
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onPickFile}
                className="px-3 py-1 rounded-full text-[11px] cyber-num uppercase tracking-[0.2em] border border-cyan-400/60 text-cyan-600 dark:text-cyan-200 bg-cyan-400/10 hover:bg-cyan-400/20 transition-colors"
              >
                打开 .glb
              </button>
              <button
                type="button"
                onClick={onResetView}
                className="px-3 py-1 rounded-full text-[11px] cyber-num uppercase tracking-[0.2em] border border-gray-300/60 dark:border-cyan-400/20 text-gray-500 dark:text-cyan-300/70 hover:border-cyan-400/50 transition-colors"
              >
                重置视角
              </button>
              <ToggleChip
                active={autoRotate}
                onClick={() => setAutoRotate((v) => !v)}
                label="自转"
              />
              <ToggleChip
                active={wireframe}
                onClick={() => setWireframe((v) => !v)}
                label="线框"
                tone="fuchsia"
              />
              <ToggleChip active={showGrid} onClick={() => setShowGrid((v) => !v)} label="网格" />
            </div>
          </div>

          {/* Transform 模式切换 */}
          <div className="flex items-center gap-2 mb-3 flex-wrap text-[11px] cyber-num uppercase tracking-[0.2em]">
            <span className="text-gray-400 dark:text-cyan-300/60">Transform</span>
            {(["translate", "rotate", "scale"] as TransformMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onSetMode(m)}
                className={`px-2.5 py-1 rounded border transition-colors ${
                  mode === m
                    ? "border-cyan-400/60 text-cyan-600 dark:text-cyan-200 bg-cyan-400/10"
                    : "border-gray-300/60 dark:border-cyan-400/20 text-gray-500 dark:text-cyan-300/70 hover:border-cyan-400/50"
                }`}
              >
                {m}
              </button>
            ))}
            <span className="text-gray-400 dark:text-cyan-300/40 ml-1">
              [W · E · R 切换 / Esc 取消]
            </span>
            {selected && (
              <button
                type="button"
                onClick={onClearSelection}
                className="px-2.5 py-1 rounded border border-fuchsia-400/40 text-fuchsia-600 dark:text-fuchsia-300 hover:border-fuchsia-400/70 transition-colors"
              >
                clear
              </button>
            )}
          </div>

          <div
            ref={containerRef}
            className="relative w-full aspect-[4/3] md:aspect-[16/10] rounded-2xl overflow-hidden border border-gray-200/70 dark:border-cyan-400/20 bg-[#05060a] shadow-lg dark:shadow-[0_0_30px_rgba(0,240,255,0.10)]"
          >
            {loading && (
              <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 py-2 text-[11px] cyber-num uppercase tracking-[0.2em] text-cyan-200 bg-black/60 backdrop-blur border-b border-cyan-400/20">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Loading {loading.name} · {loading.progress}%
              </div>
            )}
            {selected && (
              <div className="absolute top-2 right-2 min-w-[200px] rounded-lg bg-black/60 backdrop-blur border border-cyan-400/25 p-3 text-[11px] cyber-num text-cyan-100 space-y-1">
                <div className="uppercase tracking-[0.2em] text-cyan-300/80 mb-1">
                  Selected · {selected.name}
                </div>
                <VecRow label="pos" v={selected.position} />
                <VecRow label="rot" v={selected.rotation} />
                <VecRow label="scl" v={selected.scale} />
              </div>
            )}
            {error && (
              <div className="absolute inset-x-0 bottom-0 px-4 py-2 text-xs text-red-200 bg-red-900/70 backdrop-blur border-t border-red-500/30">
                {error}
              </div>
            )}
          </div>

          {/* HUD */}
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] cyber-num uppercase tracking-[0.2em] text-gray-500 dark:text-cyan-300/80">
            <HudCell label="FPS" value={hud.fps ? String(hud.fps) : "—"} />
            <HudCell label="Meshes" value={String(hud.objects)} />
            <HudCell label="GPU" value={hud.renderer} />
            <HudCell label="Source" value={hud.source ?? (tauriBadge ? "tauri" : "web")} />
            <HudCell label="Loaded" value={hud.loaded ?? "placeholder"} />
          </div>
        </section>

        {/* 场景要素 */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-gray-500 dark:text-cyan-300/80 cyber-num">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400 dark:shadow-[0_0_8px_rgba(0,240,255,0.9)]" />
            Anatomy · 第一阶段的 6 件事
          </div>

          <ol className="space-y-3 text-sm md:text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
            {[
              ["鼠标旋转 / 缩放 / 平移", "OrbitControls + enableDamping，惯性感一行接管。"],
              [".glb / .gltf 导入", "GLTFLoader.parse(ArrayBuffer) + 归一化，Web / Tauri 同一入口。"],
              ["自动居中缩放", "Box3 求包围盒，缩到 ~2 单位并平移到原点，避免模型不见了。"],
              ["网格 / 坐标轴 / 灯光", "GridHelper + AxesHelper + 主方向光 + 冷暖点光，构图立即成立。"],
              [
                "Transform 编辑",
                "TransformControls + Raycaster 点选，W/E/R 切模式、拖 gizmo 改 pos/rot/scale。",
              ],
              ["HUD 与最近文件", "FPS / Meshes / GPU / Source 即时反馈；最近文件等 Tauri 侧持久化。"],
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

        {/* 文件源抽象 */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-cyan-200 cyber-num uppercase tracking-[0.2em]">
            Step 04 · Tauri Dialog · 一套 API 双端跑
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            <code className="text-cyan-600 dark:text-cyan-300">openModelDialog()</code> 检测到{" "}
            <code className="text-cyan-600 dark:text-cyan-300">window.__TAURI_INTERNALS__</code>{" "}
            时会走 Tauri 原生文件选择器 + <code>plugin-fs</code> 读文件；Web 环境自动回退到{" "}
            <code>&lt;input type=&quot;file&quot;&gt;</code>。Tauri 依赖通过{" "}
            <code>new Function(&quot;import(...)&quot;)</code> 动态加载，
            <span className="text-gray-800 dark:text-gray-100">Web 构建不会解析、不会打包</span>。
          </p>
          <pre className="text-[11px] md:text-xs leading-relaxed p-4 md:p-5 rounded-lg overflow-x-auto bg-gray-900 dark:bg-black/60 text-gray-100 border border-gray-800 dark:border-cyan-400/15 cyber-num">
{`// src/lib/openModel.ts
export async function openModelDialog(): Promise<OpenedModel | null> {
  if (isTauriRuntime()) {
    try { return await openViaTauri(); }         // dialog.open + fs.readFile
    catch { /* 静默回退 */ }
  }
  return openViaWebInput();                       // <input type="file">
}`}
          </pre>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Tauri 项目侧需要额外安装：
            <code className="mx-1 text-cyan-600 dark:text-cyan-300">
              @tauri-apps/plugin-dialog
            </code>
            +
            <code className="mx-1 text-cyan-600 dark:text-cyan-300">@tauri-apps/plugin-fs</code>
            并在 <code>tauri.conf.json</code> 里授权 fs 读文件即可。
          </p>
        </section>

        {/* 架构图 */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-cyan-200 cyber-num uppercase tracking-[0.2em]">
            Architecture
          </h3>
          <pre className="text-[11px] md:text-xs leading-relaxed p-4 md:p-5 rounded-lg overflow-x-auto bg-gray-900 dark:bg-black/60 text-gray-100 border border-gray-800 dark:border-cyan-400/15 cyber-num">
{`                Tauri App
                    │
        ┌───────────┴───────────┐
        │                       │
     React / TS               Rust
        │                       │
     Three.js              plugin-dialog
        │                     plugin-fs
 ┌──────┴──────────┐            │
 │                 │            │
 场景管理          UI       Tauri Commands
 │
 ├─ Scene
 ├─ Camera
 ├─ Renderer
 ├─ OrbitControls
 ├─ TransformControls  ← Step 05
 ├─ GLTFLoader         ← Step 03
 └─ Gaussian Splat     ← Step 06`}
          </pre>
        </section>

        {/* Roadmap */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-cyan-200 cyber-num uppercase tracking-[0.2em]">
            Roadmap · 8 步走
          </h3>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {[
              ["Tauri + React 初始化", "npm create tauri-app@latest，选 React + TS。", "done"],
              ["Three.js 三件套", "Scene / Camera / Renderer，跑一个可交互 Cube。", "done"],
              ["GLB / GLTF Viewer", "GLTFLoader.parse + 归一化，能看真实模型。", "done"],
              ["Tauri Dialog 抽象", "openModelDialog() 一套 API，双端跑；Web 自动回退。", "done"],
              ["Transform 编辑", "TransformControls + Raycaster，W/E/R 切模式。", "done"],
              ["3D Gaussian Viewer", "接 .ply / .splat / .ksplat，GPU splat 渲染。", "now"],
              ["Rust 处理大文件", "Splat 解码、bin 转换等重活放 Rust 侧。", "todo"],
              ["多端交付", "Windows / macOS / Linux / Android / iOS。", "todo"],
            ].map(([title, body, state], i) => {
              const current = state === "now";
              const done = state === "done";
              return (
                <li
                  key={title}
                  className={`relative rounded-xl border p-4 ${
                    current
                      ? "border-cyan-400/50 bg-cyan-400/5"
                      : done
                        ? "border-emerald-400/30 bg-emerald-400/5"
                        : "border-gray-200/60 dark:border-cyan-400/15 bg-white/40 dark:bg-black/20"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2 text-[10px] cyber-num uppercase tracking-[0.25em]">
                    <span className="text-gray-500 dark:text-cyan-300/70">
                      Step {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-fuchsia-400/70" />
                    <span
                      className={
                        current
                          ? "text-cyan-600 dark:text-cyan-300"
                          : done
                            ? "text-emerald-600 dark:text-emerald-300"
                            : "text-gray-400 dark:text-gray-500"
                      }
                    >
                      {current ? "● NOW" : done ? "✓ DONE" : "○ TODO"}
                    </span>
                  </div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100 text-[13px] md:text-sm">
                    {title}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 text-xs md:text-[13px] leading-relaxed mt-1">
                    {body}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* 结语 */}
        <section className="rounded-xl border border-gray-200/70 dark:border-cyan-400/15 bg-white/60 dark:bg-black/30 p-5 md:p-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-cyan-200 cyber-num uppercase tracking-[0.2em]">
            为什么先跑 Web 版
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Tauri 只是外壳。踩坑集中在 Three.js 的
            <span className="text-gray-800 dark:text-gray-100">
              {" "}
              相机 / 灯光 / 归一化 / Transform / dispose
            </span>
            ，不是壳。这里把这些跑通，Tauri 项目侧只需要装两个插件、把
            <code className="text-cyan-600 dark:text-cyan-300"> openModelDialog</code>{" "}
            的动态 import 命中就行，页面代码一行不改。
          </p>
        </section>
      </article>
    </>
  );
}

// ---- 小组件 ----

function ToggleChip({
  active,
  onClick,
  label,
  tone = "cyan",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "cyan" | "fuchsia";
}) {
  const activeCls =
    tone === "fuchsia"
      ? "border-fuchsia-400/60 text-fuchsia-600 dark:text-fuchsia-200 bg-fuchsia-400/10"
      : "border-cyan-400/60 text-cyan-600 dark:text-cyan-200 bg-cyan-400/10";
  const idleCls =
    "border-gray-300/60 dark:border-cyan-400/20 text-gray-500 dark:text-cyan-300/70 hover:border-cyan-400/50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[11px] cyber-num uppercase tracking-[0.2em] border transition-colors ${
        active ? activeCls : idleCls
      }`}
    >
      {label} {active ? "ON" : "OFF"}
    </button>
  );
}

function HudCell({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-gray-400 dark:text-cyan-300/60">{label}</span>
      <span className="text-gray-800 dark:text-cyan-100">{value}</span>
    </span>
  );
}

function VecRow({ label, v }: { label: string; v: [number, number, number] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-cyan-300/60 w-8">{label}</span>
      <span>
        {v[0]}, {v[1]}, {v[2]}
      </span>
    </div>
  );
}
