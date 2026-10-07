// pesquisas.js — aba "Pesquisas 2º turno": cada pesquisa, consolidado, tendência, projeção e comparação com 2022.
import * as M from './modelo.js';
import * as tse from './tse.js';

const C_LULA = '#e0393e', C_FLAVIO = '#2f6fe4', C_2022 = '#f08a8d';
const fP = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const fN = v => (v ? Math.round(v).toLocaleString('pt-BR') : '—');
const fD = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}${y !== '2026' ? '/' + y.slice(2) : ''}`; };
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let root, d26, d22, hist = [], A = null, t1 = { lula: 45.16, flavio: 47.03 };
const ui = { periodo: 'campanha', metrica: 'validos', inst: '', mostrar2022: true };
let loaded = false;

export function init(el) { root = el; }

export async function render() {
    if (!loaded) {
        root.innerHTML = `<div class="el-card">${'<div class="el-skel"></div>'.repeat(6)}</div>`;
        try { await load(); loaded = true; } catch (e) {
            root.innerHTML = `<div class="el-card el-empty"><div class="big">📉</div><b>Não foi possível carregar as pesquisas.</b><br>${esc(e.message)}</div>`;
            return;
        }
    }
    draw();
}

async function load() {
    const get = async u => { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); };
    [d26, d22] = await Promise.all([get('data/pesquisas/presidente-2t-2026.json'), get('data/pesquisas/presidente-2t-2022.json')]);
    hist = await get('data/pesquisas/projecoes.json').catch(() => []);
    // 1º turno oficial direto do TSE (fallback: valores oficiais conhecidos)
    const br = await tse.getResultado({ cargo: 1, turno: 1, uf: 'br' }).catch(() => null);
    if (br) {
        const f = br.candidatos.find(c => c.n === '22'), l = br.candidatos.find(c => c.n === '13');
        if (f && l) t1 = { lula: l.pv, flavio: f.pv };
    }
    const hoje = M.isoOf(Date.now());
    A = M.analisar(d26, d22, hoje > d26.eleicao ? d26.eleicao : hoje, t1);
}

function filtradas() {
    const hoje = M.isoOf(Date.now());
    const ini = { pos1t: M.PRIMEIRO_TURNO_2026, campanha: '2026-08-16', '90d': M.addDays(hoje, -90), tudo: '2000-01-01' }[ui.periodo];
    return d26.polls.filter(p => p.fim >= ini && (!ui.inst || p.instituto === ui.inst));
}

function draw() {
    const hoje = M.isoOf(Date.now());
    const atual = A.serie.at(-1), P = A.projecao, PA = A.projecaoAjustada;
    const diasAntes = M.daysBetween(hoje, M.ELEICAO_2026);
    const c22 = A.serie2022.find(s => s.diasAntes === Math.max(0, diasAntes));
    const vesp1t = M.consolidado(d26.polls, M.addDays(M.PRIMEIRO_TURNO_2026, -1));
    const pos1t = d26.polls.filter(p => p.inicio > M.PRIMEIRO_TURNO_2026);
    const insts = [...new Set(d26.polls.map(p => p.instituto))].sort();
    const T = A.transferencia;

    root.innerHTML = `
    <div class="el-wrap">
        <div class="pq-filters">
            <div class="seg" id="pq-per">${[['pos1t', 'Pós-1º turno'], ['campanha', 'Campanha'], ['90d', '90 dias'], ['tudo', 'Tudo']].map(([k, t]) => `<button data-k="${k}" class="${ui.periodo === k ? 'on' : ''}">${t}</button>`).join('')}</div>
            <div class="seg" id="pq-met"><button data-k="validos" class="${ui.metrica === 'validos' ? 'on' : ''}">Votos válidos</button><button data-k="totais" class="${ui.metrica === 'totais' ? 'on' : ''}">Votos totais</button></div>
            <select id="pq-inst" aria-label="Instituto"><option value="">Todos os institutos</option>${insts.map(i => `<option ${ui.inst === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select>
            <label class="el-area-sub" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="pq-22" ${ui.mostrar2022 ? 'checked' : ''}> Sobrepor 2022 (Lula × Jair)</label>
            <span class="spacer" style="flex:1"></span>
            <span class="el-live"><span class="dot"></span><span>${d26.polls.length} pesquisas · coletado ${new Date(d26.coletadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span></span>
        </div>

        ${pos1t.length === 0 ? `<div class="el-banner info"><span class="ico">🗓️</span><div><b>Nenhuma pesquisa pós-1º turno publicada ainda.</b> O consolidado abaixo usa as simulações de 2º turno feitas até 03/10 — que, atenção, davam Lula ${fP(vesp1t?.lula)} na véspera, enquanto as urnas do 1º turno colocaram Flávio à frente (${fP(t1.flavio, 2)} × ${fP(t1.lula, 2)}). As primeiras pesquisas do 2º turno (Datafolha, PoderData, AtlasIntel…) entram aqui automaticamente na coleta de 2×/dia.</div></div>` : ''}

        <div class="pq-kpis">
            ${kpi('Consolidado hoje (válidos)', atual.lula, atual.adversario, `${atual.n} pesquisas de ${atual.institutos} institutos nos últimos 21 dias.`)}
            ${kpi(`Projeção para 25/10 · ${P.restantes} dias`, P.lula, P.adversario, `Intervalo de 90%: Lula entre ${fP(P.intervalo[0])} e ${fP(P.intervalo[1])}. Tendência: ${sgn(P.tendenciaDia * 7)} pp/semana.`, 'hl')}
            <div class="pq-kpi"><div class="k">Chance de vitória (modelo)</div>
                <div class="duo"><b class="pq-c-l">${Math.round(P.probLula * 100)}%</b><span>Lula</span><b class="pq-c-f">${Math.round((1 - P.probLula) * 100)}%</b><span>Flávio</span></div>
                <div class="split"><span style="flex:${P.probLula};background:${C_LULA}"></span><span style="flex:${1 - P.probLula};background:${C_FLAVIO}"></span></div>
                <div class="s">σ = ${P.sigma.toFixed(1)} pp (erro médio dos institutos em 2022: ${A.erroBase.toFixed(1)} pp + incerteza dos dias restantes).</div></div>
            <div class="pq-kpi"><div class="k">Lula vs. ele mesmo em 2022</div>
                <div class="duo"><b class="${atual.lula - M.RESULTADO_2022.lula >= 0 ? 'pos' : 'neg'}">${sgn(atual.lula - M.RESULTADO_2022.lula)} pp</b><span>vs. resultado final (50,90%)</span></div>
                <div class="s">${c22 ? `No mesmo ponto de 2022 (${diasAntes} dias antes) o consolidado dava Lula <b>${fP(c22.lula)}</b> — hoje ${sgn(atual.lula - c22.lula)} pp.` : ''} Em 2022 as pesquisas superestimaram Lula em ${sgn(A.serie2022.at(-1).lula - M.RESULTADO_2022.lula)} pp na véspera.</div></div>
            ${kpi('Cenário: transferência igual a 2022', T.lula, T.flavio, `Em 2022, Bolsonaro capturou ${Math.round(T.capAdversario * 100)}% dos votos dos demais candidatos do 1º turno. Repetido sobre o 1º turno de 2026 (${fP(t1.flavio, 2)} × ${fP(t1.lula, 2)}).`)}
            ${kpi('Projeção ajustada por viés 2022', PA.lula, PA.adversario, 'Desconta metade do erro que cada instituto teve em 2022. Cenário de sensibilidade, não previsão principal.')}
        </div>

        <div class="pq-grid">
            <div class="el-card"><h3>Tendência e projeção <span>${ui.metrica === 'validos' ? 'votos válidos' : 'votos totais'}</span></h3>
                <div class="pq-chart" id="pq-trend"></div>
                <div class="pq-legend">
                    <span><i class="dot" style="background:${C_LULA}"></i>Lula (cada pesquisa)</span><span><i class="dot" style="background:${C_FLAVIO}"></i>Flávio (cada pesquisa)</span>
                    <span><i style="background:${C_LULA}"></i>Consolidado</span><span style="color:${C_LULA}"><i class="dash" style="color:${C_LULA}"></i>Projeção + faixa 90%</span>
                    ${ui.mostrar2022 ? `<span style="color:${C_2022}"><i class="dash" style="color:${C_2022}"></i>Lula 2022 (alinhado por dias até a eleição)</span>` : ''}
                </div>
            </div>
            <div class="el-card"><h3>Mesmo instituto, mesmo momento <span>Lula, válidos</span></h3>
                <div class="el-area-sub" style="margin-bottom:8px">● 2026 &nbsp;○ 2022 (mesmo nº de dias antes da eleição, ±6). A linha central é 50%.</div>
                <div id="pq-dumb"></div>
            </div>
        </div>

        <div class="el-card" style="padding:0;overflow:hidden"><div class="el-drill"><div class="head" style="display:flex;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border)"><h3 style="margin:0">Todas as pesquisas <span class="el-area-sub" style="text-transform:none;letter-spacing:0">(${filtradas().length})</span></h3><span class="el-area-sub">Fonte: <a href="${esc(d26.fonte)}" target="_blank" rel="noopener" style="color:var(--t2)">compilação da Wikipedia (registros TSE)</a></span></div>
            <div class="el-table-wrap" style="max-height:560px"><table class="el-table"><thead><tr><th>Instituto</th><th>Campo</th><th class="num">Amostra</th><th class="num">Margem</th><th class="num">Lula</th><th class="num">Flávio</th><th class="num">Outros/NS</th><th class="num">Lula válidos</th><th class="num">Vantagem</th><th>Mesmo instituto em 2022</th></tr></thead><tbody>${linhasTabela()}</tbody></table></div></div></div>

        <div class="pq-grid">
            <div class="el-card"><h3>Agregadores <span>votos totais</span></h3><div class="mini-list">
                <div class="mini-row"><div class="l"><b>FinanceHub (este painel)</b><span class="badge-new">modelo</span></div><div class="r"><span class="pq-c-l">${fP(atual.totais.lula)}</span> × <span class="pq-c-f">${fP(atual.totais.adversario)}</span></div></div>
                ${d26.agregadores.map(a => `<div class="mini-row"><div class="l"><span>${esc(a.agregador)} <span style="color:var(--t3)">${fD(a.data)}</span></span></div><div class="r"><span class="pq-c-l">${fP(a.lula)}</span> × <span class="pq-c-f">${fP(a.flavio)}</span></div></div>`).join('')}
            </div>
            <h3 style="margin-top:18px">Erro dos institutos em 2022 <span>última pesquisa − resultado</span></h3>
            <div class="mini-list">${Object.entries(A.vies).sort((a, b) => Math.abs(a[1].erro) - Math.abs(b[1].erro)).map(([k, v]) => `<div class="mini-row"><div class="l"><span>${esc(k)} <span style="color:var(--t3)">${fD(v.pesquisa.fim)}</span></span></div><div class="r ${Math.abs(v.erro) < 1 ? 'pos' : ''}">Lula ${sgn(v.erro)} pp</div></div>`).join('')}</div>
            </div>
            <div class="el-card"><h3>Como o painel calcula</h3><div class="pq-method">
                <p><b>1. Válidos:</b> cada pesquisa vira <code>Lula ÷ (Lula + Flávio)</code>, a mesma base do resultado oficial.</p>
                <p><b>2. Consolidado:</b> média das pesquisas dos últimos 21 dias com peso <code>√amostra × 0,5^(idade/7)</code>; só a última de cada instituto pesa 100% (as anteriores 35%) — quem publica mais não domina.</p>
                <p><b>3. Projeção:</b> consolidado + tendência dos últimos 14 dias amortecida em 50%. Incerteza = erro real dos institutos em 2022 (${A.erroBase.toFixed(1)} pp RMS) somado à volatilidade dos dias restantes.</p>
                <p><b>4. Comparação com 2022:</b> pesquisas pareadas por instituto e por dias até a eleição; referência final Lula 50,90% × Bolsonaro 49,10% (TSE).</p>
                <p><b>Automação:</b> GitHub Actions coleta 2×/dia e grava o histórico da projeção (${hist.length} dia${hist.length === 1 ? '' : 's'} registrado${hist.length === 1 ? '' : 's'}) — depois de 25/10 dá para auditar o modelo.</p>
                <p style="color:var(--t3)">Pesquisa não é previsão. Em 2022 a média errou Lula por ${sgn(A.serie2022.at(-1).lula - M.RESULTADO_2022.lula)} pp; no 1º turno de 2026 os institutos também derraparam. Use a faixa, não o ponto.</p>
            </div></div>
        </div>
    </div>`;

    bind();
    drawTrend();
    drawDumbbell();
}

function kpi(k, l, f, s, cls = '') {
    return `<div class="pq-kpi ${cls}"><div class="k">${k}</div>
        <div class="duo"><b class="pq-c-l">${fP(l)}</b><span>Lula</span><b class="pq-c-f">${fP(f)}</b><span>Flávio</span></div>
        <div class="split"><span style="flex:${l};background:${C_LULA}"></span><span style="flex:${f};background:${C_FLAVIO}"></span></div>
        <div class="s">${s}</div></div>`;
}

function linhasTabela() {
    return filtradas().map(p => {
        const lv = M.lulaValidos(p);
        const q = M.mesmoMomento2022(p, d22.polls);
        const q22 = q ? M.lulaValidos(q.pesquisa) : null;
        const vant = p.lula - p.flavio;
        const novo = p.inicio > M.PRIMEIRO_TURNO_2026 ? '<span class="badge-new">2º turno</span>' : '';
        return `<tr><td><b>${esc(p.instituto)}</b>${novo}<br><span class="el-area-sub">${esc(p.contratante.toLowerCase() !== p.instituto.toLowerCase() ? p.contratante : '')}</span></td>
            <td>${p.inicio !== p.fim ? fD(p.inicio) + '–' : ''}${fD(p.fim)}</td><td class="num">${fN(p.amostra)}</td><td class="num">${p.margem != null ? '±' + p.margem.toLocaleString('pt-BR') : '—'}</td>
            <td class="num pq-c-l"><b>${fP(p.lula)}</b></td><td class="num pq-c-f"><b>${fP(p.flavio)}</b></td><td class="num">${fP(p.outros)}</td>
            <td class="num">${fP(lv)}</td><td class="num" style="color:${vant > 0 ? C_LULA : vant < 0 ? C_FLAVIO : 'var(--t2)'}">${vant === 0 ? 'empate' : (vant > 0 ? 'Lula ' : 'Flávio ') + Math.abs(vant).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
            <td>${q ? `Lula ${fP(q22)} × Jair ${fP(100 - q22)} <span class="el-area-sub">(${fD(q.pesquisa.fim)})</span> · <b class="${lv - q22 >= 0 ? 'pos' : 'neg'}">${sgn(lv - q22)}</b>` : '<span class="el-area-sub">sem par em 2022</span>'}</td></tr>`;
    }).join('') || '<tr><td colspan="10" class="el-area-sub" style="padding:18px">Nenhuma pesquisa no filtro.</td></tr>';
}

function bind() {
    root.querySelector('#pq-per').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { ui.periodo = b.dataset.k; draw(); } });
    root.querySelector('#pq-met').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { ui.metrica = b.dataset.k; draw(); } });
    root.querySelector('#pq-inst').addEventListener('change', e => { ui.inst = e.target.value; draw(); });
    root.querySelector('#pq-22').addEventListener('change', e => { ui.mostrar2022 = e.target.checked; draw(); });
}

