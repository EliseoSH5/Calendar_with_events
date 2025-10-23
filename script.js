// =========================
// Responsive Calendar - script.js (Firestore público, sin login)
// =========================

// ---------- Selectores base ----------
const daysContainer     = document.querySelector(".days");
const dateLabel         = document.querySelector(".date");
const prevBtn           = document.querySelector(".prev");
const nextBtn           = document.querySelector(".next");
const todayBtn          = document.querySelector(".today-btn");
const gotoBtn           = document.querySelector(".goto-btn");
const dateInput         = document.querySelector(".date-input");
const eventsContainer   = document.querySelector(".events");
const addEventBtn       = document.querySelector(".add-event");
const addEventWrapper   = document.querySelector(".add-event-wrapper");
const addEventCloseBtn  = document.querySelector(".close");
const addEventTitle     = document.querySelector(".event-name");
const addEventFrom      = document.querySelector(".event-time-from");
const addEventSubmit    = document.querySelector(".add-event-btn");
const calendarBodyEl    = document.querySelector(".calendar");
const addEventHeaderH3  = document.querySelector("#addEventTitle");

// ---------- Metadatos ----------
const addEventLocation  = document.querySelector(".event-location");
const addEventCompany   = document.querySelector(".event-company");
const addEventStaff     = document.querySelector(".event-staff");
const addEventWell      = document.querySelector(".event-well");
const addEventTool      = document.querySelector(".event-tool");
const addEventUrgency   = document.querySelector(".event-urgency");
const addEventStatus    = document.querySelector(".event-status");
const addEventNotes     = document.querySelector(".event-notes");

// ---------- i18n ----------
const monthsES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];
const weekdaysShortES = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

// ---------- Estado calendario ----------
let today = new Date();
let month = today.getMonth();
let year  = today.getFullYear();
let activeDay = today.getDate();

// ---------- Estado edición ----------
let isEditing = false;
let editRef = null; // { id, originalTitle, originalFrom }

// Suscripción Firestore del día activo
let liveUnsub = null;

