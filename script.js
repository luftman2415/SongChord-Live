// --- CONFIGURACIÓN ---
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxpQBWuAlKso716X514YogpM4LojiQ_0Hxv0Og12bS2FXEZ6T_5cg4L0_bCPuEYvX8l/exec'; 

let favorites = JSON.parse(localStorage.getItem('songChordFavorites')) || [];
let activeServiceInfo = null; // Guardará el nombre del servicio abierto
let serviceToDelete = null; // Guardará el servicio que vamos a borrar
let songsDatabase = [];
let servicesDatabase = [];
let currentSongList = [];
let tempSelectedSongs = [];
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

const scale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// 1. ARRANQUE
window.onload = () => {
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
        
        // --- Lógica para elegir frase al azar ---
        // --- Lógica para elegir mensaje y subtítulo al azar ---
        // --- Lógica de Bienvenida Reparada ---
        if(data.bienvenida && Array.isArray(data.bienvenida)) {
            const elTitle = document.getElementById('welcome-text');
            const elSub = document.getElementById('welcome-subtext');
            
            // Filtramos solo filas que tengan texto en la primera columna
            const filasConTexto = data.bienvenida.filter(f => f[0] && f[0].toString().trim() !== "");
            
            // Elegimos una fila al azar de TODAS las disponibles
            const indiceAzar = Math.floor(Math.random() * filasConTexto.length);
            const seleccionada = filasConTexto[indiceAzar];
            
            // Ponemos el Título (Columna A)
            elTitle.innerText = seleccionada[0]; 
            
            // Ponemos el Subtítulo (Columna B). Si está vacío, ponemos uno por defecto.
            if (seleccionada[1] && seleccionada[1].toString().trim() !== "") {
                elSub.innerText = seleccionada[1];
            } else {
                elSub.innerText = "Preparados para ministrar en Su presencia.";
            }
        }

        // Mapeo de canciones (Hoja 1)
        songsDatabase = data.canciones.map(item => {
            const find = (key) => {
                const k = Object.keys(item).find(k => k.toLowerCase().replace(/_/g, ' ').trim() === key.toLowerCase().trim());
                return k ? item[k] : "";
            };
            return {
                ID: find('ID').toString().trim(), 
                Titulo: find('Titulo') || "Sin Título",
                Artista: find('Artista') || "Desconocido",
                Tono: find('Tono') || "C",
                BPM: find('BPM') || 0,
                Letra_Musicos: find('Letra Musicos') || find('Musicos') || "",
                Letra_Voces: find('Letra Voces') || find('Voces') || ""
            };
        });

        servicesDatabase = data.servicios;
        renderServices();
        // Avisamos que la App está lista para la acción
        console.log("Base de datos de " + songsDatabase.length + " canciones cargada.");
    } catch (e) {
        console.error("Error en carga:", e);
        showToast("Error de sincronización", "error");
    }
}

// 3. RENDERIZAR SERVICIOS (DASHBOARD)
function renderServices() {
    const container = document.getElementById('services-container');
    if (!servicesDatabase || servicesDatabase.length === 0) {
        container.innerHTML = "<p class='loading-small'>No hay servicios programados.</p>";
        return;
    }
    
    container.innerHTML = servicesDatabase.map((ser, i) => {
        // Buscador de columnas flexible
        const getVal = (keyword) => {
            const key = Object.keys(ser).find(k => k.toLowerCase().includes(keyword.toLowerCase()));
            return key ? ser[key] : "";
        };

        const fechaRaw = getVal('fecha');
        const fecha = fechaRaw ? fechaRaw.toString().split('T')[0] : "Pendiente";
        const nombre = getVal('nombre') || "Servicio";
        const lider = getVal('líder') || getVal('director') || "Por definir";
        
        // --- LÓGICA PARA CONTAR CANCIONES ---
        const rawIds = getVal('ids') || "";
        const listaIds = rawIds.toString().split(',').map(id => id.trim()).filter(id => id !== "");
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
    }).join('');
}

