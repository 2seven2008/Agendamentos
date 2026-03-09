/* ======================================================================
   app.js — Sistema de Agendamento Psicopedagogia
   ====================================================================== */

"use strict";

// ─── PWA: Service Worker ────────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("SW registrado:", reg.scope))
      .catch((err) => console.warn("SW falhou:", err));
  });
}

// ─── PWA: Instalação ────────────────────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById("pwa-install-sidebar");
  if (btn) btn.style.display = "block";
});

window.installPWA = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === "accepted") {
    document.getElementById("pwa-install-sidebar").style.display = "none";
  }
  deferredPrompt = null;
};

// ─── API Service ────────────────────────────────────────────────────────────
const API = {
  baseUrl: "/api",

  async request(endpoint, options = {}) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      throw new Error(err.error || "Erro na requisição");
    }
    return res.json();
  },

  // Pacientes
  getPacientes:    ()       => API.request("/pacientes"),
  getPaciente:     (id)     => API.request(`/pacientes/${id}`),
  createPaciente:  (data)   => API.request("/pacientes",    { method: "POST", body: JSON.stringify(data) }),
  updatePaciente:  (id, d)  => API.request(`/pacientes/${id}`, { method: "PUT",  body: JSON.stringify(d)    }),
  deletePaciente:  (id)     => API.request(`/pacientes/${id}`, { method: "DELETE" }),

  // Agendamentos
  getAgendamentos:          ()   => API.request("/agendamentos"),
  getAgendamentosPorData:   (dt) => API.request(`/agendamentos/data/${dt}`),
  getAgendamentosPorPaciente:(id)=> API.request(`/agendamentos/paciente/${id}`),
  getAgendamento:           (id) => API.request(`/agendamentos/${id}`),
  createAgendamento: (data)      => API.request("/agendamentos",    { method: "POST", body: JSON.stringify(data) }),
  updateAgendamento: (id, d)     => API.request(`/agendamentos/${id}`, { method: "PUT",  body: JSON.stringify(d)    }),
  deleteAgendamento: (id)        => API.request(`/agendamentos/${id}`, { method: "DELETE" }),

  // Sessões
  getSessoes:              ()   => API.request("/sessoes"),
  getSessao:               (id) => API.request(`/sessoes/${id}`),
  getSessoesPorPaciente:   (id) => API.request(`/sessoes/paciente/${id}`),
  getUltimaSessaoPorPaciente:(id)=>API.request(`/sessoes/ultima/paciente/${id}`),
  createSessao: (data)          => API.request("/sessoes",    { method: "POST", body: JSON.stringify(data) }),
  updateSessao: (id, d)         => API.request(`/sessoes/${id}`, { method: "PUT",  body: JSON.stringify(d)    }),
  deleteSessao: (id)            => API.request(`/sessoes/${id}`, { method: "DELETE" }),

  // Estatísticas
  getEstatisticas: () => API.request("/estatisticas"),
};

// ─── Estado global ──────────────────────────────────────────────────────────
let pacientes            = [];
let agendamentos         = [];
let sessoes              = [];
let pacienteSelecionado  = null;
let editandoPacienteIdx  = null;
let editandoAgendamentoIdx = null;
let editandoSessaoIdx    = null;

// ─── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, tipo = "success") {
  const toast = document.getElementById("app-toast");
  const body  = document.getElementById("toast-msg");
  if (!toast || !body) return;
  body.textContent = msg;
  toast.className = `toast align-items-center text-white border-0 bg-${tipo === "error" ? "danger" : tipo}`;
  new bootstrap.Toast(toast, { delay: 3000 }).show();
}

