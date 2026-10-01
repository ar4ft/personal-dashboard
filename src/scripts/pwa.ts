export {};
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{outcome: string}> }
const dialog = document.querySelector<HTMLDialogElement>('#app-dialog')!;
const base = dialog.dataset.base!;
const status = document.querySelector<HTMLElement>('#app-status')!;
const install = document.querySelector<HTMLButtonElement>('#app-install')!;
const update = document.querySelector<HTMLElement>('#app-update')!;
let prompt: InstallPrompt | undefined;
let registration: ServiceWorkerRegistration | undefined;
let offlineReady = false;
const standalone = () => matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?: boolean}).standalone);
function refreshStatus() {
  document.querySelector<HTMLElement>('#app-offline')!.hidden = navigator.onLine;
  status.textContent = offlineReady
    ? `${standalone() ? 'Installed app. ' : ''}${navigator.onLine ? 'Ready for offline use.' : 'Offline — your saved dashboard is available.'} External links and new feeds need a connection.`
    : 'Offline access is preparing. Keep this page open until it is ready.';
}
document.querySelector('#app-open')!.addEventListener('click', () => {refreshStatus(); dialog.showModal();});
document.querySelector('#app-close')!.addEventListener('click', () => dialog.close());
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); prompt = event as InstallPrompt; install.hidden = false; });
install.addEventListener('click', async () => { if (!prompt) return; await prompt.prompt(); await prompt.userChoice; prompt = undefined; install.hidden = true; });
window.addEventListener('appinstalled', () => {install.hidden = true; refreshStatus();});
window.addEventListener('online', refreshStatus);
window.addEventListener('offline', refreshStatus);
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
    status.textContent = 'Offline setup could not finish. Connect to the internet and reload to try again.';
  });
} else status.textContent = 'This browser does not support offline apps. Try Safari or Chrome over HTTPS.';
