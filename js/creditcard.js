// creditcard.js - Credit Card module
import { fmt, fmtDate, uid, curMonth, curYear, MONTHS, getAllExpenseCategories, BRANDS, openModal, cat, brand, drawDonut, drawBar, fmtPct } from './utils.js';
import { getCreditCards, saveCreditCard, deleteCreditCard, getCreditCardTransactions, saveTransaction, saveTransactions, deleteTransaction, deleteTransactions } from './storage.js';

let container, month, year, activeCard = null, subTab = 'transactions', selectedTxns = [];

export function init(el) { container = el; month = curMonth(); year = curYear(); }

function cardModal(card = null) {
    const isEdit = !!card;
    openModal(isEdit ? 'Editar Cartão' : 'Novo Cartão', `
        <div class="form-group"><label>Nome do Cartão</label><input type="text" id="cc-name" value="${card?.name || ''}" placeholder="Ex: Nubank"></div>
        <div class="form-row">
            <div class="form-group"><label>Bandeira</label><select id="cc-brand">${BRANDS.map(b => `<option value="${b.id}" ${b.id === card?.brand ? 'selected' : ''}>${b.name}</option>`).join('')}</select></div>
            <div class="form-group"><label>Limite (R$)</label><input type="number" id="cc-limit" value="${card?.limit || ''}" step="0.01" min="0" placeholder="0.00"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Dia Fechamento</label><input type="number" id="cc-closing" value="${card?.closingDay || ''}" min="1" max="31" placeholder="1-31"></div>
            <div class="form-group"><label>Dia Vencimento</label><input type="number" id="cc-due" value="${card?.dueDay || ''}" min="1" max="31" placeholder="1-31"></div>
        </div>
    `, () => {
        const name = document.getElementById('cc-name').value.trim();
        const limit = parseFloat(document.getElementById('cc-limit').value);
        if (!name) return false;
        saveCreditCard({
            id: card?.id || uid(), name,
            brand: document.getElementById('cc-brand').value,
            limit: limit || 0,
            closingDay: parseInt(document.getElementById('cc-closing').value) || 1,
            dueDay: parseInt(document.getElementById('cc-due').value) || 10
        });
        render();
    });
}

