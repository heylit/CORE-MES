import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LOGO_AYARLARI } from '#paylasilan/ayarlar/logo.ts';
import { kurumIciMi, logoAyariOku } from './ayar.ts';
import {
  agHatasiniYorumla, BELIRSIZ_BEKLEME_MS, cevabiYorumla, dogrulamaMetni, eklemeGovdesi, gecerliBirimSetleri, geriCekilmeMs, kartEylemi,
  HIZMET_ALANLARI, HIZMET_AYARI, hizmetGovdesi, LISTE_DENEME_ARALIGI_MS, LISTE_TAZELEME_MS, listeOkunmaliMi, OZEL_KOD,
} from './kurallar.ts';

describe('logo ayarı (kart #210)', () => {
  test('LGB-1: iki değişken de yoksa bağlantı kapalı (null); boş metin de yok sayılır', () => {
    assert.equal(logoAyariOku({}), null);
    assert.equal(logoAyariOku({ TMIV2_LOGO_KOPRU_ADRESI: '  ', TMIV2_LOGO_KOPRU_ANAHTARI: '' }), null);
  });

  test('LGB-1: kurum içi adres ve anahtar açar; sondaki / atılır', () => {
    assert.deepEqual(logoAyariOku({ TMIV2_LOGO_KOPRU_ADRESI: 'http://10.1.2.3:5000/', TMIV2_LOGO_KOPRU_ANAHTARI: 'a' }), { adres: 'http://10.1.2.3:5000', anahtar: 'a' });
    assert.deepEqual(logoAyariOku({ TMIV2_LOGO_KOPRU_ADRESI: 'https://logosrv/kopru', TMIV2_LOGO_KOPRU_ANAHTARI: 'a' }), { adres: 'https://logosrv/kopru', anahtar: 'a' });
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

  test('LGB-2: yalnız kurum içi adres; internete çıkan adres açılışta reddedilir (ADR 0011)', () => {
    for (const host of ['10.0.0.5', '172.16.0.1', '172.31.255.1', '192.168.1.10', '127.0.0.1', 'localhost', 'logosrv', 'logo-kopru', '[::1]', '[fd12::1]']) {
      assert.equal(kurumIciMi(host), true, host);
    }
    for (const host of ['8.8.8.8', '172.32.0.1', '11.0.0.1', 'logo.example.com', 'api.logo.com.tr', '[2001:db8::1]']) {
      assert.equal(kurumIciMi(host), false, host);
    }
    assert.throws(() => logoAyariOku({ TMIV2_LOGO_KOPRU_ADRESI: 'https://kopru.example.com', TMIV2_LOGO_KOPRU_ANAHTARI: 'a' }), /kurum içi/);
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

  test('LGB-5 (334 a): kartın Açıklama 1-3\'ü name2, name3, name4 ile gider; boş ya da yoksa alan gönderilmez', () => {
    const r = eklemeGovdesi({ ...kart, aciklama1: ' Bir ', aciklama2: null, aciklama3: 'Uc' }, secenek);
    assert.deepEqual(r, { govde: { code: 'HM-ABC-00001', name: 'Deneme', cardType: 10, unitSetCode: '06', auxilCode: OZEL_KOD, name2: 'Bir', name4: 'Uc' } });
    assert.deepEqual(eklemeGovdesi({ ...kart, aciklama1: '  ', aciklama2: '', aciklama3: null }, secenek), eklemeGovdesi(kart, secenek));
    const uc = eklemeGovdesi({ ...kart, aciklama1: 'A1', aciklama2: 'A2', aciklama3: 'A3' }, secenek);
    assert.deepEqual('govde' in uc ? [uc.govde.name2, uc.govde.name3, uc.govde.name4] : uc.hata, ['A1', 'A2', 'A3']);
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
