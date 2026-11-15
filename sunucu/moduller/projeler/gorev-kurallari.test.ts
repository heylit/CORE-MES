import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  BASKASI_USTLENDI, GOREV_KAPALI, KENDI_ISIN, KONTROLDE_ATAMA, KONTROLDE_DEGIL, KONTROLLU_DURUM, KONTROLSUZ_KONTROLDE, KONTROLUN_DEGIL, SANA_ATANMADI, USTLENILEMEZ,
  YEDEK_GUN, bitirSonucu, duzenlemeDurumReddi, gorevIzinleri, kontroldeAtamaReddi, gorevlerimTuru, kontrolReddi, sablonTarihleri, ustlenReddi,
} from './kurallar.ts';
import type { GorevAtamasi } from './kurallar.ts';

const bos: GorevAtamasi = {
  durum: 'yapilacak', sorumluKisiId: null, yapanRolId: null, kontrolKisiId: null, kontrolRolId: null, yedekKontrolKisiId: null, yedekKontrolRolId: null,
};
const ali = { kisiId: 1, rolIdleri: [10] };
const veli = { kisiId: 2, rolIdleri: [20] };

describe('3269 görev kuralları (saf)', () => {
  test('üstlenme: yalnız rolündeki, sahipsiz ve açık görev; başkasınınki çakışma', () => {
    const g = { ...bos, yapanRolId: 10 };
    assert.equal(ustlenReddi(g, ali), null);
    assert.equal(ustlenReddi(g, veli), USTLENILEMEZ);
    assert.equal(ustlenReddi({ ...g, sorumluKisiId: 2 }, ali), BASKASI_USTLENDI);
    assert.equal(ustlenReddi({ ...g, durum: 'kontrolde' }, ali), GOREV_KAPALI);
    assert.equal(gorevIzinleri({ ...g, sorumluKisiId: 1 }, ali, { isle: true, kontrol: true }, null, 0).ustlenebilir, false, 'kendi görevi üstlenilmez');
  });

  test('bitirme: kontrollü görev kontrole, kontrolsüz görev bitti; başkası bitiremez', () => {
    assert.deepEqual(bitirSonucu({ ...bos, sorumluKisiId: 1 }, ali), { durum: 'bitti' });
    assert.deepEqual(bitirSonucu({ ...bos, sorumluKisiId: 1, kontrolRolId: 20 }, ali), { durum: 'kontrolde' });
    assert.deepEqual(bitirSonucu({ ...bos, sorumluKisiId: 1 }, veli), { ileti: SANA_ATANMADI });
  });

  test('kontrol: bitiren ve yapan onaylamaz; yedek yalnız asıl kontrol eden bitirense ya da YEDEK_GUN dolunca', () => {
    const g = { ...bos, durum: 'kontrolde', sorumluKisiId: 1, kontrolKisiId: 3, yedekKontrolRolId: 20 };
    assert.equal(kontrolReddi({ ...g, durum: 'suruyor' }, veli, 1, 0), KONTROLDE_DEGIL);
    assert.equal(kontrolReddi(g, ali, 1, 9), KENDI_ISIN);
    assert.equal(kontrolReddi(g, { kisiId: 3, rolIdleri: [] }, 1, 0), null);
    assert.equal(kontrolReddi(g, veli, 1, YEDEK_GUN - 1), KONTROLUN_DEGIL);
    assert.equal(kontrolReddi(g, veli, 1, YEDEK_GUN), null);
    assert.equal(kontrolReddi({ ...g, kontrolKisiId: 1 }, veli, 1, 0), null, 'asıl kontrol eden yapan kişiyse yedek hemen');
    assert.equal(kontrolReddi(g, { kisiId: 4, rolIdleri: [30] }, 1, 9), KONTROLUN_DEGIL);
  });

  test('düzenleme (K2): kontrollü görev bitirilmez ve kontrole sokulmaz; değişmeyen durum geçer', () => {
    assert.equal(duzenlemeDurumReddi('suruyor', 'bitti', true), KONTROLLU_DURUM);
    assert.equal(duzenlemeDurumReddi('suruyor', 'kontrolde', true), KONTROLLU_DURUM);
    assert.equal(duzenlemeDurumReddi('suruyor', 'kontrolde', false), KONTROLSUZ_KONTROLDE);
    assert.equal(duzenlemeDurumReddi('bitti', 'bitti', true), null);
    assert.equal(duzenlemeDurumReddi('kontrolde', 'suruyor', true), null);
    assert.equal(duzenlemeDurumReddi('suruyor', 'bitti', false), null);
  });

  test('düzenleme (K2): kontrolde bekleyen görevde kontrol eden ve yedek değişmez; başka durumda değişir', () => {
    const a = { kontrolKisiId: null, kontrolRolId: 3, yedekKontrolKisiId: null, yedekKontrolRolId: null };
    assert.equal(kontroldeAtamaReddi('kontrolde', a, a), null);
    assert.equal(kontroldeAtamaReddi('kontrolde', a, { ...a, kontrolRolId: null, kontrolKisiId: 9 }), KONTROLDE_ATAMA);
    assert.equal(kontroldeAtamaReddi('kontrolde', a, { ...a, yedekKontrolKisiId: 4 }), KONTROLDE_ATAMA);
    assert.equal(kontroldeAtamaReddi('suruyor', a, { ...a, kontrolRolId: 5 }), null);
  });

  test('görevlerim türü: bana, rolüme, kontrolümde, yaptım; kapanmış görev yok', () => {
    assert.equal(gorevlerimTuru({ ...bos, sorumluKisiId: 1 }, ali, null, 0), 'bana');
    assert.equal(gorevlerimTuru({ ...bos, yapanRolId: 10 }, ali, null, 0), 'rolume');
    const k = { ...bos, durum: 'kontrolde', sorumluKisiId: 1, kontrolRolId: 20 };
    assert.equal(gorevlerimTuru(k, veli, 1, 0), 'kontrolumde');
    assert.equal(gorevlerimTuru(k, ali, 1, 0), 'yaptim');
    assert.equal(gorevlerimTuru({ ...k, durum: 'bitti' }, veli, 1, 0), null);
  });

  test('şablon tarihleri: başlangıçtan ileri, terminden geri; proje tarihi yoksa bugün; süre uçlar dahil', () => {
    const p = { baslangic: '2026-12-01', bitis: '2026-12-31' };
    assert.deepEqual(sablonTarihleri({ dayanak: 'baslangic', gun: 0, sureGun: 3 }, p, '2026-11-15'), { planBaslangic: '2026-12-01', planBitis: '2026-12-03' });
    assert.deepEqual(sablonTarihleri({ dayanak: 'termin', gun: -2, sureGun: 1 }, p, '2026-11-15'), { planBaslangic: '2026-12-29', planBitis: '2026-12-29' });
    assert.deepEqual(sablonTarihleri({ dayanak: 'termin', gun: 0, sureGun: 2 }, { baslangic: null, bitis: null }, '2026-11-15'),
      { planBaslangic: '2026-11-15', planBitis: '2026-11-16' });
  });
});
