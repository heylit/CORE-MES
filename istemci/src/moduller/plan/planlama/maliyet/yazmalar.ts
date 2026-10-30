import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type { PlanlamaCalismasi, PlanVerisi } from '../tipler.ts';
import {
  anahtarAdi, fasonTalasId, sayiOku, GUN_TURU_ADI, kgFiyatlari, maliyetSistemi, mesaiSistemi, norm, sonrakiKimlik, talasFiyatlari, tl, wipAyar, ymAyar,
  type GiderKalemi, type GunTuru, type MaliyetAyari, type MaliyetSistemi, type MesaiSistemi, type TezgahGideri,
} from './kurallar.ts';

// Tek alanlık yazmalar: her biri bir değişiklik ve bir "Geri al"dır (zu-yan-sayfalar ve zz6 change olayları, zz25 formlarının alan döngüsü).
// Satır içi girdi ve adımlı form aynı yazmayı kullanır. Ad ve ayrıntı metni bugünkü sayfanınkidir.

// planKoru: değişiklik planı eskitmez (sayfanın degistir(..., { planKoru: true })'su; maliyet ve gider verisi plan amacına girmez).
export type Yaz = (ne: string, ayrinti: string, fn: (t: PlanlamaCalismasi) => boolean | void, secenek?: { planKoru?: boolean }) => boolean;
type Nesne = Record<string, unknown>;
export const nesneMi = (v: unknown): v is Nesne => typeof v === 'object' && v !== null && !Array.isArray(v);
// Fiyat kaydının günü tesis günüdür; UTC günü gece yarısından sonraki ilk saatlerde dünü yazar.
export const bugunIso = (simdi = Date.now()): string => tesisGunu(simdi);
export function dYaz(t: PlanlamaCalismasi, alanlar: Nesne): void { t.D = { ...t.D, ...alanlar }; }
// Genel gider ve mesai sisteminin belgedeki bilinmeyen alanları korunur.
export function msYaz(t: PlanlamaCalismasi, f: (M: MaliyetSistemi) => void): void {
  const M = maliyetSistemi(t.D);
  f(M);
  dYaz(t, { maliyetSis: { ...(nesneMi(t.D.maliyetSis) ? t.D.maliyetSis : {}), ...M } });
}
export function mesYaz(t: PlanlamaCalismasi, f: (M: MesaiSistemi) => void): void {
  const M = mesaiSistemi(t.D);
  f(M);
  dYaz(t, { mesaiSis: { ...(nesneMi(t.D.mesaiSis) ? t.D.mesaiSis : {}), ...M } });
}
export const ayarlar = (D: PlanVerisi): Nesne => (nesneMi(D.ayarlar) ? D.ayarlar : {});
export const planTL = (D: PlanVerisi): Nesne => (nesneMi(D.planTL) ? D.planTL : {});
const yok = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : String(v as number));
const MS = { planKoru: true };

