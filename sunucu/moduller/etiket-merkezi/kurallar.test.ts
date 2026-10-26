import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { agAraliklariniCoz } from '#paylasilan/ag-araligi.ts';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';
import { QR_KENAR_MODUL, type Sablon } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { yaziciAgiOku } from './ag.ts';
import { alanDegeri, baskiEngeli, dogrudanBaskiDurumu, indirmeEngeli, istasyonDegerleri, kayitUyumHatasi, konumDegerleri, lotDegerleri, kayitSablonTuru, malzemeDegerleri, noktaya, rafDegerleri, refakatDegerleri, refakatPartisiDegerleri, toplamEtiketHatasi, yaziciAdresHatasi, qrDikdortgenleri, qrMatrisi, sablonHatalari, sadelestir, SATIR_BASI, satirlaraBol, yerlesim } from './kurallar.ts';
import { HAZIR_SABLONLAR, ORNEK_DEGERLER } from './sablonlar.ts';
import { pplb, pplbKacir, pplbYaziSecimi, zpl, zplKacir } from './yazici-dili.ts';

const sablon = (ogeler: Sablon['ogeler'], genislik = 50, yukseklik = 25): Sablon => ({ anahtar: 't', ad: 'T', tur: 'malzeme', genislik, yukseklik, ogeler });
const metin = (alan: string, x = 1, y = 1, genislik = 40, yukseklik = 5, yaziMm = 3) => ({ tur: 'metin' as const, x, y, genislik, yukseklik, yaziMm, kalin: false, alan });

