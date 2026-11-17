import { describe, expect, it } from 'vitest';
import type { Is, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { aracOzeti, yukDurumu } from './YukleAdimi.tsx';

const kalem = (k: Partial<TumIsSatiri>): TumIsSatiri => ({
  anahtar: 'kalem:1', kalemId: 1, kaynak: 'urun', yon: 'gidis', asama: 'depoda', hazirTarihi: null, istenenTarih: null, uretimEmriId: null, emirNo: null,
  isEmriId: null, opNo: null, adim: null, ilerleme: null, siparisNo: null, malzemeNo: null, malzemeAd: null, adet: null, firmaId: null, firmaAd: null,
  noktaId: null, tasima: 'biz', elleTuru: null, aciklama: null, is: { id: 1, tarih: '2026-01-05', durum: 'yolda', tetiklendi: '2026-01-05T08:00:00Z' },
  depo: null, erken: null, sonYazan: null, bagliAnahtar: null, ...k,
}) as TumIsSatiri;
const is = (id: number, k: Partial<Is> = {}): Is => ({ id, tur: 'teslimat', belgeNo: null, ...k }) as Is;

describe('Yükle adımı (3348 a)', () => {
  it('durağın yük durumu: kalemsiz iş bitmiş sayılır; depodaki gidiş çıkış bekler; dönüşteki geliş beklemez; tetiklenmemiş kalem hazır değildir', () => {
    expect(yukDurumu(undefined)).toMatchObject({ metin: 'Kalemsiz iş', bitti: true, cikis: null });
    expect(yukDurumu([kalem({})])).toMatchObject({ metin: 'Çıkış bekliyor', bitti: false });
    expect(yukDurumu([kalem({ yon: 'gelis' })])).toMatchObject({ metin: 'Dönüşte kabul', bitti: true, cikis: null });
    expect(yukDurumu([kalem({ asama: 'tamamlandi' })])).toMatchObject({ metin: 'Çıktı', ton: 'tamam' });
    expect(yukDurumu([kalem({ asama: 'yolda', ilerleme: 'OP 20', is: { id: 1, tarih: '2026-01-05', durum: 'yolda', tetiklendi: null } })]))
      .toMatchObject({ metin: 'Hazır değil · OP 20', ton: 'hata', bitti: false });
  });

  it('araç özeti çıkış bekleyen ve irsaliye no eksik durağı ayrı sayar; alımda irsaliye no istenmez', () => {
    const kalemler = new Map([[1, [kalem({})]], [2, [kalem({ asama: 'tamamlandi' })]]]);
    expect(aracOzeti([is(1), is(2, { belgeNo: 'ORN-IRS-1' }), is(3, { tur: 'alim' })], kalemler)).toEqual({ cikis: 1, irsaliye: 1 });
  });
});
