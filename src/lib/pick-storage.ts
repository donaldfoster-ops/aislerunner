const DB_NAME = 'PickFulfillmentDB';
const DB_VERSION = 1;

export interface CatalogItem {
  sku: string;
  barcode: string;
  product_id: string;
  variant_id: string;
  title: string;
  cubicle: string;
  vendor: string;
  inventory_quantity?: number;
  last_synced: number;
}

export interface OrderLineItem {
  sku: string;
  barcode: string;
  title: string;
  qty: number;
  cubicle: string;
  picked: boolean;
  picked_qty?: number;
}

export interface ActiveOrder {
  order_id: string;
  order_number: string;
  customer_name: string;
  created_at: string;
  line_items: OrderLineItem[];
  status: 'pending' | 'fully_picked';
  synced_at: number;
}

export interface PickQueueItem {
  id?: number;
  order_id: string;
  sku: string;
  picked_qty: number;
  timestamp: number;
  uploaded: boolean;
}

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('IndexedDB is only available in the browser'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('catalog_map')) {
        db.createObjectStore('catalog_map', { keyPath: 'sku' });
      }
      if (!db.objectStoreNames.contains('active_orders')) {
        db.createObjectStore('active_orders', { keyPath: 'order_id' });
      }
      if (!db.objectStoreNames.contains('pick_queue')) {
        db.createObjectStore('pick_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

export async function saveCatalog(catalogMap: Record<string, CatalogItem>): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('catalog_map', 'readwrite');
    const store = transaction.objectStore('catalog_map');
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    
    store.clear();
    
    Object.values(catalogMap).forEach((item) => {
      store.put(item);
    });
  });
}

export async function getCatalogItem(sku: string): Promise<CatalogItem | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('catalog_map', 'readonly');
    const store = transaction.objectStore('catalog_map');
    const request = store.get(sku);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveActiveOrder(order: ActiveOrder): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('active_orders', 'readwrite');
    const store = transaction.objectStore('active_orders');
    const request = store.put(order);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getActiveOrder(orderId: string): Promise<ActiveOrder | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('active_orders', 'readonly');
    const store = transaction.objectStore('active_orders');
    const request = store.get(orderId);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getActiveOrders(): Promise<ActiveOrder[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('active_orders', 'readonly');
    const store = transaction.objectStore('active_orders');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteActiveOrder(orderId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('active_orders', 'readwrite');
    const store = transaction.objectStore('active_orders');
    const request = store.delete(orderId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function queuePickAction(action: Omit<PickQueueItem, 'id' | 'uploaded'>): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pick_queue', 'readwrite');
    const store = transaction.objectStore('pick_queue');
    const item: PickQueueItem = {
      ...action,
      uploaded: false
    };
    const request = store.put(item);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingQueue(): Promise<PickQueueItem[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pick_queue', 'readonly');
    const store = transaction.objectStore('pick_queue');
    const request = store.getAll();
    
    request.onsuccess = () => {
      const all = request.result || [];
      resolve(all.filter((item: PickQueueItem) => !item.uploaded));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function markQueueItemUploaded(id: number): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pick_queue', 'readwrite');
    const store = transaction.objectStore('pick_queue');
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (item) {
        item.uploaded = true;
        const putRequest = store.put(item);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function clearUploadedQueue(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pick_queue', 'readwrite');
    const store = transaction.objectStore('pick_queue');
    const request = store.getAll();
    
    request.onsuccess = () => {
      const items = request.result || [];
      const deletePromises = items
        .filter((item: PickQueueItem) => item.uploaded)
        .map((item: PickQueueItem) => {
          if (item.id !== undefined) {
            return new Promise<void>((res) => {
              const delReq = store.delete(item.id!);
              delReq.onsuccess = () => res();
              delReq.onerror = () => res();
            });
          }
          return Promise.resolve();
        });
      Promise.all(deletePromises).then(() => resolve());
    };
    request.onerror = () => reject(request.error);
  });
}

export async function removePickActionFromQueue(orderId: string, sku: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pick_queue', 'readwrite');
    const store = transaction.objectStore('pick_queue');
    const request = store.getAll();
    
    request.onsuccess = () => {
      const items = request.result || [];
      const matchingItems = items.filter(
        (item: PickQueueItem) => item.order_id === orderId && item.sku === sku && !item.uploaded
      );
      
      const deletePromises = matchingItems.map((item: PickQueueItem) => {
        if (item.id !== undefined) {
          return new Promise<void>((res) => {
            const delReq = store.delete(item.id!);
            delReq.onsuccess = () => res();
            delReq.onerror = () => res();
          });
        }
        return Promise.resolve();
      });
      
      Promise.all(deletePromises).then(() => resolve());
    };
    request.onerror = () => reject(request.error);
  });
}

export async function searchCatalogItem(query: string): Promise<CatalogItem | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('catalog_map', 'readonly');
    const store = transaction.objectStore('catalog_map');
    const request = store.openCursor();
    const cleanQuery = query.trim().toLowerCase();
    
    if (!cleanQuery) {
      return resolve(null);
    }
    
    request.onsuccess = (event: any) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        const itemSku = (item.sku || '').toLowerCase();
        const itemBarcode = (item.barcode || '').toLowerCase();
        
        if (itemSku === cleanQuery || itemBarcode === cleanQuery) {
          resolve(item);
          return;
        }
        cursor.continue();
      } else {
        resolve(null);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
}

