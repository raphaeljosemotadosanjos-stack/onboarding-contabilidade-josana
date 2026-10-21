const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('--- Re-executando seed de métricas equilibradas para todos os departamentos ---');

const colabs = db.prepare('SELECT id, nome, departamento FROM colaboradores').all();
const colabMap = {};
colabs.forEach(c => { colabMap[c.departamento] = c; });
const colabMariana = colabs.find(c => c.id === 'colab_1');

const tarefas = db.prepare('SELECT * FROM tarefas_checklist').all();
console.log('Total de tarefas encontradas:', tarefas.length);

const hoje = new Date();
const formatDataBR = (d) => d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const formatIso = (d) => d.toISOString();
const formatYMD = (d) => d.toISOString().split('T')[0];

const updateStmt = db.prepare(`
  UPDATE tarefas_checklist 
  SET status = ?, 
      responsavel_colaborador_id = ?, 
      responsavel = ?, 
      prazo_data = ?, 
      prazo = ?, 
      data_conclusao = ?, 
      concluido_em_iso = ?, 
      concluido_por_id = ?, 
      concluido_por_nome = ? 
  WHERE id = ?
`);

let concluidasCount = 0;
let pendentesCount = 0;

db.exec('BEGIN TRANSACTION;');
try {
  tarefas.forEach((t, i) => {
    let colab = colabMap[t.departamento];
    if (!colab) colab = colabMariana;
    if (t.departamento === 'COMERCIAL') colab = colabMariana;

    // Queremos que aproximadamente 30% a 40% das tarefas de cada departamento estejam concluídas
    // Distribuídas entre: esta semana (últimos 7 dias), este mês (8 a 30 dias atrás), trimestre (31 a 85 dias atrás)
    const mod = i % 10;
    const ehConcluida = (
      // Implantação e Comercial (Etapas 1 e 2 bastante adiantadas)
      ((t.departamento === 'IMPLANTACAO' || t.departamento === 'COMERCIAL') && (t.etapa_numero <= 2 || (t.etapa_numero === 3 && mod < 5))) ||
      // Fiscal (tarefas da etapa 4)
      (t.departamento === 'FISCAL' && (mod < 4)) ||
      // Pessoal (tarefas da etapa 4 e 5)
      (t.departamento === 'PESSOAL' && (mod < 4)) ||
      // Contábil (tarefas da etapa 3 e 4)
      (t.departamento === 'CONTABIL' && (t.etapa_numero === 3 || mod < 4)) ||
      // Paralegal (etapa 0 e etapa 4)
      (t.departamento === 'PARALEGAL' && (t.etapa_numero === 0 || mod < 4))
    );

    if (ehConcluida) {
      // Distribuir entre: esta semana (1 a 6 dias atrás), este mês (8 a 28 dias atrás), trimestre (31 a 80 dias atrás)
      let diasAtras = 3;
      if (mod === 0 || mod === 1) {
        diasAtras = (i % 6) + 1; // Últimos 7 dias (Semana)
      } else if (mod === 2 || mod === 3) {
        diasAtras = (i % 22) + 8; // Últimos 30 dias (Mês)
      } else {
        diasAtras = (i % 50) + 31; // Últimos 90 dias (Trimestre)
      }

      const dataConc = new Date(hoje.getTime() - diasAtras * 24 * 60 * 60 * 1000);
      // Prazo: 90% no prazo, 10% atrasado
      const atrasou = (mod === 3 && (i % 3 === 0));
      const prazoD = atrasou 
        ? new Date(dataConc.getTime() - 2 * 24 * 60 * 60 * 1000) 
        : new Date(dataConc.getTime() + 1 * 24 * 60 * 60 * 1000);

      updateStmt.run(
        'CONCLUIDO',
        colab.id,
        colab.nome,
        formatYMD(prazoD),
        prazoD.toLocaleDateString('pt-BR'),
        formatDataBR(dataConc),
        formatIso(dataConc),
        colab.id,
        colab.nome,
        t.id
      );
      concluidasCount++;
    } else {
      // Tarefa pendente
      let prazoData = null;
      let prazoStr = null;
      if (mod === 7) {
        // Atrasada (prazo venceu há 2 a 6 dias)
        const dPrazo = new Date(hoje.getTime() - ((i % 5) + 2) * 24 * 60 * 60 * 1000);
        prazoData = formatYMD(dPrazo);
        prazoStr = dPrazo.toLocaleDateString('pt-BR');
      } else if (mod === 8) {
        // Vence hoje ou amanhã
        const dPrazo = new Date(hoje.getTime() + ((i % 2)) * 24 * 60 * 60 * 1000);
        prazoData = formatYMD(dPrazo);
        prazoStr = dPrazo.toLocaleDateString('pt-BR');
      } else if (mod === 9) {
        // Vence nos próximos 4-7 dias
        const dPrazo = new Date(hoje.getTime() + ((i % 4) + 3) * 24 * 60 * 60 * 1000);
        prazoData = formatYMD(dPrazo);
        prazoStr = dPrazo.toLocaleDateString('pt-BR');
      }

      updateStmt.run(
        'NAO_INICIADO',
        colab.id,
        colab.nome,
        prazoData,
        prazoStr,
        null,
        null,
        null,
        null,
        t.id
      );
      pendentesCount++;
    }
  });
  db.exec('COMMIT;');
  console.log('Seed equilibrado com sucesso!');
  console.log('-> Concluídas:', concluidasCount);
  console.log('-> Pendentes / Em aberto:', pendentesCount);
} catch(e) {
  db.exec('ROLLBACK;');
  console.error('Erro no seed:', e);
}
