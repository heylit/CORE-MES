import { describe, expect, it } from 'vitest';
import type { HazirlikSatiri } from '../operator/HazirlikListesi.tsx';
import { MADDE_SUTUNLARI, SUTUNLAR, emirHucresi, enKotuIlkParca, gizliOku, hucreOzeti, ilkParcaDurumu, planBilgisi, varsayilanGizli } from './HazirlikOzeti.ts';

const satir = (madde: HazirlikSatiri['madde'], hal: HazirlikSatiri['hal'], uyarir: boolean, isEmriDuzeyi = true): HazirlikSatiri =>
  ({ madde, hal, uyarir, isEmriDuzeyi, muafTutulur: false, muaf: null });
const sutun = (a: string) => MADDE_SUTUNLARI.find((s) => s.anahtar === a)!;

describe('3816 hazırlık özeti', () => {
  it('her madde tek sütunda; yayın maddesi Paket sütunundadır', () => {
    const l = MADDE_SUTUNLARI.flatMap((s) => s.maddeler);
    expect(new Set(l).size).toBe(l.length);
    expect(l).not.toContain('yayin');
  });

  it('hücre sütunun maddelerinin en kötüsü: durduran eksik uyarıdan, uyarı tamamdan ağır', () => {
    const takim = sutun('takim');
    expect(hucreOzeti([satir('takim-omru', 'tamam', true), satir('takim-hazirla', 'eksik', true)], takim, true)).toMatchObject({ durum: 'uyari', madde: 'takim-hazirla' });
    expect(hucreOzeti([satir('cnc', 'eksik', false)], sutun('nc'), true).durum).toBe('durur');
    expect(hucreOzeti([satir('takim-omru', 'gerekmez', true)], takim, true).durum).toBe('gerekmez');
  });

  it('okunamayan özet "Okunmadı", okunurken ve maddesiz işte boş (Eksik ya da Tamam uydurulmaz)', () => {
    expect(hucreOzeti(null, sutun('rota'), true).durum).toBe('okunmadi');
    expect(hucreOzeti(null, sutun('rota'), false).durum).toBe('yok');
    expect(hucreOzeti([satir('cnc', 'tamam', false)], sutun('rota'), true).durum).toBe('yok');
  });

  it('emir geneli madde işaretlenir (operasyon satırında "emirle aynı")', () => {
    expect(hucreOzeti([satir('rota', 'tamam', true, false)], sutun('rota'), true).emirDuzeyi).toBe(true);
    expect(hucreOzeti([satir('cnc', 'tamam', false, true)], sutun('nc'), true).emirDuzeyi).toBe(false);
  });

  it('emir hücresi operasyonların en kötüsü ve sorunlu operasyon sayısı; ilk sorunlu operasyonun sırası', () => {
    const nc = sutun('nc');
    const o = emirHucresi([
      hucreOzeti([satir('cnc', 'tamam', false)], nc, true),
      hucreOzeti([satir('cnc', 'eksik', false)], nc, true),
      hucreOzeti([satir('cnc', 'eksik', false)], nc, true),
    ]);
    expect(o).toMatchObject({ durum: 'durur', sorunlu: 2, ilk: 1 });
    expect(emirHucresi([])).toMatchObject({ durum: 'yok', sorunlu: 0, ilk: null });
    // Durduran eksik uyarıdan ağırdır: sıraları değişirse emir satırı "Uyarı" der.
    const uyari = hucreOzeti([satir('takim-omru', 'eksik', true)], sutun('takim'), true);
    const durur = hucreOzeti([satir('cnc', 'eksik', false)], nc, true);
    expect(emirHucresi([uyari, durur]).durum).toBe('durur');
    expect(emirHucresi([durur, uyari]).durum).toBe('durur');
  });

  it('3820: sütun seçimi saklanır; bozuk ya da yok ise varsayılan, bilinmeyen anahtar atılır; madde sütunları tabloda', () => {
    expect([...varsayilanGizli()].sort()).toEqual(['aparat', 'fason', 'olcu', 'planBas', 'takim']);
    expect(gizliOku(null)).toEqual(varsayilanGizli());
    expect(gizliOku('{bozuk')).toEqual(varsayilanGizli());
    expect([...gizliOku('["kisi","yok-boyle"]')]).toEqual(['kisi']);
    expect([...gizliOku('[]')]).toEqual([]);
    for (const m of MADDE_SUTUNLARI) expect(SUTUNLAR.some((s) => s.anahtar === m.anahtar)).toBe(true);
  });

  it('3820: plan bilgisi kişi adını ve başlangıcı okur; plan bitişi termin gününden sonraysa risk', () => {
    const p = { due: '2026-12-01', tmi: { plan: { canli: true, kaynak: { tur: 'kisi', id: 4, ad: 'ORN Kişi' } }, planSaati: { baslangic: '2026-11-30T08:00:00', bitis: '2026-12-01T22:00:00' } } };
    expect(planBilgisi(p)).toMatchObject({ kisi: 'ORN Kişi', kisiPlani: true, terminRiski: false });
    expect(planBilgisi({ ...p, tmi: { ...p.tmi, planSaati: { baslangic: '2026-12-01T20:00:00', bitis: '2026-12-02T03:00:00' } } }).terminRiski).toBe(true);
    // Makine kaynağında kişi yok; adı gelmemiş kişi kaynağı "kişi planı" bilinir ama ad uydurulmaz.
    expect(planBilgisi({ tmi: { plan: { kaynak: { tur: 'makine' } } } })).toMatchObject({ kisi: null, kisiPlani: false, baslangic: null, terminRiski: false });
    expect(planBilgisi({ tmi: { plan: { kaynak: { tur: 'kisi' } } } })).toMatchObject({ kisi: null, kisiPlani: true });
    expect(planBilgisi({ due: '', tmi: { planSaati: { baslangic: 'x', bitis: 'y' } } })).toMatchObject({ baslangic: null, bitis: null, terminRiski: false });
  });

  it('3820: ilk parça kararı Kalite Merkezi’nden; karar yoksa yalnız istenen işte "bekliyor"; emirde en kötüsü', () => {
    expect(ilkParcaDurumu({ tmi: { ilkParcaGerekli: true } }, null)).toBe('bekliyor');
    expect(ilkParcaDurumu({ tmi: {} }, null)).toBeNull();
    expect(ilkParcaDurumu({ tmi: { ilkParcaGerekli: true } }, 'onay')).toBe('onay');
    expect(enKotuIlkParca(['onay', null, 'bekliyor'])).toBe('bekliyor');
    expect(enKotuIlkParca(['bekliyor', 'ret', 'onay'])).toBe('ret');
    expect(enKotuIlkParca([null, null])).toBeNull();
  });
});
