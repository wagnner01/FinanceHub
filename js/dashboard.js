// dashboard.js - Dashboard module with OpEx / CapEx / Acumulação breakdown
import { fmt, fmtPct, curMonth, curYear, MONTHS, MON, CATEGORY_GROUPS, drawBar, drawDonut, drawLine, cat, catGroup, getGroup, getGroupTotals } from './utils.js';
import { getExpenses, getIncomeTotalForMonth, getIncomeEntries, getCreditCardTransactions, getAllTransactions, getInvestments, getCreditCards } from './storage.js';

let container, month, year;

export function init(el) { container = el; month = curMonth(); year = curYear(); }

export function render() {
    const income = getIncomeTotalForMonth(month, year);
    const incEntries = getIncomeEntries(month, year);
    const expenses = getExpenses(month, year);
    const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
    const txns = getCreditCardTransactions(null, month, year);
    const totalCard = txns.reduce((s, t) => s + t.amount, 0);
    const investments = getInvestments();
    const totalInv = investments.reduce((s, i) => s + i.amount, 0);
    const balance = income - totalExp - totalCard;

    // ── Group Totals (OpEx / CapEx / Acumulação) ──
    const allSpending = [...expenses, ...txns.map(t => ({ ...t, category: t.category || 'outros' }))];
    const gt = getGroupTotals(allSpending);
    const totalGasto = gt.total || 1; // avoid division by zero
    const opexPct = (gt.opex / totalGasto) * 100;
    const capexPct = (gt.capex / totalGasto) * 100;
    const acumPct = (gt.acumulacao / totalGasto) * 100;

    // Invested = CapEx + Acumulação
    const totalInvested = gt.capex + gt.acumulacao;
    const investedPct = totalGasto > 0 ? (totalInvested / totalGasto) * 100 : 0;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <span style="color:var(--t3);font-size:.85rem">Receita Mensal:</span>
                    <strong style="color:var(--green)">${fmt(income)}</strong>
                    <span style="color:var(--t3);font-size:.8rem">(${incEntries.length} fonte${incEntries.length!==1?'s':''})</span>
                </div>
            </div>
            <div class="month-nav">
                <button id="dash-prev">‹</button>
                <span>${MONTHS[month-1]} ${year}</span>
                <button id="dash-next">›</button>
            </div>
        </div>

        <div class="cards-grid">
            <div class="card summary-card">
                <div class="icon-box green">💰</div>
                <div class="info">
                    <div class="label">Receita</div>
                    <div class="value" style="color:var(--green)">${fmt(income)}</div>
                </div>
            </div>
            <div class="card summary-card">
                <div class="icon-box red">💸</div>
                <div class="info">
                    <div class="label">Gastos Totais</div>
                    <div class="value" style="color:var(--red)">${fmt(totalExp + totalCard)}</div>
                </div>
            </div>
            <div class="card summary-card">
                <div class="icon-box ${balance >= 0 ? 'teal' : 'red'}">⚖️</div>
                <div class="info">
                    <div class="label">Saldo</div>
                    <div class="value" style="color:var(${balance >= 0 ? '--accent' : '--red'})">${fmt(balance)}</div>
                </div>
            </div>
            <div class="card summary-card">
                <div class="icon-box purple">📊</div>
                <div class="info">
                    <div class="label">Investido</div>
                    <div class="value" style="color:var(--purple)">${fmt(totalInv)}</div>
                </div>
            </div>
        </div>

        <!-- ═══ BLOCO ESTRATÉGICO: OpEx vs Investido ═══ -->
        <div class="card" style="padding:24px;margin-bottom:20px">
            <h3 style="font-size:1rem;font-weight:600;margin-bottom:16px;color:var(--t2)">📊 Destinação do Capital</h3>
            <div class="capital-bar-wrap">
                <div class="capital-bar">
                    ${gt.opex > 0 ? `<div class="capital-seg seg-opex" style="width:${opexPct}%" title="OpEx: ${fmt(gt.opex)}">
                        ${opexPct > 12 ? `🔥 ${fmtPct(opexPct)}` : ''}
                    </div>` : ''}
                    ${gt.capex > 0 ? `<div class="capital-seg seg-capex" style="width:${capexPct}%" title="CapEx: ${fmt(gt.capex)}">
                        ${capexPct > 12 ? `🚀 ${fmtPct(capexPct)}` : ''}
                    </div>` : ''}
                    ${gt.acumulacao > 0 ? `<div class="capital-seg seg-acum" style="width:${acumPct}%" title="Acumulação: ${fmt(gt.acumulacao)}">
                        ${acumPct > 12 ? `💎 ${fmtPct(acumPct)}` : ''}
                    </div>` : ''}
                </div>
            </div>
            <div class="capital-legend">
                <div class="capital-legend-item">
                    <span class="capital-dot" style="background:var(--red)"></span>
                    <div>
                        <div class="capital-legend-tag">🔥 OpEx — Queimado</div>
                        <div class="capital-legend-val">${fmt(gt.opex)} <span class="capital-legend-pct">${fmtPct(opexPct)}</span></div>
                    </div>
                </div>
                <div class="capital-legend-item">
                    <span class="capital-dot" style="background:var(--amber)"></span>
                    <div>
                        <div class="capital-legend-tag">🚀 CapEx — Projetos</div>
                        <div class="capital-legend-val">${fmt(gt.capex)} <span class="capital-legend-pct">${fmtPct(capexPct)}</span></div>
                    </div>
                </div>
                <div class="capital-legend-item">
                    <span class="capital-dot" style="background:var(--green)"></span>
                    <div>
                        <div class="capital-legend-tag">💎 Acumulação — Patrimônio</div>
                        <div class="capital-legend-val">${fmt(gt.acumulacao)} <span class="capital-legend-pct">${fmtPct(acumPct)}</span></div>
                    </div>
                </div>
            </div>
            ${gt.total > 0 ? `<div class="capital-verdict ${investedPct >= 30 ? 'verdict-good' : investedPct >= 15 ? 'verdict-ok' : 'verdict-bad'}">
                <span class="capital-verdict-icon">${investedPct >= 30 ? '🟢' : investedPct >= 15 ? '🟡' : '🔴'}</span>
                <div>
                    <strong>${fmtPct(investedPct)}</strong> do seu gasto mensal foi <em>investido</em> (CapEx + Acumulação).
                    ${investedPct >= 30 ? 'Excelente alocação!' : investedPct >= 15 ? 'Bom progresso.' : 'Considere direcionar mais capital para ativos.'}
                </div>
            </div>` : ''}
        </div>

        <div class="charts-grid">
            <div class="card chart-card">
                <h3>Gastos por Categoria</h3>
                <canvas id="dash-cat-chart"></canvas>
            </div>
            <div class="card chart-card">
                <h3>Destinação: OpEx vs Investido</h3>
                <canvas id="dash-donut-chart"></canvas>
            </div>
        </div>

        <div class="charts-grid">
            <div class="card chart-card">
                <h3>Evolução Mensal (últimos 6 meses)</h3>
                <canvas id="dash-line-chart"></canvas>
            </div>
            <div class="card" style="padding:20px">
                <h3 style="font-size:1rem;font-weight:600;margin-bottom:16px;color:var(--t2)">Últimas Transações</h3>
                <div id="dash-recent"></div>
            </div>
        </div>
    `;

    // Events
    container.querySelector('#dash-prev').onclick = () => { month--; if(month<1){month=12;year--;} render(); };
    container.querySelector('#dash-next').onclick = () => { month++; if(month>12){month=1;year++;} render(); };

    // Category bar chart
    const catMap = {};
    allSpending.forEach(e => {
        const c = e.category || 'outros';
        catMap[c] = (catMap[c] || 0) + e.amount;
    });
    const catData = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0, 8).map(([id, v]) => ({
        label: cat(id).icon + ' ' + cat(id).name.substring(0,6), value: v, color: cat(id).color
    }));
    setTimeout(() => {
        const cc = document.getElementById('dash-cat-chart');
        if(cc) drawBar(cc, catData);

        // Donut: OpEx vs CapEx vs Acumulação
        const dc = document.getElementById('dash-donut-chart');
        if(dc) {
            drawDonut(dc, [
                {value: gt.opex,       color: '#ef4444'},
                {value: gt.capex,      color: '#f59e0b'},
                {value: gt.acumulacao, color: '#22c55e'},
            ], fmtPct(investedPct), 'Investido');
        }

        // Line chart - last 6 months
        const lc = document.getElementById('dash-line-chart');
        if(lc) {
            const labels = [], incData = [], expData = [];
            for(let i=5; i>=0; i--) {
                let m = month - i, y2 = year;
                while(m<1){m+=12;y2--;}
                labels.push(MON[m-1]);
                incData.push(getIncomeTotalForMonth(m, y2));
                const mexp = getExpenses(m, y2).reduce((s,e)=>s+e.amount,0);
                const mtxn = getCreditCardTransactions(null, m, y2).reduce((s,t)=>s+t.amount,0);
                expData.push(mexp + mtxn);
            }
            drawLine(lc, [{data:incData,color:'#22c55e'},{data:expData,color:'#ef4444'}], labels);
        }
    }, 50);

    // Recent transactions
    const recent = document.getElementById('dash-recent');
    const allRecent = [...expenses.map(e=>({...e,source:'expense'})), ...txns.map(t=>({...t,source:'card'}))]
        .sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0, 5);
    if(!allRecent.length) {
        recent.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Nenhuma transação este mês</p></div>';
    } else {
        recent.innerHTML = allRecent.map(t => {
            const g = getGroup(catGroup(t.category||'outros'));
            const isRetroactiveCard = t.source === 'expense' && t.cardId;
            const ccName = isRetroactiveCard ? getCreditCards().find(c => c.id === t.cardId)?.name || 'Cartão' : null;

            return `
            <div class="list-item">
                <span style="font-size:1.2rem">${cat(t.category||'outros').icon}</span>
                <div style="flex:1">
                    <div style="font-weight:500">${t.description}</div>
                    <div style="font-size:.75rem;color:var(--t3)">
                        ${t.source === 'card' ? 'Cartão Fatura' : (isRetroactiveCard ? `💳 Pago via ${ccName}` : 'Gasto à vista')} 
                        · <span style="color:${g.color}">${g.tag}</span>
                    </div>
                </div>
                <div style="font-weight:600;color:var(--red)">-${fmt(t.amount)}</div>
            </div>`;
        }).join('');
    }
}
