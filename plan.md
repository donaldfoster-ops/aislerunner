# SearchLift Shopify — Product Specification and Roadmap

## 1. Product Vision
SearchLift Shopify is the connected Shopify execution and automation companion to SearchLift. It ingests public SearchLift audit findings, maps detected structural and contextual issues to safe Shopify programmatic fix modules, drives Shopify Agentic Storefront and Taxonomy alignment, enforces conversational data completeness, and automates ongoing visibility workflows.

**Core Positioning:**
SearchLift Shopify is not a generic SEO app. It is an audit-driven AI/search visibility remediation and Shopify Agentic commerce readiness platform. It optimizes backend architecture, schema, and meta-data layers so that emerging LLM search crawlers, semantic retrieval engines, and multi-agent systems can easily understand, trust, double-check, and natively recommend a store’s products.

## 2. Relationship to SearchLift Core

```text
+------------------------------------+
|         SEARCHLIFT CORE            |
| (Public Scan & Full Deep Dive PDF) |
+-----------------+------------------+
                  |
                  | Exports Report Data (Issues, Alt Text, Context)
                  v
+-----------------+------------------+
|       SEARCHLIFT SHOPIFY           |
| (Requires Admin API Access + OAuth)|
+-----------------+------------------+
                  |
                  +--> Layer 1: Ingestion & Parser
                  +--> Layer 2: Safe Fix Center (Programmatic Updates)
                  +--> Layer 3: Agentic Optimization & Liquid Engineering
```

**A. SearchLift Core (The Engine)**
- Public-facing multi-platform web discovery audit (No Shopify credentials needed).
- Analyzes store surfaces from a crawler's perspective.
- Generates the comprehensive GEO Readiness Report and AI Commerce Readiness Report.
- Acts as the unified source of truth for issue IDs, missing context signatures, and priority weighting.

**B. SearchLift Shopify (The Executor — This Repository)**
- Embedded Shopify App running on Shopify OAuth and Admin API hooks.
- Programmatically consumes Core JSON/PDF report findings.
- Resolves anomalies safely via bulk preview screens and granular API writes.
- Builds advanced developer layout extensions (llms.txt, custom schema routing) natively within Shopify parameters.

## 3. Existing & Target Capabilities Inventory

| Capability Module | Status | Technical Implementation Mechanism |
| :--- | :--- | :--- |
| Shopify API Bridge | Production | `src/app/api/shopify/route.ts` |
| AI Proxy Integration | Production | `src/app/api/claude/route.ts` |
| safeShopify API Wrapper | Production | `src/lib/safeShopify.ts` (Ensures least-destructive writes) |
| PDF Report Ingestion | Production | `src/app/api/parse-pdf/route.ts` |
| Image Alt Text Fixer | Production | GraphQL `productUpdate` on Media array nodes |
| Organization Schema | Production | Theme App Extension Block (Liquid injection) |
| Product Schema Preview | Production | Client-side markup analyzer block (`AuditTab.tsx`) |
| State Persistence & Rollback | Local Only | Moving to database persistence layer |
| Taxonomy / Metafield Auditor | New Feature | GraphQL mutations on `shopify.` taxonomy namespace |
| Liquid llms.txt Router | New Feature | Liquid alternate templates + Shopify Navigation Redirection |
| FAQ Clipboard Seed Engine | New Feature | Contextual Q&A cards with one-click clipboard copy-out |
| Autoblog / Trend Content | Scheduled | Phase 2 Growth Layer |
| Pinterest Promotion Sync | Scheduled | Phase 2 Growth Layer |

## 4. Product Architecture

**Layer 1 — SearchLift Audit Ingestion Layer**
- **Unified Parsing Engine:** Accepts programmatic JSON data or uploads of the SearchLift Deep Dive PDF.
- **Entity Mapping Pipeline:** Extracts prioritized issue tokens, mapping specific data fragments (such as generated Alt Text arrays or missing material flags) directly into actionable remediation state structures.
- **System of Record:** Maintains strict relationship tracking between the source issue ID, the target Shopify Resource ID (Product, Image, or Theme), and state values before/after execution.

**Layer 2 — SearchLift Shopify Fix Center**
- **Programmatic Remediation Environment:** Provides interactive staging zones where merchants accept, edit, or reject text updates before writing them live.
- **Structural Optimization Layer:** Cleans up code conflicts, injects foundational metadata blocks, fixes sitewide accessibility tags, and repairs technical inconsistencies that degrade search system trust.

