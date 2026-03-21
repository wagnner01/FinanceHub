// storage.js - Data persistence layer using localStorage (Migrating to Supabase)
import { supabase } from './auth.js';
const KEYS = {
    EXPENSES: 'fh_expenses',
    CARDS: 'fh_credit_cards',
    TRANSACTIONS: 'fh_transactions',
    INVESTMENTS: 'fh_investments',
    INCOME: 'fh_income',
    SETTINGS: 'fh_settings',
    CAT_RULES: 'fh_categorization_rules'
};

function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function load(key, fallback = []) {
    try {
        const d = localStorage.getItem(key);
        return d ? JSON.parse(d) : fallback;
    } catch { return fallback; }
}

// --- Expenses ---
export function getExpenses(month, year) {
    const all = getAllTransactions().filter(t => (t.type === 'despesa' || t.type === 'expense' || t.type === 'fixed' || t.type === 'variable') && !t.cardId);
    if (month && year) return all.filter(e => e.month === month && e.year === year);
    return all;
}

export async function saveExpense(exp) {
    exp.type = 'despesa'; // Força o tipo como despesa para unificar com o BD
    return await saveTransaction(exp);
}

export async function deleteExpense(id) {
    return await deleteTransaction(id);
}

// --- Credit Cards ---
let _creditCards = [];

export async function fetchCreditCards() {
    try {
        const { data, error } = await supabase.from('credit_cards').select('*');
        if (error) throw error;
        // Mapeia snake_case do banco para camelCase da UI
        _creditCards = (data || []).map(c => ({
            ...c,
            limit: c.credit_limit ?? c.limit ?? 0,
            closingDay: c.closing_day ?? c.closingDay ?? 1,
            dueDay: c.due_day ?? c.dueDay ?? 10
        }));
        return _creditCards;
    } catch (e) {
        console.error('Erro ao buscar cartões:', e.message);
        return [];
    }
}

export function getCreditCards() { return _creditCards; }

export async function saveCreditCard(card) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");

        const payload = { 
            user_id: user.id,
            name: card.name,
            brand: card.brand,
            // Enviamos as duas versões para garantir compatibilidade com o schema existente
            credit_limit: card.limit,
            limit: card.limit,
            closing_day: card.closingDay,
            closingDay: card.closingDay,
            due_day: card.dueDay,
            dueDay: card.dueDay
        };
        let res;
        
        if (card.id && String(card.id).length > 30) {
            res = await supabase.from('credit_cards').update(payload).eq('id', card.id);
        } else {
            delete payload.id; // Permite que o Supabase gere o UUID
            res = await supabase.from('credit_cards').insert([payload]);
        }
        
        if (res.error) throw new Error(res.error.message);
        await fetchCreditCards();
        return true;
    } catch (e) {
        console.error('Erro ao salvar cartão:', e);
        alert(e.message);
        return false;
    }
}

export async function deleteCreditCard(id) {
    try {
        const { error } = await supabase.from('credit_cards').delete().eq('id', id);
        if (error) throw new Error(error.message);
        await fetchCreditCards();
        return true;
    } catch (e) {
        console.error('Erro ao excluir cartão:', e);
        alert(e.message);
        return false;
    }
}

// --- Transactions (Supabase) ---
// Memória local para cache, permitindo chamadas síncronas que a UI espera
let _transactions = [];

// Função que busca dados do Supabase
export async function fetchTransactions() {
    try {
        const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false });
        if (error) { throw error; }
        // Adaptação dos campos caso seu BD seja diferente do camelCase do JS
        _transactions = (data || []).map(t => {
            const dateObj = t.date ? new Date(t.date + 'T12:00:00') : new Date();
            return {
                id: t.id,
                user_id: t.user_id,
                cardId: t.cardId || t.card_id || null,
                month: dateObj.getMonth() + 1, // Recuperado a partir da string pura de data do BD
                year: dateObj.getFullYear(),
                amount: t.amount,
                description: t.description,
                category: t.category,
                type: t.type, // FUNDAMENTAL: A UI precisa disso pra filtrar despesa vs receita!
                installments: t.totalInstallments || t.total_installments || t.installments || 1,
                currentInstallment: t.currentInstallment || t.current_installment || 1,
                installmentId: t.installmentId || t.installment_id || null,
                date: t.date,
                invoice_period: t.invoice_period || null
            });
        });
        return _transactions;
    } catch (e) {
        console.error('Erro ao buscar transações:', e.message);
        return [];
    }
}

