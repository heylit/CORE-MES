import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { agAraliklariniCoz } from '#paylasilan/ag-araligi.ts';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';
import { QR_KENAR_MODUL, SATIR_ARALIGI, type Sablon } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { yaziciAgiOku } from './ag.ts';
import { QR_ALTI_EN_KUCUK_YAZI, kopyaDegerleri, qrAltiYeri } from './kurallar.ts';
import { BEKLEYEN_GUN, HATALI_KARAR_SIMGESI, KALITE_KARAR_SIMGESI, REFAKAT_ADIM_SAYISI, REFAKAT_CIKIS_SATIRI, bekleyenBaslangici, bekleyenSirasi, kaliteBekleyenleri, kaliteDurumDegerleri, hataliBekleyenleri, malKabulBekleyenleri, refakatBekleyenleri } from './kurallar.ts';
import { alanDegeri, baskiEngeli, dogrudanBaskiDurumu, indirmeEngeli, istasyonDegerleri, kayitUyumHatasi, konumDegerleri, lotDegerleri, kayitSablonTuru, malzemeDegerleri, noktaya, rafDegerleri, refakatDegerleri, refakatPartisiDegerleri, toplamEtiketHatasi, yaziciAdresHatasi, qrDikdortgenleri, qrMatrisi, sablonHatalari, sadelestir, SATIR_BASI, satirlaraBol, sigdirilmisYazi, yerlesim } from './kurallar.ts';
import { ALANLAR, HAZIR_SABLONLAR, ORNEK_DEGERLER } from './sablonlar.ts';
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

  test('EM-34 (2885-1 a): QR\'ın metni QR\'ın altına basılır ve elle girişte aynı kod çözülür; yer varsa QR küçülmez, yoksa kendi kutusunda küçülür', () => {
    const qr = { tur: 'qr' as const, x: 2, y: 2, boyut: 20, alan: 'qr' };
    const [q, yazi] = yerlesim(sablon([qr], 50, 25), { qr: 'LOC:A01-02-3' }, false);
    assert.ok(q?.tur === 'qr' && q.boyut === 20 && q.x === 2);
    assert.ok(yazi?.tur === 'metin');
    assert.deepEqual(yazi.satirlar, ['LOC:A01-02-3']);
    assert.ok(yazi.y >= 22 && yazi.y + yazi.yaziMm <= 25 && yazi.yaziMm >= QR_ALTI_EN_KUCUK_YAZI);
    assert.deepEqual(kodTuru(yazi.satirlar.join('')), { tur: 'konum', deger: 'A01-02-3' });
    // Altında başka öğe varsa yazı ona binmez: QR kutusunun içinde küçülür, yazı kutunun içinde kalır.
    const dolu = yerlesim(sablon([qr, metin('ad', 2, 22.2, 20, 2, 1.8)], 50, 25), { qr: 'LOC:A01-02-3', ad: 'x' }, false);
    const [q2, y2] = dolu;
    assert.ok(q2?.tur === 'qr' && q2.boyut < 20 && q2.boyut >= 20 - 2.5 && q2.y === 2);
    assert.ok(y2?.tur === 'metin' && y2.satirlar.join('') === 'LOC:A01-02-3' && y2.y + y2.yaziMm <= 22 + 1e-9);
    // Yasak: QR'sız (boş değer) etikete kod yazılmaz.
    assert.equal(yerlesim(sablon([qr], 50, 25), { qr: null }, false).length, 0);
    // Bütün hazır şablonlarda kod QR'ın altında, etiketin ve QR kutusunun ya da altındaki boş yerin içinde.
    for (const s of HAZIR_SABLONLAR) {
      const kutu = s.ogeler.find((o) => o.tur === 'qr');
      assert.ok(kutu?.tur === 'qr', s.anahtar);
      const y = yerlesim(s, ORNEK_DEGERLER[s.tur], false);
      const i = y.findIndex((o) => o.tur === 'qr');
      const k = y[i];
      const alt = y[i + 1];
      assert.ok(k?.tur === 'qr' && alt?.tur === 'metin' && alt.satirlar.join('') === k.veri, s.anahtar);
      assert.ok(alt.y >= k.y + k.boyut && alt.y + alt.yaziMm <= kutu.y + kutu.boyut + Math.max(0, qrAltiYeri(s, kutu)) + 0.15 + 1e-9, s.anahtar);
      assert.ok(k.boyut >= kutu.boyut - 2.5, s.anahtar);
    }
  });

  test('2922 a: istasyon etiketi yer etiketinin teslim yeri boyudur; anahtar, tür ve QR (LOC) değişmez', () => {
    const yer = HAZIR_SABLONLAR.filter((s) => s.tur === 'konum' || s.tur === 'istasyon').map((s) => [s.anahtar, s.ad, s.tur]);
    assert.deepEqual(yer, [['konum-50x25', 'Yer 50x25', 'konum'], ['konum-100x50', 'Yer 100x50', 'konum'], ['istasyon-100x50', 'Yer 100x50 · Teslim yeri', 'istasyon']]);
    const istasyon = HAZIR_SABLONLAR.find((s) => s.anahtar === 'istasyon-100x50')!;
    const metinler = istasyon.ogeler.flatMap((o) => (o.tur === 'metin' && o.alan.startsWith('=') ? [o.alan.slice(1)] : []));
    assert.ok(metinler.includes('TESLİM') && metinler.includes('TESLİM YERİ · İSTASYON'), metinler.join(', '));
    assert.ok(istasyon.ogeler.some((o) => o.tur === 'qr' && o.alan === 'qr'));
  });

  test('2922 a: yer etiketlerinin sabit yazıları örnek değerlerle kesilmeden basılır', () => {
    for (const s of HAZIR_SABLONLAR.filter((x) => x.tur === 'konum' || x.tur === 'istasyon')) {
      const kesik = yerlesim(s, ORNEK_DEGERLER[s.tur], false).flatMap((o) => (o.tur === 'metin' ? o.satirlar.filter((x) => x.endsWith('...')) : []));
      assert.deepEqual(kesik, [], s.anahtar);
    }
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
    const beklenen = { konum: 'konum', raf: 'raf', malzeme: 'malzeme', lot: 'lot', refakat: 'uretim-emri', istasyon: 'konum', 'kalite-durum': 'lot', 'hatali-parca': 'uretim-emri', 'sevk-koli': 'uretim-emri', deneme: 'konum' } as const;
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

  test('kod satıra sığmazsa ortadan bölünmez: yazı küçülür, o da yetmezse ayıraçtan bölünür', () => {
    // Yer 50x25'te kod 24,5 mm, 4 mm yazıyla 10 harf alır; 11 harflik kod küçülen yazıyla tek satırdır.
    const konum = HAZIR_SABLONLAR.find((s) => s.anahtar === 'konum-50x25');
    assert.ok(konum);
    const kod = yerlesim(konum, { qr: 'LOC:ORN-ZEMIN-1', kod: 'ORN-ZEMIN-1' }, false).find((o) => o.tur === 'metin' && o.satirlar.join('').startsWith('ORN'));
    assert.equal(kod?.tur === 'metin' && kod.satirlar.join('|'), 'ORN-ZEMIN-1');
    assert.equal(kod?.tur === 'metin' && kod.yaziMm < 4 && kod.yaziMm >= 4 * 0.6, true);
    assert.match(zpl({ genislik: 50, yukseklik: 25, dpi: 203, adet: 1, ogeler: konum ? yerlesim(konum, { kod: 'ORN-ZEMIN-1' }, false) : [] }), /\^FDORN-ZEMIN-1\^FS/);
    // Sığan kodun ve boşluklu metnin boyu değişmez.
    assert.equal(sigdirilmisYazi('OA-01-01', 24, 4), 4);
    assert.equal(sigdirilmisYazi('Örnek uzun malzeme adı', 24, 4), 4);
    // Okunurluk sınırının altına inilmez: tasarım boyunda kalır ve son sığan ayıraçtan bölünür.
    assert.equal(sigdirilmisYazi('ORN-DEPO-ZEMIN-0001', 24, 4), 4);
    assert.deepEqual(satirlaraBol('ORN-DEPO-ZEMIN-0001', 24, 10, 4), ['ORN-DEPO-', 'ZEMIN-0001']);
    assert.deepEqual(satirlaraBol('ABCDEFGHIJ', 9, 20, 3), ['ABCDE', 'FGHIJ'], 'ayıraç yoksa satır sonundan');
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
    // Sabit tür adı ve alt başlık basılır; değeri olmayan ad ve yer de başlıkları da basılmaz (EM-4, EM-26).
    assert.deepEqual(ogeler.filter((o) => o.tur === 'metin').map((o) => o.satirlar), [['LOC:R1-02-3-1'], ['KONUM'], ['STOK KONUMU'], ['R1-02-3-1']]);
    assert.equal(ogeler.find((o) => o.tur === 'qr')?.veri, 'LOC:R1-02-3-1');
    // Stoktaki en uzun kod (20 karakter) konum ve istasyon şablonlarında kesilmez.
    const uzun = 'ABCDEFGHIJ-123456789';
    for (const s of HAZIR_SABLONLAR.filter((x) => x.tur === 'konum' || x.tur === 'istasyon')) {
      const kodOgesi = yerlesim(s, { ...konumDegerleri(uzun), ad: null }, false).find((o) => o.tur === 'metin' && o.satirlar.join('').startsWith('ABC'));
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
      emirId: 4512, qr: 'UE:4512', emirNo: 'UE-004512', urun: { kod: 'ORN-FL-01', ad: 'Örnek flanş' }, revizyon: null, adet: 40, teslim: '2026-10-30',
      parti: { ustEmirNo: null, bolunmeSira: null },
      adimlar: [{ opNo: 10, ad: 'Torna', yer: 'Deneme tezgâhı', fason: false }, { opNo: 20, ad: 'Kaplama', yer: 'Deneme Fason', fason: true }, { opNo: 30, ad: 'Kontrol', yer: null, fason: false }],
    };
    const tam = refakatDegerleri(k, new Date('2026-10-18T22:30:00.000Z'));
    assert.deepEqual(Object.fromEntries(Object.entries(tam).filter(([a]) => !/^adim\d/.test(a) && a !== 'adet' && a !== 'termin')), {
      qr: 'UE:4512', emirNo: 'UE-004512', urunAd: 'Örnek flanş', urunKod: 'Parça no: ORN-FL-01', adetTermin: 'Adet 40 · Termin 30.10.2026',
      parti: null, basim: 'Basım 19.10.2026', adimlar: '10 Torna (Deneme tezgâhı) · 20 Kaplama (Deneme Fason, fason) · 30 Kontrol',
      rota: ['10 Torna (Deneme tezgâhı)', '20 Kaplama (Deneme Fason, fason)', '30 Kontrol'].join(SATIR_BASI), lot: null, lotNo: null, lotEk: null, revizyon: null,
    });
    // 2907 D4: revizyon kodu "Rev <kod>" ayrı alanda; parça no satırı değişmez.
    assert.deepEqual([refakatDegerleri({ ...k, revizyon: '03' }, new Date())['revizyon'], refakatDegerleri({ ...k, revizyon: '03' }, new Date())['urunKod']], ['Rev 03', 'Parça no: ORN-FL-01']);
    // EM-27: işlem satırları ayrı alanlarda; fason işlem kamyon piktogramıyla; adet ve termin ayrı.
    assert.deepEqual([tam['adet'], tam['termin'], tam['adim1No'], tam['adim1Ad'], tam['adim1Yer'], tam['adim1Simge']], ['40', '30.10.2026', '10', 'Torna', 'Deneme tezgâhı', 'siyah:tezgah']);
    assert.deepEqual([tam['adim2Yer'], tam['adim2Simge'], tam['adim3Yer'], tam['adim4No'], tam['adim4Simge']], ['Deneme Fason · fason', 'siyah:fason', null, null, null]);
    // 2907: işaret yalnız fason işlemde; son işlemin altında çıkış satırı (no ve yer yok, bayrak işareti).
    assert.deepEqual([tam['adim1Isaret'], tam['adim2Isaret'], tam['adim3Isaret'], tam['adim4Ad'], tam['adim4Isaret'], tam['adim5Ad']],
      [null, 'siyah:fason', null, REFAKAT_CIKIS_SATIRI, 'siyah:bayrak', null]);
    const alt = refakatDegerleri({ ...k, teslim: null, parti: { ustEmirNo: 'UE-004500', bolunmeSira: 2 }, adimlar: [] }, new Date('2026-10-19T08:00:00.000Z'));
    assert.deepEqual([alt['adetTermin'], alt['parti'], alt['adimlar'], alt['termin'], alt['adim1Ad']], ['Adet 40 · Termin yok', 'Alt parti 2 · üst UE-004500', null, null, null]);
    // Kartta REFAKAT_ADIM_SAYISI satır var: fazla işlemde son satır kalanları sayar, no ve piktogram basılmaz.
    const cok = refakatDegerleri({ ...k, adimlar: Array.from({ length: 12 }, (_, i) => ({ opNo: (i + 1) * 10, ad: `İş ${i + 1}`, yer: null, fason: false })) }, new Date());
    assert.deepEqual([cok[`adim${REFAKAT_ADIM_SAYISI - 1}Ad`], cok[`adim${REFAKAT_ADIM_SAYISI}Ad`], cok[`adim${REFAKAT_ADIM_SAYISI}No`], cok[`adim${REFAKAT_ADIM_SAYISI}Simge`]],
      [`İş ${REFAKAT_ADIM_SAYISI - 1}`, `+${12 - REFAKAT_ADIM_SAYISI + 1} işlem daha`, null, null]);
    assert.equal(Object.values(cok).filter((v) => v === REFAKAT_CIKIS_SATIRI).length, 0, 'satırlar dolunca çıkış satırı basılmaz');
    const onBir = refakatDegerleri({ ...k, adimlar: Array.from({ length: REFAKAT_ADIM_SAYISI + 1 }, (_, i) => ({ opNo: (i + 1) * 10, ad: `İş ${i + 1}`, yer: null, fason: false })) }, new Date());
    assert.equal(onBir[`adim${REFAKAT_ADIM_SAYISI}Ad`], '+2 işlem daha', 'on bir işlemde son satır iki işlemi sayar');
    const tamDolu = refakatDegerleri({ ...k, adimlar: Array.from({ length: REFAKAT_ADIM_SAYISI }, (_, i) => ({ opNo: (i + 1) * 10, ad: `İş ${i + 1}`, yer: null, fason: false })) }, new Date());
    assert.deepEqual([tamDolu[`adim${REFAKAT_ADIM_SAYISI}Ad`], Object.values(tamDolu).includes(REFAKAT_CIKIS_SATIRI)], [`İş ${REFAKAT_ADIM_SAYISI}`, false]);
    assert.equal(refakatDegerleri({ ...k, parti: { ustEmirNo: 'UE-004500', bolunmeSira: null } }, new Date())['parti'], 'Alt parti · üst UE-004500');
    // EM-20 (kart #127): refakat partisinin kartı aynı emir satırlarını, partinin QR'ını ve etiketini, lot satırını basar.
    const rp = refakatPartisiDegerleri(k, { qr: 'RP:7', etiket: 'UE-004512-P2' }, { lotNo: 'LT-000123', tedarikciPartiNo: null, dokumNo: 'D-01', sertifikaNo: 'S-01' }, new Date('2026-10-18T22:30:00.000Z'));
    assert.deepEqual([rp['qr'], rp['emirNo'], rp['lot'], rp['urunAd'], rp['adimlar']], ['RP:7', 'UE-004512-P2', 'Lot LT-000123 · Döküm D-01 · Sertifika S-01', 'Örnek flanş', refakatDegerleri(k, new Date())['adimlar']]);
    assert.deepEqual([rp['lotNo'], rp['lotEk']], ['LT-000123', 'Döküm D-01 · Sertifika S-01']);
    const p9 = refakatPartisiDegerleri(k, { qr: 'RP:7', etiket: 'x' }, { lotNo: 'LT-1', tedarikciPartiNo: 'P-9', dokumNo: null, sertifikaNo: null }, new Date());
    assert.deepEqual([p9['lot'], p9['lotNo'], p9['lotEk']], ['Lot LT-1 · Parti P-9', 'LT-1', 'Tedarikçi partisi P-9']);
    assert.equal(refakatPartisiDegerleri(k, { qr: 'RP:7', etiket: 'x' }, { lotNo: 'LT-1', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null }, new Date())['lotEk'], null);
    assert.deepEqual([kayitSablonTuru('refakat-partisi'), kayitSablonTuru('mal-kabul')], ['refakat', 'lot']);
    assert.equal(kayitUyumHatasi('refakat', 'refakat-partisi'), null, 'refakat partisi refakat şablonuyla basılır');
  });

  test('Kart #707, EM-27, 2907: refakat şablonu her işlemi kendi satırında basar, boş satır basılmaz, adım başına imza yok; QR çevresinde dört modülden az boşluk kalmaz', () => {
    const s = HAZIR_SABLONLAR.find((x) => x.anahtar === 'refakat-100x150')!;
    const ogeler = yerlesim(s, ORNEK_DEGERLER.refakat, false);
    const metinler = ogeler.flatMap((o) => (o.tur === 'metin' ? [o.satirlar.join(' ')] : []));
    for (const m of ['10', 'Torna', 'Örnek tezgâh', '20', 'Kaplama', 'Örnek fason · fason', '30', 'Son kontrol', REFAKAT_CIKIS_SATIRI, 'LT-000123', 'Döküm D-01 · Sertifika S-01']) {
      assert.ok(metinler.includes(m), m);
    }
    // 2907-1 a: adım başına imza kutusu yok; 2932: elle kayıt kutusu da yok. "Parti" sözcüğü ana emirde basılmaz.
    assert.equal(metinler.filter((m) => m.includes('İMZA')).length, 0);
    assert.equal(metinler.filter((m) => m.startsWith('ELLE KAYIT')).length, 0);
    assert.equal(metinler.filter((m) => m.includes('Parti')).length, 0);
    // Atölye D1: adet kutusu emrin adedidir.
    assert.ok(metinler.includes('EMİR ADEDİ'));
    // 2932: on işlem satırı; QR boyutu okutma mesafesi için sabit. On satır alt çizginin (137,4 mm) üstünde biter.
    assert.equal(REFAKAT_ADIM_SAYISI, 10);
    const satirAd = s.ogeler.find((o) => o.tur === 'metin' && o.alan === `adim${REFAKAT_ADIM_SAYISI}Ad`);
    assert.ok(satirAd?.tur === 'metin' && satirAd.y + 5.4 < 137.4);
    assert.equal(ogeler.find((o) => o.tur === 'qr')?.boyut, 37.5);
    // İşaret yalnız fason satırında ve çıkış satırında; boş satırın çizgisi basılmaz.
    assert.deepEqual(ogeler.filter((o) => o.tur === 'simge').map((o) => o.tur === 'simge' && `${o.karo}:${o.ad}`), ['siyah:refakat', 'siyah:fason', 'siyah:bayrak']);
    assert.equal(ogeler.filter((o) => o.tur === 'kutu' && o.yukseklik === 0.2).length, 4, 'dolu üç işlem ve çıkış satırının çizgisi');
    // Lotsuz kart (emrin kendi kartı): siyah lot bandı ve LOT başlığı basılmaz.
    const lotsuz = yerlesim(s, { ...ORNEK_DEGERLER.refakat, lotNo: null, lotEk: null }, false);
    assert.equal(lotsuz.filter((o) => o.tur === 'kutu' && o.genislik === 100).length, 0);
    assert.ok(!lotsuz.some((o) => o.tur === 'metin' && o.satirlar.join(' ') === 'LOT'));
    const qr = ogeler.find((o) => o.tur === 'qr');
    assert.ok(qr?.tur === 'qr');
    const modul = qr.boyut / (qr.kareler.length + 2 * QR_KENAR_MODUL);
    const kenar = QR_KENAR_MODUL * modul;
    const kutular = s.ogeler.filter((o) => o.tur !== 'qr').map((o) => (o.tur === 'simge' ? { x: o.x, y: o.y, g: o.boyut, h: o.boyut } : { x: o.x, y: o.y, g: o.genislik, h: o.yukseklik }));
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

  test('EM-26: koşullu öğe yalnız koşul alanı doluyken basılır; simge değeri tanınmazsa basılmaz', () => {
    const s = sablon([
      { tur: 'metin', x: 1, y: 1, genislik: 20, yukseklik: 3, yaziMm: 2, kalin: false, alan: '=AD', kosul: 'ad' },
      { tur: 'kutu', x: 0, y: 0, genislik: 50, yukseklik: 25, kalinlik: 2, kosul: 'red' },
      { tur: 'simge', x: 30, y: 1, boyut: 10, alan: 'simge' },
    ]);
    assert.deepEqual(yerlesim(s, { ad: null, red: null, simge: 'siyah:lot' }, false).map((o) => o.tur), ['simge']);
    assert.deepEqual(yerlesim(s, { ad: 'Var', red: 'evet', simge: 'mor:lot' }, false).map((o) => o.tur), ['metin', 'kutu']);
    assert.deepEqual(yerlesim(s, { ad: null, red: null, simge: 'beyaz:yok-boyle' }, false), []);
    assert.deepEqual(sablonHatalari(sablon([{ tur: 'simge', x: 45, y: 1, boyut: 10, alan: '=siyah:lot' }])), ['1. öğe etiketin dışına taşıyor.']);
  });

  test('EM-25: piktogram ve ters yazı iki dilde de kutu ve ters komutuyla gider; ters yazıda kalın için ikinci baskı yok', () => {
    const s = sablon([
      { tur: 'simge', x: 1, y: 1, boyut: 10, alan: '=siyah:lot' },
      { tur: 'metin', x: 20, y: 1, genislik: 28, yukseklik: 4, yaziMm: 3, kalin: true, alan: '=KOLİ', ters: true },
    ]);
    const ogeler = yerlesim(s, {}, false);
    const z = zpl({ genislik: 50, yukseklik: 25, dpi: 203, adet: 1, ogeler });
    assert.ok(z.split('\n').filter((x) => x.includes('^GB')).length > 5, 'piktogram kutularla basılır');
    assert.equal(z.split('\n').filter((x) => x.includes('^FR')).length, 1);
    assert.doesNotMatch(z, /\^GF/);
    const p = pplb({ genislik: 50, yukseklik: 25, dpi: 203, adet: 1, ogeler });
    assert.ok(p.split('\n').filter((x) => x.startsWith('LO')).length > 5);
    assert.equal(p.split('\n').filter((x) => x.startsWith('A')).length, 1);
    assert.match(p, /^A\d+,\d+,0,\d,\d,\d,R,"KOLİ"$/m);
  });

  test('EM-28 (2168-3 a): karar karosu karara göre; red etiketin tamamı kalın çerçeve alır', () => {
    assert.deepEqual(KALITE_KARAR_SIMGESI, { karar_bekliyor: 'cizgili:bekliyor', serbest: 'beyaz:onay', sartli: 'siyah:uyari', red: 'siyah:red' });
    assert.deepEqual(HATALI_KARAR_SIMGESI, { bekliyor: 'cizgili:bekliyor', kabul: 'beyaz:onay', sartli_kabul: 'siyah:uyari', rework: 'beyaz:rework', hurda: 'siyah:hurda', red: 'siyah:red' });
    const e = { lotNo: 'LT-1', malzemeId: 1, malzemeAd: 'Örnek', malzemeKod: 'ORN', birim: 'kg', konumKod: 'A1', miktar: '5.0000' };
    const s = HAZIR_SABLONLAR.find((x) => x.anahtar === 'kalite-durum-100x50')!;
    const red = yerlesim(s, kaliteDurumDegerleri({ ...e, kaliteDurumu: 'red' }), false);
    const serbest = yerlesim(s, kaliteDurumDegerleri({ ...e, kaliteDurumu: 'serbest' }), false);
    const cerceve = (o: (typeof red)[number]) => o.tur === 'kutu' && o.genislik === 100 && o.yukseklik === 50;
    assert.equal(red.filter(cerceve).length, 1);
    assert.equal(serbest.filter(cerceve).length, 0);
    assert.deepEqual(serbest.filter((o) => o.tur === 'simge').map((o) => o.tur === 'simge' && `${o.karo}:${o.ad}`), ['beyaz:onay', 'yok:kalite']);
    // QR kutusu 34 mm (2168-2 b); altındaki kod satırı kadar küçülür (2885-1 a).
    assert.equal(serbest.find((o) => o.tur === 'qr')?.tur === 'qr' && (serbest.find((o) => o.tur === 'qr') as { boyut: number }).boyut, 31.65);
  });

  test('2168: her hazır şablonun sağ üst köşesinde piktogram var ve örnek değerle basılır', () => {
    for (const s of HAZIR_SABLONLAR) {
      const ogeler = yerlesim(s, ORNEK_DEGERLER[s.tur], false);
      const sag = ogeler.filter((o) => o.tur === 'simge' && o.x + o.boyut >= s.genislik - 3 && o.y <= 3 && o.karo !== 'yok');
      assert.equal(sag.length, 1, s.anahtar);
    }
  });
});

describe('EM-30 (2223-1 a): bekleyen etiketler', () => {
  test('aralık başlangıcı BEKLEYEN_GUN geriye', () => {
    assert.equal(BEKLEYEN_GUN, 30);
    assert.equal(bekleyenBaslangici(new Date('2026-11-07T12:00:00.000Z')), '2026-10-08T12:00:00.000Z');
  });

  test('mal kabul: kabulden sonra basılmamış lot sayılır; önceki basım saymaz; hepsi basılınca liste dışı; yinelenen lot bir kez', () => {
    const kabul = { malKabulId: 7, no: 'MK-000007', irsaliyeNo: null, zaman: '2026-11-07T10:00:00.000Z', partiIdler: [1, 2, 2, 3] };
    const basim = new Map([[1, '2026-11-07T10:05:00.000Z'], [2, '2026-11-06T09:00:00.000Z']]);
    assert.deepEqual(malKabulBekleyenleri([kabul], basim), [
      { tur: 'mal-kabul', id: 7, baslik: 'MK-000007', ayrinti: '2/3 lot etiketi basılmadı', zaman: kabul.zaman, etiketSayisi: 2 },
    ]);
    const hepsi = new Map([1, 2, 3].map((p) => [p, '2026-11-07T10:00:00.000Z']));
    assert.deepEqual(malKabulBekleyenleri([kabul], hepsi), [], 'aynı anda basım basılmış sayılır');
    assert.equal(malKabulBekleyenleri([{ ...kabul, irsaliyeNo: 'IRS-1' }], new Map())[0]?.ayrinti, '3/3 lot etiketi basılmadı · İrsaliye IRS-1');
  });

  test('kalite: durum değiştikten sonra basılmayan satır bekler; başlık lot ve konum, ayrıntı durum adı ve malzeme', () => {
    const d = { bakiyeId: 9, lotNo: 'LT-1', malzemeAd: 'Örnek mil', konumKod: 'KAR', kaliteDurumu: 'sartli' as const, degisim: '2026-11-07T10:00:00.000Z' };
    assert.deepEqual(kaliteBekleyenleri([d], new Map([[9, '2026-11-07T09:59:59.000Z']])), [
      { tur: 'kalite-durum', id: 9, baslik: 'LT-1 KAR', ayrinti: 'ŞARTLI KABUL · Örnek mil', zaman: d.degisim, etiketSayisi: 1 },
    ]);
    assert.deepEqual(kaliteBekleyenleri([d], new Map([[9, '2026-11-07T10:00:01.000Z']])), []);
    assert.equal(kaliteBekleyenleri([{ ...d, malzemeAd: null, kaliteDurumu: 'red' }], new Map())[0]?.ayrinti, 'RED');
  });

  test('EM-31 (2223-4 a): basılmayacak işareti olaydan sonraysa kayıt düşer; olay işaretten sonraysa yeniden bekler', () => {
    const kabul = { malKabulId: 7, no: 'MK-000007', irsaliyeNo: null, zaman: '2026-11-07T10:00:00.000Z', partiIdler: [1] };
    assert.deepEqual(malKabulBekleyenleri([kabul], new Map(), new Map([[7, '2026-11-07T10:01:00.000Z']])), []);
    assert.equal(malKabulBekleyenleri([kabul], new Map(), new Map([[7, '2026-11-07T09:59:00.000Z']])).length, 1, 'eski işaret yeni kabulü düşürmez');
    assert.equal(malKabulBekleyenleri([kabul], new Map(), new Map([[8, '2026-11-07T10:01:00.000Z']])).length, 1, 'başka kabulün işareti saymaz');
    const d = { bakiyeId: 9, lotNo: 'LT-1', malzemeAd: null, konumKod: 'KAR', kaliteDurumu: 'red' as const, degisim: '2026-11-07T10:00:00.000Z' };
    assert.deepEqual(kaliteBekleyenleri([d], new Map(), new Map([[9, '2026-11-07T10:00:00.000Z']])), []);
    assert.equal(kaliteBekleyenleri([{ ...d, degisim: '2026-11-07T11:00:00.000Z' }], new Map(), new Map([[9, '2026-11-07T10:00:00.000Z']])).length, 1,
      'durum işaretten sonra yeniden değişince geri gelir');
  });

  test('EM-32 (2223-2 a): refakat kartı verilişten sonra emrin kartı basılmadıysa bekler; başlık emir no-P sıra', () => {
    const v = { refakatPartisiId: 5, uretimEmriId: 120, sira: 2, lotNo: 'LT-9', malzemeAd: 'Örnek çubuk', emirNo: 'UE-000120', verilis: '2026-11-07T10:00:00.000Z' };
    assert.deepEqual(refakatBekleyenleri([v], new Map()), [
      { tur: 'refakat-partisi', id: 5, baslik: 'UE-000120-P2', ayrinti: 'Lot LT-9 · Örnek çubuk', zaman: v.verilis, etiketSayisi: 2 },
    ]);
    assert.deepEqual(refakatBekleyenleri([v], new Map([[120, '2026-11-07T10:00:01.000Z']])), []);
    assert.equal(refakatBekleyenleri([v], new Map([[5, '2026-11-07T10:00:01.000Z']])).length, 1, 'basım emir kimliğiyle aranır');
    assert.deepEqual(refakatBekleyenleri([v], new Map(), new Map([[5, '2026-11-07T10:00:01.000Z']])), []);
    assert.equal(refakatBekleyenleri([{ ...v, emirNo: null, malzemeAd: null }], new Map())[0]?.baslik, 'Emir #120-P2');
  });

  test('EM-33 (2223-2 a): hatalı parça ayrılınca ve rework/hurda/red kararıyla bekler; kabul beklemez; aralık dışı olay sayılmaz', () => {
    const h = {
      id: 3, uretimEmri: { id: 1, emirNo: 'UE-000001', parcaNo: 'X', parcaAd: 'Y' }, isEmri: { id: 2, opNo: 20, ad: 'Freze' },
      hurdaNedeni: { id: 1, kod: 'H', ad: 'Çapak' }, adet: 2, zaman: '2026-11-07T08:00:00.000Z', karar: null, kararZamani: null,
    };
    const bas = '2026-10-08T12:00:00.000Z';
    assert.deepEqual(hataliBekleyenleri([h], bas, new Map()), [
      { tur: 'hatali-parca', id: 3, baslik: 'UE-000001 OP 20', ayrinti: 'KARAR BEKLİYOR · 2 adet · Çapak', zaman: h.zaman, etiketSayisi: 1 },
    ]);
    const red = { ...h, karar: 'red' as const, kararZamani: '2026-11-07T09:00:00.000Z' };
    assert.equal(hataliBekleyenleri([red], bas, new Map([[3, '2026-11-07T08:30:00.000Z']]))[0]?.zaman, red.kararZamani, 'karar ayrılmadaki basımdan sonra');
    assert.deepEqual(hataliBekleyenleri([red], bas, new Map([[3, '2026-11-07T09:30:00.000Z']])), []);
    assert.deepEqual(hataliBekleyenleri([{ ...red, karar: 'kabul' }], bas, new Map()), []);
    assert.deepEqual(hataliBekleyenleri([{ ...red, karar: 'sartli_kabul' }], bas, new Map()), []);
    assert.deepEqual(hataliBekleyenleri([{ ...h, zaman: '2026-10-01T00:00:00.000Z' }], bas, new Map()), [], 'aralık dışı');
    assert.deepEqual(hataliBekleyenleri([h], bas, new Map(), new Map([[3, '2026-11-07T08:00:00.000Z']])), []);
  });

  test('sıra yeniden eskiye; aynı anda tür ve kimlik', () => {
    const b = (tur: 'mal-kabul' | 'kalite-durum', id: number, zaman: string) => ({ tur, id, baslik: '', ayrinti: '', zaman, etiketSayisi: 1 });
    const liste = [b('mal-kabul', 1, '2026-11-01T00:00:00Z'), b('mal-kabul', 2, '2026-11-02T00:00:00Z'), b('kalite-durum', 3, '2026-11-02T00:00:00Z')];
    assert.deepEqual(liste.sort(bekleyenSirasi).map((x) => x.id), [3, 2, 1]);
  });
});

describe('2929 a: refakat kartı kopyaları', () => {
  test('adet kadar değer kümesi, her biri Kopya n/N; tek kopyada alan eklenmez', () => {
    const d = [{ qr: 'RP:1', emirNo: 'UE-1-P1' }, { qr: 'RP:2', emirNo: 'UE-2-P1' }];
    assert.deepEqual(kopyaDegerleri(d, 1), d);
    assert.deepEqual(kopyaDegerleri(d, 2).map((x) => [x.qr, x.kopya]), [['RP:1', 'Kopya 1/2'], ['RP:1', 'Kopya 2/2'], ['RP:2', 'Kopya 1/2'], ['RP:2', 'Kopya 2/2']]);
  });
});

describe('2907 D4: refakat kartında revizyon kodu', () => {
  test('Rev kopya satırında kendi kutusunda: uzun kod (Atölye N2: Rev 03-A1, Rev 2024-07-A1) ve Kopya 10/10 tam basılır, çakışmaz, karoya taşmaz; parça no tam genişlikte; kodsuz kartta Rev yok', () => {
    const s = HAZIR_SABLONLAR.find((x) => x.anahtar === 'refakat-100x150')!;
    const ogeler = yerlesim(s, { ...ORNEK_DEGERLER.refakat, urunKod: 'Parça no: ORN-FLANS-GOVDE-0001-ABCDE-XYZ', revizyon: 'Rev 03-A1', kopya: 'Kopya 10/10' }, false);
    const metinler = ogeler.flatMap((o) => (o.tur === 'metin' ? [o] : []));
    const rev = metinler.find((m) => m.satirlar.join(' ') === 'Rev 03-A1');
    const kopya = metinler.find((m) => m.satirlar.join(' ') === 'Kopya 10/10');
    const parca = metinler.find((m) => m.satirlar.join(' ').startsWith('Parça no:'));
    assert.ok(rev && kopya && parca, 'Rev, kopya ve parça no birlikte basılır');
    const kutu = (m: typeof rev) => ({ x0: m!.x, x1: m!.x + m!.genislik, y0: m!.y, y1: m!.y + m!.satirlar.length * m!.yaziMm * SATIR_ARALIGI });
    const kesisir = (a: ReturnType<typeof kutu>, b: ReturnType<typeof kutu>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    for (const [a, b] of [[rev, kopya], [rev, parca], [kopya, parca]] as const) assert.ok(!kesisir(kutu(a), kutu(b)), `${a!.satirlar[0]} ile ${b!.satirlar[0]}`);
    const karo = ogeler.find((o) => o.tur === 'simge');
    assert.ok(karo?.tur === 'simge' && kutu(rev).x1 <= karo.x, 'sağ üst karoya taşmaz');
    assert.equal(parca!.genislik, 52, 'parça no satırı daralmaz');
    const enUzun = yerlesim(s, { ...ORNEK_DEGERLER.refakat, revizyon: 'Rev 2024-07-A1', kopya: 'Kopya 10/10' }, false);
    assert.ok(enUzun.some((o) => o.tur === 'metin' && o.satirlar.join(' ') === 'Rev 2024-07-A1'), 'on dört karakterlik kod da tam');
    assert.ok(ALANLAR.refakat.some((a) => a.anahtar === 'revizyon'), 'kullanıcı şablonu revizyon alanını seçebilir');
    const kodsuz = yerlesim(s, { ...ORNEK_DEGERLER.refakat, revizyon: null }, false);
    assert.ok(!kodsuz.some((o) => o.tur === 'metin' && o.satirlar.join(' ').startsWith('Rev')));
  });
});
