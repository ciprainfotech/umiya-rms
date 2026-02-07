import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  LayoutGrid, Receipt, Utensils, Users, LogOut,
  Printer, X, Search, Plus, Trash2, Edit3,
  Clock, ChevronLeft, ChevronRight, Eye, EyeOff,
  Coffee, Calendar, CheckCircle2, AlertCircle, ArrowUpDown, MessageSquare,
  List, FolderCog, Save, Loader2, FileText
} from 'lucide-react';
import api from '../api/axios';
import QueueManager from '../components/QueueManager';

// --- CONSTANTS & CONFIG ---
const RESTAURANT_INFO = {
    name: "HOTEL UMIYA KATHIYAWADI",
    address: "VASAD ROAD, BORSAD",
    gstin: "24BLGPK9761G1ZV",
};


// --- UTILITY FUNCTIONS ---
const safeNum = (val) => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
};

const decodeQuantity = (rawQty) => {
    const q = Math.round(Number(rawQty) * 10) / 10;
    const floor = Math.floor(q + 0.01);
    const rem = Math.round((q - floor) * 10) / 10;

    if (rem === 0.6) return { fulls: floor, halves: 1 };
    if (rem === 0.2) return { fulls: floor - 1, halves: 2 };
    if (rem === 0.8) return { fulls: floor - 1, halves: 3 };
    return { fulls: floor, halves: 0 };
};

// --- HELPER COMPONENTS ---

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
      if(!message) return;
      const t = setTimeout(onClose, 3000);
      return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className={`fixed top-4 right-4 z-[5000] flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-right ${type==='error'?'bg-red-600':'bg-slate-900'} text-white`}>
        {type==='error'?<AlertCircle size={20}/>:<CheckCircle2 size={20} className="text-green-400"/>}
        <span className="font-bold text-sm">{message}</span>
    </div>
  );
};

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[5100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 border border-slate-200">
        <h3 className="text-lg font-black text-slate-800 uppercase mb-2">{title}</h3>
        <p className="text-slate-500 text-sm font-medium mb-6 leading-relaxed">{message}</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200">Confirm</button>
        </div>
      </div>
    </div>
  );
};

const TableTimer = ({ startTime }) => {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
        if (!startTime) return;
        const diff = Math.floor((new Date() - new Date(startTime)) / 60000);
        const h = Math.floor(diff/60);
        const m = diff%60;
        setLabel(`${h>0?h+'h ':''}${m}m`);
    };
    update();
    const i = setInterval(update, 60000);
    return () => clearInterval(i);
  }, [startTime]);
  return <span className="font-mono">{label || '0m'}</span>;
};

const WaitingTimer = ({ startTime }) => {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
        if (!startTime) return;
        const diff = Math.floor((new Date() - new Date(startTime)) / 60000);
        const h = Math.floor(diff/60);
        const m = diff%60;
        setLabel(`${h>0?h+'h ':''}${m}m`);
    };
    update();
    const i = setInterval(update, 30000);
    return () => clearInterval(i);
  }, [startTime]);
  return <span className="font-mono">{label || '0m'}</span>;
};


// --- PRINTING COMPONENT ---
const ThermalPrinter = ({ data }) => {
    if (!data) return null;
    const { table, items, type, customer, phone, billNo, date } = data;
    const loggedInUser = localStorage.getItem('username') || 'Staff';

    const aggregatedItems = [];
    items.forEach(item => {
        const { fulls, halves } = decodeQuantity(item.quantity);
        // Use price_at_time if available (History), else current menu price
        const basePrice = item.price_at_time
            ? safeNum(item.price_at_time)
            : (table.is_ac ? safeNum(item.price_ac) : safeNum(item.price_non_ac));

        const pushOrMerge = (name, qty, rate, note, variant) => {
            const existing = aggregatedItems.find(i => i.name === name && i.variant === variant && i.rate === rate && i.note === note);
            if(existing) existing.qty += qty;
            else aggregatedItems.push({ name, qty, rate, note, variant, amount: 0 });
        };

        // Note: For history items, price_at_time is already the unit price.
        // For halves in history, the backend usually stores the split price.
        // We assume price passed here is unitary.
        if (fulls > 0) pushOrMerge(item.name, fulls, basePrice, item.special_instruction, 'Full');
        if (halves > 0) {
            // If it's a history item, the rate might already be adjusted.
            // If it's live, we calculate 60%.
            const halfPrice = item.price_at_time ? basePrice : Math.ceil(basePrice * 0.6);
            pushOrMerge(item.name, halves, halfPrice, item.special_instruction, 'Half');
        }
    });

    aggregatedItems.forEach(i => i.amount = i.qty * i.rate);
    const totalAmt = aggregatedItems.reduce((acc, i) => acc + i.amount, 0);
    const totalQty = aggregatedItems.reduce((acc, i) => acc + i.qty, 0);
    const d = date ? new Date(date) : new Date();
    const dateStr = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    return (
        <div id="thermal-print-area" className="hidden print:block font-mono text-black text-[12px] leading-tight w-[74mm] px-3 py-1 bg-white absolute top-0 left-0 z-[9999]">
            <div className="text-center mb-1"><h3 className="text-[10px] font-bold">Retails Invoice</h3><h1 className="text-[16px] font-black uppercase mt-1">{RESTAURANT_INFO.name}</h1><p className="text-[10px] uppercase font-bold mt-1">{RESTAURANT_INFO.address}</p><p className="text-[10px] font-bold">{RESTAURANT_INFO.contact}</p></div>
            <div className="border-b border-black border-dashed pb-1 mb-1 text-[11px] font-bold uppercase">
                <div className="flex"><span className="w-10">M/s:</span><span className="flex-1">{customer || 'Walk-in'}</span></div>
                {type === 'KOT' && <div className="flex"><span className="w-10">Steward:</span><span className="flex-1">{loggedInUser}</span></div>}
                {phone && <div className="flex"><span className="w-10">Ph:</span><span>{phone}</span></div>}
            </div>
            <div className="flex justify-between text-[10px] font-bold border-b border-black border-dashed pb-1"><div className="flex flex-col text-left"><span>Bill No : {billNo || '---'}</span><span>Table : {table.table_no}</span></div><div className="flex flex-col text-right"><span>Date : {dateStr}</span><span>Time : {timeStr}</span></div></div>
            {type === 'KOT' && <div className="text-center border-b border-black border-dashed py-1 mb-1"><span className="text-[14px] font-black uppercase">KITCHEN ORDER TICKET</span></div>}
            <div className="flex mt-1 text-[10px] font-bold border-b border-black border-dashed pb-1"><div className="w-[50%]">ITEM</div><div className="w-[15%] text-center">QTY</div>{type === 'BILL' && <div className="w-[15%] text-right">RATE</div>}{type === 'BILL' && <div className="w-[20%] text-right">AMT</div>}</div>
            <div className="flex flex-col gap-1 mt-1 pb-2 border-b border-black border-dashed">
                {aggregatedItems.map((row, i) => (
                    <div key={i} className="flex flex-col">
                        <div className="flex text-[11px] font-bold">
                            <div className="w-[50%] break-words pr-1">{row.name} {row.variant === 'Half' && <span className="text-[9px] bg-black text-white px-1 ml-1 rounded">HALF</span>}</div>
                            <div className="w-[15%] text-center text-[12px]">{row.qty}</div>
                            {type === 'BILL' && (<><div className="w-[15%] text-right">{safeNum(row.rate).toFixed(0)}</div><div className="w-[20%] text-right">{safeNum(row.amount).toFixed(0)}</div></>)}
                        </div>
                        {type === 'KOT' && row.note && <div className="text-[10px] italic font-normal pl-2">-- {row.note}</div>}
                    </div>
                ))}
            </div>
            {type === 'BILL' && (<><div className="flex justify-end items-center mt-2 text-[16px] font-black"><span className="mr-4">Grand Total:</span><span>{Math.round(totalAmt).toFixed(0)}.00</span></div><div className="border-t border-black border-dashed my-2"></div><div className="text-[10px] font-bold text-center"><p>GSTIN : {RESTAURANT_INFO.gstin}</p><p>THE ABOVE ITEMS ARE INCLUSIVE OF GST.</p></div><div className="mt-4 text-center"><p className="text-[10px] font-bold">For, {RESTAURANT_INFO.name}</p><p className="text-[14px] font-bold mt-2 font-serif">{RESTAURANT_INFO.footer_msg}</p></div></>)}
            {type === 'KOT' && <div className="mt-2 text-center text-[12px] font-bold">Total Items: {totalQty}</div>}
        </div>
    );
};

