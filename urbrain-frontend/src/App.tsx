import { useEffect, useState } from 'react';
import { demoEngine } from './lib/demo-engine/DemoEngine';
import { useUrbrainStore } from './store/useUrbrainStore';
import CityMap from './components/CityMap';
import RoadIntelligencePanel from './components/panels/RoadIntelligencePanel';
import AIActionCenter from './components/panels/AIActionCenter';
import DemoController from './components/panels/DemoController';
import IncidentCommandPanel from './components/panels/IncidentCommandPanel';
import FleetPanel from './components/panels/FleetPanel';
import InfrastructurePanel from './components/panels/InfrastructurePanel';
import IncidentLogPanel from './components/panels/IncidentLogPanel';
import CameraMatrixPanel from './components/panels/CameraMatrixPanel';
import ToastNotification from './components/panels/ToastNotification';
import StreamSettingsModal from './components/panels/StreamSettingsModal';
import { LayoutDashboard, Bus, Map as MapIcon, Route, ShieldAlert, ChevronRight, ChevronLeft, Activity, Settings, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// const SOCKET_URL = 'http://localhost:8000';

function App() {
  const setConnected = useUrbrainStore(state => state.setConnected);
  const buses = useUrbrainStore(state => state.buses);
  const events = useUrbrainStore(state => state.events);
  const isConnected = useUrbrainStore(state => state.isConnected);
  const is3DMode = useUrbrainStore(state => state.is3DMode);
  const set3DMode = useUrbrainStore(state => state.set3DMode);
  const isLiveMode = useUrbrainStore(state => state.isLiveMode);
  const setLiveMode = useUrbrainStore(state => state.setLiveMode);
  const setSettingsOpen = useUrbrainStore(state => state.setSettingsOpen);
  const setSelectedBus = useUrbrainStore(state => state.setSelectedBus);
  const setDemoToast = useUrbrainStore(state => state.setDemoToast);
  const viewState = useUrbrainStore(state => state.viewState);
  const setViewState = useUrbrainStore(state => state.setViewState);
  const activeIncident = useUrbrainStore(state => state.activeIncident);
  
  const [showRightPanels, setShowRightPanels] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'fleet' | 'map' | 'route' | 'incidents'>('dashboard');

  useEffect(() => {
    // Start the singleton DemoEngine
    demoEngine.start();
    setConnected(true);

    return () => {
      demoEngine.stop();
      setConnected(false);
    };
  }, [setConnected]);

  return (
    <div className="flex h-screen bg-slate-50 text-gray-900 overflow-hidden font-sans">
      
      {/* Navigation Rail */}
      <nav className="w-16 flex flex-col items-center py-4 bg-white border-r border-gray-300 z-50">
        {/* Logo: "U" with hidden eye pupil — reads as both a U and a stylized eye */}
        <div className="w-10 h-10 rounded-xl mb-8 flex items-center justify-center shadow-md overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f2a6e 0%, #1a4fd6 60%, #38bdf8 100%)' }}>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* The U shape */}
            <path
              d="M5 4 L5 16 Q5 22 13 22 Q21 22 21 16 L21 4"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Eye pupil inside the open bowl of the U */}
            <circle cx="13" cy="17" r="2.2" fill="white" opacity="0.95"/>
            <circle cx="13" cy="17" r="1" fill="#38bdf8"/>
          </svg>
        </div>

        
        <div className="flex flex-col space-y-6">
          <NavItem icon={<LayoutDashboard size={24} />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<Bus size={24} />} active={activeTab === 'fleet'} onClick={() => setActiveTab('fleet')} />
          <NavItem icon={<MapIcon size={24} />} active={activeTab === 'map'} onClick={() => setActiveTab('map')} />
          <NavItem icon={<Route size={24} />} active={activeTab === 'route'} onClick={() => setActiveTab('route')} />
          <NavItem icon={<ShieldAlert size={24} />} active={activeTab === 'incidents'} onClick={() => setActiveTab('incidents')} />
        </div>
      </nav>

      <main className="flex-1 flex flex-col relative">
        
        {/* Command Bar */}
        <header className="h-14 bg-slate-50/90 backdrop-blur-md border-b border-gray-300 flex items-center justify-between px-6 z-40 absolute top-0 left-0 right-0">
          <div className="flex items-center space-x-4">
            <h1 className="font-semibold text-lg tracking-wide text-gray-900">URBAN EYE</h1>
            <span className="text-[10px] bg-white px-2 py-1 rounded text-gray-500 uppercase tracking-wider font-bold border border-gray-200">LIVE INTELLIGENCE BY TEAM PRISM</span>
          </div>

          <div className="flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-healthy animate-pulse' : 'bg-critical'}`}></span>
              <span className="text-gray-500">NETWORK {isConnected ? '98.4%' : 'OFFLINE'}</span>
            </div>

            {/* Database Persistence Status Badge */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <Database size={13} className="text-emerald-600 animate-pulse" />
              <span>SQLITE 3 LIVE</span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="font-mono text-accent">{buses.length}</span>
              <span className="text-gray-500 text-xs uppercase">Active Buses</span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="font-mono text-warning">{events.length}</span>
              <span className="text-gray-500 text-xs uppercase">Alerts</span>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-1"></div>

            {/* Hardware Stream / Simulation Switcher */}
            <div className="flex items-center bg-gray-200/70 p-0.5 rounded-lg border border-gray-300">
              <button
                type="button"
                onClick={() => {
                  setLiveMode(false);
                  setDemoToast({
                    id: Date.now(),
                    type: 'verify',
                    message: '🎮 Switched to SIMULATION MODE · 12 Corridor Buses active'
                  });
                }}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  !isLiveMode 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span>🎮 SIMULATION</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLiveMode(true);
                  if (buses.length > 0) setSelectedBus(buses[0]);
                  setDemoToast({
                    id: Date.now(),
                    type: 'detect',
                    message: '🛰️ Switched to LIVE EDGE NODE · Connected to Rishi\'s YOLO11 feed'
                  });
                }}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  isLiveMode 
                    ? 'bg-rose-600 text-white shadow-sm' 
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isLiveMode ? 'bg-white animate-pulse' : 'bg-rose-500'}`}></span>
                <span>🔴 LIVE NODE</span>
              </button>
            </div>

            {/* Stream Settings Button */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Configure Edge AI Stream IP & WebSocket"
              className="p-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer shadow-sm"
            >
              <Settings size={15} />
            </button>
            
            <button 
              onClick={() => {
                const newMode = !is3DMode;
                set3DMode(newMode);
                setViewState({
                  ...viewState,
                  pitch: newMode ? 60 : 45,
                  bearing: newMode ? 30 : 0,
                  zoom: newMode ? 15.5 : 13
                });
              }}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md border text-xs font-bold transition-all duration-300 ${
                is3DMode 
                  ? 'bg-accent/20 border-accent text-accent shadow-[0_0_15px_rgba(59,130,246,0.4)]' 
                  : 'bg-white border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-500'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${is3DMode ? 'bg-accent animate-pulse' : 'bg-gray-500'}`}></div>
              <span>{is3DMode ? '3D TWIN: ON' : '3D TWIN: OFF'}</span>
            </button>
          </div>
        </header>

        {/* 3D Map Area */}
        <div className="flex-1 relative w-full h-full">
          <CityMap />

          <AnimatePresence>
            {activeIncident && activeIncident.active && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.1, 0.4, 0.1] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 pointer-events-none shadow-[inset_0_0_250px_rgba(239,68,68,0.7)] z-10"
              />
            )}
          </AnimatePresence>
          
          {/* Conditionally Render Toggle Button ONLY for Dashboard tab */}
          {activeTab === 'dashboard' && (
            <button
              onClick={() => setShowRightPanels(!showRightPanels)}
              className="absolute top-1/2 right-0 -translate-y-1/2 bg-slate-50/90 border border-gray-200 border-r-0 rounded-l-xl p-2 z-50 text-gray-500 hover:text-gray-900 transition-colors"
            >
              {showRightPanels ? <ChevronRight size={24} /> : <div className="flex flex-col items-center"><Activity size={18} className="mb-1 text-accent"/><ChevronLeft size={24} /></div>}
            </button>
          )}

          {/* Conditional View Rendering */}
          {activeTab === 'dashboard' && showRightPanels && (
            <div className="absolute right-6 top-20 bottom-4 w-96 flex flex-col gap-4 overflow-y-auto pointer-events-none z-40 pb-20" style={{ scrollbarWidth: 'none' }}>
              <RoadIntelligencePanel />
              <AIActionCenter />
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DemoController />
          )}

          {activeTab === 'fleet' && <FleetPanel />}
          {activeTab === 'route' && <InfrastructurePanel />}
          {activeTab === 'incidents' && <IncidentLogPanel />}

          <IncidentCommandPanel />
          <CameraMatrixPanel />
        </div>

          {/* Global toast — rendered outside the map div so it sits above everything */}
          <ToastNotification />

          {/* Stream Settings Configuration Modal */}
          <StreamSettingsModal />

      </main>
    </div>
  );
}

function NavItem({ icon, active = false, onClick }: { icon: React.ReactNode, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`p-2 rounded-xl transition-all duration-200 ${active ? 'bg-accent/20 text-accent shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'text-gray-500 hover:text-gray-700 hover:bg-white'}`}
    >
      {icon}
    </button>
  );
}

export default App;
