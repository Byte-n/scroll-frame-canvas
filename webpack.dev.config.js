import path from 'path';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('process.env.NODE_ENV ' ,
process.env.NODE_ENV
)
export default {
  entry: {
    'scroll-frame-canvas': './src/index.ts',
    'demo': './src/demo.ts',
  },
  output: {
    path: path.resolve(__dirname, 'docs-dist'),
    filename: '[name].esm.js',
    library: { type: 'module' },
    environment: { module: true },
    publicPath: process.env.NODE_ENV === 'production' ? './' : '/',
  },
  experiments: { outputModule: true },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader', options: { configFile: 'tsconfig.docs.json' },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: path.resolve(__dirname, 'demo/index.html'),
      chunks: ['demo'],
      scriptLoading: 'module',
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'downloads'),
          to: path.resolve(__dirname, 'docs-dist/downloads'),
        },
      ],
    }),
  ],
  devtool: 'source-map',
  mode: 'development',
  target: ['web', 'es2020'],
  devServer: {
    static: [
      { directory: path.resolve(__dirname, 'downloads'), publicPath: '/downloads' },
      { directory: path.resolve(__dirname, 'docs-dist'), publicPath: '/docs-dist' },
    ],
    open: '/',
    port: 8080,
    host: '0.0.0.0',
    hot: true,
    liveReload: true,
    devMiddleware: {
      writeToDisk: true,
    },
  },
};


