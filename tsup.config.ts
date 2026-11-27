import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.tsx",
    "src/vue.ts",
    "src/angular.ts",
    "src/react-native.tsx",
    "src/vanilla.ts",
  ],
  format: ["cjs", "esm"],
  target: "es2020",
  minify: true,
  sourcemap: false,
  clean: true,
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".mjs" }),
  external: ["react", "react-native", "react-native-svg", "vue"],
});
