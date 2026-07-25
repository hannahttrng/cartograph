const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.dirname(
  require.resolve("expo-modules-jsi/package.json"),
);
const buildScriptPath = path.join(
  packageRoot,
  "apple",
  "scripts",
  "build-xcframework.sh",
);

const original =
  'DERIVED_DATA_PATH="${PACKAGE_DIR}/.DerivedData"';
const replacement =
  'DERIVED_DATA_PATH="${EXPO_MODULES_JSI_DERIVED_DATA_PATH:-${TMPDIR:-/tmp}/expo-modules-jsi-derived-data-$(printf \'%s\' "$PACKAGE_DIR" | shasum -a 256 | cut -c1-12)}"';

const buildScript = fs.readFileSync(buildScriptPath, "utf8");

if (buildScript.includes(replacement)) {
  console.log("expo-modules-jsi DerivedData patch is already applied");
} else if (buildScript.includes(original)) {
  fs.writeFileSync(
    buildScriptPath,
    buildScript.replace(original, replacement),
  );
  console.log(
    "Patched expo-modules-jsi to build outside cloud-synced storage",
  );
} else {
  throw new Error(
    "Unsupported expo-modules-jsi build script; update scripts/patch-expo-modules-jsi.js",
  );
}
