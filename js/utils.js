// utils.js - Formatting, constants, chart helpers, modal utilities
import { getSettings } from './storage.js';

export const fmt = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
export const fmtDate = d => new Date(d+'T12:00:00').toLocaleDateString('pt-BR');
export const fmtPct = v => v.toFixed(1)+'%';
export const uid = () => Date.now().toString(36)+Math.random().toString(36).substr(2,9);
export const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const MON = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
export const curMonth = () => new Date().getMonth()+1;
export const curYear = () => new Date().getFullYear();

// ═══════════════════════════════════════════════════════════════════
// ── Category Groups ──────────────────────────────────────────────
// OpEx:        Custo de vida / dinheiro "queimado"
// CapEx:       Projetos e negócios / investimento produtivo
// Acumulação:  Aquisição de ativos / patrimônio
// ═══════════════════════════════════════════════════════════════════

export const CATEGORY_GROUPS = [
    { id: 'opex',        name: 'Manutenção da Vida',    tag: 'OpEx',        color: '#ef4444', icon: '🔥' },
    { id: 'capex',       name: 'Projetos e Negócios',   tag: 'CapEx',       color: '#f59e0b', icon: '🚀' },
    { id: 'acumulacao',  name: 'Aquisição de Ativos',   tag: 'Acumulação',  color: '#22c55e', icon: '💎' },
];

export const CATEGORIES = [
    // ── OpEx: Manutenção da Vida ──
    {id:'moradia',       name:'Moradia',        icon:'🏠', color:'#6366f1', group:'opex'},
    {id:'alimentacao',   name:'Alimentação',    icon:'🍕', color:'#f59e0b', group:'opex'},
    {id:'transporte',    name:'Transporte',     icon:'🚗', color:'#3b82f6', group:'opex'},
    {id:'saude',         name:'Saúde',          icon:'💊', color:'#ef4444', group:'opex'},
    {id:'educacao',      name:'Educação',       icon:'📚', color:'#8b5cf6', group:'opex'},
    {id:'lazer',         name:'Lazer',          icon:'🎮', color:'#ec4899', group:'opex'},
    {id:'vestuario',     name:'Vestuário',      icon:'👕', color:'#14b8a6', group:'opex'},
    {id:'servicos',      name:'Serviços',       icon:'🔧', color:'#f97316', group:'opex'},
    {id:'assinaturas',   name:'Assinaturas',    icon:'📱', color:'#06b6d4', group:'opex'},
    {id:'mercado',       name:'Mercado',        icon:'🛒', color:'#22c55e', group:'opex'},
    {id:'contas',        name:'Contas',         icon:'💡', color:'#eab308', group:'opex'},
    // ── CapEx: Projetos e Negócios ──
    {id:'franquia',      name:'Aportes Franquia',   icon:'🧺', color:'#a855f7', group:'capex'},
    {id:'equipamentos',  name:'Equipamentos',       icon:'🖥️', color:'#0ea5e9', group:'capex'},
    {id:'taxas_abertura', name:'Taxas de Abertura',  icon:'📋', color:'#d946ef', group:'capex'},
    // ── Acumulação: Aquisição de Ativos ──
    {id:'reserva_imovel', name:'Reserva Imóvel',     icon:'🏗️', color:'#10b981', group:'acumulacao'},
    {id:'renda_fixa_desp', name:'Renda Fixa',        icon:'🏦', color:'#6366f1', group:'acumulacao'},
    {id:'acoes_desp',      name:'Ações',             icon:'📈', color:'#22c55e', group:'acumulacao'},
    // ── Sem grupo ──
    {id:'outros',         name:'Outros',             icon:'📦', color:'#94a3b8', group:'opex'},
];

// Fast group lookup map
const GROUP_MAP = {};
CATEGORIES.forEach(c => GROUP_MAP[c.id] = c.group || 'opex');

export const INV_TYPES = [
    {id:'renda_fixa',name:'Renda Fixa',icon:'🏦',color:'#6366f1'},
    {id:'acoes',name:'Ações',icon:'📈',color:'#22c55e'},
    {id:'fiis',name:'FIIs',icon:'🏢',color:'#3b82f6'},
    {id:'crypto',name:'Criptomoedas',icon:'₿',color:'#f59e0b'},
    {id:'tesouro',name:'Tesouro Direto',icon:'🇧🇷',color:'#14b8a6'},
    {id:'poupanca',name:'Poupança',icon:'🐷',color:'#ec4899'},
    {id:'outros',name:'Outros',icon:'💰',color:'#94a3b8'}
];

export const BRANDS = [
    {id:'visa',name:'Visa',color:'#1a1f71'},
    {id:'mastercard',name:'Mastercard',color:'#eb001b'},
    {id:'elo',name:'Elo',color:'#00a4e0'},
    {id:'amex',name:'Amex',color:'#006fcf'},
    {id:'hipercard',name:'Hipercard',color:'#822124'},
    {id:'outro',name:'Outro',color:'#94a3b8'}
];

