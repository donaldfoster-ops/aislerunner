"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const PickTab = dynamic(() => import('@/components/pick/PickTab'), { ssr: false });
const PackTab = dynamic(() => import('@/components/pack/PackTab'), { ssr: false });

export default function Home() {
  const [activeTab, setActiveTab] = useState('pick');
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Register Service Worker for offline capabilities
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => console.log('ServiceWorker registered with scope:', reg.scope))
          .catch((err) => console.error('ServiceWorker registration failed:', err));
      }
    }
  }, []);

  return (
    <>
      <header className="header">
        <div className="logo">
          <div className="logo-mark" style={{ background: 'var(--gold)', color: 'var(--ink)' }}>AR</div>
          <div>
            <div className="logo-text">Aisle Runner</div>
            <div className="logo-sub">wms microfulfillment</div>
          </div>
        </div>

        <nav className="nav-tabs">
          <button className={`nav-tab ${activeTab === 'pick' ? 'active' : ''}`} onClick={() => setActiveTab('pick')}>
            <span className="tab-icon">📦</span> Pick Orders
          </button>
          <button className={`nav-tab ${activeTab === 'pack' ? 'active' : ''}`} onClick={() => setActiveTab('pack')}>
            <span className="tab-icon">🏷️</span> Pack & Print
          </button>
        </nav>

        <div className="header-right">
          <div className="store-status">
            <div className="status-dot"></div>
            mazonkiki.myshopify.com
          </div>
        </div>
      </header>

      <main className="main">
        <div className={`panel ${activeTab === 'pick' ? 'active' : ''}`}>
          {activeTab === 'pick' && <PickTab />}
        </div>
        <div className={`panel ${activeTab === 'pack' ? 'active' : ''}`}>
          {activeTab === 'pack' && <PackTab />}
        </div>
      </main>
    </>
  );
}
