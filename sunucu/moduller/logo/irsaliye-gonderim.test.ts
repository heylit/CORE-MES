import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { OLCUM_DURUMU } from './irsaliye-etiket-esleme.ts';
import type { IrsaliyeGidenTuru, OlcumDurumu } from './irsaliye-etiket-esleme.ts';
import { irsaliyeAyariniDegistir } from './irsaliye-ayari.ts';
import { irsaliyeTuru } from './irsaliye-gonderim.ts';
import type { GidecekIrsaliye, IrsaliyeKaynagi, IrsaliyeTurOrtami } from './irsaliye-gonderim.ts';
import type { KabulBelgesi } from './irsaliye-yazma-kurallari.ts';
import type { SevkBelgesi } from './satis-irsaliye-kurallari.ts';
import type { KopruIstemcisi } from './kopru.ts';
import type { KopruSonucu, LogoBelgeBulgusuHam } from './kurallar.ts';
import { yeniSurecBellegi } from './servis.ts';
import * as s from './sorgular.ts';

// Kart 3694: irsaliye gönderim turu, KAPALI. Köprü elle kurulmuş taklit; veri uydurma (ORN-); gerçek PostgreSQL.
const TAM: OlcumDurumu = { satinAlmaEtiketleriOlculdu: true, satisEtiketleriOlculdu: true, konsinyeOlculdu: true, durumKodlariOnaylandi: true, eIrsaliyeUreticisiBelli: true, teyitKalkti: true };
const kabul = (o: Partial<KabulBelgesi> = {}): KabulBelgesi => ({
  no: 'MK-ORN-1', tur: 'satin_alma', irsaliyeNo: 'ORN-IRS-1', irsaliyeTarihi: '2026-11-24', tarih: '2026-11-24', cariKodu: 'ORN-CARI', projeKodu: null,
  satirlar: [{ sira: 1, stokKodu: 'ORN-MLZ-1', miktar: '4', birim: 'adet', siparisSatiriLogoRef: 9001, ambarNo: 0, fiyat: '10', kdvOrani: '20', lotlu: false }], ...o,
});
const sevk = (o: Partial<SevkBelgesi> = {}): SevkBelgesi => ({
  no: 'SV-ORN-1', tarih: '2026-11-25', tur: 'toptan', cariKodu: 'ORN-CARI',
  satirlar: [{ sira: 1, stokKodu: 'ORN-MAM-1', miktar: '10', birim: 'adet', ambarNo: 2, siparisSatiriLogoRef: 100, lotlu: false, stoktaki: '25' }], ...o,
});
const bulgu = (o: Partial<LogoBelgeBulgusuHam>): LogoBelgeBulgusuHam => ({
  logoKayitNo: 77, no: null, belgeNo: null, tarih: null, cariKodu: null, cariAdi: null, projeKodu: null, projeAdi: null, aciklama: null, tutar: null,
  dovizTuru: null, iptal: false, satirlar: [], satirSayisi: 0, ...o,
});

