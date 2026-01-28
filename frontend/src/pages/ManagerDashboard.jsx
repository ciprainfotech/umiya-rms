import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  LayoutGrid, Receipt, Utensils, Users, LogOut, 
  Printer, X, Search, Plus, Trash2, Edit3, 
  Clock, ChevronLeft, ChevronRight, Eye, EyeOff,
  Coffee, Calendar, CheckCircle2, AlertCircle, ArrowUpDown, MessageSquare,
  List, FolderCog, Save
} from 'lucide-react';
import api from '../api/axios';

// --- CONSTANTS & CONFIG ---
const RESTAURANT_INFO = {
    name: "HOTEL UMIYA KATHIYAVADI",
    address: "VASAD ROAD, BORSAD",
    gstin: "24BLGPK9761G1ZV",
    footer_msg: "પધારજો, ફરી પધારજો!",
    contact: "Mo: 98989 98989"
};

const GUJARATI_PRESETS = ['મોળું', 'મીડિયમ', 'તીખું', 'લસણ વગર', 'ડુંગળી વગર', 'તેલ ઓછું', 'કડક', 'જૈન'];

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
const DataTable = ({ data, columns, onRowClick, actions, searchKeys = ['name'] }) => {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [query, setQuery] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const filteredData = useMemo(() => data.filter(item => searchKeys.some(key => String(item[key] || '').toLowerCase().includes(query.toLowerCase()))), [data, query, searchKeys]);
  
  const sortedData = useMemo(() => {
      let items = [...filteredData];
      if(sortConfig.key) items.sort((a,b) => { 
          if(a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1; 
          if(a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1; 
          return 0; 
      });
      return items;
  }, [filteredData, sortConfig]);

  const requestSort = (key) => setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
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

// --- LOGIC: ACTIVE BILLING SESSION ---
const BillingSession = ({ table, menuItems, onClose, onUpdate, notify, setPrintData }) => {
    const [cart, setCart] = useState(table.items || []);
    const [code, setCode] = useState("");
    const [qty, setQty] = useState(1);
    const [currentOrderId, setCurrentOrderId] = useState(table.active_order_id);
    const [customer, setCustomer] = useState(table.customer_name || "");
    const [phone, setPhone] = useState(table.customer_phone || "");
    const [address, setAddress] = useState(table.customer_address || "");
    
    const [identifiedItem, setIdentifiedItem] = useState(null);
    const [isHalf, setIsHalf] = useState(false);
    const [isJain, setIsJain] = useState(false);
    const [note, setNote] = useState("");
    const [showNoteModal, setShowNoteModal] = useState(false);

    const codeRef = useRef(null);
    const qtyRef = useRef(null);

    const total = cart.reduce((acc, item) => {
    const { fulls, halves } = decodeQuantity(item.quantity);
    const price = safeNum(item.price_at_time) || safeNum(table.is_ac ? item.price_ac : item.price_non_ac);
    return acc + (fulls * price) + (halves * Math.ceil(price * 0.6));
}, 0);

    useEffect(() => { setTimeout(() => codeRef.current?.focus(), 100); }, []);
    
    useEffect(() => {
        const handleKeys = (e) => {
            if(e.key === 'Insert') { e.preventDefault(); printKOT(); }
            if(e.key === 'End') { e.preventDefault(); settleBill(); }
            if(e.key === 'Escape' && !showNoteModal) { e.preventDefault(); onClose(); }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [cart, code, customer, phone, address, currentOrderId, showNoteModal]);

    const lookupItem = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const cleanCode = String(code).trim().toLowerCase();
        const item = menuItems.find(m => String(m.item_code).trim().toLowerCase() === cleanCode);
        if (item) {
          setIdentifiedItem(item);
          setIsHalf(false); setIsJain(false); setNote(""); setQty(1);
          setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, 50);
        } else {
          notify("Invalid Item Code", "error");
          setIdentifiedItem(null); setCode("");
        }
      }
    };

    const addItem = async () => {
      if (!identifiedItem) return;
      // 0.6 + 0.6 = 1.2 (2 halves). KATHIYAWADI LOGIC
      const delta = isHalf ? 0.6 : safeNum(qty);
      let finalNote = note;
      if (isJain) finalNote = finalNote ? `Jain, ${finalNote}` : "Jain";

      try {
        const res = await api.post('/orders/add-item', { 
            table_id: table.id, 
            item_code: identifiedItem.item_code, 
            quantity: delta, 
            special_instruction: finalNote 
        });
        if(res.data.orderId) setCurrentOrderId(res.data.orderId);
        onUpdate();
        refreshCart(res.data.orderId || currentOrderId);
        setCode(""); setQty(1); setIdentifiedItem(null); setIsHalf(false); setIsJain(false); setNote(""); 
        codeRef.current?.focus();
      } catch (e) { notify(e.response?.data?.message || "Error adding item", "error"); }
    };

    const deleteItemByCode = async () => {
        if (!code) return notify("Enter Code", "error");
        try {
            await api.post('/orders/delete-by-code', { table_id: table.id, item_code: code });
            notify("Item Removed", "success");
            refreshCart(currentOrderId);
            setCode("");
            codeRef.current?.focus();
        } catch(e) { notify(e.response?.data?.message || "Delete failed", "error"); }
    };

    const refreshCart = async (oid) => {
        let oidToUse = oid || currentOrderId;
        if(!oidToUse) {
             const tRes = await api.get('/orders/tables');
             const tData = tRes.data.find(t => t.id === table.id);
             if(tData) oidToUse = tData.active_order_id;
        }
        if(oidToUse) {
            setCurrentOrderId(oidToUse);
            const detailsRes = await api.get(`/orders/details/${oidToUse}`);
            setCart(detailsRes.data);
        } else { setCart([]); }
    };

    const printKOT = () => {
        if(cart.length === 0) return notify("Cart is empty", "error");
        setPrintData({ table, items: cart, type: 'KOT', customer, billNo: 'KOT', date: new Date() });
        setTimeout(() => { window.print(); notify("KOT Sent", "success"); onClose(); }, 300);
    };

    const settleBill = async () => {
        if (!cart.length) return notify("Cart is empty", "error");
        if (!currentOrderId) return notify("Order ID missing", "error");
        try {
            await api.post('/orders/settle', { tableId: table.id, orderId: currentOrderId, customer_name: customer, customer_phone: phone, customer_address: address });
            notify("Bill Settled", "success");
            await api.post('/print/bill', { restaurant_info: RESTAURANT_INFO, table: table, items: cart, customer: customer, bill_no: currentOrderId, total_amount: total });
            notify("Print Command Sent", "success");
            onUpdate(); onClose();
        } catch(e) { console.error(e); notify("Settlement or Printing Failed", "error"); }
    };

    return (
      <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-200" onClick={onClose}>
        <div className="bg-white w-full max-w-7xl h-full md:h-[90vh] md:rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-slate-200" onClick={e=>e.stopPropagation()}>
          <div className="w-full md:w-2/3 flex flex-col border-r border-slate-100 bg-slate-50/50">
             <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
                <div><h2 className="text-2xl font-black text-slate-800 tracking-tight">TABLE {table.table_no}</h2><p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mt-1">{table.is_ac ? 'AC Section' : 'Non-AC Section'}</p></div>
                <div className="flex gap-8 text-right">
                    <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Items</span>
                        <div className="text-4xl font-black text-slate-700 leading-none">{cart.length}</div>
                    </div>
                    <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Amount</span>
                        <div className="text-4xl font-black text-blue-600 leading-none">₹{total.toFixed(0)}</div>
                    </div>
                </div>
             </div>
             <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                   <thead className="text-[10px] uppercase font-bold text-slate-400"><tr><th className="pl-4 pb-2">Item Name</th><th className="pb-2 text-center">Qty</th><th className="text-right pb-2">Rate</th><th className="pr-4 pb-2 text-right">Total</th></tr></thead>
                   <tbody>
                      {cart.map((item, idx) => {
    const { fulls, halves } = decodeQuantity(item.quantity);
    
    // FIX: Robust Rate Calculation
    // 1. Use 'price_at_time' if available (Existing DB Item)
    // 2. Fallback to 'price_ac' or 'price_non_ac' (New Menu Item)
    let rate = safeNum(item.price_at_time);
    if (rate === 0) {
        rate = safeNum(table.is_ac ? item.price_ac : item.price_non_ac);
    }

    return (
    <React.Fragment key={idx}>
        {fulls > 0 && (
            <tr className="bg-white shadow-sm rounded-xl">
                <td className="py-4 pl-4 font-bold text-slate-700 rounded-l-xl">
                    {item.name} 
                    {item.special_instruction && <div className="text-[10px] text-blue-500 font-normal italic flex items-center gap-1"><MessageSquare size={8}/> {item.special_instruction}</div>}
                </td>
                <td className="py-4 text-center font-bold text-slate-800">{fulls}</td>
                <td className="py-4 text-right font-medium text-slate-500">₹{rate.toFixed(0)}</td>
                <td className="py-4 pr-4 text-right font-black text-slate-900 rounded-r-xl">₹{(fulls * rate).toFixed(0)}</td>
            </tr>
        )}
        {halves > 0 && (
            <tr className="bg-amber-50 shadow-sm rounded-xl border border-amber-100">
                <td className="py-4 pl-4 font-bold text-slate-700 rounded-l-xl">
                    {item.name} 
                    <span className="bg-amber-200 text-amber-800 text-[9px] px-1 rounded font-bold ml-1">HALF x {halves}</span>
                </td>
                <td className="py-4 text-center font-bold text-slate-800">{halves}</td>
                <td className="py-4 text-right font-medium text-slate-500">₹{Math.ceil(rate * 0.6)}</td>
                <td className="py-4 pr-4 text-right font-black text-slate-900 rounded-r-xl">₹{(halves * Math.ceil(rate * 0.6)).toFixed(0)}</td>
            </tr>
        )}
    </React.Fragment>
    );
})}
                      {cart.length === 0 && <tr><td colSpan={4} className="text-center py-20 text-slate-400 font-medium italic">Cart is empty.</td></tr>}
                   </tbody>
                </table>
             </div>
             <div className="p-6 bg-white border-t border-slate-200 flex gap-4 shrink-0"><button onClick={printKOT} className="flex-1 py-4 bg-slate-800 text-white font-black uppercase rounded-xl hover:bg-black transition-all shadow-lg text-xs tracking-widest flex items-center justify-center gap-2"><Printer size={16}/> Print KOT (Ins)</button><button onClick={settleBill} className="flex-1 py-4 bg-blue-600 text-white font-black uppercase rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 text-xs tracking-widest flex items-center justify-center gap-2"><CheckCircle2 size={16}/> Settle Bill (End)</button></div>
          </div>
          <div className="w-full md:w-1/3 bg-white p-6 md:p-8 flex flex-col z-10 shadow-xl overflow-y-auto relative">
             <div className="flex justify-end mb-4"><button onClick={onClose} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full"><X size={24}/></button></div>
             <div className="space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-3"><div className="col-span-2"><input className="w-full border-b border-slate-200 py-2 outline-none font-bold text-sm focus:border-blue-500 bg-transparent" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="M/s (Guest Name)" /></div><div><input className="w-full border-b border-slate-200 py-2 outline-none text-xs focus:border-blue-500 bg-transparent" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" /></div><div><input className="w-full border-b border-slate-200 py-2 outline-none text-xs focus:border-blue-500 bg-transparent" value={address} onChange={e => setAddress(e.target.value)} placeholder="Address" /></div></div>
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-inner space-y-4 mt-4 relative">
                   <div><label className="text-[10px] font-bold uppercase text-blue-500 tracking-widest block mb-1">Item Code</label><input ref={codeRef} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xl font-black outline-none focus:border-blue-500 uppercase" value={code} onChange={e => setCode(e.target.value)} onKeyDown={(e) => { if(e.key === 'Escape') onClose(); if(e.key==='Delete'){deleteItemByCode(); return;} lookupItem(e); }} placeholder="000" /></div>
                   {identifiedItem && (
                       <div className="animate-in slide-in-from-top-2 fade-in">
                           <div className="text-xs font-bold text-blue-800 bg-blue-100 p-3 rounded-xl flex justify-between mb-3"><span>{identifiedItem.name}</span><span>₹{safeNum(table.is_ac ? identifiedItem.price_ac : identifiedItem.price_non_ac).toFixed(0)}</span></div>
                           <div className="flex gap-2 mb-3">
                               {identifiedItem.is_half_available && <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border cursor-pointer select-none transition-colors ${isHalf ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-500'}`}><input type="checkbox" checked={isHalf} onChange={e => setIsHalf(e.target.checked)} className="hidden" /><span className="text-[10px] font-black uppercase">Make Half</span></label>}
                               {identifiedItem.is_jain_available && <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border cursor-pointer select-none transition-colors ${isJain ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white border-slate-200 text-slate-500'}`}><input type="checkbox" checked={isJain} onChange={e => setIsJain(e.target.checked)} className="hidden" /><span className="text-[10px] font-black uppercase">Jain / Swami</span></label>}
                           </div>
                           <button onClick={() => setShowNoteModal(true)} className="w-full py-2 mb-3 bg-slate-200 hover:bg-slate-300 rounded-lg text-xs font-bold text-slate-600 flex items-center justify-center gap-2"><MessageSquare size={14}/> {note ? 'Edit Note' : 'Add Special Instruction'}</button>
                           {note && <div className="text-[9px] bg-yellow-50 text-yellow-800 p-1.5 rounded border border-yellow-200 mb-3 font-medium">{note}</div>}
                           <div><label className="text-[10px] font-bold uppercase text-blue-500 tracking-widest block mb-1">Quantity</label><input ref={qtyRef} type="number" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xl font-black outline-none focus:border-blue-500 text-center" value={qty} onChange={e => setQty(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') addItem(); }} /></div>
                       </div>
                   )}
                   <div className="grid grid-cols-2 gap-2 mt-2"><button type="button" onClick={addItem} className="py-3 bg-slate-900 text-white font-black rounded-xl shadow-lg hover:bg-black text-[10px] uppercase tracking-widest">Add (Enter)</button><button type="button" onClick={deleteItemByCode} className="py-3 bg-red-100 text-red-600 font-black rounded-xl hover:bg-red-200 text-[10px] uppercase tracking-widest">Delete (Del)</button></div>
                </div>
             </div>
             {showNoteModal && (
                <div className="absolute inset-0 bg-white z-20 flex flex-col p-4 animate-in fade-in">
                    <h3 className="font-black text-lg mb-4">Add Note</h3>
                    <div className="flex flex-wrap gap-2 mb-4">{GUJARATI_PRESETS.map(p => (<button key={p} onClick={() => { const i = (note||"").split(', ').filter(x=>x); const n = i.includes(p)?i.filter(x=>x!==p).join(', '):(note?`${note}, ${p}`:p); setNote(n); }} className={`px-3 py-2 rounded border text-xs font-bold ${note.includes(p) ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{p}</button>))}</div>
                    <textarea value={note} onChange={e => setNote(e.target.value)} className="w-full flex-1 border rounded-xl p-3 text-sm font-bold bg-slate-50 mb-4" placeholder="Custom note..."></textarea>
                    <button onClick={() => setShowNoteModal(false)} className="py-3 bg-slate-900 text-white font-bold rounded-xl">Done</button>
                </div>
             )}
          </div>
        </div>
      </div>
    );
};

// --- LOGIC: HISTORY EDITOR (REDUNDANT DB SCHEMA SUPPORT) ---
// This component relies on the snapshot data (price_at_time) stored in the order line, 
// allowing safe deletion of menu items without breaking history.
const HistoryEditor = ({ bill, menuItems, onClose, setPrintData, notify, onUpdate }) => {
    const [splitItems, setSplitItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [custName, setCustName] = useState(bill.customer_name || "");
    const [custPhone, setCustPhone] = useState(bill.customer_phone || "");
    const [custAddr, setCustAddr] = useState(bill.customer_address || "");
    
    const [code, setCode] = useState("");
    const [qty, setQty] = useState(1);
    const [identifiedItem, setIdentifiedItem] = useState(null);
    const [isHalf, setIsHalf] = useState(false);

    const codeRef = useRef(null);
    const qtyRef = useRef(null);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await api.get(`/orders/details/${bill.id}`);
                let processed = [];
                res.data.forEach(item => {
                    const { fulls, halves } = decodeQuantity(item.quantity);
                    // We use price_at_time for history consistency
                    if (fulls > 0) processed.push({ 
                        ...item, quantity: fulls, variant: 'Full', 
                        price_at_time: safeNum(item.price_at_time) 
                    });
                    if (halves > 0) processed.push({ 
                        ...item, quantity: halves, variant: 'Half', 
                        price_at_time: Math.ceil(safeNum(item.price_at_time)*0.6) 
                    });
                });
                setSplitItems(processed);
            } catch (e) { notify("Failed to load", "error"); onClose(); } finally { setLoading(false); }
        };
        load();
        setTimeout(() => codeRef.current?.focus(), 500); 
    }, [bill]);

    useEffect(() => {
        const handleKeys = (e) => {
            if(e.key === 'Escape') onClose();
            if(e.key === 'End') saveChanges();
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [splitItems, custName]);

    const handleLookup = (e) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            const cleanCode = String(code).trim().toLowerCase();
            const item = menuItems.find(m => String(m.item_code).trim().toLowerCase() === cleanCode);
            if(item) {
                setIdentifiedItem(item);
                setQty(1); setIsHalf(false);
                setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, 50);
            } else notify("Item not found", "error");
        }
        if(e.key === 'Delete') { e.preventDefault(); deleteByCode(); }
    };

    const handleModifyItem = () => {
        if(!identifiedItem) return;
        const inputQty = Number(qty);
        
        setSplitItems(prev => {
            let copy = [...prev];
            const itemCode = identifiedItem.item_code;
            
            // Calculate current quantity for this specific item code
            let currentTotalFloat = 0;
            copy.filter(i => i.item_code === itemCode).forEach(i => {
                currentTotalFloat += (i.variant === 'Half' ? (i.quantity * 0.6) : i.quantity);
            });

            const steps = Math.abs(inputQty);
            for(let s=0; s<steps; s++) {
                const { halves } = decodeQuantity(currentTotalFloat);
                if (isHalf) {
                    if (inputQty > 0) currentTotalFloat += 0.6;
                    else currentTotalFloat -= (halves > 0 ? 0.6 : 0.4);
                } else {
                    currentTotalFloat += (inputQty > 0 ? 1.0 : -1.0);
                }
            }

            // Remove all instances of this item and re-add based on new total
            let otherItems = copy.filter(i => i.item_code !== itemCode);
            if (currentTotalFloat > 0.1) {
                const { fulls, halves } = decodeQuantity(currentTotalFloat);
                // When adding NEW items to history, we take current menu price
                if (fulls > 0) otherItems.push({ 
                    ...identifiedItem, item_id: identifiedItem.id, quantity: fulls, variant: 'Full', 
                    price_at_time: safeNum(identifiedItem.price_non_ac) 
                });
                if (halves > 0) otherItems.push({ 
                    ...identifiedItem, item_id: identifiedItem.id, quantity: halves, variant: 'Half', 
                    price_at_time: Math.ceil(safeNum(identifiedItem.price_non_ac) * 0.6) 
                });
            }
            
            notify(`Updated ${identifiedItem.name}`, "success");
            return otherItems;
        });
        
        setCode(""); setQty(1); setIdentifiedItem(null); setIsHalf(false);
        codeRef.current?.focus();
    };

    const deleteByCode = () => {
        if(!code) return;
        setSplitItems(prev => prev.filter(i => i.item_code !== code));
        notify("Item Removed by Code", "success");
        setCode("");
        codeRef.current?.focus();
    };

    const removeItem = (index) => setSplitItems(prev => prev.filter((_, i) => i !== index));

    const saveChanges = async () => {
        try {
           const groups = {};
           splitItems.forEach(i => {
               // Grouping logic to merge separate lines back into DB format
               // Uses item_id OR raw id if available
               const key = i.item_id || i.id; 
               if(!groups[key]) {
                   groups[key] = {
                       item_id: key,
                       quantity: 0,
                       // Revert half price to full base price for DB storage logic
                       price_at_time: i.variant === 'Half' ? Math.round(i.price_at_time / 0.6) : i.price_at_time,
                       special_instruction: i.special_instruction || ''
                   };
               }
               const contribution = i.variant === 'Half' ? (i.quantity * 0.6) : i.quantity;
               groups[key].quantity += contribution;
           });
           const finalItems = Object.values(groups);
           await api.put(`/orders/${bill.id}`, { customer_name: custName, customer_phone: custPhone, customer_address: custAddr, items: finalItems }); 
           notify("Bill Updated Successfully", "success"); onUpdate(); onClose();
        } catch (e) { notify("Save Failed", "error"); }
    };

    const handleReprint = () => {
        const printItems = splitItems.map(i => ({
             ...i,
             quantity: i.variant === 'Half' ? (i.quantity * 0.6) : i.quantity,
             price_at_time: i.variant === 'Half' ? Math.round(i.price_at_time / 0.6) : i.price_at_time
        }));
        setPrintData({ 
            table: { table_no: bill.table_no, is_ac: false },
            items: printItems, type: 'BILL', customer: custName, phone: custPhone, address: custAddr, billNo: bill.id, date: bill.created_at 
        });
        setTimeout(() => { window.print(); }, 300);
    };

    const total = splitItems.reduce((acc, i) => acc + (i.quantity * i.price_at_time), 0);
    if(loading) return <div className="fixed inset-0 z-[2000] bg-black/50 flex justify-center items-center text-white">Loading...</div>;

    return (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white w-full max-w-7xl h-full md:h-[90vh] md:rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-slate-200" onClick={e=>e.stopPropagation()}>
                <div className="w-full md:w-2/3 flex flex-col border-r border-slate-100 bg-slate-50/50">
                    <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
                        <div><h2 className="text-2xl font-black text-slate-800 tracking-tight">EDIT BILL #{bill.id}</h2><p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mt-1">Table {bill.table_no}</p></div>
                        <div className="flex gap-8 text-right">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Items</span>
                                <div className="text-4xl font-black text-slate-700 leading-none">{splitItems.length}</div>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Amount</span>
                                <div className="text-4xl font-black text-blue-600 leading-none">₹{total.toFixed(0)}</div>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                            <thead className="text-[10px] uppercase font-bold text-slate-400"><tr><th className="pl-4 pb-2">Item Name</th><th className="pb-2 text-center">Qty</th><th className="text-right pb-2">Rate</th><th className="pr-4 pb-2 text-right">Total</th><th className="pb-2 text-right"></th></tr></thead>
                            <tbody>
                                {splitItems.map((item, idx) => (
                                    <tr key={idx} className={`shadow-sm rounded-xl ${item.variant==='Half' ? 'bg-amber-50 border border-amber-100' : 'bg-white'}`}>
                                        <td className="py-4 pl-4 font-bold text-slate-700 rounded-l-xl">{item.name} {item.variant==='Half' && <span className="bg-amber-200 text-amber-800 text-[9px] px-1 rounded font-bold ml-1">HALF</span>}</td>
                                        <td className="py-4 text-center font-bold">{item.quantity}</td>
                                        <td className="py-4 text-right font-medium text-slate-500">₹{safeNum(item.price_at_time).toFixed(0)}</td>
                                        <td className="py-4 pr-4 text-right font-black text-slate-900">₹{(item.quantity * item.price_at_time).toFixed(0)}</td>
                                        <td className="py-4 pr-4 text-right rounded-r-xl"><button onClick={()=>removeItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-6 bg-white border-t border-slate-200 flex gap-4 shrink-0">
                        <button onClick={handleReprint} className="flex-1 py-4 bg-slate-200 text-slate-800 font-black uppercase rounded-xl hover:bg-slate-300 transition-all text-xs tracking-widest flex items-center justify-center gap-2"><Printer size={16}/> Reprint Bill</button>
                        <button onClick={saveChanges} className="flex-1 py-4 bg-blue-600 text-white font-black uppercase rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 text-xs tracking-widest flex items-center justify-center gap-2"><CheckCircle2 size={16}/> Save Changes (End)</button>
                    </div>
                </div>

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
      const [t, m, h, w, c] = await Promise.all([
          api.get('/orders/tables'), 
          api.get('/orders/menu'), 
          api.get('/orders/history'), 
          api.get('/orders/waiters'),
          api.get('/orders/categories')
      ]);
      setTables(t.data.sort((a,b) => a.table_no.localeCompare(b.table_no, undefined, { numeric: true })));
      setMenu(m.data);
      setHistory(h.data);
      setWaiters(w.data);
      setCategories(c.data);
    } catch (e) { console.error(e); notify("Backend Offline", "error"); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  
  // Shortcuts & Focus
  useEffect(() => { if(activeTab === 'floor' && !activeOrder && !modalForm) floorInputRef.current?.focus(); }, [activeTab, activeOrder, modalForm]);
  useEffect(() => {
    const handleGlobalKeys = (e) => {
      if (activeOrder || viewHistoryBill || modalForm || confirmModal.show) return;
      if (e.altKey) {
        if (e.key === '1') setActiveTab('floor');
        if (e.key === '2') setActiveTab('history');
        if (e.key === '3') setActiveTab('menu');
        if (e.key === '4') setActiveTab('waiters');
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
           {[ { id: 'floor', label: 'Floor Map', icon: LayoutGrid, key: '1' }, { id: 'history', label: 'History', icon: Receipt, key: '2' }, { id: 'menu', label: 'Menu List', icon: Coffee, key: '3' }, { id: 'waiters', label: 'Staff', icon: Users, key: '4' } ].map(item => (
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
                       const isOcc = t.status === 'occupied';
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
      </main>

      {/* OVERLAY MODALS */}
      {activeOrder && <BillingSession table={activeOrder} menuItems={menu} onClose={() => { setActiveOrder(null); fetchData(); }} onUpdate={fetchData} notify={notify} setPrintData={setPrintData} />}
      {viewHistoryBill && !activeOrder && <HistoryEditor bill={viewHistoryBill} menuItems={menu} onClose={() => setViewHistoryBill(null)} setPrintData={setPrintData} notify={notify} onUpdate={fetchData} />}
      
      {/* UNIVERSAL FORM MODAL */}
      {modalForm && (
         <div className="fixed inset-0 z-[3000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
               <h3 className="text-xl font-black uppercase text-slate-800 mb-8 border-b pb-4 tracking-tight flex justify-between items-center">
                   <span>{modalForm.data.id ? 'Edit' : 'Add'} {modalForm.type === 'menu' ? 'Item' : modalForm.type === 'categories' ? 'Category' : modalForm.type === 'table' ? 'Table' : 'Staff'}</span>
                   <button onClick={() => setModalForm(null)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
               </h3>
               
               {/* CATEGORY MANAGEMENT SPECIFIC VIEW */}
               {modalForm.type === 'categories' ? (
                   <div className="space-y-4">
                       <form onSubmit={async (e) => {
                           e.preventDefault();
                           const name = e.target.catName.value;
                           try { await api.post('/orders/categories', { name }); notify("Category Added"); e.target.reset(); fetchData(); }
                           catch(err) { notify("Failed to add category", "error"); }
                       }} className="flex gap-2">
                           <input name="catName" className="flex-1 p-3 bg-slate-50 border rounded-xl font-bold" placeholder="New Category Name" required />
                           <button type="submit" className="bg-blue-600 text-white p-3 rounded-xl"><Plus/></button>
                       </form>
                       <div className="max-h-60 overflow-y-auto space-y-2 border-t pt-2">
                           {categories.map(c => (
                               <div key={c.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                                   <span className="font-bold text-slate-700">{c.name}</span>
                                   <button onClick={() => {
                                       setConfirmModal({
                                           show: true,
                                           title: "Delete Category?",
                                           message: `Delete "${c.name}"? Items in this category might become uncategorized.`,
                                           onConfirm: async () => {
                                               try { await api.delete(`/orders/categories/${c.id}`); fetchData(); notify("Category Deleted"); }
                                               catch(err) { notify("Failed delete", "error"); }
                                               setConfirmModal({show:false});
                                           },
                                           onCancel: () => setConfirmModal({show:false})
                                       })
                                   }} className="text-red-500 hover:bg-red-100 p-2 rounded"><Trash2 size={16}/></button>
                               </div>
                           ))}
                       </div>
                   </div>
               ) : (
                /* GENERIC FORM FOR MENU, STAFF, TABLES */
               <form onSubmit={async (e) => {
                  e.preventDefault();
                  const payload = new FormData(e.target);
                  // Defaults
                  if(modalForm.type === 'menu') { 
                      if(!payload.has('is_half_available')) payload.append('is_half_available', 'false'); 
                      if(!payload.has('is_jain_available')) payload.append('is_jain_available', 'false'); 
                  }
                  if(modalForm.type === 'table' && !payload.has('is_ac')) payload.append('is_ac', 'false');
                  
                  const data = Object.fromEntries(payload.entries());
                  let endpoint = modalForm.type === 'menu' ? '/orders/menu' : modalForm.type === 'staff' ? '/orders/waiters' : '/orders/tables';
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
                            {/* Strict Category Selection */}
                            <div className="relative">
                                <select name="category" defaultValue={modalForm.data.category || ""} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none appearance-none" required>
                                    <option value="" disabled>Select Category</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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
                  {modalForm.type === 'staff' && (<><input name="username" defaultValue={modalForm.data.username} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" placeholder="Username" required /><div className="relative"><input name="password" type={showPassword ? "text" : "password"} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" placeholder={modalForm.data.id ? "New Password" : "Password"} required={!modalForm.data.id} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400">{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></>)}
                  {modalForm.type === 'table' && (<><input name="table_no" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" placeholder="Table Number (e.g. 10)" required /><div className="flex items-center gap-2 mt-2"><input type="checkbox" name="is_ac" value="true" className="w-5 h-5 accent-blue-600"/><label className="font-bold text-sm">Is AC Table?</label></div></>)}
                  
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