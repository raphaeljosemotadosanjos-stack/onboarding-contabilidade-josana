const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new DatabaseSync(dbPath);

// Ativar chaves estrangeiras e modo WAL
db.exec('PRAGMA foreign_keys = ON;');
try {
  db.exec('PRAGMA journal_mode = WAL;');
} catch (e) {}

// Esquema Completo com Suporte a Ficha de Abertura Societária e Sócios
db.exec(`
  CREATE TABLE IF NOT EXISTS colaboradores (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    departamento TEXT NOT NULL,
    cargo TEXT,
    email TEXT,
    telefone TEXT,
    pin TEXT DEFAULT '1234',
    cor_avatar TEXT DEFAULT '#0A213D',
    perfil TEXT DEFAULT 'TECNICO',
    foto_url TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id TEXT PRIMARY KEY,
    codigo_dominio TEXT,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj_cpf TEXT,
    tipo_empresa TEXT DEFAULT 'CONSTITUIDA',
    regime_tributario TEXT DEFAULT 'SIMPLES',
    contato_nome TEXT,
    contato_telefone TEXT,
    contato_email TEXT,
    coordenador_implantacao TEXT,
    responsavel_comercial TEXT,
    resp_paralegal_id TEXT,
    resp_fiscal_id TEXT,
    resp_pessoal_id TEXT,
    resp_contabil_id TEXT,
    data_inicio TEXT,
    data_previsao_fim TEXT,
    data_conclusao TEXT,
    etapa_atual INTEGER DEFAULT 1,
    status_geral TEXT DEFAULT 'EM_ANDAMENTO',
    caminho_pastas_servidor TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS escopos (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    tem_paralegal INTEGER DEFAULT 1,
    tem_fiscal INTEGER DEFAULT 1,
    tem_pessoal INTEGER DEFAULT 1,
    tem_funcionarios INTEGER DEFAULT 1,
    tem_prolabore INTEGER DEFAULT 1,
    tem_contabil INTEGER DEFAULT 1,
    tem_terceiro_setor INTEGER DEFAULT 0,
    servicos_adicionais TEXT,
    observacoes_comercial TEXT,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tarefas_checklist (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    modulo TEXT NOT NULL,
    etapa_numero INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    departamento TEXT NOT NULL,
    status TEXT DEFAULT 'NAO_INICIADO',
    justificativa_nao_aplicavel TEXT,
    responsavel TEXT,
    responsavel_colaborador_id TEXT,
    prazo TEXT,
    prazo_data TEXT,
    observacoes TEXT,
    data_conclusao TEXT,
    concluido_por_id TEXT,
    concluido_por_nome TEXT,
    evidencia_registro TEXT,
    ordem INTEGER DEFAULT 0,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pendencias (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    departamento_origem TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    bloqueante INTEGER DEFAULT 0,
    tipo_dependencia TEXT DEFAULT 'CLIENTE',
    status TEXT DEFAULT 'ABERTA',
    proxima_acao TEXT,
    prazo_limite TEXT,
    responsavel_interno TEXT,
    criado_por_nome TEXT,
    data_abertura DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_resolucao DATETIME,
    resolvido_por_nome TEXT,
    resolucao_obs TEXT,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS validacoes_prontidao (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    departamento TEXT NOT NULL,
    aprovado INTEGER DEFAULT 0,
    responsavel_validacao TEXT,
    data_validacao DATETIME,
    observacoes TEXT,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS acompanhamento_competencias (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    competencia_numero INTEGER NOT NULL,
    mes_ano TEXT NOT NULL,
    status_fiscal TEXT DEFAULT 'PENDENTE',
    status_pessoal TEXT DEFAULT 'PENDENTE',
    status_contabil TEXT DEFAULT 'PENDENTE',
    notas_revisao TEXT,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS relatorios_semanais_ia (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    data_geracao DATETIME DEFAULT CURRENT_TIMESTAMP,
    semana_ref TEXT,
    conteudo_analise TEXT NOT NULL,
    atividades_feitas_count INTEGER,
    atividades_pendentes_count INTEGER,
    atividades_atrasadas_count INTEGER,
    pendencias_abertas_count INTEGER,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS historico_atividades (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    colaborador_id TEXT,
    colaborador_nome TEXT,
    acao TEXT NOT NULL,
    descricao TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );

  -- ========================================================
  -- TABELAS DO MÓDULO DE ABERTURA / CONSTITUIÇÃO SOCIETÁRIA
  -- ========================================================
  CREATE TABLE IF NOT EXISTS ficha_abertura (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL UNIQUE,
    token_coleta TEXT UNIQUE NOT NULL,
    razao_social_op1 TEXT,
    razao_social_op2 TEXT,
    razao_social_op3 TEXT,
    nome_fantasia TEXT,
    natureza_juridica TEXT DEFAULT 'LTDA',
    capital_social REAL DEFAULT 10000.0,
    divisao_quotas TEXT,
    atividades_descricao TEXT,
    cnaes_sugeridos TEXT,
    cep_empresa TEXT,
    rua_empresa TEXT,
    numero_empresa TEXT,
    complemento_empresa TEXT,
    bairro_empresa TEXT,
    cidade_empresa TEXT,
    estado_empresa TEXT,
    tipo_imovel TEXT DEFAULT 'PROPRIO',
    inscricao_iptu TEXT,
    proprietario_nome TEXT,
    proprietario_doc TEXT,
    possui_resp_tecnico INTEGER DEFAULT 0,
    resp_tecnico_nome TEXT,
    resp_tecnico_cpf TEXT,
    resp_tecnico_conselho TEXT,
    possui_certificado INTEGER DEFAULT 0,
    senha_gov TEXT,
    status_viabilidade TEXT DEFAULT 'PENDENTE',
    protocolo_viabilidade TEXT,
    protocolo_dbe TEXT,
    protocolo_junta TEXT,
    cnpj_gerado TEXT,
    inscricao_municipal TEXT,
    inscricao_estadual TEXT,
    status_alvara TEXT DEFAULT 'PENDENTE',
    concluido_abertura INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS socios_abertura (
    id TEXT PRIMARY KEY,
    ficha_id TEXT NOT NULL,
    ordem INTEGER DEFAULT 1,
    is_administrador INTEGER DEFAULT 0,
    nome_completo TEXT NOT NULL,
    cpf TEXT,
    rg TEXT,
    orgao_emissor TEXT,
    data_nascimento TEXT,
    nacionalidade TEXT DEFAULT 'Brasileira',
    estado_civil TEXT DEFAULT 'Solteiro(a)',
    regime_casamento TEXT,
    profissao TEXT,
    email TEXT,
    telefone TEXT,
    cep TEXT,
    rua TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    cidade TEXT,
    estado TEXT,
    percentual_quotas REAL DEFAULT 100.0,
    valor_quotas REAL DEFAULT 10000.0,
    FOREIGN KEY(ficha_id) REFERENCES ficha_abertura(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documentos_abertura (
    id TEXT PRIMARY KEY,
    ficha_id TEXT NOT NULL,
    socio_id TEXT,
    tipo_documento TEXT NOT NULL,
    nome_original TEXT NOT NULL,
    nome_salvo TEXT NOT NULL,
    caminho TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(ficha_id) REFERENCES ficha_abertura(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS relatorios_desempenho_ia (
    id TEXT PRIMARY KEY,
    colaborador_id TEXT NOT NULL,
    periodo TEXT NOT NULL, -- 'SEMANAL', 'MENSAL', 'TRIMESTRAL'
    score_produtividade INTEGER DEFAULT 85,
    data_geracao DATETIME DEFAULT CURRENT_TIMESTAMP,
    conteudo_analise TEXT NOT NULL,
    metricas_snapshot TEXT,
    FOREIGN KEY(colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
  );
`);

