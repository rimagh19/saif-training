import tseslint from "typescript-eslint";
export default tseslint.config({
  // Server code only: every async call must be awaited (a forgotten await could skip a permission check).
  files: ["src/lib/**/*.ts", "src/app/**/route.ts", "src/app/**/page.tsx", "src/app/**/layout.tsx"],
  languageOptions: { parser: tseslint.parser, parserOptions: { project: "./tsconfig.json", tsconfigRootDir: "/home/claude/safe-training" } },
  plugins: { "@typescript-eslint": tseslint.plugin },
  rules: {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/require-await": "off",
  },
});
