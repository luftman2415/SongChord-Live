// --- CONFIGURACIÓN ---
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwEr6eTo9HsKOHQBaZcm9GHuOqjEAkyG_hUS7HLor6yUuk4SLi8syf57xu0C5mjtufV/exec'; 

let favorites = JSON.parse(localStorage.getItem('songChordFavorites')) || [];
let repertoire = JSON.parse(localStorage.getItem('songChordRepertoire')) || [];
let activeServiceInfo = null; // Guardará el nombre del servicio abierto
let serviceToDelete = null; // Guardará el servicio que vamos a borrar
let songsDatabase = [];
let servicesDatabase = [];
let currentSongList = [];
let tempSelectedSongs = [];
let selectedDaySlot = null; // Guardará el ID del día que estamos editando
let ministryData = JSON.parse(localStorage.getItem('ministryAssignments')) || {};
let currentServiceSongs = []; 
let metronomeInterval = null;
let isMetronomeSoundEnabled = false;
let audioCtx = null; 
let currentSong = null;
let currentMode = 'musicos'; 
let fontSize = 16;
let currentTransposition = 0;
let isScrolling = false;
let scrollInterval;
let scrollTimeout; // Esta variable evitará que el scroll "salte" a otras canciones
let scrollSpeed = 50; 
let speedLevel = 1.0;
let tempThemeBackup = 'day'; // Memoria para revertir temas con la X
let tempNotationBackup = 'estandar'; // Memoria para revertir notación con la X
let tempColumnsBackup = '2-columnas'; // Memoria para revertir columnas con la X
let tempTitleColorBackup = ''; // Memoria para revertir color de título
let tempTextColorBackup = ''; // Memoria para revertir color de texto
let currentNotationStyle = localStorage.getItem('chordNotation') || 'estandar'; // Notación de acordes activa
let currentColumnsLayout = localStorage.getItem('chordColumnsLayout') || '2-columnas'; // Formato de columnas activo
let currentTitleColor = localStorage.getItem('customTitleColor') || ''; // Color de título activo
let currentTextColor = localStorage.getItem('customTextColor') || ''; // Color de texto activo
let lastListView = 'home-view'; // Recordará si venías de Favoritos, Repertorio o Roles
let wakeLock = null; // Protector de pantalla encendida
let currentCalDate = new Date(); // Guardará el mes/año seleccionado en el calendario ministerial
let passwordSuccessAction = 'add'; // Determina si la clave exitosa abre la ventana de 'add' (crear) o 'edit' (editar)
const scale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// 1. ARRANQUE
window.onload = () => {
    // Cargar y aplicar tema guardado de inmediato
    const savedTheme = localStorage.getItem('userTheme') || 'day';
    applyThemeClass(savedTheme);

    initApp();
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if(splash) { splash.style.opacity = '0'; setTimeout(() => splash.style.display = 'none', 600); }
    }, 2500);
};

// 2. CARGAR DATOS
async function initApp() {
    try {
        const response = await fetch(WEB_APP_URL);
        const data = await response.json();
        
        // 1. Bienvenida
        if(data.bienvenida) {
            const elTitle = document.getElementById('welcome-text'), elSub = document.getElementById('welcome-subtext');
            const filas = data.bienvenida.filter(f => f[0] && f[0].toString().trim() !== "");
            if(filas.length > 0) {
                const sel = filas[Math.floor(Math.random() * filas.length)];
                elTitle.innerText = sel[0]; elSub.innerText = sel[1] || "Preparados para ministrar.";
            }
        }

        // 2. Canciones
        songsDatabase = data.canciones.map(item => {
            const find = (k) => item[Object.keys(item).find(key => key.toLowerCase().replace(/_/g, ' ').trim() === k.toLowerCase())] || "";
            return {
                ID: find('ID').toString().trim(), Titulo: find('Titulo') || "Sin Título",
                Artista: find('Artista') || "Desconocido", Tono: find('Tono') || "C",
                BPM: find('BPM') || 0, Letra_Musicos: find('Letra Musicos') || find('Musicos') || "",
                Letra_Voces: find('Letra Voces') || find('Voces') || "",
                Youtube: find('Youtube') || find('YouTube') || ""
            };
        });

        servicesDatabase = data.servicios || [];
        
        // Ordenar automáticamente los servicios por fecha de menor a mayor (más cercano primero)
        servicesDatabase.sort((a, b) => {
            const dateA = new Date(getServiceFecha(a));
            const dateB = new Date(getServiceFecha(b));
            if (isNaN(dateA)) return 1;
            if (isNaN(dateB)) return -1;
            return dateA - dateB;
        });

        // 3. CARGA DE PROGRAMACIÓN (HOJA 4) - ¡Aquí está la solución!
        if(data.programacion) {
            ministryData = {}; 
            data.programacion.forEach(row => {
                const getV = (k) => row[Object.keys(row).find(key => key.toLowerCase() === k.toLowerCase())];
                let rawId = getV('SlotID');
                
                if(rawId) {
                    // Si Google envía una fecha rara, la limpiamos a fondo
                    let cleanId = rawId.toString();
                    if (cleanId.includes("GMT") || cleanId.length > 15) {
                        let d = new Date(rawId);
                        cleanId = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
                    }
                    ministryData[cleanId.trim()] = { name: getV('Nombre') || "Disponible", note: getV('Nota') || "" };
                }
            });
        }

        renderServices();
        
    } catch (e) {
        console.error("Error en carga:", e);
        showToast("Error de sincronización", "error");
    }
}

// Funciones auxiliares ultra-robustas para mapear columnas de Servicios
function getServiceVal(ser, keyword) {
    if (!ser) return "";
    const keys = Object.keys(ser);
    let foundKey = keys.find(k => k.toLowerCase().trim() === keyword.toLowerCase().trim());
    if (foundKey) return ser[foundKey];
    foundKey = keys.find(k => {
        const cleanK = k.toLowerCase().trim();
        const cleanKw = keyword.toLowerCase().trim();
        return cleanK.includes(cleanKw) || cleanKw.includes(cleanK);
    });
    return foundKey ? ser[foundKey] : "";
}

function getServiceFecha(ser) {
    return getServiceVal(ser, 'fecha') || getServiceVal(ser, 'date') || getServiceVal(ser, 'hora');
}

function getServiceNombre(ser) {
    return getServiceVal(ser, 'nombre') || getServiceVal(ser, 'name') || getServiceVal(ser, 'servicio');
}

function getServiceLider(ser) {
    return getServiceVal(ser, 'lider') || getServiceVal(ser, 'líder') || getServiceVal(ser, 'director');
}

function getServiceIds(ser) {
    if (!ser) return "";
    const keys = Object.keys(ser);
    
    // Prioridad 1: exacto "ids" o "id"
    let idKey = keys.find(k => k.toLowerCase().trim() === 'ids');
    if (idKey) return ser[idKey];
    
    // Prioridad 2: contiene "lista de ids"
    idKey = keys.find(k => {
        const lower = k.toLowerCase();
        return lower.includes('lista de ids') || lower.includes('id de las canciones') || lower.includes('ids de canciones') || lower.includes('canciones ids');
    });
    if (idKey) return ser[idKey];
    
    // Prioridad 3: cualquier llave que contenga "ids" pero que no sea "lider" o "fecha" o "nombre"
    idKey = keys.find(k => k.toLowerCase().includes('ids') && !k.toLowerCase().includes('lider') && !k.toLowerCase().includes('fecha') && !k.toLowerCase().includes('nombre'));
    if (idKey) return ser[idKey];
    
    // Prioridad 4: buscador flexible por keyword "id"
    const flexibleKey = keys.find(k => k.toLowerCase().trim().includes('id'));
    return flexibleKey ? ser[flexibleKey] : "";
}

