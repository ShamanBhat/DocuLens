/**
 * Feature-detects WebGPU on the main thread. Nothing here touches the model; it only
 * decides which device/quantisation the worker should request.
 */

export interface WebGpuSupport {
  supported: boolean;
  /** `shader-f16` lets the smaller q4f16 weights run on the GPU. */
  fp16: boolean;
  /** Human-readable adapter name, e.g. "nvidia ampere". */
  adapter: string | null;
  /** Why WebGPU is unavailable, when it is. */
  reason: string | null;
}

// `navigator.gpu` is not in lib.dom; a minimal local shape avoids a @webgpu/types dependency.
interface GpuAdapterInfoLike {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

interface GpuAdapterLike {
  features: { has(name: string): boolean };
  info?: GpuAdapterInfoLike;
  requestAdapterInfo?: () => Promise<GpuAdapterInfoLike>;
}

interface NavigatorWithGpu {
  gpu?: { requestAdapter(options?: { powerPreference?: 'high-performance' | 'low-power' }): Promise<GpuAdapterLike | null> };
}

const UNSUPPORTED = (reason: string): WebGpuSupport => ({ supported: false, fp16: false, adapter: null, reason });

// Apple Silicon reports vendor "apple" with an empty description (Chrome and Safari alike).
function adapterName(info: GpuAdapterInfoLike | undefined): string | null {
  if (!info) return null;
  if (info.description) return info.description;
  const detail = info.architecture ? ` (${info.architecture})` : '';
  if (info.vendor?.toLowerCase() === 'apple') return `Apple GPU${detail}`;
  return [info.vendor, info.architecture].filter(Boolean).join(' ') || null;
}

const isMac = () => /Mac/i.test(navigator.platform || navigator.userAgent);

let probe: Promise<WebGpuSupport> | null = null;

async function run(): Promise<WebGpuSupport> {
  if (typeof navigator === 'undefined') return UNSUPPORTED('WebGPU is only available in the browser.');

  const gpu = (navigator as unknown as NavigatorWithGpu).gpu;
  if (!gpu) {
    return UNSUPPORTED(
      isMac()
        ? 'This browser has no WebGPU. On a Mac use Chrome, Edge or Safari 26+ (Safari 26 also installs on macOS Sonoma and Sequoia) — DocuLens will fall back to slower CPU (WASM) inference.'
        : 'This browser has no WebGPU. Use a recent Chrome, Edge or Safari 26+ — DocuLens will fall back to slower CPU (WASM) inference.',
    );
  }

  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return UNSUPPORTED('No compatible GPU adapter was found — falling back to CPU (WASM) inference.');

    let info: GpuAdapterInfoLike | undefined = adapter.info;
    if (!info && adapter.requestAdapterInfo) info = await adapter.requestAdapterInfo().catch(() => undefined);
    return { supported: true, fp16: adapter.features.has('shader-f16'), adapter: adapterName(info), reason: null };
  } catch (error) {
    return UNSUPPORTED(error instanceof Error ? error.message : 'WebGPU initialisation failed.');
  }
}

/** Memoised — the adapter probe runs once per page load. */
export function detectWebGpu(): Promise<WebGpuSupport> {
  probe ??= run();
  return probe;
}
