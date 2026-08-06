import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import SEO from "@/components/SEO";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import progress from "../../../data/webgl-learning-progress.json";

type DemoKey =
  | "webgl-triangle"
  | "webgl-rotation"
  | "shader-wave"
  | "three-scene"
  | "picking"
  | "configurator"
  | "data-points"
  | "performance";

interface Slot {
  time: string;
  stage: string;
  title: string;
  demo: DemoKey;
  goal: string;
  verify: string;
  interview: string;
}

interface DemoStats {
  fps: number;
  dpr: number;
  drawCalls: number;
  triangles: number;
  note: string;
  nativeDpr?: number;
  dprCap?: number;
  cssWidth?: number;
  cssHeight?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  pixelBudget?: number;
  aspect?: number;
  points?: number;
  dataBytes?: number;
  dataSource?: string;
  instances?: number;
  instanceBytes?: number;
  instancePreset?: string;
  contextState?: "running" | "lost" | "restored";
}

const PIPELINE_CHECKS = [
  ["Context", "canvas.getContext('webgl') 返回 WebGLRenderingContext。"],
  ["Shader", "vertex shader 与 fragment shader 编译通过。"],
  ["Program", "attachShader + linkProgram 形成可执行 GPU 程序。"],
  ["Buffer", "Float32Array 顶点数据上传到 ARRAY_BUFFER。"],
  ["Attribute", "vertexAttribPointer 描述 position / color 的内存布局。"],
  ["Draw", "drawArrays(TRIANGLES, 0, 3) 提交 1 次绘制。"],
];

const ATTRIBUTE_PALETTES = [
  {
    name: "RGB 插值",
    colors: [
      [1.0, 0.18, 0.82],
      [0.0, 0.94, 1.0],
      [1.0, 0.72, 0.3],
    ],
  },
  {
    name: "冷暖对照",
    colors: [
      [0.48, 0.87, 1.0],
      [0.28, 1.0, 0.58],
      [1.0, 0.32, 0.42],
    ],
  },
  {
    name: "暗场高光",
    colors: [
      [0.94, 0.96, 1.0],
      [0.18, 0.28, 0.52],
      [0.95, 0.2, 0.78],
    ],
  },
];

const TRIANGLE_POSITIONS = [
  [0.0, 0.72],
  [-0.72, -0.58],
  [0.72, -0.58],
];

const ATTRIBUTE_LAYOUT = [
  ["a_position", "vec2", "2 floats", "offset 0 byte"],
  ["a_color", "vec3", "3 floats", "offset 8 bytes"],
  ["stride", "5 floats", "20 bytes", "每个顶点总长度"],
];

const UNIFORM_CHECKS = [
  ["CPU state", "UI 控制暂停和速度，CPU 每帧累积 angle。"],
  ["Uniform upload", "gl.uniform1f(u_angle, angle) 把角度传入当前 draw call。"],
  ["Shader matrix", "顶点着色器用 mat2(cos, -sin, sin, cos) 旋转 position。"],
  ["Frame loop", "requestAnimationFrame 负责逐帧更新，暂停时停止累积 angle。"],
];

const ROTATION_SPEEDS = [0.5, 1, 2];

const SHADER_CHECKS = [
  ["Screen coords", "gl_FragCoord 读取当前片元的屏幕像素坐标。"],
  ["Resolution", "u_resolution 把像素坐标归一化，避免宽高变化时波纹被拉伸。"],
  ["Distance field", "length(uv) 得到当前像素到中心点的距离。"],
  ["Wave", "sin(frequency * distance - time * speed) 生成随时间传播的明暗带。"],
  ["Mix", "smoothstep 和 mix 把波纹混合到青/品红渐变里。"],
];

const WAVE_FREQUENCIES = [10, 18, 28];
const WAVE_SPEEDS = [2, 4, 7];
const WAVE_INTENSITIES = [0.45, 0.75, 1];

const THREE_SCENE_OBJECTS = [
  ["Scene", "根容器，持有光源、辅助线、Mesh 和雾效。"],
  ["PerspectiveCamera", "45° FOV，near=0.1，far=100，负责把 3D 空间投影到屏幕。"],
  ["WebGLRenderer", "接管 canvas，把 Scene + Camera 渲染成一帧像素。"],
  ["Mesh", "TorusKnotGeometry + MeshStandardMaterial，Three.js 的 Geometry + Material 组合。"],
  ["Lights", "AmbientLight + 双 PointLight，给 PBR 材质提供明暗和高光。"],
  ["OrbitControls", "把拖拽、缩放和阻尼封装成相机交互。"],
];

const THREE_CAMERA_ROWS = [
  ["fov", "45", "视野角，越大透视越夸张。"],
  ["near / far", "0.1 / 100", "深度裁剪范围，过大可能影响深度精度。"],
  ["position", "(0, 2.2, 7)", "相机从略高处看向场景中心。"],
  ["pixelRatio", "min(devicePixelRatio, 2)", "限制移动端真实像素数量，避免 GPU 负担过高。"],
];

const THREE_SCENE_CHECKS = [
  ["Scene graph", "所有 3D 对象都挂在 Scene 或 Group 下，卸载时统一 traverse dispose。"],
  ["Camera aspect", "resize 时同步 renderer size、camera.aspect 和 updateProjectionMatrix。"],
  ["Renderer loop", "requestAnimationFrame 每帧 render(scene, camera)，renderer.info 记录 draw calls。"],
  ["Controls", "OrbitControls enableDamping=true，拖拽后 controls.update() 才会有惯性。"],
  ["Helper", "GridHelper + AxesHelper 给空间方向和地面尺度提供视觉参考。"],
];

const MATERIAL_PRESETS = [
  { name: "polished", metalness: 0.9, roughness: 0.16 },
  { name: "balanced", metalness: 0.62, roughness: 0.34 },
  { name: "matte", metalness: 0.18, roughness: 0.78 },
];

const LIGHT_PRESETS = [
  { name: "soft", key: 34, rim: 18, ambient: 0.85 },
  { name: "studio", key: 55, rim: 35, ambient: 1.1 },
  { name: "dramatic", key: 88, rim: 62, ambient: 0.5 },
];

const MATERIAL_CHECKS = [
  ["metalness", "越高越依赖环境和灯光反射，适合金属、抛光硬表面。"],
  ["roughness", "越高高光越散，越低高光越锐利，直接影响产品质感。"],
  ["PointLight", "key light 提供主高光，rim light 勾边，方向和强度都会改变视觉焦点。"],
  ["AmbientLight", "补足暗部，太高会让模型发灰，太低移动端暗场细节容易丢失。"],
  ["Business tradeoff", "产品展示常用稳定材质参数，不让用户自由拉满，避免 SKU 质感失真。"],
];

const RAYCASTER_CHECKS = [
  ["Pointer NDC", "把点击点从 canvas 像素坐标转换到 [-1, 1] 的标准设备坐标。"],
  ["setFromCamera", "Raycaster 根据 NDC 和 Camera 生成一条世界空间射线。"],
  ["intersectObjects", "对可点击 Mesh 列表求交，返回按距离排序的命中结果。"],
  ["Hit feedback", "命中 Mesh 后改变 emissive，并显示命中点 marker 与射线辅助线。"],
  ["Miss handling", "未命中时清空高亮和辅助线，避免保留过期状态误导用户。"],
];

const PICKING_TARGETS = [
  ["Lens", "左上部件，适合模拟镜头、热点区域或商品局部。"],
  ["Body", "中心主体，适合承载主 SKU 或主要信息面板。"],
  ["Button", "右上按钮，适合模拟可点击开关/部件。"],
  ["Port", "底部接口，适合模拟小面积命中和精细交互。"],
];

const CONFIG_BODY_COLORS = [
  { name: "cyan", color: 0x00f0ff },
  { name: "magenta", color: 0xff2dd1 },
  { name: "lime", color: 0x7ddf64 },
  { name: "amber", color: 0xffb84d },
];

const CONFIG_LENS_PRESETS = [
  { name: "clear", color: 0xb8f7ff, opacity: 0.52 },
  { name: "smoke", color: 0x91a2b8, opacity: 0.68 },
  { name: "rose", color: 0xffb6df, opacity: 0.58 },
];

const CONFIG_BUTTON_PRESETS = [
  { name: "graphite", color: 0x111827, metalness: 0.5 },
  { name: "chrome", color: 0xd8e4ef, metalness: 0.86 },
  { name: "accent", color: 0xfff3a3, metalness: 0.42 },
];

const CONFIGURATOR_CHECKS = [
  ["Part map", "Body、Lens、Button 分别绑定独立材质，状态只改目标部件。"],
  ["SKU state", "主体色、镜片 tint、按钮 finish 组合成稳定 SKU code。"],
  ["Material mapping", "配置项映射到 color、opacity、metalness 等 Three.js 材质参数。"],
  ["Business constraint", "业务上暴露有限预设，避免用户把材质调到不可生产或不符合品牌。"],
  ["Runtime sync", "UI 状态变化后，render loop 同步材质，不需要重建整个场景。"],
];

const DPR_PRESETS = [
  { name: "battery", cap: 1, intent: "低端机/发热时优先稳定帧率" },
  { name: "balanced", cap: 1.5, intent: "移动端默认：清晰度和像素预算折中" },
  { name: "sharp", cap: 2, intent: "高端机或产品细节页，限制最高 DPR=2" },
];

const DPR_CHECKS = [
  ["Native DPR", "读取 window.devicePixelRatio 作为设备原生像素密度。"],
  ["Cap DPR", "实际渲染 DPR 使用 min(nativeDPR, cap)，避免高端手机像素数爆炸。"],
  ["Pixel budget", "canvas 像素数 = CSS width * CSS height * DPR²，DPR 会平方级增加 GPU 压力。"],
  ["Runtime resize", "每帧根据容器 CSS 尺寸同步 renderer size，窗口变化后画面不拉伸。"],
  ["Fallback", "FPS 低、发热或 context lost 时可以切到 battery 预设并降低后处理/阴影。"],
];

const RESIZE_VIEWPORTS = [
  { name: "phone", width: 280, intent: "窄屏检验：模型不被压扁，页面不横向溢出。" },
  { name: "tablet", width: 420, intent: "中等宽度：常见移动横屏或折叠屏面板。" },
  { name: "desktop", width: 680, intent: "桌面宽度：验证相机 aspect 和 canvas 像素同步放大。" },
];

