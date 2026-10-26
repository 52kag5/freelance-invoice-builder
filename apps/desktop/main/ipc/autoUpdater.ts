import { IpcChannel } from '@invoice-builder/contracts';
import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

export const initAutoUpdaterHandlers = (mainWindow: BrowserWindow) => {
  // Repacked AppImages have zsync metadata but no electron-builder embedded blockmap.
  if (process.platform === 'linux') {
    autoUpdater.disableDifferentialDownload = true;
  }
  ipcMain.on(IpcChannel.restartApp, () => {
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle(IpcChannel.getAppVersion, () => {
    return app.getVersion();
  });
  ipcMain.handle(IpcChannel.checkForUpdates, async () => {
    // Let invoke propagate a rejected check to the caller instead of leaving an
    // unhandled promise. Download/install failures also arrive via the error event.
    await autoUpdater.checkForUpdates();
  });
  autoUpdater.on('error', () => {
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(IpcChannel.updateError);
    }
  });
  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send(IpcChannel.updateAvailable);
  });
  autoUpdater.on('update-downloaded', info => {
    mainWindow.webContents.send(IpcChannel.updateDownloaded, info.version);
  });
  autoUpdater.on('download-progress', progress => {
    mainWindow.webContents.send(IpcChannel.updateProgress, progress);
  });
  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send(IpcChannel.updateNotAvailable);
  });
};
