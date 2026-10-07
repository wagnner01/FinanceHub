// cores.js — identidade visual por partido (cor fixa por entidade, nunca por posição).
// Convenção da cobertura brasileira: PT vermelho, PL azul. Demais partidos em ordem fixa.

export const PARTIDO_COR = {
    PT: '#e0393e', PL: '#2f6fe4', PSD: '#d4950f', REPUBLICANOS: '#14a3b8', MDB: '#2fa84f', 'UNIÃO': '#7b5cd6',
    PP: '#8bb92f', PSB: '#f07c2a', PSDB: '#4aa8f0', PDT: '#c2185b', PSOL: '#a83dbf', NOVO: '#ff8a3d',
    PODE: '#1fb5a0', REDE: '#3d9e6d', 'PC do B': '#b71c1c', PCDOB: '#b71c1c', PV: '#43a047', AVANTE: '#e65100',
    SOLIDARIEDADE: '#ef6c00', CIDADANIA: '#d81b60', PRD: '#5c6bc0', DC: '#8d6e63', MISSÃO: '#ffb300', AGIR: '#26a69a',
    MOBILIZA: '#00897b', PMB: '#ad1457', PSTU: '#c62828', PCB: '#b71c1c', PCO: '#8e0000', UP: '#d84315', PRTB: '#00838f',
    DEMOCRATA: '#3949ab',
};
const NEUTRAS = ['#8a94a6', '#6f7a8f', '#a3acbb', '#7d8799'];

export function corPartido(sg) {
    if (!sg) return NEUTRAS[0];
    const k = sg.toUpperCase().trim();
    if (PARTIDO_COR[k]) return PARTIDO_COR[k];
    let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return NEUTRAS[h % NEUTRAS.length];
}

/** Mistura a cor com o fundo para codificar intensidade (margem/percentual) sem trocar a matiz. */
export function intensidade(hex, t, fundo = '#1b2030') {
    const c = parseHex(hex), b = parseHex(fundo);
    const k = 0.28 + 0.72 * Math.max(0, Math.min(1, t));
    const m = c.map((v, i) => Math.round(b[i] + (v - b[i]) * k));
    return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
}

function parseHex(h) {
    const s = h.replace('#', '');
    return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
}

/** Converte % do vencedor numa intensidade 0–1 (40% → claro, ≥70% → saturado). */
export const forca = pct => (pct - 40) / 30;
