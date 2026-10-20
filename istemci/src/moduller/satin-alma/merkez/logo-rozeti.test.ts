import { describe, expect, it } from 'vitest';
import type { SiparisLogo } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { logoRozeti } from './views.ts';

const logo = (ek: Partial<SiparisLogo>): SiparisLogo => ({ durum: 'bekliyor', kayitNo: null, hata: null, iptalDurumu: null, iptalHata: null, guncellemeDurumu: null, guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null, ...ek });
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
});
