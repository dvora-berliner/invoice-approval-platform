import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: "ui",
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: true,
      testTimeout: 15000,
      fileParallelism: false,
    },
  }),
);
