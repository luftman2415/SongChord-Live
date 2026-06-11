// --- CONFIGURACIÓN ---
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxoO22udaw3z9b16oq5Se5JCF1UVtJFan-yShSmlheV02oeDQ9OgK-AZUQV2nZJjQv/exec'; 

let songsDatabase = [];
let servicesDatabase = [];
let currentSongList = [];
let tempSelectedSongs = []; 
let currentSong = null;
let currentMode = 'musicos'; 
let fontSize = 16;
let currentTransposition = 0;
let isScrolling = false;
let scrollInterval;

const scale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// 1. GESTIÓN DEL SPLASH SCREEN Y ARRANQUE
window.onload = () => {
    console.log("App iniciada...");
    initApp();
    
    // El splash se quita a los 3 segundos pase lo que pase
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if(splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.style.display = 'none', 800);
        }
    }, 3000);
};

// 2. CARGA DE DATOS CON DETECCIÓN DE ERRORES
async function initApp() {
    const welcomeTitle = document.getElementById('welcome-text');
    const servicesCont = document.getElementById('services-container');

    try {
        console.log("Conectando con Google Sheets...");
        const response = await fetch(WEB_APP_URL);
        
        if (!response.ok) throw new Error("No se pudo obtener respuesta del servidor.");
        
        const data = await response.json();
        console.log("Datos recibidos:", data);

        // Mensaje de bienvenida (Hoja 3)
        if(data.bienvenida) {
            welcomeTitle.innerText = data.bienvenida;
        } else {
            welcomeTitle.innerText = "¡Bienvenido, Adorador!";
        }

        // Mapeo de canciones (Hoja 1)
        if (!data.canciones) throw new Error("No se encontró la 'Hoja 1' de canciones.");
        songsDatabase = data.canciones.map(item => {
            const find = (key) => {
                const k = Object.keys(item).find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
                return k ? item[k] : "";
            };
            return {
                ID: find('ID').toString().trim(),
                Titulo: find('Titulo') || "Sin Título",
                Artista: find('Artista') || "Desconocido",
                Tono: find('Tono') || "C",
                Letra_Musicos: find('Letra_Musicos') || find('Musicos'),
                Letra_Voces: find('Letra_Voces') || find('Voces')
            };
        });

        // Mapeo de servicios (Hoja 2)
        servicesDatabase = data.servicios || [];
        renderServices();

    } catch (e) {
        console.error("Error en initApp:", e);
        welcomeTitle.innerText = "Error de Conexión";
        servicesCont.innerHTML = `
            <div style="text-align:center; color:#ef4444; padding:20px; background:rgba(239,68,68,0.1); border-radius:15px;">
                <i class="fas fa-exclamation-circle"></i>
                <p><b>No se pudo sincronizar.</b></p>
                <small>${e.message}</small><br>
                <button onclick="location.reload()" style="margin-top:10px; padding:8px 15px; border-radius:8px; border:1px solid #ccc; cursor:pointer;">Reintentar</button>
            </div>
        `;
    }
}

// 3. RENDERIZAR SERVICIOS
function renderServices() {
    const container = document.getElementById('services-container');
    if (!servicesDatabase || servicesDatabase.length === 0) {
        container.innerHTML = "<p class='loading-small'>No hay servicios programados en la Hoja 2.</p>";
        return;
    }

    container.innerHTML = servicesDatabase.map((ser, i) => {
        // Función para buscar columnas sin importar el nombre exacto
        const getVal = (keyword) => {
            const key = Object.keys(ser).find(k => k.toLowerCase().includes(keyword.toLowerCase()));
            return key ? ser[key] : "";
        };

        const fechaRaw = getVal('fecha');
        const fecha = fechaRaw ? fechaRaw.toString().split('T')[0] : "Sin fecha";
        const nombre = getVal('nombre') || "Servicio Especial";
        const lider = getVal('líder') || getVal('director') || "Por asignar";

        return `
            <div class="service-card" onclick="showServiceSongs(${i})">
                <div class="service-date"><i class="far fa-calendar-alt"></i></div>
                <div class="service-info">
                    <h3>${nombre}</h3>
                    <p>${fecha} • Dirige: ${lider}</p>
                </div>
                <i class="fas fa-chevron-right" style="margin-left:auto; color:#ccc;"></i>
            </div>
        `;
    }).join('');
}

// 4. MOSTRAR CANCIONES DE UN SERVICIO
function showServiceSongs(index) {
    const ser = servicesDatabase[index];
    const keyWithIds = Object.keys(ser).find(k => k.toLowerCase().includes('lista de ids'));
    
    if (!keyWithIds || !ser[keyWithIds]) {
        showToast("Este servicio no tiene canciones asignadas", "error");
        return;
    }

    const idsToFilter = ser[keyWithIds].toString().split(',').map(id => id.trim());
    currentSongList = songsDatabase.filter(song => idsToFilter.includes(song.ID));

    document.getElementById('list-title').innerText = ser[Object.keys(ser).find(k => k.toLowerCase().includes('nombre'))] || "Servicio";
    document.getElementById('list-subtitle').innerText = "Lista seleccionada para este día";
    
    renderSongList(currentSongList);
    switchView('home-view');
}

// 5. NAVEGACIÓN Y VISTAS
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function goToDashboard() { switchView('dashboard-view'); }

function showAllSongs() {
    currentSongList = songsDatabase;
    document.getElementById('list-title').innerText = "Repertorio";
    document.getElementById('list-subtitle').innerText = "Todas las canciones";
    renderSongList(currentSongList);
    switchView('home-view');
}