function parseServiceIds(rawIds) {
    if (!rawIds) return [];
    // Limpiamos los caracteres especiales como comillas simples (truco de excel), puntos, espacios, etc.
    const cleanStr = rawIds.toString().replace(/'/g, '').replace(/[.\s]/g, ',').trim();
    // Dividimos por comas, limpiamos espacios de cada ID, y filtramos vacíos
    return cleanStr.split(',').map(id => id.trim()).filter(id => id !== "");
}

// 3. RENDERIZAR SERVICIOS (DASHBOARD)
function renderServices() {
    const container = document.getElementById('services-container');
    if (!servicesDatabase || servicesDatabase.length === 0) {
        container.innerHTML = "<p class='loading-small'>No hay servicios programados.</p>";
        return;
    }
    
    const renderedCards = servicesDatabase.map((ser, i) => {
        const fechaRaw = getServiceFecha(ser);
        if (fechaRaw) {
            const serviceDate = new Date(fechaRaw);
            const now = new Date();
            // Si el servicio tiene más de 24 horas de vencido, se autopurga visualmente de inmediato
            if (now.getTime() - serviceDate.getTime() > 24 * 60 * 60 * 1000) {
                return ""; // No renderiza nada para este servicio
            }
        }

        let fecha = "Pendiente";
        if (fechaRaw) {
            const d = new Date(fechaRaw);
            fecha = d.toLocaleString('es-ES', { 
                weekday: 'short', 
                day: '2-digit', 
                month: 'short', 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: true 
            }).replace('.', '').toUpperCase();
        }
        const nombre = getServiceNombre(ser) || "Servicio";
        const lider = getServiceLider(ser) || "Por definir";
        
        // --- LÓGICA PARA CONTAR CANCIONES (Consistente con la limpieza de Excel) ---
        const rawIds = getServiceIds(ser);
        const listaIds = parseServiceIds(rawIds);
        const totalCanciones = listaIds.length;

        return `
            <div class="service-card" onclick="showServiceSongs(${i})">
                <div class="service-date"><i class="far fa-calendar-alt"></i></div>
                <div class="service-info">
                    <h3>${nombre}</h3>
                    <p>📅 ${fecha} • 🎤 ${lider}</p>
                    <p style="color: var(--primary); font-weight: 800; font-size: 0.65rem; margin-top: 4px;">
                        <i class="fas fa-list-ol"></i> ${totalCanciones} CANCIONES
                    </p>
                </div>
                <div class="service-card-actions">
                    <button class="dash-action-btn edit-btn" onclick="openEditServiceModalFromDash(event, ${i})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="dash-action-btn delete-btn" onclick="confirmDeleteService(event, ${i})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).filter(html => html !== "").join('');

    if (renderedCards === "") {
        container.innerHTML = "<p class='loading-small'>No hay servicios programados.</p>";
    } else {
        container.innerHTML = renderedCards;
    }
}

// 4. FILTRAR CANCIONES POR SERVICIO
function showServiceSongs(index) {
    // --- ESTA LÍNEA DEBE IR AQUÍ ADENTRO ---
    activeServiceInfo = servicesDatabase[index]; 

    const ser = servicesDatabase[index];
    const rawIds = getServiceIds(ser);
    const idsToFilter = parseServiceIds(rawIds);

    // Buscamos cada canción para que mantenga el orden exacto (3, 2, 1...) y con ID exacto
    currentSongList = idsToFilter.map(id => {
        return songsDatabase.find(song => song.ID.toString().trim() === id.toString().trim());
    }).filter(song => song !== undefined); 

    // Guardamos la lista de IDs para las flechas en este orden exacto
    currentServiceSongs = currentSongList.map(s => s.ID); 

    const nombre = getServiceNombre(ser) || "Servicio";
    document.getElementById('list-title').innerText = nombre;
    document.getElementById('list-subtitle').innerText = "Orden del Servicio";
    
    renderSongList(currentSongList);
    switchView('home-view');
    document.getElementById('share-wa-btn').style.display = 'flex';
}

function showAllSongs() {
    currentSongList = songsDatabase;
    
    // IMPORTANTE: Vaciamos la lista de servicio para que 
    // las flechas de navegación se oculten en el modo general
    currentServiceSongs = []; 
    
    document.getElementById('list-title').innerText = "Repertorio";
    document.getElementById('list-subtitle').innerText = "Todas las canciones";
    renderSongList(currentSongList);
    switchView('home-view');
    document.getElementById('share-wa-btn').style.display = 'none';
activeServiceInfo = null; // Limpiamos la info del servicio
}

function renderSongList(songs) {
    const list = document.getElementById('song-list-container');
    const favList = document.getElementById('favorites-list-container');
    const repList = document.getElementById('repertoire-list-container');
    
    let targetList = list;
    if (document.getElementById('favorites-view').classList.contains('active')) {
        targetList = favList;
    } else if (document.getElementById('repertoire-view').classList.contains('active')) {
        targetList = repList;
    }

    if (songs.length === 0) {
        targetList.innerHTML = "<p class='loading-small' style='text-align:center; padding-top:20px;'>No hay canciones.</p>";
        return;
    }

    targetList.innerHTML = ""; 

    songs.forEach((song, index) => {
        const isFav = favorites.includes(song.ID); // ¿Es favorita?
        const card = document.createElement('div');
        card.className = 'song-card';
        
        // Configuración de arrastre (solo si es un servicio)
        if (currentServiceSongs.length > 0) {
            card.draggable = true;
            card.dataset.index = index;
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragover', handleDragOver);
            card.addEventListener('drop', handleDrop);
            card.addEventListener('dragend', handleDragEnd);
        }

        const isInRep = repertoire.includes(song.ID);
        card.innerHTML = `
            <div class="fav-star ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, '${song.ID}')" title="Favorito">
                <i class="${isFav ? 'fas' : 'far'} fa-star"></i>
            </div>
            <div class="rep-folder ${isInRep ? 'active' : ''}" onclick="toggleRepertoire(event, '${song.ID}')" title="A mi repertorio">
                <i class="${isInRep ? 'fas' : 'far'} fa-folder"></i>
            </div>
            <div class="song-info-container" onclick="openSongByID('${song.ID}')">
                <h3 style="margin:0; font-size:1rem;">${song.Titulo}</h3>
                <p style="margin:2px 0 0; color:#64748b; font-size:0.8rem;">${song.Artista}</p>
            </div>
            <div class="song-badges">
                ${song.BPM > 0 ? `<div class="bpm-badge"><i class="fas fa-metronome"></i> BPM ${song.BPM}</div>` : ''}
                <div style="font-weight:800; color:#6366f1; background:#eef2ff; padding:4px 8px; border-radius:8px; font-size:0.75rem;">
    ${(() => {
        if (activeServiceInfo) {
            const serviceName = getServiceNombre(activeServiceInfo);
            const savedT = parseInt(localStorage.getItem('transp_' + serviceName + '_' + song.ID)) || 0;
            return getTransposedKeyName(song.Tono, savedT);
        }
        return song.Tono;
    })()}
</div>
            </div>
            <div class="remove-song-btn" onclick="removeSongFromCurrentService(event, '${song.ID}')">
                <i class="fas fa-minus-circle"></i>
            </div>
            ${currentServiceSongs.length > 0 ? `<div class="drag-handle"><i class="fas fa-bars"></i></div>` : ''}
        `;
        targetList.appendChild(card);
    });
}

// 5. VISUALIZADOR
async function openSongByID(id) {
    // 1. Limpieza total de procesos previos
    stopAutoScroll();
    if (metronomeInterval) {
        clearInterval(metronomeInterval);
        metronomeInterval = null;
    }
    // Borramos la letra vieja visualmente para evitar "flasheados" de la canción anterior
    const lyCont = document.getElementById('lyrics-container');
    if (lyCont) {
        lyCont.innerHTML = "<p class='loading-small'>Cargando letra...</p>";
        lyCont.scrollTop = 0;
    }
    currentSong = songsDatabase.find(s => s.ID.toString().trim() === id.toString().trim());
    if(!currentSong) return;

    // GUARDAR ORIGEN: Antes de entrar a la canción, anotamos en qué lista estábamos
    const activeView = document.querySelector('.view.active');
    if (activeView && activeView.id !== 'song-view') {
        lastListView = activeView.id;
    }

    // CARGAR TONO / INICIALIZAR TRANSPOSICIÓN SEGÚN EL CONTEXTO
    if (activeServiceInfo) {
        const serviceName = getServiceNombre(activeServiceInfo);
        const contextID = 'transp_' + serviceName + '_' + id;
        currentTransposition = parseInt(localStorage.getItem(contextID)) || 0;
    } else {
        currentTransposition = 0; // Tono original en vista general / favoritos
    }

    // Reinicios básicos 
    currentMode = 'musicos';
    updateScrollButtonVisibility(); // Ajustar visibilidad del botón de scroll según configuración activa
    
    // UI - Cabecera
    document.getElementById('btn-musicos').classList.add('active');
    document.getElementById('btn-voces').classList.remove('active');
    document.getElementById('view-title').innerText = currentSong.Titulo;
    document.getElementById('view-artist').innerText = currentSong.Artista;
    // Mostramos el tono transportado en la cabecera
    document.getElementById('current-key').innerText = getTransposedKeyName(currentSong.Tono, currentTransposition);

    // Control de Flechas y Barra de Navegación del Setlist (Detección dinámica)
    const nav = document.getElementById('setlist-nav');
    const songView = document.getElementById('song-view');
    if (nav) {
        if (currentServiceSongs.length > 1 && currentServiceSongs.includes(id.toString())) {
            nav.style.display = 'flex';
            if (songView) songView.classList.add('with-nav');
        } else {
            nav.style.display = 'none';
            if (songView) songView.classList.remove('with-nav');
        }
    }

    switchView('song-view');
    renderLyrics();
    updateRepertoireIconInView();
    
    // Forzar que el scroll de las letras y de la barra de herramientas comience desde el inicio
    const lyricsCont = document.getElementById('lyrics-container');
    if (lyricsCont) {
        lyricsCont.scrollTop = 0;
        lyricsCont.scrollLeft = 0;
    }
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
        toolbar.scrollLeft = 0;
    }
    
// Control dinámico de presencia del botón de YouTube
    const btnYoutube = document.getElementById('btn-youtube-link');
    if (btnYoutube) {
        if (currentSong.Youtube && currentSong.Youtube.trim() !== "") {
            btnYoutube.style.display = 'inline-flex';
        } else {
            btnYoutube.style.display = 'none';
        }
    }

    // Encendemos el metrónomo
    startMetronome(currentSong.BPM);
    applyCustomColors(); // Inyectar colores personalizados guardados
    // ACTIVAR MODO ESCENARIO (PANTALLA SIEMPRE ENCENDIDA)
    if ('wakeLock' in navigator) {
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
    }
}
function renderLyrics() {
    if (!currentSong) return;
    const container = document.getElementById('lyrics-container');
    container.style.fontSize = fontSize + 'px';
    
    let text = (currentMode === 'musicos') ? currentSong.Letra_Musicos : currentSong.Letra_Voces;
    
    if (!text || text.trim() === "") {
        container.innerHTML = `<p style="padding:20px; color:orange;">No hay contenido en ${currentMode}.</p>`;
        return;
    }

    let processed = text.trim().replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');

   // Solo procesar etiquetas manuales que vengan de Planning o puestas por ti
    processed = processed.replace(/{comment:\s*(.*?)}/gi, '<span class="section-tag">$1</span>');

    if (currentMode === 'musicos') {
        container.classList.add('musician-mode');
        // Activamos o removemos la doble columna según la preferencia elegida del músico
        if (currentColumnsLayout === '2-columnas') {
            container.classList.add('double-column');
        } else {
            container.classList.remove('double-column');
        }
        const notationStyle = currentNotationStyle;
        const activeKey = getTransposedKeyName(currentSong.Tono, currentTransposition);
        
        processed = processed.replace(/\[([^\]]+)\]/g, (m, chord) => {
            const transposed = transposeChord(chord, currentTransposition);
            const formatted = convertChordNotation(transposed, notationStyle, activeKey);
            return `<span class="chord-wrapper" data-chord="${formatted}">${formatted}</span>`;
        });
    } else {
        container.classList.remove('musician-mode');
        processed = processed.replace(/\[.*?\]/g, '');
    }

// Si hay una nota guardada, la mostramos en una cajita elegante arriba de la letra
    const savedNote = localStorage.getItem('note_global_' + currentSong.ID);
    const noteBox = document.getElementById('lyrics-note-box');
    const noteText = document.getElementById('lyrics-note-text');
    const indicator = document.getElementById('lyrics-note-indicator');

    if (savedNote && savedNote.trim() !== "") {
        if (noteText) noteText.innerHTML = `<b>NOTA:</b> ${savedNote}`;
        const isHidden = (sessionStorage.getItem('note_hidden_' + currentSong.ID) === 'true');
        
        if (noteBox) noteBox.style.display = isHidden ? 'none' : 'flex';
        if (indicator) indicator.style.display = isHidden ? 'flex' : 'none';
    } else {
        if (noteBox) noteBox.style.display = 'none';
        if (indicator) indicator.style.display = 'none';
    }
    container.innerHTML = processed;
    setTimeout(updatePageIndicator, 150); // Retraso de seguridad para que el navegador calcule el scrollWidth real
    applyCustomColors(); // Inyectar colores personalizados en vivo
}


// 6. FUNCIONES DE TRANSPOSICIÓN
function transposeChord(chord, steps) {
    if (steps === 0) return chord;
    const normalize = (c) => c.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
    return chord.replace(/[A-G][#b]?/g, (match) => {
        let index = scale.indexOf(normalize(match));
        if (index === -1) return match;
        let newIndex = (index + steps) % 12;
        if (newIndex < 0) newIndex += 12;
        return scale[newIndex];
    });
}

function changeKey(val) {
    currentTransposition += val;
    let tonoOriginal = currentSong.Tono || "C";
    const normalize = (c) => c.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
    let partes = tonoOriginal.match(/^([A-G][#b]?)(.*)/);
    
    if (partes) {
        let notaBase = partes[1];
        let calidad = partes[2];
        let indexBase = scale.indexOf(normalize(notaBase));
        if (indexBase !== -1) {
            let nuevoIndex = (indexBase + currentTransposition) % 12;
            if (nuevoIndex < 0) nuevoIndex += 12;
            document.getElementById('current-key').innerText = scale[nuevoIndex] + calidad;
        }
    }
    renderLyrics();

    // Solo guardamos el tono si estamos dentro de un servicio
    if (currentSong && activeServiceInfo) {
        const serviceName = getServiceNombre(activeServiceInfo);
        const contextID = 'transp_' + serviceName + '_' + currentSong.ID;
        localStorage.setItem(contextID, currentTransposition);
    }
}    

// 7. NAVEGACIÓN Y MODOS
function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-musicos').classList.toggle('active', mode === 'musicos');
    document.getElementById('btn-voces').classList.toggle('active', mode === 'voces');
    
    updateScrollButtonVisibility();
    renderLyrics();
}

function switchView(viewId, isBackAction = false) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');

    // LIMPIEZA DE BUSCADORES
    const buscadores = ['search-input', 'search-favorites', 'search-repertoire', 'modal-song-search'];
    buscadores.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    if (viewId === 'home-view') renderSongList(currentSongList);
// Control dinámico del botón de agregar canción flotante
    const btnAddSong = document.getElementById('btn-add-song');
    if (btnAddSong) {
        btnAddSong.style.display = (viewId === 'home-view' && currentServiceSongs.length === 0) ? 'block' : 'none';
    }

    // Solo guardamos en el historial si NO es una acción de "atrás" y NO es el inicio
    if (!isBackAction && viewId !== 'dashboard-view') {
        history.pushState({ view: viewId }, "");
    }
}
function goToDashboard() { switchView('dashboard-view'); }
function closeSong() {
    // 1. Matamos los procesos primero (Scroll y Metrónomo)
    stopAutoScroll();
    if (metronomeInterval) {
        clearInterval(metronomeInterval);
        metronomeInterval = null;
    }

    // 2. Reseteamos los valores de control de la canción
    scrollSpeed = 50; 
    speedLevel = 1.0;
    const speedDisp = document.getElementById('speed-display');
    if (speedDisp) speedDisp.innerText = '1.0x';

    // DESACTIVAR MODO ESCENARIO: Permite que la pantalla vuelva a su ahorro de energía normal
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
    }
    
	// Desactivar el Modo Escenario si estaba activo para no heredar el estado en la siguiente canción
    if (isTheaterModeActive) {
        toggleTheaterMode();
    }
    // 3. Volvemos primero a la vista de la lista de la que veníamos
    switchView(lastListView, true);

    // 4. Regeneramos y actualizamos los datos de la lista según la pantalla que se activó
    if (lastListView === 'favorites-view') {
        const favSongs = songsDatabase.filter(s => favorites.includes(s.ID));
        renderSongList(favSongs);
    } else if (lastListView === 'repertoire-view') {
        const repSongs = songsDatabase.filter(s => repertoire.includes(s.ID));
        renderSongList(repSongs);
    } else {
        renderSongList(currentSongList);
    }
}
// 8. UTILIDADES
function changeFontSize(val) {
    fontSize += val;
    if (fontSize < 10) fontSize = 10;
    renderLyrics();
}

function toggleAutoScroll() { isScrolling ? stopAutoScroll() : startAutoScroll(); }

function startAutoScroll() {
    isScrolling = true; 
    const icon = document.getElementById('scroll-icon');
    if (icon) icon.className = 'fas fa-pause';
    
    // Limpieza de seguridad antes de empezar
    if (scrollTimeout) clearTimeout(scrollTimeout);
    if (scrollInterval) clearInterval(scrollInterval);
    
    scrollTimeout = setTimeout(() => {
        // Verificamos si el usuario no canceló durante la espera de 1.5s
        if (!isScrolling) return; 
        
        scrollInterval = setInterval(() => {
            const container = document.getElementById('lyrics-container');
            if (container) {
                container.scrollBy(0, 1);
                // Si llega al final, se detiene solo
                if (Math.ceil(container.scrollTop + container.clientHeight) >= container.scrollHeight) {
                    stopAutoScroll();
                }
            }
        }, scrollSpeed);
    }, 1500); 
}

function stopAutoScroll() { 
    isScrolling = false; 
    
    // 1. Detenemos todos los motores inmediatamente
    if (scrollInterval) clearInterval(scrollInterval); 
    if (scrollTimeout) clearTimeout(scrollTimeout); 
    
    // 2. Reset de variables de motor
    scrollInterval = null;
    scrollTimeout = null;

    // 3. Cambiamos el icono SOLO si el elemento existe (esto evita que el código se trabe)
    const icon = document.getElementById('scroll-icon');
    if (icon) icon.className = 'fas fa-play'; 
}

function showToast(msg, type) {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 3000);
}

// 9. MODAL & GUARDADO
function openServiceModal() { 
    tempSelectedSongs = []; 
    renderSelectedSongs(); 
    
    // Limpiamos el buscador del modal
    const modalInput = document.getElementById('modal-song-search');
    if (modalInput) modalInput.value = "";
    document.getElementById('modal-search-results').style.display = 'none';

    document.getElementById('service-modal').style.display = 'flex'; 
    // Registramos la apertura para que no se salga de la App al dar atrás
    history.pushState({ modal: 'service-modal' }, "");
}

function closeServiceModal() { 
    // 1. Limpiamos los campos de texto del formulario
    document.getElementById('new-service-name').value = "";
    document.getElementById('new-service-date').value = "";
    document.getElementById('new-service-leader').value = "";
    document.getElementById('modal-song-search').value = "";

    // 2. Ocultamos los resultados de búsqueda
    document.getElementById('modal-search-results').style.display = 'none';

    // 3. Vaciamos el setlist temporal
    tempSelectedSongs = [];
    renderSelectedSongs();

    // 4. Cerramos visualmente
    if (history.state && history.state.modal === 'service-modal') {
        history.back();
    } else {
        document.getElementById('service-modal').style.display = 'none';
    }
}

function searchSongsForModal() {
    const term = cleanText(document.getElementById('modal-song-search').value);
    const resultsDiv = document.getElementById('modal-search-results');
    if (term.length < 2) { resultsDiv.style.display = 'none'; return; }
    const filtered = songsDatabase.filter(s => 
        cleanText(s.Titulo).includes(term) || 
        cleanText(s.Artista).includes(term)
    );
    resultsDiv.style.display = filtered.length > 0 ? 'block' : 'none';
    resultsDiv.innerHTML = filtered.map(s => `<div class="modal-search-item" onclick="addSongToService('${s.ID}', '${s.Titulo.replace(/'/g, "\\'")}')"><span>${s.Titulo}</span><small>${s.Artista}</small></div>`).join('');
}

function addSongToService(id, titulo) {
    if (tempSelectedSongs.find(s => s.id === id)) return showToast("Ya está en la lista", "error");
    tempSelectedSongs.push({ id: id, titulo: titulo });
    document.getElementById('modal-song-search').value = "";
    document.getElementById('modal-search-results').style.display = 'none';
    renderSelectedSongs();
}

function renderSelectedSongs() {
    const list = document.getElementById('selected-songs-list');
    list.innerHTML = tempSelectedSongs.length === 0 ? '<p class="empty-msg">Sin canciones</p>' : 
        tempSelectedSongs.map(s => `<div class="selected-song-pill"><span>${s.titulo}</span><i class="fas fa-times" onclick="removeSongFromService('${s.id}')"></i></div>`).join('');
}

function removeSongFromService(id) { tempSelectedSongs = tempSelectedSongs.filter(s => s.id !== id); renderSelectedSongs(); }

async function saveNewService() {
    const name = document.getElementById('new-service-name').value;
    const date = document.getElementById('new-service-date').value;
    const leader = document.getElementById('new-service-leader').value;
    if (!name || !date || tempSelectedSongs.length === 0) return showToast("Faltan datos", "error");
    // Forzamos a que los IDs se guarden con una comilla simple al inicio (truco de Excel para texto)
    const idsString = "'" + tempSelectedSongs.map(s => s.id).join(',');
    showToast("Guardando...", "info");
    try {
        await fetch(WEB_APP_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ fecha: date, nombre: name, ids: idsString, lider: leader }) });
        showToast("¡Servicio guardado!", "success");
        setTimeout(() => location.reload(), 1500);
    } catch (e) { showToast("Error al guardar", "error"); }
}

