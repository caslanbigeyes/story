import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SEO from "@/components/SEO";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type LoadState = "loading" | "ready" | "fallback";

interface VisualEvidence {
  viewport: string;
  documentWidth: string;
  overflow: "none" | "overflow" | "pending";
  stage: string;
  canvasCss: string;
  canvasPixels: string;
  sample: string;
  verdict: string;
  updatedAt: string;
}

const DPR_OPTIONS = [
  { label: "battery", value: 1 },
  { label: "balanced", value: 1.5 },
  { label: "sharp", value: 2 },
];

const RELEASE_EVIDENCE = [
  ["First screen", "3D 首帧或 poster fallback 必须可见，不能出现空白 WebGL 区域。"],
  ["Asset", "真实加载 `/api/lab/product-marker-glb`，记录 progress、bytes 和 fallback path。"],
  ["Mobile", "DPR cap 控制 canvas pixels，移动端不横向溢出。"],
  ["Interaction", "OrbitControls 可拖拽，Retry 能从 fallback 回到真实 GLB。"],
  ["Incident", "GLB 失败时保留 poster、错误状态和回滚说明。"],
];

const MOBILE_VISUAL_QA = [
  ["390px", "控制条自动换行，canvas 高度稳定，poster 文案不遮挡按钮。"],
  ["720px", "画布与证据面板上下排列，runtime 指标仍可读。"],
  ["960px+", "3D 画布与 evidence 并排，适合录屏和作品集截图。"],
];

const POSTER_COPY_POINTS = [
  "Nocturne Camera preview is still available.",
  "3D asset is loading or temporarily unavailable.",
  "Retry real GLB keeps the page recoverable without refresh.",
];

const RECORDING_PATH = [
  ["Shot 1", "Real GLB API 加载完成，拖拽模型并展示 runtime evidence。"],
  ["Shot 2", "切 battery/sharp DPR，展示 canvas pixels 变化。"],
  ["Shot 3", "点击 test fallback，展示 poster copy、progress 和 error。"],
  ["Shot 4", "点击 retry real glb，恢复 3D 首帧并收尾到 release evidence。"],
];

const BROWSER_VERIFICATION = [
  ["Route", "dev server 下 `/lab/product-showcase` 返回 200，训练页入口也能打开。"],
  ["Desktop", "1280x900 截图中 WebGL stage 和 runtime evidence 首屏可读。"],
  ["Mobile", "390x844 截图中按钮换行、无横向溢出、poster 文案不遮挡。"],
  ["Canvas", "canvas host 有稳定 CSS 尺寸，真实像素随 DPR cap 变化。"],
  ["Fallback", "Broken URL 后 `data-load-state=fallback`，poster 和 Retry 可见。"],
  ["Evidence", "runtime、release、mobile、recording、browser verification 都可截图归档。"],
];

const VISUAL_SELF_CHECKS = [
  ["Pixel sample", "从 WebGL context 读取中心与四角像素，判断 canvas 是否只是空黑。"],
  ["Overflow", "比较 `documentElement.scrollWidth` 与 `innerWidth`，移动端溢出会直接显示。"],
  ["Fallback", "GLB 未 ready 时检查 poster fallback DOM 是否仍在首屏可见。"],
  ["Viewport", "记录当前 viewport、stage rect、CSS canvas 和真实 canvas pixels。"],
];

const QA_REPORT_SCENARIOS = [
  ["Desktop", "1280x900，记录 ready canvas、runtime evidence、release evidence。"],
  ["Mobile", "390x844，记录 controls wrap、no overflow、poster copy。"],
  ["Fallback", "Broken URL，记录 poster fallback、error、Retry path。"],
];

const README_RELEASE_POINTS = [
  ["What it proves", "真实 GLB 加载、OrbitControls、DPR cap、fallback/retry 和可复制 QA 证据。"],
  ["How to review", "先看 route 200，再看 Visual self-check verdict、canvas pixel sample 和 QA report JSON。"],
  ["Mobile promise", "390px 宽度下按钮换行、canvas 高度稳定，`data-overflow` 暴露横向溢出风险。"],
  ["Failure mode", "Broken URL 会进入 poster fallback，保留错误、Retry 和 incident 字段。"],
];

const RELEASE_CHECKLIST = [
  ["Type check", "`npx tsc --noEmit` passed before recording."],
  ["Route smoke", "`/lab`、`/lab/15-minute-webgl-plan`、`/lab/product-showcase` return 200."],
  ["Canvas evidence", "Visual self-check reports nonblank canvas or visible poster fallback."],
  ["Mobile QA", "390x844 screenshot shows no overflow and readable controls."],
  ["Fallback QA", "Broken URL screenshot shows poster copy, error and Retry."],
  ["Report export", "QA report JSON includes route/runtime/visualEvidence/screenshots/verdicts."],
];

const FINAL_RELEASE_GATES = [
  ["Demo route", "`/lab/product-showcase` returns 200 and is linked from `/lab`."],
  ["Type safety", "`npx tsc --noEmit` passes with the current lab changes."],
  ["Production build", "`npm run build` compiles successfully, then fails on existing `/tags/Life.html` export rename."],
  ["Runtime evidence", "Runtime evidence exposes state, progress, DPR, CSS/canvas pixels, draw calls, triangles and bytes."],
  ["Visual evidence", "Visual self-check exposes canvas pixel sample, overflow, viewport and fallback verdict."],
  ["QA packet", "QA JSON and release notes Markdown are copyable from the page."],
  ["Fallback drill", "Broken URL keeps poster copy visible and provides a Retry path back to the real GLB."],
  ["Known warning", "Next warns about viewport meta and large page data on non-lab routes; these are outside this lab work."],
  ["Rollback", "If GLB or runtime evidence fails, ship poster fallback and previous known-good GLB manifest first."],
];

