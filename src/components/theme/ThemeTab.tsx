"use client";
import { useState, useEffect } from 'react';
import { shopify, claude } from '@/lib/api';

export default function ThemeTab({ reportData }: { reportData?: any }) {
  const [themeId, setThemeId] = useState<string>('');
  const [themeLiquid, setThemeLiquid] = useState<string>('');
  const [originalLiquid, setOriginalLiquid] = useState<string>('');
  const [status, setStatus] = useState('');
  
  const [generatedSchema, setGeneratedSchema] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [rollbacks, setRollbacks] = useState<string[]>([]);

  useEffect(() => {
    fetchTheme();
  }, []);

  const fetchTheme = async () => {
    setStatus('⏳ Fetching live theme...');
    try {
      const themesData = await shopify({ method: 'GET', endpoint: 'themes.json' });
      const mainTheme = (themesData.themes || []).find((t: any) => t.role === 'main');
      
      if (!mainTheme) {
        setStatus('❌ No main theme found');
        return;
      }
      setThemeId(String(mainTheme.id));

      const assetData = await shopify({ 
        method: 'GET', 
        endpoint: `themes/${mainTheme.id}/assets.json?asset[key]=layout/theme.liquid` 
      });
      
      const content = assetData.asset?.value || '';
      setThemeLiquid(content);
      setOriginalLiquid(content);
      setStatus('');
    } catch (e: any) {
      setStatus(`❌ Error: ${e.message}`);
    }
  };

  const generateSchema = async () => {
    setIsGenerating(true);
    setStatus('⏳ Generating Schema using AI...');
    try {
      const claudeData = await claude({
        messages: [{ role: 'user', content: 'Generate complete Organization schema JSON-LD for Mazonkiki (mazonkiki.com), a luxury handcrafted apparel store selling silk scarves, lounge sets and kimonos. Include: name, url, logo (https://mazonkiki.com/logo.png), description, contactPoint (email: kiki@mazonkiki.com), foundingDate: "2020", sameAs (Instagram, Pinterest, Facebook). Return ONLY the JSON-LD script tag, nothing else.' }],
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: 'Return only the JSON-LD script tag, no explanation, no markdown.'
      });
      
      const clean = claudeData.text.replace(/```json|```html|```/g, '').trim();
      setGeneratedSchema(clean);
      setStatus('✅ Schema generated! Review below before injecting.');
    } catch (e: any) {
      setStatus(`❌ Error generating schema: ${e.message}`);
    }
    setIsGenerating(false);
  };

  const injectSchema = () => {
    if (!generatedSchema || !themeLiquid) return;
    
    // Simple injection logic: find </head> and insert before it
    const headEnd = themeLiquid.indexOf('</head>');
    if (headEnd === -1) {
      setStatus('❌ Could not find </head> tag in theme.liquid');
      return;
    }
    
    if (themeLiquid.includes('"@type":"Organization"') || themeLiquid.includes('"@type": "Organization"')) {
      setStatus('⚠️ Organization schema might already exist in theme.liquid!');
    }
    
    const newContent = themeLiquid.substring(0, headEnd) + '\n' + generatedSchema + '\n' + themeLiquid.substring(headEnd);
    setThemeLiquid(newContent);
    setStatus('✅ Schema injected into editor! Click "Save to Shopify" to push live.');
  };

  const saveTheme = async () => {
    if (!themeId) return;
    setIsSaving(true);
    setStatus('⏳ Saving layout/theme.liquid to live store...');
    
    try {
      // Push current live version to rollbacks before saving
      setRollbacks([...rollbacks, originalLiquid]);
      
      await shopify({
        method: 'PUT',
        endpoint: `themes/${themeId}/assets.json`,
        body: {
          asset: {
            key: 'layout/theme.liquid',
            value: themeLiquid
          }
        }
      });
      
      setOriginalLiquid(themeLiquid);
      setStatus('✅ Successfully pushed changes to Shopify live theme!');
    } catch (e: any) {
      setStatus(`❌ Error saving: ${e.message}`);
    }
    setIsSaving(false);
  };

  const rollbackLast = async () => {
    if (!rollbacks.length || !themeId) return;
    const previousContent = rollbacks[rollbacks.length - 1];
    
    setIsSaving(true);
    setStatus('⏳ Rolling back theme.liquid...');
    
    try {
      await shopify({
        method: 'PUT',
        endpoint: `themes/${themeId}/assets.json`,
        body: {
          asset: {
            key: 'layout/theme.liquid',
            value: previousContent
          }
        }
      });
      
      setThemeLiquid(previousContent);
      setOriginalLiquid(previousContent);
      setRollbacks(rollbacks.slice(0, -1));
      setStatus('⏪ Rollback complete. Original theme restored.');
    } catch (e: any) {
      setStatus(`❌ Rollback failed: ${e.message}`);
    }
    setIsSaving(false);
  };

  return (
    <div className="audit-layout">
      <aside className="audit-sidebar" style={{ width: '300px', borderRight: '1px solid var(--line)', background: 'var(--ink)' }}>
        <div className="audit-sidebar-header">
          <div className="audit-sidebar-title">Theme Injection Tasks</div>
        </div>
        <div className="issue-list">
          <div className="issue-card active">
            <div className="issue-header">
              <span className="issue-icon">⚡</span>
              <span className="issue-title">Missing Org Schema</span>
              <span className="issue-pill pill-med">MED</span>
            </div>
            <div className="issue-desc">Store lacks Organization JSON-LD markup for rich search results.</div>
          </div>
        </div>
      </aside>

      <div className="audit-main">
        <div style={{ maxWidth: '800px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '20px', color: '#fff', marginBottom: '4px' }}>Theme & Liquid</h2>
              <div style={{ color: 'var(--snow3)', fontSize: '13px' }}>Safe injection for <code>layout/theme.liquid</code></div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {rollbacks.length > 0 && (
                <button className="btn" style={{ background: 'var(--ink2)', color: 'var(--amber)' }} onClick={rollbackLast} disabled={isSaving}>
                  ⏪ Revert Theme ({rollbacks.length})
                </button>
              )}
              <button className="btn btn-primary" onClick={saveTheme} disabled={isSaving || themeLiquid === originalLiquid}>
                {isSaving ? 'Saving...' : '✅ Save to Shopify'}
              </button>
            </div>
          </div>

          {status && <div style={{ padding: '12px 16px', fontSize: '13px', background: 'var(--ink2)', color: 'var(--teal)', borderBottom: '1px solid var(--line)', marginBottom: '20px', borderRadius: '4px' }}>{status}</div>}

          {/* AI Workflow Panel */}
          <div className="fix-card" style={{ marginBottom: '20px', borderColor: 'var(--teal-line)' }}>
            <div className="fix-card-header" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span className="fix-card-icon">⚡</span>
                <div className="fix-card-info">
                  <div className="fix-card-title">Generate Organization Schema</div>
                  <div className="fix-card-sub">Creates JSON-LD markup to add to your homepage &lt;head&gt;</div>
                </div>
              </div>
              <button className="btn btn-primary" onClick={generateSchema} disabled={isGenerating}>
                {isGenerating ? 'Generating...' : '✨ Generate schema'}
              </button>
            </div>
            
            {generatedSchema && (
              <div className="fix-card-body">
                <div style={{ fontSize: '12px', color: 'var(--snow3)', marginBottom: '8px' }}>Review generated schema:</div>
                <textarea 
                  value={generatedSchema} 
                  onChange={(e) => setGeneratedSchema(e.target.value)}
                  style={{ width: '100%', background: 'var(--ink)', border: '1px solid var(--line)', padding: '12px', color: 'var(--snow)', fontSize: '12px', fontFamily: 'monospace', minHeight: '120px', resize: 'vertical' }}
                />
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn" style={{ background: 'var(--teal)', color: '#000', fontWeight: 600 }} onClick={injectSchema}>
                    💉 Inject into editor below
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Code Editor */}
          <div className="fix-card">
            <div className="fix-card-header">
              <div className="fix-card-title"><code>layout/theme.liquid</code> Editor</div>
            </div>
            <div className="fix-card-body" style={{ padding: 0 }}>
              <textarea 
                value={themeLiquid} 
                onChange={e => setThemeLiquid(e.target.value)}
                style={{ 
                  width: '100%', 
                  background: '#0d0d10', 
                  border: 'none', 
                  padding: '16px', 
                  color: '#d1d1d1', 
                  fontSize: '12.5px', 
                  fontFamily: 'Consolas, Monaco, monospace',
                  outline: 'none', 
                  minHeight: '400px', 
                  resize: 'vertical',
                  lineHeight: '1.5'
                }} 
              />
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
