const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const db = new DatabaseSync(path.join(__dirname, 'database.sqlite'));

const clientes = db.prepare("SELECT * FROM clientes WHERE tipo_empresa = 'EM_CONSTITUICAO'").all();
console.log('Clientes em constituicao:', clientes.map(c => ({ id: c.id, nome: c.razao_social })));

for (const cli of clientes) {
  let ficha = db.prepare('SELECT * FROM ficha_abertura WHERE cliente_id = ?').get(cli.id);
  if (!ficha) {
    const fichaId = 'ficha_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const token = 'ABR-' + Math.floor(1000 + Math.random() * 9000);
    db.prepare('INSERT INTO ficha_abertura (id, cliente_id, token_coleta, razao_social_op1) VALUES (?, ?, ?, ?)').run(fichaId, cli.id, token, cli.razao_social);
    db.prepare('INSERT INTO socios_abertura (id, ficha_id, ordem, is_administrador, nome_completo) VALUES (?, ?, 1, 1, ?)').run('socio_' + Date.now(), fichaId, cli.contato_nome || 'Sócio Administrador');
    console.log('Criada ficha para:', cli.razao_social, 'Token:', token);
  } else {
    console.log('Ficha ja existe para:', cli.razao_social, 'Token:', ficha.token_coleta);
  }
}
