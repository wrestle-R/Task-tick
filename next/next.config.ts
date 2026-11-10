import type {NextConfig} from 'next';
const config:NextConfig={distDir:process.env.TICK_BUILD_DIR??'.next',transpilePackages:['@tick/core','@tick/ui'],async headers(){return [{source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Access-Control-Allow-Origin',value:'*'},{key:'Access-Control-Allow-Methods',value:'GET, POST, OPTIONS'},{key:'Access-Control-Allow-Headers',value:'Authorization, Content-Type'}]},{source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache'}]}];}};
export default config;
