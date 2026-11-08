const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const web = path.resolve(__dirname, '..');
const port = Number(process.env.CHART_TEST_PORT || '3214');
const origin = `http://127.0.0.1:${port}`;
let fixture, server, browser, logs = '';

before(async () => {
  fixture = mkdtempSync(path.join(tmpdir(), 'puregamma-chart-'));
  mkdirSync(path.join(fixture, 'app'));
  symlinkSync(path.join(web, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  const dependencies = JSON.parse(readFileSync(path.join(web, 'package.json'), 'utf8')).dependencies;
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ private: true, dependencies: Object.fromEntries(['next', 'react', 'react-dom'].map(name => [name, dependencies[name]])) }));
  writeFileSync(path.join(fixture, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'es2022'], jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', esModuleInterop: true, strict: true, skipLibCheck: true, baseUrl: web, paths: { '@/*': ['./*'] } }, include: ['**/*.tsx', '**/*.ts'] }));
  writeFileSync(path.join(fixture, 'next.config.js'), 'module.exports={experimental:{externalDir:true},reactStrictMode:false};');
  writeFileSync(path.join(fixture, 'app', 'layout.tsx'), 'export default function Layout({children}:{children:React.ReactNode}){return <html><body><style>{`.h-72{height:18rem}.h-56{height:14rem}button,summary{min-height:44px}table{border-collapse:collapse}td,th{padding:4px}body{margin:8px;max-width:100%}*{box-sizing:border-box}`}</style>{children}</body></html>}');
  writeFileSync(path.join(fixture, 'app', 'page.tsx'), `"use client";
import {useEffect,useState} from "react";
import {PlotlyChart} from ${JSON.stringify(path.join(web, 'components/plotly-chart'))};
import {LocaleProvider} from ${JSON.stringify(path.join(web, 'components/i18n/LocaleProvider'))};
const figures=[{data:[{name:"Observed series",x:[1,2,3],y:[0,null,5]}]},{data:[{name:"Replacement series",x:[9],y:[7]}]}];
export default function Page(){const[hydrated,hydrate]=useState(false);useEffect(()=>hydrate(true),[]);const[mounted,mount]=useState(true);const[index,choose]=useState(0);const[locale,setLocale]=useState<"en"|"zh">("en");return <LocaleProvider locale={locale}><main><button disabled={!hydrated} onClick={()=>mount(v=>!v)}>Toggle chart</button><button onClick={()=>choose(v=>1-v)}>Replace figure</button><button onClick={()=>setLocale(v=>v==="en"?"zh":"en")}>Toggle locale</button>{mounted?<PlotlyChart figure={figures[index]}/>:null}</main></LocaleProvider>}`);
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', fixture, '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { logs = (logs + data).slice(-24000); });
  server.stderr.on('data', data => { logs = (logs + data).slice(-24000); });
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Chart fixture exited: ${logs}`);
    try { const response = await fetch(origin, { signal: AbortSignal.timeout(5000) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, `Local chart fixture did not start: ${logs}`);
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
}, { timeout: 90000 });

after(async () => {
  if (browser) await browser.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await Promise.race([new Promise(resolve => server.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
    if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await new Promise(resolve => server.once('exit', resolve)); }
  }
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

function installPlotly(mode = 'success') {
  window.chartProbe ||= { calls: [], purges: [], pending: [] };
  window.chartProbe.mode = mode;
  window.Plotly = {
    newPlot(element, data) {
      const id = window.chartProbe.calls.length + 1;
      element.dataset.probeCanvas = String(id);
      window.chartProbe.calls.push({ id, series: data[0]?.name });
      element.textContent = `Rendered ${data[0]?.name || 'chart'}`;
      if (window.chartProbe.mode === 'throw') throw new Error('Offline renderer threw before returning');
      if (window.chartProbe.mode === 'reject') return Promise.reject(new Error('Offline renderer refused the figure'));
      if (window.chartProbe.mode === 'pending') return new Promise(resolve => window.chartProbe.pending.push(() => { element.textContent = 'Obsolete renderer settled'; resolve(element); }));
      return Promise.resolve(element);
    },
    purge(element) { window.chartProbe.purges.push({ id: element.dataset.probeCanvas, connected: element.isConnected }); element.replaceChildren(); },
  };
}

async function pageFor(run, { mode, width = 1100 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 850 } });
  const page = await context.newPage();
  const errors = [], outside = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { outside.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  if (mode) await page.addInitScript(installPlotly, mode);
  try { await page.goto(origin, { waitUntil: 'domcontentloaded' }); await expect(page.getByRole('button', { name: 'Toggle chart' })).toBeEnabled({ timeout: 30000 }); await run(page); assert.deepEqual(errors, []); assert.deepEqual(outside, []); }
  finally { await context.close(); }
}

test('missing library offers recovery and actual bounded data in both locales', { timeout: 60000 }, async () => {
  await pageFor(async page => {
    await expect(page.getByRole('status')).toContainText('Preparing chart');
    await expect(page.getByRole('alert').filter({ hasText: 'Chart unavailable' })).toContainText('Chart unavailable', { timeout: 8000 });
    await expect(page.getByRole('button', { name: 'Retry chart' })).toBeVisible();
    if (process.env.CHART_TEST_ARTIFACT_DIR) { mkdirSync(process.env.CHART_TEST_ARTIFACT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.CHART_TEST_ARTIFACT_DIR, 'round6-chart-unavailable-en-mobile.png'), fullPage: true }); }
    await expect(page.getByRole('table', { name: 'Chart data preview' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '0', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle locale' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '图表暂不可用' })).toContainText('图表暂不可用');
    await expect(page.getByRole('button', { name: '重试图表' })).toBeVisible();
    if (process.env.CHART_TEST_ARTIFACT_DIR) await page.screenshot({ path: path.join(process.env.CHART_TEST_ARTIFACT_DIR, 'round6-chart-unavailable-zh-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(installPlotly);
    await page.getByRole('button', { name: '重试图表' }).click();
    await expect(page.locator('[data-plotly-chart]')).toHaveAttribute('data-state', 'ready');
    assert.equal(await page.evaluate(() => window.chartProbe.calls.length), 1);
  }, { width: 390 });
});

test('delayed library renders exactly once and exposes data with keyboard', async () => {
  await pageFor(async page => {
    await expect(page.getByRole('status')).toContainText('Preparing chart');
    await page.waitForTimeout(400);
    await page.evaluate(installPlotly);
    await expect(page.locator('[data-plotly-chart]')).toHaveAttribute('data-state', 'ready');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.chartProbe.calls.length), 1);
    await page.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('table', { name: 'Chart data preview' })).toBeVisible();
  });
});

test('an already loaded library starts only one render', async () => {
  await pageFor(async page => {
    await expect.poll(() => page.evaluate(() => window.chartProbe.calls.length)).toBe(1);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.chartProbe.calls.length), 1);
    await expect(page.locator('[data-plotly-chart]')).toHaveAttribute('data-state', 'ready');
  }, { mode: 'success' });
});

for (const mode of ['reject', 'throw']) test(`${mode} becomes a recoverable error without an unhandled rejection`, async () => {
  await pageFor(async page => {
    await expect(page.getByRole('alert').filter({ hasText: 'Chart unavailable' })).toContainText('Chart unavailable');
    await page.evaluate(() => { window.chartProbe.mode = 'success'; });
    await page.getByRole('button', { name: 'Retry chart' }).click();
    await expect(page.locator('[data-plotly-chart]')).toHaveAttribute('data-state', 'ready');
    assert.equal(await page.evaluate(() => window.chartProbe.calls.length), 2);
  }, { mode });
});

test('replacement and unmount own separate canvases and purge late settlements', async () => {
  await pageFor(async page => {
    await expect.poll(() => page.evaluate(() => window.chartProbe.calls.length)).toBe(1);
    await page.evaluate(() => { window.chartProbe.mode = 'success'; });
    await page.getByRole('button', { name: 'Replace figure' }).click();
    await expect(page.locator('[data-plotly-chart]')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('[data-plotly-chart]')).toContainText('Rendered Replacement series');
    await page.evaluate(() => window.chartProbe.pending.shift()());
    await expect.poll(() => page.evaluate(() => window.chartProbe.purges.some(p => p.id === '1'))).toBeTruthy();
    await expect(page.locator('[data-plotly-chart]')).not.toContainText('Obsolete renderer settled');
    await page.evaluate(() => { window.chartProbe.mode = 'pending'; });
    await page.getByRole('button', { name: 'Replace figure' }).click();
    await expect.poll(() => page.evaluate(() => window.chartProbe.calls.length)).toBe(3);
    await page.getByRole('button', { name: 'Toggle chart' }).click();
    await page.evaluate(() => window.chartProbe.pending.shift()());
    await expect.poll(() => page.evaluate(() => window.chartProbe.purges.some(p => p.id === '3'))).toBeTruthy();
    await expect(page.locator('[data-plotly-chart]')).toHaveCount(0);
  }, { mode: 'pending' });
});

test('hung rendering times out and an obsolete resolution cannot replace a retry', { timeout: 60000 }, async () => {
  await pageFor(async page => {
    await expect.poll(() => page.evaluate(() => window.chartProbe.calls.length)).toBe(1);
    await expect(page.getByRole('alert').filter({ hasText: 'Chart unavailable' })).toContainText('Chart unavailable', { timeout: 13000 });
    await page.evaluate(() => { window.chartProbe.mode = 'success'; });
    await page.getByRole('button', { name: 'Retry chart' }).click();
    await expect(page.locator('[data-plotly-chart]')).toHaveAttribute('data-state', 'ready');
    await page.evaluate(() => window.chartProbe.pending.shift()());
    await expect(page.locator('[data-plotly-chart]')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('[data-plotly-chart]')).not.toContainText('Obsolete renderer settled');
  }, { mode: 'pending' });
});

test('unmount while waiting for the library leaves no late renderer', async () => {
  await pageFor(async page => {
    await expect(page.getByRole('status')).toContainText('Preparing chart');
    await page.getByRole('button', { name: 'Toggle chart' }).click();
    await page.evaluate(installPlotly);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.chartProbe.calls.length), 0);
    await expect(page.locator('[data-plotly-chart]')).toHaveCount(0);
  });
});
