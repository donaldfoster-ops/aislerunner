import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
    const STORE_URL = process.env.STORE_URL;
    const API_VERSION = '2026-04';

    if (!SHOPIFY_TOKEN) {
      return NextResponse.json({ error: 'SHOPIFY_TOKEN environment variable is not set' }, { status: 500 });
    }
    if (!STORE_URL) {
      return NextResponse.json({ error: 'STORE_URL environment variable is not set' }, { status: 500 });
    }

    const bodyData = await req.json();
    const { action, picks } = bodyData;

    if (action === 'syncPicks' && Array.isArray(picks)) {
      const results = [];
      const orderIds = Array.from(new Set(picks.map((p: any) => p.order_id)));

      for (const orderId of orderIds) {
        // Tag order as "Picked"
        const query = `
          mutation addTags($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) {
              node {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const res = await fetch(`https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          },
          body: JSON.stringify({ query, variables: { id: orderId, tags: ['Picked'] } }),
        });

        const data = await res.json();
        results.push({ orderId, data });
      }

      return NextResponse.json({ success: true, results });
    }

    if (action === 'completePrintJobs') {
      const { ids } = bodyData;
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ success: true });
      }

      try {
        const shopId = await getShopId(STORE_URL, SHOPIFY_TOKEN);
        if (shopId) {
          const queue = await getPrintQueue(STORE_URL, SHOPIFY_TOKEN, shopId);
          const updatedQueue = queue.filter((job: any) => !ids.includes(job.id));
          await setPrintQueue(STORE_URL, SHOPIFY_TOKEN, shopId, updatedQueue);
          return NextResponse.json({ success: true });
        }
      } catch (e: any) {
        console.error("Failed to complete/clear print jobs:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
      }
    }

    if (action === 'updateStockAndLocation') {
      const { product_id, variant_id, inventory_item_id, mode, quantity, cubicle, changeFromQuantity } = bodyData;

      if (!variant_id || !product_id) {
        return NextResponse.json({ error: 'product_id and variant_id are required' }, { status: 400 });
      }

      const results: any = {};

      // 1. Update location metafield (Owner ID is variant_id)
      if (cubicle !== undefined) {
        const setMetafieldQuery = `
          mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                id
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const metafieldRes = await fetch(`https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          },
          body: JSON.stringify({
            query: setMetafieldQuery,
            variables: {
              metafields: [
                {
                  ownerId: variant_id,
                  namespace: "mzk",
                  key: "cubicle_location",
                  value: cubicle.trim(),
                  type: "single_line_text_field"
                }
              ]
            }
          }),
        });

        const metafieldData = await metafieldRes.json();
        if (metafieldData.errors || metafieldData.data?.metafieldsSet?.userErrors?.length > 0) {
          const errors = metafieldData.errors || metafieldData.data.metafieldsSet.userErrors;
          return NextResponse.json({ error: `Location update failed: ${JSON.stringify(errors)}` }, { status: 400 });
        }
        results.location = metafieldData.data;
      }

      // 2. Adjust/set stock level in Shopify
      if (quantity !== undefined && inventory_item_id) {
        // Fetch active locations
        const locQuery = `
          query {
            locations(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
        `;
        const locRes = await fetch(`https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          },
          body: JSON.stringify({ query: locQuery }),
        });
        const locData = await locRes.json();
        const primaryLocationId = locData.data?.locations?.edges[0]?.node?.id;

        if (!primaryLocationId) {
          return NextResponse.json({ error: 'No active Shopify locations found to update inventory.' }, { status: 400 });
        }

        if (mode === 'set') {
          // Set (overwrite) inventory
          const setInvQuery = `
            mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
              inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
                inventoryAdjustmentGroup {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const invRes = await fetch(`https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': SHOPIFY_TOKEN,
            },
            body: JSON.stringify({
              query: setInvQuery,
              variables: {
                idempotencyKey: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
                input: {
                  reason: "correction",
                  name: "available",
                  quantities: [
                    {
                      inventoryItemId: inventory_item_id,
                      locationId: primaryLocationId,
                      quantity: parseInt(quantity, 10),
                      changeFromQuantity: changeFromQuantity !== undefined && changeFromQuantity !== null ? parseInt(changeFromQuantity, 10) : 0
                    }
                  ]
                }
              }
            }),
          });
          const invData = await invRes.json();
          if (invData.errors || invData.data?.inventorySetQuantities?.userErrors?.length > 0) {
            const errors = invData.errors || invData.data.inventorySetQuantities.userErrors;
            return NextResponse.json({ error: `Inventory update failed: ${JSON.stringify(errors)}` }, { status: 400 });
          }
          results.inventory = invData.data;
        } else {
          // Adjust (add/delta) inventory
          const adjInvQuery = `
            mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
              inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
                inventoryAdjustmentGroup {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const invRes = await fetch(`https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': SHOPIFY_TOKEN,
            },
            body: JSON.stringify({
              query: adjInvQuery,
              variables: {
                idempotencyKey: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
                input: {
                  reason: "restock",
                  name: "available",
                  changes: [
                    {
                      inventoryItemId: inventory_item_id,
                      locationId: primaryLocationId,
                      delta: parseInt(quantity, 10),
                      changeFromQuantity: changeFromQuantity !== undefined && changeFromQuantity !== null ? parseInt(changeFromQuantity, 10) : 0
                    }
                  ]
                }
              }
            }),
          });
          const invData = await invRes.json();
          if (invData.errors || invData.data?.inventoryAdjustQuantities?.userErrors?.length > 0) {
            const errors = invData.errors || invData.data.inventoryAdjustQuantities.userErrors;
            return NextResponse.json({ error: `Inventory adjustment failed: ${JSON.stringify(errors)}` }, { status: 400 });
          }
          results.inventory = invData.data;
        }
      }

      return NextResponse.json({ success: true, results });
    }

    const { method = 'GET', endpoint, body, graphql, variables } = bodyData;
    let url, shopifyMethod, shopifyBody;

    if (graphql) {
      url = `https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`;
      shopifyMethod = 'POST';
      shopifyBody = JSON.stringify({ query: graphql, variables: variables || {} });
    } else {
      url = `https://${STORE_URL}/admin/api/${API_VERSION}/${endpoint}`;
      shopifyMethod = method;
      shopifyBody = body ? JSON.stringify(body) : undefined;
    }

    const response = await fetch(url, {
      method: shopifyMethod,
      headers: { 
        'X-Shopify-Access-Token': SHOPIFY_TOKEN, 
        'Content-Type': 'application/json' 
      },
      body: shopifyBody,
    });

    const data = await response.json();
    
    if (!response.ok || data.errors) {
      const errorMsg = data.errors ? (typeof data.errors === 'string' ? data.errors : JSON.stringify(data.errors)) : `Shopify API returned status ${response.status}`;
      return NextResponse.json({ error: errorMsg }, { status: response.status >= 400 ? response.status : 400 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const ping = searchParams.get('ping');

    // 1. Connection Ping
    if (ping) {
      return NextResponse.json({ status: 'ok', online: true });
    }

    const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
    const STORE_URL = process.env.STORE_URL;
    const API_VERSION = '2026-04';

    if (!SHOPIFY_TOKEN) {
      return NextResponse.json({ error: 'SHOPIFY_TOKEN environment variable is not set' }, { status: 500 });
    }
    if (!STORE_URL) {
      return NextResponse.json({ error: 'STORE_URL environment variable is not set' }, { status: 500 });
    }

    // 2. Sync Catalog
    if (action === 'syncCatalog') {
      let hasNextPage = true;
      let cursor: string | null = null;
      const catalogMap: Record<string, any> = {};

      while (hasNextPage) {
        const query = `
          query GetProducts($cursor: String) {
            products(first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  title
                  vendor
                  status
                  featuredImage {
                    url
                  }
                  metafields(first: 10) {
                    edges {
                      node {
                        namespace
                        key
                        value
                      }
                    }
                  }
                  variants(first: 50) {
                    edges {
                      node {
                        id
                        title
                        sku
                        barcode
                        inventoryQuantity
                        image {
                          url
                        }
                        inventoryItem {
                          id
                        }
                        metafields(first: 10) {
                          edges {
                            node {
                              namespace
                              key
                              value
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const res: Response = await fetch(`https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          },
          body: JSON.stringify({ query, variables: { cursor } }),
        });

        const data = await res.json();
        if (data.errors) {
          return NextResponse.json({ error: JSON.stringify(data.errors) }, { status: 400 });
        }

        const products = data.data?.products?.edges || [];
        for (const edge of products) {
          const product = edge.node;
          const productMetafields = product.metafields?.edges?.map((e: any) => e.node) || [];
          const pLocMeta = productMetafields.find((m: any) => (m.namespace === 'mzk' || m.namespace === 'mk') && m.key === 'cubicle_location');
          const pLoc = pLocMeta?.value || '';
          const vendor = product.vendor || '';
          const featuredImg = product.featuredImage?.url || '';
          const status = product.status ? product.status.toLowerCase() : 'active';

          const variants = product.variants?.edges || [];
          for (const vEdge of variants) {
            const variant = vEdge.node;
            const sku = variant.sku;
            if (!sku) continue;

            const barcode = variant.barcode || '';
            const variantMetafields = variant.metafields?.edges?.map((e: any) => e.node) || [];
            const vLocMeta = variantMetafields.find((m: any) => (m.namespace === 'mzk' || m.namespace === 'mk') && m.key === 'cubicle_location');
            const vLoc = vLocMeta?.value || '';
            const cubicle = vLoc || pLoc || '';
            const imageUrl = variant.image?.url || featuredImg || '';

            catalogMap[sku] = {
              sku,
              barcode,
              product_id: product.id,
              variant_id: variant.id,
              inventory_item_id: variant.inventoryItem?.id || '',
              title: variant.title === 'Default Title' ? product.title : `${product.title} - ${variant.title}`,
              cubicle: cubicle.trim(),
              vendor,
              inventory_quantity: variant.inventoryQuantity || 0,
              image_url: imageUrl,
              status,
              last_synced: Date.now()
            };
          }
        }

        hasNextPage = data.data?.products?.pageInfo?.hasNextPage || false;
        cursor = data.data?.products?.pageInfo?.endCursor || null;
      }

      return NextResponse.json(catalogMap);
    }

    // Debug environment variables
    if (action === 'debugEnv') {
      return NextResponse.json({
        hasToken: !!SHOPIFY_TOKEN,
        tokenPrefix: SHOPIFY_TOKEN ? SHOPIFY_TOKEN.substring(0, 10) + '...' : 'missing',
        storeUrl: STORE_URL || 'missing',
        apiVersion: API_VERSION
      });
    }

    // 4. Get Shipping Label PDF (Mock for test or fetch from Shopify)
    if (action === 'getLabelPDF') {
      const orderNumber = searchParams.get('order_number') || '1000';
      const cleanOrderNumber = orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`;
      
      let base64Pdf = '';
      let isMock = true;

      try {
        // Attempt to fetch actual shipping label from Shopify GraphQL API
        const query = `
          query getOrderFulfillmentLabels($queryStr: String!) {
            orders(first: 1, query: $queryStr) {
              nodes {
                id
                name
                fulfillments {
                  id
                  status
                  shippingLabel {
                    id
                    shippingDocuments(format: PDF) {
                      url
                    }
                  }
                }
              }
            }
          }
        `;

        const res = await fetch(`https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          },
          body: JSON.stringify({ query, variables: { queryStr: `name:${cleanOrderNumber}` } }),
        });

        const data = await res.json();
        const orderNode = data?.data?.orders?.nodes?.[0];
        const fulfillments = orderNode?.fulfillments || [];
        
        let labelUrl = '';
        for (const f of fulfillments) {
          const docs = f.shippingLabel?.shippingDocuments || [];
          if (docs.length > 0 && docs[0].url) {
            labelUrl = docs[0].url;
            break;
          }
        }

        if (labelUrl) {
          const pdfRes = await fetch(labelUrl);
          if (pdfRes.ok) {
            const arrayBuffer = await pdfRes.arrayBuffer();
            base64Pdf = Buffer.from(arrayBuffer).toString('base64');
            isMock = false;
          } else {
            console.warn(`Failed to fetch PDF data from labelUrl: ${labelUrl}, status: ${pdfRes.status}`);
          }
        }
      } catch (e) {
        console.error("Failed to query/fetch Shopify shipping label:", e);
      }

      // If no real label PDF was retrieved, fall back to generating the mock PDF template
      if (!base64Pdf) {
        // Dynamic Helvetica PDF stream to display custom order info on thermal printer
        const pdfContent = `BT
  /F1 18 Tf
  20 390 Td
  (MOCK SHIPPING LABEL) Tj
  /F1 12 Tf
  0 -30 Td
  (Order Number: ${cleanOrderNumber}) Tj
  0 -20 Td
  (Status: Audited & Packed) Tj
  0 -30 Td
  (Stallion Fulfillment Simulator) Tj
  /F1 10 Tf
  0 -40 Td
  (BARCODE: *${cleanOrderNumber.replace('#', '')}*) Tj
  0 -20 Td
  (Package Desk: Condo Shipping) Tj
  0 -40 Td
  (Thank you for using Mazonkiki WMS!) Tj
ET`;

        const pdfLength = pdfContent.length;
        
        const pdfTemplate = `%PDF-1.4
1 0 obj
  << /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
  << /Type /Pages /Kids [ 3 0 R ] /Count 1 >>
endobj
3 0 obj
  << /Type /Page /Parent 2 0 R /MediaBox [ 0 0 288 432 ] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
  << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
  << /Length ${pdfLength} >>
stream
${pdfContent}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000059 00000 n 
0000000115 00000 n 
0000000249 00000 n 
0000000318 00000 n 
trailer
  << /Size 6 /Root 1 0 R >>
startxref
${318 + 15 + pdfLength + 10}
%%EOF`;

        base64Pdf = Buffer.from(pdfTemplate, 'binary').toString('base64');
        isMock = true;
      }
      
      const shouldPushQueue = searchParams.get('push_queue') === 'true';
      if (shouldPushQueue) {
        try {
          const shopId = await getShopId(STORE_URL, SHOPIFY_TOKEN);
          if (shopId) {
            const queue = await getPrintQueue(STORE_URL, SHOPIFY_TOKEN, shopId);
            const newJob = {
              id: 'job-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
              order_number: cleanOrderNumber,
              pdf: base64Pdf,
              timestamp: Date.now()
            };
            queue.push(newJob);
            if (queue.length > 20) {
              queue.shift();
            }
            await setPrintQueue(STORE_URL, SHOPIFY_TOKEN, shopId, queue);
          }
        } catch (e) {
          console.error("Failed to push print job to remote Shopify metafield queue:", e);
        }
      }
      
      return NextResponse.json({
        success: true,
        order_number: cleanOrderNumber,
        pdf: base64Pdf,
        isMock
      });
    }

    // Poll print queue from Shopify shop metafields
    if (action === 'pollPrintJobs') {
      try {
        const shopId = await getShopId(STORE_URL, SHOPIFY_TOKEN);
        if (shopId) {
          const queue = await getPrintQueue(STORE_URL, SHOPIFY_TOKEN, shopId);
          return NextResponse.json({ jobs: queue });
        }
        return NextResponse.json({ jobs: [] });
      } catch (e: any) {
        console.error("Failed to poll print queue:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
      }
    }

    // 3. Single Order Lookup
    if (action === 'getOrder') {
      const orderNumber = searchParams.get('order_number');
      if (!orderNumber) {
        return NextResponse.json({ error: 'order_number parameter is required' }, { status: 400 });
      }

      const query = `
        query GetOrders($queryStr: String!) {
          orders(first: 5, query: $queryStr) {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                displayFulfillmentStatus
                shippingAddress {
                  name
                }
                billingAddress {
                  name
                }
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      sku
                      variant {
                        id
                        barcode
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const queryStr = `name:${orderNumber} OR name:#${orderNumber} OR ${orderNumber}`;

      const res: Response = await fetch(`https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        },
        body: JSON.stringify({ query, variables: { queryStr } }),
      });

      const data = await res.json();
      if (data.errors) {
        return NextResponse.json({ error: JSON.stringify(data.errors) }, { status: 400 });
      }

      const edges = data.data?.orders?.edges || [];
      if (edges.length === 0) {
        return NextResponse.json({ error: `Order not found: ${orderNumber}` }, { status: 404 });
      }

      const orderNode = edges[0].node;
      const lineItems = orderNode.lineItems.edges.map((e: any) => {
        const item = e.node;
        return {
          sku: item.sku || '',
          barcode: item.variant?.barcode || '',
          title: item.title,
          qty: item.quantity,
          cubicle: '',
          picked: false
        };
      });

      const formattedOrder = {
        order_id: orderNode.id,
        order_number: orderNode.name,
        customer_name: orderNode.shippingAddress?.name || orderNode.billingAddress?.name || 'Guest Customer',
        created_at: orderNode.createdAt,
        line_items: lineItems,
        status: 'pending',
        synced_at: Date.now()
      };

      return NextResponse.json(formattedOrder);
    }

    // 4. Batch Unfulfilled Orders Lookup
    if (action === 'getUnfulfilledOrders') {
      const query = `
        query GetUnfulfilledOrders {
          orders(first: 50, query: "fulfillment_status:unfulfilled", sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                displayFulfillmentStatus
                shippingAddress {
                  name
                }
                billingAddress {
                  name
                }
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      sku
                      variant {
                        id
                        barcode
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const res: Response = await fetch(`https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();
      if (data.errors) {
        return NextResponse.json({ error: JSON.stringify(data.errors) }, { status: 400 });
      }

      const edges = data.data?.orders?.edges || [];
      const formattedOrders = edges.map((edge: any) => {
        const node = edge.node;
        return {
          order_id: node.id,
          order_number: node.name,
          customer_name: node.shippingAddress?.name || node.billingAddress?.name || 'Guest Customer',
          created_at: node.createdAt,
          line_items: node.lineItems.edges.map((e: any) => ({
            sku: e.node.sku || '',
            barcode: e.node.variant?.barcode || '',
            title: e.node.title,
            qty: e.node.quantity,
            cubicle: '',
            picked: false
          })),
          status: 'pending',
          synced_at: Date.now()
        };
      });

      return NextResponse.json(formattedOrders);
    }

    return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Helper functions for remote printing queue via Shopify Shop metafields
async function getShopId(storeUrl: string, token: string) {
  const query = `
    query {
      shop {
        id
      }
    }
  `;
  const res = await fetch(`https://${storeUrl}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  return data.data?.shop?.id;
}

async function getPrintQueue(storeUrl: string, token: string, shopId: string) {
  const query = `
    query GetPrintQueue($shopId: ID!) {
      node(id: $shopId) {
        ... on Shop {
          metafield(namespace: "mzk", key: "print_queue") {
            value
          }
        }
      }
    }
  `;
  const res = await fetch(`https://${storeUrl}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables: { shopId } }),
  });
  const data = await res.json();
  const valueStr = data.data?.node?.metafield?.value;
  if (!valueStr) return [];
  try {
    return JSON.parse(valueStr);
  } catch (e) {
    return [];
  }
}

async function setPrintQueue(storeUrl: string, token: string, shopId: string, queue: any[]) {
  const mutation = `
    mutation SetPrintQueue($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors {
          field
          message
        }
      }
    }
  `;
  const res = await fetch(`https://${storeUrl}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: "mzk",
            key: "print_queue",
            type: "json",
            value: JSON.stringify(queue)
          }
        ]
      }
    }),
  });
  return await res.json();
}
