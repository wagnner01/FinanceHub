import { fmt, fmtDate, uid, curMonth, curYear, MONTHS, openModal, getAllIncomeCategories, incomeCat } from './utils.js';
import { getIncomeEntries, saveIncomeEntry, deleteIncomeEntry, getSettings } from './storage.js';
import { openImportModal } from './import.js';

let container, month, year;

export function init(el) { container = el; month = curMonth(); year = curYear(); }

function incomeModal(entry = null) {
    const isEdit = !!entry;
    openModal(isEdit ? 'Editar Receita' : 'Nova Receita', `
        <div class="form-group">
            <label>Descrição</label>
            <input type="text" id="inc-desc" value="${entry?.description || ''}" placeholder="Ex: Salário Empresa XYZ">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Valor (R$)</label>
                <input type="number" id="inc-amount" value="${entry?.amount || ''}" step="0.01" min="0" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Categoria</label>
                <select id="inc-cat">${getAllIncomeCategories().map(c => `<option value="${c.id}" ${c.id === entry?.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Tipo</label>
                <select id="inc-type">
                    <option value="fixed" ${entry?.type === 'fixed' ? 'selected' : ''}>Fixo (recorrente)</option>
                    <option value="variable" ${entry?.type === 'variable' ? 'selected' : ''}>Variável (pontual)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Data de Recebimento</label>
                <input type="date" id="inc-date" value="${entry?.date || `${year}-${String(month).padStart(2, '0')}-05`}">
            </div>
        </div>
    `, async () => {
        const desc = document.getElementById('inc-desc').value.trim();
        const amount = parseFloat(document.getElementById('inc-amount').value);
        if (!desc || !amount) return false;
        
        let success = await saveIncomeEntry({
            id: entry?.id || uid(),
            description: desc,
            amount,
            category: document.getElementById('inc-cat').value,
            // Mantém original, storage.js vai forçar 'receita' por cima antes de enviar
            type: document.getElementById('inc-type').value,
            date: document.getElementById('inc-date').value,
            month, year
        });
        
        if(success) render();
        return success;
    });
}

function renderTable(items, title, icon) {
    if (!items.length) return `
        <div class="card" style="margin-bottom:20px;padding:20px">
            <h3 style="font-size:1rem;font-weight:600;margin-bottom:8px;color:var(--t2)">${icon} ${title}</h3>
            <div class="empty-state" style="padding:30px"><div class="empty-icon">📋</div><p>Nenhuma receita ${title.toLowerCase()}</p></div>
        </div>`;
    const total = items.reduce((s, e) => s + e.amount, 0);
    return `
        <div class="card" style="margin-bottom:20px;padding:0;overflow:hidden">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
                <h3 style="font-size:1rem;font-weight:600;color:var(--t2)">${icon} ${title}</h3>
                <span style="font-weight:700;color:var(--green)">${fmt(total)}</span>
            </div>
            <div class="table-wrap"><table>
                <thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th><th></th></tr></thead>
                <tbody>${items.map(e => {
                    const c = incomeCat(e.category);
                    return `<tr>
                        <td style="font-weight:500;color:var(--t1)">${e.description}</td>
                        <td><span class="cat-badge" style="background:${c.color}20;color:${c.color}">${c.icon} ${c.name}</span></td>
                        <td>${e.date ? fmtDate(e.date) : '-'}</td>
                        <td style="font-weight:600;color:var(--green)">${fmt(e.amount)}</td>
                        <td class="actions">
                            <button onclick="window.__editInc('${e.id}')" title="Editar">✏️</button>
                            <button class="del" onclick="window.__delInc('${e.id}')" title="Excluir">🗑️</button>
                        </td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div>
        </div>`;
}

export function render() {
    const entries = getIncomeEntries(month, year);
    const fixed = entries.filter(e => e.type === 'fixed');
    const variable = entries.filter(e => e.type === 'variable');
    const totalFixed = fixed.reduce((s, e) => s + e.amount, 0);
    const totalVar = variable.reduce((s, e) => s + e.amount, 0);
    const total = totalFixed + totalVar;
    const { incomeTarget } = getSettings();

    // Category breakdown
    const catMap = {};
    entries.forEach(e => { catMap[e.category || 'outros'] = (catMap[e.category || 'outros'] || 0) + e.amount; });
    const catSorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

    container.innerHTML = `
        <div class="section-header">
            <div style="display:flex;align-items:center;gap:12px">
                <h2>Receitas</h2>
                <button class="btn btn-primary btn-sm" id="inc-add">+ Nova Receita</button>
                <button class="btn btn-secondary btn-sm" id="inc-import">📥 Importar Extrato</button>
            </div>
            <div class="month-nav">
                <button id="inc-prev">‹</button>
                <span>${MONTHS[month - 1]} ${year}</span>
                <button id="inc-next">›</button>
            </div>
        </div>

        <div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
            <div class="card summary-card">
                <div class="icon-box green">💼</div>
                <div class="info"><div class="label">Receita Fixa</div><div class="value" style="color:var(--green)">${fmt(totalFixed)}</div></div>
            </div>
            <div class="card summary-card">
                <div class="icon-box teal">💡</div>
                <div class="info"><div class="label">Receita Variável</div><div class="value" style="color:var(--accent)">${fmt(totalVar)}</div></div>
            </div>
            <div class="card summary-card">
                <div class="icon-box green">💰</div>
                <div class="info"><div class="label">Total do Mês</div><div class="value" style="color:var(--green)">${fmt(total)}</div></div>
            </div>
            <div class="card summary-card">
                <div class="icon-box blue">📊</div>
                <div class="info"><div class="label">Fontes</div><div class="value">${entries.length}</div></div>
            </div>
        </div>

        ${incomeTarget > 0 ? `<div class="card goal-card">
            <div class="goal-header"><span style="color:var(--t3)">🎯 Meta de Receita: ${fmt(incomeTarget)}</span>
            <span style="font-weight:600;color:${total >= incomeTarget ? 'var(--green)' : 'var(--amber)'}">${fmt(total)} / ${fmt(incomeTarget)}</span></div>
            <div class="progress-bar"><div class="fill" style="width:${Math.min(total / incomeTarget * 100, 100)}%;background:${total >= incomeTarget ? 'var(--green)' : total >= incomeTarget * 0.5 ? 'var(--amber)' : 'var(--red)'}"></div></div>
            <div class="goal-msg" style="color:${total >= incomeTarget ? 'var(--green)' : 'var(--amber)'}">${total >= incomeTarget ? '🎉 Meta atingida! Parabéns!' : `📈 Faltam ${fmt(incomeTarget - total)} para atingir sua meta`}</div>
        </div>` : ''}

        ${catSorted.length ? `
        <div class="card" style="padding:20px;margin-bottom:20px">
            <h3 style="font-size:1rem;font-weight:600;margin-bottom:16px;color:var(--t2)">Receitas por Categoria</h3>
            ${catSorted.map(([id, v]) => {
                const c = incomeCat(id);
                const pct = total > 0 ? (v / total * 100) : 0;
                return `<div class="list-item" style="padding:10px 0">
                    <span style="font-size:1.1rem">${c.icon}</span>
                    <div style="flex:1"><div style="font-weight:500;font-size:.9rem">${c.name}</div>
                    <div class="progress-bar" style="margin-top:4px"><div class="fill" style="width:${pct}%;background:${c.color}"></div></div></div>
                    <div style="text-align:right"><div style="font-weight:600;font-size:.9rem;color:var(--green)">${fmt(v)}</div><div style="font-size:.72rem;color:var(--t3)">${pct.toFixed(1)}%</div></div>
                </div>`;
            }).join('')}
        </div>` : ''}

        ${renderTable(fixed, 'Receitas Fixas', '📌')}
        ${renderTable(variable, 'Receitas Variáveis', '🔄')}
    `;

    container.querySelector('#inc-add').onclick = () => incomeModal();
    container.querySelector('#inc-import').onclick = () => openImportModal(() => render());
    container.querySelector('#inc-prev').onclick = () => { month--; if (month < 1) { month = 12; year--; } render(); };
    container.querySelector('#inc-next').onclick = () => { month++; if (month > 12) { month = 1; year++; } render(); };

    window.__editInc = id => { const e = entries.find(x => x.id === id); if (e) incomeModal(e); };
    window.__delInc = async id => { if (confirm('Excluir esta receita?')) { await deleteIncomeEntry(id); render(); } };
}
