// investments.js - Investments module
import { fmt, fmtDate, uid, INV_TYPES, openModal, invType, drawDonut, drawBar, fmtPct } from './utils.js';
import { getInvestments, saveInvestment, deleteInvestment } from './storage.js';

let container;

export function init(el) { container = el; }

function invModal(inv = null) {
    const isEdit = !!inv;
    openModal(isEdit ? 'Editar Investimento' : 'Novo Investimento', `
        <div class="form-group"><label>Nome</label><input type="text" id="inv-name" value="${inv?.name||''}" placeholder="Ex: CDB Banco XYZ"></div>
        <div class="form-row">
            <div class="form-group"><label>Tipo</label><select id="inv-type">${INV_TYPES.map(t=>`<option value="${t.id}" ${t.id===inv?.type?'selected':''}>${t.icon} ${t.name}</option>`).join('')}</select></div>
            <div class="form-group"><label>Instituição</label><input type="text" id="inv-inst" value="${inv?.institution||''}" placeholder="Ex: Nubank"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Valor Aplicado (R$)</label><input type="number" id="inv-amount" value="${inv?.amount||''}" step="0.01" min="0" placeholder="0.00"></div>
            <div class="form-group"><label>Rendimento Esperado (% a.a.)</label><input type="number" id="inv-return" value="${inv?.expectedReturn||''}" step="0.01" min="0" placeholder="Ex: 12.5"></div>
        </div>
        <div class="form-group"><label>Data da Aplicação</label><input type="date" id="inv-date" value="${inv?.date||new Date().toISOString().split('T')[0]}"></div>
    `, () => {
        const name = document.getElementById('inv-name').value.trim();
        const amount = parseFloat(document.getElementById('inv-amount').value);
        if (!name || !amount) return false;
        saveInvestment({
            id: inv?.id || uid(), name, amount,
            type: document.getElementById('inv-type').value,
            institution: document.getElementById('inv-inst').value.trim(),
            expectedReturn: parseFloat(document.getElementById('inv-return').value) || 0,
            date: document.getElementById('inv-date').value
        });
        render();
    });
}

export function render() {
    const investments = getInvestments();
    const total = investments.reduce((s, i) => s + i.amount, 0);
    const avgReturn = investments.length ? investments.reduce((s, i) => s + i.expectedReturn, 0) / investments.length : 0;

    // Group by type
    const typeMap = {};
    investments.forEach(i => { typeMap[i.type] = (typeMap[i.type] || 0) + i.amount; });
    const typeData = Object.entries(typeMap).sort((a,b) => b[1]-a[1]);

    container.innerHTML = `
        <div class="section-header">
            <div style="display:flex;align-items:center;gap:12px">
                <h2>Investimentos</h2>
                <button class="btn btn-primary btn-sm" id="inv-add">+ Novo Investimento</button>
            </div>
        </div>

        <div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
            <div class="card summary-card"><div class="icon-box purple">💼</div><div class="info"><div class="label">Total Investido</div><div class="value">${fmt(total)}</div></div></div>
            <div class="card summary-card"><div class="icon-box green">📈</div><div class="info"><div class="label">Rend. Médio</div><div class="value">${avgReturn.toFixed(1)}% a.a.</div></div></div>
            <div class="card summary-card"><div class="icon-box amber">🏦</div><div class="info"><div class="label">Rend. Estimado/Mês</div><div class="value">${fmt(total * (avgReturn/100) / 12)}</div></div></div>
            <div class="card summary-card"><div class="icon-box teal">📊</div><div class="info"><div class="label">Ativos</div><div class="value">${investments.length}</div></div></div>
        </div>

        <div class="charts-grid" style="margin-bottom:20px">
            <div class="card" style="padding:20px">
                <h3 style="font-size:1rem;font-weight:600;margin-bottom:16px;color:var(--t2)">Distribuição por Tipo</h3>
                <div style="display:grid;grid-template-columns:1fr 180px;gap:20px;align-items:center">
                    <div>${typeData.map(([id,v]) => {
                        const t = invType(id); const pct = total>0?(v/total*100):0;
                        return `<div class="list-item" style="padding:10px 0">
                            <span style="font-size:1.1rem">${t.icon}</span>
                            <div style="flex:1"><div style="font-weight:500;font-size:.9rem">${t.name}</div>
                            <div class="progress-bar" style="margin-top:4px"><div class="fill" style="width:${pct}%;background:${t.color}"></div></div></div>
                            <div style="text-align:right"><div style="font-weight:600;font-size:.9rem">${fmt(v)}</div><div style="font-size:.72rem;color:var(--t3)">${fmtPct(pct)}</div></div>
                        </div>`;
                    }).join('')}${!typeData.length?'<div class="empty-state" style="padding:20px"><p>Sem dados</p></div>':''}</div>
                    <div><canvas id="inv-donut" style="width:180px;height:180px"></canvas></div>
                </div>
            </div>
            <div class="card chart-card">
                <h3>Valores por Tipo</h3>
                <canvas id="inv-bar-chart"></canvas>
            </div>
        </div>

        <div class="card" style="padding:0;overflow:hidden">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border)"><h3 style="font-size:1rem;font-weight:600;color:var(--t2)">Seus Investimentos</h3></div>
            ${investments.length ? investments.map(i => {
                const t = invType(i.type);
                return `<div class="inv-card list-item">
                    <div class="inv-icon" style="background:${t.color}20;color:${t.color}">${t.icon}</div>
                    <div class="inv-info">
                        <div class="inv-name">${i.name}</div>
                        <div class="inv-type">${t.name}${i.institution?' · '+i.institution:''}${i.date?' · Desde '+fmtDate(i.date):''}</div>
                    </div>
                    <div>
                        <div class="inv-amount">${fmt(i.amount)}</div>
                        <div class="inv-return">${i.expectedReturn}% a.a.</div>
                    </div>
                    <div class="actions" style="margin-left:12px">
                        <button onclick="window.__editInv('${i.id}')">✏️</button>
                        <button class="del" onclick="window.__delInv('${i.id}')">🗑️</button>
                    </div>
                </div>`;
            }).join('') : '<div class="empty-state"><div class="empty-icon">📊</div><p>Nenhum investimento cadastrado</p><button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="document.getElementById(\'inv-add\').click()">Adicionar</button></div>'}
        </div>
    `;

    container.querySelector('#inv-add').onclick = () => invModal();
    window.__editInv = id => { const i = investments.find(x=>x.id===id); if(i) invModal(i); };
    window.__delInv = id => { if(confirm('Excluir este investimento?')) { deleteInvestment(id); render(); } };

    setTimeout(() => {
        const donut = document.getElementById('inv-donut');
        if (donut && typeData.length) {
            drawDonut(donut, typeData.map(([id,v]) => ({value:v, color:invType(id).color})), fmt(total), 'Total');
        }
        const bar = document.getElementById('inv-bar-chart');
        if (bar) {
            drawBar(bar, typeData.map(([id,v]) => ({label:invType(id).name.substring(0,8), value:v, color:invType(id).color})));
        }
    }, 50);
}