const RESIZE_CHECKS = [
  ["CSS box", "canvas 的 CSS 宽高来自容器，不直接写死成固定像素。"],
  ["Renderer size", "resize 时调用 renderer.setSize(width, height, false)，保持 CSS 布局不被 Three.js 改写。"],
  ["Camera aspect", "camera.aspect = width / height 后必须 updateProjectionMatrix，否则模型会被拉伸。"],
  ["Pixel size", "真实 canvas 像素 = CSS size * DPR，和上一轮 DPR 策略一起决定像素预算。"],
  ["Overflow", "移动端只改变容器 max-width，不让页面 scrollWidth 大于 clientWidth。"],
];

const DATAVIZ_DATASETS = [
  {
    name: "orbit",
    count: 460,
    radius: 1.35,
    vertical: 1.1,
    colorA: [0.0, 0.94, 1.0],
    colorB: [1.0, 0.18, 0.82],
    source: "satellite-orbit.json",
    metric: "轨道点位",
  },
  {
    name: "city",
    count: 720,
    radius: 1.8,
    vertical: 0.65,
    colorA: [0.49, 0.87, 0.39],
    colorB: [1.0, 0.72, 0.3],
    source: "city-sensors.json",
    metric: "城市传感器",
  },
  {
    name: "signal",
    count: 960,
    radius: 2.15,
    vertical: 1.35,
    colorA: [0.72, 0.78, 1.0],
    colorB: [1.0, 0.2, 0.45],
    source: "signal-packets.json",
    metric: "实时信号包",
  },
];

const DATAVIZ_CHECKS = [
  ["Data source", "用结构化数据源描述 count、radius、颜色和业务指标，而不是把点位写死在渲染代码里。"],
  ["Position buffer", "所有点位坐标写入一个 Float32Array，再作为 BufferAttribute 上传给 GPU。"],
  ["Color attribute", "每个点的颜色也是 attribute，PointsMaterial 开启 vertexColors 后由 GPU 插值/读取。"],
  ["Single draw", "Points 使用一个 BufferGeometry 和一个 Material，大量点位仍然保持很少的 draw call。"],
  ["Path overlay", "巡航路径用 Line 叠加，表达数据流向，同时和点位共享同一坐标空间。"],
];

const INSTANCE_PRESETS = [
  { name: "baseline", count: 160, rings: 4, spread: 1.25, intent: "低压力对照组，用来观察基础 draw call。" },
  { name: "dense", count: 520, rings: 8, spread: 1.65, intent: "默认性能样例：大量物体仍保持一次实例化提交。" },
  { name: "stress", count: 1200, rings: 12, spread: 2.1, intent: "压力测试：增加 instance matrix 数量，观察 FPS 和 triangles。" },
];

const INSTANCE_CHECKS = [
  ["Shared geometry", "所有实例共用一个 BoxGeometry，避免重复创建几何和顶点缓冲。"],
  ["Shared material", "所有实例共用一个 MeshStandardMaterial，让实例化合批成立。"],
  ["Instance matrix", "每个实例只上传一个 4x4 matrix，表达 position、rotation、scale。"],
  ["Low draw call", "InstancedMesh 会把大量对象合成少量 draw call，降低 CPU 提交成本。"],
  ["Tradeoff", "实例越多 GPU 顶点和片元工作仍会上升，所以 draw call 低不等于完全免费。"],
];

const DEBUG_METRICS = [
  ["FPS", "低于 30 先看是否实例规模、DPR、阴影/后处理或透明材质过重。"],
  ["DPR", "大于 2 通常要强制上限；移动端发热时优先切 battery 策略。"],
  ["Draw Calls", "持续过高说明 Mesh/Material 没有合批，优先检查 InstancedMesh 或 BufferGeometry。"],
  ["Triangles", "几何量过高时要做 LOD、减面、合批或模型压缩。"],
  ["Pixel Budget", "canvas 像素过大时会增加 fill-rate 压力，和 DPR、resize 同时排查。"],
  ["Instance Matrix", "实例化只减少 CPU 提交，实例太多仍会增加 GPU 工作量。"],
];

const DEBUG_ACTIONS = [
  ["加载慢", "记录模型/贴图大小、压缩方式、首屏阻塞资源和加载进度。"],
  ["帧率低", "先降 DPR，再关阴影/后处理，最后减少实例/面数。"],
  ["手机发热", "切 battery DPR，降低动画频率，减少透明材质和高频 shader。"],
  ["白屏", "检查 WebGL context、shader compile、资源路径、context lost 和错误边界。"],
  ["交互错位", "检查 canvas rect、NDC 换算、camera aspect 和 resize 时机。"],
];

const CONTEXT_ACTIONS = ["running", "lost", "restored"] as const;

const CONTEXT_CHECKS = [
  ["webglcontextlost", "监听事件并 event.preventDefault()，给应用一个恢复机会。"],
  ["Stop loop", "丢失后停止提交 draw call，避免继续访问无效 GPU 状态。"],
  ["User feedback", "页面要显示降级/恢复提示，而不是让用户看到永久白屏。"],
  ["Resource rebuild", "恢复时要重新创建 shader、program、buffer、texture 和 framebuffer。"],
  ["Cleanup", "路由切换或组件卸载时取消 RAF、移除监听、deleteBuffer/deleteProgram/dispose。"],
];

const PORTFOLIO_README = [
  ["项目定位", "3D 商品配置器：面向电商/官网的交互式产品展示，支持主体、镜片、按钮三个部件配置。"],
  ["核心功能", "实时材质切换、稳定 SKU code、移动端 DPR 限制、响应式画布、性能指标面板和排障记录。"],
  ["技术栈", "React、TypeScript、Three.js、WebGLRenderer、MeshStandardMaterial、MeshPhysicalMaterial。"],
  ["优化点", "限制 DPR、统一 render loop 状态同步、路由卸载时 dispose geometry/material、减少不必要重建。"],
  ["兼容性", "移动端优先控制 canvas 像素预算，准备 context lost 降级提示和恢复策略。"],
  ["交付物", "线上 demo、GitHub README、移动端截图、录屏、性能指标和一次排障记录。"],
];

const PORTFOLIO_TALKING_POINTS = [
  "我把商品拆成 Body/Lens/Button 三个可配置部件，UI 状态映射到 Three.js 材质参数，并生成稳定 SKU。",
  "移动端没有直接使用 devicePixelRatio，而是做了 DPR cap 和像素预算面板，避免高 DPR 设备发热和显存压力。",
  "resize 时同步 renderer.setSize、camera.aspect 和 updateProjectionMatrix，保证模型不被拉伸。",
  "我补了 context lost、draw call、FPS、triangles 等排障记录，能说明线上白屏、卡顿和降级策略。",
];

const DEPLOY_CHECKLIST = [
  ["Type check", "`npx tsc --noEmit` 通过，确保实验页、JSON 进度和 Three.js 类型没有断裂。"],
  ["Production build", "`npm run build` 通过后再发布，避免只在 dev server 上看起来正常。"],
  ["Route smoke", "访问 `/lab` 和 `/lab/15-minute-webgl-plan`，确认实验室入口和目标页面都返回 200。"],
  ["Mobile budget", "记录 DPR、canvas 像素、FPS、draw call 和 triangles，保留移动端截图。"],
  ["Fallback", "准备 battery DPR、context lost 提示和降级说明，线上白屏时能快速定位。"],
  ["Rollback", "发布前保留上一个可用版本；WebGL 页面异常时先回滚，再分析模型/资源/兼容问题。"],
];

const FINAL_ARTIFACTS = [
  "2 个以上可讲 demo：配置器、数据点位、InstancedMesh 性能样例。",
  "README：功能、技术栈、交互说明、优化点、兼容和排障记录。",
  "性能记录：FPS、DPR、draw call、triangles、像素预算、实例数量。",
  "真机材料：移动端截图、录屏、加载表现、降级策略。",
  "面试表达：为什么选 Three.js、模型过大怎么优化、白屏/卡顿/context lost 怎么排查。",
];

function getConfiguratorSku(bodyIndex: number, lensIndex: number, buttonIndex: number) {
  const body = CONFIG_BODY_COLORS[bodyIndex % CONFIG_BODY_COLORS.length];
  const lens = CONFIG_LENS_PRESETS[lensIndex % CONFIG_LENS_PRESETS.length];
  const button = CONFIG_BUTTON_PRESETS[buttonIndex % CONFIG_BUTTON_PRESETS.length];
  return {
    body,
    lens,
    button,
    code: `CAM-${body.name.toUpperCase()}-${lens.name.toUpperCase()}-${button.name.toUpperCase()}`,
  };
}

function getDataVizDataset(index: number) {
  return DATAVIZ_DATASETS[index % DATAVIZ_DATASETS.length];
}

function createDataVizGeometry(datasetIndex: number) {
  const dataset = getDataVizDataset(datasetIndex);
  const positions = new Float32Array(dataset.count * 3);
  const colors = new Float32Array(dataset.count * 3);
  for (let i = 0; i < dataset.count; i += 1) {
    const t = i / Math.max(1, dataset.count - 1);
    const angle = i * 0.31 + Math.sin(i * 0.07) * 0.45;
    const radius = dataset.radius + Math.sin(i * 0.13) * 0.28 + (i % 29) * 0.006;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = Math.sin(i * 0.11) * dataset.vertical + Math.cos(t * Math.PI * 4) * 0.18;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    colors[i * 3] = dataset.colorA[0] * (1 - t) + dataset.colorB[0] * t;
    colors[i * 3 + 1] = dataset.colorA[1] * (1 - t) + dataset.colorB[1] * t;
    colors[i * 3 + 2] = dataset.colorA[2] * (1 - t) + dataset.colorB[2] * t;
  }
  return { dataset, positions, colors, bytes: positions.byteLength + colors.byteLength };
}

function createDataVizPath(datasetIndex: number) {
  const dataset = getDataVizDataset(datasetIndex);
  return Array.from({ length: 110 }, (_, i) => {
    const t = i / 109;
    const angle = t * Math.PI * 7.5;
    const radius = dataset.radius * (0.68 + t * 0.42);
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      Math.sin(angle * 0.55) * dataset.vertical * 0.72,
      Math.sin(angle) * radius,
    );
  });
}

function getInstancePreset(index: number) {
  return INSTANCE_PRESETS[index % INSTANCE_PRESETS.length];
}

