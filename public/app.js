// =========================================================================
// SISTEMA INTERNO DE ONBOARDING CONTÁBIL — CLIENT ENGINE V3
// =========================================================================

// Interceptor global de requisições para anexar o Colaborador Autenticado (RBAC)
const _originalFetch = window.fetch;
window.fetch = function(url, init = {}) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    init = init || {};
    init.headers = init.headers || {};
    const usuarioId = estado?.usuarioLogado?.id;
    if (usuarioId) {
      if (init.headers instanceof Headers) {
        if (!init.headers.has('x-colaborador-id')) {
          init.headers.set('x-colaborador-id', usuarioId);
        }
      } else {
        if (!init.headers['x-colaborador-id']) {
          init.headers['x-colaborador-id'] = usuarioId;
        }
      }
    }
  }
  return _originalFetch.call(this, url, init);
};

const ETAPAS_TITULOS = {
  0: 'Abertura / Constituição da Empresa',
  1: 'Etapa 01: Formalização da Contratação',
  2: 'Etapa 02: Diagnóstico Inicial',
  3: 'Etapa 03: Coleta de Documentos e Acessos',
  4: 'Etapa 04: Implantação Interna por Departamento',
  5: 'Etapa 05: Alinhamento Operacional com o Cliente',
  6: 'Etapa 06: Acompanhamento das Três Primeiras Competências',
  7: 'Etapa 07: Validação e Encerramento'
};

const STATUS_CORES = {
  'NAO_INICIADO': 'bg-slate-100 text-slate-700 border-slate-200',
  'EM_ANDAMENTO': 'bg-sky-50 text-sky-800 border-sky-300 font-semibold',
  'AGUARDANDO_CLIENTE': 'bg-amber-50 text-amber-800 border-amber-300 font-semibold',
  'AGUARDANDO_TERCEIRO': 'bg-purple-50 text-purple-800 border-purple-300 font-semibold',
  'BLOQUEADO': 'bg-rose-50 text-rose-800 border-rose-300 font-bold',
  'CONCLUIDO': 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold',
  'NAO_APLICAVEL': 'bg-gray-100 text-gray-500 border-gray-300 italic'
};

const STATUS_LABELS = {
  'NAO_INICIADO': 'Não Iniciado',
  'EM_ANDAMENTO': 'Em Andamento',
  'AGUARDANDO_CLIENTE': 'Aguardando Cliente',
  'AGUARDANDO_TERCEIRO': 'Aguardando Terceiro',
  'BLOQUEADO': 'Bloqueado',
  'CONCLUIDO': 'Concluído',
  'NAO_APLICAVEL': 'Não Aplicável'
};

let estado = {
  tela: 'dashboard',
  clienteAtivoId: null,
  clienteDetalhes: null,
  modoVisualizacaoCliente: 'planilha', // 'planilha' | 'kanban-status' | 'kanban-colaborador'
  colaboradores: [],
  usuarioLogado: null,
  colaboradorSelecionadoLoginId: null,
  loginObrigatorio: false,
  config: {}
};

// =========================================================================
// INICIALIZAÇÃO & AUTENTICAÇÃO
// =========================================================================
function extrairTokenColeta() {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenQuery = urlParams.get('coleta');
  const tokenHash = window.location.hash.startsWith('#coleta=') ? window.location.hash.replace('#coleta=', '').trim() : null;
  return tokenQuery || tokenHash;
}

function extrairTokenSenha() {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenQuery = urlParams.get('definir-senha') || urlParams.get('token');
  const hash = window.location.hash;
  let tokenHash = null;
  if (hash.startsWith('#definir-senha=')) {
    tokenHash = hash.replace('#definir-senha=', '').trim();
  } else if (hash.startsWith('#redefinir-senha=')) {
    tokenHash = hash.replace('#redefinir-senha=', '').trim();
  }
  return tokenQuery || tokenHash;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Inicialização do tema (Modo Noturno / Claro)
  inicializarModoNoturno();

  // 1. Se for link de coleta externa (#coleta=TOKEN ou ?coleta=TOKEN), entra direto no formulário público do cliente
  const tokenColeta = extrairTokenColeta();
  if (tokenColeta) {
    iniciarVisualizacaoColetaExterna(tokenColeta);
    return;
  }

  // 2. Se for link de ativação / definição de senha (#definir-senha=TOKEN)
  const tokenSenha = extrairTokenSenha();
  if (tokenSenha) {
    iniciarTelaDefinirSenha(tokenSenha);
    return;
  }

  // 3. Se for acesso ao sistema corporativo, carrega configurações e colaboradores
  await carregarConfiguracoes();
  await carregarColaboradores();
  inicializarUsuarioLogado();
});

// Suporte a troca dinâmica de hash na barra de endereços
window.addEventListener('hashchange', () => {
  const tokenColeta = extrairTokenColeta();
  if (tokenColeta) {
    iniciarVisualizacaoColetaExterna(tokenColeta);
    return;
  }
  const tokenSenha = extrairTokenSenha();
  if (tokenSenha) {
    iniciarTelaDefinirSenha(tokenSenha);
  }
});

async function carregarConfiguracoes() {
  try {
    const res = await fetch('/api/config');
    estado.config = await res.json();
    const el = document.getElementById('sidebar-caminho-base');
    if (el && estado.config.caminho_base_servidor) el.textContent = estado.config.caminho_base_servidor;
    const nomeEl = document.getElementById('pdf-nome-escritorio');
    if (nomeEl && estado.config.nome_escritorio) nomeEl.textContent = estado.config.nome_escritorio;
  } catch (err) {}

  // Verificar conectividade pública (Cloudflare HTTPS)
  try {
    const resInfo = await fetch('/api/info-servidor');
    if (resInfo.ok) {
      estado.infoServidor = await resInfo.json();
      const badge = document.getElementById('badge-online-tunnel');
      if (badge && estado.infoServidor.url_publica) {
        badge.classList.remove('hidden');
        badge.classList.add('inline-flex');
        badge.setAttribute('href', estado.infoServidor.url_publica);
        badge.onclick = (e) => {
          e.preventDefault();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(estado.infoServidor.url_publica).then(() => {
              mostrarToast(`Link online copiado: ${estado.infoServidor.url_publica}`, 'sucesso');
            });
          } else {
            prompt('Link online seguro:', estado.infoServidor.url_publica);
          }
        };
      }
    }
  } catch (err) {}
}

async function carregarColaboradores() {
  try {
    const res = await fetch('/api/colaboradores');
    estado.colaboradores = await res.json();
    atualizarSelectsSquad();
  } catch (err) {}
}

function inicializarUsuarioLogado() {
  const salvo = localStorage.getItem('onboarding_usuario_logado');
  if (salvo) {
    try {
      const parsed = JSON.parse(salvo);
      const colabExistente = (estado.colaboradores || []).find(c => c.id === parsed.id && c.ativo !== 0);
      if (colabExistente) {
        estado.usuarioLogado = colabExistente;
      } else {
        localStorage.removeItem('onboarding_usuario_logado');
        estado.usuarioLogado = null;
      }
    } catch (e) {
      estado.usuarioLogado = null;
    }
  }

  if (estado.usuarioLogado) {
    mostrarAppSistema();
  } else {
    mostrarLandingLogin();
  }
}

// =========================================================================
// CONTROLE DE TELAS: LANDING PAGE VS SISTEMA INTERNO
// =========================================================================
function mostrarLandingLogin() {
  const landing = document.getElementById('tela-landing-login');
  const app = document.getElementById('app-sistema');
  const floatingChat = document.getElementById('btn-floating-chat-ia');
  const telaDefinir = document.getElementById('tela-definir-senha');
  const telaColeta = document.getElementById('tela-coleta-cliente');

  if (app) {
    app.classList.add('hidden');
    app.classList.remove('flex');
  }
  if (telaDefinir) {
    telaDefinir.classList.add('hidden');
  }
  if (telaColeta) {
    telaColeta.classList.add('hidden');
  }
  if (landing) {
    landing.classList.remove('hidden');
  }
  if (floatingChat) {
    floatingChat.classList.add('hidden');
  }

  popularSelectLandingColaboradores();
  lucide.createIcons();
}

function mostrarAppSistema() {
  const landing = document.getElementById('tela-landing-login');
  const app = document.getElementById('app-sistema');
  const floatingChat = document.getElementById('btn-floating-chat-ia');
  const telaDefinir = document.getElementById('tela-definir-senha');
  const telaColeta = document.getElementById('tela-coleta-cliente');

  if (landing) {
    landing.classList.add('hidden');
  }
  if (telaDefinir) {
    telaDefinir.classList.add('hidden');
  }
  if (telaColeta) {
    telaColeta.classList.add('hidden');
  }
  if (app) {
    app.classList.remove('hidden');
    app.classList.add('flex');
  }
  if (floatingChat) {
    floatingChat.classList.remove('hidden');
  }

  atualizarDisplayUsuarioLogado();
  aplicarPermissoesInterface();
  atualizarContadoresSidebar();

  if (estado.usuarioLogado?.perfil === 'TECNICO') {
    navegarPara('meu-painel', estado.usuarioLogado.id);
  } else {
    navegarPara('dashboard');
  }
  lucide.createIcons();
}

function mostrarLandingLogin() {
  const landing = document.getElementById('tela-landing-login');
  const app = document.getElementById('app-sistema');
  const floatingChat = document.getElementById('btn-floating-chat-ia');

  if (app) {
    app.classList.add('hidden');
    app.classList.remove('flex');
  }
  if (landing) {
    landing.classList.remove('hidden');
  }
  if (floatingChat) {
    floatingChat.classList.add('hidden');
  }

  const emailInput = document.getElementById('landing-email-input');
  const senhaInput = document.getElementById('landing-senha-input');
  const erroBox = document.getElementById('landing-login-erro');

  if (erroBox) erroBox.classList.add('hidden');
  if (senhaInput) senhaInput.value = '';

  setTimeout(() => {
    if (emailInput) {
      if (!emailInput.value) emailInput.focus();
      else if (senhaInput) senhaInput.focus();
    }
  }, 100);

  lucide.createIcons();
}

function alternarVisibilidadeSenhaLanding() {
  const senhaInput = document.getElementById('landing-senha-input');
  const icon = document.getElementById('icon-landing-senha-eye');
  if (!senhaInput) return;
  if (senhaInput.type === 'password') {
    senhaInput.type = 'text';
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    senhaInput.type = 'password';
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
}

function alternarVisibilidadeSenhaModal() {
  const senhaInput = document.getElementById('modal-trocar-senha-input');
  const icon = document.getElementById('icon-modal-senha-eye');
  if (!senhaInput) return;
  if (senhaInput.type === 'password') {
    senhaInput.type = 'text';
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    senhaInput.type = 'password';
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
}

function alternarVisibilidadeSenhaGenerica(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    input.type = 'password';
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
}

// -------------------------------------------------------------------------
// MODAL: RECUPERAÇÃO DE SENHA / PRIMEIRO ACESSO
// -------------------------------------------------------------------------
function abrirModalRecuperarSenha() {
  const modal = document.getElementById('modal-recuperar-senha');
  if (modal) {
    modal.classList.remove('hidden');
    const landingEmail = document.getElementById('landing-email-input')?.value?.trim() || document.getElementById('modal-trocar-email-input')?.value?.trim();
    const recInput = document.getElementById('recuperar-email-input');
    if (recInput) {
      if (landingEmail) recInput.value = landingEmail;
      setTimeout(() => recInput.focus(), 100);
    }
    const erro = document.getElementById('recuperar-senha-erro');
    if (erro) erro.classList.add('hidden');
    const suc = document.getElementById('recuperar-senha-sucesso');
    if (suc) suc.classList.add('hidden');
    const boxLink = document.getElementById('box-recuperar-link-direto');
    if (boxLink) boxLink.classList.add('hidden');
  }
  const modalTrocar = document.getElementById('modal-trocar-usuario');
  if (modalTrocar) modalTrocar.classList.add('hidden');
  lucide.createIcons();
}

function fecharModalRecuperarSenha() {
  const modal = document.getElementById('modal-recuperar-senha');
  if (modal) modal.classList.add('hidden');
}

async function solicitarLinkSenha(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('recuperar-email-input');
  const erroBox = document.getElementById('recuperar-senha-erro');
  const erroTxt = document.getElementById('recuperar-senha-erro-txt');
  const sucBox = document.getElementById('recuperar-senha-sucesso');
  const sucTxt = document.getElementById('recuperar-senha-sucesso-txt');
  const linkBox = document.getElementById('box-recuperar-link-direto');
  const linkA = document.getElementById('link-recuperar-direto');
  const btn = document.getElementById('btn-enviar-link-recuperar');

  const email = input?.value?.trim();
  if (!email) {
    if (erroBox) erroBox.classList.remove('hidden');
    if (erroTxt) erroTxt.textContent = 'Por favor, informe seu e-mail corporativo.';
    if (input) input.focus();
    return;
  }

  if (erroBox) erroBox.classList.add('hidden');
  if (sucBox) sucBox.classList.add('hidden');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block"></span> <span>Enviando link...</span>`;
  }

  try {
    const res = await fetch('/api/solicitar-definicao-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Não foi possível gerar o link de confirmação.');
    }

    if (sucBox) sucBox.classList.remove('hidden');
    if (sucTxt) sucTxt.textContent = data.mensagem || 'Link de ativação gerado!';

    if (linkBox && linkA && data.link_direto) {
      linkBox.classList.remove('hidden');
      linkA.href = data.link_direto;
      linkA.textContent = data.link_direto;
    }

    mostrarToast('Link gerado com sucesso!', 'sucesso');
  } catch (err) {
    if (erroBox) erroBox.classList.remove('hidden');
    if (erroTxt) erroTxt.textContent = err.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="send" class="w-4 h-4 text-[#C5A059]"></i> <span>Enviar Link de Ativação</span>`;
      lucide.createIcons();
    }
  }
}

// -------------------------------------------------------------------------
// TELA EXCLUSIVA: DEFINIR / ATIVAR SENHA DE ACESSO
// -------------------------------------------------------------------------
let tokenSenhaAtual = null;

async function iniciarTelaDefinirSenha(token) {
  tokenSenhaAtual = token;
  const telaDefinir = document.getElementById('tela-definir-senha');
  const telaLanding = document.getElementById('tela-landing-login');
  const appSistema = document.getElementById('app-sistema');
  const telaColeta = document.getElementById('tela-coleta-cliente');

  if (telaLanding) telaLanding.classList.add('hidden');
  if (appSistema) appSistema.classList.add('hidden');
  if (telaColeta) telaColeta.classList.add('hidden');
  if (telaDefinir) telaDefinir.classList.remove('hidden');

  const subtitulo = document.getElementById('definir-senha-subtitulo');
  const boxColab = document.getElementById('definir-senha-box-colab');
  const nomeEl = document.getElementById('definir-senha-colab-nome');
  const perfilEl = document.getElementById('definir-senha-colab-perfil');
  const emailEl = document.getElementById('definir-senha-colab-email');
  const form = document.getElementById('form-definir-senha');
  const boxInvalido = document.getElementById('definir-senha-invalido');
  const boxInvalidoTxt = document.getElementById('definir-senha-invalido-txt');
  const erroBox = document.getElementById('definir-senha-erro');
  const sucBox = document.getElementById('definir-senha-sucesso');

  if (erroBox) erroBox.classList.add('hidden');
  if (sucBox) sucBox.classList.add('hidden');

  try {
    const res = await fetch(`/api/validar-token-senha/${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok || !data.valido) {
      throw new Error(data.error || 'Link de definição inválido ou expirado.');
    }

    const c = data.colaborador;
    if (subtitulo) subtitulo.textContent = 'Crie sua nova senha de acesso ao sistema.';
    if (boxColab) boxColab.classList.remove('hidden');
    if (nomeEl) nomeEl.textContent = c.nome;
    if (perfilEl) perfilEl.textContent = c.perfil;
    if (emailEl) emailEl.textContent = `${c.email} • ${c.departamento}`;
    if (form) form.classList.remove('hidden');
    if (boxInvalido) boxInvalido.classList.add('hidden');
  } catch (err) {
    if (form) form.classList.add('hidden');
    if (boxColab) boxColab.classList.add('hidden');
    if (boxInvalido) boxInvalido.classList.remove('hidden');
    if (boxInvalidoTxt) boxInvalidoTxt.textContent = err.message;
  }
  lucide.createIcons();
}

