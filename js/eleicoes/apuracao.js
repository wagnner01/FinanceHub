// apuracao.js — aba "Apuração 2026": mapa 3D + resultados por Brasil › UF › município › zona › seção.
import * as tse from './tse.js';
import { CARGOS } from './normalize.js';
import { createMap, centro } from './mapa.js';
import { corPartido, intensidade, forca } from './cores.js';

const IBGE = 'https://servicodados.ibge.gov.br/api/v3/malhas';
const NF = new Intl.NumberFormat('pt-BR');
const fN = v => NF.format(Math.round(v || 0));
const fP = (v, d = 2) => `${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titleCase = s => String(s || '').toLowerCase().replace(/(^|\s|-|')(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, w => w.toLowerCase());
const SEGUNDO_TURNO = new Date('2026-10-25T17:00:00-03:00');
const REFRESH_MS = 30000;

const CARGO_ORDEM = [1, 3, 5, 6, 7];
const cargoReal = (cargo, uf) => (cargo === 7 && uf === 'df' ? 8 : cargo);
const isProp = c => c === 6 || c === 7 || c === 8;

const state = { turno: 1, cargo: 1, uf: 'br', mun: null, zona: null, secao: null, base: 'satelite', relevo: true, barras: false };
let root, map, built = false, version = 0, refreshTimer = null, tipData = new Map(), lastRes = null;
let geoBR = null; const geoUFs = {};
let showAll = false, propFiltro = null, propBusca = '', ultimaLista = null;

// ───────────────────────── ciclo de vida ─────────────────────────
export function init(el) { root = el; readHash(); }
export function render() {
    if (!built) build();
    map?.resize();
    update();
}

function readHash() {
    const h = location.hash;
    if (!h.startsWith('#apuracao')) return;
    const q = new URLSearchParams(h.split('?')[1] || '');
    state.turno = Number(q.get('t')) === 2 ? 2 : 1;
    state.cargo = CARGO_ORDEM.includes(Number(q.get('c'))) ? Number(q.get('c')) : 1;
    state.uf = (q.get('uf') || 'br').toLowerCase();
    state.mun = q.get('m'); state.zona = q.get('z'); state.secao = q.get('s');
}
function writeHash() {
    const q = new URLSearchParams({ t: state.turno, c: state.cargo, uf: state.uf });
    if (state.mun) q.set('m', state.mun); if (state.zona) q.set('z', state.zona); if (state.secao) q.set('s', state.secao);
    history.replaceState(null, '', `#apuracao?${q}`);
}

function build() {
    built = true;
    root.innerHTML = `
    <div class="el-wrap">
        <div class="el-toolbar">
            <div class="seg" id="el-turno" role="tablist" aria-label="Turno">
                <button data-t="1">1º turno · 04/10</button>
                <button data-t="2">2º turno · 25/10</button>
            </div>
            <div class="seg" id="el-cargo" role="tablist" aria-label="Cargo">
                ${CARGO_ORDEM.map(c => `<button data-c="${c}">${c === 7 ? 'Dep. Estadual' : CARGOS[c].curto}</button>`).join('')}
            </div>
            <span class="spacer"></span>
            <span class="el-live" id="el-live"><span class="dot"></span><span>Conectando ao TSE…</span></span>
            <button class="el-icon-btn" id="el-refresh" title="Atualizar agora" aria-label="Atualizar agora">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
            </button>
        </div>
        <nav class="el-crumbs" id="el-crumbs" aria-label="Navegação geográfica"></nav>
        <div class="el-main">
            <div class="el-map-card">
                <div id="el-map"></div>
                <div class="map-ctrls">
                    <div class="seg" id="el-base"><button data-b="satelite">Satélite</button><button data-b="noturno">Noturno</button></div>
                    <div class="seg" id="el-3d"><button data-o="relevo">Relevo 3D</button><button data-o="barras">Colunas de votos</button></div>
                </div>
                <div class="map-progress" id="el-mprog"><span></span><div class="bar"><span></span></div></div>
                <div class="map-legend" id="el-legend"></div>
                <div class="map-tip" id="el-tip"></div>
            </div>
            <aside class="el-panel" id="el-panel"></aside>
        </div>
        <section class="el-drill" id="el-drill"></section>
        <p class="el-foot">Fonte: <a href="https://resultados.tse.jus.br" target="_blank" rel="noopener">TSE — Divulgação Oficial de Resultados</a>
        (consulta direta ao vivo; fallback em snapshot versionado pelo GitHub Actions). Malhas: <a href="https://servicodados.ibge.gov.br/api/docs/malhas" target="_blank" rel="noopener">IBGE</a>.
        Seções: boletins de urna oficiais (arquivo <code>-bu.dat</code>) decodificados no navegador.</p>
    </div>`;

    root.querySelector('#el-turno').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        state.turno = Number(b.dataset.t);
        if (state.turno === 2 && ![1, 3].includes(state.cargo)) state.cargo = 1;
        state.secao = null; update();
    });
    root.querySelector('#el-cargo').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        state.cargo = Number(b.dataset.c); showAll = false; propFiltro = null; propBusca = '';
        update();
    });
    root.querySelector('#el-refresh').addEventListener('click', () => update({ force: true }));
    root.querySelector('#el-base').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        state.base = b.dataset.b; map?.setOptions({ base: state.base }); syncMapCtrls();
    });
    root.querySelector('#el-3d').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        state[b.dataset.o] = !state[b.dataset.o]; map?.setOptions({ [b.dataset.o]: state[b.dataset.o] }); syncMapCtrls();
    });
    root.querySelector('#el-crumbs').addEventListener('click', e => {
        const a = e.target.closest('a[data-lv]'); if (!a) return;
        const lv = a.dataset.lv;
        if (lv === 'br') Object.assign(state, { uf: 'br', mun: null, zona: null, secao: null });
        if (lv === 'uf') Object.assign(state, { mun: null, zona: null, secao: null });
        if (lv === 'mun') Object.assign(state, { zona: null, secao: null });
        if (lv === 'zona') Object.assign(state, { secao: null });
        update();
    });
    root.addEventListener('click', e => {
        const go = e.target.closest('[data-go]');
        if (!go) return;
        const [k, v] = go.dataset.go.split(':');
        if (k === 'uf') Object.assign(state, { uf: v, mun: null, zona: null, secao: null });
        if (k === 'mun') Object.assign(state, { mun: v, zona: null, secao: null });
        if (k === 'zona') Object.assign(state, { zona: v, secao: null });
        if (k === 'secao') state.secao = v;
        if (k === 'cargo') state.cargo = Number(v);
        if (k === 'turno') state.turno = Number(v);
        update();
    });

    createMap(root.querySelector('#el-map'), {
        onClick: p => {
            if (p.tipo === 'uf') Object.assign(state, { uf: p.id, mun: null, zona: null, secao: null });
            else if (p.tipo === 'mun') Object.assign(state, { mun: p.id, zona: null, secao: null });
            update();
        },
        onHover: (p, ev) => showTip(p, ev),
    }).then(m => {
        map = m; map.setOptions({ base: state.base, relevo: state.relevo, barras: state.barras }); syncMapCtrls();
        paintMap(version, ultimaLista).catch(e => console.warn('[mapa]', e));
    });
    syncMapCtrls();
}

function syncMapCtrls() {
    root.querySelectorAll('#el-base button').forEach(b => b.classList.toggle('on', b.dataset.b === state.base));
    root.querySelectorAll('#el-3d button').forEach(b => b.classList.toggle('on', !!state[b.dataset.o]));
    if (map?.kind === 'svg') root.querySelector('.map-ctrls').style.display = 'none';
}

