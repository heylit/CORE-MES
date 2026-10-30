import { describe, expect, it } from 'vitest';
import { prototipYukle } from '../../prototip-html.ts';
import { ORNEK_GOVDE, ORNEK_MIL, ORNEK_TORNA_FREZE } from './ornekler.ts';

// Ornek parcalar prototipteki sentetik STEP betikleriyle harfi harfine ayni olmali.
describe('Oto-CAM ornek parcalari', () => {
  it('prototipteki betiklerle ayni', async () => {
    const HTML = await prototipYukle();
    const p = (id: string) => { const bas = `<script type="text/plain" id="${id}">`, i = HTML.indexOf(bas); return HTML.slice(i + bas.length, HTML.indexOf('</script>', i)).trim(); };
    expect(ORNEK_GOVDE).toBe(p('camSampleGovde'));
    expect(ORNEK_MIL).toBe(p('camSampleMil'));
    expect(ORNEK_TORNA_FREZE).toBe(p('camSampleMT'));
  }, 60000);
});
