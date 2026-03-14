import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  BarChart, Bar, Cell, ReferenceLine
} from 'recharts';
import { 
  AlertTriangle, 
  Activity, 
  Shield, 
  Zap, 
  TrendingDown, 
  Clock, 
  ShieldCheck, 
  ShieldAlert,
  BarChart3,
  Info,
  Bomb
} from 'lucide-react';

/**
 * CONFIDENTIAL - Property of Zetheta Algorithms Private Limited
 * Flash Crash Prevention System - Early Warning & Circuit Breaker MVP
 */

// --- CONFIGURATION ---
const APP_ID = "zetheta-flash-crash-prev";
const SYMBOL = "AAPL";
const INITIAL_PRICE = 150.00;
const TICK_MS = 500; // Real-time update speed
const VOLATILITY_WINDOW = 20; // Periods for moving average/std dev
const BREAK_THRESHOLD_PERCENT = 3.0; // 3% drop triggers circuit breaker
const RECOVERY_TIME_S = 15; // Seconds until breaker resets

// --- UTILS ---
const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
const formatPercent = (val) => `${(val || 0) >= 0 ? '+' : ''}${(val || 0).toFixed(2)}%`;

const App = () => {
  // --- STATE ---
  const [marketData, setMarketData] = useState([]);
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [breakerStatus, setBreakerStatus] = useState('NORMAL'); // NORMAL, TRIGGERED, RECOVERING
  const [recoveryTimer, setRecoveryTimer] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [isStressTest, setIsStressTest] = useState(false);
  const [config, setConfig] = useState({
    threshold: BREAK_THRESHOLD_PERCENT,
    autoHalt: true
  });

  // Refs for logic without triggering re-renders every sub-second
  const marketRef = useRef([]);
  const lastPriceRef = useRef(INITIAL_PRICE);
  const breakerRef = useRef('NORMAL');
  const stressTestRef = useRef(false);

  // Sync state to ref for the interval closure
  useEffect(() => {
    stressTestRef.current = isStressTest;
  }, [isStressTest]);

  // --- MARKET SIMULATION ENGINE ---
  const generateMarketTick = useCallback(() => {
    if (breakerRef.current === 'TRIGGERED') return;

    const prevPrice = lastPriceRef.current;
    
    // Simulate volatility (Normal vs Flash Crash potential)
    const isCrashScenario = stressTestRef.current || Math.random() > 0.98;
    const volatility = isCrashScenario ? (Math.random() * -0.06) : (Math.random() - 0.5) * 0.005;
    
    const change = prevPrice * volatility;
    const newPrice = prevPrice + change;
    const volume = Math.floor(Math.random() * 5000) + (isCrashScenario ? 35000 : 0);
    
    // Order Flow Imbalance (OFI) simulation (-1.0 to 1.0)
    // High negative OFI = Aggressive selling
    const ofi = isCrashScenario ? -0.85 - (Math.random() * 0.15) : (Math.random() - 0.5) * 0.4;
    
    // Spread calculation (Widened significantly during crash)
    const spreadBps = isCrashScenario ? 50 + Math.random() * 100 : 2 + Math.random() * 3;
    const spreadMultiplier = spreadBps / 10000;
    const spreadAbsolute = newPrice * spreadMultiplier;

    const timestamp = new Date().toLocaleTimeString();
    const newTick = {
      time: timestamp,
      price: newPrice,
      changePercent: ((newPrice - INITIAL_PRICE) / INITIAL_PRICE) * 100,
      volume,
      ofi,
      spreadBps,
      vwap: prevPrice * 0.999 + newPrice * 0.001 // Simplified cumulative VWAP
    };

    lastPriceRef.current = newPrice;
    marketRef.current = [...marketRef.current.slice(-60), newTick];
    setMarketData([...marketRef.current]);

    // Update Order Book Simulation (Liquidity Evaporation)
    const bids = Array.from({length: 5}, (_, i) => ({
      price: newPrice - (spreadAbsolute * (i + 1)),
      size: Math.floor(Math.random() * 1000) * (isCrashScenario ? 0.1 : 1) // Bids vanish during crash
    }));
    const asks = Array.from({length: 5}, (_, i) => ({
      price: newPrice + (spreadAbsolute * (i + 1)),
      size: Math.floor(Math.random() * 1000) * (isCrashScenario ? 8 : 1) // Asks pile up
    }));
    setOrderBook({ bids, asks });

    // --- DETECTION LOGIC ---
    checkAnomalies(newTick);
  }, [config]);

  const checkAnomalies = (tick) => {
    if (marketRef.current.length < 2) return;
    const suddenDrop = (tick.price - marketRef.current[marketRef.current.length - 2]?.price) / tick.price * 100;
    
    // 1. Volatility Spike Detection
    if (Math.abs(suddenDrop) > 1.0 && Math.abs(suddenDrop) < 2.5) {
      addAlert('High Volatility Detected', `Price moved ${suddenDrop.toFixed(2)}% in one tick.`, 'warning');
    }

    // 2. Order Flow Imbalance Analysis
    if (tick.ofi < -0.8) {
      addAlert('Order Flow Toxicity', 'Significant aggressive selling pressure detected.', 'danger');
    }

    // 3. Liquidity Evaporation (Spread Widening)
    if (tick.spreadBps > 40) {
      addAlert('Liquidity Evaporation', `Market makers withdrawing. Spread widened to ${tick.spreadBps.toFixed(0)} bps.`, 'danger');
    }

    // 4. Circuit Breaker Logic
    const cumulativeDrop = ((tick.price - INITIAL_PRICE) / INITIAL_PRICE) * 100;
    if (cumulativeDrop <= -config.threshold && breakerRef.current === 'NORMAL') {
      triggerCircuitBreaker(cumulativeDrop);
    }
  };

  const triggerCircuitBreaker = (drop) => {
    breakerRef.current = 'TRIGGERED';
    setBreakerStatus('TRIGGERED');
    setRecoveryTimer(RECOVERY_TIME_S);
    setIsStressTest(false); // Turn off stress test if breaker trips
    addAlert('CIRCUIT BREAKER TRIGGERED', `Market halted due to ${drop.toFixed(2)}% decline.`, 'critical');
  };

  const addAlert = (title, message, type) => {
    const id = Date.now() + Math.random();
    setAlerts(prev => [{ id, title, message, type, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 15));
  };

  // --- LIFECYCLE ---
  useEffect(() => {
    const interval = setInterval(generateMarketTick, TICK_MS);
    return () => clearInterval(interval);
  }, [generateMarketTick]);

  useEffect(() => {
    let timer;
    if (breakerStatus === 'TRIGGERED' && recoveryTimer > 0) {
      timer = setTimeout(() => setRecoveryTimer(recoveryTimer - 1), 1000);
    } else if (breakerStatus === 'TRIGGERED' && recoveryTimer === 0) {
      setBreakerStatus('RECOVERING');
      breakerRef.current = 'NORMAL';
      
      // Simulate price recovery post-halt
      lastPriceRef.current = INITIAL_PRICE * (1 - (config.threshold * 0.5) / 100); 
      
      setTimeout(() => setBreakerStatus('NORMAL'), 3000);
      addAlert('Market Resumed', 'Trading has resumed post-halt evaluation.', 'warning');
    }
    return () => clearTimeout(timer);
  }, [breakerStatus, recoveryTimer, config.threshold]);

  // --- COMPUTED METRICS ---
  const metrics = useMemo(() => {
    if (marketData.length === 0) {
      return { price: INITIAL_PRICE, change: 0, ofi: 0, volume: 0, spread: 2, health: 'Liquid' };
    }
    const latest = marketData[marketData.length - 1];
    
    let health = 'Liquid';
    if (latest.spreadBps > 30 || latest.ofi < -0.7) health = 'Illiquid';
    else if (latest.spreadBps > 10 || latest.ofi < -0.4) health = 'Vulnerable';

    return {
      price: latest.price || INITIAL_PRICE,
      change: latest.changePercent || 0,
      ofi: latest.ofi || 0,
      volume: latest.volume || 0,
      spread: latest.spreadBps || 2,
      health
    };
  }, [marketData]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 lg:p-8">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="text-yellow-400 fill-yellow-400" size={24} />
            <h1 className="text-2xl font-bold tracking-tight">ZeTheta Flash Crash Prevention</h1>
          </div>
          <p className="text-slate-400 text-sm uppercase tracking-widest font-semibold flex items-center gap-2">
            Institutional Risk Monitoring • {SYMBOL}
            <span className={`px-2 py-0.5 rounded text-[10px] ${
              metrics.health === 'Liquid' ? 'bg-emerald-500/20 text-emerald-400' :
              metrics.health === 'Vulnerable' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {metrics.health}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Stress Test Control */}
          <button 
            onClick={() => setIsStressTest(!isStressTest)}
            disabled={breakerStatus !== 'NORMAL'}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all font-bold text-sm uppercase tracking-wider ${
              breakerStatus !== 'NORMAL' ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500' :
              isStressTest 
                ? 'bg-orange-500 border-orange-400 text-white animate-pulse' 
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Bomb size={18} className={isStressTest ? 'text-white' : 'text-orange-500'} />
            {isStressTest ? 'Stop Stress Test' : 'Simulate Flash Crash'}
          </button>

          {/* Breaker Status */}
          <div className={`flex items-center gap-4 px-6 py-3 rounded-xl border transition-all duration-500 ${
            breakerStatus === 'TRIGGERED' 
              ? 'bg-red-950/40 border-red-500 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)]' 
              : breakerStatus === 'RECOVERING'
              ? 'bg-blue-950/40 border-blue-500 text-blue-400'
              : 'bg-emerald-950/40 border-emerald-500 text-emerald-400'
          }`}>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold opacity-70">Breaker Status</span>
              <span className="font-bold flex items-center gap-2">
                {breakerStatus === 'TRIGGERED' && <ShieldAlert className="animate-pulse" size={18} />}
                {breakerStatus === 'RECOVERING' && <Clock className="animate-spin" size={18} />}
                {breakerStatus === 'NORMAL' && <ShieldCheck size={18} />}
                {breakerStatus}
              </span>
            </div>
            {breakerStatus === 'TRIGGERED' && (
              <div className="pl-4 border-l border-red-500/30">
                <span className="text-[10px] uppercase font-bold block opacity-70">Restart In</span>
                <span className="text-xl font-mono font-bold tracking-tighter">{recoveryTimer}s</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column - Metrics & Chart */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard 
              label="Market Price" 
              value={formatCurrency(metrics.price)} 
              subValue={formatPercent(metrics.change)}
              trend={metrics.change >= 0 ? 'up' : 'down'}
            />
            <MetricCard 
              label="Spread (bps)" 
              value={metrics.spread.toFixed(1)} 
              subValue={metrics.spread > 10 ? 'Widening' : 'Normal'}
              trend={metrics.spread > 10 ? 'down' : 'up'}
            />
            <MetricCard 
              label="OFI Factor" 
              value={metrics.ofi.toFixed(3)} 
              subValue={metrics.ofi < -0.5 ? 'Toxic' : 'Liquid'}
              trend={metrics.ofi < -0.5 ? 'down' : 'up'}
            />
            <MetricCard 
              label="Volume (Tick)" 
              value={(metrics.volume || 0).toLocaleString()} 
              subValue="Aggregated"
              trend="neutral"
            />
            <MetricCard 
              label="Volatility" 
              value={metrics.change < -1 ? 'Extreme' : 'Normal'} 
              subValue="Real-time"
              trend={metrics.change < -1 ? 'down' : 'neutral'}
            />
          </div>

          {/* Main Price Chart */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            {isStressTest && (
              <div className="absolute inset-0 bg-orange-500/5 border-2 border-orange-500/20 rounded-2xl pointer-events-none z-10 animate-pulse" />
            )}
            <div className="flex items-center justify-between mb-6 relative z-20">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Activity size={20} className={isStressTest ? "text-orange-400" : "text-blue-400"} />
                Real-Time Price Execution
              </h2>
              <div className="flex gap-2">
                <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                  <div className={`w-2 h-2 rounded-full ${isStressTest ? 'bg-orange-500' : 'bg-blue-500'}`} /> Price
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                  <div className="w-2 h-2 rounded-full bg-slate-600" /> VWAP
                </span>
              </div>
            </div>
            <div className="h-[380px] relative z-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={marketData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isStressTest ? "#f97316" : "#3b82f6"} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={isStressTest ? "#f97316" : "#3b82f6"} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={['auto', 'auto']} orientation="right" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc'}}
                    itemStyle={{fontSize: '12px'}}
                  />
                  <ReferenceLine y={INITIAL_PRICE} stroke="#334155" strokeDasharray="3 3" />
                  <ReferenceLine y={INITIAL_PRICE * (1 - config.threshold/100)} stroke="#ef4444" strokeDasharray="5 5" label={{value: `Breaker (-${config.threshold}%)`, fill: '#ef4444', fontSize: 10, position: 'insideBottomRight'}} />
                  <Area 
                    type="monotone" 
                    dataKey="price" 
                    stroke={isStressTest ? "#f97316" : "#3b82f6"} 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#colorPrice)" 
                    isAnimationActive={false} 
                  />
                  <Line type="monotone" dataKey="vwap" stroke="#64748b" strokeWidth={1} dot={false} strokeDasharray="3 3" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Microstructure Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex justify-between">
                Order Flow Imbalance
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-500">20 TICKS</span>
              </h3>
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={marketData.slice(-20)}>
                    <Bar dataKey="ofi" isAnimationActive={false}>
                      {marketData.slice(-20).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.ofi < -0.5 ? '#ef4444' : entry.ofi < 0 ? '#f97316' : '#10b981'} />
                      ))}
                    </Bar>
                    <YAxis domain={[-1, 1]} hide />
                    <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155'}} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Risk Threshold Config</h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-300">Level 1 Breaker Trigger</span>
                    <span className="text-red-400 font-bold font-mono">-{config.threshold}%</span>
                  </div>
                  <input 
                    type="range" min="0.5" max="10" step="0.5" 
                    value={config.threshold} 
                    onChange={(e) => setConfig({...config, threshold: parseFloat(e.target.value)})}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                  <div className="flex justify-between mt-1 text-[10px] text-slate-600 font-mono">
                    <span>Strict (0.5%)</span>
                    <span>Loose (10%)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <div>
                    <span className="text-xs font-bold block text-slate-300">Automated Market Halt</span>
                    <span className="text-[10px] text-slate-500">Auto-execute suspension protocol</span>
                  </div>
                  <button 
                    onClick={() => setConfig({...config, autoHalt: !config.autoHalt})}
                    className={`w-10 h-5 rounded-full transition-colors relative ${config.autoHalt ? 'bg-blue-600' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${config.autoHalt ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Order Book & Alerts */}
        <div className="lg:col-span-4 space-y-6 flex flex-col">
          
          {/* L2 Order Book */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shrink-0">
            <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight">
                <BarChart3 size={16} className="text-slate-400" />
                Depth of Market
              </h2>
              <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 uppercase tracking-wider font-bold">
                {metrics.health === 'Illiquid' ? 'EVAPORATING' : 'Real-Time'}
              </span>
            </div>
            
            <div className="p-4">
              {/* Asks */}
              <div className="space-y-1 mb-3">
                {[...orderBook.asks].reverse().map((ask, i) => (
                  <div key={i} className="relative h-6 flex items-center justify-between text-xs px-2 group">
                    <div 
                      className="absolute right-0 h-full bg-red-500/15 transition-all duration-100" 
                      style={{ width: `${Math.min((ask.size / 8000) * 100, 100)}%` }}
                    />
                    <span className="text-red-400 font-mono z-10">{ask.price.toFixed(2)}</span>
                    <span className="text-slate-400 font-mono z-10">{ask.size.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {/* Spread */}
              <div className={`py-2 border-y my-3 text-center transition-colors ${
                metrics.spread > 30 ? 'border-orange-500/30 bg-orange-500/5' : 'border-slate-800'
              }`}>
                <span className={`text-[10px] uppercase tracking-widest block mb-0.5 font-bold ${
                  metrics.spread > 30 ? 'text-orange-400' : 'text-slate-500'
                }`}>
                  Spread ({metrics.spread.toFixed(1)} bps)
                </span>
                <span className="text-lg font-bold font-mono">
                  {(orderBook.asks[0]?.price - orderBook.bids[0]?.price || 0).toFixed(4)}
                </span>
              </div>

              {/* Bids */}
              <div className="space-y-1">
                {orderBook.bids.map((bid, i) => (
                  <div key={i} className="relative h-6 flex items-center justify-between text-xs px-2 group">
                    <div 
                      className="absolute left-0 h-full bg-emerald-500/15 transition-all duration-100" 
                      style={{ width: `${Math.min((bid.size / 5000) * 100, 100)}%` }}
                    />
                    <span className="text-emerald-400 font-mono z-10">{bid.price.toFixed(2)}</span>
                    <span className="text-slate-400 font-mono z-10">{bid.size.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Alert Feed */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col flex-1 shadow-xl min-h-[300px]">
            <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight">
                <AlertTriangle size={16} className={alerts.some(a => a.type === 'critical') ? "text-red-500 animate-pulse" : "text-yellow-500"} />
                Alert Engine
              </h2>
              <span className="text-[10px] text-slate-500 font-mono">{alerts.length} Events</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {alerts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                  <Info size={32} strokeWidth={1} />
                  <p className="text-xs mt-2">Monitoring signals...</p>
                </div>
              ) : (
                alerts.map(alert => (
                  <div 
                    key={alert.id} 
                    className={`p-3 rounded-xl border animate-in slide-in-from-right-4 duration-300 ${
                      alert.type === 'critical' ? 'bg-red-500/10 border-red-500/50' : 
                      alert.type === 'danger' ? 'bg-orange-500/10 border-orange-500/50' :
                      alert.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500/30' :
                      'bg-slate-800/50 border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className={`text-xs font-bold uppercase tracking-wider ${
                        alert.type === 'critical' ? 'text-red-400' : 
                        alert.type === 'danger' ? 'text-orange-400' : 
                        alert.type === 'warning' ? 'text-yellow-400' : 'text-slate-200'
                      }`}>{alert.title}</h4>
                      <span className="text-[10px] text-slate-500 font-mono">{alert.time}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{alert.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="mt-8 pt-6 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-[10px] text-slate-600 font-mono">
          SEC-ID: 801-123456 | NODE: {Math.random().toString(16).substr(2, 8).toUpperCase()}
        </div>
        <div className="flex items-center gap-6 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
          <span className="hover:text-slate-300 cursor-help transition-colors">Documentation</span>
          <span className="hover:text-slate-300 cursor-help transition-colors">API Status</span>
          <span className="text-slate-700">|</span>
          <span className="flex items-center gap-1 text-slate-400">
            <Shield size={10} /> Proprietary System
          </span>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
        @keyframes pulse-red {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
        .animate-pulse-red { animation: pulse-red 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}} />
    </div>
  );
};

// --- SUBCOMPONENTS ---

const MetricCard = ({ label, value, subValue, trend }) => (
  <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition-colors group flex flex-col justify-between">
    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2 group-hover:text-slate-400 transition-colors">
      {label}
    </span>
    <div className="flex items-baseline gap-2">
      <span className="text-lg lg:text-xl font-bold font-mono tracking-tight text-slate-100">{value}</span>
    </div>
    <div className="mt-1">
      <span className={`text-[10px] font-bold uppercase tracking-wider ${
        trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-slate-500'
      }`}>
        {subValue}
      </span>
    </div>
  </div>
);

export default App;