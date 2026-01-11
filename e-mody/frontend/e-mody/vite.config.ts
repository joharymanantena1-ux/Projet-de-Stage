import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import compression from "vite-plugin-compression";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode, command }) => {
  const isProd = mode === "production";
  const isDev = mode === "development";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      isDev && componentTagger(),

      isProd &&
        compression({
          algorithm: "brotliCompress",
          ext: ".br",
          threshold: 10240,
        }),
      isProd &&
        compression({
          algorithm: "gzip",
          ext: ".gz",
          threshold: 10240,
        }),
      process.env.ANALYZE === "true" &&
        visualizer({
          open: true,
          filename: "dist/bundle-analysis.html",
          gzipSize: true,
        }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      target: "es2020",
      sourcemap: false,
      minify: "esbuild",
      cssCodeSplit: true,
      assetsInlineLimit: 4096,
      rollupOptions: {
        output: {
          manualChunks(id: string) {

            if (!id.includes('node_modules')) return;
            const match = id.toString().match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
            if (match) {
              return `vendor-${match[1].replace('@', '').replace('/', '-')}`;
            }
            return "vendor";
            
          },
          
        },
      },
      brotliSize: true,
    },
  };
});
