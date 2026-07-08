"use client";
import { useState, useEffect, useRef } from 'react';
import { 
  ActiveOrder, 
  OrderLineItem, 
  getActiveOrders, 
  saveActiveOrder,
  deleteActiveOrder
} from '@/lib/pick-storage';

// Browser-native PDF print helper using hidden iframe
const printPdfNative = (pdfBase64: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const byteCharacters = atob(pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = blobUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve();
        } catch (e: any) {
          reject(e);
        } finally {
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
          }, 2000);
        }
      };
      
      iframe.onerror = () => {
        reject(new Error("Iframe print loading failed"));
        document.body.removeChild(iframe);
        URL.revokeObjectURL(blobUrl);
      };
    } catch (err) {
      reject(err);
    }
  });
};

export default function PackTab() {
  // Print status
  const [printError, setPrintError] = useState<string>('');
  const [printStatus, setPrintStatus] = useState<string>('');

  // Orders and selection state
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ActiveOrder | null>(null);
  const [searchOrderNumber, setSearchOrderNumber] = useState<string>('');
  
  // Packing audit state
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [auditMessage, setAuditMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isOrderComplete, setIsOrderComplete] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [lastLabelUrl, setLastLabelUrl] = useState<string | null>(null);
  const [lastLabelOrder, setLastLabelOrder] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Responsive layout state
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [mobileView, setMobileView] = useState<'list' | 'workspace'>('list');

  // Camera scan state
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth <= 768;

  // Initialize and load orders
  useEffect(() => {
    loadLocalOrders();

    // Auto-focus barcode scanner input
    const timer = setInterval(() => {
      if (selectedOrder && !isOrderComplete && barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [selectedOrder, isOrderComplete]);

  // Toast auto-expire
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const triggerToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  };

  // Synchronize mobileView and selectedOrder with browser history to handle system back button
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (event: PopStateEvent) => {
      setSelectedOrder(null);
      setMobileView('list');
    };

    if (mobileView === 'workspace') {
      window.history.pushState({ view: 'workspace' }, '');
      window.addEventListener('popstate', handlePopState);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [mobileView]);

  const goBackToList = () => {
    if (isMobile && mobileView === 'workspace') {
      window.history.back();
    } else {
      setSelectedOrder(null);
      setMobileView('list');
    }
  };

  // Load orders from local IndexedDB (only fully picked ones)
  const loadLocalOrders = async () => {
    try {
      const orders = await getActiveOrders();
      // Filter orders that have been fully picked
      const pickedOrders = orders.filter(o => {
        const allItemsPicked = o.line_items.length > 0 && o.line_items.every(li => li.picked);
        return allItemsPicked || o.status === 'fully_picked';
      });
      pickedOrders.sort((a, b) => b.order_number.localeCompare(a.order_number));
      setActiveOrders(pickedOrders);
    } catch (err) {
      console.error('Failed to load orders for packing:', err);
    }
  };



  // Audio indicator for scanning validation
  const playSound = (type: 'match' | 'error') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      if (type === 'match') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
        
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.start();
        osc2.start(ctx.currentTime + 0.08);
        osc1.stop(ctx.currentTime + 0.25);
        osc2.stop(ctx.currentTime + 0.35);
      } else {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, ctx.currentTime); // Low buzz
        
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch (err) {
      console.warn('Audio feedback failed:', err);
    }
  };

  // Search or select active order
  const handleSelectOrder = (order: ActiveOrder) => {
    // Add packed_qty parameter to each line item if missing
    const preparedItems = order.line_items.map(li => ({
      ...li,
      picked_qty: li.picked_qty || li.qty, // default picked_qty to required qty
      packed_qty: 0 // initialize packed quantity at packing desk
    }));
    
    setSelectedOrder({
      ...order,
      line_items: preparedItems as any
    });
    setAuditMessage(null);
    setIsOrderComplete(false);
    setBarcodeInput('');
    setMobileView('workspace');
  };

  // Search by order number string input
  const handleSearchOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchOrderNumber.trim()) return;
    
    const cleanSearch = searchOrderNumber.trim().replace('#', '');
    const found = activeOrders.find(o => 
      o.order_number.replace('#', '') === cleanSearch
    );
    
    if (found) {
      handleSelectOrder(found);
      setSearchOrderNumber('');
      setMobileView('workspace');
    } else {
      triggerToast('error', `Order #${cleanSearch} not found (or not marked as fully picked).`);
    }
  };

  // Handle product barcode entry (keyboard / USB scanner event)
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !barcodeInput.trim() || isOrderComplete) return;

    const code = barcodeInput.trim();
    setBarcodeInput('');
    setAuditMessage(null);

    // Find the first line item that matches the barcode/SKU and has pending packed items
    const matchIndex = selectedOrder.line_items.findIndex((item: any) => {
      const expectedBarcode = item.barcode ? item.barcode.trim() : '';
      const expectedSku = item.sku ? item.sku.trim() : '';
      const hasPendingPack = (item.packed_qty || 0) < item.qty;
      
      const isCodeMatch = (expectedBarcode && code === expectedBarcode) || (code === expectedSku);
      return isCodeMatch && hasPendingPack;
    });

    if (matchIndex !== -1) {
      // Matches!
      playSound('match');
      
      const updatedLineItems = selectedOrder.line_items.map((item: any, idx) => {
        if (idx === matchIndex) {
          return { ...item, packed_qty: (item.packed_qty || 0) + 1 };
        }
        return item;
      });

      const allPacked = updatedLineItems.every((item: any) => (item.packed_qty || 0) >= item.qty);
      const updatedOrder = {
        ...selectedOrder,
        line_items: updatedLineItems
      };

      setSelectedOrder(updatedOrder);
      setAuditMessage({ type: 'success', text: `Verified 1x "${updatedLineItems[matchIndex].title}"` });

      if (allPacked) {
        setIsOrderComplete(true);
        triggerToast('success', `Order #${selectedOrder.order_number} fully audited! Triggering label printing...`);
        autoPrintLabel(updatedOrder);
      }
    } else {
      // Mismatch or already fully packed
      playSound('error');
      
      // Check if it exists at all
      const exist = selectedOrder.line_items.find((item: any) => {
        const expectedBarcode = item.barcode ? item.barcode.trim() : '';
        const expectedSku = item.sku ? item.sku.trim() : '';
        return (expectedBarcode && code === expectedBarcode) || (code === expectedSku);
      });

      if (exist) {
        setAuditMessage({ type: 'error', text: `Item already fully audited: "${exist.title}"` });
      } else {
        setAuditMessage({ type: 'error', text: `Barcode "${code}" does not match any item in this order.` });
      }
    }
  };

  // Manual Override (Force verify item)
  const handleForceVerifyPack = (sku: string) => {
    if (!selectedOrder || isOrderComplete) return;

    const updatedLineItems = selectedOrder.line_items.map((item: any) => {
      if (item.sku === sku) {
        return { ...item, packed_qty: item.qty };
      }
      return item;
    });

    const allPacked = updatedLineItems.every((item: any) => (item.packed_qty || 0) >= item.qty);
    const updatedOrder = {
      ...selectedOrder,
      line_items: updatedLineItems
    };

    setSelectedOrder(updatedOrder);
    playSound('match');
    setAuditMessage({ type: 'success', text: `Manual audit bypass applied for item.` });

    if (allPacked) {
      setIsOrderComplete(true);
      triggerToast('success', `Order #${selectedOrder.order_number} fully audited! Printing...`);
      autoPrintLabel(updatedOrder);
    }
  };

  // Handle camera scanned barcode
  const handleCameraBarcodeScanned = (code: string) => {
    if (!selectedOrder || isOrderComplete) return;
    
    const cleanCode = code.trim();
    
    // Find matching item
    const matchIndex = selectedOrder.line_items.findIndex((item: any) => {
      const expectedBarcode = item.barcode ? item.barcode.trim() : '';
      const expectedSku = item.sku ? item.sku.trim() : '';
      const hasPendingPack = (item.packed_qty || 0) < item.qty;
      
      const isCodeMatch = (expectedBarcode && cleanCode === expectedBarcode) || (cleanCode === expectedSku);
      return isCodeMatch && hasPendingPack;
    });

    if (matchIndex !== -1) {
      playSound('match');
      
      const updatedLineItems = selectedOrder.line_items.map((item: any, idx) => {
        if (idx === matchIndex) {
          return { ...item, packed_qty: (item.packed_qty || 0) + 1 };
        }
        return item;
      });

      const allPacked = updatedLineItems.every((item: any) => (item.packed_qty || 0) >= item.qty);
      const updatedOrder = {
        ...selectedOrder,
        line_items: updatedLineItems
      };

      setSelectedOrder(updatedOrder);
      setAuditMessage({ type: 'success', text: `Verified 1x "${updatedLineItems[matchIndex].title}"` });

      if (allPacked) {
        setIsOrderComplete(true);
        setIsCameraOpen(false); // Close camera on order completion
        triggerToast('success', `Order #${selectedOrder.order_number} fully audited! Printing...`);
        autoPrintLabel(updatedOrder);
      }
    } else {
      playSound('error');
      
      // Check if it exists at all
      const exist = selectedOrder.line_items.find((item: any) => {
        const expectedBarcode = item.barcode ? item.barcode.trim() : '';
        const expectedSku = item.sku ? item.sku.trim() : '';
        return (expectedBarcode && cleanCode === expectedBarcode) || (cleanCode === expectedSku);
      });

      if (exist) {
        triggerToast('error', `Item already fully audited: "${exist.title}"`);
      } else {
        triggerToast('error', `Scanned code "${cleanCode}" does not match this order.`);
      }
    }
  };

  // Camera scanner mounting lifecycle hook
  useEffect(() => {
    if (isCameraOpen && selectedOrder && !isOrderComplete && typeof window !== 'undefined') {
      let activeScanner: any = null;
      setCameraError(null);
      
      const timer = setTimeout(() => {
        import('html5-qrcode').then((module) => {
          const scanner = new module.Html5Qrcode("pack-reader");
          activeScanner = scanner;
          
          scanner.start(
            { facingMode: "environment" },
            { 
              fps: 15, 
              qrbox: (width: number, height: number) => {
                const size = Math.min(width, height) * 0.7;
                return { width: size, height: size * 0.5 };
              }
            },
            (decodedText) => {
              handleCameraBarcodeScanned(decodedText);
            },
            (errorMessage) => {
              // Ignore scanning loop debug messages
            }
          ).catch((err) => {
            console.error("Camera start failed:", err);
            setCameraError(err.message || "Camera access denied.");
          });
        }).catch((err) => {
          console.error("html5-qrcode loading failed:", err);
          setCameraError("Failed to initialize scanner library.");
        });
      }, 200);
      
      return () => {
        clearTimeout(timer);
        if (activeScanner) {
          try {
            activeScanner.stop().catch((e: any) => console.warn("Error stopping camera:", e));
          } catch (e) {}
        }
      };
    }
  }, [isCameraOpen, selectedOrder, isOrderComplete]);

  // Fetch mock/real label PDF base64 and trigger browser print dialog
  const autoPrintLabel = async (order: ActiveOrder) => {
    setIsPrinting(true);
    setPrintError('');
    setPrintStatus('Generating shipping label...');
    setLastLabelUrl(null);
    setLastLabelOrder(null);

    try {
      // Fetch label from API
      const res = await fetch(`/api/shopify?action=getLabelPDF&order_number=${order.order_number}&order_id=${order.order_id}&push_queue=true`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      // Convert base64 to Blob URL for local mobile download/viewing
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      
      setLastLabelUrl(blobUrl);
      setLastLabelOrder(order.order_number);

      setPrintStatus('Opening browser print preview...');
      await printPdfNative(data.pdf);

      triggerToast('success', `Order #${order.order_number} packed successfully! Print dialog opened.`);
      
      // Archive/delete order locally since it has been fulfilled
      await deleteActiveOrder(order.order_id);
      await loadLocalOrders();
      setIsOrderComplete(false);
      goBackToList();
    } catch (err: any) {
      console.error('Print job failed:', err);
      setPrintError(`Print failed: ${err.message}`);
      triggerToast('error', `Printing failed: ${err.message}`);
    } finally {
      setIsPrinting(false);
      setPrintStatus('');
    }
  };

  // Print raw test page via browser print dialog
  const handlePrintTestLabel = async () => {
    setIsPrinting(true);
    setPrintError('');
    setPrintStatus('Printing test label...');

    try {
      const res = await fetch(`/api/shopify?action=getLabelPDF&order_number=TEST-LABEL`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      await printPdfNative(data.pdf);
      triggerToast('success', 'Test label print dialog opened!');
    } catch (err: any) {
      console.error(err);
      setPrintError(`Test print failed: ${err.message}`);
      triggerToast('error', `Test print failed: ${err.message}`);
    } finally {
      setIsPrinting(false);
      setPrintStatus('');
    }
  };

  return (
    <div className="pack-layout" style={{ 
      display: isMobile ? 'flex' : 'grid', 
      gridTemplateColumns: isMobile ? undefined : '320px 1fr', 
      flexDirection: isMobile ? 'column' : undefined,
      flex: 1, 
      overflow: 'hidden' 
    }}>
      
      {/* Toast Alert overlay */}
      {toast && (
        <div className={`toast ${toast.type}`} style={{
          position: 'fixed',
          bottom: '24px', left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 20px',
          borderRadius: '10px',
          fontSize: '13px',
          fontFamily: 'DM Mono, monospace',
          zIndex: 1001,
          animation: 'toast-in 0.2s ease',
          background: toast.type === 'success' ? 'var(--teal-dim)' : 'var(--rose-dim)',
          border: toast.type === 'success' ? '1px solid var(--teal-line)' : '1px solid var(--rose-line)',
          color: toast.type === 'success' ? 'var(--teal)' : 'var(--rose)'
        }}>
          {toast.message}
        </div>
      )}

      {/* LEFT SIDEBAR: Config & Ready Orders */}
      {(!isMobile || mobileView === 'list') && (
        <div className="pack-sidebar" style={{ 
          width: isMobile ? '100%' : '320px',
          background: 'var(--ink2)', 
          borderRight: '1px solid var(--line)', 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden',
          height: '100%'
        }}>
          
          {/* Mobile direct download overlay */}
          {isMobile && lastLabelUrl && (
            <div style={{
              padding: '16px 20px',
              background: 'var(--teal-dim)',
              borderBottom: '1px solid var(--teal-line)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ color: 'var(--teal)', fontSize: '13px', fontWeight: 600 }}>
                🎉 Order #{lastLabelOrder} Packed!
              </div>
              <a 
                href={lastLabelUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ textDecoration: 'none', justifyContent: 'center', fontSize: '11px', padding: '4px 10px', display: 'inline-flex' }}
              >
                📥 Download PDF Label
              </a>
            </div>
          )}

          {/* Browser Printing Status */}
          {!isMobile && (
            <div style={{ padding: '20px', borderBottom: '1px solid var(--line)', background: 'rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--snow3)' }}>Printer Connection</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ 
                    width: '8px', height: '8px', borderRadius: '50%', 
                    background: 'var(--teal)',
                    boxShadow: '0 0 8px var(--teal)'
                  }}></span>
                  <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--teal)' }}>Browser Print (Active)</span>
                </div>
              </div>
              <div style={{ marginTop: '10px' }}>
                <button 
                  className="btn" 
                  onClick={handlePrintTestLabel} 
                  disabled={isPrinting}
                  style={{ width: '100%', fontSize: '11px', padding: '5px', background: 'transparent', border: '1px dashed var(--line2)', color: 'var(--snow3)' }}
                >
                  {isPrinting ? 'Generating...' : '🖨️ Print Test Label'}
                </button>
              </div>
            </div>
          )}

          {/* Ready to Pack Orders list */}
          <div style={{ padding: '20px 20px 10px 20px', borderBottom: '1px solid var(--line)' }}>
            <form onSubmit={handleSearchOrder} style={{ display: 'flex', gap: '6px' }}>
              <input 
                type="text" 
                placeholder="Search Order Number (e.g. 1027)..." 
                value={searchOrderNumber}
                onChange={(e) => setSearchOrderNumber(e.target.value)}
                style={{ 
                  flex: 1, padding: '7px 12px', borderRadius: '6px', background: 'var(--ink3)', 
                  border: '1px solid var(--line)', color: 'var(--snow)', fontSize: '12px',
                  fontFamily: 'DM Mono, monospace'
                }}
              />
              <button type="submit" className="btn" style={{ padding: '7px 12px', background: 'var(--ink3)', border: '1px solid var(--line)', fontSize: '12px' }}>🔍</button>
            </form>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
            <div style={{ padding: '10px 20px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--snow3)', letterSpacing: '0.05em' }}>
              Ready to Pack ({activeOrders.length})
            </div>

            {activeOrders.length === 0 ? (
              <div style={{ padding: '30px 20px', color: 'var(--snow4)', textAlign: 'center', fontSize: '13px' }}>
                No orders fully picked yet.<br />
                Complete picking on mobile to load orders here.
              </div>
            ) : (
              activeOrders.map((order) => {
                const isSelected = selectedOrder?.order_id === order.order_id;
                return (
                  <div 
                    key={order.order_id}
                    onClick={() => handleSelectOrder(order)}
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--line)',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--ink3)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--gold)' : '3px solid transparent',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontFamily: 'DM Mono, monospace', fontSize: '13px', color: isSelected ? 'var(--snow)' : 'var(--snow2)' }}>
                        #{order.order_number}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 600, background: 'var(--teal-dim)', padding: '2px 8px', borderRadius: '10px' }}>
                        Picked
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--snow3)' }}>
                      {order.customer_name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--snow4)', marginTop: '2px', fontFamily: 'DM Mono, monospace' }}>
                      {order.line_items.length} items
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* RIGHT WORKSPACE: Verification & Printer Trigger */}
      {(!isMobile || mobileView === 'workspace') && (
        <div className="pack-workspace" style={{ background: 'var(--ink)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, height: '100%' }}>
          
          {!selectedOrder ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--snow4)', padding: '40px' }}>
              <span style={{ fontSize: '48px', marginBottom: '16px' }}>🏷️</span>
              <h3 style={{ fontFamily: 'Syne, sans-serif', color: 'var(--snow2)', marginBottom: '8px' }}>Packing Station Audit</h3>
              <p style={{ maxWidth: '400px', textAlign: 'center', fontSize: '13px' }}>
                Select a picked order from the sidebar list, or scan an order barcode to verify contents and print the shipping label.
              </p>
              
              {lastLabelUrl && (
                <div style={{
                  marginTop: '24px',
                  padding: '20px',
                  background: 'var(--teal-dim)',
                  border: '1px solid var(--teal-line)',
                  borderRadius: 'var(--r)',
                  textAlign: 'center',
                  maxWidth: '400px',
                  animation: 'slideInUp 0.3s ease-out'
                }}>
                  <span style={{ fontSize: '24px' }}>🎉</span>
                  <h4 style={{ color: 'var(--teal)', fontSize: '15px', fontWeight: 600, marginTop: '8px' }}>
                    Order #{lastLabelOrder} Packed!
                  </h4>
                  <p style={{ color: 'var(--snow3)', fontSize: '12px', marginTop: '6px', marginBottom: '16px' }}>
                    The simulated thermal shipping label PDF has been generated.
                  </p>
                  <a 
                    href={lastLabelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                    style={{ textDecoration: 'none', justifyContent: 'center', display: 'inline-flex' }}
                  >
                    📥 Open / Download PDF Label
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              
              {/* Header section */}
              <div style={{ padding: '24px 30px', borderBottom: '1px solid var(--line)', background: 'var(--ink2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    Packing Order <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)' }}>#{selectedOrder.order_number}</span>
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--snow3)', marginTop: '4px' }}>
                    Customer: <strong>{selectedOrder.customer_name}</strong> | ID: {selectedOrder.order_id}
                  </p>
                </div>

                {/* Reset/Cancel button */}
                <button 
                  onClick={goBackToList} 
                  style={{ background: 'var(--ink3)', border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 12px', color: 'var(--snow3)', fontSize: '12px', cursor: 'pointer' }}
                >
                  {isMobile ? '← Back' : 'Close Order'}
                </button>
              </div>

              {/* Error logs or status bars */}
              {(printError || printStatus) && (
                <div style={{
                  background: printError ? 'var(--rose-dim)' : 'var(--teal-dim)',
                  borderBottom: printError ? '1px solid var(--rose-line)' : '1px solid var(--teal-line)',
                  padding: '10px 30px',
                  color: printError ? 'var(--rose)' : 'var(--teal)',
                  fontSize: '12px',
                  fontFamily: 'DM Mono, monospace'
                }}>
                  {printError ? `⚠️ ${printError}` : `🖨️ ${printStatus}`}
                </div>
              )}

              {/* Verification Barcode Scan Input Bar */}
              <div style={{ padding: isMobile ? '12px 16px' : '20px 30px', background: 'var(--ink2)', borderBottom: '1px solid var(--line)' }}>
                <form onSubmit={handleBarcodeSubmit} style={{ 
                  display: 'flex', 
                  gap: isMobile ? '8px' : '12px', 
                  alignItems: 'center',
                  width: '100%',
                  flexWrap: 'nowrap'
                }}>
                  {!isMobile && (
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--snow2)', whiteSpace: 'nowrap' }}>
                      👉 SCAN ITEM:
                    </div>
                  )}
                  <input 
                    type="text" 
                    ref={barcodeInputRef}
                    value={barcodeInput}
                    disabled={isOrderComplete}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder={isOrderComplete ? "Audited" : (isMobile ? "Scan or type code..." : "Scan item barcode or type SKU...")}
                    style={{
                      flex: 1,
                      minWidth: '50px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'var(--ink)',
                      border: '1px solid var(--line)',
                      color: 'var(--snow)',
                      fontSize: '14px',
                      fontFamily: 'DM Mono, monospace',
                      outline: 'none',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                    }}
                  />
                  <button 
                    type="button" 
                    onClick={() => setIsCameraOpen(true)}
                    className="btn"
                    style={{ 
                      padding: isMobile ? '10px 12px' : '10px 14px', 
                      background: 'var(--ink3)', 
                      border: '1px solid var(--line)', 
                      borderRadius: '8px', 
                      fontSize: '16px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                    title="Scan Barcode via Camera"
                  >
                    📷
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={isOrderComplete || !barcodeInput.trim()}
                    style={{ 
                      padding: isMobile ? '10px 12px' : '10px 20px', 
                      fontSize: '13px',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    {isMobile ? 'Verify' : 'Verify Scan'}
                  </button>
                </form>

                {/* Audit message log / status alert */}
                {auditMessage && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 16px',
                    borderRadius: '6px',
                    background: auditMessage.type === 'success' ? 'var(--teal-dim)' : 'var(--rose-dim)',
                    border: auditMessage.type === 'success' ? '1px solid var(--teal-line)' : '1px solid var(--rose-line)',
                    color: auditMessage.type === 'success' ? 'var(--teal)' : 'var(--rose)',
                    fontSize: '13px',
                    fontWeight: 500,
                    animation: 'slideInDown 0.15s ease-out'
                  }}>
                    {auditMessage.type === 'success' ? '✓' : '⚠️'} {auditMessage.text}
                  </div>
                )}
              </div>

              {/* Verified order items table */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 30px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--snow3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ paddingBottom: '10px', width: '90px' }}>Bin</th>
                      <th style={{ paddingBottom: '10px' }}>Product</th>
                      <th style={{ paddingBottom: '10px', width: '150px' }}>SKU/Barcode</th>
                      <th style={{ paddingBottom: '10px', width: '100px', textAlign: 'center' }}>Verified</th>
                      <th style={{ paddingBottom: '10px', width: '100px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.line_items.map((item: any) => {
                      const packed = item.packed_qty || 0;
                      const complete = packed >= item.qty;
                      return (
                        <tr 
                          key={item.sku} 
                          style={{ 
                            borderBottom: '1px solid var(--line)', 
                            background: complete ? 'rgba(61, 217, 192, 0.02)' : 'transparent',
                            transition: 'background 0.15s'
                          }}
                        >
                          {/* Cubicle Badge */}
                          <td style={{ padding: '16px 0' }}>
                            <span style={{
                              padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                              background: item.cubicle && item.cubicle !== 'Unknown' ? 'var(--gold-dim)' : 'var(--ink3)',
                              border: item.cubicle && item.cubicle !== 'Unknown' ? '1px solid var(--gold-line)' : '1px solid var(--line)',
                              color: item.cubicle && item.cubicle !== 'Unknown' ? 'var(--gold)' : 'var(--snow4)'
                            }}>
                              {item.cubicle || 'Unknown'}
                            </span>
                          </td>
                          
                          {/* Title */}
                          <td style={{ padding: '16px 0', paddingRight: '20px' }}>
                            <div style={{ fontWeight: 600, color: complete ? 'var(--snow3)' : 'var(--snow)', fontSize: '13px' }}>
                              {item.title}
                            </div>
                          </td>

                          {/* SKU/Barcode */}
                          <td style={{ padding: '16px 0', fontFamily: 'DM Mono, monospace', fontSize: '12px', color: 'var(--snow3)' }}>
                            <div>SKU: {item.sku}</div>
                            {item.barcode && <div style={{ fontSize: '11px', color: 'var(--snow4)', marginTop: '2px' }}>UPC: {item.barcode}</div>}
                          </td>

                          {/* Progress status */}
                          <td style={{ padding: '16px 0', textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ 
                                fontSize: '14px', fontWeight: 700, 
                                color: complete ? 'var(--teal)' : (packed > 0 ? 'var(--amber)' : 'var(--snow3)')
                              }}>
                                {packed} / {item.qty}
                              </div>
                              {complete && (
                                <span style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 600, textTransform: 'uppercase', marginTop: '2px' }}>
                                  Verified
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Manual override action */}
                          <td style={{ padding: '16px 0', textAlign: 'right' }}>
                            {!complete && (
                              <button
                                onClick={() => handleForceVerifyPack(item.sku)}
                                style={{
                                  background: 'transparent',
                                  border: '1px dashed var(--line2)',
                                  borderRadius: '4px',
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  color: 'var(--snow3)',
                                  cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--gold-line)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--snow3)'; e.currentTarget.style.borderColor = 'var(--line2)'; }}
                              >
                                Bypass Scan
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>
      )}

      {/* CAMERA SCAN MODAL OVERLAY */}
      {isCameraOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10, 10, 12, 0.95)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '480px',
            background: 'var(--ink2)',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            animation: 'fadeInScale 0.25s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--snow)' }}>
                📷 Camera Barcode Scanner
              </h3>
              <button 
                onClick={() => setIsCameraOpen(false)}
                style={{
                  background: 'var(--ink3)',
                  border: '1px solid var(--line)',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--snow3)',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--snow3)', margin: 0 }}>
              Align the barcode of the product inside the scan box below.
            </p>

            {cameraError && (
              <div style={{
                background: 'var(--rose-dim)',
                border: '1px solid var(--rose-line)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: 'var(--rose)',
                fontSize: '12px',
                lineHeight: '1.4'
              }}>
                ⚠️ {cameraError}
              </div>
            )}

            <div 
              id="pack-reader" 
              style={{ 
                width: '100%', 
                minHeight: '260px',
                overflow: 'hidden', 
                borderRadius: '12px', 
                border: '1px solid var(--line)',
                background: '#000'
              }}
            ></div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={() => setIsCameraOpen(false)}
                className="btn"
                style={{ 
                  flex: 1, 
                  justifyContent: 'center', 
                  background: 'var(--ink3)', 
                  border: '1px solid var(--line)',
                  padding: '10px',
                  fontSize: '13px'
                }}
              >
                Cancel / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
