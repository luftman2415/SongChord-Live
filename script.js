const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyNsH9haUN48LHH0DtEyT7S-HlMjIzBlP_CqkI9HSDoNuowKTCbEDXTg1_RHn94S9y-/exec'; 

let songsDatabase = [];
let servicesDatabase = [];
let currentSongList = [];
let currentSong = null;
let currentMode = 'musicos'; 
let fontSize = 16;
let currentTransposition = 0;
let isScrolling = false;
let scrollInterval;

const scale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// 1. GESTIÓN DEL SPLASH SCREEN
window.onload = () => {
    initApp();
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        splash.style.opacity = '0';
        setTimeout(() => splash.style.display = 'none', 800);
    }, 3000); // 3 segundos de bienvenida
};

// 2. CARGA DE DATOS
async function initApp() {
    try {
        const response = await fetch(WEB_APP_URL);
        const data = await response.json();
        
        if(data.bienvenida) document.getElementById('welcome-text').innerText = data.bienvenida;

        songsDatabase = data.canciones.map(item => {
            const find = (key) => {
                const k = Object.keys(item).find(k => k.toLowerCase().trim() === key.toLowerCase());
                return k ? item[k] : "";
            };
            return {
                ID: find('ID'), Titulo: find('Titulo'), Artista: find('Artista'),
                Tono: find('Tono'), Letra_Musicos: find('Letra_Musicos'), Letra_Voces: find('Letra_Voces')
            };
        });

        servicesDatabase = data.servicios;
        renderServices();
    } catch (e) { console.error(e); }
}

// 3. GESTIÓN DE SERVICIOS
function renderServices() {
    const container = document.getElementById('services-container');
    if (!servicesDatabase || servicesDatabase.length === 0) {
        container.innerHTML = "<p class='loading-small'>No hay servicios programados.</p>";
        return;
    }
    container.innerHTML = servicesDatabase.map((ser, i) => `
        <div class="service-card" onclick="showServiceSongs(${i})">
            <div class="service-date"><i class="far fa-calendar-alt"></i></div>
            <div class="service-info">
                <h3>${ser['Nombre del Servicio'] || 'Servicio'}</h3>
                <p>${ser['Líder'] ? 'Dirige: ' + ser['Líder'] : ''}</p>
            </div>
            <i class="fas fa-chevron-right" style="margin-left:auto; color:#ccc;"></i>
        </div>
    `).join('');
}

// 4. GUARDAR NUEVO SERVICIO (Escritura en Excel)
async function saveNewService() {
    const name = document.getElementById('new-service-name').value;
    const date = document.getElementById('new-service-date').value;
    const leader = document.getElementById('new-service-leader').value;
    const ids = document.getElementById('new-service-ids').value;

    if(!name || !date || !ids) return alert("Por favor completa los campos principales.");

    const newService = { nombre: name, fecha: date, lider: leader, ids: ids };

    // Enviar al Excel
    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors', // Necesario para Google Apps Script
            body: JSON.stringify(newService)
        });
        alert("¡Servicio programado con éxito!");
        closeServiceModal();
        location.reload(); // Recarga para ver los cambios
    } catch (e) { alert("Error al guardar."); }
}

// MODAL CONTROLS
function openServiceModal() { document.getElementById('service-modal').style.display = 'flex'; }
function closeServiceModal() { document.getElementById('service-modal').style.display = 'none'; }

// NAVEGACIÓN Y LETRAS (Igual que antes pero optimizado)
function showServiceSongs(index) {
    const service = servicesDatabase[index];
    const ids = service['Lista de IDs de canciones separados por comas'].toString().split(',').map(id => id.trim());
    currentSongList = songsDatabase.filter(s => ids.includes(s.ID.toString()));
    document.getElementById('list-title').innerText = service['Nombre del Servicio'];
    document.getElementById('list-subtitle').innerText = "Lista de canciones del servicio";
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
    list.innerHTML = songs.map((song) => `
        <div class="song-card" onclick="openSongByID('${song.ID}')">
            <div><h3>${song.Titulo}</h3><p>${song.Artista}</p></div>
            <div style="font-weight:800; color:#6366f1; background:#eef2ff; padding:5px 10px; border-radius:10px;">${song.Tono}</div>
        </div>
    `).join('');
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function goToDashboard() { switchView('dashboard-view'); }

function openSongByID(id) {
    currentSong = songsDatabase.find(s => s.ID.toString() === id.toString());
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

function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-musicos').classList.toggle('active', mode === 'musicos');
    document.getElementById('btn-voces').classList.toggle('active', mode === 'voces');
    renderLyrics();
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

function renderLyrics() {
    if (!currentSong) return;
    const container = document.getElementById('lyrics-container');
    container.style.fontSize = fontSize + 'px';
    let text = (currentMode === 'musicos') ? currentSong.Letra_Musicos : currentSong.Letra_Voces;
    if (!text) text = "Contenido no disponible.";
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

function changeFontSize(val) { fontSize += val; renderLyrics(); }
function toggleAutoScroll() { isScrolling ? stopAutoScroll() : startAutoScroll(); }
function startAutoScroll() {
    isScrolling = true;
    document.getElementById('scroll-icon').className = 'fas fa-pause';
    const container = document.getElementById('lyrics-container');
    scrollInterval = setInterval(() => {
        if (container) {
            container.scrollBy(0, 1);
            if (Math.ceil(container.scrollTop + container.clientHeight) >= container.scrollHeight) stopAutoScroll();
        }
    }, 50);
}
function stopAutoScroll() { isScrolling = false; document.getElementById('scroll-icon').className = 'fas fa-play'; clearInterval(scrollInterval); }

document.getElementById('search-input').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = currentSongList.filter(s => s.Titulo.toLowerCase().includes(term) || s.Artista.toLowerCase().includes(term));
    renderSongList(filtered);
};