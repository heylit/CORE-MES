import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LOGO_AYARLARI } from '#paylasilan/ayarlar/logo.ts';
import { logoAyariOku, yerelMi } from './ayar.ts';
import {
  agHatasiniYorumla, BELIRSIZ_BEKLEME_MS, cevabiYorumla, dogrulamaMetni, ESKI_YARDIMCI_ILETISI, eklemeGovdesi, gecerliBirimSetleri, geriCekilmeMs, kartEylemi,
  HIZMET_ALANLARI, HIZMET_AYARI, hizmetGovdesi, kodCakismasiMetni, LISTE_DENEME_ARALIGI_MS, LISTE_TAZELEME_MS, listeOkunmaliMi, malzemeGuncellemeGovdesi, malzemeKodlariniAyikla, OZEL_KOD, varMiAdi,
} from './kurallar.ts';

describe('logo ayarı (kart #210)', () => {
  test('LGB-1: iki değişken de yoksa bağlantı kapalı (null); boş metin de yok sayılır', () => {
    assert.equal(logoAyariOku({}), null);
    assert.equal(logoAyariOku({ TMIV2_LOGO_KOPRU_ADRESI: '  ', TMIV2_LOGO_KOPRU_ANAHTARI: '' }), null);
  });

  test('LGB-1: yerel adres ve anahtar açar; sondaki / atılır', () => {
    assert.deepEqual(logoAyariOku({ TMIV2_LOGO_KOPRU_ADRESI: 'http://127.0.0.1:4190/', TMIV2_LOGO_KOPRU_ANAHTARI: 'a' }), { adres: 'http://127.0.0.1:4190', anahtar: 'a' });
    assert.deepEqual(logoAyariOku({ TMIV2_LOGO_KOPRU_ADRESI: 'http://localhost:4190/yardimci', TMIV2_LOGO_KOPRU_ANAHTARI: 'a' }), { adres: 'http://localhost:4190/yardimci', anahtar: 'a' });
  });

  test('LGB-1 (ret): biri eksikse, adres bozuksa ya da kimlik/sorgu taşıyorsa açılış durur; ileti değeri taşımaz', () => {
    const gizli = 'cok-gizli-anahtar';
    const durumlar: Record<string, string | undefined>[] = [
      { TMIV2_LOGO_KOPRU_ADRESI: 'http://10.0.0.1' },
      { TMIV2_LOGO_KOPRU_ANAHTARI: gizli },
      { TMIV2_LOGO_KOPRU_ADRESI: 'ftp://10.0.0.1', TMIV2_LOGO_KOPRU_ANAHTARI: gizli },
      { TMIV2_LOGO_KOPRU_ADRESI: 'adres-degil', TMIV2_LOGO_KOPRU_ANAHTARI: gizli },
      { TMIV2_LOGO_KOPRU_ADRESI: 'http://k:p@10.0.0.1', TMIV2_LOGO_KOPRU_ANAHTARI: gizli },
      { TMIV2_LOGO_KOPRU_ADRESI: 'http://10.0.0.1/?key=1', TMIV2_LOGO_KOPRU_ANAHTARI: gizli },
    ];
    for (const env of durumlar) {
      assert.throws(() => logoAyariOku(env), (h: Error) => /TMIV2_LOGO_KOPRU_/.test(h.message) && !h.message.includes(gizli) && !h.message.includes('10.0.0.1'), JSON.stringify(Object.keys(env)));
    }
  });

  test('LGB-2: yalnız aynı bilgisayar; başka adres, kurum içi olsa da, açılışta reddedilir (ADR 0017)', () => {
    for (const host of ['127.0.0.1', 'localhost', 'LOCALHOST', '[::1]']) {
      assert.equal(yerelMi(host), true, host);
    }
    for (const host of ['10.0.0.5', '192.168.1.10', '127.0.0.2', '0.0.0.0', 'logosrv', '[fd12::1]', '8.8.8.8', 'logo.example.com', 'localhost.example.com']) {
      assert.equal(yerelMi(host), false, host);
    }
    assert.throws(() => logoAyariOku({ TMIV2_LOGO_KOPRU_ADRESI: 'http://10.0.0.5:4190', TMIV2_LOGO_KOPRU_ANAHTARI: 'a' }), /aynı bilgisayar/);
    assert.throws(() => logoAyariOku({ TMIV2_LOGO_KOPRU_ADRESI: 'https://kopru.example.com', TMIV2_LOGO_KOPRU_ANAHTARI: 'a' }), /aynı bilgisayar/);
  });
});

