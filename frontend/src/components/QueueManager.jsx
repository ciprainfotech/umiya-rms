import React, { useState, useEffect, useCallback } from 'react';
import { Users, Clock, Plus, Trash2, CheckCircle2, Edit3, X, Coffee } from 'lucide-react';
import api from '../api/axios';

// --- HELPER COMPONENTS ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => { 
      if(!message) return;
      const t = setTimeout(onClose, 3000); 
      return () => clearTimeout(t); 
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div className={`fixed top-4 right-4 z-[6000] px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-right text-white font-bold flex gap-3 items-center ${type==='error'?'bg-red-600':'bg-slate-900'}`}>
        <span>{message}</span>
    </div>
  );
};

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[5100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
        <h3 className="text-lg font-black text-slate-800 uppercase mb-2">{title}</h3>
        <p className="text-slate-500 text-sm font-medium mb-6">{message}</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancel</button>
          <button onClick={onConfirm} className="py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700">Confirm</button>
        </div>
      </div>
    </div>
  );
};

const WaitingTimer = ({ startTime }) => {
  const [label, setLabel] = useState("");
  useEffect(() => {
    // Safety check
    if (!startTime) return;
    
    const update = () => {
        const diff = Math.floor((new Date() - new Date(startTime)) / 60000);
        const h = Math.floor(diff/60);
        const m = diff%60;
        setLabel(`${h>0?h+'h ':''}${m}m`);
    };
    
    update();
    const i = setInterval(update, 60000); // 1 minute interval is enough
    return () => clearInterval(i);
  }, [startTime]);
  return <span className="font-mono">{label || '0m'}</span>;
};

