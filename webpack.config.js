// this custom webpack config is for issue with @angular/cli and crypto
// https://github.com/angular/angular-cli/issues/1548#issuecomment-450891241

const path = require('path');
const appSrc = './src';

module.exports = {
    node: {
        path: true,
        crypto: true,
        fs: 'empty',
        stream: true,
        Buffer: true
    },
    // optimization: {
    //     minimize: false
    // },
    resolve: {
        extensions: ['*', '.js', '.ts', '.scss', '.png', '.jpg', '.jpeg', '.svg', '.otf', '.ttf'],
        modules: [
            __dirname,
            path.join(__dirname, 'node_modules'),
            path.join(__dirname, 'src')
        ],
        alias: {
            '@': path.resolve(__dirname, `${ appSrc }`),
            'src/styles': path.resolve(__dirname, `${ appSrc }/styles`),
            '@assets': path.resolve(__dirname, `${ appSrc }/assets`),
            '@images': path.resolve(__dirname, `${ appSrc }/assets/images`),
            '@fonts': path.resolve(__dirname, `${ appSrc }/assets/fonts`),
            '@app': path.resolve(__dirname, `${ appSrc }/app`),
            '@models': path.resolve(__dirname, `${ appSrc }/models`),
            '@share': path.resolve(__dirname, `${ appSrc }/app/share`),
            '@popup': path.resolve(__dirname, `${ appSrc }/app/popup`),
        }
    }
};