// 4. FILTRAR CANCIONES POR SERVICIO
function showServiceSongs(index) {
    // --- ESTA LÍNEA DEBE IR AQUÍ ADENTRO ---
    activeServiceInfo = servicesDatabase[index]; 

    const ser = servicesDatabase[index];
    const keyWithIds = Object.keys(ser).find(k => k.toLowerCase().includes('lista de ids'));
    const rawIds = ser[keyWithIds] ? ser[keyWithIds].toString() : "";
    
    // Limpiamos los IDs del texto del Excel
    const idsToFilter = rawIds.replace(/[.\s]/g, ',').split(',').map(id => id.trim()).filter(id => id !== "");

    // Buscamos cada canción para que mantenga el orden exacto (3, 2, 1...)
    currentSongList = idsToFilter.map(id => {
        return songsDatabase.find(song => song.ID === id);
    }).filter(song => song !== undefined); 

    // Guardamos la lista de IDs para las flechas en este orden exacto
    currentServiceSongs = currentSongList.map(s => s.ID); 

    const nombreCol = Object.keys(ser).find(k => k.toLowerCase().includes('nombre'));
    document.getElementById('list-title').innerText = ser[nombreCol] || "Servicio";
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
    // Si estamos en la vista de favoritos, usamos su contenedor propio
    const favList = document.getElementById('favorites-list-container');
    const targetList = document.getElementById('favorites-view').classList.contains('active') ? favList : list;

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

        card.innerHTML = `
            <div class="fav-star ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, '${song.ID}')">
                <i class="${isFav ? 'fas' : 'far'} fa-star"></i>
            </div>
            <div class="song-info-container" onclick="openSongByID('${song.ID}')">
                <h3 style="margin:0; font-size:1rem;">${song.Titulo}</h3>
                <p style="margin:2px 0 0; color:#64748b; font-size:0.8rem;">${song.Artista}</p>
            </div>
            <div class="song-badges">
                ${song.BPM > 0 ? `<div class="bpm-badge"><i class="fas fa-metronome"></i> BPM ${song.BPM}</div>` : ''}
                <div style="font-weight:800; color:#6366f1; background:#eef2ff; padding:4px 8px; border-radius:8px; font-size:0.75rem;">${song.Tono}</div>
            </div>
            <div class="remove-song-btn" onclick="removeSongFromCurrentService(event, '${song.ID}')">
                <i class="fas fa-minus-circle"></i>
            </div>
        `;
        targetList.appendChild(card);
    });
}

// 5. VISUALIZADOR
function openSongByID(id) {
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

    // Reinicios básicos
    currentTransposition = 0; 
    fontSize = 16; 
    currentMode = 'musicos';
    
    // UI - Cabecera
    document.getElementById('btn-musicos').classList.add('active');
    document.getElementById('btn-voces').classList.remove('active');
    document.getElementById('view-title').innerText = currentSong.Titulo;
    document.getElementById('view-artist').innerText = currentSong.Artista;
    document.getElementById('current-key').innerText = currentSong.Tono;

    // Control de Flechas (Solo si entramos por un servicio con más de 1 canción)
    const nav = document.getElementById('setlist-nav');
    if (nav) {
        if (currentServiceSongs.length > 1 && currentServiceSongs.includes(id.toString())) {
            nav.style.display = 'flex';
        } else {
            nav.style.display = 'none';
        }
    }

    switchView('song-view');
    renderLyrics();
    
    // Encendemos el metrónomo
    startMetronome(currentSong.BPM);
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
        processed = processed.replace(/\[([^\]]+)\]/g, (m, chord) => {
            const newChord = transposeChord(chord, currentTransposition);
            return `<span class="chord-wrapper" data-chord="${newChord}">${newChord}</span>`;
        });
    } else {
        container.classList.remove('musician-mode');
        processed = processed.replace(/\[.*?\]/g, '');
    }

    container.innerHTML = processed;
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
}

// 7. NAVEGACIÓN Y MODOS
function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-musicos').classList.toggle('active', mode === 'musicos');
    document.getElementById('btn-voces').classList.toggle('active', mode === 'voces');
    renderLyrics();
}

