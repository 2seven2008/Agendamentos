require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { run, get, all, initDatabase } = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseJSON = (value, fallback = null) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const formatSessao = (s) => ({
  ...s,
  atividades: parseJSON(s.atividades, []),
  audios: parseJSON(s.audios, []),
});

// ─── PACIENTES ────────────────────────────────────────────────────────────────

app.get("/api/pacientes", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM pacientes ORDER BY nome ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pacientes/:id", async (req, res) => {
  try {
    const row = await get("SELECT * FROM pacientes WHERE id = ?", [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ error: "Paciente não encontrado" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pacientes", async (req, res) => {
  const {
    nome,
    nascimento,
    idade,
    responsavel,
    telefone,
    email,
    queixa,
    diagnostico,
    medicacao,
    indicacao,
    observacoes,
  } = req.body;
  if (!nome || !telefone)
    return res.status(400).json({ error: "Nome e telefone são obrigatórios" });
  try {
    const result = await run(
      `INSERT INTO pacientes
         (nome, nascimento, idade, responsavel, telefone, email,
          queixa, diagnostico, medicacao, indicacao, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome,
        nascimento,
        idade || null,
        responsavel,
        telefone,
        email,
        queixa,
        diagnostico,
        medicacao,
        indicacao,
        observacoes,
      ],
    );
    const created = await get("SELECT * FROM pacientes WHERE id = ?", [
      result.id,
    ]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/pacientes/:id", async (req, res) => {
  const {
    nome,
    nascimento,
    idade,
    responsavel,
    telefone,
    email,
    queixa,
    diagnostico,
    medicacao,
    indicacao,
    observacoes,
  } = req.body;
  if (!nome || !telefone)
    return res.status(400).json({ error: "Nome e telefone são obrigatórios" });
  try {
    const result = await run(
      `UPDATE pacientes SET
         nome=?, nascimento=?, idade=?, responsavel=?, telefone=?, email=?,
         queixa=?, diagnostico=?, medicacao=?, indicacao=?, observacoes=?
       WHERE id=?`,
      [
        nome,
        nascimento,
        idade || null,
        responsavel,
        telefone,
        email,
        queixa,
        diagnostico,
        medicacao,
        indicacao,
        observacoes,
        req.params.id,
      ],
    );
    if (!result.changes)
      return res.status(404).json({ error: "Paciente não encontrado" });
    const updated = await get("SELECT * FROM pacientes WHERE id = ?", [
      req.params.id,
    ]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/pacientes/:id", async (req, res) => {
  try {
    const result = await run("DELETE FROM pacientes WHERE id = ?", [
      req.params.id,
    ]);
    if (!result.changes)
      return res.status(404).json({ error: "Paciente não encontrado" });
    res.json({ message: "Paciente excluído com sucesso" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AGENDAMENTOS ─────────────────────────────────────────────────────────────

app.get("/api/agendamentos", async (req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM agendamentos ORDER BY data ASC, hora ASC",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/agendamentos/data/:data", async (req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM agendamentos WHERE data = ? ORDER BY hora ASC",
      [req.params.data],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/agendamentos/paciente/:pacienteId", async (req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM agendamentos WHERE pacienteId = ? ORDER BY data DESC, hora DESC",
      [req.params.pacienteId],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/agendamentos/:id", async (req, res) => {
  try {
    const row = await get("SELECT * FROM agendamentos WHERE id = ?", [
      req.params.id,
    ]);
    if (!row)
      return res.status(404).json({ error: "Agendamento não encontrado" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/agendamentos", async (req, res) => {
  const { pacienteId, pacienteNome, data, hora, tipo, status, observacoes } =
    req.body;
  if (!pacienteId || !data || !hora)
    return res
      .status(400)
      .json({ error: "pacienteId, data e hora são obrigatórios" });
  try {
    const result = await run(
      `INSERT INTO agendamentos (pacienteId, pacienteNome, data, hora, tipo, status, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        pacienteId,
        pacienteNome,
        data,
        hora,
        tipo || "Consulta inicial",
        status || "pendente",
        observacoes,
      ],
    );
    const created = await get("SELECT * FROM agendamentos WHERE id = ?", [
      result.id,
    ]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/agendamentos/:id", async (req, res) => {
  const { pacienteId, pacienteNome, data, hora, tipo, status, observacoes } =
    req.body;
  try {
    const result = await run(
      `UPDATE agendamentos SET
         pacienteId=?, pacienteNome=?, data=?, hora=?, tipo=?, status=?, observacoes=?
       WHERE id=?`,
      [
        pacienteId,
        pacienteNome,
        data,
        hora,
        tipo,
        status,
        observacoes,
        req.params.id,
      ],
    );
    if (!result.changes)
      return res.status(404).json({ error: "Agendamento não encontrado" });
    const updated = await get("SELECT * FROM agendamentos WHERE id = ?", [
      req.params.id,
    ]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/agendamentos/:id", async (req, res) => {
  try {
    const result = await run("DELETE FROM agendamentos WHERE id = ?", [
      req.params.id,
    ]);
    if (!result.changes)
      return res.status(404).json({ error: "Agendamento não encontrado" });
    res.json({ message: "Agendamento excluído com sucesso" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SESSÕES ──────────────────────────────────────────────────────────────────

app.get("/api/sessoes", async (req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM sessoes ORDER BY data DESC, hora DESC",
    );
    res.json(rows.map(formatSessao));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessoes/paciente/:pacienteId", async (req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM sessoes WHERE pacienteId = ? ORDER BY data DESC, hora DESC",
      [req.params.pacienteId],
    );
    res.json(rows.map(formatSessao));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessoes/ultima/paciente/:pacienteId", async (req, res) => {
  try {
    const row = await get(
      "SELECT * FROM sessoes WHERE pacienteId = ? ORDER BY data DESC, hora DESC LIMIT 1",
      [req.params.pacienteId],
    );
    res.json(row ? formatSessao(row) : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessoes/:id", async (req, res) => {
  try {
    const row = await get("SELECT * FROM sessoes WHERE id = ?", [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ error: "Sessão não encontrada" });
    res.json(formatSessao(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sessoes", async (req, res) => {
  const {
    pacienteId,
    pacienteNome,
    agendamentoId,
    data,
    hora,
    numeroSessao,
    tipo,
    relato,
    atencao,
    humor,
    participacao,
    evolucao,
    atividades,
    plano,
    audios,
  } = req.body;
  if (!pacienteId || !data)
    return res
      .status(400)
      .json({ error: "pacienteId e data são obrigatórios" });
  try {
    const result = await run(
      `INSERT INTO sessoes
         (pacienteId, pacienteNome, agendamentoId, data, hora, numeroSessao,
          tipo, relato, atencao, humor, participacao, evolucao, atividades, plano, audios)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pacienteId,
        pacienteNome,
        agendamentoId || null,
        data,
        hora,
        numeroSessao || null,
        tipo || "Avaliação inicial",
        relato,
        atencao,
        humor,
        participacao,
        evolucao,
        JSON.stringify(atividades || []),
        plano,
        JSON.stringify(audios || []),
      ],
    );
    const created = await get("SELECT * FROM sessoes WHERE id = ?", [
      result.id,
    ]);
    res.status(201).json(formatSessao(created));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/sessoes/:id", async (req, res) => {
  const {
    pacienteId,
    pacienteNome,
    agendamentoId,
    data,
    hora,
    numeroSessao,
    tipo,
    relato,
    atencao,
    humor,
    participacao,
    evolucao,
    atividades,
    plano,
    audios,
  } = req.body;
  try {
    const result = await run(
      `UPDATE sessoes SET
         pacienteId=?, pacienteNome=?, agendamentoId=?, data=?, hora=?, numeroSessao=?,
         tipo=?, relato=?, atencao=?, humor=?, participacao=?, evolucao=?,
         atividades=?, plano=?, audios=?
       WHERE id=?`,
      [
        pacienteId,
        pacienteNome,
        agendamentoId || null,
        data,
        hora,
        numeroSessao || null,
        tipo,
        relato,
        atencao,
        humor,
        participacao,
        evolucao,
        JSON.stringify(atividades || []),
        plano,
        JSON.stringify(audios || []),
        req.params.id,
      ],
    );
    if (!result.changes)
      return res.status(404).json({ error: "Sessão não encontrada" });
    const updated = await get("SELECT * FROM sessoes WHERE id = ?", [
      req.params.id,
    ]);
    res.json(formatSessao(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/sessoes/:id", async (req, res) => {
  try {
    const result = await run("DELETE FROM sessoes WHERE id = ?", [
      req.params.id,
    ]);
    if (!result.changes)
      return res.status(404).json({ error: "Sessão não encontrada" });
    res.json({ message: "Sessão excluída com sucesso" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ESTATÍSTICAS ─────────────────────────────────────────────────────────────

app.get("/api/estatisticas", async (req, res) => {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const [
      totalPacientes,
      agendamentosHoje,
      confirmados,
      pendentes,
      cancelados,
      totalSessoes,
    ] = await Promise.all([
      get("SELECT COUNT(*) as count FROM pacientes"),
      get("SELECT COUNT(*) as count FROM agendamentos WHERE data = ?", [hoje]),
      get(
        "SELECT COUNT(*) as count FROM agendamentos WHERE status = 'confirmado'",
      ),
      get(
        "SELECT COUNT(*) as count FROM agendamentos WHERE status = 'pendente'",
      ),
      get(
        "SELECT COUNT(*) as count FROM agendamentos WHERE status = 'cancelado'",
      ),
      get("SELECT COUNT(*) as count FROM sessoes"),
    ]);
    res.json({
      totalPacientes: totalPacientes.count,
      agendamentosHoje: agendamentosHoje.count,
      confirmados: confirmados.count,
      pendentes: pendentes.count,
      cancelados: cancelados.count,
      totalSessoes: totalSessoes.count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Erro ao inicializar banco de dados:", err);
    process.exit(1);
  });
