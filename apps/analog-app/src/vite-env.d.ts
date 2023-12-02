/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALOG_PUBLIC_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
