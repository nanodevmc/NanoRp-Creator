// State
let currentPackDir = '';
let currentZipPath = '';
let parityImages = []; // { path, width, height, valid, is_even_w, is_even_h, suggested_w, suggested_h }
let fontMappings = []; // { symbol, imagePath, height, ascent }
let itemMappings = []; // { baseItem, cmd, imagePath, customName }
let soundMappings = []; // { eventId, oggPath, category, stream, subtitle }

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

// Navigation Tabs
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(i => i.classList.remove('active'));
        pages.forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        const targetPage = document.getElementById(item.dataset.page);
        if (targetPage) targetPage.classList.add('active');
    });
});

// Periodic RAM / Engine Stats
async function refreshStats() {
    if (!window.api || !window.api.getStats) return;
    try {
        const stats = await window.api.getStats();
        const ramLbl = document.getElementById('lbl-ram-usage');
        const engineLbl = document.getElementById('lbl-engine-status');

        if (ramLbl) {
            ramLbl.textContent = `RAM: ${stats.rssMB} MB (Heap: ${stats.heapUsedMB} MB)`;
        }
        if (engineLbl) {
            if (stats.rustActive && stats.cppActive) {
                engineLbl.textContent = 'Ядро: C++17 & Rust v1.0';
            } else if (stats.rustActive || stats.cppActive) {
                engineLbl.textContent = 'Ядро: Гибрид (Native + JS)';
            } else {
                engineLbl.textContent = 'Ядро: Ultra-Lite JS Engine';
            }
        }
    } catch {}
}
setInterval(refreshStats, 5000);
refreshStats();

// --- PAGE 1: PROJECT & CLOUD ---

// Helper: Non-blocking button copy feedback
function copyWithFeedback(btn, text) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = 'Скопировано!';
    btn.disabled = true;
    setTimeout(() => {
        btn.textContent = orig;
        btn.disabled = false;
    }, 1500);
}

// MOTD Minecraft Color Palette & Live Preview
const mcColorMap = {
    '0': '#000000', '1': '#0000aa', '2': '#00aa00', '3': '#00aaaa',
    '4': '#aa0000', '5': '#aa00aa', '6': '#ffaa00', '7': '#aaaaaa',
    '8': '#555555', '9': '#5555ff', 'a': '#55ff55', 'b': '#55ffff',
    'c': '#ff5555', 'd': '#ff55ff', 'e': '#ffff55', 'f': '#ffffff'
};

function renderMotdPreview(rawText) {
    const preview = document.getElementById('motd-preview');
    if (!preview) return;
    if (!rawText) {
        preview.innerHTML = '<span style="color: #64748b;">(Пустое описание)</span>';
        return;
    }
    let html = '';
    let currentColor = '#ffffff';
    let isBold = false;
    const parts = rawText.split(/([&§][0-9a-fk-orA-FK-OR])/g);
    for (const part of parts) {
        if (/^[&§][0-9a-fA-F]$/.test(part)) {
            currentColor = mcColorMap[part[1].toLowerCase()] || '#ffffff';
        } else if (/^[&§][lL]$/.test(part)) {
            isBold = true;
        } else if (/^[&§][rR]$/.test(part)) {
            currentColor = '#ffffff';
            isBold = false;
        } else if (part.length > 0) {
            const safeText = part
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/ /g, '&nbsp;');
            html += `<span style="color: ${currentColor}; font-weight: ${isBold ? 'bold' : 'normal'};">${safeText}</span>`;
        }
    }
    preview.innerHTML = html || '<span style="color: #64748b;">(Пустое описание)</span>';
}

const descInput = document.getElementById('inp-pack-desc');
if (descInput) {
    descInput.addEventListener('input', () => renderMotdPreview(descInput.value));
    renderMotdPreview(descInput.value);
}

document.querySelectorAll('.color-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        const code = chip.dataset.code;
        if (!descInput) return;
        const start = descInput.selectionStart || descInput.value.length;
        const end = descInput.selectionEnd || descInput.value.length;
        descInput.value = descInput.value.substring(0, start) + code + descInput.value.substring(end);
        descInput.focus();
        descInput.selectionStart = descInput.selectionEnd = start + code.length;
        renderMotdPreview(descInput.value);
    });
});

