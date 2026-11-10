import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, test } from 'node:test';
import { DEGERLENDIRME_DOSYALARI } from './degerlendirme.ts';
import { mesaiTutari, type MesaiGirdisi } from './kurallar.ts';

// 2742 (2740 a, 2743 b, 2510 a; T-2742-1): plan değerlendirmesinin ek mesai bedeli (motor ymMesaiTL) ile taslak toplamının satırı (2653
// mesaiTutari) aynı ek vardiyada aynı tutardır. Motor değeri sunucunun yazdığı D.mesaiSaat[tezgahId]'den okur. Veriler uydurmadır.
const MOTOR = join(dirname(fileURLToPath(import.meta.url)), 'motor');
type MesaiTL = (D: unknown, cx: unknown, e: { m: string; gun: number; vardiya: string }) => number | null;
function motorMesaiTL(): MesaiTL {
  const b = vm.createContext({}); b['self'] = b;
  vm.runInContext(`${DEGERLENDIRME_DOSYALARI.map((m) => readFileSync(join(MOTOR, `${m}.js`), 'utf8')).join('\n')}\n;`, b);
  return vm.runInContext('ymMesaiTL', b) as MesaiTL;
}

const SAAT = 122;
const UCRET = 300;
// 2026-01-05 pazartesi; gün 0 vardiyalı hafta içi, gün 5 cumartesi (çalışma günü yok: vardiyasız).
const D = (mesaiSaat: Record<string, number | null>): Record<string, unknown> => ({
  meta: { baslangic: '2026-01-05' }, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
  calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'], cmt: [], paz: [] }, tatiller: [],
  tezgahlar: [{ id: 'T1', grup: '10', opOran: 1 }], personel: [], ayarlar: { mesaiUcret: UCRET }, planTL: { mesaiCarpan: 1.5 },
  mesaiSis: { kisiBazli: true, carp: { hi: 1.5, cmt: 2, paz: 2, tatil: 2 }, kisiEk: 100 }, mesaiSaat,
});
const sunucu = (saatDegeri: number | null, carpan: number): MesaiGirdisi => ({
  h: 8, kisiBazli: true, op: 1, saatDegeri, carpan, kisiEk: 100, ucret: UCRET, mesaiCarpan: 1.5,
});

describe('2742 T-2742-1: değerlendirme ek mesai bedeli = 2653 satırı', () => {
  const ymMesaiTL = motorMesaiTL();
  test('EG-01 büyük grup, hafta içi: grup saat maliyetiyle (8 x 1 x 122 x 1,5 + 100)', () => {
    const m = ymMesaiTL(D({ T1: SAAT }), null, { m: 'T1', gun: 0, vardiya: 'V1' });
    assert.equal(m, 8 * SAAT * 1.5 + 100);
    assert.equal(m, mesaiTutari(sunucu(SAAT, 1.5)));
  });
  test('EG-02 küçük grup (değer null), hafta içi vardiyalı: yalın ücret, çarpan her ek mesaide (8 x 300 x 1,5)', () => {
    const m = ymMesaiTL(D({ T1: null }), null, { m: 'T1', gun: 0, vardiya: 'V1' });
    assert.equal(m, 3600);
    assert.equal(m, mesaiTutari(sunucu(null, 1.5)));
  });
  test('EG-03 küçük grup, vardiyasız gün (cumartesi): yalın ücret, aynı tutar', () => {
    const m = ymMesaiTL(D({ T1: null }), null, { m: 'T1', gun: 5, vardiya: 'V1' });
    assert.equal(m, 3600);
    assert.equal(m, mesaiTutari(sunucu(null, 2)));
  });
  test('EG-04 değer yazılmamış (maliyet görmeyen okuyucu) ya da sayı değil: yalın; mesai ücreti de yoksa bilinmiyor', () => {
    const { mesaiSaat: _m, ...yok } = D({});
    assert.equal(ymMesaiTL(yok, null, { m: 'T1', gun: 0, vardiya: 'V1' }), 3600);
    assert.equal(ymMesaiTL(D({ T1: 'x' as unknown as number }), null, { m: 'T1', gun: 0, vardiya: 'V1' }), 3600);
    assert.equal(ymMesaiTL({ ...D({ T1: null }), ayarlar: {} }, null, { m: 'T1', gun: 0, vardiya: 'V1' }), null);
    assert.equal(mesaiTutari({ ...sunucu(null, 1.5), ucret: null }), null);
  });
  test('EG-05 değer tezgâh başınadır: aynı gruptaki başka tezgâhın değeri bu tezgâha geçmez', () => {
    const d = { ...D({ T2: SAAT }), tezgahlar: [{ id: 'T1', grup: '10', opOran: 1 }, { id: 'T2', grup: '10', opOran: 1 }] };
    assert.equal(ymMesaiTL(d, null, { m: 'T1', gun: 0, vardiya: 'V1' }), 3600);
    assert.equal(ymMesaiTL(d, null, { m: 'T2', gun: 0, vardiya: 'V1' }), 8 * SAAT * 1.5 + 100);
  });
});
