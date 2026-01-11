import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface TrajetLike {
  id?: number;
  startLocation?: string;
  endLocation?: string;
  distance?: number | null;
  coordinates?: {
    start?: (number | null)[] | null;
    end?: (number | null)[] | null;
    path?: (number | null)[][] | null;
  };
}
interface TrajetMapProps {
  trajet: TrajetLike | null;
  onDistanceCalculate?: (distance: number) => void;
}

/* ---------- utilitaires ---------- */
function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const lat1 = a[0], lon1 = a[1], lat2 = b[0], lon2 = b[1];
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sLat1 = toRad(lat1);
  const sLat2 = toRad(lat2);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aVal = sinDLat * sinDLat + Math.cos(sLat1) * Math.cos(sLat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  return R * c;
}
function polylineDistanceKm(coords: [number, number][]): number {
  if (!coords || coords.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < coords.length; i++) sum += haversineKm(coords[i - 1], coords[i]);
  return sum;
}

const injectStyles = () => {
  if (document.getElementById("trajet-map-styles")) return;
  const style = document.createElement("style");
  style.id = "trajet-map-styles";
  style.innerHTML = `
    .trajet-map-card { border-radius: 12px; box-shadow: 0 10px 30px rgba(2,6,23,0.12); overflow: hidden; background: #fff; position: relative; }
    .distance-badge { min-width: 88px; text-align: center; border-radius: 999px; padding: 8px 12px; font-weight: 700; backdrop-filter: blur(6px); background: rgba(255,255,255,0.96); box-shadow: 0 8px 20px rgba(2,6,23,0.10); font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial; }
    .trajet-anim path { stroke-dasharray: 10 8; animation: dash 1.6s linear infinite; stroke-linecap: round; }
    @keyframes dash { to { stroke-dashoffset: -36 } }
    .no-pin-bg { background: transparent; border: 0; }
    /* force tiles color if a global grayscale exists */
    .leaflet-container img, .leaflet-tile, .trajet-map-card, .leaflet-pane, .leaflet-overlay-pane { filter: none !important; -webkit-filter: none !important; }
    /* Floating controls */
    .floating-toggle-btn {
      position: absolute; left: 12px; top: 12px; z-index: 1300;
      background: #0f172a; color: #fff; border-radius: 10px; padding: 8px 10px; cursor: pointer;
      box-shadow: 0 8px 20px rgba(2,6,23,0.12); font-weight: 700; font-size: 13px;
      border: none;
    }
    .floating-checkbox {
      position: absolute; right: 12px; top: 12px; z-index: 1300;
      background: rgba(255,255,255,0.96); padding: 8px 12px; border-radius: 10px; box-shadow: 0 8px 20px rgba(2,6,23,0.08);
      display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px;
      transition: transform .18s ease, opacity .18s ease;
    }
    .floating-checkbox.hidden { transform: translateY(-6px); opacity: 0; pointer-events: none; }
    .floating-basemaps { position: absolute; left: 12px; bottom: 12px; z-index: 1300; display:flex; gap:8px; }
    .basemap-btn {
      background: rgba(255,255,255,0.98); padding:8px 10px; border-radius:8px; box-shadow: 0 6px 14px rgba(2,6,23,0.08); cursor:pointer; font-size:13px; border: none;
    }
    .basemap-btn.active { outline: 2px solid rgba(59,130,246,0.18); box-shadow: 0 10px 26px rgba(59,130,246,0.06); transform: translateY(-2px); }
    .zoom-controls { position: absolute; right: 12px; bottom: 12px; z-index: 1300; display:flex; flex-direction:column; gap:8px; }
    .zoom-btn { background: rgba(255,255,255,0.98); padding:8px; border-radius:8px; box-shadow: 0 6px 14px rgba(2,6,23,0.08); cursor:pointer; font-weight:700; border: none; }
    .mini-pin { pointer-events: none; }
  `;
  document.head.appendChild(style);
};