// 10. BUSCADOR PRINCIPAL (FLEXIBLE CON TILDES Y MAYÚSCULAS)
document.getElementById('search-input').oninput = (e) => {
    const term = cleanText(e.target.value);
    const filtered = currentSongList.filter(s => 
        cleanText(s.Titulo).includes(term) || 
        cleanText(s.Artista).includes(term)
    );
    renderSongList(filtered);
};

// --- FUNCIONES DE AJUSTES VISUALES ---

function openSettingsModal() {
    // Guardamos copias de seguridad de la sesión activa
    tempThemeBackup = localStorage.getItem('userTheme') || 'day';
    tempNotationBackup = localStorage.getItem('chordNotation') || 'estandar';
    tempColumnsLayoutBackup = localStorage.getItem('chordColumnsLayout') || '2-columnas';
    tempTitleColorBackup = localStorage.getItem('customTitleColor') || '';
    tempTextColorBackup = localStorage.getItem('customTextColor') || '';
    
    currentNotationStyle = tempNotationBackup;
    currentColumnsLayout = tempColumnsLayoutBackup;
    currentTitleColor = tempTitleColorBackup;
    currentTextColor = tempTextColorBackup;

    // Cargar y marcar el formato de acordes activo
    document.querySelectorAll('.notation-option').forEach(opt => opt.classList.remove('active'));
    
    const notationToActive = document.getElementById('notation-' + currentNotationStyle);
    if (notationToActive) notationToActive.classList.add('active');

    // Cargar y marcar el formato de columnas activo
    const colToActive = document.getElementById('columns-' + currentColumnsLayout);
    if (colToActive) colToActive.classList.add('active');

    // Dibujar paletas de colores interactivas
    renderColorPickers();

    document.getElementById('settings-modal').style.display = 'flex';
    // Registramos que abrimos ajustes para que "Atrás" no cierre la App
    history.pushState({ modal: 'settings-modal' }, "");
}

