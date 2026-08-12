const $ = (q) => document.querySelector(q);

let songs = [];
let chordCatalog = [];
let currentFinger = 1;
let currentMode = "dedo";
let currentFingering = [];
let currentBarres = [];
let adminFretCount = 8;
let currentChordAudioUrl = "";
let removeChordAudio = false;

function setStatus(el, text, type = "") {
  el.textContent = text;
  el.className = `status-message${type ? ` is-${type}` : ""}`;
}

function safeFileName(value){
  return String(value||"audio").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").toLowerCase();
}

async function uploadInstrumentAudio(file,folder,key){
  if(!file) return "";
  const ext=(file.name.split(".").pop()||"mp3").toLowerCase();
  const path=`${folder}/${safeFileName(key)}-${Date.now()}.${ext}`;
  const {error}=await window.CancioneroDB.client.storage
    .from("instrumentos-audio").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type||undefined});
  if(error) throw error;
  const {data}=window.CancioneroDB.client.storage.from("instrumentos-audio").getPublicUrl(path);
  return data.publicUrl;
}

function renderChordAudio(){
  const preview=$("#chordAudioPreview"),remove=$("#removeChordAudioBtn");
  if(currentChordAudioUrl && !removeChordAudio){
    preview.src=currentChordAudioUrl; preview.hidden=false; remove.hidden=false;
  }else{
    preview.removeAttribute("src"); preview.hidden=true; remove.hidden=true;
  }
}
$("#removeChordAudioBtn")?.addEventListener("click",()=>{
  currentChordAudioUrl="";removeChordAudio=true;$("#chordAudioFile").value="";renderChordAudio();
});
function parseSequence(value) {
  const raw=String(value || "").trim();
  if(!raw) return [];
  if(raw.startsWith("#")) return [raw];
  return raw.split(/[\s,\-–—>→]+/).map(x => x.trim()).filter(Boolean);
}
function joinSequence(arr) {
  return Array.isArray(arr) ? arr.join(" - ") : "";
}

async function ensureAdmin() {
  if (!window.CancioneroDB?.configured) {
    $("#loginView").hidden = false;
    $("#adminView").hidden = true;
    setStatus($("#loginStatus"), "Configura Supabase antes de entrar.", "error");
    return;
  }
  const session = await window.CancioneroDB.getSession();
  $("#loginView").hidden = Boolean(session);
  $("#adminView").hidden = !session;
  if (session) {
    $("#adminUser").textContent = session.user.email;
    await initAdmin();
  }
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus($("#loginStatus"), "Ingresando…");
  try {
    await window.CancioneroDB.signIn($("#loginEmail").value, $("#loginPassword").value);
    await ensureAdmin();
  } catch (error) {
    setStatus($("#loginStatus"), error.message, "error");
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await window.CancioneroDB.signOut();
  location.reload();
});

async function loadSongs() {
  songs = await window.CancioneroDB.listSongs();
  const select = $("#songSelect");
  select.replaceChildren();
  songs.forEach(song => {
    const opt = document.createElement("option");
    opt.value = song.id;
    opt.textContent = `${song.numero ? song.numero + " · " : ""}${song.titulo}`;
    select.append(opt);
  });
}

