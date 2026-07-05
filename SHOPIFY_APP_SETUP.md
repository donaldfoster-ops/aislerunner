# Shopify Custom App Setup Guide for Aisle Runner

This document outlines the step-by-step process to configure a dedicated Custom App in the Shopify Admin Dashboard for **Aisle Runner**.

---

## Step 1: Create the App
1. Go to your **Shopify Store Admin**.
2. Click **Settings** (gear icon) -> **Apps and sales channels**.
3. Click **Develop apps** (top right).
4. Click **Create an app**.
5. Set App Name to `Aisle Runner WMS` (or `Mazonkiki Picker`) and click **Create app**.

---

## Step 2: Configure Permissions (API Scopes)
1. In the **Overview** tab, click **Configure Admin API scopes**.
2. Select the following checkboxes:
   * **Orders**: `read_orders`, `write_order_edits`
   * **Fulfillments**: `read_fulfillments`, `write_fulfillments`
   * **Fulfillment Orders**: `read_assigned_fulfillment_orders`, `write_assigned_fulfillment_orders`, `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders`
   * **Products**: `read_products`
   * **Inventory**: `read_inventory`
3. Click **Save** in the top right.

---

## Step 3: Generate the API Token
1. Switch to the **API credentials** tab.
2. Click **Install app** (top right) and confirm.
3. **Copy the Admin API Access Token** (begins with `shpat_`).
   * *Note: This token is only shown once.*
4. Copy the **API Key** and **API Secret Key** for your records.

---

## Step 4: Configure the local Environment
1. Open the `.env` file in the root of the `aislerunner` codebase.
2. Update the token:
   ```env
   SHOPIFY_STORE=mazonkiki.myshopify.com
   SHOPIFY_API_VERSION=2026-04
   SHOPIFY_ACCESS_TOKEN=shpat_your_newly_generated_token_here
   ```
3. Restart your dev server to load the new credentials.