function closeSettingsModal() {
    // Revertimos tema
    revertThemeToSaved();
    
    // Revertimos notación, diseño de columnas y colores
    currentNotationStyle = tempNotationBackup;
    currentColumnsLayout = tempColumnsLayoutBackup;
    currentTitleColor = tempTitleColorBackup;
    currentTextColor = tempTextColorBackup;
    
    updateScrollButtonVisibility();
    if (currentSong) {
        renderLyrics();
    }
    applyCustomColors(); // Restaurar color previo

    document.getElementById('settings-modal').style.display = 'none';
    if (history.state && history.state.modal === 'settings-modal') {
        history.back();
    }
}

function setTheme(themeName) {
    // 1. Quitamos todos los temas anteriores del body
    document.body.classList.remove('theme-night', 'theme-forest', 'theme-ocean');
    
    // 2. Quitamos la marca de "activo" de todos los botones del modal
    document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'));
    
    // 3. Aplicamos el nuevo tema si no es el de por defecto (day)
    if (themeName !== 'day') {
        document.body.classList.add('theme-' + themeName);
    }
    
    // 4. Marcamos el botón seleccionado como activo en el modal
    const optSelected = document.getElementById('theme-' + themeName);
    if (optSelected) optSelected.classList.add('active');
    
    // 5. Mostramos toast de previsualización sin guardar en localStorage
    showToast("Previsualizando " + themeName, "info");
}

// Cargar el tema guardado automáticamente al iniciar la App
// (Añade esta línea dentro de tu window.onload o al final del archivo)
// --- SISTEMA DE ELIMINACIÓN CORREGIDO ---

// 1. Esta función se activa al tocar el basurero
function confirmDeleteService(event, index) {
    event.stopPropagation(); // Evita que se abra el servicio
    
    // Guardamos el servicio en la variable antes de preguntar
    serviceToDelete = servicesDatabase[index]; 
    
    if (!serviceToDelete) return;

    // Buscamos el nombre para el mensaje de forma ultra-robusta
    const nombre = getServiceNombre(serviceToDelete) || "este servicio";
    
    document.getElementById('delete-service-info').innerText = `Vas a eliminar "${nombre}". Esta acción no se puede deshacer.`;
    document.getElementById('delete-confirm-modal').style.display = 'flex';
    // Registramos que abrimos el cuadro de borrado
    history.pushState({ modal: 'delete-confirm-modal' }, "");
}

// 2. Cerramos el modal
function closeDeleteModal() {
    serviceToDelete = null;
    if (history.state && history.state.modal === 'delete-modal') {
        history.back();
    } else {
        document.getElementById('delete-confirm-modal').style.display = 'none';
    }
}

// 3. Esta función envía la orden REAL al Excel
async function executeDelete() {
    if (!serviceToDelete) {
        showToast("Error: No hay servicio seleccionado", "error");
        return;
    }
    
    // GUARDAMOS LOS DATOS antes de cerrar el modal
            const datosABorrar = serviceToDelete;
            const nombreKey = Object.keys(datosABorrar).find(k => k.toLowerCase().includes('nombre'));
            const nombreEnviado = datosABorrar[nombreKey];
            
            // Buscamos la fecha del servicio para garantizar una eliminación única
            const fechaKey = Object.keys(datosABorrar).find(k => k.toLowerCase().includes('fecha'));
            const fechaEnviada = datosABorrar[fechaKey];

            // Buscamos también el líder del servicio para resolver duplicados de horario
            const liderKey = Object.keys(datosABorrar).find(k => k.toLowerCase().includes('lider') || k.toLowerCase().includes('líder') || k.toLowerCase().includes('director'));
            const liderEnviado = liderKey ? datosABorrar[liderKey] : "";

            // Ahora sí cerramos la ventana
            document.getElementById('delete-confirm-modal').style.display = 'none';
            showToast("Eliminando de la base de datos...", "info");

            const payload = {
                action: 'delete',
                nombre: nombreEnviado.toString(),
                fecha: fechaEnviada.toString(),
                lider: liderEnviado.toString()
            };

    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors', 
            body: JSON.stringify(payload)
        });

        // Como no podemos leer la respuesta por seguridad de Google (no-cors),
        // avisamos y recargamos la página para ver los cambios
        showToast("Orden enviada con éxito", "success");
        setTimeout(() => {
            location.reload();
        }, 1500);
        
    } catch (e) {
        console.error("Error al eliminar:", e);
        showToast("Error de conexión", "error");
    }
}

// --- LÓGICA DE NAVEGACIÓN Y METRÓNOMO ---

function prevSongInSet() {
    let idx = currentServiceSongs.indexOf(currentSong.ID);
    if (idx > 0) openSongByID(currentServiceSongs[idx - 1]);
}

// --- NAVEGACIÓN ENTRE CANCIONES ---
function nextSongInSet() {
    let idx = currentServiceSongs.indexOf(currentSong.ID);
    if (idx < currentServiceSongs.length - 1) openSongByID(currentServiceSongs[idx + 1]);
}

function toggleMetronomeSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    isMetronomeSoundEnabled = !isMetronomeSoundEnabled;
    document.getElementById('metronome-sound-icon').className = isMetronomeSoundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
}

function startMetronome(bpm) {
    if (metronomeInterval) clearInterval(metronomeInterval);
    const visual = document.getElementById('metronome-visual');
    if (!visual || !bpm || bpm == 0) { if(visual) visual.style.display = 'none'; return; }
    visual.style.display = 'block';
    const ms = (60 / bpm) * 1000;
    metronomeInterval = setInterval(() => {
        visual.classList.add('metronome-pulse');
        setTimeout(() => visual.classList.remove('metronome-pulse'), 100);
        if (isMetronomeSoundEnabled && audioCtx) playMetronomeClick();
    }, ms);
}

function playMetronomeClick() {
    const osc = audioCtx.createOscillator(), env = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
    env.gain.setValueAtTime(0, audioCtx.currentTime);
    env.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    osc.connect(env); env.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}

// --- LÓGICA DE ARRASTRAR CANCIONES ---

let dragStartIndex;

function handleDragStart(e) {
    dragStartIndex = +this.getAttribute('data-index');
    this.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault(); // Necesario para permitir el "soltar"
}

function handleDrop(e) {
    const dragEndIndex = +this.getAttribute('data-index');
    swapItems(dragStartIndex, dragEndIndex);
    this.classList.remove('dragging');
}

function handleDragEnd() {
    this.classList.remove('dragging');
}

// Función que intercambia las canciones en la lista y redibuja
function swapItems(fromIndex, toIndex) {
    const itemTarget = currentSongList[fromIndex];
    currentSongList.splice(fromIndex, 1);
    currentSongList.splice(toIndex, 0, itemTarget);
    
    // Actualizamos la lista de IDs local
    currentServiceSongs = currentSongList.map(s => s.ID);

    // Dibujamos la lista con el nuevo orden
    renderSongList(currentSongList);
    
    // --- NUEVO: GUARDAR EN EXCEL ---
    saveNewOrderToExcel();
}

// NUEVA FUNCIÓN PARA ENVIAR EL ORDEN AL EXCEL
async function saveNewOrderToExcel() {
    if (!activeServiceInfo) return;

    // Buscamos el nombre, fecha y líder del servicio actual de forma ultra-robusta
           const nombreServicio = getServiceNombre(activeServiceInfo);
           const fechaServicio = getServiceFecha(activeServiceInfo);
           const liderServicio = getServiceLider(activeServiceInfo);
           
           // Unimos los IDs en el nuevo orden
           const nuevosIds = currentServiceSongs.join(',');

           showToast("Guardando orden...", "info");

           try {
               await fetch(WEB_APP_URL, {
                   method: 'POST',
                   mode: 'no-cors',
                   body: JSON.stringify({
                       action: 'update_order',
                       nombre: nombreServicio.toString(),
                       fecha: fechaServicio.toString(),
                       lider: liderServicio.toString(),
                       ids: nuevosIds
                   })
               });
        showToast("Orden guardado permanentemente", "success");
    } catch (e) {
        showToast("Error al guardar orden en la nube", "error");
    }
}

// FUNCIÓN PARA AGREGAR/QUITAR DE FAVORITOS
function toggleFavorite(event, id) {
    event.stopPropagation(); // Evita que se abra la canción al tocar la estrella
    const index = favorites.indexOf(id);
    
    if (index > -1) {
        favorites.splice(index, 1); // Quitar
        showToast("Eliminada de favoritos", "info");
    } else {
        favorites.push(id); // Agregar
        showToast("¡Añadida a favoritos!", "success");
    }
    
    // Guardar en la memoria del celular
    localStorage.setItem('songChordFavorites', JSON.stringify(favorites));
    
    // Actualizar la vista actual de forma inteligente según la sección activa
        if (document.getElementById('favorites-view').classList.contains('active')) {
            showFavorites();
        } else if (document.getElementById('repertoire-view').classList.contains('active')) {
            showRepertoire();
        } else {
            renderSongList(currentSongList);
        }
    }

// FUNCIÓN PARA MOSTRAR LA PANTALLA DE FAVORITOS
function showFavorites() {
    activeServiceInfo = null; // Limpiamos la info del servicio
    currentServiceSongs = []; // Evitamos que queden restos de navegación de servicio
    
    // Limpiamos el buscador de favoritos al entrar
    const inputFav = document.getElementById('search-favorites');
    if(inputFav) inputFav.value = "";
    
    const favSongs = songsDatabase.filter(s => favorites.includes(s.ID));
    switchView('favorites-view');
    renderSongList(favSongs, 'favorites-list-container');
}

