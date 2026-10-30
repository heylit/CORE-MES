import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  kartBilesenKimlikleri, kartHizmetYonu, katalogAnahtarZorunluMu, katalogGecisiDenetle, katalogIcerigiDegistiMi, katalogIptalEdilirMi, katalogKodDegisebilirMi, katalogKodOneki,
  katalogOnayAkisiAcikMi, katalogOnayiBas, katalogOnekiTureUyarMi, katalogRolu, katalogStokKodu, katalogSurumUyarMi, katalogTalebiBas,
  katalogTalepDenetle, katalogKaydiAlanlari, katalogFirmaKoduGecerliMi, katalogGecmisiDenetle, katalogGecmisiniBas, katalogIptalYetkiliMi, katalogFarki, katalogTalepUygulamaDenetle,
  katalogAgirlikAlanlari, katalogNetAgirlikKg, katalogGkkAyari, GKK_TURU_ILETISI, hammaddeOlcuHatasi, LOGO_HATA_EN_COK, logoAdiDegistiMi, logoKarsiligiHatasi, logoGuncellemeSonucuDurumu, logoBirimiDegistiMi, logoDurumSirasi, logoEksikleri, logoHataMetni,
} from './kurallar.ts';
import type { KatalogGecisi } from './kurallar.ts';

/* ---------------- Malzeme Kataloğu (prototip) kartları ---------------- */

test('MKK-2b (kart #230): kod ve tür yalnız hiç aktif olmamış taslakta değişir', () => {
  assert.equal(katalogKodDegisebilirMi('taslak', false), true);
  assert.equal(katalogKodDegisebilirMi('taslak', true), false, 'bir kez aktif ya da pasif olmuş kart taslağa dönse de kilitli');
  for (const durum of ['onayda', 'aktif', 'pasif', 'iptal'] as const) {
    assert.equal(katalogKodDegisebilirMi(durum, false), false, durum);
    assert.equal(katalogKodDegisebilirMi(durum, true), false, durum);
  }
});

test('MKK-1: stok kodu öneki prototipin kodundan alınır; sırasız ya da biçimsiz kodda önek yok', () => {
  assert.equal(katalogKodOneki('HM-PAS-00012'), 'HM-PAS-');
  assert.equal(katalogKodOneki('ym-trx-7'), 'YM-TRX-');
  assert.equal(katalogKodOneki('HM-PAS-'), null);
  assert.equal(katalogKodOneki('ÖZEL KOD'), null);
  assert.equal(katalogKodOneki(null), null);
});

test('MKK-2: stok kodu beş haneye doldurulur, 99999 sonrası kesilmez', () => {
  assert.equal(katalogStokKodu('HM-PAS-', 7), 'HM-PAS-00007');
  assert.equal(katalogStokKodu('HM-PAS-', 123456), 'HM-PAS-123456');
});

const gecis = (g: Partial<KatalogGecisi>): KatalogGecisi => ({
  onceki: null, yeni: 'taslak', islemler: ['malzemeler.yaz'], kisiId: 1, acanKisiId: null, gonderenKisiId: null, dortGozAcik: true, onayAkisiAcik: true,
  icerikDegisti: false, onaysizIcerikDegisti: false, ...g,
});

test('MKK-3: onay akışı açıkken kart ancak onay yetkisiyle aktif olur; akış kapalıyken yazma yetkisi yeter', () => {
  assert.equal(katalogGecisiDenetle(gecis({ yeni: 'aktif' }))?.kod, 'YETKI_YOK');
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'onayda', yeni: 'aktif', islemler: ['malzemeler.yaz', 'malzemeler.onayla'] })), null);
  assert.equal(katalogGecisiDenetle(gecis({ yeni: 'aktif', onayAkisiAcik: false })), null);
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'taslak', yeni: 'onayda' })), null);
});

test('MKK-4: dört göz açıkken onaya gönderen kişi onaylayamaz; ayar kapalıyken onaylar', () => {
  const onayci = ['malzemeler.yaz', 'malzemeler.onayla'];
  assert.match(katalogGecisiDenetle(gecis({ onceki: 'onayda', yeni: 'aktif', islemler: onayci, kisiId: 5, gonderenKisiId: 5 }))?.mesaj ?? '', /onaylayamazsın/);
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'onayda', yeni: 'aktif', islemler: onayci, kisiId: 6, gonderenKisiId: 5 })), null);
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'onayda', yeni: 'aktif', islemler: onayci, kisiId: 5, gonderenKisiId: 5, dortGozAcik: false })), null);
});

test('MKK-5: pasife alma ve pasiften çıkarma onay yetkisi ister; iptal kart değişmez', () => {
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'aktif', yeni: 'pasif' }))?.kod, 'YETKI_YOK');
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'pasif', yeni: 'aktif', onayAkisiAcik: false }))?.kod, 'YETKI_YOK');
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'aktif', yeni: 'pasif', islemler: ['malzemeler.onayla'] })), null);
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'aktif', yeni: 'aktif' })), null, 'içerik değişmediyse yazma yetkisi yeter');
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'iptal', yeni: 'taslak' }))?.kod, 'GECERSIZ');
});

test('MKK-6, MKK-7: yalnız taslak iptal edilir; sürüm okunanla aynı olmalı', () => {
  assert.equal(katalogIptalEdilirMi('taslak'), true);
  assert.equal(katalogIptalEdilirMi('aktif'), false);
  assert.equal(katalogSurumUyarMi(3, 3), true);
  assert.equal(katalogSurumUyarMi(3, 2), false);
  assert.equal(katalogSurumUyarMi(3, null), false);
});