describe('köprü cevabı (kart #207)', () => {
  test('LGB-3: success=true ve logicalRef > 0 kayıt var; 0 ya da boş "yok"', () => {
    assert.deepEqual(cevabiYorumla(200, { success: true, logicalRef: 77 }), { tur: 'basarili', logicalRef: 77 });
    assert.deepEqual(cevabiYorumla(200, { success: true, logicalRef: 0 }), { tur: 'basarili', logicalRef: null });
    assert.deepEqual(cevabiYorumla(200, { success: true, logicalRef: null }), { tur: 'basarili', logicalRef: null });
    assert.deepEqual(cevabiYorumla(200, { success: true, logicalRef: '77' }), { tur: 'basarili', logicalRef: null });
  });

  test('LGB-3: success=false kesin ret; hata ve validate metni saklanır', () => {
    const r = cevabiYorumla(200, { success: false, logicalRef: 0, error: 'Hata', validate: ['NAME zorunlu', 'BIRIM gecersiz'] });
    assert.equal(r.tur, 'reddedildi');
    assert.equal('ileti' in r && r.ileti, 'Logo reddetti: Hata | NAME zorunlu; BIRIM gecersiz');
    assert.equal(cevabiYorumla(400, { success: false }).tur, 'reddedildi');
  });

  test('LGB-4: 401/403 yetkisiz; 5xx, 408, 429 ve okunamayan 2xx cevabı belirsiz (Logo\'ya ulaşmış olabilir)', () => {
    assert.equal(cevabiYorumla(401, null).tur, 'yetkisiz');
    assert.equal(cevabiYorumla(403, { success: false }).tur, 'yetkisiz');
    for (const durum of [500, 502, 503, 408, 429]) assert.equal(cevabiYorumla(durum, { success: true, logicalRef: 5 }).tur, 'belirsiz', String(durum));
    assert.equal(cevabiYorumla(200, null).tur, 'belirsiz');
    assert.equal(cevabiYorumla(200, { logicalRef: 5 }).tur, 'belirsiz');
    assert.equal(cevabiYorumla(404, null).tur, 'reddedildi');
  });

  test('3195: yardımcının tanımadığı yol (404 "Not found") eski yardımcı iletisi; kayıt yok 404\'ü kendi metniyle kalır', () => {
    assert.deepEqual(cevabiYorumla(404, { success: false, error: 'Not found' }), { tur: 'reddedildi', ileti: ESKI_YARDIMCI_ILETISI });
    assert.deepEqual(cevabiYorumla(404, { success: false, error: ' Not found ' }), { tur: 'reddedildi', ileti: ESKI_YARDIMCI_ILETISI });
    assert.equal(ESKI_YARDIMCI_ILETISI.includes('Logo reddetti'), false);
    const kayitYok = cevabiYorumla(404, { success: false, error: 'Material not found' });
    assert.equal('ileti' in kayitYok && kayitYok.ileti, 'Logo reddetti: Material not found');
    const baskaDurum = cevabiYorumla(400, { success: false, error: 'Not found' });
    assert.equal('ileti' in baskaDurum && baskaDurum.ileti, 'Logo reddetti: Not found');
  });

  test('LGB-4: bağlantı kurulamadıysa istek gitmemiştir (ulasilamadi); zaman aşımı ve kopan bağlantı belirsiz; ileti adres taşımaz', () => {
    assert.equal(agHatasiniYorumla({ zamanAsimi: false, kod: 'ECONNREFUSED' }).tur, 'ulasilamadi');
    assert.equal(agHatasiniYorumla({ zamanAsimi: true, kod: null }).tur, 'belirsiz');
    assert.equal(agHatasiniYorumla({ zamanAsimi: false, kod: 'ECONNRESET' }).tur, 'belirsiz');
    assert.equal(agHatasiniYorumla({ zamanAsimi: false, kod: null }).tur, 'belirsiz');
  });

  test('LGB-3: validate biçimi metin, dizi ya da alan nesnesi olabilir; boşsa null', () => {
    assert.equal(dogrulamaMetni('tek'), 'tek');
    assert.equal(dogrulamaMetni({ code: ['uzun'], name: 'bos' }), 'code: uzun; name: bos');
    assert.equal(dogrulamaMetni(null), null);
    assert.equal(dogrulamaMetni([]), null);
  });
});

