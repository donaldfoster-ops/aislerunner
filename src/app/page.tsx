"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const PickTab = dynamic(() => import('@/components/pick/PickTab'), { ssr: false });
const PackTab = dynamic(() => import('@/components/pack/PackTab'), { ssr: false });

export default function Home() {
  const [activeTab, setActiveTab] = useState('pick');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Register Service Worker for offline capabilities
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
          .then((reg) => console.log('ServiceWorker registered with scope:', reg.scope))
          .catch((err) => console.error('ServiceWorker registration failed:', err));
      }

      // Initialize theme
      const savedTheme = localStorage.getItem('ar-theme') as 'dark' | 'light';
      if (savedTheme === 'light') {
        setTheme('light');
        document.documentElement.classList.add('light-theme');
      } else {
        setTheme('dark');
        document.documentElement.classList.remove('light-theme');
      }
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('ar-theme', newTheme);
    
    if (newTheme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  };

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
          <button 
            onClick={toggleTheme}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--rs)',
              border: '1px solid var(--line2)',
              background: 'var(--ink3)',
              color: 'var(--snow2)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              fontFamily: 'inherit',
              transition: 'all 0.15s'
            }}
            title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>

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
