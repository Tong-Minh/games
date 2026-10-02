import { readFileSync } from 'node:fs';
import type { NextConfig } from 'next';

// Workspace packages (SDK, shared code, games) ship TypeScript source.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const workspacePackages = Object.keys(pkg.dependencies).filter((name) =>
  name.startsWith('@games/'),
);

const nextConfig: NextConfig = {
  transpilePackages: workspacePackages,
  poweredByHeader: false,
  // Dev only: lets a second local origin act as a separate player when testing.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
