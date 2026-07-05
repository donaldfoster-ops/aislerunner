"use client";
import { useState, useEffect } from 'react';
import { shopify, claude } from '@/lib/api';

export default function AuditTab({ reportData }: { reportData?: any }) {
  const [activeIssue, setActiveIssue] = useState('alttext');
  const [status, setStatus] = useState('');
  const [step, setStep] = useState(1);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [rollbacks, setRollbacks] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('auditRollbacks');
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });

  // Persist rollbacks to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auditRollbacks', JSON.stringify(rollbacks));
    }
  }, [rollbacks]);

  const [productFilter, setProductFilter] = useState('active');

  const [schemaStatus, setSchemaStatus] = useState('');
  const [schemaSuggestions, setSchemaSuggestions] = useState<any[]>([]);
  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);

  const [agenticSuggestions, setAgenticSuggestions] = useState<any[]>([]);
  const [isGeneratingAgentic, setIsGeneratingAgentic] = useState(false);
  const [agenticStatus, setAgenticStatus] = useState('');
  const [approvedCategories, setApprovedCategories] = useState<Record<string, boolean>>({});
  const [overrideCategories, setOverrideCategories] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'card' | 'worksheet'>('card');
  const [faqSuggestions, setFaqSuggestions] = useState<any[]>([]);
  const [isGeneratingFaq, setIsGeneratingFaq] = useState(false);
  const [faqStatus, setFaqStatus] = useState('');
  const [collections, setCollections] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [reviewAll, setReviewAll] = useState(false);
  const [completedFaqProducts, setCompletedFaqProducts] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('completedFaqProducts');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    }
    return new Set();
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('completedFaqProducts', JSON.stringify(Array.from(completedFaqProducts)));
    }
  }, [completedFaqProducts]);

  useEffect(() => {
    if (activeIssue === 'faq-clipboard' && collections.length === 0) {
      fetchCollections();
    }
  }, [activeIssue]);

  const fetchCollections = async () => {
    try {
      const q = `
        query {
          collections(first: 50) {
            edges {
              node {
                id
                title
              }
            }
          }
        }
      `;
      const res = await shopify({ graphql: q });
      if (res.data?.collections?.edges) {
        const cols = res.data.collections.edges.map((e: any) => ({ id: e.node.id, title: e.node.title }));
        setCollections(cols);
        if (cols.length > 0) setSelectedCollection(cols[0].id);
      }
    } catch (e) {
      console.error("Failed to fetch collections", e);
    }
  };

  const updateAgenticField = (productId: string, section: 'shopifyAgenticFields' | 'supplementalSearchLiftFields', key: string, value: string) => {
    setAgenticSuggestions(prev => prev.map(s => {
      if (s.id !== productId) return s;
      return {
        ...s,
        [section]: {
          ...s[section],
          [key]: {
            ...s[section][key],
            value: value
          }
        }
      };
    }));
  };

  const copyToNextRow = (productId: string, section: 'shopifyAgenticFields' | 'supplementalSearchLiftFields', key: string, value: string) => {
    const currentCategory = overrideCategories[productId] || agenticSuggestions.find(s => s.id === productId)?.shopifyAgenticFields['shopify.product_category']?.value;
    const sameCategoryProducts = agenticSuggestions.filter(s => (overrideCategories[s.id] || s.shopifyAgenticFields['shopify.product_category']?.value) === currentCategory);
    
    const currentIndex = sameCategoryProducts.findIndex(s => s.id === productId);
    if (currentIndex >= 0 && currentIndex < sameCategoryProducts.length - 1) {
      const nextProductId = sameCategoryProducts[currentIndex + 1].id;
      updateAgenticField(nextProductId, section, key, value);
    }
  };

  const generateProductSchema = async () => {
    setIsGeneratingSchema(true);
    setSchemaStatus('⏳ Fetching products for schema analysis...');
    setSchemaSuggestions([]);

    try {
      const data = await shopify({ method: 'GET', endpoint: `products.json?status=${productFilter}&limit=5&fields=id,title,handle,body_html,images,variants` });
      const products = data.products || [];
      if (!products.length) { setSchemaStatus('⚠️ No products found in your store'); return; }

      setSchemaStatus(`✅ Found ${products.length} products. Generating Schema markup using AI...`);

      const newSuggestions: any[] = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        setSchemaStatus(`🤖 Generating schema for product ${i + 1} of ${products.length}: ${p.title}...`);
        
        const prompt = `Generate comprehensive Product JSON-LD schema for this item. Include name, description, image, sku, brand (Mazonkiki), and offers.
Product Data:
Title: ${p.title}
Handle: ${p.handle}
Description: ${p.body_html?.substring(0, 500) || p.title}
Image: ${p.images?.[0]?.src || ''}
Price: ${p.variants?.[0]?.price || '0.00'}
URL: https://mazonkiki.com/products/${p.handle}

Return ONLY the valid JSON-LD structure inside a script tag, nothing else.`;

        try {
          const claudeData = await claude({
            messages: [{ role: 'user', content: prompt }],
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            system: 'You generate valid JSON-LD schema for e-commerce products. Return ONLY the script tag without markdown wrapping.'
          });

          const clean = claudeData.text.replace(/```html|```json|```/g, '').trim();
          newSuggestions.push({
             id: p.id,
             title: p.title,
             image: p.images?.[0]?.src,
             schema: clean
          });
        } catch (e) {
          console.error("Schema gen failed for", p.title);
        }
      }
      setSchemaSuggestions(newSuggestions);
      setSchemaStatus(`✅ Generated schema for ${newSuggestions.length} products! (Preview Only)`);
    } catch (e: any) {
      setSchemaStatus(`❌ Error: ${e.message}`);
    }
    setIsGeneratingSchema(false);
  };

  const generateAgenticFields = async () => {
    setIsGeneratingAgentic(true);
    setAgenticStatus('⏳ Fetching products for Agentic extraction...');
    setAgenticSuggestions([]);

    try {
      const data = await shopify({ method: 'GET', endpoint: `products.json?status=${productFilter}&limit=10&fields=id,title,handle,body_html` });
      const products = data.products || [];
      if (!products.length) { setAgenticStatus('⚠️ No products found in your store'); setIsGeneratingAgentic(false); return; }

      setAgenticStatus(`✅ Found ${products.length} products. Extracting Metafields using AI...`);

      const newSuggestions: any[] = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        setAgenticStatus(`🤖 Extracting Agentic fields for product ${i + 1} of ${products.length}: ${p.title}...`);
        
        const prompt = `Extract and structure product information for Shopify Agentic/Catalog readiness.
Populate Shopify-defined Agentic fields where supported by the product data.
Use SearchLift supplemental fields only when no Shopify-defined target exists.
Product Data:
Title: ${p.title}
Handle: ${p.handle}
Description: ${p.body_html || p.title}

Return ONLY a strict JSON object with this exact structure. Do not use markdown blocks like \`\`\`json.
{
  "shopifyAgenticFields": {
    "shopify.product_category": { "value": "Standard Shopify category string", "confidence": "high/medium/low", "source": "inferred", "needsReview": false, "fieldType": "catalog_mapping" },
    "shopify.material": { "value": "extracted material or null", "confidence": "high/medium/low", "source": "description or inferred", "needsReview": false, "fieldType": "category_attribute" },
    "shopify.color": { "value": "extracted color or null", "confidence": "high/medium/low", "source": "", "needsReview": false, "fieldType": "category_attribute" },
    "shopify.pattern": { "value": "extracted pattern or null", "confidence": "high/medium/low", "source": "", "needsReview": false, "fieldType": "category_attribute" },
    "shopify.size": { "value": "extracted size/dimensions or null", "confidence": "high/medium/low", "source": "", "needsReview": false, "fieldType": "category_attribute" },
    "shopify.care_guide": { "value": "extracted care instructions or null", "confidence": "high/medium/low", "source": "", "needsReview": false, "fieldType": "category_attribute" },
    "shopify.fit": { "value": "extracted fit notes or null", "confidence": "high/medium/low", "source": "", "needsReview": false, "fieldType": "category_attribute" },
    "shopify.country_of_origin": { "value": "extracted country or null", "confidence": "high/medium/low", "source": "", "needsReview": false, "fieldType": "verified_shopify_defined" },
    "shopify.gender": { "value": "extracted gender or null", "confidence": "high/medium/low", "source": "", "needsReview": false, "fieldType": "verified_shopify_defined" },
    "shopify.age_group": { "value": "extracted age group or null", "confidence": "high/medium/low", "source": "", "needsReview": false, "fieldType": "verified_shopify_defined" }
  },
  "supplementalSearchLiftFields": {
    "custom.ai_summary": { "value": "A neutral, non-salesy AI summary grounded in the title and description.", "confidence": "high", "source": "generated", "needsReview": false, "fieldType": "searchlift_custom" },
    "custom.ai_questions": { "value": "[\"FAQ 1?\", \"FAQ 2?\", \"FAQ 3?\"]", "confidence": "high", "source": "generated", "needsReview": false, "fieldType": "searchlift_custom" },
    "custom.occasion": { "value": "extracted occasion or null", "confidence": "high/medium/low", "source": "", "needsReview": false, "fieldType": "searchlift_custom" }
  }
}

Rules:
- Do not fabricate factual claims.
- If material, care, dimensions, origin, gender, age group, or other factual attributes are not explicitly present, return null and needsReview: true.
- AI-generated summaries/questions must be neutral, non-salesy, and grounded in product title/body_html/context.`;

        try {
          const claudeData = await claude({
            messages: [{ role: 'user', content: prompt }],
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            system: 'You are a structured data extractor. Return only raw, valid JSON. Do not wrap in markdown or backticks.'
          });

          // Strict JSON Validation
          let clean = claudeData.text.replace(/```json|```/g, '').trim();
          if (!clean.startsWith('{') || !clean.endsWith('}')) {
             throw new Error("Claude did not return a valid JSON object.");
          }
          
          let parsed;
          try {
            parsed = JSON.parse(clean);
          } catch (err: any) {
             throw new Error(`JSON parsing failed: ${err.message}`);
          }
          
          newSuggestions.push({
             id: p.id,
             title: p.title,
             handle: p.handle,
             descriptionExcerpt: (p.body_html || '').substring(0, 150).replace(/<[^>]+>/g, '') + '...',
             shopifyAgenticFields: parsed.shopifyAgenticFields || {},
             supplementalSearchLiftFields: parsed.supplementalSearchLiftFields || {}
          });
        } catch (e: any) {
          console.error("Agentic extraction failed for", p.title, e);
          setAgenticStatus(`❌ JSON Error on ${p.title}: ${e.message}`);
          setIsGeneratingAgentic(false);
          return; // Stop on JSON failure
        }
      }
      setAgenticSuggestions(newSuggestions);
      setAgenticStatus(`✅ Extracted fields for ${newSuggestions.length} products! (Preview Only)`);
    } catch (e: any) {
      setAgenticStatus(`❌ Error: ${e.message}`);
    }
    setIsGeneratingAgentic(false);
  };

  let issues = reportData?.issues || [
    { id: 'alttext', title: 'Missing Image Alt Text', desc: "AI systems can't interpret images without descriptive alt text.", severity: 'HIGH', icon: '🖼️' },
    { id: 'titles', title: 'Generic Product Titles', desc: "Titles lack semantic richness for LLM discovery.", severity: 'MED', icon: '📝' }
  ];

  if (!issues.some((i: any) => i.title.toLowerCase().includes('agentic'))) {
    issues = [...issues, { id: 'agentic-fields', title: 'Shopify Agentic Mapping Prep', desc: 'Prepared for Shopify Agentic/Catalog Mapping workflows.', severity: 'HIGH', icon: '🤖' }];
  }

  if (!issues.some((i: any) => i.id === 'faq-clipboard')) {
    issues = [...issues, { id: 'faq-clipboard', title: 'FAQ Clipboard Engine', desc: 'Format AI questions into Knowledge Base ready copy-out cards.', severity: 'MED', icon: '📋' }];
  }

  const generateFaqs = async () => {
    setIsGeneratingFaq(true);
    setFaqStatus('⏳ Fetching products for Knowledge Base context...');
    setFaqSuggestions([]);

    try {
      let products = [];
      if (selectedCollection) {
        setFaqStatus('⏳ Fetching products in selected collection...');
        const q = `
          query getCollectionProducts($id: ID!) {
            collection(id: $id) {
              products(first: 20) {
                edges {
                  node {
                    id
                    title
                    handle
                    descriptionHtml
                  }
                }
              }
            }
          }
        `;
        const res = await shopify({ graphql: q, variables: { id: selectedCollection } });
        if (res.data?.collection?.products?.edges) {
          products = res.data.collection.products.edges.map((e: any) => ({
            id: e.node.id.split('/').pop(), // Get numeric ID for consistency
            title: e.node.title,
            handle: e.node.handle,
            body_html: e.node.descriptionHtml
          }));
        }
      } else {
        const data = await shopify({ method: 'GET', endpoint: `products.json?status=${productFilter}&limit=10&fields=id,title,handle,body_html` });
        products = data.products || [];
      }

      if (!products.length) { setFaqStatus('⚠️ No products found in this collection'); setIsGeneratingFaq(false); return; }

      // Filtering logic
      let productsToProcess = products;
      let skippedCount = 0;
      if (!reviewAll) {
        productsToProcess = products.filter((p: any) => !completedFaqProducts.has(p.id.toString()));
        skippedCount = products.length - productsToProcess.length;
      }

      if (productsToProcess.length === 0) {
        setFaqStatus(`✅ Skipped ${skippedCount} products (already processed). No new products to process in this collection.`);
        setIsGeneratingFaq(false);
        return;
      }

      setFaqStatus(`✅ Found ${productsToProcess.length} products to process (${skippedCount} skipped). Generating...`);

      const newSuggestions: any[] = [];
      for (let i = 0; i < productsToProcess.length; i++) {
        const p = productsToProcess[i];
        setFaqStatus(`🤖 Generating FAQs for product ${i + 1} of ${productsToProcess.length}: ${p.title}...`);
        
        const prompt = `Act as an expert eCommerce copywriter building a Knowledge Base. Generate 3-5 high-intent, conversational Frequently Asked Questions (with answers) based on the following product data.
Product Data:
Title: ${p.title}
Handle: ${p.handle}
Description: ${p.body_html || p.title}

Return ONLY a strict JSON array of objects with "q" and "a" properties. Do not use markdown blocks like \`\`\`json.
[
  { "q": "What is this product made of?", "a": "It is crafted from..." }
]

Rules:
- Answers must be extremely helpful, neutral, and directly answer the question.
- STRICT NO HALLUCINATION POLICY: Do NOT fabricate factual claims. 
- CARE INSTRUCTIONS: Do NOT generate questions or answers regarding washing, cleaning, or care instructions UNLESS they are explicitly stated in the Description text provided above. If you cannot see the care instructions in the text, do not guess them based on the material or category.`;

        try {
          const claudeData = await claude({
            messages: [{ role: 'user', content: prompt }],
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            system: 'You are a Knowledge Base FAQ generator. Return only raw, valid JSON arrays.'
          });

          let clean = claudeData.text.replace(/```json|```/g, '').trim();
          let parsed = JSON.parse(clean);
          
          if (!Array.isArray(parsed)) {
            parsed = [];
          }
          
          newSuggestions.push({
             id: p.id,
             title: p.title,
             handle: p.handle,
             faqs: parsed
          });
          
          setCompletedFaqProducts(prev => {
            const next = new Set(prev);
            next.add(p.id.toString());
            return next;
          });
        } catch (e: any) {
          console.error("FAQ generation failed for", p.title, e);
          setFaqStatus(`❌ JSON Error on ${p.title}: ${e.message}`);
          setIsGeneratingFaq(false);
          return;
        }
      }
      setFaqSuggestions(newSuggestions);
      setFaqStatus(`✅ Generated Knowledge Base blocks for ${newSuggestions.length} products!`);
    } catch (e: any) {
      setFaqStatus(`❌ Error: ${e.message}`);
    }
    setIsGeneratingFaq(false);
  };

  const startAltTextAudit = async () => {
    setStatus('⏳ Fetching products...');
    setStep(1);
    setRollbacks([]);
    try {
      const data = await shopify({ method: 'GET', endpoint: `products.json?status=${productFilter}&limit=50&fields=id,title,handle,images` });
      const products = data.products || [];
      if (!products.length) { setStatus('⚠️ No products found in your store'); return; }

      setStatus(`✅ Found ${products.length} products. Generating AI alt text suggestions...`);
      setStep(2);

      const allImages: any[] = [];
      products.forEach((p: any) => {
        (p.images || []).forEach((img: any, i: number) => {
          // In real SearchLift logic, we would only process images flagged in reportData
          // For sandbox, we process all missing or generic ones
          allImages.push({ 
            id: `${p.id}-${img.id}`,
            productId: p.id, 
            productTitle: p.title, 
            imageId: img.id, 
            imageIndex: i, 
            currentAlt: img.alt || '', 
            src: img.src 
          });
        });
      });

      setStatus(`🤖 Generating alt text for ${allImages.length} images using AI...`);
      const BATCH = 15;
      const altSuggestions: any[] = [];

      for (let i = 0; i < allImages.length; i += BATCH) {
        const batch = allImages.slice(i, i + BATCH);
        const prompt = `Generate SEO alt text for these Mazonkiki luxury product images. For each, provide a unique, descriptive alt text max 120 chars using luxury fashion language (fabric, texture, drape, pattern, colour, occasion).\n\nProducts and images:\n${batch.map((img, idx) => `${idx + 1}. Product: "${img.productTitle}" | Image ${img.imageIndex + 1} | Current alt: "${img.currentAlt || 'MISSING'}"`).join('\n')}\n\nReturn ONLY a JSON array with this exact structure, no other text:\n[{"index":0,"alt":"your suggested alt text"},{"index":1,"alt":"..."}]`;

        try {
          const claudeData = await claude({
            messages: [{ role: 'user', content: prompt }],
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            system: 'You generate SEO alt text for luxury fashion products. Return only valid JSON arrays.'
          });

          const clean = claudeData.text.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(clean);
          parsed.forEach((s: any) => {
            if (batch[s.index]) {
              altSuggestions.push({ ...batch[s.index], suggestedAlt: s.alt });
            }
          });
        } catch (e: any) {
          batch.forEach((img) => altSuggestions.push({ ...img, suggestedAlt: img.currentAlt || `${img.productTitle} - luxury silk product` }));
        }
        setStatus(`⏳ Generated ${Math.min(i + BATCH, allImages.length)} of ${allImages.length} suggestions...`);
      }

      setSuggestions(altSuggestions);
      setSelectedIds(new Set(altSuggestions.map(s => s.id)));
      setStatus('');
    } catch (e: any) {
      setStatus(`❌ Error: ${e.message}`);
    }
  };

  const toggleSelection = (id: string) => {
    const newSel = new Set(selectedIds);
    if (newSel.has(id)) newSel.delete(id);
    else newSel.add(id);
    setSelectedIds(newSel);
  };

  const handleAltChange = (id: string, newAlt: string) => {
    setSuggestions(suggestions.map(s => s.id === id ? { ...s, suggestedAlt: newAlt } : s));
  };

  const applyChanges = async () => {
    const toApply = suggestions.filter(s => selectedIds.has(s.id));
    if (!toApply.length) return;

    setIsApplying(true);
    setStep(3);
    const newRollbacks = [...rollbacks];

    for (let i = 0; i < toApply.length; i++) {
      const s = toApply[i];
      setStatus(`⏳ Applying ${i + 1} of ${toApply.length}...`);
      try {
        // Snapshot for rollback
        newRollbacks.push({ productId: s.productId, imageId: s.imageId, oldAlt: s.currentAlt, newAlt: s.suggestedAlt, productTitle: s.productTitle });

        await shopify({
          method: 'PUT',
          endpoint: `products/${s.productId}/images/${s.imageId}.json`,
          body: {
            image: {
              id: s.imageId,
              alt: s.suggestedAlt
            }
          }
        });
        
        // Mark as applied in UI
        setSuggestions(prev => prev.map(item => item.id === s.id ? { ...item, applied: true } : item));
      } catch (e: any) {
        setStatus(`❌ Error applying to ${s.productTitle}: ${e.message}`);
        setIsApplying(false);
        return;
      }
    }
    
    setRollbacks(newRollbacks);
    setStatus(`✅ Successfully applied ${toApply.length} alt texts!`);
    setIsApplying(false);
  };

  const rollbackAll = async () => {
    if (!rollbacks.length) return;
    setIsApplying(true);
    setStatus('⏳ Rolling back changes...');
    
    for (let i = 0; i < rollbacks.length; i++) {
      const r = rollbacks[i];
      try {
        await shopify({
          method: 'PUT',
          endpoint: `products/${r.productId}/images/${r.imageId}.json`,
          body: {
            image: {
              id: r.imageId,
              alt: r.oldAlt
            }
          }
        });
      } catch (e: any) {
        console.error('Rollback failed for', r.productId, e);
      }
    }
    
    // Reset UI
    setSuggestions(suggestions.map(s => ({ ...s, applied: false })));
    setRollbacks([]);
    setStatus('⏪ Rollback complete. Original alt texts restored.');
    setIsApplying(false);
  };

  return (
    <div className="audit-layout">
      <aside className="audit-sidebar">
        <div className="audit-sidebar-header">
          <div className="audit-sidebar-title">Audit Issues</div>
          <div className="score-ring">
            <div className="score-circle"><span className="score-num">{reportData?.score || 76}</span></div>
            <div className="score-info">
              <div className="score-label">GEO Score</div>
              <div className="score-sub">Product readiness</div>
            </div>
          </div>
        </div>
        <div className="issue-list">
          {issues.map((issue: any) => (
            <div key={issue.id} className={`issue-card ${activeIssue === issue.id ? 'active' : ''}`} onClick={() => setActiveIssue(issue.id)}>
              <div className="issue-header">
                <span className="issue-icon">{issue.icon || '⚠️'}</span>
                <span className="issue-title">{issue.title}</span>
                <span className={`issue-pill ${issue.severity === 'HIGH' ? 'pill-high' : 'pill-med'}`}>{issue.severity}</span>
              </div>
              <div className="issue-desc">{issue.desc}</div>
            </div>
          ))}
        </div>
      </aside>

      <div className="audit-main">
        {activeIssue === 'alttext' ? (
          <>
            <div className="audit-main-header">
              <div className="audit-main-title">Missing Image Alt Text</div>
              <div className="audit-main-sub">AI systems can't interpret product images without descriptive alt text.</div>
              <div className="workflow-steps">
                <div className={`workflow-step ${step >= 1 ? 'active' : ''}`}><div className="step-num">1</div> Load</div>
                <div className="step-arrow">→</div>
                <div className={`workflow-step ${step >= 2 ? 'active' : ''}`}><div className="step-num">2</div> Review</div>
                <div className="step-arrow">→</div>
                <div className={`workflow-step ${step >= 3 ? 'active' : ''}`}><div className="step-num">3</div> Apply</div>
              </div>
            </div>
            <div className="audit-content">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
                <div className="fix-card">
                  <div className="fix-card-header">
                    <span className="fix-card-icon">🖼️</span>
                    <div className="fix-card-info">
                      <div className="fix-card-title">Step 1 — Start Audit</div>
                      <div className="fix-card-sub">Fetch missing alt texts and generate AI suggestions</div>
                    </div>
                  </div>
                  <div className="fix-card-body">
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <select 
                        value={productFilter} 
                        onChange={(e) => setProductFilter(e.target.value)}
                        disabled={isApplying}
                        style={{ padding: '8px', borderRadius: '4px', background: 'var(--ink2)', color: 'var(--snow2)', border: '1px solid var(--line)', outline: 'none' }}
                      >
                        <option value="active">Active Products Only</option>
                        <option value="draft">Draft Products Only</option>
                        <option value="any">All Products (Any Status)</option>
                      </select>
                      <button className="btn btn-primary" onClick={startAltTextAudit} disabled={isApplying || !!status}>
                        {status ? '⏳ Working...' : '🔍 Audit Products'}
                      </button>
                      <button className="btn" onClick={() => {
                        setSuggestions([]);
                        setSelectedIds(new Set());
                        setRollbacks([]);
                        setStatus('');
                        setStep(1);
                      }} disabled={isApplying} style={{ marginLeft: '12px' }}>
                        🔄 Reset Audit
                      </button>
                    </div>
                  </div>
                  {status && <div style={{ padding: '12px 16px', fontSize: '13px', background: 'var(--ink2)', color: 'var(--teal)', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    {status}
                  </div>}
                </div>

                {suggestions.length > 0 && (
                  <div className="fix-card">
                    <div className="fix-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <span className="fix-card-icon">✨</span>
                        <div className="fix-card-info">
                          <div className="fix-card-title">Step 2 & 3 — Review and Apply</div>
                          <div className="fix-card-sub">{selectedIds.size} of {suggestions.length} selected</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {rollbacks.length > 0 && (
                          <button className="btn" style={{ background: 'var(--ink2)', color: 'var(--amber)' }} onClick={rollbackAll} disabled={isApplying}>
                            ⏪ Undo Last Apply ({rollbacks.length})
                          </button>
                        )}
                        <button className="btn btn-primary" onClick={applyChanges} disabled={isApplying || selectedIds.size === 0}>
                          {isApplying ? 'Applying...' : `Apply ${selectedIds.size} Changes`}
                        </button>
                      </div>
                    </div>
                    
                    <div className="fix-card-body" style={{ padding: 0 }}>
                      {/* Master select‑all checkbox */}
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <input
                          type="checkbox"
                          checked={suggestions.length > 0 && selectedIds.size === suggestions.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(new Set(suggestions.map((s) => s.id)));
                            } else {
                              setSelectedIds(new Set());
                            }
                          }}
                          disabled={isApplying}
                          style={{ marginRight: '8px' }}
                        />
                        <span style={{ color: 'var(--snow2)' }}>Select All</span>
                      </div>
                      {suggestions.map((s) => (
                        <div key={s.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: '12px', alignItems: 'flex-start', background: s.applied ? 'rgba(61, 217, 192, 0.05)' : 'transparent' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedIds.has(s.id)} 
                            onChange={() => toggleSelection(s.id)}
                            disabled={s.applied || isApplying}
                            style={{ marginTop: '4px' }}
                          />
                          <img src={s.src} alt="Product" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--line)' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', color: 'var(--snow2)', marginBottom: '4px', fontWeight: 500 }}>
                              {s.productTitle} {s.applied && <span style={{ color: 'var(--teal)', fontSize: '11px', marginLeft: '6px' }}>✓ Applied</span>}
                            </div>
                            <textarea 
                              value={s.suggestedAlt} 
                              onChange={(e) => handleAltChange(s.id, e.target.value)}
                              disabled={s.applied || isApplying}
                              style={{ width: '100%', background: 'var(--ink2)', border: '1px solid var(--line)', padding: '8px', color: '#fff', borderRadius: '4px', fontSize: '13px', minHeight: '60px', resize: 'vertical' }} 
                            />
                            {s.currentAlt && <div style={{ fontSize: '11px', color: 'var(--snow4)', marginTop: '4px' }}>Current: {s.currentAlt}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : activeIssue === 'titles' ? (
          <div className="audit-main-header">
             <div className="audit-main-title">Generic Product Titles</div>
             <div className="audit-main-sub">Titles lack semantic richness for LLM discovery.</div>
             <div style={{ marginTop: '32px', padding: '24px', background: 'var(--ink2)', border: '1px dashed var(--line)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '16px' }}>🚧</div>
                <h3 style={{ color: 'var(--snow)', marginBottom: '8px' }}>Title Audit Engine (Coming Soon)</h3>
                <p style={{ color: 'var(--snow3)', fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
                  This module will scan for generic titles (e.g., "Silk Scarf") and use AI to generate descriptive, SEO-rich alternatives based on your product data.
                </p>
             </div>
          </div>
        ) : activeIssue.toLowerCase().includes('schema') ? (
          <>
            <div className="audit-main-header">
               <div className="audit-main-title">Product Schema Remediation</div>
               <div className="audit-main-sub">Generate rich JSON-LD markup to improve search engine visibility.</div>
               <div className="workflow-steps">
                  <div className={`workflow-step ${schemaSuggestions.length === 0 ? 'active' : 'done'}`}><div className="step-num">1</div> Fetch & Generate</div>
                  <div className="step-arrow">→</div>
                  <div className={`workflow-step ${schemaSuggestions.length > 0 ? 'active' : ''}`}><div className="step-num">2</div> Review (Read-Only)</div>
                </div>
            </div>
            <div className="audit-content" style={{ maxWidth: '800px' }}>
                <div className="fix-card">
                  <div className="fix-card-header">
                    <span className="fix-card-icon">🏗️</span>
                    <div className="fix-card-info">
                      <div className="fix-card-title">Step 1 — Generate Schema</div>
                      <div className="fix-card-sub">Fetch 5 products and generate Product JSON-LD using AI</div>
                    </div>
                  </div>
                  <div className="fix-card-body">
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <select 
                        value={productFilter} 
                        onChange={(e) => setProductFilter(e.target.value)}
                        disabled={isGeneratingSchema}
                        style={{ padding: '8px', borderRadius: '4px', background: 'var(--ink2)', color: 'var(--snow2)', border: '1px solid var(--line)', outline: 'none' }}
                      >
                        <option value="active">Active Products Only</option>
                        <option value="draft">Draft Products Only</option>
                        <option value="any">All Products (Any Status)</option>
                      </select>
                      <button className="btn btn-primary" onClick={generateProductSchema} disabled={isGeneratingSchema}>
                        {isGeneratingSchema ? '⏳ Generating...' : '✨ Generate Sample Schema'}
                      </button>
                    </div>
                    {schemaStatus && (
                      <div style={{ marginTop: '12px', padding: '12px', background: 'var(--ink2)', color: 'var(--teal)', border: '1px solid var(--teal-line)', borderRadius: '4px', fontSize: '13px' }}>
                        {schemaStatus}
                      </div>
                    )}
                  </div>
                </div>

                {schemaSuggestions.length > 0 && (
                  <div className="fix-card" style={{ marginTop: '16px', borderColor: 'var(--amber)' }}>
                     <div className="fix-card-header" style={{ background: 'var(--amber-dim)', borderBottom: '1px solid rgba(240,163,72,0.2)' }}>
                        <span className="fix-card-icon" style={{ color: 'var(--amber)' }}>🔒</span>
                        <div className="fix-card-info">
                          <div className="fix-card-title" style={{ color: 'var(--amber)' }}>Step 2 — Review (Preview Mode)</div>
                          <div className="fix-card-sub" style={{ color: 'var(--amber)' }}>Saving to Shopify is disabled for this module to prevent unwanted changes.</div>
                        </div>
                     </div>
                     <div className="fix-card-body" style={{ padding: 0 }}>
                        {schemaSuggestions.map(s => (
                           <div key={s.id} style={{ padding: '16px', borderBottom: '1px solid var(--line)' }}>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                                 {s.image && <img src={s.image} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />}
                                 <strong style={{ color: 'var(--snow)', fontSize: '14px' }}>{s.title}</strong>
                              </div>
                              <textarea 
                                readOnly
                                value={s.schema} 
                                style={{ width: '100%', background: 'var(--ink)', border: '1px solid var(--line)', padding: '12px', color: 'var(--snow2)', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', minHeight: '200px', resize: 'vertical' }} 
                              />
                           </div>
                        ))}
                     </div>
                  </div>
                )}
              </div>
          </>
        ) : (activeIssue.toLowerCase().includes('agentic') || activeIssue.toLowerCase().includes('metafield') || activeIssue.toLowerCase().includes('summary') || activeIssue.toLowerCase().includes('structured product data') || activeIssue.toLowerCase().includes('product attributes')) ? (
          <>
            <div className="audit-main-header">
               <div className="audit-main-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Shopify Agentic Mapping Prep</span>
                  {agenticSuggestions.length > 0 && (
                     <div style={{ display: 'flex', gap: '8px' }}>
                        <button className={`btn ${viewMode === 'card' ? 'btn-primary' : ''}`} onClick={() => setViewMode('card')}>Card View</button>
                        <button className={`btn ${viewMode === 'worksheet' ? 'btn-primary' : ''}`} onClick={() => setViewMode('worksheet')}>Worksheet View</button>
                     </div>
                  )}
               </div>
               <div className="audit-main-sub">SearchLift is preparing product data for Shopify's Agentic/Catalog Mapping workflow. Shopify-defined fields are shown separately from supplemental SearchLift fields. Nothing is written to Shopify in Preview Mode.</div>
               <div className="workflow-steps">
                  <div className={`workflow-step ${agenticSuggestions.length === 0 ? 'active' : 'done'}`}><div className="step-num">1</div> Fetch & Extract</div>
                  <div className="step-arrow">→</div>
                  <div className={`workflow-step ${agenticSuggestions.length > 0 ? 'active' : ''}`}><div className="step-num">2</div> Review (Read-Only)</div>
                </div>
            </div>
            <div className="audit-content" style={{ maxWidth: '900px' }}>
                <div className="fix-card">
                  <div className="fix-card-header">
                    <span className="fix-card-icon">🧠</span>
                    <div className="fix-card-info">
                      <div className="fix-card-title">Step 1 — Fetch & Extract</div>
                      <div className="fix-card-sub">Fetch 5 products and extract structured Metafields using AI</div>
                    </div>
                  </div>
                  <div className="fix-card-body">
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <select 
                        value={productFilter} 
                        onChange={(e) => setProductFilter(e.target.value)}
                        disabled={isGeneratingAgentic}
                        style={{ padding: '8px', borderRadius: '4px', background: 'var(--ink2)', color: 'var(--snow2)', border: '1px solid var(--line)', outline: 'none' }}
                      >
                        <option value="active">Active Products Only</option>
                        <option value="draft">Draft Products Only</option>
                        <option value="any">All Products (Any Status)</option>
                      </select>
                      <button className="btn btn-primary" onClick={generateAgenticFields} disabled={isGeneratingAgentic}>
                        {isGeneratingAgentic ? '⏳ Extracting...' : '✨ Fetch & Extract'}
                      </button>
                    </div>
                    {agenticStatus && (
                      <div style={{ marginTop: '12px', padding: '12px', background: 'var(--ink2)', color: agenticStatus.includes('❌') ? 'var(--rose)' : 'var(--teal)', border: `1px solid ${agenticStatus.includes('❌') ? 'var(--rose-line)' : 'var(--teal-line)'}`, borderRadius: '4px', fontSize: '13px' }}>
                        {agenticStatus}
                      </div>
                    )}
                  </div>
                </div>

                {agenticSuggestions.length > 0 && (
                  <div className="fix-card" style={{ marginTop: '16px', borderColor: 'var(--amber)' }}>
                     <div className="fix-card-header" style={{ background: 'var(--amber-dim)', borderBottom: '1px solid rgba(240,163,72,0.2)' }}>
                        <span className="fix-card-icon" style={{ color: 'var(--amber)' }}>🔒</span>
                        <div className="fix-card-info">
                          <div className="fix-card-title" style={{ color: 'var(--amber)' }}>Step 2 — Review (Preview Mode)</div>
                          <div className="fix-card-sub" style={{ color: 'var(--amber)' }}>Writing to Shopify Metafields is disabled for this prototype.</div>
                        </div>
                        <button className="btn" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>Apply to Shopify (Coming Later)</button>
                     </div>
                     <div className="fix-card-body" style={{ padding: 0 }}>
                        {viewMode === 'card' ? (
                          agenticSuggestions.map(s => (
                           <div key={s.id} style={{ padding: '20px', borderBottom: '1px solid var(--line)' }}>
                              <div style={{ marginBottom: '16px' }}>
                                 <strong style={{ color: 'var(--snow)', fontSize: '15px' }}>{s.title}</strong>
                                 <div style={{ fontSize: '12px', color: 'var(--snow3)', marginTop: '4px' }}>Original: {s.descriptionExcerpt}</div>
                              </div>
                              
                              {/* Category Allocation Section */}
                              <div style={{ background: 'var(--ink2)', padding: '16px', borderRadius: '6px', border: '1px solid var(--teal-line)', marginBottom: '16px' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                    <div>
                                       <h4 style={{ color: 'var(--snow)', margin: 0, fontSize: '14px' }}>Category Allocation</h4>
                                       <div style={{ fontSize: '12px', color: 'var(--snow3)', marginTop: '4px' }}>Standard Metafields require a valid Shopify Category.</div>
                                    </div>
                                    <button 
                                      className="btn btn-primary"
                                      disabled={approvedCategories[s.id]}
                                      onClick={() => setApprovedCategories(prev => ({ ...prev, [s.id]: true }))}
                                      style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                      {approvedCategories[s.id] ? '✅ Approved' : 'Approve Category'}
                                    </button>
                                 </div>
                                 <input 
                                   type="text" 
                                   value={overrideCategories[s.id] !== undefined ? overrideCategories[s.id] : s.shopifyAgenticFields['shopify.product_category']?.value || ''} 
                                   onChange={(e) => setOverrideCategories(prev => ({ ...prev, [s.id]: e.target.value }))}
                                   disabled={approvedCategories[s.id]}
                                   placeholder="e.g. Apparel & Accessories > Clothing"
                                   style={{ width: '100%', padding: '10px', background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--snow)', borderRadius: '4px' }}
                                 />
                              </div>
                              
                              <div style={{ opacity: approvedCategories[s.id] ? 1 : 0.4, pointerEvents: approvedCategories[s.id] ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                                <h5 style={{ color: 'var(--snow2)', marginBottom: '12px', fontSize: '13px' }}>Shopify-Defined Agentic/Catalog Fields</h5>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                                  {Object.entries(s.shopifyAgenticFields).filter(([key]) => key !== 'shopify.product_category').map(([key, val]: any) => (
                                    <div key={key} style={{ background: 'var(--ink2)', padding: '12px', borderRadius: '4px', border: '1px solid var(--line2)' }}>
                                      <div style={{ fontSize: '11px', color: 'var(--snow4)', fontFamily: 'monospace', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{key}</span>
                                        {val?.needsReview && <span style={{ color: 'var(--rose)' }}>Needs Review</span>}
                                      </div>
                                      <div style={{ fontSize: '13px', color: val?.value ? 'var(--snow)' : 'var(--snow3)', fontStyle: val?.value ? 'normal' : 'italic' }}>
                                        {val?.value || 'null'}
                                      </div>
                                      {val?.value && (
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '10px', color: 'var(--snow4)' }}>
                                          <span style={{ padding: '2px 6px', background: 'var(--ink3)', borderRadius: '4px' }}>Conf: {val?.confidence}</span>
                                          <span style={{ padding: '2px 6px', background: 'var(--ink3)', borderRadius: '4px' }}>Src: {val?.source}</span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <h5 style={{ color: 'var(--snow2)', marginBottom: '12px', fontSize: '13px' }}>SearchLift Supplemental AI Fields</h5>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                                  {Object.entries(s.supplementalSearchLiftFields).map(([key, val]: any) => (
                                    <div key={key} style={{ background: 'var(--ink2)', padding: '12px', borderRadius: '4px', border: '1px solid var(--line2)' }}>
                                      <div style={{ fontSize: '11px', color: 'var(--snow4)', fontFamily: 'monospace', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{key}</span>
                                        {val?.needsReview && <span style={{ color: 'var(--rose)' }}>Needs Review</span>}
                                      </div>
                                      <div style={{ fontSize: '13px', color: val?.value ? 'var(--snow)' : 'var(--snow3)', fontStyle: val?.value ? 'normal' : 'italic' }}>
                                        {val?.value || 'null'}
                                      </div>
                                      {val?.value && (
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '10px', color: 'var(--snow4)' }}>
                                          <span style={{ padding: '2px 6px', background: 'var(--ink3)', borderRadius: '4px' }}>Conf: {val?.confidence}</span>
                                          <span style={{ padding: '2px 6px', background: 'var(--ink3)', borderRadius: '4px' }}>Src: {val?.source}</span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <div style={{ background: 'var(--ink2)', padding: '16px', borderRadius: '6px', border: '1px dashed var(--line)' }}>
                                  <h5 style={{ color: 'var(--snow2)', margin: '0 0 12px 0', fontSize: '13px' }}>Suggested Shopify Catalog Mapping (Guidance)</h5>
                                  <ul style={{ fontSize: '12px', color: 'var(--snow3)', margin: 0, paddingLeft: '20px' }}>
                                    <li><strong>{s.shopifyAgenticFields['shopify.material']?.value || 'Material'}</strong> maps to <code>shopify.material</code> (Category Attribute) - {s.shopifyAgenticFields['shopify.material']?.needsReview ? <span style={{color:'var(--rose)'}}>Needs merchant review</span> : 'Ready for mapping'}</li>
                                    <li><strong>{s.shopifyAgenticFields['shopify.color']?.value || 'Color'}</strong> maps to <code>shopify.color</code> (Category Attribute) - {s.shopifyAgenticFields['shopify.color']?.needsReview ? <span style={{color:'var(--rose)'}}>Needs merchant review</span> : 'Ready for mapping'}</li>
                                    <li><strong>{s.supplementalSearchLiftFields['custom.ai_summary']?.value ? 'AI Summary generated' : 'Missing Summary'}</strong> remains in <code>custom.ai_summary</code> (No standard Shopify target)</li>
                                  </ul>
                                </div>
                              </div>
                           </div>
                        ))) : (
                          Array.from(new Set(agenticSuggestions.map(s => overrideCategories[s.id] || s.shopifyAgenticFields['shopify.product_category']?.value))).map(category => (
                            <div key={category as string} style={{ padding: '20px', borderBottom: '1px solid var(--line)' }}>
                              <h4 style={{ color: 'var(--snow)', marginBottom: '16px', fontSize: '15px' }}>Category: {category as string}</h4>
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--line)', color: 'var(--snow2)' }}>Product</th>
                                      {Object.keys(agenticSuggestions.find(s => (overrideCategories[s.id] || s.shopifyAgenticFields['shopify.product_category']?.value) === category)?.shopifyAgenticFields || {}).filter(k => k !== 'shopify.product_category').map(k => (
                                        <th key={k} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--line)', color: 'var(--snow2)' }}>{k.split('.').pop()}</th>
                                      ))}
                                      {Object.keys(agenticSuggestions.find(s => (overrideCategories[s.id] || s.shopifyAgenticFields['shopify.product_category']?.value) === category)?.supplementalSearchLiftFields || {}).map(k => (
                                        <th key={k} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--line)', color: 'var(--snow2)' }}>{k.split('.').pop()}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {agenticSuggestions.filter(s => (overrideCategories[s.id] || s.shopifyAgenticFields['shopify.product_category']?.value) === category).map(s => (
                                      <tr key={s.id} style={{ borderBottom: '1px solid var(--line2)' }}>
                                        <td style={{ padding: '8px', color: 'var(--snow)', minWidth: '150px' }}>{s.title}</td>
                                        
                                        {Object.entries(s.shopifyAgenticFields).filter(([k]) => k !== 'shopify.product_category').map(([k, val]: any) => (
                                          <td key={k} style={{ padding: '8px' }}>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                              <input 
                                                type="text" 
                                                value={val?.value || ''} 
                                                onChange={(e) => updateAgenticField(s.id, 'shopifyAgenticFields', k, e.target.value)}
                                                style={{ width: '100px', padding: '6px', background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--snow)', borderRadius: '4px', opacity: approvedCategories[s.id] ? 1 : 0.4 }}
                                                disabled={!approvedCategories[s.id]}
                                              />
                                              <button onClick={() => copyToNextRow(s.id, 'shopifyAgenticFields', k, val?.value || '')} disabled={!approvedCategories[s.id]} style={{ background: 'transparent', border: 'none', color: approvedCategories[s.id] ? 'var(--teal)' : 'var(--snow4)', cursor: approvedCategories[s.id] ? 'pointer' : 'not-allowed', padding: '4px' }} title="Copy to next row">↓</button>
                                            </div>
                                          </td>
                                        ))}

                                        {Object.entries(s.supplementalSearchLiftFields).map(([k, val]: any) => (
                                          <td key={k} style={{ padding: '8px' }}>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                              <input 
                                                type="text" 
                                                value={val?.value || ''} 
                                                onChange={(e) => updateAgenticField(s.id, 'supplementalSearchLiftFields', k, e.target.value)}
                                                style={{ width: '100px', padding: '6px', background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--snow)', borderRadius: '4px', opacity: approvedCategories[s.id] ? 1 : 0.4 }}
                                                disabled={!approvedCategories[s.id]}
                                              />
                                              <button onClick={() => copyToNextRow(s.id, 'supplementalSearchLiftFields', k, val?.value || '')} disabled={!approvedCategories[s.id]} style={{ background: 'transparent', border: 'none', color: approvedCategories[s.id] ? 'var(--teal)' : 'var(--snow4)', cursor: approvedCategories[s.id] ? 'pointer' : 'not-allowed', padding: '4px' }} title="Copy to next row">↓</button>
                                            </div>
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))
                        )}
                     </div>
                  </div>
                )}
              </div>
          </>
        ) : activeIssue === 'faq-clipboard' ? (
          <>
            <div className="audit-main-header">
               <div className="audit-main-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>FAQ Clipboard Engine</span>
                  <a href="https://admin.shopify.com/store/mazonkiki/apps/shopify-knowledge-base" target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                    Open Shopify Knowledge Base ↗
                  </a>
               </div>
               <div className="audit-main-sub">Format AI questions into Knowledge Base ready copy-out cards.</div>
               <div className="workflow-steps">
                  <div className={`workflow-step ${faqSuggestions.length === 0 ? 'active' : 'done'}`}><div className="step-num">1</div> Generate FAQs</div>
                  <div className="step-arrow">→</div>
                  <div className={`workflow-step ${faqSuggestions.length > 0 ? 'active' : ''}`}><div className="step-num">2</div> Copy & Paste</div>
               </div>
            </div>

            <div className="audit-content">
               {faqSuggestions.length === 0 ? (
                  <div className="start-audit-card">
                     <div style={{ fontSize: '32px', marginBottom: '16px' }}>📋</div>
                     <h3 style={{ color: 'var(--snow)', marginBottom: '16px' }}>Generate Knowledge Base Seed Data</h3>
                     <p style={{ color: 'var(--snow3)', marginBottom: '24px', maxWidth: '400px', margin: '0 auto' }}>
                        This will generate complete Q&A blocks for your products, formatted as plain text ready to copy into your Knowledge Base app.
                     </p>
                     
                     <div style={{ background: 'var(--ink)', padding: '20px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '24px', maxWidth: '400px', margin: '0 auto', textAlign: 'left' }}>
                        <label style={{ display: 'block', color: 'var(--snow)', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Select Collection</label>
                        <select 
                          value={selectedCollection} 
                          onChange={(e) => setSelectedCollection(e.target.value)}
                          style={{ width: '100%', padding: '10px', background: 'var(--ink2)', border: '1px solid var(--line)', color: 'var(--snow)', borderRadius: '4px', marginBottom: '16px' }}
                        >
                          <option value="">-- All Products (No Collection) --</option>
                          {collections.map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--snow2)', fontSize: '13px', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={reviewAll} 
                            onChange={(e) => setReviewAll(e.target.checked)} 
                            style={{ accentColor: 'var(--teal)' }}
                          />
                          Review All (Include {completedFaqProducts.size} processed products)
                        </label>
                     </div>

                     <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                       <button className="btn btn-primary" onClick={generateFaqs} disabled={isGeneratingFaq}>
                         {isGeneratingFaq ? 'Generating...' : '✨ Generate Q&A Blocks'}
                       </button>
                     </div>
                     {faqStatus && <div style={{ marginTop: '16px', color: 'var(--snow3)', fontSize: '14px' }}>{faqStatus}</div>}
                  </div>
               ) : (
                  <div className="fix-list">
                     <div className="fix-card" style={{ marginTop: '16px', borderColor: 'var(--teal)' }}>
                        <div className="fix-card-header" style={{ background: 'var(--teal-dim)', borderBottom: '1px solid rgba(46,204,113,0.2)' }}>
                           <span className="fix-card-icon" style={{ color: 'var(--teal)' }}>📋</span>
                           <div className="fix-card-info">
                             <div className="fix-card-title" style={{ color: 'var(--teal)' }}>Step 2 — Copy to Knowledge Base</div>
                             <div className="fix-card-sub" style={{ color: 'var(--teal)' }}>Click 'Copy Text' and paste directly into your Shopify Knowledge Base app.</div>
                           </div>
                        </div>
                        <div className="fix-card-body" style={{ padding: '20px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            {faqSuggestions.map(s => {
                              const textBlock = s.faqs.map((faq: any) => `Q: ${faq.q}\nA: ${faq.a}`).join('\n\n');
                              
                              return (
                              <div key={s.id} style={{ background: 'var(--ink2)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                                 <h4 style={{ color: 'var(--snow)', marginBottom: '16px', fontSize: '15px' }}>{s.title}</h4>
                                 <div style={{ flex: 1, background: 'var(--ink)', padding: '12px', borderRadius: '4px', border: '1px solid var(--line2)', marginBottom: '16px', fontSize: '13px', color: 'var(--snow2)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', maxHeight: '200px', overflowY: 'auto' }}>
                                   {textBlock}
                                 </div>
                                 <button 
                                   className="btn btn-secondary" 
                                   onClick={(e) => {
                                     navigator.clipboard.writeText(textBlock);
                                     const target = e.target as HTMLButtonElement;
                                     const original = target.innerText;
                                     target.innerText = '✅ Copied!';
                                     setTimeout(() => { target.innerText = original; }, 2000);
                                   }}
                                   style={{ width: '100%', justifyContent: 'center' }}
                                 >
                                   📋 Copy Plain Text
                                 </button>
                              </div>
                            )})}
                          </div>
                        </div>
                     </div>
                  </div>
               )}
            </div>
          </>
        ) : (
          <div className="audit-main-header">
             <div className="audit-main-title">{issues.find((i: any) => i.id === activeIssue)?.title || 'Module Coming Soon'}</div>
             <div className="audit-main-sub">{issues.find((i: any) => i.id === activeIssue)?.desc || ''}</div>
             <div style={{ marginTop: '32px', padding: '24px', background: 'var(--ink2)', border: '1px dashed var(--line)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '16px' }}>🚧</div>
                <h3 style={{ color: 'var(--snow)', marginBottom: '8px' }}>Under Construction</h3>
                <p style={{ color: 'var(--snow3)', fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
                  This remediation module is currently being built. It will allow you to automatically fix this issue using AI.
                </p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