// ───────────────────────── orquestração ─────────────────────────
async function update({ force = false, mapOnly = false, silent = false } = {}) {
    const v = ++version;
    clearTimeout(refreshTimer);
    writeHash();
    syncToolbar();
    renderCrumbs();
    const panel = root.querySelector('#el-panel');
    const drill = root.querySelector('#el-drill');
    const btn = root.querySelector('#el-refresh');
    btn.classList.add('spin');
    if (!silent && !mapOnly) { panel.innerHTML = skeleton(); drill.innerHTML = ''; }

    try {
        const cargo = cargoReal(state.cargo, state.uf);
        const t2 = state.turno === 2 ? await tse.getResultado({ cargo: 1, turno: 2, uf: 'br' }).catch(() => null) : true;
        if (v !== version) return;
        if (!t2) { renderAguardando(panel, drill); setLive(null); await paintMap(v, null); scheduleRefresh(60000); return; }

        if (state.uf === 'br' && state.cargo !== 1) {
            const lista = await carregarUFs(state.cargo);
            if (v !== version) return;
            lastRes = null;
            if (!mapOnly) { renderNacional(panel, lista); renderDrillUFs(drill, lista); }
            setLive(resumoProgresso(lista));
            await paintMap(v, lista);
            if (lista.some(r => r.res && !r.res.totalizado)) scheduleRefresh();
            return;
        }

        if (state.secao) {
            if (!mapOnly) await renderSecao(panel, drill, v);
            await paintMap(v, null);
            return;
        }

        let erro = null;
        const res = await tse.getResultado({ cargo, turno: state.turno, uf: state.uf, mun: state.mun, zona: state.zona }).catch(e => { erro = e; return null; });
        if (v !== version) return;
        lastRes = res;
        if (res) setLive(res);
        if (!mapOnly) {
            if (erro) panel.innerHTML = vazio('TSE indisponível para este recorte.', `${esc(erro.message)} — nova tentativa em 30s. Os níveis Brasil/UF seguem disponíveis pelo snapshot.`);
            else if (!res) panel.innerHTML = vazio('Sem resultado para esta seleção.', state.turno === 2 ? 'Esta UF/cargo não tem 2º turno.' : '');
            else renderPainel(panel, res, cargo);
        }
        const lista = state.uf === 'br' ? await carregarUFs(1) : null;
        if (v !== version) return;
        await paintMap(v, lista);
        if (!mapOnly) await renderDrill(drill, v, lista);
        if (erro || (res && !res.totalizado)) scheduleRefresh();
    } catch (e) {
        console.error(e);
        if (v === version) panel.innerHTML = vazio('Não foi possível carregar os dados do TSE.', esc(e.message) + ' — tentaremos de novo em 30s.');
        scheduleRefresh();
    } finally {
        if (v === version) btn.classList.remove('spin');
    }
}

function scheduleRefresh(ms = REFRESH_MS) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (root.offsetParent !== null) update({ silent: true }); else scheduleRefresh(ms); }, ms);
}

function syncToolbar() {
    root.querySelectorAll('#el-turno button').forEach(b => b.classList.toggle('on', Number(b.dataset.t) === state.turno));
    root.querySelectorAll('#el-cargo button').forEach(b => {
        const c = Number(b.dataset.c);
        b.classList.toggle('on', c === state.cargo);
        b.disabled = state.turno === 2 && ![1, 3].includes(c);
        b.textContent = c === 7 ? (state.uf === 'df' ? 'Dep. Distrital' : 'Dep. Estadual') : CARGOS[c].curto;
    });
}

function setLive(res) {
    const el = root.querySelector('#el-live');
    el.classList.remove('live', 'snap');
    if (!res) { el.innerHTML = `<span class="dot"></span><span>Aguardando início da apuração</span>`; el.classList.add('snap'); return; }
    const pct = res.secoes?.pct ?? 0;
    const fonte = tse.status.fonte === 'snapshot' ? ' · snapshot' : '';
    if (tse.status.fonte === 'snapshot') el.classList.add('snap');
    if (!res.totalizado) el.classList.add('live');
    el.innerHTML = `<span class="dot"></span><span>${res.totalizado ? 'Totalizado' : 'AO VIVO'} · ${fP(pct)} seções · ${esc(res.atualizado || '')}${fonte}</span>`;
}

function resumoProgresso(lista) {
    const ok = lista.filter(x => x.res);
    if (!ok.length) return null;
    const ts = ok.reduce((s, x) => s + x.res.secoes.total, 0), st = ok.reduce((s, x) => s + x.res.secoes.totalizadas, 0);
    return { secoes: { pct: ts ? 100 * st / ts : 0 }, totalizado: ok.every(x => x.res.totalizado), atualizado: ok.map(x => x.res.atualizado).sort().at(-1) };
}

function renderCrumbs() {
    const el = root.querySelector('#el-crumbs');
    const parts = [`<a data-lv="br" class="${state.uf === 'br' ? 'cur' : ''}">🇧🇷 Brasil</a>`];
    if (state.uf !== 'br') parts.push(`<a data-lv="uf" class="${!state.mun ? 'cur' : ''}">${state.uf === 'zz' ? 'Exterior' : tse.UFS[state.uf] || state.uf.toUpperCase()}</a>`);
    if (state.mun) parts.push(`<a data-lv="mun" class="${!state.zona ? 'cur' : ''}" id="el-crumb-mun">${esc(nomeMun(state.uf, state.mun) || state.mun)}</a>`);
    if (state.zona) parts.push(`<a data-lv="zona" class="${!state.secao ? 'cur' : ''}">Zona ${Number(state.zona)}</a>`);
    if (state.secao) parts.push(`<a class="cur">Seção ${Number(state.secao)}</a>`);
    el.innerHTML = parts.join('<span class="sep">›</span>');
}

let munIndex = null;
function nomeMun(uf, cd) {
    const m = munIndex?.[uf]?.find(x => x[0] === cd);
    return m ? titleCase(m[2]) : null;
}

// ───────────────────────── dados agregados ─────────────────────────
async function carregarUFs(cargo) {
    const ufs = Object.keys(tse.UFS).concat(cargo === 1 ? ['zz'] : []);
    return Promise.all(ufs.map(async uf => {
        const c = cargoReal(cargo, uf);
        const res = await tse.getResultado({ cargo: c, turno: state.turno, uf }).catch(() => null);
        return { uf, cargo: c, res };
    }));
}

/** Vencedor/ líder de um resultado majoritário ou partido com mais cadeiras. */
function lider(res, cargo) {
    if (!res) return null;
    if (isProp(cargo)) {
        const p = res.partidos[0];
        return p ? { nome: p.sg, partido: p.sg, cor: corPartido(p.sg), pct: 100 * p.eleitos / (res.vagas || 1), extra: `${p.eleitos} de ${res.vagas} cadeiras` } : null;
    }
    const [a, b] = res.candidatos;
    if (!a) return null;
    return { nome: titleCase(a.nm), partido: a.p, cor: corPartido(a.p), pct: a.pv, seg: b ? { nome: titleCase(b.nm), partido: b.p, pct: b.pv, cor: corPartido(b.p) } : null, t2: res.candidatos.some(c => c.seg), eleito: a.eleito };
}

