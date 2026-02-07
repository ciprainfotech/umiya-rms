import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  LogOut, Trash2, Plus, Minus, UtensilsCrossed, 
  ChevronLeft, CheckCircle2, AlertCircle, X, 
  MessageSquare, Save, Printer, Loader2, ShoppingCart, Box, Wind,
  Delete, FileText, Cloud
} from 'lucide-react';
import api from '../api/axios';

// --- UTILITY FUNCTIONS ---
const safeNum = (v) => {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
};

// Robust decoder for DB Quantity -> UI Portions
const decodeQuantity = (rawQty) => {
    const n = parseFloat(rawQty);
    // Fix floating point precision issues (e.g. 1.599999)
    const q = Math.round(n * 10) / 10;
    
    const whole = Math.floor(q);
    const decimal = Math.round((q - whole) * 10) / 10;

    // Case: X.0 -> X Fulls
    if (decimal === 0) return { fulls: whole, halves: 0 };
    
    // Case: X.6 -> X Fulls + 1 Half
    if (decimal === 0.6) return { fulls: whole, halves: 1 };
    
    // Case: Pure Halves (0.6, 1.2, 1.8 etc) - Rare but possible if only halves added
    // Check if divisible by 0.6
    const ratio = q / 0.6;
    if (Math.abs(ratio - Math.round(ratio)) < 0.05) {
        return { fulls: 0, halves: Math.round(ratio) };
    }

    // Fallback
    return { fulls: whole, halves: 0 };
};

// --- UI COMPONENTS ---

// 1. Toast Notification
const Toast = ({ message, type, onClose }) => {
  useEffect(() => { 
      if (!message) return;
      const t = setTimeout(() => {
          onClose(); 
      }, 3000); 
      return () => clearTimeout(t); 
  }, [message, onClose]);

  if (!message) return null;
  
  return (
    <div className={`fixed top-6 right-6 z-[9000] px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right fade-in duration-300 text-white font-bold flex gap-4 items-center min-w-[300px] border border-white/10 backdrop-blur-md ${type==='error'?'bg-red-600/90':'bg-slate-900/90'}`}>
        {type==='error' ? <AlertCircle size={24} className="shrink-0"/> : <CheckCircle2 size={24} className="text-emerald-400 shrink-0"/>}
        <span className="text-sm tracking-wide">{message}</span>
    </div>
  );
};

// 2. High-End Modal
const Modal = ({ isOpen, title, children, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[5000] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm sm:max-w-md rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-white/20">
                <div className="bg-slate-50/50 p-5 border-b border-slate-100 flex justify-between items-center rounded-t-[2rem]">
                    <h3 className="font-black text-lg text-slate-800 uppercase tracking-tight">{title}</h3>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-red-100 hover:text-red-500 transition-colors"><X size={18}/></button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">{children}</div>
            </div>
        </div>
    );
};

// 3. Custom Numpad
const Numpad = ({ value, onChange }) => {
    const handlePress = (key) => {
        if (key === 'C') onChange('');
        else if (key === 'BACK') onChange(prev => prev.slice(0, -1));
        else onChange(prev => (prev === '0' ? key : prev + key));
    };

    return (
        <div className="grid grid-cols-3 gap-3 mt-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button key={num} onClick={() => handlePress(String(num))} className="h-14 sm:h-16 rounded-2xl bg-slate-50 border border-slate-200 text-xl font-black text-slate-700 active:bg-slate-200 active:scale-95 transition-all shadow-sm hover:bg-slate-100">
                    {num}
                </button>
            ))}
            <button onClick={() => handlePress('C')} className="h-14 sm:h-16 rounded-2xl bg-red-50 border border-red-100 text-red-500 font-black text-lg active:bg-red-100 active:scale-95 transition-all shadow-sm">CLR</button>
            <button onClick={() => handlePress('0')} className="h-14 sm:h-16 rounded-2xl bg-slate-50 border border-slate-200 text-xl font-black text-slate-700 active:bg-slate-200 active:scale-95 transition-all shadow-sm hover:bg-slate-100">0</button>
            <button onClick={() => handlePress('BACK')} className="h-14 sm:h-16 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 flex items-center justify-center active:bg-slate-200 active:scale-95 transition-all shadow-sm hover:bg-slate-100"><Delete size={24}/></button>
        </div>
    );
};

