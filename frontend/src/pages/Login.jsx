import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Lock, Eye, EyeOff, AlertCircle, 
  Loader2, ChevronRight, ShieldCheck, 
  Store, Users, History, ArrowRight,
  Utensils, LayoutDashboard, Fingerprint
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import api from '../api/axios';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const reason = queryParams.get('reason');

  // Interior Ambiance Carousel Images
  const interiorSlides = [
    {
      title: 'Heritage Dining',
      image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=compress&cs=tinysrgb&w=1260&h=750&q=80',
      tagline: 'Authentic Kathiyawadi Experience'
    },
    {
      title: 'Cultural Ambiance',
      image: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=compress&cs=tinysrgb&w=1260&h=750&q=80',
      tagline: 'Where Tradition Meets Comfort'
    },
    {
      title: 'Premium Hospitality',
      image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=compress&cs=tinysrgb&w=1260&h=750&q=80',
      tagline: 'Serving Legacy Since 1995'
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % interiorSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (reason === 'expired') setError('Your session (4 hours) has expired. Please log in again.');
    if (reason === 'invalid') setError('Invalid or tampered session. Security re-login required.');
  }, [reason]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { username, password });
      
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', res.data.role);
      localStorage.setItem('username', res.data.user.username);
      localStorage.setItem('loginTime', Date.now().toString()); // Set 4-hour start time
      
      window.location.href = `/${res.data.role}`;
    } catch (err) {
      setError(err.response?.data?.message || "Invalid credentials. Contact Manager.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] flex flex-col lg:flex-row overflow-hidden font-sans">
      
      {/* ====================================
          LEFT: VISUAL STORYTELLING (Hidden on small mobile)
      ==================================== */}
      <div className="relative w-full lg:w-[50%] xl:w-[60%] h-[35vh] lg:h-screen overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSlide}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
            className="absolute inset-0"
          >
            <img 
              src={interiorSlides[activeSlide].image} 
              className="w-full h-full object-cover" 
              alt="Restaurant Interior"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
          </motion.div>
        </AnimatePresence>

        {/* Branding Info */}
        <div className="absolute top-6 left-6 lg:top-12 lg:left-12 z-20">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-3 lg:gap-4"
          >
            <div className="w-10 h-10 lg:w-14 lg:h-14 bg-orange-600 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-2xl">
              <Utensils className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl lg:text-4xl font-black text-white tracking-tighter uppercase leading-none">
                Hotel Umiya
              </h1>
              <p className="text-orange-400 text-[8px] lg:text-[10px] font-bold tracking-[0.3em] uppercase mt-1">
                Kathiyawadi Kitchen • શુદ્ધ શાકાહારી
              </p>
            </div>
          </motion.div>
        </div>

        {/* Dynamic Text Overlay */}
        <div className="absolute bottom-8 left-6 lg:bottom-16 lg:left-12 z-20">
          <motion.div
            key={`txt-${activeSlide}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-md"
          >
            <h2 className="text-2xl lg:text-5xl font-black text-white mb-2 lg:mb-4">
              {interiorSlides[activeSlide].title}
            </h2>
            <p className="text-slate-300 text-xs lg:text-lg font-medium">
              {interiorSlides[activeSlide].tagline}
            </p>
          </motion.div>
          <div className="flex gap-2 mt-4 lg:mt-8">
            {interiorSlides.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-500 ${activeSlide === i ? 'w-8 lg:w-12 bg-orange-500' : 'w-2 lg:w-4 bg-white/40'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* ====================================
          RIGHT: INTERACTIVE LOGIN AREA
      ==================================== */}
      <div className="flex-1 flex flex-col justify-center items-center p-4 sm:p-8 lg:p-12 xl:p-20 relative">
        
        {/* Decorative elements for right side */}
        <div className="absolute top-0 right-0 p-8 opacity-5 lg:opacity-10 pointer-events-none">
            <LayoutDashboard size={200} />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md z-10"
        >
          {/* Form Header */}
          <div className="mb-8 lg:mb-12">
            <div className="flex items-center gap-2 text-orange-600 font-bold text-xs uppercase tracking-widest mb-2">
                <Fingerprint size={14} />
                <span>Security Portal</span>
            </div>
            <h3 className="text-3xl lg:text-4xl font-black text-slate-800 tracking-tight">Staff Sign In</h3>
            <p className="text-slate-500 text-sm lg:text-base mt-2 font-medium">Please enter your credentials to access the POS terminal.</p>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-2xl flex items-start gap-3 shadow-sm"
              >
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <p className="text-xs lg:text-sm font-bold text-red-800 leading-tight">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Interactive Form */}
          <form onSubmit={handleLogin} className="space-y-5 lg:space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Username / ID</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-600 transition-colors">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full pl-12 pr-4 py-4 lg:py-5 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all font-bold text-slate-800 shadow-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Password</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-600 transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-12 py-4 lg:py-5 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all font-bold text-slate-800 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white font-black py-4 lg:py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl shadow-slate-900/10 active:scale-[0.98] disabled:opacity-50 mt-4 group"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  <span className="uppercase tracking-widest text-xs lg:text-sm">Authorize & Login</span>
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Quick Support / Version Info */}
          <div className="mt-12 lg:mt-20 pt-8 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">
              <ShieldCheck size={12} />
              Secure Terminal
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                RMS Powered By
              </p>
              <p className="text-xs font-black text-slate-900">CIPRA INFOTECH</p>
            </div>
          </div>
        </motion.div>

        {/* Stats Row for Desktop Only */}
        <div className="hidden xl:flex absolute bottom-8 gap-12 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
            <div className="flex items-center gap-2"><History size={14}/> Est. 1995</div>
            <div className="flex items-center gap-2"><Users size={14}/> 100% Kathiyawadi</div>
            <div className="flex items-center gap-2"><Store size={14}/> RMS v4.0</div>
        </div>
      </div>

      {/* Background Soft Accents */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-100/20 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-100/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
    </div>
  );
};

export default Login;