export const INCOME_CATEGORIES = [
    {id:'salario',name:'Salário',icon:'💼',color:'#22c55e'},
    {id:'freelance',name:'Freelance',icon:'💻',color:'#3b82f6'},
    {id:'investimentos',name:'Investimentos',icon:'📈',color:'#6366f1'},
    {id:'aluguel',name:'Aluguel',icon:'🏠',color:'#f59e0b'},
    {id:'pensao',name:'Pensão',icon:'🤝',color:'#ec4899'},
    {id:'vendas',name:'Vendas',icon:'🛍️',color:'#14b8a6'},
    {id:'bonus',name:'Bônus',icon:'🎁',color:'#8b5cf6'},
    {id:'outros',name:'Outros',icon:'💰',color:'#94a3b8'}
];

export function getAllExpenseCategories() { return [...CATEGORIES, ...(getSettings().customExpenseCategories||[])]; }
export function getAllIncomeCategories() { return [...INCOME_CATEGORIES, ...(getSettings().customIncomeCategories||[])]; }

export const cat = id => { const a=getAllExpenseCategories(); return a.find(c=>c.id===id)||{id:'outros',name:'Outros',icon:'📦',color:'#94a3b8',group:'opex'}; };
export const incomeCat = id => { const a=getAllIncomeCategories(); return a.find(c=>c.id===id)||{id:'outros',name:'Outros',icon:'💰',color:'#94a3b8'}; };
export const invType = id => INV_TYPES.find(t=>t.id===id)||INV_TYPES[6];
export const brand = id => BRANDS.find(b=>b.id===id)||BRANDS[5];

/** Get group id for a category id */
export const catGroup = id => GROUP_MAP[id] || 'opex';

/** Get group info object */
export const getGroup = id => CATEGORY_GROUPS.find(g => g.id === id) || CATEGORY_GROUPS[0];

/**
 * Compute totals by group for a set of expense entries.
 * Returns: { opex, capex, acumulacao, total }
 */
export function getGroupTotals(entries) {
    const result = { opex: 0, capex: 0, acumulacao: 0, total: 0 };
    for (const e of entries) {
        const g = catGroup(e.category || 'outros');
        result[g] = (result[g] || 0) + (e.amount || 0);
        result.total += (e.amount || 0);
    }
    return result;
}

/**
 * Returns category <option> elements grouped by OpEx / CapEx / Acumulação.
 */
export function buildGroupedCategoryOptions(selectedId) {
    const cats = getAllExpenseCategories();
    const groups = [
        { ...CATEGORY_GROUPS[0], items: cats.filter(c => (c.group || 'opex') === 'opex') },
        { ...CATEGORY_GROUPS[1], items: cats.filter(c => c.group === 'capex') },
        { ...CATEGORY_GROUPS[2], items: cats.filter(c => c.group === 'acumulacao') },
    ];
    return groups.map(g => {
        if (!g.items.length) return '';
        return `<optgroup label="${g.icon} ${g.tag}: ${g.name}">
            ${g.items.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}
        </optgroup>`;
    }).join('');
}

// --- Modal ---
export function openModal(title, bodyHTML, onSubmit) {
    const ov = document.getElementById('modal-overlay');
    const mc = document.getElementById('modal-container');
    mc.innerHTML = `
        <div class="modal-header"><h3>${title}</h3><button type="button" class="modal-close" id="modal-close-btn">&times;</button></div>
        <div class="modal-body">${bodyHTML}</div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="modal-submit">Salvar</button>
        </div>`;
    
    // Clean up old event listeners to prevent duplicates
    const oldSubmit = mc.querySelector('#modal-submit');
    const newSubmit = oldSubmit.cloneNode(true);
    oldSubmit.parentNode.replaceChild(newSubmit, oldSubmit);

    ov.classList.remove('hidden');
    mc.querySelector('#modal-close-btn').onclick = () => ov.classList.add('hidden');
    mc.querySelector('#modal-cancel').onclick = () => ov.classList.add('hidden');
    
    newSubmit.addEventListener('click', async (e) => {
        console.log('--- BOTÃO CLICADO ---');
        e.preventDefault();
        const shouldClose = await onSubmit(e);
        if (shouldClose !== false) {
            ov.classList.add('hidden');
        }
    });

    ov.onclick = e => { if (e.target === ov) ov.classList.add('hidden'); };
}
export function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

// --- Charts ---
function setupCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio||1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width*dpr; canvas.height = r.height*dpr;
    ctx.scale(dpr,dpr);
    return {ctx, w:r.width, h:r.height};
}

