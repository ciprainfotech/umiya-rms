import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  LogOut, Trash2, Plus, Minus, UtensilsCrossed, 
  ChevronLeft, CheckCircle2, AlertCircle, X, 
  MessageSquare, Save, Printer, Loader2
} from 'lucide-react';
import api from '../api/axios';

// --- CONSTANTS ---
const GUJARATI_PRESETS = ['મોળું', 'મીડિયમ', 'તીખું', 'લસણ વગર', 'ડુંગળી વગર', 'તેલ ઓછું', 'કડક', 'જૈન'];

// --- UTILITY FUNCTIONS ---
const safeNum = (v) => {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
};

const decodeQuantity = (rawQty) => {
    const q = Math.round(Number(rawQty) * 10) / 10;
    if (Number.isInteger(q)) return { fulls: q, halves: 0 };
    const floor = Math.floor(q);
    const remainder = Math.round((q - floor) * 10) / 10;
    if (remainder === 0.6) return { fulls: floor, halves: 1 };
    return { fulls: floor, halves: 0 };
};

// --- UI COMPONENTS ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => { 
      if(!message) return; 
      const t = setTimeout(onClose, 3000); 
      return () => clearTimeout(t); 
  }, [message, onClose]);

  if (!message) return null;
  
  return (
    <div className={`fixed top-4 right-4 z-[5000] px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-right text-white font-bold flex gap-3 items-center ${type==='error'?'bg-red-600':'bg-slate-900'}`}>
        {type==='error' ? <AlertCircle size={20}/> : <CheckCircle2 size={20} className="text-emerald-400"/>}
        <span>{message}</span>
    </div>
  );
};