// ───────────────────────── mapa ─────────────────────────
async function getGeoBR() {
    if (geoBR) return geoBR;
    try {
        const r = await fetch(`${IBGE}/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=intermediaria&intrarregiao=UF`);
        if (!r.ok) throw new Error();
        geoBR = await r.json();
    } catch { geoBR = await (await fetch('data/geo/br-uf.json')).json(); }
    for (const f of geoBR.features) f.properties.uf = tse.IBGE_UF[f.properties.codarea];
    return geoBR;
}
async function getGeoUF(uf) {
    if (geoUFs[uf]) return geoUFs[uf];
    const r = await fetch(`${IBGE}/estados/${uf.toUpperCase()}?formato=application/vnd.geo%2Bjson&qualidade=intermediaria&intrarregiao=municipio`);
    if (!r.ok) throw new Error('malha municipal indisponível');
    const g = await r.json();
    munIndex ??= await tse.getMunicipios();
    const byIbge = Object.fromEntries((munIndex[uf] || []).map(m => [m[1], m]));
    for (const f of g.features) {
        const m = byIbge[f.properties.codarea];
        f.properties.mun = m?.[0]; f.properties.nome = m ? titleCase(m[2]) : f.properties.codarea;
    }
    geoUFs[uf] = g;
    return g;
}

const BG = () => (document.documentElement.getAttribute('data-theme') === 'light' ? '#dfe5ee' : '#1b2030');

async function paintMap(v, listaUFs) {
    if (listaUFs) ultimaLista = listaUFs;
    if (!map) return;
    munIndex ??= await tse.getMunicipios().catch(() => ({}));
    tipData = new Map();
    const legend = root.querySelector('#el-legend');
    const br = await getGeoBR();
    if (v !== version) return;
    const cargo = state.cargo;

    if (state.uf === 'br' || state.uf === 'zz') {
        const lista = (listaUFs || await carregarUFs(cargo)).filter(x => x.uf !== 'zz');
        if (v !== version) return;
        const byUF = Object.fromEntries(lista.map(x => [x.uf, x]));
        const maxC = Math.max(...lista.map(x => x.res?.comparecimento || 0), 1);
        const feats = br.features.map(f => {
            const x = byUF[f.properties.uf]; const L = lider(x?.res, x?.cargo);
            tipData.set(f.properties.uf, { nome: tse.UFS[f.properties.uf], res: x?.res, cargo: x?.cargo });
            return {
                type: 'Feature', geometry: f.geometry,
                properties: {
                    id: f.properties.uf, tipo: 'uf', nome: tse.UFS[f.properties.uf],
                    cor: L ? intensidade(L.cor, isProp(cargo) ? 0.75 : (L.t2 && cargo !== 1 ? 0.25 : forca(L.pct)), BG()) : '#3a4152',
                    h: Math.sqrt((x?.res?.comparecimento || 0) / maxC) * 420000,
                },
            };
        });
        const labels = br.features.map(f => {
            const x = byUF[f.properties.uf]; const L = lider(x?.res, x?.cargo);
            const at = centro(f);
            const t2 = L?.t2 && cargo !== 1;
            return {
                at, prio: x?.res?.eleitorado || 0, props: { id: f.properties.uf, tipo: 'uf' }, text: f.properties.uf.toUpperCase(),
                html: `<i style="background:${L?.cor || '#64748b'}"></i>${f.properties.uf.toUpperCase()}${L ? `<small>${isProp(cargo) ? esc(L.partido) : fP(L.pct, 1)}</small>` : ''}${t2 ? '<span class="t2">2T</span>' : ''}`,
            };
        });
        map.setAreas({ type: 'FeatureCollection', features: feats }, { labels, fit: true });
        legend.innerHTML = legendaHTML(lista.map(x => lider(x.res, x.cargo)).filter(Boolean), cargo, 'UF');
        return;
    }

    // UF e níveis abaixo: malha municipal
    let geo;
    try { geo = await getGeoUF(state.uf); } catch { legend.innerHTML = '<div class="lg-note">Malha municipal indisponível.</div>'; return; }
    if (v !== version) return;
    const contexto = { type: 'FeatureCollection', features: br.features.filter(f => f.properties.uf !== state.uf) };
    const mapCargo = isProp(cargoReal(cargo, state.uf)) ? null : cargoReal(cargo, state.uf);
    let dados = {};
    if (mapCargo) {
        const prog = root.querySelector('#el-mprog');
        dados = await tse.getMapaMunicipios({ cargo: mapCargo, turno: state.turno, uf: state.uf }, (d, t) => {
            if (t <= 1 || v !== version) return;
            prog.style.display = d < t ? 'block' : 'none';
            prog.querySelector('span').textContent = `Carregando municípios ${d}/${t}`;
            prog.querySelector('.bar span').style.width = `${100 * d / t}%`;
        }).catch(() => ({}));
        prog.style.display = 'none';
    }
    if (v !== version) return;
    const ufRes = mapCargo ? await tse.getResultado({ cargo: mapCargo, turno: state.turno, uf: state.uf }).catch(() => null) : null;
    const cands = Object.fromEntries((ufRes?.candidatos || []).map(c => [c.n, c]));
    const maxC = Math.max(...Object.values(dados).map(d => d?.c || 0), 1);
    const lideres = [];
    const feats = geo.features.map(f => {
        const d = dados[f.properties.mun];
        let cor = '#3a4152', top = [];
        if (d && d.vv) {
            top = Object.entries(d.v).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, v]) => ({ n, v, pct: 100 * v / d.vv, c: cands[n] }));
            const w = top[0];
            const corW = corPartido(w?.c?.p);
            cor = intensidade(corW, forca(w.pct), BG());
            if (w?.c) lideres.push({ nome: titleCase(w.c.nm), partido: w.c.p, cor: corW });
        } else if (!mapCargo) cor = '#2a3142';
        tipData.set(f.properties.mun, { nome: f.properties.nome, top, d });
        return { type: 'Feature', geometry: f.geometry, properties: { id: f.properties.mun || f.properties.codarea, tipo: 'mun', nome: f.properties.nome, cor, h: Math.sqrt((d?.c || 0) / maxC) * 60000 } };
    });
    const fc = { type: 'FeatureCollection', features: feats };
    const sameUF = map._ufShown === state.uf;
    map.setAreas(fc, { contexto, fit: !sameUF || !state.mun });
    map._ufShown = state.uf;
    if (state.mun) map.select(state.mun);
    legend.innerHTML = mapCargo ? legendaHTML(lideres, mapCargo, 'município') : `<div class="lg-title">${CARGOS[cargoReal(cargo, state.uf)].nome}</div><div class="lg-note">Cargos proporcionais não têm vencedor por município. Clique numa cidade para ver os mais votados.</div>`;
}

function legendaHTML(lideres, cargo, unidade) {
    const cont = new Map();
    const porPartido = isProp(cargo) || (cargo !== 1 && unidade === 'UF');
    for (const l of lideres) {
        const k = porPartido ? l.partido : `${l.nome}|${l.partido}`;
        const e = cont.get(k) || { ...l, n: 0 }; e.n++; cont.set(k, e);
    }
    const rows = [...cont.values()].sort((a, b) => b.n - a.n).slice(0, 6);
    const ramp = rows[0] ? [0, .33, .66, 1].map(t => `<span style="background:${intensidade(rows[0].cor, t, BG())}"></span>`).join('') : '';
    return `<div class="lg-title">${isProp(cargo) ? 'Partido com mais cadeiras' : porPartido ? 'Partido do líder' : 'Mais votado'} por ${unidade}</div>
        ${rows.map(r => `<div class="lg-row"><span class="lg-sw" style="background:${r.cor}"></span><span>${esc(porPartido ? r.partido : r.nome)} <span style="color:#94a3b8">${porPartido ? '' : esc(r.partido)}</span></span><b style="margin-left:auto">${r.n}</b></div>`).join('')}
        ${porPartido && !isProp(cargo) && cargo === 3 ? '<div class="lg-note">Tons claros + selo 2T = disputa no 2º turno</div>' : ''}
        ${!isProp(cargo) ? `<div class="lg-note">Intensidade = % do vencedor</div><div class="lg-ramp">${ramp}</div><div class="lg-note" style="display:flex;justify-content:space-between;width:160px"><span>40%</span><span>70%+</span></div>` : ''}
        ${state.barras ? '<div class="lg-note">Altura das colunas = eleitores que votaram</div>' : ''}`;
}