describe('Logo irsaliye gönderim turu (3694, kapalı)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  let kuyruk: GidecekIrsaliye[] = [];
  const sonuclar: { tur: string; id: number; sonuc: { kayitNo: string } | { hata: string } }[] = [];
  const silinenler = new Set<number>();
  let aramaSayisi = 0;
  let eklemeler: { tur: string; govde: Record<string, unknown> }[] = [];
  let aramaCevabi: LogoBelgeBulgusuHam[] = [];
  let eklemeCevabi: KopruSonucu = { tur: 'basarili', logicalRef: 501 };

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const kopru = {
    async belgeAra() { aramaSayisi += 1; return { tur: 'basarili', veri: aramaCevabi }; },
    async irsaliyeEkle(tur: string, govde: Record<string, unknown>) { eklemeler.push({ tur, govde }); return eklemeCevabi; },
  } as unknown as KopruIstemcisi;
  const kaynak: IrsaliyeKaynagi = {
    async gidecekler(_db: Db, a) {
      const atla = new Set(a.atla.map((x) => `${x.tur}:${x.id}`));
      return kuyruk.filter((k) => a.turler.includes(k.tur) && !atla.has(`${k.tur}:${k.id}`)).slice(0, a.sinir);
    },
    async sonuc(_db: Db, tur: IrsaliyeGidenTuru, id: number, sonuc) { sonuclar.push({ tur, id, sonuc }); },
    async varOlanlar(_db: Db, _tur: IrsaliyeGidenTuru, idler) { return new Set(idler.filter((i) => !silinenler.has(i))); },
  };
  let bellek = yeniSurecBellegi();
  const ortami = (): IrsaliyeTurOrtami => ({ kopru, bellek, saat: () => new Date('2026-11-25T09:00:00Z'), kaynak });
  // Kapıyı atlatan parametre yok: ölçüm bayrakları node:test mock.property ile geçici çevrilir (afterEach'te geri alınır).
  const olcumAyarla = (d: Partial<OlcumDurumu> = {}): void => {
    for (const [k, v] of Object.entries({ ...TAM, ...d }) as [keyof OlcumDurumu, boolean][]) mock.property(OLCUM_DURUMU, k, v);
  };
  const ayar = async (a: 'logo.baglanti' | 'logo.satin-alma-irsaliyesi' | 'logo.sevk-irsaliyesi', deger: boolean): Promise<void> => {
    await vt().tx(async (db) => {
      if (a === 'logo.baglanti') {
        const { modulAyariDegistir } = await import('../ayarlar/disari.ts');
        await modulAyariDegistir(db, kisiId, a, deger, !deger, { modul: 'logo', yetki: 'ayarlar.yaz', yol: '/test' });
      } else await irsaliyeAyariniDegistir(db, kisiId, a, deger, !deger);
    });
  };

  before(async () => {
    ortam = await testVeritabaniKur('logoirsaliyegonderim');
    kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'ig-yonetici', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });
  afterEach(() => { mock.restoreAll(); });
  beforeEach(async () => {
    await vt().sorgu('DELETE FROM logo_irsaliye_giden');
    for (const a of ['logo.satin-alma-irsaliyesi', 'logo.sevk-irsaliyesi', 'logo.baglanti'] as const) {
      await vt().sorgu('DELETE FROM ayar WHERE anahtar = $1', [a]);
    }
    silinenler.clear();
    kuyruk = []; sonuclar.length = 0; aramaSayisi = 0; eklemeler = []; aramaCevabi = []; eklemeCevabi = { tur: 'basarili', logicalRef: 501 };
    bellek = yeniSurecBellegi();
  });

  test('varsayılan: bağlantı kapalıyken kapalı, ayarlar kapalıyken irsaliye-yazma-kapali; köprüye hiç gidilmez', async () => {
    kuyruk = [{ tur: 'satin-alma-irsaliyesi', id: 1, belge: kabul() }];
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'kapali' });
    await ayar('logo.baglanti', true);
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'irsaliye-yazma-kapali' });
    assert.equal(aramaSayisi + eklemeler.length, 0);
  });

  test('ayar bugünkü ölçüm durumunda komutla da açılamaz; değer kapalı kalır', async () => {
    for (const a of ['logo.satin-alma-irsaliyesi', 'logo.sevk-irsaliyesi'] as const) {
      await assert.rejects(vt().tx((db) => irsaliyeAyariniDegistir(db, kisiId, a, true, false)), /açılamaz/);
      assert.equal(await vt().tx((db) => sistemAyariOku(db, a)), false);
    }
  });

  test('ayar kontrolü: bağlantı ve ölçüm kapısı açıkken tür ayarı kapalıysa gönderim durur; yalnız açık türün belgesi gider', async () => {
    olcumAyarla();
    await ayar('logo.baglanti', true);
    kuyruk = [{ tur: 'satin-alma-irsaliyesi', id: 1, belge: kabul() }, { tur: 'satis-irsaliyesi', id: 2, belge: sevk() }];
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'irsaliye-yazma-kapali' });
    assert.equal(aramaSayisi + eklemeler.length, 0);
    assert.equal(await s.gidenSatiri(vt(), 'satin-alma-irsaliyesi', 1), null);
    await ayar('logo.sevk-irsaliyesi', true);
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'irsaliye-niyet', no: 2, belge: 'satis-irsaliyesi' });
    assert.equal(await s.gidenSatiri(vt(), 'satin-alma-irsaliyesi', 1), null, 'ayarı kapalı tür niyet de yazmaz');
  });

  test('takılı satırlar kuyruk sınırını doldurmaz: bekleme süresindeki ve Logo\'ya gitmiş 20 satırın arkasındaki yeni belge de gider', async () => {
    olcumAyarla();
    await ayar('logo.baglanti', true);
    await ayar('logo.satin-alma-irsaliyesi', true);
    const gelecek = new Date('2026-11-25T12:00:00Z');
    for (let i = 1; i <= 20; i++) {
      await vt().tx((db) => s.denemeYaz(db, 'satin-alma-irsaliyesi', i, {
        zaman: new Date('2026-11-25T08:59:00Z'), sonuc: i % 2 === 0 ? 'ulasilamadi' : 'gonderildi', hata: i % 2 === 0 ? 'ORN hata' : null, logoKayitNo: i % 2 === 0 ? null : String(1000 + i),
        niyetZamani: null, sonrakiDeneme: i % 2 === 0 ? gelecek : null, basarili: i % 2 !== 0,
      }));
    }
    kuyruk = Array.from({ length: 21 }, (_, i) => ({ tur: 'satin-alma-irsaliyesi' as const, id: i + 1, belge: kabul({ no: `MK-ORN-${i + 1}` }) }));
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'irsaliye-niyet', no: 21, belge: 'satin-alma-irsaliyesi' });
  });

  test('N6: eski gönderilmiş satırlar atlanacaklar listesinin sınırını doldurmaz; sonraki bekleyenler yine atlanır', async () => {
    olcumAyarla();
    await ayar('logo.baglanti', true);
    await ayar('logo.satin-alma-irsaliyesi', true);
    // 600 eski gönderilmiş satır (liste sınırı 500'den çok), sonra bekleme süresindeki 20 satır.
    await vt().sorgu(
      `INSERT INTO logo_irsaliye_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, logo_kayit_no, olusma)
       SELECT 'satin-alma-irsaliyesi', 5000 + g, 1, now(), 'gonderildi', 'K' || g, now() - interval '2 days' FROM generate_series(1, 600) g`);
    for (let i = 1; i <= 20; i++) {
      await vt().tx((db) => s.denemeYaz(db, 'satin-alma-irsaliyesi', i, {
        zaman: new Date('2026-11-25T08:59:00Z'), sonuc: 'ulasilamadi', hata: 'ORN hata', logoKayitNo: null, niyetZamani: null,
        sonrakiDeneme: new Date('2026-11-25T12:00:00Z'), basarili: false,
      }));
    }
    kuyruk = Array.from({ length: 21 }, (_, i) => ({ tur: 'satin-alma-irsaliyesi' as const, id: i + 1, belge: kabul({ no: `MK-ORN-${i + 1}` }) }));
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'irsaliye-niyet', no: 21, belge: 'satin-alma-irsaliyesi' });
  });

  test('N1: ayar açık olsa bile ölçüm kapısı kapanırsa gönderim durur, istek çıkmaz', async () => {
    olcumAyarla();
    await ayar('logo.baglanti', true);
    await ayar('logo.satin-alma-irsaliyesi', true);
    mock.restoreAll(); olcumAyarla({ durumKodlariOnaylandi: false });
    kuyruk = [{ tur: 'satin-alma-irsaliyesi', id: 1, belge: kabul() }];
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'irsaliye-yazma-kapali' });
    assert.equal(aramaSayisi + eklemeler.length, 0);
    assert.equal(await s.gidenSatiri(vt(), 'satin-alma-irsaliyesi', 1), null, 'niyet bile yazılmaz');
  });

  test('açık: önce niyet, sonraki turda kalkan araması ve tek yazma; sonuç kayıt no ile yazılır; ikinci tur ikinci irsaliye açmaz', async () => {
    olcumAyarla();
    await ayar('logo.baglanti', true);
    await ayar('logo.satin-alma-irsaliyesi', true);
    kuyruk = [{ tur: 'satin-alma-irsaliyesi', id: 1, belge: kabul() }];
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'irsaliye-niyet', no: 1, belge: 'satin-alma-irsaliyesi' });
    assert.equal(eklemeler.length, 0);
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'irsaliye', no: 1, belge: 'satin-alma-irsaliyesi', sonuc: 'gonderildi' });
    assert.equal(aramaSayisi, 1);
    assert.equal(eklemeler.length, 1);
    assert.equal(eklemeler[0]?.govde['NOTES1'], 'MK-ORN-1');
    assert.deepEqual(sonuclar, [{ tur: 'satin-alma-irsaliyesi', id: 1, sonuc: { kayitNo: '501' } }]);
    assert.equal((await s.gidenSatiri(vt(), 'satin-alma-irsaliyesi', 1))?.logoKayitNo, '501');
    await irsaliyeTuru(vt(), ortami());
    await irsaliyeTuru(vt(), ortami());
    assert.equal(eklemeler.length, 1);
  });

  test('çift kayıt kalkanı: Logo açıklamasında mal kabul no tam sözcük varsa yazılmaz, o kayda eşlenir', async () => {
    olcumAyarla();
    await ayar('logo.baglanti', true);
    await ayar('logo.satin-alma-irsaliyesi', true);
    kuyruk = [{ tur: 'satin-alma-irsaliyesi', id: 2, belge: kabul({ no: 'MK-ORN-2' }) }];
    aramaCevabi = [bulgu({ logoKayitNo: 88, aciklama: 'ORN not MK-ORN-2 ek' })];
    await irsaliyeTuru(vt(), ortami());
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'irsaliye', no: 2, belge: 'satin-alma-irsaliyesi', sonuc: 'zaten-vardi' });
    assert.equal(eklemeler.length, 0);
    assert.equal((await s.gidenSatiri(vt(), 'satin-alma-irsaliyesi', 2))?.logoKayitNo, '88');
  });

  test('sevk: satış irsaliyesi TRCODE 8 ile gider, konsinye ölçülmemişse hiç sıraya girmez', async () => {
    olcumAyarla({ konsinyeOlculdu: false });
    await ayar('logo.baglanti', true);
    await ayar('logo.sevk-irsaliyesi', true);
    kuyruk = [{ tur: 'satis-irsaliyesi', id: 5, belge: sevk() }];
    await irsaliyeTuru(vt(), ortami());
    assert.equal((await irsaliyeTuru(vt(), ortami())).tur, 'irsaliye');
    assert.equal(eklemeler[0]?.tur, 'satis-irsaliyesi');
    assert.equal(eklemeler[0]?.govde['TYPE'], 8);
    kuyruk = [{ tur: 'konsinye-irsaliyesi', id: 6, belge: sevk({ no: 'SV-ORN-2', tur: 'konsinye' }) }];
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'bos' });
    assert.equal(await s.gidenSatiri(vt(), 'konsinye-irsaliyesi', 6), null);
  });

  test('Risk notu: Logo hata metnindeki şoför kimlik numarası giden kutusuna ve belge sahibine yazılmaz', async () => {
    olcumAyarla();
    await ayar('logo.baglanti', true);
    await ayar('logo.sevk-irsaliyesi', true);
    kuyruk = [{ tur: 'satis-irsaliyesi', id: 7, belge: sevk({ no: 'SV-ORN-7' }) }];
    eklemeCevabi = { tur: 'reddedildi', ileti: 'Sürücü kimliği 00000000000 geçersiz, plaka ORN-PLK' };
    await irsaliyeTuru(vt(), ortami());
    const r = await irsaliyeTuru(vt(), ortami());
    assert.equal(r.tur, 'irsaliye');
    const g = await s.gidenSatiri(vt(), 'satis-irsaliyesi', 7);
    assert.equal(g?.sonSonuc, 'reddedildi');
    assert.ok(g?.sonHata?.includes('[gizlendi]'));
    assert.equal(/\d{11}/.test(g?.sonHata ?? ''), false);
    assert.equal(sonuclar.some((x) => 'hata' in x.sonuc && /\d{11}/.test(x.sonuc.hata)), false);
  });

  test('yetim satır: kaynağı silinmiş ve Logo\'ya gitmemiş satır kutudan düşer; niyetli ya da Logo kayıtlı satıra dokunulmaz; kaynağı duran kalır', async () => {
    olcumAyarla();
    await ayar('logo.baglanti', true);
    await ayar('logo.satin-alma-irsaliyesi', true);
    const an = new Date('2026-11-25T08:00:00Z');
    await vt().sorgu("INSERT INTO logo_irsaliye_giden (belge_turu, belge_no, son_deneme, son_sonuc, son_hata) VALUES ('satin-alma-irsaliyesi', 11, $1, 'reddedildi', 'ORN ret')", [an]);
    await vt().sorgu("INSERT INTO logo_irsaliye_giden (belge_turu, belge_no, son_deneme, son_sonuc, son_hata) VALUES ('satin-alma-irsaliyesi', 12, $1, 'reddedildi', 'ORN ret')", [an]);
    await s.niyetYaz(vt(), 'satin-alma-irsaliyesi', 13, an);
    await vt().sorgu("INSERT INTO logo_irsaliye_giden (belge_turu, belge_no, son_deneme, son_sonuc, logo_kayit_no) VALUES ('satin-alma-irsaliyesi', 14, $1, 'gonderildi', 'ORN-K')", [an]);
    for (const i of [11, 13, 14]) silinenler.add(i);
    await irsaliyeTuru(vt(), ortami());
    const kalan = (await vt().sorgu<{ belge_no: number }>('SELECT belge_no FROM logo_irsaliye_giden ORDER BY belge_no')).map((r) => r.belge_no);
    assert.deepEqual(kalan, [12, 13, 14]);
  });

  test('Risk S1: Logo\'da aynı cari ve irsaliye no\'lu ama başka mal kabule ait kayıt varsa eşlenmez, yazılmaz, elle bakıma düşer', async () => {
    olcumAyarla();
    await ayar('logo.baglanti', true);
    await ayar('logo.satin-alma-irsaliyesi', true);
    kuyruk = [{ tur: 'satin-alma-irsaliyesi', id: 3, belge: kabul({ no: 'MK-ORN-3', irsaliyeNo: 'ORN-IRS-9' }) }];
    aramaCevabi = [bulgu({ logoKayitNo: 91, no: '0000000000000300', belgeNo: 'ORN-IRS-9', cariKodu: 'ORN-CARI', aciklama: 'MK-ORN-2 ilk parti' })];
    await irsaliyeTuru(vt(), ortami());
    assert.deepEqual(await irsaliyeTuru(vt(), ortami()), { tur: 'irsaliye', no: 3, belge: 'satin-alma-irsaliyesi', sonuc: 'reddedildi' });
    assert.equal(eklemeler.length, 0);
    const g = await s.gidenSatiri(vt(), 'satin-alma-irsaliyesi', 3);
    assert.equal(g?.logoKayitNo, null, 'başka kaydın Logo kaydına bağlanmaz');
    assert.match(g?.sonHata ?? '', /elle bakın/);
  });
});
