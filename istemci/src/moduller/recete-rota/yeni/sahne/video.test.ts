import { describe, expect, it } from 'vitest';
import type { TalimatlarCevabi } from '#paylasilan/sozlesme/rota.ts';
import { videoluTaslak } from './video.ts';

const kisi = { id: 1, ad: 'Deneme 1' };
const adim = (sira: number, medya: TalimatlarCevabi['surumler'][number]['adimlar'][number]['medya'] = []) =>
  ({ sira, baslik: `Adım ${String(sira)}`, metin: null, kontrol: { tur: 'yok' as const }, zorunlu: false, medya, asama: 'uretim' as const, hedefSureDk: null });
const yayin = (surum: number, adimlar = [adim(1), adim(2)]): TalimatlarCevabi['surumler'][number] =>
  ({ surum, metin: '', yazan: kisi, yazma: '2026-11-13T10:00:00.000Z', adimli: true, adimlar, koken: null });
const MEDYA = { ozet: 'a'.repeat(64), ad: 'OP10-adim2-3b.mp4' };

describe('adım videosu talimat taslağına (3209 a)', () => {
  it('taslak yoksa yayındaki sürümden yeni taslak açılır; video yalnız seçili adıma eklenir', () => {
    const t = videoluTaslak({ surumler: [yayin(2)], taslak: null }, 2, 1, 10, MEDYA);
    expect(t).toEqual({ komut: { ad: 'talimat-taslak-kaydet', govde: expect.objectContaining({ opNo: 10, okunanSurum: 2, taslakSurum: null }) } });
    const g = 'komut' in t ? (t.komut.govde as { adimlar: { medya: unknown[] }[] }) : null;
    expect(g?.adimlar.map((a) => a.medya)).toEqual([[], [MEDYA]]);
  });

  it('bu sürümden açılan taslağa eklenir; başka sürümden ya da adım sayısı farklı taslakta ve yeni yayında durur', () => {
    const taslak = (tabanSurum: number, adimlar = [adim(1), adim(2)]) => ({ surum: 4, tabanSurum, yazan: kisi, yazma: '2026-11-13T11:00:00.000Z', adimlar, koken: null });
    const t = videoluTaslak({ surumler: [yayin(2)], taslak: taslak(2) }, 2, 0, 10, MEDYA);
    expect('komut' in t && t.komut.govde).toMatchObject({ taslakSurum: 4 });
    expect(videoluTaslak({ surumler: [yayin(2)], taslak: taslak(1) }, 2, 0, 10, MEDYA)).toEqual({ hata: 'Açık talimat taslağı bu sürümden farklı; videoyu talimat düzenleyicisinden ekleyin.' });
    expect(videoluTaslak({ surumler: [yayin(2)], taslak: taslak(2, [adim(1)]) }, 2, 0, 10, MEDYA)).toHaveProperty('hata');
    expect(videoluTaslak({ surumler: [yayin(3), yayin(2)], taslak: null }, 2, 0, 10, MEDYA)).toEqual({ hata: 'Bu arada talimatın yeni sürümü yayınlandı; stüdyoyu kapatıp yeniden açın.' });
  });

  it('adımda beş medya varsa video eklenmez', () => {
    const dolu = Array.from({ length: 5 }, (_, i) => ({ ozet: String(i).repeat(64), ad: `r${String(i)}.png`, tur: 'resim' as const, boyut: 10 }));
    expect(videoluTaslak({ surumler: [yayin(2, [adim(1, dolu)])], taslak: null }, 2, 0, 10, MEDYA)).toEqual({ hata: 'Bu adımda en çok 5 resim ya da video olur; birini talimattan kaldırın.' });
  });
});
