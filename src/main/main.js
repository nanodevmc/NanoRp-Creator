const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const nativeBridge = require('./native-bridge');

// --- ULTRA-LIGHTWEIGHT ENGINE TUNING (CELERON / 4GB RAM OPTIMIZED) ---
// Strip Chromium background services, telemetry, and unnecessary processes
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('disable-default-apps');
app.commandLine.appendSwitch('disable-print-preview');
app.commandLine.appendSwitch('disable-speech-api');
app.commandLine.appendSwitch('no-pings');
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,AutofillServerCommunication,CertificateTransparencyComponentUpdater,Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=32 --optimize_for_size --expose-gc');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1060,
        height: 720,
        minWidth: 900,
        minHeight: 600,
        title: 'NanoRp-Creator v1.0.0 — Resource Pack Studio & Cloud Linker',
        backgroundColor: '#0d131f', // Modern blue-slate dark background
        icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            backgroundThrottling: true,
            spellcheck: false,
            devTools: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        try {
            mainWindow.webContents.session.clearCache();
        } catch {}
        if (global.gc) {
            try { global.gc(); } catch {}
        }
    });

    mainWindow.on('minimize', () => {
        try {
            mainWindow.webContents.session.clearCache();
        } catch {}
        if (global.gc) {
            try { global.gc(); } catch {}
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Periodic lightweight memory trimming for 4GB RAM machines
setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            mainWindow.webContents.session.clearCache();
        } catch {}
    }
    if (global.gc) {
        try { global.gc(); } catch {}
    }
}, 30000);

// --- IPC HANDLERS ---

// Select directory dialog
ipcMain.handle('dialog:open-directory', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory']
    });
    return res.canceled ? null : res.filePaths[0];
});

// Select files dialog
ipcMain.handle('dialog:open-files', async (_, filters) => {
    const res = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: filters || [{ name: 'Images & Models', extensions: ['png', 'json', 'ogg'] }]
    });
    return res.canceled ? [] : res.filePaths;
});

// Save file dialog (.zip)
ipcMain.handle('dialog:save-zip', async (_, defaultName) => {
    const res = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName || 'ResourcePack.zip',
        filters: [{ name: 'Minecraft Resource Pack (*.zip)', extensions: ['zip'] }]
    });
    return res.canceled ? null : res.filePath;
});

// Scan and inspect images in folder or file list
ipcMain.handle('pack:inspect-image', async (_, imagePath) => {
    return await nativeBridge.checkImage(imagePath);
});

// Scan all images recursively in a directory
ipcMain.handle('pack:scan-directory-images', async (_, dirPath) => {
    try {
        if (!dirPath || !fs.existsSync(dirPath)) return [];
        const imagePaths = [];

        function scan(d) {
            const entries = fs.readdirSync(d, { withFileTypes: true });
            for (const e of entries) {
                const full = path.join(d, e.name);
                if (e.isDirectory()) {
                    scan(full);
                } else if (e.isFile() && /\.(png|jpe?g)$/i.test(e.name)) {
                    imagePaths.push(full);
                }
            }
        }
        scan(dirPath);

        const results = [];
        for (const imgPath of imagePaths) {
            const inspected = await nativeBridge.checkImage(imgPath);
            if (inspected && inspected.success) {
                results.push(inspected);
            }
        }
        return results;
    } catch (e) {
        console.error('Directory scan error:', e);
        return [];
    }
});

// Fix image parity (odd size fix)
ipcMain.handle('pack:fix-image', async (_, { inputPath, outputPath }) => {
    return await nativeBridge.fixImage(inputPath, outputPath);
});

// Validate pack structure
ipcMain.handle('pack:validate', async (_, packDir) => {
    return await nativeBridge.validatePack(packDir);
});

// Helper: Check if base item is a handheld weapon/tool
function isHandheldItem(baseName) {
    const handheldKeywords = ['sword', 'pickaxe', 'axe', 'shovel', 'hoe', 'fishing_rod', 'shears', 'bow', 'crossbow', 'trident'];
    return handheldKeywords.some(keyword => baseName.includes(keyword));
}

