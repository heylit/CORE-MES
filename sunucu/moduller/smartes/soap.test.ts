import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { kurumIciMi, smartesAyariOku, VARSAYILAN_AD_ALANI } from './ayar.ts';
import { faultMetni, skalerCevapMetni, tabloCevapMetni } from './sahte-smartes.ts';
import {
  cocuk, mantiksal, metinAlani, skalerSonucuOku, smartesTarihi, soapIstegiKur, tabloSatirlariniOku, tamSayi, tarihAlani, xmlAyristir, XmlHatasi, xmlKacir,
} from './soap.ts';

describe('SmartES ayarı (kart #778)', () => {
  test('SME-1: adres yoksa bağlantı kapalı (null)', () => {
    assert.equal(smartesAyariOku({}), null);
    assert.equal(smartesAyariOku({ TMIV2_SMARTES_ADRESI: '  ' }), null);
  });

  test('SME-1: kurum içi adres açar; ad alanı varsayılan ya da verilen, sonu / ile', () => {
    assert.deepEqual(smartesAyariOku({ TMIV2_SMARTES_ADRESI: 'http://10.1.2.3:81/Servis.asmx' }), { adres: 'http://10.1.2.3:81/Servis.asmx', adAlani: VARSAYILAN_AD_ALANI });
    assert.deepEqual(
      smartesAyariOku({ TMIV2_SMARTES_ADRESI: 'http://messrv:8080/Servis.asmx', TMIV2_SMARTES_AD_ALANI: 'http://ornek.local/ws' }),
      { adres: 'http://messrv:8080/Servis.asmx', adAlani: 'http://ornek.local/ws/' },
    );
  });

  test('SME-1 (ret): bozuk, kimlik ya da sorgu taşıyan adres açılışı durdurur; ileti değeri taşımaz', () => {
    const durumlar: Record<string, string>[] = [
      { TMIV2_SMARTES_ADRESI: 'ftp://10.0.0.9/a.asmx' },
      { TMIV2_SMARTES_ADRESI: 'adres-degil' },
      { TMIV2_SMARTES_ADRESI: 'http://k:p@10.0.0.9/a.asmx' },
      { TMIV2_SMARTES_ADRESI: 'http://10.0.0.9/a.asmx?WSDL' },
      { TMIV2_SMARTES_AD_ALANI: 'http://tempuri.org/' },
      { TMIV2_SMARTES_ADRESI: 'http://10.0.0.9/a.asmx', TMIV2_SMARTES_AD_ALANI: 'ad alani degil' },
    ];
    for (const env of durumlar) {
      assert.throws(() => smartesAyariOku(env), (h: Error) => /TMIV2_SMARTES_/.test(h.message) && !h.message.includes('10.0.0.9'), JSON.stringify(Object.keys(env)));
    }
  });

  test('SME-2: yalnız kurum içi adres; internete çıkan adres reddedilir (ADR 0013)', () => {
    for (const h of ['10.0.0.5', '172.20.1.1', '192.168.0.4', '127.0.0.1', 'localhost', 'messrv', '[::1]', '[fd00::5]']) assert.equal(kurumIciMi(h), true, h);
    for (const h of ['8.8.8.8', '172.32.0.1', 'mes.example.com', '[2001:db8::1]']) assert.equal(kurumIciMi(h), false, h);
    assert.throws(() => smartesAyariOku({ TMIV2_SMARTES_ADRESI: 'http://mes.example.com/a.asmx' }), /kurum içi/);
  });
});

