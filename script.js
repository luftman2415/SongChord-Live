// --- CONFIGURACIÓN ---
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyNsH9haUN48LHH0DtEyT7S-HlMjIzBlP_CqkI9HSDoNuowKTCbEDXTg1_RHn94S9y-/exec'; 

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
        
        if(data.bienvenida) document.getElementById('welcome-text').innerText = data.bienvenida;

        // Mapeo flexible de canciones (Hoja 1)
        songsDatabase = data.canciones.map(item => {
            const find = (key) => {
                const k = Object.keys(item).find(k => k.toLowerCase().replace(/_/g, ' ').trim().includes(key.toLowerCase().trim()));
                return k ? item[k] : "";
            };
            return {
                ID: find('ID').toString().trim(), 
                Titulo: find('Titulo') || "Sin Título",
                Artista: find('Artista') || "Desconocido",
                Tono: find('Tono') || "C",
                Letra_Musicos: find('Letra Musicos') || find('Letra_Musicos') || find('Musicos') || "",
                Letra_Voces: find('Letra Voces') || find('Letra_Voces') || find('Voces') || ""
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
        const get = (key) => {
            const k = Object.keys(ser).find(k => k.toLowerCase().includes(key.toLowerCase()));
            return k ? ser[k] : "";
        };
        const fechaRaw = get('fecha');
        const fecha = fechaRaw ? fechaRaw.toString().split('T')[0] : "Pendiente";
        const nombre = get('nombre') || "Servicio";
        const lider = get('líder') || get('director') || "Líder";

        return `
            <div class="service-card" onclick="showServiceSongs(${i})">
                <div class="service-date"><i class="far fa-calendar-alt"></i></div>
                <div class="service-info"><h3>${nombre}</h3><p>${fecha} • Dirige: ${lider}</p></div>
                <i class="fas fa-chevron-right" style="margin-left:auto; color:#ccc;"></i>
            </div>
        `;
    }).join('');
}

// 4. FILTRAR CANCIONES POR SERVICIO
function showServiceSongs(index) {
    const ser = servicesDatabase[index];
    const idKey = Object.keys(ser).find(k => k.toLowerCase().includes('ids'));
    let rawIds = ser[idKey] ? ser[idKey].toString() : "";
    
    // Limpieza de IDs
    const idsToFilter = rawIds.replace(/[.\s]/g, ',').split(',').map(id => id.trim()).filter(id => id !== "");

    currentSongList = songsDatabase.filter(song => idsToFilter.includes(song.ID.toString()));

    const nombreKey = Object.keys(ser).find(k => k.toLowerCase().includes('nombre'));
    document.getElementById('list-title').innerText = ser[nombreKey] || "Servicio";
    document.getElementById('list-subtitle').innerText = "Lista de canciones";
    
    renderSongList(currentSongList);
    switchView('home-view');
}

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
    if(!currentSong) {
        showToast("Error: No se encontró la canción", "error");
        return;
    }

    currentTransposition = 0; 
    fontSize = 16; 
    currentMode = 'musicos';
    
    document.getElementById('btn-musicos').classList.add('active');
    document.getElementById('btn-voces').classList.remove('active');
    document.getElementById('view-title').innerText = currentSong.Titulo;
    document.getElementById('view-artist').innerText = currentSong.Artista;
    document.getElementById('current-key').innerText = currentSong.Tono;
    
    document.getElementById('lyrics-container').scrollTop = 0;
    switchView('song-view');
    renderLyrics();
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

    // Procesar etiquetas {comment: Intro}
    processed = processed.replace(/{comment:\s*(.*?)}/gi, '<span class="section-tag">$1</span>');
    
    // Detectar etiquetas automáticas SOLO si están en su propia línea y empiezan con Mayúscula
    processed = processed.replace(/^(Intro|Verso|Coro|Puente|Final|Solo|Interludio|Outro)\b/gm, '<span class="section-tag">$1</span>');

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
function closeSong() { stopAutoScroll(); switchView('home-view'); }

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