function txnModal(txn = null) {
    const cards = getCreditCards();
    if (!cards.length) { alert('Cadastre um cartão primeiro!'); return; }
    const isEdit = !!txn;
    openModal(isEdit ? 'Editar Compra' : 'Nova Compra', `
        <div class="form-row">
            <div class="form-group"><label>Cartão</label><select id="txn-card">${cards.map(c => `<option value="${c.id}" ${c.id === (txn?.cardId || activeCard) ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
            <div class="form-group"><label>Categoria</label><select id="txn-cat">${CATEGORIES.map(c => `<option value="${c.id}" ${c.id === txn?.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select></div>
        </div>
        <div class="form-group"><label>Descrição</label><input type="text" id="txn-desc" value="${txn?.description || ''}" placeholder="Ex: iFood"></div>
        <div class="form-row">
            <div class="form-group"><label>Valor (R$)</label><input type="number" id="txn-amount" value="${txn?.amount || ''}" step="0.01" min="0" placeholder="0.00"></div>
            <div class="form-group"><label>Parcelas</label><input type="number" id="txn-inst" value="${txn?.installments || 1}" min="1" max="48"></div>
        </div>
        <div class="form-group"><label>Data</label><input type="date" id="txn-date" value="${txn?.date || `${year}-${String(month).padStart(2, '0')}-01`}"></div>
    `, async () => {
        const desc = document.getElementById('txn-desc').value.trim();
        const amount = parseFloat(document.getElementById('txn-amount').value);
        if (!desc || !amount) return false;

        const submitBtn = document.querySelector('.modal-footer .btn-primary');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Salvando...'; }

        const inst = parseInt(document.getElementById('txn-inst').value) || 1;
        const cardId = document.getElementById('txn-card').value;
        const category = document.getElementById('txn-cat').value;
        const date = document.getElementById('txn-date').value;
        
        let success = true;

        if (isEdit) {
            success = await saveTransaction({ ...txn, description: desc, amount, cardId, category, installments: inst, date });
        } else {
            // Create one transaction per installment
            for (let i = 0; i < inst; i++) {
                let m = month + i, y = year;
                while (m > 12) { m -= 12; y++; }
                const ok = await saveTransaction({
                    cardId, description: inst > 1 ? `${desc} (${i + 1}/${inst})` : desc,
                    amount: Math.round(amount / inst * 100) / 100,
                    category, installments: inst, currentInstallment: i + 1,
                    date, month: m, year: y
                });
                if (!ok) success = false;
            }
        }
        
        if (success) {
            document.getElementById('modal-overlay').classList.add('hidden');
            render();
        } else if (submitBtn) {
            submitBtn.disabled = false; submitBtn.textContent = 'Salvar';
        }
        return false; // Prevent automatic close since we handle it manually
    });
}

async function importPdfModal() {
    const cards = getCreditCards();
    if (!cards.length) { alert('Cadastre um cartão primeiro!'); return; }
    
    openModal('Importar Fatura (PDF Inter)', `
        <div class="form-group">
            <label>1. Selecione o Cartão</label>
            <select id="pdf-card">${cards.map(c => `<option value="${c.id}" ${c.id === (activeCard || c.id) ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        </div>
        <div class="form-group">
            <label>2. Mês Base das Compras</label>
            <div style="display:flex;gap:10px">
                <input type="number" id="pdf-month" value="${month}" min="1" max="12" style="width:60px">
                <input type="number" id="pdf-year" value="${year}" min="2000" style="flex:1">
            </div>
        </div>
        <div class="form-group" style="margin-top:15px;">
            <label>3. Fatura em PDF</label>
            <input type="file" id="pdf-file" accept="application/pdf" style="padding:8px; border:1px dashed var(--border); border-radius:8px; width:100%; background:var(--bg2);">
        </div>
        <div id="pdf-preview" style="margin-top:15px; max-height:200px; overflow-y:auto; font-size:0.8rem; background:var(--bg2); padding:10px; border-radius:8px; display:none;"></div>
    `, async () => {
        const preview = document.getElementById('pdf-preview');
        if (preview.dataset.parsed !== 'true') {
            const fileInput = document.getElementById('pdf-file');
            if (!fileInput.files.length) { alert('Selecione um arquivo PDF.'); return false; }
            
            if (typeof pdfjsLib === 'undefined') { alert('A biblioteca PDF.js ainda não foi carregada no sistema.'); return false; }
            const submitBtn = document.querySelector('.modal-footer .btn-primary');
            submitBtn.disabled = true; submitBtn.textContent = 'Processando...';
            
            try {
                const file = fileInput.files[0];
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                
                let extractedText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    
                    content.items.sort((a, b) => {
                        const yDiff = b.transform[5] - a.transform[5];
                        if (Math.abs(yDiff) > 5) return yDiff;
                        return a.transform[4] - b.transform[4];
                    });
                    
                    let lastY = -1;
                    let lineStr = '';
                    content.items.forEach(item => {
                        if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
                            extractedText += lineStr + '\n';
                            lineStr = '';
                        }
                        lineStr += item.str + (item.str.trim() ? ' ' : '');
                        lastY = item.transform[5];
                    });
                    extractedText += lineStr + '\n';
                }
                
                const parsedTxns = [];
                const m = parseInt(document.getElementById('pdf-month').value);
                const y = parseInt(document.getElementById('pdf-year').value);
                
                // --- Funções Auxiliares Estritas Inter ---
                // 1. Função rigorosa de conversão
                function parseInterValue(valorString) {
                    if (!valorString) return 0;
                    let limpo = valorString.toString().replace(/[^\d.,]/g, '');
                    if (limpo.includes(',') && limpo.includes('.')) {
                        limpo = limpo.replace(/\./g, '').replace(',', '.');
                    } else {
                        limpo = limpo.replace(',', '.');
                    }
                    return parseFloat(limpo);
                }

                function cleanInterDescription(desc) {
                    if (!desc) return '';
                    return desc.replace(/\b([A-Za-z])\s+([A-Za-z]+)\b/g, '$1$2').replace(/\s+/g, ' ').trim();
                }

                // 2. A Regex Cirúrgica de Captura de Linha (R$ como âncora inegociável)
                const linhaRegex = /(\d{2}\s+de\s+[a-z]{3}\.?\s+\d{4})(.*?)R\$\s*([\d.,]+)/i;

                // Blacklist de cabeçalhos/rodapés
                const blacklist = ['TOTAL', 'VENCIMENTO', 'PAGAMENTO', 'SALDO', 'PONTOS', 'ENCARGOS', 'IOF'];

                // Mapa de meses PT-BR
                const monthsMap = {
                    'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06',
                    'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12'
                };

                // 3. A Aplicação no loop
                const lines = extractedText.split('\n');
                for (const textoDaLinha of lines) {
                    const upperLine = textoDaLinha.toUpperCase();
                    if (!textoDaLinha.trim()) continue;
                    if (blacklist.some(word => upperLine.includes(word))) continue;
                    if (/^\d{2}\/\d{2}\/\d{4}$/.test(textoDaLinha.trim())) continue;

                    const match = textoDaLinha.match(linhaRegex);
                    if (match) {
                        let dataRaw = match[1].trim();
                        let descricaoRaw = match[2].trim();
                        let valorRaw = match[3].trim();

                        // Log de Auditoria Obrigatório
                        console.log('EXTRAÍDO DO PDF:', { dataRaw, descricaoRaw, valorRaw });

                        // Limpeza profunda: Remove espaços fantasmas e arranca números/códigos do nome da loja
                        let descricaoLimpa = descricaoRaw
                            .replace(/\b([A-Za-z])\s+([A-Za-z]+)\b/g, '$1$2') // Junta espaços fantasmas
                            .replace(/[\d().-]/g, '')                          // Remove números, parênteses e traços
                            .replace(/\s+/g, ' ')                              // Normaliza espaços
                            .trim();

                        // Conversão Blindada
                        let valorFinal = parseInterValue(valorRaw);

                        console.log('PRONTO PARA O BANCO:', { descricaoLimpa, valorFinal });

                        if (isNaN(valorFinal) || valorFinal <= 0) continue;

                        // Conversão de data para ISO
                        try {
                            const cleanDate = dataRaw.toLowerCase().replace(/\./g, '');
                            const parts = cleanDate.split(/\s+de\s+|\s+/);
                            if (parts.length < 3) continue;
                            const day = parts[0].padStart(2, '0');
                            const monthNum = monthsMap[parts[1].substring(0, 3)];
                            if (!monthNum) continue;
                            const isoDate = `${parts[2]}-${monthNum}-${day}`;

                            parsedTxns.push({
                                date: isoDate,
                                description: descricaoLimpa,
                                amount: valorFinal,
                                category: 'outros'
                            });
                        } catch (e) {
                            continue;
                        }
                    }
                }
                
                if (!parsedTxns.length) {
                    alert('Nenhuma compra encontrada ou o formato não é reconhecido no PDF.');
                    submitBtn.disabled = false; submitBtn.textContent = 'Extrair Compras';
                    return false;
                }
                
                preview.style.display = 'block';
                preview.innerHTML = `<b style="display:block;margin-bottom:8px">${parsedTxns.length} compras detectadas:</b>` + parsedTxns.map(t => `
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding:4px 0;">
                        <span>${t.date.split('-').reverse().join('/')} - ${t.description.substring(0,25)}</span>
                        <strong style="color:var(--red)">-${fmt(t.amount)}</strong>
                    </div>
                `).join('');
                
                // Motor de Categorização Inteligente Robusto
                function categorizeTransaction(description) {
                    // Remove TODOS os espaços para comparação imune a ruído
                    const desc = description.toLowerCase().replace(/\s+/g, '');
                    const dictionary = [
                        { cat: 'mercado', kw: ['supermercado', 'super nosso', 'carrefour', 'sams club', 'atacadao', 'abc', 'epa', 'apoio', 'ricoy', 'granel', 'hortifruti'] },
                        { cat: 'alimentacao', kw: ['padaria', 'panificadora', 'paes', 'restaurante', 'burger', 'ifood', 'cappta', 'armazem do peixe', 'montana grill', 'eddie fine', 'pao de queijo', 'lanches', 'pizza', 'meet comercio'] },
                        { cat: 'transporte', kw: ['posto', 'auto center', 'clearcar', 'uber', '99app', 'estacionamento', 'allpark', 'combustivel'] },
                        { cat: 'saude', kw: ['drogaria', 'araujo', 'pague menos', 'drogadavis', 'farmacia', 'medicamentos'] },
                        { cat: 'vestuario', kw: ['privalia', 'enxovais', 'colchoes', 'lojas americanas', 'centauro', 'havanna'] },
                        { cat: 'lazer', kw: ['estripulia', 'kids park', 'diamond mall'] },
                        { cat: 'assinaturas', kw: ['google', 'amazon', 'apple', 'spotify', 'netflix'] }
                    ];

                    for (const entry of dictionary) {
                        // Também remove espaços das keywords antes de comparar
                        if (entry.kw.some(k => desc.includes(k.toLowerCase().replace(/\s+/g, '')))) {
                            return entry.cat;
                        }
                    }
                    return 'outros';
                }

                parsedTxns.forEach(t => {
                    t.category = categorizeTransaction(t.description);
                });
                
                preview.dataset.parsed = 'true';
                window.__parsedPdfTxns = parsedTxns;
                window.__parsedPdfCardId = document.getElementById('pdf-card').value;
                window.__parsedPdfM = m;
                window.__parsedPdfY = y;
                
                submitBtn.disabled = false; submitBtn.textContent = 'Revisar ' + parsedTxns.length + ' Compras';
                return false; 
                
            } catch (e) {
                console.error(e);
                alert('Erro ao ler PDF: Acesso negado, formato corrompido ou layout irreconhecível.\n' + e.message);
                submitBtn.disabled = false; submitBtn.textContent = 'Extrair Compras';
                return false;
            }
        } else {
            // Em vez de salvar direto, joga pra tabela de UI para revisão
            window.__pendingReviewTxns = window.__parsedPdfTxns.map(t => ({
                id: uid(), // id temporario
                cardId: window.__parsedPdfCardId,
                description: t.description,
                amount: t.amount,
                category: t.category,
                installments: 1, currentInstallment: 1,
                date: t.date,
                month: window.__parsedPdfM,
                year: window.__parsedPdfY,
                invoice_period: `${String(window.__parsedPdfM).padStart(2,'0')}/${window.__parsedPdfY}`,
                type: 'despesa',
                isPendingReview: true // flag especial
            }));
            
            subTab = 'transactions';
            document.getElementById('modal-overlay').classList.add('hidden');
            render();
            
            // Auto scroll e aviso
            setTimeout(() => {
                alert('Transações importadas com sucesso! Elas estão marcadas em amarelo para sua revisão. Clique em "Confirmar Fatura" quando estiver tudo certo.');
            }, 100);
        }
    });

    const btn = document.querySelector('.modal-footer .btn-primary');
    if (btn) btn.textContent = 'Extrair Compras';
}

function renderTransactions(txns) {
    let pendingHTML = '';
    const pendingTxns = window.__pendingReviewTxns || [];
    
    if (pendingTxns.length > 0) {
        pendingHTML = `
            <div style="background:var(--amber); color:black; padding:10px 15px; border-radius:8px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center">
                <b style="font-size:0.9rem">Fatura Extraída (${pendingTxns.length} itens)</b>
                <div>
                    <button class="btn btn-sm" style="background:black;color:white;border:none;padding:6px 12px;border-radius:4px" onclick="window.__savePendingTxns()">✅ Confirmar Fatura</button>
                    <button class="btn btn-sm" style="background:transparent;color:black;border:1px solid black;padding:6px 12px;border-radius:4px;margin-left:8px" onclick="window.__cancelPendingTxns()">❌ Cancelar</button>
                </div>
            </div>
            <div class="table-wrap" style="margin-bottom:20px; border:2px dashed var(--amber)"><table>
                <thead><tr style="background:#f59e0b20"><th>(Novo) Descrição</th><th>Categoria</th><th>Data</th><th>Parcela</th><th>Valor</th><th></th></tr></thead>
                <tbody>${pendingTxns.map(t => {
                const c = cat(t.category);
                return `<tr style="background:#f59e0b10">
                        <td style="font-weight:500;color:var(--t1)">${t.description}</td>
                        <td><span class="cat-badge" style="background:${c.color}20;color:${c.color}">${c.icon} ${c.name}</span></td>
                        <td style="font-size:.85rem">${t.date ? fmtDate(t.date) : '-'}</td>
                        <td style="font-size:.85rem">${t.installments > 1 ? `${t.currentInstallment || 1}/${t.installments}` : '-'}</td>
                        <td style="font-weight:600">${fmt(t.amount)}</td>
                        <td class="actions">
                            <button class="del" onclick="window.__delPendingTxn('${t.id}')" title="Excluir da Lista">🗑️</button>
                        </td>
                    </tr>`;
            }).join('')}</tbody>
            </table></div>
        `;
    }

    if (!txns.length && !pendingTxns.length) return '<div class="empty-state"><div class="empty-icon">💳</div><p>Nenhuma compra registrada</p></div>';
    
    const allSelected = txns.length > 0 && txns.every(t => selectedTxns.includes(t.id));

    const savedHTML = txns.length ? `
        <div id="bulk-actions" style="margin-bottom:10px; display:${selectedTxns.length ? 'flex' : 'none'}; align-items:center; gap:10px; background:var(--bg2); padding:10px; border-radius:8px">
            <span style="font-size:0.9rem; color:var(--t2)">${selectedTxns.length} itens selecionados</span>
            <button class="btn btn-sm btn-danger" onclick="window.__deleteSelected()" style="background:#ef4444; color:white; border:none; padding:4px 12px; border-radius:4px; font-size:0.8rem">Excluir Selecionados</button>
        </div>
        <div class="table-wrap"><table>
        <thead><tr>
            <th style="width:40px"><input type="checkbox" id="select-all-txns" ${allSelected ? 'checked' : ''}></th>
            <th>Descrição</th><th>Categoria</th><th>Data</th><th>Parcela</th><th>Valor</th><th></th>
        </tr></thead>
        <tbody>${txns.map(t => {
        const c = cat(t.category);
        const isSelected = selectedTxns.includes(t.id);
        return `<tr class="${isSelected ? 'selected-row' : ''}">
                <td><input type="checkbox" class="txn-checkbox" data-id="${t.id}" ${isSelected ? 'checked' : ''}></td>
                <td style="font-weight:500;color:var(--t1)">${t.description}</td>
                <td><span class="cat-badge" style="background:${c.color}20;color:${c.color}">${c.icon} ${c.name}</span></td>
                <td style="font-size:.85rem">${t.date ? fmtDate(t.date) : '-'}</td>
                <td style="font-size:.85rem">${t.installments > 1 ? `${t.currentInstallment || 1}/${t.installments}` : '-'}</td>
                <td style="font-weight:600">${fmt(t.amount)}</td>
                <td class="actions">
                    <button onclick="window.__editTxn('${t.id}')" title="Editar">✏️</button>
                    <button class="del" onclick="window.__delTxn('${t.id}')" title="Excluir">🗑️</button>
                </td>
            </tr>`;
    }).join('')}</tbody>
    </table></div>` : '';

    return pendingHTML + savedHTML;
}

function renderCategories(txns) {
    const map = {};
    txns.forEach(t => { const c = t.category || 'outros'; map[c] = (map[c] || 0) + t.amount; });
    const total = txns.reduce((s, t) => s + t.amount, 0);
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return '<div class="empty-state"><div class="empty-icon">📊</div><p>Sem dados</p></div>';
    return `
        <div style="display:grid;grid-template-columns:1fr 200px;gap:20px;align-items:start">
            <div>${sorted.map(([id, v]) => {
        const c = cat(id); const pct = total > 0 ? (v / total * 100) : 0;
        return `<div class="list-item">
                    <span style="font-size:1.2rem">${c.icon}</span>
                    <div style="flex:1"><div style="font-weight:500">${c.name}</div>
                    <div class="progress-bar" style="margin-top:4px"><div class="fill" style="width:${pct}%;background:${c.color}"></div></div></div>
                    <div style="text-align:right"><div style="font-weight:600">${fmt(v)}</div><div style="font-size:.75rem;color:var(--t3)">${fmtPct(pct)}</div></div>
                </div>`;
    }).join('')}</div>
            <div><canvas id="cc-cat-donut" style="width:200px;height:200px"></canvas></div>
        </div>`;
}

function renderSummary(txns, cards) {
    const total = txns.reduce((s, t) => s + t.amount, 0);
    const totalLimit = cards.reduce((s, c) => s + c.limit, 0);
    const used = totalLimit > 0 ? (total / totalLimit * 100) : 0;
    return `
        <div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:20px">
            <div class="card summary-card"><div class="icon-box red">💳</div><div class="info"><div class="label">Fatura</div><div class="value">${fmt(total)}</div></div></div>
            <div class="card summary-card"><div class="icon-box blue">📏</div><div class="info"><div class="label">Limite Total</div><div class="value">${fmt(totalLimit)}</div></div></div>
            <div class="card summary-card"><div class="icon-box green">✅</div><div class="info"><div class="label">Disponível</div><div class="value">${fmt(totalLimit - total)}</div></div></div>
            <div class="card summary-card"><div class="icon-box ${used > 80 ? 'red' : used > 50 ? 'amber' : 'teal'}">📊</div><div class="info"><div class="label">Utilização</div><div class="value">${fmtPct(used)}</div></div></div>
        </div>
        <div class="card" style="padding:16px 20px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:.85rem"><span style="color:var(--t3)">Limite utilizado</span><span style="font-weight:600">${fmtPct(used)}</span></div>
            <div class="progress-bar"><div class="fill" style="width:${Math.min(used, 100)}%;background:${used > 80 ? 'var(--red)' : used > 50 ? 'var(--amber)' : 'var(--green)'}"></div></div>
        </div>

        ${cards.length ? `<div style="margin-top:20px"><h3 style="font-size:1rem;font-weight:600;color:var(--t2);margin-bottom:12px">Detalhes por Cartão</h3>
        ${cards.map(c => {
        const ct = txns.filter(t => t.cardId === c.id).reduce((s, t) => s + t.amount, 0);
        const cu = c.limit > 0 ? (ct / c.limit * 100) : 0;
        return `<div class="card" style="padding:16px 20px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                    <span style="font-weight:600">${c.name}</span>
                    <span style="color:var(--t3)">${fmt(ct)} / ${fmt(c.limit)}</span>
                </div>
                <div class="progress-bar"><div class="fill" style="width:${Math.min(cu, 100)}%;background:${cu > 80 ? 'var(--red)' : cu > 50 ? 'var(--amber)' : 'var(--green)'}"></div></div>
            </div>`;
    }).join('')}</div>` : ''}
    `;
}

function renderDiagnostic(txns, prevTxns) {
    const catSums = {}, prevCatSums = {};
    txns.forEach(t => { catSums[t.category || 'outros'] = (catSums[t.category || 'outros'] || 0) + t.amount; });
    prevTxns.forEach(t => { prevCatSums[t.category || 'outros'] = (prevCatSums[t.category || 'outros'] || 0) + t.amount; });
    const total = Object.values(catSums).reduce((s, v) => s + v, 0);
    const prevTotal = Object.values(prevCatSums).reduce((s, v) => s + v, 0);
    const cards = getCreditCards();
    const totalLimit = cards.reduce((s, c) => s + c.limit, 0);
    const utilization = totalLimit > 0 ? (total / totalLimit * 100) : 0;

    const insights = [];
    // Growing categories
    Object.keys(catSums).forEach(c => {
        const cur = catSums[c], prev = prevCatSums[c] || 0;
        if (prev > 0 && cur > prev * 1.2) {
            const growth = ((cur - prev) / prev * 100).toFixed(0);
            insights.push({ type: 'warn', title: `${cat(c).icon} ${cat(c).name} +${growth}%`, text: `Gasto aumentou de ${fmt(prev)} para ${fmt(cur)}. Potencial economia: ${fmt(cur - prev)}` });
        }
    });
    // High concentration
    Object.keys(catSums).forEach(c => {
        const pct = total > 0 ? (catSums[c] / total * 100) : 0;
        if (pct > 30) insights.push({ type: 'info', title: `${cat(c).icon} ${cat(c).name} = ${pct.toFixed(0)}% da fatura`, text: `Esta categoria concentra muitos gastos. Avalie se há espaços para reduzir.` });
    });
    // Overall comparison
    if (prevTotal > 0 && total > prevTotal * 1.1) insights.push({ type: 'danger', title: `Fatura cresceu ${((total - prevTotal) / prevTotal * 100).toFixed(0)}%`, text: `Total de ${fmt(prevTotal)} subiu para ${fmt(total)} em relação ao mês anterior.` });
    else if (prevTotal > 0 && total < prevTotal) insights.push({ type: 'success', title: `Fatura reduziu ${((prevTotal - total) / prevTotal * 100).toFixed(0)}%`, text: `Parabéns! Você economizou ${fmt(prevTotal - total)} em relação ao mês anterior.` });
    // Utilization
    if (utilization > 80) insights.push({ type: 'danger', title: 'Limite crítico', text: `Você está usando ${fmtPct(utilization)} do limite. Considere reduzir gastos no cartão.` });
    else if (utilization > 50) insights.push({ type: 'warn', title: 'Atenção ao limite', text: `${fmtPct(utilization)} do limite utilizado. Monitore para evitar surpresas.` });

    let healthScore = 100;
    if (utilization > 80) healthScore -= 35; else if (utilization > 50) healthScore -= 15;
    if (prevTotal > 0 && total > prevTotal) healthScore -= 15;
    if (insights.filter(i => i.type === 'warn' || i.type === 'danger').length > 2) healthScore -= 10;
    healthScore = Math.max(0, Math.min(100, healthScore));
    const scoreColor = healthScore >= 70 ? 'var(--green)' : healthScore >= 40 ? 'var(--amber)' : 'var(--red)';

    return `
        <div style="display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:start">
            <div class="card health-score">
                <canvas id="cc-health-donut" style="width:120px;height:120px;margin:0 auto 8px;display:block"></canvas>
                <div style="font-weight:700;font-size:1.3rem;color:${scoreColor}">${healthScore}/100</div>
                <div style="font-size:.8rem;color:var(--t3)">Saúde Financeira</div>
            </div>
            <div>
                <h3 style="font-size:1rem;font-weight:600;color:var(--t2);margin-bottom:16px">Diagnóstico & Oportunidades de Economia</h3>
                ${insights.length ? insights.map(i => `
                    <div class="diag-card ${i.type}"><div class="diag-title">${i.title}</div><div class="diag-text">${i.text}</div></div>
                `).join('') : '<div class="diag-card success"><div class="diag-title">✅ Tudo certo!</div><div class="diag-text">Seus gastos estão dentro do esperado. Continue assim!</div></div>'}
            </div>
        </div>`;
}

export function render() {
    const cards = getCreditCards();
    if (activeCard && !cards.find(c => c.id === activeCard)) activeCard = null;
    if (!activeCard && cards.length) activeCard = cards[0].id;
    const txns = getCreditCardTransactions(activeCard, month, year);
    const allTxns = getCreditCardTransactions(null, month, year);
    let pm = month - 1, py = year; if (pm < 1) { pm = 12; py--; }
    const prevTxns = getCreditCardTransactions(activeCard, pm, py);
    const ac = cards.find(c => c.id === activeCard);

    container.innerHTML = `
        <div class="section-header">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <h2>Cartão de Crédito</h2>
                <button class="btn btn-primary btn-sm" id="cc-add-txn">+ Nova Compra</button>
                <button class="btn btn-secondary btn-sm" id="cc-import-pdf" style="gap:5px;display:flex;align-items:center" title="Extrair de Fatura Inter PDF"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> Importar PDF (Inter)</button>
                <button class="btn btn-secondary btn-sm" id="cc-add-card">+ Novo Cartão</button>
                <button class="btn btn-secondary btn-sm" id="cc-export-csv" title="Exportar como CSV" style="gap:5px;display:flex;align-items:center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Exportar CSV
                </button>
            </div>
            <div class="month-nav">
                <button id="cc-prev">‹</button>
                <span>${MONTHS[month - 1]} ${year}</span>
                <button id="cc-next">›</button>
            </div>
        </div>

        ${cards.length ? `
        <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;align-items:start">
            ${cards.map(c => `
                <div class="cc-visual" style="cursor:pointer;max-width:300px;${c.id === activeCard ? 'box-shadow:0 0 0 2px var(--accent)' : ''}" data-card="${c.id}">
                    <div style="display:flex;justify-content:space-between">
                        <div class="cc-brand">${brand(c.brand).name}</div>
                        <div class="actions"><button onclick="event.stopPropagation();window.__editCard('${c.id}')" style="color:var(--t3)">✏️</button><button class="del" onclick="event.stopPropagation();window.__delCard('${c.id}')" style="color:var(--t3)">🗑️</button></div>
                    </div>
                    <div class="cc-number">•••• •••• •••• ••••</div>
                    <div class="cc-bottom"><div><div class="cc-name">${c.name}</div><div class="cc-limit">Limite: ${fmt(c.limit)}</div></div><div style="text-align:right"><div style="font-size:.7rem;color:var(--t3)">Fecha: ${c.closingDay} | Vence: ${c.dueDay}</div></div></div>
                </div>
            `).join('')}
        </div>` : '<div class="empty-state" style="margin-bottom:20px"><div class="empty-icon">💳</div><p>Cadastre seu primeiro cartão</p></div>'}

        <div class="sub-tabs">
            <button class="sub-tab ${subTab === 'transactions' ? 'active' : ''}" data-sub="transactions">Transações</button>
            <button class="sub-tab ${subTab === 'categories' ? 'active' : ''}" data-sub="categories">Categorias</button>
            <button class="sub-tab ${subTab === 'summary' ? 'active' : ''}" data-sub="summary">Resumo</button>
            <button class="sub-tab ${subTab === 'diagnostic' ? 'active' : ''}" data-sub="diagnostic">Diagnóstico</button>
        </div>

        <div class="card" style="padding:20px" id="cc-sub-content">
            ${subTab === 'transactions' ? renderTransactions(txns) :
            subTab === 'categories' ? renderCategories(allTxns) :
                subTab === 'summary' ? renderSummary(allTxns, cards) :
                    renderDiagnostic(allTxns, getCreditCardTransactions(null, pm, py))}
        </div>
    `;

    // Events
    container.querySelector('#cc-add-txn').onclick = () => txnModal();
    const btnPdf = container.querySelector('#cc-import-pdf');
    if(btnPdf) btnPdf.onclick = () => importPdfModal();
    container.querySelector('#cc-add-card').onclick = () => cardModal();
    container.querySelector('#cc-export-csv').onclick = () => {
        const exportTxns = getCreditCardTransactions(activeCard, month, year);
        if (!exportTxns.length) { alert('Nenhuma transação para exportar neste mês.'); return; }
        const ac = cards.find(c => c.id === activeCard);
        const cardName = ac ? ac.name : 'cartao';
        const header = 'Data,Descricao,Categoria,Parcela,Valor';
        const rows = exportTxns.map(t => [
            t.date || '',
            `"${(t.description || '').replace(/"/g, '""')}"`,
            t.category || '',
            t.installments > 1 ? `${t.currentInstallment || 1}/${t.installments}` : '-',
            t.amount.toFixed(2).replace('.', ',')
        ].join(','));
        const csv = [header, ...rows].join('\n');
        const bom = '\uFEFF'; // BOM para o Excel reconhecer UTF-8
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transacoes_${cardName.replace(/\s+/g, '_')}_${MONTHS[month - 1]}_${year}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };
    container.querySelector('#cc-prev').onclick = () => { month--; if (month < 1) { month = 12; year--; } selectedTxns = []; render(); };
    container.querySelector('#cc-next').onclick = () => { month++; if (month > 12) { month = 1; year++; } selectedTxns = []; render(); };
    container.querySelectorAll('.cc-visual').forEach(el => {
        el.addEventListener('click', () => { 
            activeCard = el.dataset.card; 
            selectedTxns = []; // Limpa seleção ao mudar de cartão
            render(); 
        });
    });
    container.querySelectorAll('.sub-tab').forEach(btn => {
        btn.addEventListener('click', () => { subTab = btn.dataset.sub; render(); });
    });

    window.__editCard = id => { const c = cards.find(x => x.id === id); if (c) cardModal(c); };
    window.__delCard = id => { if (confirm('Excluir cartão e todas suas transações?')) { deleteCreditCard(id); activeCard = null; render(); } };
    window.__editTxn = id => { const t = getCreditCardTransactions(null, month, year).find(x => x.id === id); if (t) txnModal(t); };
    window.__delTxn = async id => { 
        if (confirm('Excluir esta compra?')) { 
            const success = await deleteTransaction(id);
            if (success) render(); 
        } 
    };

    // --- Lógica de Seleção Múltipla ---
    const selectAll = container.querySelector('#select-all-txns');
    if (selectAll) {
        selectAll.onchange = () => {
            if (selectAll.checked) {
                selectedTxns = txns.map(t => t.id);
            } else {
                selectedTxns = [];
            }
            render();
        };
    }

    container.querySelectorAll('.txn-checkbox').forEach(cb => {
        cb.onchange = () => {
            const id = cb.dataset.id;
            if (cb.checked) {
                if (!selectedTxns.includes(id)) selectedTxns.push(id);
            } else {
                selectedTxns = selectedTxns.filter(x => x !== id);
            }
            render();
        };
    });

    window.__deleteSelected = async () => {
        if (!selectedTxns.length) return;
        if (confirm(`Excluir as ${selectedTxns.length} compras selecionadas?`)) {
            const success = await deleteTransactions(selectedTxns);
            if (success) {
                selectedTxns = [];
                render();
            }
        }
    };

    // Novas Ações de PDF
    window.__delPendingTxn = id => {
        if (!window.__pendingReviewTxns) return;
        window.__pendingReviewTxns = window.__pendingReviewTxns.filter(t => t.id !== id);
        if (window.__pendingReviewTxns.length === 0) {
            window.__pendingReviewTxns = null;
        }
        render();
    };
    window.__cancelPendingTxns = () => {
        if (confirm('Cancelar a importação atual? Todas as compras lidas do PDF serão perdidas.')) {
            window.__pendingReviewTxns = null;
            render();
        }
    };
    window.__savePendingTxns = async () => {
        if (!window.__pendingReviewTxns || !window.__pendingReviewTxns.length) return;
        const btn = event.target;
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        const success = await saveTransactions(window.__pendingReviewTxns);
        
        if (success) {
            window.__pendingReviewTxns = null;
            render();
            alert('Fatura confirmada e importada com sucesso!');
        } else {
            alert('Falha ao salvar uma ou mais transações da fatura.');
            btn.disabled = false;
            btn.textContent = 'Tentar Novamente';
        }
    };

    // Draw donut charts after render
    setTimeout(() => {
        const catDonut = document.getElementById('cc-cat-donut');
        if (catDonut) {
            const map = {};
            allTxns.forEach(t => { map[t.category || 'outros'] = (map[t.category || 'outros'] || 0) + t.amount; });
            const data = Object.entries(map).map(([id, v]) => ({ value: v, color: cat(id).color }));
            drawDonut(catDonut, data, fmt(allTxns.reduce((s, t) => s + t.amount, 0)), 'Total');
        }
        const healthDonut = document.getElementById('cc-health-donut');
        if (healthDonut) {
            const total = allTxns.reduce((s, t) => s + t.amount, 0);
            const totalLimit = cards.reduce((s, c) => s + c.limit, 0);
            const util = totalLimit > 0 ? (total / totalLimit * 100) : 0;
            let score = 100;
            if (util > 80) score -= 35; else if (util > 50) score -= 15;
            score = Math.max(0, Math.min(100, score));
            drawDonut(healthDonut, [{ value: score, color: score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444' }, { value: 100 - score, color: '#1c1f2e' }], score + '', 'Score');
        }
    }, 50);
}
