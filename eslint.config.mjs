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
    // This is a private/learning app with no translation pipeline, so we
    // don't enforce translator-oriented metadata. Strings still go through
    // FormattedMessage / intl.formatMessage so they're easy to extract later.
    rules: {
      "formatjs/enforce-description": "off",
      "formatjs/no-literal-string-in-jsx": "off",
      "formatjs/no-literal-string-in-object": "off",
    },
  },
];
