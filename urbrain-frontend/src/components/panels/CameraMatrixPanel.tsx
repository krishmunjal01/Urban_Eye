import { useUrbrainStore } from '../../store/useUrbrainStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Video, Cpu, Thermometer, Wifi, Camera, Activity, Maximize2, Eye, AlertTriangle, Settings, WifiOff, Radio } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

// Simulated camera feed videos (using the provided 1.mp4 and 2.mp4 with CSS cropping)
const CAMERA_FEEDS = {
  front: { url: '/1_balanced.mp4', position: 'center center' },
  left:  { url: '/1_balanced.mp4', position: 'left center' },
  right: { url: '/1_balanced.mp4', position: 'right center' },
  rear:  { url: '/2_balanced.mp4', position: 'left center' },
  cabin: { url: '/2_balanced.mp4', position: 'center center' },
};

const CAMERA_LABELS = [
  { key: 'front', label: 'FRONT CAM', color: '#3b82f6' },
  { key: 'left',  label: 'LEFT CAM',  color: '#10b981' },
  { key: 'right', label: 'RIGHT CAM', color: '#10b981' },
  { key: 'rear',  label: 'REAR CAM',  color: '#f59e0b' },
  { key: 'cabin', label: 'CABIN CAM', color: '#8b5cf6' },
];

interface Detection {
  label: string;
  confidence: number;
  x: number; // percent
  y: number;
  w: number;
  h: number;
  color: string;
}

