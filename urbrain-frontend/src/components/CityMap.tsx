import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Map from 'react-map-gl/maplibre';
import { Maximize2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import DeckGL from '@deck.gl/react';
import { WebMercatorViewport } from '@deck.gl/core';
import { IconLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useUrbrainStore } from '../store/useUrbrainStore';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// Fix for Vite production build Web Worker issues
setWorkerUrl(workerUrl);

// Free light basemap from CartoDB (no API key required)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

// High-tech 2D Bus Icon (crisp vehicle glyph with directional pulse halo)
const NAV_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="26" fill="rgba(15, 82, 186, 0.18)" stroke="#0F52BA" stroke-width="1.5" stroke-dasharray="3,3"/>
  <circle cx="32" cy="32" r="16" fill="#0F52BA" stroke="white" stroke-width="2"/>
  <path d="M32 18 L40 38 L32 34 L24 38 Z" fill="white"/>
</svg>
`;
const NAV_ICON_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NAV_ICON_SVG)}`;

export type BuildingTheme = 'smoked-glass' | 'slate-architectural' | 'cyber-cyan' | 'pure-satellite';

export const BUILDING_THEMES: Record<BuildingTheme, {
  name: string;
  badge: string;
  fillColor: any;
  opacity: number;
  height: any;
  outlineColor: string;
  outlineWidth: number;
  outlineOpacity: number;
  lightColor: string;
  lightIntensity: number;
}> = {
  'smoked-glass': {
    name: 'Smoked Glass',
    badge: '💎 Smoked Glass',
    fillColor: [
      'interpolate',
      ['linear'],
      [
        'case',
        ['has', 'height'], ['to-number', ['get', 'height'], 8.5],
        ['has', 'render_height'], ['to-number', ['get', 'render_height'], 8.5],
        ['has', 'levels'], ['*', ['to-number', ['get', 'levels'], 2], 3.5],
        8.5
      ],
      0, '#0F172A',   // Street foundation: Deep obsidian slate
      8, '#1E293B',   // Residential (1-2 stories): Sleek smoked graphite glass
      14, '#334155',  // Commercial / SCO: Dark tinted architectural glass
      22, '#0284C7'   // Civic / Hospital / Landmarks: Luminous cyan glass prism
    ],
    opacity: 0.76,
    height: [
      'case',
      ['has', 'height'], ['to-number', ['get', 'height'], 8.5],
      ['has', 'render_height'], ['to-number', ['get', 'render_height'], 8.5],
      ['has', 'levels'], ['*', ['to-number', ['get', 'levels'], 2], 3.5],
      ['==', ['get', 'kind'], 'hospital'], 24,
      ['==', ['get', 'kind'], 'commercial'], 16,
      ['==', ['get', 'kind'], 'retail'], 12,
      ['==', ['get', 'kind'], 'civic'], 18,
      ['==', ['get', 'type'], 'hospital'], 24,
      ['==', ['get', 'type'], 'civic'], 18,
      ['==', ['get', 'type'], 'commercial'], 16,
      ['==', ['get', 'type'], 'retail'], 12,
      ['==', ['get', 'type'], 'residential'], 8,
      8.5 // Authentic Chandigarh residential scale (realistic 2-story neighborhoods)
    ],
    outlineColor: '#38BDF8',
    outlineWidth: 1.0,
    outlineOpacity: 0.55,
    lightColor: '#E0F2FE',
    lightIntensity: 0.90
  },
  'slate-architectural': {
    name: 'Architectural Slate',
    badge: '🏛️ Slate Stone',
    fillColor: [
      'interpolate',
      ['linear'],
      [
        'case',
        ['has', 'height'], ['to-number', ['get', 'height'], 8.5],
        ['has', 'render_height'], ['to-number', ['get', 'render_height'], 8.5],
        ['has', 'levels'], ['*', ['to-number', ['get', 'levels'], 2], 3.5],
        8.5
      ],
      0, '#334155',   // Slate foundation
      8, '#475569',   // Natural architectural concrete & granite
      14, '#64748B',  // Modern urban stone
      22, '#2563EB'   // Landmark glass facade
    ],
    opacity: 0.82,
    height: [
      'case',
      ['has', 'height'], ['to-number', ['get', 'height'], 8.5],
      ['has', 'render_height'], ['to-number', ['get', 'render_height'], 8.5],
      ['has', 'levels'], ['*', ['to-number', ['get', 'levels'], 2], 3.5],
      ['==', ['get', 'kind'], 'hospital'], 24,
      ['==', ['get', 'kind'], 'commercial'], 16,
      ['==', ['get', 'kind'], 'retail'], 12,
      ['==', ['get', 'kind'], 'civic'], 18,
      ['==', ['get', 'type'], 'hospital'], 24,
      ['==', ['get', 'type'], 'civic'], 18,
      ['==', ['get', 'type'], 'commercial'], 16,
      ['==', ['get', 'type'], 'retail'], 12,
      ['==', ['get', 'type'], 'residential'], 8,
      8.5
    ],
    outlineColor: '#94A3B8',
    outlineWidth: 0.9,
    outlineOpacity: 0.45,
    lightColor: '#FFFBEB',
    lightIntensity: 0.92
  },
  'cyber-cyan': {
    name: 'Cyber Matrix',
    badge: '⚡ Cyber Matrix',
    fillColor: [
      'interpolate',
      ['linear'],
      [
        'case',
        ['has', 'height'], ['to-number', ['get', 'height'], 8.5],
        ['has', 'render_height'], ['to-number', ['get', 'render_height'], 8.5],
        ['has', 'levels'], ['*', ['to-number', ['get', 'levels'], 2], 3.5],
        8.5
      ],
      0, '#0369A1',
      8, '#0284C7',
      14, '#0EA5E9',
      22, '#38BDF8'
    ],
    opacity: 0.48,
    height: [
      'case',
      ['has', 'height'], ['to-number', ['get', 'height'], 8.5],
      ['has', 'render_height'], ['to-number', ['get', 'render_height'], 8.5],
      ['has', 'levels'], ['*', ['to-number', ['get', 'levels'], 2], 3.5],
      ['==', ['get', 'kind'], 'hospital'], 24,
      ['==', ['get', 'kind'], 'commercial'], 16,
      ['==', ['get', 'kind'], 'retail'], 12,
      ['==', ['get', 'kind'], 'civic'], 18,
      ['==', ['get', 'type'], 'hospital'], 24,
      ['==', ['get', 'type'], 'civic'], 18,
      ['==', ['get', 'type'], 'commercial'], 16,
      ['==', ['get', 'type'], 'retail'], 12,
      ['==', ['get', 'type'], 'residential'], 8,
      8.5
    ],
    outlineColor: '#00F5FF',
    outlineWidth: 1.2,
    outlineOpacity: 0.80,
    lightColor: '#CFFAFE',
    lightIntensity: 0.95
  },
  'pure-satellite': {
    name: 'Pure Satellite',
    badge: '🛰️ Pure Satellite',
    fillColor: '#000000',
    opacity: 0,
    height: 0,
    outlineColor: '#0284C7',
    outlineWidth: 0.8,
    outlineOpacity: 0.40,
    lightColor: '#FFFFFF',
    lightIntensity: 0.85
  }
};

export default function CityMap() {
  const buses = useUrbrainStore(state => state.buses);
  const events = useUrbrainStore(state => state.events);
  const segments = useUrbrainStore(state => state.segments);
  const activeIncident = useUrbrainStore(state => state.activeIncident);
  const viewState = useUrbrainStore(state => state.viewState);
  const setViewState = useUrbrainStore(state => state.setViewState);
  const is3DMode = useUrbrainStore(state => state.is3DMode);
  const setSelectedBus = useUrbrainStore(state => state.setSelectedBus);
  const selectedEvent = useUrbrainStore(state => state.selectedEvent);
  const setSelectedEvent = useUrbrainStore(state => state.setSelectedEvent);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [dispatchState, setDispatchState] = useState<'idle' | 'confirm' | 'loading' | 'success'>('idle');
  const [buildingTheme, setBuildingTheme] = useState<BuildingTheme>('smoked-glass');
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState<boolean>(true);

  const mapRef = useRef<any>(null);
  const viewport = useMemo(() => new WebMercatorViewport(viewState), [viewState]);

  // Synchronize building theme & architectural style to MapLibre layers
  const applyBuildingTheme = useCallback((themeKey: BuildingTheme, is3D: boolean) => {
    const map = mapRef.current;
    if (!map) return;

    try {
      if (themeKey === 'pure-satellite') {
        if (map.getLayer('3d-buildings')) {
          map.setLayoutProperty('3d-buildings', 'visibility', 'none');
        }
        if (map.getLayer('3d-buildings-outline')) {
          map.setLayoutProperty('3d-buildings-outline', 'visibility', is3D ? 'visible' : 'none');
          map.setPaintProperty('3d-buildings-outline', 'line-color', '#0284C7');
          map.setPaintProperty('3d-buildings-outline', 'line-opacity', 0.40);
          map.setPaintProperty('3d-buildings-outline', 'line-width', 0.8);
        }
        return;
      }

      const cfg = BUILDING_THEMES[themeKey] || BUILDING_THEMES['smoked-glass'];

      if (map.getLayer('3d-buildings')) {
        map.setLayoutProperty('3d-buildings', 'visibility', is3D ? 'visible' : 'none');
        map.setPaintProperty('3d-buildings', 'fill-extrusion-color', cfg.fillColor);
        map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', cfg.opacity);
        map.setPaintProperty('3d-buildings', 'fill-extrusion-height', cfg.height);
      }
      if (map.getLayer('3d-buildings-outline')) {
        map.setLayoutProperty('3d-buildings-outline', 'visibility', is3D ? 'visible' : 'none');
        map.setPaintProperty('3d-buildings-outline', 'line-color', cfg.outlineColor);
        map.setPaintProperty('3d-buildings-outline', 'line-opacity', cfg.outlineOpacity);
        map.setPaintProperty('3d-buildings-outline', 'line-width', cfg.outlineWidth);
      }
      if (typeof map.setLight === 'function' && is3D) {
        map.setLight({
          anchor: 'map',
          position: [1.5, 210, 32],
          color: cfg.lightColor,
          intensity: cfg.lightIntensity
        });
      }
    } catch (err) {
      console.warn('Could not dynamically update building theme:', err);
    }
  }, []);

  // Synchronize MapLibre 3D building layers, satellite ground imagery, sky fog & sun lighting with is3DMode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    try {
      if (map.getLayer('satellite-layer')) {
        map.setLayoutProperty('satellite-layer', 'visibility', is3DMode ? 'visible' : 'none');
      }

      applyBuildingTheme(buildingTheme, is3DMode);

      // Atmospheric Sky Fog (eliminates harsh blank white void at tilted angles)
      if (typeof (map as any).setFog === 'function') {
        if (is3DMode) {
          (map as any).setFog({
            range: [0.5, 12],
            color: '#d0e2ff',          // Crisp daytime atmospheric haze
            'high-color': '#1d4ed8',    // Deep sky blue zenith
            'space-color': '#0f172a',
            'horizon-blend': 0.18
          });
        } else {
          (map as any).setFog(null);
        }
      }

      if (typeof map.setLight === 'function' && !is3DMode) {
        // Soft uniform ambient lighting in 2D mode
        map.setLight({
          anchor: 'viewport',
          position: [1.15, 210, 30],
          color: '#FFFFFF',
          intensity: 0.25
        });
      }
    } catch (_) {}
  }, [is3DMode, buildingTheme, applyBuildingTheme]);

  let popupX = 0;
  let popupY = 0;
  let isTopAnchor = false;
  
  if (selectedEvent) {
    const projected = viewport.project([
      selectedEvent.longitude, 
      selectedEvent.latitude,
      is3DMode ? 28 : 0
    ]);
    popupX = projected[0];
    popupY = projected[1];
    isTopAnchor = popupY < 380;
  }

  const layers: any[] = [];

  if (is3DMode) {
    // Ground contact shadow underneath 3D buses to anchor them to the asphalt
    layers.push(
      new ScatterplotLayer({
        id: 'buses-shadow-layer',
        data: buses,
        pickable: false,
        getPosition: (d: any) => [d.longitude, d.latitude, 0],
        getRadius: 14,
        radiusMinPixels: 8,
        radiusMaxPixels: 20,
        getFillColor: [15, 23, 42, 130], // Deep ground contact shadow
        transitions: {
          getPosition: { duration: 1000, easing: (t: number) => t }
        }
      }),
      // Forward Edge AI Sensor Light Cone (showing camera scanning the road ahead)
      new ScatterplotLayer({
        id: 'buses-fov-layer',
        data: buses,
        pickable: false,
        getPosition: (d: any) => {
          const rad = (d.heading * Math.PI) / 180;
          const deltaLat = (14 / 111320) * Math.cos(rad);
          const deltaLon = (14 / (111320 * Math.cos((d.latitude * Math.PI) / 180))) * Math.sin(rad);
          return [d.longitude + deltaLon, d.latitude + deltaLat, 0.3];
        },
        getRadius: 14,
        radiusMinPixels: 8,
        radiusMaxPixels: 22,
        getFillColor: [56, 189, 248, 55], // Luminous cyan perception sweep
        transitions: {
          getPosition: { duration: 1000, easing: (t: number) => t }
        }
      }),
      // Bold, clearly visible 3D Bus running flat on the asphalt (Roll 90 keeps wheels grounded)
      new ScenegraphLayer({
        id: 'buses-3d-layer',
        data: buses,
        pickable: true,
        scenegraph: '/scene.glb',
        getPosition: (d: any) => [d.longitude, d.latitude, 0],
        getOrientation: (d: any) => [0, -d.heading + 180, 90], // Roll 90 grounds the wheels flat on the road surface
        getTranslation: [-1.2, 0, 0], // Center pivot
        sizeScale: 10.5, // Perfectly visible, bold 3D bus scale
        _lighting: 'pbr',
        onClick: (info: any) => { if (info.object) setSelectedBus(info.object); },
        transitions: {
          getPosition: { duration: 1000, easing: (t: number) => t }
        }
      })
    );
  } else {
    layers.push(
      new IconLayer({
        id: 'buses-layer',
        data: buses,
        pickable: true,
        onClick: (info: any) => { if (info.object) setSelectedBus(info.object); },
        iconAtlas: NAV_ICON_URL,
        iconMapping: {
          bus: { x: 0, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32 }
        },
        getIcon: () => 'bus',
        sizeScale: 1,
        getPosition: (d: any) => [d.longitude, d.latitude],
        getSize: () => 36,
        getColor: (d: any) => d.status === 'SEARCHING' ? [245, 158, 11] : [15, 82, 186],
        getAngle: (d: any) => -d.heading,
        transitions: {
          getPosition: { duration: 1000, easing: (t: number) => t },
          getAngle: { duration: 1000, easing: (t: number) => t }
        }
      })
    );
  }

  // 3D Holographic Hazard Beacons (Vertical Laser Light Pillars anchored to the asphalt)
  if (is3DMode) {
    layers.push(
      // Vertical laser guide beam from asphalt up to the floating beacon pin
      new PathLayer({
        id: 'events-beacon-pillar-layer',
        data: events,
        pickable: false,
        widthScale: 1,
        widthMinPixels: 2,
        widthMaxPixels: 4,
        jointRounded: true,
        capRounded: true,
        getPath: (d: any) => [
          [d.longitude, d.latitude, 0],
          [d.longitude, d.latitude, 26]
        ],
        getColor: (d: any) => d.severity === 'HIGH' ? [239, 68, 68, 220] : [245, 158, 11, 220],
        getWidth: () => 2.5
      }),
      // Ground contact warning pulse circle marking exact defect location on the asphalt
      new ScatterplotLayer({
        id: 'events-ground-pulse-layer',
        data: events,
        pickable: false,
        getPosition: (d: any) => [d.longitude, d.latitude, 0.4],
        getRadius: 12,
        radiusMinPixels: 7,
        radiusMaxPixels: 18,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 2,
        getFillColor: (d: any) => d.severity === 'HIGH' ? [239, 68, 68, 70] : [245, 158, 11, 70],
        getLineColor: (d: any) => d.severity === 'HIGH' ? [239, 68, 68, 240] : [245, 158, 11, 240],
      })
    );
  }

  // Event marker pin (elevated to top of beacon pillar in 3D mode)
  layers.push(
    new IconLayer({
      id: 'events-layer',
      data: events,
      pickable: true,
      onClick: (info: any) => { if (info.object) setSelectedEvent(info.object); },
      iconAtlas: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/icon-atlas.png',
      iconMapping: {
        marker: { x: 0, y: 0, width: 128, height: 128, mask: true }
      },
      getIcon: () => 'marker',
      sizeScale: 16,
      getPosition: (d: any) => [d.longitude, d.latitude, is3DMode ? 28 : 0],
      getSize: () => 2.2,
      getColor: (d: any) => d.severity === 'HIGH' ? [239, 68, 68] : (d.severity === 'MEDIUM' ? [245, 158, 11] : [16, 185, 129])
    }),
    new PathLayer({
      id: 'segments-glow-layer',
      data: segments,
      pickable: false,
      widthScale: 1,
      widthMinPixels: 8,
      widthMaxPixels: 16,
      jointRounded: true,
      capRounded: true,
      getPath: (d: any) => is3DMode ? d.path.map((p: any) => [p[0], p[1], 0.8]) : d.path,
      getColor: (d: any) => {
        if (d.healthScore > 80) return [16, 185, 129, 60]; // Green glow
        if (d.healthScore > 50) return [245, 158, 11, 60]; // Amber glow
        return [239, 68, 68, 60]; // Red glow
      },
      getWidth: () => 10
    }),
    new PathLayer({
      id: 'segments-layer',
      data: segments,
      pickable: true,
      widthScale: 1,
      widthMinPixels: 3,
      widthMaxPixels: 6,
      jointRounded: true,
      capRounded: true,
      getPath: (d: any) => is3DMode ? d.path.map((p: any) => [p[0], p[1], 1.2]) : d.path,
      getColor: (d: any) => {
        if (d.healthScore > 80) return [16, 185, 129, 230]; // Green core
        if (d.healthScore > 50) return [245, 158, 11, 230]; // Amber core
        return [239, 68, 68, 230]; // Red core
      },
      getWidth: () => 3.5
    })
  );

  if (activeIncident && activeIncident.active) {
    layers.push(
      new ScatterplotLayer({
        id: 'ghost-radius-layer',
        data: [activeIncident],
        pickable: false,
        opacity: 0.8,
        stroked: true,
        filled: true,
        radiusScale: 1000, // multiply km to meters
        radiusMinPixels: 1,
        radiusMaxPixels: 10000,
        lineWidthMinPixels: 2,
        getPosition: (d: any) => [d.longitude, d.latitude, 0],
        getRadius: (d: any) => d.radius, // in km
        getFillColor: [239, 68, 68, 30], // transparent red
        getLineColor: [239, 68, 68, 200],
        transitions: {
          getRadius: {
            duration: 1000,
            easing: (t: number) => t
          }
        }
      })
    );
  }

  return (
    <div className="absolute inset-0 w-full h-full">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState }) => setViewState(viewState as any)}
        controller={true}
        layers={layers}
        style={{ position: 'absolute' }}
        getTooltip={({ object }) => {
          if (!object) return null;
          if (object.route) return `Bus: ${object.id}\nSpeed: ${Math.round(object.speed)} km/h`;
          if (object.name) return `Route: ${object.name}\nHealth: ${Math.round(object.healthScore)}%`;
          return `Event: ${object.type}\nSeverity: ${object.severity}`;
        }}
      >
        <Map 
          mapStyle={MAP_STYLE} 
          style={{ width: '100vw', height: '100vh' }}
          transformRequest={(url, resourceType) => {
            // On Vercel, the Protomaps public demo key gets a 403 Forbidden because it's restricted to localhost.
            // We use a Vercel Serverless Function proxy (/api/protomaps) to bypass this restriction for the demo!
            if (url.includes('protomaps.com') && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
              return { url: `/api/protomaps?url=${encodeURIComponent(url)}` };
            }
            return { url };
          }}
          onLoad={(e) => {
            const map = e.target;
            mapRef.current = map;

            // 1. Add ESRI High-Resolution Satellite Raster Source
            if (!map.getSource('esri-satellite')) {
              map.addSource('esri-satellite', {
                type: 'raster',
                tiles: [
                  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                ],
                tileSize: 256,
                maxzoom: 19
              });
            }

            // 2. Add Satellite Layer directly below 3D buildings
            if (!map.getLayer('satellite-layer')) {
              map.addLayer({
                id: 'satellite-layer',
                type: 'raster',
                source: 'esri-satellite',
                layout: {
                  visibility: is3DMode ? 'visible' : 'none'
                },
                paint: {
                  'raster-opacity': 1.0,
                  'raster-fade-duration': 300
                }
              });
            }

            // 3. Vector building layers initialized directly with active theme
            const initialCfg = BUILDING_THEMES[buildingTheme] || BUILDING_THEMES['smoked-glass'];

            if (!map.getLayer('3d-buildings') && map.getSource('protomaps')) {
              // Blueprint footprint outline grounding the buildings to the street
              map.addLayer({
                id: '3d-buildings-outline',
                source: 'protomaps',
                'source-layer': 'buildings',
                type: 'line',
                layout: {
                  'visibility': is3DMode ? 'visible' : 'none'
                },
                paint: {
                  'line-color': initialCfg.outlineColor,
                  'line-width': initialCfg.outlineWidth,
                  'line-opacity': initialCfg.outlineOpacity
                }
              });

              // Procedural 3D Building Extrusion with architectural depth & sun shading
              map.addLayer({
                id: '3d-buildings',
                source: 'protomaps',
                'source-layer': 'buildings',
                type: 'fill-extrusion',
                layout: {
                  'visibility': is3DMode && buildingTheme !== 'pure-satellite' ? 'visible' : 'none'
                },
                paint: {
                  'fill-extrusion-color': initialCfg.fillColor,
                  'fill-extrusion-height': initialCfg.height,
                  'fill-extrusion-base': 0,
                  'fill-extrusion-opacity': initialCfg.opacity
                }
              });

              // Initial light direction
              if (typeof map.setLight === 'function') {
                if (is3DMode) {
                  map.setLight({
                    anchor: 'map',
                    position: [1.5, 210, 32],
                    color: initialCfg.lightColor,
                    intensity: initialCfg.lightIntensity
                  });
                } else {
                  map.setLight({
                    anchor: 'viewport',
                    position: [1.15, 210, 30],
                    color: '#FFFFFF',
                    intensity: 0.25
                  });
                }
              }

              // Initial atmospheric sky fog
              if (typeof (map as any).setFog === 'function') {
                if (is3DMode) {
                  (map as any).setFog({
                    range: [0.5, 12],
                    color: '#d0e2ff',
                    'high-color': '#1d4ed8',
                    'space-color': '#0f172a',
                    'horizon-blend': 0.18
                  });
                } else {
                  (map as any).setFog(null);
                }
              }
            }
          }}
        />
      </DeckGL>

      {/* 3D Digital Twin Architectural Style Selector Pill (Collapsible with Arrow Toggle) */}
      {is3DMode && (
        <div className="absolute top-4 left-4 z-40 flex items-center bg-white/95 backdrop-blur-md border border-gray-200/90 shadow-xl rounded-xl p-1.5 space-x-1 transition-all duration-300">
          <button
            onClick={() => setIsStyleMenuOpen(!isStyleMenuOpen)}
            className="flex items-center space-x-1.5 px-2 py-1 text-[11px] font-bold text-gray-700 hover:text-black uppercase tracking-wider select-none rounded-lg hover:bg-gray-100/80 transition-colors cursor-pointer"
            title={isStyleMenuOpen ? "Collapse 3D Style Menu" : "Expand 3D Style Menu"}
          >
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
            <span>Twin Style</span>
            {isStyleMenuOpen ? (
              <ChevronLeft size={14} className="text-gray-500 hover:text-gray-900 transition-transform" />
            ) : (
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] text-accent font-semibold lowercase bg-accent/10 px-1.5 py-0.5 rounded">
                  {BUILDING_THEMES[buildingTheme]?.badge || ''}
                </span>
                <ChevronRight size={14} className="text-gray-500 hover:text-gray-900 transition-transform" />
              </div>
            )}
          </button>

          {isStyleMenuOpen && (
            <div className="flex items-center space-x-1 border-l border-gray-200/80 pl-1.5 animate-in fade-in slide-in-from-left-2 duration-200">
              {(['smoked-glass', 'slate-architectural', 'cyber-cyan', 'pure-satellite'] as BuildingTheme[]).map((themeKey) => {
                const cfg = BUILDING_THEMES[themeKey];
                const isActive = buildingTheme === themeKey;
                return (
                  <button
                    key={themeKey}
                    onClick={() => setBuildingTheme(themeKey)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-accent text-white shadow-md shadow-accent/30 font-bold scale-[1.02]'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {cfg.badge}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Custom Projected Popup Overlay (guarantees clickability above DeckGL) */}
      {selectedEvent && (
        <div 
          className="absolute z-50 pointer-events-auto transition-transform duration-300 ease-out"
          style={{ 
            left: popupX, 
            top: popupY, 
            transform: isTopAnchor ? 'translate(-50%, 15px)' : 'translate(-50%, -100%)',
            marginTop: isTopAnchor ? '0' : '-15px' 
          }}
        >
          <div className="relative">
            {/* Close button — hidden during loading/success */}
            {dispatchState !== 'loading' && dispatchState !== 'success' && (
              <button 
                onClick={(e) => { e.stopPropagation(); setDispatchState('idle'); setSelectedEvent(null); }}
                className="absolute -top-3 -right-3 z-10 p-1.5 bg-gray-900/80 hover:bg-black rounded-full text-white shadow-lg cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            )}

            <div 
              className="w-80 bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-xl overflow-hidden flex flex-col cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              {selectedEvent.imageUrl && (
                <div 
                  className="relative h-36 w-full group cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setFullScreenImage(selectedEvent.imageUrl!); }}
                >
                  <img src={selectedEvent.imageUrl} alt="Road Anomaly" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-transparent to-transparent"></div>
                  
                  {/* Expand icon on hover */}
                  <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm p-1.5 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 size={16} />
                  </div>
                  <div className="absolute bottom-3 left-4 text-white">
                    <div className="flex items-center space-x-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full shadow-sm ${selectedEvent.severity === 'HIGH' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                      <span className="text-[10px] font-bold tracking-wider uppercase text-white/90">{selectedEvent.severity} SEVERITY</span>
                    </div>
                    <h3 className="font-semibold text-lg leading-tight text-white tracking-wide">Road {selectedEvent.type}</h3>
                  </div>
                </div>
              )}
              <div className="p-4 bg-white/60">
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm mb-5">
                  <div>
                    <div className="text-gray-400 text-[10px] font-bold tracking-wider uppercase mb-0.5">Confidence</div>
                    <div className="font-semibold text-gray-900 flex items-center">
                      <span className="text-blue-600 mr-1">🎯</span> {selectedEvent.confidence}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-[10px] font-bold tracking-wider uppercase mb-0.5">Reported By</div>
                    <div className="font-semibold text-gray-900 flex items-center">
                      <span className="text-blue-600 mr-1">🚌</span> {selectedEvent.busId}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-[10px] font-bold tracking-wider uppercase mb-0.5">Verified By</div>
                    <div className="font-semibold text-gray-900 flex items-center">
                      <span className="text-blue-600 mr-1">✔️</span> {selectedEvent.verifyingBuses.length} Buses
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-[10px] font-bold tracking-wider uppercase mb-0.5">Time</div>
                    <div className="font-semibold text-gray-900 flex items-center">
                      <span className="text-blue-600 mr-1">🕒</span> {new Date(selectedEvent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {/* ── 4-State Dispatch Footer ────────────────────────── */}
                <div className="transition-all duration-300">

                  {/* State 1: IDLE */}
                  {dispatchState === 'idle' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDispatchState('confirm'); }}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm rounded-lg transition-all shadow-sm tracking-wide cursor-pointer"
                    >
                      🔧 Dispatch Repair Crew
                    </button>
                  )}

                  {/* State 2: CONFIRM */}
                  {dispatchState === 'confirm' && (
                    <div className="space-y-2">
                      <p className="text-center text-xs text-gray-500 font-medium">
                        ⚠️ Confirm dispatch to <span className="font-bold text-gray-800">{selectedEvent.busId}'s route</span>?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDispatchState('idle'); }}
                          className="flex-1 py-2 border border-gray-300 text-gray-600 hover:bg-gray-100 font-semibold text-sm rounded-lg transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDispatchState('loading');
                            // Simulate API call, then show success
                            setTimeout(() => {
                              setDispatchState('success');
                              // Auto-close after success
                              setTimeout(() => {
                                setDispatchState('idle');
                                setSelectedEvent(null);
                              }, 2500);
                            }, 1800);
                          }}
                          className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-lg transition-all cursor-pointer shadow-sm"
                        >
                          Confirm 🚨
                        </button>
                      </div>
                    </div>
                  )}

                  {/* State 3: LOADING */}
                  {dispatchState === 'loading' && (
                    <div className="w-full py-2.5 bg-amber-500 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 tracking-wide">
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                      </svg>
                      Contacting Crew...
                    </div>
                  )}

                  {/* State 4: SUCCESS */}
                  {dispatchState === 'success' && (
                    <div className="w-full py-2.5 bg-green-600 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 tracking-wide shadow-sm animate-pulse">
                      ✅ Crew Dispatched · ETA 12 min
                    </div>
                  )}

                </div>
              </div>
            </div>
            
            {/* Triangle pointer pointing to the marker */}
            {isTopAnchor ? (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-gray-900 transform rotate-45 shadow-sm"></div>
            ) : (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/95 border-b border-r border-gray-200 transform rotate-45 shadow-sm"></div>
            )}
          </div>
        </div>
      )}

      {/* Full Screen Image Modal */}
      {fullScreenImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-12 animate-in fade-in duration-200 pointer-events-auto cursor-default"
          onClick={(e) => { e.stopPropagation(); setFullScreenImage(null); }}
        >
          <button 
            onClick={(e) => { e.stopPropagation(); setFullScreenImage(null); }}
            className="absolute top-6 right-6 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer"
          >
            <X size={28} />
          </button>
          <img 
            src={fullScreenImage} 
            alt="Full Screen Anomaly" 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-white/10"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