// Leitura síncrona usando o cache — filtra por invoice_period se disponível
export function getCreditCardTransactions(cardId, month, year) {
    return _transactions.filter(t => {
        if (t.cardId == null) return false;
        if (cardId && t.cardId !== cardId) return false;
        // Se a transação tem invoice_period, usamos esse campo como referência de fatura
        if (t.invoice_period) {
            const expectedPeriod = `${String(month).padStart(2,'0')}/${year}`;
            return !month || t.invoice_period === expectedPeriod;
        }
        // Fallback para transações antigas sem invoice_period
        return (!month || t.month === month) && (!year || t.year === year);
    });
}

export function getAllTransactions() { return _transactions; }

export async function saveTransaction(txn) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");

        // 1. Sanitização do amount (dinheiro)
        let cleanAmount = String(txn.amount).replace('R$', '').trim();
        cleanAmount = cleanAmount.replace(/\./g, '').replace(',', '.');
        const finalAmount = Number(cleanAmount);

        // 2. Sanitização do type
        const finalType = String(txn.type || 'despesa').toLowerCase();

        // 3. Payload Estrito e explícito
        const sanitizedPayload = {
            user_id: user.id,
            amount: finalAmount,
            date: txn.date,
            description: txn.description,
            type: finalType,
            category: txn.category,
            cardId: txn.cardId || null,
            currentInstallment: txn.currentInstallment || null,
            totalInstallments: txn.totalInstallments || null,
            installmentId: txn.installmentId || null
        };

        // 4. Auditoria antes de enviar
        console.log('DADOS ENVIADOS (STRICT):', sanitizedPayload);

        let res;
        if (txn.id && String(txn.id).length > 20) { 
             res = await supabase.from('transactions').update(sanitizedPayload).eq('id', txn.id);
        } else {
             res = await supabase.from('transactions').insert([sanitizedPayload]);
        }

        if (res.error) {
            throw new Error(res.error.message);
        }
        
        // Atualiza cache
        await fetchTransactions();
        return true;
    } catch (e) {
        // 4. Captura Inplacável e Exibição do Erro
        console.error('ERRO SUPABASE:', e);
        alert(e.message);
        return false;
    }
}

export async function saveTransactions(txns) {
    try {
        if (!txns || !txns.length) return true;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");

        const payloads = txns.map(txn => {
            // Se amount já é número (float vindo do parseInterValue), usa direto.
            // Se por acaso vier como string (ex: "R$ 431,08"), converte com segurança.
            let finalAmount;
            if (typeof txn.amount === 'number' && !isNaN(txn.amount)) {
                finalAmount = txn.amount;
            } else {
                let str = String(txn.amount).replace(/[^\d.,]/g, '');
                if (str.includes(',') && str.includes('.')) {
                    str = str.replace(/\./g, '').replace(',', '.');
                } else {
                    str = str.replace(',', '.');
                }
                finalAmount = parseFloat(str);
            }

            return {
                user_id: user.id,
                amount: finalAmount,
                date: txn.date,
                description: txn.description,
                type: String(txn.type || 'despesa').toLowerCase(),
                category: txn.category,
                cardId: txn.cardId || null,
                currentInstallment: txn.currentInstallment || null,
                totalInstallments: txn.totalInstallments || txn.installments || null,
                installmentId: txn.installmentId || null,
                invoice_period: txn.invoice_period || null
            };
        });

        const { error } = await supabase.from('transactions').insert(payloads);
        if (error) throw error;

        await fetchTransactions();
        return true;
    } catch (e) {
        console.error('ERRO BULK INSERT:', e);
        alert(e.message);
        return false;
    }
}

export async function deleteTransaction(id) {
    try {
        const { error } = await supabase.from('transactions').delete().eq('id', id);
        if (error) throw error;
        
        // Atualiza cache
        await fetchTransactions();
        return true;
    } catch (e) {
        console.error('Erro ao excluir transação:', e);
        alert('Erro ao excluir no banco de dados: ' + e.message);
        return false;
    }
}

export async function deleteTransactions(ids) {
    try {
        if (!ids || !ids.length) return true;
        const { error } = await supabase.from('transactions').delete().in('id', ids);
        if (error) throw error;
        
        await fetchTransactions();
        return true;
    } catch (e) {
        console.error('Erro ao excluir transações em massa:', e);
        alert('Erro ao excluir no banco de dados: ' + e.message);
        return false;
    }
}