const DEMO_LABELS: Record<DemoKey, string> = {
  "webgl-triangle": "原生 WebGL 渐变三角形",
  "webgl-rotation": "WebGL uniform 旋转",
  "shader-wave": "片元着色器波纹",
  "three-scene": "Three.js 场景三件套",
  picking: "Raycaster 点击拾取",
  configurator: "商品配置器雏形",
  "data-points": "WebGL 数据点位",
  performance: "InstancedMesh 性能样例",
};

const PLAN: Slot[] = [
  {
    time: "00:00-00:15",
    stage: "WebGL",
    title: "确认 GPU 画布链路",
    demo: "webgl-triangle",
    goal: "拿到 WebGLRenderingContext，编译 vertex / fragment shader。",
    verify: "画布出现三色渐变三角形，无控制台报错。",
    interview: "WebGL 的最小链路是 shader、program、buffer、attribute、draw call。",
  },
  {
    time: "00:15-00:30",
    stage: "WebGL",
    title: "理解顶点属性",
    demo: "webgl-triangle",
    goal: "读懂交错数组 [x, y, r, g, b] 和 vertexAttribPointer。",
    verify: "修改任意顶点颜色后刷新，三角形颜色插值跟着变化。",
    interview: "attribute 是逐顶点输入，varying 会在光栅化阶段插值到片元。",
  },
  {
    time: "00:30-00:45",
    stage: "Matrix",
    title: "用 uniform 驱动动画",
    demo: "webgl-rotation",
    goal: "把时间传进 shader，用 2x2 旋转矩阵改变顶点位置。",
    verify: "三角形持续旋转，FPS 面板稳定更新。",
    interview: "uniform 是每次 draw call 共用的数据，适合时间、矩阵、材质参数。",
  },
  {
    time: "00:45-01:00",
    stage: "Shader",
    title: "写第一个片元特效",
    demo: "shader-wave",
    goal: "用 gl_FragCoord、sin、距离场做屏幕空间波纹。",
    verify: "画布出现随时间扩散的彩色波纹。",
    interview: "vertex shader 决定几何位置，fragment shader 决定每个像素的最终颜色。",
  },
  {
    time: "01:00-01:15",
    stage: "Three.js",
    title: "Scene / Camera / Renderer",
    demo: "three-scene",
    goal: "把底层管线升级成 three.js 对象模型。",
    verify: "可以拖拽旋转金属物体，滚轮缩放视角。",
    interview: "three.js 没有改变 GPU 管线，只是把常用对象和状态管理封装起来。",
  },
  {
    time: "01:15-01:30",
    stage: "Material",
    title: "材质和光照的业务效果",
    demo: "three-scene",
    goal: "观察金属度、粗糙度、点光源对产品质感的影响。",
    verify: "物体高光随视角变化，暗部不会纯黑。",
    interview: "PBR 材质更接近真实产品展示，但灯光和贴图会直接影响性能成本。",
  },
  {
    time: "01:30-01:45",
    stage: "Interaction",
    title: "点击模型区域",
    demo: "picking",
    goal: "用 Raycaster 从鼠标位置发射射线，命中 Mesh。",
    verify: "点击不同方块，命中对象变亮，面板 note 变化。",
    interview: "3D 点击不是 DOM 点击，而是屏幕坐标反投影后的射线求交。",
  },
  {
    time: "01:45-02:00",
    stage: "Product",
    title: "做配置器最小闭环",
    demo: "configurator",
    goal: "把一个商品拆成主体、镜片、按钮等可替换部件。",
    verify: "点击下方色板，主材质颜色立即改变。",
    interview: "配置器本质是模型分组、材质映射、状态同步和业务 SKU 约束。",
  },
  {
    time: "02:00-02:15",
    stage: "Mobile",
    title: "限制 DPR",
    demo: "configurator",
    goal: "理解为什么移动端不能无脑使用 devicePixelRatio。",
    verify: "Stats 中 DPR 最大为 2，缩放窗口后画面不糊不爆内存。",
    interview: "DPR 会平方级放大像素数量，iPhone 高 DPR 场景尤其要做上限。",
  },
  {
    time: "02:15-02:30",
    stage: "Resize",
    title: "响应式画布",
    demo: "three-scene",
    goal: "resize 时同步 renderer size 和 camera aspect。",
    verify: "改变浏览器宽度，模型不被拉伸。",
    interview: "画布 CSS 尺寸、真实像素尺寸、相机宽高比要一起维护。",
  },
  {
    time: "02:30-02:45",
    stage: "DataViz",
    title: "3D 数据点位",
    demo: "data-points",
    goal: "用 BufferGeometry 承载大量点位，理解数据到 GPU buffer 的映射。",
    verify: "画面出现环形点云和巡航路径。",
    interview: "数据可视化要避免每个点一个 Mesh，优先批量 buffer 或实例化。",
  },
  {
    time: "02:45-03:00",
    stage: "Performance",
    title: "减少 Draw Call",
    demo: "performance",
    goal: "用 InstancedMesh 把数百个物体合成一次绘制。",
    verify: "Stats 显示 draw calls 很低，但画面里有大量小立方体。",
    interview: "CPU 提交 draw call 是瓶颈之一，相同材质和几何适合实例化。",
  },
  {
    time: "03:00-03:15",
    stage: "Debug",
    title: "建立排障记录",
    demo: "performance",
    goal: "记录 FPS、DPR、draw call、triangle count 四个最小指标。",
    verify: "能说出当前 demo 的 FPS 和 draw call 数量。",
    interview: "线上排障先分清加载、CPU、GPU、内存、兼容性，而不是盲目改代码。",
  },
  {
    time: "03:15-03:30",
    stage: "Context",
    title: "处理 context lost",
    demo: "webgl-rotation",
    goal: "知道 WebGL 上下文可能丢失，以及为何要释放资源。",
    verify: "阅读代码中的 cleanup：取消 RAF、dispose、移除监听。",
    interview: "移动端切后台、内存压力、驱动问题都可能触发 context lost，需要降级和恢复策略。",
  },
  {
    time: "03:30-03:45",
    stage: "Portfolio",
    title: "抽取作品集 README",
    demo: "configurator",
    goal: "把配置器写成作品集条目：功能、栈、优化、兼容。",
    verify: "能用 4 句话介绍 demo 的业务价值和技术取舍。",
    interview: "作品不是炫技列表，要讲用户操作、性能约束、上线风险和回滚方案。",
  },
  {
    time: "03:45-04:00",
    stage: "Deploy",
    title: "本地验收到线上发布",
    demo: "three-scene",
    goal: "跑 build，确认页面可静态渲染，准备部署。",
    verify: "`npm run build` 通过，访问 `/lab/15-minute-webgl-plan`。",
    interview: "能交付的 WebGL 项目必须包含加载策略、真机测试、性能记录和部署地址。",
  },
];

const COLORS = [0x00f0ff, 0xff2dd1, 0x7ddf64, 0xffb84d];

function getTriangleRows(paletteIndex: number) {
  const palette = ATTRIBUTE_PALETTES[paletteIndex % ATTRIBUTE_PALETTES.length];
  return TRIANGLE_POSITIONS.map(([x, y], index) => {
    const [r, g, b] = palette.colors[index];
    return { label: `v${index}`, x, y, r, g, b };
  });
}