**Layer 3 — Shopify Agentic Mapping Layer**
- **Agentic Storefront Configuration:** An optimization environment designed to make products syntactically discoverable by consumer tools like ChatGPT Search, Microsoft Copilot, and the Shopify Shop App.
- **Taxonomy Calibration:** Automates standard data structures, fields, and attribute groupings, replacing unoptimized content matrices with rich conversational attributes.
- **AI Discovery Ingestion Enhancements:** Provides custom context spaces specifically engineered for semantic vector matching, resolving traditional search parsing bottlenecks.

## 5. Fix Center & Agentic Module Roadmap

```text
                                  FIX CENTER ROADMAP MAP
  
     LAYER 1: PARSING                LAYER 2: REMEDIATION             LAYER 3: AGENTIC RADAR
 +-----------------------+        +-----------------------+        +-----------------------+
 | Ingest Deep Dive PDF/ |--------> Alt Text Batch Fixer  |--------> Taxonomy Injector     |
 | JSON Payload          |        | (Media Node API)      |        | (shopify. standard)   |
 +-----------------------+        +-----------------------+        +-----------------------+
                                              |                                |
                                              v                                v
                                  +-----------------------+        +-----------------------+
                                  | Schema Injector Block |        | Custom Context Fields |
                                  | (Theme App Extensions)|        | (custom. namespaces)  |
                                  +-----------------------+        +-----------------------+
                                                                              |
                                                                              v
                                                                   +-----------------------+
                                                                   | Alternate Liquid Route|
                                                                   | (/llms.txt Generation)|
                                                                   +-----------------------+
```

**A. Report Parser & Ingestion System**
- **Input Handling:** Intercepts incoming report files. Extracts specific issue tracking blocks, mapping them directly to dedicated code interfaces.
- **Safety Boundary:** If an ingested issue code lacks a matching internal execution class, flag it within the checklist UI as an instructional guide rather than building runtime mock features.

**B. Alt Text Optimization Module**
- **Execution Strategy:** Processes images identified as missing tags. Pulls custom alt text strings calculated by the SearchLift Core vision pipeline (e.g., matching Page 19 image snapshots with detailed stylistic narratives).
- **Write Protocol:** Uses specific GraphQL endpoints on individual Media items. Never rewrites the primary product media arrays to protect production assets from corrupted indexing during API drops.
- **Control Loop:** Requires explicit batch confirmation in the UI. Offers immediate rollback via stored history.

**C. AI Product Context Metafields (Agentic Ingestion)**
- **Execution Strategy:** Builds an alternative product data pipeline specifically optimized for semantic discovery engines.
- **Target Definitions:** Programmatically registers the following specialized metafield names under custom namespaces via the Admin API:
  - `custom.ai_summary` (Plain language text summary built without promotional jargon)
  - `custom.ai_questions` (Pre-calculated prompt-and-response text trees capturing complex customer queries)
  - `custom.agentic_description` (Un-stylized attribute arrays structured for LLM intake layers)
- **Tone Policy:** Content matches neutral, informational standards to prevent conversational discovery agents from filtering out the product as spammy marketing text.

**D. Standard Taxonomy Attribute Sync**
- **Execution Strategy:** Maps contextual product data (such as 100% silk fabric composition, dimensions, care directions, or country of origin) hidden inside generic description text blocks into Shopify's unified data ecosystem.
- **Taxonomy Logic:** Resolves "Uncategorized" products by assigning Shopify `StandardProductCategory` definitions. Once unlocked, the app automatically pushes extracted details into the native system namespace attributes (e.g., `shopify.fabric`, `shopify.color`, `shopify.target-gender`).
- **Metaobject Verification:** Detects if dynamic attribute selections map to predefined store metaobjects. Programmatically registers missing validation properties before updating target items.

**E. Organization Schema Integration**
- **Execution Strategy:** Resolves missing identity validation indicators by verifying homepage code. Generates clean JSON-LD metadata markup modeling brand location, verified support channels, and operational properties.
- **Deployment Architecture:** Implemented strictly as an App Embed Block via Theme App Extensions. Eliminates the risk of theme code pollution, ensures seamless theme template switching, and enables instant uninstallation cleanup.

**F. Catalog Health & Consistency Monitor**
- **Execution Strategy:** Flags data errors that cause conversational search agents to drop purchase recommendations, using findings from the ingested audit data.
- **Verification Vectors:**
  - **Conflicting Availability Signals:** Catches inconsistencies where front-end layout elements (e.g., generic Low Stock messages) contradict variant stock data arrays.
  - **Price Schema Inconsistencies:** Flags invalid $0.00 pricing structures or variant test placeholders before they confuse automated transaction systems.