// --- Investments ---
export function getInvestments() { return load(KEYS.INVESTMENTS); }
export function saveInvestment(inv) {
    const all = load(KEYS.INVESTMENTS);
    const i = all.findIndex(x => x.id === inv.id);
    i >= 0 ? all[i] = inv : all.push(inv);
    save(KEYS.INVESTMENTS, all);
}
export function deleteInvestment(id) {
    save(KEYS.INVESTMENTS, load(KEYS.INVESTMENTS).filter(i => i.id !== id));
}

// --- Income Entries ---
export function getIncomeEntries(month, year) {
    const all = getAllTransactions().filter(t => t.type === 'receita' || t.type === 'income');
    if (month && year) return all.filter(e => e.month === month && e.year === year);
    return all;
}

export function getIncomeTotalForMonth(month, year) {
    return getIncomeEntries(month, year).reduce((s, e) => s + e.amount, 0);
}

export async function saveIncomeEntry(entry) {
    entry.type = 'receita'; // Força o tipo como receita para unificar com o BD
    return await saveTransaction(entry);
}

export async function deleteIncomeEntry(id) {
    return await deleteTransaction(id);
}

// --- Settings ---
const DEFAULT_SETTINGS = { theme:'dark', customExpenseCategories:[], customIncomeCategories:[], expenseTarget:0, incomeTarget:0 };
export function getSettings() {
    const s = load(KEYS.SETTINGS, null);
    return s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS };
}
export function saveSettings(settings) { save(KEYS.SETTINGS, settings); }