// ─── Carregar dados iniciais ────────────────────────────────────────────────
async function carregarDados() {
  try {
    const [pac, ag, ses, estat] = await Promise.all([
      API.getPacientes(),
      API.getAgendamentos(),
      API.getSessoes(),
      API.getEstatisticas(),
    ]);

    pacientes    = pac;
    agendamentos = ag;
    sessoes      = ses;

    atualizarListaPacientes();
    popularSelectPacientes();
    atualizarDashboard(estat);
    renderizarAgendamentos();
    renderizarSessoes();
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
    showToast("Erro ao conectar com o servidor. Verifique se está rodando.", "error");
  }
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
async function atualizarDashboard(estat = null) {
  try {
    if (!estat) estat = await API.getEstatisticas();
    document.getElementById("stat-hoje").textContent        = estat.agendamentosHoje ?? 0;
    document.getElementById("stat-confirmadas").textContent = estat.confirmados       ?? 0;
    document.getElementById("stat-pendentes").textContent   = estat.pendentes         ?? 0;
    document.getElementById("stat-canceladas").textContent  = estat.cancelados        ?? 0;
    renderizarCalendario();
    mostrarProximasConsultas();
  } catch (err) {
    console.error("Erro ao atualizar dashboard:", err);
  }
}

// ─── Calendário ─────────────────────────────────────────────────────────────
let calAno  = new Date().getFullYear();
let calMes  = new Date().getMonth();
let calDiaSelecionado = null;

const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function mudarMes(delta) {
  calMes += delta;
  if (calMes > 11) { calMes = 0;  calAno++; }
  if (calMes < 0)  { calMes = 11; calAno--; }
  calDiaSelecionado = null;
  renderizarCalendario();
  mostrarProximasConsultas();
}

function renderizarCalendario() {
  document.getElementById("cal-titulo").textContent = `${MESES_PT[calMes]} ${calAno}`;

  const hoje      = new Date();
  const hojeStr   = toDateStr(hoje);
  const priDia    = new Date(calAno, calMes, 1).getDay();
  const diasMes   = new Date(calAno, calMes + 1, 0).getDate();
  const diasAnt   = new Date(calAno, calMes,     0).getDate();

  // Mapa status por data
  const agMap = {};
  agendamentos.forEach((a) => {
    if (!agMap[a.data]) agMap[a.data] = [];
    agMap[a.data].push(a.status);
  });

  let html = "";

  for (let i = priDia - 1; i >= 0; i--)
    html += `<div class="cal-day other-month"><span>${diasAnt - i}</span></div>`;

  for (let d = 1; d <= diasMes; d++) {
    const ds   = `${calAno}-${String(calMes+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const cls  = ["cal-day", ds === hojeStr ? "today" : "", ds === calDiaSelecionado ? "selected" : ""].filter(Boolean).join(" ");
    const ags  = agMap[ds] || [];
    const dots = ags.slice(0,4).map((s) => `<div class="cal-dot ${s}"></div>`).join("");
    html += `<div class="${cls}" onclick="selecionarDia('${ds}')">
      <span>${d}</span>
      ${dots ? `<div class="cal-dots">${dots}</div>` : ""}
    </div>`;
  }

  const total = priDia + diasMes;
  const resto = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= resto; d++)
    html += `<div class="cal-day other-month"><span>${d}</span></div>`;

  document.getElementById("cal-days").innerHTML = html;
}

async function selecionarDia(ds) {
  calDiaSelecionado = ds;
  renderizarCalendario();

  const [y, m, d] = ds.split("-");
  document.getElementById("cal-dia-titulo").textContent = `${parseInt(d)}/${m}/${y}`;

  try {
    const ags  = await API.getAgendamentosPorData(ds);
    const badge = document.getElementById("cal-dia-badge");

    if (ags.length) {
      badge.textContent    = `${ags.length} consulta${ags.length > 1 ? "s" : ""}`;
      badge.style.display  = "inline-block";
    } else {
      badge.style.display  = "none";
    }

    const cont = document.getElementById("cal-dia-consultas");
    cont.innerHTML = ags.length
      ? ags.map((a) => consultaItemHTML(a)).join("")
      : `<p class="text-muted" style="font-style:italic;font-size:0.88rem">Nenhuma consulta neste dia.</p>`;
  } catch (err) {
    console.error("Erro ao buscar agendamentos:", err);
  }
}

function mostrarProximasConsultas() {
  document.getElementById("cal-dia-titulo").textContent = "Próximas Consultas";
  document.getElementById("cal-dia-badge").style.display = "none";
  calDiaSelecionado = null;

  const hoje    = toDateStr(new Date());
  const proximas = agendamentos
    .filter((a) => a.data >= hoje && a.status !== "cancelado")
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
    .slice(0, 6);

  document.getElementById("cal-dia-consultas").innerHTML = proximas.length
    ? proximas.map((a) => consultaItemHTML(a, true)).join("")
    : `<p class="text-muted" style="font-style:italic;font-size:0.88rem">Sem próximas consultas.</p>`;

  renderizarCalendario();
}

function consultaItemHTML(a, mostrarData = false) {
  return `<div class="day-consulta-item" onclick="verAgendamento(${a.id})">
    <div class="day-consulta-hora">${a.hora}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.pacienteNome}</div>
      <div style="font-size:0.75rem;color:var(--text-muted)">${mostrarData ? formatarData(a.data) + " · " : ""}${a.tipo}</div>
    </div>
    <span class="badge-status badge-${a.status}">${a.status}</span>
  </div>`;
}

// ─── Navegação ──────────────────────────────────────────────────────────────
function mostrarPagina(pagina) {
  document.querySelectorAll(".pagina").forEach((p) => (p.style.display = "none"));

  // sidebar desktop
  document.querySelectorAll(".sidebar nav a").forEach((a) => a.classList.remove("ativo"));
  const navEl = document.getElementById(`nav-${pagina}`);
  if (navEl) navEl.classList.add("ativo");

  // drawer mobile
  document.querySelectorAll(".mobile-drawer a").forEach((a) => a.classList.remove("ativo"));
  const mobEl = document.getElementById(`mob-nav-${pagina}`);
  if (mobEl) mobEl.classList.add("ativo");

  // bottom nav
  document.querySelectorAll(".bottom-nav-item").forEach((a) => a.classList.remove("ativo"));
  const bnEl = document.getElementById(`bnav-${pagina}`);
  if (bnEl) bnEl.classList.add("ativo");

  document.getElementById(`pagina-${pagina}`).style.display = "block";

  if (pagina === "dashboard")    atualizarDashboard();
  if (pagina === "sessoes")      renderizarSessoes();
  if (pagina === "agendamentos") renderizarAgendamentos();
}

// ─── Mobile drawer ──────────────────────────────────────────────────────────
function toggleDrawer() {
  document.getElementById("mobile-drawer").classList.toggle("open");
  document.getElementById("mobile-overlay").classList.toggle("open");
}

// ─── Utilitários de data ────────────────────────────────────────────────────
function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function formatarData(d) {
  if (!d) return "—";
  const [y, m, dia] = d.split("-");
  return `${dia}/${m}/${y}`;
}

function calcularIdadeAuto() {
  const nasc = document.getElementById("nascimentoPaciente").value;
  if (!nasc) return;
  const hoje = new Date();
  const dn   = new Date(nasc);
  let idade  = hoje.getFullYear() - dn.getFullYear();
  const m    = hoje.getMonth() - dn.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < dn.getDate())) idade--;
  document.getElementById("idadePaciente").value = idade >= 0 ? idade : "";
}

// ─── Pacientes ──────────────────────────────────────────────────────────────
async function salvarPaciente() {
  const nome = document.getElementById("nomePaciente").value.trim();
  const tel  = document.getElementById("telefonePaciente").value.trim();

  if (!nome || !tel) {
    showToast("Nome e telefone são obrigatórios!", "warning");
    return;
  }

  const paciente = {
    nome,
    nascimento:  document.getElementById("nascimentoPaciente").value,
    idade:       document.getElementById("idadePaciente").value || null,
    responsavel: document.getElementById("responsavelPaciente").value.trim(),
    telefone:    tel,
    email:       document.getElementById("emailPaciente").value.trim(),
    queixa:      document.getElementById("queixaPaciente").value.trim(),
    diagnostico: document.getElementById("diagnosticoPaciente").value.trim(),
    medicacao:   document.getElementById("medicacaoPaciente").value.trim(),
    indicacao:   document.getElementById("indicacaoPaciente").value.trim(),
    observacoes: document.getElementById("obsPaciente").value.trim(),
  };

  try {
    if (editandoPacienteIdx !== null) {
      const id = pacientes[editandoPacienteIdx].id;
      await API.updatePaciente(id, paciente);
      showToast("Paciente atualizado com sucesso!");
    } else {
      await API.createPaciente(paciente);
      showToast("Paciente cadastrado com sucesso!");
    }

    await carregarDados();
    bootstrap.Modal.getInstance(document.getElementById("modalPaciente"))?.hide();
    document.getElementById("formPaciente").reset();
    editandoPacienteIdx = null;
  } catch (err) {
    console.error("Erro ao salvar paciente:", err);
    showToast("Erro ao salvar paciente: " + err.message, "error");
  }
}

function atualizarListaPacientes() {
  const lista  = document.getElementById("listaPacientes");
  const busca  = (document.getElementById("busca-paciente")?.value || "").toLowerCase();
  const filtrados = pacientes.filter((p) => p.nome.toLowerCase().includes(busca));

  if (!filtrados.length) {
    lista.innerHTML = '<li class="list-group-item text-muted" style="font-style:italic">Nenhum paciente encontrado</li>';
    return;
  }

  lista.innerHTML = filtrados.map((p) => {
    const initials = getInitials(p.nome);
    const isActive = pacienteSelecionado === p.id;
    return `<li class="list-group-item list-group-item-action d-flex align-items-center gap-3 ${isActive ? "active" : ""}"
               onclick="selecionarPaciente(${p.id})">
      <div style="width:32px;height:32px;border-radius:50%;background:${isActive ? "#fff" : "var(--accent)"};
                  color:${isActive ? "var(--accent)" : "#fff"};display:flex;align-items:center;justify-content:center;
                  font-size:0.75rem;font-weight:600;flex-shrink:0">${initials}</div>
      <div style="min-width:0">
        <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nome}</div>
        ${p.responsavel ? `<div style="font-size:0.75rem;opacity:0.7">${p.responsavel}</div>` : ""}
      </div>
    </li>`;
  }).join("");
}

async function selecionarPaciente(id) {
  pacienteSelecionado = id;
  atualizarListaPacientes();

  try {
    const p = pacientes.find((x) => x.id === id);
    const sessoesPaciente = sessoes.filter((s) => s.pacienteId === id);

    document.getElementById("infoPaciente").innerHTML = `
      <div class="d-flex align-items-center gap-3 mb-4">
        <div class="avatar" style="width:52px;height:52px;font-size:1.2rem">${getInitials(p.nome)}</div>
        <div>
          <h5 style="font-family:'Lora',serif;margin:0">${p.nome}</h5>
          <div style="font-size:0.8rem;color:var(--text-muted)">
            Cadastro: ${p.dataCadastro || "—"} · ${sessoesPaciente.length} sessão(ões)
          </div>
        </div>
      </div>
      <div class="row g-2 mb-3">
        ${campoInfo("Nascimento",   p.nascimento ? formatarData(p.nascimento) : "—")}
        ${campoInfo("Idade",        p.idade ? p.idade + " anos" : "—")}
        ${campoInfo("Responsável",  p.responsavel || "—")}
        ${campoInfo("Telefone",     p.telefone)}
        ${campoInfo("E-mail",       p.email || "—")}
        ${campoInfo("Queixa",       p.queixa || "—")}
        ${campoInfo("Diagnóstico",  p.diagnostico || "—")}
        ${campoInfo("Medicação",    p.medicacao || "—")}
        ${campoInfo("Indicado por", p.indicacao || "—")}
      </div>
      ${p.observacoes ? `<div style="background:#f8fafd;border-radius:8px;padding:12px 14px;font-size:0.88rem;border:1px solid var(--border);margin-bottom:16px"><strong>Observações:</strong> ${p.observacoes}</div>` : ""}
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-warning btn-sm" onclick="abrirEdicaoPaciente(${p.id})"><i class="bi bi-pencil me-1"></i> Editar</button>
        <button class="btn btn-danger  btn-sm" onclick="excluirPaciente(${p.id})"><i class="bi bi-trash me-1"></i> Excluir</button>
        <button class="btn btn-primary btn-sm" onclick="mostrarPagina('sessoes')"><i class="bi bi-clipboard-plus me-1"></i> Ver Sessões</button>
      </div>`;
  } catch (err) {
    console.error("Erro ao selecionar paciente:", err);
  }
}

function campoInfo(label, valor) {
  return `<div class="col-12 col-sm-6">
    <div class="info-field">
      <label>${label}</label>
      <span>${valor}</span>
    </div>
  </div>`;
}

async function abrirEdicaoPaciente(id) {
  const p = pacientes.find((x) => x.id === id);
  if (!p) return;
  editandoPacienteIdx = pacientes.indexOf(p);

  document.getElementById("titulo-modal-paciente").textContent = "Editar Paciente";
  document.getElementById("nomePaciente").value        = p.nome;
  document.getElementById("nascimentoPaciente").value  = p.nascimento || "";
  document.getElementById("idadePaciente").value       = p.idade || "";
  if (p.nascimento) calcularIdadeAuto();
  document.getElementById("responsavelPaciente").value = p.responsavel || "";
  document.getElementById("telefonePaciente").value    = p.telefone;
  document.getElementById("emailPaciente").value       = p.email || "";
  document.getElementById("queixaPaciente").value      = p.queixa || "";
  document.getElementById("diagnosticoPaciente").value = p.diagnostico || "";
  document.getElementById("medicacaoPaciente").value   = p.medicacao || "";
  document.getElementById("indicacaoPaciente").value   = p.indicacao || "";
  document.getElementById("obsPaciente").value         = p.observacoes || "";

  new bootstrap.Modal(document.getElementById("modalPaciente")).show();
}

async function excluirPaciente(id) {
  if (!confirm("Excluir este paciente? Esta ação é irreversível.")) return;
  try {
    await API.deletePaciente(id);
    await carregarDados();
    pacienteSelecionado = null;
    document.getElementById("infoPaciente").innerHTML =
      '<p class="text-muted" style="font-style:italic">Selecione um paciente para ver as informações.</p>';
    showToast("Paciente excluído.");
  } catch (err) {
    console.error("Erro ao excluir:", err);
    showToast("Erro ao excluir paciente.", "error");
  }
}

// ─── Agendamentos ────────────────────────────────────────────────────────────
function popularSelectPacientes() {
  ["ag-paciente", "sess-paciente"].forEach((selId) => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">Selecione o paciente</option>';
    pacientes.forEach((p) => {
      const opt = document.createElement("option");
      opt.value       = p.id;
      opt.textContent = p.nome;
      sel.appendChild(opt);
    });
    sel.value = val;
  });
}

function abrirModalNovoAgendamento() {
  editandoAgendamentoIdx = null;
  document.getElementById("titulo-modal-agendamento").textContent = "Nova Consulta";
  document.getElementById("btn-salvar-agendamento").textContent   = "Salvar";
  document.getElementById("ag-paciente").value = "";
  document.getElementById("ag-data").value     = toDateStr(new Date());
  document.getElementById("ag-hora").value     = "";
  document.getElementById("ag-tipo").value     = "Consulta inicial";
  document.getElementById("ag-status").value   = "pendente";
  document.getElementById("ag-obs").value      = "";
  popularSelectPacientes();
  new bootstrap.Modal(document.getElementById("modalAgendamento")).show();
}

async function abrirEdicaoAgendamento(id) {
  const a = agendamentos.find((x) => x.id === id);
  if (!a) return;
  editandoAgendamentoIdx = id;

  document.getElementById("titulo-modal-agendamento").textContent = "Editar Agendamento";
  document.getElementById("btn-salvar-agendamento").textContent   = "Atualizar";
  popularSelectPacientes();

  document.getElementById("ag-paciente").value = a.pacienteId;
  document.getElementById("ag-data").value     = a.data;
  document.getElementById("ag-hora").value     = a.hora;
  document.getElementById("ag-tipo").value     = a.tipo;
  document.getElementById("ag-status").value   = a.status;
  document.getElementById("ag-obs").value      = a.observacoes || "";

  bootstrap.Modal.getInstance(document.getElementById("modalVerAgendamento"))?.hide();
  new bootstrap.Modal(document.getElementById("modalAgendamento")).show();
}

async function verAgendamento(id) {
  try {
    const a = await API.getAgendamento(id);
    document.getElementById("ver-agendamento-body").innerHTML = `
      <div class="mb-3">
        <div class="view-field"><label>Paciente</label><span style="font-weight:600">${a.pacienteNome}</span></div>
        <div class="view-field"><label>Data</label><span>${formatarData(a.data)}</span></div>
        <div class="view-field"><label>Horário</label><span>${a.hora}</span></div>
        <div class="view-field"><label>Tipo</label><span>${a.tipo}</span></div>
        <div class="view-field"><label>Status</label><span><span class="badge-status badge-${a.status}">${a.status}</span></span></div>
        ${a.observacoes ? `<div class="view-field"><label>Observações</label><span>${a.observacoes}</span></div>` : ""}
      </div>`;
    document.getElementById("btn-editar-agendamento-modal").onclick = () => abrirEdicaoAgendamento(a.id);
    new bootstrap.Modal(document.getElementById("modalVerAgendamento")).show();
  } catch (err) {
    console.error("Erro ao ver agendamento:", err);
  }
}

async function salvarAgendamento() {
  const pacienteId = document.getElementById("ag-paciente").value;
  const data       = document.getElementById("ag-data").value;
  const hora       = document.getElementById("ag-hora").value;

  if (!pacienteId || !data || !hora) {
    showToast("Preencha paciente, data e hora!", "warning");
    return;
  }

  const paciente = pacientes.find((p) => p.id == pacienteId);
  const obj = {
    pacienteId:   parseInt(pacienteId),
    pacienteNome: paciente.nome,
    data,
    hora,
    tipo:         document.getElementById("ag-tipo").value,
    status:       document.getElementById("ag-status").value,
    observacoes:  document.getElementById("ag-obs").value,
  };

  try {
    if (editandoAgendamentoIdx) {
      await API.updateAgendamento(editandoAgendamentoIdx, obj);
      showToast("Agendamento atualizado!");
    } else {
      await API.createAgendamento(obj);
      showToast("Agendamento criado!");
    }

    await carregarDados();
    bootstrap.Modal.getInstance(document.getElementById("modalAgendamento"))?.hide();
    if (calDiaSelecionado) selecionarDia(calDiaSelecionado);
  } catch (err) {
    console.error("Erro ao salvar agendamento:", err);
    showToast("Erro ao salvar agendamento.", "error");
  }
}

function renderizarAgendamentos() {
  const tbody = document.getElementById("tbody-agendamentos");
  if (!agendamentos.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4" style="font-style:italic">Nenhum agendamento cadastrado</td></tr>';
    return;
  }

  const sorted = [...agendamentos].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  tbody.innerHTML = sorted.map((a) => `
    <tr>
      <td data-label="Paciente"  style="font-weight:500">${a.pacienteNome}</td>
      <td data-label="Data">${formatarData(a.data)}</td>
      <td data-label="Hora">${a.hora}</td>
      <td data-label="Tipo">${a.tipo}</td>
      <td data-label="Status"><span class="badge-status badge-${a.status}">${a.status}</span></td>
      <td>
        <div class="d-flex gap-1 justify-content-end">
          <button class="btn btn-sm btn-outline-secondary" title="Visualizar" onclick="verAgendamento(${a.id})"><i class="bi bi-eye"></i></button>
          <button class="btn btn-sm btn-outline-warning"   title="Editar"     onclick="abrirEdicaoAgendamento(${a.id})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger"    title="Excluir"    onclick="excluirAgendamento(${a.id})"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`).join("");
}

async function excluirAgendamento(id) {
  if (!confirm("Excluir este agendamento?")) return;
  try {
    await API.deleteAgendamento(id);
    await carregarDados();
    if (calDiaSelecionado) selecionarDia(calDiaSelecionado);
    showToast("Agendamento excluído.");
  } catch (err) {
    showToast("Erro ao excluir agendamento.", "error");
  }
}

// ─── Sessões ─────────────────────────────────────────────────────────────────
function abrirModalNovaSessao() {
  editandoSessaoIdx = null;
  document.getElementById("titulo-modal-sessao").textContent = "Registrar Sessão";
  const now = new Date();
  document.getElementById("sess-data").value        = toDateStr(now);
  document.getElementById("sess-hora").value        = now.toTimeString().slice(0,5);
  document.getElementById("sess-paciente").value    = "";
  document.getElementById("sess-numero").value      = "";
  document.getElementById("sess-tipo").value        = "Avaliação inicial";
  document.getElementById("sess-relato").value      = "";
  document.getElementById("sess-atencao").value     = "";
  document.getElementById("sess-humor").value       = "";
  document.getElementById("sess-participacao").value= "";
  document.getElementById("sess-evolucao").value    = "";
  document.getElementById("sess-plano").value       = "";
  atividadesSessao = [];
  audiosSessao     = [];
  renderizarAtividades();
  renderizarAudios();
  resetarTimer();
  document.getElementById("erro-audio").style.display    = "none";
  document.getElementById("status-gravacao").textContent = "Pronto para gravar";
  popularSelectPacientes();
  new bootstrap.Modal(document.getElementById("modalSessao")).show();
}

async function abrirEdicaoSessao(id) {
  try {
    const s = await API.getSessao(id);
    editandoSessaoIdx = id;

    document.getElementById("titulo-modal-sessao").textContent = "Editar Sessão";
    popularSelectPacientes();

    document.getElementById("sess-paciente").value     = s.pacienteId;
    document.getElementById("sess-data").value         = s.data;
    document.getElementById("sess-hora").value         = s.hora || "";
    document.getElementById("sess-numero").value       = s.numeroSessao || "";
    document.getElementById("sess-tipo").value         = s.tipo;
    document.getElementById("sess-relato").value       = s.relato || "";
    document.getElementById("sess-atencao").value      = s.atencao || "";
    document.getElementById("sess-humor").value        = s.humor || "";
    document.getElementById("sess-participacao").value = s.participacao || "";
    document.getElementById("sess-evolucao").value     = s.evolucao || "";
    document.getElementById("sess-plano").value        = s.plano || "";

    atividadesSessao = s.atividades || [];
    audiosSessao     = s.audios     || [];
    renderizarAtividades();
    renderizarAudios();
    resetarTimer();

    document.getElementById("erro-audio").style.display    = "none";
    document.getElementById("status-gravacao").textContent = "Pronto para gravar";

    bootstrap.Modal.getInstance(document.getElementById("modalVerSessao"))?.hide();
    new bootstrap.Modal(document.getElementById("modalSessao")).show();
  } catch (err) {
    console.error("Erro ao abrir edição de sessão:", err);
  }
}

async function verSessao(id) {
  try {
    const s = await API.getSessao(id);

    document.getElementById("ver-sessao-body").innerHTML = `
      <div class="row g-3">
        <div class="col-12 col-md-6">
          <div class="view-section-title">Identificação</div>
          <div class="view-field"><label>Paciente</label><span style="font-weight:600">${s.pacienteNome}</span></div>
          <div class="view-field"><label>Data</label><span>${formatarData(s.data)}</span></div>
          <div class="view-field"><label>Horário</label><span>${s.hora || "—"}</span></div>
          ${s.numeroSessao ? `<div class="view-field"><label>Nº Sessão</label><span>${s.numeroSessao}</span></div>` : ""}
          <div class="view-field"><label>Tipo</label><span>${s.tipo}</span></div>
        </div>
        <div class="col-12 col-md-6">
          <div class="view-section-title">Avaliações</div>
          ${s.atencao     ? `<div class="view-field"><label>Atenção</label><span>${s.atencao}</span></div>` : ""}
          ${s.humor       ? `<div class="view-field"><label>Humor</label><span>${s.humor}</span></div>` : ""}
          ${s.participacao? `<div class="view-field"><label>Participação</label><span>${s.participacao}</span></div>` : ""}
          ${s.evolucao    ? `<div class="view-field"><label>Evolução</label><span>${s.evolucao}</span></div>` : ""}
        </div>
        ${s.relato ? `
        <div class="col-12">
          <div class="view-section-title">Relato da Sessão</div>
          <p style="font-size:0.9rem;background:#f8fafd;padding:12px;border-radius:8px;border:1px solid var(--border)">${s.relato}</p>
        </div>` : ""}
        ${s.atividades?.length ? `
        <div class="col-12">
          <div class="view-section-title">Atividades Realizadas</div>
          <div class="d-flex flex-wrap gap-2">
            ${s.atividades.map((a) => `<span style="background:var(--accent-soft);border:1px solid var(--border);padding:4px 10px;border-radius:20px;font-size:0.82rem">${a}</span>`).join("")}
          </div>
        </div>` : ""}
        ${s.plano ? `
        <div class="col-12">
          <div class="view-section-title">Plano para Próxima Sessão</div>
          <p style="font-size:0.9rem;background:#f8fafd;padding:12px;border-radius:8px;border:1px solid var(--border)">${s.plano}</p>
        </div>` : ""}
        ${s.audios?.length ? `
        <div class="col-12">
          <div class="view-section-title">Gravações de Áudio</div>
          <div id="audios-ver-sessao-${s.id}"></div>
        </div>` : ""}
      </div>`;

    document.getElementById("btn-editar-sessao-modal").onclick  = () => abrirEdicaoSessao(s.id);
    document.getElementById("btn-excluir-sessao-modal").onclick = () => excluirSessao(s.id);

    new bootstrap.Modal(document.getElementById("modalVerSessao")).show();

    if (s.audios?.length) renderizarAudiosVerSessao(s);
  } catch (err) {
    console.error("Erro ao ver sessão:", err);
  }
}

function renderizarAudiosVerSessao(sessao) {
  const container = document.getElementById(`audios-ver-sessao-${sessao.id}`);
  if (!container) return;
  container.innerHTML = sessao.audios.map((a, ai) => `
    <div class="audio-item">
      <span class="bi bi-mic-fill" style="color:var(--accent);font-size:1rem"></span>
      <div style="flex:1;min-width:0">
        <div class="audio-label mb-1">${a.label}${a.duracao ? ` (${a.duracao})` : ""}</div>
        ${a.base64
          ? `<audio controls src="${a.base64}" style="width:100%;height:28px;margin-top:4px"></audio>`
          : '<span style="font-size:0.78rem;color:var(--text-muted);font-style:italic">Áudio não disponível</span>'}
      </div>
      <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="excluirAudioSessao(${sessao.id},${ai})">
        <i class="bi bi-trash"></i>
      </button>
    </div>`).join("");
}

async function salvarSessao() {
  const pacienteId = document.getElementById("sess-paciente").value;
  if (!pacienteId) { showToast("Selecione o paciente!", "warning"); return; }

  pararGravacao();

  const paciente = pacientes.find((p) => p.id == pacienteId);
  const sessao = {
    pacienteId:   parseInt(pacienteId),
    pacienteNome: paciente.nome,
    data:         document.getElementById("sess-data").value,
    hora:         document.getElementById("sess-hora").value,
    numeroSessao: document.getElementById("sess-numero").value ? parseInt(document.getElementById("sess-numero").value) : null,
    tipo:         document.getElementById("sess-tipo").value,
    relato:       document.getElementById("sess-relato").value,
    atencao:      document.getElementById("sess-atencao").value,
    humor:        document.getElementById("sess-humor").value,
    participacao: document.getElementById("sess-participacao").value,
    evolucao:     document.getElementById("sess-evolucao").value,
    atividades:   atividadesSessao,
    plano:        document.getElementById("sess-plano").value,
    audios:       audiosSessao.map((a) => ({ label: a.label, duracao: a.duracao, base64: a.base64 })),
  };

  try {
    if (editandoSessaoIdx) {
      await API.updateSessao(editandoSessaoIdx, sessao);
      showToast("Sessão atualizada!");
    } else {
      await API.createSessao(sessao);
      showToast("Sessão registrada!");
    }

    await carregarDados();
    atividadesSessao = [];
    audiosSessao     = [];
    renderizarAtividades();
    renderizarAudios();
    resetarTimer();
    bootstrap.Modal.getInstance(document.getElementById("modalSessao"))?.hide();
  } catch (err) {
    console.error("Erro ao salvar sessão:", err);
    showToast("Erro ao salvar sessão.", "error");
  }
}

async function excluirSessao(id) {
  if (!confirm("Excluir esta sessão? Esta ação é irreversível.")) return;
  try {
    await API.deleteSessao(id);
    await carregarDados();
    bootstrap.Modal.getInstance(document.getElementById("modalVerSessao"))?.hide();
    showToast("Sessão excluída.");
  } catch (err) {
    showToast("Erro ao excluir sessão.", "error");
  }
}

async function excluirAudioSessao(sessaoId, audioIdx) {
  if (!confirm("Excluir esta gravação? Esta ação é irreversível.")) return;
  try {
    const sessao = await API.getSessao(sessaoId);
    sessao.audios.splice(audioIdx, 1);
    await API.updateSessao(sessaoId, sessao);
    await carregarDados();
    renderizarAudiosVerSessao(sessao);
    showToast("Gravação excluída.");
  } catch (err) {
    showToast("Erro ao excluir áudio.", "error");
  }
}

function renderizarSessoes() {
  const cont = document.getElementById("lista-sessoes-pacientes");
  if (!sessoes.length) {
    cont.innerHTML = '<p class="text-muted" style="font-style:italic">Nenhuma sessão registrada ainda.</p>';
    return;
  }

  const grupos = {};
  sessoes.forEach((s) => {
    if (!grupos[s.pacienteNome]) grupos[s.pacienteNome] = [];
    grupos[s.pacienteNome].push(s);
  });

  cont.innerHTML = Object.entries(grupos).map(([nome, lista]) => {
    const initials   = getInitials(nome);
    const sessoesHTML = lista
      .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
      .map((s) => `
        <div class="sessao-historico-item">
          <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
            <div>
              <strong>${s.tipo}</strong>
              ${s.numeroSessao ? `<span class="ms-2" style="font-size:0.78rem;color:var(--text-muted)">— Sessão nº${s.numeroSessao}</span>` : ""}
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span style="font-size:0.8rem;color:var(--text-muted)">${formatarData(s.data)}${s.hora ? " • " + s.hora : ""}</span>
              <button class="btn btn-sm btn-outline-secondary py-0 px-2" title="Ver"    onclick="verSessao(${s.id})"><i class="bi bi-eye"    style="font-size:0.75rem"></i></button>
              <button class="btn btn-sm btn-outline-warning   py-0 px-2" title="Editar" onclick="abrirEdicaoSessao(${s.id})"><i class="bi bi-pencil" style="font-size:0.75rem"></i></button>
              <button class="btn btn-sm btn-outline-danger    py-0 px-2" title="Excluir"onclick="excluirSessao(${s.id})"><i class="bi bi-trash"  style="font-size:0.75rem"></i></button>
            </div>
          </div>
          ${s.relato ? `<p style="font-size:0.88rem;margin-bottom:8px">${s.relato}</p>` : ""}
          ${s.atividades?.length ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px"><i class="bi bi-list-check me-1"></i>${s.atividades.join(" · ")}</div>` : ""}
          ${s.audios?.length ? `<div style="font-size:0.78rem;color:var(--accent)"><i class="bi bi-mic me-1"></i>${s.audios.length} gravação(ões)</div>` : ""}
          ${s.plano ? `<div style="font-size:0.83rem;margin-top:8px;padding:8px;background:#fff;border-radius:6px;border:1px solid var(--border)"><i class="bi bi-arrow-right-circle me-1" style="color:var(--accent)"></i>${s.plano}</div>` : ""}
        </div>`).join("");

    return `<div class="sessao-card">
      <div class="sessao-card-header" onclick="toggleSessaoCard(this)">
        <div class="sessao-patient-info">
          <div class="avatar">${initials}</div>
          <div>
            <div style="font-weight:600">${nome}</div>
            <div style="font-size:0.78rem;color:var(--text-muted)">${lista.length} sessão(ões) registrada(s)</div>
          </div>
        </div>
        <i class="bi bi-chevron-down" style="color:var(--text-muted);transition:transform 0.2s"></i>
      </div>
      <div class="sessao-body">${sessoesHTML}</div>
    </div>`;
  }).join("");
}

function toggleSessaoCard(header) {
  const body = header.nextElementSibling;
  const icon = header.querySelector('i[class*="chevron"]');
  body.classList.toggle("open");
  if (icon) icon.className = body.classList.contains("open") ? "bi bi-chevron-up" : "bi bi-chevron-down";
}

// ─── Gravação de áudio ───────────────────────────────────────────────────────
let mediaRecorder  = null;
let audioChunks    = [];
let timerInterval  = null;
let timerSeg       = 0;
let audiosSessao   = [];

function toggleGravacao() {
  if (mediaRecorder && mediaRecorder.state === "recording") pararGravacao();
  else iniciarGravacao();
}

async function iniciarGravacao() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks  = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob  = new Blob(audioChunks, { type: "audio/webm" });
      const label = `Gravação ${audiosSessao.length + 1} — ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      const m = String(Math.floor(timerSeg/60)).padStart(2,"0");
      const s = String(timerSeg % 60).padStart(2,"0");
      const duracao = `${m}:${s}`;

      const reader = new FileReader();
      reader.onloadend = () => {
        audiosSessao.push({ base64: reader.result, label, duracao });
        renderizarAudios();
      };
      reader.readAsDataURL(blob);

      stream.getTracks().forEach((t) => t.stop());
      timerSeg = 0;
      document.getElementById("timer-gravacao").textContent = "00:00";
      document.getElementById("timer-gravacao").className   = "audio-timer";
    };

    mediaRecorder.start();
    const btn = document.getElementById("btn-gravar");
    btn.className = "record-btn recording";
    document.getElementById("icon-gravar").className       = "bi bi-stop-fill";
    document.getElementById("status-gravacao").textContent = "Gravando...";

    timerSeg = 0;
    timerInterval = setInterval(() => {
      timerSeg++;
      const m = String(Math.floor(timerSeg/60)).padStart(2,"0");
      const s = String(timerSeg % 60).padStart(2,"0");
      document.getElementById("timer-gravacao").textContent = `${m}:${s}`;
      document.getElementById("timer-gravacao").className   = "audio-timer recording";
    }, 1000);
  } catch (err) {
    console.error("Erro ao iniciar gravação:", err);
    document.getElementById("erro-audio").style.display = "block";
  }
}

