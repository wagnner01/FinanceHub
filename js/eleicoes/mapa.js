// mapa.js — mapa 3D realista (MapLibre GL: imagem de satélite + relevo + céu/atmosfera)
// com fallback SVG 2D caso a biblioteca/tiles não carreguem (offline, rede corporativa).

const ML_VER = '4.7.1';
const ML_JS = `https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.js`;
const ML_CSS = `https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.css`;

const BASES = {
    satelite: {
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Imagens © <a href="https://www.esri.com" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
        maxzoom: 18,
    },
    noturno: {
        tiles: ['https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png', 'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png'],
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
        maxzoom: 19,
    },
};
const DEM = {
    type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 14,
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    attribution: 'Relevo: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain Tiles (AWS/Mapzen)</a>',
};
const LABELS = ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'];

let mlPromise = null;
function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    mlPromise ??= new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = ML_CSS; document.head.appendChild(css);
        const s = document.createElement('script');
        s.src = ML_JS; s.async = true;
        s.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error('maplibre ausente')));
        s.onerror = () => reject(new Error('Falha ao carregar MapLibre'));
        document.head.appendChild(s);
        setTimeout(() => reject(new Error('Timeout MapLibre')), 12000);
    });
    return mlPromise;
}

function webglOk() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/** Bounding box [[minX,minY],[maxX,maxY]] de uma FeatureCollection/Feature. */
export function bbox(geo) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const walk = c => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); };
    for (const f of geo.features || [geo]) walk(f.geometry.coordinates);
    return [[x0, y0], [x1, y1]];
}

/** Centro visual aproximado (centroide do maior anel). */
export function centro(feature) {
    let best = null, bestA = -1;
    const polys = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const p of polys) {
        const ring = p[0]; let a = 0, cx = 0, cy = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
            a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
        }
        if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = a ? [cx / (3 * a), cy / (3 * a)] : ring[0]; }
    }
    return best;
}

/**
 * Cria o mapa. Retorna uma API comum às duas implementações:
 *  setAreas(fc, { fit, contexto }) · select(id) · setOptions({ base, relevo, barras }) · resize() · kind
 */
export async function createMap(el, handlers) {
    if (webglOk()) {
        try {
            const ml = await loadMapLibre();
            return await new GLMap(el, ml, handlers).ready;
        } catch (e) {
            console.warn('[mapa] usando fallback SVG:', e.message);
        }
    }
    return new SvgMap(el, handlers);
}