// Generate resource pack folder structure, mcmeta, font or model overrides
ipcMain.handle('pack:generate', async (_, packData) => {
    try {
        const { targetDir, name, description, packFormat, items, fonts } = packData;

        if (!targetDir) {
            return { success: false, error: 'Директория пакета не указана' };
        }

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // 1. Generate pack.mcmeta with modern supported_formats and &->§ formatting
        const pFormat = parseInt(packFormat, 10) || 34;
        const formattedDesc = (description || name || 'Created with NanoRp-Creator')
            .replace(/&([0-9a-fk-orA-FK-OR])/g, '§$1');

        const mcmeta = {
            pack: {
                pack_format: pFormat,
                supported_formats: {
                    min_inclusive: Math.min(pFormat, 15),
                    max_inclusive: Math.max(pFormat, 48)
                },
                description: formattedDesc
            }
        };
        fs.writeFileSync(path.join(targetDir, 'pack.mcmeta'), JSON.stringify(mcmeta, null, 2), 'utf-8');

        // Copy default pack.png if none exists
        const targetPackPng = path.join(targetDir, 'pack.png');
        if (!fs.existsSync(targetPackPng)) {
            const defaultIcon = path.join(__dirname, '..', 'renderer', 'assets', 'icon.png');
            if (fs.existsSync(defaultIcon)) {
                try { fs.copyFileSync(defaultIcon, targetPackPng); } catch {}
            }
        }

        // 2. Base Minecraft directories
        const assetsDir = path.join(targetDir, 'assets', 'minecraft');
        const texturesItemDir = path.join(assetsDir, 'textures', 'item');
        const texturesFontDir = path.join(assetsDir, 'textures', 'font');
        const modelsItemDir = path.join(assetsDir, 'models', 'item');
        const fontDir = path.join(assetsDir, 'font');

        fs.mkdirSync(texturesItemDir, { recursive: true });
        fs.mkdirSync(texturesFontDir, { recursive: true });
        fs.mkdirSync(modelsItemDir, { recursive: true });
        fs.mkdirSync(fontDir, { recursive: true });

        // 3. Process Custom Items (Custom Model Data / Overrides)
        const itemGroups = {}; // e.g. 'diamond_sword': [overrides...]
        for (const it of (items || [])) {
            if (!it.baseItem || !it.imagePath) continue;

            // Strip 'minecraft:' namespace if present and sanitize
            let base = it.baseItem.toLowerCase().trim();
            if (base.startsWith('minecraft:')) base = base.substring(10);
            base = base.replace(/[^a-z0-9_]/g, '_');

            const ext = path.extname(it.imagePath).toLowerCase();
            const safeName = (it.customName || path.basename(it.imagePath, ext))
                .toLowerCase().replace(/[^a-z0-9_]/g, '_');

            const is3DJsonModel = (ext === '.json');

            if (is3DJsonModel) {
                // Blockbench / 3D model JSON: copy directly to models/item/
                const customModelPath = path.join(modelsItemDir, `${safeName}.json`);
                if (fs.existsSync(it.imagePath)) {
                    fs.copyFileSync(it.imagePath, customModelPath);
                }
            } else {
                // 2D Texture PNG: copy to textures/item/ and create generated item model
                const destTexture = path.join(texturesItemDir, `${safeName}.png`);
                if (fs.existsSync(it.imagePath)) {
                    fs.copyFileSync(it.imagePath, destTexture);
                }

                const customModelPath = path.join(modelsItemDir, `${safeName}.json`);
                const customModelJson = {
                    parent: isHandheldItem(base) ? 'item/handheld' : 'item/generated',
                    textures: {
                        layer0: `minecraft:item/${safeName}`
                    }
                };
                fs.writeFileSync(customModelPath, JSON.stringify(customModelJson, null, 2), 'utf-8');
            }

            if (!itemGroups[base]) itemGroups[base] = [];
            const cmdVal = isNaN(parseInt(it.cmd, 10)) ? 1 : parseInt(it.cmd, 10);
            itemGroups[base].push({
                predicate: { custom_model_data: cmdVal },
                model: `item/${safeName}`
            });
        }

        // Write master overrides for each base item (merging with existing overrides to prevent data loss!)
        for (const [baseItem, overrides] of Object.entries(itemGroups)) {
            const masterModelPath = path.join(modelsItemDir, `${baseItem}.json`);
            
            const existingOverrides = [];
            let masterParent = isHandheldItem(baseItem) ? 'item/handheld' : 'item/generated';
            let masterTextures = { layer0: `minecraft:item/${baseItem}` };

            if (fs.existsSync(masterModelPath)) {
                try {
                    const raw = JSON.parse(fs.readFileSync(masterModelPath, 'utf-8'));
                    if (raw.parent) masterParent = raw.parent;
                    if (raw.textures) masterTextures = raw.textures;
                    if (Array.isArray(raw.overrides)) {
                        existingOverrides.push(...raw.overrides);
                    }
                } catch {}
            }

            // Deduplicate overrides by CustomModelData (new items take priority on collision)
            const cmdMap = new Map();
            for (const ov of existingOverrides) {
                if (ov && ov.predicate && typeof ov.predicate.custom_model_data !== 'undefined') {
                    cmdMap.set(ov.predicate.custom_model_data, ov);
                }
            }
            for (const ov of overrides) {
                cmdMap.set(ov.predicate.custom_model_data, ov);
            }

            const sortedOverrides = Array.from(cmdMap.values()).sort(
                (a, b) => a.predicate.custom_model_data - b.predicate.custom_model_data
            );

            const masterModelJson = {
                parent: masterParent,
                textures: masterTextures,
                overrides: sortedOverrides
            };
            fs.writeFileSync(masterModelPath, JSON.stringify(masterModelJson, null, 2), 'utf-8');
        }

        // 4. Process Custom Fonts / Emoji Glyphs (merging with existing font/default.json)
        const fontProviders = [];
        for (const f of (fonts || [])) {
            if (!f.symbol || !f.imagePath) continue;
            const safeFontName = path.basename(f.imagePath).toLowerCase().replace(/[^a-z0-9_.]/g, '_');
            const destFontTex = path.join(texturesFontDir, safeFontName);
            if (fs.existsSync(f.imagePath)) {
                fs.copyFileSync(f.imagePath, destFontTex);
            }

            // Decode unicode escape strings like "\uE001" to actual unicode character
            let cleanSymbol = f.symbol;
            cleanSymbol = cleanSymbol.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

            fontProviders.push({
                type: 'bitmap',
                file: `minecraft:font/${safeFontName}`,
                ascent: isNaN(parseInt(f.ascent, 10)) ? 7 : parseInt(f.ascent, 10),
                height: isNaN(parseInt(f.height, 10)) ? 8 : parseInt(f.height, 10),
                chars: [cleanSymbol]
            });
        }

        if (fontProviders.length > 0) {
            const defaultFontPath = path.join(fontDir, 'default.json');
            let combinedProviders = [];
            if (fs.existsSync(defaultFontPath)) {
                try {
                    const existing = JSON.parse(fs.readFileSync(defaultFontPath, 'utf-8'));
                    if (Array.isArray(existing.providers)) {
                        combinedProviders.push(...existing.providers);
                    }
                } catch {}
            }

            for (const fp of fontProviders) {
                const charKey = (fp.chars || []).join('');
                const idx = combinedProviders.findIndex(p => (p.chars || []).join('') === charKey);
                if (idx >= 0) {
                    combinedProviders[idx] = fp;
                } else {
                    combinedProviders.push(fp);
                }
            }

            const fontJson = { providers: combinedProviders };
            fs.writeFileSync(defaultFontPath, JSON.stringify(fontJson, null, 2), 'utf-8');
        }

        // 5. Process Custom Sounds & Music (sounds.json)
        if (Array.isArray(sounds) && sounds.length > 0) {
            const soundsAudioDir = path.join(assetsDir, 'sounds');
            const soundsJsonPath = path.join(assetsDir, 'sounds.json');
            fs.mkdirSync(soundsAudioDir, { recursive: true });

            let existingSounds = {};
            if (fs.existsSync(soundsJsonPath)) {
                try {
                    existingSounds = JSON.parse(fs.readFileSync(soundsJsonPath, 'utf-8'));
                } catch {}
            }

            for (const s of sounds) {
                if (!s.eventId || !s.oggPath) continue;

                const eventId = s.eventId.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
                const safeFileName = path.basename(s.oggPath, path.extname(s.oggPath))
                    .toLowerCase().replace(/[^a-z0-9_.-]/g, '_');

                const subDir = s.category === 'music' || s.category === 'record' ? 'music' : 'custom';
                const destSubDir = path.join(soundsAudioDir, subDir);
                fs.mkdirSync(destSubDir, { recursive: true });

                const destOgg = path.join(destSubDir, `${safeFileName}.ogg`);
                if (fs.existsSync(s.oggPath)) {
                    fs.copyFileSync(s.oggPath, destOgg);
                }

                const soundEntry = {
                    name: `${subDir}/${safeFileName}`,
                    stream: !!s.stream
                };

                existingSounds[eventId] = {
                    category: s.category || 'player',
                    subtitle: s.subtitle || undefined,
                    sounds: [soundEntry]
                };
            }

            fs.writeFileSync(soundsJsonPath, JSON.stringify(existingSounds, null, 2), 'utf-8');
        }

        return { success: true, targetDir };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Pack resource pack into .zip
ipcMain.handle('pack:create-zip', async (_, { sourceDir, outputZip }) => {
    return await nativeBridge.packZip(sourceDir, outputZip);
});

// Upload pack to public host (Catbox / 0x0 / file.io)
ipcMain.handle('pack:upload-cloud', async (_, { filePath, provider }) => {
    return await nativeBridge.uploadToPublicHost(filePath, provider);
});

// Resolve local Minecraft resourcepacks folder across Windows, macOS, and Linux
function getMinecraftResourcePacksDir() {
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
        return path.join(appData, '.minecraft', 'resourcepacks');
    } else if (process.platform === 'darwin') {
        const home = process.env.HOME || '/Users';
        return path.join(home, 'Library', 'Application Support', 'minecraft', 'resourcepacks');
    } else {
        const home = process.env.HOME || '/root';
        return path.join(home, '.minecraft', 'resourcepacks');
    }
}

// 1-Click Export directly into .minecraft/resourcepacks
ipcMain.handle('pack:export-to-minecraft', async (_, { sourceDir, packName }) => {
    try {
        if (!sourceDir || !fs.existsSync(sourceDir)) {
            return { success: false, error: 'Директория ресурс-пака не найдена' };
        }
        const rpDir = getMinecraftResourcePacksDir();
        if (!fs.existsSync(rpDir)) {
            fs.mkdirSync(rpDir, { recursive: true });
        }
        const safeName = (packName || path.basename(sourceDir) || 'ServerResourcePack')
            .replace(/[/\\:*?"<>|]/g, '_');
        const targetZip = path.join(rpDir, `${safeName}.zip`);
        const packRes = await nativeBridge.packZip(sourceDir, targetZip);
        return {
            success: true,
            targetPath: targetZip,
            size_bytes: packRes.size_bytes,
            sha1: packRes.sha1
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Get Minecraft folder status
ipcMain.handle('pack:get-minecraft-dir', async () => {
    const dir = getMinecraftResourcePacksDir();
    return {
        path: dir,
        exists: fs.existsSync(dir)
    };
});

// Save image from base64 (Pure Canvas Parity Fallback)
ipcMain.handle('fs:save-image-buffer', async (_, { filePath, base64Data }) => {
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Rename file for Minecraft path linter auto-fix
ipcMain.handle('fs:rename-file', async (_, { oldPath, newPath }) => {
    try {
        if (!fs.existsSync(oldPath)) {
            return { success: false, error: 'Исходный файл не существует' };
        }
        if (fs.existsSync(newPath) && oldPath.toLowerCase() !== newPath.toLowerCase()) {
            return { success: false, error: 'Файл с таким именем уже существует' };
        }
        fs.renameSync(oldPath, newPath);
        return { success: true, newPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Open external URL (Telegram links, etc.)
ipcMain.handle('shell:open-external', async (_, url) => {
    await shell.openExternal(url);
    return true;
});

// Check if path is directory
ipcMain.handle('fs:is-directory', async (_, p) => {
    try {
        return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
});

// System memory stats across all processes
ipcMain.handle('app:get-stats', async () => {
    let totalPrivateKB = 0;
    try {
        const metrics = app.getAppMetrics();
        for (const m of metrics) {
            if (m.memory && typeof m.memory.privateBytes === 'number') {
                totalPrivateKB += m.memory.privateBytes;
            }
        }
    } catch {}

    const mem = process.memoryUsage();
    // Sum of private unshared bytes across all processes represents actual physical RAM footprint
    const finalMB = totalPrivateKB > 0
        ? Math.round(totalPrivateKB / 1024)
        : Math.round(mem.rss / 1024 / 1024);

    return {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        rssMB: finalMB,
        platform: process.platform,
        arch: process.arch,
        rustActive: !!nativeBridge.getBinaryPath('nano-rp-rust-engine'),
        cppActive: !!nativeBridge.getBinaryPath('nano-rp-cpp-engine')
    };
});
