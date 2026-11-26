import type { SetupWorker } from 'msw/browser'

interface BrowserWorkerModule {
  readonly worker: Pick<SetupWorker, 'start'>
}

type BrowserWorkerLoader = () => Promise<BrowserWorkerModule>

const loadBrowserWorker: BrowserWorkerLoader = () => import('./browser')

/** Starts the browser-only API in development, preview, and deployed builds. */
export async function startBrowserMockServer(
  loadWorker: BrowserWorkerLoader = loadBrowserWorker,
  baseUrl = import.meta.env.BASE_URL,
): Promise<void> {
  const { worker } = await loadWorker()
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: `${baseUrl}mockServiceWorker.js`,
    },
  })
}
