const path = require('path');

const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = [{
    mode: "production",
    entry: {
        "background": "./extension/background/index.ts"
    },
    output: {
        filename: "[name].js",
        path: path.resolve(__dirname, '../dist'),
        libraryTarget: 'window',
        library: 'NEOLineBackground'
    },
    devtool: false,
    resolve: {
        extensions: [".ts", ".js"]
    },
    module: {
        rules: [
            {
                test: /.ts$/,
                use: "ts-loader?configFile=extension/tsconfig.json",
                exclude: /node_modules/
            }
        ]
    },
    plugins: [
        new CopyWebpackPlugin([
            "extension/manifest.json"
        ])
    ]
}, {
    mode: "production",
    // optimization: {
    //     minimize: false
    // },
    entry: {
        "neoline": "./extension/neoline/index.ts",
        "dapi": "./extension/dapi/index.ts",
        "common": "./extension/common/index.ts",
        "data_module": "./extension/common/data_module.ts"
    },
    output: {
        filename: "[name].js",
        path: path.resolve(__dirname, '../dist'),
        libraryTarget: 'window',
        library: 'NEOLine'
    },
    devtool: false,
    resolve: {
        extensions: [".ts", ".js"]
    },
    module: {
        rules: [
            {
                test: /.ts$/,
                use: "ts-loader?configFile=extension/tsconfig.json",
                exclude: /node_modules/
            }
        ]
    }
}];
