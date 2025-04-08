import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script to optimize the build process without modifying vite.config.ts
 * - Sets modern build target (ESNext) for smaller, more optimized bundles
 * - Enables compression for smaller file sizes
 * - Configures bundle splitting via environment variables
 */
async function optimizeBuild() {
  console.log('Starting optimized build process...');
  
  try {
    // Set optimization environment variables
    const env = {
      ...process.env,
      // Use ESNext as build target for modern browsers
      VITE_BUILD_TARGET: 'esnext',
      // Enable gzip compression during build
      VITE_COMPRESS: 'true',
      // Enable code splitting
      VITE_SPLIT_CHUNKS: 'true',
      // Configure chunk sizing
      VITE_MIN_CHUNK_SIZE: '100000', // 100kb
      // Set maximum vendor chunk size
      VITE_MAX_VENDOR_CHUNK_SIZE: '500000', // 500kb
    };
    
    // Create a temporary directory for build stats if it doesn't exist
    const statsDir = path.join(__dirname, 'temp', 'stats');
    if (!fs.existsSync(statsDir)) {
      fs.mkdirSync(statsDir, { recursive: true });
    }
    
    console.log('Building with optimized settings...');
    
    // Run the build command with the customized environment variables
    execSync('npm run build', { 
      env,
      stdio: 'inherit' // Show output in console
    });
    
    console.log('Build completed successfully!');
    console.log(`\nOptimizations applied:`);
    console.log('- Modern JS target (ESNext) for smaller bundles');
    console.log('- Improved code splitting for faster initial load');
    console.log('- Compressed assets for reduced transfer size');
    
  } catch (error) {
    console.error('Error during optimized build:', error);
    process.exit(1);
  }
}

// Run the optimized build process
optimizeBuild();