// ---------- Utilidades ----------
function hmToMinutes(hhmm) {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm)) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
}
function minutesTo12h(mins) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const suf = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,"0")} ${suf}`;
}
function pad2(n){ return String(n).padStart(2,"0"); }
function toHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}
function normalizeUrgency(u) {
  if (!u) return "";
  const s = String(u).trim().toLowerCase();
  if (["Alta","roja","red"].includes(s)) return "Alta";
  if (["Media","amarilla","yellow"].includes(s)) return "Media";
  if (["Baja","verde","low"].includes(s)) return "Baja";
  return s;
}

// ---------- Calendario ----------
function getFirstDayOfMonth(y, m) { return new Date(y, m, 1).getDay(); }
function getDaysInMonth(y, m)     { return new Date(y, m + 1, 0).getDate(); }
function isToday(y, m, d) {
  const t = new Date();
  return y === t.getFullYear() && m === t.getMonth() && d === t.getDate();
}

// --- Render del grid de días
function initCalendar() {
  daysContainer.innerHTML = "";

  const firstDay = getFirstDayOfMonth(year, month);
  const totalDays = getDaysInMonth(year, month);
  const prevTotalDays = getDaysInMonth(year, (month - 1 + 12) % 12);

  if (dateLabel) dateLabel.textContent = `${monthsES[month]} ${year}`;

  const weekdaysRow = document.querySelector(".weekdays");
  if (weekdaysRow && weekdaysRow.childElementCount === 0) {
    weekdaysShortES.forEach((w) => {
      const el = document.createElement("div");
      el.textContent = w;
      weekdaysRow.appendChild(el);
    });
  }

  for (let i = firstDay; i > 0; i--) {
    const cell = document.createElement("div");
    cell.className = "day prev-date";
    cell.setAttribute("aria-disabled", "true");
    cell.textContent = String(prevTotalDays - i + 1);
    daysContainer.appendChild(cell);
  }

  for (let d = 1; d <= totalDays; d++) {
    const cell = document.createElement("div");
    cell.className = "day";
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-label", `${d} de ${monthsES[month]} de ${year}`);

    const span = document.createElement("span");
    span.textContent = String(d);
    cell.appendChild(span);

    if (isToday(year, month, d)) cell.classList.add("today");
    if (d === activeDay) cell.classList.add("active");

    cell.addEventListener("click", () => setActiveDay(d));
    cell.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setActiveDay(d); }
    });

    daysContainer.appendChild(cell);
  }

  const cells = daysContainer.childElementCount;
  const toFill = (cells % 7 === 0) ? 0 : (7 - (cells % 7));
  for (let i = 1; i <= toFill; i++) {
    const cell = document.createElement("div");
    cell.className = "day next-date";
    cell.setAttribute("aria-disabled", "true");
    cell.textContent = String(i);
    daysContainer.appendChild(cell);
  }

  // Cargar eventos del día activo (suscripción)
  updateEvents(activeDay);
}

// --- Cambiar día activo
function setActiveDay(d) {
  activeDay = d;
  document.querySelectorAll(".day").forEach((el) => el.classList.remove("active"));
  const nodes = [...document.querySelectorAll(".day")].filter((el) => {
    if (el.classList.contains("prev-date") || el.classList.contains("next-date")) return false;
    return Number(el.textContent.trim()) === d;
  });
  if (nodes[0]) nodes[0].classList.add("active");
  updateEvents(d);
}

// ---------- Render listado ----------
function renderMetaItem(label, value) {
  const row = document.createElement("div");
  row.className = "event-meta-row";
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  const span = document.createElement("span");
  span.textContent = value || "—";
  row.appendChild(strong);
  row.appendChild(span);
  return row;
}

function renderEventsList(events) {
  eventsContainer.innerHTML = "";

  // Marcar el día con clase .event si hay algo
  const activeEl = document.querySelector(".day.active");
  if (activeEl) {
    activeEl.classList.toggle("event", events.length > 0);
  }

  if (!events.length) {
    const noEv = document.createElement("div");
    noEv.className = "no-event";
    const h3 = document.createElement("h3");
    h3.textContent = "Sin eventos";
    noEv.appendChild(h3);
    eventsContainer.appendChild(noEv);
    return;
  }

  events.sort((a, b) => a.from - b.from);

  events.forEach((ev) => {
    const card = document.createElement("div");
    card.className = "event";
    if (ev.status)  card.dataset.status  = ev.status;
    if (ev.urgency) card.dataset.urgency = ev.urgency;

    // Cabecera (título + hora)
    const left = document.createElement("div");
    left.className = "title";
    const dot = document.createElement("i");
    dot.className = "fas fa-circle";
    const h3 = document.createElement("h3");
    h3.className = "event-title";
    h3.textContent = ev.title;
    left.appendChild(dot);
    left.appendChild(h3);

    const right = document.createElement("div");
    right.className = "event-time";
    const span = document.createElement("span");
    span.className = "event-time";
    span.textContent = `Inicio: ${minutesTo12h(ev.from)}`;
    right.appendChild(span);

    // Acciones
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "10px";

    // Detalles (toggle)
    const detailsBtn = document.createElement("button");
    detailsBtn.className = "event-details-btn";
    detailsBtn.setAttribute("aria-expanded", "false");
    detailsBtn.textContent = "Detalles";

    const details = document.createElement("div");
    details.className = "event-details";
    details.style.display = "none";

    details.appendChild(renderMetaItem("Ubicación", ev.location));
    details.appendChild(renderMetaItem("Compañía", ev.company));
    details.appendChild(renderMetaItem("Personal asignado", ev.staff));
    details.appendChild(renderMetaItem("Pozo", ev.well));
    details.appendChild(renderMetaItem("Herramienta", ev.tool));
    details.appendChild(renderMetaItem("Urgencia", ev.urgency));
    details.appendChild(renderMetaItem("Estado", ev.status));
    if (ev.notes && String(ev.notes).trim()) {
      const notesBlock = document.createElement("div");
      notesBlock.className = "event-notes-block";
      const notesLabel = document.createElement("strong");
      notesLabel.textContent = "Notas: ";
      const notesText = document.createElement("p");
      notesText.textContent = ev.notes;
      notesBlock.appendChild(notesLabel);
      notesBlock.appendChild(notesText);
      details.appendChild(notesBlock);
    }

    detailsBtn.addEventListener("click", () => {
      const isOpen = details.style.display !== "none";
      details.style.display = isOpen ? "none" : "block";
      detailsBtn.setAttribute("aria-expanded", String(!isOpen));
      detailsBtn.textContent = isOpen ? "Detalles" : "Ocultar";
    });

    // Editar
    const editBtn = document.createElement("button");
    editBtn.className = "event-details-btn";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditEvent(ev);
    });

    // Eliminar
    const delBtn = document.createElement("button");
    delBtn.className = "event-delete-btn";
    delBtn.setAttribute("aria-label", "Eliminar evento");
    delBtn.textContent = "Eliminar";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmAndDelete(ev);
    });

    actions.appendChild(detailsBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(left);
    card.appendChild(right);
    card.appendChild(actions);
    card.appendChild(details);

    eventsContainer.appendChild(card);
  });
}

// ---------- Firestore: cargar / suscribir ----------
async function updateEvents(dayNumber) {
  eventsContainer.innerHTML = "";

  // Cancelar suscripción anterior
  if (liveUnsub) { try { liveUnsub(); } catch {} liveUnsub = null; }

  // Suscribirse al día activo
  liveUnsub = window.$eventsAPI.watchDay(year, month + 1, dayNumber, (events) => {
    // Normaliza urgencia de lo que venga (por si hay documentos viejos)
    events.forEach(e => e.urgency = normalizeUrgency(e.urgency));
    renderEventsList(events);
  });
}

// ---------- Crear / Editar / Borrar ----------
function clearModalFields() {
  if (addEventTitle) addEventTitle.value = "";
  if (addEventFrom)  addEventFrom.value  = "";
  if (addEventLocation) addEventLocation.value = "";
  if (addEventCompany)  addEventCompany.value  = "";
  if (addEventStaff)    addEventStaff.value    = "";
  if (addEventWell)     addEventWell.value     = "";
  if (addEventTool)     addEventTool.value     = "";
  if (addEventUrgency)  addEventUrgency.value  = "";
  if (addEventStatus)   addEventStatus.value   = "";
  if (addEventNotes)    addEventNotes.value    = "";
}

function resetModalMode() {
  isEditing = false;
  editRef = null;
  if (addEventHeaderH3) addEventHeaderH3.textContent = "Agregar evento";
  if (addEventSubmit) addEventSubmit.textContent = "Guardar evento";
}

async function addOrUpdateEvent() {
  const title = (addEventTitle?.value || "").trim();
  const fromStr  = (addEventFrom?.value || "").trim();
  if (!title || !fromStr) { alert("Completa Título y Hora de inicio"); return; }

  const fromM = hmToMinutes(fromStr);
  if (isNaN(fromM)) { alert("Hora inválida (usa formato 24h HH:MM)"); return; }

  const newData = {
    y: year, m: month + 1, d: activeDay,
    title,
    from: fromM,
    location: (addEventLocation?.value || "").trim(),
    company : (addEventCompany?.value  || "").trim(),
    staff   : (addEventStaff?.value    || "").trim(),
    well    : (addEventWell?.value     || "").trim(),
    tool    : (addEventTool?.value     || "").trim(),
    urgency : normalizeUrgency((addEventUrgency?.value  || "").trim()),
    status  : (addEventStatus?.value   || "").trim(),
    notes   : (addEventNotes?.value    || "").trim(),
  };

  try {
    if (!isEditing) {
      await window.$eventsAPI.createEvent(newData);
    } else {
      await window.$eventsAPI.updateEvent(editRef.id, newData);
    }
    closeAddEventModal();
    clearModalFields();
    resetModalMode();
  } catch (e) {
    console.error(e);
    alert("No se pudo guardar el evento.");
  }
}

function openEditEvent(ev) {
  isEditing = true;
  editRef = { id: ev.id, originalTitle: ev.title, originalFrom: ev.from };
  if (addEventHeaderH3) addEventHeaderH3.textContent = "Editar evento";
  if (addEventSubmit) addEventSubmit.textContent = "Guardar cambios";

  if (addEventTitle) addEventTitle.value = ev.title || "";
  if (addEventFrom)  addEventFrom.value  = toHHMM(ev.from || 0);

  if (addEventLocation) addEventLocation.value = ev.location || "";
  if (addEventCompany)  addEventCompany.value  = ev.company  || "";
  if (addEventStaff)    addEventStaff.value    = ev.staff    || "";
  if (addEventWell)     addEventWell.value     = ev.well     || "";
  if (addEventTool)     addEventTool.value     = ev.tool     || "";
  if (addEventUrgency)  addEventUrgency.value  = ev.urgency  || "";
  if (addEventStatus)   addEventStatus.value   = ev.status   || "";
  if (addEventNotes)    addEventNotes.value    = ev.notes    || "";

  openAddEventModal();
}

async function deleteEventById(id) {
  try {
    await window.$eventsAPI.removeEvent(id);
  } catch (e) {
    console.error(e);
    alert("No se pudo eliminar el evento.");
  }
}

function confirmAndDelete(ev) {
  const fecha = `${pad2(activeDay)}/${pad2(month + 1)}/${year}`;
  const hora  = minutesTo12h(ev.from);
  const msg = `¿Eliminar el evento:\n\n“${ev.title}”\n${fecha} · ${hora}\n\nEsta acción no se puede deshacer.`;
  if (confirm(msg)) deleteEventById(ev.id);
}

// ---------- Modal + accesibilidad ----------
let modalPreviousFocus = null;
function openAddEventModal() {
  modalPreviousFocus = document.activeElement;
  addEventWrapper?.classList.add("active");
  addEventTitle?.focus();
  trapFocus(addEventWrapper);
}
function closeAddEventModal() {
  addEventWrapper?.classList.remove("active");
  if (isEditing) resetModalMode();
  if (modalPreviousFocus && typeof modalPreviousFocus.focus === "function") modalPreviousFocus.focus();
  else calendarBodyEl?.focus?.();
}
function trapFocus(modalEl) {
  if (!modalEl) return;
  const selectors = [
    "a[href]", "button:not([disabled])", "textarea:not([disabled])",
    "input:not([disabled])", "select:not([disabled])", "[tabindex]:not([tabindex='-1'])"
  ];
  const focusables = modalEl.querySelectorAll(selectors.join(","));
  if (!focusables.length) return;
  const first = focusables[0];
  const last  = focusables[focusables.length - 1];

  function handle(e) {
    if (e.key !== "Tab") return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  modalEl.addEventListener("keydown", handle);
  const observer = new MutationObserver(() => {
    if (!modalEl.classList.contains("active")) {
      modalEl.removeEventListener("keydown", handle);
      observer.disconnect();
    }
  });
  observer.observe(modalEl, { attributes: true, attributeFilter: ["class"] });
}

function makeKeyboardClickable(el, ariaLabel) {
  if (!el) return;
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  if (ariaLabel) el.setAttribute("aria-label", ariaLabel);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
  });
}

// ---------- Navegación calendario ----------
function prevMonth() {
  month--;
  if (month < 0) { month = 11; year--; }
  const dim = getDaysInMonth(year, month);
  if (activeDay > dim) activeDay = dim;
  if (liveUnsub) { try{ liveUnsub(); }catch{} liveUnsub = null; }
  initCalendar();
}
function nextMonth() {
  month++;
  if (month > 11) { month = 0; year++; }
  const dim = getDaysInMonth(year, month);
  if (activeDay > dim) activeDay = dim;
  if (liveUnsub) { try{ liveUnsub(); }catch{} liveUnsub = null; }
  initCalendar();
}
function gotoDate() {
  const raw = (dateInput?.value || "").trim();
  const parts = raw.split("/");
  if (parts.length !== 2) { alert("Fecha inválida. Usa mm/yyyy"); return; }
  const mm = parseInt(parts[0], 10);
  const yyyy = parseInt(parts[1], 10);
  if (!(mm >= 1 && mm <= 12) || String(yyyy).length !== 4) { alert("Fecha inválida. Usa mm/yyyy"); return; }
  month = mm - 1;
  year = yyyy;
  const dim = getDaysInMonth(year, month);
  if (activeDay > dim) activeDay = dim;
  if (liveUnsub) { try{ liveUnsub(); }catch{} liveUnsub = null; }
  initCalendar();
}
function goToday() {
  const t = new Date();
  month = t.getMonth();
  year = t.getFullYear();
  activeDay = t.getDate();
  if (liveUnsub) { try{ liveUnsub(); }catch{} liveUnsub = null; }
  initCalendar();
}

// ---------- Listeners ----------
prevBtn?.addEventListener("click", prevMonth);
nextBtn?.addEventListener("click", nextMonth);
todayBtn?.addEventListener("click", goToday);
gotoBtn?.addEventListener("click", gotoDate);

addEventBtn?.addEventListener("click", () => {
  resetModalMode();
  clearModalFields();
  openAddEventModal();
});
addEventCloseBtn?.addEventListener("click", closeAddEventModal);
addEventWrapper?.addEventListener("click", (e) => { if (e.target === addEventWrapper) closeAddEventModal(); });

dateInput?.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^\d/]/g, "");
  const v = e.target.value;
  if (v.length === 2 && !v.includes("/")) e.target.value = v + "/";
});

addEventSubmit?.addEventListener("click", addOrUpdateEvent);

makeKeyboardClickable(prevBtn, "Mes anterior");
makeKeyboardClickable(nextBtn, "Mes siguiente");
makeKeyboardClickable(todayBtn, "Ir a hoy");
makeKeyboardClickable(gotoBtn, "Ir a fecha");

// ---------- Init ----------
initCalendar();