const Modal = ({ isOpen, title, children, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[4000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95">
                <div className="bg-slate-50 p-4 border-b flex justify-between items-center">
                    <h3 className="font-black text-lg text-slate-800 uppercase">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X/></button>
                </div>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
const WaiterDashboard = () => {
  // Data State
  const [tables, setTables] = useState([]);
  const [menu, setMenu] = useState([]);
  const [categoriesData, setCategoriesData] = useState([]);
  
  // UI State
  const [view, setView] = useState('floor'); // 'floor' | 'order'
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'running'
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ msg: '', type: '' });
  
  // Order State
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]); 
  const [runningOrder, setRunningOrder] = useState([]); 
  
  // Modals
  const [noteModal, setNoteModal] = useState({ show: false, index: null, text: '', isRunning: false });
  const [confirmModal, setConfirmModal] = useState(false);

  // REFS (For Throttle)
  const clickHistoryRef = useRef({}); 
  const waiterName = localStorage.getItem('username') || 'Waiter';

  // --- HELPERS ---
  const notify = (msg, type = 'success') => setNotification({ msg, type });
  const closeNotif = () => setNotification({ msg: '', type: '' });

  // --- DATA FETCHING ---
  const loadData = useCallback(async () => {
        try {
            const [tRes, mRes, cRes] = await Promise.all([
                api.get('/orders/tables'), 
                api.get('/orders/menu'),
                api.get('/orders/categories')
            ]);
            
            // Deduplicate Tables
            const uniqueTablesMap = new Map();
            tRes.data.forEach(t => { if(!uniqueTablesMap.has(t.id)) uniqueTablesMap.set(t.id, t); });
            const uniqueTables = Array.from(uniqueTablesMap.values());
            uniqueTables.sort((a,b) => a.table_no.localeCompare(b.table_no, undefined, {numeric:true}));
            
            setTables(uniqueTables);
            setMenu(mRes.data);
            setCategoriesData(cRes.data);
            
            if(selectedTable) {
                const currentTableState = uniqueTables.find(x => x.id === selectedTable.id);
                if(currentTableState && !currentTableState.active_order_id) {
                     setRunningOrder([]);
                }
            }
        } catch(e) { console.error("Sync Error", e); }
  }, [selectedTable]);

  useEffect(() => {
    loadData(); 
    const interval = setInterval(loadData, 5000); 
    return () => clearInterval(interval);
  }, [loadData]);

  const fetchRunningOrderDetails = async (tableObj) => {
      try {
        if(!tableObj.active_order_id) {
            setRunningOrder([]);
            return;
        }
        const res = await api.get(`/orders/details/${tableObj.active_order_id}`);
        
        let rawItems = [];
        res.data.forEach(item => {
            const { fulls, halves } = decodeQuantity(item.quantity);
            const basePrice = safeNum(item.price_at_time) || safeNum(tableObj.is_ac ? item.price_ac : item.price_non_ac);
            
            if(fulls > 0) rawItems.push({ ...item, displayQty: fulls, portion: 'Full', unitPrice: basePrice, qtyLogic: 1.0 });
            if(halves > 0) rawItems.push({ ...item, displayQty: halves, portion: 'Half', unitPrice: Math.ceil(basePrice*0.6), qtyLogic: 0.6 });
        });
        
        const aggregated = [];
        rawItems.forEach(p => {
             const idx = aggregated.findIndex(a => a.item_code === p.item_code && a.portion === p.portion && a.unitPrice === p.unitPrice && a.special_instruction === p.special_instruction);
             if(idx > -1) aggregated[idx].displayQty += p.displayQty;
             else aggregated.push(p);
        });

        setRunningOrder(aggregated);
      } catch(e) { console.error("Fetch Running Failed", e); }
  };

  // --- ACTIONS ---

  const handleTableSelect = async (table) => {
    setSelectedTable(table); 
    setCart([]); 
    setRunningOrder([]); 
    setActiveTab('new');
    
    if (table.status === 'occupied' && table.active_order_id) {
        setLoading(true);
        await fetchRunningOrderDetails(table);
        setActiveTab('running');
        setLoading(false);
    }
    setView('order');
  };

 const addToCart = (e, item, portion) => {

    if(e) { e.stopPropagation(); e.preventDefault(); }
    
    const key = `${item.id}-${portion}`; 
    const now = Date.now();
    const lastClick = clickHistoryRef.current[key] || 0;
    if (now - lastClick < 300) {
        return; 
    }
    clickHistoryRef.current[key] = now;
    if (portion === 'Half' && !item.is_half_available) {
        notify("Half portion not available", "error");
        return;
    }
    
    const basePrice = selectedTable?.is_ac ? item.price_ac : item.price_non_ac;
    const finalPrice = portion === 'Half' ? Math.ceil(basePrice * 0.6) : basePrice;
    
    setCart(prev => {
        const existingIdx = prev.findIndex(i => 
            i.id === item.id && 
            i.portion === portion && 
            i.note === ''
        );
        
        if (existingIdx > -1) { 
            const newCart = [...prev]; 
            newCart[existingIdx] = {
                ...newCart[existingIdx],
                quantity: newCart[existingIdx].quantity + 1
            };
            return newCart; 
        }
                return [...prev, { 
            ...item, 
            portion, 
            note: '', 
            price: finalPrice, 
            quantity: 1, 
            logic: portion === 'Half' ? 0.6 : 1 
        }];
    });
    
    setActiveTab('new');
};

  const handleSendKOT = async () => {
    setLoading(true); 
    setConfirmModal(false);
    try {
        const isRunning = !!selectedTable.active_order_id;
        // DB Save
        await Promise.all(cart.map(i => api.post('/orders/add-item', {
            table_id: selectedTable.id, 
            item_code: i.item_code, 
            quantity: i.quantity * i.logic, 
            special_instruction: i.note
        })));

        // Printer
        try {
            const itemsWithLabels = cart.map(i => ({ ...i, name: i.portion === 'Half' ? `${i.name} (HALF)` : i.name }));
            await api.post('/print/kot', {
                table_no: selectedTable.table_no, waiter_name: waiterName, items: itemsWithLabels, is_running: isRunning, target: 'KITCHEN'
            });
            notify("KOT Sent & Printed!", "success"); 
        } catch (printErr) { notify("Saved, but Printer connection failed!", "error"); }

        setCart([]);
        const tRes = await api.get('/orders/tables');
        const updatedT = tRes.data.find(t => t.id === selectedTable.id);
        if(updatedT) {
            setSelectedTable(updatedT);
            await fetchRunningOrderDetails(updatedT);
        }
        setActiveTab('running');
    } catch(e) { notify("Failed to save order. Check connection.", "error"); } finally { setLoading(false); }
  };  

  const toggleJainOption = (idx) => {
      setCart(prev => prev.map((item, i) => {
          if (i === idx) {
              const hasJain = item.note.includes('Jain');
              const newNote = hasJain ? item.note.replace('Jain', '').trim().replace(/^,|,$/g, '') : (item.note ? `Jain, ${item.note}` : 'Jain');
              return { ...item, note: newNote };
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

  const removeRunningItem = (idx) => {
      if(!window.confirm("Delete item?")) return;
      setRunningOrder(prev => prev.filter((_, i) => i !== idx));
  };

  const saveRunningChanges = async () => {
      if(!window.confirm("Confirm changes?")) return;
      setLoading(true);
      try {
          const finalItems = runningOrder.map(i => {
               const logicQty = i.portion === 'Half' ? (0.6 * i.displayQty) : i.displayQty;
               const priceToSend = i.portion === 'Half' ? (i.unitPrice / 0.6) : i.unitPrice;
               return { item_id: i.item_id || i.id, quantity: logicQty, price_at_time: Math.round(priceToSend), special_instruction: i.special_instruction || '' };
          });
          await api.put(`/orders/${selectedTable.active_order_id}`, { items: finalItems });
          notify("Order Updated", "success");
          const tRes = await api.get('/orders/tables');
          const updatedT = tRes.data.find(t => t.id === selectedTable.id);
          if(updatedT) await fetchRunningOrderDetails(updatedT);
      } catch(e) { notify("Update Failed", "error"); } finally { setLoading(false); }
  };

  // --- DERIVED STATE ---
  const categories = useMemo(() => ['All', ...categoriesData.map(c => c.name)], [categoriesData]);
  const filteredMenu = useMemo(() => categoryFilter === 'All' ? menu : menu.filter(i=>i.category === categoryFilter), [menu, categoryFilter]);
  const cartTotal = cart.reduce((a,i)=>a+(i.price*i.quantity), 0);
  const runningTotal = runningOrder.reduce((a,i)=>a+(i.unitPrice*i.displayQty), 0);

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden select-none font-sans">
      <Toast message={notification.msg} type={notification.type} onClose={closeNotif} />
      
      {/* HEADER */}
      <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-4 shadow-xl z-50 shrink-0">
        <div className="flex gap-3 items-center w-1/3">
            {view === 'order' ? (
                <button onClick={()=>setView('floor')} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors"><ChevronLeft size={24}/></button> 
            ) : ( <UtensilsCrossed size={26} className="text-orange-500"/> )}
            <div className="flex flex-col">
                <span className="font-black uppercase tracking-tight text-lg leading-none">{view==='floor' ? 'Floor Map' : `Table ${selectedTable?.table_no}`}</span>
                {view==='order' && <span className={`text-[9px] font-bold px-1.5 rounded text-white tracking-widest w-fit mt-0.5 ${selectedTable?.is_ac ? 'bg-blue-600' : 'bg-orange-600'}`}>{selectedTable?.is_ac ? 'AC SECTION' : 'NON-AC'}</span>}
            </div>
        </div>

        <div className="flex flex-col items-center justify-center w-1/3 text-center">
            <h1 className="font-black text-xl tracking-wider text-orange-500 leading-none">CIPRA RMS</h1>
            <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest">Hotel Umiya Kathiyawadi</span>
        </div>

        <div className="flex gap-3 items-center justify-end w-1/3">
            <div className="text-right hidden sm:block">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Logged in as</div>
                <div className="font-black text-lg leading-none text-white capitalize">{waiterName}</div>
            </div>
            <button onClick={()=>{localStorage.clear(); window.location.href='/login'}} className="p-2.5 bg-slate-800 rounded-xl hover:bg-red-600 transition-colors"><LogOut size={18}/></button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex overflow-hidden relative">
        {view === 'floor' ? (
            <div className="flex-1 p-6 overflow-y-auto">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4 pb-20">
                    {tables.map(t => {
                       const isOccupied = t.status === 'occupied';
                       return (
                          <button key={t.id} onClick={() => handleTableSelect(t)} className={`aspect-square rounded-2xl border-b-8 transition-all flex flex-col items-center justify-center shadow-sm relative overflow-hidden group ${isOccupied ? 'bg-orange-500 border-orange-700 text-white shadow-orange-200' : 'bg-white border-slate-200 hover:border-orange-200 text-slate-800'}`}>
                             <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Table</span>
                             <span className="text-4xl font-black">{t.table_no}</span>
                             {isOccupied && <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-pulse shadow-md"></div>}
                             <div className="absolute bottom-2 text-[9px] font-bold opacity-60">{t.is_ac ? 'AC' : 'Non-AC'}</div>
                          </button>
                       )
                    })}
                </div>
            </div>
        ) : (
            <>
                {/* LEFT: MENU */}
                <div className="flex-1 flex flex-col bg-slate-100 min-w-0 border-r border-slate-200">
                    <div className="bg-white p-3 flex gap-2 overflow-x-auto shadow-sm shrink-0 no-scrollbar">
                        {categories.map(c => (<button key={c} onClick={()=>setCategoryFilter(c)} className={`px-6 py-3 rounded-xl text-xs font-black uppercase whitespace-nowrap transition-all shadow-sm ${categoryFilter===c ? 'bg-slate-900 text-white scale-105' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'}`}>{c}</button>))}
                    </div>
                    
                    <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 content-start pb-20">
                            {filteredMenu.map(i => (
                                <div key={i.id} className="bg-white rounded-xl shadow-sm border border-slate-200 h-28 flex overflow-hidden relative group active:scale-[0.98] transition-transform select-none">
                                    {i.is_half_available ? (
                                        <>
                                            <div onClick={(e)=>addToCart(e, i, 'Half')} className="w-1/2 bg-amber-50 flex flex-col justify-end p-2 border-r border-amber-100 hover:bg-amber-100 cursor-pointer text-center active:bg-amber-200">
                                                <span className="text-[9px] font-black text-amber-800 uppercase tracking-wider mb-auto mt-1">Half</span>
                                                <span className="text-sm font-bold text-slate-900">₹{Math.ceil((selectedTable.is_ac ? i.price_ac : i.price_non_ac)*0.6)}</span>
                                            </div>
                                            <div onClick={(e)=>addToCart(e, i, 'Full')} className="w-1/2 bg-white flex flex-col justify-end p-2 hover:bg-slate-50 cursor-pointer text-center active:bg-slate-200">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-auto mt-1">Full</span>
                                                <span className="text-sm font-bold text-slate-900">₹{safeNum(selectedTable.is_ac ? i.price_ac : i.price_non_ac)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div onClick={(e)=>addToCart(e, i, 'Full')} className="w-full bg-white flex flex-col justify-end p-3 hover:bg-slate-50 cursor-pointer active:bg-slate-100">
                                            <span className="text-lg font-bold text-slate-900">₹{safeNum(selectedTable.is_ac ? i.price_ac : i.price_non_ac)}</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-2 text-center mt-[-1rem]"><h3 className="font-bold text-sm text-slate-800 leading-tight line-clamp-2">{i.name}</h3></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* RIGHT: CART */}
                <div className="w-[380px] bg-white shadow-2xl flex flex-col z-20 shrink-0 border-l border-slate-200">
                    <div className="flex border-b border-slate-200">
                        <button onClick={()=>setActiveTab('new')} className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-colors ${activeTab==='new' ? 'bg-orange-50 text-orange-600 border-b-4 border-orange-600' : 'text-slate-400 hover:bg-slate-50'}`}>New Items ({cart.length})</button>
                        <button onClick={()=>setActiveTab('running')} className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-colors ${activeTab==='running' ? 'bg-blue-50 text-blue-600 border-b-4 border-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}>Running Order</button>
                    </div>
                    
                    {activeTab === 'new' && (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                                {cart.map((i, idx) => (
                                    <div key={idx} className={`p-3 rounded-2xl border shadow-sm ${i.portion==='Half' ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'}`}>
                                        <div className="flex justify-between items-start mb-2"><div className="flex-1"><h4 className="font-black text-sm text-slate-800">{i.name}</h4><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{i.portion} • ₹{i.price}</span></div><button onClick={()=>setCart(p=>p.filter((_,x)=>x!==idx))} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={18}/></button></div>
                                        <div className="flex justify-between items-center">
                                            <div className="flex gap-2">
                                                {i.is_jain_available && (<label className={`flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg border transition-all select-none ${i.note.includes('Jain') ? 'bg-green-100 border-green-300 text-green-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}><input type="checkbox" checked={i.note.includes('Jain')} onChange={()=>toggleJainOption(idx)} className="hidden"/><span className="text-[10px] font-bold uppercase">Jain</span></label>)}
                                                <button onClick={()=>setNoteModal({show:true, index:idx, text:i.note, isRunning:false})} className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 transition-all ${i.note && !i.note.includes('Jain') ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-slate-50 text-slate-500 border-slate-200'}`}><MessageSquare size={12}/> {i.note ? 'Edit' : 'Note'}</button>
                                            </div>
                                            <div className="flex items-center bg-slate-100 rounded-lg p-1"><button onClick={()=>setCart(p=>p.map((x,j)=>j===idx ? {...x, quantity:Math.max(1, x.quantity-1)} : x))} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm active:scale-95 text-slate-600 hover:text-red-500"><Minus size={14}/></button><span className="w-8 text-center text-sm font-black text-slate-800">{i.quantity}</span><button onClick={()=>setCart(p=>p.map((x,j)=>j===idx ? {...x, quantity:x.quantity+1} : x))} className="w-8 h-8 flex items-center justify-center bg-slate-900 text-white rounded-md shadow-sm active:scale-95"><Plus size={14}/></button></div>
                                        </div>
                                        {i.note && <div className="text-[10px] text-blue-600 mt-2 font-medium bg-blue-50 p-1.5 rounded border border-blue-100 italic">"{i.note}"</div>}
                                    </div>
                                ))}
                                {cart.length === 0 && <div className="flex flex-col items-center justify-center h-40 text-slate-300"><UtensilsCrossed size={40} className="mb-2 opacity-50"/><span className="text-xs font-bold uppercase tracking-widest">Cart is Empty</span></div>}
                            </div>
                            <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0">
                                <div className="flex justify-between items-end mb-3 text-slate-900">
                                    <div><span className="text-xs font-bold uppercase tracking-widest text-slate-500 block">Total Items</span><span className="text-xl font-black">{cart.length}</span></div>
                                    <div className="text-right"><span className="text-xs font-bold uppercase tracking-widest text-slate-500 block">Total Amount</span><span className="text-xl font-black">₹{cartTotal}</span></div>
                                </div>
                                <button onClick={()=>setConfirmModal(true)} disabled={!cart.length || loading} className="w-full py-4 bg-slate-900 text-white font-black rounded-xl shadow-lg hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 text-sm uppercase tracking-widest flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin" size={18}/> : <Printer size={18}/>}{loading ? 'Sending...' : 'Print KOT'}</button>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'running' && (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                                {runningOrder.map((i, idx) => (
                                    <div key={idx} className="p-3 border rounded-2xl bg-white shadow-sm flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                            <div><div className="font-black text-sm text-slate-800">{i.name}</div><div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{i.portion} • ₹{i.unitPrice} ea</div>{i.special_instruction && <div className="text-[10px] text-blue-500 italic mt-1">"{i.special_instruction}"</div>}</div>
                                            <div className="text-sm font-black text-slate-900">₹{i.unitPrice * i.displayQty}</div>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-50 mt-1">
                                            <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 size={10}/> Sent</div>
                                            <div className="flex gap-3"><div className="flex items-center bg-slate-100 rounded-lg p-0.5"><button onClick={()=>updateRunningQty(idx, -1)} className="w-7 h-7 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 active:scale-95"><Minus size={12}/></button><span className="w-8 text-center text-xs font-black">{i.displayQty}</span><button onClick={()=>updateRunningQty(idx, 1)} className="w-7 h-7 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 active:scale-95"><Plus size={12}/></button></div><button onClick={()=>removeRunningItem(idx)} className="w-8 h-8 flex items-center justify-center bg-red-100 text-red-500 rounded-lg hover:bg-red-200 transition-colors"><Trash2 size={16}/></button></div>
                                        </div>
                                    </div>
                                ))}
                                {runningOrder.length === 0 && <div className="text-center p-10 text-xs text-slate-400 font-medium italic">No active KOTs.</div>}
                            </div>
                            <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0">
                                <div className="flex justify-between items-end mb-3 text-slate-900">
                                    <div><span className="text-xs font-bold uppercase tracking-widest text-slate-500 block">Total Items</span><span className="text-xl font-black">{runningOrder.length}</span></div>
                                    <div className="text-right"><span className="text-xs font-bold uppercase tracking-widest text-slate-500 block">Running Total</span><span className="text-xl font-black">₹{runningTotal}</span></div>
                                </div>
                                <button onClick={saveRunningChanges} disabled={!runningOrder.length || loading} className="w-full py-4 bg-blue-600 text-white font-black rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 text-sm uppercase tracking-widest flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin"/> : <Save size={18}/>}{loading ? 'Saving...' : 'Save Changes'}</button>
                            </div>
                        </div>
                    )}
                </div>
            </>
        )}
      </main>
      
      {noteModal.show && (
          <Modal isOpen={true} title="Add Note" onClose={()=>setNoteModal({show:false})}>
              <div className="flex flex-wrap gap-2 mb-4">{GUJARATI_PRESETS.map(p => (<button key={p} onClick={()=>{const old = noteModal.text || ''; setNoteModal({...noteModal, text: old.includes(p) ? old.replace(p,'').trim() : `${old} ${p}`.trim()})}} className={`px-3 py-2 border rounded-xl text-xs font-bold transition-colors ${noteModal.text.includes(p) ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>{p}</button>))}</div>
              <textarea value={noteModal.text} onChange={e=>setNoteModal({...noteModal, text:e.target.value})} className="w-full border rounded-xl p-3 text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-slate-200 resize-none" rows={4} placeholder="Type custom note..."/>
              <button onClick={()=>{setCart(p=>p.map((x,i)=>i===noteModal.index ? {...x, note:noteModal.text} : x)); setNoteModal({show:false});}} className="w-full mt-4 py-4 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest shadow-lg">Save Note</button>
          </Modal>
      )}
      
      {confirmModal && (
          <Modal isOpen={true} title="Confirm Order" onClose={()=>setConfirmModal(false)}>
              <div className="text-center mb-6"><div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in"><Printer size={32}/></div><p className="font-bold text-slate-600 text-lg">Print KOT for Table {selectedTable?.table_no}?</p></div>
              <div className="grid grid-cols-2 gap-4"><button onClick={()=>setConfirmModal(false)} className="py-4 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase tracking-wide hover:bg-slate-200">Cancel</button><button onClick={handleSendKOT} className="py-4 bg-orange-600 text-white rounded-xl font-bold uppercase tracking-wide shadow-lg shadow-orange-200 hover:bg-orange-700">Yes, Print</button></div>
          </Modal>
      )}
      
      <div className="fixed bottom-1 left-3 text-[9px] text-slate-400 font-bold uppercase tracking-widest z-[60]">Powered by <span className="text-orange-600 font-black">CIPRA INFOTECH</span></div>
    </div>
  );
};

export default WaiterDashboard;