test('MKK-8, MKK-9: rol TMI işlemlerinden türer; onay akışı ayarı yoksa açıktır', () => {
  assert.equal(katalogRolu(['malzemeler.yaz', 'malzemeler.onayla', 'malzemeler.tanim-yaz']), 'yonetici');
  assert.equal(katalogRolu(['malzemeler.onayla']), 'sorumlu');
  assert.equal(katalogRolu(['malzemeler.yaz']), 'talep');
  assert.equal(katalogRolu(['sayfa.malzemeler']), null);
  assert.equal(katalogOnayAkisiAcikMi(null), true);
  assert.equal(katalogOnayAkisiAcikMi({ onayAkisi: false }), false);
});

test('MKK-13 (kart #163): onay akışı açıkken aktif kartın içeriğini onay yetkisi olmayan değiştiremez; akış kapalıyken ve onaycı değiştirir', () => {
  const degisti = { onceki: 'aktif', yeni: 'aktif', icerikDegisti: true } as const;
  assert.equal(katalogGecisiDenetle(gecis(degisti))?.kod, 'YETKI_YOK');
  assert.equal(katalogGecisiDenetle(gecis({ ...degisti, islemler: ['malzemeler.onayla'] })), null);
  assert.equal(katalogGecisiDenetle(gecis({ ...degisti, onayAkisiAcik: false })), null);
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'aktif', yeni: 'onayda', icerikDegisti: true }))?.kod, 'YETKI_YOK', 'yazma yetkilisi aktif kartı onaya düşüremez');
});

test('MKK-12 (kart #163): aktif ya da onaydaki kartı taslağa çekmek onay yetkisi ister', () => {
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'aktif', yeni: 'taslak' }))?.kod, 'YETKI_YOK');
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'onayda', yeni: 'taslak' }))?.kod, 'YETKI_YOK');
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'onayda', yeni: 'taslak', islemler: ['malzemeler.onayla'] })), null);
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'taslak', yeni: 'taslak' })), null);
  assert.equal(katalogGecisiDenetle(gecis({ onceki: null, yeni: 'pasif', islemler: ['malzemeler.onayla'] }))?.kod, 'GECERSIZ');
});

test('MKK-4 (kart #163): onay akışı açıkken aktife yalnız onaydan geçilir; kartı açan da onaylayamaz; akış kapalıyken eskisi gibi', () => {
  const onayci = ['malzemeler.yaz', 'malzemeler.onayla'];
  for (const onceki of [null, 'taslak', 'pasif'] as const) {
    assert.equal(katalogGecisiDenetle(gecis({ onceki, yeni: 'aktif', islemler: onayci }))?.kod, 'GECERSIZ', String(onceki));
    assert.equal(katalogGecisiDenetle(gecis({ onceki, yeni: 'aktif', islemler: onayci, onayAkisiAcik: false }))?.kod === 'GECERSIZ', false);
  }
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'onayda', yeni: 'aktif', islemler: onayci, kisiId: 5, acanKisiId: 5, gonderenKisiId: 6 }))?.kod, 'YETKI_YOK');
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'onayda', yeni: 'aktif', islemler: onayci, kisiId: 5, acanKisiId: 5, gonderenKisiId: 6, dortGozAcik: false })), null);
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'onayda', yeni: 'aktif', islemler: onayci, kisiId: 7, acanKisiId: 5, gonderenKisiId: 6 })), null);
});

test('MKK-13 (kart #163): içerik karşılaştırması talep, geçmiş ve zaman damgasını ve stok kodunu saymaz', () => {
  const kayitli = { kayit: { id: 'a', com: { kod: 'HM-X-00001', ad: 'A' }, opts: { x: [1, 2] }, onay: { durum: 'aktif' } }, benzersizAnahtar: 'K', mukerrerGerekcesi: null, stokKodu: 'HM-X-00001' };
  const ayni = { kayit: { opts: { x: [1, 2] }, com: { ad: 'A', kod: 'BASKA' }, id: 'a', onay: { durum: 'aktif' }, talep: { durum: 'beklemede' }, rev: [1], updatedAt: 9 }, benzersizAnahtar: 'K', mukerrerGerekcesi: null };
  assert.equal(katalogIcerigiDegistiMi(kayitli, ayni), false);
  assert.equal(katalogIcerigiDegistiMi(kayitli, { ...ayni, benzersizAnahtar: 'L' }), true);
  assert.equal(katalogIcerigiDegistiMi(kayitli, { ...ayni, kayit: { ...ayni.kayit, opts: { x: [2, 1] } } }), true);
  assert.equal(katalogIcerigiDegistiMi(kayitli, { ...ayni, kayit: { ...ayni.kayit, onay: { durum: 'onayda' } } }), true);
  assert.equal(katalogIcerigiDegistiMi(kayitli, { ...ayni, kayit: { ...ayni.kayit, onay: { durum: 'onayda' } } }, false), false, 'onay adımı yalnız onayı değiştirir');
  assert.equal(katalogIcerigiDegistiMi(kayitli, { ...ayni, mukerrerGerekcesi: 'sonradan' }), true, 'gerekçe içeriktir');
});