// ---------- Maliyetler ----------
export function tezUcretYaz(yaz: Yaz, D: PlanVerisi, id: string, v: number): boolean {
  const t = D.tezgahlar.find((z) => z.id === id);
  if (!t) return false;
  return yaz('Tezgâh saat maliyeti değişti', `${id}: ${yok(t.ucret)} → ${String(v)} TL/sa`, (x) => {
    x.D = { ...x.D, tezgahlar: x.D.tezgahlar.map((z) => (z.id === id ? { ...z, ucret: v } : z)) };
  });
}
// Boş bırakılabilen yalnız operatör ücreti ve tek oran genel giderdir (ym-ayar).
export function maliyetAyariYaz(yaz: Yaz, D: PlanVerisi, k: keyof MaliyetAyari, v: number | null): boolean {
  if (v === null && k !== 'operatorUcret' && k !== 'genelGider') return false;
  return yaz('Maliyet ayarı değişti', `${k}: ${yok(ymAyar(D)[k])} → ${yok(v)}`, (x) => { dYaz(x, { planTL: { ...planTL(x.D), [k]: v } }); });
}
export function ucretYaz(yaz: Yaz, D: PlanVerisi, k: 'ayarciUcret' | 'mesaiUcret', v: number): boolean {
  return yaz('Ücret değişti', `${k === 'mesaiUcret' ? 'Mesai' : 'Ayarcı'} ücreti: ${yok(ayarlar(D)[k])} → ${String(v)} TL/sa`, (x) => {
    dYaz(x, { ayarlar: { ...ayarlar(x.D), [k]: v } });
  });
}
// 1280 a: kg fiyatını Satın Alma girer; planın satırı yalnız kalite ve formun fire payını tutar. Eski satırdaki fiyat silinmez, okunmaz.
const kgHam = (D: PlanVerisi): unknown[] => (Array.isArray(D.kgFiyat) ? (D.kgFiyat as unknown[]) : []);
export function kgAlanYaz(yaz: Yaz, D: PlanVerisi, id: string, v: number | null, kim: string): boolean {
  const r = (kgFiyatlari(D) ?? []).find((z) => z.id === id);
  if (!r) return false;
  return yaz('Fire payı değişti', `${r.kalite} ${r.form || 'her form'}: ${yok(r.fire)} → ${yok(v)}`, (x) => {
    dYaz(x, { kgFiyat: kgHam(x.D).map((z) => (nesneMi(z) && String(z.id) === id ? { ...z, fire: v, tarih: bugunIso(), kim } : z)) });
  });
}
export function kgSilYaz(yaz: Yaz, D: PlanVerisi, id: string): boolean {
  const r = (kgFiyatlari(D) ?? []).find((z) => z.id === id);
  if (!r) return false;
  return yaz('Fire payı silindi', `${r.kalite} ${r.form}`, (x) => { dYaz(x, { kgFiyat: kgHam(x.D).filter((z) => !(nesneMi(z) && String(z.id) === id)) }); });
}
export function kgVarMi(D: PlanVerisi, kalite: string, form: string): boolean {
  return (kgFiyatlari(D) ?? []).some((r) => norm(r.kalite) === norm(kalite) && norm(r.form) === norm(form));
}
export function kgEkleYaz(yaz: Yaz, s: { cins: string; kalite: string; form: string; fire: number }, kim: string): boolean {
  return yaz('Fire payı eklendi', `${s.kalite} ${s.form || 'her form'}: %${String(s.fire)}`, (x) => {
    const n = sonrakiKimlik((kgFiyatlari(x.D) ?? []).map((r) => ({ id: r.id })), 'KG-');
    dYaz(x, { kgFiyat: [...kgHam(x.D), { id: n, cins: s.cins, kalite: s.kalite, form: s.form, fire: s.fire, tarih: bugunIso(), kim }] });
  });
}
export const fasonFiyatAlani = (D: PlanVerisi, id: string): 'saatFiyat' | 'fiyat' => (id === fasonTalasId(D) && id !== '' ? 'saatFiyat' : 'fiyat');
export function fasonAlanYaz(yaz: Yaz, D: PlanVerisi, id: string, k: 'saatFiyat' | 'fiyat' | 'tasima', v: number | null): boolean {
  const f = (D.fasoncular ?? []).find((z) => z.id === id);
  if (!f) return false;
  return yaz('Fason fiyatı değişti', `${f.ad ?? f.id} ${k}: ${yok(f[k])} → ${yok(v)}`, (x) => {
    x.D = { ...x.D, fasoncular: (x.D.fasoncular ?? []).map((z) => {
      if (z.id !== id) return z;
      const y: Nesne = { ...z };
      if (v === null) delete y[k]; else y[k] = v;
      return y as typeof z;
    }) };
  });
}
// Talaş fiyatı kalite başına tek satırdır; kg fiyatından türeyen boş satıra ilk yazmada kayıt açılır (tlGoc + tlSatir).
export function talasYaz(yaz: Yaz, D: PlanVerisi, kalite: string, v: number | null, kim: string): boolean {
  const t = talasFiyatlari(D).find((z) => norm(z.kalite) === norm(kalite));
  if (!t) return false;
  return yaz('Talaş satış fiyatı değişti', `${t.kalite}: ${yok(t.fiyat)} → ${yok(v)} TL/kg`, (x) => {
    const ham = Array.isArray(x.D.talasFiyat) ? (x.D.talasFiyat as unknown[]) : [];
    const var0 = ham.some((z) => nesneMi(z) && norm(z.kalite) === norm(kalite));
    const yeni = { fiyat: v, tarih: bugunIso(), kim };
    dYaz(x, { talasFiyat: var0 ? ham.map((z) => (nesneMi(z) && norm(z.kalite) === norm(kalite) ? { ...z, ...yeni } : z)) : [...ham, { kalite: t.kalite, cins: t.cins, ...yeni }] });
  }, MS);
}
export function beklemeAcikYaz(yaz: Yaz, ac: boolean): boolean {
  return yaz('Bekleme maliyeti ayarı', `Bekleme maliyeti plan amacında: ${ac ? 'açık' : 'kapalı'}`, (x) => {
    dYaz(x, { planTL: { ...planTL(x.D), wip: { ...(nesneMi(planTL(x.D).wip) ? (planTL(x.D).wip as Nesne) : {}), ac } } });
  });
}
export function vadeBasYaz(yaz: Yaz, v: 'bitis' | 'termin'): boolean {
  return yaz('Ödeme vadesi başlangıcı', v === 'bitis' ? 'Üretim bitince' : 'Terminde', (x) => {
    dYaz(x, { planTL: { ...planTL(x.D), wip: { ...(nesneMi(planTL(x.D).wip) ? (planTL(x.D).wip as Nesne) : {}), vadeBas: v } } });
  });
}
export const vadeBas = (D: PlanVerisi): 'bitis' | 'termin' => wipAyar(D).vadeBas;
// Siparişin erken sevk bayrağı (zz3-erken-sevk): işaretli siparişte vade üretim bitince başlar.
export function erkenSevkYaz(yaz: Yaz, D: PlanVerisi, id: string, v: boolean): boolean {
  const s = D.siparisler.find((z) => z.id === id);
  if (!s) return false;
  return yaz('Erken sevk değişti', `${id}: ${s.erkenSevk === true ? 'evet' : 'hayır'} → ${v ? 'evet' : 'hayır'}`, (x) => {
    x.D = { ...x.D, siparisler: x.D.siparisler.map((z) => (z.id === id ? { ...z, erkenSevk: v } : z)) };
  });
}
export function netKgYaz(yaz: Yaz, D: PlanVerisi, id: string, v: number | null): boolean {
  const u = D.urunler.find((z) => z.id === id);
  if (!u) return false;
  return yaz('Ürün bekleme bilgisi', `${id} netKg: ${yok(u.netKg)} → ${yok(v)}`, (x) => {
    x.D = { ...x.D, urunler: x.D.urunler.map((z) => { if (z.id !== id) return z; const y: Nesne = { ...z }; if (v === null) delete y.netKg; else y.netKg = v; return y as typeof z; }) };
  }, MS);
}