function showTip(p, ev) {
    const tip = root.querySelector('#el-tip');
    if (!p || !ev) { tip.style.display = 'none'; return; }
    const d = tipData.get(p.id);
    let body = '';
    if (p.tipo === 'uf' && d?.res) {
        if (isProp(d.cargo)) body = d.res.partidos.slice(0, 4).map(x => `<div class="tr"><span><i style="background:${corPartido(x.sg)}"></i>${esc(x.sg)}</span><b>${x.eleitos} cad.</b></div>`).join('');
        else body = d.res.candidatos.slice(0, 3).map(c => `<div class="tr"><span><i style="background:${corPartido(c.p)}"></i>${esc(titleCase(c.nm))}</span><b>${fP(c.pv)}</b></div>`).join('');
        body += `<div class="muted">Comparecimento ${fP(d.res.pComparecimento)} · ${fP(d.res.secoes.pct, 1)} das seções</div>`;
    } else if (p.tipo === 'mun' && d) {
        body = d.top.length ? d.top.map(t => `<div class="tr"><span><i style="background:${corPartido(t.c?.p)}"></i>${esc(titleCase(t.c?.nm || t.n))}</span><b>${fP(t.pct)}</b></div>`).join('') : '<div class="muted">Clique para ver os resultados</div>';
        if (d.d) body += `<div class="muted">${fN(d.d.c)} votantes · ${fP(d.d.te ? 100 * d.d.c / d.d.te : 0)} de comparecimento</div>`;
    }
    tip.innerHTML = `<b>${esc(p.nome)}</b>${body}`;
    const rect = root.querySelector('.el-map-card').getBoundingClientRect();
    let x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    if (x > rect.width - 240) x -= 250;
    if (y > rect.height - 160) y -= 150;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.style.display = 'block';
}

// ───────────────────────── painéis ─────────────────────────
const skeleton = () => `<div class="el-card">${'<div class="el-skel"></div>'.repeat(3)}</div><div class="el-card">${'<div class="el-skel" style="height:44px"></div>'.repeat(5)}</div>`;
const vazio = (t, s = '') => `<div class="el-card el-empty"><div class="big">🗳️</div><b>${t}</b><br>${s}</div>`;

function nomeArea() {
    if (state.uf === 'br') return 'Brasil';
    if (state.uf === 'zz') return 'Exterior';
    if (state.zona) return `Zona eleitoral ${Number(state.zona)} · ${nomeMun(state.uf, state.mun) || ''}`;
    if (state.mun) return `${nomeMun(state.uf, state.mun) || state.mun} (${state.uf.toUpperCase()})`;
    return tse.UFS[state.uf];
}

function cabecalho(res, titulo) {
    return `<div class="el-card">
        <div class="el-area-title">${esc(titulo)}</div>
        <div class="el-area-sub">${esc(res.cargoNome)} · ${res.turno}º turno · atualizado ${esc(res.atualizado)}</div>
        <div class="el-progress" title="Seções totalizadas"><span style="width:${res.secoes.pct}%"></span></div>
        <div class="el-area-sub">${fP(res.secoes.pct)} das seções totalizadas (${fN(res.secoes.totalizadas)} de ${fN(res.secoes.total)})</div>
        <div class="el-stats">
            <div class="el-stat"><div class="k">Eleitorado</div><div class="v">${fN(res.eleitorado)}</div></div>
            <div class="el-stat"><div class="k">Comparec.</div><div class="v">${fP(res.pComparecimento, 1)}</div><div class="s">${fN(res.comparecimento)}</div></div>
            <div class="el-stat"><div class="k">Abstenção</div><div class="v">${fP(res.pAbstencao, 1)}</div><div class="s">${fN(res.abstencao)}</div></div>
            <div class="el-stat"><div class="k">Brancos · Nulos</div><div class="v">${fP(res.pBrancos, 1)} · ${fP(res.pNulos, 1)}</div></div>
        </div>
    </div>`;
}