class GLMap {
    constructor(el, ml, { onClick, onHover }) {
        this.kind = 'gl';
        this.ml = ml; this.el = el; this.onClick = onClick; this.onHover = onHover;
        this.opts = { base: 'satelite', relevo: true, barras: false };
        this.hoverId = null; this.selId = null; this.markers = [];
        el.innerHTML = '';
        const map = this.map = new ml.Map({
            container: el,
            style: this.style(),
            center: [-53.5, -14.8], zoom: 3.3, pitch: 42, bearing: -8,
            maxPitch: 75, attributionControl: { compact: true }, dragRotate: true,
            fadeDuration: 150,
        });
        map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');
        map.addControl(new ml.ScaleControl({ unit: 'metric' }), 'bottom-left');
        this.ready = new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('mapa não inicializou')), 15000);
            // 'style.load' dispara antes dos tiles: o mapa fica interativo mesmo com rede lenta
            let done = false;
            const go = () => { if (done) return; done = true; clearTimeout(t); this.setupLayers(); resolve(this); };
            map.once('style.load', go);
            map.once('load', go);
            map.on('error', e => console.debug('[mapa]', e?.error?.message || e));
        });
    }

    style() {
        const b = BASES[this.opts.base];
        return {
            version: 8,
            sources: {
                base: { type: 'raster', tiles: b.tiles, tileSize: 256, maxzoom: b.maxzoom, attribution: b.attribution },
                labels: { type: 'raster', tiles: LABELS, tileSize: 256, maxzoom: 16 },
                dem: DEM, demHs: (({ attribution, ...rest }) => rest)(DEM),
            },
            layers: [
                { id: 'bg', type: 'background', paint: { 'background-color': '#0a0d14' } },
                { id: 'base', type: 'raster', source: 'base', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0.08, 'raster-brightness-max': 0.92, 'raster-fade-duration': 200 } },
                { id: 'hillshade', type: 'hillshade', source: 'demHs', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#05070c', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#1b2233' } },
            ],
            terrain: this.opts.relevo ? { source: 'dem', exaggeration: 1.6 } : undefined,
            sky: {
                'sky-color': '#0b1a33', 'horizon-color': '#3a5f9a', 'fog-color': '#0d1526',
                'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.25, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
            },
        };
    }

    setupLayers() {
        const m = this.map;
        const empty = { type: 'FeatureCollection', features: [] };
        m.addSource('contexto', { type: 'geojson', data: empty });
        m.addSource('areas', { type: 'geojson', data: empty, promoteId: 'id' });
        m.addLayer({ id: 'contexto-fill', type: 'fill', source: 'contexto', paint: { 'fill-color': '#0a0d14', 'fill-opacity': 0.55 } });
        m.addLayer({ id: 'contexto-line', type: 'line', source: 'contexto', paint: { 'line-color': '#ffffff', 'line-opacity': 0.25, 'line-width': 0.8 } });
        m.addLayer({
            id: 'areas-fill', type: 'fill', source: 'areas',
            paint: {
                'fill-color': ['get', 'cor'],
                'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.86, ['boolean', ['feature-state', 'sel'], false], 0.9, 0.66],
                'fill-antialias': true,
            },
        });
        m.addLayer({
            id: 'areas-ext', type: 'fill-extrusion', source: 'areas', layout: { visibility: 'none' },
            paint: {
                'fill-extrusion-color': ['get', 'cor'],
                'fill-extrusion-height': ['*', ['get', 'h'], ['case', ['boolean', ['feature-state', 'hover'], false], 1.08, 1]],
                'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.88, 'fill-extrusion-vertical-gradient': true,
            },
        });
        m.addLayer({ id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 6, 0.85] } });
        m.addLayer({
            id: 'areas-line', type: 'line', source: 'areas',
            paint: {
                'line-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#ffd166', '#ffffff'],
                'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, ['boolean', ['feature-state', 'hover'], false], 2.2, 0.6],
                'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.55],
            },
        });
        m.addLayer({ id: 'areas-glow', type: 'line', source: 'areas', filter: ['==', ['get', 'id'], '__none__'], paint: { 'line-color': '#ffd166', 'line-width': 9, 'line-blur': 6, 'line-opacity': 0.55 } });

        m.on('mousemove', 'areas-fill', e => this.hover(e));
        m.on('mousemove', 'areas-ext', e => this.hover(e));
        m.on('mouseleave', 'areas-fill', () => this.hover(null));
        m.on('click', 'areas-fill', e => e.features?.[0] && this.onClick?.(e.features[0].properties));
        m.on('click', 'areas-ext', e => e.features?.[0] && this.onClick?.(e.features[0].properties));
    }

    hover(e) {
        const f = e?.features?.[0];
        const id = f?.properties?.id ?? null;
        if (id !== this.hoverId) {
            if (this.hoverId != null) this.map.setFeatureState({ source: 'areas', id: this.hoverId }, { hover: false });
            if (id != null) this.map.setFeatureState({ source: 'areas', id }, { hover: true });
            this.hoverId = id;
        }
        this.map.getCanvas().style.cursor = id != null ? 'pointer' : '';
        this.onHover?.(f ? f.properties : null, e ? e.originalEvent : null);
    }

    setAreas(fc, { fit = true, contexto = null, labels = [], padding = 40 } = {}) {
        this.fc = fc;
        this.map.getSource('areas').setData(fc);
        this.map.getSource('contexto').setData(contexto || { type: 'FeatureCollection', features: [] });
        this.selId = null;
        this.setLabels(labels);
        if (fit && fc.features.length) {
            const isBR = fc.features.length >= 27 && !contexto;
            this.flyToBounds(bbox(fc), { padding, pitch: isBR ? 38 : 52, bearing: isBR ? -6 : -12, maxZoom: 11 });
        }
    }

    /** Enquadra os limites já com inclinação/rotação (câmera cinematográfica). */
    flyToBounds(b, { padding = 40, pitch = 50, bearing = -10, maxZoom = 11, duration = 1800 } = {}) {
        const cam = this.map.cameraForBounds(b, { padding, bearing, maxZoom });
        if (!cam) return;
        // Com inclinação o enquadramento "abre": compensa levemente o zoom
        this.map.flyTo({ center: cam.center, zoom: Math.min(maxZoom, cam.zoom - pitch / 140), pitch, bearing, duration, essential: true });
    }

    /** Esconde rótulos sobrepostos (prioridade = ordem recebida). */
    declutter() {
        const placed = [];
        for (const mk of this.markers) {
            const el = mk.getElement();
            el.style.visibility = 'visible';
            const r = el.getBoundingClientRect();
            const hit = placed.some(p => !(r.right < p.left || r.left > p.right || r.bottom < p.top || r.top > p.bottom));
            if (hit) el.style.visibility = 'hidden'; else placed.push(r);
        }
    }

    setLabels(labels) {
        this.markers.forEach(mk => mk.remove());
        if (!this._declutterBound) { this._declutterBound = true; this.map.on('moveend', () => this.declutter()); }
        labels = [...labels].sort((a, b) => (b.prio || 0) - (a.prio || 0));
        this.markers = labels.map(l => {
            const div = document.createElement('div');
            div.className = 'map-label';
            div.innerHTML = l.html;
            div.addEventListener('click', ev => { ev.stopPropagation(); this.onClick?.(l.props); });
            return new this.ml.Marker({ element: div, anchor: 'center' }).setLngLat(l.at).addTo(this.map);
        });
    }

    select(id) {
        if (this.selId != null) this.map.setFeatureState({ source: 'areas', id: this.selId }, { sel: false });
        this.selId = id;
        this.map.setFilter('areas-glow', ['==', ['get', 'id'], id ?? '__none__']);
        if (id == null) return;
        this.map.setFeatureState({ source: 'areas', id }, { sel: true });
        const f = this.fc?.features.find(x => x.properties.id === id);
        if (f) this.flyToBounds(bbox(f), { padding: 120, pitch: 58, bearing: -14, maxZoom: 11.5, duration: 1600 });
    }

    setOptions(o) {
        const prev = this.opts;
        this.opts = { ...prev, ...o };
        if (o.base && o.base !== prev.base) {
            const b = BASES[this.opts.base];
            const src = this.map.getSource('base');
            src.setTiles ? src.setTiles(b.tiles) : null;
        }
        if ('relevo' in o) this.map.setTerrain(this.opts.relevo ? { source: 'dem', exaggeration: 1.6 } : null);
        if ('barras' in o) {
            this.map.setLayoutProperty('areas-ext', 'visibility', this.opts.barras ? 'visible' : 'none');
            this.map.setPaintProperty('areas-fill', 'fill-opacity', this.opts.barras ? 0.25 : ['case', ['boolean', ['feature-state', 'hover'], false], 0.86, ['boolean', ['feature-state', 'sel'], false], 0.9, 0.66]);
            if (this.opts.barras && this.map.getPitch() < 45) this.map.easeTo({ pitch: 55, duration: 900 });
        }
    }

    resize() { this.map.resize(); }
}