export function drawBar(canvas, data) {
    const {ctx,w,h} = setupCanvas(canvas);
    const p = {t:20,r:20,b:40,l:65};
    const cw = w-p.l-p.r, ch = h-p.t-p.b;
    ctx.clearRect(0,0,w,h);
    if(!data.length){ctx.fillStyle='#64748b';ctx.font='14px Inter,sans-serif';ctx.textAlign='center';ctx.fillText('Sem dados',w/2,h/2);return;}
    const max = Math.max(...data.map(d=>d.value))*1.15||1;
    const bw = Math.min(cw/data.length*0.6,50), gap = cw/data.length;
    ctx.strokeStyle='rgba(148,163,184,0.1)';ctx.lineWidth=1;
    for(let i=0;i<=4;i++){const y=p.t+ch-(ch*i/4);ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(w-p.r,y);ctx.stroke();ctx.fillStyle='#64748b';ctx.font='11px Inter,sans-serif';ctx.textAlign='right';ctx.fillText(fmt(max*i/4).replace('R$\u00a0',''),p.l-8,y+4);}
    data.forEach((d,i)=>{const x=p.l+gap*i+(gap-bw)/2,barH=(d.value/max)*ch,y=p.t+ch-barH,rad=Math.min(bw/4,6);ctx.fillStyle=d.color||'#2dd4bf';ctx.beginPath();ctx.moveTo(x,y+rad);ctx.quadraticCurveTo(x,y,x+rad,y);ctx.lineTo(x+bw-rad,y);ctx.quadraticCurveTo(x+bw,y,x+bw,y+rad);ctx.lineTo(x+bw,p.t+ch);ctx.lineTo(x,p.t+ch);ctx.closePath();ctx.fill();ctx.fillStyle='#94a3b8';ctx.font='11px Inter,sans-serif';ctx.textAlign='center';ctx.fillText(d.label,x+bw/2,h-p.b+20);});
}

export function drawDonut(canvas, data, centerText, subText) {
    const {ctx,w,h} = setupCanvas(canvas);
    ctx.clearRect(0,0,w,h);
    const cx=w/2, cy=h/2, r=Math.min(w,h)/2-20, ir=r*0.65;
    const total = data.reduce((s,d)=>s+d.value,0);
    if(!total){ctx.fillStyle='#64748b';ctx.font='14px Inter,sans-serif';ctx.textAlign='center';ctx.fillText('Sem dados',cx,cy);return;}
    let start = -Math.PI/2;
    data.forEach(d=>{const angle=(d.value/total)*Math.PI*2;ctx.beginPath();ctx.arc(cx,cy,r,start,start+angle);ctx.arc(cx,cy,ir,start+angle,start,true);ctx.closePath();ctx.fillStyle=d.color;ctx.fill();start+=angle;});
    if(centerText){ctx.fillStyle='#e2e8f0';ctx.font='bold 20px Inter,sans-serif';ctx.textAlign='center';ctx.fillText(centerText,cx,cy-4);}
    if(subText){ctx.fillStyle='#94a3b8';ctx.font='12px Inter,sans-serif';ctx.textAlign='center';ctx.fillText(subText,cx,cy+16);}
}

export function drawLine(canvas, datasets, labels) {
    const {ctx,w,h} = setupCanvas(canvas);
    const p={t:20,r:20,b:40,l:65};
    const cw=w-p.l-p.r, ch=h-p.t-p.b;
    ctx.clearRect(0,0,w,h);
    if(!labels.length){ctx.fillStyle='#64748b';ctx.font='14px Inter,sans-serif';ctx.textAlign='center';ctx.fillText('Sem dados',w/2,h/2);return;}
    const allV = datasets.flatMap(ds=>ds.data);
    const max = Math.max(...allV)*1.15||1;
    ctx.strokeStyle='rgba(148,163,184,0.1)';ctx.lineWidth=1;
    for(let i=0;i<=4;i++){const y=p.t+ch-(ch*i/4);ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(w-p.r,y);ctx.stroke();ctx.fillStyle='#64748b';ctx.font='11px Inter,sans-serif';ctx.textAlign='right';ctx.fillText(fmt(max*i/4).replace('R$\u00a0',''),p.l-8,y+4);}
    labels.forEach((l,i)=>{const x=p.l+(cw/(labels.length-1||1))*i;ctx.fillStyle='#94a3b8';ctx.font='11px Inter,sans-serif';ctx.textAlign='center';ctx.fillText(l,x,h-p.b+20);});
    datasets.forEach(ds=>{ctx.strokeStyle=ds.color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();ds.data.forEach((v,i)=>{const x=p.l+(cw/(labels.length-1||1))*i,y=p.t+ch-(v/max)*ch;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.stroke();
    const lastX=p.l+(cw/(labels.length-1||1))*(ds.data.length-1);ctx.lineTo(lastX,p.t+ch);ctx.lineTo(p.l,p.t+ch);ctx.closePath();const g=ctx.createLinearGradient(0,p.t,0,p.t+ch);g.addColorStop(0,ds.color+'40');g.addColorStop(1,ds.color+'05');ctx.fillStyle=g;ctx.fill();
    ds.data.forEach((v,i)=>{const x=p.l+(cw/(labels.length-1||1))*i,y=p.t+ch-(v/max)*ch;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=ds.color;ctx.fill();ctx.strokeStyle='#1c1f2e';ctx.lineWidth=2;ctx.stroke();});});
}
