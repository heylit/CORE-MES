import { describe, expect, it } from 'vitest';
import type { MakineYeri, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { Makine } from '#paylasilan/sozlesme/istasyonlar.ts';
import { fabrikaGovdesi, fabrikaTaslagiKur, govdeyeCevir, kaldir, makineEkle, taslakKur } from './duzenleyici-durumu.ts';
import { ogeninBolumu } from './fabrika.ts';
import { istasyonNesnesi } from './kurallar.ts';
import { katilar, sahneNesneleri } from './sahne/geometri.ts';

// ATL-37 (kart #1120): haritadaki 3B nesne makinedir; makinesi yerleşik istasyon çerçeve olur.

const makineYeri = (makineId: number, kod: string, istasyonId: number | null, x = '4.00'): MakineYeri => ({
  makineId, kod, ad: `Tezgah ${kod}`, tur: null, markaModel: null, aktif: true,
  istasyon: istasyonId === null ? null : { id: istasyonId, kod: `IST-${istasyonId}`, ad: 'Deneme', tip: 'talasli', aktif: true },
  x, z: '3.00', donus: '0.0', genislik: '1.50', derinlik: '2.00', hucre: 'A1', model: null,
});

const yerlesim = (makineYerleri: MakineYeri[], fabrika = { x: '0.00', z: '0.00', donus: '0.0' }): YerlesimCevabi => ({
  salon: {
    id: 1, kod: 'S1', ad: 'Deneme', genislik: '20.00', derinlik: '10.00', hucreBoyu: '5.00', surum: 3, fabrika, giris: null,
    kaydeden: { id: 1, ad: null }, kaydedildi: '', sutunlar: [], satirlar: [],
  },
  istasyonYerleri: [
    { istasyonId: 11, kod: 'IST-11', ad: 'Deneme', tip: 'talasli', aktif: true, x: '4.00', z: '3.00', donus: '0.0', genislik: '3.00', derinlik: '2.00', hucre: 'A1', makineler: [], model: null, merkezModeli: null },
    { istasyonId: 12, kod: 'IST-12', ad: 'Boş', tip: 'kalite', aktif: true, x: '12.00', z: '3.00', donus: '0.0', genislik: '3.00', derinlik: '2.00', hucre: 'C1', makineler: [], model: null, merkezModeli: null },
  ],
  makineYerleri,
  raflar: [], alanlar: [], duvarlar: [], gecisler: [],
});

const MAKINE: Makine = {
  id: 7, kod: 'M-07', ad: 'Torna', tur: null, markaModel: null, seriNo: null, istasyonId: 12, baglantiTuru: null, baglantiAdresi: null, aktif: true,
};

describe('makine yeri (ATL-37)', () => {
  it('kayıtlı makine yeri taslağa girer ve kayıt gövdesine makineYerleri olarak gider; bulgu anahtarı makineye eşlenir', () => {
    const t = taslakKur(yerlesim([makineYeri(5, 'M-05', 11, '3.25')]));
    expect(t.makineler.map((m) => [m.anahtar, m.istasyonId, m.tip, m.x])).toEqual([['makine:5', 11, 'talasli', 3.25]]);
    const h = govdeyeCevir(t);
    expect(h.govde.makineYerleri).toEqual([{ makineId: 5, x: 3.25, z: 3, donus: 0, genislik: 1.5, derinlik: 2, modelId: null }]);
    expect(h.eslesme.get('makine:5')).toBe('makine:5');
  });

  it('paletten eklenen makine istasyon tipinin ayak iziyle yerleşir; plandan kaldırılınca gövdede boş dizi gider', () => {
    const r = makineEkle(taslakKur(yerlesim([])), MAKINE, 'kalite', 10, 5);
    expect(r.anahtar).toBe('makine:7');
    expect(govdeyeCevir(r.taslak).govde.makineYerleri).toEqual([{ makineId: 7, x: 10, z: 5, donus: 0, genislik: 3, derinlik: 2.4, modelId: null }]);
    // Boş dizi "hepsini kaldır" demektir (gönderilmeyen alan ise kayıtlıyı korur).
    expect(govdeyeCevir(kaldir(r.taslak, r.anahtar)).govde.makineYerleri).toEqual([]);
  });

  it('fabrika düzenlemesinde makine bölümünün metresine çevrilip o bölümün gövdesine girer', () => {
    const t = fabrikaTaslagiKur([yerlesim([makineYeri(5, 'M-05', 11)], { x: '100.00', z: '50.00', donus: '0.0' })]);
    expect(t.makineler[0]).toMatchObject({ x: 104, z: 53 });
    const h = fabrikaGovdesi(t);
    expect(h.govde.bolumler[0]?.yerlesim.makineYerleri).toEqual([{ makineId: 5, x: 4, z: 3, donus: 0, genislik: 1.5, derinlik: 2, modelId: null }]);
    expect(h.eslesme.get('salon:1/makine:5')).toBe('makine:5');
  });

  it('makinesi yerleşik istasyon sahnede gövde çizilmez (çerçeve); makine gövdesi istasyonun canlı durumunu taşır', () => {
    const y = yerlesim([makineYeri(5, 'M-05', 11), makineYeri(6, 'M-06', null, '8.00')]);
    expect(sahneNesneleri(y).map((n) => [n.anahtar, n.canliId])).toEqual([['istasyon:12', 12], ['makine:5', 11], ['makine:6', null]]);
    // Yürüyüşte çerçeve istasyon katı değildir; makineler katıdır.
    expect(katilar(y).kutular).toHaveLength(3);
  });

  it('istasyona gidilen seçim, makinesi yerleşikse kod sırasıyla ilk makineye, değilse istasyona gider', () => {
    const y = yerlesim([makineYeri(6, 'M-06', 11), makineYeri(5, 'M-05', 11)]);
    expect(istasyonNesnesi([y], 11)).toBe('makine:5');
    expect(istasyonNesnesi([y], 12)).toBe('istasyon:12');
    expect(ogeninBolumu([y], 'makine:6')?.salon.id).toBe(1);
    expect(ogeninBolumu([y], 'makine:99')).toBeUndefined();
  });
});