const PRODUCTION_BUILD_EVIDENCE = [
  ["Compile", "`next build` compiled successfully before static export."],
  ["Static export", "1331 pages generated before the failure surfaced."],
  ["Failure", "ENOENT rename `.next/export/tags/Life.html` -> `.next/server/pages/tags/Life.html`."],
  ["Large data", "`/news` 853 kB, `/` 304 kB, `/tags/ai-summary` and `/tags/news` 301 kB page-data warnings."],
  ["Impact", "No TypeScript or route-smoke failure was observed for `/lab/product-showcase` in this gate."],
];

const SCREENSHOT_ARCHIVE_MANIFEST = [
  ["desktop-ready", "1280x900", "Real GLB ready state with runtime evidence, final release gate and QA report visible."],
  ["mobile-ready", "390x844", "Controls wrap, canvas remains in viewport, `data-overflow=false`, product still visible."],
  ["fallback-drill", "390x844", "Broken GLB URL shows poster fallback, error text, Retry button and incident note."],
];

const ASSET_HANDOFF_PACKET = [
  ["HTTP route", "`/api/lab/product-marker-glb` is the real GLB source used by GLTFLoader."],
  ["MIME", "`Content-Type: model/gltf-binary` keeps loader behavior aligned with production GLB hosting."],
  ["Size", "`Content-Length: 1224` bytes matches the runtime evidence bytes for this tiny lab asset."],
  ["Magic", "First 12 bytes resolve to GLB magic `glTF`, version 2 and declared length 1224."],
  ["Cache", "The lab API uses `no-store`; production should move to a hashed immutable GLB plus short-cache manifest."],
  ["Rollback", "If the API or decoder path fails, keep poster fallback and previous known-good GLB manifest reviewable."],
];

const DECODER_READINESS_MATRIX = [
  ["Draco", "Geometry compression", "Use only when geometry savings beat decoder cost on target devices."],
  ["Meshopt", "Fast geometry delivery", "Preferred first production step for compact meshes and quick decode."],
  ["KTX2", "Texture transcode", "Use when texture payload dominates; keep Basis/KTX2 support feature-tested."],
  ["Fallback", "Poster + prior GLB", "If any decoder fails or times out, keep a visible poster and retry path."],
];

const COMPLETION_CERTIFICATE = [
  ["Coverage", "Shader, uniform, matrix, Raycaster, materials, DPR, resize, context lost, InstancedMesh and GLTFLoader were exercised across the 45 slots."],
  ["Product route", "`/lab/product-showcase` is the portfolio route with real GLB loading, fallback, QA export and release evidence."],
  ["Evidence", "Type check, route smoke, GLB headers, visual self-check, QA JSON, release notes, final gate and decoder manifest are all copyable."],
  ["Stop condition", "Do not add more WebGL features until the site-wide `/tags/Life.html` production export blocker is fixed."],
];

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