// --- MAIN COMPONENT ---
const QueueManager = ({ tables = [] }) => {
    const [viewMode, setViewMode] = useState('live');
    const [historyDate, setQueueHistoryDate] = useState(new Date().toISOString().split('T')[0]);
    const [queueData, setQueueData] = useState([]);
    const [notification, setNotification] = useState({ msg: '', type: '' });
    const [confirmModal, setConfirmModal] = useState({ show: false });
    const [modalForm, setModalForm] = useState(null);

    const notify = (msg, type='success') => setNotification({ msg, type });

    // FIX: Dependency array must be EMPTY to prevent recreation on every render
    const fetchQueue = useCallback(async () => {
        try {
            const res = await api.get('/orders/waiting-queue');
            // Only update if data is actually different (optional optimization)
            setQueueData(res.data);
        } catch (e) { console.error("Queue Fetch Error", e); }
    }, []);

    // FIX: Only depend on fetchQueue (which is stable)
    useEffect(() => {
        fetchQueue();
        const poll = setInterval(fetchQueue, 10000);
        return () => clearInterval(poll);
    }, [fetchQueue]);

    // Derived Logic (Safe to run on render)
    const liveList = queueData
        .filter(i => !i.status || i.status === 'waiting')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const historyList = queueData
        .filter(i => (i.status === 'seated' || i.status === 'cancelled') && i.created_at.startsWith(historyDate))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const occupiedTables = tables.filter(t => t.status === 'occupied').length || 1;
    const turnoverRate = 45 / occupiedTables;

    const handleStatusChange = async (item, newStatus) => {
        try {
            await api.put(`/orders/waiting-queue/${item.id}`, { status: newStatus });
            notify(`Guest marked as ${newStatus}`);
            fetchQueue();
        } catch (e) { notify("Update failed", "error"); }
    };

    const handleEdit = (item) => setModalForm({ type: 'waiting', data: item });

    const handleSave = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        const id = modalForm.data.id;
        
        try {
            if(id) {
                await api.put(`/orders/waiting-queue/${id}`, data);
                notify("Updated Successfully");
            } else {
                await api.post('/orders/waiting-queue', data);
                notify("Added to Waitlist");
            }
            setModalForm(null);
            fetchQueue();
        } catch(err) { notify("Failed to save", "error"); }
    };

    const handleDelete = async (id) => {
        try {
             await api.delete(`/orders/waiting-queue/${id}`);
             notify("Deleted permanently");
             fetchQueue();
        } catch(e) { notify("Delete failed", "error"); }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 font-sans overflow-hidden relative">
            <Toast message={notification.msg} type={notification.type} onClose={() => setNotification({ msg: '', type: '' })} />
            <ConfirmModal isOpen={confirmModal.show} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={confirmModal.onCancel} />

            {/* HEADER */}
            <div className="bg-white px-4 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3 shrink-0 shadow-sm z-20">
                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <button onClick={() => setViewMode('live')} className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'live' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Live Queue</button>
                        <button onClick={() => setViewMode('history')} className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>History</button>
                    </div>
                    {viewMode === 'live' && (
                        <div className="hidden sm:flex gap-2 text-[10px] font-bold uppercase tracking-wide">
                            <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded border border-orange-100">Waiting: {liveList.length}</span>
                            <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100">Est: ~{Math.round(liveList.length * turnoverRate)}m</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {viewMode === 'live' ? (
                        <button onClick={() => setModalForm({ type: 'waiting', data: {} })} className="px-4 py-2 bg-slate-900 text-white rounded-lg font-black text-[10px] flex items-center gap-2 hover:bg-black shadow-md uppercase tracking-widest active:scale-95 transition-all">
                            <Plus size={14}/> Add Walk-In
                        </button>
                    ) : (
                        <input type="date" value={historyDate} onChange={(e) => setQueueHistoryDate(e.target.value)} className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none shadow-sm" />
                    )}
                </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-hidden relative bg-slate-100/50">
                {viewMode === 'live' && (
                    <div className="h-full overflow-y-auto p-4 custom-scrollbar">
                        {liveList.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-60"><Coffee size={48} className="mb-3" /><span className="text-xs font-black uppercase tracking-widest">Queue is Empty</span></div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 pb-20">
                                {liveList.map((guest, index) => {
                                    const isNext = index === 0;
                                    const estWait = Math.round((index + 1) * turnoverRate);
                                    return (
                                        <div key={guest.id} className={`bg-white rounded-xl p-4 border shadow-sm flex flex-col group transition-all hover:shadow-md ${isNext ? 'border-green-400 ring-2 ring-green-50' : 'border-slate-200'}`}>
                                            <div className="flex justify-between items-start mb-3">
                                                <div className={`flex flex-col items-center justify-center w-10 h-10 rounded-lg border shrink-0 ${isNext ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                                    <span className="text-[8px] font-bold uppercase opacity-60">No.</span>
                                                    <span className="text-lg font-black leading-none">{index + 1}</span>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs font-black text-slate-800 flex items-center justify-end gap-1"><Clock size={12}/> <WaitingTimer startTime={guest.created_at} /></div>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase">Waited</span>
                                                </div>
                                            </div>
                                            <div className="mb-4">
                                                <h3 className="text-sm font-black text-slate-800 capitalize truncate mb-1.5">{guest.customer_name}</h3>
                                                <div className="flex flex-wrap gap-1.5">
                                                    <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold uppercase text-slate-600 border border-slate-200 flex items-center gap-1"><Users size={10}/> {guest.person_count}</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${guest.preference === 'AC' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{guest.preference || 'Any'}</span>
                                                    <span className="px-1.5 py-0.5 bg-slate-50 rounded text-[9px] font-bold uppercase text-slate-400 border border-slate-100">~{estWait}m</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-1.5 mt-auto pt-3 border-t border-slate-50">
                                                <button onClick={() => handleStatusChange(guest, 'seated')} className="flex-1 py-2 bg-slate-900 text-white rounded-lg font-bold text-[9px] uppercase tracking-widest hover:bg-black shadow-sm flex items-center justify-center gap-1 transition-colors"><CheckCircle2 size={12}/> Seat</button>
                                                <button onClick={() => handleEdit(guest)} className="p-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"><Edit3 size={14}/></button>
                                                <button onClick={() => setConfirmModal({show:true, title:"Cancel?", message:"Mark guest as Cancelled?", onConfirm:()=>{handleStatusChange(guest, 'cancelled'); setConfirmModal({show:false})}, onCancel:()=>setConfirmModal({show:false})})} className="p-2 bg-red-50 text-red-500 border border-red-100 rounded-lg hover:bg-red-100 transition-colors"><X size={14}/></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                {viewMode === 'history' && (
                    <div className="h-full p-4 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-200 text-[10px] font-black uppercase text-slate-500 sticky top-0">
                                <tr>
                                    <th className="p-3 rounded-l-lg">Time</th>
                                    <th className="p-3">Customer</th>
                                    <th className="p-3">Pax</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3 rounded-r-lg text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {historyList.map(r => (
                                    <tr key={r.id} className="hover:bg-white transition-colors">
                                        <td className="p-3 text-xs font-bold text-slate-500">{new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                                        <td className="p-3 font-bold text-slate-700 capitalize">{r.customer_name}</td>
                                        <td className="p-3 font-bold text-xs">{r.person_count}</td>
                                        <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${r.status === 'seated' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{r.status}</span></td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => setConfirmModal({show:true, title:"Delete?", message:"Permanently delete?", onConfirm:()=>{handleDelete(r.id); setConfirmModal({show:false})}, onCancel:()=>setConfirmModal({show:false})})} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL FORM */}
            {modalForm && (
                <div className="fixed inset-0 z-[6000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">{modalForm.data.id ? 'Edit Guest' : 'Add Walk-In'}</h3>
                            <button onClick={() => setModalForm(null)}><X size={20} className="text-slate-400 hover:text-red-500"/></button>
                        </div>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block mb-1">Guest Name</label>
                                <input name="customer_name" defaultValue={modalForm.data.customer_name || ''} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500" placeholder="Enter Name" required autoFocus />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block mb-1">Pax Count</label>
                                <input name="person_count" type="number" defaultValue={modalForm.data.person_count || ''} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500" placeholder="e.g. 4" required />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block mb-2">Preference</label>
                                <div className="flex gap-2">
                                    {['None', 'AC', 'Non-AC'].map(pref => (
                                        <label key={pref} className="flex-1 cursor-pointer">
                                            <input type="radio" name="preference" value={pref} defaultChecked={(modalForm.data.preference || 'None') === pref} className="peer hidden" />
                                            <div className="py-2 text-center text-xs font-bold rounded-lg border border-slate-200 text-slate-500 peer-checked:bg-slate-800 peer-checked:text-white peer-checked:border-slate-800 transition-all">{pref}</div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs shadow-lg mt-2">Save Guest</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QueueManager;