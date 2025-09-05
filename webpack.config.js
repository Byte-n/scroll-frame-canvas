import path from 'path';
import { fileURLToPath } from 'url';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const base = {
         entry: {
         'scroll-frame-canvas': './src/index.ts',
       },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  target: ['web', 'es2020'],
  mode: 'production',
};

const esm = {
  ...base,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].esm.js',
    library: { type: 'module' },
    environment: { module: true },
    clean: true,
  },
  experiments: { outputModule: true },
};

const umd = {
  ...base,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].umd.js',
    library: { name: 'ScrollFrameCanvas', type: 'umd', export: 'default' },
    globalObject: 'this',
  },
};

export default [esm, umd];


