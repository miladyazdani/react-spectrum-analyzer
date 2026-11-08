import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `vite` serves the demo (index.html); `vite build --mode lib` bundles the package.
export default defineConfig(({ mode }) => ({
    plugins: [react()],
    build: mode === "lib" ? {
        lib: {
            entry: "src/index.js",
            formats: ["es", "cjs"],
            fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
        },
        rollupOptions: {
            external: ["react", "react-dom", "react/jsx-runtime"],
            output: { exports: "named" },
        },
        sourcemap: true,
    } : undefined,
    test: {
        environment: "node",
        include: ["src/**/*.test.js"],
    },
}));