// 4. Memoized Components
const TableButton = React.memo(({ table, onSelect, hasDraft }) => {
    const isOccupied = table.status === 'occupied';
    return (
        <button onClick={() => onSelect(table)} className={`aspect-square rounded-3xl border-b-[6px] transition-all flex flex-col items-center justify-center shadow-sm relative overflow-hidden group active:scale-95 ${isOccupied ? 'bg-orange-500 border-orange-700 text-white shadow-orange-200' : hasDraft ? 'bg-blue-50 border-blue-200 text-blue-700 ring-2 ring-blue-400 ring-offset-2' : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'}`}>
            <span className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isOccupied?'opacity-60':'text-slate-400'}`}>Table</span>
            <span className="text-3xl sm:text-4xl font-black tracking-tighter">{table.table_no}</span>
            {isOccupied && <span className="absolute top-2 right-2 flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span></span>}
            {hasDraft && !isOccupied && <span className="absolute top-2 right-2 text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-md uppercase">Draft</span>}
        </button>
    );
});

const MenuItem = React.memo(({ item, onAddToCart, isAc }) => {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-28 sm:h-32 flex overflow-hidden relative group active:scale-[0.98] transition-transform select-none">
            {item.is_half_available ? (
                <>
                    <div onClick={(e) => onAddToCart(e, item, 'Half')} className="w-1/2 bg-amber-50/50 flex flex-col justify-end p-2 border-r border-slate-100 hover:bg-amber-100 cursor-pointer text-center active:bg-amber-200 transition-colors">
                        <span className="text-[9px] font-black text-amber-800 uppercase tracking-widest mb-auto pt-1">Half</span>
                        <span className="text-sm font-black text-slate-900">₹{Math.ceil((isAc ? item.price_ac : item.price_non_ac) * 0.6)}</span>
                    </div>
                    <div onClick={(e) => onAddToCart(e, item, 'Full')} className="w-1/2 bg-white flex flex-col justify-end p-2 hover:bg-slate-50 cursor-pointer text-center active:bg-slate-200 transition-colors">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-auto pt-1">Full</span>
                        <span className="text-sm font-black text-slate-900">₹{safeNum(isAc ? item.price_ac : item.price_non_ac)}</span>
                    </div>
                </>
            ) : (
                <div onClick={(e) => onAddToCart(e, item, 'Full')} className="w-full bg-white flex flex-col justify-end p-3 hover:bg-slate-50 cursor-pointer active:bg-slate-100 transition-colors">
                    <span className="text-lg font-black text-slate-900">₹{safeNum(isAc ? item.price_ac : item.price_non_ac)}</span>
                </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-3 text-center mb-6"><h3 className="font-bold text-xs sm:text-sm text-slate-700 leading-tight line-clamp-2 uppercase tracking-tight">{item.name}</h3></div>
        </div>
    );
});

// --- MAIN DASHBOARD ---
const WaiterDashboard = () => {
  // Data
  const [tables, setTables] = useState([]);
  const [menu, setMenu] = useState([]);
  const [categoriesData, setCategoriesData] = useState([]);
  const [dbPresets, setDbPresets] = useState([]); 
  
  // UI
  const [view, setView] = useState('floor'); 
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [activeTab, setActiveTab] = useState('new'); 
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ msg: '', type: '' });
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  
  // Orders Logic
  const [selectedTable, setSelectedTable] = useState(null);
  const [draftOrders, setDraftOrders] = useState({}); // Local Drafts: { tableId: [cartItems] }
  const [cart, setCart] = useState([]); // Current New Items
  const [runningOrder, setRunningOrder] = useState([]); // Items in DB
  
  // Modals
  const [noteModal, setNoteModal] = useState({ show: false, index: null, text: '', isRunning: false });
  const [qtyModal, setQtyModal] = useState({ show: false, index: null, value: '', type: 'new' });
  const [confirmModal, setConfirmModal] = useState(false);
  const [saveConfirmModal, setSaveConfirmModal] = useState(false);

  const clickHistoryRef = useRef({}); 
  const cartScrollRef = useRef(null); 
  const waiterName = localStorage.getItem('username') || 'Waiter';

  const notify = useCallback((msg, type = 'success') => setNotification({ msg, type }), []);
  const closeNotif = useCallback(() => setNotification({ msg: '', type: '' }), []);
  
  // Auto-scroll cart
  useEffect(() => {
    if (activeTab === 'new' && cart.length > 0) {
        setTimeout(() => {
            cartScrollRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    }
  }, [cart.length, activeTab, isMobileCartOpen]);

  // --- DATA SYNC ---
  const fetchRunningOrderDetails = useCallback(async (tableObj) => {
      try {
        if(!tableObj.active_order_id) {
            setRunningOrder([]);
            return;
        }
        const res = await api.get(`/orders/details/${tableObj.active_order_id}`);
        
        let aggregated = [];
        
        // DECODE LOGIC: Split DB rows into UI rows
        res.data.forEach(item => {
            const { fulls, halves } = decodeQuantity(item.quantity);
            const basePrice = safeNum(item.price_at_time) || safeNum(tableObj.is_ac ? item.price_ac : item.price_non_ac);
            const note = item.special_instruction || '';

            // Add Fulls
            if(fulls > 0) {
                const existingIdx = aggregated.findIndex(a => 
                    a.item_code === item.item_code && 
                    a.portion === 'Full' && 
                    a.special_instruction === note
                );
                if(existingIdx > -1) aggregated[existingIdx].displayQty += fulls;
                else aggregated.push({ ...item, displayQty: fulls, portion: 'Full', unitPrice: basePrice, qtyLogic: 1.0, special_instruction: note });
            }

            // Add Halves
            if(halves > 0) {
                const existingIdx = aggregated.findIndex(a => 
                    a.item_code === item.item_code && 
                    a.portion === 'Half' && 
                    a.special_instruction === note
                );
                if(existingIdx > -1) aggregated[existingIdx].displayQty += halves;
                else aggregated.push({ ...item, displayQty: halves, portion: 'Half', unitPrice: Math.ceil(basePrice*0.6), qtyLogic: 0.6, special_instruction: note });
            }
        });
        
        setRunningOrder(aggregated);
      } catch(e) { console.error("Fetch Running Failed", e); }
  }, []);

  const loadData = useCallback(async () => {
        try {
            const [tRes, mRes, cRes, pRes] = await Promise.all([
                api.get('/orders/tables'), 
                api.get('/orders/menu'),
                api.get('/orders/categories'),
                api.get('/orders/presets')
            ]);
            
            const uniqueTablesMap = new Map();
            tRes.data.forEach(t => { if(!uniqueTablesMap.has(t.id)) uniqueTablesMap.set(t.id, t); });
            const uniqueTables = Array.from(uniqueTablesMap.values());
            uniqueTables.sort((a,b) => a.table_no.localeCompare(b.table_no, undefined, {numeric:true}));
            
            setTables(uniqueTables);
            setMenu(mRes.data);
            setDbPresets(pRes.data || []);
            const sortedCategories = [...cRes.data].sort((a, b) => a.name.localeCompare(b.name, 'gu'));
            setCategoriesData(sortedCategories);

            // Silent Update for current table
            if(selectedTable) {
                const currentTableState = uniqueTables.find(x => x.id === selectedTable.id);
                if (currentTableState) {
                  setSelectedTable(currentTableState); 
                  if (!currentTableState.active_order_id) setRunningOrder([]);
                  else if (selectedTable.active_order_id !== currentTableState.active_order_id) fetchRunningOrderDetails(currentTableState); 
                }
            }
        } catch(e) { console.error("Sync Error", e); }
  }, [selectedTable, fetchRunningOrderDetails]);

  useEffect(() => {
    loadData(); 
    const interval = setInterval(loadData, 5000); 
    return () => clearInterval(interval);
  }, [loadData]);

  // --- NAVIGATION & DRAFT LOGIC ---

  // 1. Save Draft to Local Memory
  const saveCurrentDraft = useCallback(() => {
      if(selectedTable) {
          // Even if empty, we update it to clear any previous draft for this table if cart is empty
          setDraftOrders(prev => ({
              ...prev,
              [selectedTable.id]: cart
          }));
      }
  }, [selectedTable, cart]);

  // 2. Back Button Logic
  const handleBackToFloor = () => {
      saveCurrentDraft();
      if(cart.length > 0) notify("Draft Saved Locally (Not Sent)", "success");
      
      setSelectedTable(null);
      setCart([]);
      setRunningOrder([]);
      setView('floor');
  };

  // 3. Select Table
  const handleTableSelect = useCallback(async (table) => {
    setSelectedTable(table); 
    
    // Restore Draft
    const existingDraft = draftOrders[table.id] || [];
    setCart(existingDraft);
    
    setRunningOrder([]); 
    setActiveTab(existingDraft.length > 0 ? 'new' : 'new'); 

    if (table.status === 'occupied' && table.active_order_id) {
        setLoading(true);
        await fetchRunningOrderDetails(table);
        // If no draft, default to running view
        if(existingDraft.length === 0) setActiveTab('running');
        setLoading(false);
    }
    setView('order');
  }, [fetchRunningOrderDetails, draftOrders]);

  // --- CART OPERATIONS ---
  
  const addToCart = useCallback((e, item, portion) => {
    if(e) { e.stopPropagation(); e.preventDefault(); }
    const key = `${item.id}-${portion}`; 
    const now = Date.now();
    const lastClick = clickHistoryRef.current[key] || 0;
    if (now - lastClick < 300) return; 
    clickHistoryRef.current[key] = now;
    if (portion === 'Half' && !item.is_half_available) { notify("Half portion not available", "error"); return; }
    
    const basePrice = selectedTable?.is_ac ? item.price_ac : item.price_non_ac;
    const finalPrice = portion === 'Half' ? Math.ceil(basePrice * 0.6) : basePrice;
    
    // Always add to 'New' Cart
    setCart(prev => {
        // Find exact match (Item + Portion + Note)
        const existingIdx = prev.findIndex(i => i.id === item.id && i.portion === portion && i.note === '');
        if (existingIdx > -1) { 
            const newCart = [...prev]; 
            newCart[existingIdx] = { ...newCart[existingIdx], quantity: newCart[existingIdx].quantity + 1 };
            return newCart; 
        }
        return [...prev, { ...item, portion, note: '', price: finalPrice, quantity: 1, logic: portion === 'Half' ? 0.6 : 1 }];
    });
    
    setActiveTab('new');
    notify(`${item.name} added`);
  }, [selectedTable, activeTab, notify]);


  // --- SAVE ACTIONS ---

  // Action: Save to DB & Shift to Running (NO PRINT)
  const handleSaveOnly = async () => {
    setLoading(true);
    try {
        await Promise.all(cart.map(i => api.post('/orders/add-item', {
            table_id: selectedTable.id, 
            item_code: i.item_code, 
            quantity: i.quantity * i.logic, 
            special_instruction: i.note
        })));

        notify("Order Saved (Not Printed)");

        // Cleanup
        setCart([]);
        setDraftOrders(prev => { const next = { ...prev }; delete next[selectedTable.id]; return next; });
        setIsMobileCartOpen(false);
        
        // Refresh
        const tRes = await api.get('/orders/tables');
        const updatedT = tRes.data.find(t => t.id === selectedTable.id);
        if(updatedT) {
            setSelectedTable(updatedT);
            await fetchRunningOrderDetails(updatedT);
        }
        setActiveTab('running');
    } catch(e) { notify("Save Failed", "error"); } finally { setLoading(false); }
  };

  // Action: Save to DB & Print KOT & Shift to Running
  const handleSendKOT = async () => {
    setLoading(true); 
    setConfirmModal(false);
    try {
        const isRunning = !!selectedTable.active_order_id;
        
        // 1. Save Items
        await Promise.all(cart.map(i => api.post('/orders/add-item', {
            table_id: selectedTable.id, 
            item_code: i.item_code, 
            quantity: i.quantity * i.logic, 
            special_instruction: i.note
        })));

        // 2. Print KOT
        try {
            const itemsWithLabels = cart.map(i => ({ ...i, name: i.portion === 'Half' ? `${i.name} (HALF)` : i.name }));
            await api.post('/print/kot', {
                table_no: selectedTable.table_no, waiter_name: waiterName, items: itemsWithLabels, is_running: isRunning, target: 'KITCHEN'
            });
            notify("KOT Sent & Printed!"); 
        } catch (printErr) { notify("Saved, but Printer connection failed!", "error"); }
        
        // Cleanup
        setCart([]);
        setDraftOrders(prev => { const next = { ...prev }; delete next[selectedTable.id]; return next; });
        setIsMobileCartOpen(false);
        
        // Refresh
        const tRes = await api.get('/orders/tables');
        const updatedT = tRes.data.find(t => t.id === selectedTable.id);
        if(updatedT) {
            setSelectedTable(updatedT);
            await fetchRunningOrderDetails(updatedT);
        }
        setActiveTab('running');
    } catch(e) { notify("Failed to save order.", "error"); } finally { setLoading(false); }
  };  

  // Action: Save modifications to existing Running Items
  const saveRunningChanges = async () => {
      setSaveConfirmModal(false);
      setLoading(true);
      try {
          const finalItems = runningOrder.map(i => {
               const logicQty = i.portion === 'Half' ? (0.6 * i.displayQty) : i.displayQty;
               const priceToSend = i.portion === 'Half' ? (i.unitPrice / 0.6) : i.unitPrice;
               return { 
                   item_id: i.item_id || i.id, 
                   quantity: parseFloat(logicQty.toFixed(2)), 
                   price_at_time: Math.round(priceToSend), 
                   special_instruction: i.special_instruction || '' 
               };
          });
          await api.put(`/orders/${selectedTable.active_order_id}`, { items: finalItems });
          notify("Order Updated");
          setIsMobileCartOpen(false);
          const tRes = await api.get('/orders/tables');
          const updatedT = tRes.data.find(t => t.id === selectedTable.id);
          if(updatedT) await fetchRunningOrderDetails(updatedT);
      } catch(e) { notify("Update Failed", "error"); } finally { setLoading(false); }
  };
  
  // --- HELPERS ---
  const toggleJainOption = (idx) => {
      setCart(prev => prev.map((item, i) => {
          if (i === idx) {
              let parts = (item.note || '').split(',').map(s => s.trim()).filter(s => s);
              if (parts.includes('Jain')) parts = parts.filter(p => p !== 'Jain');
              else parts.unshift('Jain'); 
              return { ...item, note: parts.join(', ') };
          }
          return item;
      }));
  };

  const updateRunningQty = (idx, delta) => {
      setRunningOrder(prev => prev.map((item, i) => {
          if(i === idx) {
              const newQty = item.displayQty + delta;
              if(newQty < 1) return item; 
              return { ...item, displayQty: newQty };
          }
          return item;
      }));
  };

  const handleSaveManualQty = () => {
      const val = parseInt(qtyModal.value, 10);
      if(isNaN(val) || val < 1) { notify("Invalid Quantity", "error"); return; }
      if(qtyModal.type === 'new') {
          setCart(prev => prev.map((item, i) => i === qtyModal.index ? { ...item, quantity: val } : item));
      } else {
          setRunningOrder(prev => prev.map((item, i) => i === qtyModal.index ? { ...item, displayQty: val } : item));
      }
      setQtyModal({ show: false, index: null, value: '', type: 'new' });
  };

  // Memos
  const { acTables, nonAcTables, parcelTables } = useMemo(() => {
    const ac = []; const nonAc = []; const parcel = [];
    tables.forEach(t => {
      if (String(t.table_no).toUpperCase().startsWith('P')) parcel.push(t);
      else if (t.is_ac) ac.push(t);
      else nonAc.push(t);
    });
    return { acTables: ac, nonAcTables: nonAc, parcelTables: parcel };
  }, [tables]);

  const categories = useMemo(() => ['All', ...categoriesData.map(c => c.name)], [categoriesData]);
  
  const filteredMenu = useMemo(() => {
    const sortedCategoriesByName = categoriesData.map(c => c.name);
    const menuToSort = [...menu];
    menuToSort.sort((a, b) => {
        const categoryIndexA = sortedCategoriesByName.indexOf(a.category);
        const categoryIndexB = sortedCategoriesByName.indexOf(b.category);
        if (categoryIndexA !== categoryIndexB) return categoryIndexA - categoryIndexB;
        return a.name.localeCompare(b.name, 'gu');
    });
    if (categoryFilter === 'All') return menuToSort;
    return menuToSort.filter(i => i.category === categoryFilter);
  }, [menu, categoryFilter, categoriesData]);

  const cartTotal = cart.reduce((a,i)=>a+(i.price*i.quantity), 0);
  const runningTotal = runningOrder.reduce((a,i)=>a+(i.unitPrice*i.displayQty), 0);

  // --- RENDER CART ---
  const renderCartItems = () => (
    <div className="flex flex-col h-full bg-white">
        <div className="flex border-b border-slate-200 shrink-0">
            <button onClick={()=>setActiveTab('new')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab==='new' ? 'bg-orange-50 text-orange-600 border-b-4 border-orange-600' : 'text-slate-400 hover:bg-slate-50'}`}>New Items ({cart.length})</button>
            <button onClick={()=>setActiveTab('running')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab==='running' ? 'bg-blue-50 text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}>Running</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar min-h-0 bg-slate-50/30">
            {activeTab === 'new' ? (
                <>
                {cart.map((i, idx) => (
                    <div key={idx} className={`p-4 rounded-2xl border shadow-sm transition-all hover:shadow-md ${i.portion==='Half' ? 'bg-amber-50/50 border-amber-100' : 'bg-white border-slate-100'}`}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex-1 pr-2">
                                <h4 className="font-black text-sm text-slate-800 leading-tight">{i.name}</h4>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1 block">{i.portion} • ₹{i.price}</span>
                            </div>
                            <button onClick={()=>setCart(p=>p.filter((_,x)=>x!==idx))} className="text-slate-300 hover:text-red-500 p-1 transition-colors"><Trash2 size={18}/></button>
                        </div>
                        <div className="flex justify-between items-center">
                            <div className="flex gap-2">
                                {i.is_jain_available && (<label className={`flex items-center gap-1.5 cursor-pointer px-3 py-2 rounded-xl border transition-all select-none ${i.note.includes('Jain') ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white border-slate-200 text-slate-500'}`}><input type="checkbox" checked={i.note.includes('Jain')} onChange={()=>toggleJainOption(idx)} className="hidden"/><span className="text-[10px] font-bold uppercase">Jain</span></label>)}
                                <button onClick={(e)=>{e.stopPropagation(); setNoteModal({show:true, index:idx, text:i.note, isRunning:false})}} className={`px-3 py-2 rounded-xl border text-[10px] font-bold flex items-center gap-1.5 transition-all ${i.note && !i.note.includes('Jain') ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-slate-500 border-slate-200'}`}><MessageSquare size={14}/> {i.note ? 'Edit' : 'Note'}</button>
                            </div>
                            <div className="flex items-center bg-slate-100 rounded-xl p-1 shadow-inner">
                                <button onClick={()=>setCart(p=>p.map((x,j)=>j===idx ? {...x, quantity:Math.max(1, x.quantity-1)} : x))} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm active:scale-95 text-slate-600 hover:text-red-500 transition-all"><Minus size={14}/></button>
                                <button onClick={(e)=>{e.stopPropagation(); setQtyModal({show:true, index:idx, value:String(i.quantity), type:'new'})}} className="w-10 text-center text-sm font-black text-slate-800 focus:outline-none hover:bg-slate-200 rounded px-1 transition-colors">{i.quantity}</button>
                                <button onClick={()=>setCart(p=>p.map((x,j)=>j===idx ? {...x, quantity:x.quantity+1} : x))} className="w-8 h-8 flex items-center justify-center bg-slate-900 text-white rounded-lg shadow-sm active:scale-95 hover:bg-black transition-all"><Plus size={14}/></button>
                            </div>
                        </div>
                        {i.note && <div className="text-[10px] text-blue-600 mt-2 font-bold bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 italic flex items-center gap-1"><MessageSquare size={10}/> {i.note}</div>}
                    </div>
                ))}
                <div ref={cartScrollRef}></div>
                {cart.length === 0 && <div className="flex flex-col items-center justify-center h-48 text-slate-300"><UtensilsCrossed size={48} className="mb-3 opacity-30"/><span className="text-xs font-black uppercase tracking-widest opacity-60">Cart is Empty</span></div>}
                </>
            ) : (
                <>
                {runningOrder.map((i, idx) => (
                    <div key={idx} className="p-4 border rounded-2xl bg-white shadow-sm flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                            <div><div className="font-black text-sm text-slate-800">{i.name}</div><div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{i.portion} • ₹{i.unitPrice} ea</div>{i.special_instruction && <div className="text-[10px] text-blue-500 italic mt-1 font-bold">"{i.special_instruction}"</div>}</div>
                            <div className="text-sm font-black text-slate-900">₹{i.unitPrice * i.displayQty}</div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-slate-50 mt-1">
                            <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg"><CheckCircle2 size={12}/> Sent</div>
                            <div className="flex gap-3">
                                <div className="flex items-center bg-slate-100 rounded-xl p-1 shadow-inner">
                                    <button onClick={()=>updateRunningQty(idx, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 active:scale-95 transition-all"><Minus size={14}/></button>
                                    <button onClick={(e)=>{e.stopPropagation(); setQtyModal({show:true, index:idx, value:String(i.displayQty), type:'running'})}} className="w-10 text-center text-sm font-black hover:bg-slate-200 rounded px-1 transition-colors">{i.displayQty}</button>
                                    <button onClick={()=>updateRunningQty(idx, 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 active:scale-95 transition-all"><Plus size={14}/></button>
                                </div>
                                <button onClick={()=>{if(window.confirm("Delete?")) setRunningOrder(prev => prev.filter((_, i) => i !== idx))}} className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100 border border-red-100 transition-colors"><Trash2 size={18}/></button>
                            </div>
                        </div>
                    </div>
                ))}
                {runningOrder.length === 0 && <div className="text-center p-10 text-xs text-slate-400 font-medium italic">No active KOTs.</div>}
                </>
            )}
        </div>

        <div className="p-5 border-t border-slate-200 bg-slate-50 shrink-0">
            <div className="flex justify-between items-end mb-4 text-slate-900">
                <div><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Total Items</span><span className="text-2xl font-black">{activeTab==='new' ? cart.length : runningOrder.length}</span></div>
                <div className="text-right"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Total Amount</span><span className="text-2xl font-black text-blue-600">₹{activeTab==='new' ? cartTotal : runningTotal}</span></div>
            </div>
            
            {activeTab === 'new' ? (
                <div className="flex gap-3">
                     {/* SAVE (NO PRINT) BUTTON */}
                     <button onClick={handleSaveOnly} disabled={!cart.length || loading} className="flex-1 py-4 bg-white border-2 border-slate-200 text-slate-700 font-black rounded-2xl shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all disabled:opacity-50 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Save
                    </button>
                    {/* SEND KOT BUTTON */}
                    <button onClick={()=>setConfirmModal(true)} disabled={!cart.length || loading} className="flex-[2] py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl shadow-slate-300 hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none text-xs uppercase tracking-widest flex items-center justify-center gap-3">
                        {loading ? <Loader2 className="animate-spin" size={20}/> : <Printer size={20}/>} {loading ? 'Sending...' : 'Print KOT'}
                    </button>
                </div>
            ) : (
                <button onClick={() => setSaveConfirmModal(true)} disabled={!runningOrder.length || loading} className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none text-xs uppercase tracking-widest flex items-center justify-center gap-3">
                    {loading ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>} {loading ? 'Saving...' : 'Save Changes'}
                </button>
            )}
        </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden select-none font-sans">
      <Toast message={notification.msg} type={notification.type} onClose={closeNotif} />
      
      <header className="h-16 lg:h-20 bg-slate-900 text-white flex items-center justify-between px-4 lg:px-6 shadow-2xl z-[100] shrink-0">
        <div className="flex gap-4 items-center w-1/3">
            {view === 'order' ? (
                <button onClick={handleBackToFloor} className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-xl hover:bg-slate-700 transition-all active:scale-95"><ChevronLeft size={22}/></button> 
            ) : ( <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center"><UtensilsCrossed size={22} className="text-orange-500"/></div> )}
            <div className="flex flex-col min-w-0">
                <span className="font-black uppercase tracking-tight text-sm sm:text-lg leading-none truncate">{view==='floor' ? 'Floor Plan' : `Table ${selectedTable?.table_no}`}</span>
                {view==='order' && <span className={`text-[9px] font-bold px-2 py-0.5 rounded text-white tracking-widest w-fit mt-1 ${selectedTable?.is_ac ? 'bg-blue-600' : 'bg-orange-600'}`}>{selectedTable?.is_ac ? 'AC HALL' : 'NON-AC'}</span>}
            </div>
        </div>
        <div className="flex flex-col items-center justify-center w-1/3 text-center">
            <h1 className="font-black text-xl tracking-wider text-orange-500 leading-none">UMIYA</h1>
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em] truncate max-w-full mt-0.5">Kathiyawadi</span>
        </div>
        <div className="flex gap-2 items-center justify-end w-1/3">
            <button onClick={()=>{localStorage.clear(); window.location.href='/login'}} className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-xl hover:bg-red-600 transition-colors text-slate-400 hover:text-white"><LogOut size={18}/></button>
        </div>
      </header>
      
       <main className="flex-1 flex overflow-hidden relative">
        {view === 'floor' ? (
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto custom-scrollbar space-y-8 bg-slate-100">
                {nonAcTables.length > 0 && (
                     <section>
                        <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.15em] mb-4 flex items-center gap-2 px-1"><UtensilsCrossed size={14}/> Dining Hall (Non-AC)</h2>
                        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4">
                            {nonAcTables.map(t => <TableButton key={t.id} table={t} onSelect={handleTableSelect} hasDraft={!!draftOrders[t.id]?.length} />)}
                        </div>
                    </section>
                )}
                {acTables.length > 0 && (
                    <section>
                        <h2 className="text-xs font-black text-blue-500 uppercase tracking-[0.15em] mb-4 flex items-center gap-2 px-1"><Wind size={14}/> AC Family Hall</h2>
                        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4">
                            {acTables.map(t => <TableButton key={t.id} table={t} onSelect={handleTableSelect} hasDraft={!!draftOrders[t.id]?.length} />)}
                        </div>
                    </section>
                )}
                {parcelTables.length > 0 && (
                    <section>
                        <h2 className="text-xs font-black text-emerald-600 uppercase tracking-[0.15em] mb-4 flex items-center gap-2 px-1"><Box size={14}/> Parcel / Take Away</h2>
                        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4">
                            {parcelTables.map(t => <TableButton key={t.id} table={t} onSelect={handleTableSelect} hasDraft={!!draftOrders[t.id]?.length} />)}
                        </div>
                    </section>
                )}
            </div>
        ) : (
            <>
                <div className="flex-1 flex flex-col bg-slate-50 min-w-0 border-r border-slate-200 relative">
                    <div className="bg-white p-3 flex gap-2 overflow-x-auto shadow-sm shrink-0 no-scrollbar z-10">
                        {categories.map(c => (<button key={c} onClick={()=>setCategoryFilter(c)} className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase whitespace-nowrap transition-all shadow-sm ${categoryFilter===c ? 'bg-slate-900 text-white shadow-lg shadow-slate-300 scale-105' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>{c}</button>))}
                    </div>
                    
                    <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 content-start pb-24">
                            {filteredMenu.map(i => (
                                <MenuItem key={i.id} item={i} onAddToCart={addToCart} isAc={selectedTable?.is_ac} />
                            ))}
                        </div>
                    </div>

                    <div className="lg:hidden fixed bottom-6 right-6 z-[200]">
                        <button onClick={() => setIsMobileCartOpen(true)} className="bg-orange-600 text-white w-16 h-16 rounded-full shadow-2xl flex items-center justify-center relative active:scale-90 transition-transform border-4 border-white/20">
                            <ShoppingCart size={28} />
                            {(cart.length > 0 || runningOrder.length > 0) && (
                                <span className="absolute -top-1 -right-1 bg-slate-900 text-white text-[10px] font-black w-7 h-7 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                    {activeTab === 'new' ? cart.length : runningOrder.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                <div className="hidden lg:flex w-[400px] bg-white shadow-2xl flex-col z-20 shrink-0 border-l border-slate-200">
                    {renderCartItems()}
                </div>

                {isMobileCartOpen && (
                    <div className="lg:hidden fixed inset-0 z-[1000] bg-white flex flex-col animate-in slide-in-from-bottom duration-300">
                        <div className="h-16 bg-slate-900 flex items-center justify-between px-6 shrink-0 shadow-lg">
                            <span className="text-white font-black uppercase tracking-widest text-sm">Your Order</span>
                            <button onClick={() => setIsMobileCartOpen(false)} className="text-white bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors"><X size={20}/></button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            {renderCartItems()}
                        </div>
                    </div>
                )}
            </>
        )}
      </main>
      
      {noteModal.show && (
          <Modal isOpen={true} title="Special Instructions" onClose={()=>setNoteModal({show:false})}>
              <div className="flex flex-wrap gap-2 mb-4">
                  {dbPresets.map(p => {
                      const isSelected = noteModal.text.split(',').map(s=>s.trim()).includes(p.name);
                      return (
                          <button 
                            key={p.id || p.name} 
                            onClick={() => {
                                let parts = (noteModal.text || '').split(',').map(s => s.trim()).filter(s => s);
                                if (parts.includes(p.name)) parts = parts.filter(part => part !== p.name); 
                                else parts.push(p.name); 
                                setNoteModal({...noteModal, text: parts.join(', ')});
                            }} 
                            className={`px-4 py-2.5 border rounded-xl text-xs font-bold transition-all ${isSelected ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                          >
                              {p.name}
                          </button>
                      );
                  })}
              </div>
              <textarea value={noteModal.text} onChange={e=>setNoteModal({...noteModal, text:e.target.value})} className="w-full border rounded-2xl p-4 text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-slate-900/10 resize-none shadow-inner" rows={4} placeholder="Type custom note..."/>
              <button onClick={()=>{setCart(p=>p.map((x,i)=>i===noteModal.index ? {...x, note:noteModal.text} : x)); setNoteModal({show:false});}} className="w-full mt-6 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl text-xs active:scale-95 transition-transform">Save Note</button>
          </Modal>
      )}

      {qtyModal.show && (
          <Modal isOpen={true} title="Quantity" onClose={()=>setQtyModal({...qtyModal, show:false})}>
              <div className="text-center mb-6">
                  <div className="bg-slate-100 rounded-3xl p-6 mb-4 border border-slate-200 shadow-inner flex items-center justify-center h-24">
                      <span className="text-5xl font-black text-slate-900 tracking-tight">{qtyModal.value || '0'}</span>
                  </div>
                  <Numpad 
                    value={qtyModal.value} 
                    onChange={(val) => {
                        const newValue = typeof val === 'function' ? val(qtyModal.value) : val;
                        setQtyModal({ ...qtyModal, value: newValue });
                    }} 
                  />
                  <button onClick={handleSaveManualQty} className="w-full mt-6 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform hover:bg-black">
                      <CheckCircle2 size={18}/> Update Quantity
                  </button>
              </div>
          </Modal>
      )}
      
      {confirmModal && (
          <Modal isOpen={true} title="Confirm Order" onClose={()=>setConfirmModal(false)}>
              <div className="text-center mb-8"><div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in shadow-xl shadow-orange-100"><Printer size={40}/></div><p className="font-bold text-slate-600 text-lg">Send KOT to Kitchen?</p><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Table {selectedTable?.table_no}</p></div>
              <div className="grid grid-cols-2 gap-4"><button onClick={()=>setConfirmModal(false)} className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold uppercase tracking-wide text-xs hover:bg-slate-200 transition-colors">Cancel</button><button onClick={handleSendKOT} className="py-4 bg-orange-600 text-white rounded-2xl font-bold uppercase tracking-wide shadow-xl shadow-orange-200 text-xs hover:bg-orange-700 transition-colors">Yes, Print</button></div>
          </Modal>
      )}

      {saveConfirmModal && (
          <Modal isOpen={true} title="Save Changes" onClose={()=>setSaveConfirmModal(false)}>
              <div className="text-center mb-8"><div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in shadow-xl shadow-blue-100"><Save size={40}/></div><p className="font-bold text-slate-600 text-lg">Update Running Order?</p><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Table {selectedTable?.table_no}</p></div>
              <div className="grid grid-cols-2 gap-4"><button onClick={()=>setSaveConfirmModal(false)} className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold uppercase tracking-wide text-xs hover:bg-slate-200 transition-colors">Cancel</button><button onClick={saveRunningChanges} className="py-4 bg-blue-600 text-white rounded-2xl font-bold uppercase tracking-wide shadow-xl shadow-blue-200 text-xs hover:bg-blue-700 transition-colors">Yes, Save</button></div>
          </Modal>
      )}
      
      <div className="fixed bottom-1 left-3 text-[7px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-widest z-[60] opacity-50 pointer-events-none">Powered by <span className="text-orange-600 font-black">CIPRA INFOTECH</span></div>
    </div>
  );
};

export default WaiterDashboard;