async function salvarNovaSenha(e) {
  if (e) e.preventDefault();
  const senhaInput = document.getElementById('input-definir-nova-senha');
  const confirmaInput = document.getElementById('input-definir-confirma-senha');
  const erroBox = document.getElementById('definir-senha-erro');
  const erroTxt = document.getElementById('definir-senha-erro-txt');
  const sucBox = document.getElementById('definir-senha-sucesso');
  const sucTxt = document.getElementById('definir-senha-sucesso-txt');
  const btn = document.getElementById('btn-salvar-nova-senha');

  const novaSenha = senhaInput?.value?.trim();
  const confirma = confirmaInput?.value?.trim();

  if (!novaSenha || novaSenha.length < 4) {
    if (erroBox) erroBox.classList.remove('hidden');
    if (erroTxt) erroTxt.textContent = 'A senha deve conter no mínimo 4 caracteres.';
    if (senhaInput) senhaInput.focus();
    return;
  }

  if (novaSenha !== confirma) {
    if (erroBox) erroBox.classList.remove('hidden');
    if (erroTxt) erroTxt.textContent = 'As duas senhas digitadas não coincidem.';
    if (confirmaInput) {
      confirmaInput.focus();
      confirmaInput.select();
    }
    return;
  }

  if (erroBox) erroBox.classList.add('hidden');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block"></span> <span>Salvando senha...</span>`;
  }

  try {
    const res = await fetch('/api/redefinir-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenSenhaAtual, nova_senha: novaSenha })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erro ao definir senha.');
    }

    if (sucBox) sucBox.classList.remove('hidden');
    if (sucTxt) sucTxt.textContent = 'Senha definida com sucesso! Entrando no sistema...';

    // Salva o colaborador autenticado
    estado.usuarioLogado = data.colaborador;
    localStorage.setItem('onboarding_usuario_logado', JSON.stringify(data.colaborador));

    setTimeout(() => {
      window.location.hash = '';
      mostrarAppSistema();
      mostrarToast(`Senha cadastrada! Bem-vindo(a), ${data.colaborador.nome}!`, 'sucesso');
    }, 1200);
  } catch (err) {
    if (erroBox) erroBox.classList.remove('hidden');
    if (erroTxt) erroTxt.textContent = err.message;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="shield-check" class="w-4 h-4 text-[#C5A059]"></i> <span>Salvar Senha e Entrar</span>`;
      lucide.createIcons();
    }
  }
}

function gerarSenhaAleatoriaColab() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pin = '';
  for (let i = 0; i < 8; i++) {
    pin += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const input = document.getElementById('colab-form-pin');
  if (input) input.value = pin;
}

async function enviarConviteColaborador(colabId, colabNome) {
  if (!confirm(`Deseja gerar e enviar o link de ativação / definição de senha para ${colabNome}?`)) return;
  try {
    const res = await fetch(`/api/colaboradores/${colabId}/enviar-convite`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-colaborador-id': estado.usuarioLogado?.id || ''
      }
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erro ao enviar convite.');
    }
    mostrarToast(data.mensagem || 'Convite enviado com sucesso!', 'sucesso');
    if (data.link_direto) {
      prompt('Link de ativação gerado! Copie para enviar ao colaborador via WhatsApp ou E-mail:', data.link_direto);
    }
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function realizarLoginLanding(e) {
  if (e) e.preventDefault();
  const emailInput = document.getElementById('landing-email-input');
  const senhaInput = document.getElementById('landing-senha-input');
  const erroBox = document.getElementById('landing-login-erro');
  const erroTxt = document.getElementById('landing-login-erro-texto');
  const btn = document.getElementById('btn-landing-login');

  const email = emailInput?.value?.trim();
  const senha = senhaInput?.value?.trim();

  if (!email) {
    if (erroBox) erroBox.classList.remove('hidden');
    if (erroTxt) erroTxt.textContent = 'Informe seu e-mail corporativo para prosseguir.';
    if (emailInput) emailInput.focus();
    return;
  }

  if (!senha) {
    if (erroBox) erroBox.classList.remove('hidden');
    if (erroTxt) erroTxt.textContent = 'Digite sua senha ou PIN de acesso.';
    if (senhaInput) senhaInput.focus();
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block"></span> <span>Autenticando...</span>`;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'E-mail ou senha incorretos.');
    }

    if (erroBox) erroBox.classList.add('hidden');
    estado.usuarioLogado = data.colaborador;
    localStorage.setItem('onboarding_usuario_logado', JSON.stringify(data.colaborador));

    mostrarAppSistema();
    mostrarToast(`Bem-vindo(a), ${data.colaborador.nome}!`, 'sucesso');
  } catch (err) {
    if (erroBox) erroBox.classList.remove('hidden');
    if (erroTxt) erroTxt.textContent = err.message;
    if (senhaInput) {
      senhaInput.focus();
      senhaInput.select();
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Entrar no Sistema</span> <i data-lucide="arrow-right" class="w-4 h-4 text-[#C5A059]"></i>`;
    lucide.createIcons();
  }
}

function efetuarLogout() {
  if (!confirm('Deseja realmente sair da sua conta?')) return;
  localStorage.removeItem('onboarding_usuario_logado');
  estado.usuarioLogado = null;

  mostrarLandingLogin();
  mostrarToast('Você saiu do sistema.', 'info');
}

// Helper Universal de Foto/Avatar do Colaborador
function obterAvatarColaboradorHtml(c, tamanho = 'w-8 h-8', extraClasses = '') {
  if (!c) {
    return `<div class="${tamanho} rounded-full bg-[#0A213D] text-white font-bold flex items-center justify-center text-xs ${extraClasses}">JM</div>`;
  }
  if (c.foto_url) {
    return `<img src="${c.foto_url}" alt="${c.nome || 'Colaborador'}" class="${tamanho} rounded-full object-cover border border-[#EDEDEB] shadow-2xs flex-shrink-0 ${extraClasses}">`;
  }
  const iniciais = (c.nome || 'CL').split(' ').map(n => n[0]).slice(0, 2).join('');
  const cor = c.cor_avatar || '#0A213D';
  return `<div class="${tamanho} rounded-full text-white font-bold flex items-center justify-center text-xs flex-shrink-0 shadow-2xs ${extraClasses}" style="background-color: ${cor}">${iniciais}</div>`;
}

function atualizarDisplayUsuarioLogado() {
  if (!estado.usuarioLogado) return;
  const { nome, departamento, cor_avatar, perfil, foto_url } = estado.usuarioLogado;

  const topNome = document.getElementById('topbar-usuario-nome');
  if (topNome) topNome.textContent = nome;

  const topAvatarSlot = document.getElementById('topbar-user-avatar-slot');
  if (topAvatarSlot) {
    topAvatarSlot.innerHTML = obterAvatarColaboradorHtml(estado.usuarioLogado, 'w-6 h-6');
  }

  const topBadge = document.getElementById('topbar-user-badge');
  if (topBadge) {
    if (perfil === 'GESTOR') {
      topBadge.className = 'text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#FAF6EE] text-[#9A7736] border border-[#E8D7B5]';
      topBadge.textContent = '👑 Gestor';
    } else if (perfil === 'ONBOARDING') {
      topBadge.className = 'text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#0A213D]/10 text-[#0A213D] border border-[#0A213D]/20';
      topBadge.textContent = '🚀 Onboarding';
    } else {
      topBadge.className = 'text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#F7F7F5] text-[#2F3437] border border-[#EDEDEB]';
      topBadge.textContent = `💼 ${departamento}`;
    }
  }

  const sideNome = document.getElementById('sidebar-user-nome');
  if (sideNome) sideNome.textContent = nome;

  const sideDep = document.getElementById('sidebar-user-dep');
  if (sideDep) sideDep.textContent = departamento;

  const sidePerfilBadge = document.getElementById('sidebar-user-perfil-badge');
  if (sidePerfilBadge) {
    if (perfil === 'GESTOR') {
      sidePerfilBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#FAF6EE] text-[#9A7736] border border-[#E8D7B5]';
      sidePerfilBadge.textContent = '👑 Gestor Geral';
    } else if (perfil === 'ONBOARDING') {
      sidePerfilBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#0A213D]/10 text-[#0A213D] border border-[#0A213D]/20';
      sidePerfilBadge.textContent = '🚀 Onboarding';
    } else {
      sidePerfilBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#F7F7F5] text-[#787774] border border-[#EDEDEB]';
      sidePerfilBadge.textContent = `🔒 Técnico (${departamento})`;
    }
  }

  const sideAvatarSlot = document.getElementById('sidebar-user-avatar-slot');
  if (sideAvatarSlot) {
    sideAvatarSlot.innerHTML = obterAvatarColaboradorHtml(estado.usuarioLogado, 'w-8 h-8');
  }
}

function aplicarPermissoesInterface() {
  const perfil = estado.usuarioLogado?.perfil || 'TECNICO';
  const isGestorOuOnboarding = (perfil === 'GESTOR' || perfil === 'ONBOARDING');

  // Botão "+ Novo Onboarding" no Topbar: exclusivo para Gestor e Onboarding
  const btnNovo = document.getElementById('btn-topbar-novo-onboarding');
  if (btnNovo) {
    if (isGestorOuOnboarding) {
      btnNovo.classList.remove('hidden');
    } else {
      btnNovo.classList.add('hidden');
    }
  }

  // Permissões nos menus de dashboards
  const navDash = document.getElementById('nav-dashboard');
  const navEquipe = document.getElementById('nav-equipe-metricas');
  const navMeu = document.getElementById('nav-meu-painel');

  if (navDash) {
    if (isGestorOuOnboarding) {
      navDash.classList.remove('hidden');
    } else {
      navDash.classList.add('hidden');
    }
  }

  if (navEquipe) {
    if (isGestorOuOnboarding) {
      navEquipe.classList.remove('hidden');
    } else {
      navEquipe.classList.add('hidden');
    }
  }

  if (navMeu) {
    navMeu.classList.remove('hidden');
  }

  // Sidebar itens administrativos
  const navColabs = document.getElementById('nav-colaboradores');
  if (navColabs) {
    if (perfil === 'GESTOR') {
      navColabs.classList.remove('hidden', 'opacity-50');
      navColabs.title = '';
    } else {
      navColabs.classList.add('hidden');
    }
  }

  const navConfig = document.getElementById('nav-configuracoes');
  if (navConfig) {
    if (perfil === 'GESTOR') {
      navConfig.classList.remove('hidden', 'opacity-50');
      navConfig.title = '';
    } else {
      navConfig.classList.add('hidden');
    }
  }
}

function abrirModalTrocarUsuario(obrigatorio = false) {
  estado.loginObrigatorio = obrigatorio;
  const btnFechar = document.getElementById('btn-fechar-modal-login');
  if (btnFechar) {
    if (obrigatorio) btnFechar.classList.add('hidden');
    else btnFechar.classList.remove('hidden');
  }

  const erroDiv = document.getElementById('erro-pin-login');
  if (erroDiv) erroDiv.classList.add('hidden');

  const emailInput = document.getElementById('modal-trocar-email-input');
  const senhaInput = document.getElementById('modal-trocar-senha-input');
  if (emailInput) emailInput.value = estado.usuarioLogado?.email || '';
  if (senhaInput) senhaInput.value = '';

  document.getElementById('modal-trocar-usuario').classList.remove('hidden');
  setTimeout(() => {
    if (emailInput && !emailInput.value) emailInput.focus();
    else if (senhaInput) senhaInput.focus();
  }, 100);
}

function fecharModalTrocarUsuario() {
  if (estado.loginObrigatorio && !estado.usuarioLogado) {
    mostrarToast('Por favor, efetue o login para acessar o sistema.', 'erro');
    return;
  }
  document.getElementById('modal-trocar-usuario').classList.add('hidden');
}

async function submeterLoginModal(e) {
  if (e) e.preventDefault();
  const emailInput = document.getElementById('modal-trocar-email-input');
  const senhaInput = document.getElementById('modal-trocar-senha-input');
  const erroDiv = document.getElementById('erro-pin-login');
  const txtErro = document.getElementById('txt-erro-pin-login');
  const btn = document.getElementById('btn-modal-login-submit');

  const email = emailInput?.value?.trim();
  const senha = senhaInput?.value?.trim();

  if (!email || !senha) {
    if (erroDiv && txtErro) {
      txtErro.textContent = 'Informe e-mail e senha para prosseguir.';
      erroDiv.classList.remove('hidden');
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block"></span> <span>Autenticando...</span>`;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'E-mail ou senha incorretos.');
    }

    if (erroDiv) erroDiv.classList.add('hidden');
    estado.usuarioLogado = data.colaborador;
    localStorage.setItem('onboarding_usuario_logado', JSON.stringify(data.colaborador));
    estado.loginObrigatorio = false;

    fecharModalTrocarUsuario();
    atualizarDisplayUsuarioLogado();
    aplicarPermissoesInterface();
    mostrarToast(`Conectado como ${data.colaborador.nome}!`, 'sucesso');

    if (estado.usuarioLogado.perfil === 'TECNICO') {
      navegarPara('meu-painel', estado.usuarioLogado.id);
    } else {
      navegarPara('dashboard');
    }
  } catch (err) {
    if (erroDiv && txtErro) {
      txtErro.textContent = err.message;
      erroDiv.classList.remove('hidden');
    }
    if (senhaInput) {
      senhaInput.focus();
      senhaInput.select();
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="log-in" class="w-4 h-4 text-[#C5A059]"></i> <span>Entrar no Sistema</span>`;
      lucide.createIcons();
    }
  }
}
      body: JSON.stringify({ colaborador_id: colabId, pin })
    });

    const data = await res.json();
    if (!res.ok) {
      if (erroDiv && txtErro) {
        txtErro.textContent = data.error || 'PIN de acesso incorreto.';
        erroDiv.classList.remove('hidden');
      }
      if (inputPin) {
        inputPin.value = '';
        inputPin.focus();
      }
      return;
    }

    estado.usuarioLogado = data.colaborador;
    localStorage.setItem('onboarding_usuario_logado', JSON.stringify(data.colaborador));
    estado.loginObrigatorio = false;

    atualizarDisplayUsuarioLogado();
    aplicarPermissoesInterface();
    document.getElementById('modal-trocar-usuario').classList.add('hidden');

    mostrarToast(`Autenticado com sucesso: ${data.colaborador.nome} (${data.colaborador.perfil})`, 'sucesso');

    // Redirecionamento inteligente por perfil
    if (data.colaborador.perfil === 'TECNICO') {
      navegarPara('meu-painel', data.colaborador.id);
    } else {
      navegarPara('dashboard');
    }
  } catch (err) {
    if (erroDiv && txtErro) {
      txtErro.textContent = 'Erro de comunicação ao validar PIN.';
      erroDiv.classList.remove('hidden');
    }
  }
}

function abrirModalAlterarPin() {
  document.getElementById('input-pin-atual').value = '';
  document.getElementById('input-novo-pin').value = '';
  document.getElementById('input-confirma-novo-pin').value = '';
  document.getElementById('erro-alterar-pin').classList.add('hidden');
  document.getElementById('modal-alterar-pin').classList.remove('hidden');
}

function fecharModalAlterarPin() {
  document.getElementById('modal-alterar-pin').classList.add('hidden');
}

async function salvarNovoPin() {
  const pinAtual = document.getElementById('input-pin-atual').value.trim();
  const novoPin = document.getElementById('input-novo-pin').value.trim();
  const confirmaPin = document.getElementById('input-confirma-novo-pin').value.trim();
  const erroBox = document.getElementById('erro-alterar-pin');

  if (!novoPin || novoPin.length < 4) {
    erroBox.textContent = 'O novo PIN deve conter no mínimo 4 dígitos.';
    erroBox.classList.remove('hidden');
    return;
  }

  if (novoPin !== confirmaPin) {
    erroBox.textContent = 'O novo PIN e a confirmação não coincidem.';
    erroBox.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/alterar-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_atual: pinAtual, novo_pin: novoPin })
    });

    const data = await res.json();
    if (!res.ok) {
      erroBox.textContent = data.error || 'Erro ao alterar PIN.';
      erroBox.classList.remove('hidden');
      return;
    }

    fecharModalAlterarPin();
    mostrarToast('Seu PIN de acesso foi atualizado com sucesso!', 'sucesso');
  } catch (err) {
    erroBox.textContent = 'Erro de comunicação com o servidor.';
    erroBox.classList.remove('hidden');
  }
}

function atualizarSelectsSquad() {
  ['paralegal', 'fiscal', 'pessoal', 'contabil'].forEach(dep => {
    document.querySelectorAll(`.select-colab-${dep}`).forEach(sel => {
      sel.innerHTML = `<option value="">Selecionar...</option>` + 
        estado.colaboradores.map(c => `<option value="${c.id}" ${c.departamento === dep.toUpperCase() ? 'selected' : ''}>${c.nome}</option>`).join('');
    });
  });
}

async function atualizarContadoresSidebar() {
  try {
    const res = await fetch('/api/pendencias?status=ABERTA');
    const pendencias = await res.json();
    const badge = document.getElementById('badge-total-pendencias');
    if (badge) badge.textContent = pendencias.length;
  } catch (e) {}
}

// =========================================================================
// ROTEAMENTO DE VISUALIZAÇÕES
// =========================================================================
function navegarPara(tela, param = null) {
  // Se for técnico tentando acessar dashboard executivo ou métricas da equipe, redireciona para seu próprio painel
  if (estado.usuarioLogado?.perfil === 'TECNICO' && (tela === 'dashboard' || tela === 'equipe-metricas')) {
    tela = 'meu-painel';
    param = estado.usuarioLogado.id;
  }

  estado.tela = tela;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('bg-[#0A213D]', 'text-white', 'shadow-xs', 'font-semibold', 'bg-sky-600', 'shadow-sm');
    el.classList.add('text-[#606770]', 'font-medium');
  });

  const ativo = document.getElementById(`nav-${tela}`);
  if (ativo) {
    ativo.classList.add('bg-[#0A213D]', 'text-white', 'shadow-xs', 'font-semibold');
    ativo.classList.remove('text-[#606770]', 'font-medium', 'text-slate-400');
  }

  const container = document.getElementById('view-container');
  const titulo = document.getElementById('topbar-titulo');
  const subtitulo = document.getElementById('topbar-subtitulo');

  if (tela === 'meu-painel') {
    titulo.textContent = 'Meu Cockpit & IA de Produtividade';
    subtitulo.textContent = 'Minhas atividades, prioridades e diagnóstico inteligente';
    renderMeuCockpitColaborador(container, param || estado.usuarioLogado?.id);
  } else if (tela === 'dashboard') {
    titulo.textContent = 'Dashboard Geral de Implantação';
    subtitulo.textContent = 'Visão macro do escritório e funil das 7 etapas';
    renderDashboardGeral(container);
  } else if (tela === 'equipe-metricas') {
    titulo.textContent = 'Métricas & Performance da Equipe';
    subtitulo.textContent = 'Ranking operacional, cumprimento de prazos e distribuição de carga';
    renderDashboardEquipe(container);
  } else if (tela === 'clientes') {
    titulo.textContent = 'Todos os Clientes';
    subtitulo.textContent = 'Selecione um processo para abrir';
    renderTodosClientes(container);
  } else if (tela === 'kanban-etapas') {
    titulo.textContent = 'Pipeline do Onboarding';
    subtitulo.textContent = 'Visão Kanban das 7 Etapas';
    renderPipelineKanbanEtapas(container);
  } else if (tela === 'kanban-colaboradores') {
    titulo.textContent = 'Kanban por Colaborador';
    subtitulo.textContent = 'Distribuição de Atividades da Equipe';
    renderKanbanColaboradores(container);
  } else if (tela === 'cliente-detalhes') {
    titulo.textContent = 'Ficha do Onboarding';
    subtitulo.textContent = 'Acompanhamento do Processo';
    renderClienteDetalhes(container, param);
  } else if (tela === 'colaboradores') {
    titulo.textContent = 'Gestão de Colaboradores';
    subtitulo.textContent = 'Membros da Equipe';
    renderColaboradores(container);
  } else if (tela === 'pendencias') {
    titulo.textContent = 'Central de Pendências';
    subtitulo.textContent = 'Cobrança Consolidada';
    renderCentralPendencias(container);
  } else if (tela === 'configuracoes') {
    titulo.textContent = 'Configurações Locais & IA';
    subtitulo.textContent = 'Servidor e Parâmetros';
    renderConfiguracoes(container);
  } else if (tela === 'manual-ajuda') {
    titulo.textContent = 'Manual do Sistema & Suporte IA';
    subtitulo.textContent = 'Guia oficial passo a passo e assistente inteligente';
    renderManualAjuda(container);
  }

  lucide.createIcons();
}

// =========================================================================
// 1. TELA: DASHBOARD GERAL EXECUTIVO (GESTOR & ONBOARDING)
// =========================================================================
async function renderDashboardGeral(container) {
  container.innerHTML = `<div class="flex items-center justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div></div>`;

  try {
    const res = await fetch('/api/dashboard/geral');
    if (!res.ok) throw new Error('Falha ao carregar dados do dashboard geral.');
    const dados = await res.json();
    const { kpis, funilEtapas, gargalosDepartamentos, tarefasCriticas } = dados;

    container.innerHTML = `
      <div class="space-y-6">
        <!-- TOP EXECUTIVE CARDS -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Onboardings em Andamento</p>
              <h3 class="text-2xl font-bold text-slate-900 mt-0.5">${kpis.totalAtivos}</h3>
              <p class="text-[11px] text-slate-500 mt-0.5">${kpis.totalConcluidos} finalizados • ${kpis.totalClientes} na carteira</p>
            </div>
            <div class="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-xs">
              <i data-lucide="play-circle" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">SLA Médio do Escritório</p>
              <h3 class="text-2xl font-bold text-slate-900 mt-0.5">${kpis.slaMedioDias} <span class="text-xs font-normal text-slate-500">dias</span></h3>
              <p class="text-[11px] text-emerald-600 font-medium mt-0.5">Pontualidade geral: ${kpis.taxaCumprimentoPrazos}%</p>
            </div>
            <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
              <i data-lucide="timer" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tarefas com Prazo Vencido</p>
              <h3 class="text-2xl font-bold ${kpis.totalTarefasAtrasadas > 0 ? 'text-rose-600' : 'text-slate-900'} mt-0.5">
                ${kpis.totalTarefasAtrasadas}
              </h3>
              <p class="text-[11px] ${kpis.totalTarefasAtrasadas > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'} mt-0.5">
                ${kpis.totalTarefasAtrasadas > 0 ? 'Requer atenção operacional' : 'Operação 100% em dia'}
              </p>
            </div>
            <div class="w-11 h-11 rounded-xl ${kpis.totalTarefasAtrasadas > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'} flex items-center justify-center shadow-xs">
              <i data-lucide="alert-octagon" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pendências de Clientes</p>
              <h3 class="text-2xl font-bold text-slate-900 mt-0.5">${kpis.pendenciasAbertas}</h3>
              <p class="text-[11px] text-purple-600 font-medium mt-0.5">${kpis.pendenciasBloqueantes} bloqueantes de avanço</p>
            </div>
            <div class="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-xs">
              <i data-lucide="alert-triangle" class="w-6 h-6"></i>
            </div>
          </div>
        </div>

        <!-- PIPELINE / FUNIL DAS 7 ETAPAS (+ ABERTURA) -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
            <div class="flex items-center space-x-2">
              <span class="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
              <h3 class="font-bold text-sm text-slate-900">Pipeline do Onboarding — Distribuição por Etapas</h3>
            </div>
            <button onclick="navegarPara('kanban-etapas')" class="text-xs text-sky-600 hover:text-sky-800 font-semibold flex items-center space-x-1">
              <span>Abrir Modo Kanban Completo</span>
              <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          <div class="p-4 overflow-x-auto">
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 min-w-[760px]">
              ${funilEtapas.map(etapa => `
                <div class="bg-slate-50 rounded-xl p-3 border border-slate-200 hover:border-sky-300 transition flex flex-col justify-between">
                  <div>
                    <div class="flex items-center justify-between mb-1.5">
                      <span class="text-[10px] font-black px-1.5 py-0.5 rounded ${etapa.numero === 0 ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}">
                        ${etapa.numero === 0 ? 'ABERTURA' : `ETAPA 0${etapa.numero}`}
                      </span>
                      <span class="text-xs font-bold ${etapa.totalEmpresas > 0 ? 'text-slate-900' : 'text-slate-400'}">${etapa.totalEmpresas}</span>
                    </div>
                    <h4 class="text-[11px] font-semibold text-slate-700 line-clamp-2 leading-tight mb-2.5" title="${etapa.titulo}">
                      ${etapa.titulo.replace(/^Etapa \d+: /, '')}
                    </h4>
                  </div>

                  <div class="space-y-1.5 pt-2 border-t border-slate-200/80">
                    ${etapa.empresas.slice(0, 2).map(emp => `
                      <div onclick="verDetalhesCliente('${emp.id}')" class="p-1.5 rounded bg-white border border-slate-200 hover:border-sky-500 hover:shadow-xs cursor-pointer transition text-[10px]" title="Abrir ${emp.razao_social}">
                        <p class="font-bold text-slate-800 truncate">${emp.razao_social}</p>
                        <p class="text-[9px] text-slate-400 truncate">${emp.codigo_dominio || 'S/ CÓD'}</p>
                      </div>
                    `).join('')}
                    ${etapa.totalEmpresas > 2 ? `
                      <button onclick="navegarPara('kanban-etapas')" class="w-full text-center text-[10px] text-sky-600 hover:underline font-medium pt-0.5">
                        +${etapa.totalEmpresas - 2} empresa(s)
                      </button>
                    ` : etapa.totalEmpresas === 0 ? `
                      <p class="text-[10px] text-slate-400 italic text-center py-2">Sem empresas</p>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- SEÇÃO DUPLA: GARGALOS DEPARTAMENTAIS + TAREFAS CRÍTICAS ATRASADAS -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- GARGALOS POR DEPARTAMENTO -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div class="flex items-center space-x-2">
                  <i data-lucide="pie-chart" class="w-4 h-4 text-sky-600"></i>
                  <h3 class="font-bold text-sm text-slate-900">Capacidade & Gargalos por Departamento</h3>
                </div>
                <span class="text-xs text-slate-400">Status Operacional</span>
              </div>

              <div class="space-y-3.5">
                ${gargalosDepartamentos.map(dep => {
                  let badgeStatus = '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Em dia</span>';
                  if (dep.status === 'CRITICO') {
                    badgeStatus = '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">Gargalo Crítico</span>';
                  } else if (dep.status === 'ATENCAO') {
                    badgeStatus = '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Atenção</span>';
                  }

                  return `
                    <div class="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                      <div class="flex items-center justify-between mb-1.5">
                        <div class="flex items-center space-x-2">
                          <span class="font-bold text-xs text-slate-900">${dep.departamento}</span>
                          ${badgeStatus}
                        </div>
                        <div class="text-[11px] text-slate-500">
                          <span class="font-bold text-slate-800">${dep.concluidas}</span>/${dep.total} concl. (${dep.progresso_pct}%)
                        </div>
                      </div>

                      <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
                        <div class="h-2 rounded-full ${dep.status === 'CRITICO' ? 'bg-rose-500' : dep.status === 'ATENCAO' ? 'bg-amber-500' : 'bg-sky-600'}" style="width: ${dep.progresso_pct}%"></div>
                      </div>

                      <div class="flex items-center justify-between text-[11px] text-slate-500">
                        <span>${dep.pendentes} pendente(s)</span>
                        <span class="${dep.atrasadas > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}">${dep.atrasadas} em atraso</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button onclick="navegarPara('equipe-metricas')" class="text-xs text-sky-600 hover:text-sky-800 font-semibold flex items-center space-x-1">
                <span>Ver Produtividade e Ranking da Equipe</span>
                <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          <!-- TAREFAS CRÍTICAS VENCIDAS -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div class="flex items-center space-x-2">
                  <i data-lucide="clock-alert" class="w-4 h-4 text-rose-600"></i>
                  <h3 class="font-bold text-sm text-slate-900">Tarefas Críticas com Prazo Vencido</h3>
                </div>
                <span class="px-2 py-0.5 rounded text-[11px] font-bold ${tarefasCriticas.length > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">
                  ${tarefasCriticas.length} crítica(s)
                </span>
              </div>

              <div class="space-y-2.5">
                ${tarefasCriticas.length === 0 ? `
                  <div class="text-center py-12 text-slate-400">
                    <i data-lucide="check-circle-2" class="w-10 h-10 text-emerald-500 mx-auto mb-2"></i>
                    <p class="text-sm font-semibold text-slate-700">Tudo em dia!</p>
                    <p class="text-xs text-slate-400">Nenhuma tarefa crítica com prazo vencido neste momento.</p>
                  </div>
                ` : tarefasCriticas.map(t => `
                  <div class="p-3 rounded-lg border border-rose-100 bg-rose-50/30 hover:bg-rose-50/60 transition flex items-center justify-between">
                    <div class="min-w-0 pr-3">
                      <div class="flex items-center space-x-2 mb-1">
                        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">${t.departamento}</span>
                        <span class="text-[10px] font-semibold text-slate-500 truncate">${t.cliente_nome}</span>
                      </div>
                      <h4 class="font-bold text-xs text-slate-900 truncate" title="${t.titulo}">${t.titulo}</h4>
                      <p class="text-[10px] text-slate-500 mt-0.5">Resp: <span class="font-medium text-slate-700">${t.responsavel}</span></p>
                    </div>

                    <div class="text-right flex-shrink-0">
                      <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                        Vencida há ${t.dias_atraso}d
                      </span>
                      <div class="mt-1.5">
                        <button onclick="verDetalhesCliente('${t.cliente_id}')" class="px-2 py-1 text-[10px] font-semibold bg-white border border-slate-200 rounded hover:bg-sky-50 hover:text-sky-700 hover:border-sky-300 transition">
                          Resolver
                        </button>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
              <span class="text-slate-400">Prazos monitorados em tempo real</span>
              <button onclick="navegarPara('clientes')" class="text-sky-600 hover:text-sky-800 font-semibold">
                Ver todos os clientes →
              </button>
            </div>
          </div>
        </div>

        <!-- ATALHOS RÁPIDOS DE NAVEGAÇÃO -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div onclick="navegarPara('equipe-metricas')" class="bg-gradient-to-br from-purple-50 to-white p-4 rounded-xl border border-purple-200 hover:border-purple-400 cursor-pointer transition shadow-xs group">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition">
                <i data-lucide="award" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="font-bold text-sm text-slate-900">Métricas & Ranking da Equipe</h4>
                <p class="text-xs text-slate-500">Produtividade semanal, mensal e taxa de pontualidade</p>
              </div>
            </div>
          </div>

          <div onclick="navegarPara('kanban-etapas')" class="bg-gradient-to-br from-amber-50 to-white p-4 rounded-xl border border-amber-200 hover:border-amber-400 cursor-pointer transition shadow-xs group">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-lg bg-amber-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition">
                <i data-lucide="kanban" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="font-bold text-sm text-slate-900">Pipeline das 7 Etapas</h4>
                <p class="text-xs text-slate-500">Visão Kanban de fluxo contínuo dos clientes</p>
              </div>
            </div>
          </div>

          <div onclick="navegarPara('pendencias')" class="bg-gradient-to-br from-rose-50 to-white p-4 rounded-xl border border-rose-200 hover:border-rose-400 cursor-pointer transition shadow-xs group">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition">
                <i data-lucide="alert-triangle" class="w-5 h-5"></i>
              </div>
              <div>
                <h4 class="font-bold text-sm text-slate-900">Central de Pendências</h4>
                <p class="text-xs text-slate-500">Cobrança e notificações enviadas aos clientes</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Erro ao carregar Dashboard Geral: ${err.message}</div>`;
  }
}

// =========================================================================
// 2. TELA: MÉTRICAS DA EQUIPE & COMPARATIVO (GESTOR & ONBOARDING)
// =========================================================================
async function renderDashboardEquipe(container) {
  container.innerHTML = `<div class="flex items-center justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div></div>`;

  try {
    const res = await fetch('/api/dashboard/equipe');
    if (!res.ok) throw new Error('Falha ao carregar métricas da equipe.');
    const equipe = await res.json();

    const topColab = equipe.length > 0 ? equipe[0] : null;
    const mediaPontualidade = equipe.length > 0 
      ? Math.round(equipe.reduce((acc, c) => acc + c.taxa_pontualidade, 0) / equipe.length)
      : 95;
    const totalEntregasSemana = equipe.reduce((acc, c) => acc + c.entregas_semana, 0);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- HEADER METRICS SUMMARY -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Membros Ativos</p>
              <h3 class="text-2xl font-bold text-slate-900 mt-0.5">${equipe.length}</h3>
              <p class="text-[11px] text-slate-400 mt-0.5">Paralegal, Fiscal, DP, Contábil</p>
            </div>
            <div class="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-xs">
              <i data-lucide="users" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Entregas dos Últimos 7 Dias</p>
              <h3 class="text-2xl font-bold text-slate-900 mt-0.5">${totalEntregasSemana}</h3>
              <p class="text-[11px] text-emerald-600 font-medium mt-0.5">Tarefas finalizadas no prazo</p>
            </div>
            <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
              <i data-lucide="check-circle" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Média de Pontualidade</p>
              <h3 class="text-2xl font-bold text-slate-900 mt-0.5">${mediaPontualidade}%</h3>
              <p class="text-[11px] text-slate-500 mt-0.5">Cumprimento dos prazos de SLA</p>
            </div>
            <div class="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <i data-lucide="target" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="bg-gradient-to-br from-amber-500 to-amber-600 p-4 rounded-xl text-white shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-amber-100 uppercase tracking-wide">🏆 Destaque da Semana</p>
              <h3 class="text-lg font-bold mt-0.5 truncate">${topColab ? topColab.nome : '—'}</h3>
              <p class="text-[11px] text-amber-100 mt-0.5 font-medium">Score: ${topColab ? topColab.score_produtividade : 0}/100 • ${topColab?.departamento || ''}</p>
            </div>
            <div class="w-11 h-11 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-xs">
              <i data-lucide="trophy" class="w-6 h-6 text-amber-200"></i>
            </div>
          </div>
        </div>

        <!-- TABELA / CARDS DE RANKING COMPARATIVO -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
            <div>
              <h3 class="font-bold text-sm text-slate-900">Produtividade & Desempenho Operacional da Equipe</h3>
              <p class="text-xs text-slate-500">Métricas consolidadas de entregas semanais, mensais, trimestrais e pontualidade</p>
            </div>
            <div class="flex items-center space-x-2">
              <span class="text-xs text-slate-500 font-medium">Clique em "Raio-X & IA" para abrir o cockpit individual</span>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100/70 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-4">Posição & Colaborador</th>
                  <th class="py-3 px-3">Departamento / Perfil</th>
                  <th class="py-3 px-3 text-center">Score Produtividade</th>
                  <th class="py-3 px-3 text-center">7 Dias (Semana)</th>
                  <th class="py-3 px-3 text-center">30 Dias (Mês)</th>
                  <th class="py-3 px-3 text-center">90 Dias (Trimestre)</th>
                  <th class="py-3 px-3 text-center">Pontualidade</th>
                  <th class="py-3 px-3 text-center">Carga & Pendências</th>
                  <th class="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${equipe.map((c, idx) => {
                  let badgeRank = `<span class="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px]">${idx + 1}</span>`;
                  if (idx === 0) badgeRank = `<span class="w-5 h-5 rounded-full bg-amber-400 text-amber-950 font-bold flex items-center justify-center text-[10px] shadow-xs">🥇</span>`;
                  else if (idx === 1) badgeRank = `<span class="w-5 h-5 rounded-full bg-slate-300 text-slate-800 font-bold flex items-center justify-center text-[10px]">🥈</span>`;
                  else if (idx === 2) badgeRank = `<span class="w-5 h-5 rounded-full bg-amber-700 text-white font-bold flex items-center justify-center text-[10px]">🥉</span>`;

                  let corScore = 'bg-sky-600';
                  if (c.score_produtividade >= 88) {
                    corScore = 'bg-emerald-600';
                  } else if (c.score_produtividade < 75) {
                    corScore = 'bg-amber-600';
                  }

                  return `
                    <tr class="hover:bg-slate-50 transition">
                      <td class="py-3.5 px-4">
                        <div class="flex items-center space-x-3">
                          ${badgeRank}
                          ${obterAvatarColaboradorHtml(c, 'w-8 h-8')}
                          <div>
                            <p class="font-bold text-slate-900">${c.nome}</p>
                            <p class="text-[10px] text-slate-500">${c.cargo || 'Analista'}</p>
                          </div>
                        </div>
                      </td>

                      <td class="py-3.5 px-3">
                        <span class="inline-block px-2 py-0.5 rounded font-semibold text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                          ${c.departamento}
                        </span>
                        <div class="text-[9px] text-slate-400 mt-0.5 font-medium">${c.perfil}</div>
                      </td>

                      <td class="py-3.5 px-3 text-center">
                        <div class="inline-flex flex-col items-center">
                          <span class="font-extrabold text-sm text-slate-900">${c.score_produtividade} <span class="text-[10px] font-normal text-slate-400">/100</span></span>
                          <div class="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                            <div class="${corScore} h-1.5 rounded-full" style="width: ${c.score_produtividade}%"></div>
                          </div>
                        </div>
                      </td>

                      <td class="py-3.5 px-3 text-center">
                        <span class="font-bold text-slate-900 text-xs">${c.entregas_semana}</span>
                        <span class="block text-[9px] text-slate-400">tarefas</span>
                      </td>

                      <td class="py-3.5 px-3 text-center">
                        <span class="font-bold text-slate-900 text-xs">${c.entregas_mes}</span>
                        <span class="block text-[9px] text-slate-400">tarefas</span>
                      </td>

                      <td class="py-3.5 px-3 text-center">
                        <span class="font-bold text-slate-900 text-xs">${c.entregas_trimestre}</span>
                        <span class="block text-[9px] text-slate-400">tarefas</span>
                      </td>

                      <td class="py-3.5 px-3 text-center">
                        <span class="font-bold ${c.taxa_pontualidade >= 90 ? 'text-emerald-700' : c.taxa_pontualidade >= 80 ? 'text-sky-700' : 'text-amber-700'}">
                          ${c.taxa_pontualidade}%
                        </span>
                        <span class="block text-[9px] text-slate-400">no prazo</span>
                      </td>

                      <td class="py-3.5 px-3 text-center">
                        <div class="text-[11px] font-medium text-slate-700">
                          ${c.tarefas_pendentes} pendentes
                        </div>
                        <div class="text-[10px] ${c.tarefas_atrasadas > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}">
                          ${c.tarefas_atrasadas > 0 ? `⚠️ ${c.tarefas_atrasadas} em atraso` : '✓ 0 atrasadas'}
                        </div>
                      </td>

                      <td class="py-3.5 px-4 text-right">
                        <button onclick="navegarPara('meu-painel', '${c.id}')" class="px-3 py-1.5 bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white rounded-lg font-bold text-xs transition border border-sky-200 hover:border-sky-600 inline-flex items-center space-x-1">
                          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                          <span>Raio-X & IA</span>
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Erro ao carregar Métricas da Equipe: ${err.message}</div>`;
  }
}

// =========================================================================
// 3. TELA: MEU COCKPIT INDIVIDUAL & IA DE PRODUTIVIDADE
// =========================================================================
async function renderMeuCockpitColaborador(container, colabId = null, periodo = 'semanal') {
  const usuarioId = colabId || estado.usuarioLogado?.id;
  if (!usuarioId) {
    container.innerHTML = `<div class="p-6 bg-amber-50 text-amber-800 rounded-xl">Por favor, faça login para acessar seu Cockpit.</div>`;
    return;
  }

  container.innerHTML = `<div class="flex items-center justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div></div>`;

  try {
    const res = await fetch(`/api/dashboard/colaborador/${usuarioId}?periodo=${periodo}`);
    if (!res.ok) throw new Error('Falha ao carregar dados do Cockpit.');
    const dados = await res.json();
    const { colaborador, periodo_ativo, metricas_periodo, resumo_temporal, o_que_venho_fazendo, o_que_fazer_agora, empresas_atribuidas, ultima_analise_ia } = dados;

    const isGestorInspecionando = (estado.usuarioLogado?.id !== colaborador.id && (estado.usuarioLogado?.perfil === 'GESTOR' || estado.usuarioLogado?.perfil === 'ONBOARDING'));

    container.innerHTML = `
      <div class="space-y-6">
        <!-- BANNER DE INSPEÇÃO (SE FOR GESTOR INSPECIONANDO OUTRO TÉCNICO) -->
        ${isGestorInspecionando ? `
          <div class="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 text-amber-950 p-4 rounded-xl flex items-center justify-between shadow-xs">
            <div class="flex items-center space-x-3">
              <span class="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-xs"><i data-lucide="eye" class="w-5 h-5"></i></span>
              <div>
                <p class="font-bold text-sm">Modo de Inspeção de Liderança</p>
                <p class="text-xs text-amber-800">Você está visualizando o Cockpit individual e o diagnóstico de <strong>${colaborador.nome}</strong> (${colaborador.departamento}).</p>
              </div>
            </div>
            <div class="flex items-center space-x-2">
              <button onclick="navegarPara('equipe-metricas')" class="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-bold transition">
                ← Voltar às Métricas da Equipe
              </button>
            </div>
          </div>
        ` : ''}

        <!-- CABEÇALHO DO COCKPIT & SELETOR DE PERÍODO -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center space-x-4">
            ${obterAvatarColaboradorHtml(colaborador, 'w-14 h-14', 'text-lg rounded-2xl shadow-sm')}
            <div>
              <div class="flex items-center space-x-2">
                <h2 class="text-lg font-bold text-slate-900">${colaborador.nome}</h2>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                  ${colaborador.departamento}
                </span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                  ${colaborador.perfil}
                </span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">${colaborador.cargo || 'Analista Operacional'} • ${colaborador.email}</p>
            </div>
          </div>

          <!-- SELETOR DE PERÍODO (TABS) -->
          <div class="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button onclick="renderMeuCockpitColaborador(document.getElementById('view-container'), '${colaborador.id}', 'semanal')" class="px-3.5 py-1.5 rounded-lg transition ${periodo === 'semanal' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
              📅 Esta Semana (7d)
            </button>
            <button onclick="renderMeuCockpitColaborador(document.getElementById('view-container'), '${colaborador.id}', 'mensal')" class="px-3.5 py-1.5 rounded-lg transition ${periodo === 'mensal' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
              📆 Este Mês (30d)
            </button>
            <button onclick="renderMeuCockpitColaborador(document.getElementById('view-container'), '${colaborador.id}', 'trimestral')" class="px-3.5 py-1.5 rounded-lg transition ${periodo === 'trimestral' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
              📊 Este Trimestre (90d)
            </button>
          </div>
        </div>

        <!-- 4 CARDS DE MÉTRICAS DO PERÍODO SELECIONADO -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Entregas no Período</p>
              <div class="flex items-baseline space-x-2 mt-0.5">
                <h3 class="text-2xl font-bold text-slate-900">${metricas_periodo.concluidas_periodo}</h3>
                <span class="text-xs font-bold ${metricas_periodo.variacao_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
                  ${metricas_periodo.variacao_pct >= 0 ? `+${metricas_periodo.variacao_pct}%` : `${metricas_periodo.variacao_pct}%`}
                </span>
              </div>
              <p class="text-[11px] text-slate-400 mt-0.5">vs ${metricas_periodo.concluidas_periodo_anterior} no ciclo anterior</p>
            </div>
            <div class="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-xs">
              <i data-lucide="check-check" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Taxa de Pontualidade</p>
              <h3 class="text-2xl font-bold ${metricas_periodo.taxa_pontualidade_periodo >= 90 ? 'text-emerald-600' : 'text-amber-600'} mt-0.5">
                ${metricas_periodo.taxa_pontualidade_periodo}%
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">Dentro do prazo acordado</p>
            </div>
            <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
              <i data-lucide="clock" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Score de Produtividade</p>
              <h3 class="text-2xl font-bold text-slate-900 mt-0.5">${metricas_periodo.score_periodo} <span class="text-xs font-normal text-slate-400">/100</span></h3>
              <p class="text-[11px] text-indigo-600 font-semibold mt-0.5">
                ${metricas_periodo.score_periodo >= 88 ? 'Ritmo Excelente' : metricas_periodo.score_periodo >= 75 ? 'Ritmo Estável' : 'Requer Atenção'}
              </p>
            </div>
            <div class="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <i data-lucide="activity" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Fila Pendente Total</p>
              <h3 class="text-2xl font-bold text-slate-900 mt-0.5">${metricas_periodo.pendentes_totais}</h3>
              <p class="text-[11px] ${metricas_periodo.atrasadas_totais > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-medium'} mt-0.5">
                ${metricas_periodo.atrasadas_totais > 0 ? `⚠️ ${metricas_periodo.atrasadas_totais} atrasada(s)` : '✓ Nenhuma atrasada'}
              </p>
            </div>
            <div class="w-11 h-11 rounded-xl ${metricas_periodo.atrasadas_totais > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-500'} flex items-center justify-center shadow-xs">
              <i data-lucide="inbox" class="w-6 h-6"></i>
            </div>
          </div>
        </div>

        <!-- SEÇÃO ESPECIAL: DIAGNÓSTICO & COACHING POR IA -->
        <div class="bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 text-white rounded-2xl shadow-md p-6 border border-slate-800">
          <div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center justify-center">
                <i data-lucide="sparkles" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="font-bold text-base text-white">Análise de IA & Coaching de Produtividade</h3>
                <p class="text-xs text-sky-200">Recomendações técnicas personalizadas para o setor ${colaborador.departamento}</p>
              </div>
            </div>

            <button id="btn-gerar-ia-cockpit" onclick="gerarDiagnosticoIAColaborador('${colaborador.id}', '${periodo}')" class="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center space-x-2">
              <i data-lucide="sparkles" class="w-4 h-4 text-amber-300"></i>
              <span>Gerar Novo Diagnóstico IA (${periodo.toUpperCase()})</span>
            </button>
          </div>

          <div class="mt-4">
            ${ultimaAnaliseIA ? `
              <div class="space-y-3">
                <div class="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800/50">
                  <span>Diagnóstico referente ao ciclo <strong>${ultimaAnaliseIA.periodo}</strong> • Score IA: <strong class="text-amber-300">${ultimaAnaliseIA.score_produtividade}/100</strong></span>
                  <span>Gerado em ${new Date(ultimaAnaliseIA.data_geracao).toLocaleString('pt-BR')}</span>
                </div>
                <div class="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-slate-200 text-xs leading-relaxed prose prose-invert max-w-none">
                  ${renderConteudoIAFormatado(ultimaAnaliseIA.conteudo_analise)}
                </div>
              </div>
            ` : `
              <div class="text-center py-8 text-slate-400">
                <i data-lucide="cpu" class="w-10 h-10 text-sky-400 mx-auto mb-2 opacity-60"></i>
                <p class="text-sm font-semibold text-slate-300">Nenhuma análise gerada ainda para este colaborador.</p>
                <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">Clique no botão acima para acionar a IA e gerar um diagnóstico de ritmo, pontualidade e plano de melhoria contínua.</p>
              </div>
            `}
          </div>
        </div>

        <!-- SEÇÃO DUPLA CENTRAL: O QUE FAZER AGORA vs O QUE VENHO FAZENDO -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- COLUNA 1: O QUE FAZER AGORA (FILA DE PRIORIDADES) -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div class="flex items-center space-x-2">
                  <div class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></div>
                  <h3 class="font-bold text-sm text-slate-900">O Que Fazer Agora — Fila de Prioridades</h3>
                </div>
                <span class="text-xs font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                  ${o_que_fazer_agora.total_pendentes} pendente(s)
                </span>
              </div>

              <!-- ABAS DE PRIORIDADE -->
              <div class="flex items-center space-x-1 mb-3 text-[11px] font-semibold border-b border-slate-100 pb-2 overflow-x-auto">
                <button onclick="filtrarFilaCockpit('todas')" id="tab-fila-todas" class="tab-fila px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700">
                  Todas (${o_que_fazer_agora.total_pendentes})
                </button>
                <button onclick="filtrarFilaCockpit('atrasadas')" id="tab-fila-atrasadas" class="tab-fila px-2.5 py-1 rounded-lg text-slate-500 hover:text-slate-800">
                  🔴 Atrasadas (${o_que_fazer_agora.atrasadas.length})
                </button>
                <button onclick="filtrarFilaCockpit('hoje')" id="tab-fila-hoje" class="tab-fila px-2.5 py-1 rounded-lg text-slate-500 hover:text-slate-800">
                  🟡 Hoje / Amanhã (${o_que_fazer_agora.para_hoje.length})
                </button>
                <button onclick="filtrarFilaCockpit('proximos')" id="tab-fila-proximos" class="tab-fila px-2.5 py-1 rounded-lg text-slate-500 hover:text-slate-800">
                  🔵 Próx. 7 Dias (${o_que_fazer_agora.proximos_7_dias.length})
                </button>
              </div>

              <!-- ITENS DA FILA -->
              <div id="container-fila-tarefas" class="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                ${renderItensFilaCockpit(o_que_fazer_agora, colaborador.id, periodo, 'todas')}
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span>Dê check diretamente na tarefa ao concluir</span>
              <button onclick="navegarPara('kanban-colaboradores')" class="text-sky-600 hover:text-sky-800 font-semibold">
                Ver em modo Kanban →
              </button>
            </div>
          </div>

          <!-- COLUNA 2: O QUE VENHO FAZENDO (HISTÓRICO RECENTE) -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div class="flex items-center space-x-2">
                  <i data-lucide="history" class="w-4 h-4 text-emerald-600"></i>
                  <h3 class="font-bold text-sm text-slate-900">O Que Venho Fazendo — Entregas Recentes</h3>
                </div>
                <span class="text-xs text-slate-400">Últimas 15 tarefas</span>
              </div>

              <div class="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                ${o_que_venho_fazendo.length === 0 ? `
                  <div class="text-center py-12 text-slate-400">
                    <i data-lucide="clipboard-list" class="w-10 h-10 text-slate-300 mx-auto mb-2"></i>
                    <p class="text-sm font-semibold text-slate-700">Nenhuma entrega recente</p>
                    <p class="text-xs text-slate-400">Conclua tarefas na coluna ao lado para registrar seu histórico.</p>
                  </div>
                ` : o_que_venho_fazendo.map(t => `
                  <div class="p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between">
                    <div class="min-w-0 pr-3">
                      <div class="flex items-center space-x-2 mb-1">
                        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-100 text-sky-800">Etapa 0${t.etapa_numero}</span>
                        <span class="text-[10px] font-semibold text-slate-500 truncate cursor-pointer hover:underline" onclick="verDetalhesCliente('${t.cliente_id}')">${t.cliente_nome}</span>
                      </div>
                      <h4 class="font-bold text-xs text-slate-900 truncate" title="${t.titulo}">${t.titulo}</h4>
                      <p class="text-[10px] text-slate-400 mt-0.5">Concluída em: ${t.data_conclusao}</p>
                    </div>

                    <div class="text-right flex-shrink-0">
                      <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded ${t.no_prazo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}">
                        ${t.no_prazo ? '✓ No Prazo' : '⚠️ C/ Atraso'}
                      </span>
                      <div class="mt-1.5">
                        <button onclick="concluirTarefaPeloCockpit('${t.id}', '${colaborador.id}', '${periodo}', false)" class="text-[10px] text-slate-400 hover:text-rose-600 transition" title="Desfazer conclusão">
                          Desmarcar
                        </button>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400">
              Registrado com assinatura digital e carimbo de data/hora
            </div>
          </div>
        </div>

        <!-- EMPRESAS ATRIBUÍDAS AO SQUAD -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <div class="flex items-center space-x-2">
              <i data-lucide="building" class="w-4 h-4 text-sky-600"></i>
              <h3 class="font-bold text-sm text-slate-900">Empresas Sob Minha Atuação (${empresas_atribuidas.length})</h3>
            </div>
            <span class="text-xs text-slate-400">Clique para abrir o processo</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            ${empresas_atribuidas.map(emp => `
              <div onclick="verDetalhesCliente('${emp.id}')" class="p-3 rounded-xl border border-slate-200 hover:border-sky-400 hover:shadow-xs transition cursor-pointer bg-slate-50/30 hover:bg-white group">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                    ${emp.etapa_atual === 0 ? 'Abertura' : `Etapa 0${emp.etapa_atual}`}
                  </span>
                  <span class="text-[10px] font-semibold text-slate-400">${emp.regime_tributario || ''}</span>
                </div>
                <h4 class="font-bold text-xs text-slate-900 truncate group-hover:text-sky-600 transition" title="${emp.razao_social}">${emp.razao_social}</h4>
                <p class="text-[10px] text-slate-500 mt-1">${emp.tipo_empresa === 'EM_CONSTITUICAO' ? 'Abertura de Empresa' : 'Migração Contábil'}</p>
              </div>
            `).join('')}
            ${empresas_atribuidas.length === 0 ? `
              <p class="text-xs text-slate-400 col-span-4 text-center py-6">Nenhuma empresa atribuída no momento.</p>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // Armazenar estado local da fila de tarefas para alternância rápida de abas
    window._cockpitDadosFila = o_que_fazer_agora;
    window._cockpitColabId = colaborador.id;
    window._cockpitPeriodo = periodo;

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Erro ao carregar Cockpit: ${err.message}</div>`;
  }
}

// =========================================================================
// HELPERS DO COCKPIT & PRIORIDADES
// =========================================================================
function renderItensFilaCockpit(fila, colabId, periodo, filtro = 'todas') {
  let lista = [];

  if (filtro === 'atrasadas') lista = fila.atrasadas;
  else if (filtro === 'hoje') lista = fila.para_hoje;
  else if (filtro === 'proximos') lista = fila.proximos_7_dias;
  else {
    // Todas em ordem de prioridade: Atrasadas primeiro, depois Hoje, depois Próximos, depois Sem Prazo
    lista = [...fila.atrasadas, ...fila.para_hoje, ...fila.proximos_7_dias, ...fila.sem_prazo];
  }

  if (lista.length === 0) {
    return `
      <div class="text-center py-10 text-slate-400">
        <i data-lucide="check-circle" class="w-8 h-8 text-emerald-500 mx-auto mb-1.5"></i>
        <p class="text-xs font-semibold text-slate-700">Nenhuma tarefa nesta categoria!</p>
      </div>
    `;
  }

  return lista.map(t => {
    const isAtrasada = (t.dias_atraso !== undefined && t.dias_atraso > 0);
    const isHoje = (t.dias_restantes === 0 || t.dias_restantes === 1);

    let badgePrazo = `<span class="text-[10px] font-medium text-slate-500">Prazo: ${t.prazo_str}</span>`;
    let bgCard = 'bg-white border-slate-200';

    if (isAtrasada) {
      badgePrazo = `<span class="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">Atrasada há ${t.dias_atraso}d</span>`;
      bgCard = 'bg-rose-50/20 border-rose-200';
    } else if (isHoje) {
      badgePrazo = `<span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">Vence Hoje/Amanhã</span>`;
      bgCard = 'bg-amber-50/20 border-amber-200';
    }

    return `
      <div class="p-3 rounded-lg border ${bgCard} hover:shadow-xs transition flex items-center justify-between">
        <div class="flex items-start space-x-2.5 min-w-0 pr-2">
          <button onclick="concluirTarefaPeloCockpit('${t.id}', '${colabId}', '${periodo}', true)" class="mt-0.5 w-5 h-5 rounded border border-slate-300 hover:border-emerald-600 hover:bg-emerald-50 flex items-center justify-center transition flex-shrink-0" title="Marcar como Concluída">
            <i data-lucide="check" class="w-3.5 h-3.5 text-slate-300 hover:text-emerald-600"></i>
          </button>
          <div class="min-w-0">
            <h4 class="font-bold text-xs text-slate-900 leading-tight truncate" title="${t.titulo}">${t.titulo}</h4>
            <div class="flex items-center space-x-2 mt-1">
              <span class="text-[10px] text-slate-500 font-medium truncate cursor-pointer hover:underline" onclick="verDetalhesCliente('${t.cliente_id}')">${t.cliente_nome}</span>
              <span class="text-[10px] text-slate-300">•</span>
              <span class="text-[10px] text-slate-400">Etapa 0${t.etapa_numero}</span>
            </div>
          </div>
        </div>

        <div class="text-right flex-shrink-0">
          ${badgePrazo}
          <div class="mt-1">
            <button onclick="verDetalhesCliente('${t.cliente_id}')" class="text-[10px] text-sky-600 hover:text-sky-800 font-semibold">
              Abrir →
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filtrarFilaCockpit(aba) {
  document.querySelectorAll('.tab-fila').forEach(b => {
    b.classList.remove('bg-sky-50', 'text-sky-700');
    b.classList.add('text-slate-500');
  });

  const tab = document.getElementById(`tab-fila-${aba}`);
  if (tab) {
    tab.classList.add('bg-sky-50', 'text-sky-700');
    tab.classList.remove('text-slate-500');
  }

  const container = document.getElementById('container-fila-tarefas');
  if (container && window._cockpitDadosFila) {
    container.innerHTML = renderItensFilaCockpit(window._cockpitDadosFila, window._cockpitColabId, window._cockpitPeriodo, aba);
    lucide.createIcons();
  }
}

async function concluirTarefaPeloCockpit(tarefaId, colabId, periodo, marcado = true) {
  const usuario = estado.usuarioLogado || { id: colabId, nome: 'Colaborador' };
  const status = marcado ? 'CONCLUIDO' : 'NAO_INICIADO';

  try {
    const res = await fetch(`/api/tarefas/${tarefaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao atualizar tarefa');
    }

    mostrarToast(marcado ? 'Tarefa concluída com sucesso!' : 'Tarefa desmarcada.', 'sucesso');
    const container = document.getElementById('view-container');
    renderMeuCockpitColaborador(container, colabId, periodo);
  } catch (e) {
    mostrarToast(e.message, 'erro');
  }
}

async function gerarDiagnosticoIAColaborador(colabId, periodo) {
  const btn = document.getElementById('btn-gerar-ia-cockpit');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin inline-block mr-2">⚙️</span> Analisando Métricas e Gerando Coaching...`;
  }

  try {
    const res = await fetch(`/api/dashboard/colaborador/${colabId}/analise-ia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodo: periodo.toUpperCase() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao gerar análise');

    mostrarToast('Diagnóstico de IA gerado com sucesso!', 'sucesso');
    const container = document.getElementById('view-container');
    renderMeuCockpitColaborador(container, colabId, periodo);
  } catch (err) {
    mostrarToast('Erro ao processar IA: ' + err.message, 'erro');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4 mr-1 text-amber-300"></i> Gerar Novo Diagnóstico IA (${periodo.toUpperCase()})`;
      lucide.createIcons();
    }
  }
}

function renderConteudoIAFormatado(conteudo) {
  if (!conteudo) return '';
  if (typeof window.marked !== 'undefined' && typeof window.marked.parse === 'function') {
    return window.marked.parse(conteudo);
  }
  // Fallback simples
  return conteudo
    .replace(/^### (.*$)/gim, '<h4 class="font-bold text-amber-300 text-sm mt-3 mb-1">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 class="font-bold text-white text-base mt-4 mb-2">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 class="font-extrabold text-white text-lg mt-4 mb-2">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc text-slate-300">$1</li>')
    .replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc text-slate-300">$1</li>')
    .replace(/\n\n/g, '<p class="mb-2"></p>');
}

// =========================================================================
// 2. TELA: TODOS OS CLIENTES (CARDS & TABELA COM SELEÇÃO)
// =========================================================================
async function renderTodosClientes(container) {
  container.innerHTML = `<div class="flex items-center justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div></div>`;
  
  try {
    const res = await fetch('/api/clientes');
    const clientes = await res.json();

    container.innerHTML = `
      <div class="space-y-4">
        ${estado.usuarioLogado?.perfil === 'TECNICO' ? `
          <div class="bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 text-sky-950 p-3.5 rounded-xl flex items-center justify-between text-xs shadow-2xs">
            <div class="flex items-center space-x-2.5">
              <span class="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-xs"><i data-lucide="shield-check" class="w-4 h-4"></i></span>
              <div>
                <span class="font-bold text-slate-900">Visualização Departamental Restrita:</span>
                <span class="text-slate-600 ml-1">Você está conectado como <strong>${estado.usuarioLogado.nome}</strong> (${estado.usuarioLogado.departamento}). Apenas as empresas sob responsabilidade do seu setor estão visíveis.</span>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-bold text-[10px]">🔒 Perfil Técnico</span>
          </div>
        ` : ''}

        <!-- BARRA DE PESQUISA & FILTROS -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center space-x-2">
            <div class="relative w-72">
              <i data-lucide="search" class="w-4 h-4 absolute left-3 top-2.5 text-slate-400"></i>
              <input type="text" id="busca-todos-clientes" oninput="filtrarCardsClientes(this.value)" placeholder="Buscar cliente por nome ou CNPJ..." class="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none">
            </div>

            <select id="filtro-tipo-clientes" onchange="filtrarCardsClientes()" class="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none">
              <option value="todos">Todos os Tipos</option>
              <option value="CONSTITUIDA">Empresas Constituídas</option>
              <option value="EM_CONSTITUICAO">Em Constituição (Abertura)</option>
            </select>
          </div>

          <span class="text-xs font-bold text-slate-500">${clientes.length} clientes cadastrados</span>
        </div>

        <!-- GRADE DE CARDS DOS CLIENTES COM SELEÇÃO -->
        <div id="grid-clientes-cards" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${clientes.map(c => {
            const pct = c.total_tarefas > 0 ? Math.round((c.tarefas_concluidas / c.total_tarefas) * 100) : 0;
            return `
              <div onclick="verDetalhesCliente('${c.id}')" class="cliente-item-card bg-white p-4 rounded-xl border border-slate-200 hover:border-sky-500 shadow-sm hover:shadow-md cursor-pointer transition space-y-3" data-nome="${c.razao_social.toLowerCase()}" data-tipo="${c.tipo_empresa}">
                <div class="flex items-start justify-between">
                  <div>
                    <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded ${c.tipo_empresa === 'EM_CONSTITUICAO' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}">
                      ${c.tipo_empresa === 'EM_CONSTITUICAO' ? 'Em Constituição' : 'Constituída'}
                    </span>
                    <h4 class="font-bold text-sm text-slate-900 mt-1 line-clamp-1">${c.razao_social}</h4>
                    <p class="text-[11px] text-slate-500">${c.regime_tributario} • Cód. Domínio: <strong>${c.codigo_dominio || 'S/ Cód'}</strong></p>
                  </div>
                  <span class="font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded text-[11px]">
                    ${c.status_geral === 'CONCLUIDO' ? '✓ Concluído' : c.etapa_atual === 0 ? 'Abertura' : `Etapa 0${c.etapa_atual}`}
                  </span>
                </div>

                <div>
                  <div class="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>${c.tarefas_concluidas} de ${c.total_tarefas} atividades</span>
                    <span class="font-bold text-slate-800">${pct}%</span>
                  </div>
                  <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div class="bg-sky-600 h-2 rounded-full" style="width: ${pct}%"></div>
                  </div>
                </div>

                <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>${c.contato_nome || 'Sem contato'}</span>
                  ${c.pendencias_abertas > 0 ? `
                    <span class="text-amber-600 font-bold flex items-center space-x-1">
                      <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i>
                      <span>${c.pendencias_abertas} pendências</span>
                    </span>
                  ` : `<span class="text-emerald-600 font-semibold">✓ Em dia</span>`}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-red-50 text-red-700 rounded-xl">Erro: ${err.message}</div>`;
  }
}

function filtrarCardsClientes(termo = null) {
  const busca = (termo !== null ? termo : document.getElementById('busca-todos-clientes').value).toLowerCase();
  const tipo = document.getElementById('filtro-tipo-clientes').value;

  document.querySelectorAll('.cliente-item-card').forEach(card => {
    const matchBusca = !busca || card.dataset.nome.includes(busca);
    const matchTipo = (tipo === 'todos' || card.dataset.tipo === tipo);
    card.style.display = (matchBusca && matchTipo) ? 'block' : 'none';
  });
}

// =========================================================================
// 3. TELA: KANBAN GERAL DAS 7 ETAPAS (PIPELINE)
// =========================================================================
async function renderPipelineKanbanEtapas(container) {
  container.innerHTML = `<div class="flex items-center justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div></div>`;
  
  try {
    const res = await fetch('/api/clientes');
    const clientes = await res.json();

    const colunas = [
      { id: 0, titulo: 'Abertura / Constituição' },
      { id: 1, titulo: '01. Formalização' },
      { id: 2, titulo: '02. Diagnóstico' },
      { id: 3, titulo: '03. Documentos' },
      { id: 4, titulo: '04. Implantação' },
      { id: 5, titulo: '05. Alinhamento' },
      { id: 6, titulo: '06. Entregas (M1-M3)' },
      { id: 7, titulo: '07. Validação Final' }
    ];

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex space-x-3 overflow-x-auto pb-6">
          ${colunas.map(col => {
            const clientesEtapa = clientes.filter(c => c.etapa_atual === col.id && c.status_geral !== 'CONCLUIDO');
            return `
              <div class="w-72 flex-shrink-0 bg-slate-200/60 rounded-xl p-3 border border-slate-200 flex flex-col max-h-[calc(100vh-180px)]">
                <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-300">
                  <h4 class="font-bold text-xs text-slate-800">${col.titulo}</h4>
                  <span class="bg-white text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold shadow-xs">
                    ${clientesEtapa.length}
                  </span>
                </div>

                <div class="flex-1 overflow-y-auto space-y-2.5">
                  ${clientesEtapa.length === 0 ? `
                    <div class="h-20 flex items-center justify-center text-slate-400 text-[11px] border-2 border-dashed border-slate-300 rounded-lg">
                      Nenhum cliente
                    </div>
                  ` : clientesEtapa.map(c => `
                    <div onclick="verDetalhesCliente('${c.id}')" class="bg-white p-3 rounded-lg border border-slate-200 hover:border-sky-500 shadow-sm hover:shadow cursor-pointer transition space-y-2">
                      <div class="flex items-center justify-between">
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${c.tipo_empresa === 'EM_CONSTITUICAO' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}">
                          ${c.tipo_empresa === 'EM_CONSTITUICAO' ? 'Abertura' : 'Constituída'}
                        </span>
                        <span class="text-[10px] font-mono text-slate-500">${c.codigo_dominio || ''}</span>
                      </div>
                      <h5 class="font-bold text-xs text-slate-900 line-clamp-1">${c.razao_social}</h5>
                      <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                        <span>${c.tarefas_concluidas}/${c.total_tarefas} ativ.</span>
                        <span class="${c.pendencias_abertas > 0 ? 'text-amber-600 font-bold' : 'text-emerald-600'}">
                          ${c.pendencias_abertas > 0 ? `${c.pendencias_abertas} pendências` : '✓ Sem pendências'}
                        </span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-red-50 text-red-700 rounded-xl">Erro: ${err.message}</div>`;
  }
}

// =========================================================================
// 4. TELA: KANBAN GERAL POR COLABORADOR
// =========================================================================
async function renderKanbanColaboradores(container) {
  container.innerHTML = `<div class="flex items-center justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div></div>`;
  
  try {
    const res = await fetch('/api/clientes');
    const clientes = await res.json();

    // Buscar tarefas de todos os clientes ativos
    const promessasTarefas = clientes.map(c => fetch(`/api/clientes/${c.id}`).then(r => r.json()));
    const detalhesClientes = await Promise.all(promessasTarefas);

    let todasTarefas = [];
    detalhesClientes.forEach(det => {
      det.tarefas.forEach(t => {
        todasTarefas.push({
          ...t,
          cliente_nome: det.cliente.razao_social,
          cliente_dominio: det.cliente.codigo_dominio
        });
      });
    });

    container.innerHTML = `
      <div class="space-y-4">
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <h3 class="font-bold text-slate-900 text-sm">Quadro Kanban por Colaborador</h3>
            <p class="text-xs text-slate-500">Veja e acompanhe as atividades distribuídas por membro da equipe técnica</p>
          </div>
          <span class="text-xs font-semibold text-slate-600">${todasTarefas.filter(t => t.status !== 'CONCLUIDO').length} tarefas pendentes no escritório</span>
        </div>

        <div class="flex space-x-3 overflow-x-auto pb-6">
          ${estado.colaboradores.map(colab => {
            const tarefasDoColab = todasTarefas.filter(t => t.responsavel_colaborador_id === colab.id && t.status !== 'CONCLUIDO');
            return `
              <div class="w-80 flex-shrink-0 bg-slate-200/60 rounded-xl p-3 border border-slate-200 flex flex-col max-h-[calc(100vh-210px)]">
                <!-- CABEÇALHO DO COLABORADOR -->
                <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-300">
                  <div class="flex items-center space-x-2">
                    ${obterAvatarColaboradorHtml(colab, 'w-7 h-7')}
                    <div>
                      <h4 class="font-bold text-xs text-slate-900">${colab.nome}</h4>
                      <span class="text-[10px] text-slate-500">${colab.departamento}</span>
                    </div>
                  </div>
                  <span class="bg-white text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold shadow-xs">
                    ${tarefasDoColab.length}
                  </span>
                </div>

                <!-- LISTA DE CARDS DE TAREFAS -->
                <div class="flex-1 overflow-y-auto space-y-2.5">
                  ${tarefasDoColab.length === 0 ? `
                    <div class="h-20 flex items-center justify-center text-slate-400 text-[11px] border-2 border-dashed border-slate-300 rounded-lg">
                      Nenhuma tarefa pendente
                    </div>
                  ` : tarefasDoColab.map(t => {
                    const hoje = new Date().toISOString().split('T')[0];
                    const atrasado = t.prazo_data && t.prazo_data < hoje;
                    return `
                      <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-2">
                        <div class="flex items-center justify-between">
                          <span class="text-[10px] font-bold text-sky-800 bg-sky-50 px-1.5 py-0.2 rounded truncate max-w-[150px]">${t.cliente_nome}</span>
                          <span class="text-[10px] text-slate-400">Etapa 0${t.etapa_numero}</span>
                        </div>

                        <p class="text-xs font-semibold text-slate-800">${t.titulo}</p>

                        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                          <span class="${atrasado ? 'text-red-600 font-bold' : 'text-slate-500'}">
                            ${t.prazo ? `Prazo: ${t.prazo}` : 'Sem prazo'}
                          </span>
                          ${(estado.usuarioLogado?.perfil === 'GESTOR' || estado.usuarioLogado?.perfil === 'ONBOARDING' || t.responsavel_colaborador_id === estado.usuarioLogado?.id || t.departamento === estado.usuarioLogado?.departamento) ? `
                            <button onclick="atualizarCheckRapido('${t.id}', true); navegarPara('kanban-colaboradores');" class="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded text-[10px] font-bold transition">
                              Dar Check ✓
                            </button>
                          ` : `
                            <span class="text-[10px] text-slate-400 font-medium" title="Apenas ${colab.nome} ou Gestores podem concluir esta atividade">🔒 Restrito</span>
                          `}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-red-50 text-red-700 rounded-xl">Erro: ${err.message}</div>`;
  }
}

// =========================================================================
// 5. TELA: FICHA DO ONBOARDING (PLANILHA + KANBANS INTERNOS)
// =========================================================================
async function verDetalhesCliente(clienteId) {
  estado.clienteAtivoId = clienteId;
  navegarPara('cliente-detalhes', clienteId);
}

async function renderClienteDetalhes(container, clienteId) {
  container.innerHTML = `<div class="flex items-center justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div></div>`;
  
  try {
    const res = await fetch(`/api/clientes/${clienteId}`);
    if (!res.ok) throw new Error('Cliente não encontrado.');
    const dados = await res.json();
    estado.clienteDetalhes = dados;

    const { cliente, escopo, tarefas, pendencias, validacoes } = dados;
    const totalTarefas = tarefas.length;
    const concluidas = tarefas.filter(t => t.status === 'CONCLUIDO' || t.status === 'NAO_APLICAVEL').length;
    const pct = totalTarefas > 0 ? Math.round((concluidas / totalTarefas) * 100) : 0;
    const pendenciasAbertas = pendencias.filter(p => p.status === 'ABERTA');
    const validacoesPendentes = validacoes.filter(v => v.aprovado === 0);
    const podeConcluirEtapa7 = pendenciasAbertas.length === 0 && validacoesPendentes.length === 0;

    container.innerHTML = `
      <div class="space-y-4">
        <!-- HEADER DO CLIENTE & BOTÕES PRINCIPAIS -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div class="flex items-center space-x-3">
                <button onclick="navegarPara('clientes')" class="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition" title="Voltar para a Lista de Clientes"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
                <h2 class="text-lg font-bold text-slate-900">${cliente.razao_social}</h2>
                <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full ${cliente.tipo_empresa === 'EM_CONSTITUICAO' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}">
                  ${cliente.tipo_empresa === 'EM_CONSTITUICAO' ? 'Em Constituição' : 'Constituída'}
                </span>
                ${cliente.status_geral === 'CONCLUIDO' ? `<span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">✓ Onboarding Concluído</span>` : ''}
              </div>

              <div class="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2 pl-8">
                <span>Domínio: <strong class="text-slate-800">${cliente.codigo_dominio || 'Não informado'}</strong></span>
                <span>Regime: <strong class="text-slate-800">${cliente.regime_tributario}</strong></span>
                <span>Contato: <strong>${cliente.contato_nome || '—'}</strong> (${cliente.contato_telefone || 'S/ Tel'})</span>
                <span>Início: <strong>${cliente.data_inicio}</strong></span>
              </div>
            </div>

            <!-- BOTÕES SUPERIORES DE AÇÃO -->
            <div class="flex flex-wrap items-center gap-2">
              ${cliente.tipo_empresa === 'EM_CONSTITUICAO' ? `
              <button onclick="abrirModalFichaAbertura('${cliente.id}')" class="inline-flex items-center space-x-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm transition active:scale-95">
                <i data-lucide="file-signature" class="w-4 h-4"></i>
                <span>📑 Ficha Societária & Abertura</span>
              </button>
              ` : `
              <button onclick="abrirModalFichaAbertura('${cliente.id}')" class="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition">
                <i data-lucide="file-signature" class="w-4 h-4 text-amber-600"></i>
                <span>📑 Ficha Societária</span>
              </button>
              `}

              <button onclick="gerarNovaAnaliseIA('${cliente.id}')" class="inline-flex items-center space-x-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition active:scale-95">
                <i data-lucide="sparkles" class="w-4 h-4"></i>
                <span>Auditoria com IA (PDF)</span>
              </button>

              <button onclick="abrirPautaCobranca('${cliente.id}')" class="inline-flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition">
                <i data-lucide="message-square" class="w-4 h-4 text-emerald-600"></i>
                <span>WhatsApp de Cobrança (${pendenciasAbertas.length})</span>
              </button>

              <button onclick="criarPastasServidor('${cliente.id}')" class="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition">
                <i data-lucide="folder-plus" class="w-4 h-4 text-sky-600"></i>
                <span>Pastas no Servidor</span>
              </button>
            </div>
          </div>

          <!-- BARRA DE PROGRESSO & CONTROLE DA ETAPA ATUAL -->
          <div class="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex-1 max-w-xl">
              <div class="flex justify-between text-xs text-slate-600 mb-1">
                <span class="font-semibold">Progresso: ${concluidas} de ${totalTarefas} atividades concluídas</span>
                <span class="font-bold text-sky-700">${pct}%</span>
              </div>
              <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div class="bg-sky-600 h-2 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
              </div>
            </div>

            <!-- SELETOR DE ETAPA ATUAL & BOTÃO DE ENCERRAMENTO -->
            <div class="flex items-center space-x-2">
              <span class="text-xs text-slate-500 font-medium">Etapa do Processo:</span>
              ${estado.usuarioLogado?.perfil === 'TECNICO' ? `
                <div class="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 text-xs font-bold shadow-2xs" title="O avanço e encerramento de etapas é restrito à Coordenação de Onboarding ou Gestores">
                  <span>🔒 Etapa 0${cliente.etapa_atual}: ${ETAPAS_TITULOS[cliente.etapa_atual] || ''}</span>
                </div>
              ` : `
                <select onchange="alterarEtapaCliente('${cliente.id}', this.value)" class="bg-sky-50 border border-sky-300 text-sky-900 text-xs font-bold px-3 py-1.5 rounded-lg focus:outline-none">
                  ${cliente.tipo_empresa === 'EM_CONSTITUICAO' ? `<option value="0" ${cliente.etapa_atual === 0 ? 'selected' : ''}>Etapa 00: Abertura / Constituição</option>` : ''}
                  <option value="1" ${cliente.etapa_atual === 1 ? 'selected' : ''}>Etapa 01: Formalização</option>
                  <option value="2" ${cliente.etapa_atual === 2 ? 'selected' : ''}>Etapa 02: Diagnóstico Inicial</option>
                  <option value="3" ${cliente.etapa_atual === 3 ? 'selected' : ''}>Etapa 03: Documentos e Acessos</option>
                  <option value="4" ${cliente.etapa_atual === 4 ? 'selected' : ''}>Etapa 04: Implantação por Setor</option>
                  <option value="5" ${cliente.etapa_atual === 5 ? 'selected' : ''}>Etapa 05: Alinhamento com Cliente</option>
                  <option value="6" ${cliente.etapa_atual === 6 ? 'selected' : ''}>Etapa 06: Primeiras 3 Entregas</option>
                  <option value="7" ${cliente.etapa_atual === 7 ? 'selected' : ''}>Etapa 07: Validação & Encerramento</option>
                </select>

                <button onclick="tentarEncerrarOnboarding('${cliente.id}')" ${cliente.status_geral === 'CONCLUIDO' ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs ${cliente.status_geral === 'CONCLUIDO' ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : podeConcluirEtapa7 ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}">
                  ${cliente.status_geral === 'CONCLUIDO' ? '✓ Concluído' : '🔒 Concluir Etapa 07'}
                </button>
              `}
            </div>
          </div>
        </div>

        <!-- SELETOR DE MODO DE VISUALIZAÇÃO INTERNA (PLANILHA VS KANBAN) -->
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg">
            <button onclick="alternarModoVisualizacao('planilha')" id="btn-modo-planilha" class="px-3 py-1 rounded-md text-xs font-bold transition ${estado.modoVisualizacaoCliente === 'planilha' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
              <i data-lucide="table" class="w-3.5 h-3.5 inline mr-1"></i> Planilha / Tabela
            </button>
            <button onclick="alternarModoVisualizacao('kanban-status')" id="btn-modo-kanban-status" class="px-3 py-1 rounded-md text-xs font-bold transition ${estado.modoVisualizacaoCliente === 'kanban-status' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
              <i data-lucide="kanban" class="w-3.5 h-3.5 inline mr-1"></i> Kanban por Status
            </button>
            <button onclick="alternarModoVisualizacao('kanban-colaborador')" id="btn-modo-kanban-colaborador" class="px-3 py-1 rounded-md text-xs font-bold transition ${estado.modoVisualizacaoCliente === 'kanban-colaborador' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
              <i data-lucide="users" class="w-3.5 h-3.5 inline mr-1"></i> Kanban por Colaborador
            </button>
          </div>

          <div class="flex items-center space-x-2">
            <button onclick="abrirModalPrazoEtapa()" class="inline-flex items-center space-x-1 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-lg text-xs font-semibold transition">
              <i data-lucide="calendar" class="w-3.5 h-3.5 text-sky-600"></i>
              <span>Definir Prazo em Lote para Etapa</span>
            </button>
          </div>
        </div>

        <!-- ÁREA DINÂMICA CONFORME O MODO DE VISUALIZAÇÃO SELECIONADO -->
        <div id="container-modo-visualizacao"></div>
      </div>
    `;

    renderModoVisualizacaoAtual();
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-red-50 text-red-700 rounded-xl">Erro: ${err.message}</div>`;
  }
}

function alternarModoVisualizacao(modo) {
  estado.modoVisualizacaoCliente = modo;
  renderModoVisualizacaoAtual();

  ['planilha', 'kanban-status', 'kanban-colaborador'].forEach(m => {
    const btn = document.getElementById(`btn-modo-${m}`);
    if (btn) {
      if (m === modo) {
        btn.className = 'px-3 py-1 rounded-md text-xs font-bold transition bg-white text-slate-900 shadow-xs';
      } else {
        btn.className = 'px-3 py-1 rounded-md text-xs font-bold transition text-slate-600 hover:text-slate-900';
      }
    }
  });

  lucide.createIcons();
}

function renderModoVisualizacaoAtual() {
  const container = document.getElementById('container-modo-visualizacao');
  if (!container || !estado.clienteDetalhes) return;

  const { tarefas, cliente } = estado.clienteDetalhes;

  if (estado.modoVisualizacaoCliente === 'planilha') {
    container.innerHTML = `
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <th class="py-3 px-3 w-8 text-center">✓</th>
                <th class="py-3 px-3">Atividade / Procedimento</th>
                <th class="py-3 px-3 w-28">Departamento</th>
                <th class="py-3 px-3 w-40">Responsável</th>
                <th class="py-3 px-3 w-44">Prazo / Expectativa</th>
                <th class="py-3 px-3 w-36">Status</th>
                <th class="py-3 px-3">Observações da Equipe</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${tarefas.map(t => {
                const hoje = new Date().toISOString().split('T')[0];
                const atrasado = t.prazo_data && t.prazo_data < hoje && t.status !== 'CONCLUIDO' && t.status !== 'NAO_APLICAVEL';
                const venceHoje = t.prazo_data === hoje && t.status !== 'CONCLUIDO' && t.status !== 'NAO_APLICAVEL';

                const isGestorOuOnboarding = (estado.usuarioLogado?.perfil === 'GESTOR' || estado.usuarioLogado?.perfil === 'ONBOARDING');
                const isMeuDepartamento = (t.departamento === estado.usuarioLogado?.departamento);
                const isMinhaAtribuicao = (t.responsavel_colaborador_id === estado.usuarioLogado?.id);
                const podeEditarTarefa = isGestorOuOnboarding || isMeuDepartamento || isMinhaAtribuicao;

                return `
                  <tr class="hover:bg-slate-50/80 transition ${!podeEditarTarefa ? 'bg-slate-50/40 text-slate-400' : ''}">
                    <td class="py-2.5 px-3 text-center">
                      ${podeEditarTarefa ? `
                        <input type="checkbox" ${t.status === 'CONCLUIDO' ? 'checked' : ''} onchange="atualizarCheckRapido('${t.id}', this.checked)" class="rounded text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer" title="Marcar como concluída por ${estado.usuarioLogado?.nome || ''}">
                      ` : `
                        <span class="inline-flex items-center justify-center text-slate-300 text-xs" title="Atividade bloqueada: restrita ao departamento ${t.departamento}">🔒</span>
                      `}
                    </td>

                    <td class="py-2.5 px-3">
                      <div class="font-semibold ${t.status === 'CONCLUIDO' ? 'line-through text-slate-400' : podeEditarTarefa ? 'text-slate-900' : 'text-slate-600'}">${t.titulo}</div>
                      <div class="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
                        <span>Etapa 0${t.etapa_numero}</span>
                        ${!podeEditarTarefa ? `<span class="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-semibold text-[9px]">🔒 Restrito ao ${t.departamento}</span>` : ''}
                        ${t.status === 'CONCLUIDO' && t.concluido_por_nome ? `
                          <span class="text-emerald-700 font-medium bg-emerald-50 px-1 rounded">✓ Concluído por ${t.concluido_por_nome} (${t.data_conclusao || ''})</span>
                        ` : ''}
                      </div>
                    </td>

                    <td class="py-2.5 px-3">
                      <span class="inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${
                        t.departamento === 'FISCAL' ? 'bg-emerald-100 text-emerald-800' :
                        t.departamento === 'PESSOAL' ? 'bg-blue-100 text-blue-800' :
                        t.departamento === 'CONTABIL' ? 'bg-purple-100 text-purple-800' :
                        t.departamento === 'PARALEGAL' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-700'
                      }">${t.departamento}</span>
                    </td>

                    <td class="py-2.5 px-3">
                      ${podeEditarTarefa ? `
                        <select onchange="atualizarResponsavelTarefa('${t.id}', this.value)" class="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-800 focus:ring-1 focus:ring-sky-500 focus:outline-none">
                          <option value="">Não atribuído</option>
                          ${estado.colaboradores.map(c => `
                            <option value="${c.id}" ${t.responsavel_colaborador_id === c.id ? 'selected' : ''}>${c.nome}</option>
                          `).join('')}
                        </select>
                      ` : `
                        <span class="text-xs text-slate-500 font-medium">${t.responsavel || 'Não atribuído'}</span>
                      `}
                    </td>

                    <td class="py-2.5 px-3">
                      <div class="flex items-center space-x-1.5">
                        ${podeEditarTarefa ? `
                          <input type="date" value="${t.prazo_data || ''}" onchange="atualizarDataPrazoTarefa('${t.id}', this.value)" class="text-xs px-1.5 py-0.5 border border-slate-200 rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500">
                        ` : `
                          <span class="text-xs text-slate-500 font-mono">${t.prazo || 'Sem prazo'}</span>
                        `}
                        ${atrasado ? `
                          <span class="text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-bold uppercase">Atrasada</span>
                        ` : venceHoje ? `
                          <span class="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-bold uppercase">Hoje</span>
                        ` : t.prazo_data ? `
                          <span class="text-[9px] bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded font-medium">No prazo</span>
                        ` : ''}
                      </div>
                    </td>

                    <td class="py-2.5 px-3">
                      ${podeEditarTarefa ? `
                        <select onchange="atualizarStatusTarefa('${t.id}', this.value)" class="text-xs px-2 py-1 rounded-md border text-slate-800 font-medium focus:outline-none ${STATUS_CORES[t.status]}">
                          ${Object.keys(STATUS_LABELS).map(st => `
                            <option value="${st}" ${t.status === st ? 'selected' : ''}>${STATUS_LABELS[st]}</option>
                          `).join('')}
                        </select>
                      ` : `
                        <span class="text-[10px] px-2 py-0.5 rounded border ${STATUS_CORES[t.status]}">${STATUS_LABELS[t.status]}</span>
                      `}
                    </td>

                    <td class="py-2.5 px-3">
                      ${podeEditarTarefa ? `
                        <input type="text" value="${t.observacoes || ''}" onblur="atualizarObservacaoTarefa('${t.id}', this.value)" placeholder="Anotações da atividade..." class="w-full px-2 py-1 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-300 focus:border-sky-500 rounded text-xs text-slate-700 focus:outline-none transition">
                      ` : `
                        <span class="text-xs text-slate-400 italic">${t.observacoes || 'Sem anotações'}</span>
                      `}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (estado.modoVisualizacaoCliente === 'kanban-status') {
    // KANBAN POR STATUS DAS TAREFAS
    const statusColunas = [
      { id: 'NAO_INICIADO', titulo: 'A Fazer' },
      { id: 'EM_ANDAMENTO', titulo: 'Em Andamento' },
      { id: 'AGUARDANDO_CLIENTE', titulo: 'Aguardando Cliente' },
      { id: 'BLOQUEADO', titulo: 'Bloqueado' },
      { id: 'CONCLUIDO', titulo: 'Concluído' }
    ];

    container.innerHTML = `
      <div class="flex space-x-3 overflow-x-auto pb-6">
        ${statusColunas.map(col => {
          const tarefasCol = tarefas.filter(t => t.status === col.id);
          return `
            <div class="w-72 flex-shrink-0 bg-slate-200/60 rounded-xl p-3 border border-slate-200 flex flex-col max-h-[calc(100vh-270px)]">
              <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-300">
                <h4 class="font-bold text-xs text-slate-800">${col.titulo}</h4>
                <span class="bg-white text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold shadow-xs">
                  ${tarefasCol.length}
                </span>
              </div>

              <div class="flex-1 overflow-y-auto space-y-2">
                ${tarefasCol.length === 0 ? `
                  <div class="h-16 flex items-center justify-center text-slate-400 text-[11px] border-2 border-dashed border-slate-300 rounded-lg">
                    Vazio
                  </div>
                ` : tarefasCol.map(t => {
                  const isGestorOuOnboarding = (estado.usuarioLogado?.perfil === 'GESTOR' || estado.usuarioLogado?.perfil === 'ONBOARDING');
                  const podeEditar = isGestorOuOnboarding || (t.departamento === estado.usuarioLogado?.departamento) || (t.responsavel_colaborador_id === estado.usuarioLogado?.id);

                  return `
                    <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-1.5 ${!podeEditar ? 'opacity-80 bg-slate-50/60' : ''}">
                      <div class="flex items-center justify-between text-[10px]">
                        <span class="font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">${t.departamento}</span>
                        <span class="text-slate-400">Etapa 0${t.etapa_numero}</span>
                      </div>

                      <p class="text-xs font-semibold ${t.status === 'CONCLUIDO' ? 'line-through text-slate-400' : 'text-slate-900'}">${t.titulo}</p>
                      
                      <div class="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <span>${t.responsavel || 'Não atribuído'}</span>
                        ${podeEditar ? `
                          <select onchange="atualizarStatusTarefa('${t.id}', this.value)" class="text-[10px] px-1 py-0.5 rounded border">
                            ${Object.keys(STATUS_LABELS).map(st => `
                              <option value="${st}" ${t.status === st ? 'selected' : ''}>${STATUS_LABELS[st]}</option>
                            `).join('')}
                          </select>
                        ` : `
                          <span class="text-[10px] text-slate-400 font-medium">🔒 ${t.departamento}</span>
                        `}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (estado.modoVisualizacaoCliente === 'kanban-colaborador') {
    // KANBAN POR COLABORADOR DENTRO DO CLIENTE
    container.innerHTML = `
      <div class="flex space-x-3 overflow-x-auto pb-6">
        ${estado.colaboradores.map(colab => {
          const tarefasColab = tarefas.filter(t => t.responsavel_colaborador_id === colab.id);
          return `
            <div class="w-72 flex-shrink-0 bg-slate-200/60 rounded-xl p-3 border border-slate-200 flex flex-col max-h-[calc(100vh-270px)]">
              <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-300">
                <div class="flex items-center space-x-2">
                  <div class="w-6 h-6 rounded-full text-white font-bold flex items-center justify-center text-[10px]" style="background-color: ${colab.cor_avatar || '#0284c7'}">
                    ${colab.nome.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </div>
                  <h4 class="font-bold text-xs text-slate-900 truncate">${colab.nome}</h4>
                </div>
                <span class="bg-white text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold shadow-xs">
                  ${tarefasColab.length}
                </span>
              </div>

              <div class="flex-1 overflow-y-auto space-y-2">
                ${tarefasColab.length === 0 ? `
                  <div class="h-16 flex items-center justify-center text-slate-400 text-[11px] border-2 border-dashed border-slate-300 rounded-lg">
                    Nenhuma tarefa
                  </div>
                ` : tarefasColab.map(t => {
                  const isGestorOuOnboarding = (estado.usuarioLogado?.perfil === 'GESTOR' || estado.usuarioLogado?.perfil === 'ONBOARDING');
                  const podeEditar = isGestorOuOnboarding || (t.departamento === estado.usuarioLogado?.departamento) || (t.responsavel_colaborador_id === estado.usuarioLogado?.id);

                  return `
                    <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-1.5">
                      <div class="flex items-center justify-between text-[10px]">
                        <span class="font-bold px-1.5 py-0.2 rounded ${STATUS_CORES[t.status]}">${STATUS_LABELS[t.status]}</span>
                        <span class="text-slate-400">Etapa 0${t.etapa_numero}</span>
                      </div>

                      <p class="text-xs font-semibold ${t.status === 'CONCLUIDO' ? 'line-through text-slate-400' : 'text-slate-900'}">${t.titulo}</p>

                      <div class="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span class="text-slate-400">${t.prazo || 'Sem data'}</span>
                        ${podeEditar ? `
                          <button onclick="atualizarCheckRapido('${t.id}', ${t.status !== 'CONCLUIDO'})" class="px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'CONCLUIDO' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white'} transition">
                            ${t.status === 'CONCLUIDO' ? 'Desmarcar' : 'Dar Check ✓'}
                          </button>
                        ` : `
                          <span class="text-[10px] text-slate-400 font-medium">🔒 Restrito</span>
                        `}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}

// =========================================================================
// ATUALIZAÇÃO DE TAREFAS COM RASTREABILIDADE DO USUÁRIO LOGADO
// =========================================================================
async function atualizarCheckRapido(tarefaId, marcado) {
  const status = marcado ? 'CONCLUIDO' : 'NAO_INICIADO';
  const usuario = estado.usuarioLogado || { id: null, nome: 'Colaborador' };

  try {
    await fetch(`/api/tarefas/${tarefaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome
      })
    });

    mostrarToast(marcado ? `Concluído por ${usuario.nome}!` : 'Tarefa desmarcada.', 'sucesso');
    const res = await fetch(`/api/clientes/${estado.clienteAtivoId}`);
    estado.clienteDetalhes = await res.json();
    renderModoVisualizacaoAtual();
  } catch (e) {
    mostrarToast('Erro ao atualizar tarefa.', 'erro');
  }
}

async function atualizarResponsavelTarefa(tarefaId, colabId) {
  const usuario = estado.usuarioLogado || { id: null, nome: 'Colaborador' };
  try {
    await fetch(`/api/tarefas/${tarefaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responsavel_colaborador_id: colabId,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome
      })
    });
    mostrarToast('Responsável alterado!', 'sucesso');
  } catch (e) {
    mostrarToast('Erro ao atribuir.', 'erro');
  }
}

async function atualizarDataPrazoTarefa(tarefaId, dataPrazo) {
  try {
    await fetch(`/api/tarefas/${tarefaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prazo_data: dataPrazo })
    });
    mostrarToast('Prazo atualizado!', 'sucesso');
    const res = await fetch(`/api/clientes/${estado.clienteAtivoId}`);
    estado.clienteDetalhes = await res.json();
    renderModoVisualizacaoAtual();
  } catch (e) {}
}

async function atualizarStatusTarefa(tarefaId, status) {
  let justificativa = null;
  if (status === 'NAO_APLICAVEL') {
    justificativa = prompt('Informe a justificativa obrigatória para Não Aplicável:');
    if (!justificativa) return;
  }
  const usuario = estado.usuarioLogado || { id: null, nome: 'Colaborador' };
  try {
    await fetch(`/api/tarefas/${tarefaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        justificativa_nao_aplicavel: justificativa,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome
      })
    });
    mostrarToast('Status alterado!', 'sucesso');
    const res = await fetch(`/api/clientes/${estado.clienteAtivoId}`);
    estado.clienteDetalhes = await res.json();
    renderModoVisualizacaoAtual();
  } catch (e) {}
}

async function atualizarObservacaoTarefa(tarefaId, obs) {
  try {
    await fetch(`/api/tarefas/${tarefaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observacoes: obs })
    });
  } catch (e) {}
}

// Prazo em Lote
function abrirModalPrazoEtapa() {
  const numEtapa = estado.clienteDetalhes.cliente.etapa_atual;
  document.getElementById('titulo-modal-prazo-etapa').textContent = `Definir Prazo para a Etapa 0${numEtapa}`;
  document.getElementById('modal-prazo-etapa').classList.remove('hidden');
}

function fecharModalPrazoEtapa() {
  document.getElementById('modal-prazo-etapa').classList.add('hidden');
}

async function aplicarPrazoLoteEtapa() {
  const dataPrazo = document.getElementById('input-prazo-lote-data').value;
  if (!dataPrazo) { alert('Escolha uma data.'); return; }
  const numEtapa = estado.clienteDetalhes.cliente.etapa_atual;
  const usuario = estado.usuarioLogado || { nome: 'Coordenador' };

  try {
    await fetch(`/api/clientes/${estado.clienteAtivoId}/definir-prazo-etapa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etapa_numero: numEtapa, prazo_data: dataPrazo, usuario_nome: usuario.nome })
    });
    fecharModalPrazoEtapa();
    mostrarToast(`Prazo da Etapa 0${numEtapa} atualizado para todas as atividades!`, 'sucesso');
    renderClienteDetalhes(document.getElementById('view-container'), estado.clienteAtivoId);
  } catch (err) {
    alert(err.message);
  }
}

// Trava Etapa 07
async function tentarEncerrarOnboarding(clienteId) {
  const usuario = estado.usuarioLogado || { nome: 'Coordenador' };
  try {
    const res = await fetch(`/api/clientes/${clienteId}/mudar-etapa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nova_etapa: 7, concluir_onboarding: true, usuario_nome: usuario.nome })
    });
    const resJson = await res.json();
    if (!res.ok) {
      alert(`⚠️ TRAVA DE SEGURANÇA DA ETAPA 07 ATIVADA:\n\n${resJson.error}\n\nResolva todas as pendências e emita o aceite dos setores antes de encerrar.`);
      return;
    }
    mostrarToast('🎉 ONBOARDING CONCLUÍDO COM SUCESSO!', 'sucesso');
    renderClienteDetalhes(document.getElementById('view-container'), clienteId);
  } catch (err) {
    alert(err.message);
  }
}

async function alterarEtapaCliente(clienteId, novaEtapa) {
  const usuario = estado.usuarioLogado || { nome: 'Coordenador' };
  try {
    await fetch(`/api/clientes/${clienteId}/mudar-etapa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nova_etapa: parseInt(novaEtapa, 10), usuario_nome: usuario.nome })
    });
    mostrarToast(`Etapa alterada para Etapa 0${novaEtapa}`, 'sucesso');
    renderClienteDetalhes(document.getElementById('view-container'), clienteId);
  } catch (e) {}
}

// =========================================================================
// 6. IA: VISUALIZADOR DE PDF EXECUTIVO COM EMOJIS & CARDS
// =========================================================================
async function gerarNovaAnaliseIA(clienteId) {
  const modal = document.getElementById('modal-relatorio-ia');
  const loading = document.getElementById('relatorio-ia-loading');
  const folha = document.getElementById('folha-pdf-imprimivel');
  const corpo = document.getElementById('pdf-corpo-conteudo');

  modal.classList.remove('hidden');
  loading.classList.remove('hidden');
  folha.classList.add('hidden');
  lucide.createIcons();

  try {
    const res = await fetch(`/api/clientes/${clienteId}/gerar-analise-ia`, { method: 'POST' });
    const dados = await res.json();
    if (!res.ok) throw new Error(dados.error || 'Erro ao gerar análise.');

    // Preencher dados na folha PDF timbrada
    document.getElementById('pdf-razao-social').textContent = dados.cliente_nome || estado.clienteDetalhes.cliente.razao_social;
    document.getElementById('pdf-dados-cadastrais').textContent = `${estado.clienteDetalhes.cliente.regime_tributario} • ${estado.clienteDetalhes.cliente.tipo_empresa === 'EM_CONSTITUICAO' ? 'Abertura' : 'Constituída'}`;
    document.getElementById('pdf-pct-conclusao').textContent = `${dados.pct}%`;
    document.getElementById('pdf-data-emissao').textContent = dados.data_emissao;
    document.getElementById('pdf-etapa-badge').textContent = `Etapa 0${estado.clienteDetalhes.cliente.etapa_atual}`;

    // Renderizar o markdown formatado em cartões executivos limpos com emojis
    corpo.innerHTML = renderMarkdownParaHTMLPDF(dados.conteudo_analise);
    window.ultimoRelatorioTexto = dados.conteudo_analise;

    loading.classList.add('hidden');
    folha.classList.remove('hidden');
    lucide.createIcons();
  } catch (err) {
    loading.classList.add('hidden');
    folha.classList.remove('hidden');
    corpo.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-lg">Erro ao processar relatório: ${err.message}</div>`;
  }
}

// Parser amigável para transformar markdown em cartões visuais humanizados estilo PDF
function renderMarkdownParaHTMLPDF(md) {
  const linhas = md.split('\n');
  let html = '';
  let emCard = false;

  linhas.forEach(linha => {
    linha = linha.trim();
    if (!linha) return;

    if (linha.startsWith('### ')) {
      if (emCard) { html += `</div>`; }
      html += `<div class="pdf-secao-card"><h4>${linha.replace('### ', '')}</h4>`;
      emCard = true;
    } else if (linha.startsWith('• ') || linha.startsWith('- ')) {
      const item = linha.replace(/^[•\-]\s*/, '');
      html += `<p class="mb-1 text-slate-700 leading-relaxed">${formatarNegrito(item)}</p>`;
    } else if (linha.startsWith('↳ ')) {
      html += `<p class="ml-4 mb-2 text-slate-500 text-[11px] font-medium">${formatarNegrito(linha)}</p>`;
    } else if (linha.startsWith('1. ') || linha.startsWith('2. ') || linha.startsWith('3. ')) {
      html += `<p class="ml-2 mb-1.5 font-semibold text-slate-800">${formatarNegrito(linha)}</p>`;
    } else if (!linha.startsWith('#') && !linha.startsWith('---')) {
      html += `<p class="mb-2 text-slate-700">${formatarNegrito(linha)}</p>`;
    }
  });

  if (emCard) html += `</div>`;
  return html;
}

function formatarNegrito(txt) {
  return txt
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

function fecharModalRelatorioIA() {
  document.getElementById('modal-relatorio-ia').classList.add('hidden');
}

function imprimirRelatorioPDF() {
  window.print();
}

function copiarRelatorioIA() {
  if (window.ultimoRelatorioTexto) {
    navigator.clipboard.writeText(window.ultimoRelatorioTexto).then(() => {
      const btn = document.getElementById('btn-copiar-relatorio');
      btn.textContent = '✓ Copiado!';
      setTimeout(() => btn.textContent = 'Copiar Texto', 2000);
      mostrarToast('Relatório copiado!', 'sucesso');
    });
  }
}

// =========================================================================
// 7. GESTÃO DE COLABORADORES & PERFIS (NOTION STYLE + FOTOS + RBAC)
// =========================================================================
let filtroDepartamentoColab = 'TODOS';

async function renderColaboradores(container) {
  await carregarColaboradores();

  const isGestor = (estado.usuarioLogado?.perfil === 'GESTOR');
  const usuarioLogadoId = estado.usuarioLogado?.id;
  const colabs = estado.colaboradores || [];

  // Contadores
  const totalColabs = colabs.length;
  const totalGestores = colabs.filter(c => c.perfil === 'GESTOR').length;
  const totalOnboarding = colabs.filter(c => c.perfil === 'ONBOARDING').length;
  const totalTecnicos = colabs.filter(c => c.perfil === 'TECNICO' || !c.perfil).length;
  const totalAtivos = colabs.filter(c => c.ativo !== 0).length;

  const listaFiltrada = filtroDepartamentoColab === 'TODOS'
    ? colabs
    : colabs.filter(c => (c.departamento || '').toUpperCase() === filtroDepartamentoColab);

  container.innerHTML = `
    <div class="space-y-5 max-w-7xl mx-auto">
      
      <!-- CABEÇALHO NOTION -->
      <div class="bg-white p-5 rounded-2xl border border-[#EDEDEB] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center space-x-2.5">
            <div class="w-9 h-9 rounded-xl bg-[#FAF6EE] text-[#0A213D] border border-[#E8D7B5] flex items-center justify-center font-bold">
              <i data-lucide="users" class="w-5 h-5 text-[#C5A059]"></i>
            </div>
            <div>
              <h3 class="font-bold text-[#0A213D] text-base">Equipe & Colaboradores</h3>
              <p class="text-xs text-[#787774]">Gestão de perfis, fotos, departamentos e controle de permissões de acesso (RBAC)</p>
            </div>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          ${isGestor ? `
            <button onclick="abrirModalNovoColaborador()" class="inline-flex items-center space-x-2 px-4 py-2 bg-[#0A213D] hover:bg-[#153358] text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95">
              <i data-lucide="user-plus" class="w-4 h-4 text-[#C5A059]"></i>
              <span>Novo Colaborador</span>
            </button>
          ` : `
            <button onclick="abrirModalEditarColaborador('${usuarioLogadoId}')" class="inline-flex items-center space-x-2 px-4 py-2 bg-[#0A213D] hover:bg-[#153358] text-white rounded-xl text-xs font-bold shadow-xs transition">
              <i data-lucide="user-cog" class="w-4 h-4 text-[#C5A059]"></i>
              <span>Editar Meu Perfil</span>
            </button>
          `}
        </div>
      </div>

      <!-- CARDS DE RESUMO DE ACESSOS -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-[#EDEDEB] shadow-2xs">
          <span class="text-[11px] text-[#787774] font-medium block">Total da Equipe</span>
          <div class="flex items-baseline space-x-2 mt-1">
            <span class="text-xl font-extrabold text-[#0A213D]">${totalColabs}</span>
            <span class="text-[11px] text-emerald-600 font-semibold">${totalAtivos} ativos</span>
          </div>
        </div>

        <div class="bg-white p-3.5 rounded-xl border border-[#EDEDEB] shadow-2xs">
          <span class="text-[11px] text-[#787774] font-medium block">👑 Gestão Executiva</span>
          <div class="flex items-baseline space-x-2 mt-1">
            <span class="text-xl font-extrabold text-[#9A7736]">${totalGestores}</span>
            <span class="text-[10px] text-[#787774]">Acesso irrestrito</span>
          </div>
        </div>

        <div class="bg-white p-3.5 rounded-xl border border-[#EDEDEB] shadow-2xs">
          <span class="text-[11px] text-[#787774] font-medium block">🚀 Onboarding</span>
          <div class="flex items-baseline space-x-2 mt-1">
            <span class="text-xl font-extrabold text-sky-700">${totalOnboarding}</span>
            <span class="text-[10px] text-[#787774]">Todos os clientes</span>
          </div>
        </div>

        <div class="bg-white p-3.5 rounded-xl border border-[#EDEDEB] shadow-2xs">
          <span class="text-[11px] text-[#787774] font-medium block">🔒 Técnicos</span>
          <div class="flex items-baseline space-x-2 mt-1">
            <span class="text-xl font-extrabold text-[#2F3437]">${totalTecnicos}</span>
            <span class="text-[10px] text-[#787774]">Setor & tarefas próprias</span>
          </div>
        </div>
      </div>

      <!-- FILTRO POR DEPARTAMENTO (NOTION PILLS) -->
      <div class="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
        ${['TODOS', 'PARALEGAL', 'FISCAL', 'PESSOAL', 'CONTABIL', 'IMPLANTACAO', 'DIRETORIA'].map(dep => `
          <button onclick="filtrarColaboradoresDepartamento('${dep}')" class="px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
            filtroDepartamentoColab === dep 
              ? 'bg-[#0A213D] text-white font-bold shadow-2xs' 
              : 'bg-white text-[#787774] border border-[#EDEDEB] hover:bg-[#F7F7F5] hover:text-[#0A213D]'
          }">
            ${dep === 'TODOS' ? 'Todos os Setores' : dep}
          </button>
        `).join('')}
      </div>

      <!-- GRID DE CARDS DOS COLABORADORES -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${listaFiltrada.map(c => {
          const isSelf = (c.id === usuarioLogadoId);
          const podeEditar = isGestor || isSelf;
          const ativo = (c.ativo !== 0);

          let perfilBadgeHtml = '';
          if (c.perfil === 'GESTOR') {
            perfilBadgeHtml = `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FAF6EE] text-[#9A7736] border border-[#E8D7B5]"><span>👑</span><span>Gestor</span></span>`;
          } else if (c.perfil === 'ONBOARDING') {
            perfilBadgeHtml = `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200"><span>🚀</span><span>Onboarding</span></span>`;
          } else {
            perfilBadgeHtml = `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#F7F7F5] text-[#606770] border border-[#EDEDEB]"><span>🔒</span><span>Técnico</span></span>`;
          }

          let depBadgeHtml = '';
          const dep = (c.departamento || '').toUpperCase();
          if (dep === 'PARALEGAL') depBadgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Paralegal</span>`;
          else if (dep === 'FISCAL') depBadgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Fiscal</span>`;
          else if (dep === 'PESSOAL') depBadgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">Pessoal / DP</span>`;
          else if (dep === 'CONTABIL') depBadgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">Contábil</span>`;
          else if (dep === 'DIRETORIA') depBadgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FAF6EE] text-[#9A7736] border border-[#E8D7B5]">Diretoria</span>`;
          else depBadgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">${c.departamento || 'Geral'}</span>`;

          return `
            <div class="bg-white rounded-2xl border border-[#EDEDEB] p-4.5 shadow-2xs hover:shadow-xs transition duration-150 flex flex-col justify-between space-y-4 ${!ativo ? 'opacity-70 bg-slate-50/60' : ''}">
              
              <!-- TOPO: AVATAR, NOME, CARGO, PERFIL -->
              <div>
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center space-x-3 min-w-0">
                    <div class="relative flex-shrink-0">
                      ${obterAvatarColaboradorHtml(c, 'w-13 h-13 text-sm', 'border-2 border-[#C5A059] shadow-xs')}
                      ${ativo ? `
                        <span class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" title="Usuário Ativo"></span>
                      ` : `
                        <span class="absolute bottom-0 right-0 w-3 h-3 bg-rose-500 border-2 border-white rounded-full" title="Usuário Inativo"></span>
                      `}
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center space-x-1.5">
                        <h4 class="font-bold text-sm text-[#0A213D] truncate">${c.nome}</h4>
                        ${isSelf ? '<span class="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-sky-100 text-sky-800">Você</span>' : ''}
                      </div>
                      <p class="text-xs text-[#787774] truncate">${c.cargo || c.departamento || 'Colaborador'}</p>
                    </div>
                  </div>

                  <div class="flex flex-col items-end space-y-1 flex-shrink-0">
                    ${perfilBadgeHtml}
                  </div>
                </div>

                <!-- BADGES DO SETOR E STATUS -->
                <div class="flex items-center space-x-2 mt-3 pt-3 border-t border-[#EDEDEB]">
                  ${depBadgeHtml}
                  ${ativo 
                    ? `<span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Ativo</span>`
                    : `<span class="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">Inativo</span>`
                  }
                </div>

                <!-- CONTATO E PIN -->
                <div class="text-xs text-[#606770] space-y-1.5 mt-3 pt-2.5 border-t border-[#EDEDEB]/70">
                  ${c.email ? `
                    <div class="flex items-center space-x-2 truncate">
                      <i data-lucide="mail" class="w-3.5 h-3.5 text-[#787774] flex-shrink-0"></i>
                      <span class="truncate">${c.email}</span>
                    </div>
                  ` : ''}
                  ${c.telefone ? `
                    <div class="flex items-center space-x-2 truncate">
                      <i data-lucide="phone" class="w-3.5 h-3.5 text-[#787774] flex-shrink-0"></i>
                      <span>${c.telefone}</span>
                    </div>
                  ` : ''}
                  <div class="flex items-center justify-between text-[11px] text-[#787774] pt-0.5">
                    <span class="flex items-center space-x-1.5">
                      <i data-lucide="key-round" class="w-3.5 h-3.5 text-[#C5A059]"></i>
                      <span>PIN Individual:</span>
                    </span>
                    <span class="font-mono font-bold text-[#0A213D] bg-[#F7F7F5] px-2 py-0.5 rounded border border-[#EDEDEB]">
                      ${(isGestor || isSelf) ? (c.pin || '1234') : '••••'}
                    </span>
                  </div>
                </div>

                <!-- MÉTRICAS DE ATIVIDADE -->
                <div class="grid grid-cols-2 gap-2 mt-3 p-2 bg-[#F7F7F5] rounded-xl border border-[#EDEDEB] text-center">
                  <div>
                    <span class="block text-[10px] text-[#787774] uppercase font-bold">Tarefas Ativas</span>
                    <strong class="text-xs text-[#0A213D] font-bold">${c.tarefas_ativas || 0}</strong>
                  </div>
                  <div>
                    <span class="block text-[10px] text-[#787774] uppercase font-bold">Concluídas</span>
                    <strong class="text-xs text-emerald-700 font-bold">${c.tarefas_concluidas_total || 0}</strong>
                  </div>
                </div>
              </div>

              <!-- RODAPÉ DE AÇÕES -->
              <div class="pt-3 border-t border-[#EDEDEB] flex items-center justify-between text-xs">
                <div class="flex items-center space-x-1.5">
                  ${podeEditar ? `
                    <button onclick="abrirModalEditarColaborador('${c.id}')" class="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-[#F7F7F5] text-[#0A213D] border border-[#EDEDEB] rounded-lg font-semibold text-[11px] transition shadow-2xs" title="Editar foto, permissões e dados cadastrais">
                      <i data-lucide="edit-3" class="w-3.5 h-3.5 text-[#C5A059]"></i>
                      <span>Editar</span>
                    </button>
                  ` : ''}

                  ${isGestor && c.email ? `
                    <button onclick="enviarConviteColaborador('${c.id}', '${(c.nome || 'Colaborador').replace(/'/g, "\\'")}')" class="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#FAF6EE] hover:bg-[#F3EADA] text-[#0A213D] border border-[#E8D7B5] rounded-lg font-semibold text-[11px] transition" title="Enviar ou Gerar Link de Definição de Senha / Primeiro Acesso">
                      <i data-lucide="key-round" class="w-3.5 h-3.5 text-[#C5A059]"></i>
                      <span>Link Senha</span>
                    </button>
                  ` : ''}
                  
                  <button onclick="navegarPara('meu-painel', '${c.id}')" class="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#FAF6EE] hover:bg-[#F3EADA] text-[#9A7736] border border-[#E8D7B5] rounded-lg font-semibold text-[11px] transition" title="Abrir Cockpit & IA de Produtividade deste colaborador">
                    <i data-lucide="layout-dashboard" class="w-3.5 h-3.5 text-[#C5A059]"></i>
                    <span>Cockpit</span>
                  </button>
                </div>

                ${isGestor && !isSelf ? `
                  <button onclick="removerColaborador('${c.id}')" class="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition" title="Excluir Colaborador">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                ` : ''}
              </div>

            </div>
          `;
        }).join('')}
      </div>

    </div>
  `;

  lucide.createIcons();
}

function filtrarColaboradoresDepartamento(dep) {
  filtroDepartamentoColab = dep;
  renderColaboradores(document.getElementById('view-container'));
}

// -------------------------------------------------------------------------
// MODAL DE CADASTRO & EDIÇÃO DE COLABORADOR (FOTO + PERFIL + PIN)
// -------------------------------------------------------------------------
function abrirModalNovoColaborador() {
  const isGestor = (estado.usuarioLogado?.perfil === 'GESTOR');
  if (!isGestor) {
    mostrarToast('Apenas a Diretoria / Gestor Geral pode cadastrar novos membros.', 'alerta');
    return;
  }

  document.getElementById('colab-form-id').value = '';
  document.getElementById('colab-form-foto-base64').value = '';
  const inputRemovida = document.getElementById('colab-form-foto-removida');
  if (inputRemovida) inputRemovida.value = '0';

  document.getElementById('modal-colab-titulo').textContent = 'Cadastrar Novo Colaborador';
  document.getElementById('colab-form-nome').value = '';
  document.getElementById('colab-form-cargo').value = '';
  document.getElementById('colab-form-email').value = '';
  document.getElementById('colab-form-telefone').value = '';
  document.getElementById('colab-form-cor').value = '#0A213D';
  document.getElementById('colab-form-departamento').value = 'FISCAL';
  document.getElementById('colab-form-perfil').value = 'TECNICO';
  document.getElementById('colab-form-pin').value = '';
  document.getElementById('colab-form-pin').placeholder = 'Deixe em branco para envio de link';
  document.getElementById('colab-form-ativo').value = '1';

  // Preview padrão
  const preview = document.getElementById('preview-colab-avatar');
  if (preview) {
    preview.innerHTML = `<span class="text-sm font-bold text-[#0A213D]">NOVO</span>`;
  }
  const btnRemover = document.getElementById('btn-remover-foto-colab');
  if (btnRemover) btnRemover.classList.add('hidden');

  // Habilitar campos para gestor
  document.getElementById('colab-form-perfil').disabled = false;
  document.getElementById('colab-form-departamento').disabled = false;
  document.getElementById('colab-form-ativo').disabled = false;

  document.getElementById('modal-colaborador-form').classList.remove('hidden');
  lucide.createIcons();
}

function abrirModalEditarColaborador(colabId) {
  const colab = (estado.colaboradores || []).find(c => c.id === colabId);
  if (!colab) {
    mostrarToast('Colaborador não encontrado.', 'erro');
    return;
  }

  const isGestor = (estado.usuarioLogado?.perfil === 'GESTOR');
  const isSelf = (estado.usuarioLogado?.id === colabId);

  if (!isGestor && !isSelf) {
    mostrarToast('Você não possui permissão para editar outros colaboradores.', 'alerta');
    return;
  }

  document.getElementById('colab-form-id').value = colab.id;
  document.getElementById('colab-form-foto-base64').value = '';
  const inputRemovida = document.getElementById('colab-form-foto-removida');
  if (inputRemovida) inputRemovida.value = '0';

  document.getElementById('modal-colab-titulo').textContent = `Editar Perfil: ${colab.nome}`;
  document.getElementById('colab-form-nome').value = colab.nome || '';
  document.getElementById('colab-form-cargo').value = colab.cargo || '';
  document.getElementById('colab-form-email').value = colab.email || '';
  document.getElementById('colab-form-telefone').value = colab.telefone || '';
  document.getElementById('colab-form-cor').value = colab.cor_avatar || '#0A213D';
  document.getElementById('colab-form-departamento').value = colab.departamento || 'FISCAL';
  document.getElementById('colab-form-perfil').value = colab.perfil || 'TECNICO';
  document.getElementById('colab-form-pin').value = '';
  document.getElementById('colab-form-pin').placeholder = 'Deixe em branco para manter a atual';
  document.getElementById('colab-form-ativo').value = colab.ativo === 0 ? '0' : '1';

  // Preview da foto
  const preview = document.getElementById('preview-colab-avatar');
  const btnRemover = document.getElementById('btn-remover-foto-colab');

  if (colab.foto_url) {
    if (preview) preview.innerHTML = `<img src="${colab.foto_url}" alt="${colab.nome}" class="w-full h-full object-cover">`;
    if (btnRemover) btnRemover.classList.remove('hidden');
  } else {
    const iniciais = (colab.nome || 'CL').split(' ').map(n => n[0]).slice(0, 2).join('');
    if (preview) {
      preview.innerHTML = `<div class="w-full h-full flex items-center justify-center font-bold text-white text-sm" style="background-color: ${colab.cor_avatar || '#0A213D'}">${iniciais}</div>`;
    }
    if (btnRemover) btnRemover.classList.add('hidden');
  }

  // Trava de perfil e departamento caso não seja gestor
  document.getElementById('colab-form-perfil').disabled = !isGestor;
  document.getElementById('colab-form-departamento').disabled = !isGestor;
  document.getElementById('colab-form-ativo').disabled = !isGestor;

  document.getElementById('modal-colaborador-form').classList.remove('hidden');
  lucide.createIcons();
}

function fecharModalColaboradorForm() {
  document.getElementById('modal-colaborador-form').classList.add('hidden');
  const form = document.getElementById('form-colaborador');
  if (form) form.reset();
}

function processarUploadFotoColab(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    mostrarToast('A imagem deve ter no máximo 5MB.', 'erro');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    document.getElementById('colab-form-foto-base64').value = base64;
    const inputRemovida = document.getElementById('colab-form-foto-removida');
    if (inputRemovida) inputRemovida.value = '0';

    const preview = document.getElementById('preview-colab-avatar');
    if (preview) {
      preview.innerHTML = `<img src="${base64}" alt="Preview" class="w-full h-full object-cover">`;
    }
    const btnRemover = document.getElementById('btn-remover-foto-colab');
    if (btnRemover) btnRemover.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function removerFotoColab() {
  document.getElementById('colab-form-foto-base64').value = '';
  const fileInput = document.getElementById('input-colab-arquivo-foto');
  if (fileInput) fileInput.value = '';

  const inputRemovida = document.getElementById('colab-form-foto-removida');
  if (inputRemovida) inputRemovida.value = '1';

  const nome = document.getElementById('colab-form-nome').value || 'Colaborador';
  const iniciais = nome.split(' ').map(n => n[0]).slice(0, 2).join('');
  const cor = document.getElementById('colab-form-cor').value || '#0A213D';

  const preview = document.getElementById('preview-colab-avatar');
  if (preview) {
    preview.innerHTML = `<div class="w-full h-full flex items-center justify-center font-bold text-white text-sm" style="background-color: ${cor}">${iniciais}</div>`;
  }
  const btnRemover = document.getElementById('btn-remover-foto-colab');
  if (btnRemover) btnRemover.classList.add('hidden');
}

async function salvarColaboradorForm(event) {
  event.preventDefault();

  const id = document.getElementById('colab-form-id').value;
  const nome = document.getElementById('colab-form-nome').value.trim();
  const cargo = document.getElementById('colab-form-cargo').value.trim();
  const email = document.getElementById('colab-form-email').value.trim();
  const telefone = document.getElementById('colab-form-telefone').value.trim();
  const cor_avatar = document.getElementById('colab-form-cor').value;
  const departamento = document.getElementById('colab-form-departamento').value;
  const perfil = document.getElementById('colab-form-perfil').value;
  const pinDigitado = document.getElementById('colab-form-pin').value.trim();
  const ativo = parseInt(document.getElementById('colab-form-ativo').value, 10);
  const fotoBase64 = document.getElementById('colab-form-foto-base64').value;
  const fotoRemovida = document.getElementById('colab-form-foto-removida')?.value === '1';

  if (!nome || !cargo || !departamento) {
    mostrarToast('Preencha os campos obrigatórios (*).', 'alerta');
    return;
  }

  try {
    let finalId = id;

    if (id) {
      // 1. ATUALIZAR COLABORADOR EXISTENTE
      const payload = {
        nome,
        cargo,
        email,
        telefone,
        cor_avatar
      };

      if (pinDigitado) {
        payload.pin = pinDigitado;
      }

      const isGestor = (estado.usuarioLogado?.perfil === 'GESTOR');
      if (isGestor) {
        payload.departamento = departamento;
        payload.perfil = perfil;
        payload.ativo = ativo;
      }

      if (fotoRemovida) {
        payload.foto_url = null;
      }

      const res = await fetch(`/api/colaboradores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || 'Erro ao atualizar colaborador.');

      // Se houver nova foto, envia upload
      if (fotoBase64) {
        const resFoto = await fetch(`/api/colaboradores/${id}/foto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: fotoBase64, nome_original: 'avatar.png' })
        });
        const resFotoJson = await resFoto.json();
        if (!resFoto.ok) throw new Error(resFotoJson.error || 'Erro ao salvar foto de perfil.');
      }

      mostrarToast('Perfil e permissões atualizados com sucesso!', 'sucesso');
    } else {
      // 2. CADASTRAR NOVO COLABORADOR
      const pinFinal = pinDigitado || Math.random().toString(36).substring(2, 10);
      const payload = {
        nome,
        cargo,
        email,
        telefone,
        cor_avatar,
        departamento,
        perfil,
        pin: pinFinal
      };

      const res = await fetch('/api/colaboradores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || 'Erro ao cadastrar colaborador.');

      finalId = resJson.id;

      // Se enviou foto junto no cadastro
      if (fotoBase64 && finalId) {
        await fetch(`/api/colaboradores/${finalId}/foto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: fotoBase64, nome_original: 'avatar.png' })
        });
      }

      if (resJson.link_ativacao) {
        if (resJson.email_enviado) {
          mostrarToast(`Colaborador cadastrado! E-mail de confirmação enviado para ${email}.`, 'sucesso');
        } else {
          mostrarToast('Novo colaborador cadastrado com sucesso!', 'sucesso');
          prompt('Link de ativação gerado! Copie para enviar ao colaborador:', resJson.link_ativacao);
        }
      } else {
        mostrarToast('Novo colaborador cadastrado com sucesso!', 'sucesso');
      }
    }

    // Se o usuário editou seu próprio perfil, atualiza na sessão
    if (estado.usuarioLogado && (estado.usuarioLogado.id === finalId)) {
      await carregarColaboradores();
      const usuarioAtualizado = estado.colaboradores.find(c => c.id === finalId);
      if (usuarioAtualizado) {
        estado.usuarioLogado = usuarioAtualizado;
        atualizarDisplayUsuarioLogado();
      }
    } else {
      await carregarColaboradores();
    }

    fecharModalColaboradorForm();

    // Re-renderiza a tela atual se for relevante
    const container = document.getElementById('view-container');
    if (document.getElementById('nav-colaboradores')?.classList.contains('bg-[#0A213D]')) {
      renderColaboradores(container);
    } else if (document.getElementById('nav-equipe-metricas')?.classList.contains('bg-[#0A213D]')) {
      renderDashboardEquipe(container);
    } else if (document.getElementById('nav-meu-painel')?.classList.contains('bg-[#0A213D]')) {
      renderMeuCockpitColaborador(container, estado.usuarioLogado?.id);
    }

  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function removerColaborador(colabId) {
  const colab = (estado.colaboradores || []).find(c => c.id === colabId);
  const nome = colab ? colab.nome : 'este colaborador';

  if (!confirm(`Tem certeza que deseja excluir ${nome}? Esta ação é irreversível.`)) return;

  try {
    const res = await fetch(`/api/colaboradores/${colabId}`, { method: 'DELETE' });
    const resJson = await res.json();
    if (!res.ok) throw new Error(resJson.error || 'Erro ao excluir colaborador.');

    mostrarToast('Colaborador removido com sucesso.', 'sucesso');
    await carregarColaboradores();
    renderColaboradores(document.getElementById('view-container'));
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

// =========================================================================
// 8. PASTAS E WHATSAPP
// =========================================================================
async function criarPastasServidor(clienteId) {
  try {
    const res = await fetch(`/api/clientes/${clienteId}/criar-pastas`, { method: 'POST' });
    const resJson = await res.json();
    if (!res.ok) throw new Error(resJson.error || 'Erro ao criar pastas.');

    mostrarToast(`Pastas criadas em: ${resJson.caminho}`, 'sucesso');
    fetch('/api/abrir-pasta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caminho: resJson.caminho })
    });
    renderClienteDetalhes(document.getElementById('view-container'), clienteId);
  } catch (err) {
    alert(err.message);
  }
}

async function abrirPautaCobranca(clienteId) {
  try {
    const res = await fetch(`/api/clientes/${clienteId}/pauta-cobranca`);
    const dados = await res.json();
    document.getElementById('pauta-texto-conteudo').value = dados.mensagem;
    document.getElementById('pauta-contador-itens').textContent = `${dados.total_pendencias} pendência(s)`;
    document.getElementById('modal-pauta-cobranca').classList.remove('hidden');
    lucide.createIcons();
  } catch (e) {
    alert('Erro ao carregar pauta.');
  }
}

function fecharModalPautaCobranca() {
  document.getElementById('modal-pauta-cobranca').classList.add('hidden');
}

function copiarPautaCobranca() {
  const el = document.getElementById('pauta-texto-conteudo');
  el.select();
  navigator.clipboard.writeText(el.value).then(() => {
    const btn = document.getElementById('btn-copiar-texto');
    btn.textContent = '✓ Mensagem Copiada!';
    setTimeout(() => btn.textContent = 'Copiar Mensagem', 2000);
    mostrarToast('Copiado para o WhatsApp!', 'sucesso');
  });
}

// =========================================================================
// 9. CENTRAL DE PENDÊNCIAS
// =========================================================================
async function renderCentralPendencias(container) {
  container.innerHTML = `<div class="flex items-center justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div></div>`;
  
  try {
    const res = await fetch('/api/pendencias');
    const pendencias = await res.json();

    container.innerHTML = `
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 class="font-bold text-slate-900 text-sm">Pendências Gerais com Clientes</h3>
            <p class="text-xs text-slate-500">Documentos e acessos que estão travando os processos de onboarding</p>
          </div>
          <span class="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
            ${pendencias.filter(p => p.status === 'ABERTA').length} ativas
          </span>
        </div>

        <div class="space-y-2.5">
          ${pendencias.length === 0 ? `
            <div class="p-8 text-center text-slate-400 text-xs">Nenhuma pendência cadastrada.</div>
          ` : pendencias.map(p => `
            <div class="p-3.5 rounded-xl border ${p.status === 'RESOLVIDA' ? 'bg-slate-50 border-slate-200 opacity-60' : p.bloqueante ? 'bg-red-50/60 border-red-200' : 'bg-white border-slate-200'} flex items-start justify-between">
              <div>
                <div class="flex items-center space-x-2">
                  <span class="font-bold text-xs text-slate-900">${p.razao_social}</span>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">${p.departamento_origem}</span>
                  ${p.bloqueante ? `<span class="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.2 rounded">Bloqueante</span>` : ''}
                </div>
                <p class="text-xs font-semibold text-slate-800 mt-1">${p.titulo}</p>
                ${p.descricao ? `<p class="text-xs text-slate-500">${p.descricao}</p>` : ''}
              </div>

              <div class="flex items-center space-x-2">
                ${p.status === 'ABERTA' ? `
                  <button onclick="resolverPendenciaRapida('${p.id}')" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition">
                    Resolver
                  </button>
                ` : `<span class="text-xs text-emerald-700 font-bold">✓ Resolvida</span>`}
                <button onclick="verDetalhesCliente('${p.cliente_id}')" class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition">
                  Ver Ficha
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-red-50 text-red-700 rounded-xl">Erro: ${err.message}</div>`;
  }
}

async function resolverPendenciaRapida(pendId) {
  const obs = prompt('Informe a observação da resolução:', 'Documento conferido');
  if (obs === null) return;
  const usuario = estado.usuarioLogado || { nome: 'Colaborador' };
  try {
    await fetch(`/api/pendencias/${pendId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVIDA', resolucao_obs: obs, usuario_nome: usuario.nome })
    });
    mostrarToast('Pendência resolvida!', 'sucesso');
    renderCentralPendencias(document.getElementById('view-container'));
  } catch (e) {}
}

// =========================================================================
// 10. CONFIGURAÇÕES & IA
// =========================================================================
async function renderConfiguracoes(container) {
  await carregarConfiguracoes();

  container.innerHTML = `
    <div class="max-w-2xl bg-white rounded-2xl border border-[#EDEDEB] shadow-2xs p-6 space-y-6">
      <div class="flex items-center space-x-3 pb-4 border-b border-[#EDEDEB]">
        <div class="w-10 h-10 rounded-xl bg-[#FAF6EE] text-[#9A7736] border border-[#E8D7B5] flex items-center justify-center font-bold">
          <i data-lucide="settings-2" class="w-5 h-5 text-[#C5A059]"></i>
        </div>
        <div>
          <h3 class="font-bold text-[#0A213D] text-base">Configurações do Servidor & IA</h3>
          <p class="text-xs text-[#787774]">Parâmetros de rede local e provedores gratuitos de Inteligência Artificial para suporte e diagnósticos.</p>
        </div>
      </div>

      <form onsubmit="salvarConfiguracoes(event)" class="space-y-5 text-xs text-[#2F3437]">
        <div>
          <label class="block font-bold text-[#0A213D] mb-1">Caminho das Pastas no Servidor Local / Rede</label>
          <input type="text" name="caminho_base_servidor" value="${estado.config.caminho_base_servidor || 'C:\\ServidorContabil\\Clientes'}" class="w-full px-3 py-2 bg-[#F7F7F5] border border-[#EDEDEB] rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#0A213D] focus:outline-none">
          <p class="text-[11px] text-[#787774] mt-1">Ex: <code>C:\\ServidorContabil\\Clientes</code> ou <code>\\\\servidor\\clientes</code></p>
        </div>

        <div>
          <label class="block font-bold text-[#0A213D] mb-1">Nome do Escritório</label>
          <input type="text" name="nome_escritorio" value="${estado.config.nome_escritorio || 'Josana Mota Contabilidade'}" class="w-full px-3 py-2 bg-[#F7F7F5] border border-[#EDEDEB] rounded-lg text-xs focus:ring-2 focus:ring-[#0A213D] focus:outline-none font-semibold">
          <p class="text-[11px] text-[#787774] mt-1">Exibido nos links de WhatsApp e cabeçalhos oficiais de documentos</p>
        </div>

        <!-- SEÇÃO: PROVEDORES GRATUITOS DE IA -->
        <div class="p-4 bg-[#FAF6EE] rounded-2xl border border-[#E8D7B5] space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 text-[#9A7736] font-bold">
              <i data-lucide="sparkles" class="w-4 h-4 text-[#C5A059]"></i>
              <span>Inteligência Artificial (Provedores 100% Gratuitos)</span>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-[#9A7736] border border-[#E8D7B5]">Opcional</span>
          </div>

          <p class="text-[11px] text-[#8F6C27] leading-relaxed">
            O sistema já conta com o <strong>Motor Cognitivo Sara</strong> integrado localmente (sem necessidade de nenhuma chave). Mas você pode turbinar com os modelos em nuvem do <strong>Google Gemini</strong> ou <strong>Groq Cloud</strong> gratuitamente sem cartão de crédito:
          </p>

          <div class="space-y-3 pt-2">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="font-bold text-[#0A213D]">Google Gemini API Key (Grátis):</label>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="text-[10px] text-sky-700 hover:underline font-semibold flex items-center space-x-1">
                  <span>Obter chave grátis no Google AI Studio</span>
                  <i data-lucide="external-link" class="w-3 h-3"></i>
                </a>
              </div>
              <input type="password" name="gemini_api_key" value="${estado.config.gemini_api_key || ''}" placeholder="AIzaSy..." class="w-full px-3 py-2 bg-white border border-[#E8D7B5] rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#0A213D] focus:outline-none">
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="font-bold text-[#0A213D]">Groq Cloud API Key (Llama 3.3 70B Grátis & Ultra Rápido):</label>
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" class="text-[10px] text-sky-700 hover:underline font-semibold flex items-center space-x-1">
                  <span>Obter chave grátis no Groq Console</span>
                  <i data-lucide="external-link" class="w-3 h-3"></i>
                </a>
              </div>
              <input type="password" name="groq_api_key" value="${estado.config.groq_api_key || ''}" placeholder="gsk_..." class="w-full px-3 py-2 bg-white border border-[#E8D7B5] rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#0A213D] focus:outline-none">
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-[#EDEDEB] flex justify-end">
          <button type="submit" class="px-5 py-2.5 bg-[#0A213D] hover:bg-[#153358] text-white rounded-xl font-bold shadow-xs transition flex items-center space-x-1.5">
            <i data-lucide="check" class="w-4 h-4 text-[#C5A059]"></i>
            <span>Salvar Configurações</span>
          </button>
        </div>
      </form>
    </div>
  `;

  lucide.createIcons();
}

async function salvarConfiguracoes(event) {
  event.preventDefault();
  const form = event.target;
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caminho_base_servidor: form.caminho_base_servidor.value.trim(),
        nome_escritorio: form.nome_escritorio.value.trim(),
        gemini_api_key: form.gemini_api_key.value.trim(),
        groq_api_key: form.groq_api_key?.value.trim() || ''
      })
    });
    mostrarToast('Configurações e chaves de IA salvas!', 'sucesso');
    await carregarConfiguracoes();
  } catch (e) {
    mostrarToast('Erro ao salvar configurações.', 'erro');
  }
}

// =========================================================================
// NOVO ONBOARDING
// =========================================================================
function abrirModalNovoCliente() {
  atualizarSelectsSquad();
  document.getElementById('modal-novo-cliente').classList.remove('hidden');
}

function fecharModalNovoCliente() {
  document.getElementById('modal-novo-cliente').classList.add('hidden');
  document.getElementById('form-novo-cliente').reset();
}

async function salvarNovoCliente(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const usuario = estado.usuarioLogado || { nome: 'Comercial' };

  const dados = {
    tipo_empresa: formData.get('tipo_empresa'),
    razao_social: formData.get('razao_social').trim(),
    codigo_dominio: formData.get('codigo_dominio') ? formData.get('codigo_dominio').trim() : '',
    regime_tributario: formData.get('regime_tributario'),
    contato_nome: formData.get('contato_nome') ? formData.get('contato_nome').trim() : '',
    contato_telefone: formData.get('contato_telefone') ? formData.get('contato_telefone').trim() : '',
    resp_paralegal_id: formData.get('resp_paralegal_id') || null,
    resp_fiscal_id: formData.get('resp_fiscal_id') || null,
    resp_pessoal_id: formData.get('resp_pessoal_id') || null,
    resp_contabil_id: formData.get('resp_contabil_id') || null,
    usuario_nome: usuario.nome,
    escopo: {
      tem_paralegal: formData.get('tem_paralegal') !== null,
      tem_fiscal: formData.get('tem_fiscal') !== null,
      tem_pessoal: formData.get('tem_pessoal') !== null,
      tem_contabil: formData.get('tem_contabil') !== null,
      tem_terceiro_setor: formData.get('tem_terceiro_setor') !== null
    }
  };

  try {
    const res = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    const resJson = await res.json();
    if (!res.ok) throw new Error(resJson.error || 'Erro ao cadastrar.');

    fecharModalNovoCliente();
    mostrarToast('Onboarding iniciado com sucesso!', 'sucesso');
    verDetalhesCliente(resJson.id);
  } catch (err) {
    alert(err.message);
  }
}

// Toast Notificações
function mostrarToast(mensagem, tipo = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const cor = tipo === 'sucesso' ? 'bg-emerald-600 text-white' : tipo === 'erro' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white';

  toast.className = `p-3.5 rounded-xl shadow-xl flex items-center space-x-2 text-xs font-semibold pointer-events-auto transition-all transform duration-200 translate-y-2 opacity-0 ${cor}`;
  toast.innerHTML = `<span>${mensagem}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// =========================================================================
// MÓDULO DE ABERTURA / FICHA SOCIETÁRIA & CONSTITUIÇÃO DE EMPRESAS (V3)
// =========================================================================

estado.fichaAtiva = null;
estado.sociosAtivos = [];
estado.documentosAtivos = [];
estado.cnaePrincipalAtivo = null;
estado.cnaesSecundariosAtivos = [];

// Formatação e busca automática instantânea de CEP (sem precisar clicar)
async function formatarEAutobuscarCep(input, tipo, socioId = null) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 8) v = v.substring(0, 8);
  
  if (v.length > 5) {
    input.value = v.substring(0, 5) + '-' + v.substring(5);
  } else {
    input.value = v;
  }

  if (v.length === 8) {
    input.classList.add('border-sky-500', 'bg-sky-50/30');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${v}/json/`);
      const data = await res.json();
      if (!data.erro) {
        if (tipo === 'empresa') {
          const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
          setV('abr-rua-empresa', data.logradouro);
          setV('abr-bairro-empresa', data.bairro);
          setV('abr-cidade-empresa', data.localidade);
          setV('abr-uf-empresa', data.uf);
          document.getElementById('abr-num-empresa')?.focus();
          mostrarToast(`Endereço da sede preenchido: ${data.localidade}/${data.uf}`, 'sucesso');
        } else if (tipo === 'socio' && socioId) {
          const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
          setV(`soc-rua-${socioId}`, data.logradouro);
          setV(`soc-bairro-${socioId}`, data.bairro);
          setV(`soc-cidade-${socioId}`, data.localidade);
          setV(`soc-uf-${socioId}`, data.uf);
          document.getElementById(`soc-num-${socioId}`)?.focus();
          mostrarToast(`Endereço residencial do sócio preenchido!`, 'sucesso');
        } else if (tipo === 'externo-empresa') {
          const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
          setV('cli-rua', data.logradouro);
          setV('cli-bairro', data.bairro);
          setV('cli-cidade', data.localidade);
          setV('cli-uf', data.uf);
          document.getElementById('cli-num')?.focus();
        } else if (tipo === 'externo-socio' && socioId !== null) {
          const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
          setV(`cli-soc-rua-${socioId}`, data.logradouro);
          setV(`cli-soc-bairro-${socioId}`, data.bairro);
          setV(`cli-soc-cidade-${socioId}`, data.localidade);
          setV(`cli-soc-uf-${socioId}`, data.uf);
          document.getElementById(`cli-soc-num-${socioId}`)?.focus();
        }
      }
    } catch (e) {}
    input.classList.remove('bg-sky-50/30');
  }
}

// =========================================================================
// MOTOR DE BUSCA INTERNA DE CNAEs & ENQUADRAMENTO TRIBUTÁRIO
// =========================================================================

let timeoutBuscaCnae = null;

function buscarCnaesTempoReal(termo) {
  clearTimeout(timeoutBuscaCnae);
  const dropdown = document.getElementById('dropdown-resultados-cnae');
  if (!dropdown) return;

  if (!termo || termo.trim().length < 2) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    return;
  }

  timeoutBuscaCnae = setTimeout(async () => {
    try {
      const res = await fetch(`/api/cnaes?q=${encodeURIComponent(termo)}`);
      const resultados = await res.json();

      if (resultados.length === 0) {
        dropdown.innerHTML = `
          <div class="p-3 text-center text-xs text-slate-500">
            Nenhum CNAE encontrado para "<strong>${termo}</strong>". Tente palavras como <em>software, consultoria, roupas, mercado, médico, estética...</em>
          </div>
        `;
        dropdown.classList.remove('hidden');
        return;
      }

      dropdown.innerHTML = resultados.map(c => `
        <div class="p-2.5 rounded-lg hover:bg-indigo-50/60 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition">
          <div class="space-y-0.5 max-w-xl">
            <div class="flex items-center space-x-2">
              <strong class="font-mono text-xs text-indigo-950 font-bold">${c.codigo}</strong>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${c.fator_r ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'}">
                ${c.anexo}
              </span>
            </div>
            <p class="text-xs text-slate-800 font-medium leading-snug">${c.denominacao}</p>
            <p class="text-[10px] text-slate-500">${c.aliquota_inicial} ${c.fator_r ? '• ⚠️ Sujeito ao Fator R (Folha >= 28%)' : ''}</p>
          </div>
          <div class="flex items-center space-x-1.5 flex-shrink-0">
            <button type="button" onclick="definirCnaePrincipal('${c.codigo}', '${c.denominacao.replace(/'/g, "\\'")}', '${c.anexo}', ${c.fator_r})" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-bold shadow-2xs transition">
              + Principal
            </button>
            <button type="button" onclick="adicionarCnaeSecundario('${c.codigo}', '${c.denominacao.replace(/'/g, "\\'")}', '${c.anexo}')" class="px-2 py-1 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-300 rounded text-[11px] font-semibold transition">
              + Secundário
            </button>
          </div>
        </div>
      `).join('');

      dropdown.classList.remove('hidden');
    } catch (e) {}
  }, 250);
}

function definirCnaePrincipal(codigo, denominacao, anexo, fatorR) {
  estado.cnaePrincipalAtivo = { codigo, denominacao, anexo, fatorR };
  const box = document.getElementById('box-cnae-principal');
  const input = document.getElementById('abr-cnae-principal');
  if (input) input.value = `${codigo} - ${denominacao}`;

  if (box) {
    box.innerHTML = `
      <div class="flex items-center justify-between bg-indigo-50 border border-indigo-200 p-2 rounded-lg">
        <div>
          <span class="font-mono font-bold text-indigo-900">${codigo}</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ml-1 bg-indigo-200 text-indigo-900">${anexo}</span>
          <p class="text-xs text-slate-800 font-medium mt-0.5">${denominacao}</p>
        </div>
        <button type="button" onclick="removerCnaePrincipal()" class="text-slate-400 hover:text-rose-600 p-1" title="Remover"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
    `;
    lucide.createIcons();
  }

  atualizarTextareaCnaesCompilados();
  document.getElementById('dropdown-resultados-cnae')?.classList.add('hidden');
  mostrarToast(`CNAE Principal ${codigo} definido!`, 'sucesso');
}

function removerCnaePrincipal() {
  estado.cnaePrincipalAtivo = null;
  const box = document.getElementById('box-cnae-principal');
  const input = document.getElementById('abr-cnae-principal');
  if (input) input.value = '';
  if (box) box.innerHTML = `<span class="text-slate-400 italic">Nenhum CNAE principal definido ainda.</span>`;
  atualizarTextareaCnaesCompilados();
}

function adicionarCnaeSecundario(codigo, denominacao, anexo) {
  if (estado.cnaesSecundariosAtivos.some(c => c.codigo === codigo)) {
    return alert('Este CNAE secundário já foi adicionado.');
  }

  estado.cnaesSecundariosAtivos.push({ codigo, denominacao, anexo });
  renderCnaesSecundariosUI();
  atualizarTextareaCnaesCompilados();
  document.getElementById('dropdown-resultados-cnae')?.classList.add('hidden');
  mostrarToast(`CNAE Secundário ${codigo} adicionado!`, 'info');
}

function removerCnaeSecundario(codigo) {
  estado.cnaesSecundariosAtivos = estado.cnaesSecundariosAtivos.filter(c => c.codigo !== codigo);
  renderCnaesSecundariosUI();
  atualizarTextareaCnaesCompilados();
}

function renderCnaesSecundariosUI() {
  const container = document.getElementById('lista-cnaes-secundarios');
  const input = document.getElementById('abr-cnaes-secundarios');
  if (!container) return;

  if (estado.cnaesSecundariosAtivos.length === 0) {
    container.innerHTML = `<span class="text-slate-400 italic text-xs">Nenhum secundário adicionado.</span>`;
    if (input) input.value = '';
    return;
  }

  container.innerHTML = estado.cnaesSecundariosAtivos.map(c => `
    <span class="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-lg text-xs font-medium text-slate-800">
      <strong class="font-mono font-bold text-indigo-900">${c.codigo}</strong>
      <span class="max-w-[140px] truncate" title="${c.denominacao}">${c.denominacao}</span>
      <button type="button" onclick="removerCnaeSecundario('${c.codigo}')" class="text-slate-400 hover:text-rose-600 ml-1 font-bold">✕</button>
    </span>
  `).join('');

  if (input) {
    input.value = JSON.stringify(estado.cnaesSecundariosAtivos);
  }
}

function atualizarTextareaCnaesCompilados() {
  const textarea = document.getElementById('abr-cnaes-sugeridos');
  if (!textarea) return;

  let texto = '';
  if (estado.cnaePrincipalAtivo) {
    texto += `[PRINCIPAL] ${estado.cnaePrincipalAtivo.codigo} - ${estado.cnaePrincipalAtivo.denominacao} (${estado.cnaePrincipalAtivo.anexo})\n`;
  }
  if (estado.cnaesSecundariosAtivos.length > 0) {
    texto += `[SECUNDÁRIOS]\n`;
    estado.cnaesSecundariosAtivos.forEach(c => {
      texto += `• ${c.codigo} - ${c.denominacao} (${c.anexo})\n`;
    });
  }

  textarea.value = texto.trim();
}

// =========================================================================
// ABERTURA DA FICHA SOCIETÁRIA & GESTÃO DE DOCUMENTOS
// =========================================================================

async function abrirModalFichaAbertura(clienteId) {
  try {
    estado.clienteAtivoId = clienteId;
    const res = await fetch(`/api/clientes/${clienteId}/ficha-abertura`);
    if (!res.ok) throw new Error('Não foi possível carregar a ficha de abertura.');
    const dados = await res.json();

    estado.fichaAtiva = dados.ficha;
    estado.sociosAtivos = dados.socios || [];
    estado.documentosAtivos = dados.documentos || [];

    const f = dados.ficha;
    const cliente = estado.clienteDetalhes?.cliente || {};

    const tituloEl = document.getElementById('abertura-modal-titulo');
    if (tituloEl) tituloEl.textContent = `Ficha Societária • ${cliente.razao_social || f.razao_social_op1 || 'Empresa'}`;

    const badgeEl = document.getElementById('abertura-status-badge');
    if (badgeEl) {
      if (f.concluido_abertura) {
        badgeEl.textContent = '✓ Abertura Concluída';
        badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800';
      } else {
        badgeEl.textContent = 'Em Constituição';
        badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800';
      }
    }

    // Se o cliente já enviou dados via WhatsApp/link externo
    const cardEnvio = document.getElementById('card-dados-cliente-envio');
    if (cardEnvio) {
      if (f.data_envio_cliente) {
        cardEnvio.classList.remove('hidden');
        const dt = new Date(f.data_envio_cliente).toLocaleString('pt-BR');
        document.getElementById('txt-data-envio-cliente').textContent = `Informações Enviadas pelo Cliente via Link em ${dt}`;
        document.getElementById('txt-atividades-cliente').textContent = f.atividades_descricao || '—';
        document.getElementById('txt-quotas-cliente').textContent = f.divisao_quotas || '100% Sócio Administrador';
        document.getElementById('txt-obs-cliente').textContent = f.observacoes_cliente || 'Nenhuma observação informada.';
        document.getElementById('txt-fat-cliente').textContent = `R$ ${Number(f.faturamento_estimado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('txt-func-cliente').textContent = f.qtd_funcionarios_inicial || '0';
        document.getElementById('txt-senha-gov-cliente').textContent = f.senha_gov ? f.senha_gov : 'Não informada';

        const boxResp = document.getElementById('box-resp-tec-cliente');
        if (boxResp) {
          if (f.possui_resp_tecnico && f.resp_tecnico_nome) {
            boxResp.classList.remove('hidden');
            document.getElementById('txt-resp-tec-cliente').textContent = `${f.resp_tecnico_nome} (${f.resp_tecnico_conselho || ''} ${f.resp_tecnico_numero || ''}/${f.resp_tecnico_estado || ''})`;
          } else {
            boxResp.classList.add('hidden');
          }
        }
      } else {
        cardEnvio.classList.add('hidden');
      }
    }

    // Preencher campos gerais
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    setVal('abr-razao-op1', f.razao_social_op1 || cliente.razao_social);
    setVal('abr-razao-op2', f.razao_social_op2);
    setVal('abr-razao-op3', f.razao_social_op3);
    setVal('abr-nome-fantasia', f.nome_fantasia || cliente.nome_fantasia);
    setVal('abr-natureza-juridica', f.natureza_juridica || 'LTDA');
    setVal('abr-capital-social', f.capital_social || '10000.00');
    setVal('abr-divisao-quotas', f.divisao_quotas || '10.000 quotas a R$ 1,00');
    setVal('abr-atividades-desc', f.atividades_descricao);
    setVal('abr-cnaes-sugeridos', f.cnaes_sugeridos);

    // CNAE principal e secundários
    if (f.cnae_principal) {
      const partes = f.cnae_principal.split(' - ');
      definirCnaePrincipal(partes[0] || '', partes[1] || f.cnae_principal, 'Simples', false);
    } else {
      removerCnaePrincipal();
    }

    try {
      if (f.cnaes_secundarios) {
        estado.cnaesSecundariosAtivos = JSON.parse(f.cnaes_secundarios);
        renderCnaesSecundariosUI();
      } else {
        estado.cnaesSecundariosAtivos = [];
        renderCnaesSecundariosUI();
      }
    } catch (e) {
      estado.cnaesSecundariosAtivos = [];
      renderCnaesSecundariosUI();
    }

    // Endereço e imóvel
    setVal('abr-cep-empresa', f.cep_empresa);
    setVal('abr-rua-empresa', f.rua_empresa);
    setVal('abr-num-empresa', f.numero_empresa);
    setVal('abr-comp-empresa', f.complemento_empresa);
    setVal('abr-ref-empresa', f.ponto_referencia_empresa);
    setVal('abr-bairro-empresa', f.bairro_empresa);
    setVal('abr-cidade-empresa', f.cidade_empresa);
    setVal('abr-uf-empresa', f.estado_empresa);
    setVal('abr-tipo-imovel', f.tipo_imovel || 'PROPRIO');
    setVal('abr-insc-iptu', f.inscricao_iptu);
    setVal('abr-proprietario-nome', f.proprietario_nome);
    setVal('abr-proprietario-doc', f.proprietario_doc);

    // Protocolos
    setVal('abr-status-viabilidade', f.status_viabilidade || 'PENDENTE');
    setVal('abr-proto-viabilidade', f.protocolo_viabilidade);
    setVal('abr-proto-dbe', f.protocolo_dbe);
    setVal('abr-proto-junta', f.protocolo_junta);
    setVal('abr-cnpj-gerado', f.cnpj_gerado || cliente.cnpj_cpf);
    setVal('abr-insc-municipal', f.inscricao_municipal);
    setVal('abr-status-alvara', f.status_alvara || 'PENDENTE');

    // Acessos e Resp Técnico
    const chkCert = document.getElementById('abr-possui-certificado');
    if (chkCert) chkCert.checked = !!f.possui_certificado;

    setVal('abr-senha-gov', f.senha_gov);

    const chkResp = document.getElementById('abr-possui-resp-tecnico');
    if (chkResp) {
      chkResp.checked = !!f.possui_resp_tecnico;
      toggleRespTecnicoCampos(!!f.possui_resp_tecnico);
    }
    setVal('abr-resp-tec-nome', f.resp_tecnico_nome);
    setVal('abr-resp-tec-cpf', f.resp_tecnico_cpf);
    setVal('abr-resp-tec-conselho', f.resp_tecnico_conselho);
    setVal('abr-resp-tec-numero', f.resp_tecnico_numero);
    setVal('abr-resp-tec-estado', f.resp_tecnico_estado);

    // Renderizar sócios e documentos
    renderListaSociosAbertura();
    renderGradeDocumentosAbertura();

    // Controle RBAC para Ficha Societária:
    // Apenas GESTOR, ONBOARDING ou TECNICO do setor PARALEGAL podem alterar dados
    const usuario = estado.usuarioLogado;
    const ehTecnicoNaoParalegal = usuario && usuario.perfil === 'TECNICO' && usuario.departamento !== 'PARALEGAL';

    const avisoLeitura = document.getElementById('aviso-ficha-somente-leitura');
    const btnSalvar = document.getElementById('btn-salvar-ficha-abertura');
    const btnConcluir = document.getElementById('btn-concluir-abertura');
    const btnAddSocio = document.getElementById('btn-adicionar-socio-abertura');

    if (ehTecnicoNaoParalegal) {
      if (avisoLeitura) avisoLeitura.classList.remove('hidden');
      if (btnSalvar) btnSalvar.classList.add('hidden');
      if (btnConcluir) btnConcluir.classList.add('hidden');
      if (btnAddSocio) btnAddSocio.classList.add('hidden');

      document.querySelectorAll('#modal-ficha-abertura input, #modal-ficha-abertura select, #modal-ficha-abertura textarea').forEach(el => {
        el.disabled = true;
      });
    } else {
      if (avisoLeitura) avisoLeitura.classList.add('hidden');
      if (btnSalvar) btnSalvar.classList.remove('hidden');
      if (btnConcluir) btnConcluir.classList.remove('hidden');
      if (btnAddSocio) btnAddSocio.classList.remove('hidden');

      document.querySelectorAll('#modal-ficha-abertura input, #modal-ficha-abertura select, #modal-ficha-abertura textarea').forEach(el => {
        el.disabled = false;
      });
    }

    document.getElementById('modal-ficha-abertura').classList.remove('hidden');
    lucide.createIcons();
  } catch (err) {
    alert(err.message);
  }
}

function fecharModalFichaAbertura() {
  document.getElementById('modal-ficha-abertura').classList.add('hidden');
}

function toggleRespTecnicoCampos(ativo) {
  const cont = document.getElementById('container-resp-tecnico');
  if (cont) {
    if (ativo) cont.classList.remove('hidden');
    else cont.classList.add('hidden');
  }
}

function renderListaSociosAbertura() {
  const container = document.getElementById('lista-socios-abertura');
  if (!container) return;

  const usuario = estado.usuarioLogado;
  const ehTecnicoNaoParalegal = usuario && usuario.perfil === 'TECNICO' && usuario.departamento !== 'PARALEGAL';
  const dis = ehTecnicoNaoParalegal ? 'disabled' : '';

  const socios = estado.sociosAtivos;
  const totalQuotas = socios.reduce((acc, s) => acc + (parseFloat(s.percentual_quotas) || 0), 0);
  const capitalSocial = parseFloat(document.getElementById('abr-capital-social')?.value) || 0;

  const badgeQuotas = document.getElementById('badge-total-quotas');
  if (badgeQuotas) {
    if (Math.abs(totalQuotas - 100) < 0.01) {
      badgeQuotas.textContent = `✓ Quotas 100% Distribuídas (R$ ${capitalSocial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
      badgeQuotas.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300';
    } else {
      badgeQuotas.textContent = `⚠️ Quotas: ${totalQuotas.toFixed(1)}% de 100%`;
      badgeQuotas.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300';
    }
  }

  if (socios.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
        <p class="text-slate-500 font-medium">Nenhum sócio cadastrado ainda.</p>
        ${ehTecnicoNaoParalegal ? '' : `<button type="button" onclick="adicionarNovoSocioAbertura()" class="mt-2 text-xs text-sky-600 font-bold hover:underline">+ Adicionar Primeiro Sócio</button>`}
      </div>
    `;
    return;
  }

  container.innerHTML = socios.map((s, idx) => `
    <div class="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3.5" id="card-socio-${s.id}">
      <div class="flex items-center justify-between pb-2 border-b border-slate-200">
        <div class="flex items-center space-x-2">
          <span class="w-6 h-6 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs">${idx + 1}</span>
          <h5 class="font-bold text-slate-800 text-xs">${s.nome_completo || 'Sócio Sem Nome'}</h5>
          ${s.is_administrador ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">Sócio-Administrador</span>` : ''}
        </div>
        ${ehTecnicoNaoParalegal ? '' : `
        <div class="flex items-center space-x-2">
          <button type="button" onclick="salvarSocioAbertura('${s.id}')" class="px-2.5 py-1 bg-white hover:bg-slate-100 text-purple-700 border border-purple-200 rounded text-xs font-semibold shadow-2xs transition">Salvar Sócio</button>
          <button type="button" onclick="excluirSocioAbertura('${s.id}')" class="p-1 text-slate-400 hover:text-rose-600 rounded transition" title="Excluir este sócio"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
        `}
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
        <div class="sm:col-span-2">
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Nome Completo *</label>
          <input type="text" id="soc-nome-${s.id}" value="${s.nome_completo || ''}" ${dis} class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">CPF *</label>
          <input type="text" id="soc-cpf-${s.id}" value="${s.cpf || ''}" placeholder="000.000.000-00" ${dis} class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">RG / Órgão</label>
          <div class="flex space-x-1">
            <input type="text" id="soc-rg-${s.id}" value="${s.rg || ''}" placeholder="RG" ${dis} class="w-2/3 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs">
            <input type="text" id="soc-orgao-${s.id}" value="${s.orgao_emissor || ''}" placeholder="SSP/SP" ${dis} class="w-1/3 px-1.5 py-1.5 bg-white border border-slate-300 rounded text-xs uppercase">
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Nascimento</label>
          <input type="date" id="soc-nasc-${s.id}" value="${s.data_nascimento || ''}" ${dis} class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Estado Civil</label>
          <select id="soc-civil-${s.id}" ${dis} class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs">
            <option value="Solteiro(a)" ${s.estado_civil === 'Solteiro(a)' ? 'selected' : ''}>Solteiro(a)</option>
            <option value="Casado(a)" ${s.estado_civil === 'Casado(a)' ? 'selected' : ''}>Casado(a)</option>
            <option value="Divorciado(a)" ${s.estado_civil === 'Divorciado(a)' ? 'selected' : ''}>Divorciado(a)</option>
            <option value="União Estável" ${s.estado_civil === 'União Estável' ? 'selected' : ''}>União Estável</option>
            <option value="Viúvo(a)" ${s.estado_civil === 'Viúvo(a)' ? 'selected' : ''}>Viúvo(a)</option>
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Regime de Casamento</label>
          <input type="text" id="soc-regime-${s.id}" value="${s.regime_casamento || ''}" placeholder="Ex: Comunhão Parcial" ${dis} class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Profissão</label>
          <input type="text" id="soc-profissao-${s.id}" value="${s.profissao || ''}" placeholder="Ex: Médico, Administrador" ${dis} class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs">
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">WhatsApp / Celular</label>
          <input type="text" id="soc-tel-${s.id}" value="${s.telefone || ''}" placeholder="(11) 90000-0000" ${dis} class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">E-mail</label>
          <input type="email" id="soc-email-${s.id}" value="${s.email || ''}" placeholder="socio@email.com" ${dis} class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs">
        </div>
      </div>

      <!-- ENDEREÇO RESIDENCIAL DO SÓCIO COM CEP AUTOMÁTICO -->
      <div class="bg-white p-2.5 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-6 gap-2">
        <div class="sm:col-span-2">
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">CEP (Busca Automática)</label>
          <input type="text" id="soc-cep-${s.id}" value="${s.cep || ''}" placeholder="00000-000" oninput="formatarEAutobuscarCep(this, 'socio', '${s.id}')" ${dis} class="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold focus:ring-2 focus:ring-purple-400">
        </div>
        <div class="sm:col-span-3">
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Endereço (Rua, Av.)</label>
          <input type="text" id="soc-rua-${s.id}" value="${s.rua || ''}" ${dis} class="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Nº</label>
          <input type="text" id="soc-num-${s.id}" value="${s.numero || ''}" ${dis} class="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Complemento</label>
          <input type="text" id="soc-comp-${s.id}" value="${s.complemento || ''}" placeholder="Apto" ${dis} class="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Bairro</label>
          <input type="text" id="soc-bairro-${s.id}" value="${s.bairro || ''}" ${dis} class="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Cidade</label>
          <input type="text" id="soc-cidade-${s.id}" value="${s.cidade || ''}" ${dis} class="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">UF</label>
          <input type="text" id="soc-uf-${s.id}" value="${s.estado || ''}" maxlength="2" placeholder="SP" ${dis} class="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs uppercase font-semibold">
        </div>
      </div>

      <!-- PARTICIPAÇÃO SOCIETÁRIA -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Quotas (%) *</label>
          <input type="number" step="0.01" id="soc-quotas-${s.id}" onchange="recalcularValorQuotasSocio('${s.id}')" value="${s.percentual_quotas || 0}" ${dis} class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold text-purple-900">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Valor em R$ (Integralizado)</label>
          <input type="number" step="0.01" id="soc-valor-${s.id}" value="${s.valor_quotas || 0}" ${dis} class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold">
        </div>
        <div class="flex items-center pt-4">
          <label class="flex items-center space-x-2 ${ehTecnicoNaoParalegal ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}">
            <input type="checkbox" id="soc-admin-${s.id}" ${s.is_administrador ? 'checked' : ''} ${dis} class="rounded text-purple-600">
            <span class="text-xs font-bold text-slate-800">Sócio-Administrador</span>
          </label>
        </div>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function recalcularValorQuotasSocio(socioId) {
  const capital = parseFloat(document.getElementById('abr-capital-social')?.value) || 0;
  const pct = parseFloat(document.getElementById(`soc-quotas-${socioId}`)?.value) || 0;
  const valEl = document.getElementById(`soc-valor-${socioId}`);
  if (valEl && capital > 0) {
    valEl.value = ((capital * pct) / 100).toFixed(2);
  }
}

// Renderizar Grade de Documentos Recebidos
function renderGradeDocumentosAbertura() {
  const container = document.getElementById('grade-documentos-abertura');
  if (!container) return;

  const usuario = estado.usuarioLogado;
  const ehTecnicoNaoParalegal = usuario && usuario.perfil === 'TECNICO' && usuario.departamento !== 'PARALEGAL';

  const docs = estado.documentosAtivos || [];
  const socios = estado.sociosAtivos || [];

  // Documentos esperados
  const tiposEsperados = [];

  socios.forEach((s, idx) => {
    tiposEsperados.push({
      tipo: 'RG_CNH_SOCIO',
      socio_id: s.id,
      titulo: `RG / CNH (${s.nome_completo || 'Sócio ' + (idx + 1)})`,
      categoria: 'SÓCIO'
    });
    tiposEsperados.push({
      tipo: 'COMPROVANTE_RESIDENCIA_SOCIO',
      socio_id: s.id,
      titulo: `Comprovante de Residência (${s.nome_completo || 'Sócio ' + (idx + 1)})`,
      categoria: 'SÓCIO'
    });
  });

  tiposEsperados.push({
    tipo: 'IPTU_IMOVEL',
    titulo: 'Espelho / Carnê do IPTU da Sede',
    categoria: 'IMÓVEL'
  });

  if (document.getElementById('abr-tipo-imovel')?.value === 'ALUGADO') {
    tiposEsperados.push({
      tipo: 'CONTRATO_LOCACAO',
      titulo: 'Contrato de Locação do Imóvel',
      categoria: 'IMÓVEL'
    });
  }

  if (document.getElementById('abr-possui-resp-tecnico')?.checked) {
    tiposEsperados.push({
      tipo: 'CARTEIRA_CONSELHO',
      titulo: 'Carteira do Conselho / Responsável Técnico',
      categoria: 'TÉCNICO'
    });
  }

  container.innerHTML = tiposEsperados.map(esp => {
    const docEncontrado = docs.find(d => d.tipo_documento === esp.tipo && (!esp.socio_id || d.socio_id === esp.socio_id));

    if (docEncontrado) {
      return `
        <div class="bg-emerald-50/60 border border-emerald-300 rounded-xl p-3 flex items-center justify-between shadow-2xs">
          <div class="flex items-center space-x-2.5 min-w-0">
            <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <i data-lucide="check" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <span class="block text-[10px] font-bold text-emerald-900 uppercase">${esp.titulo}</span>
              <p class="text-xs text-slate-800 font-semibold truncate">${docEncontrado.nome_original}</p>
              <span class="text-[10px] text-slate-400">${new Date(docEncontrado.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
          <div class="flex items-center space-x-1 flex-shrink-0">
            <a href="${docEncontrado.caminho}" target="_blank" class="px-2 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[11px] font-bold shadow-2xs transition" title="Abrir arquivo em nova aba">
              Abrir
            </a>
            ${ehTecnicoNaoParalegal ? '' : `
            <button type="button" onclick="excluirDocumentoAbertura('${docEncontrado.id}')" class="p-1 text-slate-400 hover:text-rose-600 rounded transition" title="Excluir documento">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
            `}
          </div>
        </div>
      `;
    } else {
      return `
        <div class="bg-amber-50/50 border border-amber-200 border-dashed rounded-xl p-3 flex items-center justify-between">
          <div class="flex items-center space-x-2.5 min-w-0">
            <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <i data-lucide="file-warning" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <span class="block text-[10px] font-bold text-amber-900 uppercase">${esp.titulo}</span>
              <p class="text-xs text-amber-700 italic">Pendente de recebimento</p>
            </div>
          </div>
          <div>
            ${ehTecnicoNaoParalegal ? `
            <span class="text-[11px] text-slate-400 font-medium italic">Aguardando Paralegal</span>
            ` : `
            <label class="cursor-pointer px-2 py-1 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[11px] font-semibold transition inline-block">
              Anexar
              <input type="file" class="hidden" onchange="uploadDocumentoInterno(this, '${esp.tipo}', '${esp.socio_id || ''}')">
            </label>
            `}
          </div>
        </div>
      `;
    }
  }).join('');

  lucide.createIcons();
}

async function uploadDocumentoInterno(input, tipoDocumento, socioId) {
  if (estado.usuarioLogado?.perfil === 'TECNICO' && estado.usuarioLogado?.departamento !== 'PARALEGAL') {
    alert('Operação restrita: Apenas o setor Paralegal e Coordenação têm permissão para anexar documentos da abertura.');
    return;
  }
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const res = await fetch(`/api/clientes/${estado.clienteAtivoId}/ficha-abertura/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_documento: tipoDocumento,
          socio_id: socioId || null,
          nome_original: file.name,
          base64: e.target.result
        })
      });
      if (!res.ok) throw new Error('Erro ao fazer upload do documento.');
      const resJson = await res.json();

      estado.documentosAtivos.push({
        id: resJson.id,
        tipo_documento: tipoDocumento,
        socio_id: socioId || null,
        nome_original: file.name,
        caminho: resJson.caminho,
        created_at: new Date().toISOString()
      });

      renderGradeDocumentosAbertura();
      mostrarToast(`Documento ${file.name} anexado com sucesso!`, 'sucesso');
    } catch (err) {
      alert(err.message);
    }
  };
  reader.readAsDataURL(file);
}

async function excluirDocumentoAbertura(docId) {
  if (estado.usuarioLogado?.perfil === 'TECNICO' && estado.usuarioLogado?.departamento !== 'PARALEGAL') {
    alert('Operação restrita: Apenas o setor Paralegal e Coordenação têm permissão para excluir documentos da abertura.');
    return;
  }
  if (!confirm('Deseja realmente excluir este anexo?')) return;
  try {
    const res = await fetch(`/api/documentos/${docId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao excluir documento.');
    estado.documentosAtivos = estado.documentosAtivos.filter(d => d.id !== docId);
    renderGradeDocumentosAbertura();
    mostrarToast('Documento removido.', 'info');
  } catch (err) {
    alert(err.message);
  }
}

// Gerador de Cobrança WhatsApp dos Documentos Faltantes
function gerarCobrancaDocumentosFaltantes() {
  const docs = estado.documentosAtivos || [];
  const socios = estado.sociosAtivos || [];
  const cliente = estado.clienteDetalhes?.cliente || {};
  const config = estado.config?.nome_escritorio || 'nosso escritório de contabilidade';

  const faltantes = [];

  socios.forEach((s, idx) => {
    const temCnh = docs.some(d => d.tipo_documento === 'RG_CNH_SOCIO' && d.socio_id === s.id);
    if (!temCnh) faltantes.push(`Documento de Identificação (RG/CNH frente e verso) do(a) sócio(a) *${s.nome_completo || 'Sócio ' + (idx + 1)}*`);

    const temComp = docs.some(d => d.tipo_documento === 'COMPROVANTE_RESIDENCIA_SOCIO' && d.socio_id === s.id);
    if (!temComp) faltantes.push(`Comprovante de Residência recente do(a) sócio(a) *${s.nome_completo || 'Sócio ' + (idx + 1)}*`);
  });

  const temIptu = docs.some(d => d.tipo_documento === 'IPTU_IMOVEL');
  if (!temIptu) faltantes.push(`Espelho / Carnê do IPTU do imóvel da sede`);

  if (document.getElementById('abr-tipo-imovel')?.value === 'ALUGADO') {
    const temContrato = docs.some(d => d.tipo_documento === 'CONTRATO_LOCACAO');
    if (!temContrato) faltantes.push(`Contrato de Locação do imóvel assinado`);
  }

  const temHabitese = docs.some(d => d.tipo_documento === 'HABITE_SE');
  if (!temHabitese) faltantes.push(`Habite-se / AVCB do imóvel da sede`);

  if (document.getElementById('abr-possui-resp-tecnico')?.checked) {
    const temConselho = docs.some(d => d.tipo_documento === 'CARTEIRA_CONSELHO');
    if (!temConselho) faltantes.push(`Carteira do Conselho Profissional do Responsável Técnico`);
  }

  if (faltantes.length === 0) {
    return alert('Parabéns! Todos os documentos essenciais da abertura já foram enviados pelo cliente.');
  }

  let msg = `*SOLICITAÇÃO DE DOCUMENTOS — ABERTURA DE EMPRESA*\n\n`;
  msg += `Olá, ${cliente.contato_nome || 'prezado(a) cliente'}! Tudo bem?\n`;
  msg += `Aqui é da equipe societária da *${config}*.\n\n`;
  msg += `Para darmos entrada no protocolo de viabilidade e elaboração do Contrato Social da sua empresa (*${cliente.razao_social || 'sua nova empresa'}*), precisamos que nos envie os seguintes documentos:\n\n`;

  faltantes.forEach((item, i) => {
    msg += `  ${i + 1}. • ${item}\n`;
  });

  msg += `\nVocê pode nos responder por este WhatsApp ou anexar diretamente pelo link seguro de abertura que enviamos.\n`;
  msg += `Ficamos à disposição para agilizar o processo da sua empresa!\n\n`;
  msg += `_Equipe Paralegal & Societário — ${config}_`;

  navigator.clipboard.writeText(msg);
  mostrarToast('Mensagem de cobrança dos anexos faltantes copiada para o WhatsApp!', 'sucesso');
}

async function salvarSocioAbertura(socioId) {
  if (estado.usuarioLogado?.perfil === 'TECNICO' && estado.usuarioLogado?.departamento !== 'PARALEGAL') {
    alert('Operação restrita: Apenas o setor Paralegal e Coordenação têm permissão para editar dados societários.');
    return;
  }
  try {
    const s = {
      id: socioId,
      nome_completo: document.getElementById(`soc-nome-${socioId}`)?.value.trim(),
      cpf: document.getElementById(`soc-cpf-${socioId}`)?.value.trim(),
      rg: document.getElementById(`soc-rg-${socioId}`)?.value.trim(),
      orgao_emissor: document.getElementById(`soc-orgao-${socioId}`)?.value.trim(),
      data_nascimento: document.getElementById(`soc-nasc-${socioId}`)?.value,
      estado_civil: document.getElementById(`soc-civil-${socioId}`)?.value,
      regime_casamento: document.getElementById(`soc-regime-${socioId}`)?.value.trim(),
      profissao: document.getElementById(`soc-profissao-${socioId}`)?.value.trim(),
      telefone: document.getElementById(`soc-tel-${socioId}`)?.value.trim(),
      email: document.getElementById(`soc-email-${socioId}`)?.value.trim(),
      cep: document.getElementById(`soc-cep-${socioId}`)?.value.trim(),
      rua: document.getElementById(`soc-rua-${socioId}`)?.value.trim(),
      numero: document.getElementById(`soc-num-${socioId}`)?.value.trim(),
      complemento: document.getElementById(`soc-comp-${socioId}`)?.value.trim(),
      bairro: document.getElementById(`soc-bairro-${socioId}`)?.value.trim(),
      cidade: document.getElementById(`soc-cidade-${socioId}`)?.value.trim(),
      estado: document.getElementById(`soc-uf-${socioId}`)?.value.trim(),
      percentual_quotas: parseFloat(document.getElementById(`soc-quotas-${socioId}`)?.value) || 0,
      valor_quotas: parseFloat(document.getElementById(`soc-valor-${socioId}`)?.value) || 0,
      is_administrador: document.getElementById(`soc-admin-${socioId}`)?.checked ? 1 : 0
    };

    const res = await fetch(`/api/clientes/${estado.clienteAtivoId}/ficha-abertura/socios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s)
    });
    if (!res.ok) throw new Error('Erro ao salvar sócio.');

    const resJson = await res.json();
    const idx = estado.sociosAtivos.findIndex(x => x.id === socioId);
    if (idx !== -1) estado.sociosAtivos[idx] = resJson.socio;

    renderListaSociosAbertura();
    renderGradeDocumentosAbertura();
    mostrarToast(`Sócio ${s.nome_completo || ''} salvo!`, 'sucesso');
  } catch (err) {
    alert(err.message);
  }
}

async function adicionarNovoSocioAbertura() {
  if (estado.usuarioLogado?.perfil === 'TECNICO' && estado.usuarioLogado?.departamento !== 'PARALEGAL') {
    alert('Operação restrita: Apenas o setor Paralegal e Coordenação têm permissão para cadastrar sócios.');
    return;
  }
  try {
    const res = await fetch(`/api/clientes/${estado.clienteAtivoId}/ficha-abertura/socios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome_completo: 'Novo Sócio', percentual_quotas: 0 })
    });
    const resJson = await res.json();
    estado.sociosAtivos.push(resJson.socio);
    renderListaSociosAbertura();
    renderGradeDocumentosAbertura();
    mostrarToast('Novo sócio adicionado à lista.', 'info');
  } catch (err) {
    alert('Erro ao adicionar sócio.');
  }
}

async function excluirSocioAbertura(socioId) {
  if (estado.usuarioLogado?.perfil === 'TECNICO' && estado.usuarioLogado?.departamento !== 'PARALEGAL') {
    alert('Operação restrita: Apenas o setor Paralegal e Coordenação têm permissão para remover sócios.');
    return;
  }
  if (!confirm('Deseja realmente remover este sócio da ficha societária?')) return;
  try {
    const res = await fetch(`/api/socios/${socioId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao remover sócio.');

    estado.sociosAtivos = estado.sociosAtivos.filter(s => s.id !== socioId);
    renderListaSociosAbertura();
    renderGradeDocumentosAbertura();
    mostrarToast('Sócio removido.', 'info');
  } catch (err) {
    alert(err.message);
  }
}

async function salvarFichaAberturaCompleta() {
  if (estado.usuarioLogado?.perfil === 'TECNICO' && estado.usuarioLogado?.departamento !== 'PARALEGAL') {
    alert('Operação restrita: Apenas o setor Paralegal e Coordenação têm permissão para alterar a Ficha Societária.');
    return;
  }
  try {
    const getVal = id => document.getElementById(id)?.value?.trim() || '';

    const body = {
      razao_social_op1: getVal('abr-razao-op1'),
      razao_social_op2: getVal('abr-razao-op2'),
      razao_social_op3: getVal('abr-razao-op3'),
      nome_fantasia: getVal('abr-nome-fantasia'),
      natureza_juridica: getVal('abr-natureza-juridica'),
      capital_social: parseFloat(getVal('abr-capital-social')) || 0,
      divisao_quotas: getVal('abr-divisao-quotas'),
      atividades_descricao: getVal('abr-atividades-desc'),
      cnaes_sugeridos: getVal('abr-cnaes-sugeridos'),
      cnae_principal: getVal('abr-cnae-principal'),
      cnaes_secundarios: getVal('abr-cnaes-secundarios'),
      cep_empresa: getVal('abr-cep-empresa'),
      rua_empresa: getVal('abr-rua-empresa'),
      numero_empresa: getVal('abr-num-empresa'),
      complemento_empresa: getVal('abr-comp-empresa'),
      ponto_referencia_empresa: getVal('abr-ref-empresa'),
      bairro_empresa: getVal('abr-bairro-empresa'),
      cidade_empresa: getVal('abr-cidade-empresa'),
      estado_empresa: getVal('abr-uf-empresa'),
      tipo_imovel: getVal('abr-tipo-imovel'),
      inscricao_iptu: getVal('abr-insc-iptu'),
      proprietario_nome: getVal('abr-proprietario-nome'),
      proprietario_doc: getVal('abr-proprietario-doc'),
      status_viabilidade: getVal('abr-status-viabilidade'),
      protocolo_viabilidade: getVal('abr-proto-viabilidade'),
      protocolo_dbe: getVal('abr-proto-dbe'),
      protocolo_junta: getVal('abr-proto-junta'),
      cnpj_gerado: getVal('abr-cnpj-gerado'),
      inscricao_municipal: getVal('abr-insc-municipal'),
      status_alvara: getVal('abr-status-alvara'),
      possui_certificado: document.getElementById('abr-possui-certificado')?.checked ? 1 : 0,
      senha_gov: getVal('abr-senha-gov'),
      possui_resp_tecnico: document.getElementById('abr-possui-resp-tecnico')?.checked ? 1 : 0,
      resp_tecnico_nome: getVal('abr-resp-tec-nome'),
      resp_tecnico_cpf: getVal('abr-resp-tec-cpf'),
      resp_tecnico_conselho: getVal('abr-resp-tec-conselho'),
      resp_tecnico_numero: getVal('abr-resp-tec-numero'),
      resp_tecnico_estado: getVal('abr-resp-tec-estado'),
      usuario_nome: estado.usuarioLogado?.nome || 'Colaborador'
    };

    const res = await fetch(`/api/clientes/${estado.clienteAtivoId}/ficha-abertura`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Erro ao salvar ficha.');

    mostrarToast('Ficha Societária e CNAEs atualizados com sucesso!', 'sucesso');
  } catch (err) {
    alert(err.message);
  }
}

function copiarSenhaGovCliente() {
  const el = document.getElementById('txt-senha-gov-cliente');
  const senha = el?.textContent?.trim();
  if (!senha || senha === '••••••••' || senha === 'Não informada') {
    mostrarToast('Nenhuma senha GOV informada pelo cliente.', 'alerta');
    return;
  }
  navigator.clipboard.writeText(senha);
  mostrarToast('Senha GOV copiada com sucesso para a área de transferência!', 'sucesso');
}

async function abrirModalDossieJunta() {
  try {
    const res = await fetch(`/api/clientes/${estado.clienteAtivoId}/dossie-junta`);
    if (!res.ok) throw new Error('Não foi possível compilar o dossiê.');
    const data = await res.json();

    document.getElementById('dossie-texto-conteudo').value = data.dossie;
    document.getElementById('modal-dossie-junta').classList.remove('hidden');
    lucide.createIcons();
  } catch (err) {
    alert(err.message);
  }
}

function fecharModalDossieJunta() {
  document.getElementById('modal-dossie-junta').classList.add('hidden');
}

function copiarDossieJunta() {
  const textarea = document.getElementById('dossie-texto-conteudo');
  textarea.select();
  navigator.clipboard.writeText(textarea.value);

  const btn = document.getElementById('btn-copiar-dossie-texto');
  if (btn) btn.textContent = '✓ Dossiê Copiado!';
  mostrarToast('Dossiê societário copiado para a área de transferência!', 'sucesso');

  setTimeout(() => {
    if (btn) btn.textContent = 'Copiar Dossiê Completo';
  }, 2500);
}

async function copiarLinkColetaCliente() {
  if (!estado.fichaAtiva?.token_coleta) return alert('Token da ficha não localizado.');
  
  let baseUrl = window.location.origin;
  // Se houver URL pública segura (Cloudflare HTTPS), prioriza para que funcione em qualquer celular/WhatsApp fora do escritório
  try {
    const res = await fetch('/api/info-servidor');
    if (res.ok) {
      const info = await res.json();
      if (info.url_publica) {
        baseUrl = info.url_publica;
      } else if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && info.ip_rede && info.ip_rede !== 'localhost') {
        baseUrl = info.url_rede;
      }
    }
  } catch (e) {}

  const url = `${baseUrl}/#coleta=${estado.fichaAtiva.token_coleta}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      mostrarToast(`Link de WhatsApp copiado (${url})!`, 'sucesso');
    }).catch(() => {
      prompt('Copie o link seguro abaixo para enviar ao cliente:', url);
    });
  } else {
    prompt('Copie o link seguro abaixo para enviar ao cliente:', url);
  }

  const btn = document.getElementById('btn-copiar-link-coleta');
  if (btn) btn.textContent = '✓ Link Copiado!';
  setTimeout(() => {
    if (btn) btn.textContent = 'Link WhatsApp (Cliente)';
  }, 2500);
}

function concluirProcessoAbertura() {
  if (estado.usuarioLogado?.perfil === 'TECNICO' && estado.usuarioLogado?.departamento !== 'PARALEGAL') {
    alert('Operação restrita: Apenas o setor Paralegal e Coordenação têm permissão para concluir abertura de empresa.');
    return;
  }
  const cnpjAtual = document.getElementById('abr-cnpj-gerado')?.value || '';
  document.getElementById('input-cnpj-conclusao').value = cnpjAtual;
  document.getElementById('modal-concluir-abertura').classList.remove('hidden');
}

function fecharModalConcluirAbertura() {
  document.getElementById('modal-concluir-abertura').classList.add('hidden');
}

async function confirmarConclusaoAbertura() {
  try {
    const cnpj = document.getElementById('input-cnpj-conclusao')?.value.trim();
    const res = await fetch(`/api/clientes/${estado.clienteAtivoId}/concluir-abertura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cnpj_final: cnpj,
        usuario_nome: estado.usuarioLogado?.nome || 'Paralegal',
        usuario_id: estado.usuarioLogado?.id || null
      })
    });
    if (!res.ok) throw new Error('Erro ao concluir abertura.');

    fecharModalConcluirAbertura();
    fecharModalFichaAbertura();
    mostrarToast('Abertura concluída com sucesso! Empresa pronta para Onboarding regular.', 'sucesso');

    renderClienteDetalhes(document.getElementById('view-container'), estado.clienteAtivoId);
  } catch (err) {
    alert(err.message);
  }
}

// =========================================================================
// PORTAL CLIENTE: FORMULÁRIO DE ABERTURA EXTERNO (#coleta=TOKEN)
// Baseado fielmente no formulário original com upload de documentos e sem CNAEs
// =========================================================================

let sociosClienteForm = [];
let temMultiplosSocios = false;

// Feedback visual ao selecionar arquivo
function atualizarFeedbackArquivo(inputEl, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (inputEl.files && inputEl.files[0]) {
    const file = inputEl.files[0];
    const sizeKb = (file.size / 1024).toFixed(0);
    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${sizeKb} KB`;
    container.innerHTML = `
      <div class="mt-2 flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-950 text-xs">
        <div class="flex items-center space-x-2 truncate">
          <span class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">✓</span>
          <span class="font-semibold truncate">${file.name}</span>
          <span class="text-[10px] text-emerald-700 flex-shrink-0">(${sizeStr})</span>
        </div>
        <button type="button" onclick="limparArquivoSelecionado('${inputEl.id}', '${containerId}')" class="text-rose-600 hover:text-rose-800 text-[11px] font-bold ml-2 flex-shrink-0">Remover</button>
      </div>
    `;
  } else {
    container.innerHTML = '';
  }
}

function limparArquivoSelecionado(inputId, containerId) {
  const input = document.getElementById(inputId);
  if (input) input.value = '';
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = '';
}

async function iniciarVisualizacaoColetaExterna(token) {
  document.body.innerHTML = `
    <div class="min-h-screen bg-slate-100 text-slate-800 flex flex-col justify-between font-sans">
      <header class="bg-white border-b border-slate-200 py-4 px-6 flex items-center justify-between shadow-2xs sticky top-0 z-20">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-white border border-[#EDEDEB] p-1 flex items-center justify-center shadow-2xs">
            <img src="/logo-monograma.png" alt="JM" class="max-h-full max-w-full object-contain">
          </div>
          <div>
            <h1 class="font-extrabold text-[#0A213D] text-sm uppercase tracking-wider leading-tight" id="coleta-header-escritorio">Josana Mota Contabilidade</h1>
            <p class="text-[11px] text-[#C5A059] font-bold">Processo de Abertura & Constituição Empresarial</p>
          </div>
        </div>
        <span class="text-xs px-3 py-1 bg-sky-50 text-sky-800 rounded-full font-bold border border-sky-200">Protocolo: ${token}</span>
      </header>

      <main class="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 my-6">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
          <div class="border-b border-slate-100 pb-4">
            <h2 class="text-2xl font-black text-slate-900 tracking-tight">Abertura de Empresa</h2>
            <p class="text-xs text-slate-600 mt-1 leading-relaxed">
              Preencha os dados abaixo para darmos início ao processo de abertura da sua empresa.
            </p>
            <p class="text-[11px] text-rose-600 font-semibold mt-1">* Indica uma pergunta obrigatória</p>
          </div>

          <div id="coleta-loading" class="text-center py-12 space-y-3">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto"></div>
            <p class="text-xs text-slate-500">Carregando formulário seguro...</p>
          </div>

          <form id="form-coleta-cliente" class="hidden space-y-8 text-xs text-slate-700" onsubmit="enviarColetaCompletaCliente(event, '${token}')">
            
            <!-- SEÇÃO 1: QUADRO SOCIETÁRIO (SÓCIOS) -->
            <div class="space-y-4">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-2">
                <div>
                  <h3 class="font-bold text-slate-900 text-sm flex items-center space-x-2">
                    <span class="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                    <span>Dados dos Sócios & Administradores</span>
                  </h3>
                  <p class="text-[11px] text-slate-500">Qualificação civil completa e comprovantes de identificação e residência</p>
                </div>
              </div>

              <!-- CARDS DOS SÓCIOS (ADMINISTRADOR + SÓCIOS ADICIONAIS) -->
              <div id="container-socios-cliente" class="space-y-6"></div>

              <!-- PERGUNTA 10 DO PDF: É MAIS DE UM SÓCIO? -->
              <div class="bg-sky-50/70 p-4 rounded-xl border border-sky-200 space-y-3">
                <label class="block font-bold text-slate-900 text-xs">
                  10. É mais de um sócio? Se sim, adicione os demais sócios da empresa: *
                </label>
                <div class="flex flex-wrap items-center gap-4 text-xs font-semibold">
                  <label class="flex items-center space-x-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-300">
                    <input type="radio" name="opcao_multiplos_socios" value="nao" checked onchange="alternarMultiplosSocios(false)" class="text-sky-600">
                    <span>Não (Apenas 1 Sócio Administrador)</span>
                  </label>
                  <label class="flex items-center space-x-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-300">
                    <input type="radio" name="opcao_multiplos_socios" value="sim" onchange="alternarMultiplosSocios(true)" class="text-sky-600">
                    <span>Sim (A empresa terá mais sócios)</span>
                  </label>
                </div>
                <div id="box-botao-adicionar-socio" class="hidden pt-1">
                  <button type="button" onclick="adicionarSocioFormularioCliente()" class="inline-flex items-center space-x-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition shadow-sm">
                    <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
                    <span>+ Adicionar Outro Sócio (Sócio 02, 03...)</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- SEÇÃO 2: DADOS DA EMPRESA -->
            <div class="space-y-4 pt-4 border-t border-slate-200">
              <h3 class="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <span class="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Dados da Empresa</span>
              </h3>

              <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                <div>
                  <label class="block font-bold text-slate-900 mb-1">37. Nome empresarial (Razão Social) — Nos envie 03 opções: *</label>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label class="block text-[10px] font-semibold text-slate-600 mb-0.5">1ª Opção (Preferência) *</label>
                      <input type="text" name="razao_social_op1" required placeholder="1ª Opção de Razão Social" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
                    </div>
                    <div>
                      <label class="block text-[10px] font-semibold text-slate-600 mb-0.5">2ª Opção (Suplente)</label>
                      <input type="text" name="razao_social_op2" placeholder="2ª Opção de Razão Social" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                    </div>
                    <div>
                      <label class="block text-[10px] font-semibold text-slate-600 mb-0.5">3ª Opção (Suplente)</label>
                      <input type="text" name="razao_social_op3" placeholder="3ª Opção de Razão Social" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                    </div>
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">38. Nome Fantasia *</label>
                    <input type="text" name="nome_fantasia" required placeholder="Nome comercial ou de fachada" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
                  </div>
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">39. Natureza Jurídica *</label>
                    <select name="natureza_juridica" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
                      <option value="LTDA">Sociedade Limitada (LTDA)</option>
                      <option value="SLU">Sociedade Unipessoal (SLU)</option>
                      <option value="EI">Empresário Individual</option>
                    </select>
                  </div>
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">40. Capital Social (R$ em dinheiro) *</label>
                    <input type="number" step="0.01" name="capital_social" required placeholder="10000.00" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900">
                  </div>
                </div>

                <!-- PERGUNTA 41 DO PDF: DIVISÃO DE QUOTAS -->
                <div>
                  <label class="block font-bold text-slate-900 mb-1">
                    41. Caso tenha sócios, qual a divisão de quotas para cada um dos sócios? Se não tiver, coloque 100% para o Sócio Administrador: *
                  </label>
                  <textarea name="divisao_quotas" rows="2" required placeholder="Ex: Sócio Administrador 60% (R$ 6.000), Sócio 02 40% (R$ 4.000) — ou 100% para o Administrador" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"></textarea>
                </div>

                <!-- PERGUNTA 42 DO PDF: QUAIS SERÃO AS ATIVIDADES -->
                <div>
                  <label class="block font-bold text-slate-900 mb-1">
                    42. Quais serão as atividades exercidas pela empresa? *
                  </label>
                  <p class="text-[11px] text-sky-800 bg-sky-50 p-2 rounded-lg border border-sky-200 mb-2">
                    💡 <em>Não se preocupe com códigos CNAE. Descreva livremente o que a empresa vai vender, fabricar ou prestar de serviço e nossa equipe contábil cuidará de todo o enquadramento fiscal e tributário.</em>
                  </p>
                  <textarea name="atividades_descricao" rows="3" required placeholder="Ex: Prestação de serviços de consultoria médica, consultas ambulatoriais, exames preventivos e palestras de saúde..." class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"></textarea>
                </div>
              </div>
            </div>

            <!-- SEÇÃO 3: ENDEREÇO EMPRESARIAL & IMÓVEL -->
            <div class="space-y-4 pt-4 border-t border-slate-200">
              <h3 class="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <span class="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold">3</span>
                <span>Endereço Empresarial & Documentos do Imóvel</span>
              </h3>

              <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                <div class="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  <div class="sm:col-span-2">
                    <label class="block font-bold text-slate-900 mb-1">49. CEP (Preenchimento Automático) *</label>
                    <input type="text" name="cep_empresa" id="cli-cep" required placeholder="00000-000" oninput="formatarEAutobuscarCep(this, 'externo-empresa')" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-sky-500">
                  </div>
                  <div class="sm:col-span-3">
                    <label class="block font-bold text-slate-900 mb-1">43. Rua / Logradouro *</label>
                    <input type="text" name="rua_empresa" id="cli-rua" required class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                  </div>
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">44. Nº Porta *</label>
                    <input type="text" name="numero_empresa" id="cli-num" required class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label class="block font-medium mb-1">Complemento / Sala</label>
                    <input type="text" name="complemento_empresa" placeholder="Ex: Sala 302" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                  </div>
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">45. Ponto de Referência *</label>
                    <input type="text" name="ponto_referencia_empresa" required placeholder="Ex: Próximo ao shopping" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                  </div>
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">46. Bairro *</label>
                    <input type="text" name="bairro_empresa" id="cli-bairro" required class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                  </div>
                  <div class="grid grid-cols-2 gap-1.5">
                    <div>
                      <label class="block font-bold text-slate-900 mb-1">47. Cidade *</label>
                      <input type="text" name="cidade_empresa" id="cli-cidade" required class="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                    </div>
                    <div>
                      <label class="block font-bold text-slate-900 mb-1">48. UF *</label>
                      <input type="text" name="estado_empresa" id="cli-uf" maxlength="2" required class="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs uppercase font-semibold">
                    </div>
                  </div>
                </div>

                <!-- TIPO DE IMÓVEL & PROPRIETÁRIO -->
                <div class="pt-2 border-t border-slate-200 space-y-3">
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block font-bold text-slate-900 mb-1">50. Qual o tipo do imóvel? *</label>
                      <select name="tipo_imovel" id="cli-tipo-imovel" onchange="toggleCamposLocacaoCliente(this.value)" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
                        <option value="PROPRIO">Próprio</option>
                        <option value="ALUGADO">Alugado</option>
                        <option value="VIRTUAL">Escritório Virtual / Coworking</option>
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-slate-900 mb-1">Inscrição Imobiliária (IPTU) *</label>
                      <input type="text" name="inscricao_iptu" required placeholder="Número no carnê de IPTU" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono">
                    </div>
                  </div>

                  <!-- SE FOR ALUGADO: PERGUNTAS 51, 52 E 53 -->
                  <div id="container-cli-locacao" class="hidden bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-3">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label class="block font-bold text-slate-900 mb-1">51. Qual o Nome do Proprietário / Locador?</label>
                        <input type="text" name="proprietario_nome" placeholder="Nome completo ou Razão Social" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                      </div>
                      <div>
                        <label class="block font-bold text-slate-900 mb-1">52. Qual o CPF ou CNPJ do proprietário?</label>
                        <input type="text" name="proprietario_doc" placeholder="000.000.000-00 ou CNPJ" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                      </div>
                    </div>
                    <div class="bg-white p-3 rounded-lg border border-amber-200">
                      <label class="block font-bold text-slate-900 mb-1">53. Caso seja alugado, anexe o Contrato de Aluguel:</label>
                      <input type="file" id="cli-file-aluguel" onchange="atualizarFeedbackArquivo(this, 'fb-cli-aluguel')" class="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-amber-100 file:text-amber-900 hover:file:bg-amber-200">
                      <div id="fb-cli-aluguel"></div>
                    </div>
                  </div>

                  <!-- PERGUNTAS 54 E 55: ANEXOS IPTU E HABITE-SE -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div class="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                      <label class="block font-bold text-slate-900">54. Anexe o IPTU do imóvel: *</label>
                      <p class="text-[10px] text-slate-500 mb-1.5">Espelho ou folha frontal do carnê de IPTU</p>
                      <input type="file" id="cli-file-iptu" onchange="atualizarFeedbackArquivo(this, 'fb-cli-iptu')" class="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-sky-100 file:text-sky-900 hover:file:bg-sky-200">
                      <div id="fb-cli-iptu"></div>
                    </div>
                    <div class="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                      <label class="block font-bold text-slate-900">55. Habite-se do Local: *</label>
                      <p class="text-[10px] text-slate-500 mb-1.5">Certificado de Conclusão / Habite-se ou AVCB</p>
                      <input type="file" id="cli-file-habitese" onchange="atualizarFeedbackArquivo(this, 'fb-cli-habitese')" class="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-sky-100 file:text-sky-900 hover:file:bg-sky-200">
                      <div id="fb-cli-habitese"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- SEÇÃO 4: DADOS PROFISSIONAIS (PERGUNTAS 56 A 61 DO PDF) -->
            <div class="space-y-3 pt-4 border-t border-slate-200">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-bold text-slate-900 text-sm flex items-center space-x-2">
                    <span class="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold">4</span>
                    <span>Dados Profissionais</span>
                  </h3>
                  <p class="text-[11px] text-slate-500">Caso seja uma empresa que necessite de um responsável técnico profissional</p>
                </div>
                <label class="flex items-center space-x-2 cursor-pointer font-bold text-sky-800 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200">
                  <input type="checkbox" id="cli-chk-resp" onchange="toggleSecaoRespCliente(this.checked)" class="rounded text-sky-600">
                  <span>Exige Responsável Técnico</span>
                </label>
              </div>

              <div id="secao-resp-cliente" class="hidden bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">58. Nome do Responsável Técnico:</label>
                    <input type="text" name="resp_tecnico_nome" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                  </div>
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">59. CPF do Responsável Técnico:</label>
                    <input type="text" name="resp_tecnico_cpf" placeholder="000.000.000-00" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">60. Conselho Profissional:</label>
                    <input type="text" name="resp_tecnico_conselho" placeholder="Ex: CRM, CREA, CRO, OAB" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                  </div>
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">56. Número do Conselho Profissional:</label>
                    <input type="text" name="resp_tecnico_numero" placeholder="Ex: 123456" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono">
                  </div>
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">57. Estado do Conselho Profissional:</label>
                    <input type="text" name="resp_tecnico_estado" maxlength="2" placeholder="SP" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs uppercase font-semibold">
                  </div>
                </div>

                <div class="bg-white p-3.5 rounded-xl border border-slate-200">
                  <label class="block font-bold text-slate-900 mb-1">61. Anexe a Carteira Profissional do Responsável Técnico:</label>
                  <input type="file" id="cli-file-conselho" onchange="atualizarFeedbackArquivo(this, 'fb-cli-conselho')" class="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-purple-100 file:text-purple-900 hover:file:bg-purple-200">
                  <div id="fb-cli-conselho"></div>
                </div>
              </div>
            </div>

            <!-- SEÇÃO 5: INFORMAÇÕES COMPLEMENTARES (PERGUNTAS 62 A 66 DO PDF) -->
            <div class="space-y-4 pt-4 border-t border-slate-200">
              <h3 class="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <span class="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold">5</span>
                <span>Informações Complementares</span>
              </h3>

              <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">62. Qual o faturamento mensal estimado (em R$)? *</label>
                    <input type="number" step="0.01" name="faturamento_estimado" required placeholder="Ex: 20000.00" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-emerald-800">
                  </div>
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">63. Qual o número de funcionários inicial? *</label>
                    <input type="number" name="qtd_funcionarios_inicial" required value="0" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200">
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">64. Possui Certificado Digital? *</label>
                    <select name="possui_certificado" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
                      <option value="0">Não</option>
                      <option value="1">Sim (e-CPF dos sócios)</option>
                    </select>
                  </div>
                  <div>
                    <label class="block font-bold text-slate-900 mb-1">65. Caso não tenha certificado digital, disponibilize a senha GOV:</label>
                    <input type="password" name="senha_gov" placeholder="Senha GOV.BR (nível Prata ou Ouro)" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
                    <span class="block text-[10px] text-slate-400 mt-0.5">Necessária para assinatura do DBE na Receita Federal.</span>
                  </div>
                </div>

                <div>
                  <label class="block font-bold text-slate-900 mb-1">66. Espaço para observações adicionais, caso queira fazer:</label>
                  <textarea name="observacoes_cliente" rows="2" placeholder="Alguma observação, prazo especial ou instrução que gostaria de passar para a equipe do escritório?" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"></textarea>
                </div>
              </div>
            </div>

            <!-- SEÇÃO 6: DECLARAÇÃO DE VERACIDADE (PERGUNTA 67 DO PDF) -->
            <div class="space-y-3 pt-4 border-t border-slate-200">
              <h3 class="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <span class="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">6</span>
                <span>Declaração de Veracidade</span>
              </h3>

              <div class="p-4 bg-emerald-50 rounded-xl border border-emerald-300 space-y-2">
                <label class="block font-bold text-emerald-950 text-xs">
                  67. Declaro que as informações dadas anteriormente são verdadeiras: *
                </label>
                <div class="flex items-center space-x-6 text-xs font-semibold pt-1">
                  <label class="flex items-center space-x-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-950">
                    <input type="radio" name="declaracao_veracidade_radio" value="1" checked required class="text-emerald-600">
                    <span>Sim</span>
                  </label>
                  <label class="flex items-center space-x-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700">
                    <input type="radio" name="declaracao_veracidade_radio" value="0" class="text-rose-600">
                    <span>Não</span>
                  </label>
                </div>
                <label class="flex items-start space-x-2.5 cursor-pointer pt-2">
                  <input type="checkbox" id="cli-veracidade-chk" required class="rounded text-emerald-600 mt-0.5">
                  <span class="text-xs text-emerald-950 font-bold leading-relaxed">
                    Autorizo o escritório de contabilidade a utilizar estes dados e documentos na pesquisa de viabilidade e formalização da empresa junto aos órgãos oficiais.
                  </span>
                </label>
              </div>
            </div>

            <!-- BOTÃO SUBMIT -->
            <div class="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span class="text-xs text-slate-500">Seus dados e anexos serão criptografados e transmitidos com segurança ao escritório.</span>
              <button type="submit" id="btn-submit-coleta" class="w-full sm:w-auto px-8 py-3.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold shadow-lg shadow-sky-600/30 text-xs transition active:scale-95 flex items-center justify-center space-x-2">
                <i data-lucide="send" class="w-4 h-4"></i>
                <span>Enviar Dados e Documentos para a Contabilidade</span>
              </button>
            </div>
          </form>

          <div id="coleta-sucesso" class="hidden text-center py-12 space-y-4">
            <div class="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-bold">
              ✓
            </div>
            <h3 class="text-xl font-black text-slate-900 tracking-tight">Formulário e Documentos Enviados com Sucesso!</h3>
            <p class="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
              Nossa equipe societária já recebeu todas as suas informações e os arquivos anexados. Estamos realizando a consulta prévia de viabilidade, enquadramento das atividades e elaboração do contrato. Qualquer dúvida, entraremos em contato via WhatsApp.
            </p>
          </div>
        </div>
      </main>

      <footer class="py-4 text-center text-xs text-slate-400">
        Plataforma Segura de Abertura Empresarial • Sistema OnboardContábil
      </footer>
    </div>
  `;

  lucide.createIcons();

  try {
    const res = await fetch(`/api/coleta-externa/${token}`);
    if (!res.ok) throw new Error('Link expirado ou inválido.');
    const data = await res.json();

    document.getElementById('coleta-header-escritorio').textContent = data.nome_escritorio || 'Escritório de Contabilidade';

    const form = document.getElementById('form-coleta-cliente');
    const f = data.ficha;

    form.razao_social_op1.value = f.razao_social_op1 || '';
    form.razao_social_op2.value = f.razao_social_op2 || '';
    form.razao_social_op3.value = f.razao_social_op3 || '';
    form.nome_fantasia.value = f.nome_fantasia || '';
    form.capital_social.value = f.capital_social || '10000.00';
    if (form.divisao_quotas) form.divisao_quotas.value = f.divisao_quotas || '100% Sócio Administrador';
    form.atividades_descricao.value = f.atividades_descricao || '';
    form.tipo_imovel.value = f.tipo_imovel || 'PROPRIO';
    toggleCamposLocacaoCliente(f.tipo_imovel || 'PROPRIO');

    form.cep_empresa.value = f.cep_empresa || '';
    form.rua_empresa.value = f.rua_empresa || '';
    form.numero_empresa.value = f.numero_empresa || '';
    form.complemento_empresa.value = f.complemento_empresa || '';
    form.ponto_referencia_empresa.value = f.ponto_referencia_empresa || '';
    form.bairro_empresa.value = f.bairro_empresa || '';
    form.cidade_empresa.value = f.cidade_empresa || '';
    form.estado_empresa.value = f.estado_empresa || '';
    form.inscricao_iptu.value = f.inscricao_iptu || '';
    if (form.proprietario_nome) form.proprietario_nome.value = f.proprietario_nome || '';
    if (form.proprietario_doc) form.proprietario_doc.value = f.proprietario_doc || '';

    // Responsável técnico
    const chkResp = document.getElementById('cli-chk-resp');
    if (chkResp && f.possui_resp_tecnico) {
      chkResp.checked = true;
      toggleSecaoRespCliente(true);
      if (form.resp_tecnico_nome) form.resp_tecnico_nome.value = f.resp_tecnico_nome || '';
      if (form.resp_tecnico_cpf) form.resp_tecnico_cpf.value = f.resp_tecnico_cpf || '';
      if (form.resp_tecnico_conselho) form.resp_tecnico_conselho.value = f.resp_tecnico_conselho || '';
      if (form.resp_tecnico_numero) form.resp_tecnico_numero.value = f.resp_tecnico_numero || '';
      if (form.resp_tecnico_estado) form.resp_tecnico_estado.value = f.resp_tecnico_estado || '';
    }

    form.senha_gov.value = f.senha_gov || '';
    form.observacoes_cliente.value = f.observacoes_cliente || '';
    if (f.faturamento_estimado) form.faturamento_estimado.value = f.faturamento_estimado;
    if (f.qtd_funcionarios_inicial) form.qtd_funcionarios_inicial.value = f.qtd_funcionarios_inicial;

    sociosClienteForm = (data.socios && data.socios.length > 0) ? data.socios : [
      { id: 'novo_1', nome_completo: '', is_administrador: 1 }
    ];

    if (sociosClienteForm.length > 1) {
      const radioSim = document.querySelector('input[name="opcao_multiplos_socios"][value="sim"]');
      if (radioSim) radioSim.checked = true;
      alternarMultiplosSocios(true);
    }

    renderSociosFormularioCliente();

    document.getElementById('coleta-loading').classList.add('hidden');
    form.classList.remove('hidden');
    lucide.createIcons();
  } catch (err) {
    document.getElementById('coleta-loading').innerHTML = `
      <div class="text-rose-600 font-bold">${err.message}</div>
      <p class="text-xs text-slate-500 mt-2">Por favor, solicite um novo link ao seu escritório de contabilidade.</p>
    `;
  }
}

function alternarMultiplosSocios(sim) {
  temMultiplosSocios = sim;
  const boxBtn = document.getElementById('box-botao-adicionar-socio');
  if (boxBtn) {
    if (sim) boxBtn.classList.remove('hidden');
    else boxBtn.classList.add('hidden');
  }

  // Se marcar sim e só tiver 1 sócio, já adiciona o Sócio 02 para preenchimento imediato
  if (sim && sociosClienteForm.length === 1) {
    adicionarSocioFormularioCliente();
  } else if (!sim && sociosClienteForm.length > 1) {
    // Se marcar não, mantém apenas o sócio administrador
    sociosClienteForm = [sociosClienteForm[0]];
    renderSociosFormularioCliente();
  }
}

function renderSociosFormularioCliente() {
  const container = document.getElementById('container-socios-cliente');
  if (!container) return;

  container.innerHTML = sociosClienteForm.map((s, idx) => `
    <div class="bg-slate-50 p-5 rounded-2xl border ${idx === 0 ? 'border-sky-300 ring-2 ring-sky-100' : 'border-slate-300'} space-y-4 relative shadow-2xs" id="card-cli-socio-${idx}">
      <div class="flex items-center justify-between pb-2.5 border-b border-slate-200">
        <div class="flex items-center space-x-2">
          <span class="w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold">${idx + 1}</span>
          <h4 class="font-bold text-slate-900 text-sm">
            ${idx === 0 ? 'Dados do Sócio Administrador' : `Dados do Sócio 0${idx + 1}`}
          </h4>
          ${idx === 0 ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">Administrador Oficial</span>` : ''}
        </div>
        ${idx > 0 ? `
          <button type="button" onclick="removerSocioFormularioCliente(${idx})" class="text-xs text-rose-600 hover:text-rose-800 font-bold hover:underline flex items-center space-x-1">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            <span>Remover Sócio 0${idx + 1}</span>
          </button>
        ` : ''}
      </div>

      <!-- PERGUNTAS 1 A 3 DO PDF: NOME, CPF, NASCIMENTO -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="sm:col-span-2">
          <label class="block font-bold text-slate-900 mb-1">
            ${idx === 0 ? '1. Nome completo do Sócio Administrador *' : `11. Nome completo do Sócio 0${idx + 1}: *`}
          </label>
          <input type="text" id="cli-soc-nome-${idx}" value="${s.nome_completo || ''}" required placeholder="Nome completo conforme RG/CNH" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
        </div>
        <div>
          <label class="block font-bold text-slate-900 mb-1">
            ${idx === 0 ? '2. CPF do Sócio Administrador *' : `12. CPF do Sócio 0${idx + 1}: *`}
          </label>
          <input type="text" id="cli-soc-cpf-${idx}" value="${s.cpf || ''}" required placeholder="000.000.000-00" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono">
        </div>
      </div>

      <!-- PERGUNTAS 4 A 8 DO PDF: ESTADO CIVIL, REGIME, PROFISSÃO, EMAIL, TELEFONE -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label class="block font-bold text-slate-900 mb-1">
            ${idx === 0 ? '3. Data de Nascimento *' : `13. Data de Nascimento: *`}
          </label>
          <input type="date" id="cli-soc-nasc-${idx}" value="${s.data_nascimento || ''}" required class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
        </div>
        <div>
          <label class="block font-bold text-slate-900 mb-1">
            ${idx === 0 ? '4. Qual o Estado Civil? *' : `14. Qual o Estado Civil? *`}
          </label>
          <select id="cli-soc-civil-${idx}" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
            <option value="Solteiro" ${s.estado_civil === 'Solteiro' || s.estado_civil === 'Solteiro(a)' ? 'selected' : ''}>Solteiro</option>
            <option value="Casado" ${s.estado_civil === 'Casado' || s.estado_civil === 'Casado(a)' ? 'selected' : ''}>Casado</option>
            <option value="União Estável" ${s.estado_civil === 'União Estável' ? 'selected' : ''}>União Estável</option>
            <option value="Divorciado" ${s.estado_civil === 'Divorciado' || s.estado_civil === 'Divorciado(a)' ? 'selected' : ''}>Divorciado</option>
            <option value="Viúvo" ${s.estado_civil === 'Viúvo' || s.estado_civil === 'Viúvo(a)' ? 'selected' : ''}>Viúvo</option>
          </select>
        </div>
        <div>
          <label class="block font-medium text-slate-700 mb-1">
            ${idx === 0 ? '5. Regime de casamento (se casado)' : `15. Regime de casamento (se casado)`}
          </label>
          <input type="text" id="cli-soc-regime-${idx}" value="${s.regime_casamento || ''}" placeholder="Ex: Comunhão Parcial" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
        </div>
        <div>
          <label class="block font-bold text-slate-900 mb-1">
            ${idx === 0 ? '6. Qual a profissão? *' : `16. Qual a profissão? *`}
          </label>
          <input type="text" id="cli-soc-profissao-${idx}" value="${s.profissao || ''}" required placeholder="Ex: Médico, Engenheiro, Empresário" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block font-bold text-slate-900 mb-1">
            ${idx === 0 ? '7. Qual o e-mail? *' : `17. Qual o e-mail? *`}
          </label>
          <input type="email" id="cli-soc-email-${idx}" value="${s.email || ''}" required placeholder="seu@email.com" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
        </div>
        <div>
          <label class="block font-bold text-slate-900 mb-1">
            ${idx === 0 ? '8. Qual o telefone / WhatsApp? *' : `18. Qual o telefone / WhatsApp? *`}
          </label>
          <input type="text" id="cli-soc-tel-${idx}" value="${s.telefone || ''}" required placeholder="(11) 90000-0000" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs">
        </div>
      </div>

      <!-- PERGUNTA 9 / 19 / 28 DO PDF: ANEXO DO DOCUMENTO DE IDENTIFICAÇÃO -->
      <div class="bg-white p-3.5 rounded-xl border border-sky-200 space-y-1">
        <label class="block font-bold text-slate-900">
          ${idx === 0 ? '9. Anexe um Documento de Identificação (RG, CNH e Carteira Profissional) *' : `19. Anexe um Documento de Identificação (RG, CNH e Carteira Profissional): *`}
        </label>
        <p class="text-[10px] text-slate-500 mb-1.5">Frente e verso nítidos em PDF ou imagem (PNG, JPG)</p>
        <input type="file" id="cli-soc-file-doc-${idx}" onchange="atualizarFeedbackArquivo(this, 'fb-soc-doc-${idx}')" class="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-sky-100 file:text-sky-900 hover:file:bg-sky-200">
        <div id="fb-soc-doc-${idx}"></div>
      </div>

      <!-- PERGUNTAS 29 A 36 DO PDF: ENDEREÇO RESIDENCIAL DO SÓCIO -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
        <div class="flex items-center space-x-1.5 border-b border-slate-100 pb-1.5">
          <i data-lucide="home" class="w-3.5 h-3.5 text-sky-600"></i>
          <span class="font-bold text-slate-800 text-xs uppercase">
            ${idx === 0 ? 'Endereço Residencial do Sócio Administrador' : `Endereço Residencial do Sócio 0${idx + 1}`}
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-6 gap-2.5">
          <div class="sm:col-span-2">
            <label class="block font-bold text-slate-900 mb-0.5">35. Qual o CEP? *</label>
            <input type="text" id="cli-soc-cep-${idx}" value="${s.cep || ''}" required placeholder="00000-000" oninput="formatarEAutobuscarCep(this, 'externo-socio', ${idx})" class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-sky-500">
          </div>
          <div class="sm:col-span-3">
            <label class="block font-bold text-slate-900 mb-0.5">29. Qual a rua? *</label>
            <input type="text" id="cli-soc-rua-${idx}" value="${s.rua || ''}" required class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs">
          </div>
          <div>
            <label class="block font-bold text-slate-900 mb-0.5">30. Nº residência *</label>
            <input type="text" id="cli-soc-num-${idx}" value="${s.numero || ''}" required class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs">
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <div>
            <label class="block font-bold text-slate-900 mb-0.5">31. Ponto de referência *</label>
            <input type="text" id="cli-soc-ref-${idx}" value="${s.ponto_referencia || ''}" required placeholder="Ex: Próximo à padaria" class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs">
          </div>
          <div>
            <label class="block font-bold text-slate-900 mb-0.5">32. Qual o bairro? *</label>
            <input type="text" id="cli-soc-bairro-${idx}" value="${s.bairro || ''}" required class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs">
          </div>
          <div>
            <label class="block font-bold text-slate-900 mb-0.5">33. Qual a cidade? *</label>
            <input type="text" id="cli-soc-cidade-${idx}" value="${s.cidade || ''}" required class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs">
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <div>
              <label class="block font-bold text-slate-900 mb-0.5">34. Estado *</label>
              <input type="text" id="cli-soc-uf-${idx}" value="${s.estado || ''}" maxlength="2" required class="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs uppercase font-semibold">
            </div>
            <div>
              <label class="block font-medium text-slate-600 mb-0.5">Compl.</label>
              <input type="text" id="cli-soc-comp-${idx}" value="${s.complemento || ''}" placeholder="Apto" class="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs">
            </div>
          </div>
        </div>

        <!-- PERGUNTA 36 DO PDF: COMPROVANTE DE RESIDÊNCIA -->
        <div class="pt-2 border-t border-slate-100">
          <label class="block font-bold text-slate-900 mb-1">
            36. Anexe o comprovante de residência: *
          </label>
          <p class="text-[10px] text-slate-500 mb-1.5">Conta de luz, água ou gás recente (emitida nos últimos 90 dias)</p>
          <input type="file" id="cli-soc-file-res-${idx}" onchange="atualizarFeedbackArquivo(this, 'fb-soc-res-${idx}')" class="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-sky-100 file:text-sky-900 hover:file:bg-sky-200">
          <div id="fb-soc-res-${idx}"></div>
        </div>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function adicionarSocioFormularioCliente() {
  sociosClienteForm.push({
    id: `novo_${Date.now()}`,
    nome_completo: '',
    is_administrador: 0
  });
  renderSociosFormularioCliente();
}

function removerSocioFormularioCliente(index) {
  sociosClienteForm.splice(index, 1);
  if (sociosClienteForm.length <= 1) {
    const radioNao = document.querySelector('input[name="opcao_multiplos_socios"][value="nao"]');
    if (radioNao) radioNao.checked = true;
    alternarMultiplosSocios(false);
  } else {
    renderSociosFormularioCliente();
  }
}

function toggleCamposLocacaoCliente(tipo) {
  const cont = document.getElementById('container-cli-locacao');
  if (cont) {
    if (tipo === 'ALUGADO') cont.classList.remove('hidden');
    else cont.classList.add('hidden');
  }
}

function toggleSecaoRespCliente(ativo) {
  const secao = document.getElementById('secao-resp-cliente');
  if (secao) {
    if (ativo) secao.classList.remove('hidden');
    else secao.classList.add('hidden');
  }
}

// Converter arquivo File para base64
function fileParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

async function enviarColetaCompletaCliente(event, token) {
  event.preventDefault();

  const veracidadeRadio = document.querySelector('input[name="declaracao_veracidade_radio"]:checked');
  if (veracidadeRadio && veracidadeRadio.value === '0') {
    alert('Para prosseguir com o envio, é necessário declarar que as informações fornecidas são verdadeiras.');
    return;
  }

  const veracidadeChk = document.getElementById('cli-veracidade-chk');
  if (veracidadeChk && !veracidadeChk.checked) {
    alert('Por favor, marque a caixa de autorização da Declaração de Veracidade antes de enviar.');
    return;
  }

  const btn = document.getElementById('btn-submit-coleta');
  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Enviando dados e arquivos...`;

  const form = event.target;
  const formData = new FormData(form);

  // Mapear sócios com todos os campos da qualificação
  const sociosMapeados = sociosClienteForm.map((s, idx) => ({
    id: s.id?.startsWith('novo_') ? null : s.id,
    nome_completo: document.getElementById(`cli-soc-nome-${idx}`)?.value.trim(),
    cpf: document.getElementById(`cli-soc-cpf-${idx}`)?.value.trim(),
    data_nascimento: document.getElementById(`cli-soc-nasc-${idx}`)?.value,
    estado_civil: document.getElementById(`cli-soc-civil-${idx}`)?.value,
    regime_casamento: document.getElementById(`cli-soc-regime-${idx}`)?.value.trim(),
    profissao: document.getElementById(`cli-soc-profissao-${idx}`)?.value.trim(),
    telefone: document.getElementById(`cli-soc-tel-${idx}`)?.value.trim(),
    email: document.getElementById(`cli-soc-email-${idx}`)?.value.trim(),
    cep: document.getElementById(`cli-soc-cep-${idx}`)?.value.trim(),
    rua: document.getElementById(`cli-soc-rua-${idx}`)?.value.trim(),
    numero: document.getElementById(`cli-soc-num-${idx}`)?.value.trim(),
    complemento: document.getElementById(`cli-soc-comp-${idx}`)?.value.trim(),
    ponto_referencia: document.getElementById(`cli-soc-ref-${idx}`)?.value.trim(),
    bairro: document.getElementById(`cli-soc-bairro-${idx}`)?.value.trim(),
    cidade: document.getElementById(`cli-soc-cidade-${idx}`)?.value.trim(),
    estado: document.getElementById(`cli-soc-uf-${idx}`)?.value.trim()
  }));

  // Mapear arquivos para envio vinculados aos sócios e à empresa
  const arquivos = [];

  for (let idx = 0; idx < sociosClienteForm.length; idx++) {
    const fileDoc = document.getElementById(`cli-soc-file-doc-${idx}`)?.files[0];
    if (fileDoc) {
      const b64 = await fileParaBase64(fileDoc);
      arquivos.push({
        tipo_documento: 'RG_CNH_SOCIO',
        socio_index: idx,
        socio_id: sociosClienteForm[idx].id?.startsWith('novo_') ? null : sociosClienteForm[idx].id,
        nome_original: fileDoc.name,
        base64: b64
      });
    }

    const fileRes = document.getElementById(`cli-soc-file-res-${idx}`)?.files[0];
    if (fileRes) {
      const b64 = await fileParaBase64(fileRes);
      arquivos.push({
        tipo_documento: 'COMPROVANTE_RESIDENCIA_SOCIO',
        socio_index: idx,
        socio_id: sociosClienteForm[idx].id?.startsWith('novo_') ? null : sociosClienteForm[idx].id,
        nome_original: fileRes.name,
        base64: b64
      });
    }
  }

  const fileIptu = document.getElementById('cli-file-iptu')?.files[0];
  if (fileIptu) {
    const b64 = await fileParaBase64(fileIptu);
    arquivos.push({ tipo_documento: 'IPTU_IMOVEL', nome_original: fileIptu.name, base64: b64 });
  }

  const fileAluguel = document.getElementById('cli-file-aluguel')?.files[0];
  if (fileAluguel) {
    const b64 = await fileParaBase64(fileAluguel);
    arquivos.push({ tipo_documento: 'CONTRATO_LOCACAO', nome_original: fileAluguel.name, base64: b64 });
  }

  const fileHabitese = document.getElementById('cli-file-habitese')?.files[0];
  if (fileHabitese) {
    const b64 = await fileParaBase64(fileHabitese);
    arquivos.push({ tipo_documento: 'HABITE_SE', nome_original: fileHabitese.name, base64: b64 });
  }

  const fileConselho = document.getElementById('cli-file-conselho')?.files[0];
  if (fileConselho) {
    const b64 = await fileParaBase64(fileConselho);
    arquivos.push({ tipo_documento: 'CARTEIRA_CONSELHO', nome_original: fileConselho.name, base64: b64 });
  }

  const payload = {
    razao_social_op1: formData.get('razao_social_op1'),
    razao_social_op2: formData.get('razao_social_op2'),
    razao_social_op3: formData.get('razao_social_op3'),
    nome_fantasia: formData.get('nome_fantasia'),
    natureza_juridica: formData.get('natureza_juridica'),
    capital_social: parseFloat(formData.get('capital_social')) || 0,
    divisao_quotas: formData.get('divisao_quotas'),
    atividades_descricao: formData.get('atividades_descricao'),
    cep_empresa: formData.get('cep_empresa'),
    rua_empresa: formData.get('rua_empresa'),
    numero_empresa: formData.get('numero_empresa'),
    complemento_empresa: formData.get('complemento_empresa'),
    ponto_referencia_empresa: formData.get('ponto_referencia_empresa'),
    bairro_empresa: formData.get('bairro_empresa'),
    cidade_empresa: formData.get('cidade_empresa'),
    estado_empresa: formData.get('estado_empresa'),
    tipo_imovel: formData.get('tipo_imovel'),
    inscricao_iptu: formData.get('inscricao_iptu'),
    proprietario_nome: formData.get('proprietario_nome'),
    proprietario_doc: formData.get('proprietario_doc'),
    possui_resp_tecnico: document.getElementById('cli-chk-resp')?.checked ? 1 : 0,
    resp_tecnico_nome: formData.get('resp_tecnico_nome'),
    resp_tecnico_cpf: formData.get('resp_tecnico_cpf'),
    resp_tecnico_conselho: formData.get('resp_tecnico_conselho'),
    resp_tecnico_numero: formData.get('resp_tecnico_numero'),
    resp_tecnico_estado: formData.get('resp_tecnico_estado'),
    faturamento_estimado: parseFloat(formData.get('faturamento_estimado')) || 0,
    qtd_funcionarios_inicial: parseInt(formData.get('qtd_funcionarios_inicial')) || 0,
    possui_certificado: formData.get('possui_certificado') === '1',
    senha_gov: formData.get('senha_gov'),
    observacoes_cliente: formData.get('observacoes_cliente'),
    declaracao_veracidade: 1,
    socios: sociosMapeados,
    arquivos: arquivos
  };

  try {
    const res = await fetch(`/api/coleta-externa/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Erro ao enviar dados para a contabilidade.');

    form.classList.add('hidden');
    document.getElementById('coleta-sucesso').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Enviar Dados e Documentos para a Contabilidade</span>`;
    lucide.createIcons();
  }
}

// =========================================================================
// 13. MODO NOTURNO (DARK MODE)
// =========================================================================
function alternarModoNoturno() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('onboarding_theme', isDark ? 'dark' : 'light');
  atualizarIconeModoNoturno();
  mostrarToast(isDark ? 'Modo Noturno ativado (Notion Dark)' : 'Modo Claro ativado', 'info');
}

function inicializarModoNoturno() {
  const saved = localStorage.getItem('onboarding_theme');
  if (saved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  atualizarIconeModoNoturno();
}

function atualizarIconeModoNoturno() {
  const isDark = document.documentElement.classList.contains('dark');
  const icone = document.getElementById('icon-dark-mode');
  if (icone) {
    icone.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    lucide.createIcons();
  }
}

// =========================================================================
// 14. MANUAL DO SISTEMA & SUPORTE COM IA (SARA)
// =========================================================================
let estadoManual = {
  dados: null,
  abaAtiva: 'manual', // 'manual' ou 'chat'
  filtroTexto: '',
  capitulosAbertos: {
    'acesso_e_rbac': true,
    'onboarding_7_etapas': true,
    'ficha_societaria_67_perguntas': true,
    'cockpit_pessoal_e_ia': false,
    'metricas_equipe_e_gestao': false,
    'ferramentas_e_comunicacao': false,
    'modo_noturno_e_notion': false
  },
  historicoChat: []
};

async function carregarDadosManual() {
  if (!estadoManual.dados) {
    try {
      const res = await fetch('/api/manual');
      if (res.ok) {
        estadoManual.dados = await res.json();
      }
    } catch (e) {
      console.warn('Falha carregando manual via API, usando fallback:', e);
    }
  }
  return estadoManual.dados;
}

async function renderManualAjuda(container) {
  container.innerHTML = `<div class="flex items-center justify-center p-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0A213D] dark:border-[#C5A059]"></div></div>`;

  await carregarDadosManual();
  const manual = estadoManual.dados || { versao: '2.4.0', escritorio: 'Josana Mota Contabilidade', modulos: [] };

  const modulosFiltrados = manual.modulos.map(mod => {
    if (!estadoManual.filtroTexto) return mod;
    const termo = estadoManual.filtroTexto.toLowerCase();
    const tituloMatch = mod.titulo.toLowerCase().includes(termo);
    const topicosFiltrados = mod.topicos.filter(t => 
      t.subtitulo.toLowerCase().includes(termo) || 
      t.conteudo.toLowerCase().includes(termo)
    );
    if (tituloMatch || topicosFiltrados.length > 0) {
      return {
        ...mod,
        topicos: topicosFiltrados.length > 0 ? topicosFiltrados : mod.topicos
      };
    }
    return null;
  }).filter(Boolean);

  container.innerHTML = `
    <div class="space-y-6 max-w-6xl mx-auto">
      
      <!-- CABEÇALHO NOTION -->
      <div class="bg-white p-5 rounded-2xl border border-[#EDEDEB] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center space-x-3">
          <div class="w-12 h-12 rounded-xl bg-white p-1 border border-[#EDEDEB] shadow-xs flex items-center justify-center logo-monograma-box flex-shrink-0">
            <img src="/logo-monograma.png" alt="JM" class="max-h-full max-w-full object-contain">
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="font-bold text-[#0A213D] text-base">Manual do Sistema & Central de Ajuda</h3>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF6EE] text-[#9A7736] border border-[#E8D7B5]">v${manual.versao}</span>
            </div>
            <p class="text-xs text-[#787774]">Guia prático passo a passo de todas as rotinas e assistente de IA para dúvidas imediatas</p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <button onclick="alternarAbaManual('manual')" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${estadoManual.abaAtiva === 'manual' ? 'bg-[#0A213D] text-white shadow-xs' : 'bg-[#F7F7F5] text-[#787774] hover:bg-[#EFEFED]'}">
            <i data-lucide="book" class="w-3.5 h-3.5 inline mr-1 text-[#C5A059]"></i>
            Manual Completo
          </button>
          <button onclick="alternarAbaManual('chat')" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${estadoManual.abaAtiva === 'chat' ? 'bg-[#0A213D] text-white shadow-xs' : 'bg-[#F7F7F5] text-[#787774] hover:bg-[#EFEFED]'}">
            <i data-lucide="sparkles" class="w-3.5 h-3.5 inline mr-1 text-[#C5A059]"></i>
            Perguntar à IA (Sara)
          </button>
        </div>
      </div>

      <!-- ABA 1: MANUAL COMPLETO -->
      <div id="painel-manual-docs" class="${estadoManual.abaAtiva === 'manual' ? 'space-y-4' : 'hidden'}">
        
        <!-- BARRA DE PESQUISA RÁPIDA -->
        <div class="bg-white p-3.5 rounded-2xl border border-[#EDEDEB] shadow-2xs flex items-center space-x-3">
          <i data-lucide="search" class="w-4 h-4 text-[#C5A059] flex-shrink-0"></i>
          <input type="text" id="input-filtro-manual" value="${estadoManual.filtroTexto}" oninput="filtrarManualTexto(this.value)" placeholder="Buscar no manual: digite 'CNAE', 'WhatsApp', 'CEP', 'Cockpit', 'PIN', 'fotos'..." class="w-full text-xs bg-transparent border-0 focus:outline-none text-[#2F3437] placeholder-[#9B9A97]">
          ${estadoManual.filtroTexto ? `
            <button onclick="filtrarManualTexto('')" class="text-xs text-[#787774] hover:text-[#0A213D] px-2">Limpar</button>
          ` : ''}
        </div>

        <!-- LISTA DE CAPÍTULOS / MÓDULOS -->
        <div class="space-y-3">
          ${modulosFiltrados.length === 0 ? `
            <div class="bg-white p-8 rounded-2xl border border-[#EDEDEB] text-center text-[#787774] space-y-2">
              <i data-lucide="search-x" class="w-8 h-8 mx-auto text-[#C5A059]"></i>
              <p class="font-medium text-xs">Nenhum tópico encontrado para "${estadoManual.filtroTexto}".</p>
              <button onclick="filtrarManualTexto('')" class="text-xs text-[#0A213D] font-bold underline">Ver todos os capítulos</button>
            </div>
          ` : modulosFiltrados.map(mod => {
            const isOpen = estadoManual.filtroTexto ? true : !!estadoManual.capitulosAbertos[mod.id];
            return `
              <div class="bg-white rounded-2xl border border-[#EDEDEB] overflow-hidden shadow-2xs transition">
                <!-- CABEÇALHO DO CAPÍTULO -->
                <button onclick="alternarCapituloManual('${mod.id}')" class="w-full p-4.5 flex items-center justify-between text-left hover:bg-[#FAFAF9] transition">
                  <div class="flex items-center space-x-3 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-[#FAF6EE] text-[#9A7736] border border-[#E8D7B5] flex items-center justify-center font-bold flex-shrink-0">
                      <i data-lucide="${mod.icone || 'bookmark'}" class="w-4 h-4 text-[#C5A059]"></i>
                    </div>
                    <div class="min-w-0">
                      <h4 class="font-bold text-[#0A213D] text-sm">${mod.titulo}</h4>
                      <p class="text-xs text-[#787774] truncate">${mod.descricao}</p>
                    </div>
                  </div>
                  <div class="flex items-center space-x-2 flex-shrink-0">
                    <span class="text-[10px] text-[#787774] font-medium hidden sm:inline">${mod.topicos.length} tópicos</span>
                    <i data-lucide="${isOpen ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-[#787774]"></i>
                  </div>
                </button>

                <!-- CONTEÚDO EXPANSÍVEL -->
                ${isOpen ? `
                  <div class="p-5 border-t border-[#EDEDEB] space-y-4 bg-[#FAFAF9]">
                    <div class="grid grid-cols-1 gap-3.5">
                      ${mod.topicos.map(t => `
                        <div class="bg-white p-4 rounded-xl border border-[#EDEDEB] shadow-2xs space-y-2">
                          <h5 class="font-bold text-xs text-[#0A213D] flex items-center space-x-2">
                            <span class="w-1.5 h-1.5 rounded-full bg-[#C5A059]"></span>
                            <span>${t.subtitulo}</span>
                          </h5>
                          <div class="text-xs text-[#2F3437] leading-relaxed prose prose-sm max-w-none">
                            ${typeof window.marked !== 'undefined' ? window.marked.parse(t.conteudo) : t.conteudo.replace(/\n/g, '<br>')}
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- ABA 2: CHAT INTERATIVO COM A IA (SARA) -->
      <div id="painel-manual-chat" class="${estadoManual.abaAtiva === 'chat' ? 'block' : 'hidden'}">
        <div class="bg-white rounded-2xl border border-[#EDEDEB] shadow-2xs overflow-hidden flex flex-col h-[600px]">
          
          <!-- TOPO DO CHAT -->
          <div class="p-4 border-b border-[#EDEDEB] bg-[#0A213D] text-white flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-9 h-9 rounded-xl bg-[#C5A059] text-[#0A213D] font-extrabold flex items-center justify-center text-xs shadow-xs">
                JM
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h4 class="font-bold text-sm">Sara • Suporte & Inteligência Artificial</h4>
                  <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                </div>
                <p class="text-[11px] text-white/80">Tire dúvidas sobre o sistema, atalhos, CNAEs e processos</p>
              </div>
            </div>
            <span class="text-[10px] font-semibold text-[#DFC48B] bg-white/10 px-2.5 py-1 rounded-full border border-white/20">
              Manual v${manual.versao} Sincronizado
            </span>
          </div>

          <!-- MENSAGENS -->
          <div id="chat-ia-pagina-mensagens" class="flex-1 overflow-y-auto p-5 space-y-4 text-xs bg-[#FAFAF9]">
            <!-- Boas vindas -->
            <div class="flex items-start space-x-2.5">
              <div class="w-7 h-7 rounded-full bg-[#C5A059] text-[#0A213D] font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
                IA
              </div>
              <div class="bg-white p-3.5 rounded-2xl rounded-tl-none border border-[#EDEDEB] text-[#2F3437] max-w-[85%] space-y-2 shadow-2xs">
                <p class="font-bold text-[#0A213D]">Olá! Sou a Sara, especialista de suporte do escritório Josana Mota Contabilidade.</p>
                <p class="text-[11px] text-[#787774] leading-relaxed">Estou atualizada com todas as rotinas e regras do nosso manual oficial. Você pode me perguntar sobre qualquer funcionalidade do sistema.</p>
              </div>
            </div>

            <!-- Chips de sugestões & Demandas -->
            <div class="pt-1">
              <span class="block text-[10px] font-bold text-[#787774] uppercase tracking-wider mb-2">Perguntas & Demandas Práticas:</span>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button onclick="enviarMensagemRapidaChatEmAba('Para que serve este sistema e como ele funciona?')" class="text-[11px] bg-white hover:bg-[#F7F7F5] text-[#0A213D] p-2.5 rounded-xl border border-[#EDEDEB] transition shadow-2xs text-left">
                  🌟 <strong>Propósito:</strong> Para que serve este sistema?
                </button>
                <button onclick="enviarMensagemRapidaChatEmAba('Chegou um cliente novo que vai abrir empresa com sócios, o que fazer?')" class="text-[11px] bg-white hover:bg-[#F7F7F5] text-[#0A213D] p-2.5 rounded-xl border border-[#EDEDEB] transition shadow-2xs text-left">
                  🏢 <strong>Demanda:</strong> Abertura de empresa com sócios
                </button>
                <button onclick="enviarMensagemRapidaChatEmAba('O cliente já enviou os dados pelo WhatsApp, qual o próximo passo?')" class="text-[11px] bg-white hover:bg-[#F7F7F5] text-[#0A213D] p-2.5 rounded-xl border border-[#EDEDEB] transition shadow-2xs text-left">
                  📥 <strong>Demanda:</strong> Cliente mandou documentos, o que fazer?
                </button>
                <button onclick="enviarMensagemRapidaChatEmAba('A Junta Comercial aprovou a abertura e saiu o CNPJ, o que faço?')" class="text-[11px] bg-white hover:bg-[#F7F7F5] text-[#0A213D] p-2.5 rounded-xl border border-[#EDEDEB] transition shadow-2xs text-left">
                  🏛️ <strong>Demanda:</strong> Junta aprovou e saiu o CNPJ
                </button>
              </div>
            </div>
          </div>

          <!-- INPUT DE MENSAGEM -->
          <form id="form-chat-ia-pagina" onsubmit="enviarMensagemChatIAEmAba(event)" class="p-3.5 border-t border-[#EDEDEB] bg-white flex items-center space-x-2">
            <input type="text" id="input-chat-ia-pagina-texto" placeholder="Digite sua dúvida sobre o sistema..." class="flex-1 px-3.5 py-2.5 bg-[#F7F7F5] border border-[#EDEDEB] rounded-xl text-xs focus:ring-2 focus:ring-[#0A213D] focus:outline-none">
            <button type="submit" class="px-4 py-2.5 bg-[#0A213D] hover:bg-[#153358] text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5">
              <i data-lucide="send" class="w-4 h-4 text-[#C5A059]"></i>
              <span>Perguntar</span>
            </button>
          </form>

        </div>
      </div>

    </div>
  `;

  lucide.createIcons();
}

function alternarAbaManual(aba) {
  estadoManual.abaAtiva = aba;
  renderManualAjuda(document.getElementById('view-container'));
}

function filtrarManualTexto(termo) {
  estadoManual.filtroTexto = termo;
  renderManualAjuda(document.getElementById('view-container'));
}

function alternarCapituloManual(capId) {
  estadoManual.capitulosAbertos[capId] = !estadoManual.capitulosAbertos[capId];
  renderManualAjuda(document.getElementById('view-container'));
}

// -------------------------------------------------------------------------
// CHAT COM IA DE SUPORTE (DRAWER FLUTUANTE & ABA DEDICADA)
// -------------------------------------------------------------------------
function abrirChatSuporteIA() {
  document.getElementById('modal-chat-ia').classList.remove('hidden');
  const input = document.getElementById('input-chat-ia-texto');
  if (input) input.focus();
  lucide.createIcons();
}

function fecharChatSuporteIA() {
  document.getElementById('modal-chat-ia').classList.add('hidden');
}

function abrirManualCompletoPeloChat() {
  fecharChatSuporteIA();
  navegarPara('manual-ajuda');
}

async function enviarMensagemRapidaChat(texto) {
  document.getElementById('input-chat-ia-texto').value = texto;
  const form = document.getElementById('form-chat-ia');
  if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
}

async function enviarMensagemRapidaChatEmAba(texto) {
  document.getElementById('input-chat-ia-pagina-texto').value = texto;
  const form = document.getElementById('form-chat-ia-pagina');
  if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
}

async function processarEnvioMensagemChat(texto, containerId, btnSubmitId) {
  if (!texto || !texto.trim()) return;
  const container = document.getElementById(containerId);
  if (!container) return;

  // 1. Renderiza balão do usuário
  const userHtml = `
    <div class="flex items-start justify-end space-x-2">
      <div class="bg-[#0A213D] text-white p-3 rounded-2xl rounded-tr-none text-xs max-w-[85%] shadow-2xs space-y-1">
        <p>${texto.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', userHtml);
  container.scrollTop = container.scrollHeight;

  // 2. Indicador de digitação da IA
  const typingId = 'typing_' + Date.now();
  const typingHtml = `
    <div id="${typingId}" class="flex items-start space-x-2">
      <div class="w-6 h-6 rounded-full bg-[#C5A059] text-[#0A213D] font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">
        IA
      </div>
      <div class="bg-white p-3 rounded-2xl rounded-tl-none border border-[#EDEDEB] text-[#787774] text-xs shadow-2xs flex items-center space-x-2">
        <span class="animate-spin inline-block">⏳</span>
        <span>Consultando o manual do sistema...</span>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', typingHtml);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/manual/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mensagem: texto,
        historico: estadoManual.historicoChat
      })
    });
    const dados = await res.json();
    if (!res.ok) throw new Error(dados.error || 'Erro ao consultar IA de suporte.');

    // Remove typing
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    // Guarda histórico
    estadoManual.historicoChat.push({ autor: 'usuario', texto });
    estadoManual.historicoChat.push({ autor: 'ia', texto: dados.resposta });

    const htmlFormatado = typeof window.marked !== 'undefined'
      ? window.marked.parse(dados.resposta)
      : dados.resposta.replace(/\n/g, '<br>');

    // 3. Renderiza resposta da IA
    const aiHtml = `
      <div class="flex items-start space-x-2">
        <div class="w-6 h-6 rounded-full bg-[#C5A059] text-[#0A213D] font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
          IA
        </div>
        <div class="bg-white p-3.5 rounded-2xl rounded-tl-none border border-[#EDEDEB] text-[#2F3437] max-w-[88%] text-xs shadow-2xs space-y-2 prose prose-sm">
          ${htmlFormatado}
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', aiHtml);
    container.scrollTop = container.scrollHeight;

  } catch (err) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    const errHtml = `
      <div class="flex items-start space-x-2">
        <div class="w-6 h-6 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">
          !
        </div>
        <div class="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-2xl text-xs max-w-[85%]">
          ${err.message}
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', errHtml);
    container.scrollTop = container.scrollHeight;
  }
}

async function enviarMensagemChatIA(event) {
  event.preventDefault();
  const input = document.getElementById('input-chat-ia-texto');
  const texto = input.value.trim();
  if (!texto) return;
  input.value = '';
  await processarEnvioMensagemChat(texto, 'chat-ia-mensagens', 'btn-enviar-chat-ia');
}

async function enviarMensagemChatIAEmAba(event) {
  event.preventDefault();
  const input = document.getElementById('input-chat-ia-pagina-texto');
  const texto = input.value.trim();
  if (!texto) return;
  input.value = '';
  await processarEnvioMensagemChat(texto, 'chat-ia-pagina-mensagens', null);
}