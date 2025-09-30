const fs = require("fs");
const path = require("path");
const { sources, Compilation } = require("webpack");

class MergeJsonPlugin {
  constructor(options) {
    this.options = options;
  }

  apply(compiler) {
    compiler.hooks.thisCompilation.tap("MergeJsonPlugin", (compilation) => {
      compilation.hooks.processAssets.tapAsync(
        {
          name: "MergeJsonPlugin",
          stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets, callback) => {
          const { input, output } = this.options;

          const merged = input.reduce((acc, filePath) => {
            const fullPath = path.resolve(compiler.context, filePath);
            const content = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
            return { ...acc, ...content };
          }, {});

          const json = JSON.stringify(merged, null, 2);

          compilation.emitAsset(output, new sources.RawSource(json));

          callback();
        }
      );
    });
  }
}

module.exports = MergeJsonPlugin;