describe('kart açma gövdesi (kart #207 C)', () => {
  const kart = { tur: 'hammadde', stokKodu: 'HM-ABC-00001', ad: 'Deneme', logoKartTuru: '10', logoBirimSeti: '06' };
  const secenek = { kdv: null, gecerliBirimler: new Set(['05', '06']) };

  test('LGB-5: gövde code, name, cardType (sayı), unitSetCode ve sabit auxilCode TMI taşır', () => {
    assert.deepEqual(eklemeGovdesi(kart, secenek), { govde: { code: 'HM-ABC-00001', name: 'Deneme', cardType: 10, unitSetCode: '06', auxilCode: OZEL_KOD } });
    assert.equal(OZEL_KOD, 'TMI');
    for (const tur of ['10', '11', '12', '13', '4', '1']) assert.ok('govde' in eklemeGovdesi({ ...kart, logoKartTuru: tur }, secenek), tur);
    // Kart #1218: ticari mal Logo'ya ticari mal kartı (1) olarak gider.
    const ticari = eklemeGovdesi({ ...kart, tur: 'ticari_mal', stokKodu: 'TM-ABC-00001', logoKartTuru: '1' }, secenek);
    assert.equal('govde' in ticari ? ticari.govde.cardType : ticari.hata, 1);
  });

  test('LGB-5 (334 a, 2088-1): Açıklama 1 Logo adı (name), Açıklama 2-3 name3, name4; Açıklama 1 boşsa ad TMI adı; boş alan gönderilmez, name2 hiç gitmez', () => {
    const r = eklemeGovdesi({ ...kart, aciklama1: ' Bir ', aciklama2: null, aciklama3: 'Uc' }, secenek);
    assert.deepEqual(r, { govde: { code: 'HM-ABC-00001', name: 'Bir', cardType: 10, unitSetCode: '06', auxilCode: OZEL_KOD, name4: 'Uc' } });
    assert.deepEqual(eklemeGovdesi({ ...kart, aciklama1: '  ', aciklama2: '', aciklama3: null }, secenek), eklemeGovdesi(kart, secenek));
    const bos = eklemeGovdesi({ ...kart, aciklama1: null }, secenek);
    assert.equal('govde' in bos ? bos.govde.name : bos.hata, 'Deneme');
    const uc = eklemeGovdesi({ ...kart, aciklama1: 'A1', aciklama2: 'A2', aciklama3: 'A3' }, secenek);
    assert.ok('govde' in uc && !('name2' in uc.govde));
    assert.deepEqual([uc.govde.name, uc.govde.name3, uc.govde.name4], ['A1', 'A2', 'A3']);
    // Adı boş kart Açıklama 1 doluysa Logo'ya gider; ikisi de boşsa gitmez.
    const adsiz = eklemeGovdesi({ ...kart, ad: ' ', aciklama1: 'A1' }, secenek);
    assert.equal('govde' in adsiz ? adsiz.govde.name : adsiz.hata, 'A1');
    assert.ok('hata' in eklemeGovdesi({ ...kart, ad: null, aciklama1: ' ' }, secenek));
  });

  test('LGB-5 (ret): izinli olmayan kart türü, 24 karakteri aşan kod, boş ad ve boş birim gönderilmez', () => {
    for (const tur of ['9', '14', 'LOGO-HM', '10.0', '', null]) assert.ok('hata' in eklemeGovdesi({ ...kart, logoKartTuru: tur }, secenek), String(tur));
    assert.ok('hata' in eklemeGovdesi({ ...kart, stokKodu: 'X'.repeat(25) }, secenek));
    assert.ok('hata' in eklemeGovdesi({ ...kart, ad: '  ' }, secenek));
    assert.ok('hata' in eklemeGovdesi({ ...kart, logoBirimSeti: null }, secenek));
  });

  test('LGB-10: izinli listede olmayan birim seti "geçersiz karşılık" olur, istek gövdesi çıkmaz (LB9 a)', () => {
    const r = eklemeGovdesi({ ...kart, logoBirimSeti: '99' }, secenek);
    assert.ok('hata' in r && r.hata.startsWith('Geçersiz karşılık'), JSON.stringify(r));
    const t = eklemeGovdesi({ ...kart, logoKartTuru: '9' }, secenek);
    assert.ok('hata' in t && t.hata.startsWith('Geçersiz karşılık'), JSON.stringify(t));
    assert.ok('hata' in eklemeGovdesi(kart, { kdv: null, gecerliBirimler: new Set() }));
  });

  test('LGB-11: KDV boşsa gövdede vat ve sellVat yok; doluysa ikisine aynı değer gider (LB3, LB10 a)', () => {
    const bos = eklemeGovdesi(kart, secenek);
    assert.ok('govde' in bos && !('vat' in bos.govde) && !('sellVat' in bos.govde));
    const dolu = eklemeGovdesi(kart, { ...secenek, kdv: 20 });
    assert.ok('govde' in dolu);
    assert.equal(dolu.govde.vat, 20);
    assert.equal(dolu.govde.sellVat, 20);
    const sifir = eklemeGovdesi(kart, { ...secenek, kdv: 0 });
    assert.ok('govde' in sifir && sifir.govde.vat === 0 && sifir.govde.sellVat === 0);
  });
});