// Garantir colunas se tabela já existia
const safeAdd = (tbl, col, def) => {
  try { db.exec(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def};`); } catch (e) {}
};
safeAdd('tarefas_checklist', 'concluido_por_id', 'TEXT');
safeAdd('tarefas_checklist', 'concluido_por_nome', 'TEXT');
safeAdd('tarefas_checklist', 'observacoes', 'TEXT');
safeAdd('tarefas_checklist', 'prazo_data', 'TEXT');
safeAdd('tarefas_checklist', 'responsavel_colaborador_id', 'TEXT');
safeAdd('tarefas_checklist', 'concluido_em_iso', 'DATETIME');
safeAdd('colaboradores', 'pin', 'TEXT DEFAULT "1234"');
safeAdd('colaboradores', 'cor_avatar', 'TEXT DEFAULT "#0284c7"');
safeAdd('colaboradores', 'perfil', 'TEXT DEFAULT "TECNICO"');
safeAdd('colaboradores', 'foto_url', 'TEXT');
safeAdd('colaboradores', 'token_redefinicao', 'TEXT');
safeAdd('colaboradores', 'token_expiracao', 'DATETIME');
safeAdd('pendencias', 'criado_por_nome', 'TEXT');
safeAdd('pendencias', 'resolvido_por_nome', 'TEXT');
safeAdd('ficha_abertura', 'faturamento_estimado', 'REAL');
safeAdd('ficha_abertura', 'qtd_funcionarios_inicial', 'INTEGER');
safeAdd('ficha_abertura', 'ponto_referencia_empresa', 'TEXT');
safeAdd('ficha_abertura', 'observacoes_cliente', 'TEXT');
safeAdd('ficha_abertura', 'cnae_principal', 'TEXT');
safeAdd('ficha_abertura', 'cnaes_secundarios', 'TEXT');
safeAdd('ficha_abertura', 'data_envio_cliente', 'DATETIME');
safeAdd('ficha_abertura', 'resp_tecnico_numero', 'TEXT');
safeAdd('ficha_abertura', 'resp_tecnico_estado', 'TEXT');
safeAdd('ficha_abertura', 'declaracao_veracidade', 'INTEGER DEFAULT 1');
safeAdd('ficha_abertura', 'minuta_contrato', 'TEXT');
safeAdd('ficha_abertura', 'minuta_gerada_em', 'DATETIME');
safeAdd('ficha_abertura', 'minuta_enviada', 'INTEGER DEFAULT 0');
safeAdd('ficha_abertura', 'data_minuta_enviada', 'DATETIME');
safeAdd('ficha_abertura', 'minuta_aprovada_cliente', 'INTEGER DEFAULT 0');
safeAdd('ficha_abertura', 'data_minuta_aprovada', 'DATETIME');
safeAdd('clientes', 'formulario_respondido', 'INTEGER DEFAULT 0');
safeAdd('clientes', 'data_formulario_respondido', 'DATETIME');
safeAdd('socios_abertura', 'ponto_referencia', 'TEXT');

// Tabela de templates mestre do checklist (editável por Gestor e Onboarding)
db.exec(`
  CREATE TABLE IF NOT EXISTS checklist_templates (
    id TEXT PRIMARY KEY,
    modulo TEXT NOT NULL,
    etapa_numero INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    departamento TEXT NOT NULL,
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  -- Chat e Mensagens Internas Contextuais por Empresa
  CREATE TABLE IF NOT EXISTS mensagens_internas_cliente (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    colaborador_id TEXT,
    colaborador_nome TEXT NOT NULL,
    colaborador_departamento TEXT,
    colaborador_cor TEXT DEFAULT '#0A213D',
    mensagem TEXT NOT NULL,
    mencao_departamento TEXT,
    fixado INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  -- Mural Geral de Avisos e Comunicados do Escritório
  CREATE TABLE IF NOT EXISTS mural_avisos_equipe (
    id TEXT PRIMARY KEY,
    colaborador_id TEXT,
    colaborador_nome TEXT NOT NULL,
    colaborador_departamento TEXT,
    colaborador_cor TEXT DEFAULT '#0A213D',
    titulo TEXT,
    mensagem TEXT NOT NULL,
    tipo TEXT DEFAULT 'INFO',
    fixado INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Mensagem de boas-vindas inicial no mural se estiver vazio
try {
  const countAvisos = db.prepare('SELECT COUNT(*) as count FROM mural_avisos_equipe').get().count;
  if (countAvisos === 0) {
    db.prepare(`
      INSERT INTO mural_avisos_equipe (id, colaborador_id, colaborador_nome, colaborador_departamento, colaborador_cor, titulo, mensagem, tipo, fixado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'aviso_bemvindo',
      'colab_0',
      'Raphael José',
      'DIRETORIA',
      '#0A213D',
      'Bem-vindos ao Mural de Comunicação Interna da Equipe!',
      'Este espaço foi criado para centralizarmos os avisos do escritório, prazos de guias fiscais, atualizações de sistemas da Receita/Junta e alinhamentos gerais entre todos os departamentos.',
      'AVISO',
      1
    );
  }
} catch (eMural) {}

// Inicializar configs padrão
const configQuery = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?');
if (!configQuery.get('caminho_base_servidor')) {
  const insertConfig = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)');
  insertConfig.run('caminho_base_servidor', 'C:\\ServidorContabil\\Clientes');
  insertConfig.run('nome_escritorio', 'Escritório de Contabilidade');
  insertConfig.run('gemini_api_key', '');
}

// Colaboradores padrão
const countColabs = db.prepare('SELECT COUNT(*) as count FROM colaboradores').get().count;
if (countColabs === 0) {
  const insColab = db.prepare('INSERT INTO colaboradores (id, nome, departamento, cargo, email, telefone, pin, cor_avatar, perfil) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insColab.run('colab_0', 'Raphael José', 'DIRETORIA', 'Gestor Geral & Diretor Executivo', 'raphaeljosemotadosanjos@gmail.com', '(11) 98888-1000', '1234', '#0A213D', 'GESTOR');
  insColab.run('colab_1', 'Mariana Silva', 'IMPLANTACAO', 'Coordenadora de Implantação', 'mariana@josanamota.com.br', '(11) 98888-1001', '1234', '#0284c7', 'ONBOARDING');
  insColab.run('colab_2', 'Lucas Mendes', 'FISCAL', 'Analista Fiscal Sênior', 'lucas@josanamota.com.br', '(11) 98888-1002', '1234', '#059669', 'TECNICO');
  insColab.run('colab_3', 'Carla Souza', 'PESSOAL', 'Analista de DP / Folha', 'carla@josanamota.com.br', '(11) 98888-1003', '1234', '#2563eb', 'TECNICO');
  insColab.run('colab_4', 'Roberto Alves', 'CONTABIL', 'Contador Responsável', 'roberto@josanamota.com.br', '(11) 98888-1004', '1234', '#7c3aed', 'TECNICO');
  insColab.run('colab_5', 'Beatriz Lima', 'PARALEGAL', 'Especialista Societário', 'beatriz@josanamota.com.br', '(11) 98888-1005', '1234', '#d97706', 'TECNICO');
} else {
  try {
    const gestorExiste = db.prepare('SELECT id FROM colaboradores WHERE id = "colab_0" OR perfil = "GESTOR"').get();
    if (!gestorExiste) {
      db.prepare(`
        INSERT INTO colaboradores (id, nome, departamento, cargo, email, telefone, pin, cor_avatar, perfil)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('colab_0', 'Raphael José', 'DIRETORIA', 'Gestor Geral & Diretor Executivo', 'raphaeljosemotadosanjos@gmail.com', '(11) 98888-1000', '1234', '#0A213D', 'GESTOR');
    }
    db.prepare(`UPDATE colaboradores SET perfil = 'ONBOARDING' WHERE id = 'colab_1' OR departamento = 'IMPLANTACAO'`).run();
    db.prepare(`UPDATE colaboradores SET perfil = 'TECNICO' WHERE (perfil IS NULL OR perfil = '') AND id != 'colab_0' AND id != 'colab_1'`).run();

    // Garantir squad em clientes existentes
    db.prepare(`UPDATE clientes SET resp_paralegal_id = 'colab_5' WHERE resp_paralegal_id IS NULL`).run();
    db.prepare(`UPDATE clientes SET resp_fiscal_id = 'colab_2' WHERE resp_fiscal_id IS NULL`).run();
    db.prepare(`UPDATE clientes SET resp_pessoal_id = 'colab_3' WHERE resp_pessoal_id IS NULL`).run();
    db.prepare(`UPDATE clientes SET resp_contabil_id = 'colab_4' WHERE resp_contabil_id IS NULL`).run();

    // Atribuir tarefas sem responsável ao especialista de cada setor
    db.prepare(`UPDATE tarefas_checklist SET responsavel_colaborador_id = 'colab_5', responsavel = 'Beatriz Lima' WHERE departamento = 'PARALEGAL' AND (responsavel_colaborador_id IS NULL OR responsavel_colaborador_id = '')`).run();
    db.prepare(`UPDATE tarefas_checklist SET responsavel_colaborador_id = 'colab_2', responsavel = 'Lucas Mendes' WHERE departamento = 'FISCAL' AND (responsavel_colaborador_id IS NULL OR responsavel_colaborador_id = '')`).run();
    db.prepare(`UPDATE tarefas_checklist SET responsavel_colaborador_id = 'colab_3', responsavel = 'Carla Souza' WHERE departamento = 'PESSOAL' AND (responsavel_colaborador_id IS NULL OR responsavel_colaborador_id = '')`).run();
    db.prepare(`UPDATE tarefas_checklist SET responsavel_colaborador_id = 'colab_4', responsavel = 'Roberto Alves' WHERE departamento = 'CONTABIL' AND (responsavel_colaborador_id IS NULL OR responsavel_colaborador_id = '')`).run();
    db.prepare(`UPDATE tarefas_checklist SET responsavel_colaborador_id = 'colab_1', responsavel = 'Mariana Silva' WHERE departamento = 'IMPLANTACAO' AND (responsavel_colaborador_id IS NULL OR responsavel_colaborador_id = '')`).run();
    db.prepare(`UPDATE tarefas_checklist SET responsavel_colaborador_id = 'colab_0', responsavel = 'Raphael José' WHERE departamento = 'COMERCIAL' AND (responsavel_colaborador_id IS NULL OR responsavel_colaborador_id = '')`).run();
  } catch (e) {}
}

// Templates dos Checklists
const CHECKLIST_TEMPLATES = {
  CONSTITUICAO: [
    { titulo: 'Confirmar a contratação do serviço de constituição', departamento: 'PARALEGAL', etapa: 0 },
    { titulo: 'Coletar documentos dos sócios e informações societárias', departamento: 'PARALEGAL', etapa: 0 },
    { titulo: 'Definir 3 opções de nome empresarial, endereço e capital', departamento: 'PARALEGAL', etapa: 0 },
    { titulo: 'Realizar Consulta Prévia de Viabilidade na Junta/Prefeitura', departamento: 'PARALEGAL', etapa: 0 },
    { titulo: 'Elaborar DBE / Coleta Web e obter assinatura no e-CAC', departamento: 'PARALEGAL', etapa: 0 },
    { titulo: 'Protocolar ato constitutivo na Junta Comercial / Cartório', departamento: 'PARALEGAL', etapa: 0 },
    { titulo: 'Obter CNPJ e inscrições estadual / municipal', departamento: 'PARALEGAL', etapa: 0 },
    { titulo: 'Providenciar alvarás, licenças e autorizações sanitárias', departamento: 'PARALEGAL', etapa: 0 },
    { titulo: 'Transferir processo para o onboarding contábil regular', departamento: 'IMPLANTACAO', etapa: 0 },
    { titulo: 'Iniciar as etapas gerais e parametrizações técnicas', departamento: 'IMPLANTACAO', etapa: 0 }
  ],

  MODULO_A_GERAL: [
    { titulo: 'Conferir proposta comercial aprovada', departamento: 'COMERCIAL', etapa: 1 },
    { titulo: 'Conferir contrato e assinaturas', departamento: 'IMPLANTACAO', etapa: 1 },
    { titulo: 'Validar escopo dos serviços contratados', departamento: 'IMPLANTACAO', etapa: 1 },
    { titulo: 'Conferir honorários e condições comerciais', departamento: 'COMERCIAL', etapa: 1 },
    { titulo: 'Registrar data de início e períodos abrangidos', departamento: 'IMPLANTACAO', etapa: 1 },
    { titulo: 'Confirmar se há serviços de constituição empresarial contratados', departamento: 'COMERCIAL', etapa: 1 },
    { titulo: 'Receber checklist e informações de transição do Comercial', departamento: 'IMPLANTACAO', etapa: 1 },
    { titulo: 'Abrir registro de onboarding do cliente', departamento: 'IMPLANTACAO', etapa: 1 },

    { titulo: 'Enviar formulário de diagnóstico ao cliente', departamento: 'IMPLANTACAO', etapa: 2 },
    { titulo: 'Realizar reunião inicial com o cliente', departamento: 'IMPLANTACAO', etapa: 2 },
    { titulo: 'Identificar perfil e situação atual da empresa', departamento: 'IMPLANTACAO', etapa: 2 },
    { titulo: 'Solicitar avaliação técnica dos departamentos aplicáveis', departamento: 'IMPLANTACAO', etapa: 2 },
    { titulo: 'Levantar obrigações, prazos críticos e riscos conhecidos', departamento: 'IMPLANTACAO', etapa: 2 },
    { titulo: 'Identificar pendências cadastrais, fiscais, trabalhistas e contábeis', departamento: 'IMPLANTACAO', etapa: 2 },
    { titulo: 'Identificar serviços ou demandas fora do escopo', departamento: 'IMPLANTACAO', etapa: 2 },
    { titulo: 'Consolidar diagnóstico inicial', departamento: 'IMPLANTACAO', etapa: 2 },
    { titulo: 'Definir prioridades, responsáveis e próximos passos', departamento: 'IMPLANTACAO', etapa: 2 },

    { titulo: 'Criar pasta central do cliente no servidor', departamento: 'IMPLANTACAO', etapa: 3 },
    { titulo: 'Criar subpastas por departamento', departamento: 'IMPLANTACAO', etapa: 3 },
    { titulo: 'Consolidar as solicitações de documentos e acessos', departamento: 'IMPLANTACAO', etapa: 3 },
    { titulo: 'Enviar solicitações organizadas ao cliente', departamento: 'IMPLANTACAO', etapa: 3 },
    { titulo: 'Registrar documentos solicitados e recebidos', departamento: 'IMPLANTACAO', etapa: 3 },
    { titulo: 'Conferir adequação técnica dos documentos recebidos', departamento: 'IMPLANTACAO', etapa: 3 },
    { titulo: 'Registrar documentos faltantes ou inadequados como pendências', departamento: 'IMPLANTACAO', etapa: 3 },
    { titulo: 'Providenciar acessos e autorizações necessários', departamento: 'IMPLANTACAO', etapa: 3 },
    { titulo: 'Controlar procurações e permissões', departamento: 'IMPLANTACAO', etapa: 3 },
    { titulo: 'Registrar pendências com responsáveis e prazos', departamento: 'IMPLANTACAO', etapa: 3 },

    { titulo: 'Distribuir tarefas aos departamentos', departamento: 'IMPLANTACAO', etapa: 4 },
    { titulo: 'Confirmar responsáveis por cada tarefa técnica', departamento: 'IMPLANTACAO', etapa: 4 },
    { titulo: 'Registrar prazos e dependências', departamento: 'IMPLANTACAO', etapa: 4 },
    { titulo: 'Executar configurações e procedimentos técnicos', departamento: 'IMPLANTACAO', etapa: 4 },
    { titulo: 'Atualizar controles internos departamentais', departamento: 'IMPLANTACAO', etapa: 4 },
    { titulo: 'Receber atualizações dos departamentos', departamento: 'IMPLANTACAO', etapa: 4 },
    { titulo: 'Monitorar prazos críticos e alertas', departamento: 'IMPLANTACAO', etapa: 4 },
    { titulo: 'Realizar revisão semanal dos onboardings ativos', departamento: 'IMPLANTACAO', etapa: 4 },
    { titulo: 'Consolidar impedimentos e ações corretivas', departamento: 'IMPLANTACAO', etapa: 4 },

    { titulo: 'Reunir orientações de todos os departamentos', departamento: 'IMPLANTACAO', etapa: 5 },
    { titulo: 'Preparar pauta da reunião única de alinhamento', departamento: 'IMPLANTACAO', etapa: 5 },
    { titulo: 'Realizar reunião única de alinhamento com o cliente', departamento: 'IMPLANTACAO', etapa: 5 },
    { titulo: 'Apresentar canais e contatos oficiais do escritório', departamento: 'IMPLANTACAO', etapa: 5 },
    { titulo: 'Explicar fluxos de envio de informações e documentos', departamento: 'IMPLANTACAO', etapa: 5 },
    { titulo: 'Definir prazos e responsabilidades mútuas', departamento: 'IMPLANTACAO', etapa: 5 },
    { titulo: 'Apresentar procedimento para urgências e serviços adicionais', departamento: 'IMPLANTACAO', etapa: 5 },
    { titulo: 'Disponibilizar manual de boas-vindas ao cliente', departamento: 'IMPLANTACAO', etapa: 5 },
    { titulo: 'Elaborar e arquivar resumo da reunião', departamento: 'IMPLANTACAO', etapa: 5 },
    { titulo: 'Registrar dúvidas e pendências decorrentes do alinhamento', departamento: 'IMPLANTACAO', etapa: 5 },

    { titulo: 'Definir entregas relevantes das três primeiras competências', departamento: 'IMPLANTACAO', etapa: 6 },
    { titulo: 'Verificar condições para execução das rotinas', departamento: 'IMPLANTACAO', etapa: 6 },
    { titulo: 'Acompanhar as primeiras entregas por departamento', departamento: 'IMPLANTACAO', etapa: 6 },
    { titulo: 'Realizar revisão semanal consolidada', departamento: 'IMPLANTACAO', etapa: 6 },
    { titulo: 'Registrar atrasos, erros e retrabalhos', departamento: 'IMPLANTACAO', etapa: 6 },
    { titulo: 'Definir ações corretivas e responsáveis', departamento: 'IMPLANTACAO', etapa: 6 },
    { titulo: 'Verificar cumprimento dos fluxos pelo cliente', departamento: 'IMPLANTACAO', etapa: 6 },
    { titulo: 'Obter confirmação de prontidão de cada departamento', departamento: 'IMPLANTACAO', etapa: 6 },

    { titulo: 'Revisar registros de todas as etapas', departamento: 'IMPLANTACAO', etapa: 7 },
    { titulo: 'Receber validação formal de cada departamento técnico', departamento: 'IMPLANTACAO', etapa: 7 },
    { titulo: 'Conferir todas as pendências abertas', departamento: 'IMPLANTACAO', etapa: 7 },
    { titulo: 'Resolver todas as pendências antes do encerramento (TRAVA OBRIGATÓRIA)', departamento: 'IMPLANTACAO', etapa: 7 },
    { titulo: 'Confirmar ausência de impedimentos e itens pendentes', departamento: 'IMPLANTACAO', etapa: 7 },
    { titulo: 'Consolidar o registro de encerramento', departamento: 'IMPLANTACAO', etapa: 7 },
    { titulo: 'Formalizar a transição para o atendimento recorrente', departamento: 'IMPLANTACAO', etapa: 7 },
    { titulo: 'Comunicar formalmente a conclusão ao cliente', departamento: 'IMPLANTACAO', etapa: 7 },
    { titulo: 'Realizar reunião de encerramento se necessária', departamento: 'IMPLANTACAO', etapa: 7 },
    { titulo: 'Registrar data e responsável pela autorização final', departamento: 'IMPLANTACAO', etapa: 7 }
  ],

  MODULO_B_PARALEGAL: [
    { titulo: 'Conferir razão social, CNPJ e dados cadastrais', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Conferir natureza jurídica, quadro societário e administradores', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Verificar endereço, atividades econômicas e CNAEs', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Conferir inscrições e registros aplicáveis', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Verificar alvarás, licenças e autorizações exigíveis', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Identificar divergências entre cadastros e documentos', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Levantar alterações societárias pendentes', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Conferir procurações e autorizações necessárias', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Verificar a situação cadastral nos órgãos pertinentes', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Registrar protocolos, solicitações e prazos em andamento', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Identificar pendências de regularização', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Confirmar se eventuais alterações estão incluídas no escopo contratado', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Registrar serviços adicionais que dependam de aprovação', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Confirmar que os dados necessários às demais áreas estão corretos', departamento: 'PARALEGAL', etapa: 4 },
    { titulo: 'Emitir validação de prontidão do departamento Paralegal', departamento: 'PARALEGAL', etapa: 7 }
  ],

  MODULO_C_FISCAL: [
    { titulo: 'Confirmar regime tributário e período de vigência', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Conferir atividades, CNAEs e inscrições fiscais', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Verificar enquadramentos e parâmetros tributários aplicáveis', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Obter informações sobre operações, receitas e emissão de documentos fiscais', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Verificar acessos aos sistemas fiscais e procurações necessárias', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Levantar histórico fiscal e declarações anteriores disponíveis', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Conferir obrigações acessórias aplicáveis', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Identificar tributos, declarações e prazos próximos', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Conferir documentos e informações necessários à apuração', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Identificar inconsistências cadastrais ou tributárias', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Registrar pendências fiscais anteriores e atuais', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Verificar eventuais notificações, débitos ou parcelamentos informados', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Confirmar o fluxo mensal de envio de documentos e informações', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Validar condições para iniciar as apurações recorrentes', departamento: 'FISCAL', etapa: 4 },
    { titulo: 'Confirmar execução e revisar as primeiras entregas fiscais', departamento: 'FISCAL', etapa: 6 },
    { titulo: 'Emitir validação de prontidão do departamento Fiscal', departamento: 'FISCAL', etapa: 7 }
  ],

  MODULO_D_PESSOAL: [
    { titulo: 'Confirmar se a empresa possui empregados registrados', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Confirmar se existe retirada de pró-labore', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Verificar se há folha de pagamento ativa', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Identificar empregados, sócios remunerados e demais vínculos pertinentes', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Coletar os dados e documentos necessários de empregados e sócios', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Verificar acessos e procurações aos sistemas aplicáveis', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Levantar admissões, férias, afastamentos e desligamentos em andamento', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Conferir histórico de folha e informações anteriores disponíveis', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Identificar obrigações trabalhistas, previdenciárias e declarações aplicáveis', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Conferir eventos e prazos que possam ocorrer durante a implantação', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Definir o procedimento para comunicação de admissões e desligamentos', departamento: 'PESSOAL', etapa: 5 },
    { titulo: 'Definir o procedimento para envio de férias, afastamentos e alterações salariais', departamento: 'PESSOAL', etapa: 5 },
    { titulo: 'Registrar pendências documentais ou cadastrais de Pessoal', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Validar as condições para processamento da folha e demais rotinas', departamento: 'PESSOAL', etapa: 4 },
    { titulo: 'Acompanhar as primeiras entregas de folha e obrigações aplicáveis', departamento: 'PESSOAL', etapa: 6 },
    { titulo: 'Emitir validação de prontidão do departamento Pessoal', departamento: 'PESSOAL', etapa: 7 }
  ],

  MODULO_E_CONTABIL: [
    { titulo: 'Solicitar balancetes, balanços e demonstrações anteriores disponíveis', departamento: 'CONTABIL', etapa: 3 },
    { titulo: 'Obter saldos contábeis e informações necessárias à abertura ou continuidade dos registros', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Solicitar plano de contas e dados contábeis anteriores, quando aplicáveis', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Conferir saldos iniciais e consistência das informações recebidas', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Identificar períodos sem escrituração ou com documentação incompleta', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Definir o fluxo de recebimento de documentos contábeis', departamento: 'CONTABIL', etapa: 5 },
    { titulo: 'Definir como serão recebidas informações de receitas, despesas, bancos e financiamentos', departamento: 'CONTABIL', etapa: 5 },
    { titulo: 'Verificar extratos bancários e documentos financeiros necessários', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Identificar informações sobre imobilizado, empréstimos e outras contas relevantes', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Conferir informações sobre capital, lucros e distribuição de resultados', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Identificar pendências contábeis históricas', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Confirmar os acessos e sistemas necessários', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Verificar a compatibilidade entre informações fiscais, folha e contabilidade', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Validar condições para início da escrituração e demais rotinas contratadas', departamento: 'CONTABIL', etapa: 4 },
    { titulo: 'Acompanhar as primeiras entregas contábeis previstas', departamento: 'CONTABIL', etapa: 6 },
    { titulo: 'Emitir validação de prontidão do departamento Contábil', departamento: 'CONTABIL', etapa: 7 }
  ],

  MODULO_F_ESPECIAL: [
    { titulo: 'Confirmar quais serviços especializados foram contratados', departamento: 'ESPECIAL', etapa: 1 },
    { titulo: 'Registrar o escopo, as entregas e os limites do serviço', departamento: 'ESPECIAL', etapa: 1 },
    { titulo: 'Identificar o responsável técnico ou operacional', departamento: 'ESPECIAL', etapa: 2 },
    { titulo: 'Levantar documentos, acessos e informações específicas do projeto', departamento: 'ESPECIAL', etapa: 3 },
    { titulo: 'Definir cronograma e marcos de entrega', departamento: 'ESPECIAL', etapa: 4 },
    { titulo: 'Identificar obrigações e prestação de contas aplicáveis', departamento: 'ESPECIAL', etapa: 4 },
    { titulo: 'Quando houver recursos vinculados, identificar regras de utilização e comprovação', departamento: 'ESPECIAL', etapa: 4 },
    { titulo: 'Registrar responsáveis por fornecer informações e aprovar entregas', departamento: 'ESPECIAL', etapa: 5 },
    { titulo: 'Identificar dependências externas e prazos específicos', departamento: 'ESPECIAL', etapa: 4 },
    { titulo: 'Conferir se as atividades estão previstas no contrato', departamento: 'ESPECIAL', etapa: 1 },
    { titulo: 'Registrar serviços extras que exijam orçamento e aprovação', departamento: 'ESPECIAL', etapa: 4 },
    { titulo: 'Validar condições para início da execução', departamento: 'ESPECIAL', etapa: 4 },
    { titulo: 'Acompanhar as primeiras entregas previstas', departamento: 'ESPECIAL', etapa: 6 },
    { titulo: 'Resolver pendências antes do encerramento do onboarding', departamento: 'ESPECIAL', etapa: 7 },
    { titulo: 'Emitir validação de prontidão do serviço especializado', departamento: 'ESPECIAL', etapa: 7 }
  ]
};

// Inicializar checklist_templates a partir de CHECKLIST_TEMPLATES se a tabela estiver vazia
try {
  const countTemplates = db.prepare('SELECT COUNT(*) as count FROM checklist_templates').get().count;
  if (countTemplates === 0) {
    const insTpl = db.prepare(`
      INSERT INTO checklist_templates (id, modulo, etapa_numero, titulo, departamento, ordem, ativo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    let tplNum = 1;
    for (const [modKey, lista] of Object.entries(CHECKLIST_TEMPLATES)) {
      lista.forEach((item, idx) => {
        insTpl.run(
          `tpl_${modKey.toLowerCase()}_${tplNum++}`,
          modKey,
          item.etapa,
          item.titulo,
          item.departamento,
          idx + 1
        );
      });
    }
  }
} catch (e) {
  console.error('Erro ao inicializar checklist_templates:', e.message);
}

function popularTarefasOnboarding(clienteId, escopo, tipoEmpresa, squad = {}) {
  const insertTarefa = db.prepare(`
    INSERT INTO tarefas_checklist (id, cliente_id, modulo, etapa_numero, titulo, departamento, status, responsavel, responsavel_colaborador_id, ordem)
    VALUES (?, ?, ?, ?, ?, ?, 'NAO_INICIADO', ?, ?, ?)
  `);

  // Carregar templates dinâmicos do banco (permite alterar futuros sem afetar processos em aberto)
  const templatesDb = db.prepare('SELECT * FROM checklist_templates WHERE ativo = 1 ORDER BY etapa_numero ASC, ordem ASC, id ASC').all();
  const moduloMap = {};
  templatesDb.forEach(t => {
    if (!moduloMap[t.modulo]) moduloMap[t.modulo] = [];
    moduloMap[t.modulo].push({
      etapa: t.etapa_numero,
      titulo: t.titulo,
      departamento: t.departamento
    });
  });

  function getListaModulo(modNome, fallback) {
    if (moduloMap[modNome] && moduloMap[modNome].length > 0) {
      return moduloMap[modNome];
    }
    return fallback || [];
  }

  const colaboradores = db.prepare('SELECT id, nome, departamento FROM colaboradores WHERE ativo = 1').all();
  const getColabPorIdOuDep = (colabId, dep) => {
    if (colabId) {
      const c = colaboradores.find(x => x.id === colabId);
      if (c) return c;
    }
    if (colabId === null) return null;
    return colaboradores.find(x => x.departamento === dep) || null;
  };

  const respParalegal = getColabPorIdOuDep(squad.resp_paralegal_id, 'PARALEGAL');
  const respFiscal = getColabPorIdOuDep(squad.resp_fiscal_id, 'FISCAL');
  const respPessoal = getColabPorIdOuDep(squad.resp_pessoal_id, 'PESSOAL');
  const respContabil = getColabPorIdOuDep(squad.resp_contabil_id, 'CONTABIL');
  const respImplantacao = colaboradores.find(x => x.departamento === 'IMPLANTACAO') || null;

  function atribuir(departamento) {
    if (departamento === 'PARALEGAL') return respParalegal;
    if (departamento === 'FISCAL') return respFiscal;
    if (departamento === 'PESSOAL') return respPessoal;
    if (departamento === 'CONTABIL') return respContabil;
    if (departamento === 'IMPLANTACAO' || departamento === 'COMERCIAL') return respImplantacao;
    return null;
  }

  let ordem = 1;

  function inserirLista(modulo, lista) {
    lista.forEach(item => {
      const colab = atribuir(item.departamento);
      insertTarefa.run(
        `tsk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        clienteId,
        modulo,
        item.etapa,
        item.titulo,
        item.departamento,
        colab ? colab.nome : null,
        colab ? colab.id : null,
        ordem++
      );
    });
  }

  // Se for empresa em constituição, inicializar Ficha de Abertura e tarefas do Módulo Constituição
  if (tipoEmpresa === 'EM_CONSTITUICAO') {
    inserirLista('MODULO_CONSTITUICAO', getListaModulo('CONSTITUICAO', CHECKLIST_TEMPLATES.CONSTITUICAO));
    
    // Gerar ficha de abertura inicial se não existir
    const existeFicha = db.prepare('SELECT id FROM ficha_abertura WHERE cliente_id = ?').get(clienteId);
    if (!existeFicha) {
      const fichaId = `ficha_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const token = 'ABR-' + Math.floor(1000 + Math.random() * 9000);
      const cliente = db.prepare('SELECT razao_social, contato_nome, contato_telefone, contato_email FROM clientes WHERE id = ?').get(clienteId);

      db.prepare(`
        INSERT INTO ficha_abertura (id, cliente_id, token_coleta, razao_social_op1, atividades_descricao)
        VALUES (?, ?, ?, ?, ?)
      `).run(fichaId, clienteId, token, cliente ? cliente.razao_social : '', 'Comércio e serviços');

      // Inserir primeiro sócio padrão
      db.prepare(`
        INSERT INTO socios_abertura (id, ficha_id, ordem, is_administrador, nome_completo, telefone, email)
        VALUES (?, ?, 1, 1, ?, ?, ?)
      `).run(`soc_${Date.now()}`, fichaId, cliente ? cliente.contato_nome || 'Sócio Administrador' : 'Sócio Administrador', cliente ? cliente.contato_telefone : '', cliente ? cliente.contato_email : '');
    }
  }

  inserirLista('MODULO_A_GERAL', getListaModulo('MODULO_A_GERAL', CHECKLIST_TEMPLATES.MODULO_A_GERAL));

  if (escopo.tem_paralegal) inserirLista('MODULO_B_PARALEGAL', getListaModulo('MODULO_B_PARALEGAL', CHECKLIST_TEMPLATES.MODULO_B_PARALEGAL));
  if (escopo.tem_fiscal) inserirLista('MODULO_C_FISCAL', getListaModulo('MODULO_C_FISCAL', CHECKLIST_TEMPLATES.MODULO_C_FISCAL));
  if (escopo.tem_pessoal) inserirLista('MODULO_D_PESSOAL', getListaModulo('MODULO_D_PESSOAL', CHECKLIST_TEMPLATES.MODULO_D_PESSOAL));
  if (escopo.tem_contabil) inserirLista('MODULO_E_CONTABIL', getListaModulo('MODULO_E_CONTABIL', CHECKLIST_TEMPLATES.MODULO_E_CONTABIL));
  if (escopo.tem_terceiro_setor) inserirLista('MODULO_F_ESPECIAL', getListaModulo('MODULO_F_ESPECIAL', CHECKLIST_TEMPLATES.MODULO_F_ESPECIAL));

  const insertComp = db.prepare(`
    INSERT INTO acompanhamento_competencias (id, cliente_id, competencia_numero, mes_ano, status_fiscal, status_pessoal, status_contabil)
    VALUES (?, ?, ?, ?, 'PENDENTE', 'PENDENTE', 'PENDENTE')
  `);
  const hoje = new Date();
  for (let c = 1; c <= 3; c++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + c, 1);
    const mesAno = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    insertComp.run(`comp_${clienteId}_${c}`, clienteId, c, mesAno);
  }

  const insertValidacao = db.prepare(`
    INSERT INTO validacoes_prontidao (id, cliente_id, departamento, aprovado)
    VALUES (?, ?, ?, 0)
  `);

  if (escopo.tem_paralegal) insertValidacao.run(`val_${clienteId}_PARALEGAL`, clienteId, 'PARALEGAL');
  if (escopo.tem_fiscal) insertValidacao.run(`val_${clienteId}_FISCAL`, clienteId, 'FISCAL');
  if (escopo.tem_pessoal) insertValidacao.run(`val_${clienteId}_PESSOAL`, clienteId, 'PESSOAL');
  if (escopo.tem_contabil) insertValidacao.run(`val_${clienteId}_CONTABIL`, clienteId, 'CONTABIL');
  if (escopo.tem_terceiro_setor) insertValidacao.run(`val_${clienteId}_ESPECIAL`, clienteId, 'ESPECIAL');
}

module.exports = {
  db,
  dbPath,
  popularTarefasOnboarding,
  CHECKLIST_TEMPLATES
};