// ───────────────────────── gráfico de tendência (SVG) ─────────────────────────
function drawTrend() {
    const host = root.querySelector('#pq-trend');
    const W = Math.max(320, host.clientWidth || 800), H = W < 560 ? 300 : 380;
    const m = { l: 40, r: 64, t: 16, b: 30 };
    const val = ui.metrica === 'validos';
    const polls = filtradas();
    const hoje = M.isoOf(Date.now());
    const x0 = polls.length ? polls.map(p => p.fim).sort()[0] : M.addDays(hoje, -30);
    const x1 = M.ELEICAO_2026;
    const serie = A.serie.filter(s => s.dia >= x0);
    const pv = p => (val ? { l: M.lulaValidos(p), f: 100 - M.lulaValidos(p) } : { l: p.lula, f: p.flavio });
    const sv = s => (val ? { l: s.lula, f: s.adversario } : { l: s.totais.lula, f: s.totais.adversario });
    const ys = [...polls.flatMap(p => Object.values(pv(p))), ...serie.flatMap(s => Object.values(sv(s)))];
    const yMin = Math.floor(Math.min(...ys, val ? 44 : 38) - 1), yMax = Math.ceil(Math.max(...ys, val ? 56 : 52) + 1);
    const tx = d => m.l + (W - m.l - m.r) * M.daysBetween(x0, d) / Math.max(1, M.daysBetween(x0, x1));
    const ty = y => m.t + (H - m.t - m.b) * (1 - (y - yMin) / (yMax - yMin));
    const line = (pts, k) => pts.map((s, i) => `${i ? 'L' : 'M'}${tx(s.dia).toFixed(1)},${ty(sv(s)[k]).toFixed(1)}`).join('');

    // eixos
    const ticksY = []; for (let y = Math.ceil(yMin / 2) * 2; y <= yMax; y += 2) ticksY.push(y);
    const span = M.daysBetween(x0, x1), step = span > 400 ? 60 : span > 150 ? 30 : span > 60 ? 14 : 7;
    const ticksX = []; for (let d = x1; d >= x0; d = M.addDays(d, -step)) ticksX.push(d);

    // projeção (só em válidos)
    const P = A.projecao, last = A.serie.at(-1);
    let proj = '';
    if (val && last && last.dia < x1) {
        const [lo, hi] = P.intervalo;
        proj = `<path d="M${tx(last.dia)},${ty(last.lula)}L${tx(x1)},${ty(hi)}L${tx(x1)},${ty(lo)}Z" fill="${C_LULA}" opacity=".10"/>
            <path d="M${tx(last.dia)},${ty(last.adversario)}L${tx(x1)},${ty(100 - lo)}L${tx(x1)},${ty(100 - hi)}Z" fill="${C_FLAVIO}" opacity=".10"/>
            <path d="M${tx(last.dia)},${ty(last.lula)}L${tx(x1)},${ty(P.lula)}" stroke="${C_LULA}" stroke-width="2" stroke-dasharray="5 4" fill="none"/>
            <path d="M${tx(last.dia)},${ty(last.adversario)}L${tx(x1)},${ty(P.adversario)}" stroke="${C_FLAVIO}" stroke-width="2" stroke-dasharray="5 4" fill="none"/>
            <circle cx="${tx(x1)}" cy="${ty(P.lula)}" r="5" fill="${C_LULA}" stroke="var(--card)" stroke-width="2"/>
            <circle cx="${tx(x1)}" cy="${ty(P.adversario)}" r="5" fill="${C_FLAVIO}" stroke="var(--card)" stroke-width="2"/>
            <text x="${tx(x1) + 8}" y="${ty(P.lula) + 4}" fill="${C_LULA}" font-size="12" font-weight="800">${fP(P.lula)}</text>
            <text x="${tx(x1) + 8}" y="${ty(P.adversario) + 4}" fill="${C_FLAVIO}" font-size="12" font-weight="800">${fP(P.adversario)}</text>`;
    }
    // 2022 alinhado
    let s22 = '';
    if (ui.mostrar2022) {
        const pts = A.serie2022.map(s => ({ dia: M.addDays(M.ELEICAO_2026, -s.diasAntes), s })).filter(p => p.dia >= x0);
        const y22 = s => (val ? s.lula : s.totais.lula);
        if (pts.length) s22 = `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${tx(p.dia).toFixed(1)},${ty(y22(p.s)).toFixed(1)}`).join('')}" stroke="${C_2022}" stroke-width="1.6" stroke-dasharray="2 4" fill="none"/>`;
        if (val) s22 += `<circle cx="${tx(x1)}" cy="${ty(M.RESULTADO_2022.lula)}" r="4" fill="none" stroke="${C_2022}" stroke-width="2"/><text x="${tx(x1) - 6}" y="${ty(M.RESULTADO_2022.lula) - 8}" text-anchor="end" fill="${C_2022}" font-size="10.5">Lula 2022: 50,9%</text>`;
    }
    const t1x = tx(M.PRIMEIRO_TURNO_2026);
    const dots = polls.map(p => { const v = pv(p); return `<circle cx="${tx(p.fim)}" cy="${ty(v.l)}" r="3.6" fill="${C_LULA}" opacity=".45"/><circle cx="${tx(p.fim)}" cy="${ty(v.f)}" r="3.6" fill="${C_FLAVIO}" opacity=".45"/>`; }).join('');

    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Tendência das pesquisas de 2º turno">
        <g class="grid">${ticksY.map(y => `<line x1="${m.l}" x2="${W - m.r}" y1="${ty(y)}" y2="${ty(y)}"/>`).join('')}</g>
        <g class="axis">${ticksY.map(y => `<text x="${m.l - 8}" y="${ty(y) + 4}" text-anchor="end">${y}%</text>`).join('')}${ticksX.map(d => `<text x="${tx(d)}" y="${H - 8}" text-anchor="middle">${fD(d)}</text>`).join('')}</g>
        ${val ? `<line x1="${m.l}" x2="${W - m.r}" y1="${ty(50)}" y2="${ty(50)}" stroke="var(--t3)" stroke-width="1" opacity=".6"/>` : ''}
        ${t1x > m.l ? `<line x1="${t1x}" x2="${t1x}" y1="${m.t}" y2="${H - m.b}" stroke="var(--el-gold)" stroke-dasharray="3 3" opacity=".7"/><text x="${t1x - 6}" y="${m.t + 12}" text-anchor="end" fill="var(--el-gold)" font-size="10.5" font-weight="700">1º turno · Flávio ${fP(t1.flavio)} × Lula ${fP(t1.lula)}</text>` : ''}
        <line x1="${tx(hoje)}" x2="${tx(hoje)}" y1="${m.t}" y2="${H - m.b}" stroke="var(--t3)" opacity=".35"/>
        ${s22}${dots}
        <path d="${line(serie, 'l')}" stroke="${C_LULA}" stroke-width="2.4" fill="none" stroke-linejoin="round"/>
        <path d="${line(serie, 'f')}" stroke="${C_FLAVIO}" stroke-width="2.4" fill="none" stroke-linejoin="round"/>
        ${proj}
        <line id="pq-x" y1="${m.t}" y2="${H - m.b}" stroke="var(--t2)" opacity="0"/>
        <rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent" id="pq-hit"/>
    </svg><div class="pq-tip" id="pq-tip"></div>`;

    // crosshair + tooltip
    const svg = host.querySelector('svg'), tip = host.querySelector('#pq-tip'), xl = host.querySelector('#pq-x');
    const byDay = Object.fromEntries(A.serie.map(s => [s.dia, s]));
    host.querySelector('#pq-hit').addEventListener('mousemove', ev => {
        const r = svg.getBoundingClientRect();
        const px = (ev.clientX - r.left) * (W / r.width);
        const dd = Math.round((px - m.l) / (W - m.l - m.r) * M.daysBetween(x0, x1));
        const dia = M.addDays(x0, Math.max(0, Math.min(M.daysBetween(x0, x1), dd)));
        const s = byDay[dia];
        const ps = polls.filter(p => p.fim === dia);
        const da = M.daysBetween(dia, M.ELEICAO_2026);
        const s22 = A.serie2022.find(x => x.diasAntes === da);
        xl.setAttribute('x1', tx(dia)); xl.setAttribute('x2', tx(dia)); xl.setAttribute('opacity', '.5');
        tip.innerHTML = `<b>${fD(dia)}/2026</b> <span class="el-area-sub">· ${da} dias para a eleição</span>
            ${s ? `<div class="tr"><span><i style="background:${C_LULA}"></i>Lula (consol.)</span><b>${fP(sv(s).l)}</b></div><div class="tr"><span><i style="background:${C_FLAVIO}"></i>Flávio (consol.)</span><b>${fP(sv(s).f)}</b></div>` : dia > hoje ? `<div class="tr"><span>Projeção 25/10</span><b>${fP(A.projecao.lula)} × ${fP(A.projecao.adversario)}</b></div>` : ''}
            ${s22 ? `<div class="tr" style="color:${C_2022}"><span>Lula 2022 (mesmo ponto)</span><b>${fP(val ? s22.lula : s22.totais.lula)}</b></div>` : ''}
            ${ps.map(p => `<div class="tr"><span>${esc(p.instituto)}</span><b>${fP(pv(p).l)} × ${fP(pv(p).f)}</b></div>`).join('')}`;
        tip.style.display = 'block';
        const hx = (tx(dia) / W) * r.width;
        tip.style.left = `${hx > r.width - 240 ? hx - 230 : hx + 14}px`; tip.style.top = '10px';
    });
    host.querySelector('#pq-hit').addEventListener('mouseleave', () => { tip.style.display = 'none'; xl.setAttribute('opacity', '0'); });
}

function drawDumbbell() {
    const host = root.querySelector('#pq-dumb');
    const ultima = {};
    for (const p of filtradas()) if (!ultima[p.instituto] || p.fim > ultima[p.instituto].fim) ultima[p.instituto] = p;
    const rows = Object.values(ultima).map(p => ({ p, q: M.mesmoMomento2022(p, d22.polls) })).filter(r => r.q)
        .map(r => ({ ...r, a: M.lulaValidos(r.p), b: M.lulaValidos(r.q.pesquisa) })).sort((x, y) => (x.a - x.b) - (y.a - y.b));
    if (!rows.length) { host.innerHTML = '<div class="el-area-sub">Sem pares 2026 × 2022 no filtro atual. Experimente “Campanha” ou “Tudo”.</div>'; return; }
    const lo = 40, hi = 60, X = v => `${Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100))}%`;
    host.innerHTML = rows.map(r => `<div class="dumb" title="2026: ${fD(r.p.fim)} · 2022: ${fD(r.q.pesquisa.fim)}">
        <div><b>${esc(r.p.instituto)}</b><div class="el-area-sub">${fD(r.p.fim)}</div></div>
        <div class="track"><span class="mid"></span><span class="ln" style="left:${X(Math.min(r.a, r.b))};width:calc(${X(Math.max(r.a, r.b))} - ${X(Math.min(r.a, r.b))})"></span>
            <span class="pt" style="left:${X(r.b)};background:transparent;border-color:${C_2022}"></span><span class="pt" style="left:${X(r.a)};background:${C_LULA}"></span></div>
        <div class="d ${r.a - r.b >= 0 ? 'pos' : 'neg'}">${sgn(r.a - r.b)}</div></div>`).join('') +
        `<div class="el-area-sub" style="display:flex;justify-content:space-between;margin-top:6px;padding-left:130px"><span>40%</span><span>50%</span><span>60%</span></div>`;
}
