import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Arac, BugunIsi, Kontrol, Talep } from '#paylasilan/sozlesme/idari-isler.ts';
import type { YemekBildirVerisi } from '#paylasilan/sozlesme/idari-isler.ts';
import {
  KM_GERI, aracBugundeMi, aracUyarilari, kmReddi, plakaBicimle,
  HESAP_DEGISTI, NEDEN_GEREK, SAYI_EKSI, YEMEK_GECMIS, YEMEK_ILERI, yemekBildirimReddi, yemekKadrosu, yemekSayisi,
  ATIK_MIKTARI, MIKTAR_ARTI, SONRAKI_GEREK, SONRAKI_ONCE, YALNIZ_ATIK_MIKTARI, YAPILMA_GELECEK, bugundeMi, bugunSirasi, gecisHedefi, gecisReddi,
  geriCekmeReddi, kontrolGrubu, senden, sonDurumMu, talepNo, tarihEkle, yapildiSonucu,
} from './kurallar.ts';
import {
  CIKIS_KM_GERI, DONUS_KM_GERI, DONUS_ONCE, GOREV_TARIH_GECMIS, GOREV_TARIH_ILERI, GOREV_UZUN, aracVerilemezMi, cikisKmReddi, donusKmReddi,
  gorevGecisReddi, gorevHedefi, gorevTarihReddi,
} from './kurallar.ts';
import { MASRAF_GELECEK, TUTAR_GECERSIZ, masrafReddi } from './kurallar.ts';
import {
  DEGER_GECERSIZ, HURDA_SON, IADE_GELECEK, IADE_ONCE, VERILIS_GELECEK, ZIMMETLENEMEZ, ZIMMETLI_ELLE, degerReddi, demirbasNo, elleDurumReddi, iadeReddi,
  iadeSonrasiDurum, zimmetlemeReddi,
} from './kurallar.ts';

const kontrol = (degisen: Partial<Kontrol>): Kontrol => ({
  id: 1, ad: 'Yangın tüpleri', tur: 'yasal', siklikDeger: 6, siklikBirim: 'ay', sonrakiTarih: '2026-10-22', grup: 'yakin', kalanGun: 3,
  firmaId: null, firmaAd: null, aciklama: null, aktif: true, surum: 1, ...degisen,
});
const arac = (degisen: Partial<Arac>): Arac => ({
  id: 1, plaka: '34 DNM 101', tur: 'binek', markaModel: null, sahiplik: 'sirket', durum: 'musait', km: 1000, sonrakiBakimKm: null,
  muayeneTarihi: null, sigortaTarihi: null, sevkiyatta: false, aciklama: null, uyarilar: [], surum: 1, ...degisen,
});
const talep = (degisen: Partial<Talep>): Talep => ({
  id: 1, no: 'TT-2026-001', kategori: 'elektrik', yer: 'Salon 1', aciklama: null, aciliyet: 'normal', durum: 'yeni',
  acanKisiId: 7, acanAd: 'Deneme', acilma: '2026-10-19T08:00:00.000+03:00', ustlenenKisiId: null, ustlenenAd: null, ustlenme: null,
  kapatanAd: null, kapanma: null, sonucNotu: null, surum: 1, ...degisen,
});

