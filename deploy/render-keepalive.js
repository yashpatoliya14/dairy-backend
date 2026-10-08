const targetUrl =
  process.env.RENDER_HEALTH_URL ?? 'https://dairy-backend-eemp.onrender.com/';
const intervalMs = 5 * 60 * 1000;
const requestTimeoutMs = 30 * 1000;

let timer;

async function ping() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'dairy-render-keepalive/1.0' },
    });
    console.log(
      `[${new Date().toISOString()}] ${targetUrl} -> ${response.status}`,
    );
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Keep-alive request failed:`,
      error instanceof Error ? error.message : error,
    );
  } finally {
    clearTimeout(timeout);
  }
}

await ping();
timer = setInterval(ping, intervalMs);

function shutdown(signal) {
  console.log(`[${new Date().toISOString()}] Received ${signal}; stopping.`);
  clearInterval(timer);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
