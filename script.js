// 1. CONFIGURACIÓN Y ESCALA MUSICAL
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxmfbjf1rw_S8ehppKYmEZrt_ZTLamM6p6d-aBCDFnWVgXQ01_PtXl_0pfvLDQK1ASL/exec'; 
const scale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

let songsDatabase = [];
let currentSong = null;
let currentMode = 'musicos'; 
let fontSize = 16;
let currentTransposition = 0;
let isScrolling = false;
let scrollInterval;

// 2. CARGAR CANCIONES DESDE GOOGLE
async function fetchSongs() {
    try {
        const response = await fetch(WEB_APP_URL);
        const data = await response.json();
        
        songsDatabase = data.map(item => {
            const find = (key) => {
                const k = Object.keys(item).find(k => k.toLowerCase().trim() === key.toLowerCase());
                return k ? item[k] : "";
            };
            return {
                Titulo: find('Titulo'),
                Artista: find('Artista'),
                Tono: find('Tono'),
                Letra_Musicos: find('Letra_Musicos'),
                Letra_Voces: find('Letra_Voces')
            };
        });
        renderList(songsDatabase);
    } catch (e) {
        document.getElementById('song-list-container').innerHTML = `<p style="color:red; text-align:center; padding:20px;">Error de conexión.</p>`;
    }
}

// 3. DIBUJAR LA LISTA PRINCIPAL
function renderList(songs) {
    const list = document.getElementById('song-list-container');
    list.innerHTML = songs.map((song, i) => `
        <div class="song-card" onclick="openSong(${i})">
            <div>
                <h3 style="margin:0;">${song.Titulo}</h3>
                <p style="margin:0; font-size:0.8rem; color:gray;">${song.Artista}</p>
            </div>
            <div style="font-weight:bold; color:#6366f1; background:#eef2ff; padding:4px 8px; border-radius:8px; font-size:0.75rem;">${song.Tono}</div>
        </div>
    `).join('');
}

// 4. ABRIR UNA CANCIÓN (Reinicio de variables y Scroll)
function openSong(index) {
    currentSong = songsDatabase[index];

    // Reiniciamos variables de la canción
    currentTransposition = 0; 
    fontSize = 16;            
    currentMode = 'musicos';
    
    // RESET DE SCROLL: Enviamos la letra al inicio (arriba del todo)
    const container = document.getElementById('lyrics-container');
    if (container) container.scrollTop = 0;

    // Reset visual de botones y textos
    document.getElementById('btn-musicos').classList.add('active');
    document.getElementById('btn-voces').classList.remove('active');
    document.getElementById('view-title').innerText = currentSong.Titulo;
    document.getElementById('view-artist').innerText = currentSong.Artista;
    document.getElementById('current-key').innerText = currentSong.Tono;
    
    // Cambio de vista
    document.getElementById('home-view').classList.remove('active');
    document.getElementById('song-view').classList.add('active');
    
    renderLyrics();
}

function closeSong() {
    stopAutoScroll();
    document.getElementById('home-view').classList.add('active');
    document.getElementById('song-view').classList.remove('active');
}

// 5. CAMBIAR ENTRE MÚSICOS Y VOCES
function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-musicos').classList.toggle('active', mode === 'musicos');
    document.getElementById('btn-voces').classList.toggle('active', mode === 'voces');
    renderLyrics();
}

// 6. FUNCIÓN DE TONO
function changeKey(val) {
    currentTransposition += val;
    let tonoOriginal = currentSong.Tono || "C";
    const normalize = (c) => c.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
    let indexBase = scale.indexOf(normalize(tonoOriginal));
    if (indexBase !== -1) {
        let nuevoIndex = (indexBase + currentTransposition) % 12;
        if (nuevoIndex < 0) nuevoIndex += 12;
        document.getElementById('current-key').innerText = scale[nuevoIndex];
    }
    renderLyrics();
}

// 7. TRANSPOSICIÓN DE ACORDES
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

// 8. DIBUJAR LETRA Y ACORDES
function renderLyrics() {
    if (!currentSong) return;
    const container = document.getElementById('lyrics-container');
    container.style.fontSize = fontSize + 'px';
    
    let text = (currentMode === 'musicos') ? currentSong.Letra_Musicos : currentSong.Letra_Voces;
    if (!text || text.trim() === "") text = "⚠️ Columna vacía en Excel.";

    let processed = text.trim().replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
    processed = processed.replace(/{title:.*?}|{author:.*?}|{key:.*?}|{tempo:.*?}|{time:.*?}/gi, '');
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

// 9. OTRAS UTILIDADES
function changeFontSize(val) {
    fontSize += val;
    if (fontSize < 10) fontSize = 10;
    renderLyrics();
}

function toggleAutoScroll() {
    isScrolling ? stopAutoScroll() : startAutoScroll();
}

function startAutoScroll() {
    isScrolling = true;
    const icon = document.getElementById('scroll-icon');
    if (icon) icon.className = 'fas fa-pause';
    
    const container = document.getElementById('lyrics-container');

    scrollInterval = setInterval(() => {
        if (container) {
            container.scrollBy(0, 1);

            // CONDICIÓN: Si el scroll llegó al final, detenerse automáticamente
            // scrollTop + clientHeight es donde estamos, scrollHeight es el total
            if (Math.ceil(container.scrollTop + container.clientHeight) >= container.scrollHeight) {
                stopAutoScroll();
            }
        }
    }, 50);
}

function stopAutoScroll() {
    isScrolling = false;
    const icon = document.getElementById('scroll-icon');
    if (icon) icon.className = 'fas fa-play';
    clearInterval(scrollInterval);
}

document.getElementById('search-input').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = songsDatabase.filter(s => 
        s.Titulo.toLowerCase().includes(term) || s.Artista.toLowerCase().includes(term)
    );
    renderList(filtered);
};

fetchSongs();