describe('etiket-merkezi kuralları', () => {
  test('EM-1: hazır şablonların hepsi etiketin içinde kalır; taşan öğe ve kutusundan büyük yazı reddedilir', () => {
    for (const s of HAZIR_SABLONLAR) assert.deepEqual(sablonHatalari(s), [], s.anahtar);
    assert.deepEqual(sablonHatalari(sablon([metin('ad', 20, 1, 31)])), ['1. öğe etiketin dışına taşıyor.']);
    assert.deepEqual(sablonHatalari(sablon([{ tur: 'qr', x: 10, y: 5, boyut: 21, alan: 'qr' }])), ['1. öğe etiketin dışına taşıyor.']);
    assert.deepEqual(sablonHatalari(sablon([metin('ad', 1, 1, 40, 2, 3)])), ['1. öğenin yazısı kutusundan büyük.']);
  });

  test('EM-2: milimetre yazıcı noktasına yuvarlanır', () => {
    assert.equal(noktaya(25.4, 203), 203);
    assert.equal(noktaya(100, 203), 799);
    assert.equal(noktaya(1, 203), 8);
    assert.equal(noktaya(1, 300), 12);
  });

  test('EM-3: sadeleştirme yalnız Türkçe harfleri çevirir, QR içeriğine dokunmaz', () => {
    assert.equal(sadelestir('Çağ İş Öğün şüphe ı'), 'Cag Is Ogun suphe i');
    const [yazi, qr] = yerlesim(sablon([metin('ad'), { tur: 'qr', x: 25, y: 1, boyut: 23, alan: 'qr' }]), { ad: 'Şaft', qr: 'MLZ:7' }, true);
    assert.equal(yazi?.tur === 'metin' && yazi.satirlar[0], 'Saft');
    assert.equal(qr?.tur === 'qr' && qr.veri, 'MLZ:7');
  });

  test('EM-4: değeri olmayan alan basılmaz; "=" ile başlayan alan sabit metindir', () => {
    assert.equal(alanDegeri('kod', { kod: null }), null);
    assert.equal(alanDegeri('kod', { kod: '  ' }), null);
    assert.equal(alanDegeri('kod', {}), null);
    assert.equal(alanDegeri('=SABİT', {}), 'SABİT');
    const ogeler = yerlesim(sablon([metin('kod'), metin('ad', 1, 8)]), { kod: null, ad: 'Var' }, false);
    assert.deepEqual(ogeler.map((o) => o.tur === 'metin' && o.satirlar), [['Var']]);
  });

  test('EM-5: ZPL alanında ^, ~ ve _ kaçırılır; kullanıcı metni komut açamaz', () => {
    assert.equal(zplKacir('a^XZ~JA_b'), 'a_5EXZ_7EJA_5Fb');
    const komut = zpl({ genislik: 50, yukseklik: 25, dpi: 203, adet: 1, ogeler: yerlesim(sablon([metin('ad')]), { ad: 'x^XZ^XA~JR' }, false) });
    assert.equal(komut.match(/\^XZ/g)?.length, 1);
    assert.equal(komut.match(/\^XA/g)?.length, 1);
    assert.equal(komut.includes('~JR'), false);
  });

  test('EM-6: PPLB metninde tırnak ve ters bölü kaçırılır, satır sonu atılır', () => {
    assert.equal(pplbKacir('a"b\\c'), 'a\\"b\\\\c');
    const komut = pplb({ genislik: 50, yukseklik: 25, dpi: 203, adet: 1, ogeler: yerlesim(sablon([metin('ad')]), { ad: 'x"\nP99\n' }, false) });
    assert.equal(komut.split('\n').filter((s) => s.startsWith('P')).join('|'), 'P1');
    assert.match(komut, /^A8,8,0,\d,\d,\d,N,"x\\" P99"$/m);
  });

  test('EM-7: örnek QR içerikleri kod sözlüğünde şablon türünün kaydına çözülür', () => {
    const beklenen = { konum: 'konum', raf: 'raf', malzeme: 'malzeme', lot: 'lot', refakat: 'uretim-emri', istasyon: 'konum', deneme: 'konum' } as const;
    for (const [tur, degerler] of Object.entries(ORNEK_DEGERLER)) {
      assert.equal(kodTuru(degerler.qr ?? '').tur, beklenen[tur as keyof typeof beklenen], tur);
    }
  });

  test('QR kutuları matrisin koyu modüllerini birebir kaplar', () => {
    const kareler = qrMatrisi('LOC:A01-02-3');
    const geri = kareler.map((s) => s.map(() => false));
    for (const d of qrDikdortgenleri(kareler, 0, 0, 1)) {
      for (let x = d.x; x < d.x + d.genislik; x++) { const satir = geri[d.y - 2]; if (satir) satir[x - 2] = true; }
    }
    assert.deepEqual(geri, kareler);
  });

  test('metin sözcük sınırından bölünür; sığmayan satır üç noktayla kesilir', () => {
    assert.deepEqual(satirlaraBol('bir iki üç dört', 9, 10, 3), ['bir', 'ik...']);
    assert.deepEqual(satirlaraBol('bir iki üç', 18, 10, 3), ['bir iki üç']);
    assert.deepEqual(satirlaraBol('bir iki üç dört beş', 9, 3.6, 3), ['bi...']);
    assert.deepEqual(satirlaraBol('ABCDEFGHIJ', 9, 20, 3), ['ABCDE', 'FGHIJ']);
    // Kart #707: satır sonu zorunlu satır başıdır; sığmayan son satır yine kesilir.
    assert.deepEqual(satirlaraBol(`10 Torna${SATIR_BASI}20 Freze`, 18, 10, 3), ['10 Torna', '20 Freze']);
    assert.deepEqual(satirlaraBol(['a', 'b', 'c', 'd'].join(SATIR_BASI), 18, 7.2, 3), ['a', 'b...']);
    assert.deepEqual(satirlaraBol('10 Torna\n20 Freze', 36, 10, 3), ['10 Torna 20 Freze'], 'satır sonu satır başı değildir');
  });

  test('PPLB yazı tipi istenen yüksekliği aşmaz', () => {
    for (const dpi of [203, 300]) for (const boy of [16, 24, 40, 88]) {
      const { no, carpan } = pplbYaziSecimi(boy, dpi);
      assert.equal(no >= 1 && no <= 5 && carpan >= 1, true);
    }
    assert.deepEqual(pplbYaziSecimi(24, 203), { no: 4, carpan: 1 });
    assert.deepEqual(pplbYaziSecimi(23, 203), { no: 3, carpan: 1 });
  });

  test('ZPL ve PPLB çıktısı etiket ölçüsünü ve adedi taşır', () => {
    const g = { genislik: 100, yukseklik: 50, dpi: 203, adet: 3, ogeler: [] };
    assert.equal(zpl(g), '^XA\n^CI28\n^PW799\n^LL400\n^LH0,0\n^PQ3\n^XZ\n');
    assert.equal(pplb(g), '\nN\nq799\nQ400,24\nP3\n');
  });

  test('EM-8: ağ yazıcısı yalnız aralık içindeki tek IP ile kaydedilir; dosya yazıcısı adres taşımaz', () => {
    const ag = agAraliklariniCoz('10.0.5.0/24').araliklar;
    assert.equal(yaziciAdresHatasi('ag', '10.0.5.20', ag), null);
    assert.equal(yaziciAdresHatasi('ag', '10.0.6.20', ag), 'Adres doğrudan baskı aralığının dışında.');
    assert.equal(yaziciAdresHatasi('ag', '8.8.8.8', ag), 'Adres doğrudan baskı aralığının dışında.');
    assert.equal(yaziciAdresHatasi('ag', 'yazici-1', ag), 'Adres tek bir IP adresi olmalı (örnek 10.0.5.20).');
    assert.equal(yaziciAdresHatasi('ag', '10.0.5.0/24', ag), 'Adres tek bir IP adresi olmalı (örnek 10.0.5.20).');
    assert.equal(yaziciAdresHatasi('ag', null, ag), 'Ağ yazıcısının IP adresi zorunlu.');
    assert.match(yaziciAdresHatasi('ag', '10.0.5.20', null) ?? '', /aralığı tanımlı değil/);
    assert.equal(yaziciAdresHatasi('dosya', null, null), null);
    assert.equal(yaziciAdresHatasi('dosya', '10.0.5.20', ag), 'Dosya ile basan yazıcıya adres yazılmaz.');
  });

  test('EM-8: TMIV2_ETIKET_YAZICI_AGI yoksa kapalı; kurum dışı ya da bozuk aralık açılışı durdurur ve değeri söylemez', () => {
    assert.equal(yaziciAgiOku({}), null);
    assert.equal(yaziciAgiOku({ TMIV2_ETIKET_YAZICI_AGI: '  ' }), null);
    assert.equal(yaziciAgiOku({ TMIV2_ETIKET_YAZICI_AGI: '10.0.5.0/24, 192.168.1.40' })?.length, 2);
    assert.equal(yaziciAgiOku({ TMIV2_ETIKET_YAZICI_AGI: '172.16.0.0/12' })?.length, 1);
    for (const deger of ['0.0.0.0/0', '8.8.8.0/24', '10.0.0.0/7', '172.15.0.0/16', 'ornek.com', '2001:db8::/32']) {
      assert.throws(() => yaziciAgiOku({ TMIV2_ETIKET_YAZICI_AGI: deger }), (h: Error) => h.message.includes('TMIV2_ETIKET_YAZICI_AGI') && !h.message.includes(deger), deger);
    }
  });

  test('EM-9 ve EM-10: doğrudan baskı ayar ve aralıkla açılır; pasif, dosya, aralık dışı yazıcı ve deneme dışı şablon basılmaz', () => {
    const ag = agAraliklariniCoz('10.0.5.0/24').araliklar;
    const acik = dogrudanBaskiDurumu(true, ag);
    assert.deepEqual(acik, { acik: true, neden: null });
    assert.match(dogrudanBaskiDurumu(false, ag).neden ?? '', /kapalı/);
    assert.match(dogrudanBaskiDurumu(true, null).neden ?? '', /TMIV2_ETIKET_YAZICI_AGI/);
    const y = { baglanti: 'ag' as const, adres: '10.0.5.20', aktif: true };
    assert.equal(baskiEngeli(y, acik, ag, 'deneme'), null);
    assert.equal(baskiEngeli({ ...y, aktif: false }, acik, ag, 'deneme'), 'Yazıcı pasif.');
    assert.match(baskiEngeli({ ...y, baglanti: 'dosya', adres: null }, acik, ag, 'deneme') ?? '', /dosya ile basar/);
    assert.match(baskiEngeli(y, dogrudanBaskiDurumu(false, ag), ag, 'deneme') ?? '', /kapalı/);
    assert.equal(baskiEngeli({ ...y, adres: '10.0.6.20' }, acik, ag, 'deneme'), 'Adres doğrudan baskı aralığının dışında.');
    assert.match(baskiEngeli(y, acik, ag, 'lot') ?? '', /yalnız yazıcı denemesi/);
    assert.equal(baskiEngeli(y, acik, ag, 'konum', 'konum'), null);
  });

  test('EM-11: örnek değer yalnız deneme şablonunda; gerçek kayıt yalnız kendi türündeki şablonla basılır', () => {
    assert.equal(kayitUyumHatasi('deneme', null), null);
    assert.match(kayitUyumHatasi('konum', null) ?? '', /kayıt seçin/);
    assert.equal(kayitUyumHatasi('konum', 'konum'), null);
    assert.equal(kayitUyumHatasi('lot', 'konum'), 'Şablon seçilen kayıtların türünde değil.');
    assert.equal(kayitUyumHatasi('deneme', 'konum'), 'Şablon seçilen kayıtların türünde değil.');
    assert.equal(kayitUyumHatasi('lot', 'mal-kabul'), null, 'EM-19: mal kabul seçimi lot şablonuyla basılır');
    assert.equal(kayitUyumHatasi('konum', 'mal-kabul'), 'Şablon seçilen kayıtların türünde değil.');
    assert.equal(kayitUyumHatasi('malzeme', 'malzeme'), null);
  });

  test('EM-12: bir baskıda kayıt x adet en çok 500 etiket', () => {
    assert.equal(toplamEtiketHatasi(250, 2), null);
    assert.equal(toplamEtiketHatasi(1, 500), null);
    assert.match(toplamEtiketHatasi(201, 3) ?? '', /en çok 500 etiket basılır \(201 kayıt x 3 adet\)/);
  });

  test('EM-13: konum etiketi stok konum kodunu ve LOC önekli QR\'ı basar; stokta olmayan alan boş kalır', () => {
    const d = konumDegerleri('R1-02-3-1');
    assert.deepEqual(d, { qr: 'LOC:R1-02-3-1', kod: 'R1-02-3-1', ad: null, yer: null });
    const sablon = HAZIR_SABLONLAR.find((s) => s.anahtar === 'konum-100x50');
    assert.ok(sablon);
    const ogeler = yerlesim(sablon, d, false);
    assert.deepEqual(ogeler.filter((o) => o.tur === 'metin').map((o) => o.satirlar), [['R1-02-3-1']]);
    assert.equal(ogeler.find((o) => o.tur === 'qr')?.veri, 'LOC:R1-02-3-1');
    // Stoktaki en uzun kod (20 karakter) konum ve istasyon şablonlarında kesilmez.
    const uzun = 'ABCDEFGHIJ-123456789';
    for (const s of HAZIR_SABLONLAR.filter((x) => x.tur === 'konum' || x.tur === 'istasyon')) {
      const kodOgesi = yerlesim(s, { ...konumDegerleri(uzun), ad: null }, false).find((o) => o.tur === 'metin');
      assert.equal(kodOgesi?.tur === 'metin' ? kodOgesi.satirlar.join('') : null, uzun, s.anahtar);
    }
  });

  test('EM-14: dosya yazıcısı komut dosyası indirir; pasif ya da ağ yazıcısı ve türü uymayan şablon indirilmez', () => {
    const y = { baglanti: 'dosya' as const, aktif: true };
    assert.equal(indirmeEngeli(y, 'deneme'), null);
    assert.equal(indirmeEngeli(y, 'konum', 'konum'), null);
    assert.equal(indirmeEngeli({ ...y, aktif: false }, 'deneme'), 'Yazıcı pasif.');
    assert.match(indirmeEngeli({ ...y, baglanti: 'ag' }, 'deneme') ?? '', /ağdan basar/);
    assert.match(indirmeEngeli(y, 'konum') ?? '', /kayıt seçin/);
    assert.equal(indirmeEngeli(y, 'lot', 'konum'), 'Şablon seçilen kayıtların türünde değil.');
  });

  test('EM-15: lot etiketi stokun lot etiketi içeriğini basar; boş alan basılmaz, miktar Türkçe yazılır, tarih tesis günüdür', () => {
    const e = {
      lotNo: 'LT-000777', malzemeId: 1001, malzemeAd: 'Örnek mil', malzemeKod: 'ORN-0001', malzemeTuru: 'yarimamul' as const, tedarikciPartiNo: 'P-9', dokumNo: null, sertifikaNo: 'S-1',
      giris: '2026-10-18T22:30:00.000Z', miktar: '12.5000', birim: 'kg', belgeNo: 'MK-000045',
    };
    assert.deepEqual(lotDegerleri(e), {
      qr: 'LOT:LT-000777', lotNo: 'LT-000777', malzeme: 'Örnek mil · ORN-0001', kart: 'Kart 1001 · Yarı mamul',
      parti: 'Parti P-9 · Sertifika S-1', giris: '19.10.2026 · 12,5 kg · MK-000045',
    });
    const yalin = lotDegerleri({ ...e, malzemeAd: null, malzemeKod: null, malzemeTuru: null, tedarikciPartiNo: null, sertifikaNo: null, miktar: null, birim: null, belgeNo: null });
    assert.equal(yalin['malzeme'], null);
    assert.equal(yalin['parti'], null);
    assert.equal(yalin['kart'], 'Kart 1001', 'türü bilinmeyen kartta tür adı basılmaz (271 a)');
    assert.equal(yalin['giris'], '19.10.2026');
    assert.equal(lotDegerleri({ ...e, miktar: '40.0000', birim: null })['giris'], '19.10.2026 · 40 · MK-000045');
  });

  test('EM-16: istasyon etiketi istasyonun stok konum kodunu LOC önekiyle ve istasyon adını basar', () => {
    assert.deepEqual(istasyonDegerleri('IST-CNC-01', 'Deneme tezgâhı'), { qr: 'LOC:IST-CNC-01', kod: 'IST-CNC-01', ad: 'Deneme tezgâhı' });
    assert.equal(istasyonDegerleri('IST-CNC-01', null)['ad'], null);
  });

  test('EM-20: raf etiketi raf kodunu RAF önekiyle basar; kodla aynı ad ve bilinmeyen ölçü basılmaz (#116)', () => {
    assert.deepEqual(rafDegerleri({ kod: 'A12', ad: 'Palet rafı', salonKodu: 'SALON1', bolmeSayisi: 6, katSayisi: 4 }),
      { qr: 'RAF:A12', kod: 'A12', ad: 'Palet rafı', yer: 'SALON1 · 6 bölme × 4 kat' });
    assert.deepEqual(rafDegerleri({ kod: 'A12', ad: 'A12', salonKodu: null, bolmeSayisi: 0, katSayisi: 0 }), { qr: 'RAF:A12', kod: 'A12', ad: null, yer: null });
  });

  test('EM-17: refakat kartı etiketi üretim emrinin refakat kartı içeriğini basar; QR emir kimliğidir, termin yoksa "yok", basım tesis günüdür', () => {
    const k = {
      emirId: 4512, qr: 'UE:4512', emirNo: 'UE-004512', urun: { kod: 'ORN-FL-01', ad: 'Örnek flanş' }, adet: 40, teslim: '2026-10-30',
      parti: { ustEmirNo: null, bolunmeSira: null },
      adimlar: [{ opNo: 10, ad: 'Torna', yer: 'Deneme tezgâhı', fason: false }, { opNo: 20, ad: 'Kaplama', yer: 'Deneme Fason', fason: true }, { opNo: 30, ad: 'Kontrol', yer: null, fason: false }],
    };
    assert.deepEqual(refakatDegerleri(k, new Date('2026-10-18T22:30:00.000Z')), {
      qr: 'UE:4512', emirNo: 'UE-004512', urunAd: 'Örnek flanş', urunKod: 'Parça no: ORN-FL-01', adetTermin: 'Adet 40 · Termin 30.10.2026',
      parti: 'Parti: Ana emir', basim: 'Basım 19.10.2026', adimlar: '10 Torna (Deneme tezgâhı) · 20 Kaplama (Deneme Fason, fason) · 30 Kontrol',
      rota: ['10 Torna (Deneme tezgâhı)', '20 Kaplama (Deneme Fason, fason)', '30 Kontrol'].join(SATIR_BASI), lot: null,
    });
    const alt = refakatDegerleri({ ...k, teslim: null, parti: { ustEmirNo: 'UE-004500', bolunmeSira: 2 }, adimlar: [] }, new Date('2026-10-19T08:00:00.000Z'));
    assert.deepEqual([alt['adetTermin'], alt['parti'], alt['adimlar']], ['Adet 40 · Termin yok', 'Parti: Alt parti 2 · üst UE-004500', null]);
    assert.equal(refakatDegerleri({ ...k, parti: { ustEmirNo: 'UE-004500', bolunmeSira: null } }, new Date())['parti'], 'Parti: Alt parti · üst UE-004500');
    // EM-20 (kart #127): refakat partisinin kartı aynı emir satırlarını, partinin QR'ını ve etiketini, lot satırını basar.
    const rp = refakatPartisiDegerleri(k, { qr: 'RP:7', etiket: 'UE-004512-P2' }, { lotNo: 'LT-000123', tedarikciPartiNo: null, dokumNo: 'D-01', sertifikaNo: 'S-01' }, new Date('2026-10-18T22:30:00.000Z'));
    assert.deepEqual([rp['qr'], rp['emirNo'], rp['lot'], rp['urunAd'], rp['adimlar']], ['RP:7', 'UE-004512-P2', 'Lot LT-000123 · Döküm D-01 · Sertifika S-01', 'Örnek flanş', refakatDegerleri(k, new Date())['adimlar']]);
    assert.equal(refakatPartisiDegerleri(k, { qr: 'RP:7', etiket: 'x' }, { lotNo: 'LT-1', tedarikciPartiNo: 'P-9', dokumNo: null, sertifikaNo: null }, new Date())['lot'], 'Lot LT-1 · Parti P-9');
    assert.deepEqual([kayitSablonTuru('refakat-partisi'), kayitSablonTuru('mal-kabul')], ['refakat', 'lot']);
    assert.equal(kayitUyumHatasi('refakat', 'refakat-partisi'), null, 'refakat partisi refakat şablonuyla basılır');
  });

  test('Kart #707: refakat şablonu rotayı adım başına satır basar; QR çevresinde dört modülden az boşluk kalmaz', () => {
    const s = HAZIR_SABLONLAR.find((x) => x.anahtar === 'refakat-100x150')!;
    const ogeler = yerlesim(s, ORNEK_DEGERLER.refakat, false);
    const rota = ogeler.find((o) => o.tur === 'metin' && o.satirlar[0] === '10 Torna (Örnek tezgâh)');
    assert.deepEqual(rota?.tur === 'metin' && rota.satirlar, ['10 Torna (Örnek tezgâh)', '20 Kaplama (Örnek fason,', 'fason)', '30 Son kontrol']);
    const qr = ogeler.find((o) => o.tur === 'qr');
    assert.ok(qr?.tur === 'qr');
    const modul = qr.boyut / (qr.kareler.length + 2 * QR_KENAR_MODUL);
    const kenar = QR_KENAR_MODUL * modul;
    const kutular = s.ogeler.filter((o) => o.tur !== 'qr').map((o) => ({ x: o.x, y: o.y, g: o.genislik, h: o.yukseklik }));
    const bosluk = Math.min(qr.x, qr.y, s.genislik - qr.x - qr.boyut, s.yukseklik - qr.y - qr.boyut, ...kutular.map((k) => {
      const dx = Math.max(k.x - (qr.x + qr.boyut), qr.x - (k.x + k.g), 0);
      const dy = Math.max(k.y - (qr.y + qr.boyut), qr.y - (k.y + k.h), 0);
      return Math.max(dx, dy);
    }));
    assert.ok(kenar + bosluk >= 4 * modul, `sessiz bölge ${((kenar + bosluk) / modul).toFixed(1)} modül`);
  });

  test('EM-18: malzeme etiketi kartın adını, stok kodunu ve MLZ önekli kart no QR kodunu basar (stok/Etiketler.tsx ile aynı)', () => {
    assert.deepEqual(malzemeDegerleri({ id: 1001, kod: 'ORN-0001', ad: 'Örnek mil' }), { qr: 'MLZ:1001', ad: 'Örnek mil', kod: 'ORN-0001', kart: 'Kart 1001' });
    assert.equal(malzemeDegerleri({ id: 1001, kod: 'ORN-0001', ad: null })['ad'], null);
  });
});
