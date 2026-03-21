// import.js - Bank statement import module with reconciliation + dynamic categorization
import { uid, fmt, fmtDate, MONTHS, getAllExpenseCategories, getAllIncomeCategories, cat, incomeCat, buildGroupedCategoryOptions } from './utils.js';
import { saveExpense, saveIncomeEntry, getExpenses, getIncomeEntries,
         getCategorizationRules, saveCategorizationRulesBatch,
         getIncomeTotalForMonth } from './storage.js';

// ═══════════════════════════════════════════════════════════════════
// ── RECONCILIATION: SHA-256 Hash + Registry ──────────────────────
// ═══════════════════════════════════════════════════════════════════

const HASH_REGISTRY_KEY = 'fh_import_hashes';

async function generateTransactionHash(dateStr, amount, description) {
    const normalizedDate = String(dateStr).trim();
    const normalizedAmount = Number(amount).toFixed(2);
    const normalizedDesc = String(description).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');

    const payload = `${normalizedDate}|${normalizedAmount}|${normalizedDesc}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);

    try {
        if (globalThis.crypto?.subtle) {
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
        throw new Error('SubtleCrypto not available');
    } catch {
        let h1 = 0x811c9dc5 >>> 0;
        let h2 = 0x811c9dc5 >>> 0;
        for (let i = 0; i < data.length; i++) {
            h1 = Math.imul(h1 ^ data[i], 0x01000193) >>> 0;
            h2 = Math.imul(h2 ^ data[data.length - 1 - i], 0x01000193) >>> 0;
        }
        return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
    }
}

class HashRegistry {
    constructor() {
        this._set = new Set();
        this._load();
    }
    _load() {
        try {
            const raw = localStorage.getItem(HASH_REGISTRY_KEY);
            if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) arr.forEach(h => this._set.add(h)); }
        } catch (err) { console.warn('[HashRegistry] Load failed:', err); }
        try {
            [...getIncomeEntries(), ...getExpenses()].forEach(e => { if (e.hash) this._set.add(e.hash); });
        } catch (err) { console.warn('[HashRegistry] Scan failed:', err); }
    }
    _save() {
        try { localStorage.setItem(HASH_REGISTRY_KEY, JSON.stringify([...this._set])); }
        catch (err) { console.error('[HashRegistry] Save failed:', err); }
    }
    has(hash) { return this._set.has(hash); }
    add(hash) {
        if (this._set.has(hash)) return false;
        this._set.add(hash); this._save(); return true;
    }
    get size() { return this._set.size; }
}

const hashRegistry = new HashRegistry();

// ═══════════════════════════════════════════════════════════════════
// ── DYNAMIC CATEGORIZATION ENGINE ────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Normalizes text for keyword matching:
 * lowercase → strip diacritics → collapse whitespace
 */
function normalizeText(str) {
    return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Categorizes a transaction by reading rules from storage.
 * Rules are checked in order: user rules have implicit priority
 * over default rules because they are appended at the end of the array
 * and we return the LAST match (most specific / most recent).
 *
 * @returns {{ type: 'income'|'expense'|'skip', category: string|null, matchedRule: boolean }}
 */
function categorizeTransaction(historico, descricao, valor) {
    const text = normalizeText(`${historico} ${descricao}`);
    let rules;
    try {
        rules = getCategorizationRules();
    } catch (err) {
        console.error('[Categorize] Failed to load rules:', err);
        rules = [];
    }

    // Separate by scope for correct matching
    const skipRules = rules.filter(r => r.scope === 'skip');
    const scopeRules = valor > 0
        ? rules.filter(r => r.scope === 'income')
        : rules.filter(r => r.scope === 'expense');

    // Check skip rules first
    for (const rule of skipRules) {
        const kw = normalizeText(rule.keyword);
        if (kw && text.includes(kw)) {
            return { type: 'skip', category: null, matchedRule: true };
        }
    }

    // Check scope-specific rules (last match wins → user rules override defaults)
    let bestMatch = null;
    for (const rule of scopeRules) {
        const kw = normalizeText(rule.keyword);
        if (kw && text.includes(kw)) {
            bestMatch = rule;
        }
    }

    if (bestMatch) {
        return {
            type: valor > 0 ? 'income' : 'expense',
            category: bestMatch.categoryId,
            matchedRule: true,
        };
    }

    // No rule matched → "outros"
    return {
        type: valor > 0 ? 'income' : 'expense',
        category: 'outros',
        matchedRule: false,
    };
}

/**
 * Extracts the "main keyword" from a transaction description.
 * Used as the suggested keyword when the user creates a new rule.
 * Strategy: pick the longest meaningful word (≥3 chars), ignoring
 * common noise words and city names.
 */
function extractMainKeyword(descricao, historico) {
    const text = descricao || historico || '';
    const noise = new Set(['bra','belo','horizont','sao','paulo','rio','janeiro','ltda',
        'eireli','sa','me','epp','cnpj','cpf','pix','enviado','recebido','compra',
        'debito','credito','pagamento','efetuado','processado','adyen','por','para',
        'com','que','nao','uma','dos','das','del','les','the','and']);

    const words = normalizeText(text).split(/\s+/)
        .filter(w => w.length >= 3 && !noise.has(w) && !/^\d+$/.test(w));

    // Prefer multi-word phrases from the original (first 2-3 significant words)
    if (words.length >= 2) {
        return words.slice(0, 2).join(' ');
    }
    return words[0] || text.trim().substring(0, 20).toLowerCase();
}

// ── Parse Excel file ──────────────────────────────────────────────
async function parseExtrato(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

                let headerIdx = -1;
                for (let i = 0; i < Math.min(rows.length, 10); i++) {
                    const row = rows[i];
                    if (row && row[0] && String(row[0]).toLowerCase().includes('data')) {
                        headerIdx = i; break;
                    }
                }
                if (headerIdx < 0) headerIdx = 5;

                const transactions = [];
                const hashPromises = [];
                let lastValidSaldo = null; // Saldo column from last valid row

                for (let i = headerIdx + 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || !row[0] || row[0] === null || row[0] === undefined) continue;

                    let dateStr = row[0];
                    let date;
                    if (dateStr instanceof Date) {
                        date = dateStr;
                    } else {
                        dateStr = String(dateStr).trim();
                        if (dateStr.includes('/')) {
                            const parts = dateStr.split('/');
                            date = new Date(parts[2], parts[1] - 1, parts[0]);
                        } else if (dateStr.includes('-')) {
                            date = new Date(dateStr + 'T12:00:00');
                        } else { continue; }
                    }
                    if (isNaN(date.getTime())) continue;

                    const historico = String(row[1] || '').trim();
                    const descricao = String(row[2] || '').trim();
                    let valor = row[3];
                    if (typeof valor === 'string') valor = parseFloat(valor.replace(/[^\d.,-]/g, '').replace(',', '.'));
                    if (typeof valor !== 'number' || isNaN(valor)) continue;

                    // Capture Saldo column (index 4) if present
                    let saldo = row[4];
                    if (saldo !== undefined && saldo !== null && saldo !== '') {
                        if (typeof saldo === 'string') saldo = parseFloat(saldo.replace(/[^\d.,-]/g, '').replace(',', '.'));
                        if (typeof saldo === 'number' && !isNaN(saldo)) lastValidSaldo = saldo;
                    }

                    const { type, category, matchedRule } = categorizeTransaction(historico, descricao, valor);
                    const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

                    const txn = {
                        id: uid(),
                        date,
                        dateStr: isoDate,
                        month: date.getMonth() + 1,
                        year: date.getFullYear(),
                        historico,
                        descricao,
                        valor: Math.abs(valor),
                        valorOriginal: valor,
                        type,
                        category,
                        selected: type !== 'skip',
                        hash: null,
                        duplicate: false,
                        matchedRule,              // did a rule match?
                        suggestedKeyword: null,   // will be set for unmatched
                        createRule: false,         // user toggle: create rule on import
                    };

                    // For unmatched items, pre-compute a suggested keyword
                    if (!matchedRule && type !== 'skip') {
                        txn.suggestedKeyword = extractMainKeyword(descricao, historico);
                    }

                    transactions.push(txn);

                    const hashDesc = descricao || historico;
                    hashPromises.push(
                        generateTransactionHash(isoDate, valor, hashDesc)
                            .then(h => { txn.hash = h; })
                            .catch(err => {
                                console.error('[Import] Hash failed for row', i, err);
                                txn.hash = `fallback-${isoDate}-${valor}-${hashDesc.length}`;
                            })
                    );
                }

                await Promise.all(hashPromises);

                const seenInBatch = new Set();
                for (const txn of transactions) {
                    if (hashRegistry.has(txn.hash) || seenInBatch.has(txn.hash)) {
                        txn.duplicate = true;
                        txn.selected = false;
                    }
                    seenInBatch.add(txn.hash);
                }

                resolve({ transactions, bankFinalBalance: lastValidSaldo });
                return;
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
        reader.readAsArrayBuffer(file);
    });
}

// ── Import Modal ──────────────────────────────────────────────────
let parsedItems = [];
let bankFinalBalance = null;  // from the Saldo column of the extrato
let systemBaseBalance = 0;     // system balance at parse-time (before import)

function renderPreviewTable() {
    const selected = parsedItems.filter(t => t.selected && !t.duplicate);
    const dupes = parsedItems.filter(t => t.duplicate);
    const incomes = selected.filter(t => t.type === 'income');
    const expenses = selected.filter(t => t.type === 'expense');
    const totalInc = incomes.reduce((s, t) => s + t.valor, 0);
    const totalExp = expenses.reduce((s, t) => s + t.valor, 0);
    const newRulesCount = parsedItems.filter(t => t.createRule).length;

    const expCats = getAllExpenseCategories();
    const incCats = getAllIncomeCategories();

    // ── Balance Audit ──
    const projectedBalance = systemBaseBalance + totalInc - totalExp;
    const hasBankBalance = bankFinalBalance !== null;
    const balanceDivergence = hasBankBalance ? Math.abs(projectedBalance - bankFinalBalance) : 0;
    const hasAuditAlert = hasBankBalance && balanceDivergence > 0.01; // tolerance: 1 centavo

    return `
        ${hasAuditAlert ? `<div class="audit-alert audit-alert-danger">
            <div class="audit-alert-icon">🚨</div>
            <div class="audit-alert-body">
                <strong>Furo contábil detectado</strong>
                <div class="audit-alert-detail">
                    O saldo final do banco <strong>${fmt(bankFinalBalance)}</strong> diverge do
                    saldo projetado do sistema <strong>${fmt(projectedBalance)}</strong>.
                    Diferença: <strong>${fmt(balanceDivergence)}</strong>
                </div>
            </div>
        </div>` : ''}
        ${hasBankBalance && !hasAuditAlert ? `<div class="audit-alert audit-alert-ok">
            <div class="audit-alert-icon">✅</div>
            <div class="audit-alert-body">
                <strong>Saldo verificado</strong>
                <div class="audit-alert-detail">
                    Saldo bancário ${fmt(bankFinalBalance)} confere com o projetado pelo sistema.
                </div>
            </div>
        </div>` : ''}
        <div class="import-summary">
            <div class="import-stat green">
                <span class="import-stat-icon">📈</span>
                <div><div class="import-stat-value">${incomes.length}</div><div class="import-stat-label">Receitas</div></div>
                <span class="import-stat-total">${fmt(totalInc)}</span>
            </div>
            <div class="import-stat red">
                <span class="import-stat-icon">📉</span>
                <div><div class="import-stat-value">${expenses.length}</div><div class="import-stat-label">Gastos</div></div>
                <span class="import-stat-total">${fmt(totalExp)}</span>
            </div>
            <div class="import-stat blue">
                <span class="import-stat-icon">📊</span>
                <div><div class="import-stat-value">${selected.length}</div><div class="import-stat-label">Selecionados</div></div>
                <span class="import-stat-total">${fmt(totalInc - totalExp)}</span>
            </div>
            ${dupes.length > 0 ? `<div class="import-stat amber">
                <span class="import-stat-icon">🔁</span>
                <div><div class="import-stat-value">${dupes.length}</div><div class="import-stat-label">Duplicados</div></div>
                <span class="import-stat-total">Ignorados</span>
            </div>` : ''}
        </div>
        ${newRulesCount > 0 ? `<div class="import-rules-banner">
            <span>🧠</span> <strong>${newRulesCount}</strong> nova${newRulesCount > 1 ? 's' : ''} regra${newRulesCount > 1 ? 's' : ''} será${newRulesCount > 1 ? 'ão' : ''} criada${newRulesCount > 1 ? 's' : ''} ao importar
        </div>` : ''}
        <div class="import-table-wrap">
            <table class="import-table">
                <thead>
                    <tr>
                        <th><input type="checkbox" id="import-select-all" ${parsedItems.every(t => t.selected) ? 'checked' : ''}></th>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Tipo</th>
                        <th>Categoria</th>
                        <th>Valor</th>
                    </tr>
                </thead>
                <tbody>
                    ${parsedItems.map((t, i) => {
                        const isInc = t.type === 'income';
                        const isSkip = t.type === 'skip';
                        const isDup = t.duplicate;
                        const cats = isInc ? incCats : expCats;
                        const rowClass = isDup ? 'row-duplicate' : (!t.selected ? 'row-unselected' : '') + (isSkip ? ' row-skip' : '');

                        // Show "create rule" UI when: not matched, not skip, not dup, has a keyword
                        const showLearn = !t.matchedRule && !isDup && t.type !== 'skip' && t.suggestedKeyword;

                        return `<tr class="${rowClass}">
                            <td><input type="checkbox" data-idx="${i}" class="import-check" ${t.selected ? 'checked' : ''} ${isDup ? 'disabled' : ''}></td>
                            <td class="import-date">${t.date.toLocaleDateString('pt-BR')}</td>
                            <td class="import-desc">
                                <div class="import-desc-main">${t.descricao || t.historico}${isDup ? ' <span class="dup-badge">DUPLICADO</span>' : ''}</div>
                                <div class="import-desc-sub">${t.historico}</div>
                                ${showLearn ? `<label class="learn-rule-label" title="Criar regra automática para esta palavra-chave">
                                    <input type="checkbox" data-idx="${i}" class="learn-rule-check" ${t.createRule ? 'checked' : ''}>
                                    <span class="learn-rule-text">Criar regra para "<strong>${t.suggestedKeyword}</strong>"</span>
                                </label>` : ''}
                            </td>
                            <td>
                                <select data-idx="${i}" class="import-type-select" ${isDup ? 'disabled' : ''}>
                                    <option value="income" ${t.type === 'income' ? 'selected' : ''}>📈 Receita</option>
                                    <option value="expense" ${t.type === 'expense' ? 'selected' : ''}>📉 Gasto</option>
                                    <option value="skip" ${t.type === 'skip' ? 'selected' : ''}>⏭️ Ignorar</option>
                                </select>
                            </td>
                            <td>
                                <select data-idx="${i}" class="import-cat-select" ${isDup ? 'disabled' : ''}>
                                    ${isInc
                                        ? cats.map(c => `<option value="${c.id}" ${c.id === t.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')
                                        : buildGroupedCategoryOptions(t.category)
                                    }
                                </select>
                            </td>
                            <td class="import-valor ${isInc ? 'val-green' : 'val-red'}">${isInc ? '+' : '-'}${fmt(t.valor)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

export function openImportModal(onDone) {
    const overlay = document.getElementById('modal-overlay');
    const mc = document.getElementById('modal-container');
    parsedItems = [];

    mc.innerHTML = `
        <div class="modal-header">
            <h3>📥 Importar Extrato Bancário</h3>
            <button class="modal-close" id="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body import-modal-body">
            <div class="import-upload-area" id="import-dropzone">
                <div class="import-upload-icon">📂</div>
                <p class="import-upload-title">Arraste seu extrato aqui</p>
                <p class="import-upload-sub">ou clique para selecionar (.xlsx, .xls, .csv)</p>
                <input type="file" id="import-file" accept=".xlsx,.xls,.csv" style="display:none">
            </div>
            <div id="import-preview" style="display:none"></div>
            <div id="import-loading" style="display:none" class="import-loading">
                <div class="import-spinner"></div>
                <p>Processando extrato...</p>
            </div>
        </div>
        <div class="modal-footer" id="import-footer" style="display:none">
            <button class="btn btn-secondary" id="import-cancel">Cancelar</button>
            <button class="btn btn-primary" id="import-confirm">
                <span>✅ Importar Selecionados</span>
            </button>
        </div>
    `;

    overlay.classList.remove('hidden');
    mc.classList.add('import-modal-wide');

    const closeModal = () => {
        overlay.classList.add('hidden');
        mc.classList.remove('import-modal-wide');
    };

    mc.querySelector('#modal-close-btn').onclick = closeModal;
    overlay.onclick = e => { if (e.target === overlay) closeModal(); };

    const fileInput = mc.querySelector('#import-file');
    const dropzone = mc.querySelector('#import-dropzone');
    const preview = mc.querySelector('#import-preview');
    const loading = mc.querySelector('#import-loading');
    const footer = mc.querySelector('#import-footer');

    dropzone.onclick = () => fileInput.click();
    dropzone.ondragover = e => { e.preventDefault(); dropzone.classList.add('drag-over'); };
    dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
    dropzone.ondrop = e => { e.preventDefault(); dropzone.classList.remove('drag-over'); processFile(e.dataTransfer.files[0]); };

    fileInput.onchange = () => { if (fileInput.files[0]) processFile(fileInput.files[0]); };

    async function processFile(file) {
        dropzone.style.display = 'none';
        loading.style.display = 'flex';
        try {
            const result = await parseExtrato(file);
            parsedItems = result.transactions;
            bankFinalBalance = result.bankFinalBalance;

            // Capture system's current balance for audit projection
            // System balance = all income - all expenses across all months
            try {
                const allInc = getIncomeEntries().reduce((s, e) => s + (e.amount || 0), 0);
                const allExp = getExpenses().reduce((s, e) => s + (e.amount || 0), 0);
                systemBaseBalance = allInc - allExp;
            } catch (err) {
                console.warn('[Import] Could not compute system balance:', err);
                systemBaseBalance = 0;
            }

            loading.style.display = 'none';
            preview.style.display = 'block';
            footer.style.display = 'flex';
            refreshPreview();
        } catch (err) {
            loading.style.display = 'none';
            dropzone.style.display = 'flex';
            alert('Erro ao processar arquivo: ' + err.message);
        }
    }

    function refreshPreview() {
        preview.innerHTML = renderPreviewTable();
        bindPreviewEvents();
    }

    function bindPreviewEvents() {
        const selectAll = preview.querySelector('#import-select-all');
        if (selectAll) {
            selectAll.onchange = () => {
                parsedItems.forEach(t => { if (!t.duplicate) t.selected = selectAll.checked; });
                refreshPreview();
            };
        }

        preview.querySelectorAll('.import-check').forEach(cb => {
            cb.onchange = () => {
                parsedItems[+cb.dataset.idx].selected = cb.checked;
                refreshPreview();
            };
        });

        preview.querySelectorAll('.import-type-select').forEach(sel => {
            sel.onchange = () => {
                const idx = +sel.dataset.idx;
                const item = parsedItems[idx];
                item.type = sel.value;
                if (sel.value === 'skip') {
                    item.selected = false;
                    item.category = null;
                    item.createRule = false;
                } else {
                    item.selected = true;
                    item.category = 'outros';
                    item.matchedRule = false;
                    item.suggestedKeyword = extractMainKeyword(item.descricao, item.historico);
                }
                refreshPreview();
            };
        });

        // Category selects — when user manually picks a category on an unmatched item,
        // show the "create rule" checkbox
        preview.querySelectorAll('.import-cat-select').forEach(sel => {
            sel.onchange = () => {
                const idx = +sel.dataset.idx;
                const item = parsedItems[idx];
                item.category = sel.value;
                // If user changes category from 'outros' to something specific, auto-suggest rule
                if (!item.matchedRule && sel.value !== 'outros') {
                    item.suggestedKeyword = item.suggestedKeyword || extractMainKeyword(item.descricao, item.historico);
                }
                refreshPreview();
            };
        });

        // "Create rule" checkboxes
        preview.querySelectorAll('.learn-rule-check').forEach(cb => {
            cb.onchange = () => {
                parsedItems[+cb.dataset.idx].createRule = cb.checked;
                refreshPreview();
            };
        });
    }

    mc.querySelector('#import-cancel').onclick = closeModal;

    // ── Confirm import with reconciliation + rule learning ──
    mc.querySelector('#import-confirm').onclick = () => {
        const candidates = parsedItems.filter(t => t.selected && t.type !== 'skip' && !t.duplicate);
        if (!candidates.length) { alert('Nenhuma transação selecionada!'); return; }

        let incCount = 0, expCount = 0, skipCount = 0, rulesCreated = 0;

        // Phase 1: Collect new rules from user selections
        const newRules = [];
        const seenKeywords = new Set();
        for (const t of parsedItems) {
            if (t.createRule && t.suggestedKeyword && t.category && t.category !== 'outros') {
                const kw = normalizeText(t.suggestedKeyword);
                if (!seenKeywords.has(kw)) {
                    seenKeywords.add(kw);
                    newRules.push({
                        id: `user_${uid()}`,
                        keyword: kw,
                        categoryId: t.category,
                        scope: t.type === 'income' ? 'income' : 'expense',
                        source: 'user',
                    });
                }
            }
        }

        // Phase 2: Save new rules (batch)
        if (newRules.length > 0) {
            try {
                saveCategorizationRulesBatch(newRules);
                rulesCreated = newRules.length;
            } catch (err) {
                console.error('[Import] Failed to save new categorization rules:', err);
            }
        }

        // Phase 3: Save transactions with reconciliation guard
        for (const t of candidates) {
            try {
                if (t.hash && !hashRegistry.add(t.hash)) {
                    skipCount++;
                    continue;
                }

                const entry = {
                    id: uid(),
                    description: t.descricao || t.historico,
                    amount: t.valor,
                    category: t.category || 'outros',
                    type: 'variable',
                    date: t.dateStr,
                    month: t.month,
                    year: t.year,
                    imported: true,
                    hash: t.hash,
                };

                if (t.type === 'income') {
                    saveIncomeEntry(entry);
                    incCount++;
                } else {
                    saveExpense(entry);
                    expCount++;
                }
            } catch (err) {
                console.error('[Import] Save failed:', t.descricao || t.historico, err);
                skipCount++;
            }
        }

        closeModal();
        if (onDone) onDone();

        showImportToast(incCount, expCount, skipCount, rulesCreated);
    };
}

function showImportToast(incCount, expCount, skipCount = 0, rulesCreated = 0) {
    const toast = document.createElement('div');
    toast.className = 'import-toast';
    const parts = [];
    if (incCount > 0) parts.push(`📈 ${incCount} receita${incCount > 1 ? 's' : ''}`);
    if (expCount > 0) parts.push(`📉 ${expCount} gasto${expCount > 1 ? 's' : ''}`);
    if (skipCount > 0) parts.push(`⏭️ ${skipCount} ignorado${skipCount > 1 ? 's' : ''}`);
    if (rulesCreated > 0) parts.push(`🧠 ${rulesCreated} regra${rulesCreated > 1 ? 's' : ''} criada${rulesCreated > 1 ? 's' : ''}`);
    toast.innerHTML = `
        <div class="import-toast-icon">✅</div>
        <div>
            <strong>Importação concluída!</strong>
            <div style="font-size:.85rem;opacity:.8;margin-top:2px">
                ${parts.join(' · ')}
            </div>
        </div>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}
