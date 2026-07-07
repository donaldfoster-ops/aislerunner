"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const PickTab = dynamic(() => import('@/components/pick/PickTab'), { ssr: false });
const PackTab = dynamic(() => import('@/components/pack/PackTab'), { ssr: false });
const ReportsTab = dynamic(() => import('@/components/reports/ReportsTab'), { ssr: false });

export default function Home() {
  const [activeTab, setActiveTab] = useState('pick');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [deviceProfile, setDeviceProfile] = useState<'mobile-picker' | 'desktop-packer' | 'all'>('all');
  
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

      // Initialize device profile
      const isMobileDevice = window.innerWidth <= 768;
      const savedProfile = localStorage.getItem('ar-device-profile') as 'mobile-picker' | 'desktop-packer' | 'all';
      if (savedProfile) {
        setDeviceProfile(savedProfile);
        if (savedProfile === 'mobile-picker') {
          setActiveTab('pick');
        } else if (savedProfile === 'desktop-packer') {
          setActiveTab('pack');
        }
      } else {
        const initialProfile = isMobileDevice ? 'mobile-picker' : 'desktop-packer';
        setDeviceProfile(initialProfile);
        setActiveTab(isMobileDevice ? 'pick' : 'pack');
        localStorage.setItem('ar-device-profile', initialProfile);
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

  const handleProfileChange = (profile: 'mobile-picker' | 'desktop-packer' | 'all') => {
    setDeviceProfile(profile);
    localStorage.setItem('ar-device-profile', profile);
    if (profile === 'mobile-picker') {
      setActiveTab('pick');
    } else if (profile === 'desktop-packer') {
      setActiveTab('pack');
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
          {(deviceProfile === 'all' || deviceProfile === 'mobile-picker') && (
            <button className={`nav-tab ${activeTab === 'pick' ? 'active' : ''}`} onClick={() => setActiveTab('pick')}>
              <span className="tab-icon">📦</span> Pick Orders
            </button>
          )}
          {(deviceProfile === 'all' || deviceProfile === 'desktop-packer') && (
            <button className={`nav-tab ${activeTab === 'pack' ? 'active' : ''}`} onClick={() => setActiveTab('pack')}>
              <span className="tab-icon">🏷️</span> Pack & Print
            </button>
          )}
          {(deviceProfile === 'all' || deviceProfile === 'desktop-packer') && (
            <button className={`nav-tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
              <span className="tab-icon">📊</span> Reports & Audits
            </button>
          )}
        </nav>

        <div className="header-right">
          {/* Device Profile Selector */}
          <select 
            value={deviceProfile} 
            onChange={(e) => handleProfileChange(e.target.value as any)}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--rs)',
              border: '1px solid var(--line2)',
              background: 'var(--ink3)',
              color: 'var(--snow2)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'all 0.15s'
            }}
          >
            <option value="all">🌐 Display All Tabs</option>
            <option value="mobile-picker">📦 Mobile Picker Mode</option>
            <option value="desktop-packer">🏷️ Desktop Packer Mode</option>
          </select>

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
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
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
        <div className={`panel ${activeTab === 'reports' ? 'active' : ''}`}>
          {activeTab === 'reports' && <ReportsTab />}
        </div>
      </main>
    </>
  );
}
