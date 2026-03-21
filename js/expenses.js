import { fmt, fmtDate, uid, curMonth, curYear, MONTHS, getAllExpenseCategories, openModal, cat } from './utils.js';
import { getExpenses, saveExpense, deleteExpense, getIncomeTotalForMonth, getSettings, getCreditCards } from './storage.js';
import { openImportModal } from './import.js';

let container, month, year;

export function init(el) { container = el; month = curMonth(); year = curYear(); }

function catOptions(sel='') {
    return getAllExpenseCategories().map(c => `<option value="${c.id}" ${c.id===sel?'selected':''}>${c.icon} ${c.name}</option>`).join('');
}

function showExpenseModal(exp = null) {
    const isEdit = !!exp;
    const cards = getCreditCards();

    openModal(isEdit ? 'Editar Gasto' : 'Novo Gasto', `
        <div class="form-row">
            <div class="form-group">
                <label>Descrição</label>
                <input type="text" id="exp-desc" value="${exp?.description||''}" placeholder="Ex: Aluguel">
            </div>
            <div class="form-group">
                <label>Valor (R$)</label>
                <input type="number" id="exp-amount" value="${exp?.amount||''}" step="0.01" min="0" placeholder="0.00">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Categoria</label>
                <select id="exp-cat">${catOptions(exp?.category)}</select>
            </div>
            <div class="form-group">
                <label>Tipo</label>
                <select id="exp-type">
                    <option value="fixed" ${exp?.type==='fixed'?'selected':''}>Fixo</option>
                    <option value="variable" ${exp?.type==='variable'?'selected':''}>Variável</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Data</label>
                <input type="date" id="exp-date" value="${exp?.date || `${year}-${String(month).padStart(2,'0')}-01`}">
            </div>
            <div class="form-group">
                <label>Cartão de Crédito 💳</label>
                <select id="exp-card">
                    <option value="">Nenhum / Pix / Dinheiro</option>
                    ${cards.map(c => `<option value="${c.id}" ${c.id === exp?.cardId ? 'selected' : ''}>${c.name} (${c.brand})</option>`).join('')}
                </select>
            </div>
        </div>
    `, async () => {
        const desc = document.getElementById('exp-desc').value.trim();
        const amount = parseFloat(document.getElementById('exp-amount').value);
        if (!desc || !amount) return false;
        
        const cardId = document.getElementById('exp-card').value || null;

        let success = await saveExpense({
            id: exp?.id || uid(),
            description: desc,
            amount,
            category: document.getElementById('exp-cat').value,
            // Mantêm o type para enviar ao Supabase, storage garante 'despesa'
            type: document.getElementById('exp-type').value, 
            date: document.getElementById('exp-date').value,
            cardId: cardId, // Novo campo associando
            month, year
        });
        // 5. Após sucesso, tenta atualizar o app inteiro se a função estiver disponível no escopo global
        if (success) {
            if (window.__appRefresh) {
                window.__appRefresh();
            } else {
                render();
            }
        }
        return success;
    });
}

