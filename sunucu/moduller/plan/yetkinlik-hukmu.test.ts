import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { baslatmaYetkinlikIhlali, makineYetkinlikIhlali } from '../uretim-emirleri/disari.ts';
import { KISI_YETKINLIGI_YOK, YETKIN_KISI_YOK, yetkinlikUyarisi } from './kurallar.ts';
import type { YetkinlikVerisi } from './kurallar.ts';

// S3 (2311 S5): plan, terminalin başlatma kuralıyla aynı hükmü verir. Kural işlevleri terminalin kendisidir.
const kural = { istasyon: baslatmaYetkinlikIhlali, makine: makineYetkinlikIhlali };
const veri = (istasyon: [number, number[]][], makine: { kisiId: number; makineId: number }[] = []): YetkinlikVerisi =>
  ({ istasyon: new Map(istasyon.map(([k, l]) => [k, new Set(l)])), makine });
const KISI = (id: number) => ({ tur: 'kisi' as const, id });
const MAKINE = (id: number) => ({ tur: 'makine' as const, id });

describe('S3 yetkinlik hükmü (2311 S5)', () => {
  test('kişi istasyonda yetkinse uyarı yok; başka istasyonda yetkinse uyarı', () => {
    assert.equal(yetkinlikUyarisi(KISI(1), 10, veri([[1, [10]]]), kural), null);
    assert.equal(yetkinlikUyarisi(KISI(1), 10, veri([[1, [20]]]), kural), KISI_YETKINLIGI_YOK);
  });

  test('yetkinliği hiç tanımlanmamış kişi terminalde başlatamaz, plan da uyarır', () => {
    assert.equal(yetkinlikUyarisi(KISI(1), 10, veri([]), kural), KISI_YETKINLIGI_YOK);
  });

  test('istasyonu bilinmeyen adımda denetim yok', () => {
    assert.equal(yetkinlikUyarisi(KISI(1), null, veri([]), kural), null);
    assert.equal(yetkinlikUyarisi(MAKINE(5), null, veri([]), kural), null);
  });

  test('kayıtsız makinede istasyonda yetkin bir kişi yeter; hiç kimse yoksa uyarı', () => {
    assert.equal(yetkinlikUyarisi(MAKINE(5), 10, veri([[1, [10]]]), kural), null);
    assert.equal(yetkinlikUyarisi(MAKINE(5), 10, veri([[1, [20]]]), kural), YETKIN_KISI_YOK);
    assert.equal(yetkinlikUyarisi(MAKINE(5), 10, veri([]), kural), YETKIN_KISI_YOK);
  });

  test('kayıtlı makinede yalnız makine yetkinliği olan istasyon yetkinlisi başlatır (2046 a)', () => {
    const kayit = [{ kisiId: 2, makineId: 5 }];
    assert.equal(yetkinlikUyarisi(MAKINE(5), 10, veri([[1, [10]], [2, [10]]], kayit), kural), null);
    assert.equal(yetkinlikUyarisi(MAKINE(5), 10, veri([[1, [10]], [2, [20]]], kayit), kural), YETKIN_KISI_YOK, 'kayıtlı kişi bu istasyonda yetkin değil');
    assert.equal(yetkinlikUyarisi(MAKINE(6), 10, veri([[1, [10]]], kayit), kural), null, 'başka makinenin kaydı bu makineyi kayıtlı yapmaz');
  });

  test('hüküm terminalinkiyle aynı: kişi uyarısı tam terminalin reddettiği durumda çıkar', () => {
    for (const yetkin of [true, false]) {
      const v = veri(yetkin ? [[1, [10]]] : []);
      assert.equal(yetkinlikUyarisi(KISI(1), 10, v, kural) === null, baslatmaYetkinlikIhlali(yetkin, false) === null);
    }
  });

  // 2320 S5 (c): aynı girdiyle eşitlik tablosu. Tek kişili istasyonda plan "başlatılır" der ancak ve ancak terminal o kişiye başlatma izni
  // veriyorsa (istasyon kuralı ve makine kuralı birlikte; yönetici muafiyeti iki tarafta da yok).
  test('eşitlik tablosu: istasyon yetkinliği x makine kaydı x kişinin kaydı', () => {
    for (const istasyonYetkin of [true, false]) for (const makineKayitli of [true, false]) for (const kisiKayitli of [true, false]) {
      if (kisiKayitli && !makineKayitli) continue;
      const kayit = makineKayitli ? [{ kisiId: kisiKayitli ? 1 : 2, makineId: 5 }] : [];
      const v = veri(istasyonYetkin ? [[1, [10]]] : [], kayit);
      const terminal = baslatmaYetkinlikIhlali(istasyonYetkin, false) === null && makineYetkinlikIhlali(1, [5], kayit, false) === null;
      const durum = `istasyon ${String(istasyonYetkin)}, makine kayıtlı ${String(makineKayitli)}, kişi kayıtlı ${String(kisiKayitli)}`;
      assert.equal(yetkinlikUyarisi(MAKINE(5), 10, v, kural) === null, terminal, `makine: ${durum}`);
      assert.equal(yetkinlikUyarisi(KISI(1), 10, v, kural) === null, baslatmaYetkinlikIhlali(istasyonYetkin, false) === null, `kişi: ${durum}`);
    }
  });
});