function pararGravacao() {
  if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
  clearInterval(timerInterval);
  const btn = document.getElementById("btn-gravar");
  if (btn) {
    btn.className = "record-btn idle";
    document.getElementById("icon-gravar").className       = "bi bi-mic-fill";
    document.getElementById("status-gravacao").textContent = "Pronto para gravar";
  }
}

function resetarTimer() {
  timerSeg = 0;
  clearInterval(timerInterval);
  const el = document.getElementById("timer-gravacao");
  if (el) { el.textContent = "00:00"; el.className = "audio-timer"; }
}

function renderizarAudios() {
  const cont = document.getElementById("lista-audios");
  if (!cont) return;
  cont.innerHTML = audiosSessao.map((a, i) => `
    <div class="audio-item">
      <span class="bi bi-mic-fill" style="color:var(--accent);font-size:1rem"></span>
      <div style="flex:1;min-width:0">
        <div class="audio-label mb-1">${a.label}${a.duracao ? ` (${a.duracao})` : ""}</div>
        <audio controls src="${a.base64}" style="width:100%;height:28px"></audio>
      </div>
      <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="removerAudio(${i})">
        <i class="bi bi-trash"></i>
      </button>
    </div>`).join("");
}

function removerAudio(i) {
  audiosSessao.splice(i, 1);
  renderizarAudios();
  if (!mediaRecorder || mediaRecorder.state !== "recording") resetarTimer();
}