function foto(c, cargo, uf) {
    const ini = (c.nm || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('');
    const id = `ph-${c.sq}`;
    tse.fotoUrl(cargo, state.turno, uf === 'br' || uf === 'zz' ? 'br' : uf, c.sq).then(u => {
        const el = root.querySelector(`#${id}`);
        if (el && !el.querySelector('img')) el.insertAdjacentHTML('beforeend', `<img src="${u}" alt="" loading="lazy" onerror="this.remove()">`);
    });
    return `<div class="ph" id="${id}" style="--c:${corPartido(c.p)}"><span>${esc(ini)}</span></div>`;
}

function chipStatus(c) {
    if (c.seg) return '<span class="chip t2">2º turno</span>';
    if (/média/i.test(c.st)) return '<span class="chip media">Eleito por média</span>';
    if (c.eleito) return '<span class="chip eleito">Eleito</span>';
    if (/suplente/i.test(c.st)) return '<span class="chip sub">Suplente</span>';
    return '';
}

function linhaCand(c, cargo, uf, { big = false, pct = c.pv, votos = c.v } = {}) {
    const cor = corPartido(c.p);
    return `<div class="cand ${big ? 'big' : ''}" style="--c:${cor}">
        ${foto(c, cargo, uf)}
        <div>
            <div class="nm">${esc(titleCase(c.nm))} ${chipStatus(c)}</div>
            <div class="pt">${esc(c.n)} · ${esc(c.p)}${c.vs?.length ? ` · vice/supl.: ${esc(c.vs.map(titleCase).join(', '))}` : ''}</div>
            <div class="bar"><span style="width:${Math.min(100, pct)}%;background:${cor}"></span></div>
        </div>
        <div><div class="pc">${fP(pct)}</div><div class="vt">${fN(votos)} votos</div></div>
    </div>`;
}

function renderPainel(panel, res, cargo) {
    const uf = state.uf;
    let html = cabecalho(res, nomeArea());
    if (isProp(cargo)) html += painelProporcional(res, cargo, uf);
    else html += painelMajoritario(res, cargo, uf);
    panel.innerHTML = html;
    bindProp(panel, res, cargo, uf);
}

function painelMajoritario(res, cargo, uf) {
    const cands = res.candidatos.filter(c => c.dvt !== 'Anulado' || c.v > 0);
    const eleitos = cands.filter(c => c.eleito), seg = cands.filter(c => c.seg);
    let banner = '';
    const area = state.mun ? 'neste recorte' : '';
    if (cargo === 1 && uf !== 'br' && seg.length >= 2) {
        const [a, b] = seg;
        banner = `<div class="el-banner t2"><span class="ico">⚠️</span><div><b>2º turno nacional em 25/10:</b> ${esc(titleCase(a.nm))} × ${esc(titleCase(b.nm))}.
            Neste recorte: ${esc(titleCase(a.nm))} <b>${fP(a.pv)}</b> · ${esc(titleCase(b.nm))} <b>${fP(b.pv)}</b>.</div></div>`;
    } else if (!state.mun && seg.length >= 2) {
        banner = `<div class="el-banner t2"><span class="ico">⚠️</span><div><b>Haverá 2º turno${cargo === 3 ? ` em ${esc(tse.UFS[uf])}` : ''}</b> em 25 de outubro:
            <b>${esc(titleCase(seg[0].nm))}</b> (${esc(seg[0].p)}, ${fP(seg[0].pv)}) × <b>${esc(titleCase(seg[1].nm))}</b> (${esc(seg[1].p)}, ${fP(seg[1].pv)}).
            ${state.turno === 1 ? `<br><a data-go="turno:2" style="color:var(--el-gold);cursor:pointer;font-weight:600">Acompanhar o 2º turno →</a>` : ''}</div></div>`;
    } else if (!state.mun && eleitos.length) {
        banner = `<div class="el-banner ok"><span class="ico">✅</span><div><b>${cargo === 5 ? `${eleitos.length > 1 ? 'Senadores eleitos' : 'Senador eleito'}` : 'Eleito'}${res.turno === 1 && cargo !== 5 ? ' no 1º turno' : ''}:</b>
            ${eleitos.map(c => `<b>${esc(titleCase(c.nm))}</b> (${esc(c.p)}, ${fP(c.pv)})`).join(' e ')}</div></div>`;
    } else if (!res.totalizado) {
        banner = `<div class="el-banner info"><span class="ico">⏳</span><div>Apuração em andamento ${area} — ${fP(res.secoes.pct)} das seções. Atualiza a cada 30s.</div></div>`;
    }
    const lim = showAll ? cands.length : Math.min(cands.length, cargo === 5 ? 6 : 6);
    return `<div class="el-card">
        <h3>${esc(res.cargoNome)}${cargo === 5 ? ` · ${res.vagas} vaga${res.vagas > 1 ? 's' : ''}` : ''}<span>votos válidos: ${fN(res.validos)}</span></h3>
        ${banner ? `<div style="margin-bottom:10px">${banner}</div>` : ''}
        ${cands.slice(0, lim).map((c, i) => linhaCand(c, cargo, uf, { big: i < 2 })).join('')}
        ${cands.length > lim ? `<button class="el-more" id="el-show-all">Ver todos os ${cands.length} candidatos</button>` : ''}
    </div>`;
}

function painelProporcional(res, cargo, uf) {
    const partidos = res.partidos.filter(p => p.votos > 0);
    const comCadeira = partidos.filter(p => p.eleitos > 0);
    const total = res.vagas;
    const eleitos = res.candidatos.filter(c => c.eleito);
    const local = !!state.mun;
    return `<div class="el-card">
        <h3>Cadeiras por partido <span>${total} vagas · QE ${fN(res.qe)}</span></h3>
        ${local ? '<div class="el-banner info" style="margin-bottom:10px"><span class="ico">ℹ️</span><div>A eleição proporcional é estadual: as cadeiras abaixo são da UF. A lista mostra os mais votados <b>neste recorte</b>.</div></div>' : ''}
        <div class="seats" role="img" aria-label="Distribuição de cadeiras">${comCadeira.map(p => `<span title="${esc(p.sg)}: ${p.eleitos}" style="flex:${p.eleitos};background:${corPartido(p.sg)}"></span>`).join('')}</div>
        <div class="party-tally">${comCadeira.map(p => `<div class="pt ${propFiltro === p.sg ? 'on' : ''}" data-pf="${esc(p.sg)}"><i style="background:${corPartido(p.sg)}"></i><span>${esc(p.sg)}</span><b>${p.eleitos}</b></div>`).join('') || '<span class="el-area-sub">Distribuição disponível ao fim da totalização.</span>'}</div>
    </div>
    <div class="el-card">
        <h3>${local ? 'Mais votados neste recorte' : `Eleitos (${eleitos.length})`}<span>${fN(res.nominais)} nominais · ${fN(res.legenda)} legenda</span></h3>
        <input class="el-search" id="el-prop-q" placeholder="Buscar candidato, número ou partido…" value="${esc(propBusca)}">
        <div id="el-prop-list"></div>
    </div>`;
}

function bindProp(panel, res, cargo, uf) {
    panel.querySelector('#el-show-all')?.addEventListener('click', () => { showAll = true; renderPainel(panel, res, cargo); });
    const list = panel.querySelector('#el-prop-list');
    if (!list) return;
    const draw = () => {
        const q = propBusca.trim().toLowerCase();
        let arr = state.mun ? res.candidatos.filter(c => c.v > 0) : res.candidatos.filter(c => c.eleito);
        if (q) arr = res.candidatos.filter(c => `${c.nm} ${c.nc} ${c.n} ${c.p}`.toLowerCase().includes(q));
        if (propFiltro) arr = arr.filter(c => c.p === propFiltro);
        const max = arr[0]?.v || 1;
        list.innerHTML = arr.slice(0, 120).map(c => `<div class="mini-row"><div class="l"><i class="sw" style="background:${corPartido(c.p)}"></i><span><b>${esc(titleCase(c.nm))}</b> <span style="color:var(--t3)">${esc(c.p)} · ${esc(c.n)}</span></span>${chipStatus(c)}</div>
            <div class="r">${fN(c.v)}<br><span style="display:inline-block;width:${Math.max(4, 70 * c.v / max)}px;height:4px;border-radius:2px;background:${corPartido(c.p)}"></span></div></div>`).join('')
            || '<div class="el-area-sub">Nenhum candidato encontrado.</div>';
        if (arr.length > 120) list.innerHTML += `<div class="el-area-sub" style="padding-top:8px">Mostrando 120 de ${arr.length}. Refine a busca.</div>`;
    };
    draw();
    panel.querySelector('#el-prop-q').addEventListener('input', e => { propBusca = e.target.value; draw(); });
    panel.querySelectorAll('[data-pf]').forEach(el => el.addEventListener('click', () => {
        propFiltro = propFiltro === el.dataset.pf ? null : el.dataset.pf;
        panel.querySelectorAll('[data-pf]').forEach(x => x.classList.toggle('on', x.dataset.pf === propFiltro));
        draw();
    }));
}

// Visão nacional (Governador / Senado / Câmara / Assembleias)
function renderNacional(panel, lista) {
    const cargo = state.cargo;
    const ok = lista.filter(x => x.res);
    if (!ok.length) { panel.innerHTML = vazio('Sem dados para este cargo.'); return; }
    const prog = resumoProgresso(lista);
    const head = `<div class="el-card"><div class="el-area-title">Brasil · ${cargo === 7 ? 'Assembleias Legislativas' : CARGOS[cargo].nome}</div>
        <div class="el-area-sub">${state.turno}º turno · ${ok.length} UFs</div>
        <div class="el-progress"><span style="width:${prog.secoes.pct}%"></span></div><div class="el-area-sub">${fP(prog.secoes.pct)} das seções totalizadas</div></div>`;

    if (isProp(cargo)) {
        const tally = new Map();
        let vagas = 0;
        for (const x of ok) { vagas += x.res.vagas; for (const p of x.res.partidos) if (p.eleitos) tally.set(p.sg, (tally.get(p.sg) || 0) + p.eleitos); }
        const arr = [...tally.entries()].sort((a, b) => b[1] - a[1]);
        const top = ok.flatMap(x => x.res.candidatos.filter(c => c.eleito).map(c => ({ ...c, uf: x.uf }))).sort((a, b) => b.v - a.v).slice(0, 15);
        panel.innerHTML = head + `<div class="el-card"><h3>${cargo === 6 ? 'Câmara dos Deputados' : 'Assembleias (soma das UFs)'}<span>${vagas} cadeiras</span></h3>
            ${hemiciclo(arr, vagas)}
            <div class="party-tally" style="margin-top:10px">${arr.map(([sg, n]) => `<div class="pt"><i style="background:${corPartido(sg)}"></i><span>${esc(sg)}</span><b>${n}</b></div>`).join('')}</div></div>
            <div class="el-card"><h3>Mais votados do país</h3><div class="mini-list">${top.map(c => `<div class="mini-row click" data-go="uf:${c.uf}"><div class="l"><i class="sw" style="background:${corPartido(c.p)}"></i><span><b>${esc(titleCase(c.nm))}</b> <span style="color:var(--t3)">${esc(c.p)}-${c.uf.toUpperCase()}</span></span></div><div class="r">${fN(c.v)}</div></div>`).join('')}</div></div>`;
        return;
    }
    // Governador / Senado
    const eleitos = ok.flatMap(x => x.res.candidatos.filter(c => c.eleito).map(c => ({ ...c, uf: x.uf })));
    const seg = ok.filter(x => x.res.candidatos.some(c => c.seg));
    const tally = new Map(); for (const c of eleitos) tally.set(c.p, (tally.get(c.p) || 0) + 1);
    const arr = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    panel.innerHTML = head + `<div class="el-card"><h3>${cargo === 3 ? 'Governadores' : 'Senadores eleitos'}<span>${eleitos.length} eleitos${cargo === 3 ? ` · ${seg.length} em 2º turno` : ''}</span></h3>
        <div class="seats">${arr.map(([sg, n]) => `<span title="${esc(sg)}: ${n}" style="flex:${n};background:${corPartido(sg)}"></span>`).join('')}</div>
        <div class="party-tally">${arr.map(([sg, n]) => `<div class="pt"><i style="background:${corPartido(sg)}"></i><span>${esc(sg)}</span><b>${n}</b></div>`).join('')}</div></div>
        ${cargo === 3 && seg.length ? `<div class="el-card"><h3>⚠️ 2º turno em 25/10</h3><div class="mini-list">${seg.map(x => { const [a, b] = x.res.candidatos.filter(c => c.seg); return `<div class="mini-row click" data-go="uf:${x.uf}"><div class="l"><b>${x.uf.toUpperCase()}</b><span>${esc(titleCase(a.nm))} <span style="color:var(--t3)">${esc(a.p)} ${fP(a.pv, 1)}</span> × ${esc(titleCase(b.nm))} <span style="color:var(--t3)">${esc(b.p)} ${fP(b.pv, 1)}</span></span></div><div class="r">›</div></div>`; }).join('')}</div></div>` : ''}
        <div class="el-card"><h3>${cargo === 3 ? 'Eleitos' : 'Eleitos por UF'}</h3><div class="mini-list">${eleitos.sort((a, b) => a.uf.localeCompare(b.uf)).map(c => `<div class="mini-row click" data-go="uf:${c.uf}"><div class="l"><b>${c.uf.toUpperCase()}</b><i class="sw" style="background:${corPartido(c.p)}"></i><span>${esc(titleCase(c.nm))} <span style="color:var(--t3)">${esc(c.p)}</span></span></div><div class="r">${fP(c.pv, 1)}</div></div>`).join('')}</div></div>`;
}

/** Hemiciclo SVG (cadeiras em fileiras concêntricas, partidos em ordem de tamanho). */
function hemiciclo(arr, total) {
    if (!total) return '';
    const rows = Math.max(6, Math.round(Math.sqrt(total / 2.6)));
    const R = 200, r0 = 70, seats = [];
    const radii = Array.from({ length: rows }, (_, i) => r0 + (R - r0) * (i / (rows - 1)));
    const sumR = radii.reduce((a, b) => a + b, 0);
    let count = radii.map(r => Math.round(total * r / sumR));
    count[rows - 1] += total - count.reduce((a, b) => a + b, 0);
    radii.forEach((r, i) => { for (let k = 0; k < count[i]; k++) { const a = Math.PI * (1 - (count[i] === 1 ? 0.5 : k / (count[i] - 1))); seats.push({ a, x: 210 + r * Math.cos(a), y: 210 - r * Math.sin(a) }); } });
    seats.sort((p, q) => q.a - p.a);
    const cores = arr.flatMap(([sg, n]) => Array(n).fill(corPartido(sg)));
    const rad = Math.max(2.2, Math.min(6, 520 / total * 1.6));
    return `<svg class="hemi" viewBox="0 0 420 222" role="img" aria-label="Composição">${seats.map((s, i) => `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${rad}" fill="${cores[i] || '#3a4152'}"/>`).join('')}
        <text x="210" y="205" text-anchor="middle" fill="currentColor" font-size="26" font-weight="800">${total}</text><text x="210" y="220" text-anchor="middle" fill="#94a3b8" font-size="10">cadeiras</text></svg>`;
}

function renderAguardando(panel, drill) {
    const ms = SEGUNDO_TURNO - Date.now();
    const d = Math.max(0, Math.floor(ms / 86400000)), h = Math.max(0, Math.floor(ms / 3600000) % 24);
    panel.innerHTML = `<div class="el-card el-empty"><div class="big">⏳</div>
        <b>2º turno: domingo, 25 de outubro</b><br>
        Lula (PT) × Flávio Bolsonaro (PL) para Presidente e 2º turno para Governador em AC, AM, DF, ES, RJ, RN e TO.<br>
        ${ms > 0 ? `Faltam <b>${d} dias e ${h} horas</b> para o fechamento das urnas (17h de Brasília).` : 'A apuração começa assim que as urnas fecharem.'}<br>
        O painel detecta a publicação do TSE e passa a atualizar sozinho.<br><br>
        <button class="el-btn primary" data-go="turno:1">Ver resultado do 1º turno</button></div>`;
    drill.innerHTML = '';
}

// ───────────────────────── drill-down ─────────────────────────
async function renderDrill(drill, v, listaUFs) {
    const cargo = cargoReal(state.cargo, state.uf);
    if (state.uf === 'br') return renderDrillUFs(drill, listaUFs || await carregarUFs(state.cargo));
    if (state.zona) return renderDrillSecoes(drill, v);
    if (state.mun) return renderDrillZonas(drill, v, cargo);
    if (state.uf === 'zz') return renderDrillMunicipios(drill, v, cargo, 'País/cidade');
    return renderDrillMunicipios(drill, v, cargo);
}

function tabela(drill, { titulo, colunas, linhas, busca = true, extra = '' }) {
    let sortK = null, dir = -1, q = '';
    const draw = () => {
        let ls = linhas.filter(l => !q || l.busca.includes(q));
        if (sortK != null) ls = [...ls].sort((a, b) => (a.sort[sortK] > b.sort[sortK] ? 1 : a.sort[sortK] < b.sort[sortK] ? -1 : 0) * dir);
        drill.querySelector('tbody').innerHTML = ls.map(l => `<tr data-go="${l.go}">${l.cells.map((c, i) => `<td class="${colunas[i].num ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')
            || `<tr><td colspan="${colunas.length}" class="el-area-sub" style="padding:18px">Nada encontrado.</td></tr>`;
    };
    drill.innerHTML = `<div class="el-card"><div class="head"><h3>${titulo}</h3>${extra}${busca ? '<input class="el-search" placeholder="Filtrar…" aria-label="Filtrar">' : ''}</div>
        <div class="el-table-wrap"><table class="el-table"><thead><tr>${colunas.map((c, i) => `<th data-k="${i}" class="${c.num ? 'num' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody></tbody></table></div></div>`;
    drill.querySelector('.el-search')?.addEventListener('input', e => { q = e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); draw(); });
    drill.querySelectorAll('th').forEach(th => th.addEventListener('click', () => { const k = Number(th.dataset.k); dir = sortK === k ? -dir : -1; sortK = k; draw(); }));
    draw();
}

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const quem = (nm, p, pct) => `<span class="who"><i style="background:${corPartido(p)}"></i>${esc(titleCase(nm))} <span style="color:var(--t3)">${esc(p)}</span> <b style="margin-left:4px">${pct != null ? fP(pct, 1) : ''}</b></span>`;

function renderDrillUFs(drill, lista) {
    const cargo = state.cargo;
    const prop = isProp(cargo);
    const linhas = lista.filter(x => x.res).map(x => {
        const r = x.res, [a, b] = r.candidatos;
        const nome = x.uf === 'zz' ? 'Exterior' : tse.UFS[x.uf];
        const cells = prop
            ? [`<b>${x.uf.toUpperCase()}</b> ${esc(nome)}`, r.partidos[0] ? `<span class="who"><i style="background:${corPartido(r.partidos[0].sg)}"></i><b>${esc(r.partidos[0].sg)}</b> <span style="color:var(--t3)">${r.partidos[0].eleitos} cadeiras</span></span>` : '—', String(r.vagas), fN(r.eleitorado), fP(r.pComparecimento, 1)]
            : [`<b>${x.uf.toUpperCase()}</b> ${esc(nome)}`, a ? quem(a.nm, a.p, a.pv) : '—', b ? quem(b.nm, b.p, b.pv) : '—', a && b ? `<span class="marg" style="width:${Math.min(60, (a.pv - b.pv) * 2)}px;background:${corPartido(a.p)}"></span>${(a.pv - b.pv).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pp` : '', fN(r.eleitorado), fP(r.pComparecimento, 1)];
        return { go: `uf:${x.uf}`, busca: norm(nome + ' ' + x.uf), cells, sort: prop ? [nome, r.partidos[0]?.sg, r.vagas, r.eleitorado, r.pComparecimento] : [nome, a?.pv, b?.pv, a && b ? a.pv - b.pv : 0, r.eleitorado, r.pComparecimento] };
    });
    tabela(drill, {
        titulo: `Resultado por UF · ${CARGOS[cargo]?.nome || ''}`,
        colunas: prop ? [{ t: 'UF' }, { t: 'Maior bancada' }, { t: 'Vagas', num: 1 }, { t: 'Eleitorado', num: 1 }, { t: 'Comparec.', num: 1 }] : [{ t: 'UF' }, { t: '1º colocado' }, { t: '2º colocado' }, { t: 'Margem' }, { t: 'Eleitorado', num: 1 }, { t: 'Comparec.', num: 1 }],
        linhas,
    });
}

async function renderDrillMunicipios(drill, v, cargo) {
    munIndex ??= await tse.getMunicipios();
    const muns = munIndex[state.uf] || [];
    const mapCargo = isProp(cargo) ? null : cargo;
    drill.innerHTML = `<div class="el-card"><div class="head"><h3>Municípios de ${esc(state.uf === 'zz' ? 'Exterior' : tse.UFS[state.uf])} (${muns.length})</h3></div>${'<div class="el-skel" style="margin:12px 16px"></div>'.repeat(4)}</div>`;
    const dados = mapCargo ? await tse.getMapaMunicipios({ cargo: mapCargo, turno: state.turno, uf: state.uf }).catch(() => ({})) : {};
    const ufRes = mapCargo ? await tse.getResultado({ cargo: mapCargo, turno: state.turno, uf: state.uf }).catch(() => null) : null;
    if (v !== version) return;
    const cands = Object.fromEntries((ufRes?.candidatos || []).map(c => [c.n, c]));
    const linhas = muns.map(([cd, , nm, zonas, cap]) => {
        const d = dados[cd];
        const top = d?.vv ? Object.entries(d.v).sort((a, b) => b[1] - a[1]) : [];
        const [a, b] = top.map(([n, vv]) => ({ c: cands[n], pct: 100 * vv / d.vv, n }));
        const nome = titleCase(nm) + (cap ? ' ★' : '');
        return {
            go: `mun:${cd}`, busca: norm(nm),
            cells: mapCargo ? [esc(nome), a ? quem(a.c?.nm || a.n, a.c?.p, a.pct) : '—', b ? quem(b.c?.nm || b.n, b.c?.p, b.pct) : '—', fN(d?.te), d?.te ? fP(100 * d.c / d.te, 1) : '—', String(zonas.length)] : [esc(nome), String(zonas.length)],
            sort: mapCargo ? [nm, a?.pct || 0, b?.pct || 0, d?.te || 0, d?.te ? d.c / d.te : 0, zonas.length] : [nm, zonas.length],
        };
    });
    tabela(drill, {
        titulo: `Municípios · ${CARGOS[cargo].nome} (${muns.length})`,
        colunas: mapCargo ? [{ t: 'Município' }, { t: '1º' }, { t: '2º' }, { t: 'Eleitorado', num: 1 }, { t: 'Comparec.', num: 1 }, { t: 'Zonas', num: 1 }] : [{ t: 'Município' }, { t: 'Zonas', num: 1 }],
        linhas,
    });
}

async function renderDrillZonas(drill, v, cargo) {
    munIndex ??= await tse.getMunicipios();
    const m = (munIndex[state.uf] || []).find(x => x[0] === state.mun);
    const zonas = m?.[3] || [];
    drill.innerHTML = `<div class="el-card"><div class="head"><h3>Zonas eleitorais (${zonas.length})</h3></div>${'<div class="el-skel" style="margin:12px 16px"></div>'.repeat(3)}</div>`;
    const res = await Promise.all(zonas.map(z => tse.getResultado({ cargo, turno: state.turno, uf: state.uf, mun: state.mun, zona: z }).catch(() => null)));
    if (v !== version) return;
    const linhas = zonas.map((z, i) => {
        const r = res[i]; const [a, b] = r?.candidatos || [];
        return {
            go: `zona:${z}`, busca: String(Number(z)),
            cells: [`<b>Zona ${Number(z)}</b>`, a ? quem(a.nm, a.p, isProp(cargo) ? null : a.pv) + (isProp(cargo) ? ` ${fN(a.v)}` : '') : '—', b ? quem(b.nm, b.p, isProp(cargo) ? null : b.pv) : '—', fN(r?.eleitorado), r ? fP(r.pComparecimento, 1) : '—', r ? fP(r.secoes.pct, 0) : '—'],
            sort: [Number(z), a?.pv || 0, b?.pv || 0, r?.eleitorado || 0, r?.pComparecimento || 0, r?.secoes.pct || 0],
        };
    });
    tabela(drill, { titulo: `Zonas de ${esc(nomeMun(state.uf, state.mun) || '')} · ${CARGOS[cargo].nome}`, colunas: [{ t: 'Zona' }, { t: '1º' }, { t: '2º' }, { t: 'Eleitorado', num: 1 }, { t: 'Comparec.', num: 1 }, { t: 'Seções tot.', num: 1 }], linhas, busca: zonas.length > 8 });
}

const zonaCache = new Map();
async function renderDrillSecoes(drill, v) {
    drill.innerHTML = `<div class="el-card"><div class="head"><h3>Seções da zona ${Number(state.zona)}</h3></div><div class="el-skel" style="margin:12px 16px"></div></div>`;
    let secs = [];
    try { secs = (await tse.getSecoes(state.uf, state.turno))?.[state.mun]?.[state.zona] || []; } catch (e) { drill.innerHTML = vazio('Lista de seções indisponível.', esc(e.message)); return; }
    if (v !== version) return;
    const key = `${state.turno}-${state.uf}-${state.mun}-${state.zona}`;
    const cache = zonaCache.get(key) || {};
    const cargo = cargoReal(state.cargo, state.uf);
    const ufRes = await tse.getResultado({ cargo, turno: state.turno, uf: cargo === 1 ? 'br' : state.uf }).catch(() => null);
    const nomes = Object.fromEntries((ufRes?.candidatos || []).map(c => [c.n, c]));
    const tile = s => {
        const bu = cache[s];
        if (!bu) return `<button class="sec-tile" data-go="secao:${s}">${Number(s)}<small>seção</small></button>`;
        const cont = tse.contagemDoBoletim(bu)[cargo];
        const top = cont ? Object.entries(cont.votos).sort((a, b) => b[1] - a[1])[0] : null;
        const tot = cont ? Object.values(cont.votos).reduce((x, y) => x + y, 0) + Object.values(cont.legenda).reduce((x, y) => x + y, 0) : 0;
        const c = top ? nomes[top[0]] : null;
        const pct = top && tot ? 100 * top[1] / tot : 0;
        return `<button class="sec-tile loaded" data-go="secao:${s}" style="background:${intensidade(corPartido(c?.p), forca(pct), BG())}" title="${esc(c ? titleCase(c.nm) : top?.[0] || '')} ${fP(pct, 1)}">${Number(s)}<small>${esc(c?.p || '—')} ${pct ? Math.round(pct) + '%' : ''}</small></button>`;
    };
    const draw = () => {
        const n = Object.keys(cache).length;
        drill.innerHTML = `<div class="el-card"><div class="head"><h3>Seções da zona ${Number(state.zona)} · ${secs.length} urnas</h3>
            <div style="display:flex;gap:8px;align-items:center"><span class="el-area-sub" id="el-sec-prog">${n ? `${n}/${secs.length} boletins carregados` : 'Clique numa seção para abrir o boletim de urna'}</span>
            ${n < secs.length ? `<button class="el-btn primary" id="el-load-all">Apurar todas as seções</button>` : ''}</div></div>
            <div class="sec-grid">${secs.map(tile).join('')}</div></div>`;
        drill.querySelector('#el-load-all')?.addEventListener('click', loadAll);
    };
    const loadAll = async () => {
        const q = secs.filter(s => !cache[s]);
        const btn = drill.querySelector('#el-load-all'); if (btn) btn.disabled = true;
        let done = secs.length - q.length;
        await Promise.all(Array.from({ length: 8 }, async () => {
            while (q.length && v === version) {
                const s = q.shift();
                try { const b = await tse.getBoletim({ uf: state.uf, mun: state.mun, zona: state.zona, secao: s, turno: state.turno }); if (b.bu) cache[s] = b.bu; } catch { /* seção sem BU */ }
                done++;
                const p = drill.querySelector('#el-sec-prog'); if (p) p.textContent = `${done}/${secs.length} boletins carregados`;
                const el = drill.querySelector(`[data-go="secao:${s}"]`); if (el) el.outerHTML = tile(s);
            }
        }));
        zonaCache.set(key, cache);
        if (v === version) draw();
    };
    zonaCache.set(key, cache);
    draw();
}

async function renderSecao(panel, drill, v) {
    panel.innerHTML = skeleton();
    let b;
    try { b = await tse.getBoletim({ uf: state.uf, mun: state.mun, zona: state.zona, secao: state.secao, turno: state.turno }); } catch (e) {
        panel.innerHTML = vazio('Boletim de urna indisponível.', esc(e.message)); return;
    }
    if (v !== version) return;
    const live = root.querySelector('#el-live');
    live.classList.remove('live', 'snap');
    live.innerHTML = `<span class="dot"></span><span>Boletim de urna oficial · ${esc(b.status || '')}</span>`;
    if (!b.bu) { panel.innerHTML = vazio(`Seção ${Number(state.secao)}: ${esc(b.status)}`); return; }
    const key = `${state.turno}-${state.uf}-${state.mun}-${state.zona}`;
    const zc = zonaCache.get(key) || {}; zc[state.secao] = b.bu; zonaCache.set(key, zc);
    const cont = tse.contagemDoBoletim(b.bu);
    const ordem = Object.keys(cont).map(Number).sort((a, x) => CARGO_ORDEM.indexOf(a === 8 ? 7 : a) - CARGO_ORDEM.indexOf(x === 8 ? 7 : x));
    const cargoSel = cargoReal(state.cargo, state.uf);
    const anyCont = Object.values(cont)[0];
    let html = `<div class="el-card"><div class="el-area-title">Seção ${Number(state.secao)} · Zona ${Number(state.zona)}</div>
        <div class="el-area-sub">${esc(nomeMun(state.uf, state.mun) || '')} (${state.uf.toUpperCase()}) · local de votação ${b.bu.local} · ${esc(b.status)} · recebido ${esc(b.recebido)}</div>
        <div class="el-stats"><div class="el-stat"><div class="k">Aptos</div><div class="v">${fN(anyCont?.aptos)}</div></div>
        <div class="el-stat"><div class="k">Votaram</div><div class="v">${fN(anyCont?.comparecimento)}</div></div>
        <div class="el-stat"><div class="k">Abstenção</div><div class="v">${anyCont?.aptos ? fP(100 * (1 - anyCont.comparecimento / anyCont.aptos), 1) : '—'}</div></div>
        <div class="el-stat"><div class="k">Arquivo</div><div class="v"><a href="${b.url}" style="color:var(--accent);font-size:.8rem" download>BU .dat ↓</a></div></div></div></div>`;
    for (const c of ordem) {
        const co = cont[c];
        const res = await tse.getResultado({ cargo: c, turno: state.turno, uf: c === 1 ? 'br' : state.uf }).catch(() => null);
        const nomes = Object.fromEntries((res?.candidatos || []).map(x => [x.n, x]));
        const partNum = Object.fromEntries((res?.partidos || []).map(p => [p.num, p.sg]));
        const linhas = [
            ...Object.entries(co.votos).map(([n, q]) => ({ nm: nomes[n] ? titleCase(nomes[n].nm) : `Nº ${n}`, p: nomes[n]?.p || partNum[String(n).slice(0, 2)] || '', q, n })),
            ...Object.entries(co.legenda).map(([p, q]) => ({ nm: `Legenda ${partNum[p] || p}`, p: partNum[p] || '', q, n: p })),
        ].sort((a, x) => x.q - a.q);
        const validos = linhas.reduce((s, l) => s + l.q, 0);
        const aberto = c === cargoSel;
        html += `<details class="el-card" ${aberto ? 'open' : ''}><summary style="cursor:pointer;font-weight:700">${esc(CARGOS[c]?.nome || c)} <span class="el-area-sub" style="font-weight:500">· ${fN(validos)} válidos · ${fN(co.brancos)} brancos · ${fN(co.nulos)} nulos${c === 5 && validos > co.comparecimento ? ' · 2 votos por eleitor' : ''}</span></summary>
            <div class="mini-list" style="margin-top:8px">${linhas.slice(0, aberto ? 60 : 15).map(l => `<div class="mini-row"><div class="l"><i class="sw" style="background:${corPartido(l.p)}"></i><span><b>${esc(l.nm)}</b> <span style="color:var(--t3)">${esc(l.p)} · ${esc(l.n)}</span></span></div><div class="r"><b>${fN(l.q)}</b> · ${fP(validos ? 100 * l.q / validos : 0, 1)}</div></div>`).join('')}</div></details>`;
        if (v !== version) return;
    }
    panel.innerHTML = html;
    if (!drill.innerHTML) renderDrillSecoes(drill, v);
}