function createTriangleVertices(paletteIndex: number) {
  return new Float32Array(
    getTriangleRows(paletteIndex).flatMap(({ x, y, r, g, b }) => [x, y, r, g, b]),
  );
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader failed");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "shader compile failed");
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram();
  if (!program) throw new Error("createProgram failed");
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertex);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log || "program link failed");
  }
  return program;
}

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const points = child as THREE.Points;
    const line = child as THREE.Line;
    const geometry = mesh.geometry || points.geometry || line.geometry;
    if (geometry) geometry.dispose();
    const material = mesh.material || points.material || line.material;
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function useLiveDemo(
  demo: DemoKey,
  colorIndex: number,
  hostRef: React.RefObject<HTMLDivElement>,
  animationPausedRef: React.MutableRefObject<boolean>,
  rotationSpeedRef: React.MutableRefObject<number>,
  waveFrequencyRef: React.MutableRefObject<number>,
  waveSpeedRef: React.MutableRefObject<number>,
  waveIntensityRef: React.MutableRefObject<number>,
  materialPresetRef: React.MutableRefObject<number>,
  lightPresetRef: React.MutableRefObject<number>,
  lensPresetRef: React.MutableRefObject<number>,
  buttonPresetRef: React.MutableRefObject<number>,
  dprCapRef: React.MutableRefObject<number>,
  dataPresetIndex: number,
  instancePresetIndex: number,
  contextAction: "running" | "lost" | "restored",
) {
  const [stats, setStats] = useState<DemoStats>({
    fps: 0,
    dpr: 1,
    drawCalls: 0,
    triangles: 0,
    note: "初始化中",
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    host.appendChild(canvas);

    const cleanup =
      demo.startsWith("webgl") || demo === "shader-wave"
        ? runWebGLDemo(
            canvas,
            demo,
            colorIndex,
            animationPausedRef,
            rotationSpeedRef,
            waveFrequencyRef,
            waveSpeedRef,
            waveIntensityRef,
            dprCapRef,
            contextAction,
            setStats,
          )
        : runThreeDemo(
            canvas,
            demo,
            colorIndex,
            materialPresetRef,
            lightPresetRef,
            lensPresetRef,
            buttonPresetRef,
            dprCapRef,
            dataPresetIndex,
            instancePresetIndex,
            setStats,
          );

    return () => {
      cleanup();
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, [colorIndex, contextAction, dataPresetIndex, demo, hostRef, instancePresetIndex]);

  return stats;
}

function runWebGLDemo(
  canvas: HTMLCanvasElement,
  demo: DemoKey,
  colorIndex: number,
  animationPausedRef: React.MutableRefObject<boolean>,
  rotationSpeedRef: React.MutableRefObject<number>,
  waveFrequencyRef: React.MutableRefObject<number>,
  waveSpeedRef: React.MutableRefObject<number>,
  waveIntensityRef: React.MutableRefObject<number>,
  dprCapRef: React.MutableRefObject<number>,
  contextAction: "running" | "lost" | "restored",
  setStats: (stats: DemoStats) => void,
) {
  const gl = canvas.getContext("webgl", {
    antialias: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    setStats({
      fps: 0,
      dpr: 1,
      drawCalls: 0,
      triangles: 0,
      note: "当前浏览器不支持 WebGL",
      nativeDpr: window.devicePixelRatio || 1,
      dprCap: dprCapRef.current,
    });
    return () => {};
  }

  const getDpr = () => Math.min(window.devicePixelRatio || 1, dprCapRef.current);
  const isWave = demo === "shader-wave";
  const vertex = isWave
    ? `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`
    : `
attribute vec2 a_position;
attribute vec3 a_color;
uniform float u_angle;
varying vec3 v_color;
void main() {
  float angle = ${demo === "webgl-rotation" ? "u_angle" : "0.0"};
  mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  v_color = a_color;
  gl_Position = vec4(rot * a_position, 0.0, 1.0);
}
`;
  const fragment = isWave
    ? `
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_wave_frequency;
uniform float u_wave_speed;
uniform float u_wave_intensity;
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float dist = length(uv);
  float wave = 0.5 + 0.5 * sin(u_wave_frequency * dist - u_time * u_wave_speed);
  vec3 cyan = vec3(0.0, 0.94, 1.0);
  vec3 magenta = vec3(1.0, 0.18, 0.82);
  vec3 deep = vec3(0.02, 0.03, 0.08);
  float mask = wave * smoothstep(1.2, 0.0, dist) * u_wave_intensity;
  vec3 color = mix(deep, mix(cyan, magenta, uv.x * 0.5 + 0.5), mask);
  gl_FragColor = vec4(color, 1.0);
}
`
    : `
precision mediump float;
varying vec3 v_color;
void main() {
  gl_FragColor = vec4(v_color, 1.0);
}
`;

  let program: WebGLProgram;
  try {
    program = createProgram(gl, vertex, fragment);
  } catch (e) {
    setStats({
      fps: 0,
      dpr: getDpr(),
      drawCalls: 0,
      triangles: 0,
      note: e instanceof Error ? e.message : String(e),
      nativeDpr: window.devicePixelRatio || 1,
      dprCap: dprCapRef.current,
    });
    return () => {};
  }

  const vertices = isWave
    ? new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
    : createTriangleVertices(colorIndex);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.useProgram(program);

  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  if (isWave) {
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
  } else {
    const stride = 5 * Float32Array.BYTES_PER_ELEMENT;
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, stride, 0);
    const color = gl.getAttribLocation(program, "a_color");
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color, 3, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
  }

  const timeLoc = gl.getUniformLocation(program, "u_time");
  const angleLoc = gl.getUniformLocation(program, "u_angle");
  const resLoc = gl.getUniformLocation(program, "u_resolution");
  const waveFrequencyLoc = gl.getUniformLocation(program, "u_wave_frequency");
  const waveSpeedLoc = gl.getUniformLocation(program, "u_wave_speed");
  const waveIntensityLoc = gl.getUniformLocation(program, "u_wave_intensity");

  let raf = 0;
  let last = performance.now();
  let previous = last;
  let frames = 0;
  let fps = 0;
  let angle = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = getDpr();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    return {
      dpr,
      cssWidth: Math.round(rect.width),
      cssHeight: Math.round(rect.height),
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      pixelBudget: canvas.width * canvas.height,
      aspect: rect.width / Math.max(1, rect.height),
    };
  };
  const render = (now: number) => {
    const delta = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    frames += 1;
    if (now - last >= 500) {
      fps = Math.round((frames * 1000) / (now - last));
      frames = 0;
      last = now;
    }

    const size = resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (demo === "webgl-rotation" && contextAction === "lost") {
      gl.clearColor(0.12, 0.05, 0.05, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      setStats({
        fps,
        dpr: size.dpr,
        drawCalls: 0,
        triangles: 0,
        nativeDpr: window.devicePixelRatio || 1,
        dprCap: dprCapRef.current,
        cssWidth: size.cssWidth,
        cssHeight: size.cssHeight,
        pixelWidth: size.pixelWidth,
        pixelHeight: size.pixelHeight,
        pixelBudget: size.pixelBudget,
        aspect: size.aspect,
        contextState: "lost",
        note: "模拟 WebGL context lost：暂停 draw call，真实项目此时要展示降级提示并准备重建资源",
      });
      raf = requestAnimationFrame(render);
      return;
    }
    gl.clearColor(0.02, 0.03, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (demo === "webgl-rotation" && !animationPausedRef.current) {
      angle += delta * rotationSpeedRef.current;
    }
    if (timeLoc) gl.uniform1f(timeLoc, now * 0.001);
    if (angleLoc) gl.uniform1f(angleLoc, angle);
    if (resLoc) gl.uniform2f(resLoc, canvas.width, canvas.height);
    if (waveFrequencyLoc) gl.uniform1f(waveFrequencyLoc, waveFrequencyRef.current);
    if (waveSpeedLoc) gl.uniform1f(waveSpeedLoc, waveSpeedRef.current);
    if (waveIntensityLoc) gl.uniform1f(waveIntensityLoc, waveIntensityRef.current);
    gl.drawArrays(isWave ? gl.TRIANGLES : gl.TRIANGLES, 0, isWave ? 6 : 3);
    setStats({
      fps,
      dpr: size.dpr,
      drawCalls: 1,
      triangles: isWave ? 2 : 1,
      nativeDpr: window.devicePixelRatio || 1,
      dprCap: dprCapRef.current,
      cssWidth: size.cssWidth,
      cssHeight: size.cssHeight,
      pixelWidth: size.pixelWidth,
      pixelHeight: size.pixelHeight,
      pixelBudget: size.pixelBudget,
      aspect: size.aspect,
      contextState: contextAction,
      note:
        demo === "shader-wave"
          ? `fragment shader 逐像素波纹：frequency=${waveFrequencyRef.current}，speed=${waveSpeedRef.current}，intensity=${waveIntensityRef.current}`
          : demo === "webgl-rotation"
            ? `${contextAction === "restored" ? "模拟恢复后已重建可绘制状态；" : ""}u_angle=${angle.toFixed(2)} rad，speed=${rotationSpeedRef.current}x，${animationPausedRef.current ? "已暂停" : "正在累积"}`
          : "交错属性布局已生效：每个顶点 5 个 float，position offset=0，color offset=8 bytes",
    });
    raf = requestAnimationFrame(render);
  };
  raf = requestAnimationFrame(render);

  const onLost = (event: Event) => {
    event.preventDefault();
    setStats({
      fps,
      dpr: getDpr(),
      drawCalls: 0,
      triangles: 0,
      note: "WebGL context lost，真实项目要提示降级或恢复",
      nativeDpr: window.devicePixelRatio || 1,
      dprCap: dprCapRef.current,
      contextState: "lost",
    });
  };
  canvas.addEventListener("webglcontextlost", onLost);

  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("webglcontextlost", onLost);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  };
}

function runThreeDemo(
  canvas: HTMLCanvasElement,
  demo: DemoKey,
  colorIndex: number,
  materialPresetRef: React.MutableRefObject<number>,
  lightPresetRef: React.MutableRefObject<number>,
  lensPresetRef: React.MutableRefObject<number>,
  buttonPresetRef: React.MutableRefObject<number>,
  dprCapRef: React.MutableRefObject<number>,
  dataPresetIndex: number,
  instancePresetIndex: number,
  setStats: (stats: DemoStats) => void,
) {
  const getDpr = () => Math.min(window.devicePixelRatio || 1, dprCapRef.current);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(getDpr());
  renderer.setClearColor(0x05060a);
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05060a, 10, 28);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 2.2, 7);

  scene.add(new THREE.AmbientLight(0x607080, 1.1));
  const key = new THREE.PointLight(0x00f0ff, 55, 30);
  key.position.set(4, 4, 4);
  scene.add(key);
  const rim = new THREE.PointLight(0xff2dd1, 35, 30);
  rim.position.set(-5, 1, -4);
  scene.add(rim);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 14;

  const group = new THREE.Group();
  scene.add(group);

  let note = "拖拽旋转，滚轮缩放";
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const clickable: THREE.Mesh[] = [];
  const selectedColor = new THREE.Color(0xfff3a3);
  let sceneMaterial: THREE.MeshStandardMaterial | null = null;
  let configuratorMaterials:
    | {
        body: THREE.MeshStandardMaterial;
        lens: THREE.MeshPhysicalMaterial;
        button: THREE.MeshStandardMaterial;
      }
    | null = null;
  let dataVizStats: { points: number; bytes: number; source: string } | null = null;
  let instanceStats: { instances: number; bytes: number; preset: string } | null = null;
  let hitMarker: THREE.Mesh | null = null;
  let rayLine: THREE.Line | null = null;

  if (demo === "three-scene") {
    const preset = MATERIAL_PRESETS[materialPresetRef.current];
    sceneMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4f7ff,
      metalness: preset.metalness,
      roughness: preset.roughness,
    });
    const mesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.05, 0.32, 180, 28),
      sceneMaterial,
    );
    group.add(mesh);
    const grid = new THREE.GridHelper(18, 18, 0x00f0ff, 0x24304a);
    grid.position.y = -2;
    group.add(grid);
    const axes = new THREE.AxesHelper(2.2);
    axes.position.set(-2.8, -1.8, 0);
    group.add(axes);
    note = "three.js 场景三件套已运行：Scene + PerspectiveCamera + WebGLRenderer";
  }

  if (demo === "picking") {
    const labels = ["Lens", "Body", "Button", "Port"];
    const positions = [
      [-1.7, 0.7, 0],
      [0, 0.1, 0],
      [1.7, 0.7, 0],
      [0, -1.1, 0],
    ];
    labels.forEach((label, index) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(index === 1 ? 1.4 : 0.9, index === 3 ? 0.45 : 0.9, 0.9),
        new THREE.MeshStandardMaterial({
          color: COLORS[index],
          metalness: 0.45,
          roughness: 0.35,
        }),
      );
      mesh.position.set(positions[index][0], positions[index][1], positions[index][2]);
      mesh.name = label;
      clickable.push(mesh);
      group.add(mesh);
    });
    hitMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff3a3 }),
    );
    hitMarker.visible = false;
    scene.add(hitMarker);

    rayLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xfff3a3, transparent: true, opacity: 0.85 }),
    );
    rayLine.visible = false;
    scene.add(rayLine);
    note = "点击任意部件，Raycaster 会返回命中的 Mesh、NDC 坐标和距离";
  }

  if (demo === "configurator") {
    const sku = getConfiguratorSku(colorIndex, lensPresetRef.current, buttonPresetRef.current);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: sku.body.color,
      metalness: 0.72,
      roughness: 0.2,
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: sku.lens.color,
      metalness: 0,
      roughness: 0.05,
      transmission: 0.25,
      transparent: true,
      opacity: sku.lens.opacity,
    });
    const buttonMaterial = new THREE.MeshStandardMaterial({
      color: sku.button.color,
      metalness: sku.button.metalness,
      roughness: 0.32,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.55, 0.34), bodyMaterial);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.25, 48), glassMaterial);
    const button = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.18),
      buttonMaterial,
    );
    body.position.y = -0.1;
    lens.rotation.x = Math.PI / 2;
    lens.position.set(-0.65, 0, 0.3);
    button.position.set(0.9, 0.86, 0.08);
    group.add(body, lens, button);
    configuratorMaterials = { body: bodyMaterial, lens: glassMaterial, button: buttonMaterial };
    note = `SKU ${sku.code} 已映射到 Body/Lens/Button 材质`;
  }

  if (demo === "data-points") {
    const { dataset, positions, colors, bytes } = createDataVizGeometry(dataPresetIndex);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: 0.04, transparent: true, opacity: 0.92, vertexColors: true }),
    );
    const path = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(createDataVizPath(dataPresetIndex)),
      new THREE.LineBasicMaterial({ color: 0xff2dd1, transparent: true, opacity: 0.8 }),
    );
    group.add(points, path);
    dataVizStats = { points: dataset.count, bytes, source: dataset.source };
    note = `${dataset.source} 已上传 ${dataset.count} 个 ${dataset.metric} 点位，position/color buffer 合计 ${bytes} bytes`;
  }

  if (demo === "performance") {
    const preset = getInstancePreset(instancePresetIndex);
    const geometry = new THREE.BoxGeometry(0.13, 0.13, 0.13);
    const material = new THREE.MeshStandardMaterial({ color: 0x7ddf64, metalness: 0.35, roughness: 0.4 });
    const mesh = new THREE.InstancedMesh(geometry, material, preset.count);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < preset.count; i += 1) {
      const a = i * 0.34;
      const r = preset.spread + (i % (preset.rings * 8)) * 0.032;
      const scale = 0.72 + (i % 9) * 0.045;
      matrix.compose(
        new THREE.Vector3(Math.cos(a) * r, ((i % preset.rings) - preset.rings / 2) * 0.16, Math.sin(a) * r),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(a, a * 0.5, 0)),
        new THREE.Vector3(scale, scale, scale),
      );
      mesh.setMatrixAt(i, matrix);
      color.setHSL((i / preset.count) * 0.42 + 0.28, 0.76, 0.58);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    instanceStats = {
      instances: preset.count,
      bytes: preset.count * 16 * Float32Array.BYTES_PER_ELEMENT,
      preset: preset.name,
    };
    note = `${preset.name} preset：${preset.count} 个立方体共享 geometry/material，只上传 instanceMatrix 约 ${instanceStats.bytes} bytes`;
  }

  const onPointerDown = (event: PointerEvent) => {
    if (demo !== "picking") return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hitResult = raycaster.intersectObjects(clickable)[0];
    const hit = hitResult?.object as THREE.Mesh | undefined;
    clickable.forEach((mesh) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.emissive.setHex(0x000000);
    });
    if (hit) {
      const material = hit.material as THREE.MeshStandardMaterial;
      material.emissive.copy(selectedColor);
      material.emissiveIntensity = 0.35;
      if (hitMarker) {
        hitMarker.position.copy(hitResult.point);
        hitMarker.visible = true;
      }
      if (rayLine) {
        rayLine.geometry.dispose();
        rayLine.geometry = new THREE.BufferGeometry().setFromPoints([
          camera.position.clone(),
          hitResult.point.clone(),
        ]);
        rayLine.visible = true;
      }
      note = `命中部件：${hit.name}；NDC=(${pointer.x.toFixed(2)}, ${pointer.y.toFixed(2)})；distance=${hitResult.distance.toFixed(2)}`;
    } else {
      if (hitMarker) hitMarker.visible = false;
      if (rayLine) rayLine.visible = false;
      note = `未命中；NDC=(${pointer.x.toFixed(2)}, ${pointer.y.toFixed(2)})`;
    }
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);

  let raf = 0;
  let last = performance.now();
  let frames = 0;
  let fps = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = getDpr();
    const pixelWidth = Math.max(1, Math.floor(width * dpr));
    const pixelHeight = Math.max(1, Math.floor(height * dpr));
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return {
      dpr,
      cssWidth: width,
      cssHeight: height,
      pixelWidth,
      pixelHeight,
      pixelBudget: pixelWidth * pixelHeight,
      aspect: width / height,
    };
  };

  const render = (now: number) => {
    frames += 1;
    if (now - last >= 500) {
      fps = Math.round((frames * 1000) / (now - last));
      frames = 0;
      last = now;
    }

    const size = resize();
    group.rotation.y += demo === "picking" ? 0.002 : 0.006;
    if (demo === "configurator") group.rotation.x = Math.sin(now * 0.001) * 0.08;
    controls.update();
    if (sceneMaterial) {
      const materialPreset = MATERIAL_PRESETS[materialPresetRef.current];
      const lightPreset = LIGHT_PRESETS[lightPresetRef.current];
      sceneMaterial.metalness = materialPreset.metalness;
      sceneMaterial.roughness = materialPreset.roughness;
      key.intensity = lightPreset.key;
      rim.intensity = lightPreset.rim;
      const ambient = scene.children.find((child) => child instanceof THREE.AmbientLight) as
        | THREE.AmbientLight
        | undefined;
      if (ambient) ambient.intensity = lightPreset.ambient;
      note = `PBR 材质：${materialPreset.name} metalness=${materialPreset.metalness} roughness=${materialPreset.roughness}；light=${lightPreset.name}`;
    }
    if (configuratorMaterials) {
      const sku = getConfiguratorSku(colorIndex, lensPresetRef.current, buttonPresetRef.current);
      configuratorMaterials.body.color.setHex(sku.body.color);
      configuratorMaterials.lens.color.setHex(sku.lens.color);
      configuratorMaterials.lens.opacity = sku.lens.opacity;
      configuratorMaterials.button.color.setHex(sku.button.color);
      configuratorMaterials.button.metalness = sku.button.metalness;
      note = `SKU ${sku.code}；Body=${sku.body.name}，Lens=${sku.lens.name}，Button=${sku.button.name}`;
    }
    renderer.info.reset();
    renderer.render(scene, camera);
    setStats({
      fps,
      dpr: size.dpr,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      nativeDpr: window.devicePixelRatio || 1,
      dprCap: dprCapRef.current,
      cssWidth: size.cssWidth,
      cssHeight: size.cssHeight,
      pixelWidth: size.pixelWidth,
      pixelHeight: size.pixelHeight,
      pixelBudget: size.pixelBudget,
      aspect: size.aspect,
      points: dataVizStats?.points,
      dataBytes: dataVizStats?.bytes,
      dataSource: dataVizStats?.source,
      instances: instanceStats?.instances,
      instanceBytes: instanceStats?.bytes,
      instancePreset: instanceStats?.preset,
      note,
    });
    raf = requestAnimationFrame(render);
  };
  raf = requestAnimationFrame(render);

  return () => {
    cancelAnimationFrame(raf);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    controls.dispose();
    disposeObject3D(scene);
    renderer.dispose();
  };
}

