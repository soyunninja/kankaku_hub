import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import test from 'node:test';
import { startLoopbackProxy } from './tailnet-loopback-proxy.mjs';

async function upstream(t, handler) {
  const server = net.createServer({ allowHalfOpen: true }, handler);
  server.listen(0, '::1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

async function bridge(t, upstreamPort) {
  const server = await startLoopbackProxy({ listenPort: 0, upstreamPort });
  assert.equal(server.address().address, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

async function exchange(port, request) {
  const socket = net.connect({ host: '127.0.0.1', port });
  const chunks = [];
  socket.on('data', (chunk) => chunks.push(chunk));
  await once(socket, 'connect');
  socket.end(request);
  await once(socket, 'close');
  return Buffer.concat(chunks);
}

test('preserves HTTP path, query and original Host through a half-close', { timeout: 5000 }, async (t) => {
  const request = 'GET /organizacion?tab=tasks&value=%2F HTTP/1.1\r\nHost: macbook-air.tailef2f3.ts.net:8443\r\nConnection: close\r\n\r\n';
  let received = '';
  const port = await upstream(t, (socket) => {
    socket.on('data', (chunk) => { received += chunk; });
    socket.on('end', () => socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK'));
  });
  const response = await exchange(await bridge(t, port), request);
  assert.equal(received, request);
  assert.equal(response.toString(), 'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK');
});

test('streams upgrade and binary bytes bidirectionally with backpressure', { timeout: 5000 }, async (t) => {
  const upgrade = Buffer.from('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
  const payload = Buffer.alloc(512 * 1024);
  for (let i = 0; i < payload.length; i++) payload[i] = i % 256;
  const port = await upstream(t, (socket) => {
    socket.write(upgrade);
    socket.pipe(socket);
  });
  const request = Buffer.concat([Buffer.from('GET /hmr HTTP/1.1\r\nHost: preview\r\nUpgrade: websocket\r\n\r\n'), payload]);
  const response = await exchange(await bridge(t, port), request);
  assert.deepEqual(response, Buffer.concat([upgrade, request]));
});

test('failed upstream closes the client and keeps the bridge available', { timeout: 5000 }, async (t) => {
  const reservation = net.createServer();
  reservation.listen(0, '::1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const proxyPort = await bridge(t, port);
  for (let attempt = 0; attempt < 2; attempt++) {
    const socket = net.connect({ host: '127.0.0.1', port: proxyPort });
    socket.on('error', () => {}); // A reset is also a valid paired-socket closure.
    await new Promise((resolve) => socket.once('close', resolve));
    assert.equal(socket.destroyed, true);
  }
});