// ─── Atividades ──────────────────────────────────────────────────────────────
let atividadesSessao = [];

function adicionarAtividade() {
  const input = document.getElementById("nova-atividade");
  const val   = input.value.trim();
  if (!val) return;
  atividadesSessao.push(val);
  input.value = "";
  renderizarAtividades();
}

document.addEventListener("keydown", (e) => {
  if (e.target?.id === "nova-atividade" && e.key === "Enter") {
    e.preventDefault();
    adicionarAtividade();
  }
});

function renderizarAtividades() {
  const cont = document.getElementById("atividades-tags");
  if (!cont) return;
  cont.innerHTML = atividadesSessao.map((a, i) => `
    <span style="background:var(--accent-soft);color:var(--text-main);border:1px solid var(--border);
                 padding:4px 10px;border-radius:20px;font-size:0.82rem;display:flex;align-items:center;gap:6px">
      ${a}
      <span onclick="removerAtividade(${i})" style="cursor:pointer;color:var(--danger);font-weight:bold;line-height:1">×</span>
    </span>`).join("");
}

function removerAtividade(i) {
  atividadesSessao.splice(i, 1);
  renderizarAtividades();
}

// ─── Utilitário: iniciais ────────────────────────────────────────────────────
function getInitials(nome) {
  return nome.split(" ").slice(0,2).map((n) => n[0] || "").join("").toUpperCase();
}

// ─── Eventos de modal reset ──────────────────────────────────────────────────
document.getElementById("modalPaciente").addEventListener("hidden.bs.modal", () => {
  editandoPacienteIdx = null;
  document.getElementById("formPaciente").reset();
  document.getElementById("titulo-modal-paciente").textContent = "Cadastrar Paciente";
});

document.getElementById("modalAgendamento").addEventListener("hidden.bs.modal", () => {
  editandoAgendamentoIdx = null;
  document.getElementById("titulo-modal-agendamento").textContent = "Nova Consulta";
  document.getElementById("btn-salvar-agendamento").textContent   = "Salvar";
});

document.getElementById("modalSessao").addEventListener("hidden.bs.modal", () => {
  pararGravacao();
  editandoSessaoIdx = null;
  atividadesSessao  = [];
  audiosSessao      = [];
  resetarTimer();
});

// ─── Init ────────────────────────────────────────────────────────────────────
carregarDados();