document.getElementById('btn-select-folder').addEventListener('click', async () => {
    const dir = await window.api.openDirectory();
    if (dir) {
        currentPackDir = dir;
        const folderName = dir.split(/[\\/]/).pop();
        const span = document.getElementById('btn-select-folder').querySelector('span');
        if (span) span.textContent = folderName;
        document.getElementById('btn-select-folder').title = dir;

        // Auto-fill pack name if default
        const packNameInp = document.getElementById('inp-pack-name');
        if (packNameInp && packNameInp.value === 'ServerResourcePack') {
            packNameInp.value = folderName.replace(/[/\\:*?"<>|]/g, '_');
        }
    }
});

document.getElementById('btn-generate-pack').addEventListener('click', async () => {
    if (!currentPackDir) {
        alert('Пожалуйста, сначала выберите рабочую папку ресурс-пака!');
        return;
    }

    const packData = {
        targetDir: currentPackDir,
        name: document.getElementById('inp-pack-name').value.trim() || 'ServerResourcePack',
        packFormat: document.getElementById('sel-pack-format').value,
        description: document.getElementById('inp-pack-desc').value,
        items: itemMappings,
        fonts: fontMappings,
        sounds: soundMappings
    };

    const btn = document.getElementById('btn-generate-pack');
    const span = btn.querySelector('span');
    if (span) span.textContent = 'Генерация...';
    btn.disabled = true;

    try {
        const res = await window.api.generatePack(packData);
        if (res.success) {
            alert('Структура ресурс-пака и pack.mcmeta успешно сформированы!');
        } else {
            alert('Ошибка генерации: ' + res.error);
        }
    } finally {
        btn.disabled = false;
        if (span) span.textContent = 'Сформировать структуру';
    }
});

// Create ZIP
document.getElementById('btn-create-zip').addEventListener('click', async () => {
    if (!currentPackDir) {
        alert('Сначала выберите или сгенерируйте папку ресурс-пака!');
        return;
    }

    const defaultName = (document.getElementById('inp-pack-name').value.trim() || 'ResourcePack') + '.zip';
    const savePath = await window.api.saveZip(defaultName);
    if (!savePath) return;

    const btn = document.getElementById('btn-create-zip');
    const span = btn.querySelector('span');
    btn.disabled = true;
    if (span) span.textContent = 'Упаковка...';

    try {
        const res = await window.api.createZip(currentPackDir, savePath);
        if (res.success) {
            currentZipPath = savePath;
            alert(`Ресурс-пак упакован!\nФайлов: ${res.files_packed}\nРазмер: ${(res.size_bytes / 1024 / 1024).toFixed(2)} MB\nSHA-1: ${res.sha1}`);
        } else {
            alert('Ошибка упаковки: ' + res.error);
        }
    } finally {
        btn.disabled = false;
        if (span) span.textContent = 'Упаковать .ZIP';
    }
});

// Export directly to .minecraft/resourcepacks in 1 click
const exportMcBtn = document.getElementById('btn-export-minecraft');
if (exportMcBtn) {
    exportMcBtn.addEventListener('click', async () => {
        if (!currentPackDir) {
            alert('Сначала выберите или укажите папку ресурс-пака!');
            return;
        }

        const packName = document.getElementById('inp-pack-name').value.trim() || 'ServerResourcePack';
        const span = exportMcBtn.querySelector('span');
        const origText = span ? span.textContent : '';
        exportMcBtn.disabled = true;
        if (span) span.textContent = 'Экспорт в .minecraft...';

        try {
            const res = await window.api.exportToMinecraft(currentPackDir, packName);
            if (res.success) {
                const statusBox = document.getElementById('box-minecraft-status');
                if (statusBox) {
                    statusBox.style.display = 'block';
                    statusBox.innerHTML = `✓ Ресурс-пак <b>${packName}.zip</b> скопирован в папку игры!<br>Нажмите <b style="color: #fff;">F3 + T</b> в Minecraft для быстрой перезагрузки.`;
                }
            } else {
                alert('Ошибка экспорта в .minecraft: ' + res.error);
            }
        } finally {
            exportMcBtn.disabled = false;
            if (span) span.textContent = origText;
        }
    });
}

// Upload to Cloud
document.getElementById('btn-upload-cloud').addEventListener('click', async () => {
    let zipToUpload = currentZipPath;
    if (!zipToUpload) {
        const files = await window.api.openFiles([{ name: 'Zip Archive', extensions: ['zip'] }]);
        if (!files || files.length === 0) return;
        zipToUpload = files[0];
    }

    const provider = document.getElementById('sel-cloud-provider').value;
    const btn = document.getElementById('btn-upload-cloud');
    const span = btn.querySelector('span');
    btn.disabled = true;
    if (span) span.textContent = 'Загрузка...';

    try {
        const res = await window.api.uploadCloud(zipToUpload, provider);
        if (res.success) {
            const box = document.getElementById('box-cloud-result');
            box.style.display = 'flex';
            document.getElementById('res-cloud-url').textContent = res.url;
            document.getElementById('res-cloud-sha1').textContent = res.sha1;
            document.getElementById('res-server-properties').textContent =
                `resource-pack=${res.url}\nresource-pack-sha1=${res.sha1}`;
        }
    } catch (e) {
        alert('Ошибка загрузки в облако: ' + e.message);
    } finally {
        btn.disabled = false;
        if (span) span.textContent = 'Залить в Облако';
    }
});

document.getElementById('btn-copy-url').addEventListener('click', () => {
    copyWithFeedback(document.getElementById('btn-copy-url'), document.getElementById('res-cloud-url').textContent);
});

document.getElementById('btn-copy-sha1').addEventListener('click', () => {
    copyWithFeedback(document.getElementById('btn-copy-sha1'), document.getElementById('res-cloud-sha1').textContent);
});

// --- PAGE 2: PARITY VALIDATOR ---

let paritySearchQuery = '';

document.getElementById('btn-scan-files').addEventListener('click', async () => {
    const files = await window.api.openFiles([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]);
    if (files && files.length > 0) {
        for (const f of files) {
            const norm = f.toLowerCase().replace(/\\/g, '/');
            if (!parityImages.some(p => p.path.toLowerCase().replace(/\\/g, '/') === norm)) {
                const info = await window.api.inspectImage(f);
                if (info && info.success) {
                    parityImages.push(info);
                }
            }
        }
        renderParityTable();
    }
});

document.getElementById('btn-scan-dir').addEventListener('click', async () => {
    const dir = await window.api.openDirectory();
    if (!dir) return;

    const btn = document.getElementById('btn-scan-dir');
    const span = btn.querySelector('span');
    btn.disabled = true;
    if (span) span.textContent = 'Сканирование...';

    try {
        const images = await window.api.scanDirectoryImages(dir);
        let addedCount = 0;
        for (const img of images) {
            const norm = img.path.toLowerCase().replace(/\\/g, '/');
            if (!parityImages.some(p => p.path.toLowerCase().replace(/\\/g, '/') === norm)) {
                parityImages.push(img);
                addedCount++;
            }
        }
        renderParityTable();
    } finally {
        btn.disabled = false;
        if (span) span.textContent = 'Папка с текстурами';
    }
});

const paritySearchInput = document.getElementById('inp-parity-search');
if (paritySearchInput) {
    paritySearchInput.addEventListener('input', (e) => {
        paritySearchQuery = e.target.value.trim().toLowerCase();
        renderParityTable();
    });
}

const clearParityBtn = document.getElementById('btn-clear-parity');
if (clearParityBtn) {
    clearParityBtn.addEventListener('click', () => {
        parityImages = [];
        if (paritySearchInput) paritySearchInput.value = '';
        paritySearchQuery = '';
        renderParityTable();
    });
}

// Minecraft standard resource naming check: strictly lowercase, digits, _, -, .
function isMinecraftPathValid(filePath) {
    const fileName = filePath.split(/[\\/]/).pop();
    return /^[a-z0-9_.-]+$/.test(fileName);
}

function sanitizeMinecraftFileName(fileName) {
    const dotIdx = fileName.lastIndexOf('.');
    const ext = dotIdx > 0 ? fileName.substring(dotIdx).toLowerCase() : '';
    const base = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;

    const ruToEn = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y',
        'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
        'х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
    };
    let clean = base.toLowerCase();
    clean = clean.split('').map(c => ruToEn[c] || c).join('');
    clean = clean.replace(/[^a-z0-9_.-]/g, '_');
    return clean + ext;
}

// Pure Canvas Fallback for 100% reliable edge-clamping on any system without Rust
async function canvasEdgeClampFix(inPath, outPath, oldW, oldH, targetW, targetH) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = async () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = targetW;
                canvas.height = targetH;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;

                // Draw original
                ctx.drawImage(img, 0, 0);

                // Replicate rightmost pixel column if width expanded
                if (targetW > oldW) {
                    ctx.drawImage(canvas, oldW - 1, 0, 1, oldH, oldW, 0, targetW - oldW, oldH);
                }
                // Replicate bottommost pixel row if height expanded
                if (targetH > oldH) {
                    ctx.drawImage(canvas, 0, oldH - 1, targetW, 1, 0, oldH, targetW, targetH - oldH);
                }

                const dataUrl = canvas.toDataURL('image/png');
                const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
                const saveRes = await window.api.saveImageBuffer(outPath, base64);
                if (saveRes && saveRes.success) {
                    resolve(true);
                } else {
                    reject(new Error(saveRes ? saveRes.error : 'Save failed'));
                }
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => reject(new Error('Не удалось декодировать изображение'));
        img.src = `file://${inPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    });
}

function renderParityTable() {
    const tbody = document.getElementById('tbl-parity-body');
    const fixAllBtn = document.getElementById('btn-fix-all-images');
    const lintBtn = document.getElementById('btn-fix-linter-names');
    const clearBtn = document.getElementById('btn-clear-parity');
    const countLbl = document.getElementById('lbl-parity-count');

    if (clearBtn) clearBtn.style.display = parityImages.length > 0 ? 'inline-flex' : 'none';

    if (countLbl) {
        const oddCount = parityImages.filter(p => !p.valid).length;
        const invalidNamesCount = parityImages.filter(p => !isMinecraftPathValid(p.path)).length;
        const namesNote = invalidNamesCount > 0 ? `, ${invalidNamesCount} с некорректным именем` : '';
        countLbl.textContent = `${parityImages.length} файлов (${oddCount} нечётных${namesNote})`;
    }

    if (parityImages.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 32px; color: var(--ink-tertiary);">Файлы ещё не загружены. Нажмите «Выбрать файлы» или укажите директорию.</td></tr>`;
        if (fixAllBtn) fixAllBtn.style.display = 'none';
        if (lintBtn) lintBtn.style.display = 'none';
        return;
    }

    const filtered = paritySearchQuery
        ? parityImages.filter(img => img.path.toLowerCase().includes(paritySearchQuery))
        : parityImages;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 32px; color: var(--ink-tertiary);">По запросу «${paritySearchQuery}» ничего не найдено</td></tr>`;
        if (fixAllBtn) fixAllBtn.style.display = 'none';
        if (lintBtn) lintBtn.style.display = 'none';
        return;
    }

    const hasOdd = parityImages.some(img => !img.valid);
    if (fixAllBtn) fixAllBtn.style.display = hasOdd ? 'inline-flex' : 'none';

    const hasInvalidNames = parityImages.some(img => !isMinecraftPathValid(img.path));
    if (lintBtn) lintBtn.style.display = hasInvalidNames ? 'inline-flex' : 'none';

    tbody.innerHTML = filtered.map((img) => {
        const originalIndex = parityImages.indexOf(img);
        const fileName = img.path.split(/[\\/]/).pop();
        const pathValid = isMinecraftPathValid(img.path);

        const statusBadge = img.valid
            ? `<span class="parity-badge parity-badge--even"><span class="parity-badge__dot"></span>Чётный</span>`
            : `<span class="parity-badge parity-badge--odd"><span class="parity-badge__dot"></span>Нечётный</span>`;

        const nameBadge = !pathValid
            ? `<span class="parity-badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 10px; margin-left: 6px;"><span class="parity-badge__dot" style="background: #f59e0b;"></span>Не по стандарту</span>`
            : '';

        const actionBtn = img.valid
            ? `<span style="color: var(--ink-muted); font-size: 11px; font-family: var(--font-mono);">OK</span>`
            : `<button class="btn btn-secondary btn-sm" onclick="fixSingleImage(${originalIndex})">Расширить до ${img.suggested_w}×${img.suggested_h}</button>`;

        return `
            <tr>
                <td>
                    <div style="font-weight: 600; color: var(--ink-primary); display: flex; align-items: center;">
                        ${fileName} ${nameBadge}
                    </div>
                    <div style="font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-tertiary); overflow: hidden; text-overflow: ellipsis; max-width: 340px;">${img.path}</div>
                </td>
                <td><span style="font-family: var(--font-mono); font-variant-numeric: tabular-nums;">${img.width} × ${img.height}</span></td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">${actionBtn}</td>
            </tr>
        `;
    }).join('');
}