function renderSongList(songs) {
    const list = document.getElementById('song-list-container');
    if (songs.length === 0) {
        list.innerHTML = "<p class='loading-small'>No se encontraron canciones.</p>";
        return;
    }
    list.innerHTML = songs.map((song) => `
        <div class="song-card" onclick="openSongByID('${song.ID}')">
            <div>
                <h3 style="margin:0;">${song.Titulo}</h3>
                <p style="margin:0; font-size:0.8rem; color:gray;">${song.Artista}</p>
            </div>
            <div style="font-weight:800; color:#6366f1; background:#eef2ff; padding:4px 8px; border-radius:8px; font-size:0.75rem;">${song.Tono}</div>
        </div>
    `).join('');
}

function openSongByID(id) {
    currentSong = songsDatabase.find(s => s.ID === id.toString());
    if(!currentSong) return showToast("No se pudo abrir la canción", "error");

    currentTransposition = 0; fontSize = 16; currentMode = 'musicos';
    document.getElementById('btn-musicos').classList.add('active');
    document.getElementById('btn-voces').classList.remove('active');
    document.getElementById('view-title').innerText = currentSong.Titulo;
    document.getElementById('view-artist').innerText = currentSong.Artista;
    document.getElementById('current-key').innerText = currentSong.Tono;
    document.getElementById('lyrics-container').scrollTop = 0;
    
    switchView('song-view');
    renderLyrics();
}

function closeSong() { stopAutoScroll(); switchView('home-view'); }

// 6. LÓGICA DE LETRAS
function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-musicos').classList.toggle('active', mode === 'musicos');
    document.getElementById('btn-voces').classList.toggle('active', mode === 'voces');
    renderLyrics();
}

function renderLyrics() {
    if (!currentSong) return;
    const container = document.getElementById('lyrics-container');
    container.style.fontSize = fontSize + 'px';
    
    let text = (currentMode === 'musicos') ? currentSong.Letra_Musicos : currentSong.Letra_Voces;
    if (!text) text = "No hay letra en esta columna.";

    let processed = text.trim().replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
    processed = processed.replace(/{.*?}/gi, '');
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

// 7. FUNCIONES DEL MODAL
function openServiceModal() {
    tempSelectedSongs = [];
    renderSelectedSongs();
    document.getElementById('service-modal').style.display = 'flex';
}
function closeServiceModal() { document.getElementById('service-modal').style.display = 'none'; }

function searchSongsForModal() {
    const term = document.getElementById('modal-song-search').value.toLowerCase();
    const resultsDiv = document.getElementById('modal-search-results');
    if (term.length < 2) { resultsDiv.style.display = 'none'; return; }

    const filtered = songsDatabase.filter(s => s.Titulo.toLowerCase().includes(term) || s.Artista.toLowerCase().includes(term));
    resultsDiv.style.display = filtered.length > 0 ? 'block' : 'none';
    resultsDiv.innerHTML = filtered.map(s => `
        <div class="modal-search-item" onclick="addSongToService('${s.ID}', '${s.Titulo.replace(/'/g, "\\'")}')">
            <span>${s.Titulo}</span><small>${s.Artista}</small>
        </div>
    `).join('');
}

function addSongToService(id, titulo) {
    if (tempSelectedSongs.find(s => s.id === id)) return showToast("Ya está en la lista", "error");
    tempSelectedSongs.push({ id: id, titulo: titulo });
    document.getElementById('modal-song-search').value = "";
    document.getElementById('modal-search-results').style.display = 'none';
    renderSelectedSongs();
}

function removeSongFromService(id) {
    tempSelectedSongs = tempSelectedSongs.filter(s => s.id !== id);
    renderSelectedSongs();
}

function renderSelectedSongs() {
    const list = document.getElementById('selected-songs-list');
    list.innerHTML = tempSelectedSongs.length === 0 ? '<p class="empty-msg">No has seleccionado canciones aún.</p>' : 
        tempSelectedSongs.map(s => `<div class="selected-song-pill"><span>${s.titulo}</span><i class="fas fa-times" onclick="removeSongFromService('${s.id}')"></i></div>`).join('');
}

async function saveNewService() {
    const name = document.getElementById('new-service-name').value;
    const date = document.getElementById('new-service-date').value;
    const leader = document.getElementById('new-service-leader').value;
    if (!name || !date || tempSelectedSongs.length === 0) return showToast("Faltan datos", "error");

    const idsString = tempSelectedSongs.map(s => s.id).join(', ');
    showToast("Guardando...", "info");

    try {
        await fetch(WEB_APP_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ fecha: date, nombre: name, ids: idsString, lider: leader }) });
        showToast("Servicio guardado", "success");
        setTimeout(() => location.reload(), 1500);
    } catch (e) { showToast("Error al guardar", "error"); }
}

// 8. OTROS (TONO, SCROLL, TOAST)
function changeKey(val) {
    currentTransposition += val;
    let tonoOrig = currentSong.Tono || "C";
    const normalize = (c) => c.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
    let indexBase = scale.indexOf(normalize(tonoOrig));
    if (indexBase !== -1) {
        let newIdx = (indexBase + currentTransposition) % 12;
        if (newIdx < 0) newIdx += 12;
        document.getElementById('current-key').innerText = scale[newIdx];
    }
    renderLyrics();
}

function changeFontSize(val) { fontSize += val; if(fontSize < 10) fontSize=10; renderLyrics(); }
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

// Buscador principal
document.getElementById('search-input').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = currentSongList.filter(s => s.Titulo.toLowerCase().includes(term) || s.Artista.toLowerCase().includes(term));
    renderSongList(filtered);
};
