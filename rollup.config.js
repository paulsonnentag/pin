import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

export default [
  {
    input: "src/background.ts",
    output: {
      file: "dist/background.js",
      format: "es",
      sourcemap: false,
    },
    plugins: [
      json(),
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
      }),
    ],
  },
];