test('MKK-14, MKK-1, MKK-10 (kart #163): tür, onay durumu ve kod karttan; önek-tür uyumu, anahtar zorunluluğu', () => {
  const kart = { tur: 'sarf', com: { kod: ' SF-GEN-00003 ' }, onay: { durum: 'aktif' } };
  assert.deepEqual(katalogKaydiAlanlari(kart, {}), { tur: 'sarf', onayDurumu: 'aktif', stokKodu: 'SF-GEN-00003', hizmetYonu: null });
  assert.deepEqual(katalogKaydiAlanlari(kart, { tur: 'sarf', onay_durumu: 'aktif', stok_kodu: 'SF-GEN-00003' }), { tur: 'sarf', onayDurumu: 'aktif', stokKodu: 'SF-GEN-00003', hizmetYonu: null });
  assert.deepEqual(katalogKaydiAlanlari({ onay: { durum: 'taslak' } }, { stok_kodu: null }), { tur: 'hammadde', onayDurumu: 'taslak', stokKodu: null, hizmetYonu: null }, 'tur yoksa ekran hammadde sayar');
  assert.deepEqual(katalogKaydiAlanlari({ tur: '', onay: { durum: 'taslak' } }, {}), { tur: 'hammadde', onayDurumu: 'taslak', stokKodu: null, hizmetYonu: null }, 'boş tür de hammadde (ekran `tur || hammadde`)');
  const alan = (kayit: Record<string, unknown>, ozet: Record<string, string>) => {
    const r = katalogKaydiAlanlari(kayit, ozet);
    return 'alan' in r ? r.alan : null;
  };
  assert.equal(alan({ ...kart, onay: undefined }, {}), 'kayit.onay.durum', 'onay yoksa ekran aktif sayar');
  assert.equal(alan({ ...kart, onay: 'aktif' }, {}), 'kayit.onay.durum');
  assert.equal(alan({ ...kart, onay: { durum: 'iptal' } }, {}), 'kayit.onay.durum', 'iptal yalnız iptal ucuyla');
  assert.equal(alan({ ...kart, tur: 'bilinmeyen' }, {}), 'kayit.tur');
  assert.equal(alan(kart, { tur: 'hammadde' }), 'kayit.tur');
  assert.equal(alan(kart, { onay_durumu: 'taslak' }), 'kayit.onay.durum');
  assert.equal(alan(kart, { stok_kodu: 'HM-GEN-00003' }), 'kayit.com.kod', 'önek özetten alınmaz');
  assert.equal(katalogOnekiTureUyarMi('HM-PAS-', 'hammadde'), true);
  assert.equal(katalogOnekiTureUyarMi('SF-GEN-', 'hammadde'), false);
  assert.equal(katalogOnekiTureUyarMi('ABC-', 'hammadde'), false, 'serbest önek (kart #230)');
  assert.deepEqual(['hammadde', 'sarf', 'mamul', 'yarimamul', 'demirbas'].map(katalogAnahtarZorunluMu), [true, true, false, false, false]);
});

test('MKK-12, MKK-13, MKK-4 (kart #163): aktif kartı onaya düşürmek, pasif kartı değiştirmek ve onay sırasında içerik değiştirmek', () => {
  const onayci = ['malzemeler.yaz', 'malzemeler.onayla'];
  for (const onayAkisiAcik of [true, false]) {
    assert.equal(katalogGecisiDenetle(gecis({ onceki: 'aktif', yeni: 'onayda', onayAkisiAcik, icerikDegisti: true }))?.kod, 'YETKI_YOK');
    assert.equal(katalogGecisiDenetle(gecis({ onceki: 'aktif', yeni: 'onayda', onayAkisiAcik, islemler: onayci })), null);
  }
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'pasif', yeni: 'pasif', icerikDegisti: true }))?.kod, 'YETKI_YOK');
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'pasif', yeni: 'pasif', icerikDegisti: true, islemler: onayci })), null);
  assert.equal(katalogGecisiDenetle(gecis({ onceki: 'pasif', yeni: 'pasif' })), null);
  const onaydan = { onceki: 'onayda', yeni: 'aktif', islemler: onayci, kisiId: 7, acanKisiId: 5, gonderenKisiId: 6 } as const;
  assert.equal(katalogGecisiDenetle(gecis({ ...onaydan, onaysizIcerikDegisti: true }))?.kod, 'YETKI_YOK');
  assert.equal(katalogGecisiDenetle(gecis({ ...onaydan, onaysizIcerikDegisti: true, dortGozAcik: false })), null);
  assert.equal(katalogGecisiDenetle(gecis({ ...onaydan })), null);
});

test('MKK-15 (kart #163): onay damgaları geçişte sunucudan, geçiş olmayan yazmada kayıtlıdan gelir', () => {
  const kim = { by: 3, byAd: 'Ayşe', t: 1_700_000_000_000 };
  const sahte = { by: 999, byAd: 'Sahte', t: 1 };
  const kayitli = { onay: { durum: 'onayda', talep: { by: 1, byAd: 'Veli', t: 5 }, onay: { by: 8, byAd: 'Eski', t: 6 } } };
  const onayla = katalogOnayiBas({ kayit: { onay: { durum: 'aktif', onay: sahte, talep: sahte } }, kayitli, onceki: 'onayda', yeni: 'aktif', gonderildi: false, talepOnaylandi: false, kim });
  assert.deepEqual(onayla['onay'], { durum: 'aktif', onay: kim, talep: kayitli.onay.talep });
  const reddet = katalogOnayiBas({ kayit: { onay: { durum: 'taslak', red: { ...sahte, neden: 'Ölçü' } } }, kayitli, onceki: 'onayda', yeni: 'taslak', gonderildi: false, talepOnaylandi: false, kim });
  assert.deepEqual((reddet['onay'] as Record<string, unknown>)['red'], { ...kim, neden: 'Ölçü' });
  const degismeyen = katalogOnayiBas({ kayit: { onay: { durum: 'onayda', talep: sahte, red: sahte } }, kayitli, onceki: 'onayda', yeni: 'onayda', gonderildi: false, talepOnaylandi: false, kim });
  assert.deepEqual(degismeyen['onay'], { durum: 'onayda', talep: kayitli.onay.talep, onay: kayitli.onay.onay });
  const icerikli = katalogOnayiBas({ kayit: { onay: { durum: 'onayda' } }, kayitli, onceki: 'onayda', yeni: 'onayda', gonderildi: true, talepOnaylandi: false, kim });
  assert.deepEqual((icerikli['onay'] as Record<string, unknown>)['talep'], kim);
});