// Sipariş tutarı ve vadesi çalışmada kalır: kaynak okuması yalnız yeni siparişte gelir'i boş kurar (girdi.betik siparisler).
export function siparisFiyatYaz(yaz: Yaz, D: PlanVerisi, id: string, gelir: number, vade: number | null): boolean {
  const s = D.siparisler.find((z) => z.id === id);
  if (!s) return false;
  return yaz('Sipariş fiyatı değişti', `${id}: ${tl(s.gelir ?? null)} → ${tl(gelir)}, vade ${yok(s.vade)} → ${yok(vade)} gün`, (x) => {
    x.D = { ...x.D, siparisler: x.D.siparisler.map((z) => { if (z.id !== id) return z; const y: Nesne = { ...z, gelir }; if (vade === null) delete y.vade; else y.vade = vade; return y as typeof z; }) };
  });
}

// ---------- Genel gider (msDeg: plan korunur) ----------
export function giderKipYaz(yaz: Yaz, v: 'kalem' | 'tek'): boolean {
  return yaz('Genel gider hesabı', v === 'kalem' ? 'kalemlerden' : 'tek oran', (x) => { msYaz(x, (M) => { M.kip = v; }); }, MS);
}
export function verimYaz(yaz: Yaz, D: PlanVerisi, v: number): boolean {
  return yaz('Kapasite verimi', `%${String(maliyetSistemi(D).verim)} → %${String(v)}`, (x) => { msYaz(x, (M) => { M.verim = v; }); }, MS);
}
export function kwhYaz(yaz: Yaz, D: PlanVerisi, v: number): boolean {
  return yaz('Elektrik birim fiyatı', `${yok(maliyetSistemi(D).kwh)} → ${String(v)} TL/kWh`, (x) => { msYaz(x, (M) => { M.kwh = v; }); }, MS);
}
type KalemAlani = 'ad' | 'tur' | 'anahtar' | 'kapsam' | 'aylik';
const KALEM_AD: Record<KalemAlani, string> = { ad: 'Gider kalemi adı', tur: 'Gider kalemi türü', anahtar: 'Dağıtım anahtarı', kapsam: 'Gider kapsamı', aylik: 'Gider tutarı' };
export function kalemYaz<K extends KalemAlani>(yaz: Yaz, D: PlanVerisi, id: string, k: K, v: GiderKalemi[K]): boolean {
  const kal = maliyetSistemi(D).kalemler.find((z) => z.id === id);
  if (!kal) return false;
  const ayr = k === 'ad' ? `${kal.ad} → ${String(v)}` : k === 'aylik' ? `${kal.ad}: ${tl(kal.aylik)} → ${tl(v as number | null)}`
    : k === 'anahtar' ? `${kal.ad}: ${anahtarAdi(String(v))}` : k === 'kapsam' ? `${kal.ad}: ${String(v) || 'bütün atölye'}` : `${kal.ad}: ${String(v)}`;
  return yaz(KALEM_AD[k], ayr, (x) => { msYaz(x, (M) => { M.kalemler = M.kalemler.map((z) => (z.id === id ? { ...z, [k]: v } : z)); }); }, MS);
}
export function kalemSilYaz(yaz: Yaz, D: PlanVerisi, id: string): boolean {
  const kal = maliyetSistemi(D).kalemler.find((z) => z.id === id);
  if (!kal) return false;
  return yaz('Gider kalemi silindi', kal.ad, (x) => { msYaz(x, (M) => { M.kalemler = M.kalemler.filter((z) => z.id !== id); }); }, MS);
}
export function kalemEkleYaz(yaz: Yaz, s: { ad: string; tur: string; aylik: number; anahtar: string }): boolean {
  return yaz('Gider kalemi eklendi', `${s.ad}: ${tl(s.aylik)}`, (x) => {
    msYaz(x, (M) => { M.kalemler = [...M.kalemler, { id: sonrakiKimlik(M.kalemler, 'K'), ad: s.ad, tur: s.tur, aylik: s.aylik, anahtar: s.anahtar, kapsam: '' }]; });
  }, MS);
}
export function dolayliYaz(yaz: Yaz, D: PlanVerisi, id: string, k: 'gorev' | 'brut', v: string | number | null): boolean {
  const g = maliyetSistemi(D).dolayli.find((z) => z.id === id);
  if (!g) return false;
  const [ne, ayr] = k === 'gorev' ? ['Dolaylı personel görevi', `${g.gorev} → ${String(v)}`] : ['Dolaylı personel ücreti', `${g.gorev}: ${tl(g.brut)} → ${tl(v as number | null)}`];
  return yaz(ne, ayr, (x) => { msYaz(x, (M) => { M.dolayli = M.dolayli.map((z) => (z.id === id ? { ...z, [k]: v } : z)); }); }, MS);
}
export function dolayliSilYaz(yaz: Yaz, D: PlanVerisi, id: string): boolean {
  const g = maliyetSistemi(D).dolayli.find((z) => z.id === id);
  if (!g) return false;
  return yaz('Dolaylı personel silindi', g.gorev, (x) => { msYaz(x, (M) => { M.dolayli = M.dolayli.filter((z) => z.id !== id); }); }, MS);
}
export function dolayliEkleYaz(yaz: Yaz, gorev: string, brut: number): boolean {
  return yaz('Dolaylı personel eklendi', `${gorev}: ${tl(brut)}`, (x) => { msYaz(x, (M) => { M.dolayli = [...M.dolayli, { id: sonrakiKimlik(M.dolayli, 'G'), gorev, brut }]; }); }, MS);
}
const BOS_GIDER: TezgahGideri = { bedel: null, omur: null, hurda: null, kw: null, yuk: null, alan: null, sarf: null, bakim: null };
// Kaydı olmayan tezgâha ilk yazmada boş kayıt açılır; yalnız listede olmayan tezgâha yazılmaz.
export function tezGiderYaz(yaz: Yaz, D: PlanVerisi, id: string, k: keyof TezgahGideri, v: number | null): boolean {
  if (!D.tezgahlar.some((t) => t.id === id)) return false;
  return yaz('Tezgâh maliyet bilgisi', `${id} ${k}: ${yok(maliyetSistemi(D).tez[id]?.[k])} → ${yok(v)}`, (x) => {
    msYaz(x, (M) => { M.tez = { ...M.tez, [id]: { ...(M.tez[id] ?? BOS_GIDER), [k]: v } }; });
  }, MS);
}
// Önerilen doğrudan saat maliyetini makine saat maliyetine yazar; plan bunu işleme maliyetinde kullanır (ms-tez-yaz).
export function makineyeYaz(yaz: Yaz, l: { id: string; eski: number | null; yeni: number }[]): boolean {
  if (!l.length) return false;
  return yaz('Makine saat maliyeti hesaptan', l.map((z) => `${z.id}: ${yok(z.eski)} → ${String(z.yeni)}`).join('; '), (x) => {
    const m = new Map(l.map((z) => [z.id, z.yeni]));
    x.D = { ...x.D, tezgahlar: x.D.tezgahlar.map((t) => (m.has(t.id) ? { ...t, ucret: m.get(t.id) ?? null } : t)) };
  });
}

