import { describe, expect, it } from 'vitest';
import { dslCoz, formEksikleri, formIlerlemesi, formSonucu, icerikVarMi, sonucTonu, tabloSatirlari } from './dsl.ts';

const METIN = `// yorum
Alan / hat *
# Kontrol
? Birinci madde
? İkinci madde
Vardiya | seçim: 1. vardiya, 2. vardiya
Testler | çoklu: X-ray, XRF
Tarih | tarih
Puan (%) | sayı
Açıklama | metin
[Tablo: Kalem, Yer]
# Sonuç
Karar * | seçim: Kabul, Ret: şüpheli`;

describe('form dili', () => {
  it('bölüm, alan, madde ve tabloyu uygulamadaki gibi çözer', () => {
    const b = dslCoz(METIN);
    expect(b.map((x) => x.baslik)).toEqual(['', 'Kontrol', 'Sonuç']);
    expect(b[0]?.alanlar).toEqual([{ etiket: 'Alan / hat', tur: 'metin', zorunlu: true }]);
    expect(b[1]?.liste).toEqual(['Birinci madde', 'İkinci madde']);
    expect(b[1]?.alanlar.map((a) => a.tur)).toEqual(['secim', 'isaretler', 'tarih', 'sayi', 'cokSatir']);
    expect(b[1]?.alanlar[0]?.secenekler).toEqual(['', '1. vardiya', '2. vardiya']);
    expect(b[1]?.alanlar[1]?.secenekler).toEqual(['X-ray', 'XRF']);
    expect(b[1]?.tablo).toEqual({ sutunlar: ['Kalem', 'Yer'] });
    // İki noktadan sonrası seçeneklere birleşir.
    expect(b[2]?.alanlar[0]).toEqual({ etiket: 'Karar', tur: 'secim', zorunlu: true, secenekler: ['', 'Kabul', 'Ret: şüpheli'] });
  });

  it('boş metinde içerik yoktur', () => {
    expect(icerikVarMi(dslCoz('# Yalnız başlık'))).toBe(false);
    expect(icerikVarMi(dslCoz('? madde'))).toBe(true);
  });

  it('sonuç önce karar alanından, sonra kontrol listesinden gelir', () => {
    const b = dslCoz(METIN);
    expect(formSonucu(b, { '2_0': 'Kabul' }, { '1_0': 'Hayır' })).toBe('Kabul');
    expect(formSonucu(b, {}, { '1_0': 'Hayır', '1_1': 'Evet' })).toBe('Uygunsuzluk var');
    expect(formSonucu(b, {}, { '1_0': 'Evet' })).toBe('Uygun');
    expect(formSonucu(b, {}, {})).toBe('Tamamlandı');
  });

  it('sonuç tonu olumsuz sözcüğe önce bakar', () => {
    expect(sonucTonu('Uygun değil')).toBe('hata');
    expect(sonucTonu('Uygun')).toBe('tamam');
    expect(sonucTonu('KARANTİNA')).toBe('hata');
    expect(sonucTonu('Değerlendirmede')).toBe('uyari');
    expect(sonucTonu(undefined)).toBe('uyari');
  });

  it('eksikler: zorunlu alan, yanıtsız madde, açıklamasız Hayır', () => {
    const b = dslCoz(METIN);
    const eksik = formEksikleri(b, { tarih: '2026-10-23', dolduran: '' }, { veri: { '0_0': 'Hat 1' }, liste: { '1_0': 'Hayır' }, listeNot: {}, tablo: {} });
    expect(eksik.map((e) => e.metin)).toEqual([
      'Dolduran boş', 'Karar boş', '"Hayır" yanıtı için açıklama yok: Birinci madde', 'Yanıtsız madde: İkinci madde',
    ]);
    expect(formIlerlemesi(b, eksik)).toEqual({ tamam: 3, toplam: 6 });
  });

  it('boş tablo satırı atılır', () => {
    expect(tabloSatirlari([{ c0: ' ', c1: '' }, { c0: 'a ', c1: '' }])).toEqual([{ c0: 'a', c1: '' }]);
  });
});
