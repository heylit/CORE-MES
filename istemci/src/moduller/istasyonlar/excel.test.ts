import { describe, expect, it } from 'vitest';
import { planKur, type SayfaSatirlari } from '../../ortak/excel/kurallar.ts';
import { tesisSatiri, tesisTanimi, yetkinlikGovdesi, yetkinlikTanimi } from './excel.ts';
import type { TesisVerisi } from './tesisVerisi.ts';

// Sentetik veri: gerçek ad ya da kod yok.
const v = {
  merkezler: [{ id: 1, surum: 2, kod: 'IM1', ad: 'Merkez bir', aciklama: null, aktif: true }],
  istasyonlar: [{
    id: 10, surum: 4, kod: 'IS1', ad: 'İstasyon bir', isMerkeziId: 1, tip: 'talasli', kapasiteKaynagi: 'makine',
    sorumluKisiId: null, uretimAlani: false, aktif: true,
  }],
  makineler: [{
    id: 20, surum: 1, kod: 'MK1', ad: 'Makine bir', tur: null, markaModel: null, seriNo: null, istasyonId: 10,
    baglantiTuru: null, baglantiAdresi: null, aktif: true,
  }],
  kisiler: [{ id: 7, ad: 'Kişi A', aktif: true }, { id: 8, ad: 'Kişi B', aktif: true }],
  yetkinlikler: [{ kisiId: 7, istasyonIdleri: [10], makineIdleri: [] }],
} as unknown as TesisVerisi;

const sayfa = (basliklar: string[], ...satirlar: (string | null)[][]) =>
  [{ no: 1, hucreler: basliklar }, ...satirlar.map((h, i) => ({ no: i + 2, hucreler: h }))];

describe('tesis Excel tanımı', () => {
  it('aynı dosyada açılan merkez istasyonda kullanılır; satırlar sözleşme biçimindedir', () => {
    const t = tesisTanimi(v);
    const okunan: SayfaSatirlari = {
      'İş merkezleri': sayfa(['Kod *', 'Ad *'], ['IM2', 'Yeni merkez']),
      'İstasyonlar': sayfa(
        ['Kod *', 'Ad *', 'İş merkezi *', 'Tip', 'Kapasite kaynağı *', 'Sorumlu'],
        ['IS2', 'Yeni istasyon', 'IM2', null, 'İnsan saati', '8 — Kişi B'],
        ['is1', 'Yeni ad', null, null, null, null],
      ),
    };
    const { plan, uyari } = planKur(t, okunan);
    expect(uyari).toBeNull();
    expect(plan.map((p) => [p.kayitTuru, p.kod, p.islem, p.hatalar])).toEqual([
      ['is-merkezi', 'IM2', 'ekle', []], ['istasyon', 'IS2', 'ekle', []], ['istasyon', 'IS1', 'guncelle', []],
    ]);
    const satirlar = plan.map((p, i) => tesisSatiri(p, i + 1));
    expect(satirlar[1]).toMatchObject({ kayit: 'istasyon', islem: 'ekle', isMerkeziKodu: 'IM2', kapasiteKaynagi: 'insan', sorumluKisiId: 8 });
    expect(satirlar[2]).toEqual({ kayit: 'istasyon', islem: 'guncelle', satir: 3, id: 10, surum: 4, kod: 'IS1', ad: 'Yeni ad' });
  });

  it('listede olmayan merkez hatadır', () => {
    const { plan } = planKur(tesisTanimi(v), { 'İstasyonlar': sayfa(['Kod *', 'Ad *', 'İş merkezi *', 'Kapasite kaynağı *'], ['IS3', 'X', 'YOK', 'makine']) });
    expect(plan[0]?.hatalar.join(' ')).toMatch(/listede yok/);
  });
});

describe('yetkinlik Excel tanımı', () => {
  it('yalnız değişen hücre gövdeye girer; yeni kişi açılmaz', () => {
    const t = yetkinlikTanimi(v);
    expect(t).not.toBeNull();
    const { plan } = planKur(t!, {
      'İstasyon yetkinliği': sayfa(['Kişi *', 'IS1'], ['7 — Kişi A', 'Evet'], ['8 — Kişi B', 'Evet'], ['99', 'Evet']),
      'Makine yetkinliği': sayfa(['Kişi *', 'MK1'], ['7 — Kişi A', null]),
    });
    expect(plan.map((p) => p.islem)).toEqual(['ayni', 'guncelle', 'hata', 'ayni']);
    expect(yetkinlikGovdesi(plan.filter((p) => p.islem === 'guncelle'))).toEqual({ degisiklikler: [{ kisiId: 8, istasyonId: 10, yetkin: true }], makineler: [] });
  });
  it('kişi listesi okunamıyorsa tanım yok', () => {
    expect(yetkinlikTanimi({ ...v, kisiler: undefined } as unknown as TesisVerisi)).toBeNull();
  });
});
