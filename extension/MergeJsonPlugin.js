const fs = require("fs");
const path = require("path");

class MergeJsonPlugin {
  constructor(options) {
    this.options = options;
  }

  apply(compiler) {
    compiler.hooks.emit.tapAsync("MergeJsonPlugin", (compilation, callback) => {
      const { input, output } = this.options;

      const merged = input.reduce((acc, filePath) => {
        const fullPath = path.resolve(compiler.context, filePath);
        const content = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        return { ...acc, ...content }; // 合并对象，后面的覆盖前面的
      }, {});

      const json = JSON.stringify(merged, null, 2);

      compilation.assets[output] = {
        source: () => json,
        size: () => json.length,
      };

      callback();
    });
  }
}

module.exports = MergeJsonPlugin;