window.fixSingleImage = async function(idx) {
    const item = parityImages[idx];
    if (!item || item.valid) return;

    const outPath = item.path; // overwrite or fix
    const res = await window.api.fixImage(item.path, outPath);
    let updated = await window.api.inspectImage(outPath);

    // If native engine did not expand the dimensions (JS Fallback active), execute pure canvas edge-clamp!
    if (!updated || !updated.valid) {
        try {
            await canvasEdgeClampFix(item.path, outPath, item.width, item.height, item.suggested_w, item.suggested_h);
            updated = await window.api.inspectImage(outPath);
        } catch (cErr) {
            console.error('Canvas Fallback error:', cErr);
        }
    }

    if (updated) {
        parityImages[idx] = updated;
        renderParityTable();
    }
};

// Auto-rename files violating Minecraft naming standards
const lintBtn = document.getElementById('btn-fix-linter-names');
if (lintBtn) {
    lintBtn.addEventListener('click', async () => {
        let fixedCount = 0;
        for (let i = 0; i < parityImages.length; i++) {
            const p = parityImages[i].path;
            if (!isMinecraftPathValid(p)) {
                const parts = p.split(/[\\/]/);
                const oldFileName = parts.pop();
                const dir = parts.join('/');
                const newFileName = sanitizeMinecraftFileName(oldFileName);
                const newFullPath = dir + '/' + newFileName;

                const res = await window.api.renameFile(p, newFullPath);
                if (res.success) {
                    parityImages[i].path = res.newPath || newFullPath;
                    fixedCount++;
                }
            }
        }
        if (fixedCount > 0) {
            alert(`Успешно переименовано ${fixedCount} файлов по стандарту Minecraft (только a-z, 0-9, _, -)!`);
            renderParityTable();
        }
    });
}

