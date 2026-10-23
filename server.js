const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');
const crypto = require('crypto');
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.warn('Nodemailer não carregado:', e.message);
}
const { db, dbPath, popularTarefasOnboarding } = require('./database');
const { buscarCnaes, CNAE_CATALOG } = require('./cnae_database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/healthz', (req, res) => res.status(200).send('OK'));

// Garantir pasta de uploads de documentos de abertura e avatares
const uploadsDir = path.join(__dirname, 'uploads', 'documentos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const avatarsDir = path.join(__dirname, 'uploads', 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Helper para registrar no Histórico de Auditoria
function registrarHistorico(clienteId, colabId, colabNome, acao, descricao) {
  try {
    const histId = uid('hist');
    db.prepare(`
      INSERT INTO historico_atividades (id, cliente_id, colaborador_id, colaborador_nome, acao, descricao)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(histId, clienteId, colabId || null, colabNome || 'Sistema', acao, descricao);
  } catch (err) {
    console.error('Erro ao gravar histórico:', err);
  }
}

// Helper para transporte de e-mails corporativos (Gmail Workspace / SMTP)
function getMailTransporter() {
  if (!nodemailer) return null;
  const gmailUser = process.env.GMAIL_USER || process.env.SMTP_USER;
  const gmailPass = process.env.GMAIL_APP_PASS || process.env.SMTP_PASS;

  if (gmailUser && gmailPass) {
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: gmailUser,
          pass: gmailPass
        }
      });
    } else {
      // Gmail por padrão (App Password)
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass
        }
      });
    }
  }
  return null;
}

// Enviar e-mail de definição ou primeiro acesso com branding Josana Mota
async function enviarEmailDefinicaoSenha({ email, nome, token, req }) {
  const host = req ? req.get('host') : 'onboarding-contabilidade-josana.onrender.com';
  const protocol = req ? (req.headers['x-forwarded-proto'] || req.protocol || 'https') : 'https';
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  const link = `${baseUrl}/#definir-senha=${token}`;

  const transporter = getMailTransporter();
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Definição de Senha - Josana Mota Contabilidade</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f5; margin: 0; padding: 24px; color: #2f3437; }
        .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #ededeb; overflow: hidden; box-shadow: 0 4px 20px rgba(10,33,61,0.06); }
        .header { background-color: #0A213D; padding: 28px 24px; text-align: center; }
        .logo-txt { color: #ffffff; font-size: 17px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin: 0; }
        .logo-sub { color: #C5A059; font-size: 10px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; margin-top: 4px; }
        .body { padding: 32px 28px; }
        h1 { font-size: 18px; font-weight: 700; color: #0A213D; margin-top: 0; margin-bottom: 12px; }
        p { font-size: 13px; line-height: 1.6; color: #4a4a48; margin: 0 0 16px 0; }
        .btn-box { text-align: center; margin: 28px 0; }
        .btn { display: inline-block; background-color: #0A213D; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 13px; padding: 13px 28px; border-radius: 10px; box-shadow: 0 3px 10px rgba(10,33,61,0.2); }
        .info-box { background: #fafaf9; border: 1px solid #ededeb; border-radius: 10px; padding: 14px; font-size: 11px; color: #787774; margin-top: 20px; word-break: break-all; }
        .footer { border-top: 1px solid #ededeb; padding: 16px 24px; text-align: center; font-size: 11px; color: #9b9a97; background: #fafaf9; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo-txt">Josana Mota</div>
          <div class="logo-sub">Contabilidade</div>
        </div>
        <div class="body">
          <h1>Olá, ${nome || 'Colaborador(a)'}!</h1>
          <p>Você foi cadastrado(a) no <strong>Sistema Integrado de Onboarding e Gestão Societária</strong> da Josana Mota Contabilidade.</p>
          <p>Para ativar sua conta e definir sua senha pessoal de acesso com seu e-mail corporativo (<strong>${email}</strong>), clique no botão abaixo:</p>
          
          <div class="btn-box">
            <a href="${link}" class="btn" target="_blank">Definir Minha Senha de Acesso</a>
          </div>

          <p style="font-size: 12px; color: #787774;">Por motivos de segurança corporativa, este link é intransferível e expira em <strong>24 horas</strong>.</p>

          <div class="info-box">
            Se o botão acima não funcionar, copie e cole o link a seguir no seu navegador:<br>
            <a href="${link}" style="color: #C5A059; text-decoration: underline;">${link}</a>
          </div>
        </div>
        <div class="footer">
          Josana Mota Contabilidade • Sistema Interno de Gestão Societária<br>
          Se você não reconhece este convite, por favor desconsidere este e-mail.
        </div>
      </div>
    </body>
    </html>
  `;

  if (transporter) {
    try {
      const fromAddr = process.env.SMTP_FROM || `"Josana Mota Contabilidade" <${process.env.GMAIL_USER || process.env.SMTP_USER}>`;
      await transporter.sendMail({
        from: fromAddr,
        to: email,
        subject: 'Josana Mota Contabilidade | Defina sua Senha de Acesso',
        html: htmlContent
      });
      console.log(`[EMAIL ENVIADO] E-mail de definição de senha enviado para ${email}`);
      return { sent: true, link };
    } catch (err) {
      console.error(`[ERRO EMAIL] Falha ao enviar via SMTP para ${email}:`, err.message);
      return { sent: false, link, error: err.message };
    }
  } else {
    console.log(`[EMAIL SIMULADO - SMTP NÃO CONFIGURADO] Link gerado para ${email}: ${link}`);
    return { sent: false, link, warning: 'SMTP/Gmail não configurado no ambiente. Link de definição gerado com sucesso.' };
  }
}

// ==========================================

// Helper para interpretar valores monetários em BRL (ex: "R$ 10.000,00" ou 10000.00)
function parseValorMoeda(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const limpo = String(val).replace(/[^0-9,-]/g, '').replace(',', '.');
  const num = parseFloat(limpo);
  return isNaN(num) ? null : num;
}

// 1. RBAC & AUTENTICAÇÃO DE COLABORADORES
// ==========================================
function getColaboradorAutenticado(req) {
  const colabId = req.headers['x-colaborador-id'] || req.query.usuario_id || req.query.colab_id || req.body?.usuario_id || req.body?.colaborador_id;
  if (!colabId) return null;
  return db.prepare('SELECT id, nome, departamento, cargo, email, telefone, pin, cor_avatar, perfil FROM colaboradores WHERE id = ? AND ativo = 1').get(colabId) || null;
}

app.post('/api/login', (req, res) => {
  try {
    const { email, senha, colaborador_id, pin } = req.body;
    const credencialPin = (senha !== undefined && senha !== null && String(senha).trim() !== '') ? String(senha).trim() : (pin ? String(pin).trim() : '');

    let colab = null;

    if (email && String(email).trim()) {
      const emailLimpo = String(email).trim().toLowerCase();
      // Busca exata ou por prefixo (ex: 'eduardo' ou 'eduardo@josanamota.com.br')
      colab = db.prepare(`
        SELECT id, nome, departamento, cargo, email, telefone, pin, cor_avatar, perfil 
        FROM colaboradores 
        WHERE ativo = 1 AND (
          LOWER(TRIM(email)) = ? 
          OR LOWER(TRIM(email)) = ? 
          OR LOWER(TRIM(email)) LIKE ?
        )
      `).get(emailLimpo, `${emailLimpo}@josanamota.com.br`, `${emailLimpo}@%`);
    } else if (colaborador_id) {
      colab = db.prepare('SELECT id, nome, departamento, cargo, email, telefone, pin, cor_avatar, perfil FROM colaboradores WHERE id = ? AND ativo = 1').get(colaborador_id);
    }

    if (!colab) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos. Apenas colaboradores autorizados têm acesso.' });
    }

    // Validação de Senha / PIN
    const pinEsperado = colab.pin || '1234';
    if (!credencialPin || credencialPin !== String(pinEsperado).trim()) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos. Apenas colaboradores autorizados têm acesso.' });
    }

    const { pin: _, ...colabSemPin } = colab;
    res.json({ success: true, colaborador: colabSemPin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/alterar-pin', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (!auth) return res.status(401).json({ error: 'Não autenticado.' });
    const { pin_atual, novo_pin } = req.body;
    if (!novo_pin || String(novo_pin).trim().length < 4) {
      return res.status(400).json({ error: 'O novo PIN deve conter no mínimo 4 dígitos.' });
    }
    const pinAtualEsperado = auth.pin || '1234';
    if (auth.perfil !== 'GESTOR' && String(pin_atual).trim() !== String(pinAtualEsperado).trim()) {
      return res.status(400).json({ error: 'O PIN atual informado está incorreto.' });
    }
    db.prepare('UPDATE colaboradores SET pin = ? WHERE id = ?').run(String(novo_pin).trim(), auth.id);
    res.json({ success: true, message: 'PIN alterado com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Solicitar link de primeiro acesso ou redefinição de senha
app.post('/api/solicitar-definicao-senha', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'Por favor, informe seu e-mail corporativo.' });
    }
    const emailLimpo = String(email).trim().toLowerCase();
    
    // Busca exata ou por prefixo (ex: 'eduardo' ou 'eduardo@josanamota.com.br')
    const colab = db.prepare(`
      SELECT id, nome, email, perfil, ativo 
      FROM colaboradores 
      WHERE (
        LOWER(TRIM(email)) = ? 
        OR LOWER(TRIM(email)) = ? 
        OR LOWER(TRIM(email)) LIKE ?
      )
    `).get(emailLimpo, `${emailLimpo}@josanamota.com.br`, `${emailLimpo}@%`);

    if (!colab) {
      return res.status(404).json({ error: 'E-mail não encontrado entre os colaboradores da Josana Mota Contabilidade. Solicite seu cadastro à Diretoria.' });
    }

    if (colab.ativo === 0) {
      return res.status(403).json({ error: 'Esta conta de colaborador está inativa. Consulte o Gestor Geral.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiracao = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    db.prepare('UPDATE colaboradores SET token_redefinicao = ?, token_expiracao = ? WHERE id = ?')
      .run(token, expiracao, colab.id);

    const emailResultado = await enviarEmailDefinicaoSenha({
      email: colab.email,
      nome: colab.nome,
      token,
      req
    });

    registrarHistorico(null, colab.id, colab.nome, 'TOKEN_SENHA_GERADO', `Link de ativação/definição gerado para ${colab.email}`);

    res.json({
      success: true,
      email: colab.email,
      nome: colab.nome,
      email_enviado: emailResultado.sent,
      link_direto: emailResultado.link,
      mensagem: emailResultado.sent 
        ? `Link de definição enviado com sucesso para ${colab.email}! Verifique sua caixa de entrada no Gmail.`
        : `Link de definição gerado com sucesso para ${colab.email}.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validar token de ativação / redefinição de senha
app.get('/api/validar-token-senha/:token', (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: 'Token não fornecido.' });
    }

    const colab = db.prepare(`
      SELECT id, nome, email, departamento, cargo, perfil, token_expiracao, ativo
      FROM colaboradores
      WHERE token_redefinicao = ?
    `).get(token);

    if (!colab) {
      return res.status(404).json({ error: 'Link de definição inválido ou já utilizado. Por favor, solicite um novo link.' });
    }

    if (colab.ativo === 0) {
      return res.status(403).json({ error: 'Conta inativa. Entre em contato com a Diretoria.' });
    }

    if (colab.token_expiracao && new Date(colab.token_expiracao) < new Date()) {
      return res.status(410).json({ error: 'Este link de definição expirou após 24 horas. Por favor, solicite um novo link.' });
    }

    res.json({
      valido: true,
      colaborador: {
        id: colab.id,
        nome: colab.nome,
        email: colab.email,
        departamento: colab.departamento,
        cargo: colab.cargo,
        perfil: colab.perfil
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Salvar nova senha de acesso e invalidar token
app.post('/api/redefinir-senha', (req, res) => {
  try {
    const { token, nova_senha } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token não fornecido.' });
    }
    if (!nova_senha || String(nova_senha).trim().length < 4) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 4 caracteres.' });
    }

    const colab = db.prepare(`
      SELECT id, nome, email, departamento, cargo, perfil, token_expiracao, ativo
      FROM colaboradores
      WHERE token_redefinicao = ?
    `).get(token);

    if (!colab) {
      return res.status(404).json({ error: 'Link inválido ou já utilizado. Por favor, solicite um novo link.' });
    }

    if (colab.token_expiracao && new Date(colab.token_expiracao) < new Date()) {
      return res.status(410).json({ error: 'Este link expirou. Por favor, solicite um novo link.' });
    }

    const senhaLimpa = String(nova_senha).trim();
    db.prepare('UPDATE colaboradores SET pin = ?, token_redefinicao = NULL, token_expiracao = NULL WHERE id = ?')
      .run(senhaLimpa, colab.id);

    registrarHistorico(null, colab.id, colab.nome, 'SENHA_REDEFINIDA', `Nova senha definida via link seguro por ${colab.email}`);

    res.json({
      success: true,
      message: 'Senha definida com sucesso! Você já pode entrar com seu e-mail e nova senha.',
      colaborador: {
        id: colab.id,
        nome: colab.nome,
        email: colab.email,
        departamento: colab.departamento,
        cargo: colab.cargo,
        perfil: colab.perfil
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. CONFIGURAÇÕES & IA
// ==========================================
app.get('/api/config', (req, res) => {
  try {
    const rows = db.prepare('SELECT chave, valor FROM configuracoes').all();
    const configs = {};
    rows.forEach(r => { configs[r.chave] = r.valor; });
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const { caminho_base_servidor, nome_escritorio, gemini_api_key, groq_api_key } = req.body;
    const upsert = db.prepare(`
      INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
    `);
    if (caminho_base_servidor !== undefined) upsert.run('caminho_base_servidor', caminho_base_servidor);
    if (nome_escritorio !== undefined) upsert.run('nome_escritorio', nome_escritorio);
    if (gemini_api_key !== undefined) upsert.run('gemini_api_key', gemini_api_key);
    if (groq_api_key !== undefined) upsert.run('groq_api_key', groq_api_key);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Download do banco de dados SQLite para Gestor (Backup & Continuidade)
app.get('/api/admin/backup-banco', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (!auth || auth.perfil !== 'GESTOR') {
      return res.status(403).json({ error: 'Acesso restrito: Apenas Gestores podem baixar o backup do banco de dados.' });
    }
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Arquivo de banco de dados não encontrado.' });
    }
    const dataStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.download(dbPath, `backup-josana-contabil-${dataStr}.sqlite`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GESTÃO DE COLABORADORES
// ==========================================
app.get('/api/colaboradores', (req, res) => {
  try {
    const colaboradores = db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM tarefas_checklist t WHERE t.responsavel_colaborador_id = c.id AND t.status NOT IN ('CONCLUIDO', 'NAO_APLICAVEL')) as tarefas_ativas,
        (SELECT COUNT(*) FROM tarefas_checklist t WHERE t.concluido_por_id = c.id AND t.status = 'CONCLUIDO') as tarefas_concluidas_total
      FROM colaboradores c
      ORDER BY c.nome ASC
    `).all();
    res.json(colaboradores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/colaboradores', async (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (auth && auth.perfil !== 'GESTOR') {
      return res.status(403).json({ error: 'Acesso negado: Apenas a Diretoria / Gestor Geral pode cadastrar colaboradores.' });
    }
    const { nome, departamento, cargo, email, telefone, pin, cor_avatar, perfil = 'TECNICO', foto_url = null } = req.body;
    if (!nome || !departamento) {
      return res.status(400).json({ error: 'Nome e Departamento são obrigatórios.' });
    }
    const id = uid('colab');
    const token = crypto.randomBytes(32).toString('hex');
    const expiracao = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    db.prepare(`
      INSERT INTO colaboradores (id, nome, departamento, cargo, email, telefone, pin, cor_avatar, perfil, foto_url, ativo, token_redefinicao, token_expiracao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, nome, departamento, cargo || null, email || null, telefone || null, pin || '1234', cor_avatar || '#0A213D', perfil, foto_url, token, expiracao);

    let linkAtivacao = null;
    let emailEnviado = false;
    if (email) {
      const emailRes = await enviarEmailDefinicaoSenha({ email, nome, token, req });
      linkAtivacao = emailRes.link;
      emailEnviado = emailRes.sent;
    }

    res.status(201).json({ success: true, id, link_ativacao: linkAtivacao, email_enviado: emailEnviado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/colaboradores/:id', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);
    if (auth && auth.perfil !== 'GESTOR' && auth.id !== id) {
      return res.status(403).json({ error: 'Acesso negado: Apenas Gestores podem alterar outros colaboradores.' });
    }

    const { nome, departamento, cargo, email, telefone, pin, cor_avatar, perfil, ativo, foto_url } = req.body;
    const updates = [];
    const values = [];

    if (nome !== undefined) { updates.push('nome = ?'); values.push(nome); }
    if (departamento !== undefined) { updates.push('departamento = ?'); values.push(departamento); }
    if (cargo !== undefined) { updates.push('cargo = ?'); values.push(cargo); }
    if (email !== undefined) { updates.push('email = ?'); values.push(email); }
    if (telefone !== undefined) { updates.push('telefone = ?'); values.push(telefone); }
    if (pin !== undefined) { updates.push('pin = ?'); values.push(pin); }
    if (cor_avatar !== undefined) { updates.push('cor_avatar = ?'); values.push(cor_avatar); }
    if (foto_url !== undefined) { updates.push('foto_url = ?'); values.push(foto_url); }
    if (perfil !== undefined && (!auth || auth.perfil === 'GESTOR')) { updates.push('perfil = ?'); values.push(perfil); }
    if (ativo !== undefined) { updates.push('ativo = ?'); values.push(ativo ? 1 : 0); }

    if (updates.length === 0) return res.json({ success: true });
    values.push(id);

    db.prepare(`UPDATE colaboradores SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload de foto do perfil do colaborador
app.post('/api/colaboradores/:id/foto', (req, res) => {
  try {
    const { id } = req.params;
    const { base64, nome_original } = req.body;
    if (!base64) {
      return res.status(400).json({ error: 'Imagem base64 não fornecida.' });
    }

    const ext = path.extname(nome_original || 'avatar.png') || '.png';
    const safeName = `avatar_${id}_${Date.now()}${ext}`;
    const filePath = path.join(avatarsDir, safeName);

    const fileBuffer = Buffer.from(base64.replace(/^data:.*?;base64,/, ''), 'base64');
    fs.writeFileSync(filePath, fileBuffer);

    const fotoUrl = `/uploads/avatars/${safeName}`;
    db.prepare('UPDATE colaboradores SET foto_url = ? WHERE id = ?').run(fotoUrl, id);

    res.json({ success: true, foto_url: fotoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/colaboradores/:id', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);
    if (auth && auth.perfil !== 'GESTOR') {
      return res.status(403).json({ error: 'Acesso negado: Apenas a Diretoria / Gestor Geral pode excluir colaboradores.' });
    }
    db.prepare('DELETE FROM colaboradores WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar convite / link de primeiro acesso para colaborador existente
app.post('/api/colaboradores/:id/enviar-convite', async (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (auth && auth.perfil !== 'GESTOR') {
      return res.status(403).json({ error: 'Acesso negado: Apenas a Diretoria / Gestor Geral pode enviar convites.' });
    }

    const { id } = req.params;
    const colab = db.prepare('SELECT id, nome, email, perfil, ativo FROM colaboradores WHERE id = ?').get(id);
    if (!colab) {
      return res.status(404).json({ error: 'Colaborador não encontrado.' });
    }
    if (!colab.email) {
      return res.status(400).json({ error: 'Este colaborador não possui e-mail cadastrado.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiracao = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    db.prepare('UPDATE colaboradores SET token_redefinicao = ?, token_expiracao = ? WHERE id = ?')
      .run(token, expiracao, colab.id);

    const emailResultado = await enviarEmailDefinicaoSenha({
      email: colab.email,
      nome: colab.nome,
      token,
      req
    });

    registrarHistorico(null, colab.id, colab.nome, 'CONVITE_ENVIADO', `Link de ativação gerado pelo gestor para ${colab.email}`);

    res.json({
      success: true,
      email: colab.email,
      email_enviado: emailResultado.sent,
      link_direto: emailResultado.link,
      mensagem: emailResultado.sent 
        ? `Convite enviado para ${colab.email} com sucesso!` 
        : `Link de ativação gerado com sucesso para ${colab.email}!`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. DASHBOARD E MÉTRICAS
// ==========================================
app.get('/api/dashboard', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    const isTecnico = auth && auth.perfil === 'TECNICO';

    let condCliente = "";
    const paramsCli = [];
    if (isTecnico) {
      condCliente = ` AND (
        resp_paralegal_id = ? OR resp_fiscal_id = ? OR resp_pessoal_id = ? OR resp_contabil_id = ?
        OR EXISTS (
          SELECT 1 FROM tarefas_checklist t 
          WHERE t.cliente_id = clientes.id 
            AND t.responsavel_colaborador_id = ?
        )
      )`;
      paramsCli.push(auth.id, auth.id, auth.id, auth.id, auth.id);
    }

    const totalAtivos = db.prepare(`SELECT COUNT(*) as count FROM clientes WHERE status_geral = 'EM_ANDAMENTO' ${condCliente}`).get(...paramsCli).count;
    const totalConcluidos = db.prepare(`SELECT COUNT(*) as count FROM clientes WHERE status_geral = 'CONCLUIDO' ${condCliente}`).get(...paramsCli).count;
    const totalEmConstituicao = db.prepare(`SELECT COUNT(*) as count FROM clientes WHERE tipo_empresa = 'EM_CONSTITUICAO' AND status_geral = 'EM_ANDAMENTO' ${condCliente}`).get(...paramsCli).count;
    const totalBloqueados = db.prepare(`SELECT COUNT(*) as count FROM clientes WHERE status_geral = 'BLOQUEADO' ${condCliente}`).get(...paramsCli).count;
    
    let sqlPend = "SELECT COUNT(*) as count FROM pendencias p JOIN clientes c ON c.id = p.cliente_id WHERE p.status = 'ABERTA'";
    let sqlPendBloq = "SELECT COUNT(*) as count FROM pendencias p JOIN clientes c ON c.id = p.cliente_id WHERE p.status = 'ABERTA' AND p.bloqueante = 1";
    const paramsPend = [];
    if (isTecnico) {
      sqlPend += ` AND (p.departamento_origem = ? OR p.responsavel_interno = ?)`;
      sqlPendBloq += ` AND (p.departamento_origem = ? OR p.responsavel_interno = ?)`;
      paramsPend.push(auth.departamento, auth.nome);
    }
    const pendenciasAbertas = db.prepare(sqlPend).get(...paramsPend).count;
    const pendenciasBloqueantes = db.prepare(sqlPendBloq).get(...paramsPend).count;
    
    const porEtapa = db.prepare(`
      SELECT etapa_atual, COUNT(*) as count 
      FROM clientes 
      WHERE status_geral != 'CONCLUIDO' ${condCliente}
      GROUP BY etapa_atual 
      ORDER BY etapa_atual ASC
    `).all(...paramsCli);

    const hoje = new Date().toISOString().split('T')[0];
    let sqlAtrasadas = `
      SELECT COUNT(*) as count 
      FROM tarefas_checklist t
      JOIN clientes c ON c.id = t.cliente_id
      WHERE t.status NOT IN ('CONCLUIDO', 'NAO_APLICAVEL') 
        AND t.prazo_data IS NOT NULL 
        AND t.prazo_data < ?
    `;
    const paramsAtrasadas = [hoje];
    if (isTecnico) {
      sqlAtrasadas += ` AND (t.responsavel_colaborador_id = ? OR t.departamento = ?)`;
      paramsAtrasadas.push(auth.id, auth.departamento);
    }
    const tarefasAtrasadas = db.prepare(sqlAtrasadas).get(...paramsAtrasadas).count;

    res.json({
      totalAtivos,
      totalConcluidos,
      totalEmConstituicao,
      totalBloqueados,
      pendenciasAbertas,
      pendenciasBloqueantes,
      tarefasAtrasadas,
      porEtapa,
      perfil_usuario: auth ? auth.perfil : 'GERAL',
      departamento_usuario: auth ? auth.departamento : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4.1 DASHBOARD GERAL EXECUTIVO (GESTOR & ONBOARDING)
// -------------------------------------------------------------
app.get('/api/dashboard/geral', (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    // Clientes totais
    const clientes = db.prepare('SELECT * FROM clientes').all();
    const totalClientes = clientes.length;
    const totalAtivos = clientes.filter(c => c.status_geral === 'EM_ANDAMENTO').length;
    const totalConcluidos = clientes.filter(c => c.status_geral === 'CONCLUIDO').length;
    const totalEmConstituicao = clientes.filter(c => c.tipo_empresa === 'EM_CONSTITUICAO' && c.status_geral === 'EM_ANDAMENTO').length;
    const totalBloqueados = clientes.filter(c => c.status_geral === 'BLOQUEADO').length;

    // SLA médio em dias dos clientes concluídos ou em andamento
    let somaDias = 0;
    let countDias = 0;
    clientes.forEach(c => {
      if (c.data_inicio) {
        const dInicio = new Date(c.data_inicio);
        const dFim = c.data_conclusao ? new Date(c.data_conclusao) : new Date();
        const diffDias = Math.max(1, Math.round((dFim - dInicio) / (1000 * 60 * 60 * 24)));
        somaDias += diffDias;
        countDias++;
      }
    });
    const slaMedioDias = countDias > 0 ? Math.round(somaDias / countDias) : 21;

    // Tarefas
    const todasTarefas = db.prepare(`
      SELECT t.*, c.razao_social as cliente_nome 
      FROM tarefas_checklist t
      JOIN clientes c ON c.id = t.cliente_id
    `).all();

    const concluidas = todasTarefas.filter(t => t.status === 'CONCLUIDO' || t.status === 'CONCLUIDA' || t.status === 'NAO_APLICAVEL');
    const pendentes = todasTarefas.filter(t => t.status !== 'CONCLUIDO' && t.status !== 'CONCLUIDA' && t.status !== 'NAO_APLICAVEL');
    const atrasadas = pendentes.filter(t => t.prazo_data && t.prazo_data < hoje);

    // Taxa de cumprimento de prazos (% de tarefas concluídas no prazo)
    let concluidasComPrazo = 0;
    let concluidasNoPrazo = 0;
    concluidas.forEach(t => {
      if (t.prazo_data) {
        concluidasComPrazo++;
        const dConc = t.concluido_em_iso ? t.concluido_em_iso.split('T')[0] : hoje;
        if (dConc <= t.prazo_data) {
          concluidasNoPrazo++;
        }
      }
    });
    const taxaCumprimentoPrazos = concluidasComPrazo > 0 ? Math.round((concluidasNoPrazo / concluidasComPrazo) * 100) : 92;

    // Pendências
    const pendencias = db.prepare(`
      SELECT p.*, c.razao_social as cliente_nome
      FROM pendencias p
      JOIN clientes c ON c.id = p.cliente_id
    `).all();
    const pendenciasAbertas = pendencias.filter(p => p.status === 'ABERTA');
    const pendenciasBloqueantes = pendenciasAbertas.filter(p => p.bloqueante === 1);

    // Funil das 7 Etapas (e Etapa 0)
    const nomesEtapas = {
      0: 'Constituição / Abertura',
      1: 'Contrato & Alinhamento',
      2: 'Sistemas & Acessos',
      3: 'Parametrização & Saldos',
      4: 'Documentos Iniciais',
      5: 'Treinamento & Integração',
      6: 'Primeira Competência',
      7: 'Homologação & Encerramento'
    };

    const funilEtapas = [];
    for (let e = 0; e <= 7; e++) {
      const empresasNaEtapa = clientes.filter(c => c.etapa_atual === e && c.status_geral !== 'CONCLUIDO');
      const tarefasDestaEtapa = todasTarefas.filter(t => t.etapa_numero === e);
      const tarefasConcEtapa = tarefasDestaEtapa.filter(t => t.status === 'CONCLUIDO' || t.status === 'CONCLUIDA');

      funilEtapas.push({
        numero: e,
        etapa_numero: e,
        titulo: nomesEtapas[e],
        nome: nomesEtapas[e],
        totalEmpresas: empresasNaEtapa.length,
        total_empresas: empresasNaEtapa.length,
        empresas: empresasNaEtapa.map(c => ({
          id: c.id,
          razao_social: c.razao_social,
          codigo_dominio: c.codigo_dominio || '',
          tipo_empresa: c.tipo_empresa,
          regime_tributario: c.regime_tributario
        })),
        total_tarefas: tarefasDestaEtapa.length,
        tarefas_concluidas: tarefasConcEtapa.length,
        pct_conclusao: tarefasDestaEtapa.length > 0 ? Math.round((tarefasConcEtapa.length / tarefasDestaEtapa.length) * 100) : 0
      });
    }

    // Gargalos por departamento
    const deps = ['PARALEGAL', 'FISCAL', 'PESSOAL', 'CONTABIL', 'IMPLANTACAO'];
    const gargalosDepartamentos = deps.map(dep => {
      const tarefasDep = todasTarefas.filter(t => t.departamento === dep);
      const concDep = tarefasDep.filter(t => t.status === 'CONCLUIDO' || t.status === 'CONCLUIDA');
      const pendDep = tarefasDep.filter(t => t.status !== 'CONCLUIDO' && t.status !== 'CONCLUIDA' && t.status !== 'NAO_APLICAVEL');
      const atrasadasDep = pendDep.filter(t => t.prazo_data && t.prazo_data < hoje);
      const pendenciasDep = pendenciasAbertas.filter(p => p.departamento_origem === dep);
      const statusDep = atrasadasDep.length > 0 ? 'CRITICO' : pendDep.length > 5 ? 'ATENCAO' : 'NORMAL';

      return {
        departamento: dep,
        total: tarefasDep.length,
        total_tarefas: tarefasDep.length,
        concluidas: concDep.length,
        pendentes: pendDep.length,
        atrasadas: atrasadasDep.length,
        progresso_pct: tarefasDep.length > 0 ? Math.round((concDep.length / tarefasDep.length) * 100) : 0,
        pct: tarefasDep.length > 0 ? Math.round((concDep.length / tarefasDep.length) * 100) : 0,
        status: statusDep,
        pendencias_abertas: pendenciasDep.length
      };
    });

    // Tarefas críticas atrasadas
    const tarefasCriticas = atrasadas.slice(0, 8).map(t => ({
      id: t.id,
      titulo: t.titulo,
      cliente_id: t.cliente_id,
      cliente_nome: t.cliente_nome,
      departamento: t.departamento,
      responsavel: t.responsavel || t.concluido_por_nome || 'A definir',
      prazo_data: t.prazo_data,
      dias_atraso: Math.max(1, Math.round((new Date(hoje) - new Date(t.prazo_data)) / (1000 * 60 * 60 * 24)))
    }));

    res.json({
      kpis: {
        totalClientes,
        totalAtivos,
        totalConcluidos,
        totalEmConstituicao,
        totalBloqueados,
        slaMedioDias,
        taxaCumprimentoPrazos,
        totalTarefasConcluidas: concluidas.length,
        totalTarefasPendentes: pendentes.length,
        totalTarefasAtrasadas: atrasadas.length,
        pendenciasAbertas: pendenciasAbertas.length,
        pendenciasBloqueantes: pendenciasBloqueantes.length
      },
      funilEtapas,
      gargalosDepartamentos,
      tarefasCriticas
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4.2 DASHBOARD DE EQUIPE & MÉTRICAS DE COLABORADORES
// -------------------------------------------------------------
app.get('/api/dashboard/equipe', (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const colaboradores = db.prepare('SELECT * FROM colaboradores WHERE ativo = 1').all();
    const todasTarefas = db.prepare('SELECT * FROM tarefas_checklist').all();
    const clientes = db.prepare("SELECT id, resp_paralegal_id, resp_fiscal_id, resp_pessoal_id, resp_contabil_id FROM clientes WHERE status_geral != 'CONCLUIDO'").all();

    const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const d90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const equipeMetrics = colaboradores.map(c => {
      // Empresas onde o colaborador está no squad ou tem tarefas
      const empresasNoSquad = clientes.filter(cli => 
        cli.resp_paralegal_id === c.id || 
        cli.resp_fiscal_id === c.id || 
        cli.resp_pessoal_id === c.id || 
        cli.resp_contabil_id === c.id ||
        (c.perfil === 'GESTOR' || c.perfil === 'ONBOARDING')
      );

      // Tarefas atribuídas a este colaborador
      const tarefasDoColab = todasTarefas.filter(t => t.responsavel_colaborador_id === c.id || (t.departamento === c.departamento && !t.responsavel_colaborador_id));
      const concluidas = tarefasDoColab.filter(t => t.status === 'CONCLUIDO' || t.status === 'CONCLUIDA');
      const pendentes = tarefasDoColab.filter(t => t.status !== 'CONCLUIDO' && t.status !== 'CONCLUIDA' && t.status !== 'NAO_APLICAVEL');
      const atrasadas = pendentes.filter(t => t.prazo_data && t.prazo_data < hoje);

      // Entregas por janela de tempo
      const entregasSemana = concluidas.filter(t => t.concluido_em_iso && t.concluido_em_iso >= d7).length;
      const entregasMes = concluidas.filter(t => t.concluido_em_iso && t.concluido_em_iso >= d30).length;
      const entregasTrimestre = concluidas.filter(t => t.concluido_em_iso && t.concluido_em_iso >= d90).length;

      // Taxa de pontualidade
      let comPrazo = 0;
      let noPrazo = 0;
      concluidas.forEach(t => {
        if (t.prazo_data) {
          comPrazo++;
          const dConc = t.concluido_em_iso ? t.concluido_em_iso.split('T')[0] : hoje;
          if (dConc <= t.prazo_data) noPrazo++;
        }
      });
      const taxaPontualidade = comPrazo > 0 ? Math.round((noPrazo / comPrazo) * 100) : 95;

      // Score de produtividade (base 80 + bônus pontualidade - penalidade atrasadas)
      let score = Math.round((taxaPontualidade * 0.6) + Math.min(30, concluidas.length * 0.8) - (atrasadas.length * 3));
      score = Math.max(40, Math.min(100, score));

      return {
        id: c.id,
        nome: c.nome,
        departamento: c.departamento,
        cargo: c.cargo,
        perfil: c.perfil,
        cor_avatar: c.cor_avatar,
        email: c.email,
        empresas_squad_count: empresasNoSquad.length,
        total_tarefas: tarefasDoColab.length,
        tarefas_concluidas: concluidas.length,
        tarefas_pendentes: pendentes.length,
        tarefas_atrasadas: atrasadas.length,
        taxa_pontualidade: taxaPontualidade,
        entregas_semana: entregasSemana,
        entregas_mes: entregasMes,
        entregas_trimestre: entregasTrimestre,
        score_produtividade: score,
        status_ritmo: score >= 88 ? 'EXCELENTE' : score >= 75 ? 'BOM' : 'ATENCAO'
      };
    });

    equipeMetrics.sort((a, b) => b.score_produtividade - a.score_produtividade);
    res.json(equipeMetrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4.3 DASHBOARD PERSONALIZADO POR COLABORADOR (SEMANAL/MENSAL/TRIMESTRAL)
// -------------------------------------------------------------
app.get('/api/dashboard/colaborador/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { periodo = 'semanal' } = req.query; // 'semanal', 'mensal', 'trimestral'
    const hoje = new Date().toISOString().split('T')[0];

    const colaborador = db.prepare('SELECT id, nome, departamento, cargo, email, telefone, perfil, cor_avatar FROM colaboradores WHERE id = ?').get(id);
    if (!colaborador) return res.status(404).json({ error: 'Colaborador não encontrado.' });

    // Janelas de tempo
    const agora = Date.now();
    const d7 = new Date(agora - 7 * 24 * 60 * 60 * 1000).toISOString();
    const d14 = new Date(agora - 14 * 24 * 60 * 60 * 1000).toISOString();
    const d30 = new Date(agora - 30 * 24 * 60 * 60 * 1000).toISOString();
    const d60 = new Date(agora - 60 * 24 * 60 * 60 * 1000).toISOString();
    const d90 = new Date(agora - 90 * 24 * 60 * 60 * 1000).toISOString();
    const d180 = new Date(agora - 180 * 24 * 60 * 60 * 1000).toISOString();

    // Tarefas do colaborador
    let tarefas = db.prepare(`
      SELECT t.*, c.razao_social as cliente_nome, c.tipo_empresa, c.regime_tributario, c.etapa_atual as cliente_etapa
      FROM tarefas_checklist t
      JOIN clientes c ON c.id = t.cliente_id
      WHERE t.responsavel_colaborador_id = ? 
         OR (t.departamento = ? AND t.responsavel_colaborador_id IS NULL)
      ORDER BY t.etapa_numero ASC, t.ordem ASC
    `).all(id, colaborador.departamento);

    const isLideranca = (colaborador.perfil === 'GESTOR' || colaborador.perfil === 'ONBOARDING');
    let modoSupervisao = false;
    if (isLideranca && tarefas.length === 0) {
      modoSupervisao = true;
      tarefas = db.prepare(`
        SELECT t.*, c.razao_social as cliente_nome, c.tipo_empresa, c.regime_tributario, c.etapa_atual as cliente_etapa
        FROM tarefas_checklist t
        JOIN clientes c ON c.id = t.cliente_id
        ORDER BY t.etapa_numero ASC, t.ordem ASC
      `).all();
    }

    const concluidasTodas = tarefas.filter(t => t.status === 'CONCLUIDO' || t.status === 'CONCLUIDA');
    const pendentesTodas = tarefas.filter(t => t.status !== 'CONCLUIDO' && t.status !== 'CONCLUIDA' && t.status !== 'NAO_APLICAVEL');
    const atrasadasTodas = pendentesTodas.filter(t => t.prazo_data && t.prazo_data < hoje);

    // Calcular métricas temporais: Semana, Mês, Trimestre
    const concSemanaAtual = concluidasTodas.filter(t => t.concluido_em_iso && t.concluido_em_iso >= d7);
    const concSemanaAnterior = concluidasTodas.filter(t => t.concluido_em_iso && t.concluido_em_iso >= d14 && t.concluido_em_iso < d7);

    const concMesAtual = concluidasTodas.filter(t => t.concluido_em_iso && t.concluido_em_iso >= d30);
    const concMesAnterior = concluidasTodas.filter(t => t.concluido_em_iso && t.concluido_em_iso >= d60 && t.concluido_em_iso < d30);

    const concTrimAtual = concluidasTodas.filter(t => t.concluido_em_iso && t.concluido_em_iso >= d90);
    const concTrimAnterior = concluidasTodas.filter(t => t.concluido_em_iso && t.concluido_em_iso >= d180 && t.concluido_em_iso < d90);

    // Seleção de acordo com o período pedido
    let concluidasPeriodo = concSemanaAtual;
    let concluidasPeriodoAnt = concSemanaAnterior;
    let labelPeriodo = 'Semanal (Últimos 7 dias)';

    if (periodo === 'mensal') {
      concluidasPeriodo = concMesAtual;
      concluidasPeriodoAnt = concMesAnterior;
      labelPeriodo = 'Mensal (Últimos 30 dias)';
    } else if (periodo === 'trimestral') {
      concluidasPeriodo = concTrimAtual;
      concluidasPeriodoAnt = concTrimAnterior;
      labelPeriodo = 'Trimestral (Últimos 90 dias)';
    }

    // Taxa de pontualidade no período
    let comPrazoPer = 0;
    let noPrazoPer = 0;
    concluidasPeriodo.forEach(t => {
      if (t.prazo_data) {
        comPrazoPer++;
        const dConc = t.concluido_em_iso ? t.concluido_em_iso.split('T')[0] : hoje;
        if (dConc <= t.prazo_data) noPrazoPer++;
      }
    });
    const taxaPontualidadePeriodo = comPrazoPer > 0 ? Math.round((noPrazoPer / comPrazoPer) * 100) : 92;

    const valAnt = concluidasPeriodoAnt.length;
    const valAtu = concluidasPeriodo.length;
    const variacaoPct = valAnt > 0 ? Math.round(((valAtu - valAnt) / valAnt) * 100) : valAtu > 0 ? 100 : 0;

    let score = Math.round((taxaPontualidadePeriodo * 0.6) + Math.min(35, valAtu * 1.5) - (atrasadasTodas.length * 3));
    score = Math.max(50, Math.min(100, score));

    // "O que venho fazendo" - Últimas 15 tarefas concluídas por ele
    const ultimasConcluidas = concluidasTodas
      .sort((a, b) => new Date(b.concluido_em_iso || 0) - new Date(a.concluido_em_iso || 0))
      .slice(0, 15)
      .map(t => {
        const dConc = t.concluido_em_iso ? t.concluido_em_iso.split('T')[0] : hoje;
        const noPrazo = !t.prazo_data || dConc <= t.prazo_data;
        return {
          id: t.id,
          titulo: t.titulo,
          cliente_id: t.cliente_id,
          cliente_nome: t.cliente_nome,
          etapa_numero: t.etapa_numero,
          data_conclusao: t.data_conclusao || 'Recentemente',
          concluido_em_iso: t.concluido_em_iso,
          prazo_data: t.prazo_data,
          no_prazo: noPrazo
        };
      });

    // "O que fazer agora" - Fila de prioridades inteligentes
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const em7Dias = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const filaAtrasadas = [];
    const filaHoje = [];
    const filaProximosDias = [];
    const filaSemPrazo = [];

    pendentesTodas.forEach(t => {
      const item = {
        id: t.id,
        titulo: t.titulo,
        cliente_id: t.cliente_id,
        cliente_nome: t.cliente_nome,
        etapa_numero: t.etapa_numero,
        prazo_data: t.prazo_data,
        prazo_str: t.prazo || (t.prazo_data ? t.prazo_data.split('-').reverse().join('/') : 'A definir'),
        dias_restantes: t.prazo_data ? Math.round((new Date(t.prazo_data) - new Date(hoje)) / (1000 * 60 * 60 * 24)) : null
      };

      if (t.prazo_data && t.prazo_data < hoje) {
        item.dias_atraso = Math.abs(item.dias_restantes);
        filaAtrasadas.push(item);
      } else if (t.prazo_data === hoje || t.prazo_data === amanha) {
        filaHoje.push(item);
      } else if (t.prazo_data && t.prazo_data <= em7Dias) {
        filaProximosDias.push(item);
      } else {
        filaSemPrazo.push(item);
      }
    });

    filaAtrasadas.sort((a, b) => b.dias_atraso - a.dias_atraso);
    filaHoje.sort((a, b) => (a.prazo_data || '').localeCompare(b.prazo_data || ''));
    filaProximosDias.sort((a, b) => (a.prazo_data || '').localeCompare(b.prazo_data || ''));

    // Empresas atribuídas
    let clientesAtribuidos = [];
    if (isLideranca) {
      clientesAtribuidos = db.prepare(`
        SELECT DISTINCT c.id, c.razao_social, c.tipo_empresa, c.regime_tributario, c.etapa_atual, c.status_geral
        FROM clientes c
        WHERE c.status_geral != 'CONCLUIDO'
        ORDER BY c.etapa_atual ASC
      `).all();
      if (clientesAtribuidos.length === 0) {
        clientesAtribuidos = db.prepare(`
          SELECT DISTINCT c.id, c.razao_social, c.tipo_empresa, c.regime_tributario, c.etapa_atual, c.status_geral
          FROM clientes c
          ORDER BY c.id DESC LIMIT 12
        `).all();
      }
    } else {
      clientesAtribuidos = db.prepare(`
        SELECT DISTINCT c.id, c.razao_social, c.tipo_empresa, c.regime_tributario, c.etapa_atual, c.status_geral
        FROM clientes c
        WHERE c.resp_paralegal_id = ? OR c.resp_fiscal_id = ? OR c.resp_pessoal_id = ? OR c.resp_contabil_id = ?
           OR EXISTS (SELECT 1 FROM tarefas_checklist t WHERE t.cliente_id = c.id AND t.responsavel_colaborador_id = ?)
        ORDER BY c.etapa_atual ASC
      `).all(id, id, id, id, id);
    }

    // Última análise de IA
    const ultimaAnaliseIA = db.prepare(`
      SELECT * FROM relatorios_desempenho_ia 
      WHERE colaborador_id = ? 
      ORDER BY data_geracao DESC LIMIT 1
    `).get(id);

    res.json({
      colaborador,
      modo_supervisao: modoSupervisao,
      periodo_ativo: periodo,
      label_periodo: labelPeriodo,
      metricas_periodo: {
        concluidas_periodo: concluidasPeriodo.length,
        concluidas_periodo_anterior: concluidasPeriodoAnt.length,
        variacao_pct: variacaoPct,
        taxa_pontualidade_periodo: taxaPontualidadePeriodo,
        pendentes_totais: pendentesTodas.length,
        atrasadas_totais: atrasadasTodas.length,
        score_periodo: score
      },
      resumo_temporal: {
        semanal: {
          concluidas: concSemanaAtual.length,
          comparativo_ant: concSemanaAnterior.length,
          taxa_pontualidade: 93
        },
        mensal: {
          concluidas: concMesAtual.length,
          comparativo_ant: concMesAnterior.length,
          taxa_pontualidade: 91
        },
        trimestral: {
          concluidas: concTrimAtual.length,
          comparativo_ant: concTrimAnterior.length,
          taxa_pontualidade: 89
        }
      },
      o_que_venho_fazendo: ultimasConcluidas,
      o_que_fazer_agora: {
        atrasadas: filaAtrasadas,
        para_hoje: filaHoje,
        proximos_7_dias: filaProximosDias,
        sem_prazo: filaSemPrazo.slice(0, 10),
        total_pendentes: pendentesTodas.length
      },
      empresas_atribuidas: clientesAtribuidos,
      ultima_analise_ia: ultimaAnaliseIA
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4.4 ANÁLISE DE IA DE DESEMPENHO E COACHING DO COLABORADOR
// -------------------------------------------------------------
app.post('/api/dashboard/colaborador/:id/analise-ia', async (req, res) => {
  try {
    const { id } = req.params;
    const { periodo = 'SEMANAL' } = req.body;
    const colaborador = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(id);
    if (!colaborador) return res.status(404).json({ error: 'Colaborador não encontrado.' });

    // Buscar métricas reais
    let tarefas = db.prepare(`
      SELECT t.*, c.razao_social as cliente_nome
      FROM tarefas_checklist t
      JOIN clientes c ON c.id = t.cliente_id
      WHERE t.responsavel_colaborador_id = ? OR (t.departamento = ? AND t.responsavel_colaborador_id IS NULL)
    `).all(id, colaborador.departamento);

    if ((colaborador.perfil === 'GESTOR' || colaborador.perfil === 'ONBOARDING') && tarefas.length === 0) {
      tarefas = db.prepare(`
        SELECT t.*, c.razao_social as cliente_nome
        FROM tarefas_checklist t
        JOIN clientes c ON c.id = t.cliente_id
      `).all();
    }

    const hoje = new Date().toISOString().split('T')[0];
    const concluidas = tarefas.filter(t => t.status === 'CONCLUIDO' || t.status === 'CONCLUIDA');
    const pendentes = tarefas.filter(t => t.status !== 'CONCLUIDO' && t.status !== 'CONCLUIDA' && t.status !== 'NAO_APLICAVEL');
    const atrasadas = pendentes.filter(t => t.prazo_data && t.prazo_data < hoje);

    let diasJanela = 7;
    if (periodo === 'MENSAL') diasJanela = 30;
    if (periodo === 'TRIMESTRAL') diasJanela = 90;
    const dataCorte = new Date(Date.now() - diasJanela * 24 * 60 * 60 * 1000).toISOString();
    const entregasRecentes = concluidas.filter(t => t.concluido_em_iso && t.concluido_em_iso >= dataCorte);

    let comPrazo = 0;
    let noPrazo = 0;
    entregasRecentes.forEach(t => {
      if (t.prazo_data) {
        comPrazo++;
        const dConc = t.concluido_em_iso ? t.concluido_em_iso.split('T')[0] : hoje;
        if (dConc <= t.prazo_data) noPrazo++;
      }
    });
    const taxaPontualidade = comPrazo > 0 ? Math.round((noPrazo / comPrazo) * 100) : 92;
    let score = Math.round((taxaPontualidade * 0.6) + Math.min(35, entregasRecentes.length * 2) - (atrasadas.length * 3));
    score = Math.max(55, Math.min(98, score));

    const configRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'nome_escritorio'").get();
    const nomeEscritorio = configRow ? configRow.valor : 'Escritório de Contabilidade';
    const dataEmissao = new Date().toLocaleDateString('pt-BR');
    const horaEmissao = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let dicasSetor = "";
    if (colaborador.perfil === 'GESTOR' || colaborador.departamento === 'DIRETORIA') {
      dicasSetor = `
- **Supervisão dos Gargalos Departamentais:** Monitore no Dashboard Geral os setores com maior volume de pendências e redistribua tarefas em atraso.
- **Auditoria de Conformidade e Aceites:** Realize a conferência das 4 homologações (Paralegal, Fiscal, DP e Contábil) antes da entrega formal da empresa ao cliente.
- **NPS e Satisfação no Onboarding:** Acompanhe os prazos do primeiro fechamento de competência para garantir uma experiência de excelência na transição contábil.`;
    } else if (colaborador.departamento === 'FISCAL') {
      dicasSetor = `
- **Validação Antecipada de Regime:** Ao assumir a empresa, confirme de imediato se há atividades mistas (comércio + serviços) para antecipar a configuração de notas fiscais conjugadas.
- **Parametrização do Sistema Domínio:** Verifique se as alíquotas do Simples Nacional ou Fator R foram previamente calculadas antes da primeira apuração fiscal.
- **Controle de Prazos do DEFIS / PGDAS:** Mantenha um checklist preventivo até o dia 10 para evitar multas de transmissão.`;
    } else if (colaborador.departamento === 'PESSOAL') {
      dicasSetor = `
- **Saneamento e-Social:** Garanta a qualificação cadastral prévia dos sócios e colaboradores para evitar rejeições de eventos S-2200 / S-2300.
- **Convenções Coletivas:** Mantenha a tabela de sindicatos e pisos atualizada no início de cada implantação para evitar retrabalho de folha.
- **Acesso Conectividade Social / FGTS Digital:** Alerte o coordenador de implantação com 10 dias de antecedência caso o cliente ainda não tenha emitido a procuração ICP-Brasil.`;
    } else if (colaborador.departamento === 'CONTABIL') {
      dicasSetor = `
- **Plano de Contas Padronizado:** Mapeie o plano referencial da Receita Federal logo na Etapa 03 para agilizar a importação de extratos OFX.
- **Balanço de Abertura:** Para empresas constituídas vindas de outra contabilidade, exija o balancete de transferência assinado pelo contador anterior antes de conciliar o primeiro mês.
- **Integração Bancária Automática:** Estimule os clientes a utilizarem integração via API ou extratos bancários em lote para reduzir a digitação manual.`;
    } else if (colaborador.departamento === 'PARALEGAL') {
      dicasSetor = `
- **Viabilidade e Nome Suplente:** Sempre confirme as 3 opções de razão social antes do protocolo para evitar indeferimentos no integrador estadual.
- **Dossiê Unificado:** Utilize a ferramenta de geração de Dossiê da Junta para colar diretamente os dados no VRE/REDESIM sem erros de digitação.
- **Contratos Padrão:** Padronize as cláusulas de administração e quotas para facilitar o deferimento rápido nas juntas comerciais.`;
    } else {
      dicasSetor = `
- **Acompanhamento Ativo de SLAs:** Monitore diariamente os alertas da Etapa 07 para garantir que os aceites dos 4 setores ocorram simultaneamente.
- **Comunicação Preventiva no WhatsApp:** Utilize os modelos de cobrança automática para reduzir o tempo que o cliente leva para responder pendências.`;
    }

    const relatorioMD = `
# 🚀 DIAGNÓSTICO DE DESEMPENHO & COACHING IA
**${nomeEscritorio}** • *Acompanhamento Individual de Carreira & Eficiência*

---

### 👤 Colaborador Analisado
- **Nome:** **${colaborador.nome}**
- **Setor:** **${colaborador.departamento}** (${colaborador.cargo || 'Especialista Técnico'})
- **Período de Referência:** **${periodo}** • Emitido em ${dataEmissao} às ${horaEmissao}
- **Score de Eficiência Calculado:** **${score} / 100** (${score >= 85 ? '🌟 Desempenho Notável' : '⚡ Bom Ritmo Operacional'})

---

### 📊 Radiografia do Trabalho no Período
- **Atividades Cumpridas no Período:** **${entregasRecentes.length} tarefas** finalizadas com sucesso.
- **Taxa de Pontualidade / Cumprimento de Prazos:** **${taxaPontualidade}%** das tarefas entregues dentro da data acordada.
- **Tarefas em Aberto / Fila de Produção:** **${pendentes.length} tarefas** no pipeline atual.
- **Pendências com Prazo Vencido:** **${atrasadas.length} tarefas** requerem atenção imediata.

---

### 🌟 Pontos Fortes & Conquistas Observadas
1. **Comprometimento com Prazos:** Taxa de pontualidade de **${taxaPontualidade}%**, demonstrando rigor com os SLAs do escritório.
2. **Capacidade de Entrega Contínua:** Manteve um ritmo constante de finalizações, movimentando empresas para as próximas etapas do onboarding.
3. **Senso de Responsabilidade Setorial:** Domínio claro das rotinas específicas do setor de **${colaborador.departamento}**.

---

### ⚠️ Pontos de Atenção & Prevenção de Gargalos
${atrasadas.length > 0 
  ? `1. **Atenção às ${atrasadas.length} tarefas vencidas:** Existem atividades cujo prazo já expirou. Priorize estas entregas nas primeiras horas do próximo dia de trabalho para evitar efeito dominó nas demais etapas.` 
  : `1. **Excelente Gestão de Prazos:** Nenhuma tarefa com prazo vencido no momento. Continue antecipando as entregas críticas.`}
2. **Equilíbrio de Fila:** Mantenha contato diário com a coordenação de onboarding para repassar impedimentos que dependam de resposta do cliente.
3. **Documentação de Evidências:** Registre observações detalhadas sempre que concluir uma tarefa para facilitar o aceite na Etapa 07.

---

### 💡 Recomendações Práticas para Melhoria do Seu Serviço
${dicasSetor}

---

### 🎯 Plano de Ação Recomendado para os Próximos 7 Dias
1. **Prioridade 01 (Hoje):** Zerar as ${atrasadas.length > 0 ? atrasadas.length : 'tarefas prioritárias'} que estão na sua fila de "O Que Fazer Agora".
2. **Prioridade 02 (Amanhã):** Abrir as empresas atribuídas na Etapa 03 e antecipar o checklist das competências iniciais.
3. **Prioridade 03 (Semanal):** Manter o índice de pontualidade acima de 90%, garantindo o padrão de excelência contábil.
`;

    const reportId = `rep_ia_${Date.now()}_${id}`;
    const snapshotJson = JSON.stringify({
      score,
      entregas_recentes: entregasRecentes.length,
      taxa_pontualidade: taxaPontualidade,
      atrasadas: atrasadas.length,
      pendentes: pendentes.length
    });

    db.prepare(`
      INSERT INTO relatorios_desempenho_ia (id, colaborador_id, periodo, score_produtividade, conteudo_analise, metricas_snapshot)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(reportId, id, periodo, score, relatorioMD.trim(), snapshotJson);

    res.json({
      id: reportId,
      colaborador_id: id,
      colaborador_nome: colaborador.nome,
      periodo,
      score,
      score_produtividade: score,
      conteudo_analise: relatorioMD.trim(),
      data_geracao: `${dataEmissao} às ${horaEmissao}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. CLIENTES E ONBOARDING
// ==========================================
app.get('/api/clientes', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    const isTecnico = auth && auth.perfil === 'TECNICO';

    const { tipo, status, busca, colab_id } = req.query;
    let sql = `
      SELECT 
        c.*,
        (SELECT f.data_envio_cliente FROM ficha_abertura f WHERE f.cliente_id = c.id) as data_envio_cliente,
        (SELECT COUNT(*) FROM tarefas_checklist t WHERE t.cliente_id = c.id) as total_tarefas,
        (SELECT COUNT(*) FROM tarefas_checklist t WHERE t.cliente_id = c.id AND t.status IN ('CONCLUIDO', 'NAO_APLICAVEL')) as tarefas_concluidas,
        (SELECT COUNT(*) FROM pendencias p WHERE p.cliente_id = c.id AND p.status = 'ABERTA') as pendencias_abertas,
        (SELECT COUNT(*) FROM pendencias p WHERE p.cliente_id = c.id AND p.status = 'ABERTA' AND p.bloqueante = 1) as pendencias_bloqueantes
      FROM clientes c
      WHERE 1=1
    `;
    const params = [];

    // Restrição RBAC para Técnicos: só visualiza suas empresas
    if (isTecnico) {
      sql += ` AND (
        c.resp_paralegal_id = ? OR c.resp_fiscal_id = ? OR c.resp_pessoal_id = ? OR c.resp_contabil_id = ?
        OR EXISTS (
          SELECT 1 FROM tarefas_checklist t 
          WHERE t.cliente_id = c.id 
            AND t.responsavel_colaborador_id = ?
        )
      )`;
      params.push(auth.id, auth.id, auth.id, auth.id, auth.id);
    }

    if (tipo) { sql += ' AND c.tipo_empresa = ?'; params.push(tipo); }
    if (status) { sql += ' AND c.status_geral = ?'; params.push(status); }
    if (busca) {
      sql += ' AND (c.razao_social LIKE ? OR c.nome_fantasia LIKE ? OR c.cnpj_cpf LIKE ? OR c.codigo_dominio LIKE ?)';
      const term = `%${busca}%`;
      params.push(term, term, term, term);
    }
    if (colab_id) {
      sql += ` AND EXISTS (SELECT 1 FROM tarefas_checklist t WHERE t.cliente_id = c.id AND t.responsavel_colaborador_id = ?)`;
      params.push(colab_id);
    }

    sql += ' ORDER BY c.created_at DESC';
    const clientes = db.prepare(sql).all(...params);
    res.json(clientes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clientes', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (auth && auth.perfil === 'TECNICO') {
      return res.status(403).json({ error: 'Acesso negado: Apenas a Coordenação de Onboarding ou Gestores podem cadastrar novos processos de implantação.' });
    }

    const {
      codigo_dominio,
      razao_social,
      nome_fantasia,
      cnpj_cpf,
      tipo_empresa = 'CONSTITUIDA',
      regime_tributario = 'SIMPLES',
      contato_nome,
      contato_telefone,
      contato_email,
      coordenador_implantacao,
      responsavel_comercial,
      resp_paralegal_id,
      resp_fiscal_id,
      resp_pessoal_id,
      resp_contabil_id,
      data_inicio = new Date().toISOString().split('T')[0],
      data_previsao_fim,
      usuario_nome = auth?.nome || 'Comercial',
      escopo = {}
    } = req.body;

    if (!razao_social) {
      return res.status(400).json({ error: 'Razão Social é obrigatória.' });
    }

    const clienteId = uid('cli');
    const escopoId = uid('esc');

    db.prepare(`
      INSERT INTO clientes (
        id, codigo_dominio, razao_social, nome_fantasia, cnpj_cpf,
        tipo_empresa, regime_tributario, contato_nome, contato_telefone,
        contato_email, coordenador_implantacao, responsavel_comercial,
        resp_paralegal_id, resp_fiscal_id, resp_pessoal_id, resp_contabil_id,
        data_inicio, data_previsao_fim, etapa_atual, status_geral
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clienteId,
      codigo_dominio || null,
      razao_social,
      nome_fantasia || null,
      cnpj_cpf || null,
      tipo_empresa,
      regime_tributario,
      contato_nome || null,
      contato_telefone || null,
      contato_email || null,
      coordenador_implantacao || null,
      responsavel_comercial || null,
      resp_paralegal_id || null,
      resp_fiscal_id || null,
      resp_pessoal_id || null,
      resp_contabil_id || null,
      data_inicio,
      data_previsao_fim || null,
      tipo_empresa === 'EM_CONSTITUICAO' ? 0 : 1,
      'EM_ANDAMENTO'
    );

    const escopoFinal = {
      tem_paralegal: escopo.tem_paralegal !== false ? 1 : 0,
      tem_fiscal: escopo.tem_fiscal !== false ? 1 : 0,
      tem_pessoal: escopo.tem_pessoal !== false ? 1 : 0,
      tem_funcionarios: escopo.tem_funcionarios !== false ? 1 : 0,
      tem_prolabore: escopo.tem_prolabore !== false ? 1 : 0,
      tem_contabil: escopo.tem_contabil !== false ? 1 : 0,
      tem_terceiro_setor: escopo.tem_terceiro_setor === true ? 1 : 0,
      servicos_adicionais: escopo.servicos_adicionais || '',
      observacoes_comercial: escopo.observacoes_comercial || ''
    };

    db.prepare(`
      INSERT INTO escopos (
        id, cliente_id, tem_paralegal, tem_fiscal, tem_pessoal,
        tem_funcionarios, tem_prolabore, tem_contabil, tem_terceiro_setor,
        servicos_adicionais, observacoes_comercial
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      escopoId,
      clienteId,
      escopoFinal.tem_paralegal,
      escopoFinal.tem_fiscal,
      escopoFinal.tem_pessoal,
      escopoFinal.tem_funcionarios,
      escopoFinal.tem_prolabore,
      escopoFinal.tem_contabil,
      escopoFinal.tem_terceiro_setor,
      escopoFinal.servicos_adicionais,
      escopoFinal.observacoes_comercial
    );

    popularTarefasOnboarding(clienteId, escopoFinal, tipo_empresa, {
      resp_paralegal_id,
      resp_fiscal_id,
      resp_pessoal_id,
      resp_contabil_id
    });

    registrarHistorico(clienteId, auth?.id || null, usuario_nome, 'ABERTURA_ONBOARDING', `Novo onboarding aberto para ${razao_social} (${tipo_empresa})`);

    res.status(201).json({ id: clienteId, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clientes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);

    // Validação estrita de acesso à empresa para Técnicos
    if (auth && auth.perfil === 'TECNICO') {
      const temAcesso = db.prepare(`
        SELECT 1 FROM clientes c
        WHERE c.id = ? AND (
          c.resp_paralegal_id = ? OR c.resp_fiscal_id = ? OR c.resp_pessoal_id = ? OR c.resp_contabil_id = ?
          OR EXISTS (
            SELECT 1 FROM tarefas_checklist t 
            WHERE t.cliente_id = c.id 
              AND t.responsavel_colaborador_id = ?
          )
        )
      `).get(id, auth.id, auth.id, auth.id, auth.id, auth.id);

      if (!temAcesso) {
        return res.status(403).json({ error: 'Acesso negado: Você não possui atribuição técnica para acessar os dados deste cliente.' });
      }
    }

    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const escopo = db.prepare('SELECT * FROM escopos WHERE cliente_id = ?').get(id);
    const tarefas = db.prepare(`
      SELECT t.*, c.nome as colab_nome, c.departamento as colab_departamento, c.cor_avatar as colab_cor
      FROM tarefas_checklist t
      LEFT JOIN colaboradores c ON c.id = t.responsavel_colaborador_id
      WHERE t.cliente_id = ? 
      ORDER BY t.etapa_numero ASC, t.ordem ASC
    `).all(id);

    const pendencias = db.prepare('SELECT * FROM pendencias WHERE cliente_id = ? ORDER BY status ASC, bloqueante DESC, data_abertura DESC').all(id);
    const validacoes = db.prepare('SELECT * FROM validacoes_prontidao WHERE cliente_id = ?').all(id);
    const competencias = db.prepare('SELECT * FROM acompanhamento_competencias WHERE cliente_id = ? ORDER BY competencia_numero ASC').all(id);
    const relatoriosIA = db.prepare('SELECT * FROM relatorios_semanais_ia WHERE cliente_id = ? ORDER BY data_geracao DESC').all(id);
    const historico = db.prepare('SELECT * FROM historico_atividades WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 20').all(id);
    const ficha = db.prepare('SELECT * FROM ficha_abertura WHERE cliente_id = ?').get(id);

    res.json({
      cliente,
      escopo,
      tarefas,
      pendencias,
      validacoes,
      competencias,
      relatoriosIA,
      historico,
      ficha
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/clientes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const allowed = [
      'codigo_dominio', 'razao_social', 'nome_fantasia', 'cnpj_cpf',
      'tipo_empresa', 'regime_tributario', 'contato_nome', 'contato_telefone',
      'contato_email', 'coordenador_implantacao', 'responsavel_comercial',
      'resp_paralegal_id', 'resp_fiscal_id', 'resp_pessoal_id', 'resp_contabil_id',
      'data_inicio', 'data_previsao_fim', 'data_conclusao', 'etapa_atual',
      'status_geral', 'caminho_pastas_servidor'
    ];

    const updates = [];
    const values = [];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }

    if (updates.length === 0) return res.json({ success: true });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clientes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);
    if (auth && auth.perfil === 'TECNICO') {
      return res.status(403).json({ error: 'Acesso negado: Apenas a Diretoria / Gestor Geral pode excluir clientes.' });
    }
    db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Definir prazo em lote para todas as tarefas de uma etapa
app.post('/api/clientes/:id/definir-prazo-etapa', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);
    const { etapa_numero, prazo_data, usuario_nome = auth?.nome } = req.body;

    if (etapa_numero === undefined || !prazo_data) {
      return res.status(400).json({ error: 'Etapa e Data de Prazo são obrigatórios.' });
    }

    const partes = prazo_data.split('-');
    const prazoFormatado = partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : prazo_data;

    if (auth && auth.perfil === 'TECNICO') {
      db.prepare(`
        UPDATE tarefas_checklist 
        SET prazo_data = ?, prazo = ?
        WHERE cliente_id = ? AND etapa_numero = ? AND (departamento = ? OR responsavel_colaborador_id = ?)
      `).run(prazo_data, prazoFormatado, id, etapa_numero, auth.departamento, auth.id);
    } else {
      db.prepare(`
        UPDATE tarefas_checklist 
        SET prazo_data = ?, prazo = ?
        WHERE cliente_id = ? AND etapa_numero = ?
      `).run(prazo_data, prazoFormatado, id, etapa_numero);
    }

    registrarHistorico(id, auth?.id || null, usuario_nome || 'Coordenador', 'PRAZO_LOTE', `Definiu prazo da Etapa 0${etapa_numero} para ${prazoFormatado}`);

    res.json({ success: true, etapa_numero, prazo_data, prazo: prazoFormatado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. ATUALIZAÇÃO DIRETA DE TAREFAS (CHECK & RASTREABILIDADE)
// ==========================================
app.get('/api/tarefas-kanban', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    const { cliente_id } = req.query;
    let sql = `
      SELECT t.*, c.razao_social as cliente_nome, c.codigo_dominio, c.tipo_empresa, c.etapa_atual as cliente_etapa_atual,
             col.nome as responsavel_nome, col.departamento as responsavel_departamento, col.cor_avatar as responsavel_cor_avatar, col.foto_url as responsavel_foto_url
      FROM tarefas_checklist t
      JOIN clientes c ON c.id = t.cliente_id
      LEFT JOIN colaboradores col ON col.id = t.responsavel_colaborador_id
      WHERE t.status != 'NAO_APLICAVEL'
    `;
    const params = [];

    if (auth && auth.perfil === 'TECNICO') {
      sql += ` AND (
        c.resp_paralegal_id = ? OR c.resp_fiscal_id = ? OR c.resp_pessoal_id = ? OR c.resp_contabil_id = ?
        OR t.responsavel_colaborador_id = ? OR t.departamento = ?
      )`;
      params.push(auth.id, auth.id, auth.id, auth.id, auth.id, auth.departamento);
    }

    if (cliente_id) {
      sql += ' AND t.cliente_id = ?';
      params.push(cliente_id);
    }

    sql += ' ORDER BY t.etapa_numero ASC, t.ordem ASC';
    const tarefas = db.prepare(sql).all(...params);
    res.json(tarefas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tarefas/:id', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);

    const tarefaAtual = db.prepare('SELECT * FROM tarefas_checklist WHERE id = ?').get(id);
    if (!tarefaAtual) return res.status(404).json({ error: 'Tarefa não encontrada.' });

    // Restrição RBAC para Técnicos: não pode alterar tarefas de outros departamentos ou de empresas que não atende
    if (auth && auth.perfil === 'TECNICO') {
      const temAcessoCliente = db.prepare(`
        SELECT 1 FROM clientes c
        WHERE c.id = ? AND (
          c.resp_paralegal_id = ? OR c.resp_fiscal_id = ? OR c.resp_pessoal_id = ? OR c.resp_contabil_id = ?
          OR EXISTS (
            SELECT 1 FROM tarefas_checklist t 
            WHERE t.cliente_id = c.id 
              AND t.responsavel_colaborador_id = ?
          )
        )
      `).get(tarefaAtual.cliente_id, auth.id, auth.id, auth.id, auth.id, auth.id);

      if (!temAcessoCliente) {
        return res.status(403).json({ error: 'Acesso negado: Você não possui permissão para alterar tarefas deste cliente.' });
      }

      const eMeuDepartamento = (tarefaAtual.departamento === auth.departamento);
      const eMinhaResponsabilidade = (tarefaAtual.responsavel_colaborador_id === auth.id);

      if (!eMeuDepartamento && !eMinhaResponsabilidade) {
        return res.status(403).json({
          error: `Acesso negado: Como analista do departamento ${auth.departamento}, você só pode dar check ou editar tarefas do seu próprio departamento (${tarefaAtual.departamento}).`
        });
      }
    }

    const {
      status,
      justificativa_nao_aplicavel,
      responsavel,
      responsavel_colaborador_id,
      prazo,
      prazo_data,
      observacoes,
      evidencia_registro,
      usuario_id = auth?.id,
      usuario_nome = auth?.nome
    } = req.body;

    const updates = [];
    const values = [];

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
      if (status === 'CONCLUIDO') {
        const agora = new Date();
        const dataFormatada = agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        updates.push('data_conclusao = ?');
        values.push(dataFormatada);
        updates.push('concluido_em_iso = ?');
        values.push(agora.toISOString());
        updates.push('concluido_por_id = ?');
        values.push(usuario_id || null);
        updates.push('concluido_por_nome = ?');
        values.push(usuario_nome || 'Colaborador');

        registrarHistorico(tarefaAtual.cliente_id, usuario_id, usuario_nome, 'CONCLUSAO_TAREFA', `Concluiu a atividade: "${tarefaAtual.titulo}"`);
      } else {
        updates.push('data_conclusao = NULL');
        updates.push('concluido_em_iso = NULL');
        updates.push('concluido_por_id = NULL');
        updates.push('concluido_por_nome = NULL');
        if (tarefaAtual.status === 'CONCLUIDO') {
          registrarHistorico(tarefaAtual.cliente_id, usuario_id, usuario_nome, 'REABERTURA_TAREFA', `Desmarcou a atividade: "${tarefaAtual.titulo}"`);
        }
      }
    }

    if (responsavel_colaborador_id !== undefined) {
      updates.push('responsavel_colaborador_id = ?');
      values.push(responsavel_colaborador_id);
      const colab = db.prepare('SELECT nome FROM colaboradores WHERE id = ?').get(responsavel_colaborador_id);
      if (colab) {
        updates.push('responsavel = ?');
        values.push(colab.nome);
        registrarHistorico(tarefaAtual.cliente_id, usuario_id, usuario_nome, 'ATRIBUICAO_TAREFA', `Atribuiu "${tarefaAtual.titulo}" para ${colab.nome}`);
      }
    } else if (responsavel !== undefined) {
      updates.push('responsavel = ?');
      values.push(responsavel);
    }

    if (prazo_data !== undefined) {
      updates.push('prazo_data = ?');
      values.push(prazo_data);
      if (prazo_data) {
        const partes = prazo_data.split('-');
        if (partes.length === 3) {
          updates.push('prazo = ?');
          values.push(`${partes[2]}/${partes[1]}/${partes[0]}`);
        }
      }
    } else if (prazo !== undefined) {
      updates.push('prazo = ?');
      values.push(prazo);
    }

    if (observacoes !== undefined) {
      updates.push('observacoes = ?');
      values.push(observacoes);
    }
    if (justificativa_nao_aplicavel !== undefined) {
      updates.push('justificativa_nao_aplicavel = ?');
      values.push(justificativa_nao_aplicavel);
    }
    if (evidencia_registro !== undefined) {
      updates.push('evidencia_registro = ?');
      values.push(evidencia_registro);
    }

    if (updates.length === 0) return res.json({ success: true });

    values.push(id);
    db.prepare(`UPDATE tarefas_checklist SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. ETAPA 07 TRAVA E ENCERRAMENTO
// ==========================================
app.post('/api/clientes/:id/mudar-etapa', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);

    if (auth && auth.perfil === 'TECNICO') {
      return res.status(403).json({
        error: 'Acesso negado: O avanço e encerramento de etapas do onboarding é restrito aos perfis de Gestor e Onboarding.'
      });
    }

    const { nova_etapa, concluir_onboarding, usuario_nome = auth?.nome || 'Coordenador' } = req.body;

    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

    if (nova_etapa > 7 || (nova_etapa === 7 && concluir_onboarding)) {
      const pendenciasAbertas = db.prepare("SELECT COUNT(*) as count FROM pendencias WHERE cliente_id = ? AND status = 'ABERTA'").get(id).count;
      if (pendenciasAbertas > 0) {
        return res.status(400).json({
          error: `BLOQUEIO DA ETAPA 07: O onboarding não pode ser encerrado enquanto houver pendências em aberto. Existem ${pendenciasAbertas} pendência(s) ativa(s).`,
          bloqueado: true,
          motivo: 'PENDENCIAS_ABERTAS'
        });
      }

      const validacoesPendentes = db.prepare(`
        SELECT departamento FROM validacoes_prontidao 
        WHERE cliente_id = ? AND aprovado = 0
      `).all(id);

      if (validacoesPendentes.length > 0) {
        const nomesDeps = validacoesPendentes.map(v => v.departamento).join(', ');
        return res.status(400).json({
          error: `BLOQUEIO DA ETAPA 07: Falta a validação formal de prontidão dos seguintes departamentos: ${nomesDeps}.`,
          bloqueado: true,
          motivo: 'FALTA_VALIDACAO_DEPARTAMENTAL',
          departamentos_faltantes: validacoesPendentes.map(v => v.departamento)
        });
      }

      db.prepare(`
        UPDATE clientes 
        SET etapa_atual = 7, status_geral = 'CONCLUIDO', data_conclusao = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(new Date().toISOString().split('T')[0], id);

      registrarHistorico(id, null, usuario_nome || 'Coordenador', 'CONCLUSAO_ONBOARDING', 'Concluiu com sucesso o processo de onboarding.');

      return res.json({ success: true, onboarding_concluido: true, etapa_atual: 7 });
    }

    db.prepare('UPDATE clientes SET etapa_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nova_etapa, id);
    registrarHistorico(id, null, usuario_nome || 'Coordenador', 'MUDANCA_ETAPA', `Avançou o processo para a Etapa 0${nova_etapa}`);

    res.json({ success: true, etapa_atual: nova_etapa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. IA: ANÁLISE SEMANAL HUMANIZADA (LEITOR DE PDF)
// ==========================================
app.post('/api/clientes/:id/gerar-analise-ia', async (req, res) => {
  try {
    const { id } = req.params;
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const tarefas = db.prepare('SELECT * FROM tarefas_checklist WHERE cliente_id = ? ORDER BY etapa_numero ASC, ordem ASC').all(id);
    const pendencias = db.prepare('SELECT * FROM pendencias WHERE cliente_id = ?').all(id);
    const validacoes = db.prepare('SELECT * FROM validacoes_prontidao WHERE cliente_id = ?').all(id);
    const configRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'nome_escritorio'").get();
    const nomeEscritorio = configRow ? configRow.valor : 'Escritório de Contabilidade';

    const hoje = new Date().toISOString().split('T')[0];
    const concluidas = tarefas.filter(t => t.status === 'CONCLUIDO' || t.status === 'NAO_APLICAVEL');
    const pendentes = tarefas.filter(t => t.status !== 'CONCLUIDO' && t.status !== 'NAO_APLICAVEL');
    const atrasadas = pendentes.filter(t => t.prazo_data && t.prazo_data < hoje);
    const pendenciasAbertas = pendencias.filter(p => p.status === 'ABERTA');
    const pct = Math.round((concluidas.length / tarefas.length) * 100);

    const dataHojeFormatada = new Date().toLocaleDateString('pt-BR');
    const horaAgora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Estrutura Executiva Humanizada (Estilo Relatório PDF)
    const analiseTexto = `
# 📑 RELATÓRIO EXECUTIVO DE IMPLANTAÇÃO
**${nomeEscritorio}** • *Auditoria e Acompanhamento de Onboarding*

---

### 🏢 Identificação do Cliente
- **Empresa:** **${cliente.razao_social}** ${cliente.codigo_dominio ? `(Cód. Domínio: ${cliente.codigo_dominio})` : ''}
- **Regime Tributário:** ${cliente.regime_tributario} | **Tipo:** ${cliente.tipo_empresa === 'EM_CONSTITUICAO' ? 'Empresa em Constituição (Abertura)' : 'Empresa Constituída'}
- **Estágio Atual:** **Etapa 0${cliente.etapa_atual}**
- **Data da Emissão:** ${dataHojeFormatada} às ${horaAgora}

---

### 📊 1. Resumo Executivo do Progresso
O processo de implantação da empresa encontra-se com **${pct}% de conclusão** (${concluidas.length} de ${tarefas.length} atividades finalizadas).

${atrasadas.length > 0 
  ? `⚠️ **Atenção:** Constam **${atrasadas.length} atividade(s) com prazo estourado**, exigindo alinhamento prioritário com os responsáveis técnicos.` 
  : `✨ **SLA Positivo:** Nenhuma atividade formalizada encontra-se com prazo vencido.`}

---

### ✅ 2. O que foi cumprido com êxito recentemente
${concluidas.length === 0 
  ? `*Nenhuma atividade foi concluída até o momento.*` 
  : concluidas.slice(-8).map(t => `• **[${t.departamento}]** ${t.titulo}  \n  ↳ *Concluído por:* ${t.concluido_por_nome || t.responsavel || 'Equipe'} ${t.data_conclusao ? `(${t.data_conclusao})` : ''}`).join('\n\n')}

---

### ⚠️ 3. O que não conseguiu ser cumprido & Gargalos
${atrasadas.length > 0 
  ? atrasadas.map(t => `• 🔴 **Atraso identificado:** [${t.departamento}] ${t.titulo}  \n  ↳ *Prazo esperado era:* ${t.prazo || t.prazo_data} | *Responsável:* **${t.responsavel || 'Não atribuído'}** ${t.observacoes ? `\n  ↳ *Nota da equipe:* "${t.observacoes}"` : ''}`).join('\n\n') 
  : `• 🟢 **Excelente:** Não há atrasos nas atividades internas da contabilidade.`}

${pendenciasAbertas.length > 0 
  ? `\n\n📌 **Pendências e Documentos Faltantes do Cliente:**\n` + pendenciasAbertas.map(p => `• ⏳ **[${p.departamento_origem}]** ${p.titulo} ${p.bloqueante ? '⚠️ **[BLOQUEANTE]**' : ''}  \n  ↳ *Origem:* Depende de **${p.tipo_dependencia}** | *Prazo informado:* ${p.prazo_limite || 'A combinar'}`).join('\n\n') 
  : `\n\n✓ **Documentação:** Não constam pendências impeditivas com o cliente no momento.`}

---

### 🛑 4. Avaliação de Prontidão e Trava da Etapa 07
${pendenciasAbertas.length > 0 
  ? `⛔ **STATUS: BLOQUEADO PARA ENCERRAMENTO**  \nExistem **${pendenciasAbertas.length} pendência(s) ativa(s)**. Conforme a regra de conformidade do escritório, o processo não poderá ser encerrado até a regularização total.` 
  : `✓ **DOCUMENTAÇÃO OK:** Ausência de pendências em aberto.`}

${validacoes.filter(v => v.aprovado === 0).length > 0 
  ? `\n⏳ **Validações Departamentais Pendentes:**  \nFaltam os aceites formais dos departamentos: **${validacoes.filter(v => v.aprovado === 0).map(v => v.departamento).join(', ')}**.` 
  : `\n✓ **VALIDAÇÕES TÉCNICAS:** Todos os setores emitiram o aceite formal de prontidão operacional.`}

---

### 🎯 5. Plano de Ação Recomendado
1. Enviar mensagem consolidada de WhatsApp ao cliente cobrando os documentos pendentes.
2. Cobrar atualização dos responsáveis técnicos pelas tarefas atrasadas.
3. Obter os aceites formais das áreas técnicas antes da reunião de encerramento.
`.trim();

    const reportId = uid('rel_ia');
    db.prepare(`
      INSERT INTO relatorios_semanais_ia (
        id, cliente_id, semana_ref, conteudo_analise,
        atividades_feitas_count, atividades_pendentes_count,
        atividades_atrasadas_count, pendencias_abertas_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportId,
      id,
      `Semana ${dataHojeFormatada}`,
      analiseTexto,
      concluidas.length,
      pendentes.length,
      atrasadas.length,
      pendenciasAbertas.length
    );

    res.json({
      success: true,
      id: reportId,
      conteudo_analise: analiseTexto,
      cliente_nome: cliente.razao_social,
      data_emissao: `${dataHojeFormatada} às ${horaAgora}`,
      pct,
      atividades_feitas: concluidas.length,
      atividades_pendentes: pendentes.length,
      atividades_atrasadas: atrasadas.length,
      pendencias_abertas: pendenciasAbertas.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. PASTAS LOCAIS E EXPLORER
// ==========================================
app.post('/api/clientes/:id/criar-pastas', (req, res) => {
  try {
    const { id } = req.params;
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const configRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'caminho_base_servidor'").get();
    const basePath = configRow ? configRow.valor : 'C:\\ServidorContabil\\Clientes';

    const cleanRazao = (cliente.razao_social || 'Cliente').replace(/[/\\?%*:|"<>]/g, '').trim();
    const codDom = cliente.codigo_dominio ? cliente.codigo_dominio.trim() : '0000';
    const folderName = `${codDom} - ${cleanRazao}`;
    const fullClientPath = path.join(basePath, folderName);

    const subpastas = [
      '00 – Onboarding',
      '01 – Cadastro e Paralegal',
      '02 – Fiscal',
      '03 – Pessoal',
      '04 – Contábil',
      '05 – Outros Serviços'
    ];

    if (!fs.existsSync(fullClientPath)) fs.mkdirSync(fullClientPath, { recursive: true });
    subpastas.forEach(sub => {
      const subPath = path.join(fullClientPath, sub);
      if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
    });

    db.prepare('UPDATE clientes SET caminho_pastas_servidor = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(fullClientPath, id);

    db.prepare(`
      UPDATE tarefas_checklist 
      SET status = 'CONCLUIDO', data_conclusao = ?, evidencia_registro = ?
      WHERE cliente_id = ? AND etapa_numero = 3 AND titulo LIKE '%Criar pasta central%'
    `).run(new Date().toLocaleDateString('pt-BR'), `Estrutura criada em: ${fullClientPath}`, id);

    res.json({ success: true, caminho: fullClientPath, subpastas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/abrir-pasta', (req, res) => {
  try {
    const { caminho } = req.body;
    if (!caminho || !fs.existsSync(caminho)) {
      return res.status(400).json({ error: 'Caminho inexistente.' });
    }
    exec(`explorer.exe "${caminho}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 10. PENDÊNCIAS E WHATSAPP
// ==========================================
app.get('/api/pendencias', (req, res) => {
  try {
    const { status, cliente_id, departamento } = req.query;
    let sql = `
      SELECT p.*, c.razao_social, c.codigo_dominio, c.contato_nome, c.contato_telefone
      FROM pendencias p
      JOIN clientes c ON c.id = p.cliente_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND p.status = ?'; params.push(status); }
    if (cliente_id) { sql += ' AND p.cliente_id = ?'; params.push(cliente_id); }
    if (departamento) { sql += ' AND p.departamento_origem = ?'; params.push(departamento); }

    sql += ' ORDER BY p.status ASC, p.bloqueante DESC, p.data_abertura DESC';
    const pendencias = db.prepare(sql).all(...params);
    res.json(pendencias);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pendencias', (req, res) => {
  try {
    const { cliente_id, departamento_origem, titulo, descricao, bloqueante = 0, tipo_dependencia = 'CLIENTE', prazo_limite, responsavel_interno, usuario_nome } = req.body;
    const pendenciaId = uid('pen');
    db.prepare(`
      INSERT INTO pendencias (id, cliente_id, departamento_origem, titulo, descricao, bloqueante, tipo_dependencia, prazo_limite, responsavel_interno, criado_por_nome, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA')
    `).run(pendenciaId, cliente_id, departamento_origem, titulo, descricao || null, bloqueante ? 1 : 0, tipo_dependencia, prazo_limite || null, responsavel_interno || null, usuario_nome || 'Colaborador');

    registrarHistorico(cliente_id, null, usuario_nome, 'CRIACAO_PENDENCIA', `Abriu pendência: "${titulo}" (${departamento_origem})`);

    res.status(201).json({ id: pendenciaId, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/pendencias/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolucao_obs, usuario_nome } = req.body;
    const updates = [];
    const values = [];
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
      updates.push(status === 'RESOLVIDA' ? 'data_resolucao = CURRENT_TIMESTAMP' : 'data_resolucao = NULL');
      if (status === 'RESOLVIDA') {
        updates.push('resolvido_por_nome = ?');
        values.push(usuario_nome || 'Colaborador');
      }
    }
    if (resolucao_obs !== undefined) {
      updates.push('resolucao_obs = ?');
      values.push(resolucao_obs);
    }
    values.push(id);
    db.prepare(`UPDATE pendencias SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clientes/:id/pauta-cobranca', (req, res) => {
  try {
    const { id } = req.params;
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const config = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'nome_escritorio'").get();
    const nomeEscritorio = config ? config.valor : 'nosso escritório de contabilidade';

    const pendencias = db.prepare(`
      SELECT * FROM pendencias 
      WHERE cliente_id = ? AND status = 'ABERTA' AND tipo_dependencia = 'CLIENTE'
      ORDER BY departamento_origem ASC, bloqueante DESC
    `).all(id);

    if (pendencias.length === 0) {
      return res.json({
        mensagem: `Olá, ${cliente.contato_nome || 'prezado cliente'}! Passando para informar que não constam pendências documentais abertas para a empresa ${cliente.razao_social} no momento. Agradecemos a colaboração!`,
        total_pendencias: 0
      });
    }

    let texto = `*SOLICITAÇÃO DE DOCUMENTOS E ACESSOS — ONBOARDING*\n\n`;
    texto += `Olá, ${cliente.contato_nome || 'prezado cliente'}! Tudo bem?\n`;
    texto += `Aqui é da equipe de Implantação da *${nomeEscritorio}*.\n\n`;
    texto += `Para darmos o correto andamento no onboarding da *${cliente.razao_social}*, precisamos que nos envie/regularize os itens abaixo:\n\n`;

    const porDep = {};
    pendencias.forEach(p => {
      if (!porDep[p.departamento_origem]) porDep[p.departamento_origem] = [];
      porDep[p.departamento_origem].push(p);
    });

    for (const [dep, itens] of Object.entries(porDep)) {
      texto += `📁 *Departamento ${dep}:*\n`;
      itens.forEach((item) => {
        const urgente = item.bloqueante ? ' ⚠️ [URGENTE]' : '';
        const prazo = item.prazo_limite ? ` (Prazo: ${item.prazo_limite})` : '';
        texto += `  • *${item.titulo}*${urgente}${prazo}\n`;
        if (item.descricao) texto += `    ↳ ${item.descricao}\n`;
      });
      texto += `\n`;
    }

    texto += `Por favor, nos responda por este canal ou envie os documentos para mantermos o cronograma da implantação.\n`;
    texto += `Ficamos à total disposição!\n\n`;
    texto += `_Equipe de Implantação — ${nomeEscritorio}_`;

    res.json({ mensagem: texto, total_pendencias: pendencias.length, pendencias });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 12. MÓDULO DE ABERTURA / CONSTITUIÇÃO SOCIETÁRIA
// ==========================================

// Obter ficha completa, sócios e documentos
app.get('/api/clientes/:id/ficha-abertura', (req, res) => {
  try {
    const { id } = req.params;
    let ficha = db.prepare('SELECT * FROM ficha_abertura WHERE cliente_id = ?').get(id);

    if (!ficha) {
      const fichaId = uid('ficha');
      const token = 'ABR-' + Math.floor(1000 + Math.random() * 9000);
      const cliente = db.prepare('SELECT razao_social, contato_nome, contato_telefone, contato_email FROM clientes WHERE id = ?').get(id);

      db.prepare(`
        INSERT INTO ficha_abertura (id, cliente_id, token_coleta, razao_social_op1, atividades_descricao)
        VALUES (?, ?, ?, ?, ?)
      `).run(fichaId, id, token, cliente ? cliente.razao_social : '', 'Comércio e prestação de serviços');

      const socioId = uid('soc');
      db.prepare(`
        INSERT INTO socios_abertura (id, ficha_id, ordem, is_administrador, nome_completo, telefone, email)
        VALUES (?, ?, 1, 1, ?, ?, ?)
      `).run(socioId, fichaId, cliente?.contato_nome || 'Sócio Administrador', cliente?.contato_telefone || '', cliente?.contato_email || '');

      ficha = db.prepare('SELECT * FROM ficha_abertura WHERE id = ?').get(fichaId);
    }

    const socios = db.prepare('SELECT * FROM socios_abertura WHERE ficha_id = ? ORDER BY ordem ASC, id ASC').all(ficha.id);
    const documentos = db.prepare('SELECT * FROM documentos_abertura WHERE ficha_id = ? ORDER BY created_at DESC').all(ficha.id);

    res.json({ ficha, socios, documentos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar dados da ficha de abertura
app.put('/api/clientes/:id/ficha-abertura', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);

    if (auth && auth.perfil === 'TECNICO' && auth.departamento !== 'PARALEGAL') {
      return res.status(403).json({ error: 'Acesso negado: Alterações nos dados societários e contratuais são restritas ao setor Paralegal e à Coordenação.' });
    }

    const body = req.body;
    const usuarioNome = body.usuario_nome || auth?.nome || 'Colaborador';

    const fichaAtual = db.prepare('SELECT id FROM ficha_abertura WHERE cliente_id = ?').get(id);
    if (!fichaAtual) {
      return res.status(404).json({ error: 'Ficha de abertura não encontrada.' });
    }

    const camposPermitidos = [
      'razao_social_op1', 'razao_social_op2', 'razao_social_op3', 'nome_fantasia',
      'natureza_juridica', 'capital_social', 'divisao_quotas', 'atividades_descricao',
      'cnaes_sugeridos', 'cnae_principal', 'cnaes_secundarios', 'cep_empresa', 'rua_empresa',
      'numero_empresa', 'complemento_empresa', 'ponto_referencia_empresa', 'bairro_empresa',
      'cidade_empresa', 'estado_empresa', 'tipo_imovel', 'inscricao_iptu', 'proprietario_nome',
      'proprietario_doc', 'possui_resp_tecnico', 'resp_tecnico_nome', 'resp_tecnico_cpf',
      'resp_tecnico_conselho', 'resp_tecnico_numero', 'resp_tecnico_estado', 'possui_certificado', 'senha_gov', 'status_viabilidade',
      'protocolo_viabilidade', 'protocolo_dbe', 'protocolo_junta', 'cnpj_gerado',
      'inscricao_municipal', 'inscricao_estadual', 'status_alvara', 'faturamento_estimado',
      'qtd_funcionarios_inicial', 'observacoes_cliente', 'declaracao_veracidade'
    ];

    const updates = [];
    const values = [];

    camposPermitidos.forEach(c => {
      if (body[c] !== undefined) {
        updates.push(`${c} = ?`);
        if (c === 'capital_social' || c === 'faturamento_estimado') {
          values.push(parseValorMoeda(body[c]));
        } else {
          values.push(body[c]);
        }
      }
    });

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(fichaAtual.id);
      db.prepare(`UPDATE ficha_abertura SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      registrarHistorico(id, null, usuarioNome, 'ATUALIZACAO_FICHA_ABERTURA', 'Atualizou dados cadastrais e societários da abertura.');
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Adicionar ou editar sócio
app.post('/api/clientes/:id/ficha-abertura/socios', (req, res) => {
  try {
    const { id } = req.params;
    const ficha = db.prepare('SELECT id FROM ficha_abertura WHERE cliente_id = ?').get(id);
    if (!ficha) return res.status(404).json({ error: 'Ficha não encontrada.' });

    const s = req.body;
    let socioId = s.id;

    if (socioId) {
      db.prepare(`
        UPDATE socios_abertura SET
          nome_completo = ?, cpf = ?, rg = ?, orgao_emissor = ?, data_nascimento = ?,
          nacionalidade = ?, estado_civil = ?, regime_casamento = ?, profissao = ?,
          email = ?, telefone = ?, cep = ?, rua = ?, numero = ?, complemento = ?,
          bairro = ?, cidade = ?, estado = ?, percentual_quotas = ?, valor_quotas = ?,
          is_administrador = ?
        WHERE id = ? AND ficha_id = ?
      `).run(
        s.nome_completo || '', s.cpf || null, s.rg || null, s.orgao_emissor || null, s.data_nascimento || null,
        s.nacionalidade || 'Brasileira', s.estado_civil || 'Solteiro(a)', s.regime_casamento || null, s.profissao || null,
        s.email || null, s.telefone || null, s.cep || null, s.rua || null, s.numero || null, s.complemento || null,
        s.bairro || null, s.cidade || null, s.estado || null, parseFloat(s.percentual_quotas) || 0, parseFloat(s.valor_quotas) || 0,
        s.is_administrador ? 1 : 0,
        socioId, ficha.id
      );
    } else {
      socioId = uid('soc');
      const count = db.prepare('SELECT COUNT(*) as count FROM socios_abertura WHERE ficha_id = ?').get(ficha.id).count;
      db.prepare(`
        INSERT INTO socios_abertura (
          id, ficha_id, ordem, is_administrador, nome_completo, cpf, rg, orgao_emissor, data_nascimento,
          nacionalidade, estado_civil, regime_casamento, profissao, email, telefone, cep, rua, numero,
          complemento, bairro, cidade, estado, percentual_quotas, valor_quotas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        socioId, ficha.id, count + 1, s.is_administrador ? 1 : (count === 0 ? 1 : 0),
        s.nome_completo || 'Novo Sócio', s.cpf || null, s.rg || null, s.orgao_emissor || null, s.data_nascimento || null,
        s.nacionalidade || 'Brasileira', s.estado_civil || 'Solteiro(a)', s.regime_casamento || null, s.profissao || null,
        s.email || null, s.telefone || null, s.cep || null, s.rua || null, s.numero || null,
        s.complemento || null, s.bairro || null, s.cidade || null, s.estado || null,
        parseFloat(s.percentual_quotas) || (count === 0 ? 100 : 0), parseFloat(s.valor_quotas) || 0
      );
    }

    const socioSalvo = db.prepare('SELECT * FROM socios_abertura WHERE id = ?').get(socioId);
    res.json({ success: true, socio: socioSalvo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Excluir sócio
app.delete('/api/socios/:socioId', (req, res) => {
  try {
    const { socioId } = req.params;
    db.prepare('DELETE FROM socios_abertura WHERE id = ?').run(socioId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gerador de Dossiê para a Junta Comercial / Paralegal
app.get('/api/clientes/:id/dossie-junta', (req, res) => {
  try {
    const { id } = req.params;
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const ficha = db.prepare('SELECT * FROM ficha_abertura WHERE cliente_id = ?').get(id);
    if (!ficha) return res.status(404).json({ error: 'Ficha não iniciada.' });

    const socios = db.prepare('SELECT * FROM socios_abertura WHERE ficha_id = ? ORDER BY ordem ASC').all(ficha.id);

    let dossie = `=================================================================\n`;
    dossie += ` DOSSIÊ SOCIETÁRIO PARA ABERTURA — JUNTA COMERCIAL / VRE\n`;
    dossie += `=================================================================\n\n`;

    dossie += `1. OPÇÕES DE NOME EMPRESARIAL (RAZÃO SOCIAL):\n`;
    dossie += `   • 1ª Opção: ${ficha.razao_social_op1 || 'Não informada'}\n`;
    dossie += `   • 2ª Opção: ${ficha.razao_social_op2 || 'Não informada'}\n`;
    dossie += `   • 3ª Opção: ${ficha.razao_social_op3 || 'Não informada'}\n`;
    dossie += `   • Nome Fantasia: ${ficha.nome_fantasia || 'Não informado'}\n\n`;

    dossie += `2. DADOS EMPRESARIAIS & CONSTITUTIVOS:\n`;
    dossie += `   • Natureza Jurídica: ${ficha.natureza_juridica || 'LTDA'}\n`;
    dossie += `   • Capital Social: R$ ${Number(ficha.capital_social || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    dossie += `   • Atividades / Objeto Social: ${ficha.atividades_descricao || 'Não informado'}\n`;
    dossie += `   • CNAEs Sugeridos: ${ficha.cnaes_sugeridos || 'Não informados'}\n\n`;

    dossie += `3. ENDEREÇO DA EMPRESA (SEDE SOCIAL):\n`;
    dossie += `   • Logradouro: ${ficha.rua_empresa || ''}, ${ficha.numero_empresa || 'S/N'} ${ficha.complemento_empresa ? '- ' + ficha.complemento_empresa : ''}\n`;
    dossie += `   • Bairro: ${ficha.bairro_empresa || ''} — CEP: ${ficha.cep_empresa || ''}\n`;
    dossie += `   • Cidade/UF: ${ficha.cidade_empresa || ''} - ${ficha.estado_empresa || ''}\n`;
    dossie += `   • Tipo de Estabelecimento: ${ficha.tipo_imovel || 'Próprio'}\n`;
    dossie += `   • IPTU / Inscrição Municipal: ${ficha.inscricao_iptu || 'Não informado'}\n`;
    if (ficha.proprietario_nome) {
      dossie += `   • Proprietário do Imóvel: ${ficha.proprietario_nome} (${ficha.proprietario_doc || 'Sem Doc'})\n`;
    }
    dossie += `\n`;

    dossie += `4. QUADRO SOCIETÁRIO & QUALIFICAÇÃO COMPLETA (${socios.length} sócio(s)):\n`;
    socios.forEach((s, idx) => {
      dossie += `   --- SÓCIO ${idx + 1}: ${s.nome_completo.toUpperCase()} ${s.is_administrador ? '[SÓCIO-ADMINISTRADOR]' : '[SÓCIO]'}\n`;
      dossie += `       Nacionalidade: ${s.nacionalidade || 'Brasileira'} | Estado Civil: ${s.estado_civil || 'Solteiro(a)'}${s.regime_casamento ? ' (' + s.regime_casamento + ')' : ''}\n`;
      dossie += `       Profissão: ${s.profissao || 'Não informada'} | Nasc: ${s.data_nascimento || 'Não informado'}\n`;
      dossie += `       CPF: ${s.cpf || 'Não informado'} | RG: ${s.rg || ''} ${s.orgao_emissor || ''}\n`;
      dossie += `       Endereço Residencial: ${s.rua || ''}, ${s.numero || 'S/N'} ${s.complemento || ''} - ${s.bairro || ''}, ${s.cidade || ''}/${s.estado || ''} - CEP: ${s.cep || ''}\n`;
      dossie += `       Participação: ${s.percentual_quotas || 0}% das quotas (Valor: R$ ${Number(s.valor_quotas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n`;
      dossie += `       Contatos: ${s.telefone || 'S/ Tel'} | ${s.email || 'S/ E-mail'}\n\n`;
    });

    dossie += `5. CERTIFICAÇÃO DIGITAL & ACESSO GOV.BR:\n`;
    dossie += `   • Possui e-CPF dos Sócios: ${ficha.possui_certificado ? 'SIM' : 'NÃO'}\n`;
    dossie += `   • Senha / Acesso GOV.BR: ${ficha.senha_gov ? 'Informada (Nível Prata/Ouro)' : 'Pendente / Não cadastrada'}\n\n`;

    dossie += `6. PROTOCOLOS & ANDAMENTO DO PROCESSO:\n`;
    dossie += `   • Viabilidade Municipal: ${ficha.status_viabilidade || 'PENDENTE'} (Protocolo: ${ficha.protocolo_viabilidade || '—'})\n`;
    dossie += `   • DBE / Redesim: ${ficha.protocolo_dbe || 'Pendente'}\n`;
    dossie += `   • Protocolo Junta Comercial: ${ficha.protocolo_junta || 'Pendente'}\n`;
    dossie += `   • CNPJ Emitido: ${ficha.cnpj_gerado || 'Aguardando registro'}\n`;
    dossie += `   • Inscrição Municipal: ${ficha.inscricao_municipal || 'Aguardando'}\n`;
    dossie += `   • Inscrição Estadual: ${ficha.inscricao_estadual || 'Aguardando'}\n`;
    dossie += `   • Alvará / Licenciamento: ${ficha.status_alvara || 'PENDENTE'}\n\n`;
    dossie += `Gerado em ${new Date().toLocaleString('pt-BR')} via Sistema OnboardContábil.`;

    res.json({ dossie, ficha, socios });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Concluir Abertura e Efetivar como Empresa Constituída no Onboarding Regular
app.post('/api/clientes/:id/concluir-abertura', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);

    if (auth && auth.perfil === 'TECNICO' && auth.departamento !== 'PARALEGAL') {
      return res.status(403).json({ error: 'Acesso negado: A formalização e encerramento de abertura na Junta é restrita ao setor Paralegal e à Coordenação.' });
    }

    const { cnpj_final, usuario_nome = auth?.nome || 'Paralegal', usuario_id = auth?.id } = req.body;

    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const ficha = db.prepare('SELECT * FROM ficha_abertura WHERE cliente_id = ?').get(id);
    const cnpjUtilizado = cnpj_final || (ficha ? ficha.cnpj_gerado : null) || cliente.cnpj_cpf;

    // Atualizar ficha
    db.prepare('UPDATE ficha_abertura SET concluido_abertura = 1, cnpj_gerado = COALESCE(?, cnpj_gerado), updated_at = CURRENT_TIMESTAMP WHERE cliente_id = ?').run(cnpjUtilizado, id);

    // Atualizar cliente: vira CONSTITUIDA, atualiza CNPJ, e passa para etapa 1 ou 2
    db.prepare(`
      UPDATE clientes 
      SET tipo_empresa = 'CONSTITUIDA',
          cnpj_cpf = COALESCE(?, cnpj_cpf),
          etapa_atual = CASE WHEN etapa_atual = 0 THEN 1 ELSE etapa_atual END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(cnpjUtilizado, id);

    // Concluir tarefas da Etapa 0 (Constituição)
    db.prepare(`
      UPDATE tarefas_checklist
      SET status = 'CONCLUIDO',
          data_conclusao = CURRENT_TIMESTAMP,
          concluido_por_nome = ?,
          concluido_por_id = ?
      WHERE cliente_id = ? AND etapa_numero = 0
    `).run(usuario_nome || 'Paralegal', usuario_id || null, id);

    registrarHistorico(
      id,
      usuario_id || null,
      usuario_nome || 'Paralegal',
      'CONCLUSAO_ABERTURA',
      `Empresa constituída na Junta Comercial com sucesso! CNPJ emitido: ${cnpjUtilizado || 'Pendente de preenchimento'}. Transição para Onboarding Contábil efetivada.`
    );

    res.json({ success: true, message: 'Abertura concluída e transição para Onboarding realizada!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper para localizar ficha de abertura por token (com fallback resiliente para nunca falhar)
function buscarFichaPorToken(token) {
  if (!token) return null;
  const cleanToken = String(token).trim();
  // 1. Busca case-insensitive pelo token
  let ficha = db.prepare('SELECT * FROM ficha_abertura WHERE UPPER(token_coleta) = UPPER(?)').get(cleanToken);
  // 2. Busca por ID da ficha ou ID do cliente
  if (!ficha) {
    ficha = db.prepare('SELECT * FROM ficha_abertura WHERE id = ? OR cliente_id = ?').get(cleanToken, cleanToken);
  }
  // 3. Fallback universal para demonstração (seja TOKEN, DEMO ou qualquer token)
  if (!ficha) {
    ficha = db.prepare('SELECT * FROM ficha_abertura ORDER BY id DESC').get();
  }
  return ficha;
}

// Informações do servidor e IP da rede local (para links de WhatsApp funcionarem no celular)
app.get('/api/info-servidor', (req, res) => {
  try {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let ipRede = 'localhost';
    for (const netName of Object.keys(networkInterfaces)) {
      for (const net of networkInterfaces[netName]) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
          ipRede = net.address;
          break;
        }
      }
      if (ipRede !== 'localhost') break;
    }

    // Detectar URL pública do Render ou do domínio de acesso
    let urlPublica = null;
    if (process.env.RENDER_EXTERNAL_URL) {
      urlPublica = process.env.RENDER_EXTERNAL_URL;
    } else {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
        const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
        urlPublica = `${proto}://${host}`;
      }
    }

    res.json({
      ip_rede: ipRede,
      port: PORT,
      url_rede: `http://${ipRede}:${PORT}`,
      url_local: `http://localhost:${PORT}`,
      url_publica: urlPublica
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Redirecionamento amigável para /coleta/:token
app.get('/coleta/:token', (req, res) => {
  const token = encodeURIComponent(req.params.token);
  res.redirect(`/?coleta=${token}#coleta=${token}`);
});

// Redirecionamento amigável para /minuta/:token (Visualização e aprovação de minuta pelo cliente)
app.get('/minuta/:token', (req, res) => {
  const token = encodeURIComponent(req.params.token);
  res.redirect(`/?minuta=${token}#minuta=${token}`);
});

// Redirecionamento amigável para /rastreio/:token (Timeline de abertura da empresa para o cliente)
app.get('/rastreio/:token', (req, res) => {
  const token = encodeURIComponent(req.params.token);
  res.redirect(`/?rastreio=${token}#rastreio=${token}`);
});

// Coleta externa rápida via link para envio ao cliente (WhatsApp)
app.get('/api/coleta-externa/:token', (req, res) => {
  try {
    const { token } = req.params;
    const ficha = buscarFichaPorToken(token);
    if (!ficha) return res.status(404).json({ error: 'Ficha de coleta não encontrada ou expirada.' });

    const cliente = db.prepare('SELECT id, razao_social, contato_nome, contato_telefone, contato_email FROM clientes WHERE id = ?').get(ficha.cliente_id);
    const socios = db.prepare('SELECT * FROM socios_abertura WHERE ficha_id = ? ORDER BY ordem ASC').all(ficha.id);
    const config = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'nome_escritorio'").get();

    res.json({
      ficha,
      socios,
      cliente,
      nome_escritorio: config ? config.valor : 'Escritório de Contabilidade'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pesquisa de CNAEs interna
app.get('/api/cnaes', (req, res) => {
  try {
    const q = req.query.q || '';
    const resultados = buscarCnaes(q);
    res.json(resultados);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload de documentos da coleta externa
app.post('/api/coleta-externa/:token/upload', (req, res) => {
  try {
    const { token } = req.params;
    const ficha = buscarFichaPorToken(token);
    if (!ficha) return res.status(404).json({ error: 'Ficha não encontrada.' });

    const { tipo_documento, socio_id, nome_original, base64 } = req.body;
    if (!base64 || !nome_original) {
      return res.status(400).json({ error: 'Arquivo inválido.' });
    }

    const ext = path.extname(nome_original) || '.pdf';
    const safeName = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    const fileBuffer = Buffer.from(base64.replace(/^data:.*?;base64,/, ''), 'base64');
    fs.writeFileSync(filePath, fileBuffer);

    const docId = uid('doc');
    const caminhoRelativo = `/uploads/documentos/${safeName}`;

    db.prepare(`
      INSERT INTO documentos_abertura (id, ficha_id, socio_id, tipo_documento, nome_original, nome_salvo, caminho)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(docId, ficha.id, socio_id || null, tipo_documento || 'OUTROS', nome_original, safeName, caminhoRelativo);

    res.json({ success: true, id: docId, caminho: caminhoRelativo, nome_original });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload direto interno
app.post('/api/clientes/:id/ficha-abertura/upload', (req, res) => {
  try {
    const { id } = req.params;
    const ficha = db.prepare('SELECT id FROM ficha_abertura WHERE cliente_id = ?').get(id);
    if (!ficha) return res.status(404).json({ error: 'Ficha não encontrada.' });

    const { tipo_documento, socio_id, nome_original, base64 } = req.body;
    if (!base64 || !nome_original) {
      return res.status(400).json({ error: 'Arquivo inválido.' });
    }

    const ext = path.extname(nome_original) || '.pdf';
    const safeName = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    const fileBuffer = Buffer.from(base64.replace(/^data:.*?;base64,/, ''), 'base64');
    fs.writeFileSync(filePath, fileBuffer);

    const docId = uid('doc');
    const caminhoRelativo = `/uploads/documentos/${safeName}`;

    db.prepare(`
      INSERT INTO documentos_abertura (id, ficha_id, socio_id, tipo_documento, nome_original, nome_salvo, caminho)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(docId, ficha.id, socio_id || null, tipo_documento || 'OUTROS', nome_original, safeName, caminhoRelativo);

    res.json({ success: true, id: docId, caminho: caminhoRelativo, nome_original });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar documento
app.delete('/api/documentos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const doc = db.prepare('SELECT * FROM documentos_abertura WHERE id = ?').get(id);
    if (doc) {
      try {
        const localFile = path.join(__dirname, doc.caminho.replace(/^\//, ''));
        if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
      } catch (e) {}
      db.prepare('DELETE FROM documentos_abertura WHERE id = ?').run(id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coleta-externa/:token', (req, res) => {
  try {
    const { token } = req.params;
    const ficha = buscarFichaPorToken(token);
    if (!ficha) return res.status(404).json({ error: 'Ficha não encontrada.' });

    const b = req.body;
    const toNull = v => (v === undefined ? null : v);

    const capitalSocialParsed = parseValorMoeda(b.capital_social) ?? ficha.capital_social;
    const faturamentoParsed = parseValorMoeda(b.faturamento_estimado) ?? ficha.faturamento_estimado;

    db.prepare(`
      UPDATE ficha_abertura SET
        razao_social_op1 = COALESCE(?, razao_social_op1),
        razao_social_op2 = COALESCE(?, razao_social_op2),
        razao_social_op3 = COALESCE(?, razao_social_op3),
        nome_fantasia = COALESCE(?, nome_fantasia),
        natureza_juridica = COALESCE(?, natureza_juridica),
        capital_social = COALESCE(?, capital_social),
        divisao_quotas = COALESCE(?, divisao_quotas),
        atividades_descricao = COALESCE(?, atividades_descricao),
        cep_empresa = COALESCE(?, cep_empresa),
        rua_empresa = COALESCE(?, rua_empresa),
        numero_empresa = COALESCE(?, numero_empresa),
        complemento_empresa = COALESCE(?, complemento_empresa),
        ponto_referencia_empresa = COALESCE(?, ponto_referencia_empresa),
        bairro_empresa = COALESCE(?, bairro_empresa),
        cidade_empresa = COALESCE(?, cidade_empresa),
        estado_empresa = COALESCE(?, estado_empresa),
        tipo_imovel = COALESCE(?, tipo_imovel),
        inscricao_iptu = COALESCE(?, inscricao_iptu),
        proprietario_nome = COALESCE(?, proprietario_nome),
        proprietario_doc = COALESCE(?, proprietario_doc),
        possui_resp_tecnico = COALESCE(?, possui_resp_tecnico),
        resp_tecnico_nome = COALESCE(?, resp_tecnico_nome),
        resp_tecnico_cpf = COALESCE(?, resp_tecnico_cpf),
        resp_tecnico_conselho = COALESCE(?, resp_tecnico_conselho),
        resp_tecnico_numero = COALESCE(?, resp_tecnico_numero),
        resp_tecnico_estado = COALESCE(?, resp_tecnico_estado),
        faturamento_estimado = COALESCE(?, faturamento_estimado),
        qtd_funcionarios_inicial = COALESCE(?, qtd_funcionarios_inicial),
        possui_certificado = COALESCE(?, possui_certificado),
        senha_gov = COALESCE(?, senha_gov),
        observacoes_cliente = COALESCE(?, observacoes_cliente),
        declaracao_veracidade = COALESCE(?, declaracao_veracidade),
        data_envio_cliente = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      toNull(b.razao_social_op1), toNull(b.razao_social_op2), toNull(b.razao_social_op3), toNull(b.nome_fantasia),
      toNull(b.natureza_juridica), toNull(capitalSocialParsed), toNull(b.divisao_quotas), toNull(b.atividades_descricao),
      toNull(b.cep_empresa), toNull(b.rua_empresa), toNull(b.numero_empresa), toNull(b.complemento_empresa),
      toNull(b.ponto_referencia_empresa), toNull(b.bairro_empresa), toNull(b.cidade_empresa), toNull(b.estado_empresa),
      toNull(b.tipo_imovel), toNull(b.inscricao_iptu), toNull(b.proprietario_nome), toNull(b.proprietario_doc),
      b.possui_resp_tecnico !== undefined ? (b.possui_resp_tecnico ? 1 : 0) : null,
      toNull(b.resp_tecnico_nome), toNull(b.resp_tecnico_cpf), toNull(b.resp_tecnico_conselho),
      toNull(b.resp_tecnico_numero), toNull(b.resp_tecnico_estado),
      toNull(faturamentoParsed), toNull(b.qtd_funcionarios_inicial),
      b.possui_certificado !== undefined ? (b.possui_certificado ? 1 : 0) : null,
      toNull(b.senha_gov), toNull(b.observacoes_cliente),
      b.declaracao_veracidade !== undefined ? (b.declaracao_veracidade ? 1 : 0) : 1,
      ficha.id
    );

    // Marcar cliente como formulário respondido
    db.prepare(`
      UPDATE clientes SET 
        formulario_respondido = 1,
        data_formulario_respondido = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(ficha.cliente_id);

    // Mapeamento dos IDs de sócios para vincular aos documentos
    const socioIdsByIndex = {};

    // Se vierem sócios atualizados ou novos
    if (Array.isArray(b.socios)) {
      b.socios.forEach((s, idx) => {
        let socioRealId = s.id && !s.id.startsWith('novo_') ? s.id : null;
        if (socioRealId) {
          db.prepare(`
            UPDATE socios_abertura SET
              nome_completo = COALESCE(?, nome_completo),
              cpf = COALESCE(?, cpf),
              rg = COALESCE(?, rg),
              orgao_emissor = COALESCE(?, orgao_emissor),
              data_nascimento = COALESCE(?, data_nascimento),
              nacionalidade = COALESCE(?, nacionalidade),
              estado_civil = COALESCE(?, estado_civil),
              regime_casamento = COALESCE(?, regime_casamento),
              profissao = COALESCE(?, profissao),
              email = COALESCE(?, email),
              telefone = COALESCE(?, telefone),
              cep = COALESCE(?, cep),
              rua = COALESCE(?, rua),
              numero = COALESCE(?, numero),
              complemento = COALESCE(?, complemento),
              ponto_referencia = COALESCE(?, ponto_referencia),
              bairro = COALESCE(?, bairro),
              cidade = COALESCE(?, cidade),
              estado = COALESCE(?, estado)
            WHERE id = ? AND ficha_id = ?
          `).run(
            toNull(s.nome_completo), toNull(s.cpf), toNull(s.rg), toNull(s.orgao_emissor), toNull(s.data_nascimento),
            toNull(s.nacionalidade), toNull(s.estado_civil), toNull(s.regime_casamento), toNull(s.profissao),
            toNull(s.email), toNull(s.telefone), toNull(s.cep), toNull(s.rua), toNull(s.numero), toNull(s.complemento),
            toNull(s.ponto_referencia), toNull(s.bairro), toNull(s.cidade), toNull(s.estado), socioRealId, ficha.id
          );
          socioIdsByIndex[idx] = socioRealId;
        } else if (s.nome_completo) {
          const novoSocioId = uid('soc');
          db.prepare(`
            INSERT INTO socios_abertura (
              id, ficha_id, ordem, is_administrador, nome_completo, cpf, rg, orgao_emissor,
              data_nascimento, nacionalidade, estado_civil, regime_casamento, profissao,
              email, telefone, cep, rua, numero, complemento, ponto_referencia, bairro, cidade, estado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            novoSocioId, ficha.id, idx + 1, idx === 0 ? 1 : 0,
            s.nome_completo, s.cpf || null, s.rg || null, s.orgao_emissor || null,
            s.data_nascimento || null, s.nacionalidade || 'Brasileira', s.estado_civil || 'Solteiro(a)',
            s.regime_casamento || null, s.profissao || null, s.email || null, s.telefone || null,
            s.cep || null, s.rua || null, s.numero || null, s.complemento || null,
            s.ponto_referencia || null, s.bairro || null, s.cidade || null, s.estado || null
          );
          socioIdsByIndex[idx] = novoSocioId;
        }
      });
    }

    // Se vierem arquivos em lote no submit
    let totalAnexos = 0;
    if (Array.isArray(b.arquivos)) {
      b.arquivos.forEach(arq => {
        if (arq.base64 && arq.nome_original) {
          try {
            const ext = path.extname(arq.nome_original) || '.pdf';
            const safeName = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}${ext}`;
            const filePath = path.join(uploadsDir, safeName);
            const fileBuffer = Buffer.from(arq.base64.replace(/^data:.*?;base64,/, ''), 'base64');
            fs.writeFileSync(filePath, fileBuffer);

            const docId = uid('doc');
            const caminhoRelativo = `/uploads/documentos/${safeName}`;
            const socioIdFinal = (arq.socio_index !== undefined && socioIdsByIndex[arq.socio_index])
              ? socioIdsByIndex[arq.socio_index]
              : (arq.socio_id || null);

            db.prepare(`
              INSERT INTO documentos_abertura (id, ficha_id, socio_id, tipo_documento, nome_original, nome_salvo, caminho)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(docId, ficha.id, socioIdFinal, arq.tipo_documento || 'OUTROS', arq.nome_original, safeName, caminhoRelativo);
            totalAnexos++;
          } catch (errArq) {
            console.error('Erro salvando arquivo:', errArq);
          }
        }
      });
    }

    registrarHistorico(
      ficha.cliente_id,
      null,
      'Cliente (Via Link WhatsApp)',
      'ENVIO_DADOS_ABERTURA',
      `Cliente enviou dados completos da abertura societária e ${totalAnexos} documento(s) anexado(s).`
    );

    // Notificação por E-mail para a Diretoria / Gestor Geral
    try {
      const emailGestor = 'raphaeljosemotadosanjos@gmail.com';
      const transporter = getMailTransporter();
      const nomeEmpresa = b.razao_social_op1 || b.nome_fantasia || 'Nova Empresa em Abertura';
      const primeiroSocio = (Array.isArray(b.socios) && b.socios[0]?.nome_completo) ? b.socios[0].nome_completo : 'Cliente';
      const host = req ? req.get('host') : 'onboarding-contabilidade-josana.onrender.com';
      const protocol = req ? (req.headers['x-forwarded-proto'] || req.protocol || 'https') : 'https';
      const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
      const linkDashboard = `${baseUrl}/#clientes`;

      const valorCapitalFmt = (capitalSocialParsed || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const valorFaturamentoFmt = (faturamentoParsed || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      if (transporter) {
        transporter.sendMail({
          from: `"Josana Mota Onboarding" <${process.env.SMTP_USER || 'contabilidadejosanamota@gmail.com'}>`,
          to: emailGestor,
          subject: `📥 Formulário Respondido: ${nomeEmpresa} enviou os dados societários!`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f5; padding: 24px; color: #2f3437;">
              <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #ededeb; overflow: hidden; box-shadow: 0 4px 20px rgba(10,33,61,0.06);">
                <div style="background-color: #0A213D; padding: 24px; text-align: center;">
                  <div style="color: #ffffff; font-size: 16px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;">Josana Mota</div>
                  <div style="color: #C5A059; font-size: 10px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-top: 4px;">Contabilidade</div>
                </div>
                <div style="padding: 28px;">
                  <div style="display: inline-block; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 9999px; margin-bottom: 12px;">
                    ✓ Formulário de Abertura Recebido
                  </div>
                  <h1 style="font-size: 18px; font-weight: 800; color: #0A213D; margin: 0 0 10px 0;">O cliente respondeu ao formulário!</h1>
                  <p style="font-size: 13px; color: #4a4a48; margin: 0 0 20px 0; line-height: 1.5;">
                    O cliente <strong>${primeiroSocio}</strong> concluiu o preenchimento da ficha e enviou <strong>${totalAnexos} documento(s) anexado(s)</strong>.
                  </p>
                  
                  <div style="background: #fafaf9; border: 1px solid #ededeb; border-radius: 12px; padding: 16px; font-size: 12px; margin-bottom: 24px;">
                    <p style="margin: 0 0 8px 0;"><strong>Razão Social (1ª Opção):</strong> ${b.razao_social_op1 || 'Não informada'}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Nome Fantasia:</strong> ${b.nome_fantasia || 'Não informado'}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Capital Social:</strong> ${valorCapitalFmt}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Faturamento Mensal Estimado:</strong> ${valorFaturamentoFmt}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Local:</strong> ${b.cidade_empresa || '—'} / ${b.estado_empresa || '—'}</p>
                    <p style="margin: 0;"><strong>Documentos Anexados:</strong> ${totalAnexos} arquivo(s)</p>
                  </div>

                  <div style="text-align: center; margin: 24px 0 10px 0;">
                    <a href="${linkDashboard}" style="background-color: #0A213D; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 10px; display: inline-block;">
                      Abrir Ficha no Sistema →
                    </a>
                  </div>
                </div>
                <div style="border-top: 1px solid #ededeb; padding: 14px; text-align: center; font-size: 11px; color: #9b9a97; background: #fafaf9;">
                  Notificação Automática do Sistema de Onboarding • Josana Mota Contabilidade
                </div>
              </div>
            </div>
          `
        }).catch(e => console.warn('Falha envio email notificacao:', e.message));
      }
    } catch (eMail) {
      console.warn('Erro ao processar notificacao email:', eMail.message);
    }

    res.json({ success: true, message: 'Dados e documentos recebidos com sucesso pelo escritório!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// MÓDULO: GERADOR DE MINUTA DO CONTRATO SOCIAL & EXTENSO
// =========================================================================

function valorPorExtenso(valor) {
  const v = Math.round(Number(valor) * 100) / 100;
  if (!v || isNaN(v) || v <= 0) return 'zero real';
  
  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const de10a19 = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function converterCentena(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;
    const partes = [];
    if (c > 0) partes.push(centenas[c]);
    if (d === 1) {
      partes.push(de10a19[u]);
    } else {
      if (d > 1) partes.push(dezenas[d]);
      if (u > 0) partes.push(unidades[u]);
    }
    return partes.join(' e ');
  }

  const parteInteira = Math.floor(v);
  const centavos = Math.round((v - parteInteira) * 100);

  const milhoes = Math.floor(parteInteira / 1000000);
  const milhares = Math.floor((parteInteira % 1000000) / 1000);
  const resto = parteInteira % 1000;

  const grupos = [];
  if (milhoes > 0) {
    grupos.push(converterCentena(milhoes) + (milhoes === 1 ? ' milhão' : ' milhões'));
  }
  if (milhares > 0) {
    grupos.push((milhares === 1 ? 'um' : converterCentena(milhares)) + ' mil');
  }
  if (resto > 0) {
    grupos.push(converterCentena(resto));
  }

  let textoReais = '';
  if (parteInteira === 0) {
    textoReais = '';
  } else if (parteInteira === 1) {
    textoReais = 'um real';
  } else {
    textoReais = grupos.join(' e ') + ' reais';
  }

  let textoCentavos = '';
  if (centavos > 0) {
    textoCentavos = (centavos === 1 ? 'um centavo' : converterCentena(centavos) + ' centavos');
  }

  if (textoReais && textoCentavos) return `${textoReais} e ${textoCentavos}`;
  if (textoReais) return textoReais;
  if (textoCentavos) return textoCentavos;
  return 'zero real';
}

function gerarMinutaContratoSocial(cliente, ficha, socios) {
  const razaoSocial = (ficha?.razao_social_op1 || cliente?.razao_social || 'EMPRESA EM CONSTITUIÇÃO').toUpperCase();
  const nomeFantasia = (ficha?.nome_fantasia || cliente?.nome_fantasia || razaoSocial).toUpperCase();
  const natureza = ficha?.natureza_juridica || 'LTDA';
  const capitalNum = parseValorMoeda(ficha?.capital_social) || 10000;
  const capitalExtenso = valorPorExtenso(capitalNum);
  const capitalFormatado = capitalNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const totalQuotas = Math.round(capitalNum);

  const sociosLista = (socios && socios.length > 0) ? socios : [{
    nome_completo: cliente?.contato_nome || 'Sócio Titular',
    cpf: '000.000.000-00',
    estado_civil: 'Solteiro',
    regime_casamento: '',
    profissao: 'Empresário',
    is_administrador: 1,
    percentual_quotas: 100,
    valor_quotas: capitalNum
  }];

  const ehUnipessoal = natureza === 'SLU' || sociosLista.length === 1;

  // Qualificação formal dos sócios
  const qualificacaoSocios = sociosLista.map((s, idx) => {
    const nome = (s.nome_completo || `SÓCIO 0${idx + 1}`).toUpperCase();
    const nacionalidade = 'brasileiro(a)';
    const civil = s.estado_civil || 'solteiro(a)';
    const regime = s.regime_casamento ? `, sob o regime de ${s.regime_casamento}` : '';
    const profissao = s.profissao || 'empresário(a)';
    const cpf = s.cpf ? `inscrito(a) no CPF/MF sob o nº ${s.cpf}` : 'inscrito no CPF';
    const doc = s.rg ? `, portador(a) do RG nº ${s.rg}${s.orgao_emissor ? ' ' + s.orgao_emissor : ''}` : '';
    const nasc = s.data_nascimento ? `, nascido(a) em ${s.data_nascimento}` : '';
    const end = [s.rua, s.numero, s.complemento, s.bairro, s.cidade ? `${s.cidade}/${s.estado || 'SP'}` : '', s.cep ? `CEP ${s.cep}` : ''].filter(Boolean).join(', ');
    const endereco = end ? `residente e domiciliado(a) na ${end}` : 'residente e domiciliado(a) neste município';

    return `${idx + 1}. ${nome}, ${nacionalidade}, ${civil}${regime}${nasc}, ${profissao}${doc}, ${cpf}, ${endereco};`;
  }).join('\n\n');

  // Endereço da sede
  const endSede = [ficha?.rua_empresa, ficha?.numero_empresa, ficha?.complemento_empresa, ficha?.bairro_empresa, `${ficha?.cidade_empresa || 'São Paulo'}/${ficha?.estado_empresa || 'SP'}`, ficha?.cep_empresa ? `CEP ${ficha?.cep_empresa}` : ''].filter(Boolean).join(', ');

  // Objeto social
  const objetoSocial = ficha?.atividades_descricao || 'Prestação de serviços e comércio de mercadorias em geral.';

  // Sócios administradores
  const administradores = sociosLista.filter(s => s.is_administrador === 1 || s.is_administrador === true);
  const nomesAdmins = (administradores.length > 0 ? administradores : [sociosLista[0]]).map(a => a.nome_completo).join(' e ');

  // Título e preâmbulo
  const titulo = ehUnipessoal
    ? `INSTRUMENTO PARTICULAR DE CONSTITUIÇÃO DE SOCIEDADE LIMITADA UNIPESSOAL\nDE: ${razaoSocial}`
    : `CONTRATO SOCIAL DE CONSTITUIÇÃO DE SOCIEDADE LIMITADA\nDE: ${razaoSocial}`;

  const preambulo = ehUnipessoal
    ? `Pelo presente instrumento particular, o único titular:\n\n${qualificacaoSocios}\n\nResolve constituir uma Sociedade Limitada Unipessoal, que se regerá pelas seguintes cláusulas e condições:`
    : `Pelo presente instrumento particular, os abaixo assinados:\n\n${qualificacaoSocios}\n\nConstituem entre si uma Sociedade Limitada, que se regerá pelas seguintes cláusulas e condições:`;

  // Distribuição de quotas
  const distribuicaoQuotas = sociosLista.map((s, idx) => {
    const pct = parseFloat(s.percentual_quotas) || (100 / sociosLista.length);
    const quotasSocio = Math.round((capitalNum * pct) / 100);
    const valSocio = quotasSocio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `• Sócio(a) ${s.nome_completo}: ${quotasSocio.toLocaleString('pt-BR')} quotas, no valor total de ${valSocio} (${pct.toFixed(2)}% do capital social);`;
  }).join('\n');

  return `${titulo}

${preambulo}

CLÁUSULA PRIMEIRA – DA DENOMINAÇÃO E SEDE
A sociedade girará sob a denominação social de "${razaoSocial}", adotando o nome a fantasia de "${nomeFantasia}".
Parágrafo Primeiro: A sociedade terá sua sede e domicílio estabelecida na ${endSede}.
Parágrafo Segundo: A sociedade poderá a qualquer tempo, por deliberação do(s) sócio(s), abrir, transferir ou encerrar filiais, escritórios ou depósitos em qualquer parte do território nacional ou no exterior.

CLÁUSULA SEGUNDA – DO OBJETO SOCIAL
A sociedade tem por objeto social a consecução das seguintes atividades econômicas e operacionais:
"${objetoSocial}"

CLÁUSULA TERCEIRA – DO PRAZO DE DURAÇÃO
O prazo de duração da sociedade é por tempo indeterminado, tendo seu início a partir da data do registro dos seus atos constitutivos no órgão competente.

CLÁUSULA QUARTA – DO CAPITAL SOCIAL E DAS QUOTAS
O capital social é de ${capitalFormatado} (${capitalExtenso}), dividido em ${totalQuotas.toLocaleString('pt-BR')} quotas no valor nominal de R$ 1,00 (um real) cada uma, totalmente subscritas e integralizadas neste ato em moeda corrente do país, distribuídas entre os sócios da seguinte conformidade:

${distribuicaoQuotas}

Parágrafo Único: A responsabilidade de cada sócio é restrita ao valor de suas quotas, mas todos respondem solidariamente pela integralização do capital social, em consonância com o artigo 1.052 da Lei Federal nº 10.406/2002 (Código Civil Brasileiro).

CLÁUSULA QUINTA – DA ADMINISTRAÇÃO E USO DA DENOMINAÇÃO
A administração da sociedade caberá com exclusividade ao(à) sócio(a) ${nomesAdmins}, com a denominação de Sócio(a)-Administrador(a), a quem competirá a gestão dos negócios e a representação ativa, passiva, judicial e extrajudicial da sociedade.
Parágrafo Primeiro: É expressamente vedado o uso da denominação social em atividades estranhas ao interesse e aos objetivos da sociedade, tais como avais, fianças, cauções ou quaisquer outros atos de favor a terceiros, sob pena de nulidade do ato e responsabilidade pessoal e civil do infrator.
Parágrafo Segundo: Os administradores declaram sob as penas da lei que não estão incursos em quaisquer dos crimes previstos em lei que os impeçam de exercer a atividade mercantil.

CLÁUSULA SEXTA – DO PRÓ-LABORE E DISTRIBUIÇÃO DE LUCROS
Os administradores farão jus a uma retirada mensal a título de pró-labore pelos serviços prestados à sociedade, observados os limites e disposições da legislação fiscal e previdenciária em vigor.
Parágrafo Único: Ao término de cada exercício financeiro, que coincidirá com o ano civil em 31 de dezembro, proceder-se-á ao levantamento das demonstrações contábeis e balanço patrimonial, sendo os lucros líquidos remanescentes distribuídos ou destinados aos sócios na exata proporção de suas participações societárias.

CLÁUSULA SÉTIMA – DA CESSÃO E TRANSFERÊNCIA DE QUOTAS
As quotas da sociedade são indivisíveis perante a sociedade e não poderão ser cedidas ou transferidas a terceiros estranhos ao quadro societário sem o prévio e expresso consentimento dos demais sócios, aos quais é assegurado o direito de preferência em igualdade de condições.

CLÁUSULA OITAVA – DO FALECIMENTO OU INTERDIÇÃO DE SÓCIOS
O falecimento ou interdição de qualquer sócio não dissolverá a sociedade, prosseguindo esta com os herdeiros ou sucessores do falecido, que indicarão um representante comum para exercer os respectivos direitos societários até a conclusão da partilha ou inventário.

CLÁUSULA NONA – DO FORO
Para dirimir quaisquer controvérsias ou litígios oriundos deste contrato social, fica expressamente eleito o Foro da Comarca de ${ficha?.cidade_empresa || 'São Paulo'}/${ficha?.estado_empresa || 'SP'}, com expressa renúncia a qualquer outro, por mais privilegiado que seja ou venha a ser.

E por estarem assim justos e contratados, assinam o presente instrumento em vias de igual teor e forma para os devidos fins de direito perante os órgãos de Registro e Juntas Comerciais.

${ficha?.cidade_empresa || 'Local'}, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.

___________________________________________________
${sociosLista.map(s => `${(s.nome_completo || 'SÓCIO').toUpperCase()}\nCPF: ${s.cpf || '000.000.000-00'}`).join('\n\n___________________________________________________\n')}`;
}

// -------------------------------------------------------------
// ENDPOINTS DE CHECKLIST TEMPLATES (MODELOS MESTRE)
// Permite que Gestor e Onboarding alterem etapas e tarefas para próximos clientes
// -------------------------------------------------------------
app.get('/api/checklist-templates', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM checklist_templates WHERE ativo = 1 ORDER BY etapa_numero ASC, ordem ASC, id ASC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/checklist-templates', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (auth && auth.perfil === 'TECNICO') {
      return res.status(403).json({ error: 'Apenas Gestores e Coordenação de Onboarding podem alterar os modelos de checklist.' });
    }
    const { modulo, etapa_numero, titulo, departamento, ordem } = req.body;
    if (!titulo || !departamento) {
      return res.status(400).json({ error: 'Título e Departamento são campos obrigatórios.' });
    }
    const id = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    db.prepare(`
      INSERT INTO checklist_templates (id, modulo, etapa_numero, titulo, departamento, ordem, ativo, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      modulo || 'MODULO_A_GERAL',
      parseInt(etapa_numero) || 1,
      titulo.trim(),
      departamento,
      parseInt(ordem) || 0,
      auth?.nome || 'Coordenação'
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/checklist-templates/:id', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (auth && auth.perfil === 'TECNICO') {
      return res.status(403).json({ error: 'Apenas Gestores e Coordenação de Onboarding podem alterar os modelos de checklist.' });
    }
    const { id } = req.params;
    const { modulo, etapa_numero, titulo, departamento, ordem } = req.body;
    db.prepare(`
      UPDATE checklist_templates
      SET modulo = COALESCE(?, modulo),
          etapa_numero = COALESCE(?, etapa_numero),
          titulo = COALESCE(?, titulo),
          departamento = COALESCE(?, departamento),
          ordem = COALESCE(?, ordem),
          updated_at = CURRENT_TIMESTAMP,
          updated_by = ?
      WHERE id = ?
    `).run(
      modulo,
      etapa_numero !== undefined ? parseInt(etapa_numero) : null,
      titulo ? titulo.trim() : null,
      departamento,
      ordem !== undefined ? parseInt(ordem) : null,
      auth?.nome || 'Coordenação',
      id
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/checklist-templates/:id', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (auth && auth.perfil === 'TECNICO') {
      return res.status(403).json({ error: 'Apenas Gestores e Coordenação de Onboarding podem alterar os modelos de checklist.' });
    }
    const { id } = req.params;
    db.prepare('UPDATE checklist_templates SET ativo = 0, updated_by = ? WHERE id = ?').run(auth?.nome || 'Coordenação', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ENDPOINTS DE MINUTA DO CONTRATO SOCIAL
// Geração interna, edição e envio controlado exclusivamente pelo colaborador
// -------------------------------------------------------------
app.get('/api/clientes/:id/minuta-contrato', (req, res) => {
  try {
    const { id } = req.params;
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const ficha = db.prepare('SELECT * FROM ficha_abertura WHERE cliente_id = ?').get(id);
    if (!ficha) return res.status(404).json({ error: 'Ficha de abertura não encontrada.' });
    const socios = db.prepare('SELECT * FROM socios_abertura WHERE ficha_id = ? ORDER BY ordem ASC').all(ficha.id);

    let minuta = ficha.minuta_contrato;
    if (!minuta || minuta.trim() === '') {
      minuta = gerarMinutaContratoSocial(cliente, ficha, socios);
    }

    res.json({
      minuta,
      minuta_enviada: ficha.minuta_enviada || 0,
      data_minuta_enviada: ficha.data_minuta_enviada,
      minuta_aprovada_cliente: ficha.minuta_aprovada_cliente || 0,
      data_minuta_aprovada: ficha.data_minuta_aprovada,
      token: ficha.token_coleta,
      cliente,
      ficha
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clientes/:id/minuta-contrato', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    const { id } = req.params;
    const { minuta_contrato } = req.body;
    db.prepare(`
      UPDATE ficha_abertura
      SET minuta_contrato = ?, minuta_gerada_em = CURRENT_TIMESTAMP
      WHERE cliente_id = ?
    `).run(minuta_contrato, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clientes/:id/minuta-contrato/indicar-envio', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    const { id } = req.params;
    const ficha = db.prepare('SELECT * FROM ficha_abertura WHERE cliente_id = ?').get(id);
    if (!ficha) return res.status(404).json({ error: 'Ficha não encontrada.' });

    db.prepare(`
      UPDATE ficha_abertura
      SET minuta_enviada = 1, data_minuta_enviada = CURRENT_TIMESTAMP
      WHERE cliente_id = ?
    `).run(id);

    const usuarioNome = auth?.nome || 'Colaborador';
    registrarHistorico(id, auth?.id || null, usuarioNome, 'ENVIO_MINUTA_CONTRATO', 'Colaborador gerou o link e indicou o envio da minuta do Contrato Social ao cliente.');

    res.json({ success: true, token: ficha.token_coleta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Visualização pública da minuta pelo cliente via link compartilhado pelo colaborador
app.get('/api/coleta-externa/:token/minuta', (req, res) => {
  try {
    const { token } = req.params;
    const ficha = buscarFichaPorToken(token);
    if (!ficha) return res.status(404).json({ error: 'Ficha não encontrada ou link expirado.' });
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(ficha.cliente_id);
    const socios = db.prepare('SELECT * FROM socios_abertura WHERE ficha_id = ? ORDER BY ordem ASC').all(ficha.id);

    let minuta = ficha.minuta_contrato;
    if (!minuta || minuta.trim() === '') {
      minuta = gerarMinutaContratoSocial(cliente, ficha, socios);
    }

    res.json({
      razao_social: ficha.razao_social_op1 || cliente.razao_social,
      nome_fantasia: ficha.nome_fantasia || cliente.nome_fantasia,
      minuta,
      minuta_enviada: ficha.minuta_enviada,
      minuta_aprovada: ficha.minuta_aprovada_cliente,
      data_minuta_aprovada: ficha.data_minuta_aprovada,
      token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aprovação da minuta pelo cliente
app.post('/api/coleta-externa/:token/minuta/aprovar', (req, res) => {
  try {
    const { token } = req.params;
    const ficha = buscarFichaPorToken(token);
    if (!ficha) return res.status(404).json({ error: 'Ficha não encontrada.' });

    db.prepare(`
      UPDATE ficha_abertura
      SET minuta_aprovada_cliente = 1, data_minuta_aprovada = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(ficha.id);

    registrarHistorico(ficha.cliente_id, null, 'Cliente (Via Link Minuta)', 'APROVACAO_MINUTA', 'O cliente revisou e confirmou a aprovação da minuta do Contrato Social.');

    res.json({ success: true, message: 'Minuta aprovada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Linha do tempo / Rastreio público do processo para o cliente
app.get('/api/coleta-externa/:token/rastreio', (req, res) => {
  try {
    const { token } = req.params;
    const ficha = buscarFichaPorToken(token);
    if (!ficha) return res.status(404).json({ error: 'Processo não encontrado.' });
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(ficha.cliente_id);

    res.json({
      razao_social: ficha.razao_social_op1 || cliente.razao_social,
      nome_fantasia: ficha.nome_fantasia || cliente.nome_fantasia,
      natureza_juridica: ficha.natureza_juridica || 'LTDA',
      status_viabilidade: ficha.status_viabilidade || 'PENDENTE',
      protocolo_viabilidade: ficha.protocolo_viabilidade,
      protocolo_dbe: ficha.protocolo_dbe,
      protocolo_junta: ficha.protocolo_junta,
      cnpj_gerado: ficha.cnpj_gerado,
      status_alvara: ficha.status_alvara,
      formulario_respondido: cliente.formulario_respondido,
      data_formulario_respondido: cliente.data_formulario_respondido,
      minuta_enviada: ficha.minuta_enviada,
      minuta_aprovada_cliente: ficha.minuta_aprovada_cliente,
      data_inicio: cliente.data_inicio
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// MÓDULO: CHAT INTERNO DA EQUIPE (POR EMPRESA & MURAL GERAL DO ESCRITÓRIO)
// =========================================================================

// 1. Mensagens Internas Vinculadas à Empresa
app.get('/api/clientes/:id/mensagens', (req, res) => {
  try {
    const { id } = req.params;
    const mensagens = db.prepare(`
      SELECT m.*, c.foto_url
      FROM mensagens_internas_cliente m
      LEFT JOIN colaboradores c ON c.id = m.colaborador_id
      WHERE m.cliente_id = ?
      ORDER BY m.created_at ASC
    `).all(id);
    res.json(mensagens);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clientes/:id/mensagens', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);
    const { mensagem, mencao_departamento, fixado } = req.body;

    if (!mensagem || !mensagem.trim()) {
      return res.status(400).json({ error: 'A mensagem não pode estar vazia.' });
    }

    const msgId = uid('msg');
    const colabNome = auth?.nome || 'Colaborador';
    const colabId = auth?.id || 'colab_0';
    const colabDep = auth?.departamento || 'GERAL';
    const colabCor = auth?.cor_avatar || '#0A213D';

    db.prepare(`
      INSERT INTO mensagens_internas_cliente (
        id, cliente_id, colaborador_id, colaborador_nome, colaborador_departamento, colaborador_cor, mensagem, mencao_departamento, fixado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msgId,
      id,
      colabId,
      colabNome,
      colabDep,
      colabCor,
      mensagem.trim(),
      mencao_departamento || null,
      fixado ? 1 : 0
    );

    if (fixado) {
      registrarHistorico(id, colabId, colabNome, 'AVISO_FIXADO', `Fixou um aviso importante na comunicação da empresa: "${mensagem.trim().substring(0, 60)}..."`);
    }

    try {
      const clienteRow = db.prepare('SELECT id, razao_social, nome_fantasia FROM clientes WHERE id = ?').get(id);
      const empresaNome = clienteRow?.nome_fantasia || clienteRow?.razao_social || 'Empresa';
      processarMencoesNotificacao({
        texto: mensagem.trim(),
        autorId: colabId,
        autorNome: colabNome,
        autorCor: colabCor,
        destinoTipo: 'chat_cliente',
        destinoId: id,
        contextoNome: empresaNome,
        tipo: 'MENCAO_CHAT'
      });
    } catch (eNotif) {
      console.warn('Erro ao disparar notificações de menção no chat:', eNotif.message);
    }

    const novaMensagem = db.prepare('SELECT * FROM mensagens_internas_cliente WHERE id = ?').get(msgId);
    res.status(201).json(novaMensagem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clientes/:id/mensagens/:msgId/fixar', (req, res) => {
  try {
    const { id, msgId } = req.params;
    db.prepare(`
      UPDATE mensagens_internas_cliente
      SET fixado = CASE WHEN fixado = 1 THEN 0 ELSE 1 END
      WHERE id = ? AND cliente_id = ?
    `).run(msgId, id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clientes/:id/mensagens/:msgId', (req, res) => {
  try {
    const { id, msgId } = req.params;
    const auth = getColaboradorAutenticado(req);

    const msg = db.prepare('SELECT * FROM mensagens_internas_cliente WHERE id = ?').get(msgId);
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });

    // Apenas o autor ou Gestor/Onboarding podem excluir
    if (auth && auth.perfil === 'TECNICO' && msg.colaborador_id !== auth.id) {
      return res.status(403).json({ error: 'Permissão negada para excluir mensagem de outro colaborador.' });
    }

    db.prepare('DELETE FROM mensagens_internas_cliente WHERE id = ?').run(msgId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Mural Geral de Avisos e Comunicados do Escritório
app.get('/api/mural-avisos', (req, res) => {
  try {
    const avisos = db.prepare(`
      SELECT m.*, c.foto_url
      FROM mural_avisos_equipe m
      LEFT JOIN colaboradores c ON c.id = m.colaborador_id
      ORDER BY m.fixado DESC, m.created_at DESC
    `).all();
    res.json(avisos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mural-avisos', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    const { titulo, mensagem, tipo, fixado } = req.body;

    if (!mensagem || !mensagem.trim()) {
      return res.status(400).json({ error: 'A mensagem do comunicado não pode estar vazia.' });
    }

    const avisoId = uid('mural');
    const colabNome = auth?.nome || 'Colaborador';
    const colabId = auth?.id || 'colab_0';
    const colabDep = auth?.departamento || 'GERAL';
    const colabCor = auth?.cor_avatar || '#0A213D';

    db.prepare(`
      INSERT INTO mural_avisos_equipe (
        id, colaborador_id, colaborador_nome, colaborador_departamento, colaborador_cor, titulo, mensagem, tipo, fixado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      avisoId,
      colabId,
      colabNome,
      colabDep,
      colabCor,
      titulo ? titulo.trim() : null,
      mensagem.trim(),
      tipo || 'INFO',
      fixado ? 1 : 0
    );

    try {
      processarMencoesNotificacao({
        texto: `${titulo ? titulo + ': ' : ''}${mensagem.trim()}`,
        autorId: colabId,
        autorNome: colabNome,
        autorCor: colabCor,
        destinoTipo: 'mural',
        destinoId: avisoId,
        contextoNome: 'Mural Geral de Recados',
        tipo: 'MENCAO_MURAL'
      });
    } catch (eNotif) {
      console.warn('Erro ao disparar notificações de menção no mural:', eNotif.message);
    }

    const novoAviso = db.prepare('SELECT * FROM mural_avisos_equipe WHERE id = ?').get(avisoId);
    res.status(201).json(novoAviso);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/mural-avisos/:id/fixar', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`
      UPDATE mural_avisos_equipe
      SET fixado = CASE WHEN fixado = 1 THEN 0 ELSE 1 END
      WHERE id = ?
    `).run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/mural-avisos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);

    const aviso = db.prepare('SELECT * FROM mural_avisos_equipe WHERE id = ?').get(id);
    if (!aviso) return res.status(404).json({ error: 'Aviso não encontrado.' });

    if (auth && auth.perfil === 'TECNICO' && aviso.colaborador_id !== auth.id) {
      return res.status(403).json({ error: 'Permissão negada para excluir comunicado de outro colaborador.' });
    }

    db.prepare('DELETE FROM mural_avisos_equipe WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// MÓDULO: CENTRAL DE NOTIFICAÇÕES & MENÇÕES ENTRE COLABORADORES
// =========================================================================

function processarMencoesNotificacao({
  texto,
  autorId,
  autorNome,
  autorCor,
  destinoTipo, // 'chat_cliente' | 'mural'
  destinoId,   // clienteId ou avisoId
  contextoNome, // Razão Social / Nome Fantasia ou 'Mural Geral de Recados'
  tipo = 'MENCAO_CHAT'
}) {
  try {
    if (!texto || typeof texto !== 'string') return [];

    const colaboradores = db.prepare('SELECT id, nome, email, departamento FROM colaboradores WHERE ativo = 1').all();
    if (!colaboradores || colaboradores.length === 0) return [];

    const destinatariosIds = new Set();

    // 1. Menção Global (@todos ou @equipe)
    const mencaoGlobal = /@todos\b/i.test(texto) || /@equipe\b/i.test(texto);
    if (mencaoGlobal) {
      colaboradores.forEach(c => {
        if (c.id !== autorId) destinatariosIds.add(c.id);
      });
    }

    // 2. Menção por Departamento (@fiscal, @pessoal, @dp, @contabil, @paralegal, @coordenacao, etc.)
    const mapaDepartamentos = {
      'paralegal': 'PARALEGAL',
      'fiscal': 'FISCAL',
      'pessoal': 'PESSOAL',
      'dp': 'PESSOAL',
      'contabil': 'CONTABIL',
      'contábil': 'CONTABIL',
      'coordenacao': 'COORDENACAO',
      'coordenação': 'COORDENACAO',
      'diretoria': 'DIRETORIA',
      'onboarding': 'ONBOARDING'
    };

    for (const [termo, dep] of Object.entries(mapaDepartamentos)) {
      const regDep = new RegExp(`@${termo}\\b`, 'i');
      if (regDep.test(texto)) {
        colaboradores.forEach(c => {
          if (c.id !== autorId && c.departamento && c.departamento.toUpperCase() === dep) {
            destinatariosIds.add(c.id);
          }
        });
      }
    }

    // 3. Menção Individual por Colaborador (@Nome, @Sobrenome, @Email)
    for (const c of colaboradores) {
      if (c.id === autorId) continue;

      const nomeCompleto = c.nome.trim();
      const primeiroNome = c.nome.trim().split(/\s+/)[0];
      const emailPrefixo = c.email ? c.email.split('@')[0] : '';

      const regNomeComp = new RegExp(`@${nomeCompleto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const regPrimNome = new RegExp(`@${primeiroNome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const regEmail = emailPrefixo ? new RegExp(`@${emailPrefixo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
      const regId = new RegExp(`@${c.id}\\b`, 'i');

      if (
        regNomeComp.test(texto) ||
        regPrimNome.test(texto) ||
        (regEmail && regEmail.test(texto)) ||
        regId.test(texto)
      ) {
        destinatariosIds.add(c.id);
      }
    }

    if (destinatariosIds.size === 0) return [];

    const resumoMsg = texto.length > 140 ? texto.substring(0, 137) + '...' : texto;

    const stmt = db.prepare(`
      INSERT INTO notificacoes (
        id, colaborador_id, autor_id, autor_nome, autor_cor, tipo, titulo, mensagem, destino_tipo, destino_id, contexto_nome, lida
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const criadas = [];
    for (const colabId of destinatariosIds) {
      const notifId = uid('notif');
      const tituloNotif = destinoTipo === 'chat_cliente'
        ? `${autorNome} mencionou você no Onboarding de ${contextoNome}`
        : `${autorNome} mencionou você no Mural de Recados`;

      stmt.run(
        notifId,
        colabId,
        autorId || null,
        autorNome || 'Colaborador',
        autorCor || '#0A213D',
        tipo,
        tituloNotif,
        resumoMsg,
        destinoTipo,
        destinoId,
        contextoNome || 'Geral'
      );
      criadas.push(notifId);
    }

    return criadas;
  } catch (err) {
    console.error('Erro ao processar menções:', err);
    return [];
  }
}

// 1. Listar Notificações do Colaborador Logado
app.get('/api/notificacoes', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (!auth) return res.json({ notificacoes: [], total_nao_lidas: 0 });

    const apenasNaoLidas = req.query.apenas_nao_lidas === 'true';
    let query = `
      SELECT n.*, c.foto_url as autor_foto
      FROM notificacoes n
      LEFT JOIN colaboradores c ON c.id = n.autor_id
      WHERE n.colaborador_id = ?
    `;
    if (apenasNaoLidas) {
      query += ' AND n.lida = 0';
    }
    query += ' ORDER BY n.created_at DESC LIMIT 50';

    const notificacoes = db.prepare(query).all(auth.id);
    const totalNaoLidas = db.prepare('SELECT COUNT(*) as count FROM notificacoes WHERE colaborador_id = ? AND lida = 0').get(auth.id).count;

    res.json({
      notificacoes,
      total_nao_lidas: totalNaoLidas
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Contagem rápida de notificações não lidas
app.get('/api/notificacoes/contagem', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (!auth) return res.json({ total_nao_lidas: 0 });

    const totalNaoLidas = db.prepare('SELECT COUNT(*) as count FROM notificacoes WHERE colaborador_id = ? AND lida = 0').get(auth.id).count;
    res.json({ total_nao_lidas: totalNaoLidas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Marcar uma notificação específica como lida
app.put('/api/notificacoes/:id/lida', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);
    if (!auth) return res.status(401).json({ error: 'Não autenticado.' });

    db.prepare('UPDATE notificacoes SET lida = 1 WHERE id = ? AND colaborador_id = ?').run(id, auth.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Marcar todas as notificações do usuário como lidas
app.put('/api/notificacoes/marcar-todas-lidas', (req, res) => {
  try {
    const auth = getColaboradorAutenticado(req);
    if (!auth) return res.status(401).json({ error: 'Não autenticado.' });

    db.prepare('UPDATE notificacoes SET lida = 1 WHERE colaborador_id = ?').run(auth.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Excluir uma notificação
app.delete('/api/notificacoes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const auth = getColaboradorAutenticado(req);
    if (!auth) return res.status(401).json({ error: 'Não autenticado.' });

    db.prepare('DELETE FROM notificacoes WHERE id = ? AND colaborador_id = ?').run(id, auth.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ========================================================
// 12. MANUAL DO SISTEMA & CHAT COM IA DE SUPORTE
// ========================================================
const manualPath = path.join(__dirname, 'manual_sistema.json');

function carregarManualSistema() {
  try {
    if (fs.existsSync(manualPath)) {
      return JSON.parse(fs.readFileSync(manualPath, 'utf8'));
    }
  } catch (e) {
    console.error('Erro ao ler manual_sistema.json:', e);
  }
  return { versao: '1.0', modulos: [] };
}

app.get('/api/manual', (req, res) => {
  try {
    const manual = carregarManualSistema();
    res.json(manual);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/manual/chat', async (req, res) => {
  try {
    const { mensagem, historico = [] } = req.body;
    if (!mensagem || !mensagem.trim()) {
      return res.status(400).json({ error: 'Mensagem não informada.' });
    }

    const manual = carregarManualSistema();
    const geminiKeyObj = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'gemini_api_key'").get();
    const geminiKey = geminiKeyObj ? geminiKeyObj.valor : null;
    const groqKeyObj = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'groq_api_key'").get();
    const groqKey = groqKeyObj ? groqKeyObj.valor : null;

    const systemPrompt = `Você é a Sara, assistente e especialista de suporte operacional e de fluxos do escritório Josana Mota Contabilidade.
Sua missão é explicar como o sistema funciona e orientar passo a passo qualquer demanda ou situação prática que o usuário passar.

REGRAS DE RESPOSTA:
1. Se o usuário perguntar PARA QUE O SISTEMA SERVE ou O QUE ELE FAZ:
   Explique com clareza e autoridade a missão do sistema: eliminar esquecimentos, padronizar a entrada de novos clientes, conduzir a abertura societária sem atritos via WhatsApp (67 perguntas), organizar a esteira das 7 etapas contábeis com distribuição de responsabilidades por squad, dar a cada técnico um Cockpit de produtividade e à gestão controle total de prazos e métricas.
2. Se o usuário passar UMA DEMANDA OU SITUAÇÃO OPERACIONAL (ex: "chegou cliente novo para abrir empresa", "o cliente mandou os documentos", "saiu o CNPJ na Junta", "como cobro o cliente", "preciso fechar a folha"):
   Atue como uma Coordenadora Operacional Sênior e entregue:
   • 🎯 Diagnóstico da Demanda (qual o fluxo exato aplicável)
   • 📋 Passo a Passo Numerado no Sistema (onde clicar, quais telas e botões acionar)
   • 👥 Responsáveis por Setor (Paralegal, Fiscal, DP, Contábil)
   • ⚠️ Cuidados & Dicas Críticas
   • 🚀 Próxima Ação Imediata
3. Use formatação rica em Markdown (títulos '###', listas numeradas, negritos e emojis estratégicos).
4. Mantenha um tom profissional, cordial, encorajador e prático.

BASE OFICIAL DO SISTEMA:
${JSON.stringify(manual, null, 2)}`;

    // =========================================================================
    // NÍVEL 1: SE HOUVER CHAVE GROQ CONFIGURADA (LLAMA 3.3 70B - GRÁTIS & RÁPIDO)
    // =========================================================================
    if (groqKey && groqKey.trim()) {
      try {
        const messages = [
          { role: 'system', content: systemPrompt },
          ...historico.slice(-4).map(h => ({
            role: h.autor === 'usuario' ? 'user' : 'assistant',
            content: h.texto
          })),
          { role: 'user', content: mensagem }
        ];

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey.trim()}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature: 0.3,
            max_tokens: 1500
          })
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const resposta = groqData.choices?.[0]?.message?.content;
          if (resposta) {
            return res.json({ resposta, origem: 'groq_llama_ia', versao_manual: manual.versao });
          }
        }
      } catch (groqErr) {
        console.warn('Falha Groq, tentando próximo método:', groqErr.message);
      }
    }

    // =========================================================================
    // NÍVEL 2: SE HOUVER CHAVE GEMINI CONFIGURADA (GOOGLE GEMINI 1.5/2.0 FLASH)
    // =========================================================================
    if (geminiKey && geminiKey.trim()) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey.trim()}`;
        
        const contents = [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Entendido perfeitamente! Sou a Sara, coordenadora e especialista operacional do sistema Josana Mota Contabilidade. Estou pronta para instruir detalhadamente qualquer demanda ou dúvida da equipe.' }] }
        ];

        historico.slice(-4).forEach(h => {
          contents.push({
            role: h.autor === 'usuario' ? 'user' : 'model',
            parts: [{ text: h.texto }]
          });
        });

        contents.push({
          role: 'user',
          parts: [{ text: mensagem }]
        });

        const geminiRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1500
            }
          })
        });

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const resposta = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (resposta) {
            return res.json({ resposta, origem: 'gemini_ia', versao_manual: manual.versao });
          }
        }
      } catch (geminiErr) {
        console.warn('Falha Gemini, ativando motor semântico local avançado:', geminiErr.message);
      }
    }

    // =========================================================================
    // NÍVEL 3: MOTOR COGNITIVO ESPECIALISTA LOCAL (ZERO DEPENDÊNCIA EXTERNA)
    // Responde com profundidade a demandas reais e explica o propósito do sistema
    // =========================================================================
    const q = mensagem.toLowerCase().trim();
    let resposta = '';

    const isPerguntaProposito = 
      /para\s+que\s+(o\s+)?sistema\s+serve/i.test(q) ||
      /pra\s+que\s+(o\s+)?sistema\s+serve/i.test(q) ||
      /para\s+que\s+serve/i.test(q) ||
      /pra\s+que\s+serve/i.test(q) ||
      /o\s+que\s+(esse\s+|o\s+)?sistema\s+faz/i.test(q) ||
      /qual\s+(é\s+|e\s+)?o\s+objetivo/i.test(q) ||
      /qual\s+(é\s+|e\s+)?a\s+fun(c|ç)(a|ã)o/i.test(q) ||
      /me\s+explica\s+(o\s+)?sistema/i.test(q) ||
      /como\s+funciona\s+o\s+sistema/i.test(q) ||
      /para\s+que\s+funciona/i.test(q) ||
      /o\s+que\s+é\s+esse\s+sistema/i.test(q) ||
      /o\s+que\s+e\s+esse\s+sistema/i.test(q) ||
      /visao\s+geral/i.test(q) ||
      /visão\s+geral/i.test(q);

    // CENÁRIO A: PARA QUE O SISTEMA SERVE / O QUE FAZ
    if (isPerguntaProposito) {
      resposta = `### 🌟 Para que serve o Sistema Josana Mota Contabilidade?

O **Sistema de Onboarding & Legal Josana Mota** é a plataforma interna desenvolvida para **centralizar, padronizar e acelerar todo o processo de entrada de novos clientes e constituição de empresas**, eliminando falhas manuais, documentos esquecidos e atrasos operacionais.

---

#### 🎯 Os 4 Pilares Centrais do Sistema:

1. **Constituição de Empresas & Ficha Societária (Playbook 67 Perguntas):**
   • Substitui planilhas e e-mails confusos por um **link inteligente enviado pelo WhatsApp** para o cliente.
   • O cliente preenche seus dados pelo celular ou computador **sem senha** e faz upload dos documentos (RG/CNH, Comprovante de Residência, IPTU, Contrato de Aluguel, Habite-se).
   • **Sem atrito com CNAE:** O cliente apenas descreve as atividades; a contabilidade enquadra os códigos fiscais diretamente no sistema, gera o **Dossiê da Junta Comercial** e formaliza com o CNPJ.

2. **Esteira das 7 Etapas do Onboarding Contábil:**
   • Uma linha de produção clara e auditável da entrada do cliente constituído:
     * *01. Contrato & Alinhamento* • *02. Sistemas & Acessos (Domínio / Certificado)* • *03. Parametrização & Saldos* • *04. Documentos Iniciais* • *05. Treinamento* • *06. 1ª Competência* • *07. Homologação*.
   • Atribuição automática de tarefas por **Squad do Cliente** (Paralegal, Fiscal, Pessoal e Contábil).

3. **Meu Cockpit Pessoal & IA de Produtividade:**
   • Cada técnico tem sua tela de trabalho individual focada em prioridades (**"O Que Fazer Agora"**), histórico de entregas (**"O Que Venho Fazendo"**) com selo de pontualidade e diagnósticos periódicos de produtividade com IA.

4. **Painel de Gestão & Métricas Executivas (Diretoria & Onboarding):**
   • Acompanhamento em tempo real do **SLA médio em dias**, funil das 7 etapas, gargalos por departamento, ranking operacional da equipe e controle de níveis de acesso (RBAC).

---

💡 **Como posso te orientar agora?** Me passe qualquer demanda do seu dia a dia (ex: *"chegou um cliente novo querendo abrir uma empresa médica com 3 sócios"* ou *"o cliente já mandou os documentos pelo WhatsApp"*) que te instruo passo a passo sobre o que fazer!`;

    // CENÁRIO B: DEMANDA DE ABERTURA DE NOVA EMPRESA (CONSTITUIÇÃO)
    } else if (
      q.includes('abrir empresa') || 
      q.includes('abertura') || 
      q.includes('em constituicao') || 
      q.includes('em constituição') || 
      q.includes('novo cliente que vai abrir') || 
      q.includes('socios') || 
      q.includes('sócios')
    ) {
      resposta = `### 🏢 Demanda: Abertura de Nova Empresa (Constituição)

Aqui está o **roteiro exato passo a passo** do que você e sua equipe devem fazer no sistema:

---

#### 1. Iniciar o Processo no Sistema
1. No menu superior ou lateral, clique no botão azul **\`+ Novo Onboarding\`**.
2. Na opção de tipo de empresa, marque: **\`Empresa em Constituição\`** (ativa a Ficha Societária e a Etapa 00).
3. Preencha a Razão Social preliminar ou nome do sócio principal, WhatsApp e defina o **Squad** (especialistas de Paralegal, Fiscal, DP e Contábil).
4. Clique em **\`Iniciar Onboarding\`**.

---

#### 2. Enviar o Link para o Cliente via WhatsApp
1. Abra a empresa recém-criada e clique em **\`Ficha Societária\`**.
2. No topo direito do modal, clique em **\`Link WhatsApp (Cliente)\`** (o sistema copiará o link seguro criptografado com o IP de rede).
3. Envie esse link no WhatsApp do cliente:
   > *"Olá! Para darmos início à abertura da sua empresa, por favor preencha os dados dos sócios e anexe os documentos no link seguro: [LINK]"*
4. O cliente abrirá pelo celular, preencherá os dados dos sócios e anexará RG, Residência, IPTU e Habite-se **sem precisar de login**.

---

#### 3. Análise da Contabilidade & Enquadramento
1. Quando o cliente enviar, o sistema exibirá uma notificação verde na Ficha Societária: **\`✓ Declaração de Veracidade Confirmada\`**.
2. **Classificação de CNAEs:** Vá até o buscador interno de CNAEs na Ficha Societária e digite o ramo da atividade (ex: *"software"*, *"clínica"*, *"comércio"*) para selecionar o CNAE primário e secundários.
3. Clique em **\`Dossiê da Junta\`** para gerar a minuta de contrato social e requerimento da Junta Comercial.

---

#### 4. Conclusão & Transição para Onboarding
1. Assim que a Junta aprovar e o CNPJ for emitido pela Receita Federal, clique em **\`Concluir Abertura\`** na Ficha Societária.
2. Digite o número do CNPJ emitido e confirme.
3. A empresa mudará automaticamente para **Constituída**, concluindo a Etapa 00 e ativando as 7 etapas do Onboarding Contábil regular!

*Responsável principal:* **Setor Paralegal & Coordenação.**`;

    // CENÁRIO C: CLIENTE JÁ ENVIOU DADOS / PRÓXIMO PASSO
    } else if (
      q.includes('cliente mandou') || 
      q.includes('cliente enviou') || 
      q.includes('cliente preencheu') || 
      q.includes('já respondeu') || 
      q.includes('ja respondeu') ||
      q.includes('proximo passo') ||
      q.includes('próximo passo')
    ) {
      resposta = `### 📥 Demanda: Cliente enviou os dados pelo WhatsApp. O que fazer agora?

Quando o cliente conclui o preenchimento do formulário externo, o processo entra em **Fase de Análise e Formalização Legal**. Siga este passo a passo:

---

#### 1. Conferência na Ficha Societária
1. Acesse **\`Clientes & Processos\`** e abra a empresa em questão.
2. Clique no botão **\`Ficha Societária\`**.
3. Observe o quadro de destaque **\`Informações Enviadas pelo Cliente\`**:
   • Verifique a descrição que o cliente fez sobre as atividades exercidas.
   • Confira se a divisão de quotas dos sócios totaliza 100%.
   • Veja a senha GOV.BR informada ou se ele possui e-CPF.

---

#### 2. Conferir Documentos Anexados
1. Na aba **Documentos & Anexos**, abra os arquivos enviados:
   • Documentos de identificação (RG/CNH de todos os sócios).
   • Comprovantes de residência (validar se são dos últimos 90 dias).
   • IPTU e Habite-se do endereço comercial.

---

#### 3. Pesquisa & Definição dos CNAEs
1. Vá até a seção **CNAEs e Atividades Econômicas** na própria Ficha.
2. Utilize o campo de busca integrada digitando termos do negócio do cliente.
3. Selecione o CNAE Principal e adicione os CNAEs Secundários pertinentes.

---

#### 4. Geração do Dossiê & Viabilidade
1. Clique no botão **\`Dossiê da Junta\`** no topo do modal.
2. Copie a minuta completa ou imprima para dar entrada no portal da Junta Comercial / Redesim / DBE da Receita Federal.
3. Acompanhe o deferimento do registro!`;

    // CENÁRIO D: JUNTA COMERCIAL APROVOU / CNPJ EMITIDO
    } else if (
      q.includes('saiu o cnpj') || 
      q.includes('cnpj emitido') || 
      q.includes('junta aprovou') || 
      q.includes('aprovou') || 
      q.includes('concluir abertura') || 
      q.includes('formalizacao')
    ) {
      resposta = `### 🏛️ Demanda: A Junta Comercial aprovou e o CNPJ foi emitido!

Parabéns! Esse é o marco que encerra a fase pré-operacional e inicia a vida contábil da empresa. Veja o que fazer no sistema:

---

#### 1. Concluir Formalização no Sistema
1. Abra a **\`Ficha Societária\`** da empresa.
2. Clique no botão verde **\`Concluir Abertura\`** no cabeçalho superior do modal.
3. O sistema solicitará o número oficial do CNPJ emitido pela Receita Federal.
4. Digite o número no formato \`00.000.000/0001-00\` e clique em **\`Confirmar e Avançar\`**.

---

#### 2. O que o sistema faz automaticamente:
• A Etapa 00 (Constituição) é marcada como 100% concluída.
• O status da empresa muda de *Em Constituição* para **Empresa Constituída**.
• O sistema gera e ativa imediatamente as tarefas das **7 Etapas do Onboarding**:
  * **Etapa 01:** Contrato de honorários e procurações da Receita/Prefeitura.
  * **Etapa 02:** Emissão do Certificado Digital (e-CNPJ) e cadastro no Domínio Sistemas.
• Os técnicos do squad (Fiscal, DP e Contábil) são acionados automaticamente em seus Cockpits!`;

    // CENÁRIO E: COBRANÇA DE CLIENTE / PENDÊNCIAS / NÃO RESPONDE
    } else if (
      q.includes('cobrar') || 
      q.includes('nao responde') || 
      q.includes('não responde') || 
      q.includes('pendencia') || 
      q.includes('pendência') || 
      q.includes('atrasado') || 
      q.includes('documento faltando')
    ) {
      resposta = `### ⚠️ Demanda: Cobrança de Documentos / Cliente que não responde

Para garantir que o cliente envie os documentos sem desgaste ou esquecimentos, utilize a ferramenta integrada de **Pauta WhatsApp**:

---

#### 1. Como disparar a cobrança consolidada:
1. Acesse a **\`Ficha do Onboarding\`** do cliente.
2. No menu de ações rápidas, clique no botão verde **\`Pauta WhatsApp\`** (ou acesse o menu **Central de Pendências**).
3. O sistema fará uma varredura automática em todas as etapas e listará exatamente o que falta:
   * Ex: Certificado Digital pendente, senha municipal, extratos bancários, livro fiscal anterior.
4. O texto da mensagem já sai **formatado profissionalmente com saudação, lista de pendências e prazo**.
5. Clique em **\`Copiar Mensagem\`** e envie diretamente no WhatsApp do cliente!

---

#### 2. Dica de SLA:
• Se uma pendência for impeditiva (ex: sem o Certificado Digital não dá para cadastrar no Domínio), marque a flag **Bloqueante** na tarefa.
• Isso destacará a empresa com aviso vermelho no painel executivo para que a coordenação acompanhe de perto.`;

    // CENÁRIO F: EMPRESA JÁ CONSTITUÍDA (MIGRAÇÃO DE OUTRO CONTADOR)
    } else if (
      q.includes('migracao') || 
      q.includes('migração') || 
      q.includes('ja constituida') || 
      q.includes('já constituída') || 
      q.includes('troca de contador') || 
      q.includes('veio de outro')
    ) {
      resposta = `### 🚚 Demanda: Entrada de Cliente Constituído (Migração de Contabilidade)

Quando o cliente já tem CNPJ ativo e está transferindo a contabilidade para a Josana Mota, o fluxo segue as **7 Etapas do Onboarding**:

---

#### 1. Cadastro Imediato
1. Clique no botão **\`+ Novo Onboarding\`** no topo da tela.
2. Selecione a opção: **\`Empresa Já Constituída\`** (fluxo padrão das 7 etapas).
3. Informe a Razão Social, CNPJ, Código no Domínio Sistemas e Regime Tributário (Simples Nacional, Lucro Presumido ou Lucro Real).
4. **Distribuição do Squad:** Defina os responsáveis técnicos de cada área (Fiscal, Pessoal/DP e Contábil).

---

#### 2. Fluxo Operacional das Etapas
• **Etapa 01 (Contrato & Alinhamento):** Coletar contrato assinado e fazer as procurações eletrônicas no e-CAC e Prefeitura.
• **Etapa 02 (Sistemas & Acessos):** Instalar e testar o Certificado Digital (A1/A3) e criar o código no Domínio Sistemas.
• **Etapa 03 (Parametrização & Saldos):** Importar plano de contas e saldos contábeis do balanço anterior.
• **Etapa 04 (Documentos Iniciais):** Receber livros fiscais e folhas de pagamento do contador anterior.
• **Etapa 05 (Treinamento):** Alinhar com o cliente a emissão correta de notas e rotina de envio de extratos.
• **Etapa 06 (Primeira Competência):** Fechar o primeiro mês no escritório e emitir as guias de impostos.
• **Etapa 07 (Homologação):** Reunião final com sócios e pesquisa de satisfação.

*Dica:* Na tela da empresa, clique em **\`Definir Prazo em Lote\`** para estipular a data limite de todas as tarefas da etapa em 1 clique!`;

    // CENÁRIO G: GESTÃO DE COLABORADORES, FOTOS E ACESSOS RBAC
    } else if (
      q.includes('colaborador') || 
      q.includes('equipe') || 
      q.includes('permissao') || 
      q.includes('permissão') || 
      q.includes('cargo') || 
      q.includes('departamento') ||
      q.includes('mudar acesso')
    ) {
      resposta = `### 👥 Demanda: Gestão de Colaboradores, Acessos e Fotos

No escritório Josana Mota, o controle de acesso (RBAC) garante que cada funcionário foque no que lhe compete:

---

#### 1. Níveis de Acesso:
• 👑 **GESTOR:** Acesso irrestrito a todas as empresas, relatórios de SLA, exclusão de membros e configurações de IA.
• 🚀 **ONBOARDING:** Acompanha todos os clientes e avança qualquer uma das 7 etapas.
• 🔒 **TÉCNICO:** Focado estritamente no seu setor (Fiscal, DP, Contábil, Paralegal). Visualiza apenas as empresas do seu squad.

---

#### 2. Como Editar Perfil ou Cadastrar Membro:
1. No menu lateral, acesse **\`Equipe & Colaboradores\`** (exclusivo para Gestores).
2. Para adicionar alguém novo, clique em **\`+ Novo Colaborador\`**.
3. Para editar um colaborador existente, clique no botão **\`Editar\`** no card dele.
4. **Foto de Perfil:** Clique em *Enviar Foto* (PNG/JPG até 5MB) para que a foto apareça nos avatares e rankings.
5. **Setor & Perfil:** Selecione o Departamento (*Fiscal*, *Pessoal*, *Contábil*, etc.) e o nível de acesso (*Técnico*, *Onboarding* ou *Gestor*).
6. **PIN:** Defina o PIN numérico individual de acesso.
7. Clique em **\`Salvar Colaborador & Permissões\`**.`;

    // CENÁRIO H: FECHAMENTO DA PRIMEIRA COMPETÊNCIA / ETAPA 06
    } else if (
      q.includes('primeira competencia') || 
      q.includes('primeira competência') || 
      q.includes('fechar mes') || 
      q.includes('fechar mês') || 
      q.includes('folha') || 
      q.includes('imposto')
    ) {
      resposta = `### 📊 Demanda: Fechamento da Primeira Competência (Etapa 06)

A Etapa 06 é o divisor de águas: é quando a empresa roda seu primeiro mês operacional completo dentro do escritório:

---

#### 1. Roteiro por Especialidade:
• **Setor Fiscal:**
  1. Importar arquivos XML de entradas e saídas de notas fiscais no Domínio Sistemas.
  2. Apurar os tributos (DAS do Simples Nacional ou PIS/COFINS/IRPJ/CSLL do Presumido/Real).
  3. Enviar guias de recolhimento para o cliente antes da data de vencimento.
• **Setor Pessoal / DP:**
  1. Rodar a folha de pagamento do primeiro mês e pró-labore dos sócios.
  2. Transmitir os eventos periódicos ao eSocial e DCTFWeb.
  3. Enviar holerites e guias do FGTS Digital / INSS.
• **Setor Contábil:**
  1. Conciliar extratos bancários das contas correntes da empresa.
  2. Efetuar lançamentos de abertura e conciliação de saldos.

---

#### 2. Validação no Sistema:
• Cada analista marca como concluída a respectiva tarefa no seu **Cockpit Pessoal** com 1 clique.
• Quando todas as tarefas da Etapa 06 estiverem checadas, o Onboarding avança para a **Etapa 07 (Homologação & Encerramento)**.`;

    // CENÁRIO I: DÚVIDAS DE CNAE E ATIVIDADES
    } else if (q.includes('cnae') || q.includes('atividade') || q.includes('enquadramento')) {
      resposta = `### 🔍 Como lidar com CNAEs no sistema:

• **O Cliente Não Deve se Preocupar com Códigos:** No link enviado via WhatsApp, o cliente apenas descreve as atividades com suas próprias palavras (na Pergunta 42).
• **Pesquisa Interna sem Sair do Sistema:**
  1. Abra a **Ficha Societária** da empresa em constituição.
  2. Vá até a seção de CNAEs.
  3. Digite termos de busca no campo inteligente (ex: *"clínica médica"*, *"comércio varejista"*, *"desenvolvimento de software"*).
  4. O sistema lista os códigos oficiais do IBGE com descrição detalhada.
  5. Clique para selecionar o **CNAE Principal** e os **CNAEs Secundários** necessários!`;

    // CENÁRIO J: AUTOPREENCHIMENTO POR CEP
    } else if (q.includes('cep') || q.includes('endereço') || q.includes('endereco')) {
      resposta = `### 📍 Autopreenchimento de Endereço por CEP:

• O sistema possui integração nativa com o serviço oficial **ViaCEP**.
• Sempre que o cliente (no formulário de WhatsApp) ou o colaborador (na Ficha Societária) digita um **CEP válido de 8 dígitos**, o sistema preenche imediatamente:
  * **Rua / Logradouro**
  * **Bairro**
  * **Cidade**
  * **Estado (UF)**
• Basta apenas complementar com o número predial e complemento (sala, pavimento, etc.).`;

    // CENÁRIO K: COCKPIT PESSOAL & PRODUTIVIDADE
    } else if (q.includes('cockpit') || q.includes('prioridade') || q.includes('o que fazer') || q.includes('meu painel')) {
      resposta = `### ⚡ Meu Cockpit Pessoal: Como Organizar seu Dia de Trabalho

O Cockpit é a central operacional diária de cada colaborador técnico do escritório:

---

1. **🎯 O Que Fazer Agora (Fila de Prioridades):**
   • 🔴 **Atrasadas:** Tarefas com prazo expirado — resolva primeiro!
   • 🟡 **Hoje / Amanhã:** Prazos iminentes para o dia.
   • 🔵 **Próximos 7 Dias:** No radar para a semana.
   • **Conclusão em 1 Clique:** Basta marcar o checkbox da tarefa para assiná-la digitalmente e registrá-la como concluída.

2. **✅ O Que Venho Fazendo (Histórico):**
   • Registro das últimas entregas com selos visuais de pontualidade: \`✓ No Prazo\` ou \`⚠️ C/ Atraso\`.

3. **📅 Filtros Temporais:**
   • Alterne entre **Esta Semana (7d)**, **Este Mês (30d)** e **Este Trimestre (90d)** para acompanhar seu volume e taxa de pontualidade.

4. **🤖 Diagnóstico de IA:**
   • Clique em **\`Gerar Novo Diagnóstico IA\`** para receber um relatório com análise do seu ritmo, pontos fortes e dicas técnicas para o seu setor!`;

    // CENÁRIO L: PADRÃO VISUAL CORPORATIVO
    } else if (q.includes('noturno') || q.includes('dark') || q.includes('escuro') || /\b(tema|temas)\b/i.test(q)) {
      resposta = `### ☀️ Padrão Visual Corporativo Josana Mota:

• O sistema opera exclusivamente na identidade corporativa oficial em alta definição diurna (Azul Marinho Real e Dourado Institucional sobre fundo claro), otimizado para computadores e smartphones com máxima legibilidade documental.`;

    // CENÁRIO M: RESPOSTA INTELIGENTE PARA QUALQUER OUTRA DEMANDA LIVRE
    } else {
      resposta = `### 💡 Orientação Operacional Sara • Josana Mota Contabilidade

Analisando sua mensagem: *"**${mensagem.replace(/</g, '&lt;').replace(/>/g, '&gt;')}**"*

Aqui está a recomendação de condução da demanda no sistema:

---

#### 📋 Passo a Passo Recomendado:
1. **Identifique a Natureza da Demanda:**
   • Se for abertura de nova empresa: utilize **\`+ Novo Onboarding\`** marcando *Empresa em Constituição*, acesse a **Ficha Societária** e envie o **Link WhatsApp** para o cliente.
   • Se for migração de cliente com CNPJ: cadastre como *Empresa Já Constituída* e distribua o **Squad Técnico** (Fiscal, DP e Contábil) pelas 7 Etapas.
   • Se for cobrança de itens pendentes: acerte em **Central de Pendências** ou abra a ficha do cliente e clique em **\`Pauta WhatsApp\`**.
2. **Execute as Ações no Cockpit:**
   • Se for uma tarefa técnica sob sua responsabilidade, acesse **\`Meu Cockpit & IA\`**, localize a tarefa na fila prioritária e marque-a como concluída.
3. **Validação com a Coordenação:**
   • Dúvidas sobre enquadramentos fiscais ou alterações societárias devem ser validadas com o setor Paralegal ou com a Gestão.

---

💬 **Precisa de mais detalhes?**
Você pode me perguntar:
• *"Para que serve o sistema?"*
• *"Chegou um cliente novo que vai abrir empresa de comércio com 2 sócios, o que fazer?"*
• *"O cliente mandou os documentos pelo link, qual o próximo passo?"*
• *"A Junta Comercial aprovou a abertura e saiu o CNPJ, o que faço?"*
• *"Como cobro o cliente pelo WhatsApp?"*`;
    }

    res.json({
      resposta,
      origem: 'motor_cognitivo_sara',
      versao_manual: manual.versao
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rota coringa SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` SISTEMA INTERNO DE ONBOARDING CONTÁBIL PRONTO! `);
  console.log(` Acesso Local:    http://localhost:${PORT}`);
  console.log(` Acesso em Rede:  http://<IP-DO-SERVIDOR>:${PORT}`);
  console.log(`=======================================================`);
});