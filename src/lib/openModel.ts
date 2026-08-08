// 3D 模型文件打开的抽象层：屏蔽 Web / Tauri 的差异。
// - Web：<input type="file"> + File API
// - Tauri：@tauri-apps/plugin-dialog + plugin-fs（运行时动态 import，Web bundle 不受污染）
//
// 用 new Function("s", "return import(s)") 绕开打包器的静态分析，
// 这样 Web 端构建时不会去解析 @tauri-apps/*，也就不需要安装它们。
// Tauri 项目里再补装两个插件即可原生工作。

export type ModelSource = "web" | "tauri";

export interface OpenedModel {
  name: string;
  bytes: ArrayBuffer;
  path?: string;
  source: ModelSource;
}

const ACCEPT = ".glb,.gltf";

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

async function dynImport<T = unknown>(spec: string): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const importer = new Function("s", "return import(s)") as (s: string) => Promise<T>;
  return importer(spec);
}

async function openViaTauri(): Promise<OpenedModel | null> {
  const dialog = await dynImport<{
    open: (opts: unknown) => Promise<string | string[] | null>;
  }>("@tauri-apps/plugin-dialog");
  const fs = await dynImport<{ readFile: (p: string) => Promise<Uint8Array> }>(
    "@tauri-apps/plugin-fs",
  );

  const selected = await dialog.open({
    multiple: false,
    filters: [{ name: "3D Model", extensions: ["glb", "gltf"] }],
  });
  if (!selected || typeof selected !== "string") return null;

  const bytes = await fs.readFile(selected);
  const name = selected.split(/[\\/]/).pop() ?? "model.glb";
  // 显式复制到独立 ArrayBuffer：绕开 Uint8Array.buffer 可能是 SharedArrayBuffer 的类型窄化。
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return { name, bytes: copy.buffer, path: selected, source: "tauri" };
}

function openViaWebInput(): Promise<OpenedModel | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const bytes = await file.arrayBuffer();
      resolve({ name: file.name, bytes, source: "web" });
    };
    input.click();
  });
}

// 主入口：Tauri 优先，失败或非 Tauri 环境自动回退到 Web 文件选择。
export async function openModelDialog(): Promise<OpenedModel | null> {
  if (isTauriRuntime()) {
    try {
      return await openViaTauri();
    } catch (err) {
      // Tauri 插件未装或调用失败时，静默回退，方便开发期调试。
      console.warn("[openModel] tauri open failed, fallback to web:", err);
    }
  }
  return openViaWebInput();
}

// File → OpenedModel（用于拖拽场景，公用同一个类型）。
export async function fileToOpenedModel(file: File): Promise<OpenedModel> {
  const bytes = await file.arrayBuffer();
  return { name: file.name, bytes, source: "web" };
}