document.getElementById('btn-fix-all-images').addEventListener('click', async () => {
    const btn = document.getElementById('btn-fix-all-images');
    const span = btn.querySelector('span');
    btn.disabled = true;
    if (span) span.textContent = 'Обработка...';

    try {
        for (let i = 0; i < parityImages.length; i++) {
            if (!parityImages[i].valid) {
                await window.fixSingleImage(i);
            }
        }
        alert('Все нечётные текстуры успешно расширены (+1px) без деформации спрайтов!');
    } finally {
        btn.disabled = false;
        if (span) span.textContent = 'Расширить все нечётные (+1px)';
    }
});

// --- PAGE 3: FONTS & GLYPHS ---

document.getElementById('btn-font-browse').addEventListener('click', async () => {
    const files = await window.api.openFiles([{ name: 'Icon PNG', extensions: ['png'] }]);
    if (files && files.length > 0) {
        document.getElementById('inp-font-path').value = files[0];
    }
});

const clearFontsBtn = document.getElementById('btn-clear-fonts');
if (clearFontsBtn) {
    clearFontsBtn.addEventListener('click', () => {
        fontMappings = [];
        renderFontList();
    });
}

document.getElementById('btn-confirm-add-font').addEventListener('click', () => {
    let symbol = document.getElementById('inp-font-char').value.trim();
    const imagePath = document.getElementById('inp-font-path').value.trim();
    const height = parseInt(document.getElementById('inp-font-height').value, 10) || 8;
    const ascent = parseInt(document.getElementById('inp-font-ascent').value, 10) || 7;

    if (!symbol || !imagePath) {
        alert('Заполните символ и выберите файл картинки!');
        return;
    }

    if (fontMappings.some(f => f.symbol === symbol)) {
        alert(`Символ «${symbol}» уже добавлен в список шрифтов!`);
        return;
    }

    fontMappings.push({ symbol, imagePath, height, ascent });
    renderFontList();
    document.getElementById('inp-font-path').value = '';
});

