export {};
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{outcome: string}> }
const dialog = document.querySelector<HTMLDialogElement>('#app-dialog')!;
const base = dialog.dataset.base!;
const status = document.querySelector<HTMLElement>('#app-status')!;
const install = document.querySelector<HTMLButtonElement>('#app-install')!;
const update = document.querySelector<HTMLElement>('#app-update')!;
const help = document.querySelector<HTMLElement>('#app-help')!;
const installStatus = document.querySelector<HTMLElement>('#app-install-status')!;
const displayMode = matchMedia('(display-mode: standalone)');
let prompt: InstallPrompt | undefined;
let registration: ServiceWorkerRegistration | undefined;
let offlineReady = false;
let offlineFailed = false;
let installed = false;
const standalone = () => displayMode.matches || Boolean((navigator as Navigator & {standalone?: boolean}).standalone);
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const android = /Android/.test(navigator.userAgent);
function refreshInstallation() {
  const runningAsApp = standalone();
  install.hidden = runningAsApp || installed || !prompt;
  document.querySelector<HTMLElement>('#app-title')!.textContent = runningAsApp ? 'Your dashboard app' : installed ? 'Dashboard is installed' : 'Install your dashboard';
  help.hidden = runningAsApp;
  help.textContent = installed
    ? 'Open the Dashboard icon on your home screen to launch the app.'
    : ios
      ? 'Open this dashboard in Safari. Tap Share → Add to Home Screen, turn on Open as Web App if shown, then tap Add. Launch the Dashboard icon from your home screen.'
      : android
        ? 'In Chrome, tap Install app below when offered, or open the ⋮ menu → Install app / Add to Home screen and confirm. If the option is missing, open this page directly in Chrome. Launch the Dashboard icon from your home screen.'
        : 'Use Install app below when offered, or your browser’s install menu. On iPhone/iPad: Safari → Share → Add to Home Screen. On Android: Chrome → ⋮ → Install app / Add to Home screen.';
}
function refreshStatus() {
  refreshInstallation();
  document.querySelector<HTMLElement>('#app-offline')!.hidden = navigator.onLine;
  status.textContent = offlineFailed
    ? 'Offline setup could not finish. Connect to the internet and reload to try again.'
    : offlineReady
    ? `${standalone() ? 'Installed app. ' : ''}${navigator.onLine ? 'Ready for offline use.' : 'Offline — your saved dashboard is available.'} External links and new feeds need a connection.`
    : 'Offline access is preparing. Keep this page open until it is ready.';
}
document.querySelector('#app-open')!.addEventListener('click', () => {refreshStatus(); dialog.showModal();});
document.querySelector('#app-close')!.addEventListener('click', () => dialog.close());
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); if (!standalone() && !installed) prompt = event as InstallPrompt; refreshInstallation(); });
install.addEventListener('click', async () => {
  if (!prompt || install.disabled) return;
  const currentPrompt = prompt;
  install.disabled = true;
  installStatus.textContent = '';
  try {
    await currentPrompt.prompt();
    const choice = await currentPrompt.userChoice;
    installStatus.textContent = installed ? '' : choice.outcome === 'accepted' ? 'Follow your browser’s confirmation to finish installing.' : 'Installation dismissed. You can still install from your browser menu.';
  } catch {
    installStatus.textContent = 'The install prompt could not open. Use your browser’s Install app or Add to Home Screen menu.';
  } finally {
    if (prompt === currentPrompt) prompt = undefined;
    install.disabled = false;
    refreshInstallation();
  }
});
window.addEventListener('appinstalled', () => {installed = true; prompt = undefined; installStatus.textContent = ''; refreshStatus();});
displayMode.addEventListener('change', refreshStatus);
window.addEventListener('online', refreshStatus);
window.addEventListener('offline', refreshStatus);
refreshInstallation();
document.querySelector('#app-reload')!.addEventListener('click', () => {registration?.waiting?.postMessage({type: 'ACTIVATE_UPDATE'});});
if ('serviceWorker' in navigator) {
  // First activation claims the page without reloading; later updates reload all open tabs.
  let controlled = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) location.reload();
    controlled = true;
  });
  navigator.serviceWorker.register(`${base}sw.js`, {scope:base, updateViaCache:'none'}).then(reg => {
    registration = reg;
    if (reg.waiting) update.hidden = false;
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {if (worker.state === 'installed' && navigator.serviceWorker.controller) update.hidden = false;});
    });
    document.addEventListener('visibilitychange', () => {if (!document.hidden && navigator.onLine) void reg.update().catch(() => {});});
    return navigator.serviceWorker.ready;
  }).then(() => {offlineReady = true; refreshStatus();}).catch(() => {
    offlineFailed = true;
    refreshStatus();
  });
} else status.textContent = 'This browser does not support offline apps. Try Safari or Chrome over HTTPS.';
