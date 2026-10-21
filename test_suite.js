const http = require('http');
const { db } = require('./database');

// Script de Teste Automatizado de Regras de Negócio
const BASE_URL = 'http://localhost:3000';

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('--- INICIANDO TESTES AUTOMATIZADOS DO ONBOARDING CONTÁBIL ---');

  // Teste 1: Criar Cliente Constituído com Escopo Completo
  console.log('\n[TESTE 1] Criar novo cliente constituído...');
  const res1 = await request('POST', '/api/clientes', {
    codigo_dominio: '1050',
    razao_social: 'Comércio de Alimentos Estrela LTDA',
    nome_fantasia: 'Supermercado Estrela',
    cnpj_cpf: '12.345.678/0001-90',
    tipo_empresa: 'CONSTITUIDA',
    regime_tributario: 'SIMPLES',
    contato_nome: 'Carlos Silva',
    coordenador_implantacao: 'Mariana Onboarding',
    escopo: {
      tem_paralegal: true,
      tem_fiscal: true,
      tem_pessoal: true,
      tem_contabil: true,
      tem_terceiro_setor: false
    }
  });

  if (res1.status !== 201 || !res1.body.id) {
    throw new Error(`Falha ao criar cliente: ${JSON.stringify(res1.body)}`);
  }
  const clienteId = res1.body.id;
  console.log(`✓ Cliente criado com sucesso! ID: ${clienteId}`);

  // Teste 2: Verificar Checklists e Validações Geradas
  console.log('\n[TESTE 2] Validar geração automática de checklists e validações...');
  const res2 = await request('GET', `/api/clientes/${clienteId}`);
  const { tarefas, pendencias, validacoes, competencias } = res2.body;

  console.log(`  Tarefas geradas: ${tarefas.length}`);
  console.log(`  Validações de prontidão geradas: ${validacoes.length} (${validacoes.map(v => v.departamento).join(', ')})`);
  console.log(`  Competências de acompanhamento: ${competencias.length}`);

  if (tarefas.length < 50) throw new Error('Poucas tarefas geradas para escopo completo!');
  if (validacoes.length !== 4) throw new Error('Deveria ter 4 departamentos ativos para validação!');
  console.log('✓ Checklists e portões de prontidão verificados com sucesso!');

  // Teste 3: Abrir uma Pendência
  console.log('\n[TESTE 3] Criar pendência do cliente e testar Pauta de Cobrança...');
  const res3 = await request('POST', '/api/pendencias', {
    cliente_id: clienteId,
    departamento_origem: 'FISCAL',
    titulo: 'Procuração Eletrônica da Receita Federal',
    descricao: 'Emitir procuração eletrônica via e-CAC para nosso CNPJ.',
    bloqueante: 1,
    tipo_dependencia: 'CLIENTE',
    prazo_limite: '25/10/2026'
  });
  if (res3.status !== 201) throw new Error('Falha ao criar pendência!');

  // Obter pauta de cobrança (WhatsApp)
  const resPauta = await request('GET', `/api/clientes/${clienteId}/pauta-cobranca`);
  if (!resPauta.body.mensagem.includes('Procuração Eletrônica')) {
    throw new Error('Pauta de cobrança não incluiu a pendência criada!');
  }
  console.log('✓ Pauta de cobrança consolidada para WhatsApp gerada corretamente!');

  // Teste 4: TESTAR TRAVA RIGIDA DA ETAPA 07 COM PENDÊNCIA ABERTA
  console.log('\n[TESTE 4] Testar TRAVA RÍGIDA de encerramento da Etapa 07 (deve falhar por pendência aberta)...');
  const resTrava1 = await request('POST', `/api/clientes/${clienteId}/mudar-etapa`, {
    nova_etapa: 7,
    concluir_onboarding: true
  });

  if (resTrava1.status === 400 && resTrava1.body.bloqueado && resTrava1.body.motivo === 'PENDENCIAS_ABERTAS') {
    console.log(`✓ TRAVA ATIVADA COM SUCESSO: ${resTrava1.body.error}`);
  } else {
    throw new Error(`Trava da etapa 07 falhou em bloquear pendência aberta! Status: ${resTrava1.status}`);
  }

  // Resolver a pendência
  const pendId = res3.body.id;
  await request('PATCH', `/api/pendencias/${pendId}`, {
    status: 'RESOLVIDA',
    resolucao_obs: 'Procuração outorgada no e-CAC em 16/10/2026.'
  });
  console.log('  Pendência marcada como RESOLVIDA.');

  // Teste 5: TESTAR TRAVA RÍGIDA POR FALTA DE VALIDAÇÃO DE PRONTIDÃO DOS DEPARTAMENTOS
  console.log('\n[TESTE 5] Testar TRAVA RÍGIDA de encerramento por falta de validação dos departamentos...');
  const resTrava2 = await request('POST', `/api/clientes/${clienteId}/mudar-etapa`, {
    nova_etapa: 7,
    concluir_onboarding: true
  });

  if (resTrava2.status === 400 && resTrava2.body.bloqueado && resTrava2.body.motivo === 'FALTA_VALIDACAO_DEPARTAMENTAL') {
    console.log(`✓ TRAVA ATIVADA COM SUCESSO: ${resTrava2.body.error}`);
  } else {
    throw new Error(`Trava da etapa 07 falhou em bloquear falta de validação departamental! Status: ${resTrava2.status}`);
  }

  // Aprovar todas as validações de prontidão
  console.log('  Aprovando prontidão de todos os departamentos...');
  for (const v of validacoes) {
    await request('POST', `/api/validacoes/${v.id}/aprovar`, {
      aprovador: `Coordenador ${v.departamento}`,
      observacoes: 'Tudo conferido e parametrizado.'
    });
  }

  // Teste 6: Agora sim, concluir o onboarding na Etapa 07
  console.log('\n[TESTE 6] Tentar concluir onboarding após resolução de tudo...');
  const resConcluir = await request('POST', `/api/clientes/${clienteId}/mudar-etapa`, {
    nova_etapa: 7,
    concluir_onboarding: true
  });

  if (resConcluir.status === 200 && resConcluir.body.onboarding_concluido) {
    console.log('✓ ONBOARDING CONCLUÍDO COM SUCESSO APÓS TODAS AS CONFERÊNCIAS!');
  } else {
    throw new Error(`Falha ao concluir após conformidade: ${JSON.stringify(resConcluir.body)}`);
  }

  // Teste 7: Criar Empresa em Constituição (Etapa 0)
  console.log('\n[TESTE 7] Criar cliente EM CONSTITUIÇÃO...');
  const resConst = await request('POST', '/api/clientes', {
    razao_social: 'Nova Era Tecnologia LTDA',
    tipo_empresa: 'EM_CONSTITUICAO',
    escopo: {
      tem_paralegal: true,
      tem_fiscal: true,
      tem_pessoal: true,
      tem_contabil: true
    }
  });

  const constDetails = await request('GET', `/api/clientes/${resConst.body.id}`);
  const tarefasAbertura = constDetails.body.tarefas.filter(t => t.modulo === 'MODULO_CONSTITUICAO');
  console.log(`  Tarefas de abertura de empresa injetadas: ${tarefasAbertura.length}`);
  if (tarefasAbertura.length !== 10) throw new Error('Deveria ter 10 tarefas do fluxo de abertura empresarial!');
  console.log('✓ Fluxo de abertura empresarial (Empresa em Constituição) validado com sucesso!');

  console.log('\n=======================================================');
  console.log(' TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! ');
  console.log('=======================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ ERRO NOS TESTES:', err);
  process.exit(1);
});