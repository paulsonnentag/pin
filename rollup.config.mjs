import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import copy from "rollup-plugin-copy";

const config = [
  {
    input: "src/background.ts",
    output: {
      file: "dist/background.js",
      format: "iife",
      name: "background",
    },
    plugins: [
      resolve({
        browser: true,
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
      }),
    ],
  },
  {
    input: "src/content.ts",
    output: {
      file: "dist/content.js",
      format: "iife",
      name: "content",
    },
    plugins: [
      resolve({
        browser: true,
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
      }),
      copy({
        targets: [{ src: "manifest.json", dest: "dist" }],
      }),
    ],
  },
];

export default config;


