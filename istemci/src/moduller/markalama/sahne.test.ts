import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { MalzemeBelgeleriCevabi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { yerOlustur, yonelim } from './sahne.ts';
import { modelSecenekleri } from './veri.ts';

describe('markalama sahnesi', () => {
  it('tıklanan nokta ve yüz normali yere çevrilir; normal birim uzunluğa iner, varsayılan ölçü verilir', () => {
    const yer = yerOlustur(new Vector3(10.123, 0, -4), new Vector3(0, 2, 0));
    expect(yer).toEqual({ merkez: [10.12, 0, -4], normal: [0, 1, 0], enMm: 40, boyMm: 8, aciDerece: 0 });
  });

  it('marka düzlemi yüzeyin normaline döner; açı normal çevresinde döndürür', () => {
    const yer = yerOlustur(new Vector3(), new Vector3(1, 0, 0));
    expect(new Vector3(0, 0, 1).applyQuaternion(yonelim(yer)).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-9);
    const x = new Vector3(1, 0, 0).applyQuaternion(yonelim({ ...yer, aciDerece: 90 }));
    const y = new Vector3(1, 0, 0).applyQuaternion(yonelim(yer));
    expect(Math.abs(x.dot(y))).toBeLessThan(1e-9);
  });

  it('yalnız okunabilen ve eskimemiş model revizyonları seçenek olur, kapak belgesi önce', () => {
    const rev = (id: number, sira: number, dosyaTuru: string, durum: string) => ({ id, sira, harf: String.fromCharCode(64 + sira), dosyaTuru, durum }) as never;
    const c = {
      belgeler: [
        { id: 1, ad: 'Resim', tur: 'teknik-resim', resimNo: null, surum: 1, kapak: false, revizyonlar: [rev(1, 1, 'pdf', 'yayinda')] },
        { id: 2, ad: 'Model', tur: '3b-model', resimNo: null, surum: 1, kapak: true, revizyonlar: [rev(2, 1, 'step', 'eski'), rev(3, 2, 'step', 'yayinda')] },
      ],
      oneriler: [], kucukResim: null,
    } as MalzemeBelgeleriCevabi;
    expect(modelSecenekleri(c).map((s) => [s.belgeId, s.harf, s.bicim])).toEqual([[2, 'B', 'step']]);
  });
});
