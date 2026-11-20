"use strict";

const config = window.CARDIOTRACK_CONFIG;
const client = window.supabase?.createClient(
  config?.supabaseUrl,
  config?.supabasePublishableKey,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

const state = {
  session: null,
  patients: [],
  records: [],
  currentRecordId: null,
  deferredInstallPrompt: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const els = {
  loginView: $("#loginView"), app: $("#app"), loginForm: $("#loginForm"),
  email: $("#email"), password: $("#password"), loginError: $("#loginError"), loginBtn: $("#loginBtn"),
  logout: $("#logout"), userName: $("#userName"), loading: $("#loadingDashboard"),
  content: $("#dashboardContent"), alertOverview: $("#alertOverview"), stats: $("#stats"),
  records: $("#records"), emptyRecords: $("#emptyRecords"), search: $("#search"),
  patientCards: $("#patientCards"), modal: $("#modal"), close: $("#close"), newForm: $("#newForm"),
  newPatient: $("#newPatient"), newHr: $("#newHr"), newNoise: $("#newNoise"),
  newError: $("#newError"), processBtn: $("#processBtn"), recordContent: $("#recordContent"),
  toast: $("#toast"), refresh: $("#refresh"), back: $("#back"),
  patientModal: $("#patientModal"), patientForm: $("#patientForm"), closePatient: $("#closePatient"),
  patientCode: $("#patientCode"), patientAge: $("#patientAge"), patientSex: $("#patientSex"),
  patientError: $("#patientError"), patientSubmit: $("#patientSubmit"),
  installModal: $("#installModal"), installTitle: $("#installTitle"), installContent: $("#installContent"),
  closeInstall: $("#closeInstall"), acceptInstall: $("#acceptInstall")
};

const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function errorMessage(error) {
  const message = String(error?.message || error || "Error desconocido");
  if (/invalid login credentials/i.test(message)) return "El correo o la contraseña no son correctos.";
  if (/email not confirmed/i.test(message)) return "La cuenta todavía no ha sido confirmada en Supabase.";
  if (/duplicate key|patients_patient_code_key/i.test(message)) return "Ese código de paciente ya está registrado.";
  if (/patients_patient_code_check/i.test(message)) return "El código debe tener el formato CT-000.";
  if (/failed to fetch|network/i.test(message)) return "No fue posible conectarse con Supabase. Revisa tu conexión a internet.";
  return message;
}

function setError(element, message = "") {
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function notify(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.remove("hidden");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => els.toast.classList.add("hidden"), 3500);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date(value));
}

function patientFor(record) {
  const related = Array.isArray(record.patients) ? record.patients[0] : record.patients;
  return related || state.patients.find(patient => patient.id === record.patient_id) || {};
}

function statusInfo(record) {
  if (record.reviewed) return { label: "Revisada", className: "reviewed" };
  if (record.status === "review") return { label: "Requiere revisión", short: "Revisión", className: "review" };
  if (record.status === "quality") return { label: "Calidad insuficiente", short: "Calidad", className: "quality" };
  return { label: "Sin prioridad", short: "Estable", className: "stable" };
}

function showLogin() {
  els.app.classList.add("hidden");
  els.loginView.classList.remove("hidden");
  els.password.value = "";
}

function showApp() {
  els.loginView.classList.add("hidden");
  els.app.classList.remove("hidden");
}

function showView(viewName) {
  $$(".view").forEach(view => view.classList.toggle("active", view.id === viewName));
  $$('[data-view]').forEach(button => button.classList.toggle("active", button.dataset.view === viewName));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadProfile() {
  const fallback = state.session?.user?.email || "Usuario clínico";
  const { data, error } = await client.from("profiles").select("full_name").eq("user_id", state.session.user.id).maybeSingle();
  els.userName.textContent = error ? fallback : (data?.full_name || fallback);
}

async function loadData({ quiet = false } = {}) {
  if (!quiet) {
    els.loading.classList.remove("hidden");
    els.content.classList.add("hidden");
  }

  const [patientsResult, recordsResult] = await Promise.all([
    client.from("patients").select("id, patient_code, age, sex").eq("active", true).order("patient_code"),
    client.from("ecg_records")
      .select("id, patient_id, recorded_at, heart_rate, signal_quality, complexes_detected, noise_level, status, source, algorithm_version, reviewed, reviewed_at, patients(patient_code, age, sex)")
      .order("recorded_at", { ascending: false })
  ]);

  if (patientsResult.error) throw patientsResult.error;
  if (recordsResult.error) throw recordsResult.error;
  state.patients = patientsResult.data || [];
  state.records = recordsResult.data || [];
  renderAll();
  els.loading.classList.add("hidden");
  els.content.classList.remove("hidden");
}

function renderAll() {
  renderMetrics();
  renderRecords();
  renderPatients();
  els.newPatient.innerHTML = state.patients.map(patient =>
    `<option value="${escapeHtml(patient.id)}">${escapeHtml(patient.patient_code)}</option>`
  ).join("");
}

function renderMetrics() {
  const pending = state.records.filter(record => record.status === "review" && !record.reviewed).length;
  const reviewed = state.records.filter(record => record.reviewed).length;
  const quality = state.records.filter(record => record.status === "quality").length;
  const average = state.records.length
    ? state.records.reduce((sum, record) => sum + Number(record.heart_rate), 0) / state.records.length
    : 0;

  els.alertOverview.innerHTML = `
    <div class="alert-icon" aria-hidden="true">${icon("alert")}</div>
    <div><strong>${pending} ${pending === 1 ? "alerta pendiente" : "alertas pendientes"}</strong>
      <p>Prioriza los registros marcados y documenta su revisión.</p>
      <div class="alert-summary"><span>${reviewed} revisadas</span><span>${pending} pendientes</span></div>
    </div>`;
  els.stats.innerHTML = `
    <article class="stat"><div class="stat-icon">${icon("clipboard")}</div><div class="label">Registros</div><div class="value">${state.records.length}</div></article>
    <article class="stat red"><div class="stat-icon">${icon("alert")}</div><div class="label">Requieren revisión</div><div class="value">${pending}</div></article>
    <article class="stat amber"><div class="stat-icon">${icon("activity")}</div><div class="label">Calidad insuficiente</div><div class="value">${quality}</div></article>
    <article class="stat"><div class="stat-icon">${icon("heart")}</div><div class="label">FC promedio</div><div class="value">${average.toFixed(1)} <small>lpm</small></div></article>`;
}

function renderRecords() {
  const term = els.search.value.trim().toLowerCase();
  const records = state.records.filter(record => {
    const patient = patientFor(record);
    const status = statusInfo(record);
    return `${patient.patient_code || ""} ${status.label} ${record.heart_rate}`.toLowerCase().includes(term);
  });
  els.records.innerHTML = records.map(record => {
    const patient = patientFor(record);
    const status = statusInfo(record);
    return `<tr>
      <td class="patient">${escapeHtml(patient.patient_code || "—")}</td>
      <td>${formatDate(record.recorded_at)}</td>
      <td>${Number(record.heart_rate).toFixed(1)} lpm</td>
      <td>${record.signal_quality}/100</td>
      <td><span class="pill ${status.className}">${escapeHtml(status.short || status.label)}</span></td>
      <td><button class="open" type="button" data-record-id="${record.id}">Abrir registro</button></td>
    </tr>`;
  }).join("");
  els.emptyRecords.classList.toggle("hidden", records.length > 0);
}

function renderPatients() {
  els.patientCards.innerHTML = state.patients.map(patient => {
    const records = state.records.filter(record => record.patient_id === patient.id);
    const pending = records.filter(record => record.status === "review" && !record.reviewed).length;
    const sex = ({ F: "Femenino", M: "Masculino", X: "Otro", ND: "No especificado" })[patient.sex] || "No especificado";
    return `<article class="pcard">
      <div class="patient-title"><span class="patient-avatar">${icon("users")}</span><div class="code">${escapeHtml(patient.patient_code)}</div></div>
      <div class="meta">${patient.age ?? "—"} años · ${sex}</div>
      <div class="count">${records.length} registros · ${pending} pendientes</div>
    </article>`;
  }).join("");
}

function openModal() {
  if (!state.patients.length) return notify("No existen pacientes disponibles.", true);
  setError(els.newError);
  els.modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => els.newPatient.focus(), 50);
}

function closeModal() {
  els.modal.classList.add("hidden");
  document.body.style.overflow = "";
}

function nextPatientCode() {
  const highest = state.patients.reduce((max, patient) => {
    const number = Number(String(patient.patient_code).split("-")[1]);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return `CT-${String(highest + 1).padStart(3, "0")}`;
}

function openPatientModal() {
  setError(els.patientError);
  els.patientCode.value = nextPatientCode();
  els.patientAge.value = "";
  els.patientSex.value = "ND";
  els.patientModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => els.patientAge.focus(), 50);
}

function closePatientModal() {
  els.patientModal.classList.add("hidden");
  document.body.style.overflow = "";
}

async function createPatient(event) {
  event.preventDefault();
  setError(els.patientError);
  const code = els.patientCode.value.trim().toUpperCase();
  if (!/^CT-\d{3}$/.test(code)) return setError(els.patientError, "El código debe tener el formato CT-000.");
  els.patientSubmit.disabled = true;
  els.patientSubmit.innerHTML = `${icon("cloud")} Guardando…`;
  try {
    const { error } = await client.from("patients").insert({
      patient_code: code,
      age: Number(els.patientAge.value),
      sex: els.patientSex.value,
      created_by: state.session.user.id
    });
    if (error) throw error;
    closePatientModal();
    await loadData({ quiet: true });
    showView("patients");
    notify(`Paciente ${code} registrado correctamente en Supabase.`);
  } catch (error) {
    setError(els.patientError, errorMessage(error));
  } finally {
    els.patientSubmit.disabled = false;
    els.patientSubmit.innerHTML = `${icon("user-plus")} Guardar paciente`;
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function showInstallGuide(platform) {
  if (isStandalone()) return notify("CardioTrack ya está instalado en este dispositivo.");
  const ios = platform === "ios";
  els.installTitle.innerHTML = `${icon(ios ? "apple" : "android")} Instalar en ${ios ? "iPhone o iPad" : "Android"}`;
  els.installContent.innerHTML = ios
    ? `<div class="install-guide">
        <div class="install-step"><span class="step-number">1</span><span>Abre CardioTrack en <strong>Safari</strong>.</span></div>
        <div class="install-step"><span class="step-number">2</span><span>Pulsa el botón <strong>Compartir</strong> de Safari.</span></div>
        <div class="install-step"><span class="step-number">3</span><span>Selecciona <strong>Agregar a pantalla de inicio</strong> y después <strong>Agregar</strong>.</span></div>
      </div>`
    : `<div class="install-guide">
        <div class="install-step"><span class="step-number">1</span><span>Abre CardioTrack en <strong>Chrome</strong>.</span></div>
        <div class="install-step"><span class="step-number">2</span><span>Pulsa el menú <strong>⋮</strong> del navegador.</span></div>
        <div class="install-step"><span class="step-number">3</span><span>Selecciona <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla principal</strong>.</span></div>
      </div>`;
  els.installModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeInstallGuide() {
  els.installModal.classList.add("hidden");
  document.body.style.overflow = "";
}

async function createRecord(event) {
  event.preventDefault();
  setError(els.newError);
  const heartRate = Number(els.newHr.value);
  const noise = els.newNoise.value;
  const quality = ({ low: 100, medium: 78, high: 46 })[noise];
  const status = quality < 60 ? "quality" : ((heartRate < 50 || heartRate > 110) ? "review" : "stable");
  els.processBtn.disabled = true;
  els.processBtn.textContent = "Procesando…";
  try {
    const { data, error } = await client.from("ecg_records").insert({
      patient_id: els.newPatient.value,
      heart_rate: Math.round((heartRate + 0.1) * 10) / 10,
      signal_quality: quality,
      complexes_detected: Math.max(1, Math.round(heartRate / 6)),
      noise_level: noise,
      status,
      source: "SYNTHETIC_DEMO",
      algorithm_version: "ct-ecg-0.3.0",
      created_by: state.session.user.id
    }).select("id").single();
    if (error) throw error;
    closeModal();
    await loadData({ quiet: true });
    notify("Registro de demostración guardado en Supabase.");
    openRecord(data.id);
  } catch (error) {
    setError(els.newError, errorMessage(error));
  } finally {
    els.processBtn.disabled = false;
    els.processBtn.innerHTML = `${icon("wave")} Procesar y guardar`;
  }
}

function openRecord(id) {
  const record = state.records.find(item => Number(item.id) === Number(id));
  if (!record) return notify("No se encontró el registro solicitado.", true);
  state.currentRecordId = record.id;
  const patient = patientFor(record);
  const status = statusInfo(record);
  const outOfRange = Number(record.heart_rate) < 50 || Number(record.heart_rate) > 110;
  const interpretation = record.status === "quality"
    ? `La calidad estimada es ${record.signal_quality}/100; se recomienda repetir la adquisición antes de interpretar la señal.`
    : outOfRange
      ? `Frecuencia estimada de ${Number(record.heart_rate).toFixed(1)} lpm fuera del intervalo configurado de 50 a 110 lpm.`
      : `Frecuencia estimada de ${Number(record.heart_rate).toFixed(1)} lpm dentro del intervalo configurado.`;

  els.recordContent.innerHTML = `
    <div class="recordhero">
      <div><div class="eyebrow">Registro ECG ${record.id}</div><h1>${escapeHtml(patient.patient_code || "—")}</h1>
        <p class="sub">${formatDate(record.recorded_at)} · ${escapeHtml(record.source)}</p></div>
      <span class="pill ${status.className}">${escapeHtml(status.label)}</span>
    </div>
    <div class="recordgrid">
      <section class="chartbox"><div class="charttop"><div><h2>${icon("wave")} Señal electrocardiográfica</h2><span class="note">Vista sintética para demostración</span></div><span>250 Hz · 10 s</span></div>
        <div class="canvaswrap"><canvas id="ecgCanvas" aria-label="Representación sintética de una señal electrocardiográfica"></canvas></div>
      </section>
      <aside class="result"><h2>${icon("activity")} Resultado del análisis</h2><dl>
        <div><dt>Frecuencia cardíaca</dt><dd>${Number(record.heart_rate).toFixed(1)} <small>lpm</small></dd></div>
        <div><dt>Calidad estimada</dt><dd>${record.signal_quality}/100</dd></div>
        <div><dt>Complejos detectados</dt><dd>${record.complexes_detected ?? "—"}</dd></div>
        <div><dt>Versión del algoritmo</dt><dd><small>${escapeHtml(record.algorithm_version)}</small></dd></div>
      </dl></aside>
      <section class="interpret"><h2>${icon("clipboard")} Interpretación operativa</h2><p>${escapeHtml(interpretation)}</p>
        <div class="scope"><strong>Alcance:</strong> esta salida prioriza la revisión del registro. No confirma una arritmia ni reemplaza la valoración clínica.</div>
        ${record.reviewed
          ? `<p class="reviewed">✓ Alerta revisada${record.reviewed_at ? ` el ${formatDate(record.reviewed_at)}` : ""}</p>`
          : record.status === "review" ? `<button type="button" class="btn" id="markReviewed">Marcar alerta como revisada</button>` : ""}
      </section>
    </div>`;
  showView("detail");
  requestAnimationFrame(() => drawEcg(record));
  $("#markReviewed")?.addEventListener("click", markReviewed);
}

function drawEcg(record) {
  const canvas = $("#ecgCanvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;
  const baseline = height * 0.58;
  const beats = Math.max(5, Number(record.heart_rate) / 6);
  const period = width / beats;
  const noise = ({ low: 1.4, medium: 3.5, high: 7 })[record.noise_level] || 2;
  ctx.strokeStyle = "#c82e48";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 1.2) {
    const phase = (x % period) / period;
    let y = baseline + Math.sin(x * 0.14) * noise * 0.35 + Math.sin(x * 0.47) * noise * 0.18;
    if (phase > .12 && phase < .20) y -= Math.sin((phase - .12) / .08 * Math.PI) * height * .07;
    if (phase > .27 && phase < .31) y += Math.sin((phase - .27) / .04 * Math.PI) * height * .10;
    if (phase > .31 && phase < .345) y -= Math.sin((phase - .31) / .035 * Math.PI) * height * .48;
    if (phase > .345 && phase < .39) y += Math.sin((phase - .345) / .045 * Math.PI) * height * .16;
    if (phase > .53 && phase < .72) y -= Math.sin((phase - .53) / .19 * Math.PI) * height * .13;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

async function markReviewed() {
  const button = $("#markReviewed");
  button.disabled = true;
  button.textContent = "Guardando…";
  const { error } = await client.from("ecg_records").update({
    reviewed: true,
    reviewed_at: new Date().toISOString(),
    reviewed_by: state.session.user.id
  }).eq("id", state.currentRecordId);
  if (error) {
    notify(errorMessage(error), true);
    button.disabled = false;
    button.textContent = "Marcar alerta como revisada";
    return;
  }
  await loadData({ quiet: true });
  notify("La alerta quedó registrada como revisada.");
  openRecord(state.currentRecordId);
}

async function initializeSession(session) {
  state.session = session;
  showApp();
  await Promise.all([loadProfile(), loadData()]);
}

els.loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  setError(els.loginError);
  els.loginBtn.disabled = true;
  els.loginBtn.textContent = "Ingresando…";
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: els.email.value.trim(), password: els.password.value
    });
    if (error) setError(els.loginError, errorMessage(error));
    else await initializeSession(data.session);
  } catch (error) {
    setError(els.loginError, errorMessage(error));
  } finally {
    els.loginBtn.disabled = false;
    els.loginBtn.textContent = "Iniciar sesión";
  }
});

els.logout.addEventListener("click", async () => {
  await client.auth.signOut();
  state.session = null;
  showLogin();
});

$$('[data-view]').forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
$$('.newrecord').forEach(button => button.addEventListener("click", openModal));
$$('.newpatient').forEach(button => button.addEventListener("click", openPatientModal));
els.close.addEventListener("click", closeModal);
els.modal.addEventListener("click", event => { if (event.target === els.modal) closeModal(); });
els.newForm.addEventListener("submit", createRecord);
els.closePatient.addEventListener("click", closePatientModal);
els.patientModal.addEventListener("click", event => { if (event.target === els.patientModal) closePatientModal(); });
els.patientForm.addEventListener("submit", createPatient);
els.closeInstall.addEventListener("click", closeInstallGuide);
els.acceptInstall.addEventListener("click", closeInstallGuide);
els.installModal.addEventListener("click", event => { if (event.target === els.installModal) closeInstallGuide(); });
els.search.addEventListener("input", renderRecords);
els.records.addEventListener("click", event => {
  const button = event.target.closest("[data-record-id]");
  if (button) openRecord(button.dataset.recordId);
});
els.back.addEventListener("click", () => showView("dashboard"));
els.refresh.addEventListener("click", async () => {
  els.refresh.classList.add("loading");
  try { await loadData({ quiet: true }); notify("Datos actualizados desde Supabase."); }
  catch (error) { notify(errorMessage(error), true); }
  finally { els.refresh.classList.remove("loading"); }
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
});

$$('.install-android').forEach(button => button.addEventListener("click", async () => {
  if (isStandalone()) return notify("CardioTrack ya está instalado en este dispositivo.");
  if (state.deferredInstallPrompt) {
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
  } else {
    showInstallGuide("android");
  }
}));

$$('.install-ios').forEach(button => button.addEventListener("click", () => showInstallGuide("ios")));

window.addEventListener("resize", () => {
  if (state.currentRecordId && $("#detail").classList.contains("active")) {
    const record = state.records.find(item => Number(item.id) === Number(state.currentRecordId));
    if (record) drawEcg(record);
  }
});

async function boot() {
  if (!client) {
    setError(els.loginError, "No fue posible cargar la biblioteca de Supabase.");
    return;
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  const { data, error } = await client.auth.getSession();
  if (error) setError(els.loginError, errorMessage(error));
  if (data?.session) {
    try { await initializeSession(data.session); }
    catch (loadError) { notify(errorMessage(loadError), true); }
  } else showLogin();

  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) showLogin();
  });
}

boot();
