const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "psicopedagogia.db");
const db = new sqlite3.Database(dbPath);

// ─── Helpers promisificados ───────────────────────────────────────────────────

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

// ─── Inicialização ────────────────────────────────────────────────────────────

async function initDatabase() {
  // Habilitar foreign keys
  await run("PRAGMA foreign_keys = ON");

  // Tabela de pacientes (sem escola/serie/ensino)
  await run(`
    CREATE TABLE IF NOT EXISTS pacientes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nome         TEXT    NOT NULL,
      nascimento   TEXT,
      idade        INTEGER,
      responsavel  TEXT,
      telefone     TEXT    NOT NULL,
      email        TEXT,
      queixa       TEXT,
      diagnostico  TEXT,
      medicacao    TEXT,
      indicacao    TEXT,
      observacoes  TEXT,
      dataCadastro TEXT    DEFAULT (date('now'))
    )
  `);

  // Tabela de agendamentos
  await run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pacienteId   INTEGER NOT NULL,
      pacienteNome TEXT    NOT NULL,
      data         TEXT    NOT NULL,
      hora         TEXT    NOT NULL,
      tipo         TEXT    NOT NULL DEFAULT 'Consulta inicial',
      status       TEXT             DEFAULT 'pendente',
      observacoes  TEXT,
      FOREIGN KEY (pacienteId) REFERENCES pacientes (id) ON DELETE CASCADE
    )
  `);

  // Tabela de sessões
  await run(`
    CREATE TABLE IF NOT EXISTS sessoes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      pacienteId    INTEGER NOT NULL,
      pacienteNome  TEXT    NOT NULL,
      agendamentoId INTEGER,
      data          TEXT    NOT NULL,
      hora          TEXT,
      numeroSessao  INTEGER,
      tipo          TEXT    NOT NULL DEFAULT 'Avaliação inicial',
      relato        TEXT,
      atencao       TEXT,
      humor         TEXT,
      participacao  TEXT,
      evolucao      TEXT,
      atividades    TEXT,
      plano         TEXT,
      audios        TEXT,
      FOREIGN KEY (pacienteId)    REFERENCES pacientes    (id) ON DELETE CASCADE,
      FOREIGN KEY (agendamentoId) REFERENCES agendamentos (id) ON DELETE SET NULL
    )
  `);

  console.log("✅ Banco de dados inicializado com sucesso");
}

module.exports = { db, run, get, all, initDatabase };
