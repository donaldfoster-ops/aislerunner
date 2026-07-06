"use client";
import { useState, useEffect, useRef } from 'react';
import { 
  CatalogItem, 
  ActiveOrder, 
  OrderLineItem, 
  PickQueueItem,
  saveCatalog,
  getCatalogItem,
  saveActiveOrder,
  getActiveOrders,
  deleteActiveOrder,
  queuePickAction,
  getPendingQueue,
  markQueueItemUploaded,
  clearUploadedQueue,
  removePickActionFromQueue,
  searchCatalogItem
} from '@/lib/pick-storage';

interface SessionLineItem {
  sku: string;
  barcode: string;
  title: string;
  qty: number;
  picked_qty: number;
  cubicle: string;
  picked: boolean;
  allocations: {
    order_id: string;
    order_number: string;
    qty: number;
    picked_qty: number;
  }[];
}

interface PickSession {
  isBatch: boolean;
  orderIds: string[];
  orderNumbers: string[];
  customerNames: string[];
  lineItems: SessionLineItem[];
}

export default function PickTab() {
  const [mounted, setMounted] = useState<boolean>(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Connectivity & status states
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [syncError, setSyncError] = useState<string>('');
  const [lastSyncedCatalog, setLastSyncedCatalog] = useState<number | null>(null);
  
  // Local data states
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ActiveOrder | null>(null);
  const [pendingQueue, setPendingQueue] = useState<PickQueueItem[]>([]);
  
  // WMS Batching and Sessions states
  const [activeSession, setActiveSession] = useState<PickSession | null>(null);
  const [selectedSidebarOrderIds, setSelectedSidebarOrderIds] = useState<Set<string>>(new Set());
  
  // Search and batch load states (Online only)
  const [searchOrderNumber, setSearchOrderNumber] = useState<string>('');
  const [batchOrders, setBatchOrders] = useState<ActiveOrder[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
  
  // Scanner states (Offline capable)
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [scanningItem, setScanningItem] = useState<SessionLineItem | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerSuccess, setScannerSuccess] = useState<boolean>(false);
  const [scannedCode, setScannedCode] = useState<string>(''); // For simulation/typing
  
  // Audio indicator simulation (Visual feedback is cleaner, but let's add visual alerts)
  const [flashGreen, setFlashGreen] = useState<boolean>(false);
  const [flashRed, setFlashRed] = useState<boolean>(false);

  // Toast notifications
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [mobileActiveView, setMobileActiveView] = useState<'list' | 'workspace'>('list');

  // Stock lookup states
  const [isStockLookupOpen, setIsStockLookupOpen] = useState<boolean>(false);
  const [lookupQuery, setLookupQuery] = useState<string>('');
  const [lookupResult, setLookupResult] = useState<CatalogItem | null>(null);
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookupScanning, setIsLookupScanning] = useState<boolean>(false);
  const lookupScannerRef = useRef<any>(null);
  const pickScannerRef = useRef<HTMLDivElement | null>(null);
  const pickModalInputRef = useRef<HTMLInputElement>(null);

  // Intake Panel States
  const [isIntakeOpen, setIsIntakeOpen] = useState<boolean>(false);
  const [intakeLocation, setIntakeLocation] = useState<string>('');
  const [intakeQty, setIntakeQty] = useState<string>('');
  const [intakeMode, setIntakeMode] = useState<'add' | 'set'>('add');
  const [intakeLoading, setIntakeLoading] = useState<boolean>(false);
  const [intakeSuccess, setIntakeSuccess] = useState<string | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);

  // OCR and Torch states
  const [scannerMode, setScannerMode] = useState<'barcode' | 'ocr'>('barcode');
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [ocrWorker, setOcrWorker] = useState<any>(null);
  const [ocrProcessing, setOcrProcessing] = useState<boolean>(false);
  const [ocrReadText, setOcrReadText] = useState<string>('');
  const ocrIntervalRef = useRef<any>(null);
  const ocrStreamRef = useRef<MediaStream | null>(null);

  // Shared audio context to bypass browser/mobile audio policies
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);

  const initAudioContext = () => {
    if (typeof window === 'undefined' || audioCtx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      // Play a quick silent note to unlock the AudioContext immediately on interaction
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      if (ctx.resume) {
        ctx.resume();
      }
      setAudioCtx(ctx);
    } catch (e) {
      console.warn("Failed to initialize AudioContext:", e);
    }
  };

  useEffect(() => {
    if (!activeSession) {
      setMobileActiveView('list');
    }
  }, [activeSession]);

  const playSound = (type: 'success' | 'error') => {
    if (typeof window === 'undefined') return;
    
    // Trigger mobile haptic vibration
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (type === 'success') {
          navigator.vibrate(100);
        } else {
          navigator.vibrate([200, 100, 200]);
        }
      }
    } catch (e) {
      console.warn("Haptic vibration failed:", e);
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      let ctx = audioCtx;
      if (!ctx) {
        ctx = new AudioContextClass();
      }
      if (ctx.state === 'suspended' && ctx.resume) {
        ctx.resume();
      }

      if (type === 'success') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);

        setTimeout(() => {
          if (!ctx) return;
          try {
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1320, ctx.currentTime); // E6 note
            gain2.gain.setValueAtTime(0.08, ctx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc2.start(ctx.currentTime);
            osc2.stop(ctx.currentTime + 0.15);
          } catch (e) {}
        }, 80);
      } else {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(130, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (err) {
      console.warn('Audio feedback failed:', err);
    }
  };

  const triggerToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    playSound(type);
    // Clear after 4 seconds
    setTimeout(() => {
      setToast(current => current?.message === message ? null : current);
    }, 4000);
  };

  // Initialize and load local data
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('lastSyncedCatalog');
      if (stored) setLastSyncedCatalog(Number(stored));
    }
    loadLocalOrders();
    loadPendingQueue();
  }, []);

  // Monitor connectivity status
  const checkOnlineStatus = async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return;
    }
    try {
      const res = await fetch('/api/shopify?ping=true', { method: 'HEAD', cache: 'no-store' });
      setIsOnline(res.ok);
    } catch (e) {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    checkOnlineStatus();
    const interval = setInterval(checkOnlineStatus, 8000);
    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', checkOnlineStatus);
      window.removeEventListener('offline', checkOnlineStatus);
    };
  }, []);

  // Auto-flush queue when online transitions to true
  useEffect(() => {
    if (isOnline && pendingQueue.length > 0) {
      flushPickQueue();
    }
  }, [isOnline, pendingQueue.length]);

  // Load orders from IndexedDB
  const loadLocalOrders = async () => {
    try {
      const orders = await getActiveOrders();
      // Sort orders by order number descending
      orders.sort((a, b) => b.order_number.localeCompare(a.order_number));
      setActiveOrders(orders);
      
      // Keep selected order reference updated if it changes
      if (selectedOrder) {
        const updated = orders.find(o => o.order_id === selectedOrder.order_id);
        setSelectedOrder(updated || null);
      }

      // Keep active session reference updated if it changes
      if (activeSession) {
        if (!activeSession.isBatch) {
          const updated = orders.find(o => o.order_id === activeSession.orderIds[0]);
          if (updated) {
            const sessionLineItems = updated.line_items.map(li => ({
              sku: li.sku,
              barcode: li.barcode || '',
              title: li.title,
              qty: li.qty,
              picked_qty: li.picked_qty || 0,
              cubicle: li.cubicle || 'Unknown',
              picked: li.picked || false,
              allocations: [{
                order_id: updated.order_id,
                order_number: updated.order_number,
                qty: li.qty,
                picked_qty: li.picked_qty || 0
              }]
            }));
            setActiveSession(curr => curr ? { ...curr, lineItems: sessionLineItems } : null);
          } else {
            setActiveSession(null);
          }
        } else {
          // Re-batch to update quantities in batch session
          const updatedOrders = orders.filter(o => activeSession.orderIds.includes(o.order_id));
          if (updatedOrders.length > 0) {
            const itemMap: Record<string, SessionLineItem> = {};
            updatedOrders.forEach(order => {
              order.line_items.forEach(li => {
                const sku = li.sku;
                const pickedQty = li.picked_qty || 0;
                
                if (!itemMap[sku]) {
                  itemMap[sku] = {
                    sku,
                    barcode: li.barcode || '',
                    title: li.title,
                    qty: 0,
                    picked_qty: 0,
                    cubicle: li.cubicle || 'Unknown',
                    picked: false,
                    allocations: []
                  };
                }
                
                itemMap[sku].qty += li.qty;
                itemMap[sku].picked_qty += pickedQty;
                itemMap[sku].allocations.push({
                  order_id: order.order_id,
                  order_number: order.order_number,
                  qty: li.qty,
                  picked_qty: pickedQty
                });
              });
            });
            
            const lineItems = Object.values(itemMap).map(item => {
              item.picked = item.picked_qty >= item.qty;
              return item;
            });
            lineItems.sort((a, b) => a.cubicle.localeCompare(b.cubicle));
            
            setActiveSession(curr => curr ? { ...curr, lineItems } : null);
          } else {
            setActiveSession(null);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load local orders:', err);
    }
  };
  // Load pick queue from IndexedDB
  const loadPendingQueue = async () => {
    try {
      const queue = await getPendingQueue();
      setPendingQueue(queue);
    } catch (err) {
      console.error('Failed to load pending queue:', err);
    }
  };
  // Toggle selecting an order in the sidebar for batching
  const handleToggleSidebarOrderSelection = (orderId: string) => {
    setSelectedSidebarOrderIds(current => {
      const next = new Set(current);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // Start single-order picking session
  const startSingleOrderSession = (order: ActiveOrder) => {
    initAudioContext();
    const session: PickSession = {
      isBatch: false,
      orderIds: [order.order_id],
      orderNumbers: [order.order_number],
      customerNames: [order.customer_name],
      lineItems: order.line_items.map(li => ({
        sku: li.sku,
        barcode: li.barcode || '',
        title: li.title,
        qty: li.qty,
        picked_qty: li.picked_qty || 0,
        cubicle: li.cubicle || 'Unknown',
        picked: li.picked || false,
        allocations: [{
          order_id: order.order_id,
          order_number: order.order_number,
          qty: li.qty,
          picked_qty: li.picked_qty || 0
        }]
      }))
    };
    setActiveSession(session);
    setMobileActiveView('workspace');
  };

  // Start batch picking session
  const startBatchPickingSession = () => {
    if (selectedSidebarOrderIds.size === 0) return;
    initAudioContext();
    
    const selectedOrders = activeOrders.filter(o => selectedSidebarOrderIds.has(o.order_id));
    if (selectedOrders.length === 0) return;
    
    const itemMap: Record<string, SessionLineItem> = {};
    
    selectedOrders.forEach(order => {
      order.line_items.forEach(li => {
        const sku = li.sku;
        const pickedQty = li.picked_qty || 0;
        
        if (!itemMap[sku]) {
          itemMap[sku] = {
            sku,
            barcode: li.barcode || '',
            title: li.title,
            qty: 0,
            picked_qty: 0,
            cubicle: li.cubicle || 'Unknown',
            picked: false,
            allocations: []
          };
        }
        
        itemMap[sku].qty += li.qty;
        itemMap[sku].picked_qty += pickedQty;
        itemMap[sku].allocations.push({
          order_id: order.order_id,
          order_number: order.order_number,
          qty: li.qty,
          picked_qty: pickedQty
        });
      });
    });
    
    const lineItems = Object.values(itemMap).map(item => {
      item.picked = item.picked_qty >= item.qty;
      return item;
    });
    lineItems.sort((a, b) => a.cubicle.localeCompare(b.cubicle));
    
    const session: PickSession = {
      isBatch: true,
      orderIds: selectedOrders.map(o => o.order_id),
      orderNumbers: selectedOrders.map(o => o.order_number),
      customerNames: selectedOrders.map(o => o.customer_name),
      lineItems
    };
    
    setActiveSession(session);
    setMobileActiveView('workspace');
    triggerToast('success', `Started batch picking for ${selectedOrders.length} orders!`);
  };

  // Process pick quantity increment
  const processPickIncrement = async (sku: string, qtyToIncrement: number) => {
    if (!activeSession) return null;
    
    try {
      const updatedLineItems = activeSession.lineItems.map(item => {
        if (item.sku === sku) {
          const newPickedQty = Math.min(item.picked_qty + qtyToIncrement, item.qty);
          const isItemFullyPicked = newPickedQty >= item.qty;
          
          let remaining = qtyToIncrement;
          const updatedAllocations = item.allocations.map(alloc => {
            if (remaining > 0 && alloc.picked_qty < alloc.qty) {
              const add = Math.min(remaining, alloc.qty - alloc.picked_qty);
              remaining -= add;
              
              queuePickAction({
                order_id: alloc.order_id,
                sku: item.sku,
                picked_qty: add,
                timestamp: Date.now()
              });
              
              return { ...alloc, picked_qty: alloc.picked_qty + add };
            }
            return alloc;
          });
          
          return {
            ...item,
            picked_qty: newPickedQty,
            picked: isItemFullyPicked,
            allocations: updatedAllocations
          };
        }
        return item;
      });
      
      const affectedOrderIds = new Set(
        activeSession.lineItems.find(li => li.sku === sku)?.allocations.map(a => a.order_id) || []
      );
      
      const allOrders = await getActiveOrders();
      for (const order of allOrders) {
        if (affectedOrderIds.has(order.order_id)) {
          const sessionItem = updatedLineItems.find(li => li.sku === sku);
          const updatedAlloc = sessionItem?.allocations.find(a => a.order_id === order.order_id);
          
          if (updatedAlloc) {
            const updatedOrderLineItems = order.line_items.map(li => {
              if (li.sku === sku) {
                const newPickedQty = updatedAlloc.picked_qty;
                return { ...li, picked_qty: newPickedQty, picked: newPickedQty >= li.qty };
              }
              return li;
            });
            
            const allPicked = updatedOrderLineItems.every(li => li.picked);
            const updatedOrder: ActiveOrder = {
              ...order,
              line_items: updatedOrderLineItems,
              status: allPicked ? 'fully_picked' : 'pending'
            };
            await saveActiveOrder(updatedOrder);
          }
        }
      }
      
      const updatedSession = {
        ...activeSession,
        lineItems: updatedLineItems
      };
      
      setActiveSession(updatedSession);
      await loadLocalOrders();
      await loadPendingQueue();
      
      return updatedSession;
    } catch (err) {
      console.error('Failed to process pick increment:', err);
      return null;
    }
  };

  // Find next unpicked item respecting zone priority (Condo -> Storage Room -> General)
  const findNextUnpickedItem = (session: PickSession | null | undefined) => {
    if (!session) return null;
    
    // 1. Pick Condo zone items first
    const condoUnpicked = session.lineItems.find(li => li.cubicle.startsWith('C-') && !li.picked);
    if (condoUnpicked) return condoUnpicked;
    
    // 2. Pick Storage Room zone items next
    const storageUnpicked = session.lineItems.find(li => li.cubicle.startsWith('SR-') && !li.picked);
    if (storageUnpicked) return storageUnpicked;
    
    // 3. Fallback to others
    const otherUnpicked = session.lineItems.find(li => !li.cubicle.startsWith('C-') && !li.cubicle.startsWith('SR-') && !li.picked);
    return otherUnpicked || null;
  };

  // Check if Storage Room item is locked by incomplete Condo items
  const isItemLocked = (item: SessionLineItem) => {
    if (!activeSession) return false;
    
    // Lock only Storage Room items
    if (!item.cubicle.startsWith('SR-')) return false;
    
    const hasUnpickedCondo = activeSession.lineItems.some(li => 
      li.cubicle.startsWith('C-') && !li.picked
    );
    
    return hasUnpickedCondo;
  };

  // 2D Visual coordinate map renderer for scanner modal
  const renderLocationMap = (cubicle: string | undefined) => {
    if (!cubicle) return null;
    
    if (cubicle.startsWith('SR-')) {
      const parts = cubicle.split('-');
      const row = parts[1] || 'A';
      const binStr = parts[2] || '1';
      const binNum = parseInt(binStr, 10);
      const totalShelves = 15;
      
      return (
        <div style={{
          background: 'var(--ink3)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r)',
          padding: '12px',
          marginBottom: '16px',
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--gold)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px'
          }}>
            📍 Storage Room: Row {row} (Shelf Slot {binStr})
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(5, 1fr)', 
            gap: '4px',
            maxWidth: '220px',
            margin: '0 auto'
          }}>
            {Array.from({ length: totalShelves }).map((_, idx) => {
              const num = idx + 1;
              const isTarget = num === binNum;
              return (
                <div 
                  key={idx}
                  style={{
                    height: '24px',
                    borderRadius: '4px',
                    background: isTarget ? 'var(--gold)' : 'var(--ink4)',
                    border: isTarget ? '1px solid var(--gold2)' : '1px solid var(--line)',
                    color: isTarget ? 'var(--ink)' : 'var(--snow4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '10px',
                    boxShadow: isTarget ? '0 0 8px rgba(232, 197, 71, 0.3)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  {num}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    
    if (cubicle.startsWith('C-')) {
      const locationName = cubicle.replace('C-', '');
      return (
        <div style={{
          background: 'var(--ink3)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r)',
          padding: '12px',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          <span style={{ fontSize: '20px', display: 'block', marginBottom: '4px' }}>🏢</span>
          <span style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Condo Unit Location (Upstairs)
          </span>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--snow)', marginTop: '4px' }}>
            {locationName}
          </div>
        </div>
      );
    }
    
    return null;
  };

  const handleStockLookup = async (queryStr?: string) => {
    const q = (queryStr !== undefined ? queryStr : lookupQuery).trim();
    if (!q) return;
    
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    
    try {
      // 1. Local Lookup
      const localItem = await searchCatalogItem(q);
      
      if (localItem) {
        setLookupResult(localItem);
        
        // 2. If online, fetch live real-time stock levels
        if (isOnline) {
          try {
            const query = `
              query GetVariantStock($id: ID!) {
                node(id: $id) {
                  ... on ProductVariant {
                    inventoryQuantity
                  }
                }
              }
            `;
            
            const res = await fetch('/api/shopify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ graphql: query, variables: { id: localItem.variant_id } })
            });
            
            const data = await res.json();
            if (data.data?.node?.inventoryQuantity !== undefined) {
              setLookupResult(prev => {
                if (!prev) return null;
                return {
                  ...prev,
                  inventory_quantity: data.data.node.inventoryQuantity
                };
              });
            }
          } catch (err) {
            console.warn("Live stock check failed, using cached count", err);
          }
        }
      } else {
        // Not in local cache. If online, try searching Shopify by SKU or Barcode
        if (isOnline) {
          try {
            const query = `
              query SearchProductVariant($query: String!) {
                productVariants(first: 1, query: $query) {
                  edges {
                    node {
                      id
                      title
                      sku
                      barcode
                      inventoryQuantity
                      product {
                        id
                        title
                        vendor
                        productLocation: metafield(namespace: "mzk", key: "cubicle_location") {
                          value
                        }
                      }
                      variantLocation: metafield(namespace: "mzk", key: "cubicle_location") {
                        value
                      }
                    }
                  }
                }
              }
            `;
            
            const res = await fetch('/api/shopify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                graphql: query, 
                variables: { query: `sku:${q} OR barcode:${q}` } 
              })
            });
            
            const data = await res.json();
            const edges = data.data?.productVariants?.edges || [];
            if (edges.length > 0) {
              const node = edges[0].node;
              const pLoc = node.product.productLocation?.value || '';
              const vLoc = node.variantLocation?.value || '';
              const cubicle = vLoc || pLoc || '';
              
              const resolvedItem: CatalogItem = {
                sku: node.sku || q,
                barcode: node.barcode || '',
                product_id: node.product.id,
                variant_id: node.id,
                title: node.title === 'Default Title' ? node.product.title : `${node.product.title} - ${node.title}`,
                cubicle: cubicle.trim(),
                vendor: node.product.vendor || '',
                inventory_quantity: node.inventoryQuantity || 0,
                last_synced: Date.now()
              };
              setLookupResult(resolvedItem);
            } else {
              setLookupError('Product not found in local cache or Shopify store');
            }
          } catch (err) {
            setLookupError('Product not found in local cache and failed live search');
          }
        } else {
          setLookupError('Product not found in local cache (currently offline)');
        }
      }
    } catch (err: any) {
      console.error('Stock lookup error:', err);
      setLookupError('Lookup error: ' + err.message);
    } finally {
      setLookupLoading(false);
    }
  };

  // Pre-fill intake fields when stock lookup returns a result
  useEffect(() => {
    if (lookupResult) {
      setIntakeLocation(lookupResult.cubicle || '');
      setIntakeQty('');
      setIntakeMode('add');
      setIntakeSuccess(null);
      setIntakeError(null);
      setIsIntakeOpen(false); // Collapsed by default
    }
  }, [lookupResult]);

  const handleIntakeSubmit = async () => {
    if (!lookupResult) return;
    const qtyParsed = parseInt(intakeQty, 10);

    if (isNaN(qtyParsed) || qtyParsed < 0) {
      setIntakeError("Please enter a valid quantity (0 or greater).");
      return;
    }

    const hasLocationChanged = intakeLocation.trim() !== (lookupResult.cubicle || '').trim();

    // 1. Confirm Location Change
    if (hasLocationChanged) {
      const oldLoc = lookupResult.cubicle || 'None';
      const newLoc = intakeLocation.trim() || 'None';
      if (!confirm(`⚠️ Warning: You are changing the storage location for this product from "${oldLoc}" to "${newLoc}". Are you sure you want to proceed?`)) {
        return;
      }
    }

    // 2. Confirm Overwrite
    if (intakeMode === 'set') {
      const oldQty = lookupResult.inventory_quantity ?? 0;
      if (!confirm(`⚠️ Warning: You are about to OVERWRITE the stock level of this product from ${oldQty} to ${qtyParsed}. This is a destructive audit. Are you sure you want to proceed?`)) {
        return;
      }
    }

    setIntakeLoading(true);
    setIntakeError(null);
    setIntakeSuccess(null);

    try {
      const res = await fetch('/api/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateStockAndLocation',
          product_id: lookupResult.product_id,
          variant_id: lookupResult.variant_id,
          inventory_item_id: lookupResult.inventory_item_id,
          mode: intakeMode,
          quantity: qtyParsed,
          cubicle: intakeLocation.trim()
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      // Calculate updated quantity
      const oldQty = lookupResult.inventory_quantity ?? 0;
      const updatedQty = intakeMode === 'set' ? qtyParsed : oldQty + qtyParsed;

      // Update local catalog cache
      const updatedItem: CatalogItem = {
        ...lookupResult,
        cubicle: intakeLocation.trim(),
        inventory_quantity: updatedQty,
        last_synced: Date.now()
      };

      const { saveCatalogItem } = require('@/lib/pick-storage');
      await saveCatalogItem(updatedItem);

      // Also update lookupResult state immediately
      setLookupResult(updatedItem);

      // Trigger success alert
      setIntakeSuccess(`✓ Successfully updated ${lookupResult.title}! Location: "${intakeLocation.trim() || 'None'}", Stock: ${updatedQty}.`);
      setIntakeQty('');
      
      // Sync local orders in case the location changed and active orders need the new location
      await loadLocalOrders();
    } catch (err: any) {
      console.error('Intake submit failed:', err);
      setIntakeError(`Failed: ${err.message}`);
    } finally {
      setIntakeLoading(false);
    }
  };

  const startLookupScanning = () => {
    initAudioContext();
    setLookupError(null);
    setLookupResult(null);
    setIsLookupScanning(true);
    if (scannerOpen) {
      setScannerOpen(false);
    }
  };

  const stopLookupScanning = () => {
    if (lookupScannerRef.current) {
      try {
        lookupScannerRef.current.stop().catch((e: any) => console.warn(e));
      } catch (e) {}
      lookupScannerRef.current = null;
    }
    setIsLookupScanning(false);
  };

  const toggleTorch = async () => {
    try {
      const nextTorch = !isTorchOn;
      setIsTorchOn(nextTorch);
      
      const videoEl = document.querySelector('video') as HTMLVideoElement;
      if (videoEl && videoEl.srcObject) {
        const stream = videoEl.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities() as any;
          if (capabilities.torch) {
            await track.applyConstraints({ advanced: [{ torch: nextTorch }] } as any);
          }
        }
      }
    } catch (e) {
      console.warn("Flashlight control failed:", e);
    }
  };

  const startOcrScanner = async (videoElementId: string, onMatchFound: (matchText: string) => void) => {
    try {
      setOcrProcessing(false);
      setOcrReadText('');
      
      const { createWorker } = require('tesseract.js');
      const worker = await createWorker('eng');
      setOcrWorker(worker);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      ocrStreamRef.current = stream;
      
      const video = document.getElementById(videoElementId) as HTMLVideoElement;
      if (video) {
        video.srcObject = stream;
      }
      
      ocrIntervalRef.current = setInterval(async () => {
        const v = document.getElementById(videoElementId) as HTMLVideoElement;
        if (!v || v.readyState < 2 || !worker) return;
        
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          const cropH = v.videoHeight * 0.18;
          const cropW = v.videoWidth * 0.8;
          const cropX = v.videoWidth * 0.1;
          const cropY = (v.videoHeight - cropH) / 2;
          
          canvas.width = cropW;
          canvas.height = cropH;
          
          ctx.drawImage(v, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          
          setOcrProcessing(true);
          const { data: { text } } = await worker.recognize(canvas);
          
          const cleanText = text.replace(/[^a-zA-Z0-9-]/g, '').trim().toLowerCase();
          if (cleanText) {
            setOcrReadText(cleanText);
            onMatchFound(cleanText);
          }
        } catch (err) {
          console.warn("OCR recognition frame failed:", err);
        } finally {
          setOcrProcessing(false);
        }
      }, 1200);
      
    } catch (err: any) {
      console.error("Failed to start OCR camera:", err);
      throw err;
    }
  };

  const stopOcrScanner = async () => {
    if (ocrIntervalRef.current) {
      clearInterval(ocrIntervalRef.current);
      ocrIntervalRef.current = null;
    }
    if (ocrStreamRef.current) {
      ocrStreamRef.current.getTracks().forEach(track => track.stop());
      ocrStreamRef.current = null;
    }
    if (ocrWorker) {
      try {
        await ocrWorker.terminate();
      } catch (e) {}
      setOcrWorker(null);
    }
    setIsTorchOn(false);
    setOcrProcessing(false);
    setOcrReadText('');
  };

  useEffect(() => {
    if (isLookupScanning && typeof window !== 'undefined') {
      if (scannerMode === 'barcode') {
        const { Html5Qrcode } = require('html5-qrcode');
        
        const scanner = new Html5Qrcode('lookup-reader');
        lookupScannerRef.current = scanner;
        
        scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width: number, height: number) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size * 0.5 };
            }
          },
          async (decodedText: string) => {
            playSound('success');
            stopLookupScanning();
            setLookupQuery(decodedText);
            handleStockLookup(decodedText);
          },
          () => {}
        ).catch((err: any) => {
          console.error("Lookup scanner start error:", err);
          setLookupError("Failed to access camera: " + err);
          setIsLookupScanning(false);
        });
        
        return () => {
          if (lookupScannerRef.current) {
            try {
              lookupScannerRef.current.stop().catch((e: any) => console.warn(e));
            } catch (e) {}
            lookupScannerRef.current = null;
          }
        };
      } else {
        // OCR Mode
        startOcrScanner('lookup-ocr-video', async (cleanText) => {
          const resolved = await searchCatalogItem(cleanText);
          if (resolved) {
            playSound('success');
            await stopOcrScanner();
            setIsLookupScanning(false);
            setLookupQuery(resolved.sku);
            handleStockLookup(resolved.sku);
          }
        }).catch((err: any) => {
          setLookupError("OCR camera initialization failed: " + err.message || err);
          setIsLookupScanning(false);
        });
        
        return () => {
          stopOcrScanner();
        };
      }
    }
  }, [isLookupScanning, scannerMode]);

  // Sync the catalog (fetch all products + metafields)
  const handleSyncCatalog = async () => {
    setSyncStatus('Syncing catalog maps from Shopify...');
    setSyncError('');
    try {
      const res = await fetch('/api/shopify?action=syncCatalog');
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }
      
      const catalogMap = await res.json();
      await saveCatalog(catalogMap);
      
      const timestamp = Date.now();
      setLastSyncedCatalog(timestamp);
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastSyncedCatalog', timestamp.toString());
      }
      
      // Update existing orders in local DB with any newly synced cubicle locations/barcodes
      const orders = await getActiveOrders();
      for (const order of orders) {
        let updated = false;
        const lineItems = await Promise.all(order.line_items.map(async (item) => {
          const catItem = await getCatalogItem(item.sku);
          if (catItem) {
            if (catItem.cubicle !== item.cubicle || catItem.barcode !== item.barcode) {
              updated = true;
              return {
                ...item,
                cubicle: catItem.cubicle || item.cubicle,
                barcode: catItem.barcode || item.barcode
              };
            }
          }
          return item;
        }));
        
        if (updated) {
          await saveActiveOrder({
            ...order,
            line_items: lineItems
          });
        }
      }
      
      await loadLocalOrders();
      setSyncStatus('✓ Catalog synced successfully and local orders updated!');
      setTimeout(() => setSyncStatus(''), 4000);
    } catch (err: any) {
      console.error('Sync catalog failed:', err);
      setSyncError(`Sync failed: ${err.message}. Ensure your token has permission.`);
      setSyncStatus('');
    }
  };

  // Search and fetch a single order
  const handleSearchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchOrderNumber.trim()) return;
    
    setSyncStatus(`Searching order "${searchOrderNumber}"...`);
    setSyncError('');
    
    try {
      const res = await fetch(`/api/shopify?action=getOrder&order_number=${encodeURIComponent(searchOrderNumber.trim())}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }
      
      const orderData: ActiveOrder = await res.json();
      
      // Attach cubicles and barcodes from local catalog map
      const processedLineItems = await Promise.all(
        orderData.line_items.map(async (item) => {
          const catItem = await getCatalogItem(item.sku);
          return {
            ...item,
            cubicle: catItem?.cubicle || 'Unknown',
            barcode: catItem?.barcode || item.barcode || ''
          };
        })
      );
      
      // Sort line items by cubicle location
      processedLineItems.sort((a, b) => a.cubicle.localeCompare(b.cubicle));

      const finalOrder: ActiveOrder = {
        ...orderData,
        line_items: processedLineItems
      };
      
      await saveActiveOrder(finalOrder);
      await loadLocalOrders();
      setSelectedOrder(finalOrder);
      setSearchOrderNumber('');
      setSyncStatus('✓ Order synced and loaded successfully!');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (err: any) {
      console.error('Order search failed:', err);
      setSyncError(`Order search failed: ${err.message}`);
      setSyncStatus('');
    }
  };

  // Fetch unfulfilled orders to batch select
  const handleLoadUnfulfilledBatch = async () => {
    setSyncStatus('Fetching unfulfilled orders from Shopify...');
    setSyncError('');
    setBatchOrders([]);
    setSelectedBatchIds(new Set());
    
    try {
      const res = await fetch('/api/shopify?action=getUnfulfilledOrders');
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }
      
      const orders = await res.json();
      setBatchOrders(orders);
      setShowBatchModal(true);
      setSyncStatus('');
    } catch (err: any) {
      console.error('Batch load failed:', err);
      setSyncError(`Batch load failed: ${err.message}`);
      setSyncStatus('');
    }
  };

  // Download selected batch orders
  const handleDownloadBatch = async () => {
    if (selectedBatchIds.size === 0) return;
    
    setSyncStatus(`Downloading ${selectedBatchIds.size} selected orders...`);
    setShowBatchModal(false);
    
    try {
      const selectedList = batchOrders.filter(o => selectedBatchIds.has(o.order_id));
      
      for (const order of selectedList) {
        const processedItems = await Promise.all(
          order.line_items.map(async (item) => {
            const catItem = await getCatalogItem(item.sku);
            return {
              ...item,
              cubicle: catItem?.cubicle || 'Unknown',
              barcode: catItem?.barcode || item.barcode || ''
            };
          })
        );
        
        processedItems.sort((a, b) => a.cubicle.localeCompare(b.cubicle));
        
        await saveActiveOrder({
          ...order,
          line_items: processedItems
        });
      }
      
      await loadLocalOrders();
      setSyncStatus('✓ Selected orders downloaded!');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (err: any) {
      console.error('Batch download failed:', err);
      setSyncError(`Batch download failed: ${err.message}`);
      setSyncStatus('');
    }
  };

  // Delete local order
  const handleDeleteOrder = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this order from local storage?')) return;
    
    try {
      await deleteActiveOrder(orderId);
      if (selectedOrder?.order_id === orderId) {
        setSelectedOrder(null);
      }
      await loadLocalOrders();
    } catch (err) {
      console.error('Failed to delete local order:', err);
    }
  };

  // Trigger camera scanner
  const handleStartScan = (item: SessionLineItem) => {
    initAudioContext();
    setScanningItem(item);
    setScannerError(null);
    setScannerSuccess(false);
    setScannedCode('');
    setScannerOpen(true);
  };

  // Handle continuous camera barcode decoder result
  const handleBarcodeScanned = async (code: string) => {
    if (!scanningItem || !activeSession) return;
    
    const expectedBarcode = scanningItem.barcode ? scanningItem.barcode.trim() : '';
    const expectedSku = scanningItem.sku ? scanningItem.sku.trim() : '';
    const cleanCode = code.trim();
    
    const isMatch = (expectedBarcode && cleanCode === expectedBarcode) || (cleanCode === expectedSku);
    
    if (isMatch) {
      // 1. Success feedback
      playSound('success');
      setScannerSuccess(true);
      setFlashGreen(true);
      setTimeout(() => setFlashGreen(false), 800);
      triggerToast('success', `Product Match! "${scanningItem.title}" verified.`);
      
      // 2. Process pick increment
      const updatedSession = await processPickIncrement(scanningItem.sku, 1);
      
      // 3. Auto-advance to next item or close scanner
      const updatedItem = updatedSession?.lineItems.find(li => li.sku === scanningItem.sku);
      if (updatedItem && !updatedItem.picked) {
        // Still needs more of the same item (quantity > 1)
        setTimeout(() => {
          setScannerSuccess(false);
          setScannedCode('');
        }, 1000);
      } else {
        // Fully picked, advance or close
        const nextUnpicked = findNextUnpickedItem(updatedSession);
        if (nextUnpicked) {
          setTimeout(() => {
            setScanningItem(nextUnpicked);
            setScannerSuccess(false);
            setScannerError(null);
            setScannedCode('');
          }, 1000);
        } else {
          setTimeout(() => {
            setScannerOpen(false);
            setScanningItem(null);
            triggerToast('success', `Session complete! All items picked.`);
          }, 1200);
        }
      }
    } else {
      // Mismatch feedback
      setFlashRed(true);
      setTimeout(() => setFlashRed(false), 800);
      const errMsg = `Scanned code "${cleanCode}" does not match this item's Barcode (${expectedBarcode || 'None'}) or SKU (${expectedSku}).`;
      setScannerError(errMsg);
      triggerToast('error', `Product Mismatch! Scanned "${cleanCode}".`);
    }
  };

  // Force picking item without barcode scan (Manual Override)
  const handleForcePick = async () => {
    if (!scanningItem || !activeSession) return;
    
    const remainingQty = scanningItem.qty - scanningItem.picked_qty;
    if (remainingQty <= 0) return;
    
    playSound('success');
    triggerToast('success', `Manual Pick! "${scanningItem.title}" marked as picked.`);
    
    const updatedSession = await processPickIncrement(scanningItem.sku, remainingQty);
    
    const nextUnpicked = findNextUnpickedItem(updatedSession);
    if (nextUnpicked) {
      setScanningItem(nextUnpicked);
      setScannerError(null);
      setScannerSuccess(false);
      setScannedCode('');
    } else {
      setScannerOpen(false);
      setScanningItem(null);
    }
  };

  // Reset pick status of an item (Undo verification)
  const handleResetPick = async (item: SessionLineItem) => {
    if (!activeSession) return;

    try {
      // 1. Remove from local unsynced queue if it hasn't been uploaded yet
      for (const alloc of item.allocations) {
        await removePickActionFromQueue(alloc.order_id, item.sku);
      }

      // 2. Reset quantities in allocations & line items
      const updatedLineItems = activeSession.lineItems.map((li) => {
        if (li.sku === item.sku) {
          const resetAllocations = li.allocations.map(a => ({ ...a, picked_qty: 0 }));
          return { ...li, picked: false, picked_qty: 0, allocations: resetAllocations };
        }
        return li;
      });

      // 3. Update orders in IndexedDB
      const affectedOrderIds = item.allocations.map(a => a.order_id);
      const allOrders = await getActiveOrders();
      
      for (const order of allOrders) {
        if (affectedOrderIds.includes(order.order_id)) {
          const updatedOrderLineItems = order.line_items.map(li => {
            if (li.sku === item.sku) {
              return { ...li, picked_qty: 0, picked: false };
            }
            return li;
          });
          const updatedOrder: ActiveOrder = {
            ...order,
            line_items: updatedOrderLineItems,
            status: 'pending' // Revert back to pending
          };
          await saveActiveOrder(updatedOrder);
        }
      }

      // 4. Update session state
      const updatedSession = {
        ...activeSession,
        lineItems: updatedLineItems
      };
      
      setActiveSession(updatedSession);
      await loadLocalOrders();
      await loadPendingQueue();
      triggerToast('success', `Reset pick for "${item.title}".`);
    } catch (err) {
      console.error('Failed to reset pick:', err);
    }
  };

  // Flush the queue to Shopify (Online only)
  const flushPickQueue = async () => {
    if (!isOnline || pendingQueue.length === 0) return;
    
    setSyncStatus(`Syncing ${pendingQueue.length} pick activities back to Shopify...`);
    try {
      const res = await fetch('/api/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'syncPicks', picks: pendingQueue })
      });
      
      if (!res.ok) {
        throw new Error('Failed to flush pick activities.');
      }
      
      // Mark as uploaded in IndexedDB
      for (const item of pendingQueue) {
        if (item.id !== undefined) {
          await markQueueItemUploaded(item.id);
        }
      }
      
      // Clear uploaded queue entries
      await clearUploadedQueue();
      await loadPendingQueue();
      setSyncStatus('✓ Picks synced back to Shopify (tagged orders "Picked")!');
      setTimeout(() => setSyncStatus(''), 4000);
    } catch (err: any) {
      console.error('Queue flush failed:', err);
      // Fail silently for auto-flush, but update state
      setSyncStatus('Queue sync paused (will retry when connection stabilizes)');
      setTimeout(() => setSyncStatus(''), 5000);
    }
  };

  // Picking Camera Scanner mounting Effect
  useEffect(() => {
    if (scannerOpen && scanningItem && !scannerSuccess && typeof window !== 'undefined') {
      if (scannerMode === 'barcode') {
        let activeScanner: any = null;
        
        const timer = setTimeout(() => {
          if (!pickScannerRef.current) return;
          
          import('html5-qrcode').then((module) => {
            const scanner = new module.Html5Qrcode("reader");
            activeScanner = scanner;
            
            scanner.start(
              { facingMode: "environment" },
              { fps: 15, qrbox: { width: 260, height: 180 } },
              (decodedText) => {
                handleBarcodeScanned(decodedText);
              },
              (errorMessage) => {
                // Ignore scanning loop debug messages
              }
            ).catch((err) => {
              console.error("Camera start failed:", err);
              setScannerError(err.message || "Camera access denied. Enable camera permissions in your browser.");
            });
          }).catch((err) => {
            console.error("html5-qrcode loading failed:", err);
            setScannerError("Failed to initialize scanner library.");
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
      } else {
        // OCR Mode
        const timer = setTimeout(() => {
          startOcrScanner('ocr-video', async (cleanText) => {
            if (scanningItem) {
              const matchesSKU = cleanText === scanningItem.sku.toLowerCase();
              const matchesBarcode = cleanText === scanningItem.barcode.toLowerCase();
              if (matchesSKU || matchesBarcode) {
                handleBarcodeScanned(cleanText);
              }
            }
          }).catch((err) => {
            console.error("OCR camera start failed:", err);
            setScannerError("Failed to initialize OCR camera: " + err.message);
          });
        }, 200);
        
        return () => {
          clearTimeout(timer);
          stopOcrScanner();
        };
      }
    }
  }, [scannerOpen, scannerMode, scanningItem, scannerSuccess]);

  // Auto-focus hardware scanner input when verification modal opens
  useEffect(() => {
    if (scannerOpen) {
      const timer = setTimeout(() => {
        if (pickModalInputRef.current) {
          pickModalInputRef.current.focus();
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [scannerOpen]);

  // Progress metrics helper
  const getPickedCount = (order: ActiveOrder) => {
    return order.line_items.filter(item => item.picked).length;
  };

  const getProgressPercent = (order: ActiveOrder) => {
    if (order.line_items.length === 0) return 0;
    return Math.round((getPickedCount(order) / order.line_items.length) * 100);
  };

  if (!mounted) {
    return (
      <div style={{
        background: 'var(--ink)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--snow3)',
        fontFamily: 'sans-serif'
      }}>
        Loading Aisle Runner...
      </div>
    );
  }

  return (
    <>
      <div className="audit-layout pick-layout">
      {/* ── SIDEBAR ── */}
      <aside className="audit-sidebar pick-sidebar" suppressHydrationWarning={true}>
        <div className="audit-sidebar-header">
          <div className="audit-sidebar-title">Pick Orders Offline</div>
          
          {/* Connectivity indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: isOnline ? 'var(--teal-dim)' : 'var(--rose-dim)',
            border: `1px solid ${isOnline ? 'var(--teal-line)' : 'var(--rose-line)'}`,
            color: isOnline ? 'var(--teal)' : 'var(--rose)',
            padding: '8px 12px',
            borderRadius: 'var(--r)',
            fontSize: '12px',
            fontFamily: 'DM Mono, monospace',
            fontWeight: 500,
            marginBottom: '14px'
          }}>
            <div style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: isOnline ? 'var(--teal)' : 'var(--rose)',
              animation: 'pulse-dot 2s infinite'
            }} />
            {isOnline ? 'ONLINE: Ready to sync' : 'OFFLINE MODE: Using Local Cache'}
          </div>

          {/* Sync actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleSyncCatalog} 
              disabled={!isOnline || !!syncStatus}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              🔄 Sync Catalog Map
            </button>
            <div style={{ fontSize: '11px', color: 'var(--snow3)', marginTop: '2px', textAlign: 'center' }}>
              Last Sync: {lastSyncedCatalog ? new Date(lastSyncedCatalog).toLocaleString() : 'Never'}
            </div>
          </div>
        </div>

        {/* Sync status alert */}
        {syncStatus && (
          <div style={{ padding: '10px 16px', background: 'var(--ink3)', color: 'var(--teal)', fontSize: '12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="spinner" style={{ width: '12px', height: '12px', border: '2px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            {syncStatus}
          </div>
        )}
        {syncError && (
          <div style={{ padding: '10px 16px', background: 'var(--rose-dim)', color: 'var(--rose)', fontSize: '12px', borderBottom: '1px solid var(--line)' }}>
            ⚠️ {syncError}
          </div>
        )}

        {/* Queue counter */}
        {pendingQueue.length > 0 && (
          <div style={{
            padding: '10px 16px',
            background: 'var(--gold-dim)',
            borderBottom: '1px solid var(--line)',
            color: 'var(--gold)',
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>⏳ Unsynced picked items: <strong>{pendingQueue.length}</strong></span>
            {isOnline && (
              <button 
                onClick={flushPickQueue}
                style={{ 
                  background: 'var(--gold)', 
                  border: 'none', 
                  color: 'var(--ink)', 
                  padding: '2px 8px', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600
                }}
              >
                Sync Now
              </button>
            )}
          </div>
        )}

        {/* Sync/Load Order Form (Online only) */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--line)', background: 'var(--ink2)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--snow2)', marginBottom: '8px' }}>LOAD & SYNC ORDERS</div>
          
          <form onSubmit={handleSearchOrder} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <input 
              type="text" 
              placeholder="Order Number (e.g. 1012)"
              value={searchOrderNumber}
              onChange={(e) => setSearchOrderNumber(e.target.value)}
              disabled={!isOnline}
              style={{
                flex: 1,
                background: 'var(--ink)',
                border: '1px solid var(--line)',
                borderRadius: '4px',
                padding: '6px 10px',
                color: '#fff',
                fontSize: '12px',
                outline: 'none'
              }}
            />
            <button 
              type="submit" 
              disabled={!isOnline || !searchOrderNumber.trim()}
              className="btn"
              style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--ink3)' }}
            >
              Sync
            </button>
          </form>
          
          <button 
            onClick={handleLoadUnfulfilledBatch}
            disabled={!isOnline}
            className="btn"
            style={{ 
              width: '100%', 
              fontSize: '12px', 
              background: 'var(--ink3)', 
              color: 'var(--gold)', 
              borderColor: 'var(--gold-line)',
              justifyContent: 'center'
            }}
          >
            📋 Select Unfulfilled Batch
          </button>
          
          <button 
            onClick={() => setIsStockLookupOpen(true)}
            className="btn"
            style={{ 
              width: '100%', 
              fontSize: '12px', 
              background: 'var(--ink3)', 
              color: 'var(--teal)', 
              borderColor: 'var(--teal-line)',
              justifyContent: 'center',
              marginTop: '8px'
            }}
          >
            🔍 Stock Lookup
          </button>
        </div>

        {/* Local Synced Orders List */}
        <div className="issue-list" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '12px 16px 4px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--snow3)', letterSpacing: '0.05em' }}>
            LOCAL SYNCED ORDERS ({activeOrders.length})
          </div>
          
          {activeOrders.length === 0 ? (
            <div style={{ padding: '24px 16px', textShadow: 'none', textAlign: 'center', color: 'var(--snow4)' }}>
              No orders synced locally yet. Connect online to load orders.
            </div>
          ) : (
            activeOrders.map((order) => {
              const count = getPickedCount(order);
              const total = order.line_items.length;
              const pct = getProgressPercent(order);
              const isSelected = activeSession && !activeSession.isBatch && activeSession.orderIds[0] === order.order_id;
              const isChecked = selectedSidebarOrderIds.has(order.order_id);
              
              return (
                <div 
                  key={order.order_id} 
                  className={`issue-card ${isSelected ? 'active' : ''}`}
                  onClick={() => { startSingleOrderSession(order); }}
                  style={{ cursor: 'pointer', position: 'relative', borderLeft: isChecked ? '4px solid var(--gold)' : 'none' }}
                >
                  <div className="issue-header" style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="checkbox"
                      checked={isChecked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => handleToggleSidebarOrderSelection(order.order_id)}
                      style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--gold)' }}
                    />
                    <span className="issue-icon" style={{ marginLeft: '2px' }}>📦</span>
                    <span className="issue-title" style={{ fontWeight: 600 }}>{order.order_number}</span>
                    <span className={`issue-pill ${order.status === 'fully_picked' ? 'pill-high' : 'pill-med'}`} style={{
                      background: order.status === 'fully_picked' ? 'var(--teal-dim)' : 'var(--gold-dim)',
                      color: order.status === 'fully_picked' ? 'var(--teal)' : 'var(--gold)',
                      borderColor: order.status === 'fully_picked' ? 'var(--teal-line)' : 'var(--gold-line)',
                      marginLeft: 'auto'
                    }}>
                      {order.status === 'fully_picked' ? 'Picked' : 'Pending'}
                    </span>
                  </div>
                  
                  <div className="issue-desc" style={{ fontSize: '12px', color: 'var(--snow2)' }}>
                    Customer: {order.customer_name}
                  </div>
                  
                  {/* Progress bar */}
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--snow3)', marginBottom: '3px' }}>
                      <span>Progress: {count}/{total} items</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{ width: '100%', height: '4px', background: 'var(--ink4)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: order.status === 'fully_picked' ? 'var(--teal)' : 'var(--gold)', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                  
                  {/* Delete local order */}
                  <button
                    onClick={(e) => handleDeleteOrder(order.order_id, e)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '12px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--snow4)',
                      fontSize: '14px',
                      cursor: 'pointer',
                      zIndex: 10
                    }}
                    title="Delete local cache"
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--rose)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--snow4)'}
                  >
                    🗑️
                  </button>
                </div>
              );
            })
          )}
        </div>
        
        {/* Floating Batch Picking Control */}
        {selectedSidebarOrderIds.size > 0 && (
          <div style={{
            padding: '12px 16px',
            background: 'var(--ink3)',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            gap: '8px',
            flexDirection: 'column'
          }}>
            <div style={{ fontSize: '11px', color: 'var(--snow3)', fontWeight: 600 }}>
              {selectedSidebarOrderIds.size} orders selected for batching
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={startBatchPickingSession} 
                style={{
                  flex: 1,
                  background: 'var(--gold)',
                  color: 'var(--ink)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(232,197,71,0.2)'
                }}
              >
                ⚡ Start Batch Pick ({selectedSidebarOrderIds.size})
              </button>
              <button 
                onClick={() => setSelectedSidebarOrderIds(new Set())}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  color: 'var(--snow3)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* ── MAIN WORKSPACE ── */}
      <div className="audit-main pick-main">
        {activeSession ? (() => {
          const totalItems = activeSession.lineItems.reduce((acc, li) => acc + li.qty, 0);
          const pickedItems = activeSession.lineItems.reduce((acc, li) => acc + li.picked_qty, 0);
          const percent = totalItems > 0 ? Math.round((pickedItems / totalItems) * 100) : 0;
          const isSessionFinished = activeSession.lineItems.every(li => li.picked);
          
          const condoItems = activeSession.lineItems.filter(li => li.cubicle.startsWith('C-'));
          const storageItems = activeSession.lineItems.filter(li => li.cubicle.startsWith('SR-'));
          const otherItems = activeSession.lineItems.filter(li => !li.cubicle.startsWith('C-') && !li.cubicle.startsWith('SR-'));

          const renderPickListItem = (item: SessionLineItem, idx: number) => {
            const locationColor = item.cubicle && item.cubicle !== 'Unknown' ? 'var(--gold)' : 'var(--snow4)';
            const locationBg = item.cubicle && item.cubicle !== 'Unknown' ? 'var(--gold-dim)' : 'transparent';
            const locationBorder = item.cubicle && item.cubicle !== 'Unknown' ? '1px solid var(--gold-line)' : '1px solid var(--line)';
            const locked = isItemLocked(item);

            return (
              <div 
                key={`${item.sku}-${idx}`}
                className="pick-item-card"
                style={{
                  padding: '16px',
                  borderRadius: 'var(--r)',
                  background: 'var(--ink2)',
                  border: item.picked ? '1px solid var(--teal-line)' : locked ? '1px dashed var(--line)' : '1px solid var(--line)',
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 150px',
                  alignItems: 'center',
                  gap: '16px',
                  width: '100%',
                  opacity: locked ? 0.45 : item.picked ? 0.75 : 1,
                  transition: 'all 0.2s ease',
                  boxShadow: item.picked || locked ? 'none' : '0 4px 12px rgba(0,0,0,0.1)',
                  position: 'relative'
                }}
              >
                {/* Cubicle location badge */}
                <div className="pick-item-cubicle" style={{
                  padding: '10px',
                  borderRadius: 'var(--rs)',
                  background: locationBg,
                  border: locationBorder,
                  color: locationColor,
                  textAlign: 'center',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  fontFamily: 'DM Mono, monospace'
                }}>
                  <div style={{ fontSize: '9px', fontWeight: 500, color: 'var(--snow3)', marginBottom: '2px', textTransform: 'uppercase' }}>Cubicle</div>
                  {item.cubicle || 'Unknown'}
                </div>
                
                {/* Item details */}
                <div className="pick-item-details" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--snow)', marginBottom: '4px' }}>
                    {item.title}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: 'var(--snow3)' }}>
                    <span>SKU: <strong style={{ color: 'var(--snow2)', fontFamily: 'DM Mono, monospace' }}>{item.sku}</strong></span>
                    {item.barcode && <span>Barcode: <strong style={{ color: 'var(--snow2)' }}>{item.barcode}</strong></span>}
                  </div>
                  {activeSession.isBatch && (
                    <div style={{ fontSize: '11px', color: 'var(--snow4)', marginTop: '6px' }}>
                      Allocated: {item.allocations.map(a => `${a.order_number} (${a.picked_qty}/${a.qty})`).join(', ')}
                    </div>
                  )}
                </div>
                
                {/* Status / Pick button */}
                <div className="pick-item-action" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                  <div className="pick-item-qty" style={{ fontSize: '13px', color: 'var(--snow2)', fontWeight: 500 }}>
                    Qty: <strong>{item.picked_qty} / {item.qty}</strong>
                  </div>
                  
                  {item.picked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: 'var(--teal)',
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '4px 12px',
                        background: 'var(--teal-dim)',
                        borderRadius: '20px',
                        border: '1px solid var(--teal-line)'
                      }}>
                        ✓ Picked
                      </div>
                      <button
                        onClick={() => handleResetPick(item)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--rose)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 500,
                          textDecoration: 'underline',
                          padding: '4px 8px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#ff8888'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--rose)'}
                      >
                        Reset
                      </button>
                    </div>
                  ) : locked ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: 'var(--snow4)',
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '6px 12px',
                      background: 'var(--ink3)',
                      borderRadius: '4px',
                      border: '1px solid var(--line)'
                    }} title="Complete upstairs Condo items to unlock this downstairs storage area">
                      🔒 Locked
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => { initAudioContext(); handleStartScan(item); }}
                      style={{ 
                        padding: '6px 14px', 
                        fontSize: '12px',
                        width: '100%',
                        justifyContent: 'center',
                        boxShadow: '0 4px 10px rgba(61, 217, 192, 0.2)'
                      }}
                    >
                      📷 Scan to Verify
                    </button>
                  )}
                </div>
              </div>
            );
          };

          return (
            <>
              {/* Header info */}
              <div className="audit-main-header" style={{ borderBottom: '1px solid var(--line)' }}>
                {/* Mobile Back Button */}
                <button 
                  className="btn pick-mobile-back"
                  onClick={() => { setActiveSession(null); setSelectedOrder(null); setMobileActiveView('list'); }}
                  style={{
                    marginBottom: '12px',
                    background: 'var(--ink3)',
                    borderColor: 'var(--line)',
                    fontSize: '12px',
                    padding: '6px 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  ← Back to Orders
                </button>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="audit-main-title">
                      {activeSession.isBatch 
                        ? `Batch Pick (${activeSession.orderNumbers.length} Orders)` 
                        : `Order ${activeSession.orderNumbers[0]}`}
                    </div>
                    <div className="audit-main-sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {activeSession.isBatch ? (
                        <span>Orders: <strong>{activeSession.orderNumbers.join(', ')}</strong></span>
                      ) : (
                        <span>Customer: <strong>{activeSession.customerNames[0]}</strong></span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: isSessionFinished ? 'var(--teal)' : 'var(--gold)' }}>
                      {pickedItems} / {totalItems} Verified
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--snow3)', marginTop: '2px' }}>
                      {isSessionFinished ? 'Fulfillment Completed!' : 'Remaining in zones'}
                    </div>
                  </div>
                </div>
                
                {/* Progress bar */}
                <div style={{ width: '100%', height: '8px', background: 'var(--ink3)', borderRadius: '4px', overflow: 'hidden', marginTop: '16px' }}>
                  <div 
                    style={{ 
                      width: `${percent}%`, 
                      height: '100%', 
                      background: isSessionFinished ? 'var(--teal)' : 'var(--gold)', 
                      transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
                    }} 
                  />
                </div>
              </div>

              {/* Pick List */}
              <div className="audit-content" style={{ padding: '24px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px', width: '100%' }}>
                  
                  {/* Zone 1: Condo Zone (Upstairs) */}
                  {condoItems.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 700, 
                        color: 'var(--teal)', 
                        letterSpacing: '0.06em', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        background: 'rgba(61, 217, 192, 0.05)',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        borderLeft: '3px solid var(--teal)'
                      }}>
                        🏢 CONDO ZONE (UPSTAIRS PICKING FIRST)
                        <span style={{ fontSize: '11px', color: 'var(--snow3)', fontWeight: 500, marginLeft: 'auto' }}>
                          ({condoItems.filter(i => i.picked).length} / {condoItems.length} items complete)
                        </span>
                      </div>
                      {condoItems.map((item, idx) => renderPickListItem(item, idx))}
                    </div>
                  )}

                  {/* Zone 2: Storage Room Zone (Downstairs) */}
                  {storageItems.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 700, 
                        color: 'var(--gold)', 
                        letterSpacing: '0.06em', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        background: 'rgba(232, 197, 71, 0.05)',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        borderLeft: '3px solid var(--gold)'
                      }}>
                        📦 STORAGE ROOM ZONE (DOWNSTAIRS SECOND)
                        {condoItems.some(i => !i.picked) && (
                          <span style={{ fontSize: '10px', color: 'var(--rose)', fontWeight: 600, background: 'var(--rose-dim)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>
                            🔒 LOCKED
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: 'var(--snow3)', fontWeight: 500, marginLeft: 'auto' }}>
                          ({storageItems.filter(i => i.picked).length} / {storageItems.length} items complete)
                        </span>
                      </div>
                      {storageItems.map((item, idx) => renderPickListItem(item, idx))}
                    </div>
                  )}

                  {/* Zone 3: General/Other Zone */}
                  {otherItems.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 700, 
                        color: 'var(--snow2)', 
                        letterSpacing: '0.06em', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        borderLeft: '3px solid var(--line)'
                      }}>
                        🌐 GENERAL STORAGE
                        <span style={{ fontSize: '11px', color: 'var(--snow3)', fontWeight: 500, marginLeft: 'auto' }}>
                          ({otherItems.filter(i => i.picked).length} / {otherItems.length} items complete)
                        </span>
                      </div>
                      {otherItems.map((item, idx) => renderPickListItem(item, idx))}
                    </div>
                  )}

                </div>
              </div>
            </>
          );
        })() : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>📦</div>
            <h2 style={{ color: 'var(--snow)', marginBottom: '8px', fontFamily: 'Syne, sans-serif' }}>Offline Picking Workspace</h2>
            <p style={{ color: 'var(--snow3)', fontSize: '14px', maxWidth: '460px', lineHeight: '1.6', margin: '0 auto' }}>
              Select a synced order from the left sidebar to start verification, or select multiple orders to start a batch picking session.
            </p>
          </div>
        )}
      </div>

      {/* ── BARCODE SCANNER MODAL ── */}
      {scannerOpen && scanningItem && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 15, 18, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--ink2)',
            border: `1px solid ${flashGreen ? 'var(--teal)' : flashRed ? 'var(--rose)' : 'var(--line)'}`,
            borderRadius: 'var(--rl)',
            width: '100%',
            maxWidth: '440px',
            padding: '24px',
            boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
            transition: 'border-color 0.15s ease',
            position: 'relative'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: 600, letterSpacing: '0.05em' }}>
                  CUBICLE: {scanningItem.cubicle || 'Unknown'}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff', marginTop: '2px' }}>
                  Scan Barcode
                </div>
              </div>
              <button 
                onClick={() => setScannerOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--snow3)',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>
            
            {/* Scan Mode Toggle & Torch Controls */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              padding: '8px 12px',
              background: 'var(--ink)',
              borderRadius: 'var(--rs)',
              border: '1px solid var(--line)'
            }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--snow2)', cursor: 'pointer', fontWeight: 600 }}>
                  <input 
                    type="radio" 
                    name="mainScannerMode"
                    checked={scannerMode === 'barcode'} 
                    onChange={() => { stopOcrScanner(); setScannerMode('barcode'); }}
                    style={{ margin: 0 }}
                  />
                  Barcode
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--snow2)', cursor: 'pointer', fontWeight: 600 }}>
                  <input 
                    type="radio" 
                    name="mainScannerMode"
                    checked={scannerMode === 'ocr'} 
                    onChange={() => setScannerMode('ocr')}
                    style={{ margin: 0 }}
                  />
                  SKU Text (OCR)
                </label>
              </div>

              <button
                onClick={toggleTorch}
                className="btn"
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  background: isTorchOn ? 'var(--gold-dim)' : 'var(--ink3)',
                  color: isTorchOn ? 'var(--gold)' : 'var(--snow2)',
                  borderColor: isTorchOn ? 'var(--gold-line)' : 'var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isTorchOn ? '🔦 Light On' : '🔦 Light Off'}
              </button>
            </div>

            {/* Expected Details Card */}
            <div style={{
              background: 'var(--ink3)',
              padding: '12px',
              borderRadius: 'var(--r)',
              border: '1px solid var(--line)',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--snow)' }}>{scanningItem.title}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--snow3)', marginTop: '6px', fontFamily: 'DM Mono, monospace' }}>
                <span>SKU: {scanningItem.sku}</span>
                <span>Barcode: {scanningItem.barcode || 'N/A'}</span>
              </div>
            </div>

            {/* Visual Location Map */}
            {renderLocationMap(scanningItem.cubicle)}

            {/* Flash success / Camera view */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              {scannerSuccess ? (
                <div style={{
                  height: '200px',
                  background: 'var(--teal-dim)',
                  border: '2px dashed var(--teal)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--teal)',
                  fontWeight: 'bold',
                  gap: '8px',
                  animation: 'pulse-dot 1s infinite'
                }}>
                  <span style={{ fontSize: '36px' }}>✓</span>
                  <span>Match Confirmed!</span>
                </div>
              ) : (
                scannerMode === 'barcode' ? (
                  <div 
                    id="reader" 
                    ref={pickScannerRef} 
                    style={{ 
                      width: '100%', 
                      maxHeight: '260px', 
                      overflow: 'hidden', 
                      borderRadius: '8px', 
                      border: '1px solid var(--line)', 
                      background: '#000' 
                    }} 
                  />
                ) : (
                  <div style={{ position: 'relative', width: '100%', maxHeight: '260px', overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--line)', background: '#000' }}>
                    <video id="ocr-video" autoPlay playsInline style={{ width: '100%', height: 'auto', display: 'block' }} />
                    <div style={{
                      position: 'absolute',
                      top: '50%', left: '10%', right: '10%',
                      height: '40px',
                      transform: 'translateY(-50%)',
                      border: '2px dashed var(--teal)',
                      borderRadius: '4px',
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--teal)',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Align SKU Text Here
                    </div>
                    {ocrProcessing && (
                      <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: 'var(--teal)' }}>
                        Parsing text...
                      </div>
                    )}
                    {ocrReadText && (
                      <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: 'var(--snow)' }}>
                        Read: <code style={{ fontFamily: 'DM Mono, monospace' }}>{ocrReadText}</code>
                      </div>
                    )}
                  </div>
                )
              )}
              
              {/* Green / Red flash overlays */}
              {flashGreen && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(61, 217, 192, 0.4)', borderRadius: '8px', pointerEvents: 'none' }} />
              )}
              {flashRed && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(240, 106, 106, 0.4)', borderRadius: '8px', pointerEvents: 'none' }} />
              )}
            </div>

            {/* Feedback & Error logs */}
            {scannerError && (
              <div style={{
                background: 'var(--rose-dim)',
                border: '1px solid var(--rose-line)',
                color: 'var(--rose)',
                padding: '10px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '16px',
                lineHeight: '1.4'
              }}>
                {scannerError}
              </div>
            )}

            {/* Testing simulator Panel */}
            <div style={{
              borderTop: '1px solid var(--line)',
              paddingTop: '16px',
              marginTop: '16px'
            }}>
              <div style={{ fontSize: '11px', color: 'var(--snow3)', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.05em' }}>
                HARDWARE SCANNER / MANUAL INPUT
              </div>
              
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <input 
                  type="text" 
                  ref={pickModalInputRef}
                  placeholder="Scan barcode or type SKU here..."
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && scannedCode.trim()) {
                      initAudioContext();
                      handleBarcodeScanned(scannedCode);
                      setScannedCode('');
                    }
                  }}
                  style={{
                    flex: 1,
                    background: 'var(--ink)',
                    border: '1px solid var(--line)',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    color: '#fff',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
                <button 
                  onClick={() => { initAudioContext(); handleBarcodeScanned(scannedCode); setScannedCode(''); }}
                  disabled={!scannedCode.trim()}
                  className="btn"
                  style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--ink3)', color: 'var(--teal)' }}
                >
                  Match Scan
                </button>
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => { initAudioContext(); handleForcePick(); }}
                  className="btn"
                  style={{ 
                    flex: 1, 
                    fontSize: '12px', 
                    background: 'var(--ink3)', 
                    color: 'var(--gold)',
                    borderColor: 'var(--gold-line)',
                    justifyContent: 'center' 
                  }}
                >
                  ⚡ Force Pick (Skip Scan)
                </button>
                <button 
                  onClick={() => setScannerOpen(false)}
                  className="btn"
                  style={{ flex: 1, fontSize: '12px', background: 'var(--ink3)', justifyContent: 'center' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BATCH SELECT MODAL ── */}
      {showBatchModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 15, 18, 0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--ink2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--rl)',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ color: 'var(--snow)', fontFamily: 'Syne, sans-serif' }}>Select Unfulfilled Orders to Sync</h3>
                <p style={{ color: 'var(--snow3)', fontSize: '12px', marginTop: '2px' }}>Download these orders to IndexedDB to fulfill them offline</p>
              </div>
              <button 
                onClick={() => setShowBatchModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--snow3)', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* List */}
            <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
              {batchOrders.length === 0 ? (
                <div style={{ padding: '40px 0', textShadow: 'none', textAlign: 'center', color: 'var(--snow3)' }}>
                  No unfulfilled orders found on Shopify.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Select All */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    background: 'var(--ink3)',
                    borderRadius: 'var(--rs)',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}>
                    <input 
                      type="checkbox" 
                      checked={batchOrders.length > 0 && selectedBatchIds.size === batchOrders.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBatchIds(new Set(batchOrders.map(o => o.order_id)));
                        } else {
                          setSelectedBatchIds(new Set());
                        }
                      }}
                    />
                    <strong style={{ color: '#fff', fontSize: '13px' }}>Select All ({batchOrders.length} orders)</strong>
                  </label>

                  {batchOrders.map((order) => {
                    const isChecked = selectedBatchIds.has(order.order_id);
                    return (
                      <label 
                        key={order.order_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          background: isChecked ? 'rgba(232, 197, 71, 0.05)' : 'transparent',
                          border: isChecked ? '1px solid var(--gold-line)' : '1px solid var(--line)',
                          borderRadius: 'var(--rs)',
                          cursor: 'pointer',
                          userSelect: 'none',
                          transition: 'all 0.1s ease'
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => {
                            const newSet = new Set(selectedBatchIds);
                            if (newSet.has(order.order_id)) newSet.delete(order.order_id);
                            else newSet.add(order.order_id);
                            setSelectedBatchIds(newSet);
                          }}
                        />
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#fff', fontWeight: 'bold' }}>{order.order_number}</span>
                          <span style={{ color: 'var(--snow2)' }}>{order.customer_name}</span>
                          <span style={{ color: 'var(--snow3)', fontFamily: 'DM Mono, monospace', fontSize: '11px' }}>
                            {new Date(order.created_at).toLocaleDateString()}
                          </span>
                          <span style={{ color: 'var(--gold)' }}>{order.line_items.length} items</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'var(--ink)' }}>
              <button 
                onClick={() => setShowBatchModal(false)}
                className="btn"
                style={{ background: 'var(--ink3)' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleDownloadBatch}
                disabled={selectedBatchIds.size === 0}
                className="btn btn-primary"
              >
                Sync Selected ({selectedBatchIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* ── STOCK LOOKUP MODAL ── */}
      {isStockLookupOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 15, 18, 0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '24px 16px',
          overflowY: 'auto'
        }}>
          <div style={{
            background: 'var(--ink2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--rl)',
            width: '100%',
            maxWidth: '460px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
            margin: '0 auto'
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ color: 'var(--snow)', fontFamily: 'Syne, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🔍 Stock Checker
                </h3>
                <p style={{ color: 'var(--snow3)', fontSize: '12px', marginTop: '2px' }}>Scan barcode or enter SKU to inspect stock levels</p>
              </div>
              <button 
                onClick={() => { stopLookupScanning(); setIsStockLookupOpen(false); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--snow3)', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Lookup input & action */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="Enter SKU or Barcode..."
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'var(--ink)',
                    border: '1px solid var(--line)',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleStockLookup();
                    }
                  }}
                />
                <button 
                  onClick={() => handleStockLookup()}
                  disabled={lookupLoading || !lookupQuery.trim()}
                  className="btn btn-primary"
                  style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                  Lookup
                </button>
              </div>

              {/* Camera Scanner Trigger */}
              {!isLookupScanning ? (
                <button 
                  onClick={startLookupScanning}
                  className="btn"
                  style={{ 
                    width: '100%', 
                    justifyContent: 'center', 
                    background: 'var(--ink3)', 
                    borderColor: 'var(--teal-line)', 
                    color: 'var(--teal)' 
                  }}
                >
                  📷 Start Camera Scan
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Scan Mode Toggle & Torch Controls */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'var(--ink)',
                    borderRadius: 'var(--rs)',
                    border: '1px solid var(--line)'
                  }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--snow2)', cursor: 'pointer', fontWeight: 600 }}>
                        <input 
                          type="radio" 
                          name="lookupScannerMode"
                          checked={scannerMode === 'barcode'} 
                          onChange={() => { stopOcrScanner(); setScannerMode('barcode'); }}
                          style={{ margin: 0 }}
                        />
                        Barcode
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--snow2)', cursor: 'pointer', fontWeight: 600 }}>
                        <input 
                          type="radio" 
                          name="lookupScannerMode"
                          checked={scannerMode === 'ocr'} 
                          onChange={() => setScannerMode('ocr')}
                          style={{ margin: 0 }}
                        />
                        SKU Text (OCR)
                      </label>
                    </div>

                    <button
                      onClick={toggleTorch}
                      className="btn"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        background: isTorchOn ? 'var(--gold-dim)' : 'var(--ink3)',
                        color: isTorchOn ? 'var(--gold)' : 'var(--snow2)',
                        borderColor: isTorchOn ? 'var(--gold-line)' : 'var(--line)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {isTorchOn ? '🔦 Light On' : '🔦 Light Off'}
                    </button>
                  </div>

                  <div style={{ width: '100%', overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--line)', position: 'relative' }}>
                    {scannerMode === 'barcode' ? (
                      <div id="lookup-reader" style={{ width: '100%', minHeight: '200px', background: '#000' }} />
                    ) : (
                      <div style={{ position: 'relative', width: '100%', minHeight: '200px', background: '#000' }}>
                        <video id="lookup-ocr-video" autoPlay playsInline style={{ width: '100%', height: 'auto', display: 'block' }} />
                        <div style={{
                          position: 'absolute',
                          top: '50%', left: '10%', right: '10%',
                          height: '40px',
                          transform: 'translateY(-50%)',
                          border: '2px dashed var(--teal)',
                          borderRadius: '4px',
                          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
                          pointerEvents: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--teal)',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          Align SKU Text Here
                        </div>
                        {ocrProcessing && (
                          <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: 'var(--teal)' }}>
                            Parsing text...
                          </div>
                        )}
                        {ocrReadText && (
                          <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: 'var(--snow)' }}>
                            Read: <code style={{ fontFamily: 'DM Mono, monospace' }}>{ocrReadText}</code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => { stopLookupScanning(); stopOcrScanner(); }}
                    className="btn"
                    style={{ width: '100%', justifyContent: 'center', background: 'var(--rose-dim)', color: 'var(--rose)', borderColor: 'var(--rose-line)' }}
                  >
                    Stop Scanner
                  </button>
                </div>
              )}

              {/* Status and Error Alerts */}
              {lookupLoading && (
                <div className="loading" style={{ padding: '10px 0' }}>
                  <div className="spinner" />
                  Searching local database and Shopify...
                </div>
              )}
              {lookupError && (
                <div style={{ padding: '10px 12px', background: 'var(--rose-dim)', border: '1px solid var(--rose-line)', color: 'var(--rose)', borderRadius: '6px', fontSize: '13px' }}>
                  ⚠️ {lookupError}
                </div>
              )}

              {/* Lookup Result Card */}
              {lookupResult && (
                <div style={{
                  background: 'var(--ink3)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  animation: 'slideInUp 0.2s ease-out'
                }}>
                  <div>
                    {lookupResult.vendor && (
                      <div style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                        Brand: {lookupResult.vendor}
                      </div>
                    )}
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--snow4)', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>Product Title</span>
                    <strong style={{ color: 'var(--snow)', fontSize: '14.5px' }}>{lookupResult.title}</strong>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--snow4)', display: 'block', marginBottom: '2px' }}>SKU</span>
                      <code style={{ color: 'var(--snow2)', fontFamily: 'DM Mono, monospace' }}>{lookupResult.sku}</code>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--snow4)', display: 'block', marginBottom: '2px' }}>Barcode</span>
                      <span style={{ color: 'var(--snow2)', fontSize: '12px' }}>{lookupResult.barcode || '—'}</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px dashed var(--line)', paddingTop: '12px' }}>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--snow4)', display: 'block', marginBottom: '2px' }}>Cubicle Location</span>
                      <span style={{ 
                        display: 'inline-block',
                        padding: '4px 8px', 
                        background: lookupResult.cubicle && lookupResult.cubicle !== 'Unknown' ? 'var(--gold-dim)' : 'var(--ink)',
                        border: lookupResult.cubicle && lookupResult.cubicle !== 'Unknown' ? '1px solid var(--gold-line)' : '1px solid var(--line)',
                        color: lookupResult.cubicle && lookupResult.cubicle !== 'Unknown' ? 'var(--gold)' : 'var(--snow3)',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '12px'
                      }}>
                        {lookupResult.cubicle || 'Unknown'}
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--snow4)', display: 'block', marginBottom: '2px' }}>Current Stock</span>
                      {(() => {
                        const qty = lookupResult.inventory_quantity ?? 0;
                        const color = qty === 0 ? 'var(--rose)' : qty < 5 ? 'var(--amber)' : 'var(--teal)';
                        const bg = qty === 0 ? 'var(--rose-dim)' : qty < 5 ? 'var(--amber-dim)' : 'var(--teal-dim)';
                        const border = qty === 0 ? 'var(--rose-line)' : qty < 5 ? 'rgba(240,163,72,0.2)' : 'var(--teal-line)';
                        const icon = qty === 0 ? '🔴' : qty < 5 ? '🟡' : '🟢';
                        return (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 8px',
                            background: bg,
                            border: `1px solid ${border}`,
                            color: color,
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            fontSize: '12px'
                          }}>
                            {icon} {qty} {qty === 1 ? 'item' : 'items'}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '10px', color: 'var(--snow4)', textAlign: 'right', marginTop: '4px' }}>
                    Last Synced: {lookupResult.last_synced ? new Date(lookupResult.last_synced).toLocaleTimeString() : 'Just now'}
                  </div>
                </div>
              )}

              {/* Inbound Intake Panel */}
              {lookupResult && (
                <div style={{
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  background: 'var(--ink2)',
                  overflow: 'hidden',
                  marginTop: '12px'
                }}>
                  {/* Panel Toggle Header */}
                  <button
                    onClick={() => setIsIntakeOpen(!isIntakeOpen)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'var(--ink3)',
                      border: 'none',
                      color: 'var(--snow2)',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      outline: 'none'
                    }}
                  >
                    <span>📦 Inbound Stock Intake & Locations</span>
                    <span>{isIntakeOpen ? '▲' : '▼'}</span>
                  </button>

                  {isIntakeOpen && (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--line)' }}>
                      
                      {/* Location allocation input */}
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--snow3)', display: 'block', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Storage Cubicle
                        </label>
                        <input 
                          type="text" 
                          value={intakeLocation}
                          onChange={(e) => setIntakeLocation(e.target.value)}
                          placeholder="e.g. C-12, SR-3, None..."
                          style={{
                            width: '100%',
                            background: 'var(--ink)',
                            border: '1px solid var(--line)',
                            borderRadius: '4px',
                            padding: '8px 12px',
                            color: '#fff',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                        {lookupResult.cubicle ? (
                          <span style={{ fontSize: '11px', color: 'var(--snow4)', display: 'block', marginTop: '4px' }}>
                            💡 Currently assigned to <strong>{lookupResult.cubicle}</strong>. Is it going here?
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--gold)', display: 'block', marginTop: '4px' }}>
                            ⚠️ No location assigned! Please allocate a new storage cubicle.
                          </span>
                        )}
                      </div>

                      {/* Quantity input */}
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--snow3)', display: 'block', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Intake Quantity
                        </label>
                        <input 
                          type="number" 
                          value={intakeQty}
                          onChange={(e) => setIntakeQty(e.target.value)}
                          placeholder="Number of items to add/set..."
                          min="0"
                          style={{
                            width: '100%',
                            background: 'var(--ink)',
                            border: '1px solid var(--line)',
                            borderRadius: '4px',
                            padding: '8px 12px',
                            color: '#fff',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                      </div>

                      {/* Intake Mode (Add vs Set) */}
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--snow3)', display: 'block', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Update Method
                        </label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: intakeMode === 'add' ? 'var(--teal-dim)' : 'var(--ink)', border: intakeMode === 'add' ? '1px solid var(--teal-line)' : '1px solid var(--line)', borderRadius: '6px', color: intakeMode === 'add' ? 'var(--teal)' : 'var(--snow3)', cursor: 'pointer', fontSize: '12px' }}>
                            <input 
                              type="radio" 
                              name="intakeMode" 
                              checked={intakeMode === 'add'} 
                              onChange={() => setIntakeMode('add')} 
                              style={{ accentColor: 'var(--teal)' }}
                            />
                            <div>
                              <strong style={{ display: 'block' }}>Add Stock</strong>
                              <span style={{ fontSize: '10px', color: 'var(--snow4)' }}>Adds to current level</span>
                            </div>
                          </label>

                          <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: intakeMode === 'set' ? 'var(--rose-dim)' : 'var(--ink)', border: intakeMode === 'set' ? '1px solid var(--rose-line)' : '1px solid var(--line)', borderRadius: '6px', color: intakeMode === 'set' ? 'var(--rose)' : 'var(--snow3)', cursor: 'pointer', fontSize: '12px' }}>
                            <input 
                              type="radio" 
                              name="intakeMode" 
                              checked={intakeMode === 'set'} 
                              onChange={() => setIntakeMode('set')} 
                              style={{ accentColor: 'var(--rose)' }}
                            />
                            <div>
                              <strong style={{ display: 'block' }}>Overwrite Stock</strong>
                              <span style={{ fontSize: '10px', color: 'var(--snow4)' }}>Destructive stock audit</span>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Intake Success/Error display */}
                      {intakeError && (
                        <div style={{ padding: '8px 12px', background: 'var(--rose-dim)', border: '1px solid var(--rose-line)', color: 'var(--rose)', borderRadius: '4px', fontSize: '12px' }}>
                          ⚠️ {intakeError}
                        </div>
                      )}
                      {intakeSuccess && (
                        <div style={{ padding: '8px 12px', background: 'var(--teal-dim)', border: '1px solid var(--teal-line)', color: 'var(--teal)', borderRadius: '4px', fontSize: '12px' }}>
                          {intakeSuccess}
                        </div>
                      )}

                      {/* Submit button */}
                      <button
                        onClick={handleIntakeSubmit}
                        disabled={intakeLoading || !intakeQty.trim()}
                        className="btn btn-primary"
                        style={{
                          width: '100%',
                          justifyContent: 'center',
                          padding: '10px',
                          fontSize: '13px',
                          background: 'var(--gold)',
                          borderColor: 'var(--gold-line)',
                          color: 'var(--ink)'
                        }}
                      >
                        {intakeLoading ? (
                          <>
                            <div className="spinner" style={{ borderColor: 'var(--ink) transparent var(--ink) transparent', width: '12px', height: '12px', borderWidth: '2px', display: 'inline-block', marginRight: '6px' }} />
                            Updating Shopify...
                          </>
                        ) : (
                          '💾 Save Location & Stock Intake'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', background: 'var(--ink)' }}>
              <button 
                onClick={() => { stopLookupScanning(); setIsStockLookupOpen(false); }}
                className="btn"
                style={{ background: 'var(--ink3)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: toast.type === 'success' ? 'var(--ink2)' : 'var(--rose-dim)',
          border: `1px solid ${toast.type === 'success' ? 'var(--teal-line)' : 'var(--rose-line)'}`,
          color: toast.type === 'success' ? 'var(--teal)' : 'var(--rose)',
          padding: '14px 20px',
          borderRadius: 'var(--r)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          fontWeight: 600,
          borderLeft: `4px solid ${toast.type === 'success' ? 'var(--teal)' : 'var(--rose)'}`,
          animation: 'slideInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <span style={{ fontSize: '16px' }}>{toast.type === 'success' ? '🎉' : '⚠️'}</span>
          <span>{toast.message}</span>
          <button 
            onClick={() => setToast(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              marginLeft: '10px',
              opacity: 0.7,
              fontSize: '14px'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Embedded CSS Animations & Responsiveness */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideInUp {
          from { transform: translateY(30px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* Desktop styles (Default overrides) */
        .pick-mobile-back {
          display: none !important;
        }

        /* Mobile Responsive adjustments (width <= 768px) */
        @media (max-width: 768px) {
          .pick-layout {
            grid-template-columns: 1fr !important;
          }
          .pick-sidebar {
            display: ${mobileActiveView === 'workspace' ? 'none !important' : 'flex !important'};
            width: 100% !important;
            border-right: none !important;
          }
          .pick-main {
            display: ${mobileActiveView === 'list' ? 'none !important' : 'flex !important'};
            width: 100% !important;
          }
          .pick-mobile-back {
            display: inline-flex !important;
          }
          
          /* Adjust grid card layouts on mobile */
          div[style*="gridTemplateColumns"] {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          div[style*="gridTemplateColumns"] > div[style*="textAlign"] {
            text-align: left !important;
            margin-top: 4px;
          }
          div[style*="gridTemplateColumns"] > div[style*="alignItems"] {
            align-items: flex-start !important;
            margin-top: 8px;
            border-top: 1px dashed var(--line);
            padding-top: 10px;
            width: 100%;
          }
          /* Modal size adjustments on small screens */
          div[style*="maxWidth: '440px'"] {
            padding: 16px !important;
          }
        }
      `}} />
    </>
  );
}
