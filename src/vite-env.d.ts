/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_ADS?: string;
  readonly VITE_ADMOB_BANNER_ID?: string;
  readonly VITE_ADMOB_INTERSTITIAL_ID?: string;
  readonly VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