**G. Knowledge Base Context Generator**
- **Execution Strategy:** Resolves missing FAQ parameters noted in the audit report (such as hidden or broken scripted elements).
- **Operational Bridge:** Because the internal Shopify Knowledge Base app is a closed platform without public write APIs, the system transforms into an optimization bridge. It generates beautifully formatted, neutral, high-intent answer cards alongside a one-click "Copy to Clipboard" trigger and deep-links directly to the merchant's active Shopify Knowledge Base panel (`/apps/shopify-knowledge-base`).

**H. Native /llms.txt Template Router**
- **Execution Strategy:** Generates a structured system map designed for conversational search bots checking the store root directory.
- **Architectural Workaround:**
  - Leverages the `write_themes` API to create an alternate liquid template named `templates/index.llms.txt.liquid`. This file outputs a clean plain-text response containing a concise brand summary, collection indices, active store policy data, and high-intent product parameters.
  - Instructs the merchant via an app dashboard step to establish a standard Shopify URL Redirect mapping requests from `/llms.txt` directly to `/?view=llms.txt`.

**I. SEO Metadata Validation Layer**
- **Execution Strategy:** Evaluates standard front-end fields (Page Titles, Meta Descriptions, and Open Graph layouts) using Shopify's native properties to guarantee semantic text parsing alignment.

**J. Liquid Isolation & Data Protection Systems**
- **Isolation Policies:** Forbids direct editing of raw theme files. Employs dry-run validation simulations before any asset push. Displays side-by-side file differences when modifying template sections, and backs up historical file properties to a permanent storage backend.

**K. Fix Logs & Central Rollback Architecture**
- **Database Infrastructure:** Powered by Supabase. Captures execution profiles to support single-click data rollbacks:
```sql
CREATE TABLE fix_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    source_report_id UUID,
    issue_id TEXT NOT NULL,
    remediation_module TEXT NOT NULL,
    resource_type TEXT NOT NULL, -- 'PRODUCT', 'MEDIA', 'THEME_ASSET'
    resource_id TEXT NOT NULL,
    previous_payload JSONB NOT NULL,
    updated_payload JSONB NOT NULL,
    execution_status TEXT NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 6. Technical Implementation Blueprint

**GraphQL Sample: Fetching & Updating Unlocked Standard Taxonomy Attributes**
To implement Module 5.D, SearchLift Shopify maps raw text insights to native system definitions using the following API patterns:

**Phase 1: Querying Category Constraints and Unlocked Attributes**
```graphql
query GetProductTaxonomyAndAttributes($productId: ID!) {
  product(id: $productId) {
    id
    title
    category {
      id
      name
    }
    # Fetches standard system attributes unlocked by the category assignment
    categoryAttributeValues {
      attribute {
        id
        name
        type
      }
      metafield {
        namespace
        key
        value
      }
    }
  }
}
```

**Phase 2: Writing Remediation Strings into shopify. Namespaces**
```graphql
mutation BatchRemediateTaxonomyAttributes($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      id
      namespace
      key
      value
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables Payload Example:**
```json
{
  "metafields": [
    {
      "ownerId": "gid://shopify/Product/9876543210",
      "namespace": "shopify",
      "key": "fabric",
      "value": "100% Mulberry Silk"
    },
    {
      "ownerId": "gid://shopify/Product/9876543210",
      "namespace": "shopify",
      "key": "target-gender",
      "value": "Female"
    }
  ]
}
```

## 7. Shopify API Scopes Matrix

To pass marketplace checks while supporting advanced agentic data alignment, the system uses a strict principle of least privilege:
- `read_products` / `write_products`: Required to alter image alt properties, read structural details, modify catalog taxonomies, and populate conversational metadata blocks.
- `read_themes` / `write_themes`: Required to place alternate template layouts into active development folders for the `/llms.txt` asset workaround.
- **Excluded Scopes:** Completely avoids customer tracking, financial analytics, or transaction order hooks, speeding up compliance clearance.

## 8. App Store Compliance & Review Rules

- **OAuth Execution Standards:** Uses standard Shopify OAuth flows, using the App Bridge setup to manage layout rendering within the administration panel.
- **Mandatory Webhook Infrastructure:** Configures all mandatory data protection webhooks (`customers/data_request`, `customers/redact`, `shop/redact`).
- **Operational Constraints:** Never applies automated updates without an explicit manual confirmation step. Never overwrites media asset nodes directly, and enforces staging dry-runs for single-item tests before unlocking batch changes.
- **Marketing Claims Protection:** Avoids phrasing that guarantees absolute ranking status or promises specific visibility positioning in search networks. All functions are presented strictly as optimization, standardization, and readiness tasks.
