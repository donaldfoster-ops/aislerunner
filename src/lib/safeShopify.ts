// src/lib/safeShopify.ts
// ------------------------------------------------------------
// A thin wrapper around the existing `shopify` helper that adds
// runtime safety checks for PUT requests that could unintentionally
// overwrite an entire collection (e.g., the `images` array on a
// product). If such a request is detected, the wrapper will either
// merge the existing data or throw an error – depending on the
// configuration.
// ------------------------------------------------------------

import { shopify } from '@/lib/api';

/**
 * Safe wrapper for Shopify API calls.
 *
 * - Detects PUT calls to `/products/{productId}.json` that contain an
 *   `images` array. Those calls historically replaced the whole image
 *   collection, causing data loss.
 * - If such a payload is detected, the wrapper fetches the current
 *   product data, merges the existing `images` with the provided one(s),
 *   and proceeds with the merged payload.
 * - You can change the behavior to `throw` instead of merging by
 *   setting `SAFE_SHOPIFY_MODE="strict"` in your .env file.
 */
export async function safeShopify(opts: any) {
  const STRICT_MODE = process.env.SAFE_SHOPIFY_MODE === 'strict';

  // Only intervene on PUT calls that target a product endpoint
  const isProductPut =
    opts.method?.toUpperCase() === 'PUT' &&
    /\/products\/\d+\.json$/.test(opts.endpoint);

  if (isProductPut && opts.body && opts.body.product && opts.body.product.images) {
    const imagesPayload = opts.body.product.images;
    // If the payload includes an images array, we consider it risky.
    if (Array.isArray(imagesPayload) && imagesPayload.length > 0) {
      if (STRICT_MODE) {
        // In strict mode we simply abort to avoid any accidental overwrite.
        throw new Error(
          '[SAFE SHOPIFY] Blocking PUT that overwrites product images. Use the image‑specific endpoint instead.'
        );
      }

      // Non‑strict mode: fetch existing images and merge.
      const productIdMatch = opts.endpoint.match(/\/products\/(\d+)\.json$/);
      const productId = productIdMatch?.[1];
      if (!productId) {
        throw new Error('[SAFE SHOPIFY] Unable to extract productId for merge operation.');
      }

      // Fetch current product data (only images field to keep traffic low)
      const current = await shopify({
        method: 'GET',
        endpoint: `products/${productId}.json?fields=images`,
      });
      const existingImages = current.product?.images || [];

      // Merge: keep any existing images not being updated, then add/replace the ones in payload
      const merged = [...existingImages];
      imagesPayload.forEach((newImg: any) => {
        const idx = merged.findIndex((img: any) => img.id === newImg.id);
        if (idx >= 0) merged[idx] = { ...merged[idx], ...newImg };
        else merged.push(newImg);
      });

      // Replace the payload with the merged images array
      opts.body.product.images = merged;
    }
  }

  // Forward the (potentially modified) request to the original helper
  return shopify(opts);
}
