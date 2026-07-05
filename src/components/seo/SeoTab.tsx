"use client";
import { useState, useEffect } from 'react';
import { shopify } from '@/lib/api';

export default function SeoTab({ reportData }: { reportData?: any }) {
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [status, setStatus] = useState('');
  
  // Editable fields
  const [title, setTitle] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [handle, setHandle] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [rollbacks, setRollbacks] = useState<any[]>([]);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setStatus('⏳ Fetching products...');
    try {
      const data = await shopify({ method: 'GET', endpoint: 'products.json?limit=50&fields=id,title,handle,body_html,images' });
      setProducts(data.products || []);
      setStatus('');
    } catch (e: any) {
      setStatus(`❌ Error: ${e.message}`);
    }
  };

  const selectProduct = (p: any) => {
    setSelectedProduct(p);
    setTitle(p.title || '');
    setBodyHtml(p.body_html || '');
    setHandle(p.handle || '');
    setStatus('');
  };

  const saveSeo = async () => {
    if (!selectedProduct) return;
    setIsSaving(true);
    setStatus('⏳ Saving to Shopify...');
    
    try {
      // Snapshot for rollback
      setRollbacks([...rollbacks, {
        productId: selectedProduct.id,
        oldTitle: selectedProduct.title,
        oldBody: selectedProduct.body_html,
        oldHandle: selectedProduct.handle
      }]);

      await shopify({
        method: 'PUT',
        endpoint: `products/${selectedProduct.id}.json`,
        body: {
          product: {
            id: selectedProduct.id,
            title,
            body_html: bodyHtml,
            handle
          }
        }
      });
      
      // Update local state
      const updatedProducts = products.map(p => 
        p.id === selectedProduct.id 
          ? { ...p, title, body_html: bodyHtml, handle } 
          : p
      );
      setProducts(updatedProducts);
      setSelectedProduct({ ...selectedProduct, title, body_html: bodyHtml, handle });
      
      setStatus('✅ Successfully saved SEO changes!');
    } catch (e: any) {
      setStatus(`❌ Error saving: ${e.message}`);
    }
    setIsSaving(false);
  };

  const rollbackLast = async () => {
    if (!rollbacks.length) return;
    const last = rollbacks[rollbacks.length - 1];
    setIsSaving(true);
    setStatus('⏳ Rolling back changes...');
    
    try {
      await shopify({
        method: 'PUT',
        endpoint: `products/${last.productId}.json`,
        body: {
          product: {
            id: last.productId,
            title: last.oldTitle,
            body_html: last.oldBody,
            handle: last.oldHandle
          }
        }
      });
      
      // Update local state
      const updatedProducts = products.map(p => 
        p.id === last.productId 
          ? { ...p, title: last.oldTitle, body_html: last.oldBody, handle: last.oldHandle } 
          : p
      );
      setProducts(updatedProducts);
      
      if (selectedProduct?.id === last.productId) {
        setSelectedProduct({ ...selectedProduct, title: last.oldTitle, body_html: last.oldBody, handle: last.oldHandle });
        setTitle(last.oldTitle || '');
        setBodyHtml(last.oldBody || '');
        setHandle(last.oldHandle || '');
      }

      setRollbacks(rollbacks.slice(0, -1));
      setStatus('⏪ Rollback complete. Original SEO restored.');
    } catch (e: any) {
      setStatus(`❌ Rollback failed: ${e.message}`);
    }
    setIsSaving(false);
  };

  return (
    <div className="audit-layout">
      <aside className="audit-sidebar" style={{ width: '300px', borderRight: '1px solid var(--line)', background: 'var(--ink)' }}>
        <div className="audit-sidebar-header">
          <div className="audit-sidebar-title">Select Product</div>
        </div>
        <div className="issue-list" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
          {products.map(p => (
            <div 
              key={p.id} 
              className={`issue-card ${selectedProduct?.id === p.id ? 'active' : ''}`} 
              onClick={() => selectProduct(p)}
              style={{ cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center' }}
            >
              {p.images && p.images[0] && (
                <img src={p.images[0].src} alt={p.title} style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px' }} />
              )}
              <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <div style={{ fontSize: '13px', color: 'var(--snow2)' }}>{p.title}</div>
                <div style={{ fontSize: '11px', color: 'var(--snow4)' }}>/{p.handle}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="audit-main">
        {selectedProduct ? (
          <div style={{ maxWidth: '640px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '20px', color: '#fff', marginBottom: '4px' }}>SEO Editor</h2>
                <div style={{ color: 'var(--snow3)', fontSize: '13px' }}>Editing metadata for {selectedProduct.title}</div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {rollbacks.length > 0 && (
                  <button className="btn" style={{ background: 'var(--ink2)', color: 'var(--amber)' }} onClick={rollbackLast} disabled={isSaving}>
                    ⏪ Undo
                  </button>
                )}
                <button className="btn btn-primary" onClick={saveSeo} disabled={isSaving}>
                  {isSaving ? 'Saving...' : '✅ Save to Shopify'}
                </button>
              </div>
            </div>

            {status && <div style={{ padding: '12px 16px', fontSize: '13px', background: 'var(--ink2)', color: 'var(--teal)', borderBottom: '1px solid var(--line)', marginBottom: '20px', borderRadius: '4px' }}>{status}</div>}

            <div className="fix-card" style={{ marginBottom: '20px' }}>
              <div className="fix-card-header">
                <div className="fix-card-title">SEO Title</div>
              </div>
              <div className="fix-card-body" style={{ padding: 0 }}>
                <input 
                  type="text" 
                  value={title} 
                  onChange={e => setTitle(e.target.value)}
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: '16px', color: '#fff', fontSize: '14px', outline: 'none' }} 
                />
              </div>
            </div>

            <div className="fix-card" style={{ marginBottom: '20px' }}>
              <div className="fix-card-header">
                <div className="fix-card-title">URL Handle</div>
              </div>
              <div className="fix-card-body" style={{ padding: 0 }}>
                <input 
                  type="text" 
                  value={handle} 
                  onChange={e => setHandle(e.target.value)}
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: '16px', color: 'var(--teal)', fontSize: '14px', outline: 'none' }} 
                />
              </div>
            </div>

            <div className="fix-card">
              <div className="fix-card-header">
                <div className="fix-card-title">Meta Description (Body HTML)</div>
              </div>
              <div className="fix-card-body" style={{ padding: 0 }}>
                <textarea 
                  value={bodyHtml} 
                  onChange={e => setBodyHtml(e.target.value)}
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: '16px', color: '#fff', fontSize: '14px', outline: 'none', minHeight: '150px', resize: 'vertical', lineHeight: '1.6' }} 
                />
              </div>
            </div>
            
          </div>
        ) : (
          <div className="audit-main-header">
            <div className="audit-main-title">Select a product to edit SEO</div>
          </div>
        )}
      </div>
    </div>
  );
}
