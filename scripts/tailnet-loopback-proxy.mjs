import net from 'node:net';
import { pathToFileURL } from 'node:url';

// Ports are injectable for tests; both endpoints are always loopback-only.
export async function startLoopbackProxy({ listenPort = 3002, upstreamPort = 3000 } = {}) {
  const server = net.createServer({ allowHalfOpen: true }, (client) => {
    const upstream = net.connect({ host: '::1', port: upstreamPort, allowHalfOpen: true });
    const closePair = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', closePair);
    upstream.on('error', closePair);
    // Normal FINs flow through pipe.end after buffered bytes drain. Abrupt
    // closures must not leave the other endpoint connected indefinitely.
    client.on('close', () => {
      if (!client.readableEnded || !client.writableFinished) closePair();
    });
    upstream.on('close', () => {
      if (!upstream.readableEnded || !upstream.writableFinished) closePair();
    });
    client.pipe(upstream);
    upstream.pipe(client);
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(listenPort, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = await startLoopbackProxy();
    // Never log requests, headers, payloads or authentication data.
    console.log('Loopback bridge listening on 127.0.0.1:3002 -> [::1]:3000');
    server.on('error', () => {
      console.error('Loopback bridge listener failed');
      process.exitCode = 1;
      server.close();
    });
  } catch {
    console.error('Loopback bridge could not start');
    process.exitCode = 1;
  }
}