function renderFontList() {
    const container = document.getElementById('list-font-mappings');
    const clearBtn = document.getElementById('btn-clear-fonts');
    if (clearBtn) clearBtn.style.display = fontMappings.length > 0 ? 'inline-flex' : 'none';

    if (fontMappings.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--ink-tertiary); font-size: 12px;">Символы пока не добавлены</div>`;
        return;
    }

    container.innerHTML = fontMappings.map((f, i) => {
        const fileName = f.imagePath.split(/[\\/]/).pop();
        const safeSrc = encodeURI(`file://${f.imagePath.replace(/\\/g, '/')}`);
        return `
            <div class="mapping-card">
                <img class="mapping-thumb" src="${safeSrc}" alt="glyph">
                <div class="mapping-details">
                    <div class="mapping-title">Символ: <code style="color: var(--accent); font-weight: 700;">${f.symbol}</code></div>
                    <div class="mapping-meta">Размер: ${f.height}px · Подъём: ${f.ascent}px · ${fileName}</div>
                </div>
                <button class="btn btn-danger-subtle btn-sm" onclick="removeFont(${i})">Удалить</button>
            </div>
        `;
    }).join('');
}

window.removeFont = function(index) {
    fontMappings.splice(index, 1);
    renderFontList();
};

// --- PAGE 4: CUSTOM ITEMS (CUSTOM MODEL DATA) ---

