import { describe, expect, it } from 'vitest';
import type { Kayit, PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { ONEK as ESKI_ONEK, PLANLAMA_ANAHTARI as ESKI_PLANLAMA_ANAHTARI } from '../ReceteRotaCercevesi.tsx';
import { ONEK, PLANLAMA_ANAHTARI, acilisOku, type Okuyucu } from './veri.ts';

// Veri uydurmadır.
const BOS: PlanlamaCalismasiCevabi = { calisma: null, surum: null };
function okuyucu(kayitlar: Kayit[], ret: readonly string[] = [], calisma: PlanlamaCalismasiCevabi = BOS): Okuyucu & { yollar: string[] } {
  const yollar: string[] = [];
  const cevap: Record<string, unknown> = {
    '/recete-rota/ben': { kisi: { id: 1, ad: 'Deneme' }, yazabilir: false },
    '/recete-rota/kayitlar': { kayitlar },
    '/recete-rota/planlama-calismasi': calisma,
    '/recete-rota/durum': { items: null },
    '/plan/surum': { planSurumu: 4, sonCanliyaAlma: null },
    '/plan/senaryolar': { canliSurum: 4, senaryolar: [] },
    '/plan/motor-uyarilari': { uyarilar: ['uyari'] },
  };
  return {
    yollar,
    get: async <T,>(yol: string): Promise<T> => {
      yollar.push(yol);
      if (ret.includes(yol)) throw new Error(`ret ${yol}`);
      return cevap[yol] as T;
    },
  };
}

describe('acilisOku', () => {
  it('anahtarlar eski ekranınkiyle aynıdır', () => {
    expect(ONEK).toBe(ESKI_ONEK);
    expect(PLANLAMA_ANAHTARI).toBe(ESKI_PLANLAMA_ANAHTARI);
  });

  it('çalışma sunucunun birleştirdiği uçtan, Reçete ve Rota kaydı kendi anahtarından okunur; dilimler dolu gelir', async () => {
    const o = okuyucu([
      // Kayıtlardaki çalışma birleşmemiş halidir; ekran onu kullanmaz.
      { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: { surum: 2, D: { siparisler: [], tezgahlar: [], urunler: [] } }, surum: 9 },
      { anahtar: ONEK, bicim: 'json', deger: { items: [] }, surum: 3 },
      { anahtar: `${PLANLAMA_ANAHTARI}-ui4`, bicim: 'json', deger: { sayfa: 'x' }, surum: 1 },
    ], [], { calisma: { surum: 2, D: { siparisler: [{ id: 'S1' }], tezgahlar: [], urunler: [] } }, surum: 9 });
    const d = await acilisOku(o);
    expect(d.calisma?.surum).toBe(2);
    expect(d.calisma?.D.siparisler.map((x) => x.id)).toEqual(['S1']);
    expect(d.calismaSurumu).toBe(9);
    expect(o.yollar).toContain('/recete-rota/planlama-calismasi');
    expect(d.receteRotaKaydi).toEqual({ items: [] });
    expect(d.motorUyarilari).toEqual(['uyari']);
    expect(d.planSurumu?.planSurumu).toBe(4);
    expect(d.okunamayan).toEqual([]);
  });

  it('kayıt yoksa çalışma ve sürüm null; okunamayan dilim null ve adıyla listede', async () => {
    const d = await acilisOku(okuyucu([], ['/recete-rota/durum', '/plan/motor-uyarilari']));
    expect(d.calisma).toBeNull();
    expect(d.calismaSurumu).toBeNull();
    expect(d.receteRotaKaydi).toBeNull();
    expect(d.durum).toBeNull();
    expect(d.motorUyarilari).toBeNull();
    expect(d.okunamayan).toEqual(['durum', 'motorUyarilari']);
  });

  it('zorunlu okuma düşerse açılış düşer', async () => {
    await expect(acilisOku(okuyucu([], ['/recete-rota/ben']))).rejects.toThrow();
    await expect(acilisOku(okuyucu([], ['/recete-rota/planlama-calismasi']))).rejects.toThrow();
  });

  it('sunucunun verdiği çalışma biçime uymazsa çalışma ve sürüm null', async () => {
    const d = await acilisOku(okuyucu([], [], { calisma: { surum: 1 }, surum: 4 }));
    expect(d.calisma).toBeNull();
    expect(d.calismaSurumu).toBeNull();
  });
});
