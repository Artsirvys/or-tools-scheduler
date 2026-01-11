import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    // Fix for Supabase ESM module resolution
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    
    // Handle ESM modules properly - fix for @supabase/supabase-js wrapper.mjs
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
      resolve: {
        fullySpecified: false,
      },
    });
    
    // Fix for Supabase wrapper.mjs default export issue
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    
    // Ensure proper module resolution
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
      '.mjs': ['.mjs', '.js'],
    };
    
    return config;
  },
  experimental: {
    esmExternals: 'loose',
  },
};

export default withNextIntl(nextConfig);
