import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  LayoutGrid, Clock, TrendingUp, Calendar, 
  LogOut, Plus, Trash2, Key, Search,
  Utensils, Wallet, Coffee, Shield, X, 
  ChevronLeft, ChevronRight, ArrowUpDown, CheckCircle2, AlertCircle
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import api from '../api/axios';
import QueueManager from '../components/QueueManager'; 

// --- SHARED HELPER COMPONENTS ---

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
      <div className="bg-white rounded-2xl shadow-2xl w-[90%] md:max-w-sm p-6 animate-in zoom-in-95 border border-slate-200">
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

// --- DATA TABLE COMPONENT ---
const DataTable = ({ data, columns, actions, searchKeys = ['username'] }) => {
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const [query, setQuery] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const filteredData = useMemo(() => data.filter(item => searchKeys.some(key => String(item[key] || '').toLowerCase().includes(query.toLowerCase()))), [data, query, searchKeys]);

  const sortedData = useMemo(() => {
      let items = [...filteredData];
      if (sortConfig.key) {
        items.sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            return sortConfig.direction === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
        });
      }
      return items;
  }, [filteredData, sortConfig]);

  const paginatedData = sortedData.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const totalPages = Math.ceil(sortedData.length / rowsPerPage);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50/50">
        <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input className="w-full pl-10 pr-4 py-2 bg-white border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="Search..." value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
        </div>
      </div>
      
      {/* Scrollable Table Container */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[800px] md:min-w-0"> {/* Forces horizontal scroll on small mobile */}
            <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10">
                <tr>
                    {columns.map((col, i) => (
                        <th key={i} className="p-4 border-b cursor-pointer hover:bg-slate-200" onClick={() => col.accessor && setSortConfig({ key: col.accessor, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
                            <div className="flex items-center gap-1">{col.header}{col.accessor && <ArrowUpDown size={12}/>}</div>
                        </th>
                    ))}
                    {actions && <th className="p-4 border-b text-right">Actions</th>}
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {paginatedData.map((row, i) => (
                <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                    {columns.map((col, j) => <td key={j} className="p-4 text-slate-700 font-medium">{col.render ? col.render(row) : row[col.accessor]}</td>)}
                    {actions && <td className="p-4 text-right"><div className="flex justify-end gap-2">{actions(row)}</div></td>}
                </tr>
                ))}
                {paginatedData.length === 0 && <tr><td colSpan={columns.length + 1} className="p-10 text-center text-slate-400 italic">No records found.</td></tr>}
            </tbody>
            </table>
        </div>
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

// --- OWNER DASHBOARD ---
const OwnerDashboard = () => {
    // STATE
    const [activeTab, setActiveTab] = useState('insights');
    const [stats, setStats] = useState({ total_orders: 0, total_revenue: 0, avg_order_value: 0 });
    const [trendData, setTrendData] = useState([]);
    const [managers, setManagers] = useState([]);
    const [tables, setTables] = useState([]);
    
    // UI State
    const [notification, setNotification] = useState({ msg: '', type: '' });
    const [confirmModal, setConfirmModal] = useState({ show: false });
    const [modalForm, setModalForm] = useState(null); 
    
    // Filters
    const [dateRange, setDateRange] = useState({ 
        start: new Date().toISOString().split('T')[0], 
        end: new Date().toISOString().split('T')[0] 
    });
    const [shiftFilter, setShiftFilter] = useState('All'); 

    // Helpers
    const notify = (msg, type = 'success') => setNotification({ msg, type });
    const closeNotif = () => setNotification({ msg: '', type: '' });

    // --- FETCH DATA ---
    const fetchData = useCallback(async () => {
        try {
            // 1. Analytics
            const analyticsRes = await api.get(`/admin/analytics`, {
                params: { startDate: dateRange.start, endDate: dateRange.end, shift: shiftFilter }
            });
            setStats(analyticsRes.data.stats || { total_orders: 0, total_revenue: 0, avg_order_value: 0 });
            const formattedTrend = (analyticsRes.data.trend || []).map(item => ({
                date: new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
                sales: Number(item.sales)
            }));
            setTrendData(formattedTrend);

            // 2. Managers
            const managerRes = await api.get('/admin/managers');
            setManagers(managerRes.data);

            // 3. Tables (For Floor & Queue Turnover)
            const tableRes = await api.get('/orders/tables');
            setTables(tableRes.data);

        } catch (e) { console.error("Data Fetch Error", e); notify("Failed to load data", "error"); }
    }, [dateRange.start, dateRange.end, shiftFilter]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000); 
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleLogout = () => { localStorage.removeItem('token'); window.location.href = '/login'; };

    // --- RENDERERS ---

    const renderNavButton = (id, label, Icon) => (
        <button key={id} onClick={() => setActiveTab(id)} className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-200 group ${activeTab === id ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}>
            <Icon size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold uppercase tracking-wider">{label}</span>
        </button>
    );

    const renderMobileNavButton = (id, label, Icon) => (
        <button onClick={() => setActiveTab(id)} className={`flex flex-col items-center justify-center p-2 rounded-xl w-full transition-all active:scale-95 ${activeTab === id ? 'text-orange-600 bg-orange-50' : 'text-slate-400'}`}>
            <Icon size={20} className={activeTab === id ? 'text-orange-600' : ''} />
            <span className="text-[9px] font-black uppercase tracking-widest mt-1">{label}</span>
        </button>
    );

    const StatCard = ({ title, value, icon: Icon, color, subtext }) => (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:shadow-lg transition-all">
            <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">{value}</h3>
                {subtext && <p className="text-[10px] text-slate-400 mt-1 font-bold">{subtext}</p>}
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color} text-white shadow-md group-hover:scale-110 transition-transform`}>
                <Icon size={24} />
            </div>
        </div>
    );

    // --- TAB COMPONENTS ---

    const InsightsView = () => (
        <div className="h-full p-4 md:p-6 flex flex-col bg-slate-100 overflow-y-auto custom-scrollbar">
            <div className="max-w-7xl mx-auto w-full space-y-4 md:space-y-6">
                {/* FILTERS */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200 w-full md:w-auto px-4 justify-between md:justify-start">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-slate-400"/>
                            <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="bg-transparent text-xs font-bold text-slate-700 outline-none uppercase tracking-wide cursor-pointer w-full"/>
                        </div>
                        <span className="text-slate-300 font-black">-</span>
                        <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="bg-transparent text-xs font-bold text-slate-700 outline-none uppercase tracking-wide cursor-pointer w-full text-right md:text-left"/>
                    </div>
                    <div className="flex bg-slate-50 p-1 rounded-xl w-full md:w-auto">
                        {['All', 'Noon', 'Evening'].map(s => (
                            <button key={s} onClick={() => setShiftFilter(s)} className={`flex-1 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${shiftFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{s}</button>
                        ))}
                    </div>
                </div>

                {/* KPI */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard title="Total Revenue" value={`₹${parseInt(stats.total_revenue).toLocaleString()}`} icon={Wallet} color="bg-emerald-500" subtext="Selected Range" />
                    <StatCard title="Total Orders" value={stats.total_orders} icon={Coffee} color="bg-blue-500" subtext="Completed Bills" />
                    <StatCard title="Avg Ticket" value={`₹${parseInt(stats.avg_order_value)}`} icon={TrendingUp} color="bg-orange-500" subtext="Per Table" />
                </div>

                {/* CHART */}
                <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-black text-lg text-slate-800 tracking-tight">Revenue Trend</h3>
                    </div>
                    <div className="h-[250px] md:h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} tickFormatter={(val) => `₹${val}`} />
                                <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight:'bold'}} itemStyle={{color:'#ea580c'}} />
                                <Area type="monotone" dataKey="sales" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );

    const ManagersView = () => (
        <div className="h-full p-4 md:p-6 flex flex-col bg-slate-100">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">System Managers</h2>
                <button onClick={() => setModalForm({ type: 'manager', data: {} })} className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-black shadow-lg uppercase tracking-widest">
                    <Plus size={16}/> <span className="hidden md:inline">Add Manager</span><span className="md:hidden">Add</span>
                </button>
            </div>
            <DataTable 
                data={managers}
                columns={[
                    { header: 'ID', accessor: 'id', render: r => <span className="text-slate-400 font-mono">#{r.id}</span> },
                    { header: 'Username', accessor: 'username', render: r => <span className="font-bold flex items-center gap-2"><Shield size={16} className="text-blue-500"/> {r.username}</span> },
                    { header: 'Role', render: () => <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-black uppercase rounded-lg">Manager</span> },
                    { header: 'Joined', accessor: 'created_at', render: r => <span className="text-xs font-medium text-slate-500">{new Date(r.created_at).toLocaleDateString()}</span> }
                ]}
                actions={(row) => (
                    <div className="flex gap-2">
                        <button onClick={() => setModalForm({ type: 'reset', data: row })} className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100" title="Reset Password"><Key size={16}/></button>
                        <button onClick={() => {
                            setConfirmModal({
                                show: true,
                                title: "Delete Manager?",
                                message: `Revoke access for ${row.username}?`,
                                onConfirm: async () => {
                                    try { await api.delete(`/admin/managers/${row.id}`); fetchData(); notify("Manager Deleted"); }
                                    catch(e) { notify("Delete failed", "error"); }
                                    setConfirmModal({show:false});
                                },
                                onCancel: () => setConfirmModal({show:false})
                            });
                        }} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={16}/></button>
                    </div>
                )}
            />
        </div>
    );

    const FloorView = () => (
        <div className="h-full p-4 md:p-6 flex flex-col bg-slate-100 overflow-y-auto custom-scrollbar">
            <div className="mb-6"><h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Floor Monitor</h2></div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 md:gap-4">
                {tables.map(t => {
                    const isOcc = t.status === 'occupied';
                    return (
                        <div key={t.id} className={`relative h-20 md:h-24 rounded-2xl flex flex-col items-center justify-center border-2 transition-all duration-300 ${isOcc ? 'bg-orange-500 border-orange-500 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400'}`}>
                            <span className="text-[8px] font-bold uppercase tracking-widest mb-0.5 opacity-60">Table</span>
                            <span className="text-2xl md:text-3xl font-black tracking-tighter">{t.table_no}</span>
                            {isOcc && <div className="absolute bottom-1 md:bottom-2 bg-white/20 px-2 py-0.5 rounded text-[8px] md:text-[9px] font-mono font-bold flex items-center gap-1 backdrop-blur-md">Occupied</div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
            <Toast message={notification.msg} type={notification.type} onClose={closeNotif} />
            <ConfirmModal isOpen={confirmModal.show} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={confirmModal.onCancel} />

            {/* DESKTOP SIDEBAR (Hidden on Mobile) */}
            <aside className="hidden lg:flex w-64 bg-slate-900 text-white flex-col shrink-0 z-40 transition-all duration-300 print:hidden">
                <div className="h-20 flex items-center px-6 border-b border-slate-800">
                    <Utensils className="text-orange-500 mr-3 shrink-0" />
                    <span className="font-black text-xl tracking-tighter leading-none">HOTEL<span className="text-orange-500">UMIYA</span><br/><span className="text-[10px] text-slate-500 tracking-widest uppercase font-medium">ADMIN</span></span>
                </div>
                <nav className="flex-1 py-8 space-y-2 px-3">
                    {renderNavButton('insights', 'Insights', TrendingUp)}
                    {renderNavButton('floor', 'Live Floor', LayoutGrid)}
                    {renderNavButton('queue', 'Waiting Queue', Clock)}
                    {renderNavButton('managers', 'Managers', Shield)}
                </nav>
                <button className="m-4 p-4 bg-slate-800 rounded-2xl flex items-center justify-center gap-3 hover:bg-red-900/50 hover:text-red-400 text-slate-400 transition-colors group" onClick={handleLogout}>
                    <LogOut size={18}/> <span className="text-xs font-bold uppercase tracking-widest">Logout</span>
                </button>
            </aside>

            {/* MOBILE BOTTOM NAV */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2 flex justify-around z-50 pb-[env(safe-area-inset-bottom,20px)] shadow-2xl">
                {renderMobileNavButton('insights', 'Data', TrendingUp)}
                {renderMobileNavButton('floor', 'Floor', LayoutGrid)}
                {renderMobileNavButton('queue', 'Queue', Clock)}
                {renderMobileNavButton('managers', 'Staff', Shield)}
            </div>

            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col relative overflow-hidden pb-20 lg:pb-0">
                {/* Mobile Header */}
                <div className="lg:hidden h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-2">
                         <Utensils className="text-orange-600" size={20} />
                         <span className="font-black text-lg tracking-tight text-slate-800 uppercase">{activeTab}</span>
                    </div>
                    <button onClick={handleLogout} className="text-slate-400 p-2 bg-slate-50 rounded-full hover:bg-red-50 hover:text-red-500"><LogOut size={20}/></button>
                </div>

                {activeTab === 'insights' && <InsightsView />}
                {activeTab === 'floor' && <FloorView />}
                {activeTab === 'queue' && <QueueManager tables={tables} />}
                {activeTab === 'managers' && <ManagersView />}
            </main>

            {/* MANAGER MODAL */}
            {modalForm && (
                <div className="fixed inset-0 z-[3000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl p-6 md:p-8 w-[90%] md:w-full md:max-w-sm shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
                        <h3 className="text-xl font-black uppercase text-slate-800 mb-6 flex justify-between items-center">
                            <span>{modalForm.type === 'manager' ? 'Add Manager' : 'Reset Password'}</span>
                            <button onClick={() => setModalForm(null)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
                        </h3>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.target);
                            const data = Object.fromEntries(formData.entries());
                            try {
                                if(modalForm.type === 'manager') {
                                    await api.post('/admin/managers', data);
                                    notify("Manager Created");
                                } else {
                                    await api.put(`/admin/managers/${modalForm.data.id}`, { password: data.password });
                                    notify("Password Updated");
                                }
                                setModalForm(null);
                                fetchData();
                            } catch(err) {
                                notify(err.response?.data?.message || "Operation failed", "error");
                            }
                        }} className="space-y-4">
                            {modalForm.type === 'manager' && (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block">Username</label>
                                    <input name="username" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500" required />
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block">{modalForm.type === 'manager' ? 'Password' : 'New Password'}</label>
                                <input name="password" type="password" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500" required />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setModalForm(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-xl uppercase text-xs">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl uppercase text-xs shadow-lg">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OwnerDashboard;