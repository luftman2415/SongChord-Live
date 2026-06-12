// --- CONFIGURACIÓN ---
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxc7UMNRJlXjqwVF56TdhtTuHZ_mAkmal1sydw-ZQkTEaHbTxpQZ3Ls1fu7IYhvacwD/exec'; 

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
        const getVal = (keyword) => {
            const key = Object.keys(ser).find(k => k.toLowerCase().includes(keyword.toLowerCase()));
            return key ? ser[key] : "";
        };

        const fechaRaw = getVal('fecha');
        const fechaDisplay = fechaRaw ? fechaRaw.toString().split('T')[0] : "Sin fecha";
        const nombre = getVal('nombre') || "Servicio";

        return `
            <div class="service-card" onclick="showServiceSongs(${i})">
                <div class="service-date"><i class="far fa-calendar-alt"></i></div>
                <div class="service-info">
                    <h3>${nombre}</h3>
                    <p>${fechaDisplay}</p>
                </div>
                <!-- BOTÓN ELIMINAR -->
                <button class="delete-service-btn" onclick="confirmDeleteService(event, ${i})">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
    }).join('');
}

// 4. FILTRAR CANCIONES POR SERVICIO
function showServiceSongs(index) {
    const ser = servicesDatabase[index];
    const keyWithIds = Object.keys(ser).find(k => k.toLowerCase().includes('lista de ids'));
    const rawIds = ser[keyWithIds] ? ser[keyWithIds].toString() : "";
    
    // Limpiamos los IDs del texto del Excel
    const idsToFilter = rawIds.replace(/[.\s]/g, ',').split(',').map(id => id.trim()).filter(id => id !== "");

    // --- CAMBIO CLAVE AQUÍ ---
    // En lugar de filtrar la base de datos, recorremos TU lista de IDs 
    // y buscamos cada canción para que mantenga el orden exacto (3, 2, 1...)
    currentSongList = idsToFilter.map(id => {
        return songsDatabase.find(song => song.ID === id);
    }).filter(song => song !== undefined); // Quitamos errores si un ID no existe

    // Guardamos la lista de IDs para las flechas en este orden exacto
    currentServiceSongs = currentSongList.map(s => s.ID); 

    const nombreCol = Object.keys(ser).find(k => k.toLowerCase().includes('nombre'));
    document.getElementById('list-title').innerText = ser[nombreCol] || "Servicio";
    document.getElementById('list-subtitle').innerText = "Orden del Servicio";
    
    renderSongList(currentSongList);
    switchView('home-view');
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
}
function renderSongList(songs) {
    const list = document.getElementById('song-list-container');
    if (songs.length === 0) {
        list.innerHTML = "<p class='loading-small' style='text-align:center; padding-top:20px;'>No se encontraron canciones.</p>";
        return;
    }
    list.innerHTML = songs.map((song) => `
        <div class="song-card" onclick="openSongByID('${song.ID}')">
            <div><h3>${song.Titulo}</h3><p>${song.Artista}</p></div>
            <div style="font-weight:800; color:#6366f1; background:#eef2ff; padding:5px 10px; border-radius:10px; font-size:0.75rem;">${song.Tono}</div>
        </div>
    `).join('');
}

// 5. VISUALIZADOR
function openSongByID(id) {
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
    
    // Reset de Scroll
    const lyCont = document.getElementById('lyrics-container');
    if (lyCont) lyCont.scrollTop = 0;

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
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}
function goToDashboard() { switchView('dashboard-view'); }
function closeSong() {
    // 1. Apagamos el metrónomo si está sonando
    if(metronomeInterval) clearInterval(metronomeInterval);
    
    // 2. Apagamos el scroll automático
    stopAutoScroll();
    
    // 3. Regresamos a la vista de la lista (Home)
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
    isScrolling = true; document.getElementById('scroll-icon').className = 'fas fa-pause';
    scrollInterval = setInterval(() => {
        const container = document.getElementById('lyrics-container');
        if (container) {
            container.scrollBy(0, 1);
            if (Math.ceil(container.scrollTop + container.clientHeight) >= container.scrollHeight) stopAutoScroll();
        }
    }, 50);
}
function stopAutoScroll() { isScrolling = false; document.getElementById('scroll-icon').className = 'fas fa-play'; clearInterval(scrollInterval); }

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
function openServiceModal() { tempSelectedSongs = []; renderSelectedSongs(); document.getElementById('service-modal').style.display = 'flex'; }
function closeServiceModal() { document.getElementById('service-modal').style.display = 'none'; }

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