function switchView(viewId) {
    // 1. Ocultar todas las vistas y mostrar la deseada
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    
    // 2. Avisar al historial del celular (excepto si ya estamos en el Dashboard)
    if (viewId !== 'dashboard-view') {
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

    // 3. Regresamos a la vista de la lista
    switchView('home-view');
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
function openServiceModal() { history.pushState({ modal: 'service-modal' }, ""); tempSelectedSongs = []; renderSelectedSongs(); document.getElementById('service-modal').style.display = 'flex'; }
function closeServiceModal() { 
    document.getElementById('service-modal').style.display = 'none'; 
    // Si el usuario cerró el modal manualmente, quitamos ese rastro del historial
    if (history.state && history.state.modal) history.back();
}

function searchSongsForModal() {
    const term = document.getElementById('modal-song-search').value.toLowerCase();
    const resultsDiv = document.getElementById('modal-search-results');
    if (term.length < 2) { resultsDiv.style.display = 'none'; return; }
    const filtered = songsDatabase.filter(s => s.Titulo.toLowerCase().includes(term) || s.Artista.toLowerCase().includes(term));
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
    const idsString = tempSelectedSongs.map(s => s.id).join(',');
    showToast("Guardando...", "info");
    try {
        await fetch(WEB_APP_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ fecha: date, nombre: name, ids: idsString, lider: leader }) });
        showToast("¡Servicio guardado!", "success");
        setTimeout(() => location.reload(), 1500);
    } catch (e) { showToast("Error al guardar", "error"); }
}

// 10. BUSCADOR PRINCIPAL
document.getElementById('search-input').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = currentSongList.filter(s => s.Titulo.toLowerCase().includes(term) || s.Artista.toLowerCase().includes(term));
    renderSongList(filtered);
};

// --- FUNCIONES DE AJUSTES VISUALES ---

function openSettingsModal() {
    document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('settings-modal').style.display = 'none';
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
    
    // 4. Marcamos el botón seleccionado como activo
    document.getElementById('theme-' + themeName).classList.add('active');
    
    // 5. Guardamos la preferencia en el navegador para que no se borre al recargar
    localStorage.setItem('userTheme', themeName);
    
    showToast("Tema " + themeName + " aplicado", "info");
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

    // Buscamos el nombre para el mensaje
    const nombreKey = Object.keys(serviceToDelete).find(k => k.toLowerCase().includes('nombre'));
    const nombre = serviceToDelete[nombreKey] || "este servicio";
    
    document.getElementById('delete-service-info').innerText = `Vas a eliminar "${nombre}". Esta acción no se puede deshacer.`;
    document.getElementById('delete-confirm-modal').style.display = 'flex';
history.pushState({ modal: 'delete-modal' }, "");
}

