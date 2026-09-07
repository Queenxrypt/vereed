/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SEPOLIA_RPC?: string;
  readonly VITE_CC3_RPC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
