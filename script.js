const listaCanciones = document.querySelector("#lista-canciones");
const buscador = document.querySelector("#buscador");
const contador = document.querySelector("#contador");
const sinResultados = document.querySelector("#sin-resultados");
const limpiarBusqueda = document.querySelector("#limpiar-busqueda");
const cerrarTodo = document.querySelector("#cerrar-todo");
const generarPdf = document.querySelector("#generar-pdf");
const estadoCarga = document.querySelector("#estado-carga");

let canciones = [];
let cancionAbierta = null;
let mostrarSoloFavoritas = false;
const favoritas = new Set(JSON.parse(localStorage.getItem("cautivo-favoritas") || "[]"));

function guardarFavoritas() {
  localStorage.setItem("cautivo-favoritas", JSON.stringify([...favoritas]));
}

function normalizarTexto(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function obtenerEnlaceYoutube(cancion) {
  const valor = cancion.youtube.trim();

  if (!valor) return "";

  let enlace = valor;

  if (!/^https?:\/\//i.test(valor)) {
    enlace = `https://www.youtube.com/watch?v=${encodeURIComponent(valor)}`;
  }

  try {
    const url = new URL(enlace);
    url.searchParams.delete("t");
    url.searchParams.delete("start");
    enlace = url.toString();
  } catch {}

  const separador = enlace.includes("?") ? "&" : "?";
  const inicio = Number(cancion.inicio);

  return inicio > 0 ? `${enlace}${separador}t=${inicio}s` : enlace;
}

function obtenerVideoYoutube(cancion) {
  const enlace = obtenerEnlaceYoutube(cancion);
  if (!enlace) return null;

  try {
    const url = new URL(enlace);
    let videoId = "";

    if (url.hostname.includes("youtu.be")) {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (url.pathname.startsWith("/shorts/")) {
      videoId = url.pathname.split("/")[2] || "";
    } else if (url.pathname.startsWith("/embed/")) {
      videoId = url.pathname.split("/")[2] || "";
    } else {
      videoId = url.searchParams.get("v") || "";
    }

    if (!videoId) return null;

    const inicio = Math.max(0, Number(cancion.inicio) || 0);

    const parametros = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      playsinline: "1"
    });

    if (inicio > 0) {
      parametros.set("start", String(inicio));
    }

    if (
      window.location.protocol === "http:" ||
      window.location.protocol === "https:"
    ) {
      parametros.set("origin", window.location.origin);
    }

    return {
      externo: enlace,
      embed: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${parametros}`
    };
  } catch {
    return null;
  }
}

function crearReproductorYoutube(cancion) {
  const video = obtenerVideoYoutube(cancion);
  if (!video) return null;

  const seccion = document.createElement("section");
  seccion.className = "song__media";

  const boton = document.createElement("button");
  boton.className = "song__video-button";
  boton.type = "button";
  boton.textContent = "Ver video";
  boton.setAttribute("aria-expanded", "false");

  const contenedor = document.createElement("div");
  contenedor.className = "song__player";
  contenedor.hidden = true;

  const ayuda = document.createElement("p");
  ayuda.className = "song__video-help";
  ayuda.append("Si el video no se reproduce aquí, ");

  const enlaceExterno = document.createElement("a");
  enlaceExterno.href = video.externo;
  enlaceExterno.target = "_blank";
  enlaceExterno.rel = "noopener noreferrer";
  enlaceExterno.textContent = "abrir en YouTube";

  ayuda.append(enlaceExterno, ".");

  boton.addEventListener("click", () => {
    const estaVisible = !contenedor.hidden;

    if (estaVisible) {
      contenedor.replaceChildren();
      contenedor.hidden = true;
      boton.textContent = "Ver video";
      boton.setAttribute("aria-expanded", "false");
      return;
    }

    const iframe = document.createElement("iframe");

    iframe.src = video.embed;
    iframe.title = `Video de ${cancion.titulo}`;
    iframe.loading = "lazy";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

    iframe.allowFullscreen = true;

    contenedor.append(iframe);
    contenedor.hidden = false;

    boton.textContent = "Ocultar video";
    boton.setAttribute("aria-expanded", "true");
  });

  seccion.append(boton, contenedor, ayuda);

  return seccion;
}

function detenerVideoDeCancion(cancion) {
  const reproductor = cancion.querySelector(".song__player");
  const boton = cancion.querySelector(".song__video-button");

  if (!reproductor || !boton) return;

  reproductor.replaceChildren();
  reproductor.hidden = true;

  boton.textContent = "Ver video";
  boton.setAttribute("aria-expanded", "false");
}

function esIndicacionMusical(linea) {
  return /^\s*\(?\s*(coro|instrumental)\s*(?:…|\.{3})?\s*\)?\s*$/i.test(linea);
}

function crearLineaLetra(texto) {
  const linea = document.createElement("span");
  const patronDestacado = /(\(\s*bis\s*\)|\bbis\b)/gi;
  let posicion = 0;

  if (esIndicacionMusical(texto)) {
    const destacado = document.createElement("strong");
    destacado.className = "song__direction";
    destacado.textContent = texto;
    linea.append(destacado);

    return linea;
  }

  for (const coincidencia of texto.matchAll(patronDestacado)) {
    linea.append(
      document.createTextNode(
        texto.slice(posicion, coincidencia.index)
      )
    );

    const destacado = document.createElement("strong");
    destacado.className = "song__repeat";
    destacado.textContent = coincidencia[0];

    linea.append(destacado);

    posicion = coincidencia.index + coincidencia[0].length;
  }

  linea.append(document.createTextNode(texto.slice(posicion)));

  return linea;
}

function crearEstrofas(texto) {
  const fragmento = document.createDocumentFragment();
  const lineas = texto.trim().split(/\r?\n/);
  let estrofa = [];

  function agregarEstrofa() {
    if (!estrofa.length) return;

    const bloque = document.createElement("p");
    bloque.className = "song__stanza";

    estrofa.forEach((linea) => bloque.append(crearLineaLetra(linea)));

    fragmento.append(bloque);
    estrofa = [];
  }

  lineas.forEach((lineaOriginal) => {
    const linea = lineaOriginal.trim();

    if (!linea) {
      agregarEstrofa();
      return;
    }

    if (esIndicacionMusical(linea)) {
      agregarEstrofa();
      estrofa.push(linea);
      agregarEstrofa();
      return;
    }

    estrofa.push(linea);

    if (/(\(\s*bis\s*\)|\bbis\b)/i.test(linea) || estrofa.length === 4) {
      agregarEstrofa();
    }
  });

  agregarEstrofa();

  return fragmento;
}

function crearCancion(cancion) {
  const articulo = document.createElement("article");
  const idContenido = `letra-${cancion.numero.replace(/\W/g, "-")}`;
  const reproductorYoutube = crearReproductorYoutube(cancion);

  articulo.className = "song";
  articulo.dataset.numero = cancion.numero;
  articulo.id = `cancion-${cancion.numero.replace(/\W/g, "-")}`;

  const boton = document.createElement("button");
  boton.className = "song__button";
  boton.type = "button";
  boton.setAttribute("aria-expanded", "false");
  boton.setAttribute("aria-controls", idContenido);

  const numero = document.createElement("span");
  numero.className = "song__number";
  numero.textContent = cancion.numero;

  const titulo = document.createElement("span");
  titulo.className = "song__title";
  titulo.textContent = cancion.titulo;

  const icono = document.createElement("span");
  icono.className = "song__chevron";
  icono.setAttribute("aria-hidden", "true");

  boton.append(numero, titulo, icono);

  const contenido = document.createElement("div");
  contenido.className = "song__content";
  contenido.id = idContenido;

  const contenidoInterior = document.createElement("div");
  contenidoInterior.className = "song__content-inner";

  const letra = document.createElement("div");
  letra.className = "song__lyrics";
  letra.append(crearEstrofas(cancion.letra));

  if (reproductorYoutube) {
    letra.append(reproductorYoutube);
  }

  const accionesCancion = document.createElement("div");
  accionesCancion.className = "song__quick-actions";

  const favorito = document.createElement("button");
  favorito.type = "button";
  favorito.className = "song__quick-button";
  favorito.setAttribute("aria-label", `Guardar ${cancion.titulo} en favoritas`);
  const actualizarFavorito = () => {
    const activo = favoritas.has(cancion.numero);
    favorito.classList.toggle("is-active", activo);
    favorito.setAttribute("aria-pressed", String(activo));
    favorito.textContent = activo ? "♥ Guardada" : "♡ Guardar";
  };
  actualizarFavorito();
  favorito.addEventListener("click", () => {
    favoritas.has(cancion.numero) ? favoritas.delete(cancion.numero) : favoritas.add(cancion.numero);
    guardarFavoritas(); actualizarFavorito();
    if (mostrarSoloFavoritas) filtrarCanciones();
  });

  const compartir = document.createElement("button");
  compartir.type = "button";
  compartir.className = "song__quick-button";
  compartir.textContent = "↗ Compartir";
  compartir.addEventListener("click", async () => {
    const url = `${location.href.split("#")[0]}#${articulo.id}`;
    try {
      if (navigator.share) await navigator.share({ title: cancion.titulo, text: "Cancionero del Señor Cautivo de Ayabaca", url });
      else { await navigator.clipboard.writeText(url); compartir.textContent = "✓ Enlace copiado"; setTimeout(() => compartir.textContent = "↗ Compartir", 1800); }
    } catch {}
  });
  accionesCancion.append(favorito, compartir);
  letra.prepend(accionesCancion);

  // Acceso directo a la ficha musical de esta misma canción.
  const herramientasMusicales = document.createElement("section");
  herramientasMusicales.className = "song__media";

  const enlaceCharango = document.createElement("a");
  enlaceCharango.className = "song__video-button";
  enlaceCharango.href = `charango.html?song=${encodeURIComponent(cancion.id || cancion.numero)}`;
  enlaceCharango.textContent = "🪕 Abrir en Charango";
  enlaceCharango.style.textDecoration = "none";

  const enlaceZampona = document.createElement("a");
  enlaceZampona.className = "song__video-button";
  enlaceZampona.href = `zampona.html?song=${encodeURIComponent(cancion.id || cancion.numero)}`;
  enlaceZampona.textContent = "▥ Abrir en Zampoña";
  enlaceZampona.style.textDecoration = "none";

  herramientasMusicales.append(enlaceCharango, enlaceZampona);
  letra.append(herramientasMusicales);

  contenidoInterior.append(letra);
  contenido.append(contenidoInterior);

  articulo.append(boton, contenido);

  boton.addEventListener("click", () => {
    alternarCancion(
      articulo,
      boton,
      cancion.numero
    );
  });

  return articulo;
}