// --- GENERIC DATA TABLE ---
// --- GENERIC DATA TABLE ---
const DataTable = ({ data, columns, onRowClick, actions, searchKeys = ['name'] }) => {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [query, setQuery] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const filteredData = useMemo(() => data.filter(item => searchKeys.some(key => String(item[key] || '').toLowerCase().includes(query.toLowerCase()))), [data, query, searchKeys]);

  const sortedData = useMemo(() => {
      let items = [...filteredData];
      if (sortConfig.key) {
        items.sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];

            // Attempt to convert to numbers for proper numeric sorting (fixes item codes)
            const numA = Number(valA);
            const numB = Number(valB);
            let comparison = 0;

            if (!isNaN(numA) && !isNaN(numB)) {
                // It's a number, so compare numerically
                if (numA < numB) comparison = -1;
                else if (numA > numB) comparison = 1;
            } else {
                // It's not a number, so compare as strings (case-insensitive)
                const strA = String(valA || '').toLowerCase();
                const strB = String(valB || '').toLowerCase();
                if (strA < strB) comparison = -1;
                else if (strA > strB) comparison = 1;
            }

            // Apply direction (ascending vs. descending)
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
      }
      return items;
  }, [filteredData, sortConfig]);

  const requestSort = (key) => setSortConfig({ key, direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc' });
  const paginatedData = sortedData.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const totalPages = Math.ceil(sortedData.length / rowsPerPage);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50/50">
        <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input className="w-full pl-10 pr-4 py-2 bg-white border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="Search..." value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
        </div>
        <select className="bg-white border rounded-lg p-1.5 text-xs font-bold outline-none cursor-pointer" value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}>
            <option value={5}>5 Rows</option><option value={10}>10 Rows</option><option value={20}>20 Rows</option><option value={50}>50 Rows</option>
        </select>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10">
            <tr>
                {columns.map((col, i) => (
                    <th key={i} className="p-4 border-b cursor-pointer hover:bg-slate-200" onClick={() => col.accessor && requestSort(col.accessor)}>
                        <div className="flex items-center gap-1">{col.header}{col.accessor && <ArrowUpDown size={12}/>}</div>
                    </th>
                ))}
                {actions && <th className="p-4 border-b text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.map((row, i) => (
              <tr key={i} onClick={() => onRowClick && onRowClick(row)} className={`hover:bg-blue-50/50 transition-colors ${onRowClick ? 'cursor-pointer active:bg-blue-100' : ''}`}>
                {columns.map((col, j) => <td key={j} className="p-4 text-slate-700 font-medium">{col.render ? col.render(row) : row[col.accessor]}</td>)}
                {actions && <td className="p-4 text-right"><div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>{actions(row)}</div></td>}
              </tr>
            ))}
            {paginatedData.length === 0 && <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="p-10 text-center text-slate-400 italic font-medium">No records found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t bg-slate-50 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          <span>Page {page} of {totalPages || 1}</span>
          <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 border rounded-lg bg-white disabled:opacity-50 hover:bg-slate-100"><ChevronLeft size={14}/></button>
              <button disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)} className="p-2 border rounded-lg bg-white disabled:opacity-50 hover:bg-slate-100"><ChevronRight size={14}/></button>
          </div>
      </div>
    </div>
  );
};


