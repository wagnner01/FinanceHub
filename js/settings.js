// settings.js - Settings/Configuration module
import { uid, CATEGORIES, INCOME_CATEGORIES, openModal, fmt } from './utils.js';
import { getSettings, saveSettings } from './storage.js';

let container;
const PALETTE = ['#ef4444','#f59e0b','#22c55e','#3b82f6','#6366f1','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#a855f7','#0ea5e9','#d946ef','#f43f5e','#78716c'];

export function init(el) { container = el; }

export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme || 'dark');
}

function addCategoryModal(type) {
    const isExp = type === 'expense';
    openModal(`Nova Categoria de ${isExp ? 'Gasto' : 'Receita'}`, `
        <div class="form-group"><label>Nome</label><input type="text" id="cat-name" placeholder="Ex: ${isExp?'Pet':'Dividendos'}"></div>
        <div class="form-group"><label>Ícone (emoji)</label><input type="text" id="cat-icon" placeholder="Ex: ${isExp?'🐾':'💎'}" maxlength="4"></div>
        <div class="form-group"><label>Cor</label>
            <div class="color-grid" id="cat-colors">${PALETTE.map((c,i) => `<div class="color-swatch ${i===0?'selected':''}" data-color="${c}" style="background:${c}"></div>`).join('')}</div>
        </div>
    `, () => {
        const name = document.getElementById('cat-name').value.trim();
        if (!name) return false;
        const icon = document.getElementById('cat-icon').value.trim() || '📁';
        const sel = document.querySelector('.color-swatch.selected');
        const color = sel ? sel.dataset.color : PALETTE[0];
        const s = getSettings();
        const key = isExp ? 'customExpenseCategories' : 'customIncomeCategories';
        s[key].push({ id: 'custom_' + uid(), name, icon, color });
        saveSettings(s);
        render();
    });
    setTimeout(() => {
        document.querySelectorAll('.color-swatch').forEach(sw => {
            sw.onclick = () => { document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected')); sw.classList.add('selected'); };
        });
    }, 50);
}

function catListHTML(cats, type, custom) {
    return cats.map(c => `
        <div class="cat-list-item">
            <span class="cat-badge" style="background:${c.color}20;color:${c.color}">${c.icon} ${c.name}</span>
            ${custom ? `<button class="btn-icon" style="width:24px;height:24px;font-size:.7rem" onclick="window.__delSettCat('${type}','${c.id}')">🗑️</button>` : ''}
        </div>
    `).join('');
}

export function render() {
    const s = getSettings();
    const isLight = s.theme === 'light';

    container.innerHTML = `
        <div class="section-header"><h2>⚙️ Configurações</h2></div>

        <div class="card" style="padding:24px;margin-bottom:20px">
            <h3 style="font-size:1rem;font-weight:600;color:var(--t2);margin-bottom:16px">🎨 Aparência</h3>
            <div style="display:flex;align-items:center;justify-content:space-between">
                <div><div style="font-weight:500">Tema</div><div style="font-size:.82rem;color:var(--t3)">Escolha entre tema escuro ou claro</div></div>
                <div class="theme-toggle">
                    <button class="theme-btn ${!isLight?'active':''}" data-th="dark">🌙 Escuro</button>
                    <button class="theme-btn ${isLight?'active':''}" data-th="light">☀️ Claro</button>
                </div>
            </div>
        </div>

        <div class="card" style="padding:24px;margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <h3 style="font-size:1rem;font-weight:600;color:var(--t2)">📂 Categorias de Gastos</h3>
                <button class="btn btn-primary btn-sm" id="add-exp-cat">+ Nova Categoria</button>
            </div>
            <div style="font-size:.8rem;color:var(--t3);margin-bottom:10px">Padrão</div>
            <div class="cat-list">${catListHTML(CATEGORIES, 'expense', false)}</div>
            ${s.customExpenseCategories.length ? `
                <div style="font-size:.8rem;color:var(--t3);margin:16px 0 10px;border-top:1px solid var(--border);padding-top:12px">Personalizadas</div>
                <div class="cat-list">${catListHTML(s.customExpenseCategories, 'expense', true)}</div>
            ` : ''}
        </div>

        <div class="card" style="padding:24px;margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <h3 style="font-size:1rem;font-weight:600;color:var(--t2)">💰 Categorias de Receita</h3>
                <button class="btn btn-primary btn-sm" id="add-inc-cat">+ Nova Categoria</button>
            </div>
            <div style="font-size:.8rem;color:var(--t3);margin-bottom:10px">Padrão</div>
            <div class="cat-list">${catListHTML(INCOME_CATEGORIES, 'income', false)}</div>
            ${s.customIncomeCategories.length ? `
                <div style="font-size:.8rem;color:var(--t3);margin:16px 0 10px;border-top:1px solid var(--border);padding-top:12px">Personalizadas</div>
                <div class="cat-list">${catListHTML(s.customIncomeCategories, 'income', true)}</div>
            ` : ''}
        </div>

        <div class="card" style="padding:24px;margin-bottom:20px">
            <h3 style="font-size:1rem;font-weight:600;color:var(--t2);margin-bottom:16px">🎯 Metas Financeiras</h3>
            <div class="form-row">
                <div class="form-group">
                    <label>🔻 Meta de Redução de Gastos (limite mensal)</label>
                    <input type="number" id="exp-target" value="${s.expenseTarget||''}" step="0.01" min="0" placeholder="Ex: 3000.00">
                    <div style="font-size:.75rem;color:var(--t3);margin-top:4px">Exibido como meta na aba Gastos Mensais</div>
                </div>
                <div class="form-group">
                    <label>🔺 Meta de Aumento de Receita (objetivo mensal)</label>
                    <input type="number" id="inc-target" value="${s.incomeTarget||''}" step="0.01" min="0" placeholder="Ex: 10000.00">
                    <div style="font-size:.75rem;color:var(--t3);margin-top:4px">Exibido como meta na aba Receitas</div>
                </div>
            </div>
            <button class="btn btn-primary" id="save-goals" style="margin-top:8px">💾 Salvar Metas</button>
        </div>
    `;

    // Theme toggle
    container.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            s.theme = btn.dataset.th;
            saveSettings(s);
            applyTheme(s.theme);
            render();
        });
    });

    container.querySelector('#add-exp-cat').onclick = () => addCategoryModal('expense');
    container.querySelector('#add-inc-cat').onclick = () => addCategoryModal('income');

    container.querySelector('#save-goals').onclick = () => {
        const ns = getSettings();
        ns.expenseTarget = parseFloat(document.getElementById('exp-target').value) || 0;
        ns.incomeTarget = parseFloat(document.getElementById('inc-target').value) || 0;
        saveSettings(ns);
        const btn = container.querySelector('#save-goals');
        btn.textContent = '✅ Salvo!';
        setTimeout(() => btn.textContent = '💾 Salvar Metas', 2000);
    };

    window.__delSettCat = (type, id) => {
        if (!confirm('Excluir esta categoria?')) return;
        const st = getSettings();
        const key = type === 'expense' ? 'customExpenseCategories' : 'customIncomeCategories';
        st[key] = st[key].filter(c => c.id !== id);
        saveSettings(st);
        render();
    };
}