function alternarCancion(articulo, boton, numeroCancion) {
  const estabaAbierta = cancionAbierta === numeroCancion;

  document
    .querySelectorAll(".song.is-open")
    .forEach((cancion) => {
      detenerVideoDeCancion(cancion);

      cancion.classList.remove("is-open");

      cancion
        .querySelector(".song__button")
        .setAttribute("aria-expanded", "false");
    });

  if (estabaAbierta) {
    cancionAbierta = null;
    return;
  }

  articulo.classList.add("is-open");
  boton.setAttribute("aria-expanded", "true");

  cancionAbierta = numeroCancion;
}

function cerrarTodasLasCanciones() {
  document
    .querySelectorAll(".song.is-open")
    .forEach((cancion) => {
      detenerVideoDeCancion(cancion);
      cancion.classList.remove("is-open");

      cancion
        .querySelector(".song__button")
        .setAttribute("aria-expanded", "false");
    });

  cancionAbierta = null;
}

function filtrarCanciones() {
  const consulta = normalizarTexto(buscador.value);

  const resultados = canciones.filter((cancion) => {
    const contenido = normalizarTexto(
      `${cancion.numero} ${cancion.titulo} ${cancion.letra}`
    );

    return contenido.includes(consulta) && (!mostrarSoloFavoritas || favoritas.has(cancion.numero));
  });

  renderizarCanciones(resultados);

  limpiarBusqueda.hidden = buscador.value.length === 0;
}

