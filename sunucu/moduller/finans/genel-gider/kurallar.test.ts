import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GIDER_KATEGORILERI } from '#paylasilan/sozlesme/finans.ts';
import { ARAC_FATURASI_KATEGORILERI, belgeleriDagit, genelGidereGirer } from './kurallar.ts';

test('2711 b (Maliyet): araç faturasının her kategorisi Finans gider kategorisidir ve genel gidere girer', () => {
  for (const k of ARAC_FATURASI_KATEGORILERI) {
    assert.ok((GIDER_KATEGORILERI as readonly string[]).includes(k), k);
    assert.ok(genelGidereGirer(k), k);
  }
  assert.equal(genelGidereGirer('faiz'), false);
  // Projesiz araç faturası dışarıda kalmaz: tutarı kira ya da diğere girer.
  const d = belgeleriDagit(ARAC_FATURASI_KATEGORILERI.map((kategori, i) => ({ id: i + 1, belgeNo: null, kategori, tutarTl: 100, siparisli: false, eski: false, projeMasrafi: false })));
  assert.deepEqual(d.disarida, []);
  assert.equal((d.belgeler.kira ?? 0) + (d.belgeler.diger ?? 0), 100 * ARAC_FATURASI_KATEGORILERI.length);
});
