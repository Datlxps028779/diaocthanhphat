import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MapInteractionGate } from './MapInteractionGate';

vi.stubGlobal('React', React);

describe('MapInteractionGate', () => {
  it('blocks map interaction by default and exposes an activation control', () => {
    const html = renderToStaticMarkup(<MapInteractionGate label="bản đồ thử nghiệm"><div data-map-child>Map</div></MapInteractionGate>);
    expect(html).toContain('data-active="false"');
    expect(html).toContain('pointer-events:none');
    expect(html).toContain('Kích hoạt bản đồ thử nghiệm');
    expect(html).toContain('Nhấn để tương tác bản đồ');
  });
});
