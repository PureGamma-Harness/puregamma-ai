const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../components/plotly-chart-data.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded._compile(compiled.outputText, filename);
const { chartDataPreview, CHART_PREVIEW_LIMITS } = loaded.exports;

test('preview preserves actual zero/negative values and missing ragged coordinates', () => {
  const result = chartDataPreview({ data: [{ name: 'Observed', x: [1, 2, 3], y: [0, -0.01] }] });
  assert.deepEqual(result.columns, ['x', 'y']);
  assert.deepEqual(result.rows.map(row => row.values), [{ x: '1', y: '0' }, { x: '2', y: '-0.01' }, { x: '3', y: null }]);
  assert.equal(result.truncated, false);
});

test('preview bounds series, rows and cell length without serializing source objects', () => {
  let serialized = false;
  const hostileObject = { toJSON() { serialized = true; throw new Error('Do not serialize'); } };
  const result = chartDataPreview({ data: Array.from({ length: 20 }, () => ({ name: 'S'.repeat(1000), x: Array(100000).fill('X'.repeat(1000)), y: [hostileObject] })) });
  assert.equal(result.rows.length, CHART_PREVIEW_LIMITS.points);
  assert.equal(result.truncated, true);
  assert.ok(result.rows.every(row => row.series < CHART_PREVIEW_LIMITS.series));
  assert.ok(result.rows.every(row => row.name.length <= CHART_PREVIEW_LIMITS.cellLength && row.values.x.length <= CHART_PREVIEW_LIMITS.cellLength));
  assert.equal(result.rows[0].values.y, null);
  assert.equal(serialized, false);
});

test('non-finite and malformed points stay unavailable rather than becoming zero', () => {
  const result = chartDataPreview({ data: [null, 123, {}, { x: [null, undefined, Infinity, NaN, true], y: [] }] });
  assert.deepEqual(result.rows.map(row => row.values.x), [null, null, null, null, 'true']);
  assert.equal(chartDataPreview({}).rows.length, 0);
  assert.equal(chartDataPreview(null).rows.length, 0);
});

test('mesh rows and candlestick coordinates retain supplied values within fixed fields', () => {
  const mesh = chartDataPreview({ data: [{ x: [1], y: [2], z: [[3, 4, 5]] }] });
  assert.equal(mesh.rows[0].values.z, '[3, 4, 5]');
  const candle = chartDataPreview({ data: [{ x: ['2026-11-08'], open: [5], high: [7], low: [4], close: [6], secret: ['must not traverse arbitrary fields'] }] });
  assert.deepEqual(candle.columns, ['x', 'open', 'high', 'low', 'close']);
  assert.deepEqual(candle.rows[0].values, { x: '2026-11-08', open: '5', high: '7', low: '4', close: '6' });
});
