import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haritaMetni, haritaTopla } from './harita.ts';

test('harita metni: tam olmayan denetim kipi uç satırının sonunda yazılır; tam denetlenen uçta işaret yoktur', async () => {
  const harita = await haritaTopla();
  const ornek = harita.moduller.find((m) => m.sunucu);
  assert.ok(ornek);
  const metin = haritaMetni({
    ...harita,
    moduller: [{
      ...ornek,
      uclar: [
        { yontem: 'POST', yol: '/deneme/tam', yetki: 'oturum', txDisi: false },
        { yontem: 'POST', yol: '/deneme/govdesiz', yetki: 'oturum', txDisi: false, denetim: 'govdesiz' },
        { yontem: 'POST', yol: '/deneme/yok', yetki: 'oturum', txDisi: false, denetim: 'yok' },
      ],
    }],
  }, ornek.ad);
  const bul = (parca: string): string => metin.split('\n').find((s) => s.includes(parca)) ?? '';
  assert.match(bul('/deneme/tam'), /^\s+POST\s+\/deneme\/tam\s+oturum$/);
  assert.match(bul('/deneme/govdesiz'), /^\s+POST\s+\/deneme\/govdesiz\s+oturum\s+denetim:govdesiz$/);
  assert.match(bul('/deneme/yok'), /^\s+POST\s+\/deneme\/yok\s+oturum\s+denetim:yok$/);
});
