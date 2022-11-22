const path = require("path");

const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = [
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
      new CopyWebpackPlugin({
        patterns: ["extension/manifest.json"],
      }),
    ],
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
  },
];