// --- FUNCIÓN PARA COMPARTIR POR WHATSAPP ---
function shareSetlist() {
    if (!activeServiceInfo || currentSongList.length === 0) return;

    // Extraer datos del servicio
    const get = (k) => activeServiceInfo[Object.keys(activeServiceInfo).find(key => key.toLowerCase().includes(k))];
    const nombre = get('nombre') || "Servicio";
    const rawDate = get('fecha');
    const lider = get('líder') || get('director') || "Por definir";

    // FORMATEO DE FECHA Y HORA (Español Latino + AM/PM)
    let fechaTexto = "Pendiente";
    if (rawDate) {
        const d = new Date(rawDate);
        fechaTexto = d.toLocaleString('es-ES', { 
            weekday: 'short', 
            day: '2-digit', 
            month: 'short', 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: true 
        }).replace('.', '').toUpperCase(); // Ejemplo: MAR 21 JUN 09:00 AM
    }

    // Armar el mensaje con estilo renovado
    // Usamos códigos Unicode para evitar que el Bloc de Notas dañe los iconos
    const iconGuitarra = "\uD83C\uDFB8"; // Guitarra
    const iconCalendario = "\uD83D\uDCC5"; // Calendario
    const iconMicrofono = "\uD83C\uDFA4"; // Micrófono

    let mensaje = `${iconGuitarra} *SETLIST: ${nombre.toUpperCase()}*\n`;
    mensaje += `${iconCalendario} *FECHA:* ${fechaTexto}\n`;
    mensaje += `${iconMicrofono} *LÍDER:* ${lider}\n\n`;
    mensaje += `*CANCIONES:*\n`;

    currentSongList.forEach((song, i) => {
        const serviceName = getServiceNombre(activeServiceInfo);
        const savedT = parseInt(localStorage.getItem('transp_' + serviceName + '_' + song.ID)) || 0;
        const tonoParaWA = getTransposedKeyName(song.Tono, savedT);
        mensaje += `${i + 1}. ${song.Titulo} (${tonoParaWA})\n`;
    });

    mensaje += `\n_Enviado desde SongChord Live Pro_`;

    // Crear el enlace de WhatsApp
    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    
    // Abrir en una pestaña nueva
    window.open(url, '_blank');
}

// FUNCIÓN PARA BUSCAR DENTRO DE FAVORITOS
function filterFavorites() {
    const term = cleanText(document.getElementById('search-favorites').value);
    
    // Filtramos solo entre las canciones que son favoritas
    const filteredFavs = songsDatabase.filter(s => 
        favorites.includes(s.ID) && 
        (cleanText(s.Titulo).includes(term) || cleanText(s.Artista).includes(term))
    );
    
    renderSongList(filteredFavs, 'favorites-list-container');
}

// FUNCIÓN PARA CAMBIAR VELOCIDAD DE SCROLL
function changeScrollSpeed(delta) {
    // Delta 1: Más Lento | Delta -1: Más Rápido
    if (delta === 1) {
        if (speedLevel > 0.2) {
            speedLevel = parseFloat((speedLevel - 0.2).toFixed(1));
        }
    } else {
        if (speedLevel < 2.0) {
            speedLevel = parseFloat((speedLevel + 0.2).toFixed(1));
        }
    }

    if (speedLevel <= 0) speedLevel = 0.2;

    // Mapeo no lineal para que las diferencias de velocidad de scroll sean sumamente notorias
    const speedMap = {
        0.2: 220,
        0.4: 150,
        0.6: 100,
        0.8: 70,
        1.0: 50,
        1.2: 38,
        1.4: 28,
        1.6: 20,
        1.8: 14,
        2.0: 8
    };

    scrollSpeed = speedMap[speedLevel] || 50;

    document.getElementById('speed-display').innerText = speedLevel.toFixed(1) + 'x';

    if (isScrolling) {
        clearInterval(scrollInterval);
        startAutoScroll();
    }
}
// FUNCIONES DE EDICIÓN DE SERVICIO
function openEditServiceModal() {
    if (!activeServiceInfo) return;
    
    // Cambiamos el título y etiquetas del modal existente para reutilizarlo
    document.querySelector('#service-modal h3').innerText = "Editar Servicio / Añadir Canciones";

    // Llenamos los campos con la info actual de forma mega-robusta
    document.getElementById('new-service-name').value = getServiceNombre(activeServiceInfo);
    let rawDate = getServiceFecha(activeServiceInfo);
    if (rawDate) {
        let d = new Date(rawDate);
        // Esto ajusta la fecha al formato YYYY-MM-DDTHH:MM que requiere el navegador
        let yyyy = d.getFullYear();
        let mm = String(d.getMonth() + 1).padStart(2, '0');
        let dd = String(d.getDate()).padStart(2, '0');
        let hh = String(d.getHours()).padStart(2, '0');
        let min = String(d.getMinutes()).padStart(2, '0');
        document.getElementById('new-service-date').value = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    }
    document.getElementById('new-service-leader').value = getServiceLider(activeServiceInfo);
    
    // Cargamos las canciones actuales en la lista temporal de selección
    tempSelectedSongs = currentSongList.map(s => ({ id: s.ID, titulo: s.Titulo }));
    renderSelectedSongs();

    // Cambiamos la función del botón "Guardar" del modal para que actualice en lugar de crear
    const saveBtn = document.querySelector('#service-modal .save-btn');
    saveBtn.innerText = "Actualizar Todo";
    saveBtn.onclick = updateServiceData;

    document.getElementById('service-modal').style.display = 'flex';
    // Registramos la apertura para que el botón atrás del celular no cierre la App (Corrección)
    history.pushState({ modal: 'service-modal' }, "");
}

async function updateServiceData() {
    const name = document.getElementById('new-service-name').value;
    const date = document.getElementById('new-service-date').value;
    const leader = document.getElementById('new-service-leader').value;
    const idsString = tempSelectedSongs.map(s => s.id).join(',');

    if (!name || !date) return showToast("Nombre y Fecha son obligatorios", "error");

    showToast("Actualizando servicio...", "info");

    const payload = {
            action: 'update_metadata',
            old_name: getServiceNombre(activeServiceInfo).toString(),
            old_fecha: getServiceFecha(activeServiceInfo).toString(),
            old_lider: getServiceLider(activeServiceInfo).toString(),
            nombre: name,
            fecha: date,
            ids: idsString,
            lider: leader
        };

    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(payload)
        });
        showToast("¡Servicio actualizado!", "success");
        setTimeout(() => location.reload(), 1500);
    } catch (e) {
        showToast("Error al actualizar", "error");
    }
}

function removeSongFromCurrentService(event, songId) {
    event.stopPropagation();
    if (!confirm("¿Quitar esta canción del setlist?")) return;
    
    currentSongList = currentSongList.filter(s => s.ID !== songId);
    currentServiceSongs = currentSongList.map(s => s.ID);
    
    renderSongList(currentSongList);
    saveNewOrderToExcel(); // Reutiliza tu función existente para guardar el nuevo orden
}

// Función para abrir edición directamente desde el Dashboard
function openEditServiceModalFromDash(event, index) {
    event.stopPropagation(); // Evita que se abra la lista de canciones
    activeServiceInfo = servicesDatabase[index]; // Seleccionamos el servicio
    
    // Obtenemos los IDs actuales para que no se pierdan
    const rawIds = getServiceIds(activeServiceInfo);
    const idsToFilter = parseServiceIds(rawIds);
    
    // Cargamos la lista de canciones actual
    currentSongList = idsToFilter.map(id => {
        return songsDatabase.find(song => song.ID.toString().trim() === id.toString().trim());
    }).filter(song => song !== undefined);

    openEditServiceModal(); // Abrimos el modal que ya teníamos
}

function openKeyModal() {
    const container = document.getElementById('key-list-options');
    if (!currentSong || !container) return;

    const originalKey = currentSong.Tono || "C";
    const normalize = (c) => c.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
    
    let baseMatch = originalKey.match(/^([A-G][#b]?)/);
    let baseOriginal = baseMatch ? normalize(baseMatch[1]) : "C";
    let indexOriginal = scale.indexOf(baseOriginal);

    container.innerHTML = scale.map((nota, i) => {
        let steps = i - indexOriginal;
        let isSelected = (steps === currentTransposition);
        
        // Si el índice actual es el original, le sumamos la palabra
        let label = (i === indexOriginal) ? nota + " - Original" : nota;
        
        return `<div class="key-option-item ${isSelected ? 'selected' : ''}" onclick="selectKey(${steps})">${label}</div>`;
    }).join('');
    
    document.getElementById('key-modal').style.display = 'flex';
    history.pushState({ modal: 'key-modal' }, "");
}
function closeKeyModal() {
    if (history.state && history.state.modal === 'key-modal') {
        history.back();
    } else {
        document.getElementById('key-modal').style.display = 'none';
    }
}

function selectKey(steps) {
    currentTransposition = steps;
    changeKey(0); // Refresca y guarda
    closeKeyModal();
}

function applySettings() {
    let selectedTheme = 'day';
    if (document.getElementById('theme-night').classList.contains('active')) selectedTheme = 'night';
    else if (document.getElementById('theme-forest').classList.contains('active')) selectedTheme = 'forest';
    else if (document.getElementById('theme-ocean').classList.contains('active')) selectedTheme = 'ocean';

    // Guardar tema
    localStorage.setItem('userTheme', selectedTheme);
    tempThemeBackup = selectedTheme; 

    // Guardar formato de acordes
    localStorage.setItem('chordNotation', currentNotationStyle);
    tempNotationBackup = currentNotationStyle;

    // Guardar diseño de columnas
    localStorage.setItem('chordColumnsLayout', currentColumnsLayout);
    tempColumnsLayoutBackup = currentColumnsLayout;

    // Guardar colores confirmados (Corrección UX)
    localStorage.setItem('customTitleColor', currentTitleColor);
    tempTitleColorBackup = currentTitleColor;
    
    localStorage.setItem('customTextColor', currentTextColor);
    tempTextColorBackup = currentTextColor;

    updateScrollButtonVisibility();
    showToast("Ajustes aplicados con éxito", "success");
    
    if (history.state && history.state.modal === 'settings-modal') {
        history.back();
    } else {
        document.getElementById('settings-modal').style.display = 'none';
    }
}

function getTransposedKeyName(originalKey, steps) {
    if (steps === 0 || !originalKey) return originalKey;
    const normalize = (c) => c.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
    let partes = originalKey.match(/^([A-G][#b]?)(.*)/);
    if (!partes) return originalKey;
    let notaBase = partes[1];
    let calidad = partes[2];
    let indexBase = scale.indexOf(normalize(notaBase));
    if (indexBase === -1) return originalKey;
    let nuevoIndex = (indexBase + steps) % 12;
    if (nuevoIndex < 0) nuevoIndex += 12;
    return scale[nuevoIndex] + calidad;
}

function showMinistrySchedule() {
    switchView('ministry-view');
    renderMinistryGrid();
    // Registramos la entrada a esta vista en el historial
    history.pushState({ view: 'ministry-view' }, "");
}

function renderMinistryGrid() {
    const container = document.getElementById('ministry-grid-container');
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    document.getElementById('current-month-label').innerText = `${meses[month].toUpperCase()} ${year}`;

    let html = "";
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
        let date = new Date(year, month, d);
        let dayNum = date.getDay();
        
        if (dayNum === 0 || dayNum === 6 || dayNum === 3) {
            const dayNames = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
            const slotID = `${year}-${month + 1}-${d}`;
            const assignment = ministryData[slotID] || { name: "Disponible", note: "" };
            const isAvailable = (assignment.name === "Disponible");

            html += `
                <div class="ministry-card ${dayNum === 0 ? 'sunday' : (dayNum === 6 ? 'saturday' : 'wednesday')}" 
                     onclick="openAssignModal('${slotID}', '${d} ${meses[month]}')"
                     data-empty="${isAvailable}">
                    <div class="m-day">${dayNames[dayNum]}</div>
                    <div class="m-date">${d}</div>
                    <div class="m-leader">${assignment.name}</div>
                    <div class="m-note">${assignment.note}</div>
                </div>`;
        }
    }
    container.innerHTML = html;
}

function openAssignModal(slotID, dateText) {
    selectedDaySlot = slotID;
    document.getElementById('assign-date-text').innerText = dateText;
    const current = ministryData[slotID] || { name: "", note: "" };
    document.getElementById('input-assign-name').value = current.name === "Disponible" ? "" : current.name;
    document.getElementById('input-assign-note').value = current.note;
    document.getElementById('assign-leader-modal').style.display = 'flex';
history.pushState({ modal: 'assign-leader-modal' }, "");
}

function closeAssignModal() {
    document.getElementById('assign-leader-modal').style.display = 'none';
}

async function saveAssignment() {
    const name = document.getElementById('input-assign-name').value.trim();
    const note = document.getElementById('input-assign-note').value.trim();
ministryData[selectedDaySlot] = { name: name || "Disponible", note: note };
    showToast("Sincronizando con nube...", "info");

    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: 'update_ministry',
                slotId: selectedDaySlot.toString(), // Guardamos como texto puro
                nombre: name || "Disponible",
                nota: note
            })
        });
        
        showToast("¡Guardado en la nube!", "success");
        closeAssignModal();    
   
        renderMinistryGrid();
    } catch (e) {
        showToast("Error de conexión", "error");
    }
}

