import { visualizer } from 'rollup-plugin-visualizer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a visualization of the bundle for analysis
async function analyzeBundleSize() {
  // Create a temporary directory for the stats
  const statsDir = path.join(__dirname, 'temp', 'stats');
  if (!fs.existsSync(statsDir)) {
    fs.mkdirSync(statsDir, { recursive: true });
  }

  // Path for the stats file
  const statsFile = path.join(statsDir, 'stats.html');
  
  console.log('Starting bundle analysis...');
  console.log('This will create a visualization to help identify large dependencies.');
  
  // Create a temporary plugin file
  const pluginFile = path.join(statsDir, 'visualizer-plugin.js');
  
  const pluginContent = `
  import { visualizer } from 'rollup-plugin-visualizer';
  export default function() {
    return visualizer({
      filename: '${statsFile.replace(/\\/g, '\\\\')}',
      open: true,
      title: 'GloriaMundo Bundle Analysis',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true
    });
  }`;
  
  fs.writeFileSync(pluginFile, pluginContent);
  
  console.log('Building project with bundle analyzer...');
  
  // Run a command to build with the visualizer (without modifying vite.config.ts)
  // This uses an environment variable that Vite will pick up
  exec(`VITE_BUNDLE_ANALYZE=true npm run build`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error running build: ${error.message}`);
      return;
    }
    
    console.log(stdout);
    
    if (stderr) {
      console.error(`Build produced warnings/errors: ${stderr}`);
    }
    
    console.log(`Bundle analysis complete. Stats file generated at: ${statsFile}`);
    console.log('View the stats file to identify large dependencies that can be optimized.');
  });
}

analyzeBundleSize();