// Imports the production hook into real React/Chromium, including StrictMode.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const compilerModule = require('next/dist/compiled/webpack/webpack');
compilerModule.init();

test('capability reads belong to the current React effect', { timeout: 90000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pg-capability-'));
  let browser, server;
  try {
    const loader = path.join(directory, 'typescript-loader.cjs');
    await writeFile(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
    const entry = path.join(directory, 'probe.tsx');
    await writeFile(entry, `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { useCapabilityGate } from ${JSON.stringify(process.env.CAPABILITY_GATE_SOURCE || path.resolve(__dirname, '../components/ocean/capability-gate.tsx'))};
      window.probe = { pending: [] };
      function Probe() {
        const [key, setKey] = useState(0); window.probe.select = setKey;
        const { state, retry, value } = useCapabilityGate(() => {
          if (key === 99) throw new Error('synchronous loader failure');
          return new Promise((resolve, reject) => window.probe.pending.push({ key, resolve, reject }));
        }, [key]);
        return <><output id="state">{state.status}</output><output id="payload">{value?.snapshot || '-'}</output><button onClick={retry}>Retry</button></>;
      }
      createRoot(document.getElementById('root')).render(<React.StrictMode><Probe /></React.StrictMode>);
    `);
    await new Promise((resolve, reject) => {
      const compiler = compilerModule.webpack({ mode: 'development', target: 'web', devtool: false, entry,
        output: { path: directory, filename: 'probe.js' },
        resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.resolve(__dirname, '../node_modules'), 'node_modules'] },
        module: { rules: [{ test: /\.tsx?$/, use: loader }] },
      }, (error, stats) => compiler.close(closeError => {
        if (error || closeError) return reject(error || closeError);
        if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
        resolve();
      }));
    });
    const bundle = await readFile(path.join(directory, 'probe.js'));
    server = createServer((request, response) => {
      response.setHeader('Content-Type', request.url === '/probe.js' ? 'text/javascript' : 'text/html');
      response.end(request.url === '/probe.js' ? bundle : '<div id="root"></div><script src="/probe.js"></script>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    async function probe(run) {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      try {
        await page.goto(origin);
        await page.waitForFunction(() => window.probe?.pending.length === 2);
        await run(page); assert.deepEqual(errors, []);
      } finally { await page.close(); }
    }
    await t.test('late rejection cannot replace current successful read', () => probe(async page => {
      await page.evaluate(() => window.probe.select(1));
      await page.waitForFunction(() => window.probe.pending.some(read => read.key === 1));
      await page.evaluate(() => window.probe.pending.find(read => read.key === 1).resolve({ enabled: true }));
      await page.waitForFunction(() => document.querySelector('#state').textContent === 'available');
      await page.evaluate(() => window.probe.pending.filter(read => read.key === 0).forEach(read => read.reject(Object.assign(new Error('old failure'), { status: 503 }))));
      await page.waitForTimeout(50); assert.equal(await page.locator('#state').textContent(), 'available');
    }));
    await t.test('old success cannot unlock a currently forbidden capability', () => probe(async page => {
      await page.evaluate(() => window.probe.select(1));
      await page.waitForFunction(() => window.probe.pending.some(read => read.key === 1));
      await page.evaluate(() => window.probe.pending.find(read => read.key === 1).reject(Object.assign(new Error('Forbidden'), { status: 403 })));
      await page.waitForFunction(() => document.querySelector('#state').textContent === 'unauthorized');
      await page.evaluate(() => window.probe.pending.filter(read => read.key === 0).forEach(read => read.resolve({ enabled: true })));
      await page.waitForTimeout(50); assert.equal(await page.locator('#state').textContent(), 'unauthorized');
    }));
    await t.test('synchronous loader exceptions remain recoverable', () => probe(async page => {
      await page.evaluate(() => window.probe.select(99));
      await page.waitForFunction(() => document.querySelector('#state').textContent === 'error');
      await page.getByRole('button', { name: 'Retry' }).click();
      await page.waitForFunction(() => document.querySelector('#state').textContent === 'error');
    }));
    await t.test('successful values are cleared and remain owned by their request generation', () => probe(async page => {
      await page.evaluate(() => window.probe.pending.at(-1).resolve({ snapshot: 'first' }));
      await page.waitForFunction(() => document.querySelector('#payload').textContent === 'first');
      await page.evaluate(() => window.probe.select(1));
      await page.waitForFunction(() => window.probe.pending.some(read => read.key === 1));
      assert.equal(await page.locator('#payload').textContent(), '-');
      await page.evaluate(() => window.probe.pending.find(read => read.key === 1).resolve({ snapshot: 'second' }));
      await page.waitForFunction(() => document.querySelector('#payload').textContent === 'second');
      await page.evaluate(() => window.probe.pending[0].resolve({ snapshot: 'old' }));
      await page.waitForTimeout(50);
      assert.equal(await page.locator('#payload').textContent(), 'second');
    }));
    for (const value of [null, undefined]) await t.test(`${String(value)} rejections remain recoverable`, () => probe(async page => {
      await page.evaluate(value => window.probe.pending.at(-1).reject(value), value);
      await page.waitForFunction(() => document.querySelector('#state').textContent === 'error');
      const count = await page.evaluate(() => window.probe.pending.length);
      await page.getByRole('button', { name: 'Retry' }).click();
      await page.waitForFunction(count => window.probe.pending.length > count, count);
      await page.evaluate(() => window.probe.pending.at(-1).resolve({ enabled: true }));
      await page.waitForFunction(() => document.querySelector('#state').textContent === 'available');
    }));
    await t.test('disabled service differs from missing account permissions', () => probe(async page => {
      await page.evaluate(() => window.probe.pending.at(-1).reject(Object.assign(new Error('{"detail":{"code":"MEMORY_DISABLED"}}'), { status: 403 })));
      await page.waitForFunction(() => document.querySelector('#state').textContent === 'unavailable');
    }));
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await rm(directory, { recursive: true, force: true });
  }
});