describe('kart güncelleme gövdesi (2115-1 a, 2088-1)', () => {
  test('LGB-22: Açıklama 1 doluysa Logo adı odur, boşsa TMI adı; Açıklama 2-3 name3, name4; boş açıklama gövdede yok', () => {
    assert.deepEqual(malzemeGuncellemeGovdesi({ stokKodu: ' HM-A-1 ', ad: 'TMI', aciklama1: ' Logo ', aciklama2: 'Iki', aciklama3: 'Uc' }),
      { govde: { code: 'HM-A-1', name: 'Logo', name3: 'Iki', name4: 'Uc' } });
    assert.deepEqual(malzemeGuncellemeGovdesi({ stokKodu: 'HM-A-1', ad: ' TMI ', aciklama1: '  ', aciklama2: '', aciklama3: null }), { govde: { code: 'HM-A-1', name: 'TMI' } });
    assert.deepEqual(malzemeGuncellemeGovdesi({ stokKodu: 'HM-A-1', ad: 'TMI' }), { govde: { code: 'HM-A-1', name: 'TMI' } }, 'kaynak açıklama vermezse bugünkü gövde');
  });
  test('LGB-22 reddedilen: ad ve Açıklama 1 boşsa, stok kodu boş ya da 24 karakteri aşarsa hata', () => {
    assert.deepEqual(malzemeGuncellemeGovdesi({ stokKodu: 'HM-A-1', ad: null, aciklama1: ' ' }), { hata: 'Kartın adı yok.' });
    assert.ok('hata' in malzemeGuncellemeGovdesi({ stokKodu: ' ', ad: 'TMI' }));
    assert.ok('hata' in malzemeGuncellemeGovdesi({ stokKodu: 'X'.repeat(25), ad: 'TMI' }));
    assert.ok('govde' in malzemeGuncellemeGovdesi({ stokKodu: 'X', ad: null, aciklama1: 'Logo' }), 'ad boş, Açıklama 1 dolu: Logo adı Açıklama 1');
  });
});