export default function FifteenMinuteWebGLPlan() {
  const initialSlot = Math.min(Math.max(progress.currentSlot - 1, 0), PLAN.length - 1);
  const [selected, setSelected] = useState(initialSlot);
  const [colorIndex, setColorIndex] = useState(0);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [rotationSpeed, setRotationSpeed] = useState(1);
  const [uniformPreviewAngle, setUniformPreviewAngle] = useState(0);
  const [waveFrequency, setWaveFrequency] = useState(18);
  const [waveSpeed, setWaveSpeed] = useState(4);
  const [waveIntensity, setWaveIntensity] = useState(0.75);
  const [materialPreset, setMaterialPreset] = useState(1);
  const [lightPreset, setLightPreset] = useState(1);
  const [lensPreset, setLensPreset] = useState(0);
  const [buttonPreset, setButtonPreset] = useState(0);
  const [dprCap, setDprCap] = useState(2);
  const [resizePreset, setResizePreset] = useState(1);
  const [dataPreset, setDataPreset] = useState(0);
  const [instancePreset, setInstancePreset] = useState(1);
  const [contextAction, setContextAction] = useState<"running" | "lost" | "restored">("running");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const animationPausedRef = useRef(rotationPaused);
  const rotationSpeedRef = useRef(rotationSpeed);
  const waveFrequencyRef = useRef(waveFrequency);
  const waveSpeedRef = useRef(waveSpeed);
  const waveIntensityRef = useRef(waveIntensity);
  const materialPresetRef = useRef(materialPreset);
  const lightPresetRef = useRef(lightPreset);
  const lensPresetRef = useRef(lensPreset);
  const buttonPresetRef = useRef(buttonPreset);
  const dprCapRef = useRef(dprCap);
  animationPausedRef.current = rotationPaused;
  rotationSpeedRef.current = rotationSpeed;
  waveFrequencyRef.current = waveFrequency;
  waveSpeedRef.current = waveSpeed;
  waveIntensityRef.current = waveIntensity;
  materialPresetRef.current = materialPreset;
  lightPresetRef.current = lightPreset;
  lensPresetRef.current = lensPreset;
  buttonPresetRef.current = buttonPreset;
  dprCapRef.current = dprCap;
  const current = PLAN[selected];
  const progressSlot = PLAN[initialSlot];
  const latestHistory = progress.history?.[progress.history.length - 1];
  const configuratorSku = getConfiguratorSku(colorIndex, lensPreset, buttonPreset);
  const resizeViewport = RESIZE_VIEWPORTS[resizePreset];
  const dataSet = getDataVizDataset(dataPreset);
  const instanceSet = getInstancePreset(instancePreset);
  const stats = useLiveDemo(
    current.demo,
    colorIndex,
    hostRef,
    animationPausedRef,
    rotationSpeedRef,
    waveFrequencyRef,
    waveSpeedRef,
    waveIntensityRef,
    materialPresetRef,
    lightPresetRef,
    lensPresetRef,
    buttonPresetRef,
    dprCapRef,
    dataPreset,
    instancePreset,
    contextAction,
  );
  const debugSample = {
    fps: stats.fps,
    dpr: stats.dpr,
    drawCalls: stats.drawCalls,
    triangles: stats.triangles,
    pixelBudget: stats.pixelBudget ?? 0,
    instances: stats.instances ?? instanceSet.count,
    instanceBytes: stats.instanceBytes ?? 0,
  };
  const debugRisk =
    debugSample.fps > 0 && debugSample.fps < 30
      ? "需要降级"
      : debugSample.dpr > 2 || debugSample.pixelBudget > 2_000_000 || debugSample.instances > 900
        ? "观察风险"
        : "当前健康";
  const uniformMatrix = {
    cos: Math.cos(uniformPreviewAngle),
    sin: Math.sin(uniformPreviewAngle),
  };

  useEffect(() => {
    if (current.demo !== "webgl-rotation") return;
    const id = window.setInterval(() => {
      if (!animationPausedRef.current) {
        setUniformPreviewAngle((angle) => angle + 0.25 * rotationSpeedRef.current);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [current.demo]);

  const grouped = useMemo(
    () =>
      PLAN.reduce<Record<string, number>>((acc, item) => {
        acc[item.stage] = (acc[item.stage] || 0) + 1;
        return acc;
      }, {}),
    [],
  );

  return (
    <>
      <SEO
        title="15 分钟 WebGL 学习计划"
        path="/lab/15-minute-webgl-plan"
        description="把 WebGL 和 Three.js 学习拆成每 15 分钟可验证的实战 demo。"
      />

      <article className="space-y-8 animate-fade-up">
        <nav className="text-xs text-gray-500 dark:text-cyan-300/70 cyber-num uppercase tracking-[0.25em]">
          <Link href="/lab" className="hover:text-cyan-600 dark:hover:text-cyan-200 transition-colors">
            ← Lab
          </Link>
        </nav>

        <header className="min-w-0 space-y-4">
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-cyan-300/80 uppercase tracking-[0.25em] cyber-num">
            <span className="w-6 h-px bg-gray-400 dark:bg-cyan-400/70 dark:shadow-[0_0_6px_rgba(0,240,255,0.7)]" />
            4 hours · 16 demos
          </div>
          <div className="space-y-3">
            <h1 className="font-serif text-2xl md:text-5xl font-bold tracking-tight leading-tight text-gray-900 dark:text-gray-50 [overflow-wrap:anywhere]">
              每 15 分钟跑通一个 WebGL 能力点
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base leading-relaxed max-w-2xl">
              这是第一天的高密度训练计划：从原生 WebGL 三角形开始，逐步过渡到 Three.js、点击拾取、商品配置器、
              数据点位和 InstancedMesh。每一格都有可验证 demo，学完立刻能写进作品集记录。
            </p>
          </div>
        </header>

        <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/80 p-4 dark:border-emerald-300/25 dark:bg-emerald-400/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                automation · {progress.automationId} · every {progress.cadenceMinutes} min
              </div>
              <h2 className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                自动推进中：第 {progress.currentSlot} / {PLAN.length} 格 · {progressSlot.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                {progress.lastSummary}
              </p>
            </div>
            <div className="shrink-0 rounded-md border border-emerald-300/60 bg-white/70 px-3 py-2 text-left dark:border-emerald-300/20 dark:bg-black/20 sm:text-right">
              <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-emerald-300/80">
                completed
              </div>
              <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {progress.completedSlots}/{PLAN.length}
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-emerald-300/50 pt-3 dark:border-emerald-300/15">
            <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-emerald-300/80">
              next action · updated {progress.lastUpdatedAt}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {progress.nextAction}
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {Object.entries(grouped).map(([stage, count]) => (
            <div
              key={stage}
              className="rounded-lg border border-gray-200/70 dark:border-cyan-400/15 bg-white/70 dark:bg-black/25 p-3"
            >
              <div className="cyber-num text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                {stage}
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{count} slots</div>
            </div>
          ))}
        </section>

        <section className="grid min-w-0 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="min-w-0 space-y-3">
            {PLAN.map((item, index) => {
              const active = index === selected;
              const done = index < progress.completedSlots;
              const currentSlot = index === progress.currentSlot - 1;
              return (
                <button
                  key={`${item.time}-${item.title}`}
                  type="button"
                  aria-label={`slot ${index + 1} ${item.stage} ${item.title} ${
                    done ? "done" : currentSlot ? "now" : "todo"
                  }`}
                  onClick={() => setSelected(index)}
                  className={`w-full text-left rounded-lg border p-4 transition-colors ${
                    active
                      ? "border-cyan-500/70 bg-cyan-50/80 text-gray-950 dark:border-cyan-300/70 dark:bg-cyan-400/10 dark:text-cyan-50"
                      : done
                        ? "border-emerald-300/70 bg-emerald-50/70 text-gray-800 hover:border-emerald-400 dark:border-emerald-300/25 dark:bg-emerald-400/10 dark:text-gray-200"
                      : "border-gray-200/70 bg-white/70 text-gray-700 hover:border-gray-300 dark:border-cyan-400/15 dark:bg-black/20 dark:text-gray-300 dark:hover:border-cyan-300/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                        {item.time} · {item.stage}
                      </div>
                      <div className="mt-1 font-semibold text-sm md:text-base">{item.title}</div>
                    </div>
                    <span className="cyber-num shrink-0 text-[10px] uppercase tracking-[0.16em] text-gray-400 dark:text-fuchsia-300/80">
                      {done ? "done" : currentSlot ? "now" : String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs md:text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    {item.goal}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="min-w-0 lg:sticky lg:top-24 self-start space-y-4">
            <section className="rounded-lg border border-gray-200/70 dark:border-cyan-400/20 bg-white/80 dark:bg-black/30 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-gray-200/70 dark:border-cyan-400/15 px-4 py-3">
                <div className="min-w-0">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Live demo
                  </div>
                  <h2 className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {DEMO_LABELS[current.demo]}
                  </h2>
                </div>
                <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                  running
                </div>
              </div>

              <div
                ref={hostRef}
                className="mx-auto h-[310px] max-w-full bg-[#05060a] transition-[width] duration-300 sm:h-[390px]"
                style={{
                  width: current.stage === "Resize" ? `${resizeViewport.width}px` : "100%",
                }}
              />

              {current.demo === "webgl-triangle" ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-gray-200/70 px-4 py-3 dark:border-cyan-400/15">
                  <span className="cyber-num text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                    palette
                  </span>
                  {ATTRIBUTE_PALETTES.map((palette, index) => (
                    <button
                      key={palette.name}
                      type="button"
                      onClick={() => setColorIndex(index)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 transition-colors ${
                        colorIndex % ATTRIBUTE_PALETTES.length === index
                          ? "border-cyan-500/70 bg-cyan-50 text-cyan-700 dark:border-cyan-300/70 dark:bg-cyan-400/10 dark:text-cyan-200"
                          : "border-gray-300/70 text-gray-500 hover:border-cyan-400/60 dark:border-cyan-400/20 dark:text-cyan-300/70"
                      }`}
                    >
                      {palette.colors.map(([r, g, b], colorDotIndex) => (
                        <span
                          key={`${palette.name}-${colorDotIndex}`}
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(
                              b * 255,
                            )})`,
                          }}
                        />
                      ))}
                      <span className="text-xs">{palette.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {current.demo === "webgl-rotation" ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-gray-200/70 px-4 py-3 dark:border-cyan-400/15">
                  <button
                    type="button"
                    onClick={() => setRotationPaused((value) => !value)}
                    className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                      rotationPaused
                        ? "border-amber-400/70 bg-amber-50 text-amber-700 dark:border-amber-300/70 dark:bg-amber-400/10 dark:text-amber-200"
                        : "border-emerald-400/70 bg-emerald-50 text-emerald-700 dark:border-emerald-300/70 dark:bg-emerald-400/10 dark:text-emerald-200"
                    }`}
                  >
                    {rotationPaused ? "继续" : "暂停"}
                  </button>
                  <span className="cyber-num text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                    speed
                  </span>
                  {ROTATION_SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => setRotationSpeed(speed)}
                      className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                        rotationSpeed === speed
                          ? "border-cyan-500/70 bg-cyan-50 text-cyan-700 dark:border-cyan-300/70 dark:bg-cyan-400/10 dark:text-cyan-200"
                          : "border-gray-300/70 text-gray-500 hover:border-cyan-400/60 dark:border-cyan-400/20 dark:text-cyan-300/70"
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                  {current.stage === "Context" ? (
                    <div className="flex w-full flex-wrap items-center gap-2 border-t border-gray-200/70 pt-3 dark:border-cyan-400/15">
                      <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                        context
                      </span>
                      {CONTEXT_ACTIONS.map((action) => (
                        <button
                          key={action}
                          type="button"
                          aria-label={`context ${action}`}
                          onClick={() => setContextAction(action)}
                          className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                            contextAction === action
                              ? "border-amber-500/70 bg-amber-50 text-amber-700 dark:border-amber-300/70 dark:bg-amber-400/10 dark:text-amber-200"
                              : "border-gray-300/70 text-gray-500 hover:border-amber-400/60 dark:border-amber-400/20 dark:text-amber-300/70"
                          }`}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {current.demo === "shader-wave" ? (
                <div className="space-y-3 border-t border-gray-200/70 px-4 py-3 dark:border-cyan-400/15">
                  {[
                    ["frequency", WAVE_FREQUENCIES, waveFrequency, setWaveFrequency],
                    ["speed", WAVE_SPEEDS, waveSpeed, setWaveSpeed],
                    ["intensity", WAVE_INTENSITIES, waveIntensity, setWaveIntensity],
                  ].map(([label, values, currentValue, setter]) => (
                    <div key={label as string} className="flex flex-wrap items-center gap-2">
                      <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                        {label as string}
                      </span>
                      {(values as number[]).map((value) => (
                        <button
                          key={`${label}-${value}`}
                          type="button"
                          aria-label={`wave ${label as string} ${value}`}
                          onClick={() => (setter as (next: number) => void)(value)}
                          className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                            currentValue === value
                              ? "border-cyan-500/70 bg-cyan-50 text-cyan-700 dark:border-cyan-300/70 dark:bg-cyan-400/10 dark:text-cyan-200"
                              : "border-gray-300/70 text-gray-500 hover:border-cyan-400/60 dark:border-cyan-400/20 dark:text-cyan-300/70"
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}

              {current.demo === "three-scene" ? (
                <div className="space-y-3 border-t border-gray-200/70 px-4 py-3 dark:border-cyan-400/15">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                      material
                    </span>
                    {MATERIAL_PRESETS.map((preset, index) => (
                      <button
                        key={preset.name}
                        type="button"
                        aria-label={`material ${preset.name}`}
                        onClick={() => setMaterialPreset(index)}
                        className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                          materialPreset === index
                            ? "border-cyan-500/70 bg-cyan-50 text-cyan-700 dark:border-cyan-300/70 dark:bg-cyan-400/10 dark:text-cyan-200"
                            : "border-gray-300/70 text-gray-500 hover:border-cyan-400/60 dark:border-cyan-400/20 dark:text-cyan-300/70"
                        }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                      light
                    </span>
                    {LIGHT_PRESETS.map((preset, index) => (
                      <button
                        key={preset.name}
                        type="button"
                        aria-label={`light ${preset.name}`}
                        onClick={() => setLightPreset(index)}
                        className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                          lightPreset === index
                            ? "border-fuchsia-500/70 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-300/70 dark:bg-fuchsia-400/10 dark:text-fuchsia-200"
                            : "border-gray-300/70 text-gray-500 hover:border-fuchsia-400/60 dark:border-fuchsia-400/20 dark:text-fuchsia-300/70"
                        }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  {current.stage === "Resize" ? (
                    <div className="space-y-2 border-t border-gray-200/70 pt-3 dark:border-cyan-400/15">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                          viewport
                        </span>
                        {RESIZE_VIEWPORTS.map((preset, index) => (
                          <button
                            key={preset.name}
                            type="button"
                            aria-label={`resize viewport ${preset.name}`}
                            onClick={() => setResizePreset(index)}
                            className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                              resizePreset === index
                                ? "border-emerald-500/70 bg-emerald-50 text-emerald-700 dark:border-emerald-300/70 dark:bg-emerald-400/10 dark:text-emerald-200"
                                : "border-gray-300/70 text-gray-500 hover:border-emerald-400/60 dark:border-emerald-400/20 dark:text-emerald-300/70"
                            }`}
                          >
                            {preset.name} · {preset.width}px
                          </button>
                        ))}
                      </div>
                      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        当前验证：{resizeViewport.intent}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {current.demo === "configurator" ? (
                <div className="space-y-3 border-t border-gray-200/70 px-4 py-3 dark:border-cyan-400/15">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                      body
                    </span>
                    {CONFIG_BODY_COLORS.map((item, index) => (
                      <button
                        key={item.name}
                        type="button"
                        aria-label={`config body ${item.name}`}
                        onClick={() => setColorIndex(index)}
                        className={`h-7 w-7 rounded-md border transition-transform ${
                          colorIndex === index
                            ? "scale-110 border-gray-900 dark:border-white"
                            : "border-gray-300 dark:border-cyan-400/20"
                        }`}
                        style={{ backgroundColor: `#${item.color.toString(16).padStart(6, "0")}` }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                      lens
                    </span>
                    {CONFIG_LENS_PRESETS.map((item, index) => (
                      <button
                        key={item.name}
                        type="button"
                        aria-label={`config lens ${item.name}`}
                        onClick={() => setLensPreset(index)}
                        className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                          lensPreset === index
                            ? "border-cyan-500/70 bg-cyan-50 text-cyan-700 dark:border-cyan-300/70 dark:bg-cyan-400/10 dark:text-cyan-200"
                            : "border-gray-300/70 text-gray-500 hover:border-cyan-400/60 dark:border-cyan-400/20 dark:text-cyan-300/70"
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                      button
                    </span>
                    {CONFIG_BUTTON_PRESETS.map((item, index) => (
                      <button
                        key={item.name}
                        type="button"
                        aria-label={`config button ${item.name}`}
                        onClick={() => setButtonPreset(index)}
                        className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                          buttonPreset === index
                            ? "border-fuchsia-500/70 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-300/70 dark:bg-fuchsia-400/10 dark:text-fuchsia-200"
                            : "border-gray-300/70 text-gray-500 hover:border-fuchsia-400/60 dark:border-fuchsia-400/20 dark:text-fuchsia-300/70"
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {current.demo === "data-points" ? (
                <div className="space-y-3 border-t border-gray-200/70 px-4 py-3 dark:border-cyan-400/15">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                      dataset
                    </span>
                    {DATAVIZ_DATASETS.map((dataset, index) => (
                      <button
                        key={dataset.name}
                        type="button"
                        aria-label={`dataviz dataset ${dataset.name}`}
                        onClick={() => setDataPreset(index)}
                        className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                          dataPreset === index
                            ? "border-cyan-500/70 bg-cyan-50 text-cyan-700 dark:border-cyan-300/70 dark:bg-cyan-400/10 dark:text-cyan-200"
                            : "border-gray-300/70 text-gray-500 hover:border-cyan-400/60 dark:border-cyan-400/20 dark:text-cyan-300/70"
                        }`}
                      >
                        {dataset.name} · {dataset.count}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    数据源：{dataSet.source} · 指标：{dataSet.metric}
                  </p>
                </div>
              ) : null}

              {current.demo === "performance" ? (
                <div className="space-y-3 border-t border-gray-200/70 px-4 py-3 dark:border-cyan-400/15">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                      instances
                    </span>
                    {INSTANCE_PRESETS.map((preset, index) => (
                      <button
                        key={preset.name}
                        type="button"
                        aria-label={`instance preset ${preset.name}`}
                        onClick={() => setInstancePreset(index)}
                        className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                          instancePreset === index
                            ? "border-emerald-500/70 bg-emerald-50 text-emerald-700 dark:border-emerald-300/70 dark:bg-emerald-400/10 dark:text-emerald-200"
                            : "border-gray-300/70 text-gray-500 hover:border-emerald-400/60 dark:border-emerald-400/20 dark:text-emerald-300/70"
                        }`}
                      >
                        {preset.name} · {preset.count}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    当前压力：{instanceSet.intent}
                  </p>
                </div>
              ) : null}

              {current.stage === "Mobile" ? (
                <div className="space-y-3 border-t border-gray-200/70 px-4 py-3 dark:border-cyan-400/15">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                      dpr cap
                    </span>
                    {DPR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        aria-label={`dpr cap ${preset.name}`}
                        onClick={() => setDprCap(preset.cap)}
                        className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                          dprCap === preset.cap
                            ? "border-emerald-500/70 bg-emerald-50 text-emerald-700 dark:border-emerald-300/70 dark:bg-emerald-400/10 dark:text-emerald-200"
                            : "border-gray-300/70 text-gray-500 hover:border-emerald-400/60 dark:border-emerald-400/20 dark:text-emerald-300/70"
                        }`}
                      >
                        {preset.name} · {preset.cap}x
                      </button>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    当前策略：{DPR_PRESETS.find((preset) => preset.cap === dprCap)?.intent}
                  </p>
                </div>
              ) : null}
            </section>

            <section className="grid grid-cols-2 gap-2">
              {[
                ["FPS", stats.fps],
                ["DPR", stats.dpr],
                ["Draw Calls", stats.drawCalls],
                ["Triangles", stats.triangles],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-gray-200/70 dark:border-cyan-400/15 bg-white/70 dark:bg-black/25 p-3"
                >
                  <div className="cyber-num text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                    {label}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{value}</div>
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-gray-200/70 dark:border-cyan-400/15 bg-white/70 dark:bg-black/25 p-4 space-y-3">
              <div>
                <div className="cyber-num text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                  当前验证
                </div>
                <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{current.verify}</p>
              </div>
              <div>
                <div className="cyber-num text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                  面试表达
                </div>
                <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{current.interview}</p>
              </div>
              <div className="border-t border-gray-200/70 pt-3 dark:border-cyan-400/15">
                <div className="cyber-num text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                  runtime note
                </div>
                <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{stats.note}</p>
              </div>
            </section>

            {current.stage === "Mobile" ? (
              <>
                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    DPR pixel budget
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["native", `${(stats.nativeDpr ?? 1).toFixed(2)}x`],
                      ["cap", `${(stats.dprCap ?? dprCap).toFixed(2)}x`],
                      ["css", `${stats.cssWidth ?? 0} × ${stats.cssHeight ?? 0}`],
                      ["canvas", `${stats.pixelWidth ?? 0} × ${stats.pixelHeight ?? 0}`],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-cyan-300/70">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    当前真实像素预算约{" "}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {(stats.pixelBudget ?? 0).toLocaleString()}
                    </span>{" "}
                    pixels。DPR 从 1 提到 2 时，同样 CSS 尺寸下像素数量约变成 4 倍，GPU fill-rate、显存和发热都会一起上升。
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Mobile DPR check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {DPR_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {current.stage === "Resize" ? (
              <>
                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Responsive canvas metrics
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["preset", `${resizeViewport.name} ${resizeViewport.width}px`],
                      ["css", `${stats.cssWidth ?? 0} × ${stats.cssHeight ?? 0}`],
                      ["canvas", `${stats.pixelWidth ?? 0} × ${stats.pixelHeight ?? 0}`],
                      ["aspect", (stats.aspect ?? 1).toFixed(3)],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-cyan-300/70">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    第 10 格用同一个 Three.js 场景模拟容器宽度变化。render loop 每帧读取 canvas CSS box，
                    然后同步 <span className="font-semibold text-gray-900 dark:text-gray-100">renderer.setSize</span>、
                    <span className="font-semibold text-gray-900 dark:text-gray-100"> camera.aspect</span> 和
                    <span className="font-semibold text-gray-900 dark:text-gray-100"> updateProjectionMatrix</span>。
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Resize check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {RESIZE_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {current.demo === "data-points" ? (
              <>
                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Data buffer mapping
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["source", stats.dataSource ?? dataSet.source],
                      ["points", stats.points ?? dataSet.count],
                      ["attributes", "position + color"],
                      ["bytes", `${(stats.dataBytes ?? 0).toLocaleString()} B`],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-cyan-300/70">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    这个 demo 把模拟 JSON 数据转成两个连续的{" "}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Float32Array</span>：
                    position 负责空间坐标，color 负责每个点的业务状态。切换数据源会重建 BufferGeometry，但仍保持一次批量绘制。
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    DataViz check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {DATAVIZ_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {current.demo === "performance" ? (
              <>
                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Instance performance
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["preset", stats.instancePreset ?? instanceSet.name],
                      ["instances", stats.instances ?? instanceSet.count],
                      ["matrix bytes", `${(stats.instanceBytes ?? 0).toLocaleString()} B`],
                      ["draw calls", stats.drawCalls],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-cyan-300/70">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    InstancedMesh 的关键不是“物体少”，而是共享{" "}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">geometry/material</span>，
                    只为每个实例上传 <span className="font-semibold text-gray-900 dark:text-gray-100">instanceMatrix</span>。
                    这能显著减少 CPU 侧 draw call 提交，但实例越多，GPU 顶点和片元工作仍会上升。
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Instancing check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {INSTANCE_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {current.stage === "Debug" ? (
              <>
                <section className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-300/25 dark:bg-amber-400/10">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                    WebGL incident record
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["risk", debugRisk],
                      ["fps", debugSample.fps],
                      ["dpr", debugSample.dpr],
                      ["draw calls", debugSample.drawCalls],
                      ["triangles", debugSample.triangles],
                      ["instances", debugSample.instances],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-amber-300/60 bg-white/70 p-3 dark:border-amber-300/20 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-amber-300/80">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    排障记录不要只写“卡”。要把现象和指标放在一起：设备、路由、FPS、DPR、draw call、
                    triangles、像素预算、实例数量，再写第一步降级动作和回滚条件。
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Debug metric checklist
                  </div>
                  <div className="mt-3 grid gap-2">
                    {DEBUG_METRICS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            step {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Common incident actions
                  </div>
                  <div className="mt-3 grid gap-2">
                    {DEBUG_ACTIONS.map(([label, body]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                          <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {current.demo === "webgl-triangle" ? (
              <>
                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Attribute memory layout
                  </div>
                  <div className="mt-3 max-w-full overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                      <thead className="text-gray-400 dark:text-cyan-300/70">
                        <tr>
                          <th className="border-b border-gray-200/70 py-2 pr-3 font-medium dark:border-cyan-400/15">
                            vertex
                          </th>
                          <th className="border-b border-gray-200/70 py-2 pr-3 font-medium dark:border-cyan-400/15">
                            x
                          </th>
                          <th className="border-b border-gray-200/70 py-2 pr-3 font-medium dark:border-cyan-400/15">
                            y
                          </th>
                          <th className="border-b border-gray-200/70 py-2 pr-3 font-medium dark:border-cyan-400/15">
                            r
                          </th>
                          <th className="border-b border-gray-200/70 py-2 pr-3 font-medium dark:border-cyan-400/15">
                            g
                          </th>
                          <th className="border-b border-gray-200/70 py-2 pr-3 font-medium dark:border-cyan-400/15">
                            b
                          </th>
                        </tr>
                      </thead>
                      <tbody className="cyber-num text-gray-700 dark:text-gray-200">
                        {getTriangleRows(colorIndex).map((row) => (
                          <tr key={row.label}>
                            <td className="border-b border-gray-200/60 py-2 pr-3 dark:border-cyan-400/10">
                              {row.label}
                            </td>
                            {[row.x, row.y, row.r, row.g, row.b].map((value, index) => (
                              <td
                                key={`${row.label}-${index}`}
                                className="border-b border-gray-200/60 py-2 pr-3 dark:border-cyan-400/10"
                              >
                                {value.toFixed(2)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {ATTRIBUTE_LAYOUT.map(([name, type, size, offset]) => (
                      <div
                        key={name}
                        className="flex flex-col gap-1 rounded-md border border-gray-200/70 bg-white/70 p-3 text-sm dark:border-cyan-400/10 dark:bg-black/20 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {type} · {size} · {offset}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    GPU pipeline check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {PIPELINE_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {current.demo === "webgl-rotation" ? (
              <>
                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Uniform rotation matrix
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 cyber-num text-sm">
                    {[
                      uniformMatrix.cos,
                      -uniformMatrix.sin,
                      uniformMatrix.sin,
                      uniformMatrix.cos,
                    ].map((value, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 text-center text-gray-800 dark:border-cyan-400/10 dark:bg-black/20 dark:text-gray-100"
                      >
                        {value.toFixed(3)}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    顶点着色器每帧读取 <span className="font-semibold text-gray-900 dark:text-gray-100">u_angle</span>，
                    再用 2x2 矩阵旋转 <span className="font-semibold text-gray-900 dark:text-gray-100">a_position</span>。
                    颜色仍来自上一轮的 varying 插值。
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Uniform animation check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {UNIFORM_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {current.stage === "Context" ? (
              <>
                <section className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-300/25 dark:bg-amber-400/10">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                    Context lifecycle state
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["state", stats.contextState ?? contextAction],
                      ["draw calls", stats.drawCalls],
                      ["dpr", stats.dpr],
                      ["pixel budget", (stats.pixelBudget ?? 0).toLocaleString()],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-amber-300/60 bg-white/70 p-3 dark:border-amber-300/20 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-amber-300/80">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    点击 lost 会模拟上下文丢失：停止 draw call 并显示降级状态；点击 restored 代表重建 shader、
                    program、buffer、texture 后恢复渲染。真实线上要把这两步接到错误边界和资源重建流程里。
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Context lost check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {CONTEXT_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            step {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {current.demo === "shader-wave" ? (
              <>
                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Fragment shader controls
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      ["frequency", waveFrequency],
                      ["speed", waveSpeed],
                      ["intensity", waveIntensity],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-cyan-300/70">
                          {label}
                        </div>
                        <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    这个 demo 用两个三角形铺满屏幕，fragment shader 对每个像素计算
                    <span className="font-semibold text-gray-900 dark:text-gray-100"> gl_FragCoord</span>、
                    <span className="font-semibold text-gray-900 dark:text-gray-100"> distance</span> 和
                    <span className="font-semibold text-gray-900 dark:text-gray-100"> sin wave</span>。
                    UI 只改变 uniform，不重建 shader。
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Fragment shader check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {SHADER_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {current.demo === "three-scene" ? (
              <>
                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    PBR material lab
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["preset", MATERIAL_PRESETS[materialPreset].name],
                      ["metalness", MATERIAL_PRESETS[materialPreset].metalness],
                      ["roughness", MATERIAL_PRESETS[materialPreset].roughness],
                      ["light", LIGHT_PRESETS[lightPreset].name],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-cyan-300/70">
                          {label}
                        </div>
                        <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    同一个 <span className="font-semibold text-gray-900 dark:text-gray-100">TorusKnotGeometry</span>{" "}
                    不变，只调整 <span className="font-semibold text-gray-900 dark:text-gray-100">MeshStandardMaterial</span>{" "}
                    和灯光强度，观察高光形状、暗部细节和产品质感的变化。
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Material and lighting check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {MATERIAL_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Three.js scene graph
                  </div>
                  <div className="mt-3 grid gap-2">
                    {THREE_SCENE_OBJECTS.map(([label, body]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                          <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Camera and renderer contract
                  </div>
                  <div className="mt-3 grid gap-2">
                    {THREE_CAMERA_ROWS.map(([label, value, body]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                          <span className="cyber-num text-xs text-cyan-700 dark:text-cyan-200">{value}</span>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{body}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Three.js scene check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {THREE_SCENE_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {current.stage === "Deploy" ? (
                  <>
                    <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                        Deploy readiness checklist
                      </div>
                      <div className="mt-3 grid gap-2">
                        {DEPLOY_CHECKLIST.map(([label, body], index) => (
                          <div
                            key={label}
                            className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
                          >
                            <div className="flex items-start gap-3">
                              <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                                gate {String(index + 1).padStart(2, "0")}
                              </span>
                              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                                <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                        Final portfolio package
                      </div>
                      <div className="mt-3 grid gap-2">
                        {FINAL_ARTIFACTS.map((body, index) => (
                          <div
                            key={body}
                            className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                          >
                            <div className="flex items-start gap-3">
                              <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                                item {String(index + 1).padStart(2, "0")}
                              </span>
                              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{body}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                        这 16 格训练已经覆盖从 shader、uniform、Three.js 场景、Raycaster、配置器、DPR、resize、
                        BufferGeometry、InstancedMesh 到 context lost 和上线排障的交付闭环。
                      </p>
                    </section>
                  </>
                ) : null}
              </>
            ) : null}

            {current.demo === "picking" ? (
              <>
                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Raycaster targets
                  </div>
                  <div className="mt-3 grid gap-2">
                    {PICKING_TARGETS.map(([label, body]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                          <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    点击画布中的任意部件，命中对象会发光；场景会显示
                    <span className="font-semibold text-gray-900 dark:text-gray-100"> hit marker</span> 和
                    <span className="font-semibold text-gray-900 dark:text-gray-100"> ray line</span>。
                    这是 3D 商品热点、部件说明和空间选点的最小闭环。
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Raycaster interaction check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {RAYCASTER_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {current.demo === "configurator" ? (
              <>
                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    SKU state
                  </div>
                  <div className="mt-3 rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20">
                    <div className="cyber-num text-xs uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-200">
                      {configuratorSku.code}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                      Body={configuratorSku.body.name} · Lens={configuratorSku.lens.name} ·
                      Button={configuratorSku.button.name}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      ["body", configuratorSku.body.name],
                      ["lens", configuratorSku.lens.name],
                      ["button", configuratorSku.button.name],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-cyan-300/70">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Configurator check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {CONFIGURATOR_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            pass {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                            <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {current.stage === "Portfolio" ? (
                  <>
                    <section className="rounded-lg border border-fuchsia-300/60 bg-fuchsia-50/70 p-4 dark:border-fuchsia-300/25 dark:bg-fuchsia-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-fuchsia-700 dark:text-fuchsia-300">
                        Portfolio README draft
                      </div>
                      <div className="mt-3 grid gap-2">
                        {PORTFOLIO_README.map(([label, body]) => (
                          <div
                            key={label}
                            className="rounded-md border border-fuchsia-300/50 bg-white/70 p-3 dark:border-fuchsia-300/20 dark:bg-black/20"
                          >
                            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                              <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                        Interview script
                      </div>
                      <div className="mt-3 grid gap-2">
                        {PORTFOLIO_TALKING_POINTS.map((body, index) => (
                          <div
                            key={body}
                            className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                          >
                            <div className="flex items-start gap-3">
                              <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                                talk {String(index + 1).padStart(2, "0")}
                              </span>
                              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{body}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                        当前可演示 SKU：
                        <span className="font-semibold text-gray-900 dark:text-gray-100"> {configuratorSku.code}</span>。
                        面试时先展示配置交互，再讲 DPR、resize、dispose 和 context lost，最后补上线排障记录。
                      </p>
                    </section>
                  </>
                ) : null}
              </>
            ) : null}

            {latestHistory ? (
              <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
                <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                  latest lab record
                </div>
                <h3 className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  第 {latestHistory.slot} 格 · {latestHistory.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  {latestHistory.deliverable}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  验证：{latestHistory.verification}
                </p>
              </section>
            ) : null}
          </div>
        </section>
      </article>
    </>
  );
}
