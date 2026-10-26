import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DegerlendirmeCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { ApiHatasi } from '../../../../ortak/veri/api.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { degerlendirmeIste, type DegerlendirmeUcu } from '../siparis/degerlendirme.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { KAYDEDILEMEDI, kurulanPlaniAl, planKur, planKurSifirla, VERI_DEGISTI } from './coz.ts';
import { ornekCalisma } from './ornek.ts';

afterEach(planKurSifirla);

const PLAN = { ops: { 'O1.10': { id: 'O1.10', job: 'O1', m: '100', S: 8, C: 9 } }, fail: [], J: { O1: { C: 9, T: 0 } }, ozet: { wT: 1.25, late: 1, n: 2 }, dataVer: 4 };
const cevap = (dataVer: number): DegerlendirmeCevabi => ({
  calismaSurumu: 7, dataVer, baslangic: '2026-10-19', simdi: 9, maliyetGorunur: true, sonuc: { tur: 'plan-kur', plan: PLAN },
});
// Yazıcının degistir'i gibi: kopyayı değiştirir, fn true dönerse veri sürümünü bir artırıp alır.
function komutKur(c: PlanlamaCalismasi, surum: number | null = 7) {
  const durum = { c, ne: [] as string[] };
  const komut = {
    kaydet: vi.fn(async () => surum),
    degistir: vi.fn((ne: string, fn: (t: PlanlamaCalismasi) => boolean | void) => {
      const t = structuredClone(durum.c); if (fn(t) === false) return false;
      t.dataVer = durum.c.dataVer + 1; durum.c = t; durum.ne.push(ne); return true;
    }),
  } as unknown as CalismaKomutu;
  return { komut, durum };
}

describe('planı kur (576)', () => {
  it('çalışmayı kaydedip sunucudan planı ister; plan çalışmaya güncel veri sürümüyle, kuranın adıyla girer, önceki özet saklanır', async () => {
    const c = { ...ornekCalisma(), dataVer: 4 } as PlanlamaCalismasi;
    const once = c.plan?.ozet ?? null;
    const { komut, durum } = komutKur(c);
    const iste = vi.fn(async () => cevap(4));
    expect(await planKur({ komut, kim: 'Deneme Kisi', iste, simdi: () => 1000 })).toBeNull();
    expect(iste).toHaveBeenCalledWith(7, { tur: 'plan-kur' });
    expect(durum.ne).toEqual(['Plan çözüldü']);
    expect(durum.c.dataVer).toBe(5);
    expect(durum.c.plan).toMatchObject({ ops: PLAN.ops, dataVer: 5, kim: 'Deneme Kisi', zaman: 1000, kaynak: 'sifir', oncekiOzet: once });
  });

  it('çalışma kaydedilemezse sunucuya gitmez; plan başka veri sürümünden kurulduysa alınmaz', async () => {
    const c = { ...ornekCalisma(), dataVer: 4 } as PlanlamaCalismasi;
    const k1 = komutKur(c, null); const iste = vi.fn(async () => cevap(4));
    expect(await planKur({ komut: k1.komut, kim: 'x', iste })).toBe(KAYDEDILEMEDI);
    expect(iste).not.toHaveBeenCalled();
    const k2 = komutKur(c);
    expect(await planKur({ komut: k2.komut, kim: 'x', iste: async () => cevap(5) })).toBe(VERI_DEGISTI);
    expect(k2.durum.c).toBe(c);
  });

  it('sunucu reddederse ileti döner, çalışma değişmez; aynı anda ikinci istek gitmez', async () => {
    const c = { ...ornekCalisma(), dataVer: 4 } as PlanlamaCalismasi;
    const { komut, durum } = komutKur(c);
    expect(await planKur({ komut, kim: 'x', iste: async () => { throw new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'x' }); } })).toBe('Bu hesabı görme yetkiniz yok.');
    expect(durum.c).toBe(c);
    let bitir: (x: DegerlendirmeCevabi) => void = () => undefined;
    const iste = vi.fn(() => new Promise<DegerlendirmeCevabi>((t) => { bitir = t; }));
    const ilk = planKur({ komut, kim: 'x', iste });
    expect(await planKur({ komut, kim: 'x', iste })).toBeNull();
    await vi.waitFor(() => expect(iste).toHaveBeenCalledTimes(1));
    bitir(cevap(4)); expect(await ilk).toBeNull();
  });

  it('kurulanPlaniAl veri sürümü tutmazsa çalışmaya dokunmaz', () => {
    const t = { ...ornekCalisma(), dataVer: 4 } as PlanlamaCalismasi; const once = t.plan;
    expect(kurulanPlaniAl(t, PLAN, 3, 'x', 1)).toBe(false);
    expect(t.plan).toBe(once);
  });
});

describe('değerlendirme ucu (463 a): başlat, sonucu bekle', () => {
  const ucKur = (durumlar: unknown[]) => {
    const u: DegerlendirmeUcu & { yollar: string[] } = {
      yollar: [],
      post: vi.fn(async (yol: string) => { u.yollar.push(`POST ${yol}`); return { is: 'b0e6c1c4-2f9a-4c5e-9d55-0f1c1e2a3b4c' } as never; }),
      get: vi.fn(async (yol: string) => { u.yollar.push(`GET ${yol}`); return durumlar.shift() as never; }),
      bekle: vi.fn(async () => undefined),
      simdi: () => 0,
    };
    return u;
  };
  it('sürüyor dedikçe bekler, bitince cevabı verir', async () => {
    const u = ucKur([{ durum: 'suruyor' }, { durum: 'bitti', cevap: cevap(4) }]);
    expect(await degerlendirmeIste(7, { tur: 'plan-kur' }, u)).toEqual(cevap(4));
    expect(u.post).toHaveBeenCalledWith('/recete-rota/planlama-degerlendirmesi', { surum: 7, istek: { tur: 'plan-kur' } });
    expect(u.yollar.filter((x) => x.startsWith('GET'))).toEqual(Array(2).fill('GET /recete-rota/planlama-degerlendirmesi/b0e6c1c4-2f9a-4c5e-9d55-0f1c1e2a3b4c'));
    expect(u.bekle).toHaveBeenCalledTimes(1);
  });
  it('hesaptaki ret kodun HTTP durumuyla ApiHatasi olur', async () => {
    const u = ucKur([{ durum: 'hata', kod: 'MESGUL', mesaj: 'Meşgul' }]);
    await expect(degerlendirmeIste(7, { tur: 'plan-kur' }, u)).rejects.toMatchObject({ durum: 503, message: 'Meşgul' });
  });
});