describe('hizmet kartı gövdesi (kart #207, hizmet planı)', () => {
  const kart = { tur: 'hizmet', stokKodu: 'HZ-FSN-00001', ad: 'Kaplama', hizmetYonu: 'alinan' as const, logoBirimSeti: '05' };
  const secenek = { kdv: null, gecerliBirimler: new Set(['05']) };

  test('LGB-15: alan adları tek haritadan (geçici XML etiketleri, doğrulanmadı); yön kart türüne çevrilir (alınan 1, verilen 2)', () => {
    assert.deepEqual(HIZMET_ALANLARI, { kod: 'CODE', ad: 'DESCRIPTION', kartTuru: 'CARD_TYPE', birimSeti: 'UNITSET_CODE', kdv: 'VAT_PERC', ozelKod: 'AUXIL_CODE' });
    assert.deepEqual(hizmetGovdesi(kart, secenek), { govde: { CODE: 'HZ-FSN-00001', DESCRIPTION: 'Kaplama', CARD_TYPE: 1, UNITSET_CODE: '05', AUXIL_CODE: OZEL_KOD } });
    const verilen = hizmetGovdesi({ ...kart, hizmetYonu: 'verilen' }, secenek);
    assert.ok('govde' in verilen && verilen.govde['CARD_TYPE'] === 2);
  });

  test('LGB-15: hizmet KDV oranı tek alana (VAT_PERC) gider; boşsa alan yok (KH3 b)', () => {
    const dolu = hizmetGovdesi(kart, { ...secenek, kdv: 20 });
    assert.ok('govde' in dolu && dolu.govde['VAT_PERC'] === 20);
    const bos = hizmetGovdesi(kart, secenek);
    assert.ok('govde' in bos && !('VAT_PERC' in bos.govde));
  });

  test('LGB-15 (ret): yönsüz, hizmet olmayan, 24 karakteri aşan, adsız ya da geçersiz birim setli kart gövde vermez', () => {
    assert.ok('hata' in hizmetGovdesi({ ...kart, hizmetYonu: null }, secenek));
    assert.ok('hata' in hizmetGovdesi({ ...kart, tur: 'sarf' }, secenek));
    assert.ok('hata' in hizmetGovdesi({ ...kart, stokKodu: 'X'.repeat(25) }, secenek));
    assert.ok('hata' in hizmetGovdesi({ ...kart, ad: ' ' }, secenek));
    const r = hizmetGovdesi({ ...kart, logoBirimSeti: '99' }, secenek);
    assert.ok('hata' in r && r.hata.startsWith('Geçersiz karşılık'), JSON.stringify(r));
  });

  test('LGB-16: hizmet kartı malzeme gövdesine girmez (malzeme ucuyla gönderilmez)', () => {
    const r = eklemeGovdesi({ tur: 'hizmet', stokKodu: 'HZ-FSN-00001', ad: 'Kaplama', logoKartTuru: '10', logoBirimSeti: '05' }, secenek);
    assert.ok('hata' in r, JSON.stringify(r));
  });

  test('LGB-17: alınan ve verilen hizmet gönderimi ayrı ayarlardır ve kapalı gelir (kart #777)', () => {
    assert.equal(LOGO_AYARLARI[HIZMET_AYARI.alinan].varsayilan, false);
    assert.equal(LOGO_AYARLARI[HIZMET_AYARI.verilen].varsayilan, false);
  });
});

describe('birim seti listesi (kart #207, LB6 c)', () => {
  const setler = [
    { kod: '05', elle: false, kopruListesinde: true },
    { kod: '06', elle: true, kopruListesinde: true },
    { kod: 'EL', elle: true, kopruListesinde: false },
  ];

  test('LGB-12: liste hiç okunmadıysa elle girilen geçerli; okunduysa yalnız köprü listesindeki geçerli', () => {
    assert.deepEqual([...gecerliBirimSetleri(setler, false)].sort(), ['06', 'EL']);
    assert.deepEqual([...gecerliBirimSetleri(setler, true)].sort(), ['05', '06']);
  });

  test('LGB-13: liste hiç okunmadıysa ya da saat dolduysa okunur; başarısız denemeden sonra aralık beklenir', () => {
    const simdi = new Date('2026-10-08T12:00:00Z');
    const once = (ms: number) => new Date(simdi.getTime() - ms);
    assert.equal(listeOkunmaliMi(null, null, simdi), true);
    assert.equal(listeOkunmaliMi(once(LISTE_TAZELEME_MS - 1), null, simdi), false);
    assert.equal(listeOkunmaliMi(once(LISTE_TAZELEME_MS), null, simdi), true);
    assert.equal(listeOkunmaliMi(null, once(LISTE_DENEME_ARALIGI_MS - 1), simdi), false);
    assert.equal(listeOkunmaliMi(null, once(LISTE_DENEME_ARALIGI_MS), simdi), true);
  });
});