test('MKK-15 (kart #163): talep damgası sunucudan; talebi yalnız sahibi ya da onaycı değiştirir; geçmiş yalnız sona eklenir', () => {
  const kim = { by: 3, byAd: 'Ayşe', t: 1_700_000_000_000 };
  const talep = { durum: 'beklemede', yeni: { a: 1 } };
  const { farkOzeti, ...basilan } = katalogTalebiBas({ talep: { ...talep, by: 9, t: 1, farkOzeti: 'sahte' } }, null, kim)['talep'] as Record<string, unknown>;
  assert.deepEqual(basilan, { ...talep, farklar: [{ f: 'a', a: '—', b: '1' }], ...kim });
  assert.match(String(farkOzeti), /^[0-9a-f]{64}$/);
  const kayitliTalep = { talep: { ...talep, by: 1, byAd: 'Veli', t: 5 } };
  assert.deepEqual(katalogTalebiBas({ talep: { ...talep, by: 9 } }, kayitliTalep, kim)['talep'], kayitliTalep.talep);
  assert.equal(katalogTalepDenetle(kayitliTalep, { talep: { ...talep } }, 1, false), null, 'sahibi aynı talebi gönderebilir');
  assert.equal(katalogTalepDenetle(kayitliTalep, {}, 1, false), null, 'sahibi kaldırabilir');
  assert.notEqual(katalogTalepDenetle(kayitliTalep, {}, 2, false), null);
  assert.notEqual(katalogTalepDenetle(kayitliTalep, { talep: { ...talep, yeni: { a: 2 } } }, 2, false), null);
  assert.equal(katalogTalepDenetle(kayitliTalep, {}, 2, true), null, 'onaycı kaldırabilir');
});

test('MKK-15 (kart #163): geçmiş sona tek kayıt eklenir, kayıtlı kayıtlar korunur, eklenenin kişisi sunucudan; pencere 30', () => {
  const kim = { by: 3, byAd: 'Ayşe', t: 1_700_000_000_000 };
  const r = (n: number, ek: Record<string, unknown> = {}) => ({ n, ...ek });
  const kayitli = { rev: [r(1, { by: 1, byAd: 'Veli', t: 5 }), r(2, { by: 2, byAd: 'Can', t: 6 })] };
  assert.equal(katalogGecmisiDenetle(kayitli, { rev: [r(1), r(2)] }), null, 'istemci kopyasında damga farklı olabilir');
  assert.equal(katalogGecmisiDenetle(kayitli, { rev: [r(1), r(2), r(3)] }), null);
  for (const rev of [undefined, [], [r(2)], [r(1), r(9), r(2)], [r(1), r(2), r(3), r(4)], [r(0), r(1), r(2)], 'x']) {
    assert.equal(katalogGecmisiDenetle(kayitli, { rev })?.kod, 'YETKI_YOK', JSON.stringify(rev));
  }
  const bas = katalogGecmisiniBas(kayitli, { rev: [r(1, { by: 9 }), r(2), r(3, { by: 999, byAd: 'Sahte', t: 1 })] }, kim)['rev'];
  assert.deepEqual(bas, [...kayitli.rev, r(3, kim)]);
  const otuz = Array.from({ length: 30 }, (_, i) => r(i + 1));
  assert.equal(katalogGecmisiDenetle({ rev: otuz }, { rev: [...otuz.slice(1), r(31)] }), null);
  assert.equal(katalogGecmisiDenetle({ rev: otuz }, { rev: [...otuz.slice(2), r(31), r(32)] })?.kod, 'YETKI_YOK');
  assert.equal(katalogGecmisiDenetle({ rev: otuz }, { rev: [...otuz, r(31)] })?.kod, 'YETKI_YOK', 'pencere dışına taşan uzunluk');
  assert.equal(katalogGecmisiDenetle(null, { rev: [r(1)] }), null);
  assert.equal(katalogGecmisiDenetle(null, {}), null);
  assert.equal(katalogGecmisiDenetle(null, { rev: [r(1), r(2)] })?.kod, 'DOGRULAMA');
  assert.equal(katalogGecmisiDenetle(null, { rev: 'x' })?.kod, 'DOGRULAMA');
});

test('MKK-6 (kart #163): iptal: onay yetkilisi her taslağı, yetkisiz yalnız kendi açtığı hiç onaylanmamış taslağı iptal eder', () => {
  const g = { islemler: ['malzemeler.yaz'], kisiId: 1, acanKisiId: 1, kayit: { onay: { durum: 'taslak' } } };
  assert.equal(katalogIptalYetkiliMi(g), true);
  assert.equal(katalogIptalYetkiliMi({ ...g, acanKisiId: 2 }), false);
  assert.equal(katalogIptalYetkiliMi({ ...g, kayit: { onay: { durum: 'taslak', onay: { by: 4 } } } }), false);
  assert.equal(katalogIptalYetkiliMi({ ...g, acanKisiId: 2, islemler: ['malzemeler.onayla'] }), true);
});