function renderizarCanciones(resultados) {
  listaCanciones.replaceChildren(
    ...resultados.map(crearCancion)
  );

  contador.textContent =
    `Mostrando ${resultados.length} de ${canciones.length} canciones`;

  sinResultados.hidden = resultados.length !== 0;
  listaCanciones.hidden = resultados.length === 0;

  if (
    !resultados.some(
      (cancion) => cancion.numero === cancionAbierta
    )
  ) {
    cancionAbierta = null;
  }
}

buscador.addEventListener("input", filtrarCanciones);

limpiarBusqueda.addEventListener("click", () => {
  buscador.value = "";
  filtrarCanciones();
  buscador.focus();
});

cerrarTodo.addEventListener(
  "click",
  cerrarTodasLasCanciones
);

document.querySelector("#solo-favoritas")?.addEventListener("click", (event) => {
  mostrarSoloFavoritas = !mostrarSoloFavoritas;
  event.currentTarget.setAttribute("aria-pressed", String(mostrarSoloFavoritas));
  event.currentTarget.textContent = mostrarSoloFavoritas ? "♥ Favoritas" : "♡ Favoritas";
  filtrarCanciones();
});

async function cargarCanciones() {
  try {
    canciones = await window.CancioneroDB.listSongs();

    estadoCarga.hidden = true;

    renderizarCanciones(canciones);
    if (location.hash.startsWith("#cancion-")) {
      const objetivo = document.querySelector(location.hash);
      objetivo?.querySelector(".song__button")?.click();
      objetivo?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    console.error(error);

    estadoCarga.textContent =
      "No se pudieron cargar las canciones.";
  }
}

function escaparHtml(texto) {
  return String(texto).replace(
    /[&<>"']/g,
    (caracter) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[caracter]
  );
}

function generarLibro() {
  if (!canciones.length) return;

  /*
    ==================================================
    IMÁGENES DE LA PORTADA
    ==================================================

    Estas rutas coinciden con tu repositorio:

    assets/
      cautivo.png
      santuario.png
  */

  const urlCautivo = new URL(
    "assets/cautivo-transparent.png",
    window.location.href
  ).href;

  const urlSantuario = new URL(
    "assets/santuario-transparent.png",
    window.location.href
  ).href;

  const paginaBlanca = () =>
    `<section class="book-page blank-page"></section>`;

  const paginaCancion = (cancion) => `
    <article class="book-page song-page">

      <header class="song-heading">

        <span class="song-number">
          ${escaparHtml(cancion.numero)}
        </span>

        <h2>
          ${escaparHtml(cancion.titulo)}
        </h2>

      </header>

      ${
        cancion.categoria
          ? `
            <p class="song-category">
              ${escaparHtml(cancion.categoria)}
            </p>
          `
          : ""
      }

      <div class="song-text">

        ${escaparHtml(cancion.letra).replace(
          /\n/g,
          "<br>"
        )}

      </div>

    </article>
  `;

  /*
    ==================================================
    PÁGINAS
    ==================================================
  */

  const paginas = [

    /*
      PORTADA

      santuario.png =
      fondo.

      cautivo.png =
      imagen principal.
    */

    `
      <section class="book-page book-cover">

        <img
          class="cover-sanctuary"
          src="${urlSantuario}"
          alt=""
        >

        <div class="cover-overlay"></div>

        <div class="cover-content">

          <div class="cover-ornament">
            ✥
          </div>

          <img
            class="cover-cautivo"
            src="${urlCautivo}"
            alt="Señor Cautivo de Ayabaca"
          >

          <h1>
            Cancionero
          </h1>

          <h2>
            Señor Cautivo
          </h2>

          <p>
            Ayabaca · Piura
          </p>

          <div class="cover-line"></div>

          <small>
            Fe · tradición · devoción
          </small>

        </div>

      </section>
    `,

    ...canciones.map(paginaCancion)

  ];

  /*
    Cada A4 impreso por ambas caras
    representa 8 páginas finales A6.
  */

  while (paginas.length % 8 !== 0) {
    paginas.push(paginaBlanca());
  }

  const totalPaginas = paginas.length;

  const cantidadHojasA5 =
    totalPaginas / 4;

  const cantidadHojasA4 =
    cantidadHojasA5 / 2;

  /*
    ==================================================
    IMPOSICIÓN DE CUADERNILLO
    ==================================================
  */

  const hojasA5 = [];

  for (
    let i = 0;
    i < cantidadHojasA5;
    i += 1
  ) {
    hojasA5.push({

      frente: [
        totalPaginas - i * 2,
        1 + i * 2
      ],

      reverso: [
        2 + i * 2,
        totalPaginas - 1 - i * 2
      ]

    });
  }

  const obtenerPagina =
    (numero) =>
      paginas[numero - 1] ||
      paginaBlanca();

  function numeroVisible(numero) {
    if (numero <= 1) {
      return "";
    }

    return `
      <span class="printed-page-number">
        ${numero}
      </span>
    `;
  }

  function crearMitadA5(
    par,
    clase
  ) {
    const [
      izquierda,
      derecha
    ] = par;

    return `
      <section
        class="
          half-sheet
          ${clase}
        "
      >

        <div
          class="
            imposed-page
            imposed-page--left
          "
        >

          ${obtenerPagina(izquierda)}

          ${numeroVisible(izquierda)}

        </div>


        <div
          class="fold-guide"
          aria-hidden="true"
        ></div>


        <div
          class="
            imposed-page
            imposed-page--right
          "
        >

          ${obtenerPagina(derecha)}

          ${numeroVisible(derecha)}

        </div>

      </section>
    `;
  }

  let hojasImpuestas = "";

  for (
    let i = 0;
    i < cantidadHojasA4;
    i += 1
  ) {
    const superior =
      hojasA5[i * 2];

    const inferior =
      hojasA5[i * 2 + 1];

    /*
      PDF impar =
      frente.

      PDF par =
      reverso.
    */

    hojasImpuestas += `

      <section
        class="
          a4-sheet
          a4-sheet--front
        "
      >

        ${crearMitadA5(
          superior.frente,
          "half-sheet--top"
        )}

        ${crearMitadA5(
          inferior.frente,
          "half-sheet--bottom"
        )}

        <div class="cut-guide">
          <span>
            CORTAR
          </span>
        </div>

      </section>


      <section
        class="
          a4-sheet
          a4-sheet--back
        "
      >

        ${crearMitadA5(
          superior.reverso,
          "half-sheet--top"
        )}

        ${crearMitadA5(
          inferior.reverso,
          "half-sheet--bottom"
        )}

        <div class="cut-guide">
          <span>
            CORTAR
          </span>
        </div>

      </section>
    `;
  }

  const ventana =
    window.open(
      "",
      "_blank"
    );

  if (!ventana) {
    alert(
      "Permite las ventanas emergentes para generar el libro."
    );

    return;
  }

  ventana.document.write(`
<!doctype html>

<html lang="es">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="
    width=device-width,
    initial-scale=1
  "
>

<title>
  Cancionero Señor Cautivo — Cuadernillo
</title>

<style>

@page {
  size:
    A4 portrait;

  margin:
    0;
}

* {
  box-sizing:
    border-box;
}

html,
body {
  margin:
    0;

  padding:
    0;

  color:
    #2F2A26;

  background:
    #ECEAE6;

  font-family:
    Georgia,
    "Times New Roman",
    serif;
}


/*
  ================================================
  INSTRUCCIONES
  ================================================
*/

.print-help {
  width:
    min(
      92%,
      940px
    );

  margin:
    24px auto;

  padding:
    24px 28px;

  background:
    #FFFDF8;

  border:
    1px solid #D5C18E;

  border-radius:
    18px;

  box-shadow:
    0 12px 30px
    rgba(
      53,
      36,
      72,
      .10
    );

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  line-height:
    1.55;
}

.print-help h1 {
  margin:
    0 0 12px;

  color:
    #352448;

  font-family:
    Georgia,
    "Times New Roman",
    serif;

  font-size:
    28px;
}

.print-help h2 {
  margin:
    22px 0 8px;

  color:
    #4A3A68;

  font-size:
    18px;
}

.print-help p {
  margin:
    8px 0;
}

.print-help strong {
  color:
    #352448;
}

.print-help .important {
  margin-top:
    16px;

  padding:
    13px 15px;

  background:
    #F5F2EA;

  border-left:
    4px solid #A88A44;

  border-radius:
    8px;
}

.print-help button {
  margin-top:
    18px;

  padding:
    12px 20px;

  color:
    #FFFFFF;

  background:
    #4A3A68;

  border:
    0;

  border-radius:
    10px;

  cursor:
    pointer;

  font-weight:
    700;

  font-size:
    15px;
}


/*
  ================================================
  A4
  ================================================
*/

.a4-sheet {
  position:
    relative;

  display:
    grid;

  grid-template-rows:
    148.5mm
    148.5mm;

  width:
    210mm;

  height:
    297mm;

  margin:
    0 auto 10mm;

  overflow:
    hidden;

  background:
    #FFFFFF;

  break-after:
    page;

  page-break-after:
    always;
}

.a4-sheet:last-child {
  break-after:
    auto;

  page-break-after:
    auto;
}


/*
  Corte ÚNICAMENTE horizontal.
*/

.cut-guide {
  position:
    absolute;

  z-index:
    30;

  top:
    148.5mm;

  left:
    0;

  width:
    210mm;

  height:
    0;

  border-top:
    .35mm dashed
    rgba(
      0,
      0,
      0,
      .62
    );

  pointer-events:
    none;
}

.cut-guide span {
  position:
    absolute;

  top:
    -3.2mm;

  left:
    3mm;

  padding:
    0 .8mm;

  color:
    #555;

  background:
    #FFFFFF;

  font:
    5.5pt
    Arial,
    Helvetica,
    sans-serif;

  letter-spacing:
    .08em;
}


/*
  ================================================
  A5 HORIZONTAL
  ================================================
*/

.half-sheet {
  position:
    relative;

  display:
    grid;

  grid-template-columns:
    105mm
    105mm;

  width:
    210mm;

  height:
    148.5mm;

  overflow:
    hidden;

  background:
    #FFFFFF;
}


/*
  Línea vertical =
  solamente DOBLEZ.

  NO cortar.
*/

.fold-guide {
  position:
    absolute;

  z-index:
    20;

  top:
    0;

  bottom:
    0;

  left:
    105mm;

  width:
    0;

  border-left:
    .18mm dotted
    rgba(
      168,
      138,
      68,
      .42
    );

  pointer-events:
    none;
}


/*
  ================================================
  PÁGINA FINAL A6
  ================================================
*/

.imposed-page {
  position:
    relative;

  width:
    105mm;

  height:
    148.5mm;

  overflow:
    hidden;

  background:
    #FFFFFF;
}

.book-page {
  position:
    relative;

  width:
    100%;

  height:
    100%;

  overflow:
    hidden;

  padding:
    5.8mm
    5.4mm
    7.5mm;

  background:
    #FFFFFF;
}

.printed-page-number {
  position:
    absolute;

  z-index:
    10;

  right:
    0;

  bottom:
    2.2mm;

  left:
    0;

  color:
    #80766D;

  text-align:
    center;

  font:
    5.4pt
    Arial,
    Helvetica,
    sans-serif;
}


/*
  ================================================
  PORTADA

  AQUÍ SE USAN LAS DOS IMÁGENES.
  ================================================
*/

.book-cover {
  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  padding:
    0;

  isolation:
    isolate;

  color:
    #FFFFFF;

  background:
    linear-gradient(
      180deg,
      rgba(
        53,
        36,
        72,
        .92
      ),
      rgba(
        53,
        36,
        72,
        .84
      )
    );
}


/*
  SANTUARIO =
  fondo completo de portada.
*/

.cover-sanctuary {
  position:
    absolute;

  z-index:
    -3;

  inset:
    0;

  width:
    100%;

  height:
    100%;

  object-fit:
    cover;

  opacity:
    .30;

  filter:
    grayscale(.08)
    contrast(1.05);
}


.cover-overlay {
  position:
    absolute;

  z-index:
    -2;

  inset:
    0;

  background:
    linear-gradient(
      180deg,
      rgba(
        53,
        36,
        72,
        .42
      ),
      rgba(
        30,
        19,
        42,
        .82
      )
    );
}


.cover-content {
  width:
    88%;

  text-align:
    center;
}

.cover-ornament {
  margin-bottom:
    2.3mm;

  color:
    #E2CA89;

  font-size:
    15pt;
}


/*
  CAUTIVO =
  imagen protagonista.
*/

.cover-cautivo {
  display:
    block;

  max-width:
    48mm;

  max-height:
    58mm;

  margin:
    0 auto 3.2mm;

  object-fit:
    contain;

  filter:
    drop-shadow(
      0
      2mm
      2.5mm
      rgba(
        0,
        0,
        0,
        .25
      )
    );
}


.book-cover h1 {
  margin:
    0;

  color:
    #FFFFFF;

  font-size:
    18pt;

  font-weight:
    400;

  letter-spacing:
    .055em;

  line-height:
    1;

  text-transform:
    uppercase;
}

.book-cover h2 {
  margin:
    1.6mm 0 0;

  color:
    #F1E5C4;

  font-size:
    11.5pt;

  font-weight:
    400;

  text-transform:
    uppercase;
}

.book-cover p {
  margin:
    3.4mm 0 0;

  color:
    #E2CA89;

  font:
    700 6.3pt
    Arial,
    Helvetica,
    sans-serif;

  letter-spacing:
    .20em;

  text-transform:
    uppercase;
}

.cover-line {
  width:
    24mm;

  height:
    .35mm;

  margin:
    3.8mm auto 2.8mm;

  background:
    #D5C18E;
}

.book-cover small {
  color:
    rgba(
      255,
      255,
      255,
      .88
    );

  font:
    5.8pt
    Arial,
    Helvetica,
    sans-serif;

  letter-spacing:
    .08em;

  text-transform:
    uppercase;
}


/*
  ================================================
  CANCIONES
  ================================================
*/

.song-page {
  text-align:
    center;

  padding-top:
    5.2mm;
}

.song-heading {
  display:
    flex;

  align-items:
    baseline;

  justify-content:
    center;

  gap:
    1.8mm;

  margin:
    0 0 2mm;

  padding-bottom:
    1.5mm;

  border-bottom:
    .35mm solid #D5C18E;
}

.song-number {
  flex:
    none;

  color:
    #A88A44;

  font-weight:
    700;
}

.song-heading h2 {
  margin:
    0;

  color:
    #352448;

  line-height:
    1.06;

  text-transform:
    uppercase;
}

.song-category {
  margin:
    -.5mm 0 1.5mm;

  color:
    #786F66;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  letter-spacing:
    .10em;

  text-transform:
    uppercase;
}

.song-text {
  color:
    #3D3833;
}

.blank-page {
  background:
    #FFFFFF;
}


/*
  ================================================
  IMPRESIÓN
  ================================================
*/

@media print {

  html,
  body {
    width:
      210mm;

    margin:
      0;

    padding:
      0;

    background:
      #FFFFFF;
  }

  .no-print {
    display:
      none !important;
  }

  .a4-sheet {
    margin:
      0;

    box-shadow:
      none;
  }

}


@media screen {

  .a4-sheet {
    box-shadow:
      0 8px 24px
      rgba(
        0,
        0,
        0,
        .15
      );
  }

}

</style>

</head>

<body>


<section
  class="
    print-help
    no-print
  "
>

  <h1>
    Cuadernillo listo para impresión
  </h1>

  <p>

    El cancionero tiene

    <strong>
      ${totalPaginas}
      páginas finales A6
    </strong>

    distribuidas en

    <strong>
      ${cantidadHojasA4}
      hojas físicas A4
    </strong>.

  </p>


  <p>

    Cada A4 contiene

    <strong>
      4 páginas por delante
      y 4 por detrás
    </strong>.

    Haz

    <strong>
      un único corte horizontal
    </strong>

    por la línea punteada.

    La línea vertical
    es únicamente
    para doblar.

  </p>


  <h2>
    Doble cara automática
  </h2>

  <p>

    Imprime todas las páginas,

    papel A4,

    escala 100 %,

    doble cara

    y

    <strong>
      voltear por borde largo
    </strong>.

  </p>


  <h2>
    Doble cara manual
  </h2>

  <p>

    Primero imprime

    <strong>
      impares:
      1, 3, 5, 7…
    </strong>.

    Vuelve a colocar
    las hojas

    y después imprime

    <strong>
      pares:
      2, 4, 6, 8…
    </strong>.

  </p>


  <div
    class="important"
  >

    <strong>
      Haz primero una prueba
      con una sola hoja.
    </strong>

    Si el reverso
    sale invertido,

    cambia la orientación
    con la que vuelves
    a colocar el papel.

  </div>


  <h2>
    Armado
  </h2>

  <p>

    1.
    Corta cada A4
    solamente
    por la línea horizontal.

    <br>

    2.
    Dobla cada mitad
    por la línea vertical.

    <br>

    3.
    Anida las hojas
    desde la exterior
    hacia la interior.

    <br>

    4.
    Engrapa
    sobre el pliegue central.

  </p>


  <p>

    En Chrome
    desactiva

    <strong>
      Encabezados
      y pies de página
    </strong>.

  </p>


  <button
    type="button"
    onclick="window.print()"
  >

    Imprimir / Guardar como PDF

  </button>

</section>


${hojasImpuestas}

<script>

(function () {

  /*
    Tamaño mínimo.

    Canciones muy largas.
  */

  const MIN_BODY =
    5.8;


  /*
    Tamaño máximo.

    Canciones cortas
    podrán llegar
    hasta 13 pt.
  */

  const MAX_BODY =
    13.0;


  const SAFETY =
    2;


  function aplicarTamano(
    page,
    bodyPt
  ) {

    const text =
      page.querySelector(
        ".song-text"
      );

    const title =
      page.querySelector(
        ".song-heading h2"
      );

    const number =
      page.querySelector(
        ".song-number"
      );

    const category =
      page.querySelector(
        ".song-category"
      );


    if (
      !text ||
      !title ||
      !number
    ) {
      return;
    }


    let lineHeight;

    if (
      bodyPt >= 11
    ) {

      lineHeight =
        1.30;

    } else if (
      bodyPt >= 9
    ) {

      lineHeight =
        1.27;

    } else if (
      bodyPt >= 7
    ) {

      lineHeight =
        1.22;

    } else {

      lineHeight =
        1.16;

    }


    text.style.fontSize =
      bodyPt +
      "pt";

    text.style.lineHeight =
      String(
        lineHeight
      );


    const titlePt =
      Math.min(
        15.2,

        Math.max(
          9.8,

          bodyPt *
            1.20 +
            1.1
        )
      );


    title.style.fontSize =
      titlePt +
      "pt";


    number.style.fontSize =
      Math.max(
        8.8,

        titlePt *
          .80
      ) +
      "pt";


    if (
      category
    ) {

      category.style.fontSize =
        Math.min(
          7.8,

          Math.max(
            5.8,

            bodyPt *
              .66
          )
        ) +
        "pt";


      category.style.lineHeight =
        "1.1";
    }

  }


  function cabe(page) {

    return (
      page.scrollHeight <=
      page.clientHeight +
      SAFETY
    );

  }


  function ajustarPagina(page) {

    let low =
      MIN_BODY;

    let high =
      MAX_BODY;

    let best =
      MIN_BODY;


    aplicarTamano(
      page,
      MIN_BODY
    );


    /*
      Si incluso con
      el mínimo no cabe,
      dejamos el mínimo.
    */

    if (
      !cabe(page)
    ) {
      return;
    }


    /*
      Búsqueda binaria.

      Encuentra el tamaño
      máximo que entra.
    */

    for (
      let i = 0;
      i < 16;
      i += 1
    ) {

      const mid =
        (
          low +
          high
        ) /
        2;


      aplicarTamano(
        page,
        mid
      );


      if (
        cabe(page)
      ) {

        best =
          mid;

        low =
          mid;

      } else {

        high =
          mid;

      }

    }


    /*
      Pequeño margen
      para evitar
      cortes por redondeo
      del navegador.
    */

    aplicarTamano(
      page,

      Math.max(
        MIN_BODY,
        best - .10
      )
    );

  }


  /*
    ==========================================
    ESPERAR LAS IMÁGENES
    ==========================================

    Esto asegura que:

    cautivo.png
    santuario.png

    ya estén cargadas
    antes de terminar
    el diseño.
  */

  async function esperarImagenes() {

    const imagenes =
      [
        ...document.images
      ];


    await Promise.all(

      imagenes.map(
        (img) => {

          if (
            img.complete
          ) {
            return Promise.resolve();
          }


          return new Promise(
            (resolve) => {

              img.addEventListener(
                "load",
                resolve,
                {
                  once:
                    true
                }
              );


              img.addEventListener(
                "error",
                resolve,
                {
                  once:
                    true
                }
              );

            }
          );

        }
      )

    );

  }


  async function iniciar() {

    try {

      if (
        document.fonts &&
        document.fonts.ready
      ) {

        await document
          .fonts
          .ready;

      }

    } catch (_) {}


    /*
      Primero cargamos:

      santuario.png
      cautivo.png
    */

    await esperarImagenes();


    /*
      Luego calculamos
      el tamaño de letra
      óptimo.
    */

    document
      .querySelectorAll(
        ".song-page"
      )
      .forEach(
        ajustarPagina
      );

  }


  window.addEventListener(
    "load",
    iniciar,
    {
      once:
        true
    }
  );


  /*
    Segundo intento
    por seguridad
    en Chrome.
  */

  setTimeout(
    iniciar,
    350
  );

})();

<\/script>


</body>

</html>
  `);


  ventana.document.close();

}


generarPdf.addEventListener(
  "click",
  generarLibro
);


cargarCanciones();