// ═══════════════════════════════════════════════════════════════════
// --- Categorization Rules ---
// Each rule: { id, keyword, categoryId, scope, source }
//   scope:  'expense' | 'income' | 'skip'
//   source: 'default' | 'user'
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_RULES = [
    // Expense rules
    { keyword:'padaria', categoryId:'alimentacao', scope:'expense' },
    { keyword:'pao', categoryId:'alimentacao', scope:'expense' },
    { keyword:'hangar dos paes', categoryId:'alimentacao', scope:'expense' },
    { keyword:'brunodecastro', categoryId:'alimentacao', scope:'expense' },
    { keyword:'restaurante', categoryId:'alimentacao', scope:'expense' },
    { keyword:'lanchonete', categoryId:'alimentacao', scope:'expense' },
    { keyword:'gennaro', categoryId:'alimentacao', scope:'expense' },
    { keyword:'spiga', categoryId:'alimentacao', scope:'expense' },
    { keyword:'novotel', categoryId:'alimentacao', scope:'expense' },
    { keyword:'boutique al', categoryId:'alimentacao', scope:'expense' },
    { keyword:'carrefour', categoryId:'mercado', scope:'expense' },
    { keyword:'sams club', categoryId:'mercado', scope:'expense' },
    { keyword:'supermercado', categoryId:'mercado', scope:'expense' },
    { keyword:'mercado', categoryId:'mercado', scope:'expense' },
    { keyword:'mg belo horizonte supe', categoryId:'mercado', scope:'expense' },
    { keyword:'aluguel', categoryId:'moradia', scope:'expense' },
    { keyword:'fabiano imoveis', categoryId:'moradia', scope:'expense' },
    { keyword:'leroy merlin', categoryId:'moradia', scope:'expense' },
    { keyword:'cemig', categoryId:'contas', scope:'expense' },
    { keyword:'copasa', categoryId:'contas', scope:'expense' },
    { keyword:'energia', categoryId:'contas', scope:'expense' },
    { keyword:'solar geracao', categoryId:'contas', scope:'expense' },
    { keyword:'cooperativa solar', categoryId:'contas', scope:'expense' },
    { keyword:'simples nacional', categoryId:'contas', scope:'expense' },
    { keyword:'imposto', categoryId:'contas', scope:'expense' },
    { keyword:'iof', categoryId:'contas', scope:'expense' },
    { keyword:'cheque especial', categoryId:'contas', scope:'expense' },
    { keyword:'juros', categoryId:'contas', scope:'expense' },
    { keyword:'claro', categoryId:'assinaturas', scope:'expense' },
    { keyword:'internet', categoryId:'assinaturas', scope:'expense' },
    { keyword:'inter pre', categoryId:'assinaturas', scope:'expense' },
    { keyword:'justweb', categoryId:'assinaturas', scope:'expense' },
    { keyword:'jim.com', categoryId:'assinaturas', scope:'expense' },
    { keyword:'ibmec', categoryId:'educacao', scope:'expense' },
    { keyword:'nucleo de aprendizagem', categoryId:'educacao', scope:'expense' },
    { keyword:'escola', categoryId:'educacao', scope:'expense' },
    { keyword:'drogaria', categoryId:'saude', scope:'expense' },
    { keyword:'arauj', categoryId:'saude', scope:'expense' },
    { keyword:'farmacia', categoryId:'saude', scope:'expense' },
    { keyword:'wellhub', categoryId:'saude', scope:'expense' },
    { keyword:'academia', categoryId:'saude', scope:'expense' },
    { keyword:'sul america', categoryId:'saude', scope:'expense' },
    { keyword:'seguro saude', categoryId:'saude', scope:'expense' },
    { keyword:'icatu seguro', categoryId:'saude', scope:'expense' },
    { keyword:'allpark', categoryId:'transporte', scope:'expense' },
    { keyword:'estacionamento', categoryId:'transporte', scope:'expense' },
    { keyword:'inter tag', categoryId:'transporte', scope:'expense' },
    { keyword:'stoppark', categoryId:'transporte', scope:'expense' },
    { keyword:'uber', categoryId:'transporte', scope:'expense' },
    { keyword:'parking', categoryId:'transporte', scope:'expense' },
    { keyword:'zelo', categoryId:'servicos', scope:'expense' },
    { keyword:'europabrinquedos', categoryId:'vestuario', scope:'expense' },
    { keyword:'bijuteria', categoryId:'vestuario', scope:'expense' },
    { keyword:'meraki', categoryId:'vestuario', scope:'expense' },
    { keyword:'marcilenemadalena', categoryId:'vestuario', scope:'expense' },
    { keyword:'projeto planalto', categoryId:'lazer', scope:'expense' },
    // Income rules
    { keyword:'salario', categoryId:'salario', scope:'income' },
    { keyword:'folha', categoryId:'salario', scope:'income' },
    { keyword:'freelance', categoryId:'freelance', scope:'income' },
    { keyword:'prestacao servico', categoryId:'freelance', scope:'income' },
    { keyword:'cdb', categoryId:'investimentos', scope:'income' },
    { keyword:'renda fixa', categoryId:'investimentos', scope:'income' },
    { keyword:'tesouro', categoryId:'investimentos', scope:'income' },
    { keyword:'fundo', categoryId:'investimentos', scope:'income' },
    { keyword:'poupanca', categoryId:'investimentos', scope:'income' },
    { keyword:'resgate fundo', categoryId:'investimentos', scope:'income' },
    { keyword:'vencimento eventos rf', categoryId:'investimentos', scope:'income' },
    { keyword:'cashback', categoryId:'bonus', scope:'income' },
    { keyword:'bonus', categoryId:'bonus', scope:'income' },
    { keyword:'aluguel recebido', categoryId:'aluguel', scope:'income' },
    { keyword:'venda', categoryId:'vendas', scope:'income' },
    // Skip rules (internal transfers)
    { keyword:'aplicacao', categoryId:null, scope:'skip' },
    { keyword:'cdb pos di', categoryId:null, scope:'skip' },
    { keyword:'cdb pre', categoryId:null, scope:'skip' },
];

let _rulesSeeded = false;

/** Get all categorization rules, seeding defaults on first access */
export function getCategorizationRules() {
    let rules = load(KEYS.CAT_RULES);
    if (!rules.length && !_rulesSeeded) {
        _rulesSeeded = true;
        rules = DEFAULT_RULES.map((r, i) => ({
            id: `default_${i}`,
            keyword: r.keyword,
            categoryId: r.categoryId,
            scope: r.scope,
            source: 'default',
        }));
        save(KEYS.CAT_RULES, rules);
    }
    return rules;
}

/** Save a single categorization rule (upsert) */
export function saveCategorizationRule(rule) {
    const all = getCategorizationRules();
    const i = all.findIndex(r => r.id === rule.id);
    i >= 0 ? all[i] = rule : all.push(rule);
    save(KEYS.CAT_RULES, all);
}

/** Save multiple rules at once (batch) */
export function saveCategorizationRulesBatch(newRules) {
    const all = getCategorizationRules();
    for (const rule of newRules) {
        const i = all.findIndex(r => r.id === rule.id);
        i >= 0 ? all[i] = rule : all.push(rule);
    }
    save(KEYS.CAT_RULES, all);
}

/** Delete a categorization rule */
export function deleteCategorizationRule(id) {
    save(KEYS.CAT_RULES, getCategorizationRules().filter(r => r.id !== id));
}
