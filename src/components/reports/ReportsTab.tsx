"use client";
import React, { useState, useEffect } from 'react';
import { getFullCatalog, CatalogItem } from '@/lib/pick-storage';

export default function ReportsTab() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'instock' | 'low' | 'out'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft' | 'archived'>('all');
  const [reportType, setReportType] = useState<'cubicles' | 'low_stock' | 'master'>('cubicles');
  const [syncStatus, setSyncStatus] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const items = await getFullCatalog();
      setCatalog(items);
    } catch (err) {
      console.error('Failed to load catalog for reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerCatalogSync = async () => {
    setSyncStatus('Syncing catalog from server...');
    try {
      const res = await fetch('/api/shopify?action=getCatalog');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Re-load from local IndexedDB storage
      await loadData();
      setSyncStatus('✓ Sync complete!');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (err: any) {
      console.error(err);
      setSyncStatus(`⚠️ Sync failed: ${err.message}`);
    }
  };

  // Group filtered items by cubicle location
  const getCubicleMap = () => {
    const map: Record<string, CatalogItem[]> = {};
    filteredCatalog.forEach((item) => {
      const loc = (item.cubicle || '').trim();
      const displayLoc = loc === '' || loc.toLowerCase() === 'unknown' ? 'Unallocated (No Location)' : loc;
      if (!map[displayLoc]) {
        map[displayLoc] = [];
      }
      map[displayLoc].push(item);
    });
    
    // Sort locations alphabetically, but put unallocated at the end
    return Object.keys(map)
      .sort((a, b) => {
        if (a.includes('Unallocated')) return 1;
        if (b.includes('Unallocated')) return -1;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      })
      .reduce((obj, key) => {
        obj[key] = map[key];
        return obj;
      }, {} as Record<string, CatalogItem[]>);
  };

  // Filter logic based on search query, stock levels, and product statuses
  const filteredCatalog = catalog.filter((item) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = (
      (item.title || '').toLowerCase().includes(q) ||
      (item.sku || '').toLowerCase().includes(q) ||
      (item.barcode || '').toLowerCase().includes(q) ||
      (item.cubicle || '').toLowerCase().includes(q)
    );
    if (!matchesSearch) return false;

    const qty = item.inventory_quantity ?? 0;
    if (stockFilter === 'instock') {
      if (qty <= 0) return false;
    } else if (stockFilter === 'low') {
      if (qty <= 0 || qty > 5) return false;
    } else if (stockFilter === 'out') {
      if (qty !== 0) return false;
    }

    const status = (item.status || 'active').toLowerCase();
    if (statusFilter !== 'all' && status !== statusFilter) {
      return false;
    }

    return true;
  });

  const cubicleData = getCubicleMap();

  // Export report to CSV
  const handleExportCSV = () => {
    let csvContent = '';
    let filename = '';

    if (reportType === 'cubicles') {
      filename = 'cubicle_inventory_report.csv';
      csvContent = 'Location,Product Title,SKU,Barcode,Stock Quantity,Status\n';
      Object.entries(cubicleData).forEach(([location, items]) => {
        items.forEach((item) => {
          const safeTitle = `"${(item.title || '').replace(/"/g, '""')}"`;
          csvContent += `"${location}",${safeTitle},"${item.sku || ''}","${item.barcode || ''}",${item.inventory_quantity ?? 0},"${item.status || 'active'}"\n`;
        });
      });
    } else if (reportType === 'low_stock') {
      filename = 'low_stock_report.csv';
      csvContent = 'Product Title,SKU,Barcode,Location,Stock Quantity,Status\n';
      filteredCatalog
        .filter((item) => (item.inventory_quantity ?? 0) <= 5)
        .forEach((item) => {
          const safeTitle = `"${(item.title || '').replace(/"/g, '""')}"`;
          csvContent += `${safeTitle},"${item.sku || ''}","${item.barcode || ''}","${item.cubicle || 'None'}",${item.inventory_quantity ?? 0},"${item.status || 'active'}"\n`;
        });
    } else {
      filename = 'master_catalog_report.csv';
      csvContent = 'Product Title,SKU,Barcode,Location,Stock Quantity,Brand,Status\n';
      filteredCatalog.forEach((item) => {
        const safeTitle = `"${(item.title || '').replace(/"/g, '""')}"`;
        csvContent += `${safeTitle},"${item.sku || ''}","${item.barcode || ''}","${item.cubicle || 'None'}",${item.inventory_quantity ?? 0},"${item.vendor || ''}","${item.status || 'active'}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Math summary statistics
  const totalUniqueSKUs = catalog.length;
  const totalLocations = Object.keys(cubicleData).filter(loc => !loc.includes('Unallocated')).length;
  const totalStockUnits = catalog.reduce((sum, item) => sum + (item.inventory_quantity ?? 0), 0);
  const totalLowStock = catalog.filter((item) => (item.inventory_quantity ?? 0) <= 5 && (item.inventory_quantity ?? 0) > 0).length;
  const totalOutOfStock = catalog.filter((item) => (item.inventory_quantity ?? 0) === 0).length;

  return (
    <div className="reports-layout" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '24px 30px', background: 'var(--ink)' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 600, color: 'var(--snow)' }}>
            📊 Reports & Inventory Audit
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--snow3)', marginTop: '4px' }}>
            Inspect storage locations, verify current stock quantities, and export listings.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {syncStatus && (
            <span style={{ fontSize: '12px', color: 'var(--teal)', fontFamily: 'DM Mono, monospace' }}>
              {syncStatus}
            </span>
          )}
          <button 
            onClick={triggerCatalogSync}
            className="btn" 
            style={{ padding: '8px 14px', background: 'var(--ink3)', border: '1px solid var(--line)', color: 'var(--snow2)', fontSize: '13px' }}
          >
            🔄 Sync from Shopify
          </button>
          <button 
            onClick={handleExportCSV}
            className="btn btn-primary"
            style={{ padding: '8px 14px', fontSize: '13px' }}
          >
            📥 Export to CSV
          </button>
        </div>
      </div>

      {/* SUMMARY STATS BAR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--ink2)', border: '1px solid var(--line)', padding: '16px', borderRadius: '10px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--snow4)', letterSpacing: '0.05em', fontWeight: 600 }}>Total SKUs</span>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--snow)', marginTop: '6px', fontFamily: 'DM Mono, monospace' }}>{totalUniqueSKUs}</div>
        </div>
        <div style={{ background: 'var(--ink2)', border: '1px solid var(--line)', padding: '16px', borderRadius: '10px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--snow4)', letterSpacing: '0.05em', fontWeight: 600 }}>Active Cubicles</span>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--gold)', marginTop: '6px', fontFamily: 'DM Mono, monospace' }}>{totalLocations}</div>
        </div>
        <div style={{ background: 'var(--ink2)', border: '1px solid var(--line)', padding: '16px', borderRadius: '10px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--snow4)', letterSpacing: '0.05em', fontWeight: 600 }}>Total Inventory Units</span>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--teal)', marginTop: '6px', fontFamily: 'DM Mono, monospace' }}>{totalStockUnits}</div>
        </div>
        <div style={{ background: 'var(--ink2)', border: '1px solid var(--line)', padding: '16px', borderRadius: '10px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--snow4)', letterSpacing: '0.05em', fontWeight: 600 }}>Low Stock (1-5)</span>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--amber)', marginTop: '6px', fontFamily: 'DM Mono, monospace' }}>{totalLowStock}</div>
        </div>
        <div style={{ background: 'var(--ink2)', border: '1px solid var(--line)', padding: '16px', borderRadius: '10px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--snow4)', letterSpacing: '0.05em', fontWeight: 600 }}>Out of Stock (0)</span>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--rose)', marginTop: '6px', fontFamily: 'DM Mono, monospace' }}>{totalOutOfStock}</div>
        </div>
      </div>

      {/* FILTER & TABS BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', borderBottom: '1px solid var(--line)', paddingBottom: '14px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setReportType('cubicles')}
            style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: reportType === 'cubicles' ? 'var(--gold-dim)' : 'transparent',
              border: reportType === 'cubicles' ? '1px solid var(--gold-line)' : '1px solid transparent',
              color: reportType === 'cubicles' ? 'var(--gold)' : 'var(--snow3)',
              transition: 'all 0.15s'
            }}
          >
            📦 Cubicle Layout Map
          </button>
          <button 
            onClick={() => setReportType('low_stock')}
            style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: reportType === 'low_stock' ? 'var(--rose-dim)' : 'transparent',
              border: reportType === 'low_stock' ? '1px solid var(--rose-line)' : '1px solid transparent',
              color: reportType === 'low_stock' ? 'var(--rose)' : 'var(--snow3)',
              transition: 'all 0.15s'
            }}
          >
            ⚠️ Low / Out of Stock
          </button>
          <button 
            onClick={() => setReportType('master')}
            style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: reportType === 'master' ? 'var(--teal-dim)' : 'transparent',
              border: reportType === 'master' ? '1px solid var(--teal-line)' : '1px solid transparent',
              color: reportType === 'master' ? 'var(--teal)' : 'var(--snow3)',
              transition: 'all 0.15s'
            }}
          >
            🗂️ Master Catalog Log
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '640px', flexWrap: 'wrap' }}>
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as any)}
            style={{
              padding: '8px 12px',
              background: 'var(--ink2)',
              border: '1px solid var(--line)',
              borderRadius: '6px',
              color: 'var(--snow2)',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">📦 All Stock Levels</option>
            <option value="instock">🟢 In Stock Only (&gt; 0)</option>
            <option value="low">🟡 Low Stock Only (1-5)</option>
            <option value="out">🔴 Out of Stock Only (0)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: '8px 12px',
              background: 'var(--ink2)',
              border: '1px solid var(--line)',
              borderRadius: '6px',
              color: 'var(--snow2)',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">👁️ All Product Statuses</option>
            <option value="active">🟢 Active Only</option>
            <option value="draft">🟡 Draft Only</option>
            <option value="archived">🔴 Archived Only</option>
          </select>

          <input 
            type="text"
            placeholder="Filter report by Title, SKU, Barcode, or Location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '8px 14px',
              background: 'var(--ink2)',
              border: '1px solid var(--line)',
              borderRadius: '6px',
              color: 'var(--snow)',
              fontSize: '12px',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* REPORT CONTENT WRAPPER */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--snow4)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px auto' }} />
            Loading catalog database...
          </div>
        ) : catalog.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--snow4)' }}>
            <span style={{ fontSize: '32px' }}>🗂️</span>
            <p style={{ marginTop: '12px', fontSize: '14px' }}>No catalog items stored locally.</p>
            <p style={{ fontSize: '12px', color: 'var(--snow4)' }}>Click "Sync from Shopify" above to load your inventory catalog.</p>
          </div>
        ) : (
          <>
            {/* VIEW A: CUBICLES MAP */}
            {reportType === 'cubicles' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {Object.entries(cubicleData).map(([location, items]) => {
                  if (items.length === 0) return null;

                  return (
                    <div 
                      key={location}
                      style={{
                        background: 'var(--ink2)',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        overflow: 'hidden'
                      }}
                    >
                      <div style={{
                        padding: '12px 20px',
                        background: 'var(--ink3)',
                        borderBottom: '1px solid var(--line)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--gold)', fontSize: '14px', fontFamily: 'DM Mono, monospace' }}>
                          📍 Cubicle: {location}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--snow3)', background: 'var(--ink)', padding: '2px 8px', borderRadius: '10px' }}>
                          {items.length} {items.length === 1 ? 'variant' : 'variants'}
                        </span>
                      </div>
                      
                      <div style={{ padding: '10px 20px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--snow4)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              <th style={{ padding: '8px 0', width: '40px' }}>Img</th>
                              <th style={{ padding: '8px 0' }}>Product</th>
                              <th style={{ padding: '8px 0', width: '150px' }}>SKU</th>
                              <th style={{ padding: '8px 0', width: '150px' }}>Barcode</th>
                              <th style={{ padding: '8px 0', width: '100px', textAlign: 'right' }}>Stock Level</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => (
                              <tr key={item.sku} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '12.5px', color: 'var(--snow2)' }}>
                                <td style={{ padding: '8px 0' }}>
                                  {item.image_url ? (
                                    <img src={item.image_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }} />
                                  ) : (
                                    <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>📦</div>
                                  )}
                                </td>
                                <td style={{ padding: '8px 0', paddingRight: '12px', fontWeight: 500, color: 'var(--snow)' }}>
                                  {item.title}
                                  {item.status && item.status !== 'active' && (
                                    <span style={{ 
                                      marginLeft: '8px', 
                                      fontSize: '9px', 
                                      fontWeight: 600,
                                      padding: '2px 6px', 
                                      borderRadius: '4px',
                                      background: item.status === 'draft' ? 'rgba(240,163,72,0.15)' : 'rgba(244,63,94,0.15)',
                                      color: item.status === 'draft' ? 'var(--amber)' : 'var(--rose)',
                                      border: item.status === 'draft' ? '1px solid rgba(240,163,72,0.2)' : '1px solid rgba(244,63,94,0.2)',
                                      verticalAlign: 'middle',
                                      display: 'inline-block'
                                    }}>
                                      {item.status.toUpperCase()}
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '8px 0', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>{item.sku}</td>
                                <td style={{ padding: '8px 0', color: 'var(--snow3)' }}>{item.barcode || '—'}</td>
                                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: (item.inventory_quantity ?? 0) === 0 ? 'var(--rose)' : (item.inventory_quantity ?? 0) < 5 ? 'var(--amber)' : 'var(--teal)' }}>
                                  {item.inventory_quantity ?? 0}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* VIEW B: LOW / OUT OF STOCK REPORT */}
            {reportType === 'low_stock' && (
              <div style={{ background: 'var(--ink2)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px 20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--snow4)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '10px 0', width: '40px' }}>Img</th>
                      <th style={{ padding: '10px 0' }}>Product</th>
                      <th style={{ padding: '10px 0', width: '150px' }}>SKU</th>
                      <th style={{ padding: '10px 0', width: '120px' }}>Cubicle</th>
                      <th style={{ padding: '10px 0', width: '100px', textAlign: 'right' }}>Stock Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalog
                      .filter((item) => (item.inventory_quantity ?? 0) <= 5)
                      .sort((a, b) => (a.inventory_quantity ?? 0) - (b.inventory_quantity ?? 0))
                      .map((item) => (
                        <tr key={item.sku} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px', color: 'var(--snow2)' }}>
                          <td style={{ padding: '10px 0' }}>
                            {item.image_url ? (
                              <img src={item.image_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>📦</div>
                            )}
                          </td>
                          <td style={{ padding: '10px 0', fontWeight: 500, color: 'var(--snow)' }}>
                            {item.title}
                            {item.status && item.status !== 'active' && (
                              <span style={{ 
                                marginLeft: '8px', 
                                fontSize: '9px', 
                                fontWeight: 600,
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                background: item.status === 'draft' ? 'rgba(240,163,72,0.15)' : 'rgba(244,63,94,0.15)',
                                color: item.status === 'draft' ? 'var(--amber)' : 'var(--rose)',
                                border: item.status === 'draft' ? '1px solid rgba(240,163,72,0.2)' : '1px solid rgba(244,63,94,0.2)',
                                verticalAlign: 'middle',
                                display: 'inline-block'
                              }}>
                                {item.status.toUpperCase()}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 0', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>{item.sku}</td>
                          <td style={{ padding: '10px 0' }}>
                            <span style={{ 
                              padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                              background: item.cubicle ? 'var(--gold-dim)' : 'rgba(255,255,255,0.05)',
                              border: item.cubicle ? '1px solid var(--gold-line)' : '1px solid transparent',
                              color: item.cubicle ? 'var(--gold)' : 'var(--snow4)'
                            }}>
                              {item.cubicle || 'Unassigned'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 'bold', color: (item.inventory_quantity ?? 0) === 0 ? 'var(--rose)' : 'var(--amber)' }}>
                            {(item.inventory_quantity ?? 0) === 0 ? '🔴 OUT OF STOCK' : `🟡 ${(item.inventory_quantity ?? 0)} left`}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* VIEW C: MASTER CATALOG LOG */}
            {reportType === 'master' && (
              <div style={{ background: 'var(--ink2)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px 20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--snow4)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '10px 0', width: '40px' }}>Img</th>
                      <th style={{ padding: '10px 0' }}>Product</th>
                      <th style={{ padding: '10px 0', width: '150px' }}>SKU</th>
                      <th style={{ padding: '10px 0', width: '150px' }}>Barcode</th>
                      <th style={{ padding: '10px 0', width: '120px' }}>Cubicle</th>
                      <th style={{ padding: '10px 0', width: '100px', textAlign: 'right' }}>Stock Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalog.map((item) => (
                      <tr key={item.sku} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px', color: 'var(--snow2)' }}>
                        <td style={{ padding: '10px 0' }}>
                          {item.image_url ? (
                            <img src={item.image_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>📦</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 0', fontWeight: 500, color: 'var(--snow)' }}>
                          {item.title}
                          {item.status && item.status !== 'active' && (
                            <span style={{ 
                              marginLeft: '8px', 
                              fontSize: '9px', 
                              fontWeight: 600,
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              background: item.status === 'draft' ? 'rgba(240,163,72,0.15)' : 'rgba(244,63,94,0.15)',
                              color: item.status === 'draft' ? 'var(--amber)' : 'var(--rose)',
                              border: item.status === 'draft' ? '1px solid rgba(240,163,72,0.2)' : '1px solid rgba(244,63,94,0.2)',
                              verticalAlign: 'middle',
                              display: 'inline-block'
                            }}>
                              {item.status.toUpperCase()}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 0', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>{item.sku}</td>
                        <td style={{ padding: '10px 0', color: 'var(--snow3)' }}>{item.barcode || '—'}</td>
                        <td style={{ padding: '10px 0' }}>
                          <span style={{ 
                            padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                            background: item.cubicle ? 'var(--gold-dim)' : 'rgba(255,255,255,0.05)',
                            border: item.cubicle ? '1px solid var(--gold-line)' : '1px solid transparent',
                            color: item.cubicle ? 'var(--gold)' : 'var(--snow4)'
                          }}>
                            {item.cubicle || 'Unassigned'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 'bold', color: (item.inventory_quantity ?? 0) === 0 ? 'var(--rose)' : (item.inventory_quantity ?? 0) < 5 ? 'var(--amber)' : 'var(--teal)' }}>
                          {item.inventory_quantity ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
