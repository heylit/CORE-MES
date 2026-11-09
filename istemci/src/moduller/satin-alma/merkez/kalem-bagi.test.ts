import { afterEach, describe, expect, it } from 'vitest';
import type { Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
import { talepEkrana, talepSunucuya } from './tasiyici.ts';
import { tabItems } from './views.ts';
import { rfqText } from './ui.ts';

const K1 = '00000000-0000-4000-8000-000000000011';
const K2 = '00000000-0000-4000-8000-000000000012';
const TALEP: Talep = {
  id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'Deneme kaplama', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null,
  uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5, oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'taslak', iptalNedeni: '', agirliklar: null,
  kalemler: [
    { id: K1, katalogId: null, ad: 'Deneme kaplama hizmeti', ozellik: '', miktar: '40', birim: 'adet', kategori: '' },
    { id: K2, katalogId: null, ad: 'Deneme vida', ozellik: '', miktar: '10', birim: 'adet', kategori: '' },
  ],
  kalemBaglari: [{
    kalemId: K1, uygulanan: { no: 7, kod: 'DNM-7', ad: 'Deneme flanş' },
    fason: { isEmriId: 3, uretimEmriId: 11, emirNo: 'UE-2026-001', opNo: 30, adim: 'Kaplama', firmaId: 4, firmaAdi: 'Deneme Kaplama' },
  }],
  teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1,
  olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
};

afterEach(() => { S.requests = {}; S.ready = false; });

// 2429: hizmet talebinde seçilen parça ve fason adımı satın almaya gelir; kalemin altında ve teklif isteme metninde görünür.
describe('kalem bağları (2429)', () => {
  it('taşıyıcı bağları kaleme koyar, kayıtta geri göndermez', () => {
    const r = talepEkrana(TALEP);
    expect(r.items[0]!.parca).toEqual({ no: 7, kod: 'DNM-7', ad: 'Deneme flanş' });
    expect(r.items[0]!.fason).toEqual({ emirNo: 'UE-2026-001', opNo: 30, adim: 'Kaplama', firmaAdi: 'Deneme Kaplama' });
    expect(r.items[1]!.parca).toBeUndefined();
    expect(JSON.stringify(talepSunucuya(r))).not.toContain('Deneme flanş');
  });

  it('kalemin altında parça ve fason satırı, bağsız kalemde yok', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    const el = document.createElement('div');
    el.innerHTML = tabItems(talepEkrana(TALEP));
    const satirlar = [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('[data-sa-kalem-bagi]')].map((s) => s.textContent));
    expect(satirlar).toEqual([['Parça: DNM-7 Deneme flanş', 'Fason: UE-2026-001, Op 30 Kaplama, Deneme Kaplama'], []]);
  });

  it('teklif isteme metninde parça ve yapılacak işlem; fason firması, iç emir no ve silinmiş kart numarası gitmez', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    const metin = rfqText(talepEkrana(TALEP), '', '2026-10-20');
    expect(metin).toContain('1. Deneme kaplama hizmeti, 40 adet\n   Parça: DNM-7 Deneme flanş\n   İşlem: Op 30 Kaplama\n2. Deneme vida');
    expect(metin).not.toContain('UE-2026-001');
    expect(metin).not.toContain('Deneme Kaplama\n');
    const silinmis = { ...TALEP, kalemBaglari: [{ kalemId: K1, uygulanan: { no: 7, kod: null, ad: null }, fason: null }] };
    expect(rfqText(talepEkrana(silinmis), '', '2026-10-20')).toContain('1. Deneme kaplama hizmeti, 40 adet\n2. Deneme vida');
  });
});