document.getElementById('btn-item-browse').addEventListener('click', async () => {
    const files = await window.api.openFiles([{ name: 'Textures / Models', extensions: ['png', 'json'] }]);
    if (files && files.length > 0) {
        document.getElementById('inp-item-path').value = files[0];
    }
});

const clearItemsBtn = document.getElementById('btn-clear-items');
if (clearItemsBtn) {
    clearItemsBtn.addEventListener('click', () => {
        itemMappings = [];
        renderItemList();
    });
}

document.getElementById('btn-confirm-add-item').addEventListener('click', () => {
    let baseItem = document.getElementById('inp-item-base').value.trim().toLowerCase();
    if (baseItem.startsWith('minecraft:')) baseItem = baseItem.substring(10);
    baseItem = baseItem.replace(/[^a-z0-9_]/g, '_');

    const cmdVal = document.getElementById('inp-item-cmd').value;
    const cmd = parseInt(cmdVal, 10);
    const imagePath = document.getElementById('inp-item-path').value.trim();

    if (!baseItem || isNaN(cmd) || !imagePath) {
        alert('Заполните базовый предмет, CustomModelData и выберите файл!');
        return;
    }

    if (itemMappings.some(it => it.baseItem === baseItem && it.cmd === cmd)) {
        alert(`Для minecraft:${baseItem} уже задан CustomModelData: ${cmd}! Выберите другой номер.`);
        return;
    }

    itemMappings.push({ baseItem, cmd, imagePath });
    renderItemList();
    document.getElementById('inp-item-path').value = '';
    document.getElementById('inp-item-cmd').value = cmd + 1; // Auto-increment CMD for convenience
});

function renderItemList() {
    const container = document.getElementById('list-item-mappings');
    const clearBtn = document.getElementById('btn-clear-items');
    if (clearBtn) clearBtn.style.display = itemMappings.length > 0 ? 'inline-flex' : 'none';

    if (itemMappings.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--ink-tertiary); font-size: 12px;">Кастомные предметы не добавлены</div>`;
        return;
    }

    container.innerHTML = itemMappings.map((it, i) => {
        const isJson = it.imagePath.toLowerCase().endsWith('.json');
        const fileName = it.imagePath.split(/[\\/]/).pop();
        const safeSrc = encodeURI(`file://${it.imagePath.replace(/\\/g, '/')}`);

        const thumbHtml = isJson
            ? `<div class="mapping-thumb-3d">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                <span>3D</span>
               </div>`
            : `<img class="mapping-thumb" src="${safeSrc}" alt="item">`;

        return `
            <div class="mapping-card">
                ${thumbHtml}
                <div class="mapping-details">
                    <div class="mapping-title">minecraft:<b>${it.baseItem}</b> ${isJson ? '<span style="font-size: 10px; color: var(--accent);">(3D Model)</span>' : ''}</div>
                    <div class="mapping-meta">CustomModelData: <span style="color: var(--accent); font-weight: 700;">${it.cmd}</span> · ${fileName}</div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="btn btn-secondary btn-sm" onclick="copyGiveCommand(this, ${i})" title="Копировать по выбранному синтаксису">/give</button>
                    <button class="btn btn-secondary btn-sm" onclick="copyGiveCommand(this, ${i}, 'components')" title="Копировать в формате компонентов (1.20.5+ / 1.21)">1.20.5+</button>
                    <button class="btn btn-danger-subtle btn-sm" onclick="removeItem(${i})">Удалить</button>
                </div>
            </div>
        `;
    }).join('');
}

