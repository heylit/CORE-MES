import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AdimGirdisi } from '#paylasilan/sozlesme/rota.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 982 a (PL-02): sunucu motoru rotanın bağımlılık türünü uygular. Bekleyen öncül bitince, akışlı ilk devir partisi gelince başlar ve
// öncülünden önce bitmez, bağımsız beklemez. Örtüşme denemesi ayrı seçenektir.
describe('plan (gerçek PostgreSQL): bağımlılık türü sunucu motorunda (982 a)', () => {
  const { isEmirleriAc, yeniAdim, taslaktaOner, yer, durum } = planTestOrtami();
  const dk = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;
  const iki = async (ikinci: Partial<AdimGirdisi>) => {
    const { makineA, makineB } = durum();
    const [a1, a2] = await isEmirleriAc([
      yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 0, birimSureDk: 10 }),
      yeniAdim({ kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: 0, birimSureDk: 2, bilesenler: [], ...ikinci }),
    ], 10);
    const p = await taslaktaOner();
    return { y1: yer(p, a1!), y2: yer(p, a2!) };
  };

  test('bekleyen: ardıl öncülün bitişinden önce başlamaz', async () => {
    const { y1, y2 } = await iki({});
    assert.ok(dk(y1.bitis, y2.baslangic) >= 0, `${y1.bitis} ${y2.baslangic}`);
  });

  // Öncül 10 x 10 dk, ardıl 10 x 2 dk, devir 2 adet: ardıl ilk devirden (20. dk) sonra ve öncülün son devrini işleyecek kadar önce
  // başlar; motor tezgâhı boş tutmamak için en geç uygun anda (100 + 2 x 2 - 20 = 84. dk) başlatır.
  test('akışlı: ardıl öncül bitmeden başlar, ilk devirden önce başlamaz, öncülünden önce bitmez', async () => {
    const { y1, y2 } = await iki({ bagimlilik: 'akisli', devirAdedi: 2 });
    const bas = dk(y1.baslangic, y2.baslangic);
    assert.ok(bas >= 20 && dk(y2.baslangic, y1.bitis) > 0, `ardıl öncülden ${String(bas)} dk sonra başladı`);
    assert.ok(dk(y1.bitis, y2.bitis) >= 4, `${y1.bitis} ${y2.bitis}`);
  });

  test('bağımsız: ardıl öncülü beklemez', async () => {
    const { makineA, makineB } = durum();
    const [a1, a2] = await isEmirleriAc([
      yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 0, birimSureDk: 10 }),
      yeniAdim({ kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: 0, birimSureDk: 2, bagimlilik: 'bagimsiz' }),
    ], 10);
    const p = await taslaktaOner();
    const y1 = yer(p, a1!), y2 = yer(p, a2!);
    assert.ok(dk(y2.baslangic, y1.bitis) > 0, `${y1.baslangic}-${y1.bitis} ${y2.baslangic}`);
  });
});
