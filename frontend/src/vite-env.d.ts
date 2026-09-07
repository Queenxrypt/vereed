/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SEPOLIA_RPC?: string;
  readonly VITE_CC3_RPC?: string;
  /** Browser-facing relayer prefix. Dev default is `/relayer` (Vite proxy). */
  readonly VITE_RELAYER_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
