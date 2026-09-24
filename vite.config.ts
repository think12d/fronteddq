import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { port: mode === "admin" ? 5174 : 5173 },
  build: {
    outDir: mode === "admin" ? "dist-admin" : "dist-user",
  },
}));
