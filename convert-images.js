import sharp from 'sharp';
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Convert GloriaMundoroundtransp.png to WebP
async function convertPngToWebp() {
  try {
    const inputPath = path.join('client', 'public', 'GloriaMundoroundtransp.png');
    const outputPath = path.join('client', 'public', 'GloriaMundoroundtransp.webp');
    
    // Also convert logo.png
    const logoInputPath = path.join('client', 'public', 'images', 'logo.png');
    const logoOutputPath = path.join('client', 'public', 'images', 'logo.webp');
    
    console.log(`Converting ${inputPath} to WebP format...`);
    
    await sharp(inputPath)
      .webp({ quality: 80, effort: 6 }) // Good balance of quality and file size
      .toFile(outputPath);
      
    console.log(`Successfully converted to ${outputPath}`);
    
    // Check if logo.png exists and convert it
    if (fs.existsSync?.(logoInputPath)) {
      console.log(`Converting ${logoInputPath} to WebP format...`);
      
      await sharp(logoInputPath)
        .webp({ quality: 80, effort: 6 })
        .toFile(logoOutputPath);
        
      console.log(`Successfully converted to ${logoOutputPath}`);
    } else {
      console.log(`Logo file ${logoInputPath} not found`);
    }
    
  } catch (error) {
    console.error('Error converting images:', error);
  }
}

// Run conversion
convertPngToWebp();