async function getSongRecord(songId) {
  const { data, error } = await window.CancioneroDB.client
    .from("charango_canciones").select("*").eq("cancion_id", songId).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadSongRecord() {
  const songId = $("#songSelect").value;
  if (!songId) return;
  try {
    const data = await getSongRecord(songId);
    $("#songKey").value = data?.tonalidad || "";
    $("#songStrum").value = data?.rasgueo || "";
    $("#songPublished").checked = Boolean(data?.publicado);
    const s = data?.secciones || {};
    $("#secIntro").value = joinSequence(s.intro);
    $("#secVerso").value = joinSequence(s.verso);
    $("#secCoro").value = joinSequence(s.coro);
    $("#secPuente").value = joinSequence(s.puente);
    $("#secFinal").value = joinSequence(s.final);
    setStatus($("#songSaveStatus"), data ? "Ficha cargada." : "Esta canción todavía no tiene ficha.");
  } catch (error) {
    setStatus($("#songSaveStatus"), error.message, "error");
  }
}

$("#songSelect").addEventListener("change", loadSongRecord);

$("#saveSongRecord").addEventListener("click", async () => {
  const songId = $("#songSelect").value;
  if (!songId) return;
  const payload = {
    cancion_id: songId,
    tonalidad: $("#songKey").value.trim(),
    rasgueo: $("#songStrum").value.trim(),
    publicado: $("#songPublished").checked,
    secciones: {
      intro: parseSequence($("#secIntro").value),
      verso: parseSequence($("#secVerso").value),
      coro: parseSequence($("#secCoro").value),
      puente: parseSequence($("#secPuente").value),
      final: parseSequence($("#secFinal").value)
    },
    updated_at: new Date().toISOString()
  };
  setStatus($("#songSaveStatus"), "Guardando…");
  const { error } = await window.CancioneroDB.client.from("charango_canciones")
    .upsert(payload, { onConflict: "cancion_id" });
  if (error) setStatus($("#songSaveStatus"), error.message, "error");
  else setStatus($("#songSaveStatus"), "Ficha guardada correctamente.", "success");
});

async function loadChordCatalog() {
  const { data, error } = await window.CancioneroDB.client.from("charango_acordes").select("*").order("nombre");
  if (error) throw error;
  chordCatalog = data || [];
  renderChordList();
}

function renderChordList() {
  const q = $("#chordSearch").value.trim().toLowerCase();
  const list = $("#chordAdminList");
  list.replaceChildren();
  chordCatalog
    .filter(c => `${c.nombre} ${c.nombre_completo || ""}`.toLowerCase().includes(q))
    .forEach(chord => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chord-admin-item";
      const barreText = Array.isArray(chord.cejillas) && chord.cejillas.length ? ` · ${chord.cejillas.length} cejilla(s)` : "";
      btn.innerHTML = `<strong>${chord.nombre}</strong><span>${chord.nombre_completo || "Sin descripción"}${barreText}${chord.publicado ? " · publicado" : ""}</span>`;
      btn.addEventListener("click", () => fillChord(chord));
      list.append(btn);
    });
}
$("#chordSearch").addEventListener("input", renderChordList);

function clearChordEditor() {
  $("#chordId").value = "";
  $("#chordName").value = "";
  $("#chordFullName").value = "";
  $("#chordNotes").value = "";
  $("#chordPublished").checked = false;
  $("#deleteChordBtn").hidden = true;
  currentChordAudioUrl="";
  removeChordAudio=false;
  $("#chordAudioFile").value="";
  renderChordAudio();
  currentFingering = [];
  currentBarres = [];
  document.querySelectorAll(".open-string-check,.muted-string-check").forEach(x => x.checked = false);
  populateBarreFrets();
  renderAdminNeck();
  renderBarreList();
  setStatus($("#chordSaveStatus"), "");
}

$("#newChordBtn").addEventListener("click", clearChordEditor);
$("#clearChordBtn").addEventListener("click", clearChordEditor);

function fillChord(chord) {
  $("#chordId").value = chord.id;
  $("#chordName").value = chord.nombre || "";
  $("#chordFullName").value = chord.nombre_completo || "";
  $("#chordNotes").value = Array.isArray(chord.notas) ? chord.notas.join(", ") : "";
  $("#chordPublished").checked = Boolean(chord.publicado);
  $("#deleteChordBtn").hidden = false;
  currentChordAudioUrl=chord.audio_url||"";
  removeChordAudio=false;
  $("#chordAudioFile").value="";
  renderChordAudio();

  currentFingering = Array.isArray(chord.digitacion)
    ? chord.digitacion.map(x => ({ orden:Number(x.orden), traste:Number(x.traste), dedo:Number(x.dedo) }))
    : [];
  currentBarres = Array.isArray(chord.cejillas)
    ? chord.cejillas.map(x => ({ dedo:Number(x.dedo), traste:Number(x.traste), desde:Number(x.desde), hasta:Number(x.hasta) }))
    : [];

  const open = Array.isArray(chord.abiertas) ? chord.abiertas.map(Number) : [];
  const muted = Array.isArray(chord.apagadas) ? chord.apagadas.map(Number) : [];
  document.querySelectorAll(".open-string-check").forEach(x => x.checked = open.includes(Number(x.value)));
  document.querySelectorAll(".muted-string-check").forEach(x => x.checked = muted.includes(Number(x.value)));
  adminFretCount=Math.max(8,...currentFingering.map(x=>x.traste+1),...currentBarres.map(x=>x.traste+1));
  $("#fretCount").value=adminFretCount; populateBarreFrets();
  renderAdminNeck();
  renderBarreList();
}

