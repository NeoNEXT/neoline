const path = require("path");

const MergeJsonPlugin = require("./MergeJsonPlugin");
const webpack = require("webpack");

module.exports = (env) => {
  return [
    {
      mode: "production",
      entry: {
        background: "./extension/background/index.ts",
      },
      output: {
        filename: "[name].js",
        path: path.resolve(__dirname, "../dist"),
      },
      devtool: false,
      resolve: {
        extensions: [".ts", ".js"],
        fallback: {
          crypto: require.resolve("crypto-browserify"),
          stream: require.resolve("stream-browserify"),
          url: require.resolve("url"),
        },
      },
      module: {
        rules: [
          {
            test: /.ts$/,
            use: "ts-loader?configFile=extension/tsconfig.json",
            exclude: /node_modules/,
          },
        ],
      },
      plugins: [
        new MergeJsonPlugin({
          input: [
            "extension/manifest/base.json",
            env.platform === "firefox"
              ? "extension/manifest/firefox.json"
              : "extension/manifest/chrome.json",
          ],
          output: "manifest.json",
        }),
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "process/browser",
        }),
      ],
      performance: {
        maxEntrypointSize: 2000000,
        maxAssetSize: 2000000,
      },
    },
    {
      mode: "production",
      // optimization: {
      //     minimize: false
      // },
      entry: {
        neoline: "./extension/neoline/index.ts",
        dapi: "./extension/dapi/index.ts",
        common: "./extension/common/index.ts",
        data_module_neo2: "./extension/common/data_module_neo2.ts",
      },
      output: {
        filename: "[name].js",
        path: path.resolve(__dirname, "../dist"),
        libraryTarget: "window",
        library: "NEOLine",
      },
      devtool: false,
      resolve: {
        extensions: [".ts", ".js"],
        fallback: {
          crypto: require.resolve("crypto-browserify"),
          stream: require.resolve("stream-browserify"),
        },
      },
      module: {
        rules: [
          {
            test: /.ts$/,
            use: "ts-loader?configFile=extension/tsconfig.json",
            exclude: /node_modules/,
          },
        ],
      },
      plugins: [
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
        }),
      ],
      performance: {
        maxEntrypointSize: 2000000,
        maxAssetSize: 2000000,
      },
    },
    {
      mode: "production",
      entry: {
        neolineN3: "./extension/neoline/neo3.ts",
        dapiN3: "./extension/dapi/neo3.ts",
        common: "./extension/common/index.ts",
        data_module_neo3: "./extension/common/data_module_neo3.ts",
      },
      output: {
        filename: "[name].js",
        path: path.resolve(__dirname, "../dist"),
        libraryTarget: "window",
        library: "NEOLineN3",
      },
      devtool: false,
      resolve: {
        extensions: [".ts", ".js"],
        fallback: {
          crypto: require.resolve("crypto-browserify"),
          stream: require.resolve("stream-browserify"),
        },
      },
      module: {
        rules: [
          {
            test: /.ts$/,
            use: "ts-loader?configFile=extension/tsconfig.json",
            exclude: /node_modules/,
          },
        ],
      },
      plugins: [
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
        }),
      ],
      performance: {
        maxEntrypointSize: 2000000,
        maxAssetSize: 2000000,
      },
    },
    {
      mode: "production",
      entry: {
        neolineEVM: "./extension/neoline/evm.ts",
        dapiEVM: "./extension/dapi/evm.ts",
        common: "./extension/common/index.ts",
        data_module_evm: "./extension/common/data_module_evm.ts",
      },
      output: {
        filename: "[name].js",
        path: path.resolve(__dirname, "../dist"),
      },
      devtool: false,
      resolve: {
        extensions: [".ts", ".js"],
        fallback: {
          crypto: require.resolve("crypto-browserify"),
          stream: require.resolve("stream-browserify"),
        },
      },
      module: {
        rules: [
          {
            test: /.ts$/,
            use: "ts-loader?configFile=extension/tsconfig.json",
            exclude: /node_modules/,
          },
        ],
      },
      plugins: [
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
        }),
      ],
      performance: {
        maxEntrypointSize: 2000000,
        maxAssetSize: 2000000,
      },
    },
  ];
};
