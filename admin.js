const loginView = document.querySelector("#login-view");
const panelView = document.querySelector("#panel-view");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const form = document.querySelector("#song-form");
const formStatus = document.querySelector("#form-status");
const adminList = document.querySelector("#admin-list");
const adminSearch = document.querySelector("#admin-search");
let songs = [];

function status(element, text, type = "") {
  element.textContent = text;
  element.className = `status-message${type ? ` is-${type}` : ""}`;
}

function secondsFromForm() {
  return Math.max(0, Number(document.querySelector("#song-minute").value) || 0) * 60 + Math.max(0, Number(document.querySelector("#song-second").value) || 0);
}

function clearForm() {
  form.reset();
  document.querySelector("#song-id").value = "";
  document.querySelector("#song-minute").value = 0;
  document.querySelector("#song-second").value = 0;
  document.querySelector("#form-title").textContent = "Nueva canción";
  status(formStatus, "");
}

function fillForm(song) {
  document.querySelector("#song-id").value = song.id;
  document.querySelector("#song-number").value = song.numero;
  document.querySelector("#song-order").value = song.orden;
  document.querySelector("#song-title").value = song.titulo;
  document.querySelector("#song-category").value = song.categoria || "";
  document.querySelector("#song-lyrics").value = song.letra;
  document.querySelector("#song-youtube").value = song.youtube || "";
  document.querySelector("#song-minute").value = Math.floor(song.inicio / 60);
  document.querySelector("#song-second").value = song.inicio % 60;
  document.querySelector("#song-featured").checked = song.destacada;
  document.querySelector("#form-title").textContent = `Editar: ${song.titulo}`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderList() {
  const q = adminSearch.value.trim().toLowerCase();
  const filtered = songs.filter(s => `${s.numero} ${s.titulo}`.toLowerCase().includes(q));
  document.querySelector("#admin-count").textContent = `${filtered.length} de ${songs.length} canciones`;
  adminList.replaceChildren(...filtered.map(song => {
    const item = document.createElement("article"); item.className = "admin-song";
    const number = document.createElement("span"); number.className = "admin-song__number"; number.textContent = song.numero;
    const text = document.createElement("div");
    const title = document.createElement("h4"); title.className = "admin-song__title"; title.textContent = song.titulo;
    const meta = document.createElement("p"); meta.className = "admin-song__meta"; meta.textContent = `${song.categoria || "Sin categoría"} · inicio ${song.inicio}s${song.destacada ? " · fija" : ""}`;
    text.append(title, meta);
    const actions = document.createElement("div"); actions.className = "admin-song__actions";
    const edit = document.createElement("button"); edit.className = "icon-button"; edit.type = "button"; edit.textContent = "Editar"; edit.onclick = () => fillForm(song);
    const del = document.createElement("button"); del.className = "icon-button"; del.type = "button"; del.textContent = "Eliminar";
    del.onclick = async () => {
      if (!confirm(`¿Eliminar “${song.titulo}”? Esta acción no se puede deshacer.`)) return;
      try { await CancioneroDB.deleteSong(song.id); await loadSongs(); } catch (e) { alert(e.message); }
    };
    actions.append(edit, del); item.append(number, text, actions); return item;
  }));
}

async function loadSongs() { songs = await CancioneroDB.listSongs(); renderList(); }

async function showCorrectView() {
  if (!CancioneroDB.configured) {
    loginView.hidden = false; panelView.hidden = true;
    status(loginStatus, "Configura Supabase en config.js antes de iniciar sesión.", "error"); return;
  }
  const session = await CancioneroDB.getSession();
  loginView.hidden = Boolean(session); panelView.hidden = !session;
  if (session) { document.querySelector("#admin-user").textContent = session.user.email; await loadSongs(); }
}

loginForm.addEventListener("submit", async e => {
  e.preventDefault(); status(loginStatus, "Ingresando…");
  try { await CancioneroDB.signIn(document.querySelector("#login-email").value, document.querySelector("#login-password").value); await showCorrectView(); }
  catch (error) { status(loginStatus, error.message, "error"); }
});

document.querySelector("#logout").addEventListener("click", async () => { await CancioneroDB.signOut(); location.reload(); });
document.querySelector("#cancel-edit").addEventListener("click", clearForm);
adminSearch.addEventListener("input", renderList);

form.addEventListener("submit", async e => {
  e.preventDefault(); status(formStatus, "Guardando…");
  const song = {
    id: document.querySelector("#song-id").value || null,
    numero: document.querySelector("#song-number").value,
    orden: document.querySelector("#song-order").value,
    titulo: document.querySelector("#song-title").value,
    categoria: document.querySelector("#song-category").value,
    letra: document.querySelector("#song-lyrics").value,
    youtube: document.querySelector("#song-youtube").value,
    inicio: secondsFromForm(),
    destacada: document.querySelector("#song-featured").checked
  };
  try { await CancioneroDB.saveSong(song); status(formStatus, "Canción guardada correctamente.", "success"); clearForm(); await loadSongs(); }
  catch (error) { status(formStatus, error.message, "error"); }
});

showCorrectView().catch(error => status(loginStatus, error.message, "error"));

const importInitialButton = document.querySelector("#import-initial");
if (importInitialButton) {
  importInitialButton.addEventListener("click", async () => {
    if (!confirm("Esto importará las canciones iniciales a Supabase. Úsalo solo la primera vez. ¿Continuar?")) return;
    importInitialButton.disabled = true;
    importInitialButton.textContent = "Importando…";
    try {
      const total = await CancioneroDB.importInitialSongs();
      alert(`${total} canciones importadas correctamente.`);
      await loadSongs();
    } catch (error) {
      alert(error.message);
    } finally {
      importInitialButton.disabled = false;
      importInitialButton.textContent = "Importar canciones iniciales";
    }
  });
}
