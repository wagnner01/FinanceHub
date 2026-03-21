// app.js - Main application entry point
import * as dashboard from './dashboard.js';
import * as income from './income.js';
import * as expenses from './expenses.js';
import * as creditcard from './creditcard.js';
import * as investments from './investments.js';
import * as settings from './settings.js';
import { getSettings } from './storage.js';
import { initAuth } from './auth.js';

const TABS = {
    dashboard: { module: dashboard, title: 'Dashboard', sub: 'Visão geral das suas finanças' },
    income: { module: income, title: 'Receitas', sub: 'Controle de entradas e fontes de renda' },
    expenses: { module: expenses, title: 'Gastos Mensais', sub: 'Controle de gastos fixos e variáveis' },
    creditcard: { module: creditcard, title: 'Cartão de Crédito', sub: 'Gestão de cartões e fatura' },
    investments: { module: investments, title: 'Investimentos', sub: 'Acompanhamento da carteira' },
    settings: { module: settings, title: 'Configurações', sub: 'Tema, categorias e metas financeiras' }
};

let activeTab = 'dashboard';

function switchTab(tabId) {
    if (!TABS[tabId]) return;
    activeTab = tabId;

    // Update nav
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.toggle('active', li.dataset.tab === tabId);
    });

    // Update header
    document.getElementById('page-title').textContent = TABS[tabId].title;
    document.getElementById('page-sub').textContent = TABS[tabId].sub;

    // Switch tab content
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById('tab-' + tabId);
    tabEl.classList.add('active');

    // Render the module
    if (TABS[tabId].module.render) {
        TABS[tabId].module.render();
    }
}

// Function to violently refresh data from remote and redraw current interface
export async function refreshActiveTab() {
    await initializeData();
}

// Para recarregar globalmente os dados na inicialização ou após login
export async function initializeData() {
    const { fetchTransactions, fetchCreditCards } = await import('./storage.js');
    await Promise.all([
        fetchTransactions(),
        fetchCreditCards()
    ]);
    
    // Atualiza a view atual
    if (TABS[activeTab].module.render) {
         TABS[activeTab].module.render();
    }
}

function init() {
    // Expose refresh locally for modal closures
    window.__appRefresh = refreshActiveTab;

    // Apply saved theme
    settings.applyTheme(getSettings().theme);

    // Initialize all modules
    Object.entries(TABS).forEach(([id, { module }]) => {
        module.init(document.getElementById('tab-' + id));
    });

    // Nav click handlers
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => switchTab(li.dataset.tab));
    });

    // Mobile menu toggle
    const toggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));

    // Close sidebar on tab click (mobile)
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => {
            if (window.innerWidth <= 900) sidebar.classList.remove('open');
        });
    });

    // Inicializar Autenticação
    initAuth((user) => {
        if (user) {
            initializeData().then(() => switchTab(activeTab));
        }
    });
}

// Start the app — garante inicialização mesmo se DOMContentLoaded já disparou
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
