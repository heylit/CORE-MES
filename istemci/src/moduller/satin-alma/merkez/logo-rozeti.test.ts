import { describe, expect, it } from 'vitest';
import type { SiparisLogo } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { BEKLETME_IPUCU, bekletmePenceresiSiparisleri, logoBekletDugmeleri, logoBekletilebilir, logoRozeti } from './views.ts';

const logo = (ek: Partial<SiparisLogo>): SiparisLogo => ({ durum: 'bekliyor', kayitNo: null, hata: null, iptalDurumu: null, iptalHata: null, guncellemeDurumu: null, guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null, bekletmeIstegi: null, bekletmeDurumu: null, bekletmeHata: null, ...ek });
const oku = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; const f = d.querySelector('.flag'); return f && [f.className, f.textContent, f.getAttribute('title')]; };

describe('Sipariş Logo rozeti (#205)', () => {
  it('Logo kuyruğunda olmayan siparişte rozet yok; bekliyor, gönderildi (kayıt no) ve hata metniyle görünür; düzenleme gönderilmişin önüne, iptal hepsinin önüne geçer', () => {
    expect(logoRozeti(null)).toBe('');
    expect(oku(logoRozeti(logo({})))).toEqual(['flag warn', 'Logo: gönderim bekliyor', null]);
    expect(oku(logoRozeti(logo({ durum: 'gonderildi', kayitNo: '4711' })))).toEqual(['flag good', 'Logo: gönderildi (4711)', null]);
    expect(oku(logoRozeti(logo({ durum: 'hata', hata: '<b>Köprü</b> kapalı' })))).toEqual(['flag bad', 'Logo hatası: <b>Köprü</b> kapalı', null]);
    expect(oku(logoRozeti(logo({ durum: 'gonderildi', kayitNo: '4711', guncellemeDurumu: 'bekliyor' })))).toEqual(['flag warn', 'Logo: düzenleme bekliyor (4711)', null]);
    expect(oku(logoRozeti(logo({ durum: 'gonderildi', kayitNo: '4711', guncellemeDurumu: 'hata', guncellemeHata: 'Satır kilitli' })))).toEqual(['flag bad', 'Logo: düzenleme hatası', 'Satır kilitli']);
    expect(oku(logoRozeti(logo({ durum: 'gonderildi', kayitNo: '4711', guncellemeDurumu: 'gonderildi' })))).toEqual(['flag good', 'Logo: gönderildi (4711)', null]);
    expect(oku(logoRozeti(logo({ durum: 'gonderildi', kayitNo: '4711', iptalDurumu: 'bekliyor' })))).toEqual(['flag warn', 'Logo: iptal bekliyor', null]);
    expect(oku(logoRozeti(logo({ durum: 'gonderildi', kayitNo: '4711', iptalDurumu: 'hata', iptalHata: 'Kilitli' })))).toEqual(['flag bad', 'Logo: iptal hatası', 'Kilitli']);
    expect(oku(logoRozeti(logo({ durum: 'gonderildi', kayitNo: '4711', iptalDurumu: 'gonderildi' })))).toEqual(['flag mute', 'Logo: iptal edildi (4711)', null]);
  });
  it("2966-1 b: Logo'da bekletilen siparişte \"Logo'da bekletiliyor\" rozeti ve ipucu; sıradaki ve hatalı bekletme ayrı görünür; serbest bırakılınca normal rozet", () => {
    const g = { durum: 'gonderildi' as const, kayitNo: '4711' };
    expect(oku(logoRozeti(logo({ ...g, bekletmeIstegi: 'beklet', bekletmeDurumu: 'gonderildi' })))).toEqual(['flag warn', "Logo'da bekletiliyor (4711)", BEKLETME_IPUCU]);
    expect(oku(logoRozeti(logo({ ...g, bekletmeIstegi: 'beklet', bekletmeDurumu: 'bekliyor' })))).toEqual(['flag warn', "Logo'da bekletme sırada", null]);
    expect(oku(logoRozeti(logo({ ...g, bekletmeIstegi: 'serbest', bekletmeDurumu: 'hata', bekletmeHata: 'Kilitli' })))).toEqual(['flag bad', 'Logo: serbest bırakma hatası', 'Kilitli']);
    expect(oku(logoRozeti(logo({ ...g, bekletmeIstegi: 'serbest', bekletmeDurumu: 'gonderildi' })))).toEqual(['flag good', 'Logo: gönderildi (4711)', null]);
    expect(oku(logoRozeti(logo({ ...g, iptalDurumu: 'gonderildi', bekletmeIstegi: 'beklet', bekletmeDurumu: 'gonderildi' })))?.[1]).toBe('Logo: iptal edildi (4711)');
  });
  it("2966-1 b: beklet / serbest bırak yalnız Logo'ya gitmiş, iptal ve kapatma olmayan, sırada bekletme işi olmayan siparişte", () => {
    const g = { durum: 'gonderildi' as const, kayitNo: '4711' };
    expect(logoBekletilebilir(logo(g))).toBe(true);
    expect(logoBekletilebilir(logo({}))).toBe(false);
    expect(logoBekletilebilir(logo({ ...g, iptalDurumu: 'bekliyor' }))).toBe(false);
    expect(logoBekletilebilir(logo({ ...g, kapatmaDurumu: 'gonderildi' }))).toBe(false);
    expect(logoBekletilebilir(logo({ ...g, bekletmeIstegi: 'beklet', bekletmeDurumu: 'bekliyor' }))).toBe(false);
    expect(logoBekletilebilir(null)).toBe(false);
  });
  it("2966-1 b dugmeler: bekletilmeyende yalnız \"Logo'da beklet\", bekletilende yalnız \"Logo'da serbest bırak\"; iptal, kapatma ya da sırada olanda hiçbiri", () => {
    const g = { durum: 'gonderildi' as const, kayitNo: '4711' };
    const dugmeler = (...l: SiparisLogo[]) => { const d = document.createElement('div'); d.innerHTML = logoBekletDugmeleri(l.map((x) => ({ logo: x }))); return [...d.querySelectorAll('button')].map((b) => [b.textContent, b.dataset['act']]); };
    expect(dugmeler(logo(g))).toEqual([["Logo'da beklet", 'order-logo-hold']]);
    expect(dugmeler(logo({ ...g, bekletmeIstegi: 'serbest', bekletmeDurumu: 'gonderildi' }))).toEqual([["Logo'da beklet", 'order-logo-hold']]);
    expect(dugmeler(logo({ ...g, bekletmeIstegi: 'beklet', bekletmeDurumu: 'gonderildi' }))).toEqual([["Logo'da serbest bırak", 'order-logo-release']]);
    expect(dugmeler(logo({ ...g, bekletmeIstegi: 'beklet', bekletmeDurumu: 'hata', bekletmeHata: 'Kilitli' }))).toEqual([["Logo'da beklet", 'order-logo-hold']]);
    for (const x of [logo({ ...g, iptalDurumu: 'bekliyor' }), logo({ ...g, kapatmaDurumu: 'gonderildi' }), logo({ ...g, bekletmeIstegi: 'beklet', bekletmeDurumu: 'bekliyor' }), logo({})]) {
      expect(dugmeler(x)).toEqual([]);
    }
    expect(dugmeler(logo(g), logo({ ...g, bekletmeIstegi: 'beklet', bekletmeDurumu: 'gonderildi' }))).toEqual([["Logo'da beklet", 'order-logo-hold'], ["Logo'da serbest bırak", 'order-logo-release']]);
  });
  it('2966-1 b pencere: bölünmüş siparişte "beklet" yalnız bekletilmeyenleri, "serbest" yalnız bekletilenleri sunar', () => {
    const g = { durum: 'gonderildi' as const, kayitNo: '4711' };
    const siparisler = [
      { qid: 'a', logo: logo(g) },
      { qid: 'b', logo: logo({ ...g, bekletmeIstegi: 'beklet', bekletmeDurumu: 'gonderildi' }) },
      { qid: 'c', logo: logo({ ...g, kapatmaDurumu: 'bekliyor' }) },
      { qid: 'd', logo: null },
    ];
    expect(bekletmePenceresiSiparisleri(siparisler, 'beklet').map((o) => o.qid)).toEqual(['a']);
    expect(bekletmePenceresiSiparisleri(siparisler, 'serbest').map((o) => o.qid)).toEqual(['b']);
  });
});