function makeSvgIcon(label: string, color = "#007AFF") {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <defs><filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="6" flood-opacity="0.12"/></filter></defs>
      <g filter="url(#f)"><circle cx="24" cy="20" r="14" fill="${color}" /></g>
      <text x="24" y="25" font-size="14" font-family="Inter,Arial" text-anchor="middle" fill="#fff" font-weight="700">${label}</text>
    </svg>`
  );
  const html = `<img src="data:image/svg+xml;utf8,${svg}" alt="${label}" />`;
  return L.divIcon({ html, className: "no-pin-bg", iconSize: [48, 48], iconAnchor: [24, 44], popupAnchor: [0, -44] });
}


export const TrajetMapStyled: React.FC<TrajetMapProps> = ({ trajet, onDistanceCalculate }) => {
  injectStyles();

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);

  const baseLayersRef = useRef<{ carto?: L.TileLayer; osm?: L.TileLayer; esri?: L.TileLayer }>({});
  const currentBaseRef = useRef<"carto" | "osm" | "esri">("carto");

  const routeLayer = useRef<L.LayerGroup | null>(null);

  const [distance, setDistance] = useState<number | null>(null);

  // UI states
  const [checkboxVisible, setCheckboxVisible] = useState<boolean>(false);
  const [overlayChecked, setOverlayChecked] = useState<boolean>(false);
  const [activeBasemap, setActiveBasemap] = useState<"carto" | "osm" | "esri">("carto");

  // Init map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: true }).setView([-18.8792, 47.5079], 13);
    mapInstance.current = map;

    // create single tile layers and store references
    const carto = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors • CartoDB",
      maxZoom: 19,
    });
    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    });
    const esri = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles © Esri",
      maxZoom: 19,
    });

    baseLayersRef.current = { carto, osm, esri };

    // add default basemap
    carto.addTo(map);
    currentBaseRef.current = "carto";

    // create route layerGroup (empty for now)
    routeLayer.current = L.layerGroup();

    // zoom & scale standard controls for ergonomie
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomright", imperial: false }).addTo(map);

    // ensure map draws correctly if container hidden initially
    setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 200);

    // cleanup on unmount
    return () => { try { map.remove(); } catch (e) {} };
  }, []);

  // Switch base map (remove current tile, add chosen one)
  const switchBasemap = (name: "carto" | "osm" | "esri") => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;
    const ref = baseLayersRef.current;

    // Remove only the current base layer (if present)
    try {
      const current = currentBaseRef.current;
      const currentLayer = (ref as any)[current];
      if (currentLayer && map.hasLayer(currentLayer)) map.removeLayer(currentLayer);
    } catch (e) {}

    // Add the requested one (single instance)
    const newLayer = (ref as any)[name];
    if (newLayer) newLayer.addTo(map);

    currentBaseRef.current = name;
    setActiveBasemap(name);

    // fix rendering and make sure overlays still on top
    setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 120);
  };

  // zoom handlers
  const zoomIn = () => { if (mapInstance.current) mapInstance.current.zoomIn(); };
  const zoomOut = () => { if (mapInstance.current) mapInstance.current.zoomOut(); };

  // Effect: draw route inside routeLayer whenever trajet changes
  useEffect(() => {
    if (!routeLayer.current) return;
    // clear previous drawings
    try { routeLayer.current.clearLayers(); } catch (e) {}

    setDistance(null);

    if (!trajet || !trajet.coordinates) {
      if (overlayChecked && mapInstance.current && mapInstance.current.hasLayer(routeLayer.current)) {
        try { mapInstance.current.removeLayer(routeLayer.current); } catch (e) {}
      }
      return;
    }

    const rawStart = trajet.coordinates.start ?? null;
    const rawEnd = trajet.coordinates.end ?? null;
    const startLat = rawStart && rawStart.length >= 2 ? toNumber(rawStart[0]) : null;
    const startLng = rawStart && rawStart.length >= 2 ? toNumber(rawStart[1]) : null;
    const endLat = rawEnd && rawEnd.length >= 2 ? toNumber(rawEnd[0]) : null;
    const endLng = rawEnd && rawEnd.length >= 2 ? toNumber(rawEnd[1]) : null;

    // build path
    let path: [number, number][] = [];
    if (Array.isArray(trajet.coordinates.path) && trajet.coordinates.path.length > 0) {
      for (const p of trajet.coordinates.path) {
        if (Array.isArray(p) && p.length >= 2) {
          const lat = toNumber(p[0]); const lng = toNumber(p[1]);
          if (lat !== null && lng !== null) path.push([lat, lng]);
        }
      }
    }
    // fallback straight line if necessary
    if (path.length === 0 && startLat !== null && startLng !== null && endLat !== null && endLng !== null) {
      path = [[startLat, startLng], [endLat, endLng]];
    }

    // markers
    if (startLat !== null && startLng !== null) {
      const m = L.marker([startLat, startLng], { icon: makeSvgIcon("D", "#00D09C") }).addTo(routeLayer.current);
      m.bindPopup(`<strong>Départ</strong><div>${trajet.startLocation ?? ""}</div>`);
    }
    if (endLat !== null && endLng !== null) {
      const m = L.marker([endLat, endLng], { icon: makeSvgIcon("A", "#FF6B6B") }).addTo(routeLayer.current);
      m.bindPopup(`<strong>Arrivée</strong><div>${trajet.endLocation ?? ""}</div>`);
    }

    // polylines
    if (path.length > 0) {
      // soft shadow under route
      L.polyline(path as any, { color: "#07102a", weight: 14, opacity: 0.06, lineJoin: "round" }).addTo(routeLayer.current);

      const n = path.length;
      if (n === 2) {
        L.polyline(path as any, { color: "#007AFF", weight: 6, lineCap: "round", className: "trajet-anim" }).addTo(routeLayer.current);
      } else {
        for (let i = 1; i < n; i++) {
          const a = path[i - 1]; const b = path[i];
          const t = (i - 1) / Math.max(1, n - 2);
          const hue = 200 + Math.round(t * 140);
          const color = `hsl(${hue}deg 82% 45%)`;
          L.polyline([a, b] as any, { color, weight: 6, lineCap: "round", className: "trajet-anim" }).addTo(routeLayer.current);
        }
      }


      try { mapInstance.current!.fitBounds(L.latLngBounds(path as any), { padding: [40, 40] }); } catch (e) {}

      const computed = path.length > 1 ? polylineDistanceKm(path) : 0;
      setDistance(computed);
      if (onDistanceCalculate) onDistanceCalculate(computed);
    } else {
      // center on start/end if no path
      if (startLat !== null && startLng !== null) {
        try { mapInstance.current!.setView([startLat, startLng], 13); } catch (e) {}
      } else if (endLat !== null && endLng !== null) {
        try { mapInstance.current!.setView([endLat, endLng], 13); } catch (e) {}
      }
      if (typeof trajet.distance === "number" && !isNaN(trajet.distance)) {
        setDistance(trajet.distance);
        if (onDistanceCalculate) onDistanceCalculate(trajet.distance);
      }
    }

    if (overlayChecked) {
      try { if (mapInstance.current && !mapInstance.current.hasLayer(routeLayer.current!)) routeLayer.current!.addTo(mapInstance.current); } catch (e) {}
    } else {
      try { if (mapInstance.current && mapInstance.current.hasLayer(routeLayer.current!)) mapInstance.current.removeLayer(routeLayer.current!); } catch (e) {}
    }


  }, [trajet, overlayChecked]);

  useEffect(() => {
    if (!mapInstance.current || !routeLayer.current) return;
    if (overlayChecked) {
      try { routeLayer.current.addTo(mapInstance.current); } catch (e) {}
    } else {
      try { if (mapInstance.current.hasLayer(routeLayer.current)) mapInstance.current.removeLayer(routeLayer.current); } catch (e) {}
    }
  }, [overlayChecked]);

  return (
    <div className="w-full h-full trajet-map-card" style={{ minHeight: 420 }}>
      <div ref={mapRef} style={{ width: "100%", height: 420 }} />

      {/* Toggle button (show/hide the single checkbox). */}
      <button
        className="floating-toggle-btn"
        onClick={() => setCheckboxVisible((v) => !v)}
        aria-pressed={checkboxVisible}
        title={checkboxVisible ? "Masquer options" : "Afficher options"}
      >
        {checkboxVisible ? "Masquer options" : "Options carte"}
      </button>

      {/* Single floating checkbox controlling Trajet overlay. Hidden by default. */}
      <div className={`floating-checkbox ${checkboxVisible ? "" : "hidden"}`} role="region" aria-label="Options de la carte">
        <input
          id="overlay-trajet"
          type="checkbox"
          checked={overlayChecked}
          onChange={(e) => setOverlayChecked(e.target.checked)}
          aria-label="Afficher trajet"
        />
        <label htmlFor="overlay-trajet" style={{ userSelect: "none" }}>Trajet</label>
      </div>

      {/* Basemap selector (left bottom) */}
      <div className="floating-basemaps" role="toolbar" aria-label="Choix fond cartographique">
        <button
          className={`basemap-btn ${activeBasemap === "carto" ? "active" : ""}`}
          onClick={() => switchBasemap("carto")}
          aria-pressed={activeBasemap === "carto"}
          title="Fond clair (CartoDB)"
        >
          Fond clair
        </button>
        <button
          className={`basemap-btn ${activeBasemap === "osm" ? "active" : ""}`}
          onClick={() => switchBasemap("osm")}
          aria-pressed={activeBasemap === "osm"}
          title="Rues (OSM)"
        >
          Rues
        </button>
        <button
          className={`basemap-btn ${activeBasemap === "esri" ? "active" : ""}`}
          onClick={() => switchBasemap("esri")}
          aria-pressed={activeBasemap === "esri"}
          title="Satellite (Esri)"
        >
          Satellite
        </button>
      </div>

      {/* Zoom controls (right bottom) */}
      <div className="zoom-controls" role="group" aria-label="Zoom controls">
        <button className="zoom-btn" onClick={zoomIn} title="Zoomer">+</button>
        <button className="zoom-btn" onClick={zoomOut} title="Dézoomer">−</button>
      </div>

      {/* Distance badge top-right (moves down if checkbox visible) */}
      {distance !== null && (
        <div style={{ position: "absolute", right: 12, top: checkboxVisible ? 64 : 12, zIndex: 1290 }}>
          <div className="distance-badge" role="status" aria-live="polite">
            <div style={{ fontSize: 11, color: "#0f172a", opacity: 0.9 }}>Distance</div>
            <div style={{ fontSize: 16 }}>
              {distance >= 1 ? `${distance.toFixed(1)} km` : `${Math.round(distance * 1000)} m`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrajetMapStyled;