describe('idari-isler kuralları', () => {
  test('IDR-08: talep numarası yıl ve en az üç haneli sıradır', () => {
    assert.equal(talepNo(2026, 1), 'TT-2026-001');
    assert.equal(talepNo(2026, 1234), 'TT-2026-1234');
  });

  test('IDR-02: izinli geçişler hedef durumu verir; son durumdan geçiş yoktur', () => {
    assert.equal(gecisReddi('yeni', 'ustlen'), null);
    assert.equal(gecisHedefi('ustlen'), 'yapiliyor');
    assert.equal(gecisReddi('yapiliyor', 'birak'), null);
    assert.equal(gecisHedefi('birak'), 'yeni');
    for (const d of ['yeni', 'yapiliyor'] as const) {
      assert.equal(gecisReddi(d, 'kapat'), null);
      assert.equal(gecisReddi(d, 'reddet'), null);
    }
    assert.equal(gecisReddi('yapiliyor', 'ustlen'), 'Yapılan talep üstlenilemez.');
    assert.equal(gecisReddi('yeni', 'birak'), 'Yeni talep bırakılamaz.');
    assert.equal(gecisReddi('yapiliyor', 'geri-cek'), 'Yapılan talep geri çekilemez.');
    for (const d of ['kapandi', 'reddedildi', 'geri_cekildi'] as const) {
      assert.equal(sonDurumMu(d), true);
      for (const k of ['ustlen', 'birak', 'kapat', 'reddet', 'geri-cek'] as const) assert.notEqual(gecisReddi(d, k), null);
    }
    assert.equal(sonDurumMu('yeni'), false);
  });

  test('IDR-03: geri çekmeyi yalnız açan yapar', () => {
    assert.equal(geriCekmeReddi(7, 7), null);
    assert.match(geriCekmeReddi(7, 8) ?? '', /yalnız açan/);
  });

  test('IDR-09: Bugün sırası acil talep, geçen kontrol, yeni, yapılan, yaklaşan kontrol; grupta eski önce', () => {
    const t = (x: Partial<Talep>): BugunIsi => ({ tur: 'talep', talep: talep(x) });
    const k = (x: Partial<Kontrol>): BugunIsi => ({ tur: 'kontrol', kontrol: kontrol(x) });
    const a = (x: Partial<Arac>): BugunIsi => ({ tur: 'arac', arac: arac(x) });
    const liste = [
      k({ id: 20, kalanGun: 2, sonrakiTarih: '2026-10-21' }),
      t({ id: 1, durum: 'yapiliyor', ustlenenKisiId: 3, acilma: '2026-10-19T07:00:00.000+03:00' }),
      t({ id: 2, acilma: '2026-10-19T09:00:00.000+03:00' }),
      k({ id: 21, kalanGun: -1, sonrakiTarih: '2026-10-18' }),
      t({ id: 3, aciliyet: 'acil', acilma: '2026-10-19T10:00:00.000+03:00' }),
      t({ id: 4, acilma: '2026-10-19T08:00:00.000+03:00' }),
      a({ id: 30, muayeneTarihi: '2026-10-17', uyarilar: [{ tur: 'muayene', gecti: true, kalanGun: -2, kalanKm: null }] }),
      a({ id: 31, uyarilar: [{ tur: 'bakim', gecti: false, kalanKm: 200, kalanGun: null }] }),
      a({ id: 32, sigortaTarihi: '2026-10-20', uyarilar: [{ tur: 'sigorta', gecti: false, kalanGun: 1, kalanKm: null }] }),
    ].sort(bugunSirasi);
    const ad = (i: BugunIsi) => (i.tur === 'talep' ? `t${i.talep.id}` : i.tur === 'kontrol' ? `k${i.kontrol.id}` : `a${i.arac.id}`);
    assert.deepEqual(liste.map(ad), ['t3', 'a30', 'k21', 't4', 't2', 't1', 'a32', 'k20', 'a31']);
  });

  test('IDR-11: sonraki tarih sıklıktan; ay sonu taşmaz, artık yıl', () => {
    assert.equal(tarihEkle('2026-10-19', 14, 'gun'), '2026-11-02');
    assert.equal(tarihEkle('2026-10-19', 2, 'hafta'), '2026-11-02');
    assert.equal(tarihEkle('2026-01-31', 1, 'ay'), '2026-02-28');
    assert.equal(tarihEkle('2028-01-31', 1, 'ay'), '2028-02-29');
    assert.equal(tarihEkle('2026-10-19', 6, 'ay'), '2027-04-19');
    assert.equal(tarihEkle('2028-02-29', 1, 'yil'), '2029-02-28');
    assert.equal(tarihEkle('2026-12-31', 1, 'gun'), '2027-01-01');
  });

  test('IDR-12: süresi geçti, 30 gün içinde, daha sonra', () => {
    assert.equal(kontrolGrubu(-1), 'gecti');
    assert.equal(kontrolGrubu(0), 'yakin');
    assert.equal(kontrolGrubu(30), 'yakin');
    assert.equal(kontrolGrubu(31), 'sonra');
  });

  test('IDR-14: Bugün\'e süresi geçen ve 7 gün içindeki kalem düşer', () => {
    assert.equal(bugundeMi(-40), true);
    assert.equal(bugundeMi(7), true);
    assert.equal(bugundeMi(8), false);
  });

  test('IDR-13: yapıldı kaydı denetimi ve sonraki tarih', () => {
    const yasal = { tur: 'yasal' as const, siklikDeger: 6, siklikBirim: 'ay' as const };
    const atik = { tur: 'atik' as const, siklikDeger: 2, siklikBirim: 'hafta' as const };
    const sozlesme = { tur: 'sozlesme' as const, siklikDeger: null, siklikBirim: null };
    const g = { yapilma: '2026-10-19', sonrakiTarih: null, miktar: null, birim: null };
    const bugun = '2026-10-19';
    assert.deepEqual(yapildiSonucu(yasal, g, bugun), { sonraki: '2027-04-19' });
    assert.deepEqual(yapildiSonucu(yasal, { ...g, sonrakiTarih: '2027-01-01' }, bugun), { sonraki: '2027-01-01' });
    assert.deepEqual(yapildiSonucu(yasal, { ...g, yapilma: '2026-10-20' }, bugun), { ileti: YAPILMA_GELECEK, alan: 'yapilma' });
    assert.deepEqual(yapildiSonucu(yasal, { ...g, miktar: '5', birim: 'kg' }, bugun), { ileti: YALNIZ_ATIK_MIKTARI, alan: 'miktar' });
    assert.deepEqual(yapildiSonucu(atik, g, bugun), { ileti: ATIK_MIKTARI, alan: 'miktar' });
    assert.deepEqual(yapildiSonucu(atik, { ...g, miktar: '5' }, bugun), { ileti: ATIK_MIKTARI, alan: 'birim' });
    assert.deepEqual(yapildiSonucu(atik, { ...g, miktar: '0', birim: 'kg' }, bugun), { ileti: MIKTAR_ARTI, alan: 'miktar' });
    assert.deepEqual(yapildiSonucu(atik, { ...g, miktar: '120.5', birim: 'kg' }, bugun), { sonraki: '2026-11-02' });
    assert.deepEqual(yapildiSonucu(sozlesme, g, bugun), { ileti: SONRAKI_GEREK, alan: 'sonrakiTarih' });
    assert.deepEqual(yapildiSonucu(sozlesme, { ...g, sonrakiTarih: '2026-10-19' }, bugun), { ileti: SONRAKI_ONCE, alan: 'sonrakiTarih' });
    assert.deepEqual(yapildiSonucu(sozlesme, { ...g, sonrakiTarih: '2027-10-31' }, bugun), { sonraki: '2027-10-31' });
  });

  test('IDR-10: kişiden beklenen yeni talepler ve kendi üstlendikleri; başkasının üstlendiği değil', () => {
    assert.equal(senden(talep({}), 3), true);
    assert.equal(senden(talep({ durum: 'yapiliyor', ustlenenKisiId: 3 }), 3), true);
    assert.equal(senden(talep({ durum: 'yapiliyor', ustlenenKisiId: 4 }), 3), false);
    assert.equal(senden(talep({ durum: 'kapandi' }), 3), false);
  });

  const yemek = (degisen: Partial<YemekBildirVerisi> = {}): YemekBildirVerisi => ({
    tarih: '2026-10-19', kadro: 86, izinli: 7, fazlaMesai: 4, ziyaretci: 3, duzeltme: 0, duzeltmeNedeni: null, ...degisen,
  });

  test('IDR-16: sayı kadro - izinli + fazla mesai + ziyaretçi + düzeltme', () => {
    assert.equal(yemekSayisi(yemek({ duzeltme: 2 })), 88);
    assert.equal(yemekSayisi(yemek({ duzeltme: -5 })), 81);
  });

  test('IDR-17: geçmiş ve 7 günden ileri gün, gerekçesiz düzeltme, değişen hesap ve eksi sayı reddedilir', () => {
    const hesap = { kadro: 86, izinli: 7, fazlaMesai: 4 };
    assert.equal(yemekBildirimReddi(yemek(), hesap, '2026-10-19'), null);
    assert.equal(yemekBildirimReddi(yemek({ tarih: '2026-10-26' }), hesap, '2026-10-19'), null);
    assert.equal(yemekBildirimReddi(yemek({ tarih: '2026-10-18' }), hesap, '2026-10-19')?.ileti, YEMEK_GECMIS);
    assert.equal(yemekBildirimReddi(yemek({ tarih: '2026-10-27' }), hesap, '2026-10-19')?.ileti, YEMEK_ILERI);
    assert.deepEqual(yemekBildirimReddi(yemek({ duzeltme: 2 }), hesap, '2026-10-19'), { ileti: NEDEN_GEREK, alan: 'duzeltmeNedeni' });
    assert.equal(yemekBildirimReddi(yemek({ duzeltme: 2, duzeltmeNedeni: 'Eğitmen' }), hesap, '2026-10-19'), null);
    assert.equal(yemekBildirimReddi(yemek(), { ...hesap, izinli: 8 }, '2026-10-19')?.ileti, HESAP_DEGISTI);
    assert.equal(yemekBildirimReddi(yemek(), { ...hesap, kadro: 85 }, '2026-10-19')?.ileti, HESAP_DEGISTI);
    assert.equal(yemekBildirimReddi(yemek(), { ...hesap, fazlaMesai: 5 }, '2026-10-19')?.ileti, HESAP_DEGISTI);
    const bos = { kadro: 0, izinli: 0, fazlaMesai: 0 };
    assert.equal(yemekBildirimReddi(yemek({ ...bos, fazlaMesai: 0, ziyaretci: 0, duzeltme: -1, duzeltmeNedeni: 'X' }), bos, '2026-10-19')?.ileti, SAYI_EKSI);
  });

  test('IDR-18: kadro o gün çalışan tekil kişilerdir; izinli yalnız kadrodakilerden; fazla mesai tekil ve izinde olmayan', () => {
    assert.deepEqual(yemekKadrosu([1, 2, 3, 3], [2, 9]), { kadro: 3, izinli: 1, fazlaMesai: 0 });
    assert.deepEqual(yemekKadrosu([], [2]), { kadro: 0, izinli: 0, fazlaMesai: 0 });
    assert.deepEqual(yemekKadrosu([1, 2], [2, 9], [1, 1, 5, 9]), { kadro: 2, izinli: 1, fazlaMesai: 2 });
  });

  test('IDR-19: muayene ve sigorta 30 gün içinde ya da geçmişse, bakıma 1000 km kaldıysa uyarı; pasif araçta uyarı yok', () => {
    const oz = { durum: 'musait' as const, km: 59_200, sonrakiBakimKm: 60_000, muayeneTarihi: '2026-11-18', sigortaTarihi: '2026-10-10' };
    assert.deepEqual(aracUyarilari(oz, '2026-10-19'), [
      { tur: 'muayene', gecti: false, kalanGun: 30, kalanKm: null },
      { tur: 'sigorta', gecti: true, kalanGun: -9, kalanKm: null },
      { tur: 'bakim', gecti: false, kalanGun: null, kalanKm: 800 },
    ]);
    assert.deepEqual(aracUyarilari({ ...oz, muayeneTarihi: '2026-11-19', sigortaTarihi: null, km: 58_999 }, '2026-10-19'), []);
    assert.deepEqual(aracUyarilari({ ...oz, km: 60_001, muayeneTarihi: null, sigortaTarihi: null }, '2026-10-19'),
      [{ tur: 'bakim', gecti: true, kalanGun: null, kalanKm: -1 }]);
    assert.deepEqual(aracUyarilari({ ...oz, durum: 'pasif' }, '2026-10-19'), []);
  });

  test('IDR-20: plaka "34 ABC 123" biçimine çevrilir; il kodu 01-81', () => {
    assert.equal(plakaBicimle('34abc123'), '34 ABC 123');
    assert.equal(plakaBicimle(' 06 a 1234 '), '06 A 1234');
    assert.equal(plakaBicimle('81-ZZ-99'), '81 ZZ 99');
    assert.equal(plakaBicimle('00 AB 123'), null);
    assert.equal(plakaBicimle('82 AB 123'), null);
    assert.equal(plakaBicimle('34 ABCD 12'), null);
    assert.equal(plakaBicimle('34 AB 1'), null);
  });

  test('IDR-21: km geriye yazılmaz', () => {
    assert.equal(kmReddi(1000, 999), KM_GERI);
    assert.equal(kmReddi(1000, 1000), null);
    assert.equal(kmReddi(null, 5), null);
    assert.equal(kmReddi(1000, null), null);
  });

  test('IDR-22: Bugün\'e geçmiş ya da 7 gün içindeki tarih ve geçmiş km uyarısı düşer', () => {
    assert.equal(aracBugundeMi([{ tur: 'muayene', gecti: false, kalanGun: 7, kalanKm: null }]), true);
    assert.equal(aracBugundeMi([{ tur: 'muayene', gecti: false, kalanGun: 8, kalanKm: null }]), false);
    assert.equal(aracBugundeMi([{ tur: 'bakim', gecti: false, kalanGun: null, kalanKm: 10 }]), false);
    assert.equal(aracBugundeMi([{ tur: 'bakim', gecti: true, kalanGun: null, kalanKm: -10 }]), true);
  });

  test('IDR-23: görev geçişleri; onaylı görev reddedilir ve geri çekilir, yoldaki yalnız dönüşle kapanır', () => {
    assert.equal(gorevGecisReddi('bekliyor', 'onayla'), null);
    assert.equal(gorevHedefi('onayla'), 'onaylandi');
    assert.equal(gorevGecisReddi('onaylandi', 'reddet'), null);
    assert.equal(gorevGecisReddi('onaylandi', 'geri-cek'), null);
    assert.equal(gorevGecisReddi('onaylandi', 'cikis'), null);
    assert.equal(gorevGecisReddi('yolda', 'donus'), null);
    assert.equal(gorevGecisReddi('bekliyor', 'cikis'), 'Bekleyen görev çıkışı yazılamaz.');
    assert.equal(gorevGecisReddi('yolda', 'reddet'), 'Yoldaki görev reddedilemez.');
    assert.equal(gorevGecisReddi('yolda', 'geri-cek'), 'Yoldaki görev geri çekilemez.');
    assert.equal(gorevGecisReddi('tamamlandi', 'donus'), 'Tamamlanmış görev dönüşü yazılamaz.');
  });

  test('IDR-24: bugün ile 60 gün sonrası arasında açılır; dönüş önce olmaz; en çok 30 gün sürer', () => {
    const b = '2026-10-19';
    assert.equal(gorevTarihReddi({ tarih: b, donusTarihi: b }, b), null);
    assert.equal(gorevTarihReddi({ tarih: '2026-10-18', donusTarihi: b }, b)?.ileti, GOREV_TARIH_GECMIS);
    assert.equal(gorevTarihReddi({ tarih: '2026-12-18', donusTarihi: '2026-12-18' }, b), null);
    assert.equal(gorevTarihReddi({ tarih: '2026-12-19', donusTarihi: '2026-12-19' }, b)?.ileti, GOREV_TARIH_ILERI);
    assert.deepEqual(gorevTarihReddi({ tarih: '2026-10-21', donusTarihi: '2026-10-20' }, b), { ileti: DONUS_ONCE, alan: 'donusTarihi' });
    assert.equal(gorevTarihReddi({ tarih: b, donusTarihi: '2026-11-18' }, b), null);
    assert.equal(gorevTarihReddi({ tarih: b, donusTarihi: '2026-11-19' }, b)?.ileti, GOREV_UZUN);
  });

  test('IDR-25: pasif ve serviste araç verilmez', () => {
    assert.equal(aracVerilemezMi('pasif'), true);
    assert.equal(aracVerilemezMi('serviste'), true);
    assert.equal(aracVerilemezMi('musait'), false);
    assert.equal(aracVerilemezMi('gorevde'), false);
  });

  test('IDR-26: çıkış km aracın km\'sinden, dönüş km çıkıştan küçük olmaz', () => {
    assert.equal(cikisKmReddi(1000, 999), CIKIS_KM_GERI);
    assert.equal(cikisKmReddi(1000, 1000), null);
    assert.equal(cikisKmReddi(null, 0), null);
    assert.equal(donusKmReddi(1000, 999), DONUS_KM_GERI);
    assert.equal(donusKmReddi(1000, 1000), null);
  });

  test('IDR-27: tutar sıfırdan büyük, en çok iki kuruş basamaklı ve sınır içinde; tarih bugünden ileri değil', () => {
    const b = '2026-10-19';
    assert.equal(masrafReddi({ tutar: '1250.50', tarih: b }, b), null);
    assert.equal(masrafReddi({ tutar: '0.01', tarih: '2025-01-01' }, b), null);
    assert.equal(masrafReddi({ tutar: '9999999999.99', tarih: b }, b), null);
    assert.deepEqual(masrafReddi({ tutar: '10', tarih: '2026-10-20' }, b), { ileti: MASRAF_GELECEK, alan: 'tarih' });
    for (const tutar of ['0', '0.00', '-5', '1.234', '10000000000']) {
      assert.deepEqual(masrafReddi({ tutar, tarih: b }, b), { ileti: TUTAR_GECERSIZ, alan: 'tutar' }, tutar);
    }
  });

  test('IDR-29: değer yoksa null; varsa sıfırdan büyük, en çok iki kuruş basamaklı; numara DB-00001 biçiminde', () => {
    assert.equal(degerReddi(null), null);
    assert.equal(degerReddi('30000'), null);
    assert.equal(degerReddi('999999999999.99'), null);
    for (const d of ['0', '-1', '1.234', '1000000000000']) assert.equal(degerReddi(d), DEGER_GECERSIZ, d);
    assert.equal(demirbasNo(7), 'DB-00007');
    assert.equal(demirbasNo(123456), 'DB-123456');
  });

  test('IDR-30: zimmetli elle değişmez, hurda son durum; yalnız boştaki demirbaş, ileri olmayan tarihle zimmetlenir', () => {
    assert.equal(elleDurumReddi('zimmetli', 'bosta'), ZIMMETLI_ELLE);
    assert.equal(elleDurumReddi('hurda', 'bosta'), HURDA_SON);
    assert.equal(elleDurumReddi('hurda', 'hurda'), null);
    assert.equal(elleDurumReddi('bakimda', 'bosta'), null);
    const b = '2026-10-19';
    assert.equal(zimmetlemeReddi('bosta', b, b), null);
    assert.equal(zimmetlemeReddi('bakimda', b, b)?.ileti, ZIMMETLENEMEZ);
    assert.equal(zimmetlemeReddi('zimmetli', b, b)?.ileti, ZIMMETLENEMEZ);
    assert.deepEqual(zimmetlemeReddi('bosta', '2026-10-20', b), { ileti: VERILIS_GELECEK, alan: 'verilis' });
  });

  test('IDR-31: iade ileri ve verilişten önce olmaz; sağlam boşa, hasarlı bakıma, kayıp kayba', () => {
    const b = '2026-10-19';
    assert.equal(iadeReddi('2026-10-01', b, b), null);
    assert.equal(iadeReddi(null, '2020-01-01', b), null);
    assert.equal(iadeReddi('2026-10-01', '2026-10-20', b), IADE_GELECEK);
    assert.equal(iadeReddi('2026-10-02', '2026-10-01', b), IADE_ONCE);
    assert.equal(iadeSonrasiDurum('saglam'), 'bosta');
    assert.equal(iadeSonrasiDurum('hasarli'), 'bakimda');
    assert.equal(iadeSonrasiDurum('kayip'), 'kayip');
  });
});
