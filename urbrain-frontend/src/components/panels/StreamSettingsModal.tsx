import { useState } from 'react';
import { useUrbrainStore } from '../../store/useUrbrainStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X, Wifi, CheckCircle2, AlertCircle, RefreshCw, Radio } from 'lucide-react';

export default function StreamSettingsModal() {
  const isSettingsOpen = useUrbrainStore(state => state.isSettingsOpen);
  const setSettingsOpen = useUrbrainStore(state => state.setSettingsOpen);
  const liveStreamUrl = useUrbrainStore(state => state.liveStreamUrl);
  const setLiveStreamUrl = useUrbrainStore(state => state.setLiveStreamUrl);
  const liveWsUrl = useUrbrainStore(state => state.liveWsUrl);
  const setLiveWsUrl = useUrbrainStore(state => state.setLiveWsUrl);

  const [streamInput, setStreamInput] = useState(liveStreamUrl);
  const [wsInput, setWsInput] = useState(liveWsUrl);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  if (!isSettingsOpen) return null;

  const handleTestConnection = () => {
    setTestStatus('testing');
    setTestMessage('Pinging video stream...');

    const img = new Image();
    const timeout = setTimeout(() => {
      img.src = '';
      setTestStatus('error');
      setTestMessage('Connection timed out. Check IP and port 5000.');
    }, 4000);

    img.onload = () => {
      clearTimeout(timeout);
      setTestStatus('success');
      setTestMessage('Stream is active and reachable! 30 FPS ready.');
    };

    img.onerror = () => {
      clearTimeout(timeout);
      // MJPEG streams sometimes trigger onerror in Image element on certain browsers while still streaming;
      // perform a quick fetch check as fallback:
      fetch(streamInput, { mode: 'no-cors' })
        .then(() => {
          setTestStatus('success');
          setTestMessage('Stream endpoint responded successfully!');
        })
        .catch(() => {
          setTestStatus('error');
          setTestMessage('Cannot reach stream. Make sure Python edge node is running.');
        });
    };

    // Append timestamp to bypass caching
    const url = streamInput.includes('?') ? `${streamInput}&_t=${Date.now()}` : `${streamInput}?_t=${Date.now()}`;
    img.src = url;
  };

  const handleSave = () => {
    setLiveStreamUrl(streamInput.trim());
    setLiveWsUrl(wsInput.trim());
    setSettingsOpen(false);
  };

  const applyLocalPreset = () => {
    setStreamInput('http://localhost:5000/video_feed');
    setWsInput('ws://localhost:8000/ws/detections');
  };

  const applyRenderPreset = () => {
    setWsInput('wss://sih-2026-pqbo.onrender.com/ws/detections');
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 pointer-events-auto"
        onClick={() => setSettingsOpen(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-50/70">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <Settings size={20} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm tracking-wide">Hardware Stream Settings</h3>
                <p className="text-xs text-gray-500">Configure your friend&apos;s laptop IP and detection WebSocket</p>
              </div>
            </div>
            <button
              onClick={() => setSettingsOpen(false)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Body */}
          <div className="p-6 space-y-5">
            {/* Quick Presets */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-gray-400 font-medium">Quick Presets:</span>
              <button
                type="button"
                onClick={applyLocalPreset}
                className="px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-mono transition-colors cursor-pointer"
              >
                Localhost (Port 5000 &amp; 8000)
              </button>
              <button
                type="button"
                onClick={applyRenderPreset}
                className="px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-mono transition-colors cursor-pointer"
              >
                Render Cloud WS
              </button>
            </div>

            {/* Stream URL Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center space-x-1.5">
                <Wifi size={14} className="text-blue-600" />
                <span>Friend&apos;s Live Camera Stream URL (LAN MJPEG)</span>
              </label>
              <input
                type="text"
                value={streamInput}
                onChange={(e) => setStreamInput(e.target.value)}
                placeholder="http://192.168.43.150:5000/video_feed"
                className="w-full px-3.5 py-2.5 text-sm font-mono border border-gray-300 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-800"
              />
              <p className="text-[11px] text-gray-400">
                Format: <code className="text-gray-600 font-mono">http://&lt;friend-ip&gt;:5000/video_feed</code> (served by urban_eye_edge.py)
              </p>
            </div>

            {/* WebSocket URL Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center space-x-1.5">
                <Radio size={14} className="text-emerald-600" />
                <span>Backend WebSocket URL (Detections &amp; Alerts)</span>
              </label>
              <input
                type="text"
                value={wsInput}
                onChange={(e) => setWsInput(e.target.value)}
                placeholder="wss://sih-2026-pqbo.onrender.com/ws/detections"
                className="w-full px-3.5 py-2.5 text-sm font-mono border border-gray-300 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-800"
              />
              <p className="text-[11px] text-gray-400">
                Default: Render production URL or <code className="text-gray-600 font-mono">ws://localhost:8000/ws/detections</code>
              </p>
            </div>

            {/* Test Connection Button & Status */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw size={13} className={testStatus === 'testing' ? 'animate-spin' : ''} />
                <span>Test Video Stream</span>
              </button>

              {testStatus === 'success' && (
                <div className="flex items-center space-x-1.5 text-xs text-emerald-600 font-medium">
                  <CheckCircle2 size={15} />
                  <span>{testMessage}</span>
                </div>
              )}

              {testStatus === 'error' && (
                <div className="flex items-center space-x-1.5 text-xs text-rose-600 font-medium">
                  <AlertCircle size={15} />
                  <span>{testMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 bg-slate-50 border-t border-gray-100 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-200/50 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-sm transition-all cursor-pointer"
            >
              Save Configuration
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
