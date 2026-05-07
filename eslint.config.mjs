import canvaPlugin from "@canva/app-eslint-plugin";

export default [
  {
    ignores: [
      "**/node_modules/",
      "**/dist",
      "**/*.d.ts",
      "**/*.d.tsx",
      "**/*.config.*",
    ],
  },
  ...canvaPlugin.configs.apps,
  {
    // We use FormattedMessage / intl.formatMessage everywhere with descriptions
    // for the translators. The two rules below are template defaults that
    // were too noisy for our small, mostly-English internal-style strings;
    // we keep them off but enforce-description stays on for submission.
    rules: {
      "formatjs/no-literal-string-in-jsx": "off",
      "formatjs/no-literal-string-in-object": "off",
    },
  },
];