describe('çift gönderim kalkanı ve yeniden deneme (kart #207 B)', () => {
  const t0 = new Date('2026-10-08T10:00:00Z');
  const sonra = (ms: number) => new Date(t0.getTime() + ms);

  test('LGB-6: niyeti olmayan kart önce niyet yazar; taze niyet (bu süreçte yazılmış) hemen gönderilir', () => {
    assert.equal(kartEylemi(null, t0, false, null), 'niyet-yaz');
    assert.equal(kartEylemi({ niyetZamani: null, sonrakiDeneme: null }, t0, false, null), 'niyet-yaz');
    assert.equal(kartEylemi({ niyetZamani: t0, sonrakiDeneme: null }, sonra(5000), true, null), 'gonder');
  });

  test('LGB-6 (ret): taze olmayan niyet (başka süreç, yeniden başlama, belirsiz deneme) bekleme dolmadan gönderilmez', () => {
    assert.equal(kartEylemi({ niyetZamani: t0, sonrakiDeneme: null }, sonra(BELIRSIZ_BEKLEME_MS - 1), false, null), 'bekle');
    assert.equal(kartEylemi({ niyetZamani: t0, sonrakiDeneme: null }, sonra(BELIRSIZ_BEKLEME_MS), false, null), 'gonder');
  });

  test('LGB-6 (ret): bu süreçte açma isteği gitmiş kart bekleme dolmadan yeniden gönderilmez (veritabanı geri alınsa da)', () => {
    assert.equal(kartEylemi(null, sonra(1000), false, t0), 'bekle');
    assert.equal(kartEylemi({ niyetZamani: t0, sonrakiDeneme: null }, sonra(1000), true, t0), 'bekle');
    assert.equal(kartEylemi(null, sonra(BELIRSIZ_BEKLEME_MS), false, t0), 'niyet-yaz');
  });

  test('LGB-7: sonraki deneme zamanı gelmemiş kart beklenir; gelince yeniden denenir', () => {
    assert.equal(kartEylemi({ niyetZamani: null, sonrakiDeneme: sonra(1000) }, t0, false, null), 'bekle');
    assert.equal(kartEylemi({ niyetZamani: null, sonrakiDeneme: sonra(1000) }, sonra(1000), false, null), 'niyet-yaz');
  });

  test('LGB-7: art arda hatada bekleme 30 sn ile başlar, iki katına çıkar, 30 dakikada durur', () => {
    assert.deepEqual([1, 2, 3, 4].map(geriCekilmeMs), [30_000, 60_000, 120_000, 240_000]);
    assert.equal(geriCekilmeMs(50), 30 * 60_000);
    assert.equal(geriCekilmeMs(0), 30_000);
  });
});

describe('kod çakışması ve Logo kod listesi (2089)', () => {
  test('2089-1 a: "var mı" cevabındaki ad okunur; ad yoksa, boşsa ya da gövde nesne değilse null', () => {
    assert.equal(varMiAdi({ success: true, logicalRef: 5, name: '  Logo ad ' }), 'Logo ad');
    for (const g of [{ success: true, logicalRef: 5 }, { name: ' ' }, { name: 3 }, null, [], 'x']) assert.equal(varMiAdi(g), null, JSON.stringify(g));
  });

  test('2089-1 a: çakışma iletisi Logo adını taşır, ad yoksa adsız; düzeltme yolunu söyler', () => {
    assert.match(kodCakismasiMetni('Eski ad'), /^Logo'da bu kod başka kartta \(Logo adı: Eski ad\); kart eşlenmedi/);
    assert.match(kodCakismasiMetni(null), /^Logo'da bu kod başka kartta; kart eşlenmedi/);
    assert.match(kodCakismasiMetni(' '), /kodunu değiştirin ya da TMI kartını iptal edip yeni kodla açın\.$/);
  });

  test('2089-2 a: kod listesi metin dizisidir; boş, metin olmayan ve 64 karakteri aşan atlanır, tekrar teke iner; dizi değilse null', () => {
    assert.deepEqual(malzemeKodlariniAyikla([' A-1 ', 'A-1', '', 5, null, 'X'.repeat(65), 'B-2']), ['A-1', 'B-2']);
    assert.deepEqual(malzemeKodlariniAyikla([]), []);
    for (const g of [null, {}, { data: ['A'] }, 'A']) assert.equal(malzemeKodlariniAyikla(g), null, JSON.stringify(g));
  });
});
