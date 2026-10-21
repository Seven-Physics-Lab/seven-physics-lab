export type SimInstance = { destroy: () => void } & Record<string, unknown>;
export type SimModule = {
  default: (container: HTMLElement, options?: { theme?: string; shadow?: boolean }) => SimInstance;
};
export declare const LOADERS: Record<string, () => Promise<SimModule>>;