// CEREBRO DE NAVEGACIÓN ATRÁS (Captura el botón físico del celular)
window.onpopstate = function(event) {
    // 1. Cerrar cualquier cuadro (Modal) que esté abierto
    const modales = ['service-modal', 'delete-confirm-modal', 'settings-modal', 'key-modal', 'assign-leader-modal', 'note-modal', 'edit-song-modal', 'add-song-modal', 'add-song-password-modal'];
    for (let id of modales) {
        let el = document.getElementById(id);
        if (el && el.style.display === 'flex') {
            el.style.display = 'none';
            if (id === 'settings-modal') {
                revertThemeToSaved();
            }
            return; // Bloqueamos la salida para que solo cierre el modal
        }
    }

    // 2. Manejar las Pantallas (Views)
    const activeViewElement = document.querySelector('.view.active');
    if (!activeViewElement) return;
    const activeView = activeViewElement.id;

    if (activeView === 'song-view') {
        stopAutoScroll();
        if (metronomeInterval) { clearInterval(metronomeInterval); metronomeInterval = null; }
        switchView(lastListView, true);
    } else if (activeView === 'home-view' || activeView === 'favorites-view' || activeView === 'repertoire-view' || activeView === 'ministry-view') {
        goToDashboard();
    }
};

// --- FUNCIONES DE NOTAS E IMPRESIÓN ---
function openInterpretNote() {
    if (!currentSong) return;
    const noteID = 'note_global_' + currentSong.ID;
    document.getElementById('interpret-note-text').value = localStorage.getItem(noteID) || "";
    document.getElementById('note-modal').style.display = 'flex';
    // Avisamos al sistema que hay un cuadro abierto
    history.pushState({ modal: 'note-modal' }, "");
}

function closeNoteModal() {
    // Simplemente cerramos el cuadro. El "Portero" (onpopstate) se encargará del resto si usas el botón atrás.
    if (history.state && history.state.modal === 'note-modal') {
        history.back(); // El portero (onpopstate) se encargará de ocultarlo
    } else {
        document.getElementById('note-modal').style.display = 'none';
    }
}

function saveInterpretNote() {
    if (!currentSong) return;
    const noteID = 'note_global_' + currentSong.ID;
    const val = document.getElementById('interpret-note-text').value.trim();

    if (val === "") {
        localStorage.removeItem(noteID);
        showToast("✨ Notas borradas.", "info");
    } else {
        localStorage.setItem(noteID, val);
        showToast("✅ Nota guardada.", "success");
    }

    renderLyrics();
    closeNoteModal();
}

function preparePrint() {
    // Simplemente usamos el comando nativo. El CSS se encargará del resto.
    window.print();
}

function shareApp(platform) {
    const url = window.location.href;
    const text = encodeURIComponent("🎸 *SongChord Live Pro* 🎹\n¡La App definitiva para músicos y directores de alabanza!\n\nLink aquí: ");
    let shareUrl = "";

    if (platform === 'wa') shareUrl = `https://wa.me/?text=${text}${url}`;
    if (platform === 'fb') {
        if (url.startsWith('file')) {
            return showToast("⚠️ Sube la App a GitHub para compartir", "info");
        }
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    }
    if (platform === 'mail') shareUrl = `mailto:?subject=Te comparto SongChord Live Pro&body=${text}${url}`;
    
    window.open(shareUrl, '_blank');
}

// --- FUNCIONES COMPLETAS AUXILIARES DE TEMA (APICADO Y REVERSIÓN) ---
function applyThemeClass(themeName) {
    document.body.classList.remove('theme-night', 'theme-forest', 'theme-ocean');
    if (themeName !== 'day') {
        document.body.classList.add('theme-' + themeName);
    }
}

function revertThemeToSaved() {
    const savedTheme = localStorage.getItem('userTheme') || 'day';
    applyThemeClass(savedTheme);
}

// Función para sincronizar de manera forzada y amigable
async function syncApp(showToastFeedback = false) {
    const icon = document.getElementById('sync-icon');
    if (icon) {
        icon.classList.add('fa-spin');
    }
    
    if (showToastFeedback) {
        showToast("Sincronizando con Google Sheets...", "info");
    }
    
    try {
        await initApp();
        if (showToastFeedback) {
            showToast("Plataforma Sincronizada", "success");
        }
    } catch (e) {
        console.error("Error al sincronizar:", e);
        if (showToastFeedback) {
            showToast("Fallo al conectar con Google Sheets", "error");
        }
    } finally {
        if (icon) {
            setTimeout(() => {
                icon.classList.remove('fa-spin');
            }, 800);
        }
    }
}

// --- FUNCIONES COMPLETAS DE GESTIÓN PARA MI REPERTORIO ---
function toggleRepertoire(event, id) {
    if (event) event.stopPropagation(); // Evita que se abra la canción
    const index = repertoire.indexOf(id);
    
    if (index > -1) {
        repertoire.splice(index, 1);
        showToast("Quitada de mi repertorio", "info");
    } else {
        repertoire.push(id);
        showToast("¡Añadida a mi repertorio!", "success");
    }
    
    localStorage.setItem('songChordRepertoire', JSON.stringify(repertoire));
    
    // Forzar actualización visual inteligente según la sección activa
    if (document.getElementById('repertoire-view').classList.contains('active')) {
        showRepertoire();
    } else if (document.getElementById('favorites-view').classList.contains('active')) {
        showFavorites();
    } else {
        renderSongList(currentSongList);
    }
    
    if (currentSong && currentSong.ID === id) {
        updateRepertoireIconInView();
    }
}

function showRepertoire() {
    activeServiceInfo = null;
    currentServiceSongs = [];
    
    const inputRep = document.getElementById('search-repertoire');
    if(inputRep) inputRep.value = "";
    
    const repSongs = songsDatabase.filter(s => repertoire.includes(s.ID));
    switchView('repertoire-view');
    renderSongList(repSongs);
}

function filterRepertoire() {
    const term = cleanText(document.getElementById('search-repertoire').value);
    const filteredReps = songsDatabase.filter(s => 
        repertoire.includes(s.ID) && 
        (cleanText(s.Titulo).includes(term) || cleanText(s.Artista).includes(term))
    );
    renderSongList(filteredReps);
}

function toggleRepertoireFromView() {
    if (!currentSong) return;
    toggleRepertoire(null, currentSong.ID);
}

function updateRepertoireIconInView() {
    if (!currentSong) return;
    const icon = document.getElementById('view-repertoire-icon');
    if (icon) {
        const isInRep = repertoire.includes(currentSong.ID);
        icon.className = isInRep ? 'fas fa-folder' : 'far fa-folder';
        icon.style.color = isInRep ? '#10b981' : 'inherit'; // Cambia a verde al estar activa
    }
}