test('Kart #226: fark ham alan yoluyla, sunucuda hesaplanır; talep, geçmiş, damga ve stok kodu sayılmaz; taşan satırlar adıyla anılır', () => {
  const taban = { id: 'k', fam: 'metal', opts: { koruma: ['a'] }, com: { kod: 'HM-XXX-00001', ad: 'Ad' }, onay: { durum: 'aktif' }, rev: [1], updatedAt: 1, talep: { x: 1 } };
  assert.deepEqual(katalogFarki(taban, { ...taban, com: { kod: 'başka', ad: 'Ad' }, onay: { durum: 'x' }, rev: [], updatedAt: 2, talep: undefined }), []);
  assert.deepEqual(katalogFarki(taban, { ...taban, fam: 'plastik', opts: { koruma: ['a', 'b'] }, com: { kod: 'HM-XXX-00001', ad: 'Ad', not: 'n' } }), [
    { f: 'com.not', a: '—', b: 'n' }, { f: 'fam', a: 'metal', b: 'plastik' }, { f: 'opts.koruma', a: '["a"]', b: '["a","b"]' },
  ]);
  const cok = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['k' + String(i).padStart(2, '0'), i]));
  const fark = katalogFarki({ id: 'k' }, { id: 'k', ...cok });
  assert.equal(fark.length, 30);
  assert.deepEqual(fark[29]?.f, 'Diğer 11 alan');
  assert.ok(fark[29]?.b.includes('k39') && fark[29]?.b.includes('k29') && !fark[29]?.b.includes('k28'));
});

test('Kart #226: 30 satırı aşan farkta taşan alanların eski ve yeni değeri de son satırdadır (onaycı görmeden onay vermez)', () => {
  const taban = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['k' + String(i).padStart(2, '0'), 'eski' + i]));
  const oneri = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['k' + String(i).padStart(2, '0'), 'yeni' + i]));
  const son = katalogFarki({ id: 'k', ...taban }, { id: 'k', ...oneri })[29];
  assert.equal(son?.f, 'Diğer 11 alan');
  for (let i = 29; i < 40; i++) {
    assert.ok(son?.a.includes(`k${i}: eski${i}`), `k${i} eski değeri yok: ${son?.a}`);
    assert.ok(son?.b.includes(`k${i}: yeni${i}`), `k${i} yeni değeri yok: ${son?.b}`);
  }
  const eklenen = katalogFarki({ id: 'k' }, { id: 'k', ...oneri })[29];
  assert.ok(eklenen?.a.includes('k39: —') && eklenen.b.includes('k39: yeni39'), JSON.stringify(eklenen));
});

test('Kart #226: onaycının gördüğü kayıtlı fark bugünkü farktan farklıysa (değersiz eski biçim) talep uygulanmaz, güncelse uygulanır', () => {
  const ic = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['k' + String(i).padStart(2, '0'), i]));
  const talepli = katalogTalebiBas({ id: 'k', talep: { yeni: { id: 'k', ...ic } } }, null, { by: 1, byAd: 'Veli', t: 5 });
  assert.equal(katalogTalepUygulamaDenetle(talepli, { id: 'k', ...ic }), null);
  const t = talepli['talep'] as { farklar: { f: string; a: string; b: string }[] };
  const adlarla = [...t.farklar.slice(0, 29), { f: 'Diğer 11 alan', a: '—', b: 'k29, k30, k31, k32, k33, k34, k35, k36, k37, k38, k39' }];
  assert.equal(katalogTalepUygulamaDenetle({ ...talepli, talep: { ...t, farklar: adlarla } }, { id: 'k', ...ic })?.kod, 'CAKISMA');
});

test('Kart #226: talep uygulanırken içerik talepteki önerilenle aynı ve talep hâlâ geçerli olmalı', () => {
  const taban = { id: 'k', fam: 'metal' };
  const yeni = { id: 'k', fam: 'plastik' };
  const kayitli = katalogTalebiBas({ ...taban, talep: { yeni } }, null, { by: 1, byAd: 'Veli', t: 5 });
  assert.equal(katalogTalepUygulamaDenetle(kayitli, { ...yeni, onay: { durum: 'aktif' }, rev: [1] }), null);
  assert.equal(katalogTalepUygulamaDenetle(kayitli, { id: 'k', fam: 'ahsap' })?.kod, 'GECERSIZ');
  assert.equal(katalogTalepUygulamaDenetle(kayitli, { ...yeni, mukerrerOnay: true })?.kod, 'GECERSIZ');
  assert.equal(katalogTalepUygulamaDenetle({ ...kayitli, birlesen: ['x'] }, yeni)?.kod, 'GECERSIZ');
  assert.equal(katalogTalepUygulamaDenetle({ ...kayitli, birlesen: ['x'] }, { ...yeni, birlesen: ['x'] }), null);
  assert.equal(katalogTalepUygulamaDenetle({ ...kayitli, fam: 'cam' }, yeni)?.kod, 'CAKISMA');
  assert.equal(katalogTalepUygulamaDenetle({ ...kayitli, talep: { yeni, farklar: katalogFarki(taban, yeni) } }, yeni)?.kod, 'CAKISMA', 'fark özeti olmayan eski biçimli talep bayat sayılır');
  const ic = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['k' + String(i).padStart(2, '0'), i]));
  const cokluTalep = katalogTalebiBas({ id: 'k', talep: { yeni: { id: 'k', ...ic } } }, null, { by: 1, byAd: 'Veli', t: 5 });
  assert.equal(katalogTalepUygulamaDenetle(cokluTalep, { id: 'k', ...ic }), null);
  assert.equal(katalogTalepUygulamaDenetle({ ...cokluTalep, k35: 'taban' }, { id: 'k', ...ic })?.kod, 'CAKISMA', 'taşan alanın tabanı değişti');
  const noktali = katalogFarki({ id: 'k', com: { ad: 'A' } }, { id: 'k', com: { ad: 'B' }, 'com.ad': 'A' });
  assert.deepEqual(noktali.map((x) => x.f), ['[com.ad]', 'com.ad']);
  assert.equal(katalogTalepUygulamaDenetle({ ...taban, talep: { farklar: [] } }, yeni)?.kod, 'GECERSIZ');
});