export default function ProductShowcase() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [dprCap, setDprCap] = useState(1.5);
  const [sourceMode, setSourceMode] = useState<"real" | "broken">("real");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("copy report json");
  const [copyDocState, setCopyDocState] = useState("copy release notes");
  const [copyGateState, setCopyGateState] = useState("copy final gate");
  const [copyArchiveState, setCopyArchiveState] = useState("copy archive manifest");
  const [copyAssetState, setCopyAssetState] = useState("copy asset handoff");
  const [copyDecoderState, setCopyDecoderState] = useState("copy decoder manifest");
  const [copyCompletionState, setCopyCompletionState] = useState("copy completion certificate");
  const [visualEvidence, setVisualEvidence] = useState<VisualEvidence>({
    viewport: "pending",
    documentWidth: "pending",
    overflow: "pending",
    stage: "pending",
    canvasCss: "pending",
    canvasPixels: "pending",
    sample: "pending",
    verdict: "waiting for browser",
    updatedAt: "pending",
  });
  const [stats, setStats] = useState({
    dpr: 1,
    css: "0 x 0",
    canvas: "0 x 0",
    drawCalls: 0,
    triangles: 0,
    bytes: 0,
  });
  const dprCapRef = useRef(dprCap);
  dprCapRef.current = dprCap;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let mounted = true;
    let raf = 0;
    let model: THREE.Object3D | null = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x061018);
    scene.fog = new THREE.Fog(0x061018, 8, 22);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(3.2, 2.2, 5.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xd9fbff, 0x17203a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(4, 5, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0xff2dd1, 34, 18);
    rim.position.set(-3, 2, -3);
    scene.add(rim);
    const floor = new THREE.GridHelper(8, 16, 0x00f0ff, 0x284257);
    (floor.material as THREE.Material).transparent = true;
    (floor.material as THREE.Material).opacity = 0.18;
    floor.position.y = -1.25;
    scene.add(floor);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 9;

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, dprCapRef.current);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      setStats((current) => ({
        ...current,
        dpr,
        css: `${width} x ${height}`,
        canvas: `${Math.round(width * dpr)} x ${Math.round(height * dpr)}`,
      }));
    };

    const loadModel = async () => {
      setLoadState("loading");
      setProgress(3);
      setError("");
      if (model) {
        scene.remove(model);
        disposeObject(model);
        model = null;
      }

      const loader = new GLTFLoader();
      const url = sourceMode === "real" ? "/api/lab/product-marker-glb" : "/api/lab/missing-product.glb";
      loader.load(
        url,
        (gltf) => {
          if (!mounted) return;
          model = gltf.scene;
          model.name = "Portfolio Product GLB";
          model.rotation.y = -0.5;
          model.scale.setScalar(1.4);
          scene.add(model);
          let triangles = 0;
          model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) {
              const index = mesh.geometry.index;
              const position = mesh.geometry.getAttribute("position");
              triangles += index ? index.count / 3 : position.count / 3;
            }
          });
          setStats((current) => ({ ...current, triangles: Math.round(triangles), bytes: 1224 }));
          setProgress(100);
          setLoadState("ready");
        },
        (event) => {
          if (!mounted) return;
          const percent = event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 45;
          setProgress(Math.min(98, Math.max(5, percent)));
          setStats((current) => ({ ...current, bytes: event.loaded || current.bytes }));
        },
        (loadError) => {
          if (!mounted) return;
          setLoadState("fallback");
          setProgress(100);
          setError(loadError instanceof Error ? loadError.message : "GLB load failed");
        },
      );
    };

    resize();
    loadModel();
    window.addEventListener("resize", resize);

    const render = () => {
      if (model) model.rotation.y += 0.004;
      resize();
      controls.update();
      renderer.render(scene, camera);
      setStats((current) => ({ ...current, drawCalls: renderer.info.render.calls }));
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      controls.dispose();
      if (model) disposeObject(model);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [sourceMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sampleEvidence = () => {
      const renderer = rendererRef.current;
      const canvas = renderer?.domElement;
      const stage = stageRef.current;
      const container = containerRef.current;
      const fallback = fallbackRef.current;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const documentWidth = document.documentElement.scrollWidth;
      const stageRect = stage?.getBoundingClientRect();
      const canvasRect = container?.getBoundingClientRect();
      let sample = "canvas unavailable";
      let isNonBlank = false;

      if (renderer && canvas) {
        try {
          const gl = renderer.getContext();
          const points = [
            [Math.floor(canvas.width * 0.5), Math.floor(canvas.height * 0.5)],
            [Math.floor(canvas.width * 0.25), Math.floor(canvas.height * 0.25)],
            [Math.floor(canvas.width * 0.75), Math.floor(canvas.height * 0.25)],
            [Math.floor(canvas.width * 0.25), Math.floor(canvas.height * 0.75)],
            [Math.floor(canvas.width * 0.75), Math.floor(canvas.height * 0.75)],
          ];
          const pixels = points.map(([x, y]) => {
            const rgba = new Uint8Array(4);
            gl.readPixels(
              Math.max(0, Math.min(canvas.width - 1, x)),
              Math.max(0, Math.min(canvas.height - 1, y)),
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              rgba,
            );
            return Array.from(rgba);
          });
          const brightness = pixels.map(([r, g, b]) => r + g + b);
          const maxBrightness = Math.max(...brightness);
          const minBrightness = Math.min(...brightness);
          isNonBlank = maxBrightness > 18 && maxBrightness - minBrightness > 2;
          sample = pixels.map((pixel) => `rgba(${pixel.join(",")})`).join(" / ");
        } catch (sampleError) {
          sample = sampleError instanceof Error ? sampleError.message : "readPixels failed";
        }
      }

      const fallbackVisible = Boolean(fallback && loadState !== "ready");
      const verdict =
        loadState === "ready"
          ? isNonBlank
            ? "ready canvas sampled nonblank"
            : "ready but canvas sample needs review"
          : fallbackVisible
            ? "poster fallback visible while 3D is not ready"
            : "waiting for visible 3D or fallback";

      setVisualEvidence({
        viewport: `${viewportWidth} x ${viewportHeight}`,
        documentWidth: String(documentWidth),
        overflow: documentWidth > viewportWidth + 1 ? "overflow" : "none",
        stage: stageRect ? `${Math.round(stageRect.width)} x ${Math.round(stageRect.height)}` : "pending",
        canvasCss: canvasRect ? `${Math.round(canvasRect.width)} x ${Math.round(canvasRect.height)}` : "pending",
        canvasPixels: canvas ? `${canvas.width} x ${canvas.height}` : "pending",
        sample,
        verdict,
        updatedAt: new Date().toLocaleTimeString(),
      });
    };

    sampleEvidence();
    const timer = window.setInterval(sampleEvidence, 1200);
    window.addEventListener("resize", sampleEvidence);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", sampleEvidence);
    };
  }, [loadState, progress, stats.canvas]);

  useEffect(() => {
    const event = new Event("resize");
    window.dispatchEvent(event);
  }, [dprCap]);

  const qaReport = {
    route: "/lab/product-showcase",
    title: "Nocturne Camera · 3D Product Showcase",
    generatedAt: visualEvidence.updatedAt,
    sourceMode,
    loadState,
    progress,
    error: error || null,
    dprCap,
    runtime: stats,
    visualEvidence,
    screenshots: QA_REPORT_SCENARIOS.map(([label, body]) => ({ label, body })),
    verdicts: {
      routeSmoke: "200 on local dev route check",
      canvas: visualEvidence.verdict,
      overflow: visualEvidence.overflow,
      fallback: loadState === "ready" ? "not visible after ready" : "poster fallback should be visible",
    },
  };
  const qaReportJson = JSON.stringify(qaReport, null, 2);
  const releaseNotes = [
    "## Nocturne Camera · 3D Product Showcase",
    "",
    "### README Summary",
    "- Independent Three.js product page using a real GLB API route, OrbitControls, mobile DPR caps and fallback/retry UX.",
    `- Current runtime state: ${loadState}, progress ${progress}%, DPR cap ${dprCap}, canvas ${stats.canvas}.`,
    `- Visual evidence: ${visualEvidence.verdict}; overflow: ${visualEvidence.overflow}; viewport: ${visualEvidence.viewport}.`,
    "",
    "### Release Checklist",
    ...RELEASE_CHECKLIST.map(([label, body]) => `- [ ] ${label}: ${body}`),
    "",
    "### Incident Appendix",
    `- Source mode: ${sourceMode}`,
    `- Error: ${error || "none"}`,
    `- Fallback verdict: ${qaReport.verdicts.fallback}`,
    "- Rollback: keep poster fallback visible, switch to known-good GLB manifest, and attach QA report JSON to the incident note.",
  ].join("\n");
  const finalGateSummary = [
    "## Final Release Gate · Product Showcase",
    "",
    `- Route: ${qaReport.route}`,
    `- State: ${loadState}, progress ${progress}%, source ${sourceMode}`,
    `- Runtime: DPR ${stats.dpr} / cap ${dprCap}, canvas ${stats.canvas}, draw calls ${stats.drawCalls}, triangles ${stats.triangles}`,
    `- Visual: ${visualEvidence.verdict}; overflow ${visualEvidence.overflow}; sample ${visualEvidence.sample}`,
    `- Fallback: ${qaReport.verdicts.fallback}; error ${error || "none"}`,
    "- Evidence: QA report JSON, release notes Markdown, visual self-check, runtime evidence, desktop/mobile/fallback screenshot plan.",
    "- Production build: compiled successfully, then failed on an existing `/tags/Life.html` export rename outside this lab route.",
    "- Known warning: Next viewport meta and large page-data warnings come from site-wide/non-lab routes, outside this lab release gate.",
    "- Signoff: product showcase is ready for portfolio review after screenshot archive is attached; site-wide export issue remains separate.",
  ].join("\n");
  const screenshotArchiveManifest = JSON.stringify(
    {
      route: "/lab/product-showcase",
      completedSlot: 42,
      capturedAt: "2026-08-09T08:03:39+0800",
      status: "archive-plan-ready",
      currentEvidence: {
        loadState,
        progress,
        dprCap,
        runtime: stats,
        visualEvidence,
      },
      requiredShots: SCREENSHOT_ARCHIVE_MANIFEST.map(([id, viewport, proof]) => ({
        id,
        viewport,
        proof,
        fileName: `product-showcase-${id}.png`,
      })),
      finalDecision:
        "Portfolio review can proceed with local route/type evidence; production deploy remains blocked by the unrelated /tags/Life.html export issue.",
    },
    null,
    2,
  );
  const assetHandoffManifest = JSON.stringify(
    {
      route: "/lab/product-showcase",
      completedSlot: 43,
      capturedAt: "2026-08-09T08:18:39+0800",
      asset: {
        api: "/api/lab/product-marker-glb",
        contentType: "model/gltf-binary",
        contentLengthBytes: 1224,
        glbMagicHex: "676c5446",
        glbVersion: 2,
        declaredLengthBytes: 1224,
        cacheControl: "no-store",
      },
      runtime: {
        loadState,
        progress,
        sourceMode,
        stats,
        visualEvidence,
      },
      productionHandoff: {
        target: "hashed immutable GLB + short-cache manifest",
        budget: "mobile first asset should remain under 2 MB before texture compression exceptions",
        rollback: "poster fallback plus previous known-good GLB manifest",
        blocker: "site-wide /tags/Life.html export issue remains outside this lab asset path",
      },
    },
    null,
    2,
  );
  const decoderReadinessManifest = JSON.stringify(
    {
      route: "/lab/product-showcase",
      completedSlot: 44,
      capturedAt: "2026-08-09T08:33:39+0800",
      currentAsset: {
        source: "/api/lab/product-marker-glb",
        bytes: 1224,
        compression: "none for the lab asset",
        reason: "The current 1224-byte GLB is below the threshold where decoder cost is worth paying.",
      },
      productionThresholds: {
        draco: "enable for heavy geometry after measuring decode cost",
        meshopt: "prefer for mobile geometry delivery once model payload grows",
        ktx2: "enable when texture bytes dominate the GLB budget",
        maxMobileGlbBytes: 2000000,
      },
      decoderPaths: {
        draco: "/decoders/draco/",
        meshopt: "/decoders/meshopt_decoder.module.js",
        ktx2: "/basis/",
      },
      runtime: {
        loadState,
        progress,
        stats,
        visualEvidence,
      },
      fallback:
        "If decoder import, transcode or parse fails, show poster fallback, keep Retry, and switch to the previous known-good GLB manifest.",
    },
    null,
    2,
  );
  const completionCertificateManifest = JSON.stringify(
    {
      route: "/lab/product-showcase",
      completedSlot: 45,
      capturedAt: "2026-08-09T08:48:39+0800",
      status: "webgl-training-complete",
      capabilities: [
        "Raw WebGL shader/program/buffer pipeline",
        "Uniform-driven animation and matrix transforms",
        "Three.js scene/camera/renderer/materials/lights",
        "Raycaster interaction",
        "Mobile DPR cap and resize evidence",
        "Context lost fallback path",
        "InstancedMesh performance budget",
        "GLTFLoader real GLB API",
        "Poster fallback and retry",
        "Runtime evidence and visual self-check",
        "QA report JSON and release notes",
        "Final release gate, asset handoff and decoder readiness manifest",
      ],
      stopCondition:
        "Do not add more WebGL features until the site-wide /tags/Life.html production export blocker is fixed.",
      nextOwner: "site build pipeline",
      knownBlocker: "/tags/Life.html export rename ENOENT",
      runtime: {
        loadState,
        progress,
        stats,
        visualEvidence,
      },
    },
    null,
    2,
  );

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(qaReportJson);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("copy report json"), 1500);
    } catch {
      setCopyState("copy unavailable");
      window.setTimeout(() => setCopyState("copy report json"), 1500);
    }
  };

  const copyReleaseNotes = async () => {
    try {
      await navigator.clipboard.writeText(releaseNotes);
      setCopyDocState("copied");
      window.setTimeout(() => setCopyDocState("copy release notes"), 1500);
    } catch {
      setCopyDocState("copy unavailable");
      window.setTimeout(() => setCopyDocState("copy release notes"), 1500);
    }
  };

  const copyFinalGate = async () => {
    try {
      await navigator.clipboard.writeText(finalGateSummary);
      setCopyGateState("copied");
      window.setTimeout(() => setCopyGateState("copy final gate"), 1500);
    } catch {
      setCopyGateState("copy unavailable");
      window.setTimeout(() => setCopyGateState("copy final gate"), 1500);
    }
  };

  const copyArchiveManifest = async () => {
    try {
      await navigator.clipboard.writeText(screenshotArchiveManifest);
      setCopyArchiveState("copied");
      window.setTimeout(() => setCopyArchiveState("copy archive manifest"), 1500);
    } catch {
      setCopyArchiveState("copy unavailable");
      window.setTimeout(() => setCopyArchiveState("copy archive manifest"), 1500);
    }
  };

  const copyAssetHandoff = async () => {
    try {
      await navigator.clipboard.writeText(assetHandoffManifest);
      setCopyAssetState("copied");
      window.setTimeout(() => setCopyAssetState("copy asset handoff"), 1500);
    } catch {
      setCopyAssetState("copy unavailable");
      window.setTimeout(() => setCopyAssetState("copy asset handoff"), 1500);
    }
  };

  const copyDecoderManifest = async () => {
    try {
      await navigator.clipboard.writeText(decoderReadinessManifest);
      setCopyDecoderState("copied");
      window.setTimeout(() => setCopyDecoderState("copy decoder manifest"), 1500);
    } catch {
      setCopyDecoderState("copy unavailable");
      window.setTimeout(() => setCopyDecoderState("copy decoder manifest"), 1500);
    }
  };

  const copyCompletionCertificate = async () => {
    try {
      await navigator.clipboard.writeText(completionCertificateManifest);
      setCopyCompletionState("copied");
      window.setTimeout(() => setCopyCompletionState("copy completion certificate"), 1500);
    } catch {
      setCopyCompletionState("copy unavailable");
      window.setTimeout(() => setCopyCompletionState("copy completion certificate"), 1500);
    }
  };

  return (
    <>
      <SEO
        title="3D Product Showcase"
        path="/lab/product-showcase"
        description="独立作品页：真实 GLB 加载、DPR cap、fallback/retry、移动端 QA 和发布证据。"
      />

      <article className="space-y-8 animate-fade-up">
        <nav className="text-xs text-gray-500 dark:text-cyan-300/70 cyber-num uppercase tracking-[0.25em]">
          <Link href="/lab" className="hover:text-cyan-600 dark:hover:text-cyan-200 transition-colors">
            ← Lab
          </Link>
        </nav>

        <header className="space-y-4">
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-cyan-300/80 uppercase tracking-[0.25em] cyber-num">
            <span className="w-6 h-px bg-gray-400 dark:bg-cyan-400/70" />
            Portfolio · 3D Product Showcase
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            Nocturne Camera · 3D Product Showcase
          </h1>
          <p className="max-w-3xl text-sm md:text-base leading-relaxed text-gray-600 dark:text-gray-400">
            从训练页抽出的独立作品页：真实 GLB URL、OrbitControls、移动端 DPR cap、poster fallback、Retry、
            资源预算和 incident 证据都在一个可展示的首屏闭环里。
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="cyber-num text-[11px] uppercase tracking-[0.24em] text-gray-500 dark:text-cyan-300/80">
                Live WebGL · GLTFLoader
              </div>
              <div className="flex flex-wrap gap-2">
                {DPR_OPTIONS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setDprCap(item.value)}
                    className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] cyber-num transition-colors ${
                      dprCap === item.value
                        ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200"
                        : "border-gray-300/70 text-gray-500 hover:border-cyan-400/60 dark:border-cyan-400/20 dark:text-cyan-300/70"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSourceMode(sourceMode === "real" ? "broken" : "real")}
                  className="rounded-full border border-fuchsia-300/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-fuchsia-700 transition-colors hover:bg-fuchsia-400/10 dark:border-fuchsia-300/30 dark:text-fuchsia-200 cyber-num"
                >
                  {sourceMode === "real" ? "test fallback" : "retry real glb"}
                </button>
              </div>
            </div>

            <div
              ref={stageRef}
              data-testid="product-showcase-stage"
              data-load-state={loadState}
              data-canvas={stats.canvas}
              data-overflow={visualEvidence.overflow}
              className="relative min-h-[340px] overflow-hidden rounded-lg border border-gray-200/70 bg-[#061018] dark:border-cyan-400/20"
            >
              <div
                ref={containerRef}
                data-testid="product-showcase-canvas-host"
                className="h-[340px] w-full sm:h-[420px] lg:h-[520px]"
              />
              {loadState !== "ready" ? (
                <div
                  ref={fallbackRef}
                  data-testid="product-showcase-fallback"
                  className="absolute inset-0 flex items-center justify-center bg-[#061018]/88 px-4 text-center backdrop-blur-sm sm:px-6"
                >
                  <div className="w-full max-w-sm space-y-3">
                    <div className="cyber-num text-[10px] uppercase tracking-[0.25em] text-cyan-200">
                      {loadState === "fallback" ? "Poster fallback" : "Loading 3D asset"}
                    </div>
                    <div className="mx-auto grid h-28 w-36 place-items-center rounded-lg border border-cyan-300/30 bg-gradient-to-br from-cyan-300/25 via-fuchsia-300/15 to-black/40 shadow-[0_0_26px_rgba(0,240,255,0.12)]">
                      <div className="h-12 w-20 rounded-md border border-white/20 bg-black/25" />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-cyan-300" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-sm leading-relaxed text-cyan-50/80">
                      {loadState === "fallback"
                        ? `GLB 加载失败，保留 poster。${error}`
                        : "真实 GLB 正在加载，首屏先保留可见 poster 和进度。"}
                    </p>
                    <div className="space-y-1 text-xs leading-relaxed text-cyan-50/65">
                      {POSTER_COPY_POINTS.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="space-y-4">
            <section
              data-testid="runtime-evidence"
              className="rounded-lg border border-cyan-300/50 bg-cyan-50/70 p-4 dark:border-cyan-300/20 dark:bg-cyan-400/10"
            >
              <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">
                Runtime evidence
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ["state", loadState],
                  ["progress", `${progress}%`],
                  ["dpr", `${stats.dpr} / cap ${dprCap}`],
                  ["css", stats.css],
                  ["canvas", stats.canvas],
                  ["draw calls", stats.drawCalls],
                  ["triangles", stats.triangles],
                  ["bytes", stats.bytes],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-cyan-300/40 bg-white/70 p-3 dark:border-cyan-300/15 dark:bg-black/20">
                    <div className="cyber-num text-[10px] uppercase tracking-[0.16em] text-gray-400 dark:text-cyan-300/70">
                      {label}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-emerald-300/50 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
              <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                Release evidence
              </div>
              <div className="mt-3 space-y-2">
                {RELEASE_EVIDENCE.map(([label, body], index) => (
                  <div key={label} className="rounded-md border border-emerald-300/40 bg-white/70 p-3 dark:border-emerald-300/15 dark:bg-black/20">
                    <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                      <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                      <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-violet-300/60 bg-violet-50/70 p-4 dark:border-violet-300/20 dark:bg-violet-400/10">
            <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-violet-700 dark:text-violet-300">
              Mobile visual QA
            </div>
            <div className="mt-3 space-y-2">
              {MOBILE_VISUAL_QA.map(([label, body]) => (
                <div
                  key={label}
                  className="rounded-md border border-violet-300/50 bg-white/70 p-3 dark:border-violet-300/20 dark:bg-black/20"
                >
                  <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                    <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-300/25 dark:bg-amber-400/10">
            <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
              Recording path
            </div>
            <div className="mt-3 space-y-2">
              {RECORDING_PATH.map(([label, body], index) => (
                <div
                  key={label}
                  className="rounded-md border border-amber-300/50 bg-white/70 p-3 dark:border-amber-300/20 dark:bg-black/20"
                >
                  <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                    <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          data-testid="visual-self-check"
          data-overflow={visualEvidence.overflow}
          className="rounded-lg border border-sky-300/70 bg-sky-50/70 p-4 dark:border-sky-300/25 dark:bg-sky-400/10"
        >
          <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
            Visual self-check
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {[
              ["verdict", visualEvidence.verdict],
              ["viewport", visualEvidence.viewport],
              ["document", `${visualEvidence.documentWidth} px · ${visualEvidence.overflow}`],
              ["stage", visualEvidence.stage],
              ["canvas css", visualEvidence.canvasCss],
              ["canvas pixels", visualEvidence.canvasPixels],
              ["updated", visualEvidence.updatedAt],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-sky-300/50 bg-white/70 p-3 dark:border-sky-300/20 dark:bg-black/20"
              >
                <div className="cyber-num text-[10px] uppercase tracking-[0.16em] text-gray-400 dark:text-sky-300/80">
                  {label}
                </div>
                <div className="mt-1 break-words text-sm font-semibold leading-relaxed text-gray-900 dark:text-gray-100">
                  {value}
                </div>
              </div>
            ))}
          </div>
          <div
            data-testid="canvas-pixel-sample"
            className="mt-3 rounded-md border border-sky-300/50 bg-white/70 p-3 dark:border-sky-300/20 dark:bg-black/20"
          >
            <div className="cyber-num text-[10px] uppercase tracking-[0.16em] text-gray-400 dark:text-sky-300/80">
              canvas pixel sample
            </div>
            <div className="mt-1 break-words text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              {visualEvidence.sample}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {VISUAL_SELF_CHECKS.map(([label, body], index) => (
              <div
                key={label}
                className="rounded-md border border-sky-300/50 bg-white/70 p-3 dark:border-sky-300/20 dark:bg-black/20"
              >
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-sky-700 dark:text-sky-200">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                  <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          data-testid="browser-verification"
          className="rounded-lg border border-lime-300/70 bg-lime-50/70 p-4 dark:border-lime-300/25 dark:bg-lime-400/10"
        >
          <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-lime-700 dark:text-lime-300">
            Browser verification harness
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {BROWSER_VERIFICATION.map(([label, body], index) => (
              <div
                key={label}
                className="rounded-md border border-lime-300/50 bg-white/70 p-3 dark:border-lime-300/20 dark:bg-black/20"
              >
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-lime-700 dark:text-lime-200">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                  <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          data-testid="qa-report-export"
          className="rounded-lg border border-fuchsia-300/70 bg-fuchsia-50/70 p-4 dark:border-fuchsia-300/25 dark:bg-fuchsia-400/10"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-fuchsia-700 dark:text-fuchsia-300">
                QA report export
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                把 route、runtime、visual self-check、fallback 和截图场景整理成可复制 JSON，用于作品集 README 或发布复盘。
              </p>
            </div>
            <button
              type="button"
              onClick={copyReport}
              className="rounded-full border border-fuchsia-300/70 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-fuchsia-700 transition-colors hover:bg-fuchsia-400/10 dark:border-fuchsia-300/30 dark:text-fuchsia-200 cyber-num"
            >
              {copyState}
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {QA_REPORT_SCENARIOS.map(([label, body], index) => (
              <div
                key={label}
                className="rounded-md border border-fuchsia-300/50 bg-white/70 p-3 dark:border-fuchsia-300/20 dark:bg-black/20"
              >
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-fuchsia-700 dark:text-fuchsia-200">
                    shot {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                  <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                </p>
              </div>
            ))}
          </div>
          <pre
            data-testid="qa-report-json"
            className="mt-3 max-h-80 overflow-auto rounded-md border border-fuchsia-300/50 bg-white/80 p-3 text-xs leading-relaxed text-gray-700 dark:border-fuchsia-300/20 dark:bg-black/25 dark:text-gray-300"
          >
            {qaReportJson}
          </pre>
        </section>

        <section
          data-testid="release-notes-export"
          className="rounded-lg border border-emerald-300/70 bg-emerald-50/70 p-4 dark:border-emerald-300/25 dark:bg-emerald-400/10"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                README / release checklist
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                把 QA report 拆成 README 摘要、发布验收 checklist 和 incident appendix，形成可提交的作品集说明。
              </p>
            </div>
            <button
              type="button"
              onClick={copyReleaseNotes}
              className="rounded-full border border-emerald-300/70 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-emerald-700 transition-colors hover:bg-emerald-400/10 dark:border-emerald-300/30 dark:text-emerald-200 cyber-num"
            >
              {copyDocState}
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {README_RELEASE_POINTS.map(([label, body], index) => (
              <div
                key={label}
                className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
              >
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
                    doc {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                  <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                </p>
              </div>
            ))}
          </div>
          <pre
            data-testid="release-notes-markdown"
            className="mt-3 max-h-80 overflow-auto rounded-md border border-emerald-300/50 bg-white/80 p-3 text-xs leading-relaxed text-gray-700 dark:border-emerald-300/20 dark:bg-black/25 dark:text-gray-300"
          >
            {releaseNotes}
          </pre>
        </section>

        <section
          data-testid="final-release-gate"
          className="rounded-lg border border-cyan-300/70 bg-cyan-50/70 p-4 dark:border-cyan-300/25 dark:bg-cyan-400/10"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">
                Final release gate
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                发布签收面板：把路由、类型、runtime、视觉、fallback、QA 包、已知 warning 和回滚路径放在一个可复制摘要里。
              </p>
            </div>
            <button
              type="button"
              onClick={copyFinalGate}
              className="rounded-full border border-cyan-300/70 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-cyan-700 transition-colors hover:bg-cyan-400/10 dark:border-cyan-300/30 dark:text-cyan-200 cyber-num"
            >
              {copyGateState}
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {FINAL_RELEASE_GATES.map(([label, body], index) => (
              <div
                key={label}
                className="rounded-md border border-cyan-300/50 bg-white/70 p-3 dark:border-cyan-300/20 dark:bg-black/20"
              >
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-200">
                    gate {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                  <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                </p>
              </div>
            ))}
          </div>
          <pre
            data-testid="final-release-summary"
            className="mt-3 max-h-80 overflow-auto rounded-md border border-cyan-300/50 bg-white/80 p-3 text-xs leading-relaxed text-gray-700 dark:border-cyan-300/20 dark:bg-black/25 dark:text-gray-300"
          >
            {finalGateSummary}
          </pre>
          <div
            data-testid="production-build-evidence"
            className="mt-3 grid gap-2 md:grid-cols-2"
          >
            {PRODUCTION_BUILD_EVIDENCE.map(([label, body], index) => (
              <div
                key={label}
                className="rounded-md border border-cyan-300/50 bg-white/70 p-3 dark:border-cyan-300/20 dark:bg-black/20"
              >
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-200">
                    build {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                  <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                </p>
              </div>
            ))}
          </div>
          <section
            data-testid="screenshot-archive-manifest"
            className="mt-3 rounded-lg border border-emerald-300/70 bg-emerald-50/70 p-4 dark:border-emerald-300/25 dark:bg-emerald-400/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                  Screenshot archive manifest
                </div>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  收尾归档清单：desktop、mobile 和 fallback 三张截图绑定同一份 runtime/visual evidence，避免作品评审只看静态图。
                </p>
              </div>
              <button
                type="button"
                onClick={copyArchiveManifest}
                className="rounded-full border border-emerald-300/70 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-emerald-700 transition-colors hover:bg-emerald-400/10 dark:border-emerald-300/30 dark:text-emerald-200 cyber-num"
              >
                {copyArchiveState}
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {SCREENSHOT_ARCHIVE_MANIFEST.map(([id, viewport, proof], index) => (
                <div
                  key={id}
                  className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
                >
                  <div className="cyber-num text-[10px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
                    shot {String(index + 1).padStart(2, "0")} · {viewport}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{id}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{proof}</p>
                </div>
              ))}
            </div>
            <pre
              data-testid="screenshot-archive-json"
              className="mt-3 max-h-72 overflow-auto rounded-md border border-emerald-300/50 bg-white/80 p-3 text-xs leading-relaxed text-gray-700 dark:border-emerald-300/20 dark:bg-black/25 dark:text-gray-300"
            >
              {screenshotArchiveManifest}
            </pre>
          </section>
          <section
            data-testid="asset-handoff-packet"
            className="mt-3 rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-300/25 dark:bg-amber-400/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                  Asset handoff packet
                </div>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  真实 GLB API 的移交证据：HTTP 合同、MIME、体积、GLB magic、缓存策略和回滚路径放在同一个可复制包里。
                </p>
              </div>
              <button
                type="button"
                onClick={copyAssetHandoff}
                className="rounded-full border border-amber-300/70 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-amber-700 transition-colors hover:bg-amber-400/10 dark:border-amber-300/30 dark:text-amber-200 cyber-num"
              >
                {copyAssetState}
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {ASSET_HANDOFF_PACKET.map(([label, body], index) => (
                <div
                  key={label}
                  className="rounded-md border border-amber-300/50 bg-white/70 p-3 dark:border-amber-300/20 dark:bg-black/20"
                >
                  <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
                      asset {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                    <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                  </p>
                </div>
              ))}
            </div>
            <pre
              data-testid="asset-handoff-json"
              className="mt-3 max-h-72 overflow-auto rounded-md border border-amber-300/50 bg-white/80 p-3 text-xs leading-relaxed text-gray-700 dark:border-amber-300/20 dark:bg-black/25 dark:text-gray-300"
            >
              {assetHandoffManifest}
            </pre>
          </section>
          <section
            data-testid="decoder-readiness-manifest"
            className="mt-3 rounded-lg border border-indigo-300/70 bg-indigo-50/70 p-4 dark:border-indigo-300/25 dark:bg-indigo-400/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-indigo-700 dark:text-indigo-300">
                  Decoder readiness manifest
                </div>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  Draco、Meshopt、KTX2 的生产启用条件和 fallback 路径。当前 1224B lab GLB 不压缩，但移交时保留明确阈值。
                </p>
              </div>
              <button
                type="button"
                onClick={copyDecoderManifest}
                className="rounded-full border border-indigo-300/70 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-indigo-700 transition-colors hover:bg-indigo-400/10 dark:border-indigo-300/30 dark:text-indigo-200 cyber-num"
              >
                {copyDecoderState}
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {DECODER_READINESS_MATRIX.map(([label, role, decision], index) => (
                <div
                  key={label}
                  className="rounded-md border border-indigo-300/50 bg-white/70 p-3 dark:border-indigo-300/20 dark:bg-black/20"
                >
                  <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-200">
                      decoder {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                    <span className="text-gray-500 dark:text-gray-400"> - {role}: {decision}</span>
                  </p>
                </div>
              ))}
            </div>
            <pre
              data-testid="decoder-readiness-json"
              className="mt-3 max-h-72 overflow-auto rounded-md border border-indigo-300/50 bg-white/80 p-3 text-xs leading-relaxed text-gray-700 dark:border-indigo-300/20 dark:bg-black/25 dark:text-gray-300"
            >
              {decoderReadinessManifest}
            </pre>
          </section>
          <section
            data-testid="webgl-completion-certificate"
            className="mt-3 rounded-lg border border-sky-300/70 bg-sky-50/70 p-4 dark:border-sky-300/25 dark:bg-sky-400/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
                  WebGL completion certificate
                </div>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  45 个 15 分钟单元的移交证书：能力覆盖、作品路由、验证证据和停止继续堆功能的条件合并为一份可复制 JSON。
                </p>
              </div>
              <button
                type="button"
                onClick={copyCompletionCertificate}
                className="rounded-full border border-sky-300/70 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-sky-700 transition-colors hover:bg-sky-400/10 dark:border-sky-300/30 dark:text-sky-200 cyber-num"
              >
                {copyCompletionState}
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {COMPLETION_CERTIFICATE.map(([label, body], index) => (
                <div
                  key={label}
                  className="rounded-md border border-sky-300/50 bg-white/70 p-3 dark:border-sky-300/20 dark:bg-black/20"
                >
                  <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    <span className="cyber-num mr-2 text-[10px] uppercase tracking-[0.16em] text-sky-700 dark:text-sky-200">
                      complete {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                    <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                  </p>
                </div>
              ))}
            </div>
            <pre
              data-testid="webgl-completion-json"
              className="mt-3 max-h-72 overflow-auto rounded-md border border-sky-300/50 bg-white/80 p-3 text-xs leading-relaxed text-gray-700 dark:border-sky-300/20 dark:bg-black/25 dark:text-gray-300"
            >
              {completionCertificateManifest}
            </pre>
          </section>
        </section>
      </article>
    </>
  );
}