// --- TRADUCCIÓN DINÁMICA DE CIFRADOS Y GRÁFICOS (ESTÁNDAR, SOLFEO, NASHVILLE) ---
function convertChordNotation(chord, style, activeKey) {
    if (!style || style === 'estandar') return chord;

    const normalize = (c) => c.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
    
    // Separa nota base (raíz) y la calidad/extensión del acorde
    const match = chord.match(/^([A-G][#b]?)(.*)/);
    if (!match) return chord;
    
    const root = match[1];
    const quality = match[2];

    // Formato 2: Solfeo Latino (Do, Re, Mi...)
    if (style === 'solfeo') {
        const angloToLatin = {
            'C': 'Do', 'C#': 'Do#', 'Db': 'Reb',
            'D': 'Re', 'D#': 'Re#', 'Eb': 'Mib',
            'E': 'Mi',
            'F': 'Fa', 'F#': 'Fa#', 'Gb': 'Solb',
            'G': 'Sol', 'G#': 'Sol#', 'Ab': 'Lab',
            'A': 'La', 'A#': 'La#', 'Bb': 'Sib',
            'B': 'Si'
        };
        const latinRoot = angloToLatin[root] || root;
        return latinRoot + quality;
    }

    // Formato 3: Números de Nashville (1, 2, 3...)
    if (style === 'nashville') {
        if (!activeKey) return chord;
        const keyMatch = activeKey.match(/^([A-G][#b]?)/);
        if (!keyMatch) return chord;
        
        const keyRoot = normalize(keyMatch[1]);
        const chordRoot = normalize(root);
        
        const indexKey = scale.indexOf(keyRoot);
        const indexChord = scale.indexOf(chordRoot);
        
        if (indexKey === -1 || indexChord === -1) return chord;
        
        // Distancia interválica en semitonos
        const interval = (indexChord - indexKey + 12) % 12;
        const semitonesToDegree = {
            0: '1', 1: '1#', 2: '2', 3: '3b', 4: '3', 5: '4', 
            6: '4#', 7: '5', 8: '5#', 9: '6', 10: '7b', 11: '7'
        };
        
        return (semitonesToDegree[interval] || '1') + quality;
    }

    return chord;
}

function setNotation(style) {
    document.querySelectorAll('.notation-option').forEach(opt => opt.classList.remove('active'));
    const optSelected = document.getElementById('notation-' + style);
    if (optSelected) optSelected.classList.add('active');
    
    // Cambiamos la variable en vivo (Previsualización) pero no guardamos en localStorage todavía
    currentNotationStyle = style;
    showToast("Previsualizando " + (style === 'solfeo' ? 'Solfeo' : style === 'nashville' ? 'Nashville' : 'Estándar'), "info");
    
    // Si hay una canción abierta, se actualiza la vista de forma inmediata
    if (currentSong) {
        renderLyrics();
    }
}

// --- TRADUCTOR DE SCROLL VERTICAL A PAGINACIÓN HORIZONTAL MAGNÉTICA Y AUTO-SNAP ---
function initWheelScrollTranslation() {
    const container = document.getElementById('lyrics-container');
    if (!container) return;

    // 1. Traductor de rueda del ratón (deslizamiento por página exacta en PC)
    let isWheeling = false;
    container.addEventListener('wheel', (e) => {
        if (container.classList.contains('musician-mode') && container.classList.contains('double-column')) {
            if (e.deltaY !== 0) {
                e.preventDefault();
                if (isWheeling) return; // Evita saltos múltiples seguidos
                isWheeling = true;
                
                const pageDirection = e.deltaY > 0 ? 1 : -1;
                const pageWidth = container.clientWidth;
                
                container.scrollTo({
                    left: container.scrollLeft + (pageWidth * pageDirection),
                    behavior: 'smooth'
                });
                
                setTimeout(() => { isWheeling = false; }, 400);
            }
        }
    }, { passive: false });

    // 2. Escuchar el scroll únicamente para actualizar el indicador de páginas en tiempo real (Celular y PC)
    container.addEventListener('scroll', updatePageIndicator);
}

function updateScrollButtonVisibility() {
    const btnScroll = document.getElementById('btn-scroll');
    if (!btnScroll) return;

    if (currentMode === 'musicos') {
        if (currentColumnsLayout === '2-columnas') {
            stopAutoScroll();
            btnScroll.style.display = 'none'; // Ocultar scroll en músicos si usan doble columna
        } else {
            btnScroll.style.display = 'block'; // Mostrar en músicos si usan 1 columna
        }
    } else {
        btnScroll.style.display = 'block'; // Mostrar siempre en voces
    }
}

function setColumnsStyle(style) {
    document.querySelectorAll('[id^="columns-"]').forEach(opt => opt.classList.remove('active'));
    const optSelected = document.getElementById('columns-' + style);
    if (optSelected) optSelected.classList.add('active');
    
    currentColumnsLayout = style;
    showToast("Previsualizando " + (style === '1-columna' ? '1 Columna (Scroll)' : '2 Columnas (Páginas)'), "info");
    
    updateScrollButtonVisibility();
    if (currentSong) {
        renderLyrics();
    }
}

// CÁLCULO DINÁMICO DE NÚMERO DE PÁGINAS DE LA CANCIÓN
function updatePageIndicator() {
    const container = document.getElementById('lyrics-container');
    const indicator = document.getElementById('page-indicator-badge');
    if (!container || !indicator) return;

    if (container.classList.contains('musician-mode') && container.classList.contains('double-column')) {
        indicator.style.display = 'block';
        
        // Calculamos el número de páginas dividiendo el ancho total del texto entre el ancho de la pantalla
        const totalPages = Math.max(1, Math.round(container.scrollWidth / container.clientWidth));
        const currentPage = Math.max(1, Math.round(container.scrollLeft / container.clientWidth) + 1);
        
        indicator.innerText = `${currentPage} / ${totalPages}`;
    } else {
        indicator.style.display = 'none';
    }
}

// --- MEZCLADOR PERSISTENTE DE COLORES PARA CABECERA Y LETRA (MÚSICOS ONLY) ---
function applyCustomColors() {
    const titleEl = document.getElementById('view-title');
    const lyricsEl = document.getElementById('lyrics-container');
    
    // Si la variable está vacía, el navegador hereda automáticamente los estilos responsivos del tema activo
    if (titleEl) {
        titleEl.style.color = currentTitleColor ? currentTitleColor : '';
    }
    if (lyricsEl) {
        lyricsEl.style.color = currentTextColor ? currentTextColor : '';
    }
}

function renderColorPickers() {
    // Paleta de 8 tonos vibrantes y estéticos elegidos para escenario
    const vibrantColors = [
        '#6366f1', // Azul Eléctrico
        '#06b6d4', // Cian Cielo
        '#10b981', // Verde Esmeralda
        '#f59e0b', // Naranja Oro
        '#ef4444', // Rojo Coral
        '#a855f7', // Violeta Orquídea
        '#1e293b', // Negro Carbón (Ideal Modo Claro)
        '#ffffff'  // Blanco Puro (Ideal Modo Noche)
    ];

    const titleRow = document.getElementById('title-color-picker');
    const textRow = document.getElementById('text-color-picker');

    if (titleRow) {
        titleRow.innerHTML = vibrantColors.map(color => {
            const isActive = (currentTitleColor === color);
            return `<div class="color-dot ${isActive ? 'active' : ''}" style="background-color: ${color};" onclick="setTitleColor('${color}')"></div>`;
        }).join('') + `<div class="color-dot ${currentTitleColor === '' ? 'active' : ''}" style="background: linear-gradient(135deg, #ddd, #999);" onclick="setTitleColor('')" title="Por defecto"></div>`;
    }

    if (textRow) {
        textRow.innerHTML = vibrantColors.map(color => {
            const isActive = (currentTextColor === color);
            return `<div class="color-dot ${isActive ? 'active' : ''}" style="background-color: ${color};" onclick="setTextColor('${color}')"></div>`;
        }).join('') + `<div class="color-dot ${currentTextColor === '' ? 'active' : ''}" style="background: linear-gradient(135deg, #ddd, #999);" onclick="setTextColor('')" title="Por defecto"></div>`;
    }
}

function setTitleColor(color) {
    currentTitleColor = color;
    renderColorPickers();
    applyCustomColors();
}

function setTextColor(color) {
    currentTextColor = color;
    renderColorPickers();
    applyCustomColors();
}
function initPasswordInputListener() {
    const passInput = document.getElementById('add-song-pass-input');
    if (passInput) {
        passInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                verifyAddSongPassword();
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initWheelScrollTranslation();
        initPasswordInputListener();
    });
} else {
    initWheelScrollTranslation();
    initPasswordInputListener();
}

// --- MOTOR DE EDICIÓN FLOTANTE DE LETRA Y ACORDES (ESCRITURA EN HOJA 1) ---
function openEditSongModal() {
    if (!currentSong) return;
    
    // Rellenar campos del formulario de edición con los datos actuales
    document.getElementById('edit-song-title').value = currentSong.Titulo || "";
    document.getElementById('edit-song-artist').value = currentSong.Artista || "";
    document.getElementById('edit-song-bpm').value = currentSong.BPM || "";
    
    // Separar tono y modo menor/mayor (ej: "Am" -> "A" y "m")
    const keyRoot = currentSong.Tono.match(/^([A-G][#b]?)/);
    const keyMode = currentSong.Tono.replace(keyRoot ? keyRoot[1] : "", "");
    document.getElementById('edit-song-key').value = keyRoot ? keyRoot[1] : "C";
    document.getElementById('edit-song-mode').value = keyMode || "";

    // Cargar de forma independiente ambos campos de texto en el editor
    document.getElementById('edit-song-lyrics-musician').value = currentSong.Letra_Musicos || "";
    document.getElementById('edit-song-lyrics-voices').value = currentSong.Letra_Voces || "";
    document.getElementById('edit-song-youtube').value = currentSong.Youtube || "";
    
    document.getElementById('edit-song-modal').style.display = 'flex';
    history.pushState({ modal: 'edit-song-modal' }, "");
}

function closeEditSongModal() {
    if (history.state && history.state.modal === 'edit-song-modal') {
        history.back();
    } else {
        document.getElementById('edit-song-modal').style.display = 'none';
    }
}

async function saveSongEdits() {
    if (!currentSong) return;
    
    const titulo = document.getElementById('edit-song-title').value.trim();
    const artistaVal = document.getElementById('edit-song-artist').value.trim();
    const artista = artistaVal !== "" ? artistaVal : "Desconocido";
    
    const keyRoot = document.getElementById('edit-song-key').value;
    const keyMode = document.getElementById('edit-song-mode').value;
    const tono = keyRoot + keyMode;

    const bpm = document.getElementById('edit-song-bpm').value;
    
    // Leer de forma independiente ambos campos de texto
    const letra_musicos = document.getElementById('edit-song-lyrics-musician').value;
    const letra_voces = document.getElementById('edit-song-lyrics-voices').value;
    const youtube = document.getElementById('edit-song-youtube').value.trim(); // Captura del enlace de YouTube

    // Validación estricta contra envíos vacíos o incompletos al editar
    if (!titulo || titulo.length < 2) return showToast("El título de la canción debe tener al menos 2 letras", "error");
    if (!letra_musicos.trim() && !letra_voces.trim()) return showToast("Debes ingresar al menos una letra (músicos o voces)", "error");

    showToast("Sincronizando con Google Sheets...", "info");
    
    // Actualizar memoria local de la canción activa
    currentSong.Titulo = titulo;
    currentSong.Artista = artista;
    currentSong.Tono = tono;
    currentSong.BPM = bpm ? parseInt(bpm) : 0;
    currentSong.Letra_Musicos = letra_musicos;
    currentSong.Letra_Voces = letra_voces;
    currentSong.Youtube = youtube; // Sincronización local inmediata
    
    // Sincronizar en la base de datos principal en memoria
    const dbSong = songsDatabase.find(s => s.ID.toString().trim() === currentSong.ID.toString().trim());
    if (dbSong) {
        dbSong.Titulo = titulo;
        dbSong.Artista = artista;
        dbSong.Tono = tono;
        dbSong.BPM = bpm ? parseInt(bpm) : 0;
        dbSong.Letra_Musicos = letra_musicos;
        dbSong.Letra_Voces = letra_voces;
        dbSong.Youtube = youtube;
    }

    // Refrescar el visualizador en vivo al instante
    document.getElementById('view-title').innerText = currentSong.Titulo;
    document.getElementById('view-artist').innerText = currentSong.Artista;
    document.getElementById('current-key').innerText = getTransposedKeyName(currentSong.Tono, currentTransposition);
    
    renderLyrics();
    document.getElementById('edit-song-modal').style.display = 'none';
    if (history.state && history.state.modal === 'edit-song-modal') {
        history.back();
    }

    // Enviar al backend (Hoja 1 de Google Sheets) en segundo plano
    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: 'update_song',
                id: currentSong.ID.toString(),
                titulo: titulo,
                artista: artista,
                tono: tono,
                bpm: bpm ? parseInt(bpm) : 0,
                letra_musicos: currentSong.Letra_Musicos,
                letra_voces: currentSong.Letra_Voces,
                youtube: youtube // Envío de columna H integrado con éxito
            })
        });
        showToast("¡Cambios guardados en la nube!", "success");
    } catch (e) {
        console.error("Error al guardar:", e);
        showToast("Error de conexión al guardar", "error");
    }
}

// --- MOTOR DE CREACIÓN DE NUEVAS CANCIONES (ESCRITURA EN HOJA 1) ---
function openAddSongModal() {
// Resetear la barra de desplazamiento del modal arriba del todo para mayor comodidad (Corrección)
    const modalContent = document.querySelector('#add-song-modal .modal-content');
    if (modalContent) modalContent.scrollTop = 0;
    // Limpiamos los campos antes de abrir
    document.getElementById('add-song-title').value = "";
    document.getElementById('add-song-artist').value = "";
    document.getElementById('add-song-key').value = "C";
    document.getElementById('add-song-mode').value = "";
    document.getElementById('add-song-bpm').value = "";
    document.getElementById('add-song-lyrics-musician').value = "";
    document.getElementById('add-song-lyrics-voices').value = "";
    document.getElementById('add-song-youtube').value = "";

    document.getElementById('add-song-modal').style.display = 'flex';
    history.pushState({ modal: 'add-song-modal' }, "");
}

function closeAddSongModal() {
    if (history.state && history.state.modal === 'add-song-modal') {
        history.back();
    } else {
        document.getElementById('add-song-modal').style.display = 'none';
    }
}

async function saveNewSong() {
    const titulo = document.getElementById('add-song-title').value.trim();
    const artistaVal = document.getElementById('add-song-artist').value.trim();
    const artista = artistaVal !== "" ? artistaVal : "Desconocido";
    
    // Obtener y unificar nota base y modo de tonalidad (ej: "A" + "m" = "Am")
    const keyRoot = document.getElementById('add-song-key').value;
    const keyMode = document.getElementById('add-song-mode').value;
    const tono = keyRoot + keyMode;

    const bpm = document.getElementById('add-song-bpm').value;
    const letra_musicos = document.getElementById('add-song-lyrics-musician').value;
    const letra_voces = document.getElementById('add-song-lyrics-voices').value;
    const youtube = document.getElementById('add-song-youtube').value.trim(); // Captura del enlace multimedia

    // Validación estricta de seguridad contra envíos vacíos o incompletos
    if (!titulo || titulo.length < 2) return showToast("El título de la canción debe tener al menos 2 letras", "error");
    if (!letra_musicos.trim() && !letra_voces.trim()) return showToast("Debes ingresar al menos una letra (músicos o voces)", "error");

    showToast("Registrando en la nube...", "info");

    const nextLocalId = (songsDatabase.length > 0) ? (Math.max(...songsDatabase.map(s => parseInt(s.ID) || 0)) + 1).toString() : "1";

    const newSong = {
        ID: nextLocalId,
        Titulo: titulo,
        Artista: artista,
        Tono: tono,
        BPM: bpm ? parseInt(bpm) : 0,
        Letra_Musicos: letra_musicos,
        Letra_Voces: letra_voces,
        Youtube: youtube // Sincronización local inmediata
    };

    // Insertar localmente de inmediato para previsualización instantánea
    songsDatabase.push(newSong);
    currentSongList = songsDatabase;

    renderSongList(currentSongList);
    closeAddSongModal();

    // Enviar permanentemente a Google Sheets en segundo plano
    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: 'add_song',
                titulo: titulo,
                artista: artista,
                tono: tono,
                bpm: bpm ? parseInt(bpm) : 0,
                letra_musicos: letra_musicos,
                letra_voces: letra_voces,
                youtube: youtube // Envío de columna H integrado con éxito
            })
        });
        showToast("¡Nueva canción guardada con éxito!", "success");
    } catch (e) {
        console.error("Error al guardar canción:", e);
        showToast("Error de conexión al guardar canción", "error");
    }
}