describe('SOAP zarfı (kart #778)', () => {
  test('SME-3: zarf metodu ad alanıyla açar, SOAPAction tırnaklı, parametreler sırayla ve kaçırılmış', () => {
    const r = soapIstegiKur('WorkOrdersCreateUpdate', 'http://tempuri.org/', [
      ['WorkOrderNo', 'IE-1'], ['Description', 'A & B <c> "d" \'e\''], ['Quantity', 120], ['Multiplier', 1.5], ['IsPassive', false],
      ['DeliveryDatetime', null], ['WorkOrderDate', new Date('2026-10-07T05:00:00Z')],
    ]);
    assert.equal(r.soapAction, '"http://tempuri.org/WorkOrdersCreateUpdate"');
    assert.match(r.govde, /<WorkOrdersCreateUpdate xmlns="http:\/\/tempuri.org\/">/);
    assert.match(r.govde, /<Description>A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;<\/Description>/);
    assert.match(r.govde, /<Quantity>120<\/Quantity>/);
    assert.match(r.govde, /<Multiplier>1.5<\/Multiplier>/);
    assert.match(r.govde, /<IsPassive>false<\/IsPassive>/);
    assert.match(r.govde, /<DeliveryDatetime><\/DeliveryDatetime>/);
    // İstanbul +03:00; ofset yazılmaz.
    assert.match(r.govde, /<WorkOrderDate>2026-10-07T08:00:00<\/WorkOrderDate>/);
    assert.ok(r.govde.indexOf('WorkOrderNo') < r.govde.indexOf('Description'));
    // Kendi ayrıştırıcımız zarfı geri okur.
    const kok = xmlAyristir(r.govde);
    assert.equal(kok.ad, 'Envelope');
  });

  test('SME-3 (ret): metot ve parametre adı XML enjeksiyonu taşıyamaz; sonsuz sayı yazılmaz; denetim karakteri atılır', () => {
    assert.throws(() => soapIstegiKur('X><Y', 'http://tempuri.org/', []), RangeError);
    assert.throws(() => soapIstegiKur('X', 'http://tempuri.org/', [['a b', '1']]), RangeError);
    assert.throws(() => soapIstegiKur('X', 'http://tempuri.org/', [['A', Number.NaN]]), RangeError);
    assert.match(soapIstegiKur('X', 'http://tempuri.org/', [['A', 'a\u0001b']]).govde, /<A>ab<\/A>/);
  });

  test('SME-4: tarih ofsetsiz SmartES saatiyle yazılır ve okunur', () => {
    assert.equal(smartesTarihi(new Date('2026-12-31T21:30:15Z')), '2027-01-01T00:30:15');
    assert.equal(tarihAlani({ T: '2027-01-01T00:30:15' }, 'T')?.toISOString(), '2026-12-31T21:30:15.000Z');
    assert.equal(tarihAlani({ T: '2026-10-07T08:00:00.5+03:00' }, 'T')?.toISOString(), '2026-10-07T05:00:00.500Z');
    assert.equal(tarihAlani({ T: '2026-10-07T08:00:00Z' }, 'T')?.toISOString(), '2026-10-07T08:00:00.000Z');
    assert.equal(tarihAlani({ T: '07.10.2026' }, 'T'), null);
    assert.equal(tarihAlani({}, 'T'), null);
  });
});

describe('XML ayrıştırıcı (kart #778)', () => {
  test('SME-5: öğe, nitelik, CDATA, yorum, varlık ve karakter başvurusu', () => {
    const k = xmlAyristir('\uFEFF<?xml version="1.0"?><!-- y --><a:Kok x="1" y=\'&amp;\'><b>&lt;i&gt; &#304;&#x11F;</b><c><![CDATA[<ham>&]]></c><d/></a:Kok>');
    assert.equal(k.ad, 'Kok');
    assert.deepEqual(k.nitelikler, { x: '1', y: '&' });
    assert.equal(k.cocuklar[0]?.metin, '<i> İğ');
    assert.equal(k.cocuklar[1]?.metin, '<ham>&');
    assert.equal(k.cocuklar[2]?.ad, 'd');
    assert.equal(xmlKacir('<&>'), '&lt;&amp;&gt;');
  });

  test('SME-5 (ret): DTD, tanımsız varlık, kaçırılmamış &, eşleşmeyen ve kapanmamış etiket reddedilir', () => {
    const bozuklar = [
      '<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>',
      '<a>&bilinmez;</a>',
      '<a>A & B</a>',
      '<a><b></a></b>',
      '<a><b>',
      '<a></a><b></b>',
      'metin<a/>',
      '',
      '<a x=1></a>',
    ];
    for (const b of bozuklar) assert.throws(() => xmlAyristir(b), XmlHatasi, b);
  });
});