function FrontCamOverlay({ liveDetections }: { liveDetections: Detection[] }) {
  const boxes = liveDetections;

  return (
    <>
      {boxes.map((box, i) => (
        <motion.div
          key={`${box.label}-${i}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="absolute pointer-events-none"
          style={{
            left: `${box.x}%`, top: `${box.y}%`,
            width: `${box.w}%`, height: `${box.h}%`,
            border: `2px solid ${box.color}`,
            borderRadius: 3,
          }}
        >
          {/* Label tag */}
          <div
            className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap rounded-sm"
            style={{ background: box.color, color: '#fff' }}
          >
            {box.label} {box.confidence}%
          </div>
          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2" style={{ borderColor: box.color }} />
          <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2" style={{ borderColor: box.color }} />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2" style={{ borderColor: box.color }} />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2" style={{ borderColor: box.color }} />
        </motion.div>
      ))}
    </>
  );
}

function CabinCamOverlay() {
  const [drowsy, setDrowsy] = useState(false);

  // Simulate occasional drowsiness alert for demo
  useEffect(() => {
    const interval = setInterval(() => {
      setDrowsy(prev => !prev);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute bottom-4 left-4 right-4">
      <AnimatePresence mode="wait">
        {drowsy ? (
          <motion.div
            key="alert"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex items-center space-x-2 bg-critical/90 backdrop-blur-sm px-4 py-2 rounded-xl border border-critical"
          >
            <AlertTriangle size={16} className="text-gray-900 animate-pulse" />
            <span className="text-sm font-bold text-gray-900">⚠️ DROWSINESS DETECTED — Driver Safety Alert</span>
          </motion.div>
        ) : (
          <motion.div
            key="ok"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex items-center space-x-2 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-xl border border-healthy/40"
          >
            <Eye size={16} className="text-healthy" />
            <span className="text-sm font-bold text-healthy">DRIVER MONITORING: ATTENTIVE ✅</span>
            <span className="ml-auto text-xs text-gray-500">Eye Closure: 12% · Head Pose: Normal</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --------------- Main Component ---------------
export default function CameraMatrixPanel() {
  const selectedBus   = useUrbrainStore(state => state.selectedBus);
  const setSelectedBus = useUrbrainStore(state => state.setSelectedBus);
  const isLiveMode    = useUrbrainStore(state => state.isLiveMode);
  const liveStreamUrl = useUrbrainStore(state => state.liveStreamUrl);
  const liveWsUrl     = useUrbrainStore(state => state.liveWsUrl);
  const setSettingsOpen = useUrbrainStore(state => state.setSettingsOpen);

  const [expandedCamera, setExpandedCamera] = useState<string | null>(null);
  const [failedUrl, setFailedUrl]           = useState<string | null>(null);
  const streamFailed = failedUrl === liveStreamUrl && isLiveMode;
  
  // Live detections from the friend's model (received via WebSocket)
  const [liveDetections, setLiveDetections] = useState<Detection[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to backend WebSocket to receive LIVE detections from the friend's YOLO model
  useEffect(() => {
    if (!selectedBus) return;
    try {
      const ws = new WebSocket(liveWsUrl);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.detections) setLiveDetections(data.detections);
        } catch (_) {}
      };
      ws.onerror = () => { /* Silently fall back to simulated detections */ };
    } catch (_) {}
    return () => { wsRef.current?.close(); };
  }, [selectedBus, liveWsUrl]);

  // ESC key to close expanded view
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedCamera(null); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <>
      {/* ─── Expanded Full-Screen Camera Modal ─── */}
      <AnimatePresence>
        {expandedCamera && selectedBus && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200/50 bg-white/80 shrink-0">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-critical animate-pulse" />
                  <span className="text-sm font-bold text-gray-900 tracking-wider">LIVE</span>
                </div>
                <span className="text-base font-bold text-gray-900">{selectedBus.id}</span>
                <span className="text-sm text-gray-500">—</span>
                <span className="text-sm font-bold text-accent">
                  {CAMERA_LABELS.find(c => c.key === expandedCamera)?.label}
                </span>
                {expandedCamera === 'front' && (
                  <span className={`text-xs px-2.5 py-0.5 rounded font-bold ${
                    isLiveMode 
                      ? 'bg-rose-600/20 text-rose-600 border border-rose-300' 
                      : 'bg-accent/20 text-accent'
                  }`}>
                    {isLiveMode ? '🤖 YOLO11 NANO EDGE STREAM (RISHI)' : '🤖 AI DETECTION ACTIVE'}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-6 text-xs text-gray-500">
                <div className="flex items-center space-x-1.5"><Activity size={13} className="text-accent" /><span>{selectedBus.speed.toFixed(0)} km/h</span></div>
                <div className="flex items-center space-x-1.5"><Cpu size={13} className="text-warning" /><span>GPU 62°C</span></div>
                <div className="flex items-center space-x-1.5"><Wifi size={13} className="text-healthy" /><span>{isLiveMode ? 'LAN · <30ms' : '5G · 42ms'}</span></div>
                <button 
                  onClick={() => setSettingsOpen(true)}
                  title="Configure Stream IP" 
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all cursor-pointer"
                >
                  <Settings size={16} />
                </button>
                <button onClick={() => setExpandedCamera(null)} className="ml-1 p-2 rounded-lg bg-white hover:bg-critical/30 text-gray-500 hover:text-critical transition-all cursor-pointer">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Feed */}
            <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
              {isLiveMode && expandedCamera === 'front' ? (
                streamFailed ? (
                  <div className="flex flex-col items-center justify-center text-center p-8 text-white max-w-md">
                    <WifiOff size={48} className="text-rose-500 mb-3 animate-pulse" />
                    <h4 className="text-base font-bold mb-1">Live Edge Stream Offline</h4>
                    <p className="text-xs text-gray-400 mb-2 font-mono break-all">{liveStreamUrl}</p>
                    <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                      Make sure Rishi&apos;s laptop is running <code className="text-blue-400">urban_eye_edge.py</code> and both laptops are on the same hotspot.
                    </p>
                    <div className="flex space-x-3">
                      <button 
                        onClick={() => setFailedUrl(null)}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Retry Connection
                      </button>
                      <button 
                        onClick={() => setSettingsOpen(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
                      >
                        Configure IP Address
                      </button>
                    </div>
                  </div>
                ) : (
                  <img
                    src={liveStreamUrl}
                    onError={() => setFailedUrl(liveStreamUrl)}
                    alt="Rishi's Live YOLO11 Feed"
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <video
                  src={CAMERA_FEEDS[expandedCamera as keyof typeof CAMERA_FEEDS].url}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ objectPosition: CAMERA_FEEDS[expandedCamera as keyof typeof CAMERA_FEEDS].position }}
                  autoPlay loop muted playsInline
                />
              )}
              {/* Scanline */}
              <div className="absolute inset-0 pointer-events-none opacity-10"
                style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 6px)' }}
              />
              {/* YOLO Overlay on Front Cam (only if simulated/separate boxes received) */}
              <AnimatePresence>
                {expandedCamera === 'front' && (!isLiveMode || liveDetections.length > 0) && (
                  <FrontCamOverlay liveDetections={liveDetections} />
                )}
              </AnimatePresence>
              {/* Driver monitoring on Cabin Cam */}
              {expandedCamera === 'cabin' && <CabinCamOverlay />}
              {/* Timestamp */}
              <div className="absolute top-4 right-4 font-mono text-xs text-gray-900/60 bg-white/40 px-2 py-1 rounded">
                {new Date().toLocaleTimeString()} IST
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Bottom Camera Matrix Panel ─── */}
      <AnimatePresence>
        {selectedBus && !expandedCamera && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute inset-x-4 bottom-4 z-50 bg-white/95 backdrop-blur-xl border border-gray-200/50 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200/50 bg-slate-50/50">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${isLiveMode ? 'bg-rose-500 animate-ping' : 'bg-healthy animate-pulse'}`} />
                  <h2 className="text-base font-bold tracking-wider text-gray-900">{selectedBus.id}</h2>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent font-mono">{selectedBus.route}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-bold ${isLiveMode ? 'bg-rose-100 text-rose-700' : 'bg-healthy/20 text-healthy'}`}>
                  {isLiveMode ? 'LIVE YOLO11 NODE' : selectedBus.status}
                </span>
              </div>
              <div className="flex items-center space-x-6 text-xs text-gray-500">
                <div className="flex items-center space-x-1.5"><Activity size={13} className="text-accent" /><span>{selectedBus.speed.toFixed(0)} km/h</span></div>
                <div className="flex items-center space-x-1.5"><Cpu size={13} className="text-warning" /><span>GPU 62°C</span></div>
                <div className="flex items-center space-x-1.5"><Thermometer size={13} className="text-critical" /><span>CPU 54°C</span></div>
                <div className="flex items-center space-x-1.5"><Wifi size={13} className="text-healthy" /><span>{isLiveMode ? 'LAN · <30ms' : '5G · 42ms'}</span></div>
                <div className="flex items-center space-x-1.5"><Camera size={13} className="text-accent" /><span>{selectedBus.cameras} Active</span></div>
                <button 
                  onClick={() => setSettingsOpen(true)} 
                  title="Configure Live Stream" 
                  className="p-1.5 rounded-lg bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-all border border-gray-200 cursor-pointer"
                >
                  <Settings size={15} />
                </button>
                <button onClick={() => setSelectedBus(null)} className="ml-1 p-1.5 rounded-lg bg-white hover:bg-critical/30 text-gray-500 hover:text-critical transition-all cursor-pointer">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* 5-Camera Grid */}
            <div className="p-4">
              <div className="grid grid-cols-5 gap-3" style={{ height: '220px' }}>
                {CAMERA_LABELS.map((cam, idx) => (
                  <motion.div
                    key={cam.key}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.06 }}
                    onClick={() => setExpandedCamera(cam.key)}
                    className="relative rounded-xl overflow-hidden border border-gray-200/40 cursor-pointer hover:border-accent/60 transition-all group bg-slate-900"
                  >
                    {isLiveMode && cam.key === 'front' ? (
                      streamFailed ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-white p-3 text-center">
                          <WifiOff size={24} className="text-rose-500 mb-1" />
                          <span className="text-[11px] font-bold text-gray-200">Stream Offline</span>
                          <span className="text-[9px] text-gray-400">Check IP in Settings</span>
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }}
                            className="mt-2 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            Configure IP
                          </button>
                        </div>
                      ) : (
                        <img
                          src={liveStreamUrl}
                          onError={() => setFailedUrl(liveStreamUrl)}
                          alt="Rishi's Live Feed"
                          className="w-full h-full object-cover"
                        />
                      )
                    ) : (
                      <video 
                        src={CAMERA_FEEDS[cam.key as keyof typeof CAMERA_FEEDS].url} 
                        className="w-full h-full object-cover"
                        style={{ objectPosition: CAMERA_FEEDS[cam.key as keyof typeof CAMERA_FEEDS].position }}
                        autoPlay loop muted playsInline
                      />
                    )}
                    {/* Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                    {/* LIVE */}
                    <div className="absolute top-2 left-2 flex items-center space-x-1.5 bg-white/60 backdrop-blur-sm px-2 py-0.5 rounded-md pointer-events-none">
                      <div className={`w-1.5 h-1.5 rounded-full ${isLiveMode && cam.key === 'front' ? 'bg-rose-600 animate-ping' : 'bg-critical animate-pulse'}`} />
                      <span className="text-[10px] font-bold text-gray-900 tracking-wider">
                        {isLiveMode && cam.key === 'front' ? 'RISHI CAM' : 'LIVE'}
                      </span>
                    </div>
                    {/* AI badge on front cam */}
                    {cam.key === 'front' && (
                      <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded-md flex items-center space-x-1 pointer-events-none ${
                        isLiveMode ? 'bg-rose-600/90 text-white' : 'bg-accent/30 text-accent'
                      }`}>
                        {isLiveMode && <Radio size={10} className="animate-pulse" />}
                        <span className="text-[10px] font-bold">
                          {isLiveMode ? 'YOLO11' : 'AI'}
                        </span>
                      </div>
                    )}
                    {/* Label */}
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 flex items-center justify-between">
                      <div className="flex items-center space-x-1">
                        <Video size={11} style={{ color: cam.color }} />
                        <span className="text-[10px] font-bold text-gray-900">{cam.label}</span>
                      </div>
                    </div>
                    {/* Hover expand overlay */}
                    <div className="absolute inset-0 bg-white/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="flex items-center space-x-2 bg-accent/80 px-3 py-1.5 rounded-lg">
                        <Maximize2 size={14} className="text-gray-900" />
                        <span className="text-xs font-bold text-gray-900">Expand</span>
                      </div>
                    </div>
                    {/* Scanline */}
                    <div className="absolute inset-0 pointer-events-none opacity-20"
                      style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)' }}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
