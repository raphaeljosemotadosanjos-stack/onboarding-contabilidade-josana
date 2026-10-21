const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('=== INICIANDO LIMPEZA TOTAL DO SISTEMA (MODO ZERADO) ===');

db.exec('PRAGMA foreign_keys = OFF;');

const tablesToClear = [
  'documentos_abertura',
  'socios_abertura',
  'ficha_abertura',
  'relatorios_semanais_ia',
  'relatorios_desempenho_ia',
  'historico_atividades',
  'pendencias',
  'validacoes_prontidao',
  'acompanhamento_competencias',
  'tarefas_checklist',
  'escopos',
  'clientes'
];

tablesToClear.forEach(table => {
  try {
    db.exec(`DELETE FROM ${table};`);
    console.log(`[OK] Tabela zerada: ${table}`);
  } catch (err) {
    console.error(`[ERRO] Falha ao zerar ${table}:`, err.message);
  }
});

// Padronizar PINs de todos os colaboradores para '1234' e limpar foto_url de teste
try {
  db.exec("UPDATE colaboradores SET pin = '1234', foto_url = NULL;");
  console.log('[OK] Colaboradores atualizados: PINs padronizados para "1234" e avatares restaurados');
} catch (err) {
  console.error('[ERRO] Ao atualizar colaboradores:', err.message);
}

// Limpar arquivos físicos de uploads de documentos e avatares
const dirsToClean = [
  path.join(__dirname, 'uploads', 'documentos'),
  path.join(__dirname, 'uploads', 'avatars')
];

dirsToClean.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      try {
        fs.unlinkSync(path.join(dir, file));
        console.log(`[OK] Arquivo removido: ${dir}/${file}`);
      } catch (e) {
        console.error(`[ERRO] Não foi possível remover ${file}:`, e.message);
      }
    });
  }
});

db.exec('PRAGMA foreign_keys = ON;');
db.exec('VACUUM;');

console.log('\n=== CONFERÊNCIA FINAL DO BANCO DE DADOS ===');
const allTables = [
  'clientes',
  'escopos',
  'tarefas_checklist',
  'pendencias',
  'validacoes_prontidao',
  'acompanhamento_competencias',
  'ficha_abertura',
  'socios_abertura',
  'documentos_abertura',
  'relatorios_semanais_ia',
  'relatorios_desempenho_ia',
  'historico_atividades',
  'colaboradores',
  'configuracoes'
];

allTables.forEach(t => {
  const row = db.prepare(`SELECT count(*) as count FROM ${t}`).get();
  console.log(`${t}: ${row.count} registro(s)`);
});

console.log('\n=== SISTEMA 100% ZERADO E PRONTO PARA TESTES! ===');
