/*
  restore-product-images.js
  -----------------------
  Usage:
    node scripts/restore-product-images.js <productId> <backupFilePath>

  Example:
    node scripts/restore-product-images.js 10501022187793 ./backups/shopify-backup-2024-11-12.json

  This script reads a JSON backup that contains an array of product objects
  (as returned by the Shopify API) and re‑creates any missing images for the
  specified product using the image‑specific endpoint:
    PUT /admin/api/2026-04/products/{productId}/images/{imageId}.json

  It assumes the backup file contains a top‑level "products" array where each
  product has the shape:
    { id: number, images: [{ id: number, src: string, alt?: string }] }

  The script will:
    1. Locate the product in the backup.
    2. For each image entry, POST the image back to Shopify using the `src`
       URL (Shopify will download the image from the CDN).
    3. Log success or error for each image.

  IMPORTANT:
    * The script uses the environment variables defined in your .env file:
        SHOPIFY_TOKEN, STORE_URL
    * It does NOT overwrite existing images – it simply attempts to POST
      every image entry from the backup. If an image already exists, Shopify
      will return a 422 error which we safely ignore.
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const [,, productIdArg, backupPathArg] = process.argv;
if (!productIdArg || !backupPathArg) {
  console.error('Usage: node scripts/restore-product-images.js <productId> <backupFilePath>');
  process.exit(1);
}

const PRODUCT_ID = productIdArg;
const BACKUP_PATH = path.resolve(backupPathArg);

const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const STORE_URL = process.env.STORE_URL;
const API_VERSION = '2026-04';

if (!SHOPIFY_TOKEN || !STORE_URL) {
  console.error('Missing SHOPIFY_TOKEN or STORE_URL in .env');
  process.exit(1);
}

async function restoreImages() {
  let backupData;
  try {
    backupData = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  } catch (e) {
    console.error('Failed to read backup file:', e.message);
    process.exit(1);
  }

  const product = backupData.products?.find(p => String(p.id) === String(PRODUCT_ID));
  if (!product) {
    console.error(`Product ${PRODUCT_ID} not found in backup`);
    process.exit(1);
  }

  if (!Array.isArray(product.images) || product.images.length === 0) {
    console.log('No images to restore for this product');
    return;
  }

  for (const img of product.images) {
    const payload = {
      image: {
        src: img.src,
        alt: img.alt || ''
      }
    };
    const url = `https://${STORE_URL}/admin/api/${API_VERSION}/products/${PRODUCT_ID}/images.json`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`✅ Restored image ${img.id || '(new)'} from ${img.src}`);
      } else {
        // 422 means image already exists – safe to ignore
        if (res.status === 422) {
          console.warn(`⚠️ Image already exists or duplicate: ${img.src}`);
        } else {
          console.error(`❌ Failed to restore image ${img.src}:`, data);
        }
      }
    } catch (e) {
      console.error('Network error while restoring image:', e.message);
    }
  }
}

restoreImages();