document.querySelectorAll(".finger-select").forEach(btn => {
  btn.addEventListener("click", () => {
    currentFinger = Number(btn.dataset.finger);
    document.querySelectorAll(".finger-select").forEach(x => x.classList.toggle("active", x === btn));
    $("#barreFinger").value = String(currentFinger);
  });
});

document.querySelectorAll(".mode-select").forEach(btn => {
  btn.addEventListener("click", () => {
    currentMode = btn.dataset.mode;
    document.querySelectorAll(".mode-select").forEach(x => x.classList.toggle("active", x === btn));
    $("#barreEditor").hidden = currentMode !== "cejilla";
  });
});

function xForOrder(order) { return ((Number(order)-1)/4)*100; }
function yForFret(fret) { return ((Number(fret)-.5)/adminFretCount)*100; }

function renderAdminNeck() {
  const host = $("#adminNeck");
  host.replaceChildren();

  const neck = document.createElement("div");
  neck.className = "admin-neck-inner";

  const nut = document.createElement("span");
  nut.className = "fretboard-nut";
  neck.append(nut);

  for (let fret=1; fret<=adminFretCount; fret++) {
    const line=document.createElement("span");
    line.className="fret-line";
    line.style.top=`${(fret/adminFretCount)*100}%`;
    neck.append(line);
  }

  for (let order=1; order<=5; order++) {
    const line=document.createElement("span");
    line.className="string-line";
    line.style.left=`${xForOrder(order)}%`;
    neck.append(line);

    const open=document.createElement("span");
    open.className="open-marker";
    open.style.left=`${xForOrder(order)}%`;
    neck.append(open);
  }

  currentBarres.forEach(b=>{
    const min=Math.min(b.desde,b.hasta);
    const max=Math.max(b.desde,b.hasta);
    const bar=document.createElement("span");
    bar.className="barre";
    bar.style.top=`${yForFret(b.traste)}%`;
    bar.style.left=`${xForOrder(min)}%`;
    bar.style.width=`${xForOrder(max)-xForOrder(min)}%`;
    const n=document.createElement("span");
    n.className="barre-number";
    n.textContent=b.dedo;
    bar.append(n);
    neck.append(bar);
  });

  for (let order=1; order<=5; order++) {
    for (let fret=1; fret<=adminFretCount; fret++) {
      const hit=document.createElement("button");
      hit.type="button";
      hit.className="admin-hit";
      hit.style.left=`${xForOrder(order)}%`;
      hit.style.top=`${((fret-1)/adminFretCount)*100}%`;
      hit.style.height=`${100/adminFretCount}%`;
      const found=currentFingering.find(x=>x.orden===order && x.traste===fret);
      if(found){
        hit.classList.add("is-selected");
        hit.dataset.finger=found.dedo;
      }
      hit.addEventListener("click",()=>{
        if(currentMode!=="dedo") return;
        const idx=currentFingering.findIndex(x=>x.orden===order && x.traste===fret);
        if(idx>=0){
          currentFingering.splice(idx,1);
        }else{
          currentFingering=currentFingering.filter(x=>x.orden!==order);
          currentFingering.push({orden:order,traste:fret,dedo:currentFinger});
        }
        renderAdminNeck();
      });
      neck.append(hit);
    }
  }

  host.append(neck);
}

$("#addBarreBtn").addEventListener("click",()=>{
  const traste=Number($("#barreFret").value);
  const desde=Number($("#barreFrom").value);
  const hasta=Number($("#barreTo").value);
  const dedo=Number($("#barreFinger").value);

  if(desde===hasta){
    setStatus($("#chordSaveStatus"),"Una cejilla debe abarcar al menos 2 órdenes.","error");
    return;
  }

  currentBarres.push({traste,desde,hasta,dedo});
  renderBarreList();
  renderAdminNeck();
});

