import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import SEO from "@/components/SEO";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import progress from "../../../data/webgl-learning-progress.json";

type DemoKey =
  | "webgl-triangle"
  | "webgl-rotation"
  | "shader-wave"
  | "three-scene"
  | "picking"
  | "configurator"
  | "data-points"
  | "performance"
  | "model-loader";

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
  modelNodes?: number;
  modelMeshes?: number;
  modelBytes?: number;
  modelProgress?: number;
  modelBudgetName?: string;
  modelTargetBytes?: number;
  modelOriginalBytes?: number;
  modelOptimizedBytes?: number;
  modelTextureBytes?: number;
  modelUrl?: string;
  modelSourceMode?: string;
  modelStatus?: "loading" | "ready" | "fallback";
  modelError?: string;
  hitTarget?: string;
  hitDistance?: number;
  hitNdcX?: number;
  hitNdcY?: number;
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

const CONFIGURATOR_DATA_SOURCE = {
  version: "camera-config-v1",
  productId: "nocturne-camera",
  skuPrefix: "CAM",
  skuOrder: ["body", "lens", "button"],
  parts: {
    body: {
      label: "Body",
      mesh: "body",
      material: "MeshStandardMaterial.color",
      constraint: "主体色只能从品牌色板选择，避免不可生产配色。",
      options: [
        { name: "cyan", color: 0x00f0ff },
        { name: "magenta", color: 0xff2dd1 },
        { name: "lime", color: 0x7ddf64 },
        { name: "amber", color: 0xffb84d },
      ],
    },
    lens: {
      label: "Lens",
      mesh: "lens",
      material: "MeshPhysicalMaterial.color + opacity",
      constraint: "镜片 tint 控制透明度，不开放任意 opacity 输入。",
      options: [
        { name: "clear", color: 0xb8f7ff, opacity: 0.52 },
        { name: "smoke", color: 0x91a2b8, opacity: 0.68 },
        { name: "rose", color: 0xffb6df, opacity: 0.58 },
      ],
    },
    button: {
      label: "Button",
      mesh: "button",
      material: "MeshStandardMaterial.color + metalness",
      constraint: "按钮 finish 映射金属度，保持商品质感稳定。",
      options: [
        { name: "graphite", color: 0x111827, metalness: 0.5 },
        { name: "chrome", color: 0xd8e4ef, metalness: 0.86 },
        { name: "accent", color: 0xfff3a3, metalness: 0.42 },
      ],
    },
  },
} as const;

const CONFIG_BODY_COLORS = CONFIGURATOR_DATA_SOURCE.parts.body.options;
const CONFIG_LENS_PRESETS = CONFIGURATOR_DATA_SOURCE.parts.lens.options;
const CONFIG_BUTTON_PRESETS = CONFIGURATOR_DATA_SOURCE.parts.button.options;

const CONFIGURATOR_PART_BINDINGS = [
  ["body", CONFIGURATOR_DATA_SOURCE.parts.body.mesh, CONFIGURATOR_DATA_SOURCE.parts.body.material, CONFIGURATOR_DATA_SOURCE.parts.body.constraint],
  ["lens", CONFIGURATOR_DATA_SOURCE.parts.lens.mesh, CONFIGURATOR_DATA_SOURCE.parts.lens.material, CONFIGURATOR_DATA_SOURCE.parts.lens.constraint],
  ["button", CONFIGURATOR_DATA_SOURCE.parts.button.mesh, CONFIGURATOR_DATA_SOURCE.parts.button.material, CONFIGURATOR_DATA_SOURCE.parts.button.constraint],
];

const CONFIGURATOR_SCHEMA_CHECKS = [
  ["Single source", "UI 按钮、材质更新和 SKU code 都读取 CONFIGURATOR_DATA_SOURCE。"],
  ["Part contract", "每个 part 都声明 label、mesh、material、constraint 和 options。"],
  ["SKU rule", "skuPrefix + skuOrder 决定 code 生成顺序，避免 UI 顺序变化影响 SKU。"],
  ["Material values", "颜色、opacity、metalness 都在 option 中声明，render loop 只消费结构化数据。"],
];

const PICKING_HOTSPOT_CONTRACTS = [
  {
    label: "Lens",
    part: "lens",
    business: "镜片热点打开 tint 说明，告诉用户 clear/smoke/rose 会改变透明度和视觉情绪。",
    constraint: CONFIGURATOR_DATA_SOURCE.parts.lens.constraint,
    skuImpact: "影响 SKU 第二段 Lens code，也影响透明材质 opacity。",
    nextUi: "打开 Lens 说明浮层，聚焦 tint 选项。",
  },
  {
    label: "Body",
    part: "body",
    business: "主体热点解释品牌主色和大面积材质，是配置器最重要的视觉决策。",
    constraint: CONFIGURATOR_DATA_SOURCE.parts.body.constraint,
    skuImpact: "影响 SKU 第一段 Body code，也决定商品首屏主视觉。",
    nextUi: "打开 Body 色板，提示当前主体色是否可生产。",
  },
  {
    label: "Button",
    part: "button",
    business: "按钮热点说明 finish 差异，适合展示 graphite/chrome/accent 的细节质感。",
    constraint: CONFIGURATOR_DATA_SOURCE.parts.button.constraint,
    skuImpact: "影响 SKU 第三段 Button code，也影响 metalness 高光表现。",
    nextUi: "打开 Button finish 面板，说明金属度映射。",
  },
  {
    label: "Port",
    part: "support",
    business: "接口热点不进入 SKU，只做规格说明、售后提示或兼容性解释。",
    constraint: "非可配置部件只展示说明，不写入 CONFIGURATOR_DATA_SOURCE 的 SKU 顺序。",
    skuImpact: "不影响 SKU，用于区分 explain-only hotspot 和 configurable hotspot。",
    nextUi: "打开规格说明浮层，不改变材质状态。",
  },
];