window.copyGiveCommand = function(btn, index, forceSyntax) {
    const item = itemMappings[index];
    if (!item) return;

    const selEl = document.getElementById('sel-give-syntax');
    const syntax = forceSyntax || (selEl ? selEl.value : 'auto');

    let useComponents = false;
    if (syntax === 'components') {
        useComponents = true;
    } else if (syntax === 'nbt') {
        useComponents = false;
    } else {
        // Auto: 1.20.5+ starts at pack_format 34
        const packFormatEl = document.getElementById('sel-pack-format');
        const pFormat = packFormatEl ? parseInt(packFormatEl.value, 10) : 34;
        useComponents = (pFormat >= 34);
    }

    const cmd = useComponents
        ? `/give @p minecraft:${item.baseItem}[custom_model_data=${item.cmd}] 1`
        : `/give @p minecraft:${item.baseItem}{CustomModelData:${item.cmd}} 1`;

    copyWithFeedback(btn, cmd);
};

window.removeItem = function(index) {
    itemMappings.splice(index, 1);
    renderItemList();
};

// --- PAGE: SOUNDS & AUDIO (SOUNDS.JSON) ---

document.getElementById('btn-sound-browse').addEventListener('click', async () => {
    const files = await window.api.openFiles([{ name: 'OGG Audio (*.ogg)', extensions: ['ogg'] }]);
    if (files && files.length > 0) {
        document.getElementById('inp-sound-path').value = files[0];
        const fileName = files[0].split(/[\\/]/).pop().replace(/\.ogg$/i, '');
        const currentEvent = document.getElementById('inp-sound-event').value;
        if (!currentEvent || currentEvent === 'custom.magic_shot') {
            document.getElementById('inp-sound-event').value = 'custom.' + fileName.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
        }
    }
});

const clearSoundsBtn = document.getElementById('btn-clear-sounds');
if (clearSoundsBtn) {
    clearSoundsBtn.addEventListener('click', () => {
        soundMappings = [];
        renderSoundList();
    });
}

document.getElementById('btn-confirm-add-sound').addEventListener('click', () => {
    const eventIdInp = document.getElementById('inp-sound-event');
    const pathInp = document.getElementById('inp-sound-path');
    const catSelect = document.getElementById('sel-sound-category');
    const streamChk = document.getElementById('chk-sound-stream');
    const subInp = document.getElementById('inp-sound-subtitle');

    const eventId = (eventIdInp.value || '').trim().toLowerCase();
    const oggPath = (pathInp.value || '').trim();
    const category = catSelect.value;
    const stream = !!streamChk.checked;
    const subtitle = (subInp.value || '').trim();

    if (!eventId || !oggPath) {
        alert('Заполните ID звукового события и выберите .ogg файл!');
        return;
    }

    soundMappings.push({ eventId, oggPath, category, stream, subtitle });
    renderSoundList();
    pathInp.value = '';
});

function renderSoundList() {
    const container = document.getElementById('list-sound-mappings');
    const clearBtn = document.getElementById('btn-clear-sounds');
    if (clearBtn) clearBtn.style.display = soundMappings.length > 0 ? 'inline-flex' : 'none';

    if (soundMappings.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--ink-tertiary); font-size: 12px;">Звуковые события не добавлены</div>`;
        return;
    }

    container.innerHTML = soundMappings.map((s, i) => {
        const fileName = s.oggPath.split(/[\\/]/).pop();
        const streamBadge = s.stream
            ? `<span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(59, 130, 246, 0.2); color: #60a5fa;">Stream: true</span>`
            : '';
        const subInfo = s.subtitle ? ` · Субтитр: <i>${s.subtitle}</i>` : '';

        return `
            <div class="mapping-card">
                <div class="mapping-thumb-3d" style="background: rgba(14, 165, 233, 0.1); border-color: rgba(14, 165, 233, 0.25);">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#38bdf8" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    <span>OGG</span>
                </div>
                <div class="mapping-details">
                    <div class="mapping-title"><code>${s.eventId}</code> ${streamBadge}</div>
                    <div class="mapping-meta">Категория: <b>${s.category}</b> · ${fileName}${subInfo}</div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="btn btn-secondary btn-sm" onclick="copyPlaysoundCommand(this, ${i})">Копировать /playsound</button>
                    <button class="btn btn-danger-subtle btn-sm" onclick="removeSound(${i})">Удалить</button>
                </div>
            </div>
        `;
    }).join('');
}