const BillingSession = ({ table, menuItems, onClose, onUpdate, notify }) => {
    // --- STATE ---
    const [items, setItems] = useState([]); 
    const [snapshot, setSnapshot] = useState([]); 
    const [notePresets, setNotePresets] = useState([]); 

    // --- INPUTS ---
    const [code, setCode] = useState("");
    const [qty, setQty] = useState("1");
    const [activeTab, setActiveTab] = useState('new'); 
    
    // --- METADATA ---
    const [currentOrderId, setCurrentOrderId] = useState(table.active_order_id);
    const [customer, setCustomer] = useState(table.customer_name || "");
    const [phone, setPhone] = useState(table.customer_phone || "");
    
    // --- ITEM CONFIG ---
    const [identifiedItem, setIdentifiedItem] = useState(null);
    const [isHalf, setIsHalf] = useState(false);
    const [isJain, setIsJain] = useState(false);
    const [note, setNote] = useState("");
    
    // --- UI FLAGS ---
    const [showNoteModal, setShowNoteModal] = useState(false);
    
    // --- LOCKS ---
    const isSyncing = useRef(false); 
    const codeRef = useRef(null);
    const qtyRef = useRef(null);
    const scrollRef = useRef(null);
    const lastActionTime = useRef(0);

    // --- UTILS ---
    const safeNum = (val) => { const n = Number(val); return isNaN(n) ? 0 : n; };
    const normalize = (val) => String(val || "").trim().toLowerCase();
    const getItemSignature = (i) => `${normalize(i.item_code)}_${i.portion}_${normalize(i.note)}`;

    // 🛠️ STRICT DECODER (Integers = Fulls)
    const resolvePortions = (val) => {
        const n = parseFloat(val);
        const fixedN = Math.round(n * 10) / 10; // Fix floating point noise
        
        for (let f = Math.floor(fixedN); f >= 0; f--) {
            const remainder = parseFloat((fixedN - f).toFixed(1));
            if (remainder === 0) return { fulls: f, halves: 0 };
            
            const ratio = remainder / 0.6;
            
            if (Math.abs(ratio - Math.round(ratio)) < 0.05) {
                return { fulls: f, halves: Math.round(ratio) };
            }
        }
        
        return { fulls: fixedN, halves: 0 };
    };

    useEffect(() => {
        api.get('orders/presets').then(res => setNotePresets(res.data || [])).catch(() => {});
    }, []);

    // --- 1. LOAD SESSION ---
    useEffect(() => {
        const loadSession = async () => {
            if (!currentOrderId) {
                setTimeout(() => codeRef.current?.focus(), 100);
                return;
            }
            try {
                const res = await api.get(`/orders/details/${currentOrderId}`);
                const parsedItems = res.data.flatMap(i => {
                    const quantity = safeNum(i.quantity);
                    const { fulls, halves } = resolvePortions(quantity);
                    const rows = [];
                    const baseItem = {
                        item_code: i.item_code,
                        name: i.name,
                        price: safeNum(i.price_at_time),
                        note: i.special_instruction || "",
                    };
                    if (fulls > 0) rows.push({ ...baseItem, uniqueId: Math.random().toString(36).substr(2, 9), portion: 'Full', displayQty: fulls, dbQty: fulls, initialDBQty: fulls });
                    if (halves > 0) rows.push({ ...baseItem, uniqueId: Math.random().toString(36).substr(2, 9), portion: 'Half', displayQty: halves, dbQty: halves * 0.6, initialDBQty: halves * 0.6 });
                    return rows;
                });
                setItems(parsedItems);
                setSnapshot(JSON.parse(JSON.stringify(parsedItems))); 
                if(parsedItems.length > 0) setActiveTab('running');
            } catch (e) { notify("Sync Error: Could not load items", "error"); } 
            finally { setTimeout(() => codeRef.current?.focus(), 100); }
        };
        loadSession();
    }, [currentOrderId]);

    // --- 2. LOCAL UPDATE LOGIC ---
    const updateLocalState = (action, payload) => {
        setItems(prev => {
            const newList = [...prev];
            if (action === 'DELETE') {
                const { targetItem } = payload;
                if (targetItem.uniqueId) return newList.filter(i => i.uniqueId !== targetItem.uniqueId);
                const sig = getItemSignature(targetItem);
                const idx = newList.findIndex(i => getItemSignature(i) === sig);
                if (idx > -1) newList.splice(idx, 1);
                return newList;
            }
            if (action === 'ADD') {
                const { itemData, qtyDisp, qtyDb, portion, note, price } = payload;
                const sig = `${normalize(itemData.item_code)}_${portion}_${normalize(note)}`;
                const existingIdx = newList.findIndex(i => getItemSignature(i) === sig);

                if (existingIdx > -1) {
                    const cur = newList[existingIdx];
                    const newDisplayQty = Number(cur.displayQty) + Number(qtyDisp);
                    const newDbQty = parseFloat((cur.dbQty + qtyDb).toFixed(1));
                    
                    if (newDisplayQty <= 0) newList.splice(existingIdx, 1);
                    else newList[existingIdx] = { ...cur, displayQty: newDisplayQty, dbQty: newDbQty };
                } else {
                    if (Number(qtyDisp) > 0) {
                        newList.push({
                            uniqueId: Math.random().toString(36).substr(2, 9),
                            item_code: itemData.item_code,
                            name: itemData.name,
                            portion,
                            displayQty: Number(qtyDisp),
                            dbQty: Number(qtyDb),
                            price: Math.round(price),
                            note,
                            initialDBQty: 0
                        });
                    }
                }
                return newList;
            }
            return prev;
        });
    };

    // --- 3. SYNC (ATOMIC BATCH & TABLE RELEASE) ---
    const syncToDB = async () => {
        if (isSyncing.current) return null; 
        
        // 🛡️ EMPTY CART LOGIC: If items are 0, FORCE VOID to release table
        if (items.length === 0) {
            if (currentOrderId) {
                try {
                    isSyncing.current = true;
                    // Calling settle/void endpoint to ensure table status becomes 'empty'
                    await api.post('/orders/settle', { tableId: table.id, orderId: currentOrderId });
                    notify("Table Released (Empty)");
                    setCurrentOrderId(null);
                    setSnapshot([]);
                    return null; // Return null to signal "No Order Exists"
                } catch(e) {
                    console.error("Auto-Void Failed", e);
                    notify("Failed to clear table", "error");
                } finally {
                    isSyncing.current = false;
                }
            }
            return null;
        }

        // --- NORMAL SYNC (Items Exist) ---
        // If snapshot is empty and current items match, nothing to do
        if (items.length === 0 && snapshot.length === 0 && !currentOrderId) return null;

        try {
            isSyncing.current = true;
            
            const currentMap = {}; items.forEach(i => currentMap[getItemSignature(i)] = (currentMap[getItemSignature(i)] || 0) + i.dbQty);
            const snapshotMap = {}; snapshot.forEach(i => snapshotMap[getItemSignature(i)] = (snapshotMap[getItemSignature(i)] || 0) + i.dbQty);
            const updates = [];

            Object.keys(currentMap).forEach(key => {
                const diff = parseFloat((currentMap[key] - (snapshotMap[key] || 0)).toFixed(1));
                if (diff !== 0 && !isNaN(diff)) {
                    const [code, portion, note] = key.split('_');
                    if (code && code !== 'undefined') updates.push({ item_code: code, quantity: diff, special_instruction: note });
                }
            });

            Object.keys(snapshotMap).forEach(key => {
                if (!currentMap[key]) {
                    const [code, portion, note] = key.split('_');
                    if (code && code !== 'undefined') updates.push({ item_code: code, quantity: -snapshotMap[key], special_instruction: note });
                }
            });

            let oid = currentOrderId;
            if (updates.length > 0) {
                const res = await api.post('/orders/add-item', {
                    table_id: table.id,
                    customer_name: customer,
                    customer_phone: phone,
                    items: updates
                });
                
                oid = res.data.orderId;
                setCurrentOrderId(oid);
                setSnapshot(JSON.parse(JSON.stringify(items)));
                setItems(prev => prev.map(i => ({ ...i, initialDBQty: i.dbQty })));
            }
            return oid || currentOrderId;
        } catch (e) {
            console.error("Sync Error", e);
            notify(e.response?.data?.message || "Transaction Failed", "error");
            throw e; 
        } finally {
            isSyncing.current = false;
        }
    };

    // --- HANDLERS ---
    
    // 🛠️ VOID (No Alert, Direct Action)
    const handleVoid = async () => {
        if(!currentOrderId && !table.active_order_id) return onClose();
        
        try {
            await api.post('/orders/settle', { tableId: table.id, orderId: currentOrderId || table.active_order_id });
            notify("Table Voided");
            onUpdate();
            onClose();
        } catch(e) { notify("Error Voiding", "error"); }
    };

    const handleAddToCart = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (!identifiedItem) return;
        if (Date.now() - lastActionTime.current < 200) return;
        lastActionTime.current = Date.now();

        const inputQty = safeNum(qty);
        if (isNaN(inputQty) || inputQty === 0) return notify("Invalid Quantity", "error");

        const absQty = Math.abs(inputQty);
        // 🟢 PASTE THIS NEW LOGIC 🟢
        
        // Calculate direction (Add or Remove)
        const sign = inputQty < 0 ? -1 : 1; 
        
        const price = safeNum(table.is_ac ? identifiedItem.price_ac : identifiedItem.price_non_ac);
        const finalNote = isJain ? `Jain, ${note}`.replace(/,\s*$/, "").trim() : note.trim();

        // 1. IF 'HALF' BUTTON IS ON: Force Pure Halves (e.g. Input "3" -> "3 Halves")
        if (isHalf) {
             const dispQty = absQty; 
             const dbQty = parseFloat((dispQty * 0.6).toFixed(1));
             
             updateLocalState('ADD', { 
                 itemData: identifiedItem, 
                 portion: 'Half', 
                 note: finalNote, 
                 qtyDisp: dispQty * sign, 
                 qtyDb: dbQty * sign, 
                 price 
             });
             notify(sign > 0 ? `Added ${identifiedItem.name} (Half)` : `Removed ${identifiedItem.name} (Half)`);
        } 
        // 2. STANDARD MODE: Use Smart Decoder (Fixes 3.6 -> 3 Full + 1 Half)
        else {
             const { fulls, halves } = resolvePortions(absQty);

             if (fulls > 0) {
                 updateLocalState('ADD', { 
                     itemData: identifiedItem, 
                     portion: 'Full', 
                     note: finalNote, 
                     qtyDisp: fulls * sign, 
                     qtyDb: fulls * sign, 
                     price 
                 });
             }

             if (halves > 0) {
                 updateLocalState('ADD', { 
                     itemData: identifiedItem, 
                     portion: 'Half', 
                     note: finalNote, 
                     qtyDisp: halves * sign, 
                     qtyDb: parseFloat((halves * 0.6).toFixed(1)) * sign, 
                     price 
                 });
             }
             
             if (fulls > 0 || halves > 0) {
                notify(sign > 0 ? `Added ${identifiedItem.name}` : `Removed ${identifiedItem.name}`);
             }
        }
        setIdentifiedItem(null); setCode(""); setNote(""); setIsHalf(false); setQty("1"); setIsJain(false);
        setTimeout(() => codeRef.current?.focus(), 50);
    };

    const handleDeleteKey = () => {
        const cleanCode = normalize(code);
        if (!cleanCode) return notify("Enter code to delete", "error");
        
        const itemToDelete = [...items].reverse().find(i => normalize(i.item_code) === cleanCode);
        
        if (itemToDelete) {
            updateLocalState('DELETE', { targetItem: itemToDelete });
            notify("Item Removed");
            setCode("");
        } else {
            notify("Item not found", "error");
        }
    };

    const handleRowDelete = (item) => updateLocalState('DELETE', { targetItem: item });

    const lookupItem = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const cleanCode = normalize(code);
            const item = menuItems.find(m => normalize(m.item_code) === cleanCode);
            if (item) {
                setIdentifiedItem(item);
                setIsHalf(false); setIsJain(false); setQty("1"); setNote("");
                setTimeout(() => qtyRef.current?.select(), 50);
            } else { notify("Invalid Code", "error"); setCode(""); }
        }
    };

    const printKOT = () => {
        if(cart.length === 0) return notify("Cart is empty", "error");
        setPrintData({ table, items: cart, type: 'KOT', customer, billNo: 'KOT', date: new Date() });
        setTimeout(() => { window.print(); notify("KOT Sent", "success"); onClose(); }, 300);
    };

    const handleSettle = async () => {
        if (items.length === 0) return notify("Empty Order", "error");
        if (isSyncing.current) return; 

        try {
            const oid = await syncToDB();
            
            // If table cleared due to 0 items, just close
            if (!oid && items.length === 0) {
                onUpdate();
                onClose();
                return;
            }
            if (!oid) return notify("Could not save order", "error");

            await api.post('/orders/settle', { tableId: table.id, orderId: oid, customer_name: customer, customer_phone: phone });
            const finalRes = await api.get(`/orders/details/${oid}`);
            
            await api.post('/print/bill', {
                table,
                items: finalRes.data,
                customer: customer,
                bill_no: oid,
                total_amount: stats.grandTotal 
            });

            notify("Bill Settled");
            onUpdate();
            onClose();
        } catch(e) { console.error(e); notify("Settle Error", "error"); }
    };

    const handleEscape = async () => {
        if (isSyncing.current) return;
        
        try { 
            // This triggers syncToDB -> which triggers Void if empty
            await syncToDB(); 
            notify("Saved"); 
            onUpdate(); 
            onClose(); 
        } catch (e) {
            // Keep open on error
        }
    };

    // --- RENDER HELPERS ---
    const displayedItems = useMemo(() => activeTab === 'new' ? items.filter(i => i.initialDBQty === 0) : items, [items, activeTab]);
    const stats = useMemo(() => {
        let total = 0, runningCount = 0, newCount = 0;
        items.forEach(i => { total += (i.price * i.dbQty); if (i.initialDBQty > 0) runningCount++; else newCount++; });
        return { grandTotal: Math.round(total), runningCount, newCount, totalItems: items.length };
    }, [items]);

    useEffect(() => { if (scrollRef.current) setTimeout(() => scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 0); }, [items.length, activeTab]);

    useEffect(() => {
        const handleKeys = async (e) => {
            if (isSyncing.current) return;
            if (e.key === 'Insert') { e.preventDefault(); handlePrintKOT(); }
            if (e.key === 'End') { e.preventDefault(); handleSettle(); }
            if (e.key === 'Delete') { e.preventDefault(); handleDeleteKey(); } 
            if (e.key === 'Escape' && !showNoteModal) { e.preventDefault(); handleEscape(); }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [items, code, showNoteModal]); 

    return (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 md:p-4" onClick={() => !isSyncing.current && handleEscape()}>
            <div className="bg-white w-full max-w-7xl h-full md:h-[92vh] md:rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex-1 flex flex-col border-r border-slate-100 bg-slate-50/50">
                    <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">TABLE {table.table_no}</h2>
                        <div className="flex gap-6 text-right">
                            <div><span className="text-[10px] font-bold text-slate-400 uppercase">Items</span><div className="text-2xl font-black text-slate-700">{stats.totalItems}</div></div>
                            <div className="border-l pl-6"><span className="text-[10px] font-bold text-slate-400 uppercase">Total</span><div className="text-4xl font-black text-blue-600">₹{stats.grandTotal}</div></div>
                        </div>
                    </div>
                    <div className="flex bg-white border-b shrink-0">
                        <button onClick={() => setActiveTab('new')} className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'new' ? 'text-orange-600 border-b-4 border-orange-600 bg-orange-50/30' : 'text-slate-400 hover:bg-slate-50'}`}>New ({stats.newCount})</button>
                        <button onClick={() => setActiveTab('running')} disabled={stats.runningCount === 0 && stats.newCount === 0} className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'running' ? 'text-blue-600 border-b-4 border-blue-600 bg-blue-50/30' : 'text-slate-400 hover:bg-slate-50'} disabled:bg-slate-100 disabled:text-slate-300`}>Running ({stats.totalItems})</button>
                    </div>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
                        <table className="w-full text-left text-sm border-separate border-spacing-y-1">
                            <thead className="text-[10px] uppercase font-bold text-slate-400"><tr><th className="pl-4 w-16">Code</th><th>Item</th><th className="text-center">Qty</th><th className="text-right">Rate</th><th className="pr-4 text-right">Total</th><th></th></tr></thead>
                            <tbody>
                                {displayedItems.map((i) => {
                                    const isUnsaved = i.initialDBQty === 0;
                                    return (
                                        <tr key={i.uniqueId} className={`bg-white shadow-sm rounded-xl group ${isUnsaved && activeTab === 'running' ? 'ring-1 ring-green-300 bg-green-50/30' : ''}`}>
                                            <td className="py-2 pl-4 font-black text-slate-400 rounded-l-xl">#{i.item_code}</td>
                                            <td className="py-2 font-bold text-slate-700">{i.name} {i.portion === 'Half' && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded ml-1 font-black">HALF</span>}{i.note && <div className="text-[9px] text-blue-600 font-bold uppercase">{i.note}</div>}{isUnsaved && activeTab === 'running' && <span className="text-[8px] bg-green-100 text-green-700 px-1 ml-2 rounded font-black uppercase tracking-wide">New</span>}</td>
                                            <td className="py-2 text-center font-bold text-slate-800">{i.displayQty}</td>
                                            <td className="py-2 text-right font-medium text-slate-500">₹{Math.round(i.price)}</td>
                                            <td className="py-2 pr-4 text-right font-black text-slate-900">₹{Math.round(i.price * i.dbQty)}</td>
                                            <td className="py-2 pr-4 text-right rounded-r-xl"><button onClick={() => handleRowDelete(i)} className="text-red-300 hover:text-red-500 p-2"><Trash2 size={16}/></button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-6 bg-white border-t flex gap-4 shrink-0">
                        <button onClick={handlePrintKOT} className="flex-1 py-4 bg-slate-900 text-white font-black uppercase rounded-xl hover:bg-black transition-all shadow-lg text-xs flex items-center justify-center gap-2 active:scale-95"><Printer size={16} /> KOT (Ins)</button>
                        <button onClick={handleSettle} className="flex-1 py-4 bg-blue-600 text-white font-black uppercase rounded-xl hover:bg-blue-700 transition-all shadow-lg text-xs flex items-center justify-center gap-2 active:scale-95"><CheckCircle2 size={16} /> Settle (End)</button>
                    </div>
                </div>
                <div className="w-full md:w-80 bg-white p-6 flex flex-col z-10 shadow-xl overflow-y-auto relative shrink-0">
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={handleVoid} className="text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 px-2 py-1 rounded">Void Table</button>
                        <button onClick={handleEscape} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors"><X size={20} /></button>
                    </div>
                    <div className="space-y-4 flex-1">
                        <div className="grid grid-cols-1 gap-2">
                            <input className="w-full border-b py-2 outline-none font-bold text-sm focus:border-blue-500 bg-transparent" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Guest Name" />
                            <input className="w-full border-b py-2 outline-none font-bold text-sm focus:border-blue-500 bg-transparent" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone Number" />
                        </div>
                        <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-inner mt-4">
                            <label className="text-[10px] font-bold uppercase text-blue-500 tracking-widest block mb-1">Item Code</label>
                            <input ref={codeRef} className="w-full bg-white border rounded-xl px-4 py-3 text-xl font-black outline-none focus:border-blue-500 uppercase" value={code} onChange={e => setCode(e.target.value)} onKeyDown={lookupItem} placeholder="000" />
                            {identifiedItem && (
                                <div className="mt-4 space-y-3 animate-in slide-in-from-top-2">
                                    <div className="text-xs font-bold text-blue-800 bg-blue-100/50 p-3 rounded-xl flex justify-between"><span>{identifiedItem.name}</span><span>₹{Math.round(table.is_ac ? identifiedItem.price_ac : identifiedItem.price_non_ac)}</span></div>
                                    <div className="flex gap-2">
                                        {identifiedItem.is_half_available && <button onClick={() => setIsHalf(!isHalf)} className={`flex-1 p-2 rounded-lg border text-[10px] font-black uppercase ${isHalf ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white text-slate-500'}`}>Half</button>}
                                        {identifiedItem.is_jain_available && <button onClick={() => setIsJain(!isJain)} className={`flex-1 p-2 rounded-lg border text-[10px] font-black uppercase ${isJain ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white text-slate-500'}`}>Jain</button>}
                                    </div>
                                    <div className="space-y-2">
                                        <button type="button" onClick={() => setShowNoteModal(true)} className="w-full py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 flex items-center justify-center gap-2"><MessageSquare size={12} /> {note ? 'Edit Note' : 'Add Note'}</button>
                                        {(note || isJain) && <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg text-[10px] font-bold text-blue-700 uppercase animate-pulse">Active: {isJain ? 'JAIN' : ''}{isJain && note ? ', ' : ''}{note}</div>}
                                    </div>
                                    <input ref={qtyRef} type="text" className="w-full bg-white border rounded-xl px-4 py-3 text-xl font-black text-center outline-none focus:border-blue-500" value={qty} onChange={e => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddToCart(e); } }} />
                                    <button onClick={handleAddToCart} className="w-full py-4 bg-slate-900 text-white font-black rounded-xl uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center">Add to Cart</button>
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={handleDeleteKey} className="w-full py-3 bg-red-50 text-red-500 text-[10px] font-black uppercase rounded-xl border border-red-100 hover:bg-red-100 transition-colors">Delete Item (Del)</button>
                    </div>
                    {showNoteModal && (
                        <div className="absolute inset-0 bg-white z-20 flex flex-col p-6 animate-in fade-in">
                            <div className="flex justify-between items-center mb-4"><h3 className="font-black text-lg uppercase tracking-tighter">Instructions</h3><button onClick={() => setShowNoteModal(false)} className="p-1"><X size={20} /></button></div>
                            <div className="flex flex-wrap gap-2 mb-4">
                                {notePresets.map(p => (<button key={p.id || Math.random()} type="button" onClick={() => setNote(note ? `${note}, ${p.name}` : p.name)} className={`px-3 py-2 rounded border text-xs font-bold transition-colors ${note.includes(p.name) ? 'bg-blue-600 text-white border-blue-700' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>{p.name}</button>))}
                                <button type="button" onClick={() => setNote("")} className="px-3 py-2 rounded border border-red-200 text-red-500 text-xs font-bold">Clear</button>
                            </div>
                            <textarea value={note} onChange={e => setNote(e.target.value)} className="w-full flex-1 border rounded-xl p-3 text-sm font-bold bg-slate-50 mb-4 uppercase outline-none focus:ring-2 ring-blue-500/20" placeholder="Type custom message..."></textarea>
                            <button type="button" onClick={() => setShowNoteModal(false)} className="py-3 bg-slate-900 text-white font-bold rounded-xl uppercase shadow-lg">Save & Apply</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const HistoryEditor = ({ bill, menuItems, onClose, notify, onUpdate }) => {
    // --- STATE ---
    const [splitItems, setSplitItems] = useState([]);
    const [snapshot, setSnapshot] = useState([]); // Tracks DB state for UI diffing
    
    // Customer Details
    const [custName, setCustName] = useState(bill.customer_name || "");
    const [custPhone, setCustPhone] = useState(bill.customer_phone || "");
    const [custAddr, setCustAddr] = useState(bill.customer_address || "");

    // Input States
    const [code, setCode] = useState("");
    const [qty, setQty] = useState(1);
    const [identifiedItem, setIdentifiedItem] = useState(null);
    const [isHalf, setIsHalf] = useState(false);

    // Refs
    const codeRef = useRef(null);
    const qtyRef = useRef(null);
    const isSyncing = useRef(false); // Prevents double-clicks

    // --- UTILS ---
    const safeNum = (val) => Number(val) || 0;

    // 🛠️ FIXED: STRICT PRIORITY DECODING LOGIC
    const decodeQuantity = (val) => {
        const n = parseFloat(val);
        
        // 1. Priority: Exact Whole Numbers are ALWAYS Fulls (Fixes 3.0 -> 5 Halves bug)
        if (Math.abs(n - Math.round(n)) < 0.001) {
            return { fulls: Math.round(n), halves: 0 };
        }

        // 2. Standard "Mixed" case (e.g. 1.6 => 1 Full + 1 Half)
        // We check if the decimal part is roughly 0.6
        const decimal = n % 1; 
        if (Math.abs(decimal - 0.6) < 0.05) {
             return { fulls: Math.floor(n), halves: 1 };
        }

        // 3. "Pure Halves" case (e.g. 1.2 => 2 Halves)
        // Only if it's NOT an integer and NOT 1.6, we check ratio
        const ratio = n / 0.6;
        if (Math.abs(ratio - Math.round(ratio)) < 0.05) {
            return { fulls: 0, halves: Math.round(ratio) };
        }
        
        // Default fallback
        return { fulls: n, halves: 0 };
    };

    // --- 1. LOAD DATA (RUNS ONCE) ---
    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            try {
                const res = await api.get(`/orders/details/${bill.id}`);
                
                if (!isMounted) return;

                let processed = [];
                res.data.forEach(item => {
                    const { fulls, halves } = decodeQuantity(item.quantity);
                    
                    if (fulls > 0) processed.push({
                        ...item, 
                        quantity: fulls, 
                        variant: 'Full',
                        price_at_time: safeNum(item.price_at_time),
                        uniqueId: Math.random().toString(36).substr(2, 9),
                        dbId: item.id
                    });

                    if (halves > 0) processed.push({
                        ...item, 
                        quantity: halves, 
                        variant: 'Half',
                        price_at_time: Math.ceil(safeNum(item.price_at_time) * 0.6),
                        uniqueId: Math.random().toString(36).substr(2, 9),
                        dbId: item.id
                    });
                });

                setSplitItems(processed);
                setSnapshot(JSON.parse(JSON.stringify(processed))); 
                
            } catch (e) { 
                console.error(e);
                notify("Failed to load bill data", "error"); 
                onClose(); 
            }
        };

        load();
        setTimeout(() => codeRef.current?.focus(), 500);
        return () => { isMounted = false; };
    }, [bill.id]); 

    // --- 2. SYNC TO DB (Reusable Save Engine) ---
    const syncToDB = async () => {
        if (isSyncing.current) return false;
        isSyncing.current = true;

        try {
            // Re-encode quantities for DB
            const groups = {};

            splitItems.forEach(i => {
                const masterItemId = i.item_id || i.id; 
                const key = `${masterItemId}_${i.special_instruction || ''}`;

                if(!groups[key]) {
                    groups[key] = {
                        item_id: masterItemId, 
                        quantity: 0,
                        price_at_time: i.variant === 'Half' ? Math.round(i.price_at_time / 0.6) : i.price_at_time,
                        special_instruction: i.special_instruction || ''
                    };
                }

                // Add quantity (Half = 0.6)
                const contribution = i.variant === 'Half' ? (i.quantity * 0.6) : i.quantity;
                groups[key].quantity += contribution;
            });

            const finalItems = Object.values(groups);

            // Send to Backend (Handles Deletion if finalItems is empty)
            await api.put(`/orders/${bill.id}`, { 
                customer_name: custName, 
                customer_phone: custPhone, 
                customer_address: custAddr, 
                items: finalItems 
            });

            setSnapshot(JSON.parse(JSON.stringify(splitItems)));
            return true;

        } catch (e) {
            console.error(e);
            notify("Save Failed: " + (e.response?.data?.message || "Check Server"), "error");
            return false;
        } finally {
            isSyncing.current = false;
        }
    };

    // --- HANDLERS ---

    const handleSaveAndClose = async () => {
        const success = await syncToDB();
        if (success) {
            const msg = splitItems.length === 0 ? "Bill Deleted" : "Bill Updated";
            notify(msg, "success");
            onUpdate(); // Refresh Parent
            onClose();  // Close Modal
        }
    };

    const handleReprint = async () => {
        // 1. Guard: If empty, don't print, just save (which deletes it)
        if (splitItems.length === 0) {
            await handleSaveAndClose();
            return;
        }

        // 2. Auto-Save first
        const saved = await syncToDB();
        if (!saved) return; 

        // 3. Then Print
        try {
            const printItems = splitItems.map(i => ({
                 ...i,
                 quantity: i.variant === 'Half' ? (i.quantity * 0.6) : i.quantity,
                 price_at_time: i.variant === 'Half' ? Math.round(i.price_at_time / 0.6) : i.price_at_time
            }));

            await api.post('/print/bill', {
                restaurant_info: { name: "HOTEL UMIYA", address: "Highway Road", phone: "9876543210" }, 
                table: { table_no: bill.table_no, is_ac: false },
                items: printItems,
                customer: custName,
                phone: custPhone,
                bill_no: bill.id,
                total_amount: total,
                is_reprint: true
            });

            notify("Saved & Sent to Printer", "success");
            onClose(); // Auto Close after Print

        } catch (e) {
            notify("Print Error", "error");
        }
    };

    const handleLookup = (e) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            const cleanCode = String(code).trim().toLowerCase();
            const item = menuItems.find(m => String(m.item_code).trim().toLowerCase() === cleanCode);
            
            if(item) {
                setIdentifiedItem(item);
                setQty(1); 
                setIsHalf(false);
                setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, 50);
            } else {
                notify("Item not found", "error");
            }
        }
        if(e.key === 'Delete') { e.preventDefault(); deleteByCode(); }
    };

    const handleModifyItem = () => {
        if(!identifiedItem) return;
        const inputQty = Number(qty);

        setSplitItems(prev => {
            let copy = [...prev];
            const itemCode = identifiedItem.item_code;

            // 1. Calculate current total
            let currentTotalFloat = 0;
            copy.filter(i => i.item_code === itemCode).forEach(i => {
                currentTotalFloat += (i.variant === 'Half' ? (i.quantity * 0.6) : i.quantity);
            });

            // 2. Adjust total
            const steps = Math.abs(inputQty);
            for(let s=0; s<steps; s++) {
                const { halves } = decodeQuantity(currentTotalFloat); // Use fixed decode
                if (isHalf) {
                    if (inputQty > 0) currentTotalFloat += 0.6;
                    else currentTotalFloat -= (halves > 0 ? 0.6 : 0.4); 
                } else {
                    currentTotalFloat += (inputQty > 0 ? 1.0 : -1.0);
                }
            }

            // 3. Rebuild list
            let otherItems = copy.filter(i => i.item_code !== itemCode);
            
            if (currentTotalFloat > 0.1) {
                const { fulls, halves } = decodeQuantity(currentTotalFloat); // Use fixed decode
                
                if (fulls > 0) otherItems.push({
                    ...identifiedItem, 
                    item_id: identifiedItem.id, 
                    quantity: fulls, 
                    variant: 'Full',
                    price_at_time: safeNum(identifiedItem.price_non_ac),
                    uniqueId: Math.random().toString(36).substr(2, 9),
                    isNew: true
                });
                
                if (halves > 0) otherItems.push({
                    ...identifiedItem, 
                    item_id: identifiedItem.id, 
                    quantity: halves, 
                    variant: 'Half',
                    price_at_time: Math.ceil(safeNum(identifiedItem.price_non_ac) * 0.6),
                    uniqueId: Math.random().toString(36).substr(2, 9),
                    isNew: true
                });
            }
            return otherItems;
        });

        notify(`Updated ${identifiedItem.name}`, "success");
        setCode(""); setQty(1); setIdentifiedItem(null); setIsHalf(false);
        codeRef.current?.focus();
    };

    const deleteByCode = () => {
        if(!code) return;
        setSplitItems(prev => prev.filter(i => i.item_code !== code));
        notify("Item Removed", "success");
        setCode("");
        codeRef.current?.focus();
    };

    const removeItem = (idx) => setSplitItems(prev => prev.filter((_, i) => i !== idx));

    const total = useMemo(() => splitItems.reduce((acc, i) => acc + (i.quantity * i.price_at_time), 0), [splitItems]);
    
    // Dirty Check
    const isDirty = useMemo(() => {
        if (splitItems.length !== snapshot.length) return true;
        return splitItems.some(i => i.isNew) || (JSON.stringify(splitItems) !== JSON.stringify(snapshot));
    }, [splitItems, snapshot]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeys = (e) => {
            if(isSyncing.current) return;
            if(e.key === 'Escape') onClose();
            if(e.key === 'End') handleSaveAndClose();
            if(e.key === 'Insert') handleReprint();
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [handleSaveAndClose, handleReprint, onClose]);

    return (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white w-full max-w-7xl h-full md:h-[90vh] md:rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-slate-200" onClick={e=>e.stopPropagation()}>
                
                {/* LEFT SIDE: Items Table */}
                <div className="w-full md:w-2/3 flex flex-col border-r border-slate-100 bg-slate-50/50">
                    <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 tracking-tight">EDIT BILL #{bill.id}</h2>
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mt-1">Table {bill.table_no}</p>
                        </div>
                        <div className="flex gap-8 text-right">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Items</span>
                                <div className="text-4xl font-black text-slate-700 leading-none">{splitItems.length}</div>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total</span>
                                <div className="text-4xl font-black text-blue-600 leading-none">₹{total.toFixed(0)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                            <thead className="text-[10px] uppercase font-bold text-slate-400"><tr><th className="pl-4 pb-2">Item Name</th><th className="pb-2 text-center">Qty</th><th className="text-right pb-2">Rate</th><th className="pr-4 pb-2 text-right">Total</th><th className="pb-2 text-right"></th></tr></thead>
                            <tbody>
                                {splitItems.map((item, idx) => {
                                    const inSnapshot = snapshot.some(s => s.uniqueId === item.uniqueId);
                                    let rowClass = 'bg-white';
                                    if (!inSnapshot) rowClass = 'bg-green-50 ring-1 ring-green-300';
                                    else if (item.variant === 'Half') rowClass = 'bg-amber-50 border border-amber-100';

                                    return (
                                        <tr key={item.uniqueId || idx} className={`shadow-sm rounded-xl transition-all ${rowClass}`}>
                                            <td className="py-4 pl-4 font-bold text-slate-700 rounded-l-xl">
                                                {item.name} 
                                                {item.variant==='Half' && <span className="bg-amber-200 text-amber-800 text-[9px] px-1 rounded font-bold ml-1">HALF</span>}
                                                {!inSnapshot && <span className="ml-2 bg-green-600 text-white text-[8px] px-1 rounded uppercase tracking-wide">New</span>}
                                            </td>
                                            <td className="py-4 text-center font-bold">{item.quantity}</td>
                                            <td className="py-4 text-right font-medium text-slate-500">₹{safeNum(item.price_at_time).toFixed(0)}</td>
                                            <td className="py-4 pr-4 text-right font-black text-slate-900">₹{(item.quantity * item.price_at_time).toFixed(0)}</td>
                                            <td className="py-4 pr-4 text-right rounded-r-xl"><button onClick={()=>removeItem(idx)} className="text-red-300 hover:text-red-500"><Trash2 size={16}/></button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-6 bg-white border-t border-slate-200 flex gap-4 shrink-0">
                        <button 
                            onClick={handleReprint} 
                            className="flex-1 py-4 bg-slate-900 text-white font-black uppercase rounded-xl hover:bg-black transition-all shadow-lg text-xs tracking-widest flex items-center justify-center gap-2 active:scale-95"
                        >
                            <Printer size={16}/> Save & Reprint (Ins)
                        </button>
                        <button 
                            onClick={handleSaveAndClose} 
                            className={`flex-1 py-4 font-black uppercase rounded-xl transition-all shadow-lg text-xs tracking-widest flex items-center justify-center gap-2 active:scale-95 ${isDirty ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200' : 'bg-slate-100 text-slate-400 shadow-none'}`}
                        >
                            <CheckCircle2 size={16}/> Save Changes (End)
                        </button>
                    </div>
                </div>

                {/* RIGHT SIDE: Inputs */}
                <div className="w-full md:w-1/3 bg-white p-6 md:p-8 flex flex-col z-10 shadow-xl overflow-y-auto relative">
                     <div className="flex justify-end mb-4"><button onClick={onClose} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full"><X size={24}/></button></div>
                     
                     <div className="space-y-4 flex-1">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2"><input className="w-full border-b border-slate-200 py-2 outline-none font-bold text-sm focus:border-blue-500 bg-transparent" value={custName} onChange={e => setCustName(e.target.value)} placeholder="M/s (Guest Name)" /></div>
                            <div><input className="w-full border-b border-slate-200 py-2 outline-none text-xs focus:border-blue-500 bg-transparent" value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="Phone" /></div>
                            <div><input className="w-full border-b border-slate-200 py-2 outline-none text-xs focus:border-blue-500 bg-transparent" value={custAddr} onChange={e => setCustAddr(e.target.value)} placeholder="Address" /></div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-inner space-y-4 mt-4 relative">
                           <h4 className="font-bold text-xs uppercase text-slate-400 tracking-widest">Add / Reduce Item</h4>
                           <div><label className="text-[10px] font-bold uppercase text-blue-500 tracking-widest block mb-1">Item Code</label><input ref={codeRef} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xl font-black outline-none focus:border-blue-500 uppercase" value={code} onChange={e => setCode(e.target.value)} onKeyDown={handleLookup} placeholder="000" /></div>

                           {identifiedItem && (
                               <div className="animate-in slide-in-from-top-2 fade-in">
                                   <div className="text-xs font-bold text-blue-800 bg-blue-100 p-3 rounded-xl flex justify-between mb-3"><span>{identifiedItem.name}</span><span>₹{safeNum(identifiedItem.price_non_ac).toFixed(0)}</span></div>
                                   <div className="flex gap-2 mb-3">
                                       {identifiedItem.is_half_available && <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border cursor-pointer select-none transition-colors ${isHalf ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-500'}`}><input type="checkbox" checked={isHalf} onChange={e => setIsHalf(e.target.checked)} className="hidden" /><span className="text-[10px] font-black uppercase">Make Half</span></label>}
                                   </div>
                                   <div><label className="text-[10px] font-bold uppercase text-blue-500 tracking-widest block mb-1">Quantity (+/-)</label><input ref={qtyRef} type="number" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xl font-black outline-none focus:border-blue-500 text-center" value={qty} onChange={e => setQty(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') handleModifyItem(); }} /></div>
                               </div>
                           )}
                           <div className="grid grid-cols-2 gap-2 mt-2">
                               <button type="button" onClick={handleModifyItem} className="py-3 bg-slate-900 text-white font-black rounded-xl shadow-lg hover:bg-black text-[10px] uppercase tracking-widest">Update (Ent)</button>
                               <button type="button" onClick={deleteByCode} className="py-3 bg-red-100 text-red-600 font-black rounded-xl hover:bg-red-200 text-[10px] uppercase tracking-widest">Delete (Del)</button>
                           </div>
                        </div>
                     </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN DASHBOARD COMPONENT ---
const ManagerDashboard = () => {
  // STATE
  const [activeTab, setActiveTab] = useState('floor');
  const [activeOrder, setActiveOrder] = useState(null);
  const [viewHistoryBill, setViewHistoryBill] = useState(null);
  const [printData, setPrintData] = useState(null);

  const [tables, setTables] = useState([]);
  const [menu, setMenu] = useState([]);
  const [history, setHistory] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editingCategory, setEditingCategory] = useState(null);
  const [presets, setPresets] = useState([]);
  const [waitingQueue, setWaitingQueue] = useState([]);

  const [floorInput, setFloorInput] = useState("");
  const floorInputRef = useRef(null);
  const [modalForm, setModalForm] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // History Filters
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyRange, setHistoryRange] = useState({ start: '', end: '' });

  const [notification, setNotification] = useState({ msg: '', type: '' });
  const [confirmModal, setConfirmModal] = useState({ show: false });
  const [menuFilter, setMenuFilter] = useState('All');

  // Helpers
  const notify = (msg, type = 'success') => setNotification({ msg, type });
  const closeNotif = () => setNotification({ msg: '', type: '' });

  // FETCH DATA
  const fetchData = useCallback(async () => {
    try {
      const [t, m, h, w, c, q, p] = await Promise.all([
          api.get('/orders/tables'),
          api.get('/orders/menu'),
          api.get('/orders/history'),
          api.get('/orders/waiters'),
          api.get('/orders/categories'),
          api.get('/orders/waiting-queue'),
          api.get('/orders/presets')
      ]);
      // Prevent duplicate tables from rendering
      const uniqueTables = Array.from(new Map(t.data.map(table => [table.id, table])).values());
      setTables(uniqueTables.sort((a,b) => a.table_no.localeCompare(b.table_no, undefined, { numeric: true })));

      setMenu(m.data);
      setHistory(h.data);
      setWaiters(w.data);
      setCategories(c.data);
      setWaitingQueue(q.data);
      setPresets(p.data);
    } catch (e) { console.error(e); notify("Backend Offline", "error"); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Shortcuts & Focus
  useEffect(() => { if(activeTab === 'floor' && !activeOrder && !modalForm) floorInputRef.current?.focus(); }, [activeTab, activeOrder, modalForm]);
  useEffect(() => {
    const handleGlobalKeys = (e) => {
      // Don't switch tabs if a modal or order is open
      if (activeOrder || viewHistoryBill || modalForm || confirmModal.show) return;

      if (e.altKey) {
        if (e.key === '1') setActiveTab('floor');
        if (e.key === '2') setActiveTab('history');
        if (e.key === '3') setActiveTab('menu');
        if (e.key === '4') setActiveTab('waiters');
        if (e.key === '5') setActiveTab('queue'); 
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [activeTab, activeOrder, viewHistoryBill, modalForm, confirmModal]);

  // Handlers
  const handleLogout = () => { localStorage.removeItem('token'); window.location.href = '/login'; };
  const openTable = async (table) => { try { let items = []; if (table.active_order_id) { const res = await api.get(`/orders/details/${table.active_order_id}`); items = res.data; } setActiveOrder({ ...table, items: items || [] }); setFloorInput(""); } catch (e) { notify("Failed to open table", "error"); } };
  const handleFloorCommand = (e) => { if (e.key === 'Enter') { const t = tables.find(tbl => String(tbl.table_no) === String(floorInput)); if (t) openTable(t); else notify("Table not found!", "error"); setFloorInput(""); } };
  const handleAddTable = () => setModalForm({ type: 'table', data: {} });
  const handleRemoveFromQueue = (item) => {
    setConfirmModal({
        show: true,
        title: 'Seat Customer?',
        message: `Are you removing "${item.customer_name}" from the queue? This assumes they have been seated.`,
        onConfirm: async () => {
            try {
                await api.delete(`/orders/waiting-queue/${item.id}`);
                fetchData();
                notify("Queue updated", "success");
            } catch (err) {
                notify("Failed to remove from queue", "error");
            }
            setConfirmModal({ show: false });
        },
        onCancel: () => setConfirmModal({ show: false })
    });
  };
  // Bulk Delete Handler
  const handleBulkDeleteHistory = async () => {
    if (!historyRange.start || !historyRange.end) return notify("Select both Start and End dates", "error");
    setConfirmModal({
        show: true,
        title: '⚠️ Bulk Delete History',
        message: `Permanently delete ALL bills from ${historyRange.start} to ${historyRange.end}? This cannot be undone.`,
        onConfirm: async () => {
            try {
                const res = await api.post('/orders/history/delete-range', { startDate: historyRange.start, endDate: historyRange.end });
                notify(res.data.message || "History deleted successfully");
                fetchData();
            } catch (err) { notify(err.response?.data?.message || "Bulk delete failed", "error"); }
            setConfirmModal({ show: false });
        },
        onCancel: () => setConfirmModal({ show: false })
    });
  };

  // SUB-COMPONENTS FOR TABS
  const MenuManager = () => {
      // Dynamic tabs combining 'All' with fetched categories
      const tabs = [{ id: 'All', name: 'All Items' }, ...categories];

      const displayMenu = menuFilter === 'All' ? menu : menu.filter(m => m.category === menuFilter);

      return (
         <div className="h-full p-6 flex flex-col bg-slate-100">
            {/* Category Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-4 mb-2">
                {tabs.map(cat => (
                    <button key={cat.id} onClick={() => setMenuFilter(cat.id === 'All' ? 'All' : cat.name)} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${menuFilter === (cat.id==='All'?'All':cat.name) ? 'bg-orange-600 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-200'}`}>
                        {cat.name}
                    </button>
                ))}
            </div>

            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Menu Items ({displayMenu.length})</h2>
                <div className="flex gap-2">
                    <button onClick={() => setModalForm({ type: 'presets', data: {} })} className="px-5 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-slate-50 uppercase tracking-widest">
                        <FileText size={16}/> Manage Notes
                    </button>
                    <button onClick={() => setModalForm({ type: 'categories', data: {} })} className="px-5 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-slate-50 shadow-sm uppercase tracking-widest">
                        <List size={16}/> Manage Categories
                    </button>
                    <button onClick={() => setModalForm({ type: 'menu', data: {} })} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-blue-700 shadow-lg uppercase tracking-widest">
                        <Plus size={16}/> New Item
                    </button>
                </div>
            </div>

            <DataTable
                data={displayMenu}
                searchKeys={['name', 'item_code', 'category']}
                columns={[
                    { header: 'Code', accessor: 'item_code', render: r => <span className="font-mono font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">#{r.item_code}</span> },
                    { header: 'Item Name', accessor: 'name', render: r => <span className="font-bold text-slate-800">{r.name}</span> },
                    { header: 'Category', accessor: 'category', render: r => <span className="text-xs font-bold uppercase text-slate-400">{r.category}</span> },
                    { header: 'Flags', render: r => <div className="flex gap-1">{r.is_half_available && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold">1/2</span>} {r.is_jain_available && <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[9px] font-bold">J</span>}</div> },
                    { header: 'Non-AC', accessor: 'price_non_ac', render: r => `₹${Number(r.price_non_ac).toFixed(0)}` },
                    { header: 'AC Rate', accessor: 'price_ac', render: r => <span className="text-blue-600 font-bold">₹{Number(r.price_ac).toFixed(0)}</span> }
                ]}
                actions={(row) => (
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setModalForm({ type: 'menu', data: row })} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"><Edit3 size={16}/></button>
                        <button type="button" onClick={() => {
                            setConfirmModal({
                                show: true,
                                title: 'Delete Item?',
                                message: `Are you sure you want to delete "${row.name}"? Historical bills will not be affected.`,
                                onConfirm: async () => {
                                    try { await api.delete(`/orders/menu/${row.id}`); fetchData(); notify("Item Deleted", "success"); }
                                    catch (err) { notify("Delete failed", "error"); }
                                    setConfirmModal({ show: false });
                                },
                                onCancel: () => setConfirmModal({ show: false })
                            });
                        }} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100"><Trash2 size={16}/></button>
                    </div>
                )}
            />
         </div>
      );
  };

  const StaffManager = () => (
    <div className="h-full p-6 flex flex-col bg-slate-100">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Waiters & Staff</h2>
            <button onClick={() => setModalForm({ type: 'staff', data: {} })} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-black shadow-lg uppercase tracking-widest"><Plus size={16}/> New Staff</button>
        </div>
        <DataTable
            data={waiters}
            searchKeys={['username']}
            columns={[
                { header: 'ID', accessor: 'id', render: r => <span className="text-slate-400">#{r.id}</span> },
                { header: 'Username', accessor: 'username', render: r => <span className="font-bold flex items-center gap-2"><Users size={16} className="text-slate-400"/> {r.username}</span> },
                { header: 'Role', render: () => 'Waiter' },
                { header: 'Status', render: () => <span className="text-green-600 font-bold text-[10px] uppercase bg-green-100 px-2 py-1 rounded-full">Active</span> }
            ]}
            actions={(row) => (
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setModalForm({ type: 'staff', data: row })} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"><Edit3 size={16}/></button>
                    <button type="button" onClick={() => {
                        setConfirmModal({
                            show: true,
                            title: 'Remove Staff?',
                            message: `Revoke access for ${row.username}?`,
                            onConfirm: async () => {
                                try { await api.delete(`/orders/waiters/${row.id}`); fetchData(); notify("Staff Removed", "success"); }
                                catch (err) { notify("Error removing staff", "error"); }
                                setConfirmModal({ show: false });
                            },
                            onCancel: () => setConfirmModal({ show: false })
                        })
                    }} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100"><Trash2 size={16}/></button>
                </div>
            )}
        />
    </div>
  );

  const HistoryManager = () => {
     const dateFiltered = history.filter(h => h.created_at && h.created_at.substring(0, 10) === historyDate);
     return (
        <div className="h-full p-6 flex flex-col bg-slate-100">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Transactions</h2>
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                        <Calendar className="text-slate-400" size={16}/>
                        <input type="date" value={historyDate} onChange={e => setHistoryDate(e.target.value)} className="outline-none text-sm font-bold text-slate-700 bg-transparent" />
                    </div>
                </div>

                {/* Bulk Delete UI */}
                <div className="flex items-center gap-2 bg-red-50 px-4 py-2 rounded-xl border border-red-100">
                    <span className="text-[10px] font-black uppercase text-red-400 tracking-widest">Delete Range:</span>
                    <input type="date" value={historyRange.start} onChange={e => setHistoryRange({...historyRange, start: e.target.value})} className="text-xs border border-red-200 rounded p-1 bg-white" />
                    <span className="text-[10px] font-bold text-red-300">TO</span>
                    <input type="date" value={historyRange.end} onChange={e => setHistoryRange({...historyRange, end: e.target.value})} className="text-xs border border-red-200 rounded p-1 bg-white" />
                    <button onClick={handleBulkDeleteHistory} className="bg-red-600 text-white p-1.5 rounded-lg hover:bg-red-700 shadow-md ml-2"><Trash2 size={14}/></button>
                </div>
           </div>

           <DataTable
                data={dateFiltered}
                searchKeys={['id', 'table_no', 'customer_name']}
                columns={[
                    { header: 'Bill ID', accessor: 'id', render: r => <span className="font-mono font-bold text-slate-500">#{r.id}</span> },
                    { header: 'Table', accessor: 'table_no', render: r => <span className="font-bold bg-slate-100 px-2 py-1 rounded text-slate-800">T-{r.table_no}</span> },
                    { header: 'Time', accessor: 'created_at', render: r => new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) },
                    { header: 'Customer', accessor: 'customer_name', render: r => <span className="capitalize font-bold text-slate-700">{r.customer_name || 'Walk-in'}</span> },
                    { header: 'Total', accessor: 'total_amount', render: r => <span className="text-emerald-600 font-black">₹{safeNum(r.total_amount).toFixed(0)}</span> }
                ]}
                actions={(row) => (
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setViewHistoryBill(row)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit3 size={16}/></button>
                        <button type="button" onClick={() => {
                            setConfirmModal({
                                show: true,
                                title: 'Delete Bill?',
                                message: `Permanently delete Bill #${row.id}?`,
                                onConfirm: async () => {
                                    try { await api.delete(`/orders/history/${row.id}`); fetchData(); notify("Bill Deleted", "success"); }
                                    catch (err) { notify("Deletion Failed", "error"); }
                                    setConfirmModal({ show: false });
                                },
                                onCancel: () => setConfirmModal({ show: false })
                            })
                        }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                    </div>
                )}
            />
        </div>
     );
  };



  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <Toast message={notification.msg} type={notification.type} onClose={closeNotif} />
      <ConfirmModal isOpen={confirmModal.show} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={confirmModal.onCancel} />
      <ThermalPrinter data={printData} />

      {/* SIDEBAR */}
      <aside className="w-16 lg:w-64 bg-slate-900 text-white flex flex-col shrink-0 z-40 transition-all duration-300 print:hidden">
        <div className="h-20 flex items-center px-4 lg:px-6 border-b border-slate-800">
            <Utensils className="text-orange-500 mr-3 shrink-0" />
            <span className="font-black text-xl tracking-tighter hidden lg:block leading-none">HOTEL<span className="text-orange-500">UMIYA</span><br/><span className="text-[10px] text-slate-500 tracking-widest uppercase font-medium">RMS</span></span>
        </div>
        <nav className="flex-1 py-8 space-y-2 px-3">
           {[ { id: 'floor', label: 'Floor Map', icon: LayoutGrid, key: '1' }, { id: 'history', label: 'History', icon: Receipt, key: '2' }, { id: 'menu', label: 'Menu List', icon: Coffee, key: '3' }, { id: 'waiters', label: 'Staff', icon: Users, key: '4' }, { id: 'queue', label: 'Waiting Queue', icon: Clock, key: '5' } ].map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-200 group ${activeTab === item.id ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}>
                 <item.icon size={20} className="shrink-0" /><span className="hidden lg:block text-xs font-bold uppercase tracking-wider">{item.label}</span>
                 {activeTab !== item.id && <span className="ml-auto text-[9px] font-mono opacity-0 group-hover:opacity-50 hidden lg:block transition-opacity">Alt+{item.key}</span>}
              </button>
           ))}
        </nav>
        <div className="p-4 text-[10px] text-slate-500 text-center uppercase tracking-widest font-bold leading-relaxed">Powered By<br/><span className="text-orange-500">CIPRA INFOTECH</span><br/>All Rights Reserved</div>
        <button className="m-4 p-4 bg-slate-800 rounded-2xl flex items-center justify-center gap-3 hover:bg-red-900/50 hover:text-red-400 text-slate-400 transition-colors group" onClick={handleLogout}><LogOut size={18}/> <span className="hidden lg:block text-xs font-bold uppercase tracking-widest">Logout</span></button>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col relative overflow-hidden print:hidden">
         {activeTab === 'floor' && (
           <div className="flex-1 flex flex-col h-full bg-slate-100 p-4 lg:p-8 overflow-hidden animate-in fade-in">
              <div className="flex flex-col md:flex-row justify-between items-end mb-8 shrink-0 gap-4">
                 <div><h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Live Floor</h1><div className="flex gap-6 mt-3 text-xs font-bold text-slate-500 uppercase tracking-widest"><span className="flex items-center gap-2"><div className="w-3 h-3 bg-white border border-slate-300 rounded-full shadow-sm"></div> Available</span><span className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-500 rounded-full shadow-lg"></div> Occupied</span></div></div>
                 <div className="flex items-center gap-3">
                     <button onClick={handleAddTable} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase shadow-lg hover:bg-slate-900">+ Add Table</button>
                     <div className="flex items-center gap-2 bg-white p-2 pl-4 rounded-2xl shadow-lg border border-slate-100">
                         <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">CMD</span>
                         <input ref={floorInputRef} autoFocus value={floorInput} onChange={e => setFloorInput(e.target.value)} onKeyDown={handleFloorCommand} className="w-20 bg-slate-900 text-white text-center font-bold rounded-lg py-2 outline-none focus:ring-2 focus:ring-orange-500 text-lg" placeholder="#" />
                         <div className="flex flex-col text-[8px] font-bold text-slate-400 uppercase leading-tight mr-2 text-right"><span>Type No.</span><span>Hit Enter</span></div>
                     </div>
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                 <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3 pb-20">
    {tables.map(t => {
        const isOcc = t.status === 'occupied'; // This line is the issue
        return (
            <button key={t.id} onClick={() => openTable(t)} className={`relative h-24 rounded-2xl flex flex-col items-center justify-center border-2 transition-all duration-300 group ${isOcc ? 'bg-orange-500 border-orange-500 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-blue-300 hover:text-blue-500 hover:shadow-md'}`}>
                <span className="text-[8px] font-bold uppercase tracking-widest mb-0.5 opacity-60">Table</span>
                <span className="text-2xl font-black tracking-tighter">{t.table_no}</span>
                {isOcc && <div className="absolute bottom-2 bg-white/20 px-2 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 backdrop-blur-md"><Clock size={10}/> <TableTimer startTime={t.created_at} /></div>}
                             <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 p-1 rounded" onClick={(e)=>{e.stopPropagation(); setConfirmModal({show:true, title:"Delete Table?", message:`Delete Table ${t.table_no}?`, onConfirm: ()=>api.delete(`/orders/tables/${t.id}`).then(()=>{fetchData(); setConfirmModal({show:false})}).catch((err)=>notify(err.response?.data?.message || "Delete failed", "error")), onCancel:()=>setConfirmModal({show:false})})}}><X size={12}/></div>
                          </button>
                       )
                    })}
                 </div>
              </div>
           </div>
         )}
         {activeTab === 'menu' && <MenuManager />}
         {activeTab === 'waiters' && <StaffManager />}
         {activeTab === 'history' && <HistoryManager />}
         {activeTab === 'queue' && <QueueManager tables={tables} />}
      </main>

      {/* OVERLAY MODALS */}
      {activeOrder && <BillingSession table={activeOrder} menuItems={menu} presets={presets} onClose={() => { setActiveOrder(null); fetchData(); }} onUpdate={fetchData} notify={notify} setPrintData={setPrintData} />}
      {viewHistoryBill && !activeOrder && <HistoryEditor bill={viewHistoryBill} menuItems={menu} onClose={() => setViewHistoryBill(null)} setPrintData={setPrintData} notify={notify} onUpdate={fetchData} />}

      {/* UNIVERSAL FORM MODAL */}
      {modalForm && (
         <div className="fixed inset-0 z-[3000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
               
               {/* --- FIXED HEADER LOGIC --- */}
               <h3 className="text-xl font-black uppercase text-slate-800 mb-8 border-b pb-4 tracking-tight flex justify-between items-center">
                   <span>
                       {modalForm.type === 'presets' ? 'Manage Notes' : 
                        modalForm.type === 'categories' ? 'Manage Categories' :
                        (modalForm.data.id ? 'Edit ' : 'Add ') + 
                        (modalForm.type === 'menu' ? 'Item' : 
                         modalForm.type === 'table' ? 'Table' : 
                         modalForm.type === 'waiting' ? 'to Waitlist' : 
                         'Staff') // Default fallback
                       }
                   </span>
                   <button onClick={() => setModalForm(null)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
               </h3>

               {/* 1. CATEGORIES UI */}
               {modalForm.type === 'categories' ? (
                   <div className="space-y-4">
                       <form onSubmit={async (e) => {
                           e.preventDefault();
                           const name = e.target.catName.value;
                           try {
                               if(editingCategory) {
                                   await api.put(`/orders/categories/${editingCategory.id}`, { name });
                                   notify("Category Updated");
                               } else {
                                   await api.post('/orders/categories', { name });
                                   notify("Category Added");
                               }
                               e.target.reset(); setEditingCategory(null); fetchData();
                           }
                           catch(err) { notify("Failed to save category", "error"); }
                       }} className="flex gap-2">
                           <input name="catName" defaultValue={editingCategory?.name || ""} key={editingCategory?.id} className="flex-1 p-3 bg-slate-50 border rounded-xl font-bold" placeholder="Category Name" required />
                           <button type="submit" className="bg-blue-600 text-white px-4 rounded-xl flex items-center justify-center">
                               {editingCategory ? <Save size={18}/> : <Plus size={18}/>}
                           </button>
                       </form>
                       <div className="max-h-60 overflow-y-auto space-y-2 border-t pt-4 custom-scrollbar">
                           {categories.map(c => (
                               <div key={c.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl group">
                                   <span className="font-bold text-slate-700">{c.name}</span>
                                   <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                       <button onClick={() => setEditingCategory(c)} className="text-blue-500 p-2 hover:bg-blue-100 rounded-lg"><Edit3 size={14}/></button>
                                       <button onClick={() => {
                                           setConfirmModal({
                                               show: true, title: "Delete Category?", message: `Delete "${c.name}"?`,
                                               onConfirm: async () => {
                                                   try { await api.delete(`/orders/categories/${c.id}`); fetchData(); notify("Category Deleted"); }
                                                   catch(err) { notify("Error", "error"); }
                                                   setConfirmModal({show:false});
                                               },
                                               onCancel: () => setConfirmModal({show:false})
                                           });
                                       }} className="text-red-500 p-2 hover:bg-red-100 rounded-lg"><Trash2 size={14}/></button>
                                   </div>
                               </div>
                           ))}
                       </div>
                   </div>

               /* 2. PRESETS (NOTES) UI - Fixed: Removed Duplicate Header */
               ) : modalForm.type === 'presets' ? (
                   <div className="space-y-4">
                       {/* REMOVED DUPLICATE H3 HEADER HERE */}
                       
                       {/* Add Note Form */}
                       <form onSubmit={async(e)=>{
                           e.preventDefault();
                           try { await api.post('/orders/presets', {name: e.target.name.value}); fetchData(); e.target.reset(); }
                           catch(e){ notify("Error adding note", "error"); }
                       }} className="flex gap-2">
                           <input name="name" className="flex-1 p-3 border rounded-xl font-bold text-sm outline-none" placeholder="New Note (e.g. Extra Spicy)" required autoFocus/>
                           <button className="bg-blue-600 text-white px-4 rounded-xl hover:bg-blue-700"><Plus size={20}/></button>
                       </form>

                       {/* Notes List */}
                       <div className="max-h-60 overflow-y-auto space-y-2 border-t pt-2 custom-scrollbar">
                           {presets.map(p => (
                               <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl group hover:bg-slate-100">
                                   <span className="font-bold text-slate-700">{p.name}</span>
                                   <button onClick={async()=>{ 
                                       if(window.confirm("Delete note?")) {
                                           await api.delete(`/orders/presets/${p.id}`); 
                                           fetchData();
                                       }
                                   }} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-2">
                                       <Trash2 size={16}/>
                                   </button>
                               </div>
                           ))}
                           {presets.length === 0 && <div className="text-center text-slate-400 text-xs py-4">No custom notes added yet.</div>}
                       </div>
                       <button onClick={()=>setModalForm(null)} className="w-full py-3 bg-slate-100 rounded-xl font-bold text-slate-500 mt-2 uppercase text-xs hover:bg-slate-200">Close</button>
                   </div>

               /* 3. GENERIC FORM (Menu, Staff, Tables, Queue) */
               ) : (
                   <form onSubmit={async (e) => {
                       e.preventDefault();
                       const payload = new FormData(e.target);
                       if(modalForm.type === 'menu') {
                           if(!payload.has('is_half_available')) payload.append('is_half_available', 'false');
                           if(!payload.has('is_jain_available')) payload.append('is_jain_available', 'false');
                       }
                       if(modalForm.type === 'table' && !payload.has('is_ac')) payload.append('is_ac', 'false');

                       const data = Object.fromEntries(payload.entries());
                       let endpoint = modalForm.type === 'menu' ? '/orders/menu' : modalForm.type === 'staff' ? '/orders/waiters' : modalForm.type === 'waiting' ? '/orders/waiting-queue' : '/orders/tables';
                       const method = modalForm.data.id ? 'put' : 'post';
                       const url = modalForm.data.id ? `${endpoint}/${modalForm.data.id}` : endpoint;

                       try { await api[method](url, data); setModalForm(null); fetchData(); notify("Saved Successfully", "success"); }
                       catch (err) { notify(err.response?.data?.message || "Error saving data", "error"); }
                   }} className="space-y-4">
                       
                       {modalForm.type === 'menu' && (
                           <>
                           <input name="name" defaultValue={modalForm.data.name} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" placeholder="Item Name" required />
                           <div className="grid grid-cols-2 gap-4">
                               <input name="item_code" defaultValue={modalForm.data.item_code} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" placeholder="Code" required />
                               <div className="relative">
                                   <select name="category_id" defaultValue={modalForm.data.category_id || categories.find(c => c.name === modalForm.data.category)?.id || ""} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none appearance-none" required>
                                       <option value="" disabled>Select Category</option>
                                       {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                   </select>
                                   <div className="absolute right-3 top-3 text-slate-400 pointer-events-none"><FolderCog size={16}/></div>
                               </div>
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                               <input name="price_non_ac" type="number" defaultValue={modalForm.data.price_non_ac} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" placeholder="Non-AC Rate" required />
                               <input name="price_ac" type="number" defaultValue={modalForm.data.price_ac} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" placeholder="AC Rate" required />
                           </div>
                           <div className="flex gap-4 pt-2">
                               <label className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer flex-1"><input type="checkbox" name="is_half_available" value="true" defaultChecked={modalForm.data.is_half_available} className="w-5 h-5 accent-slate-900"/><span className="text-xs font-bold text-slate-600">Half Available?</span></label>
                               <label className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer flex-1"><input type="checkbox" name="is_jain_available" value="true" defaultChecked={modalForm.data.is_jain_available} className="w-5 h-5 accent-green-600"/><span className="text-xs font-bold text-slate-600">Jain / Swami?</span></label>
                           </div>
                           </>
                       )}

                       {modalForm.type === 'waiting' && (
                           <div className="space-y-4" key={modalForm.data.id || 'new'}>
                               <div><label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block mb-1">Guest Name</label><input name="customer_name" defaultValue={modalForm.data.customer_name || ''} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 bg-white" placeholder="Enter Name" required autoFocus /></div>
                               <div><label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block mb-1">Pax Count</label><input name="person_count" type="number" defaultValue={modalForm.data.person_count || ''} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 bg-white" placeholder="e.g. 4" required /></div>
                               <div><label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block mb-2">Seating Preference</label><div className="flex gap-4 p-1">{['None', 'AC', 'Non-AC'].map(pref => (<label key={pref} className="flex-1 cursor-pointer group"><input type="radio" name="preference" value={pref} defaultChecked={(modalForm.data.preference || 'None') === pref} className="peer hidden" /><div className="py-2 text-center text-xs font-bold rounded-lg border border-slate-200 text-slate-500 peer-checked:bg-slate-800 peer-checked:text-white transition-all">{pref}</div></label>))}</div></div>
                           </div>
                       )}

                       {modalForm.type === 'staff' && (<><input name="username" defaultValue={modalForm.data.username} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" placeholder="Username" required /><div className="relative"><input name="password" type={showPassword ? "text" : "password"} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" placeholder={modalForm.data.id ? "New Password" : "Password"} required={!modalForm.data.id} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400">{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></>)}
                       
                       {modalForm.type === 'table' && (<><input name="table_no" defaultValue={modalForm.data.table_no} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" placeholder="Table Number (e.g. 10)" required /><div className="flex items-center gap-2 mt-2"><input type="checkbox" name="is_ac" value="true" defaultChecked={modalForm.data.is_ac} className="w-5 h-5 accent-blue-600" /><label className="font-bold text-sm">Is AC Table?</label></div></>)}

                       <div className="grid grid-cols-2 gap-4 pt-6">
                           <button type="button" onClick={() => setModalForm(null)} className="py-4 font-bold text-slate-400 uppercase text-xs rounded-xl hover:bg-slate-50">Cancel</button>
                           <button type="submit" className="py-4 bg-slate-900 text-white rounded-xl font-black uppercase text-xs shadow-xl flex items-center justify-center gap-2"><Save size={16}/> Save Changes</button>
                       </div>
                   </form>
               )}
            </div>
         </div>
      )}

      {/* GLOBAL STYLES FOR SCROLLBAR & PRINT */}
      <style>{`
        @media print {
            @page { margin: 2mm; size: auto; }
            body * { visibility: hidden; height: 0; overflow: hidden; }
            #thermal-print-area, #thermal-print-area * { visibility: visible; height: auto; overflow: visible; }
            #thermal-print-area { position: absolute; left: 0; top: 0; width: 78mm; background: white; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default ManagerDashboard;