/* ---------------- Logo'ya gönderime hazırlık (kart #232) ---------------- */

test('MKL-4 (kart #232): eksikler sabit sırada; boşluktan ibaret değer eksiktir; tam kartta eksik yok', () => {
  const tam = { tur: 'hammadde', stokKodu: 'HM-PAS-00001', ad: 'Ad', birim: 'kg', logoKartTuru: 'L1', logoBirimSeti: 'B1' };
  assert.deepEqual(logoEksikleri(tam), []);
  assert.deepEqual(logoEksikleri({ tur: 'sarf', stokKodu: null, ad: ' ', birim: null, logoKartTuru: null, logoBirimSeti: '' }),
    ['stok_kodu', 'ad', 'birim', 'tur_karsiligi', 'birim_karsiligi']);
  assert.deepEqual(logoEksikleri({ ...tam, logoBirimSeti: null }), ['birim_karsiligi']);
  // Hizmet tür karşılığına girmez: eksik sayılmaz; birim karşılığı yine gerekir (kart #163).
  assert.deepEqual(logoEksikleri({ ...tam, tur: 'hizmet', logoKartTuru: null }), []);
  assert.deepEqual(logoEksikleri({ ...tam, tur: 'hizmet', logoKartTuru: null, logoBirimSeti: null }), ['birim_karsiligi']);
});

test('MKL-3 (kart #232): birim değişimi kartın com.birim alanından okunur; başka alan değişimi birim değişimi değildir', () => {
  assert.equal(logoBirimiDegistiMi({ com: { birim: 'kg', ad: 'a' } }, { com: { birim: 'kg', ad: 'b' } }), false);
  assert.equal(logoBirimiDegistiMi({ com: { birim: 'kg' } }, { com: { birim: 'adet' } }), true);
  assert.equal(logoBirimiDegistiMi({ com: { birim: 'kg' } }, { com: {} }), true);
  assert.equal(logoBirimiDegistiMi({ com: {} }, { com: { birim: null } }), false);
  assert.equal(logoBirimiDegistiMi({ com: { birim: 5 } }, { com: { birim: '5' } }), false, 'veritabanının metin okumasıyla aynı');
});

test('S4 b (kart #783): ad değişimi kırpılmış com.ad ile ölçülür; boşluk ve başka alan değişimi ad değişimi değildir', () => {
  assert.equal(logoAdiDegistiMi({ com: { ad: 'Mil', birim: 'kg' } }, { com: { ad: 'Mil', birim: 'adet' } }), false);
  assert.equal(logoAdiDegistiMi({ com: { ad: 'Mil' } }, { com: { ad: ' Mil ' } }), false);
  assert.equal(logoAdiDegistiMi({ com: { ad: 'Mil' } }, { com: { ad: 'Mil 2' } }), true);
  assert.equal(logoAdiDegistiMi({ com: { ad: 'Mil' } }, { com: {} }), true);
  assert.equal(logoAdiDegistiMi({ com: { ad: '' } }, {}), false, 'boş ad ile adsız aynı');
  assert.equal(logoAdiDegistiMi({ com: { ad: 5 } }, { com: { ad: null } }), false, 'metin olmayan ad adsız sayılır');
  assert.equal(logoAdiDegistiMi({ com: { ad: 'Mil' } }, { com: { ad: 'Mil\t' } }), true, 'veritabanı gibi yalnız boşluk kırpılır');
});

test('S4 b (kart #783): güncelleme sonucu gönderilen ad güncel adla aynıysa yazılır; ad yine değiştiyse bekliyor kalır; boş hata reddedilir', () => {
  assert.deepEqual(logoGuncellemeSonucuDurumu({ ad: 'Mil', tamam: true }, 'Mil'), { durum: 'gonderildi', hata: null });
  assert.deepEqual(logoGuncellemeSonucuDurumu({ ad: 'Mil', hata: '  yok  ' }, 'Mil'), { durum: 'hata', hata: 'yok' });
  assert.equal(logoGuncellemeSonucuDurumu({ ad: 'Mil', tamam: true }, 'Mil 2'), null);
  assert.equal(logoGuncellemeSonucuDurumu({ ad: 'Mil', hata: 'yok' }, 'Mil 2'), null);
  assert.deepEqual(logoGuncellemeSonucuDurumu({ ad: null, tamam: true }, null), { durum: 'gonderildi', hata: null });
  assert.equal(logoGuncellemeSonucuDurumu({ ad: 'Mil', hata: '   ' }, 'Mil 2'), 'bos-hata');
});

test('MKL-5 (kart #232): hata metni kırpılır ve sınırda kesilir; boş hata yok sayılmaz, reddedilir', () => {
  assert.equal(logoHataMetni('  x  '), 'x');
  assert.equal(logoHataMetni('   '), null);
  assert.equal(logoHataMetni('a'.repeat(LOGO_HATA_EN_COK + 5))?.length, LOGO_HATA_EN_COK);
});

