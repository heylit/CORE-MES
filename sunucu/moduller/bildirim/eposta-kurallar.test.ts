import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EPOSTA_KONULARI, EPOSTA_YER_TUTUCULARI, turKonusu } from '#paylasilan/sozlesme/bildirim-eposta.ts';
import { basliktanKayitNo } from './eposta.ts';
import {
  VARSAYILAN_SABLONLAR, bildirimAcikMi, disKipMi, epostaKipi, bilinmeyenYerTutucular, epostaKur, kayitBaglantisi, kisiEpostaAlir, sablonDoldur, sessizMi,
  sonrakiDenemeDk, varsayilanTetikleyici, type EpostaDegerleri,
} from './kurallar.ts';

const DEGER: EpostaDegerleri = {
  alici_adi: 'Deneme Kişi', olay: 'Satın alma talebi onay bekliyor', kayit_no: 'ORN-TLP-0042', tarih: '17.11.2026 09:30', gecikme_gunu: null,
  istasyon: null, kayit_baglantisi: 'http://10.0.0.5:4100/satin-alma/onaylar',
};

describe('e-posta kuralları (3397)', () => {
  test('BIL-40: her konunun varsayılan şablonu yalnız izinli yer tutucu kullanır', () => {
    for (const konu of EPOSTA_KONULARI) {
      const s = VARSAYILAN_SABLONLAR[konu];
      assert.deepEqual(bilinmeyenYerTutucular(`${s.konuKalibi}\n${s.govde}`), [], konu);
      assert.ok(s.konuKalibi.length <= 150 && s.govde.length <= 2000, konu);
    }
  });

  test('BIL-40: tür konusu kaynak modülden gelir; bilinmeyen modül genel', () => {
    assert.equal(turKonusu('satin-alma.talep-onay-bekliyor'), 'satin-alma');
    assert.equal(turKonusu('siparisler.termin-yaklasiyor'), 'satis');
    assert.equal(turKonusu('istasyonlar.makine-durdu'), 'uretim');
    assert.equal(turKonusu('yok.boyle'), 'genel');
  });

  test('BIL-41: bilinmeyen yer tutucu adıyla döner, izinliler geçer', () => {
    assert.deepEqual(bilinmeyenYerTutucular(EPOSTA_YER_TUTUCULARI.map((y) => `{${y}}`).join(' ')), []);
    assert.deepEqual(bilinmeyenYerTutucular('Merhaba {musteri_adi}, {fiyat} {olay} {musteri_adi}'), ['musteri_adi', 'fiyat']);
    assert.equal(sablonDoldur('{olay} · {gecikme_gunu} · {bilinmeyen}', DEGER), 'Satın alma talebi onay bekliyor ·  · {bilinmeyen}');
  });

  test('BIL-42: bağlantı yalnız http(s) kök adresinden kurulur', () => {
    assert.equal(kayitBaglantisi('http://10.0.0.5:4100/', '/stok'), 'http://10.0.0.5:4100/stok');
    assert.equal(kayitBaglantisi('https://mes.ornek.local', null), 'https://mes.ornek.local/');
    assert.equal(kayitBaglantisi('', '/stok'), null);
    assert.equal(kayitBaglantisi('javascript:alert(1)', '/stok'), null);
    assert.equal(kayitBaglantisi('http://10.0.0.5/yol', '/stok'), null);
  });

  test('BIL-43: tablo yalnız seçili ve dolu alanlardan; HTML kaçışlanır, simge cid ile gömülüdür', () => {
    const g = epostaKur({
      sablon: { konuKalibi: '[CORE MES] {olay} · {kayit_no}', govde: 'Merhaba {alici_adi},\n\n<b>{olay}</b>', tabloAlanlari: ['kayit_no', 'gecikme_gunu', 'tarih'] },
      degerler: { ...DEGER, alici_adi: '<script>x</script>' }, baslik: 'Satın alma talebi onay bekliyor', onem: 'uyari', simgeVar: true,
    });
    assert.equal(g.konu, '[CORE MES] Satın alma talebi onay bekliyor · ORN-TLP-0042');
    assert.match(g.metin, /Kayıt no: ORN-TLP-0042/);
    assert.match(g.metin, /Tarih: 17\.11\.2026 09:30/);
    assert.doesNotMatch(g.metin, /Gecikme günü/);
    assert.match(g.metin, /Kayda git: http:\/\/10\.0\.0\.5:4100\/satin-alma\/onaylar/);
    assert.ok(!g.html.includes('<script>'));
    assert.ok(g.html.includes('&lt;script&gt;'));
    assert.ok(g.html.includes('&lt;b&gt;'));
    assert.ok(g.html.includes('src="cid:simge"'));
    assert.doesNotMatch(g.html, /src="https?:/);
  });

  test('BIL-43: boş kayıt no konuda artık ayraç bırakmaz; bağlantı yoksa düğme yok', () => {
    const g = epostaKur({
      sablon: VARSAYILAN_SABLONLAR.genel, degerler: { ...DEGER, kayit_no: null, kayit_baglantisi: null }, baslik: 'Olay', onem: 'bilgi', simgeVar: false,
    });
    assert.doesNotMatch(g.konu, /·\s*$/);
    assert.doesNotMatch(g.html, /Kayda git/);
    assert.doesNotMatch(g.html, /cid:simge/);
  });

  test('BIL-44: sessiz saat gece yarısını aşabilir; eşit ya da boş sınır sessiz saat değildir', () => {
    assert.equal(sessizMi(23, 22, 7), true);
    assert.equal(sessizMi(3, 22, 7), true);
    assert.equal(sessizMi(7, 22, 7), false);
    assert.equal(sessizMi(12, 22, 7), false);
    assert.equal(sessizMi(13, 12, 14), true);
    assert.equal(sessizMi(3, 5, 5), false);
    assert.equal(sessizMi(3, null, 7), false);
  });

  test('BIL-45: ayarsız tür türün e-posta varsayılanıyla, hemen, tekrarsız ve kademesiz', () => {
    assert.deepEqual(varsayilanTetikleyici('satin-alma.talep-onay-bekliyor'), {
      eposta: true, zaman: 'hemen', tekrarGun: null, tekrarEnCok: null, yukseltGun: null, yukseltRolIdleri: [], yukseltKisiIdleri: [],
    });
    assert.equal(varsayilanTetikleyici('satin-alma.talep-onaylandi').eposta, false);
  });

  test('BIL-46: operatör e-posta almaz; kişi tercihi kapalıysa almaz; tür kapalıysa kimse almaz', () => {
    assert.equal(kisiEpostaAlir(true, ['satin-alma.onayla'], undefined), true);
    assert.equal(kisiEpostaAlir(true, ['satin-alma.onayla'], false), false);
    assert.equal(kisiEpostaAlir(false, ['satin-alma.onayla'], true), false);
    assert.equal(kisiEpostaAlir(true, ['arkon.operator'], true), false);
  });

  test('BIL-47: görev yapılınca, bilgi okununca, her sınıf arşivlenince kapanır', () => {
    const b = { okundu: null, arsivlendi: null, yapildi: null };
    assert.equal(bildirimAcikMi({ ...b, sinif: 'gorev' }), true);
    assert.equal(bildirimAcikMi({ ...b, sinif: 'gorev', okundu: 'x' }), true);
    assert.equal(bildirimAcikMi({ ...b, sinif: 'gorev', yapildi: 'x' }), false);
    assert.equal(bildirimAcikMi({ ...b, sinif: 'bilgi', okundu: 'x' }), false);
    assert.equal(bildirimAcikMi({ ...b, sinif: 'hatirlatma', arsivlendi: 'x' }), false);
  });

  test('BIL-48: geçici hatada 5 ve 15 dakika sonra; üçüncü denemeden sonra durur', () => {
    assert.equal(sonrakiDenemeDk(1), 5);
    assert.equal(sonrakiDenemeDk(2), 15);
    assert.equal(sonrakiDenemeDk(3), null);
  });

  test('BIL-50: bilinmeyen kip kurum içi sayılır; dış servise yalnız açık seçimle çıkılır', () => {
    assert.equal(epostaKipi('yerel-aktarici'), 'yerel-aktarici');
    assert.equal(epostaKipi('dis'), 'kurum-ici');
    assert.equal(disKipMi('dis-servis'), true);
    assert.equal(disKipMi('yerel-aktarici'), false);
    assert.equal(disKipMi(''), false);
  });

  test('BIL-49: başlıktan kayıt no yalnız ":" sonrası belge numarasıysa alınır; serbest metin alınmaz', () => {
    assert.equal(basliktanKayitNo('Satın alma talebi onay bekliyor: ORN-TLP-0042'), 'ORN-TLP-0042');
    assert.equal(basliktanKayitNo('Talep onaylandı: Rulman alımı'), null);
    assert.equal(basliktanKayitNo('ORN-TLP-0042'), null);
    assert.equal(basliktanKayitNo('Emir: 2026/118'), '2026/118');
  });
});