function renderBarreList(){
  const list=$("#barreList");
  list.replaceChildren();

  if(!currentBarres.length){
    const p=document.createElement("span");
    p.textContent="Sin cejillas registradas.";
    p.className="admin-help";
    list.append(p);
    return;
  }

  currentBarres.forEach((b,index)=>{
    const row=document.createElement("div");
    row.className="barre-item";
    row.innerHTML=`<span>Dedo ${b.dedo} · traste ${b.traste} · órdenes ${b.desde}–${b.hasta}</span>`;
    const del=document.createElement("button");
    del.type="button";
    del.className="ghost danger";
    del.textContent="Quitar";
    del.addEventListener("click",()=>{
      currentBarres.splice(index,1);
      renderBarreList();
      renderAdminNeck();
    });
    row.append(del);
    list.append(row);
  });
}

$("#saveChordBtn").addEventListener("click", async () => {
  const name = $("#chordName").value.trim();
  if (!name) {
    setStatus($("#chordSaveStatus"), "Escribe el nombre del acorde.", "error");
    return;
  }

  let audioUrl=currentChordAudioUrl;
  const audioFile=$("#chordAudioFile").files?.[0];
  try{
    if(audioFile) audioUrl=await uploadInstrumentAudio(audioFile,"charango",name);
    if(removeChordAudio) audioUrl="";
  }catch(error){
    setStatus($("#chordSaveStatus"),`No se pudo cargar el audio: ${error.message}`,"error");
    return;
  }

  const payload = {
    nombre: name,
    nombre_completo: $("#chordFullName").value.trim(),
    notas: $("#chordNotes").value.split(",").map(x => x.trim()).filter(Boolean),
    digitacion: currentFingering,
    cejillas: currentBarres,
    abiertas: [...document.querySelectorAll(".open-string-check:checked")].map(x => Number(x.value)),
    apagadas: [...document.querySelectorAll(".muted-string-check:checked")].map(x => Number(x.value)),
    audio_url: audioUrl,
    publicado: $("#chordPublished").checked,
    updated_at: new Date().toISOString()
  };

  const id = $("#chordId").value;
  setStatus($("#chordSaveStatus"), "Guardando…");
  let query;
  if (id) query = window.CancioneroDB.client.from("charango_acordes").update(payload).eq("id", id);
  else query = window.CancioneroDB.client.from("charango_acordes").insert(payload);

  const { error } = await query;
  if (error) {
    setStatus($("#chordSaveStatus"), error.message, "error");
    return;
  }

  currentChordAudioUrl=audioUrl;removeChordAudio=false;$("#chordAudioFile").value="";renderChordAudio();
  setStatus($("#chordSaveStatus"), "Acorde guardado.", "success");
  await loadChordCatalog();
});

$("#deleteChordBtn").addEventListener("click", async () => {
  const id = $("#chordId").value;
  if (!id) return;
  if (!confirm("¿Eliminar este acorde del catálogo?")) return;
  const { error } = await window.CancioneroDB.client.from("charango_acordes").delete().eq("id", id);
  if (error) setStatus($("#chordSaveStatus"), error.message, "error");
  else {
    clearChordEditor();
    await loadChordCatalog();
  }
});

function populateBarreFrets(){ const sel=$("#barreFret"); if(!sel)return; const old=sel.value; sel.replaceChildren(); for(let i=1;i<=adminFretCount;i++){const o=document.createElement("option");o.value=i;o.textContent=i;sel.append(o);} if(old && Number(old)<=adminFretCount)sel.value=old; }
$("#fretCount")?.addEventListener("change",()=>{adminFretCount=Math.max(5,Math.min(15,Number($("#fretCount").value)||8)); $("#fretCount").value=adminFretCount; populateBarreFrets(); renderAdminNeck();});
document.querySelectorAll("[data-strum]").forEach(btn=>btn.addEventListener("click",()=>{const input=$("#songStrum"); input.value=(input.value+" "+btn.dataset.strum).trim(); input.focus();}));
document.querySelectorAll(".open-string-check").forEach(c=>c.addEventListener("change",()=>{if(c.checked){const other=document.querySelector(`.muted-string-check[value="${c.value}"]`);if(other)other.checked=false;}}));
document.querySelectorAll(".muted-string-check").forEach(c=>c.addEventListener("change",()=>{if(c.checked){const other=document.querySelector(`.open-string-check[value="${c.value}"]`);if(other)other.checked=false;}}));

async function initAdmin() {
  await loadSongs();
  await loadChordCatalog();
  renderAdminNeck();
  renderBarreList();
  await loadSongRecord();
}
ensureAdmin().catch(error => setStatus($("#loginStatus"), error.message, "error"));