function renderTable(items, title, icon) {
    if (!items.length) return `
        <div class="card" style="margin-bottom:20px;padding:20px">
            <h3 style="font-size:1rem;font-weight:600;margin-bottom:8px;color:var(--t2)">${icon} ${title}</h3>
            <div class="empty-state" style="padding:30px"><div class="empty-icon">📋</div><p>Nenhum gasto ${title.toLowerCase()}</p></div>
        </div>`;
    const total = items.reduce((s, e) => s + e.amount, 0);
    return `
        <div class="card" style="margin-bottom:20px;padding:0;overflow:hidden">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
                <h3 style="font-size:1rem;font-weight:600;color:var(--t2)">${icon} ${title}</h3>
                <span style="font-weight:700;color:var(--accent)">${fmt(total)}</span>
            </div>
            <div class="table-wrap"><table>
                <thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th><th></th></tr></thead>
                <tbody>${items.map(e => {
                    const c = cat(e.category);
                    const ccName = e.cardId ? getCreditCards().find(card => card.id === e.cardId)?.name || 'Cartão' : null;
                    const descHTML = `<td style="font-weight:500;color:var(--t1)">
                        ${e.description}
                        ${ccName ? `<div style="font-size:0.75rem; color:var(--purple); margin-top:2px;">💳 Pago via ${ccName}</div>` : ''}
                    </td>`;
                    return `<tr>
                        ${descHTML}
                        <td><span class="cat-badge" style="background:${c.color}20;color:${c.color}">${c.icon} ${c.name}</span></td>
                        <td>${e.date ? fmtDate(e.date) : '-'}</td>
                        <td style="font-weight:600">${fmt(e.amount)}</td>
                        <td class="actions">
                            <button onclick="window.__editExp('${e.id}')" title="Editar">✏️</button>
                            <button class="del" onclick="window.__delExp('${e.id}')" title="Excluir">🗑️</button>
                        </td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div>
        </div>`;
}

export function render() {
    const expenses = getExpenses(month, year);
    const fixed = expenses.filter(e => e.type === 'fixed');
    const variable = expenses.filter(e => e.type === 'variable');
    const totalFixed = fixed.reduce((s, e) => s + e.amount, 0);
    const totalVar = variable.reduce((s, e) => s + e.amount, 0);
    const total = totalFixed + totalVar;
    const income = getIncomeTotalForMonth(month, year);
    const pctUsed = income > 0 ? (total / income * 100) : 0;
    const { expenseTarget } = getSettings();

    container.innerHTML = `
        <div class="section-header">
            <div style="display:flex;align-items:center;gap:12px">
                <h2>Gastos Mensais</h2>
                <button class="btn btn-primary btn-sm" id="exp-add">+ Novo Gasto</button>
                <button class="btn btn-secondary btn-sm" id="exp-import">📥 Importar Extrato</button>
            </div>
            <div class="month-nav">
                <button id="exp-prev">‹</button>
                <span>${MONTHS[month-1]} ${year}</span>
                <button id="exp-next">›</button>
            </div>
        </div>

        <div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
            <div class="card summary-card"><div class="icon-box blue">📌</div><div class="info"><div class="label">Fixos</div><div class="value">${fmt(totalFixed)}</div></div></div>
            <div class="card summary-card"><div class="icon-box amber">🔄</div><div class="info"><div class="label">Variáveis</div><div class="value">${fmt(totalVar)}</div></div></div>
            <div class="card summary-card"><div class="icon-box red">💸</div><div class="info"><div class="label">Total</div><div class="value">${fmt(total)}</div></div></div>
            <div class="card summary-card"><div class="icon-box ${pctUsed>80?'red':pctUsed>50?'amber':'green'}">📊</div><div class="info"><div class="label">% da Receita</div><div class="value">${income>0?pctUsed.toFixed(1)+'%':'—'}</div></div></div>
        </div>

        ${income > 0 ? `<div class="card" style="padding:16px 20px;margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:.85rem"><span style="color:var(--t3)">Orçamento utilizado</span><span style="font-weight:600">${pctUsed.toFixed(1)}%</span></div>
            <div class="progress-bar"><div class="fill" style="width:${Math.min(pctUsed,100)}%;background:${pctUsed>80?'var(--red)':pctUsed>50?'var(--amber)':'var(--green)'}"></div></div>
        </div>` : ''}

        ${expenseTarget > 0 ? `<div class="card goal-card">
            <div class="goal-header"><span style="color:var(--t3)">🎯 Meta de Gastos: ${fmt(expenseTarget)}</span>
            <span style="font-weight:600;color:${total > expenseTarget ? 'var(--red)' : 'var(--green)'}">${fmt(total)} / ${fmt(expenseTarget)}</span></div>
            <div class="progress-bar"><div class="fill" style="width:${Math.min(total/expenseTarget*100,100)}%;background:${total>expenseTarget?'var(--red)':total>expenseTarget*0.8?'var(--amber)':'var(--green)'}"></div></div>
            <div class="goal-msg" style="color:${total > expenseTarget ? 'var(--red)' : 'var(--green)'}">${total > expenseTarget ? `⚠️ Acima da meta em ${fmt(total-expenseTarget)}` : `✅ Dentro da meta — resta ${fmt(expenseTarget-total)}`}</div>
        </div>` : ''}

        ${renderTable(fixed, 'Gastos Fixos', '📌')}
        ${renderTable(variable, 'Gastos Variáveis', '🔄')}
    `;

    container.querySelector('#exp-add').onclick = () => showExpenseModal();
    container.querySelector('#exp-import').onclick = () => openImportModal(() => render());
    container.querySelector('#exp-prev').onclick = () => { month--; if(month<1){month=12;year--;} render(); };
    container.querySelector('#exp-next').onclick = () => { month++; if(month>12){month=1;year++;} render(); };

    window.__editExp = id => { const e = getExpenses(month,year).find(x=>x.id===id); if(e) showExpenseModal(e); };
    window.__delExp = async id => { 
        if(confirm('Excluir este gasto?')) { 
            await deleteExpense(id); 
            if(window.__appRefresh) window.__appRefresh(); else render(); 
        } 
    };
}