window.copyPlaysoundCommand = function(btn, index) {
    const s = soundMappings[index];
    if (!s) return;
    const cmd = `/playsound ${s.eventId} ${s.category || 'player'} @a ~ ~ ~ 1 1`;
    copyWithFeedback(btn, cmd);
};

window.removeSound = function(index) {
    soundMappings.splice(index, 1);
    renderSoundList();
};

// --- PAGE 5: CONTACTS & EXTERNAL LINKS ---

document.getElementById('link-feedback').addEventListener('click', () => {
    window.api.openExternal('https://t.me/radoqi');
});

document.getElementById('link-channel').addEventListener('click', () => {
    window.api.openExternal('https://t.me/WineSquad');
});

// --- GLOBAL DRAG & DROP SUPPORT ---

window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('drag-over');
});

window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.relatedTarget === null || e.clientX <= 0 || e.clientY <= 0) {
        document.body.classList.remove('drag-over');
    }
});

window.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (window.api && window.api.getPathForFile)
            ? window.api.getPathForFile(file)
            : (file.path || '');
        if (!filePath) continue;

        const isDir = (window.api && window.api.isDirectory)
            ? await window.api.isDirectory(filePath)
            : false;

        if (isDir) {
            currentPackDir = filePath;
            const folderName = filePath.split(/[\\/]/).pop();
            const btnSpan = document.getElementById('btn-select-folder').querySelector('span');
            if (btnSpan) btnSpan.textContent = folderName;
            document.getElementById('btn-select-folder').title = filePath;

            // Auto-scan directory textures
            const images = await window.api.scanDirectoryImages(filePath);
            for (const img of images) {
                const norm = img.path.toLowerCase().replace(/\\/g, '/');
                if (!parityImages.some(p => p.path.toLowerCase().replace(/\\/g, '/') === norm)) {
                    parityImages.push(img);
                }
            }
            renderParityTable();
            const parityTab = document.querySelector('[data-page="page-parity"]');
            if (parityTab) parityTab.click();
            continue;
        }

        const ext = filePath.split('.').pop().toLowerCase();
        if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
            const info = await window.api.inspectImage(filePath);
            if (info && info.success) {
                const norm = filePath.toLowerCase().replace(/\\/g, '/');
                if (!parityImages.some(p => p.path.toLowerCase().replace(/\\/g, '/') === norm)) {
                    parityImages.push(info);
                }
            }
            const parityTab = document.querySelector('[data-page="page-parity"]');
            if (parityTab && !parityTab.classList.contains('active')) parityTab.click();
        } else if (ext === 'json') {
            const itemPathInp = document.getElementById('inp-item-path');
            if (itemPathInp) itemPathInp.value = filePath;
            const itemsTab = document.querySelector('[data-page="page-items"]');
            if (itemsTab && !itemsTab.classList.contains('active')) itemsTab.click();
        } else if (ext === 'ogg') {
            const soundPathInp = document.getElementById('inp-sound-path');
            if (soundPathInp) soundPathInp.value = filePath;
            const fileName = filePath.split(/[\\/]/).pop().replace(/\.ogg$/i, '');
            const eventInp = document.getElementById('inp-sound-event');
            if (eventInp) eventInp.value = 'custom.' + fileName.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
            const soundsTab = document.querySelector('[data-page="page-sounds"]');
            if (soundsTab && !soundsTab.classList.contains('active')) soundsTab.click();
        } else if (ext === 'zip') {
            currentZipPath = filePath;
            const projectTab = document.querySelector('[data-page="page-project"]');
            if (projectTab && !projectTab.classList.contains('active')) projectTab.click();
        }
    }
    renderParityTable();
});
