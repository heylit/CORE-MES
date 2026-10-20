import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import * as servis from './servis.ts';

// Yalnız bu modülün gerektirdiği zincir yüklenir; başka modüllerin örnek verisi bu testin konusu değildir.
async function zincir(modul: string): Promise<OrnekVeriTanimi[]> {
  const hepsi = new Map((await modulOrnekVerileriniKesfet()).map((t) => [t.modul, t]));
  const secilen = new Map<string, OrnekVeriTanimi>();
  const ekle = (ad: string): void => {
    const t = hepsi.get(ad);
    if (!t || secilen.has(ad)) return;
    secilen.set(ad, t);
    t.gerekir.forEach(ekle);
  };
  ekle(modul);
  return [...secilen.values()];
}

describe('istasyonlar: örnek veri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  before(async () => { ortam = await testVeritabaniKur('istasyonlar_ornek'); });
  after(async () => { await ortam?.kaldir(); });

  test('kisiler zinciriyle yüklenir: yapı ve atamalar kurulur, ikinci koşu hiçbir şey yazmaz', async () => {
    const liste = await zincir('istasyonlar');
    const secenek = { ortam: 'test' as const, bildir: () => undefined };
    const ilk = await ornekVeriYukle(vt(), liste, secenek);
    assert.equal(ilk.durum, 'yuklendi');
    assert.ok(ilk.moduller.indexOf('kisiler') < ilk.moduller.indexOf('istasyonlar'));

    const db = vt();
    const ornek = <T extends { kod: string }>(l: T[]): T[] => l.filter((k) => k.kod.startsWith('ORN-'));
    const merkezler = ornek(await servis.isMerkezleri(db, false));
    const istasyonlar = ornek(await servis.istasyonKayitlari(db, false));
    const makineler = ornek(await servis.makineler(db, { pasiflerDahil: false, istasyonId: null }));
    const ekipler = ornek(await servis.ekipler(db, false));
    assert.deepEqual(merkezler.map((m) => m.kod).sort(), ['ORN-MON', 'ORN-TAL']);
    assert.equal(istasyonlar.length, 5);
    assert.equal(makineler.length, 5);
    assert.ok(makineler.every((m) => m.istasyonId !== null));
    assert.equal(ekipler.length, 1);
    assert.ok(istasyonlar.every((i) => i.sorumluAd !== null));

    const atamalar = (await Promise.all((['istasyon', 'makine', 'ekip'] as const).map((tur) =>
      servis.atamalar(db, tur, { hedefId: null, kisiId: null, tarih: undefined })))).flat();
    assert.equal(atamalar.length, 5);
    assert.equal(new Set(atamalar.map((a) => a.kisiId)).size, 5);

    // Operatörler istasyonlarına bağlıdır: her örnek istasyonda yetkin bir operatör var (Akış A provası: "Yetkili istasyonlarım:
    // Atama yok" ve planda "yetkin personel yok"). İş merkezi kısıtı boş kalır: örnek emirler operatörü öteki merkezde de çalıştırır.
    const kodu = new Map(istasyonlar.map((i) => [i.id, i.kod]));
    const yetkinlik = new Map((await servis.yetkinlikler(db)).map((y) => [y.kisiId, y.istasyonIdleri.map((id) => kodu.get(id)).sort()]));
    const beklenen: Record<string, string[]> = {
      // Örnek emirlerin bütün adımlarını operator1 yürütür; yetkinliği olmayanın iş başlatması reddedilir (kullanıcı kararı 86 b).
      'ornek.operator1': ['ORN-FREZE-1', 'ORN-FREZE-2', 'ORN-KONTROL', 'ORN-TORNA-1', 'ORN-TORNA-2'],
      'ornek.operator2': ['ORN-FREZE-1'],
      'ornek.operator3': ['ORN-FREZE-1', 'ORN-FREZE-2'],
      'ornek.operator4': ['ORN-KONTROL'],
      // Üretim yetkisi (terminal.uret) olan öteki örnek hesaplar da her istasyonda iş başlatabilir.
      'ornek.mudur': ['ORN-FREZE-1', 'ORN-FREZE-2', 'ORN-KONTROL', 'ORN-TORNA-1', 'ORN-TORNA-2'],
      'ornek.vardiya': ['ORN-FREZE-1', 'ORN-FREZE-2', 'ORN-KONTROL', 'ORN-TORNA-1', 'ORN-TORNA-2'],
    };
    for (const [kullanici, istasyonKodlari] of Object.entries(beklenen)) {
      assert.deepEqual(yetkinlik.get((await kisiNoKullaniciAdindan(db, kullanici))!), istasyonKodlari, kullanici);
    }
    const yetkinIstasyonlar = new Set([...yetkinlik.values()].flat());
    assert.deepEqual(istasyonlar.map((i) => i.kod).filter((k) => !yetkinIstasyonlar.has(k)), []);

    const ikinci = await ornekVeriYukle(vt(), liste, secenek);
    assert.equal(ikinci.durum, 'yuklu');
    assert.ok(ikinci.moduller.includes('istasyonlar'));
    assert.equal(ornek(await servis.isMerkezleri(db, false)).length, 2);
  });
});