const PICKING_HOTSPOT_CHECKS = [
  ["Hit to business", "Raycaster 命中 Mesh 后要映射到业务 part，而不是只显示 Mesh.name。"],
  ["Configurable vs explain-only", "Body/Lens/Button 会影响 SKU；Port 只说明规格，不进入 SKU。"],
  ["Feedback latency", "点击后高亮、marker、ray line 和说明面板必须同帧更新。"],
  ["Miss reset", "点空白要清空命中状态，避免用户误以为仍选中上一部件。"],
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

const MOBILE_DEGRADE_PRESETS = [
  {
    name: "quality",
    dprCap: 2,
    instanceIndex: 1,
    intent: "高端设备展示效果，保留较清晰 canvas 和 dense 实例规模。",
  },
  {
    name: "balanced",
    dprCap: 1.5,
    instanceIndex: 1,
    intent: "移动端默认策略，限制像素预算但保留主要 3D 信息量。",
  },
  {
    name: "battery",
    dprCap: 1,
    instanceIndex: 0,
    intent: "发热、掉帧或低端机策略，优先稳定帧率和触控响应。",
  },
  {
    name: "fallback",
    dprCap: 1,
    instanceIndex: 0,
    intent: "持续低 FPS 或 context lost 时切 2D poster/静态图，暂停非必要动画。",
  },
];

const MOBILE_DEGRADE_TRIGGERS = [
  ["FPS < 30", "进入 battery，先降 DPR，再减少实例、关闭阴影/后处理。"],
  ["Pixel budget > 2M", "DPR 会平方级放大像素，优先把 cap 降到 1 或 1.5。"],
  ["Instances > 900", "InstancedMesh 低 draw call 但 GPU 顶点/片元仍会增加，需要回到 baseline。"],
  ["Draw calls > 60", "检查材质和 Mesh 是否失去合批，避免每个物体独立提交。"],
  ["Context lost", "立即展示 fallback，停止 render loop，恢复后重建 GPU 资源。"],
];

const MOBILE_DEGRADE_ACTIONS = [
  ["quality", "DPR 2 + dense，用于桌面或高端机展示效果，不作为移动端保底。"],
  ["balanced", "DPR 1.5 + dense，是默认移动端起点，兼顾清晰度和性能。"],
  ["battery", "DPR 1 + baseline，用于低电量、发热、掉帧和低端机。"],
  ["fallback", "DPR 1 + baseline + poster/静态图，用于持续低 FPS、GLB 失败或 context lost。"],
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

const CONFIGURATOR_PRODUCT_BRIEF = [
  ["Product", "Nocturne Camera · Modular 3D product configurator"],
  ["Audience", "移动端优先的官网/电商访客，目标是在 30 秒内看懂外观差异并生成 SKU。"],
  ["Primary action", "选择 Body / Lens / Button 三个部件，实时预览材质并得到稳定 SKU code。"],
  ["Business value", "减少静态渲染图数量，把颜色和材质组合交给 WebGL 实时展示。"],
];

const CONFIGURATOR_USER_FLOW = [
  ["Inspect", "进入页面先看到可旋转 3D 商品，而不是说明文字。"],
  ["Configure", "切换主体色、镜片 tint、按钮 finish，SKU 和材质同步变化。"],
  ["Validate", "查看移动端 DPR、draw call 和 triangles，确认当前组合可上线。"],
  ["Package", "沉淀线上 demo、README、录屏、移动端截图和排障记录。"],
];

const CONFIGURATOR_DELIVERY_PACKAGE = [
  ["Demo URL", "部署后的 `/lab/15-minute-webgl-plan` 或独立作品页地址。"],
  ["Repository", "README 写清功能、技术栈、配置数据、优化点和 fallback。"],
  ["Recording", "30 秒录屏：旋转商品、切换三处部件、展示 SKU 和移动预算。"],
  ["QA evidence", "`npx tsc --noEmit`、路由 200、移动端无横向溢出、canvas 非空白。"],
];

const CONFIGURATOR_ACCEPTANCE_GATES = [
  ["SKU visible", "任何配置组合都能生成稳定 code，方便业务下单或埋点。"],
  ["3D visible", "WebGL canvas 非空白；失败时要切到 poster fallback。"],
  ["Mobile budget", "DPR 有上限，像素预算和 draw call 可解释。"],
  ["State contract", "UI 选项、材质参数、SKU 文案来自同一份结构，避免状态漂移。"],
];

const CONFIGURATOR_QA_GATES = [
  {
    label: "Route smoke",
    status: "manual",
    evidence: "`/lab`、`/lab/15-minute-webgl-plan` 和 `/api/lab/product-marker-glb` 都要返回 200。",
    failure: "路由失败先确认 Next dev/build 输出、API handler、静态导出路径和回滚版本。",
  },
  {
    label: "Canvas health",
    status: "runtime",
    evidence: "页面运行时必须有 canvas、draw call 大于 0，截图里 3D 商品不能空白。",
    failure: "空白先看 WebGL context、模型/材质可见性、renderer loop、context lost 和控制台错误。",
  },
  {
    label: "Mobile viewport",
    status: "runtime",
    evidence: "390px 宽度下无横向溢出，DPR cap、canvas 像素和交互控件仍可读。",
    failure: "移动端溢出优先检查固定宽度、pre/code 换行、按钮网格和 canvas 容器 max-width。",
  },
  {
    label: "SKU contract",
    status: "runtime",
    evidence: "当前 SKU 必须由 CONFIGURATOR_DATA_SOURCE 的 body/lens/button 顺序生成。",
    failure: "SKU 错乱时检查 UI 顺序、skuOrder、选项索引和材质映射是否仍同源。",
  },
  {
    label: "Fallback path",
    status: "manual",
    evidence: "GLB 加载失败、低端机和 context lost 要有 poster、Retry、battery DPR 或回滚动作。",
    failure: "线上白屏时先切 fallback 或回滚，再复盘资源 URL、解码器、缓存和设备指标。",
  },
];

const CONFIGURATOR_QA_SCRIPT = [
  ["Select", "进入第 24 格，确认配置器 demo 自动运行并能旋转/拖拽。"],
  ["Configure", "切换 Body、Lens、Button，确认 SKU、材质和 Mobile delivery budget 同步变化。"],
  ["Measure", "记录 FPS、DPR、draw calls、triangles、canvas pixel budget。"],
  ["Mobile", "切到 390px 宽度，确认无横向溢出、canvas 非空白、按钮不挤压。"],
  ["Fallback", "切到 model-loader 的 Broken GLB URL，确认 poster fallback 和 Retry 入口。"],
  ["Ship", "把截图、录屏、route 200、tsc 结果和排障记录写进 README。"],
];

const CONFIGURATOR_RELEASE_RESPONSES = [
  ["FPS < 30", "先降 DPR 到 battery，再减少透明材质、阴影/后处理、实例数量和贴图尺寸。"],
  ["Draw calls high", "检查是否重复创建 Mesh/Material，优先合批、InstancedMesh 或合并 BufferGeometry。"],
  ["GLB slow", "记录模型/贴图体积，接 Draco/Meshopt/KTX2，decoder 懒加载，首屏用 poster。"],
  ["Mobile overflow", "收紧固定宽度、pre 换行、网格列数和 canvas 容器 max-width。"],
  ["White screen", "看 route、资源 URL、WebGL context、loader error、context lost，再回滚可用版本。"],
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

const MODEL_LOADER_CHECKS = [
  ["Loader", "使用 GLTFLoader 解析 glTF JSON + binary buffer，模拟真实模型加载链路。"],
  ["Scene graph", "加载后遍历 gltf.scene，统计 node 和 mesh 数量，理解模型层级。"],
  ["Material", "为 MeshStandardMaterial 配置灯光和环境，让模型不是只靠纯色贴图。"],
  ["Fallback", "加载失败时给出错误 note，真实项目要展示占位模型或 2D 降级图。"],
  ["Cleanup", "路由切换时 traverse dispose，释放 geometry/material，避免重复加载泄漏。"],
];

const MODEL_BUDGETS = [
  ["Raw buffer", "432 B", "本实验内嵌 position + normal 两个 accessor，方便马上验证加载链路。"],
  ["Online target", "< 2 MB", "移动端首屏产品模型建议先压到可流畅加载的量级。"],
  ["Compression", "Draco / Meshopt", "真实 GLB 进入下一步再接压缩 decoder 和加载进度。"],
  ["Texture", "KTX2 / Basis", "大多数线上 WebGL 卡顿来自贴图体积和像素预算，而不只是模型顶点。"],
];

const MODEL_ASSET_PRESETS = [
  {
    name: "raw handoff",
    label: "Raw",
    originalBytes: 7_800_000,
    geometryBytes: 3_100_000,
    textureBytes: 4_200_000,
    optimizedBytes: 7_800_000,
    targetBytes: 2_000_000,
    compression: "None",
    route: "真实 `.glb` 交付前的原始导出，适合本地验收，不适合移动端首屏。",
  },
  {
    name: "mobile optimized",
    label: "Mobile",
    originalBytes: 7_800_000,
    geometryBytes: 680_000,
    textureBytes: 1_080_000,
    optimizedBytes: 1_760_000,
    targetBytes: 2_000_000,
    compression: "Meshopt + KTX2",
    route: "线上首屏模型预算：几何压缩、贴图转码、按需加载 decoder。",
  },
  {
    name: "poster fallback",
    label: "Fallback",
    originalBytes: 7_800_000,
    geometryBytes: 0,
    textureBytes: 180_000,
    optimizedBytes: 180_000,
    targetBytes: 350_000,
    compression: "2D poster",
    route: "低端设备或 context lost 时先展示 2D 占位图，再懒加载 3D。",
  },
];

const MODEL_DELIVERY_CHECKS = [
  ["Progress", "真实 URL 加载必须展示进度，避免 3D 首屏白等。"],
  ["Budget", "记录原始体积、优化后体积、目标预算，和产品确认首屏取舍。"],
  ["Decoder", "Draco/Meshopt/KTX2 decoder 要懒加载，避免为了压缩反而拖慢首屏 JS。"],
  ["Fallback", "移动端低性能、加载失败或 context lost 时，用 poster/2D 图兜底。"],
];

const MODEL_COMPRESSION_PIPELINE = [
  {
    step: "Geometry",
    tool: "Meshopt / Draco",
    input: "3.10 MB",
    output: "680 KB",
    rule: "规则：几何压缩只处理顶点、索引、法线等 buffer，不解决贴图大和 fill-rate。",
  },
  {
    step: "Texture",
    tool: "KTX2 / Basis",
    input: "4.20 MB",
    output: "1.08 MB",
    rule: "规则：贴图转码优先影响下载体积、显存和采样成本，移动端收益通常最大。",
  },
  {
    step: "Decoder",
    tool: "Lazy decoder",
    input: "JS bundle",
    output: "on demand",
    rule: "规则：Draco/Meshopt/KTX2 decoder 按需加载，避免压缩收益被首屏 JS 抵消。",
  },
  {
    step: "Fallback",
    tool: "Poster",
    input: "3D unavailable",
    output: "180 KB",
    rule: "规则：低端设备、加载失败、context lost 时先给用户可见产品，不让 WebGL 区域空白。",
  },
];

const MODEL_CACHE_VERSION_RULES = [
  ["Hashed URL", "`/models/camera.mobile.meshopt.ktx2.v18.glb`，资源变更即换 hash 或版本号。"],
  ["Immutable cache", "带 hash 的 GLB/KTX2 可长缓存；HTML/manifest 保持短缓存方便回滚。"],
  ["Decoder path", "decoder 路径版本固定，CDN 404 时要能 fallback 到未压缩或 poster。"],
  ["Rollback", "保留上一个 mobile optimized GLB，线上异常先回滚版本，再看设备和错误日志。"],
];

const MODEL_SHIPPING_DECISIONS = [
  ["raw handoff", "只允许内网验收或美术对齐，不进入移动端首屏。"],
  ["mobile optimized", "默认线上交付：Meshopt + KTX2 + 懒加载 decoder，控制在 2 MB 内。"],
  ["poster fallback", "低端设备、prefers-reduced-motion、context lost 或 GLB 失败时展示。"],
];

const MODEL_SOURCE_MODES = [
  {
    id: "api-glb",
    label: "Real GLB API",
    url: "/api/lab/product-marker-glb",
    expectedBytes: 1_224,
    contract: "走真实 HTTP URL，响应 model/gltf-binary，GLTFLoader 解析 GLB header + BIN chunk。",
  },
  {
    id: "blob-gltf",
    label: "Blob glTF",
    url: "blob://embedded-product-marker",
    expectedBytes: 432,
    contract: "前端创建 Blob URL，适合离线验证 loader 和 scene graph，不代表线上资源链路。",
  },
  {
    id: "broken-glb",
    label: "Broken GLB URL",
    url: "/api/lab/missing-product.glb",
    expectedBytes: 0,
    contract: "故意请求不存在的 GLB，验证错误捕获、poster fallback、重试和白屏排障。",
  },
] as const;

type ModelSourceMode = (typeof MODEL_SOURCE_MODES)[number]["id"];

const MODEL_FALLBACK_CHECKS = [
  ["Detect", "loader error 后立刻进入 fallback 状态，停止等待 3D 空白画布。"],
  ["Poster", "展示轻量 2D poster/占位文案，让用户知道产品内容仍可浏览。"],
  ["Retry", "提供一键重试，恢复到最近可用 GLB URL，而不是让用户刷新整页。"],
  ["Observe", "记录 source、URL、错误信息、DPR 和资源预算，方便线上复盘。"],
];

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createEmbeddedProductGltf() {
  const positions = new Float32Array([
    -1, -0.6, 1, 1, -0.6, 1, 1, -0.6, -1,
    -1, -0.6, 1, 1, -0.6, -1, -1, -0.6, -1,
    0, 0.95, 0, -1, -0.6, 1, 1, -0.6, 1,
    0, 0.95, 0, 1, -0.6, 1, 1, -0.6, -1,
    0, 0.95, 0, 1, -0.6, -1, -1, -0.6, -1,
    0, 0.95, 0, -1, -0.6, -1, -1, -0.6, 1,
  ]);
  const normals = new Float32Array([
    0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, 0.55, 0.83, 0, 0.55, 0.83, 0, 0.55, 0.83,
    0.83, 0.55, 0, 0.83, 0.55, 0, 0.83, 0.55, 0,
    0, 0.55, -0.83, 0, 0.55, -0.83, 0, 0.55, -0.83,
    -0.83, 0.55, 0, -0.83, 0.55, 0, -0.83, 0.55, 0,
  ]);
  const buffer = new ArrayBuffer(positions.byteLength + normals.byteLength);
  new Float32Array(buffer, 0, positions.length).set(positions);
  new Float32Array(buffer, positions.byteLength, normals.length).set(normals);
  return {
    byteLength: buffer.byteLength,
    json: JSON.stringify({
      asset: { version: "2.0", generator: "15-minute-webgl-plan" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: "Loaded Product Marker", mesh: 0, rotation: [0, 0.785, 0] }],
      meshes: [
        {
          name: "EmbeddedProductMesh",
          primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }],
        },
      ],
      materials: [
        {
          name: "Loaded cyan PBR",
          pbrMetallicRoughness: {
            baseColorFactor: [0.0, 0.94, 1.0, 1.0],
            metallicFactor: 0.55,
            roughnessFactor: 0.28,
          },
        },
      ],
      buffers: [
        {
          uri: `data:application/octet-stream;base64,${arrayBufferToBase64(buffer)}`,
          byteLength: buffer.byteLength,
        },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: normals.byteLength, target: 34962 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: positions.length / 3,
          type: "VEC3",
          min: [-1, -0.6, -1],
          max: [1, 0.95, 1],
        },
        { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
      ],
    }),
  };
}

