import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basePixelRatio, createRenderQuality } from '../src/renderQuality.ts';

test('render resolution fits its pixel budget on retina and 4K displays', () => {
  for (const [w, h, dpr] of [[1440,900,2], [3840,2160,2], [800,600,1], [1920,1080,1.5]]) {
    const ratio = basePixelRatio(w!, h!, dpr!);
    assert.ok(w! * h! * ratio * ratio <= 2_000_001);
    assert.ok(ratio <= dpr! && ratio <= 1.5);
  }
});

test('adaptive resolution responds to sustained slow frames and recovers gradually', () => {
  const quality = createRenderQuality();
  quality.update(0.06); assert.equal(quality.scale, 1, 'one slow frame must not resize the renderer');
  for (let i = 0; i < 200; i++) quality.update(1 / 30);
  assert.ok(quality.scale >= 0.7 && quality.scale < 1);
  const lower = quality.scale;
  quality.reset();
  for (let i = 0; i < 180; i++) quality.update(1 / 60);
  assert.equal(quality.scale, lower, 'recovery needs several seconds');
  for (let i = 0; i < 180; i++) quality.update(1 / 60);
  assert.ok(quality.scale > lower);
});
