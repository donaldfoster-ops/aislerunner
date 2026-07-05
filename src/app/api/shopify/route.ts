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
                  productLocation: metafield(namespace: "mzk", key: "cubicle_location") {
                    value
                  }
                  variants(first: 50) {
                    edges {
                      node {
                        id
                        title
                        sku
                        barcode
                        inventoryQuantity
                        variantLocation: metafield(namespace: "mzk", key: "cubicle_location") {
                          value
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
          const pLoc = product.productLocation?.value || '';
          const vendor = product.vendor || '';

          const variants = product.variants?.edges || [];
          for (const vEdge of variants) {
            const variant = vEdge.node;
            const sku = variant.sku;
            if (!sku) continue;

            const barcode = variant.barcode || '';
            const vLoc = variant.variantLocation?.value || '';
            const cubicle = vLoc || pLoc || '';

            catalogMap[sku] = {
              sku,
              barcode,
              product_id: product.id,
              variant_id: variant.id,
              title: variant.title === 'Default Title' ? product.title : `${product.title} - ${variant.title}`,
              cubicle: cubicle.trim(),
              vendor,
              inventory_quantity: variant.inventoryQuantity || 0,
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

      const base64Pdf = Buffer.from(pdfTemplate, 'binary').toString('base64');
      
      return NextResponse.json({
        success: true,
        order_number: cleanOrderNumber,
        pdf: base64Pdf
      });
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