// --- MOTOR DE CONTROL DE PANTALLA COMPLETA (MODO ESCENARIO ZEN) ---
let isTheaterModeActive = false;

function toggleTheaterMode() {
    const songView = document.getElementById('song-view');
    const btnClose = document.getElementById('btn-close-theater');
    if (!songView || !btnClose) return;

    isTheaterModeActive = !isTheaterModeActive;

    if (isTheaterModeActive) {
        songView.classList.add('theater-mode');
        btnClose.style.display = 'flex';
        showToast("Modo Escenario Activado", "success");
    } else {
        songView.classList.remove('theater-mode');
        btnClose.style.display = 'none';
        showToast("Modo Estándar Restaurado", "info");
    }

    // Forzar recalculo de indicador de página para columnas
    setTimeout(updatePageIndicator, 150);
}

// --- CONTROL DE ACCESO DE SEGURIDAD PARA CREAR Y EDITAR (CONTRASEÑA "2415") ---
function openAddSongPasswordModal() {
    passwordSuccessAction = 'add'; // Determina que al validar se creará una canción
    const passInput = document.getElementById('add-song-pass-input');
    if (passInput) passInput.value = '';
    
    document.getElementById('add-song-password-modal').style.display = 'flex';
    history.pushState({ modal: 'add-song-password-modal' }, "");
    
    // Auto-enfocar el teclado del celular de forma inmediata
    setTimeout(() => {
        if (passInput) passInput.focus();
    }, 150);
}

function openEditSongPasswordModal() {
    passwordSuccessAction = 'edit'; // Determina que al validar se editará la canción activa
    const passInput = document.getElementById('add-song-pass-input');
    if (passInput) passInput.value = '';
    
    document.getElementById('add-song-password-modal').style.display = 'flex';
    history.pushState({ modal: 'add-song-password-modal' }, "");
    
    setTimeout(() => {
        if (passInput) passInput.focus();
    }, 150);
}

function closeAddSongPasswordModal() {
    if (history.state && history.state.modal === 'add-song-password-modal') {
        history.back();
    } else {
        document.getElementById('add-song-password-modal').style.display = 'none';
    }
}

function verifyAddSongPassword() {
    const passInput = document.getElementById('add-song-pass-input');
    if (!passInput) return;

    if (passInput.value === '2415') {
        // Cierre suave del modal de contraseña y apertura del formulario correspondiente
        document.getElementById('add-song-password-modal').style.display = 'none';
        if (history.state && history.state.modal === 'add-song-password-modal') {
            history.back();
        }
        
        // Retraso estético para la transición entre modales
        setTimeout(() => {
            if (passwordSuccessAction === 'edit') {
                openEditSongModal();
            } else {
                openAddSongModal();
            }
        }, 150);
        showToast("Acceso Autorizado", "success");
    } else {
        showToast("Contraseña Incorrecta", "error");
        passInput.value = '';
        passInput.focus();
    }
}

// --- MANEJADOR DE SELECCIÓN DE ACORDES DESPLEGABLES ---
function insertChordDropdown(selectEl, textareaId) {
    const chord = selectEl.value;
    if (!chord) return;
    
    // Inyectar el acorde con el sistema central
    insertTextAtCursor(textareaId, chord);
    
    // Reiniciar el selector al marcador de posición "Acorde..." por defecto
    selectEl.selectedIndex = 0;
}

// --- INYECTOR DINÁMICO DE ACORDES Y ETIQUETAS EN CURSOR ---
function insertTextAtCursor(textareaId, text) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;

    // Insertar el texto justo en la posición actual del cursor
    textarea.value = val.substring(0, start) + text + val.substring(end);
    
    // Reposicionar el cursor inmediatamente después del texto insertado
    const newCursorPos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = newCursorPos;
    
    // Devolver el enfoque a la caja de texto para seguir escribiendo sin interrupciones
    textarea.focus();
}

// --- CAMBIAR INTERACTIVAMENTE EL MES DEL CALENDARIO MINISTERIAL ---
function changeMinistryMonth(delta) {
    currentCalDate.setMonth(currentCalDate.getMonth() + delta);
    renderMinistryGrid();
}

// --- CONTROLADOR DE VISIBILIDAD DE LA NOTA DE INTERPRETACIÓN EN EL VISOR ---
function toggleNoteVisibility(hide) {
    const noteBox = document.getElementById('lyrics-note-box');
    const indicator = document.getElementById('lyrics-note-indicator');
    
    if (!noteBox || !indicator || !currentSong) return;

    if (hide) {
        noteBox.style.display = 'none';
        indicator.style.display = 'flex';
        sessionStorage.setItem('note_hidden_' + currentSong.ID, 'true');
    } else {
        noteBox.style.display = 'flex'; // Cambiado de 'block' a 'flex' para no deformar el contenedor horizontal
        indicator.style.display = 'none';
        sessionStorage.setItem('note_hidden_' + currentSong.ID, 'false');
    }

    // Forzar recalculo de indicador de página para el visor de columnas si está activo
    setTimeout(updatePageIndicator, 150);
}

// --- MANEJADOR PARA ABRIR ENLACE DE YOUTUBE ---
function openYouTubeLink() {
    if (currentSong && currentSong.Youtube && currentSong.Youtube.trim() !== "") {
        window.open(currentSong.Youtube, '_blank');
    }
}

// --- FUNCIÓN CENTRALIZADA PARA IGNORAR TILDES Y MAYÚSCULAS EN BUSCADORES ---
function cleanText(text) {
    if (!text) return "";
    // El método normalize("NFD") separa la letra de su tilde (ej: "í" -> "i" + tilde combinada)
    // El método replace(/[\u0300-\u036f]/g, "") remueve la tilde separada, dejando solo la letra base de forma limpia
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}