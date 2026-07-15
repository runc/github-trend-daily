import { ProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici';

const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;

let active: Dispatcher | null = null;

if (PROXY) {
  active = new ProxyAgent({
    uri: PROXY,
    requestTls: { rejectUnauthorized: false },
    connect: { rejectUnauthorized: false },
  });
  setGlobalDispatcher(active);
  console.log(`[proxy] using ${PROXY}`);
}

export function getActiveDispatcher(): Dispatcher | null {
  return active;
}