describe('XML ayrıştırıcı, yasak karakter (KD-044)', () => {
  test('SME-5: yasak karakter başvurusu ve ham NUL reddedilmez, U+FFFD olur; geçerli başvuru korunur', () => {
    const k = xmlAyristir('<a><b>&#0;&#x0;&#xD800;&#x110000;&#1;&#xZZ;</b><c>x\u0000y</c><d>&#9;&#x41;</d></a>');
    assert.equal(cocuk(k, 'b')?.metin, '\uFFFD'.repeat(6));
    assert.equal(cocuk(k, 'c')?.metin, 'x\uFFFDy');
    assert.equal(cocuk(k, 'd')?.metin, '\tA');
  });
});

describe('SOAP cevabı (kart #778)', () => {
  test('SME-6: skaler sonuç; AffectedRows=0 ve boş hata "değişiklik yok"tur, hata değil', () => {
    assert.deepEqual(skalerSonucuOku(skalerCevapMetni('M', 1), 'M'), { tur: 'basarili', deger: { etkilenen: 1, hata: null } });
    assert.deepEqual(skalerSonucuOku(skalerCevapMetni('M', 0), 'M'), { tur: 'basarili', deger: { etkilenen: 0, hata: null } });
    assert.deepEqual(skalerSonucuOku(skalerCevapMetni('M', 0, 'İstasyon tanımsız'), 'M'), { tur: 'basarili', deger: { etkilenen: 0, hata: 'İstasyon tanımsız' } });
  });

  test('SME-6 (ret): Fault, başka metodun cevabı, eksik AffectedRows ve XML olmayan gövde', () => {
    assert.deepEqual(skalerSonucuOku(faultMetni('Server was unable to process request.'), 'M'), { tur: 'fault', ileti: 'Server was unable to process request.' });
    assert.equal(skalerSonucuOku(skalerCevapMetni('Baska', 1), 'M').tur, 'bozuk');
    assert.equal(skalerSonucuOku(skalerCevapMetni('M', 1).replace(/<AffectedRows>1<\/AffectedRows>/, ''), 'M').tur, 'bozuk');
    assert.equal(skalerSonucuOku('<html>502</html>', 'M').tur, 'bozuk');
    assert.equal(skalerSonucuOku('Bad Gateway', 'M').tur, 'bozuk');
  });

  test('SME-7: diffgram satırları alan adlarıyla; boş alan satırda yok; boş DataSet boş liste', () => {
    const metin = tabloCevapMetni('WorkOrdersStatusList', [
      { WORKORDER_ID: '42', STOCK_NO: 'A&B', ISERP_OK: 'false', START_DATETIME: '2026-10-07T08:00:00+03:00' },
      { WORKORDER_ID: '43', STOCK_NO: '' },
    ]);
    const r = tabloSatirlariniOku(metin, 'WorkOrdersStatusList');
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.equal(r.deger.length, 2);
    const [a, b] = r.deger as [Record<string, string>, Record<string, string>];
    assert.equal(tamSayi(a, 'WORKORDER_ID'), 42);
    assert.equal(metinAlani(a, 'STOCK_NO'), 'A&B');
    assert.equal(mantiksal(a, 'ISERP_OK'), false);
    assert.equal(tarihAlani(a, 'START_DATETIME')?.toISOString(), '2026-10-07T05:00:00.000Z');
    assert.equal('STOCK_NO' in b, false);
    assert.equal(metinAlani(b, 'STOCK_NO'), null);
    assert.deepEqual(tabloSatirlariniOku(tabloCevapMetni('L', []), 'L'), { tur: 'basarili', deger: [] });
    const diffgramsiz = '<soap:Envelope xmlns:soap="x"><soap:Body><LResponse><LResult/></LResponse></soap:Body></soap:Envelope>';
    assert.deepEqual(tabloSatirlariniOku(diffgramsiz, 'L'), { tur: 'basarili', deger: [] });
  });

  test('SME-7: sayı ve mantıksal dönüştürücüler bozuk değerde null verir (sıfır uydurulmaz)', () => {
    assert.equal(tamSayi({ A: '12.5' }, 'A'), null);
    assert.equal(tamSayi({ A: '99999999999999999999' }, 'A'), null);
    assert.equal(mantiksal({ A: 'evet' }, 'A'), null);
    assert.equal(mantiksal({ A: '1' }, 'A'), true);
  });
});
