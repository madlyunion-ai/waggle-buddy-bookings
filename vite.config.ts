// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Deploying to Vercel instead of Lovable's Cloudflare sandbox.
  // (src/server.ts is a Cloudflare Workers-style fetch(request, env, ctx) entry
  // and isn't wired in here anymore — nitro generates the Vercel entry itself.
  // Request-level error handling still runs via the middleware in src/start.ts.)
  nitro: { preset: "vercel" },
});
