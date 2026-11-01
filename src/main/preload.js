const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
    openFiles: (filters) => ipcRenderer.invoke('dialog:open-files', filters),
    saveZip: (defaultName) => ipcRenderer.invoke('dialog:save-zip', defaultName),
    inspectImage: (imagePath) => ipcRenderer.invoke('pack:inspect-image', imagePath),
    fixImage: (inputPath, outputPath) => ipcRenderer.invoke('pack:fix-image', { inputPath, outputPath }),
    validatePack: (packDir) => ipcRenderer.invoke('pack:validate', packDir),
    scanDirectoryImages: (dirPath) => ipcRenderer.invoke('pack:scan-directory-images', dirPath),
    isDirectory: (path) => ipcRenderer.invoke('fs:is-directory', path),
    generatePack: (packData) => ipcRenderer.invoke('pack:generate', packData),
    createZip: (sourceDir, outputZip) => ipcRenderer.invoke('pack:create-zip', { sourceDir, outputZip }),
    uploadCloud: (filePath, provider) => ipcRenderer.invoke('pack:upload-cloud', { filePath, provider }),
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
    exportToMinecraft: (sourceDir, packName) => ipcRenderer.invoke('pack:export-to-minecraft', { sourceDir, packName }),
    getMinecraftDir: () => ipcRenderer.invoke('pack:get-minecraft-dir'),
    saveImageBuffer: (filePath, base64Data) => ipcRenderer.invoke('fs:save-image-buffer', { filePath, base64Data }),
    renameFile: (oldPath, newPath) => ipcRenderer.invoke('fs:rename-file', { oldPath, newPath }),
    getStats: () => ipcRenderer.invoke('app:get-stats'),
    getPathForFile: (file) => {
        try {
            return webUtils.getPathForFile(file);
        } catch {
            return file.path || '';
        }
    }
});
