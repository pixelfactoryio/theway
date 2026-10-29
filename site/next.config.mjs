import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';
import { basePath } from './lib/base-path.mjs';

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
};

const withMDX = createMDX();

export default withMDX(config);
