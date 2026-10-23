import type { PLAN_ONAY_KOMUTLARI, PlanOnayKomutu } from '#paylasilan/sozlesme/plan.ts';
import type { RotaHazirKomut } from './rota-komutlari.ts';

// Plan stüdyosu (plan-ekran-verisi-yeri.md 4.2): ekranın senaryosu plan modülünün taslağıdır. Senaryodaki sıra, dondurma ve makine ataması
// o taslağa yazılır, canlıya alma da taslağın kendi ucuyla yapılır. Taslağın sürümü çerçeveye verilmez: köprü yazmadan hemen önce plan
// modülünden okur (taslağa yalnız açan kişi yazar; kural, yetki ve sürüm denetimi plan modülündedir). Okuma köprüden verilir: tablo
// sunucu testinde de aynı uçlarla denenir. Canlıya tek kapı (H0): taslak onaya gönderilir, onaylayan canlıya alır ya da gerekçeyle geri
// gönderir; canlıya alma yalnız onaydaki taslaktan geçer.
type Nesne = Record<string, unknown>;
export interface PlanSenaryoKomutu { hafif: true; hazirla: (girdi: Nesne) => Promise<RotaHazirKomut> }

const gecersiz = (alan: string): Error => new Error(`Geçersiz ${alan}.`);
const taslakNo = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v >= 1e10) throw gecersiz('taslak');
  return v;
};
// Onay geçişlerinin yolları sözleşmedeki yollarla tip denetiminde eşlenir (istemci sözleşmeyi yalnız tip olarak ithal eder).
const ONAY_YOLLARI: { readonly [K in PlanOnayKomutu]: (typeof PLAN_ONAY_KOMUTLARI)[K]['yol'] } = {
  'onaya-gonder': '/plan/senaryolar/:id/onaya-gonder',
  'onaydan-cek': '/plan/senaryolar/:id/onaydan-cek',
  'geri-gonder': '/plan/senaryolar/:id/geri-gonder',
  'canliya-al': '/plan/senaryolar/:id/canliya-al',
};
const notMetni = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw gecersiz('not');
  const t = v.trim();
  return t === '' ? null : t.slice(0, 500);
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
  const onayIstegi = async (k: PlanOnayKomutu, g: Nesne, ek: Nesne): Promise<RotaHazirKomut> => {
    const id = taslakNo(g['taslak']);
    return { yol: ONAY_YOLLARI[k].replace(':id', String(id)), tekrarKorumali: true, govde: { surum: await taslakSurumu(id), ...ek } };
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
    // Onay geçişleri (PLAN_ONAY_KOMUTLARI): yol ve işlem sözleşmeden; kim yapabilir (sahip, onaylayan, dört göz) plan modülünde denetlenir.
    'plan-senaryo-onaya-gonder': {
      hafif: true,
      hazirla: async (g) => onayIstegi('onaya-gonder', g, { not: notMetni(g['not']) }),
    },
    'plan-senaryo-onaydan-cek': { hafif: true, hazirla: async (g) => onayIstegi('onaydan-cek', g, {}) },
    'plan-senaryo-geri-gonder': {
      hafif: true,
      hazirla: async (g) => {
        const neden = notMetni(g['neden']);
        if (neden === null) throw new Error('Geçersiz neden: geri gönderme nedenini yaz.');
        return onayIstegi('geri-gonder', g, { neden });
      },
    },
    // Onaylayanın canlıya alması: yalnız onaydaki taslak. Onaylayan farkı ekranda incelediği için canlı arada değiştiyse de alınır (senaryonun
    // hâli geçerli olur).
    'plan-senaryo-canliya-al': { hafif: true, hazirla: async (g) => onayIstegi('canliya-al', g, { cakismalariKabul: true }) },
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
