/** True only in the LNW_TEST=1 build used by the automated end-to-end tests. */
declare const __LNW_TEST__: boolean;

/** Vite turns `?url` imports into the URL of the emitted file. */
declare module "*?url" {
  const url: string;
  export default url;
}