function getModelAssetPreset(index: number) {
  return MODEL_ASSET_PRESETS[index % MODEL_ASSET_PRESETS.length];
}

function getModelSourceMode(mode: ModelSourceMode) {
  return MODEL_SOURCE_MODES.find((item) => item.id === mode) ?? MODEL_SOURCE_MODES[0];
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes.toLocaleString()} B`;
}

function getBudgetStatus(bytes: number, targetBytes: number) {
  return bytes <= targetBytes ? "within budget" : "over budget";
}

function getConfiguratorSku(bodyIndex: number, lensIndex: number, buttonIndex: number) {
  const body = CONFIG_BODY_COLORS[bodyIndex % CONFIG_BODY_COLORS.length];
  const lens = CONFIG_LENS_PRESETS[lensIndex % CONFIG_LENS_PRESETS.length];
  const button = CONFIG_BUTTON_PRESETS[buttonIndex % CONFIG_BUTTON_PRESETS.length];
  const selected = { body, lens, button };
  const suffix = CONFIGURATOR_DATA_SOURCE.skuOrder
    .map((part) => selected[part].name.toUpperCase())
    .join("-");
  return {
    body,
    lens,
    button,
    code: `${CONFIGURATOR_DATA_SOURCE.skuPrefix}-${suffix}`,
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

function getMobileDegradePolicy(stats: DemoStats, instanceCount: number, dprCap: number) {
  const pixelBudget = stats.pixelBudget ?? 0;
  if (stats.contextState === "lost") {
    return {
      level: "fallback",
      trigger: "WebGL context lost",
      recommendedDpr: 1,
      recommendedInstances: INSTANCE_PRESETS[0].count,
      action: "展示 poster fallback，停止 render loop，恢复后重建资源。",
    };
  }
  if (stats.fps > 0 && stats.fps < 30) {
    return {
      level: "battery",
      trigger: `FPS ${stats.fps} < 30`,
      recommendedDpr: 1,
      recommendedInstances: INSTANCE_PRESETS[0].count,
      action: "先降 DPR 到 1，再把实例规模切 baseline，保住触控和滚动响应。",
    };
  }
  if (pixelBudget > 2_000_000 || instanceCount > 900) {
    return {
      level: "battery",
      trigger: pixelBudget > 2_000_000 ? `pixel budget ${pixelBudget.toLocaleString()} > 2M` : `instances ${instanceCount} > 900`,
      recommendedDpr: 1,
      recommendedInstances: INSTANCE_PRESETS[0].count,
      action: "进入 battery：降低像素预算和 GPU 顶点压力，再观察 FPS 是否恢复。",
    };
  }
  if (dprCap > 1.5 || instanceCount > 500) {
    return {
      level: "balanced",
      trigger: "高画质或 dense 实例规模，需要观察移动端发热。",
      recommendedDpr: 1.5,
      recommendedInstances: INSTANCE_PRESETS[1].count,
      action: "默认保持 balanced，真机发热或掉帧时一键切 battery。",
    };
  }
  return {
    level: "quality",
    trigger: "当前指标稳定",
    recommendedDpr: dprCap,
    recommendedInstances: instanceCount,
    action: "可维持当前策略，并记录截图、FPS、DPR、draw calls 和 triangles。",
  };
}

const TELEMETRY_FIELD_GROUPS = [
  {
    group: "device",
    fields: ["userAgent", "viewport", "nativeDpr", "dprCap"],
    why: "定位是否是高 DPR 手机、窄屏设备或特定浏览器触发的问题。",
  },
  {
    group: "render",
    fields: ["fps", "drawCalls", "triangles", "pixelBudget"],
    why: "区分 CPU 提交、GPU 几何压力和 fill-rate 压力。",
  },
  {
    group: "quality",
    fields: ["qualityLevel", "recommendedDpr", "recommendedInstances"],
    why: "记录当前是否触发 balanced/battery/fallback 降级，方便复盘产品取舍。",
  },
  {
    group: "asset",
    fields: ["resourceStatus", "modelSourceMode", "modelProgress", "modelBytes"],
    why: "把渲染卡顿和资源加载失败分开看，避免把 GLB 404 误判成性能问题。",
  },
  {
    group: "interaction",
    fields: ["route", "slot", "demo", "sampleReason"],
    why: "知道用户在哪个页面、哪个实验、什么场景下触发采样。",
  },
];

const TELEMETRY_SAMPLE_EVENTS = [
  ["webgl_render_sample", "每 5-10 秒采样一次 FPS、DPR、draw calls、triangles、pixelBudget。"],
  ["webgl_quality_change", "DPR cap、实例规模或 fallback 状态改变时立刻上报。"],
  ["webgl_context_lost", "监听 webglcontextlost，带上 route、device、lastTelemetry 和恢复状态。"],
  ["webgl_asset_error", "GLB/KTX2/decoder 加载失败时记录 URL、source、progress、error 和 fallback。"],
];

const TELEMETRY_INCIDENT_PLAYBOOK = [
  ["FPS low + draw calls high", "先合批或实例化，检查材质/透明/阴影是否导致 draw call 激增。"],
  ["FPS low + pixel budget high", "优先降 DPR、关闭高分辨率后处理，移动端保触控响应。"],
  ["Triangles high", "检查模型 LOD、Meshopt/Draco、隐藏面和首屏是否加载过多部件。"],
  ["Asset error", "回滚资源版本，切 poster fallback，再检查 CDN、Content-Type、decoder 路径。"],
];

function getTelemetrySeverity(stats: DemoStats, policy: ReturnType<typeof getMobileDegradePolicy>) {
  if (policy.level === "fallback" || stats.contextState === "lost" || stats.modelStatus === "fallback") {
    return "incident";
  }
  if (stats.fps > 0 && stats.fps < 30) return "degrade";
  if ((stats.pixelBudget ?? 0) > 2_000_000 || stats.triangles > 120_000 || policy.level === "battery") {
    return "watch";
  }
  return "healthy";
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
  "model-loader": "GLTFLoader 模型加载",
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
  {
    time: "04:00-04:15",
    stage: "Asset",
    title: "加载 glTF 模型",
    demo: "model-loader",
    goal: "用 GLTFLoader 跑通模型 JSON、buffer、scene graph、mesh/material 的加载链路。",
    verify: "画布出现由 GLTFLoader 加载的 3D 模型，面板展示 node、mesh、buffer bytes。",
    interview: "线上 3D 项目不是只 new Mesh，真实模型要处理 loader、资源路径、进度、失败 fallback 和 dispose。",
  },
  {
    time: "04:15-04:30",
    stage: "Asset",
    title: "建立模型体积预算",
    demo: "model-loader",
    goal: "理解 GLB/贴图体积、压缩和移动端加载预算。",
    verify: "能说出 raw buffer、线上目标体积、Draco/Meshopt/KTX2 的作用。",
    interview: "模型优化要分几何压缩、贴图压缩、懒加载和降级，而不是只让美术减面。",
  },
  {
    time: "04:30-04:45",
    stage: "Asset",
    title: "真实 GLB URL 加载",
    demo: "model-loader",
    goal: "用 GLTFLoader.load 访问真实 URL，验证 HTTP 头、content length、progress 和 GLB 解析。",
    verify: "选择 Real GLB API 后模型加载完成，面板展示 URL、source mode、progress=100%。",
    interview: "真实项目要把模型当成线上资源交付：URL、缓存、进度、失败、版本和回滚都要设计。",
  },
  {
    time: "04:45-05:00",
    stage: "Resilience",
    title: "加载失败 fallback UI",
    demo: "model-loader",
    goal: "补齐模型加载失败时的用户提示、poster 降级和重试入口。",
    verify: "模拟错误 URL 后不白屏，页面展示 fallback 状态和重试建议。",
    interview: "WebGL 线上白屏不应该直接暴露给用户，要有 2D 兜底、重试和可观测日志。",
  },
  {
    time: "05:00-05:15",
    stage: "Product",
    title: "配置器作品页骨架",
    demo: "configurator",
    goal: "把训练 demo 过渡成可展示的 3D 产品配置器作品页结构。",
    verify: "页面能讲清产品名、配置项、SKU、移动端预算和交付材料。",
    interview: "作品页要从用户任务开始讲，而不是从 Three.js API 开始讲。",
  },
  {
    time: "05:15-05:30",
    stage: "Product",
    title: "配置数据源 JSON 化",
    demo: "configurator",
    goal: "把颜色、材质、部件和 SKU 约束整理成可配置数据源。",
    verify: "切换部件时 UI、材质和 SKU 来自同一份结构化配置。",
    interview: "配置器的复杂度在业务状态和模型材质映射，不只是 3D 渲染。",
  },
  {
    time: "05:30-05:45",
    stage: "Interaction",
    title: "配置器部件说明热点",
    demo: "picking",
    goal: "把 Raycaster 命中结果转换成部件说明、配置约束和 SKU 影响。",
    verify: "点击不同 3D 部件时，高亮、命中距离和说明面板同步变化。",
    interview: "商品热点需要把屏幕坐标、3D 命中、业务部件和 UI 状态连接起来。",
  },
  {
    time: "05:45-06:00",
    stage: "QA",
    title: "作品页验收脚本",
    demo: "configurator",
    goal: "沉淀配置器上线前验收清单：路由、画布、移动端、SKU、性能指标。",
    verify: "`tsc` 通过，路由返回 200，桌面和移动端 canvas 非空白且无横向溢出。",
    interview: "我会把 WebGL 作品当线上页面验收：类型、路由、真机、性能和 fallback 都留证据。",
  },
  {
    time: "06:00-06:15",
    stage: "Mobile",
    title: "移动端性能降级开关",
    demo: "performance",
    goal: "把 FPS、DPR、实例数量和像素预算连接成可解释的降级策略。",
    verify: "切换实例规模和 DPR 后，页面能说明何时进入 battery/fallback 策略。",
    interview: "移动端 WebGL 性能优化要有指标触发和产品降级方案，而不是凭感觉关效果。",
  },
  {
    time: "06:15-06:30",
    stage: "Asset",
    title: "压缩资源交付策略",
    demo: "model-loader",
    goal: "把 Draco、Meshopt、KTX2、poster fallback 和缓存版本整理成模型交付策略。",
    verify: "能解释原始 GLB、移动端优化 GLB、poster fallback 各自的体积预算和加载路径。",
    interview: "模型优化要同时管几何、贴图、decoder、缓存和失败兜底，不能只说压缩。",
  },
  {
    time: "06:30-06:45",
    stage: "Observe",
    title: "线上观测指标面板",
    demo: "performance",
    goal: "把 FPS、DPR、draw calls、triangles、资源状态和用户设备整理成线上观测字段。",
    verify: "页面能输出一组可复制到 README/埋点方案里的 WebGL telemetry 字段。",
    interview: "线上 WebGL 不是只看本机流畅，要能记录设备、资源、渲染和降级状态。",
  },
  {
    time: "06:45-07:00",
    stage: "Product",
    title: "首屏加载编排",
    demo: "model-loader",
    goal: "把 poster、progress、decoder、GLB、fallback 和 retry 编排成用户可感知的加载流程。",
    verify: "页面能说明首屏 0-100% 加载阶段、失败兜底和重试路径。",
    interview: "3D 首屏交付要设计等待体验和失败路径，不能只等 GLB 加载完成。",
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
  modelAssetIndex: number,
  modelSourceMode: ModelSourceMode,
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
            modelAssetIndex,
            modelSourceMode,
            setStats,
          );

    return () => {
      cleanup();
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, [colorIndex, contextAction, dataPresetIndex, demo, hostRef, instancePresetIndex, modelAssetIndex, modelSourceMode]);

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
  modelAssetIndex: number,
  modelSourceMode: ModelSourceMode,
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
  let modelStats: { nodes: number; meshes: number; bytes: number } | null = null;
  let modelProgress = 0;
  let modelLoadedBytes = 0;
  let modelTotalBytes = 0;
  let modelStatus: DemoStats["modelStatus"] = "loading";
  let modelError = "";
  let modelObjectUrl: string | null = null;
  const modelBudget = getModelAssetPreset(modelAssetIndex);
  const modelSource = getModelSourceMode(modelSourceMode);
  let hitMarker: THREE.Mesh | null = null;
  let rayLine: THREE.Line | null = null;
  let pickingHit:
    | {
        target: string;
        distance: number;
        ndcX: number;
        ndcY: number;
      }
    | null = null;
  let disposed = false;

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

  if (demo === "model-loader") {
    const loader = new GLTFLoader();
    const asset = createEmbeddedProductGltf();
    const modelUrl =
      modelSource.id === "api-glb"
        ? modelSource.url
        : modelSource.id === "broken-glb"
          ? modelSource.url
          : URL.createObjectURL(new Blob([asset.json], { type: "model/gltf+json" }));
    if (modelSource.id === "blob-gltf") modelObjectUrl = modelUrl;
    note = `GLTFLoader 正在加载 ${modelSource.label}；预算预设=${modelBudget.name}`;
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) {
          disposeObject3D(gltf.scene);
          return;
        }
        let nodes = 0;
        let meshes = 0;
        gltf.scene.traverse((child) => {
          nodes += 1;
          if ((child as THREE.Mesh).isMesh) {
            meshes += 1;
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        gltf.scene.scale.setScalar(1.35);
        gltf.scene.position.y = 0.1;
        group.add(gltf.scene);
        modelStats = { nodes, meshes, bytes: modelTotalBytes || modelLoadedBytes || modelSource.expectedBytes || asset.byteLength };
        modelProgress = 100;
        modelStatus = "ready";
        modelError = "";
        note = `GLTFLoader ${modelSource.label} 加载完成：${nodes} nodes，${meshes} mesh，buffer=${formatBytes(modelStats.bytes)}；${modelBudget.name}=${formatBytes(modelBudget.optimizedBytes)} / target ${formatBytes(modelBudget.targetBytes)}`;
      },
      (event) => {
        modelLoadedBytes = event.loaded;
        modelTotalBytes = event.total || modelTotalBytes;
        if (event.lengthComputable && event.total > 0) {
          modelProgress = Math.round((event.loaded / event.total) * 100);
        } else {
          modelProgress = Math.max(modelProgress, 35);
        }
      },
      (error) => {
        modelStatus = "fallback";
        modelProgress = 100;
        modelError = error instanceof Error ? error.message : String(error);
        const poster = new THREE.Mesh(
          new THREE.PlaneGeometry(3.2, 2),
          new THREE.MeshBasicMaterial({ color: 0x102033, transparent: true, opacity: 0.92 }),
        );
        const frame = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.25, 2.05)),
          new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8 }),
        );
        const marker = new THREE.Mesh(
          new THREE.TorusGeometry(0.48, 0.035, 12, 48),
          new THREE.MeshBasicMaterial({ color: 0xff2dd1 }),
        );
        poster.position.set(0, 0.1, 0);
        frame.position.copy(poster.position);
        marker.position.set(0, 0.1, 0.04);
        group.add(poster, frame, marker);
        modelStats = { nodes: 3, meshes: 2, bytes: modelSource.expectedBytes };
        note = `GLTFLoader ${modelSource.label} 加载失败，已展示 poster fallback；error=${modelError}`;
      },
    );
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
      pickingHit = {
        target: hit.name,
        distance: hitResult.distance,
        ndcX: pointer.x,
        ndcY: pointer.y,
      };
      note = `命中部件：${hit.name}；NDC=(${pointer.x.toFixed(2)}, ${pointer.y.toFixed(2)})；distance=${hitResult.distance.toFixed(2)}`;
    } else {
      if (hitMarker) hitMarker.visible = false;
      if (rayLine) rayLine.visible = false;
      pickingHit = null;
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
      modelNodes: modelStats?.nodes,
      modelMeshes: modelStats?.meshes,
      modelBytes: modelStats?.bytes,
      modelProgress,
      modelBudgetName: modelBudget.name,
      modelTargetBytes: modelBudget.targetBytes,
      modelOriginalBytes: modelBudget.originalBytes,
      modelOptimizedBytes: modelBudget.optimizedBytes,
      modelTextureBytes: modelBudget.textureBytes,
      modelUrl: modelSource.id === "blob-gltf" ? "Blob URL" : modelSource.url,
      modelSourceMode: modelSource.label,
      modelStatus,
      modelError,
      hitTarget: pickingHit?.target,
      hitDistance: pickingHit?.distance,
      hitNdcX: pickingHit?.ndcX,
      hitNdcY: pickingHit?.ndcY,
      note,
    });
    raf = requestAnimationFrame(render);
  };
  raf = requestAnimationFrame(render);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    controls.dispose();
    disposeObject3D(scene);
    renderer.dispose();
    if (modelObjectUrl) URL.revokeObjectURL(modelObjectUrl);
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
  const [modelAssetPreset, setModelAssetPreset] = useState(1);
  const [modelSourceMode, setModelSourceMode] = useState<ModelSourceMode>(
    progress.currentSlot === 20 ? "broken-glb" : "api-glb",
  );
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
  const modelAsset = getModelAssetPreset(modelAssetPreset);
  const modelSource = getModelSourceMode(modelSourceMode);
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
    modelAssetPreset,
    modelSourceMode,
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
  const mobileDegradePolicy = getMobileDegradePolicy(stats, stats.instances ?? instanceSet.count, dprCap);
  const activePickingHotspot = PICKING_HOTSPOT_CONTRACTS.find((item) => item.label === stats.hitTarget);
  const modelCompressionSummary = {
    original: modelAsset.originalBytes,
    optimized: modelAsset.optimizedBytes,
    saved: Math.max(0, modelAsset.originalBytes - modelAsset.optimizedBytes),
    ratio: modelAsset.optimizedBytes / Math.max(1, modelAsset.originalBytes),
    status: getBudgetStatus(modelAsset.optimizedBytes, modelAsset.targetBytes),
    target: modelAsset.targetBytes,
  };
  const qaEvidence = {
    sku: configuratorSku.code,
    fps: stats.fps,
    dpr: stats.dpr,
    dprCap,
    drawCalls: stats.drawCalls,
    triangles: stats.triangles,
    canvas: `${stats.pixelWidth ?? 0} x ${stats.pixelHeight ?? 0}`,
    pixelBudget: stats.pixelBudget ?? 0,
    risk:
      stats.fps > 0 && stats.fps < 30
        ? "降级候选"
        : (stats.pixelBudget ?? 0) > 2_000_000 || stats.drawCalls > 60
          ? "需要观察"
          : "可发布样例",
  };
  const telemetrySeverity = getTelemetrySeverity(stats, mobileDegradePolicy);
  const telemetryPayload = {
    event: "webgl_render_sample",
    route: "/lab/15-minute-webgl-plan",
    slot: selected + 1,
    demo: current.demo,
    sampleReason: current.title,
    severity: telemetrySeverity,
    fps: stats.fps,
    nativeDpr: stats.nativeDpr ?? 1,
    dpr: stats.dpr,
    dprCap,
    drawCalls: stats.drawCalls,
    triangles: stats.triangles,
    instances: stats.instances ?? instanceSet.count,
    pixelBudget: stats.pixelBudget ?? 0,
    canvasCss: `${stats.cssWidth ?? 0}x${stats.cssHeight ?? 0}`,
    canvasPixels: `${stats.pixelWidth ?? 0}x${stats.pixelHeight ?? 0}`,
    qualityLevel: mobileDegradePolicy.level,
    qualityTrigger: mobileDegradePolicy.trigger,
    recommendedDpr: mobileDegradePolicy.recommendedDpr,
    recommendedInstances: mobileDegradePolicy.recommendedInstances,
    resourceStatus: stats.modelStatus ?? "not_applicable",
    modelSourceMode: stats.modelSourceMode ?? "not_applicable",
    modelProgress: stats.modelProgress ?? 0,
    modelBytes: stats.modelBytes ?? 0,
  };
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

  useEffect(() => {
    if (current.stage === "Resilience") {
      setModelSourceMode("broken-glb");
    } else if (current.demo === "model-loader") {
      setModelSourceMode("api-glb");
    }
  }, [current.demo, current.stage]);

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
            phase training · {PLAN.length} labs
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
                  {current.title === "移动端性能降级开关" ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-gray-200/70 pt-3 dark:border-cyan-400/15">
                      <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                        strategy
                      </span>
                      {MOBILE_DEGRADE_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          aria-label={`mobile degrade ${preset.name}`}
                          onClick={() => {
                            setDprCap(preset.dprCap);
                            setInstancePreset(preset.instanceIndex);
                          }}
                          className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                            dprCap === preset.dprCap && instancePreset === preset.instanceIndex
                              ? "border-fuchsia-500/70 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-300/70 dark:bg-fuchsia-400/10 dark:text-fuchsia-200"
                              : "border-gray-300/70 text-gray-500 hover:border-fuchsia-400/60 dark:border-fuchsia-400/20 dark:text-fuchsia-300/70"
                          }`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {current.demo === "model-loader" ? (
                <div className="space-y-3 border-t border-gray-200/70 px-4 py-3 dark:border-cyan-400/15">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                      source
                    </span>
                    {MODEL_SOURCE_MODES.map((source) => (
                      <button
                        key={source.id}
                        type="button"
                        aria-label={`model source ${source.id}`}
                        onClick={() => setModelSourceMode(source.id)}
                        className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                          modelSourceMode === source.id
                            ? "border-fuchsia-500/70 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-300/70 dark:bg-fuchsia-400/10 dark:text-fuchsia-200"
                            : "border-gray-300/70 text-gray-500 hover:border-fuchsia-400/60 dark:border-fuchsia-400/20 dark:text-fuchsia-300/70"
                        }`}
                      >
                        {source.label}
                      </button>
                    ))}
                    {stats.modelStatus === "fallback" ? (
                      <button
                        type="button"
                        aria-label="retry real glb api"
                        onClick={() => setModelSourceMode("api-glb")}
                        className="h-8 rounded-md border border-emerald-500/70 bg-emerald-50 px-3 text-xs text-emerald-700 transition-colors hover:border-emerald-600 dark:border-emerald-300/70 dark:bg-emerald-400/10 dark:text-emerald-200"
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cyber-num w-20 text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-cyan-300/70">
                      asset
                    </span>
                    {MODEL_ASSET_PRESETS.map((preset, index) => (
                      <button
                        key={preset.name}
                        type="button"
                        aria-label={`model asset ${preset.name}`}
                        onClick={() => setModelAssetPreset(index)}
                        className={`h-8 rounded-md border px-3 text-xs transition-colors ${
                          modelAssetPreset === index
                            ? "border-cyan-500/70 bg-cyan-50 text-cyan-700 dark:border-cyan-300/70 dark:bg-cyan-400/10 dark:text-cyan-200"
                            : "border-gray-300/70 text-gray-500 hover:border-cyan-400/60 dark:border-cyan-400/20 dark:text-cyan-300/70"
                        }`}
                      >
                        {preset.label} · {formatBytes(preset.optimizedBytes)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    当前来源：{modelSource.contract} 当前预算：{modelAsset.compression} · {modelAsset.route}
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

                {current.title === "移动端性能降级开关" ? (
                  <>
                    <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                        Mobile degradation switchboard
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {[
                          ["level", mobileDegradePolicy.level],
                          ["trigger", mobileDegradePolicy.trigger],
                          ["recommended dpr", `${mobileDegradePolicy.recommendedDpr}x`],
                          ["recommended instances", mobileDegradePolicy.recommendedInstances],
                          ["current dpr", `${stats.dpr}x / cap ${dprCap}x`],
                          ["current instances", stats.instances ?? instanceSet.count],
                          ["pixel budget", (stats.pixelBudget ?? 0).toLocaleString()],
                          ["triangles", stats.triangles],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
                          >
                            <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-emerald-300/80">
                              {label}
                            </div>
                            <div className="mt-1 text-sm font-semibold leading-relaxed text-gray-900 dark:text-gray-100">
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        {mobileDegradePolicy.action}
                      </p>
                    </section>

                    <section className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-300/25 dark:bg-amber-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                        Trigger ladder
                      </div>
                      <div className="mt-3 grid gap-2">
                        {MOBILE_DEGRADE_TRIGGERS.map(([label, body], index) => (
                          <div
                            key={label}
                            className="rounded-md border border-amber-300/50 bg-white/70 p-3 dark:border-amber-300/20 dark:bg-black/20"
                          >
                            <div className="flex items-start gap-3">
                              <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
                                rule {String(index + 1).padStart(2, "0")}
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

                    <section className="rounded-lg border border-blue-300/60 bg-blue-50/70 p-4 dark:border-blue-300/20 dark:bg-blue-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">
                        Degradation action map
                      </div>
                      <div className="mt-3 grid gap-2">
                        {MOBILE_DEGRADE_ACTIONS.map(([label, body]) => (
                          <div
                            key={label}
                            className="rounded-md border border-blue-300/50 bg-white/70 p-3 dark:border-blue-300/20 dark:bg-black/20"
                          >
                            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                              <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        面试表达：我不会只说“优化性能”，而是用 FPS、DPR、像素预算、实例数和 fallback 状态触发明确降级。
                      </p>
                    </section>
                  </>
                ) : null}

                {current.title === "线上观测指标面板" ? (
                  <>
                    <section className="rounded-lg border border-violet-300/60 bg-violet-50/70 p-4 dark:border-violet-300/20 dark:bg-violet-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-violet-700 dark:text-violet-300">
                        WebGL telemetry payload
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {[
                          ["severity", telemetryPayload.severity],
                          ["fps", telemetryPayload.fps],
                          ["dpr", `${telemetryPayload.dpr}x / cap ${telemetryPayload.dprCap}x`],
                          ["draw calls", telemetryPayload.drawCalls],
                          ["triangles", telemetryPayload.triangles],
                          ["instances", telemetryPayload.instances],
                          ["pixel budget", telemetryPayload.pixelBudget.toLocaleString()],
                          ["quality", telemetryPayload.qualityLevel],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-md border border-violet-300/50 bg-white/70 p-3 dark:border-violet-300/20 dark:bg-black/20"
                          >
                            <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-violet-300/80">
                              {label}
                            </div>
                            <div className="mt-1 text-sm font-semibold leading-relaxed text-gray-900 dark:text-gray-100">
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                      <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-violet-300/50 bg-white/80 p-3 text-xs leading-relaxed text-gray-700 dark:border-violet-300/20 dark:bg-black/30 dark:text-gray-300">
                        {JSON.stringify(telemetryPayload, null, 2)}
                      </pre>
                    </section>

                    <section className="rounded-lg border border-cyan-300/60 bg-cyan-50/70 p-4 dark:border-cyan-300/20 dark:bg-cyan-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">
                        Telemetry field contract
                      </div>
                      <div className="mt-3 grid gap-2">
                        {TELEMETRY_FIELD_GROUPS.map((item) => (
                          <div
                            key={item.group}
                            className="rounded-md border border-cyan-300/50 bg-white/70 p-3 dark:border-cyan-300/20 dark:bg-black/20"
                          >
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{item.group}</span>
                              <span className="cyber-num text-xs text-cyan-700 dark:text-cyan-200">
                                {item.fields.join(" · ")}
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                              {item.why}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                        Sampling events
                      </div>
                      <div className="mt-3 grid gap-2">
                        {TELEMETRY_SAMPLE_EVENTS.map(([label, body], index) => (
                          <div
                            key={label}
                            className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
                          >
                            <div className="flex items-start gap-3">
                              <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                                event {String(index + 1).padStart(2, "0")}
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

                    <section className="rounded-lg border border-rose-300/60 bg-rose-50/70 p-4 dark:border-rose-300/20 dark:bg-rose-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-rose-700 dark:text-rose-300">
                        Incident playbook
                      </div>
                      <div className="mt-3 grid gap-2">
                        {TELEMETRY_INCIDENT_PLAYBOOK.map(([label, body]) => (
                          <div
                            key={label}
                            className="rounded-md border border-rose-300/50 bg-white/70 p-3 dark:border-rose-300/20 dark:bg-black/20"
                          >
                            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                              <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        面试表达：我会把 WebGL 线上问题拆成设备、资源、渲染、质量降级和用户场景五类字段，而不是只看自己的电脑是否流畅。
                      </p>
                    </section>
                  </>
                ) : null}
              </>
            ) : null}

            {current.demo === "model-loader" ? (
              <>
                <section className="rounded-lg border border-cyan-300/60 bg-cyan-50/70 p-4 dark:border-cyan-300/20 dark:bg-cyan-400/10">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">
                    GLTF load result
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["source", stats.modelSourceMode ?? modelSource.label],
                      ["url", stats.modelUrl ?? modelSource.url],
                      ["nodes", stats.modelNodes ?? 0],
                      ["meshes", stats.modelMeshes ?? 0],
                      ["buffer", formatBytes(stats.modelBytes ?? 0)],
                      ["progress", `${stats.modelProgress ?? 0}%`],
                      ["status", stats.modelStatus ?? "loading"],
                      ["draw calls", stats.drawCalls],
                      ["budget", getBudgetStatus(modelAsset.optimizedBytes, modelAsset.targetBytes)],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-cyan-300/50 bg-white/70 p-3 dark:border-cyan-300/20 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-cyan-300/80">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-cyan-950/10 dark:bg-cyan-950/60">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-[width] duration-300 dark:bg-cyan-300"
                      style={{ width: `${Math.min(100, Math.max(0, stats.modelProgress ?? 0))}%` }}
                    />
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    这个实验用 <span className="font-semibold text-gray-900 dark:text-gray-100">GLTFLoader.load</span>{" "}
                    加载真实 GLB API 或 Blob URL，对照线上 `.glb` 资源地址、进度回调和失败 fallback。
                    当前来源是 <span className="font-semibold text-gray-900 dark:text-gray-100">{modelSource.label}</span>，
                    预算预设是 <span className="font-semibold text-gray-900 dark:text-gray-100">{modelAsset.name}</span>。
                  </p>
                </section>

                {stats.modelStatus === "fallback" || current.stage === "Resilience" ? (
                  <section className="rounded-lg border border-amber-300/70 bg-amber-50/80 p-4 dark:border-amber-300/25 dark:bg-amber-400/10">
                    <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                      Poster fallback state
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ["state", stats.modelStatus ?? "loading"],
                        ["failed url", stats.modelUrl ?? modelSource.url],
                        ["poster", "2D product marker"],
                        ["retry", "Real GLB API"],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-md border border-amber-300/60 bg-white/70 p-3 dark:border-amber-300/20 dark:bg-black/20"
                        >
                          <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-amber-300/80">
                            {label}
                          </div>
                          <p className="mt-1 text-sm font-semibold leading-relaxed text-gray-900 dark:text-gray-100">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                      错误信息：{stats.modelError || "等待加载结果"}。真实线上页面要在这里记录 source、URL、设备 DPR、
                      Content-Length、loader 错误和回滚版本，同时让用户看到 2D poster 而不是空白区域。
                    </p>
                  </section>
                ) : null}

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Model loading check
                  </div>
                  <div className="mt-3 grid gap-2">
                    {MODEL_LOADER_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            gate {String(index + 1).padStart(2, "0")}
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

                <section className="rounded-lg border border-fuchsia-300/60 bg-fuchsia-50/70 p-4 dark:border-fuchsia-300/20 dark:bg-fuchsia-400/10">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-fuchsia-700 dark:text-fuchsia-300">
                    GLB URL contract
                  </div>
                  <div className="mt-3 grid gap-2">
                    {[
                      ["endpoint", modelSource.url],
                      ["content type", modelSource.id === "api-glb" ? "model/gltf-binary" : "model/gltf+json"],
                      ["progress", "依赖 Content-Length；无 total 时展示保守进度"],
                      ["cache", modelSource.id === "api-glb" ? "no-store for lab，线上应带版本 hash" : "浏览器内存 Blob，离开页面 revokeObjectURL"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-fuchsia-300/50 bg-white/70 p-3 dark:border-fuchsia-300/20 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-fuchsia-300/80">
                          {label}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                    Asset delivery budget
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["original", formatBytes(modelAsset.originalBytes)],
                      ["geometry", formatBytes(modelAsset.geometryBytes)],
                      ["texture", formatBytes(modelAsset.textureBytes)],
                      ["optimized", formatBytes(modelAsset.optimizedBytes)],
                      ["target", formatBytes(modelAsset.targetBytes)],
                      ["status", getBudgetStatus(modelAsset.optimizedBytes, modelAsset.targetBytes)],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
                      >
                        <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-emerald-300/80">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20">
                    <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-emerald-300/80">
                      delivery route
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                      {modelAsset.route}
                    </p>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                  <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                    Model budget
                  </div>
                  <div className="mt-3 grid gap-2">
                    {MODEL_BUDGETS.map(([label, value, body]) => (
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
                    Delivery checklist
                  </div>
                  <div className="mt-3 grid gap-2">
                    {MODEL_DELIVERY_CHECKS.map(([label, body], index) => (
                      <div
                        key={label}
                        className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                      >
                        <div className="flex items-start gap-3">
                          <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-200">
                            ship {String(index + 1).padStart(2, "0")}
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

                {current.title === "压缩资源交付策略" ? (
                  <>
                    <section className="rounded-lg border border-blue-300/60 bg-blue-50/70 p-4 dark:border-blue-300/20 dark:bg-blue-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">
                        Compression shipping strategy
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {[
                          ["selected", modelAsset.name],
                          ["compression", modelAsset.compression],
                          ["original", formatBytes(modelCompressionSummary.original)],
                          ["optimized", formatBytes(modelCompressionSummary.optimized)],
                          ["saved", formatBytes(modelCompressionSummary.saved)],
                          ["ratio", `${Math.round(modelCompressionSummary.ratio * 100)}%`],
                          ["target", formatBytes(modelCompressionSummary.target)],
                          ["status", modelCompressionSummary.status],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-md border border-blue-300/50 bg-white/70 p-3 dark:border-blue-300/20 dark:bg-black/20"
                          >
                            <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-blue-300/80">
                              {label}
                            </div>
                            <div className="mt-1 text-sm font-semibold leading-relaxed text-gray-900 dark:text-gray-100">
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        当前交付路线：{modelAsset.route}
                      </p>
                    </section>

                    <section className="rounded-lg border border-fuchsia-300/60 bg-fuchsia-50/70 p-4 dark:border-fuchsia-300/20 dark:bg-fuchsia-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-fuchsia-700 dark:text-fuchsia-300">
                        Decoder loading plan
                      </div>
                      <div className="mt-3 grid gap-2">
                        {MODEL_COMPRESSION_PIPELINE.map((item, index) => (
                          <div
                            key={item.step}
                            className="rounded-md border border-fuchsia-300/50 bg-white/70 p-3 dark:border-fuchsia-300/20 dark:bg-black/20"
                          >
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {String(index + 1).padStart(2, "0")} · {item.step}
                              </span>
                              <span className="cyber-num text-xs text-fuchsia-700 dark:text-fuchsia-200">
                                {item.tool} · {item.input} → {item.output}
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                              {item.rule}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                        Cache and rollback
                      </div>
                      <div className="mt-3 grid gap-2">
                        {MODEL_CACHE_VERSION_RULES.map(([label, body], index) => (
                          <div
                            key={label}
                            className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
                          >
                            <div className="flex items-start gap-3">
                              <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                                cache {String(index + 1).padStart(2, "0")}
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

                    <section className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-300/25 dark:bg-amber-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                        Shipping decision matrix
                      </div>
                      <div className="mt-3 grid gap-2">
                        {MODEL_SHIPPING_DECISIONS.map(([label, body]) => (
                          <div
                            key={label}
                            className="rounded-md border border-amber-300/50 bg-white/70 p-3 dark:border-amber-300/20 dark:bg-black/20"
                          >
                            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                              <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        面试表达：我会把模型交付拆成几何压缩、贴图转码、decoder 懒加载、缓存版本和失败兜底五件事一起验收。
                      </p>
                    </section>
                  </>
                ) : null}

                {current.stage === "Resilience" ? (
                  <section className="rounded-lg border border-rose-300/70 bg-rose-50/80 p-4 dark:border-rose-300/25 dark:bg-rose-400/10">
                    <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-rose-700 dark:text-rose-300">
                      Fallback incident checklist
                    </div>
                    <div className="mt-3 grid gap-2">
                      {MODEL_FALLBACK_CHECKS.map(([label, body], index) => (
                        <div
                          key={label}
                          className="rounded-md border border-rose-300/60 bg-white/70 p-3 dark:border-rose-300/20 dark:bg-black/20"
                        >
                          <div className="flex items-start gap-3">
                            <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-200">
                              fail {String(index + 1).padStart(2, "0")}
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
                ) : null}
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

                {current.title === "配置器部件说明热点" ? (
                  <>
                    <section className="rounded-lg border border-cyan-300/60 bg-cyan-50/70 p-4 dark:border-cyan-300/20 dark:bg-cyan-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">
                        Hotspot business contract
                      </div>
                      <div className="mt-3 grid gap-2">
                        {PICKING_HOTSPOT_CONTRACTS.map((hotspot) => (
                          <div
                            key={hotspot.label}
                            className="rounded-md border border-cyan-300/50 bg-white/70 p-3 dark:border-cyan-300/20 dark:bg-black/20"
                          >
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {hotspot.label}
                              </span>
                              <span className="cyber-num text-xs text-cyan-700 dark:text-cyan-200">
                                part · {hotspot.part}
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                              {hotspot.business}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                              {hotspot.skuImpact}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                        Active hotspot
                      </div>
                      {activePickingHotspot ? (
                        <div className="mt-3 space-y-3">
                          <div className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20">
                            <div className="cyber-num text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                              hit · {activePickingHotspot.label}
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                              {activePickingHotspot.business}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              ["ndc", `${(stats.hitNdcX ?? 0).toFixed(2)}, ${(stats.hitNdcY ?? 0).toFixed(2)}`],
                              ["distance", (stats.hitDistance ?? 0).toFixed(2)],
                              ["constraint", activePickingHotspot.constraint],
                              ["next ui", activePickingHotspot.nextUi],
                            ].map(([label, value]) => (
                              <div
                                key={label}
                                className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
                              >
                                <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-emerald-300/80">
                                  {label}
                                </div>
                                <div className="mt-1 text-sm font-semibold leading-relaxed text-gray-900 dark:text-gray-100">
                                  {value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20">
                          <div className="cyber-num text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                            waiting for pointer hit
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                            点击画布中的 Lens、Body、Button 或 Port。命中后这里会展示业务说明、NDC、距离、
                            SKU 影响和下一步 UI 动作；点空白会清空状态。
                          </p>
                        </div>
                      )}
                    </section>

                    <section className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-300/25 dark:bg-amber-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                        Hotspot troubleshooting
                      </div>
                      <div className="mt-3 grid gap-2">
                        {PICKING_HOTSPOT_CHECKS.map(([label, body], index) => (
                          <div
                            key={label}
                            className="rounded-md border border-amber-300/50 bg-white/70 p-3 dark:border-amber-300/20 dark:bg-black/20"
                          >
                            <div className="flex items-start gap-3">
                              <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
                                qa {String(index + 1).padStart(2, "0")}
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

                {current.stage === "Product" || current.stage === "QA" ? (
                  <>
                    <section className="rounded-lg border border-cyan-300/60 bg-cyan-50/70 p-4 dark:border-cyan-300/20 dark:bg-cyan-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">
                        Product showcase skeleton
                      </div>
                      <div className="mt-3 grid gap-2">
                        {CONFIGURATOR_PRODUCT_BRIEF.map(([label, body]) => (
                          <div
                            key={label}
                            className="rounded-md border border-cyan-300/50 bg-white/70 p-3 dark:border-cyan-300/20 dark:bg-black/20"
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
                        User flow
                      </div>
                      <div className="mt-3 grid gap-2">
                        {CONFIGURATOR_USER_FLOW.map(([label, body], index) => (
                          <div
                            key={label}
                            className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                          >
                            <div className="flex items-start gap-3">
                              <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-200">
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

                    <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                        Mobile delivery budget
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {[
                          ["sku", configuratorSku.code],
                          ["dpr cap", `${dprCap}x`],
                          ["draw calls", stats.drawCalls],
                          ["triangles", stats.triangles],
                          ["canvas", `${stats.pixelWidth ?? 0} x ${stats.pixelHeight ?? 0}`],
                          ["pixel budget", (stats.pixelBudget ?? 0).toLocaleString()],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
                          >
                            <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-emerald-300/80">
                              {label}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                        Delivery package
                      </div>
                      <div className="mt-3 grid gap-2">
                        {CONFIGURATOR_DELIVERY_PACKAGE.map(([label, body]) => (
                          <div
                            key={label}
                            className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                          >
                            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                              <span className="text-gray-500 dark:text-gray-400"> - {body}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-lg border border-fuchsia-300/60 bg-fuchsia-50/70 p-4 dark:border-fuchsia-300/20 dark:bg-fuchsia-400/10">
                      <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-fuchsia-700 dark:text-fuchsia-300">
                        Acceptance gates
                      </div>
                      <div className="mt-3 grid gap-2">
                        {CONFIGURATOR_ACCEPTANCE_GATES.map(([label, body], index) => (
                          <div
                            key={label}
                            className="rounded-md border border-fuchsia-300/50 bg-white/70 p-3 dark:border-fuchsia-300/20 dark:bg-black/20"
                          >
                            <div className="flex items-start gap-3">
                              <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-fuchsia-700 dark:text-fuchsia-200">
                                gate {String(index + 1).padStart(2, "0")}
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

                    {current.title === "配置数据源 JSON 化" ? (
                      <>
                        <section className="rounded-lg border border-blue-300/60 bg-blue-50/70 p-4 dark:border-blue-300/20 dark:bg-blue-400/10">
                          <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">
                            Config data source
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {[
                              ["version", CONFIGURATOR_DATA_SOURCE.version],
                              ["product", CONFIGURATOR_DATA_SOURCE.productId],
                              ["sku prefix", CONFIGURATOR_DATA_SOURCE.skuPrefix],
                              ["sku order", CONFIGURATOR_DATA_SOURCE.skuOrder.join(" > ")],
                              ["body options", CONFIG_BODY_COLORS.length],
                              ["lens options", CONFIG_LENS_PRESETS.length],
                              ["button options", CONFIG_BUTTON_PRESETS.length],
                              ["total combos", CONFIG_BODY_COLORS.length * CONFIG_LENS_PRESETS.length * CONFIG_BUTTON_PRESETS.length],
                            ].map(([label, value]) => (
                              <div
                                key={label}
                                className="rounded-md border border-blue-300/50 bg-white/70 p-3 dark:border-blue-300/20 dark:bg-black/20"
                              >
                                <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-blue-300/80">
                                  {label}
                                </div>
                                <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                          <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                            Material binding map
                          </div>
                          <div className="mt-3 grid gap-2">
                            {CONFIGURATOR_PART_BINDINGS.map(([part, mesh, material, constraint]) => (
                              <div
                                key={part}
                                className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                              >
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                  <span className="font-semibold text-gray-900 dark:text-gray-100">{part}</span>
                                  <span className="cyber-num text-xs text-cyan-700 dark:text-cyan-200">
                                    {mesh} · {material}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                                  {constraint}
                                </p>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
                          <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                            SKU rule check
                          </div>
                          <div className="mt-3 rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20">
                            <div className="cyber-num text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                              {CONFIGURATOR_DATA_SOURCE.skuPrefix} + {CONFIGURATOR_DATA_SOURCE.skuOrder.join(" + ")}
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                              当前组合输出 <span className="font-semibold text-gray-900 dark:text-gray-100">{configuratorSku.code}</span>。
                              调整 UI 顺序不会改变 SKU 顺序，因为规则来自数据源。
                            </p>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {CONFIGURATOR_SCHEMA_CHECKS.map(([label, body], index) => (
                              <div
                                key={label}
                                className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                                    data {String(index + 1).padStart(2, "0")}
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
                            JSON preview
                          </div>
                          <pre className="mt-3 whitespace-pre-wrap break-words rounded-md border border-gray-200/70 bg-white/80 p-3 text-xs leading-relaxed text-gray-600 dark:border-cyan-400/10 dark:bg-black/25 dark:text-cyan-100/80">
                            {JSON.stringify(
                              {
                                version: CONFIGURATOR_DATA_SOURCE.version,
                                productId: CONFIGURATOR_DATA_SOURCE.productId,
                                skuPrefix: CONFIGURATOR_DATA_SOURCE.skuPrefix,
                                skuOrder: CONFIGURATOR_DATA_SOURCE.skuOrder,
                                parts: Object.fromEntries(
                                  Object.entries(CONFIGURATOR_DATA_SOURCE.parts).map(([key, part]) => [
                                    key,
                                    {
                                      mesh: part.mesh,
                                      material: part.material,
                                      options: part.options.map((option) => option.name),
                                    },
                                  ]),
                                ),
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </section>
                      </>
                    ) : null}

                    {current.stage === "QA" ? (
                      <>
                        <section className="rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-4 dark:border-emerald-300/20 dark:bg-emerald-400/10">
                          <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                            QA evidence snapshot
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {[
                              ["sku", qaEvidence.sku],
                              ["risk", qaEvidence.risk],
                              ["fps", qaEvidence.fps],
                              ["dpr / cap", `${qaEvidence.dpr} / ${qaEvidence.dprCap}`],
                              ["draw calls", qaEvidence.drawCalls],
                              ["triangles", qaEvidence.triangles],
                              ["canvas", qaEvidence.canvas],
                              ["pixels", qaEvidence.pixelBudget.toLocaleString()],
                            ].map(([label, value]) => (
                              <div
                                key={label}
                                className="rounded-md border border-emerald-300/50 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/20"
                              >
                                <div className="cyber-num text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-emerald-300/80">
                                  {label}
                                </div>
                                <div className="mt-1 text-sm font-semibold leading-relaxed text-gray-900 dark:text-gray-100">
                                  {value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="rounded-lg border border-blue-300/60 bg-blue-50/70 p-4 dark:border-blue-300/20 dark:bg-blue-400/10">
                          <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">
                            Release gates
                          </div>
                          <div className="mt-3 grid gap-2">
                            {CONFIGURATOR_QA_GATES.map((gate, index) => (
                              <div
                                key={gate.label}
                                className="rounded-md border border-blue-300/50 bg-white/70 p-3 dark:border-blue-300/20 dark:bg-black/20"
                              >
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    {String(index + 1).padStart(2, "0")} · {gate.label}
                                  </span>
                                  <span className="cyber-num text-xs uppercase tracking-[0.16em] text-blue-700 dark:text-blue-200">
                                    {gate.status}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                                  {gate.evidence}
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                                  failure: {gate.failure}
                                </p>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="rounded-lg border border-gray-200/70 bg-white/70 p-4 dark:border-cyan-400/15 dark:bg-black/25">
                          <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-cyan-300/70">
                            Release smoke script
                          </div>
                          <div className="mt-3 grid gap-2">
                            {CONFIGURATOR_QA_SCRIPT.map(([label, body], index) => (
                              <div
                                key={label}
                                className="rounded-md border border-gray-200/70 bg-white/70 p-3 dark:border-cyan-400/10 dark:bg-black/20"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-200">
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

                        <section className="rounded-lg border border-rose-300/70 bg-rose-50/70 p-4 dark:border-rose-300/25 dark:bg-rose-400/10">
                          <div className="cyber-num text-[10px] uppercase tracking-[0.22em] text-rose-700 dark:text-rose-300">
                            Incident response
                          </div>
                          <div className="mt-3 grid gap-2">
                            {CONFIGURATOR_RELEASE_RESPONSES.map(([label, body], index) => (
                              <div
                                key={label}
                                className="rounded-md border border-rose-300/50 bg-white/70 p-3 dark:border-rose-300/20 dark:bg-black/20"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="cyber-num mt-0.5 shrink-0 text-[10px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-200">
                                    fix {String(index + 1).padStart(2, "0")}
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
                  </>
                ) : null}

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
