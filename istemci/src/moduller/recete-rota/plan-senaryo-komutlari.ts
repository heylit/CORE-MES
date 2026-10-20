import type { RotaHazirKomut } from './rota-komutlari.ts';

// Plan stüdyosu (plan-ekran-verisi-yeri.md 4.2): ekranın senaryosu plan modülünün taslağıdır. Senaryodaki sıra, dondurma ve makine ataması
// o taslağa yazılır, canlıya alma da taslağın kendi ucuyla yapılır. Taslağın sürümü çerçeveye verilmez: köprü yazmadan hemen önce plan
// modülünden okur (taslağa yalnız açan kişi yazar; kural, yetki ve sürüm denetimi plan modülündedir). Okuma köprüden verilir: tablo
// sunucu testinde de aynı uçlarla denenir.
type Nesne = Record<string, unknown>;
export interface PlanSenaryoKomutu { hafif: true; hazirla: (girdi: Nesne) => Promise<RotaHazirKomut> }

const gecersiz = (alan: string): Error => new Error(`Geçersiz ${alan}.`);
const taslakNo = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v >= 1e10) throw gecersiz('taslak');
  return v;
};
export type PlanOku = (yol: string) => Promise<{
  taslak: { id: number; surum: number } | null;
  yerlesimler?: { isEmriId: number; emirNo: string; opNo: number; dondurulmus: boolean }[];
}>;

export const planSenaryoKomutlari = (oku: PlanOku): Readonly<Record<string, PlanSenaryoKomutu>> => {
  const taslakSurumu = async (id: number): Promise<number> => {
    const p = await oku(`/plan?taslak=${String(id)}`);
    if (p.taslak?.id !== id) throw gecersiz('taslak');
    return p.taslak.surum;
  };
  // Dondurma kendi açtığı taslağa (taslak verilmezse plan modülü yeni taslak açar) ya da ekranın az önce yazdığı taslağa yazılır.
  const taslakGirdisi = async (v: unknown): Promise<{ id: number; surum: number } | null> => {
    if (v === undefined || v === null) return null;
    const id = taslakNo(v);
    return { id, surum: await taslakSurumu(id) };
  };
  return {
    // Yeni senaryo: plan modülünde kişiye ait taslak açılır (taban canlı plan). Cevap senaryo listesidir; çerçeve kendi açtığını adından bulur.
    'plan-senaryo-ac': {
      hafif: true,
      hazirla: async (g) => {
        const ad = g['ad'];
        if (typeof ad !== 'string' || ad.trim() === '') throw gecersiz('senaryo adı');
        return { yol: '/plan/senaryolar', govde: { ad }, tekrarKorumali: true };
      },
    },
    // Senaryonun kuyrukları taslağa yazılır (canlıya alınmaz). Kuyruk yazımı yalnız sırayı taşır; ayar `plan-senaryo-ayar` iledir.
    'plan-senaryo-yaz': {
      hafif: true,
      hazirla: async (g) => {
        const id = taslakNo(g['taslak']);
        if (!Array.isArray(g['kuyruklar'])) throw gecersiz('kuyruk');
        return { yol: '/plan/kuyruklari-yaz', tekrarKorumali: true,
          govde: { kuyruklar: g['kuyruklar'], taslak: { id, surum: await taslakSurumu(id) } } };
      },
    },
    // Senaryonun plan ayarı taslağa, plan modülünün ayar ucundan yazılır.
    'plan-senaryo-ayar': {
      hafif: true,
      hazirla: async (g) => {
        const id = taslakNo(g['taslak']);
        const ayar = g['ayar'];
        if (typeof ayar !== 'object' || ayar === null || Array.isArray(ayar)) throw gecersiz('ayar');
        return { yol: '/plan/ayar', tekrarKorumali: true, govde: { ayar, taslak: { id, surum: await taslakSurumu(id) } } };
      },
    },
    // Canlıya alma plan.canliya-al ister. Ekranda iki kez onaylandığı için canlı arada değiştiyse de alınır (senaryonun hâli geçerli olur).
    'plan-senaryo-canliya-al': {
      hafif: true,
      hazirla: async (g) => {
        const id = taslakNo(g['taslak']);
        return { yol: `/plan/senaryolar/${String(id)}/canliya-al`, tekrarKorumali: true, govde: { surum: await taslakSurumu(id), cakismalariKabul: true } };
      },
    },
    // Ekranın Canlıya al'ı: kuyruğun az önce yazıldığı taslak canlıya alınır. Canlı arada değiştiyse alınmaz (ekran eski planla yazdı).
    'plan-canliya-al': {
      hafif: true,
      hazirla: async (g) => {
        const id = taslakNo(g['taslak']);
        return { yol: `/plan/senaryolar/${String(id)}/canliya-al`, tekrarKorumali: true, govde: { surum: await taslakSurumu(id), cakismalariKabul: false } };
      },
    },
    // Dondurma plan modülünündür (plan.kilitle): hangi işin donacağını plan ayarındaki gün sayısıyla plan modülü seçer.
    'plan-dondur': {
      hafif: true,
      hazirla: async (g) => ({ yol: '/plan/dondur', tekrarKorumali: true, govde: { taslak: await taslakGirdisi(g['taslak']) } }),
    },
    'plan-dondurmayi-kaldir': {
      hafif: true,
      hazirla: async (g) => ({ yol: '/plan/dondurmayi-kaldir', tekrarKorumali: true, govde: { taslak: await taslakGirdisi(g['taslak']) } }),
    },
    // Tek işin dondurması: ekran işi `emirNo|opNo` ile bilir; iş emri kimliği yazılacak planın (taslak ya da canlı) yerleşiminden okunur.
    'plan-is-dondurmayi-kaldir': {
      hafif: true,
      hazirla: async (g) => {
        const anahtar = g['anahtar'];
        if (typeof anahtar !== 'string' || !/^.+\|\d+$/.test(anahtar)) throw gecersiz('iş');
        const taslak = await taslakGirdisi(g['taslak']);
        const p = await oku(taslak === null ? '/plan' : `/plan?taslak=${String(taslak.id)}`);
        const y = (p.yerlesimler ?? []).find((x) => x.dondurulmus && `${x.emirNo}|${String(x.opNo)}` === anahtar);
        if (!y) throw new Error('Bu iş planda dondurulmuş değil.');
        return { yol: `/plan/is-emirleri/${String(y.isEmriId)}/dondurmayi-kaldir`, tekrarKorumali: true, govde: { taslak } };
      },
    },
    // Sil: taslak kapanır (vazgeçildi), kayıt silinmez.
    'plan-senaryo-vazgec': {
      hafif: true,
      hazirla: async (g) => {
        const id = taslakNo(g['taslak']);
        return { yol: `/plan/senaryolar/${String(id)}/vazgec`, govde: { surum: await taslakSurumu(id) } };
      },
    },
  };
};