// 2. Cerramos el modal
function closeDeleteModal() {
    document.getElementById('delete-confirm-modal').style.display = 'none';
    serviceToDelete = null;
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

    // Ahora sí cerramos la ventana
    document.getElementById('delete-confirm-modal').style.display = 'none';
    showToast("Eliminando de la base de datos...", "info");

    const payload = {
        action: 'delete',
        nombre: nombreEnviado.toString()
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

    // Buscamos el nombre del servicio actual
    const nombreKey = Object.keys(activeServiceInfo).find(k => k.toLowerCase().includes('nombre'));
    const nombreServicio = activeServiceInfo[nombreKey];
    
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
    
    // Actualizar la vista actual
    if (document.getElementById('favorites-view').classList.contains('active')) {
        showFavorites();
    } else {
        renderSongList(currentSongList);
    }
}

// FUNCIÓN PARA MOSTRAR LA PANTALLA DE FAVORITOS
function showFavorites() {
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
    const fecha = get('fecha') ? get('fecha').toString().split('T')[0] : "";
    const lider = get('líder') || get('director') || "Por definir";

    // Armar el mensaje con negritas y emojis para WhatsApp
    let mensaje = `🎶 *SETLIST: ${nombre.toUpperCase()}*\n`;
    mensaje += `📅 *FECHA:* ${fecha}\n`;
    mensaje += `🎤 *LÍDER:* ${lider}\n\n`;
    mensaje += `*CANCIONES:*\n`;

    currentSongList.forEach((song, i) => {
        mensaje += `${i + 1}. ${song.Titulo} (${song.Tono})\n`;
    });

    mensaje += `\n_Enviado desde SongChord Live Pro_`;

    // Crear el enlace de WhatsApp
    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    
    // Abrir en una pestaña nueva
    window.open(url, '_blank');
}

// FUNCIÓN PARA BUSCAR DENTRO DE FAVORITOS
function filterFavorites() {
    const term = document.getElementById('search-favorites').value.toLowerCase();
    
    // Filtramos solo entre las canciones que son favoritas
    const filteredFavs = songsDatabase.filter(s => 
        favorites.includes(s.ID) && 
        (s.Titulo.toLowerCase().includes(term) || s.Artista.toLowerCase().includes(term))
    );
    
    renderSongList(filteredFavs, 'favorites-list-container');
}

// FUNCIÓN PARA CAMBIAR VELOCIDAD DE SCROLL
function changeScrollSpeed(delta) {
    // Delta 1: Más Lento | Delta -1: Más Rápido
    if (delta === 1) {
        if (scrollSpeed < 150) {
            scrollSpeed += 10;
            speedLevel = parseFloat((speedLevel - 0.2).toFixed(1));
        }
    } else {
        if (scrollSpeed > 10) {
            scrollSpeed -= 10;
            speedLevel = parseFloat((speedLevel + 0.2).toFixed(1));
        }
    }

    if (speedLevel <= 0) speedLevel = 0.2;

    document.getElementById('speed-display').innerText = speedLevel.toFixed(1) + 'x';

    if (isScrolling) {
        clearInterval(scrollInterval);
        startAutoScroll();
    }
}
// FUNCIONES DE EDICIÓN DE SERVICIO
function openEditServiceModal() {
history.pushState({ modal: 'service-modal' }, "");
    if (!activeServiceInfo) return;
    
    // Cambiamos el título y etiquetas del modal existente para reutilizarlo
    document.querySelector('#service-modal h3').innerText = "Editar Servicio / Añadir Canciones";
    
    const getVal = (keyword) => {
        const key = Object.keys(activeServiceInfo).find(k => k.toLowerCase().includes(keyword.toLowerCase()));
        return key ? activeServiceInfo[key] : "";
    };

    // Llenamos los campos con la info actual
    document.getElementById('new-service-name').value = getVal('nombre');
    let rawDate = getVal('fecha');
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
    document.getElementById('new-service-leader').value = getVal('líder') || getVal('director');
    
    // Cargamos las canciones actuales en la lista temporal de selección
    tempSelectedSongs = currentSongList.map(s => ({ id: s.ID, titulo: s.Titulo }));
    renderSelectedSongs();

    // Cambiamos la función del botón "Guardar" del modal para que actualice en lugar de crear
    const saveBtn = document.querySelector('#service-modal .save-btn');
    saveBtn.innerText = "Actualizar Todo";
    saveBtn.onclick = updateServiceData;

    document.getElementById('service-modal').style.display = 'flex';
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
        old_name: activeServiceInfo[Object.keys(activeServiceInfo).find(k => k.toLowerCase().includes('nombre'))].toString(),
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
    const keyWithIds = Object.keys(activeServiceInfo).find(k => k.toLowerCase().includes('lista de ids'));
    const rawIds = activeServiceInfo[keyWithIds] ? activeServiceInfo[keyWithIds].toString() : "";
    const idsToFilter = rawIds.replace(/[.\s]/g, ',').split(',').map(id => id.trim()).filter(id => id !== "");
    
    // Cargamos la lista de canciones actual
    currentSongList = idsToFilter.map(id => {
        return songsDatabase.find(song => song.ID === id);
    }).filter(song => song !== undefined);

    openEditServiceModal(); // Abrimos el modal que ya teníamos
}

// CEREBRO DE NAVEGACIÓN ATRÁS (BLINDADO)
window.onpopstate = function(event) {
    // MODALES: Si hay algún cuadrito blanco abierto, lo cerramos
    const modales = [
        { id: 'service-modal', display: 'flex' },
        { id: 'delete-confirm-modal', display: 'flex' },
        { id: 'settings-modal', display: 'flex' }
    ];

    for (let m of modales) {
        let el = document.getElementById(m.id);
        if (el && el.style.display === m.display) {
            el.style.display = 'none';
            return; // Detenemos aquí, ya cerramos el modal
        }
    }

    // VISTAS: Si estamos dentro de alguna sección, volvemos atrás correctamente
    const activeView = document.querySelector('.view.active').id;

    if (activeView === 'song-view') {
        closeSong(); // Detiene scroll, metrónomo y vuelve a la lista
    } 
    else if (activeView === 'home-view' || activeView === 'favorites-view') {
        goToDashboard(); // Vuelve al inicio
    } 
    else {
        // Por si acaso, si no reconoce la vista, forzamos Dashboard
        goToDashboard();
    }
};