// ───────────── Fallback 2D em SVG (projeção Mercator) ─────────────
class SvgMap {
    constructor(el, { onClick, onHover }) {
        this.kind = 'svg';
        this.el = el; this.onClick = onClick; this.onHover = onHover;
        el.innerHTML = '<svg class="svg-map" preserveAspectRatio="xMidYMid meet"></svg><div class="svg-map-note">Modo 2D (WebGL/tiles indisponíveis)</div>';
        this.svg = el.querySelector('svg');
    }
    project([lon, lat]) { const r = Math.PI / 180; return [lon, -Math.log(Math.tan(Math.PI / 4 + lat * r / 2)) / r]; }
    path(geom) {
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
        return polys.map(p => p.map(ring => 'M' + ring.map(c => this.project(c).map(v => v.toFixed(3)).join(',')).join('L') + 'Z').join('')).join('');
    }
    setAreas(fc, { contexto = null, labels = [] } = {}) {
        this.fc = fc;
        const all = [...(contexto?.features || []), ...fc.features];
        const [[x0, y0], [x1, y1]] = bbox({ features: fc.features.length ? fc.features : all });
        const [px0, py1] = this.project([x0, y0]), [px1, py0] = this.project([x1, y1]);
        const pad = (px1 - px0) * 0.04;
        this.svg.setAttribute('viewBox', `${px0 - pad} ${py0 - pad} ${px1 - px0 + 2 * pad} ${py1 - py0 + 2 * pad}`);
        const sw = (px1 - px0) / 900;
        this.svg.innerHTML =
            (contexto?.features || []).map(f => `<path d="${this.path(f.geometry)}" fill="#141824" stroke="#ffffff22" stroke-width="${sw}"/>`).join('') +
            fc.features.map(f => `<path data-id="${f.properties.id}" d="${this.path(f.geometry)}" fill="${f.properties.cor}" stroke="#ffffffaa" stroke-width="${sw}" class="svg-area"/>`).join('') +
            labels.map(l => { const [x, y] = this.project(l.at); return `<text x="${x}" y="${y}" font-size="${sw * 14}" class="svg-label">${l.text || ''}</text>`; }).join('');
        this.svg.querySelectorAll('.svg-area').forEach(p => {
            const f = fc.features.find(x => String(x.properties.id) === p.dataset.id);
            p.addEventListener('mousemove', e => this.onHover?.(f.properties, e));
            p.addEventListener('mouseleave', () => this.onHover?.(null));
            p.addEventListener('click', () => this.onClick?.(f.properties));
        });
    }
    select(id) { this.svg.querySelectorAll('.svg-area').forEach(p => p.classList.toggle('sel', p.dataset.id === String(id))); }
    setOptions() { /* sem 3D no fallback */ }
    resize() { /* SVG é responsivo */ }
}