test('Logo durum listesi (kart #232): eksikli kartlar üstte; sonra hata, bekliyor, gönderildi; grup içinde sayı sırası', () => {
  const k = (id: number, durum: 'bekliyor' | 'gonderildi' | 'hata', eksik: boolean) => ({ id, durum, eksikler: eksik ? ['ad'] : [] });
  const liste = [k(1, 'gonderildi', false), k(2, 'bekliyor', false), k(3, 'hata', false), k(4, 'bekliyor', true), k(5, 'hata', true), k(6, 'bekliyor', true)];
  assert.deepEqual([...liste].sort(logoDurumSirasi).map((x) => x.id), [5, 4, 6, 3, 2, 1]);
});

/* ---------------- Hizmet kartı (kart #163, MH1-MH5) ---------------- */

test('Hizmet: yön ekranın seçim metninden ASCII değere çevrilir; yönsüz ya da geçersiz yönlü hizmet kaydı yoktur; önek HZ', () => {
  const hizmet = (yon: unknown) => ({ tur: 'hizmet', com: { kod: 'HZ-FSN-00001' }, g: { kat: 'fason', yon }, onay: { durum: 'aktif' } });
  assert.deepEqual(katalogKaydiAlanlari(hizmet('Alınan'), {}), { tur: 'hizmet', onayDurumu: 'aktif', stokKodu: 'HZ-FSN-00001', hizmetYonu: 'alinan' });
  assert.equal(kartHizmetYonu({ g: { yon: ' Verilen ' } }), 'verilen');
  assert.equal(kartHizmetYonu({ g: { yon: 'verilen' } }), 'verilen');
  for (const yon of [undefined, null, '', 'alınan', 'İkisi', 1]) {
    const r = katalogKaydiAlanlari(hizmet(yon), {});
    assert.equal('alan' in r ? r.alan : null, 'kayit.g.yon', String(yon));
  }
  assert.equal(kartHizmetYonu({ g: 'Alınan' }), null);
  assert.equal(katalogKodOneki('HZ-NAK-00012'), 'HZ-NAK-');
  assert.equal(katalogOnekiTureUyarMi('HZ-NAK-', 'hizmet'), true);
  assert.equal(katalogOnekiTureUyarMi('SF-NAK-', 'hizmet'), false);
  assert.equal(katalogOnekiTureUyarMi('HZ-NAK-', 'sarf'), false);
  assert.equal(katalogAnahtarZorunluMu('hizmet'), false);
});

test('Madde 6: reçete ve operasyon sarfı başvuruları tekil toplanır; serbest satır ve bozuk satır sayılmaz', () => {
  assert.deepEqual(kartBilesenKimlikleri({
    bom: [{ ref: 'a' }, { ad: 'serbest' }, { ref: '' }, 'bozuk', { ref: 'a' }, { ref: 3 }],
    ops: [{ sarf: [{ ref: 'b' }, { ref: 'a' }] }, { sarf: 'yok' }, null],
  }), ['a', 'b']);
  assert.deepEqual(kartBilesenKimlikleri({ bom: 'yok', ops: {} }), []);
});

test('TM1 (kart #1218): ticari mal türdür, önek TM; TM başka türün öneki ve firma kodu olamaz; benzersiz anahtar zorunlu değil', () => {
  const r = katalogKaydiAlanlari({ tur: 'ticari_mal', com: { kod: 'TM-GEN-00001' }, onay: { durum: 'taslak' } }, {});
  assert.deepEqual('alan' in r ? r : [r.tur, r.stokKodu, r.hizmetYonu], ['ticari_mal', 'TM-GEN-00001', null]);
  assert.equal(katalogKodOneki('TM-GEN-00012'), 'TM-GEN-');
  assert.equal(katalogOnekiTureUyarMi('TM-GEN-', 'ticari_mal'), true);
  assert.equal(katalogOnekiTureUyarMi('HM-GEN-', 'ticari_mal'), false);
  assert.equal(katalogOnekiTureUyarMi('TM-GEN-', 'hammadde'), false);
  assert.equal(katalogFirmaKoduGecerliMi('TM'), false);
  assert.equal(katalogFirmaKoduGecerliMi('TMX'), true);
  assert.equal(katalogAnahtarZorunluMu('ticari_mal'), false);
});

test('TM2 (kart #1218): ticari malın Logo karşılığı yalnız 1; öteki türler 1 alamaz; boş her zaman geçer', () => {
  const h = (tmiDegeri: string, logoDegeri: string | null) => logoKarsiligiHatasi({ cesit: 'tur', tmiDegeri, logoDegeri });
  assert.equal(h('ticari_mal', '1'), null);
  assert.equal(h('ticari_mal', null), null);
  for (const kod of ['10', '11', '12', '13', '4']) assert.match(h('ticari_mal', kod) ?? '', /Ticari malın Logo kart türü 1/, kod);
  assert.match(h('hammadde', '1') ?? '', /Logo kart türü 10 \(hammadde\), 11 \(yarı mamul\), 12 \(mamul\), 13 \(tüketim malı\) olabilir/);
  assert.equal(h('hammadde', '10'), null);
});

