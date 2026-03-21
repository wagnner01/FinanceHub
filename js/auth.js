// js/auth.js - Integração com Supabase Auth

const SUPABASE_URL = 'https://kmdptivpnokdltaazgrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttZHB0aXZwbm9rZGx0YWF6Z3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MjI3NzYsImV4cCI6MjA4OTA5ODc3Nn0.z-5kefwVeG-L78NOjP7L6ffZRSMftzg0g1YGJoMmPwA';

export const supabase = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

let isLoginMode = true;

export async function initAuth(onAuthChange) {
    // Todos os getElementById ficam AQUI, após o DOM estar pronto
    const authOverlay    = document.getElementById('auth-overlay');
    const authForm       = document.getElementById('auth-form');
    const authEmail      = document.getElementById('auth-email');
    const authPassword   = document.getElementById('auth-password');
    const authError      = document.getElementById('auth-error');
    const authTitle      = document.getElementById('auth-title');
    const authSubmitBtn  = document.getElementById('auth-submit-btn');
    const authToggleLink = document.getElementById('auth-toggle-link');
    const authToggleText = document.getElementById('auth-toggle-text');
    const authForgotLink = document.getElementById('auth-forgot-link');
    const authForgotWrap = document.getElementById('auth-forgot-wrap');
    const logoutBtn      = document.getElementById('logout-btn');

    if (!supabase) {
        if (authError) {
            authError.style.display = 'block';
            authError.textContent = 'Supabase JS não carregado. Verifique o CDN no index.html.';
        }
        return;
    }

    // --- Helpers de feedback visual ---
    function showError(msg, isSuccess = false) {
        if (!authError) return;
        authError.style.display = 'block';
        authError.textContent = msg;
        if (isSuccess) {
            authError.style.borderColor = 'rgba(34,197,94,.2)';
            authError.style.backgroundColor = 'rgba(34,197,94,.06)';
            authError.style.color = 'var(--green)';
        } else {
            authError.style.borderColor = '';
            authError.style.backgroundColor = '';
            authError.style.color = '';
        }
    }

    function hideError() {
        if (authError) authError.style.display = 'none';
    }

    // --- Alternar Login / Cadastro ---
    if (authToggleLink) {
        authToggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;

            if (isLoginMode) {
                authTitle.textContent      = 'Acessar Conta';
                authSubmitBtn.textContent  = 'Entrar';
                authToggleText.textContent = 'Não tem conta?';
                authToggleLink.textContent = 'Cadastrar';
                if (authForgotWrap) authForgotWrap.style.display = 'block';
            } else {
                authTitle.textContent      = 'Criar Conta';
                authSubmitBtn.textContent  = 'Cadastrar';
                authToggleText.textContent = 'Já tem conta?';
                authToggleLink.textContent = 'Fazer Login';
                if (authForgotWrap) authForgotWrap.style.display = 'none';
            }
            hideError();
        });
    }

    // --- Esqueci minha senha ---
    if (authForgotLink) {
        authForgotLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = authEmail ? authEmail.value.trim() : '';
            if (!email) {
                showError('Digite seu e-mail acima antes de redefinir a senha.');
                if (authEmail) authEmail.focus();
                return;
            }
            authForgotLink.textContent = 'Enviando...';
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.href
            });
            if (error) {
                showError('Não foi possível enviar o e-mail: ' + error.message);
            } else {
                showError('✅ E-mail de redefinição enviado! Verifique sua caixa de entrada.', true);
            }
            authForgotLink.textContent = 'Esqueci minha senha';
        });
    }

    // --- Submit (Login / Cadastro) ---
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();

            const email    = authEmail ? authEmail.value.trim() : '';
            const password = authPassword ? authPassword.value : '';

            if (authSubmitBtn) {
                authSubmitBtn.disabled = true;
                authSubmitBtn.textContent = 'Aguarde...';
            }

            try {
                if (isLoginMode) {
                    const { error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                } else {
                    const { data, error } = await supabase.auth.signUp({ email, password });
                    if (error) throw error;
                    if (data.user && data.session === null) {
                        showError('Verifique seu e-mail para confirmar o cadastro.', true);
                        if (authSubmitBtn) {
                            authSubmitBtn.disabled = false;
                            authSubmitBtn.textContent = 'Cadastrar';
                        }
                        return;
                    }
                }
            } catch (err) {
                let msg = err.message || 'Erro desconhecido.';
                if (msg.includes('Invalid login credentials')) msg = 'E-mail ou senha incorretos.';
                else if (msg.includes('User already registered'))  msg = 'Este e-mail já está cadastrado.';
                else if (msg.includes('Password should be'))       msg = 'A senha deve ter pelo menos 6 caracteres.';
                else if (msg.includes('Email not confirmed'))      msg = 'Confirme seu e-mail antes de entrar.';
                showError(msg);
            } finally {
                if (authSubmitBtn && authError && authError.style.color !== 'var(--green)') {
                    authSubmitBtn.disabled = false;
                    authSubmitBtn.textContent = isLoginMode ? 'Entrar' : 'Cadastrar';
                }
            }
        });
    }

    // --- Logout ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            logoutBtn.disabled = true;
            logoutBtn.textContent = 'Saindo...';
            await supabase.auth.signOut();
            logoutBtn.disabled = false;
            logoutBtn.textContent = 'Sair';
        });
    }

    // --- Listener de sessão (ativa/desativa a tela de login) ---
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            if (authOverlay) authOverlay.classList.add('hidden');
            if (logoutBtn)   logoutBtn.style.display = 'block';

            const avatar = document.getElementById('avatar');
            if (avatar && session.user.email) {
                avatar.textContent = session.user.email[0].toUpperCase();
                avatar.title = session.user.email;
            }

            onAuthChange(session.user);
        } else {
            if (authOverlay)  authOverlay.classList.remove('hidden');
            if (logoutBtn)    logoutBtn.style.display = 'none';
            if (authEmail)    authEmail.value = '';
            if (authPassword) authPassword.value = '';
            if (authSubmitBtn) {
                authSubmitBtn.disabled = false;
                authSubmitBtn.textContent = isLoginMode ? 'Entrar' : 'Cadastrar';
            }
            hideError();
            onAuthChange(null);
        }
    });
}

export async function getCurrentUser() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session ? session.user : null;
}
