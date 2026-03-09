const { createClient } = require("@libsql/client");
require("dotenv").config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log(process.env.TURSO_DATABASE_URL);

// ─── Helpers ─────────────────────────────────────────

const run = async (sql, params = []) => {
  const result = await db.execute({
    sql,
    args: params,
  });

  return {
    id: result.lastInsertRowid,
    changes: result.rowsAffected,
  };
};

const get = async (sql, params = []) => {
  const result = await db.execute({
    sql,
    args: params,
  });

  return result.rows[0];
};

const all = async (sql, params = []) => {
  const result = await db.execute({
    sql,
    args: params,
  });

  return result.rows;
};

// ─── Inicialização ───────────────────────────────────

async function initDatabase() {
  await run("PRAGMA foreign_keys = ON");

  await run(`
    CREATE TABLE IF NOT EXISTS pacientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      nascimento TEXT,
      idade INTEGER,
      responsavel TEXT,
      telefone TEXT NOT NULL,
      email TEXT,
      queixa TEXT,
      diagnostico TEXT,
      medicacao TEXT,
      indicacao TEXT,
      observacoes TEXT,
      dataCadastro TEXT DEFAULT (date('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pacienteId INTEGER NOT NULL,
      pacienteNome TEXT NOT NULL,
      data TEXT NOT NULL,
      hora TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'Consulta inicial',
      status TEXT DEFAULT 'pendente',
      observacoes TEXT,
      FOREIGN KEY (pacienteId) REFERENCES pacientes (id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pacienteId INTEGER NOT NULL,
      pacienteNome TEXT NOT NULL,
      agendamentoId INTEGER,
      data TEXT NOT NULL,
      hora TEXT,
      numeroSessao INTEGER,
      tipo TEXT NOT NULL DEFAULT 'Avaliação inicial',
      relato TEXT,
      atencao TEXT,
      humor TEXT,
      participacao TEXT,
      evolucao TEXT,
      atividades TEXT,
      plano TEXT,
      audios TEXT,
      FOREIGN KEY (pacienteId) REFERENCES pacientes (id) ON DELETE CASCADE,
      FOREIGN KEY (agendamentoId) REFERENCES agendamentos (id) ON DELETE SET NULL
    )
  `);

  console.log("✅ Banco inicializado no Turso");
}

module.exports = { run, get, all, initDatabase };