test('208 a: ağırlık ve adlar yalnız hammaddede; hiçbiri gelmezse kayıtlı değer korunur, boş ad null', () => {
  assert.deepEqual(katalogAgirlikAlanlari('sarf', { birim_agirlik_kg: 2 }), { birimAgirlikKg: null, kaliteAdi: null, formAdi: null });
  assert.equal(katalogAgirlikAlanlari('hammadde', {}), null);
  assert.deepEqual(katalogAgirlikAlanlari('hammadde', { birim_agirlik_kg: 2, kalite_adi: ' ', form_adi: ' Çubuk ' }), { birimAgirlikKg: 2, kaliteAdi: null, formAdi: 'Çubuk' });
});

test('214 a: net parça ağırlığı yalnız mamul ve yarı mamulde, kartın net ağırlık alanından; sıfır, eksi, metin ve fazlası null', () => {
  assert.equal(katalogNetAgirlikKg('mamul', { g: { net: 1.25 } }), 1.25);
  assert.equal(katalogNetAgirlikKg('yarimamul', { g: { net: '1,23456' } }), 1.2346);
  assert.equal(katalogNetAgirlikKg('hammadde', { g: { net: 1.25 } }), null);
  for (const net of [0, 0.00001, -1, 'abc', '', null, undefined, 1e12, Number.NaN]) assert.equal(katalogNetAgirlikKg('mamul', { g: { net } }), null, String(net));
  assert.equal(katalogNetAgirlikKg('mamul', {}), null);
});

test('UYUM-BORCU 4, 157 a: hammadde ölçüsü ekranın kuralıyla; ölçüsüz yeni kart da reddedilir, kayıtlı kartta değişmeyen ölçüye bakılmaz', () => {
  const hm = (form: unknown, dims: unknown, ek: Record<string, unknown> = {}) => ({ tur: 'hammadde', form, dims, ...ek });
  assert.equal(hammaddeOlcuHatasi(null, hm('cubuk', { d: 50, l: 6000 })), null);
  assert.equal(hammaddeOlcuHatasi(null, hm('boru', { D: 48.3, t: 2.6, l: 6000 })), null);
  assert.equal(hammaddeOlcuHatasi(null, { tur: 'hammadde', fam: 'metal' }), 'Bir form seç.');
  assert.equal(hammaddeOlcuHatasi(null, hm(null, {})), 'Bir form seç.');
  assert.equal(hammaddeOlcuHatasi(null, { fam: 'metal' }), 'Bir form seç.', 'türsüz kart hammaddedir');
  assert.equal(hammaddeOlcuHatasi(null, hm('yok', { d: 1 })), 'Bir form seç.');
  assert.equal(hammaddeOlcuHatasi(null, hm('toString', { d: 1 })), 'Bir form seç.');
  assert.equal(hammaddeOlcuHatasi(null, hm(null, { d: 1 })), 'Bir form seç.');
  for (const dims of [{ d: 50 }, { d: 0, l: 1 }, { d: -1, l: 1 }, { d: '50', l: 1 }, { d: Number.NaN, l: 1 }, null]) {
    assert.equal(hammaddeOlcuHatasi(null, hm('cubuk', dims)), 'Tüm ölçüleri sıfırdan büyük girmelisin.', JSON.stringify(dims));
  }
  assert.equal(hammaddeOlcuHatasi(null, hm('boru', { D: 10, t: 5, l: 1 })), 'Et kalınlığı dış çapın yarısından küçük olmalı.');
  assert.equal(hammaddeOlcuHatasi(null, hm('kutu', { a: 40, b: 10, t: 5, l: 1 })), 'Et kalınlığı kenarların yarısından küçük olmalı.');
  assert.equal(hammaddeOlcuHatasi(null, hm('kosebent', { a: 40, b: 4, t: 4, l: 1 })), 'Et kalınlığı kol boyundan küçük olmalı.');
  // Hammadde dışı kart ve kayıtlı kartta değişmeyen ölçü denetlenmez; değişen ölçü ve talebin önerdiği ölçü denetlenir.
  assert.equal(hammaddeOlcuHatasi(null, { tur: 'sarf', form: 'yok', dims: { x: 0 } }), null);
  const eski = hm('cubuk', { d: 0, l: 1 });
  assert.equal(hammaddeOlcuHatasi(eski, { ...eski, com: { ad: 'Yeni ad' } }), null);
  assert.equal(hammaddeOlcuHatasi(eski, hm('cubuk', { d: -2, l: 1 })), 'Tüm ölçüleri sıfırdan büyük girmelisin.');
  const iyi = hm('cubuk', { d: 50, l: 6000 });
  assert.equal(hammaddeOlcuHatasi(iyi, { ...iyi, talep: { yeni: hm('boru', { D: 10, t: 6, l: 1 }) } }), 'Et kalınlığı dış çapın yarısından küçük olmalı.');
});


test('1247 d katalogGkkAyari: gelmeyen ayar korunur, gelen yazılır; demirbaş ve hizmette açık reddedilir, ayar silinir', () => {
  assert.deepEqual(katalogGkkAyari('hammadde', undefined), { yaz: false, deger: null });
  assert.deepEqual(katalogGkkAyari('hammadde', false), { yaz: true, deger: false });
  assert.deepEqual(katalogGkkAyari('sarf', true), { yaz: true, deger: true });
  assert.deepEqual(katalogGkkAyari('ticari_mal', null), { yaz: true, deger: null });
  assert.deepEqual(katalogGkkAyari('demirbas', true), { hata: GKK_TURU_ILETISI });
  assert.deepEqual(katalogGkkAyari('hizmet', false), { yaz: true, deger: null });
  assert.deepEqual(katalogGkkAyari('hizmet', undefined), { yaz: true, deger: null });
});