// ---------- Ek mesai ----------
export function kisiUcretYaz(yaz: Yaz, D: PlanVerisi, id: string, v: number | null): boolean {
  const u = mesaiSistemi(D).ucret[id];
  return yaz('Kişi ücreti', `${id}: ${tl(u?.brut ?? null)} → ${tl(v)}`, (x) => { mesYaz(x, (M) => { M.ucret = { ...M.ucret, [id]: { brut: v, yil: M.ucret[id]?.yil ?? null } }; }); });
}
export function kisiYilYaz(yaz: Yaz, D: PlanVerisi, id: string, v: number | null): boolean {
  const u = mesaiSistemi(D).ucret[id];
  return yaz('Yapılan fazla mesai', `${id}: ${String(u?.yil ?? 0)} → ${String(v ?? 0)} sa`, (x) => { mesYaz(x, (M) => { M.ucret = { ...M.ucret, [id]: { brut: M.ucret[id]?.brut ?? null, yil: v } }; }); }, MS);
}
export function kisiBazliYaz(yaz: Yaz, v: boolean): boolean {
  return yaz('Mesai bedeli', v ? 'kişi ücretinden' : 'tek mesai ücreti', (x) => { mesYaz(x, (M) => { M.kisiBazli = v; }); }, MS);
}
export type MesaiKurali = 'aylikSaat' | 'sgk' | 'yanHak' | 'kisiEk' | 'gunlukSinir' | 'geceSinir' | 'yillikSinir';
export function mesaiKuralYaz(yaz: Yaz, D: PlanVerisi, k: MesaiKurali, v: number): boolean {
  return yaz('Mesai kuralı', `${k}: ${yok(mesaiSistemi(D)[k])} → ${String(v)}`, (x) => { mesYaz(x, (M: MesaiSistemi) => { M[k] = v; }); });
}
export function carpanYaz(yaz: Yaz, D: PlanVerisi, k: GunTuru, v: number): boolean {
  return yaz('Mesai çarpanı', `${GUN_TURU_ADI[k]}: ×${String(mesaiSistemi(D).carp[k])} → ×${String(v)}`, (x) => { mesYaz(x, (M) => { M.carp = { ...M.carp, [k]: v }; }); });
}
const anahtar = (e: { m: unknown; gun: unknown; vardiya: unknown }): string => `${String(e.m)}|${String(e.gun)}|${String(e.vardiya)}`;
// Ek mesai kaldırılınca o vardiyanın kararı da silinir (ym-mesai-kaldir). i, ekMesailer'in sırasıdır: günü sayı olmayan kayıt atlanır.
export function ekMesaiKaldirYaz(yaz: Yaz, i: number, ad: string): boolean {
  return yaz('Ek mesai kaldırıldı', ad, (x) => {
    const hedef = x.ekMesai.map((z, j) => ({ z, j })).filter(({ z }) => sayiOku(z.gun) !== null)[i]?.j;
    const e = hedef === undefined ? undefined : x.ekMesai[hedef];
    if (!e) return false;
    x.ekMesai = x.ekMesai.filter((_, j) => j !== hedef);
    const k = Array.isArray(x.D.mesaiKarar) ? (x.D.mesaiKarar as unknown[]) : [];
    dYaz(x, { mesaiKarar: k.filter((z) => !(nesneMi(z) && anahtar({ m: z.m, gun: z.gun, vardiya: z.vardiya }) === anahtar({ m: e.m, gun: e.gun, vardiya: e.vardiya }))) });
    return true;
  });
}
export interface MesaiKarari { m: string; gun: number; vardiya: string; karar: string; kim: string; net: number | null }
export function mesaiKararlari(D: PlanVerisi): MesaiKarari[] {
  const k = Array.isArray(D.mesaiKarar) ? (D.mesaiKarar as unknown[]) : [];
  return k.filter(nesneMi).map((z) => ({ m: String(z.m ?? ''), gun: Number(z.gun), vardiya: String(z.vardiya ?? ''), karar: String(z.karar ?? ''), kim: String(z.kim ?? ''), net: typeof z.net === 'number' ? z.net : null }));
}
export const mesaiKarariBul = (D: PlanVerisi, e: { m: string; gun: number; vardiya: string }): MesaiKarari | undefined =>
  mesaiKararlari(D).find((k) => k.karar === 'kabul' && anahtar(k) === anahtar(e));

// ---------- Fason ----------
export function fasonKararKaldirYaz(yaz: Yaz, id: string): boolean {
  return yaz('Fason kararı kaldırıldı', id, (x) => {
    const k: Nesne = { ...(nesneMi(x.D.fasonKarar) ? x.D.fasonKarar : {}) };
    if (k[id] === undefined) return false;
    delete k[id];
    dYaz(x, { fasonKarar: k });
    return true;
  });
}
// Boş gün termini siler (tm-fason).
export function fasonTerminYaz(yaz: Yaz, id: string, gun: string, ref: string | null): boolean {
  return yaz(gun ? 'Fason dönüş termini girildi' : 'Fason dönüş termini silindi', `${id}: ${gun || '—'}`, (x) => {
    const k: Nesne = { ...(nesneMi(x.D.fasonTermin) ? x.D.fasonTermin : {}) };
    if (gun) k[id] = `${gun} 16:00`; else delete k[id];
    const r: Nesne = nesneMi(x.D.fasonRef) ? x.D.fasonRef : {};
    dYaz(x, { fasonTermin: k, ...(gun && ref !== null && r[id] === undefined ? { fasonRef: { ...r, [id]: ref } } : {}) });
  });
}
