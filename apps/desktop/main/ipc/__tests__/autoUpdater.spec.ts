import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { IpcChannel } from '@invoice-builder/contracts';
import { initAutoUpdaterHandlers } from '../autoUpdater';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => unknown>(),
  listeners: new Map<string, (...args: unknown[]) => void>(),
  checkForUpdates: vi.fn(),
  quitAndInstall: vi.fn(),
  disableDifferentialDownload: false
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '3.2.0' },
  ipcMain: {
    handle: (channel: string, callback: () => unknown) => mocks.handlers.set(channel, callback),
    on: (channel: string, callback: () => unknown) => mocks.handlers.set(channel, callback)
  }
}));
vi.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdates: mocks.checkForUpdates,
    quitAndInstall: mocks.quitAndInstall,
    set disableDifferentialDownload(value: boolean) {
      mocks.disableDifferentialDownload = value;
    },
    on: (event: string, callback: (...args: unknown[]) => void) => mocks.listeners.set(event, callback)
  }
}));

describe('updater IPC', () => {
  const send = vi.fn();
  const isDestroyed = vi.fn(() => false);
  const window = {
    isDestroyed,
    webContents: { send, isDestroyed }
  } as unknown as BrowserWindow;

  beforeEach(() => {
    vi.clearAllMocks();
    isDestroyed.mockReturnValue(false);
    mocks.checkForUpdates.mockResolvedValue(null);
    initAutoUpdaterHandlers(window);
  });

  it('awaits checks and propagates rejections to invoke without an unhandled promise', async () => {
    await expect(mocks.handlers.get(IpcChannel.checkForUpdates)!()).resolves.toBeUndefined();
    mocks.checkForUpdates.mockRejectedValueOnce(new Error('Manifest checksum mismatch'));
    await expect(mocks.handlers.get(IpcChannel.checkForUpdates)!()).rejects.toThrow('Manifest checksum mismatch');
  });

  it('forwards errors without exposing internal error details', () => {
    mocks.listeners.get('error')!(new Error('private download URL'));
    expect(send).toHaveBeenCalledWith(IpcChannel.updateError);
    isDestroyed.mockReturnValue(true);
    send.mockClear();
    expect(() => mocks.listeners.get('error')!(new Error('late error'))).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves updater events, restart, and version', () => {
    mocks.listeners.get('update-available')!();
    mocks.listeners.get('update-not-available')!();
    mocks.listeners.get('update-downloaded')!({ version: '3.2.1' });
    mocks.listeners.get('download-progress')!({ percent: 42 });
    expect(send.mock.calls).toEqual([
      [IpcChannel.updateAvailable],
      [IpcChannel.updateNotAvailable],
      [IpcChannel.updateDownloaded, '3.2.1'],
      [IpcChannel.updateProgress, { percent: 42 }]
    ]);
    mocks.handlers.get(IpcChannel.restartApp)!();
    expect(mocks.quitAndInstall).toHaveBeenCalledOnce();
    expect(mocks.handlers.get(IpcChannel.getAppVersion)!()).toBe('3.2.0');
    if (process.platform === 'linux') expect(mocks.disableDifferentialDownload).toBe(true);
  });
});
