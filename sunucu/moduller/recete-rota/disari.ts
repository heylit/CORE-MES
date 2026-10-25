import type { Db } from '#cekirdek/db.ts';
import type { Kayit, Statu } from '#paylasilan/sozlesme/recete-rota.ts';
import { statuListesi } from './servis.ts';

// Stok üretim sayımında adımın statüsünü ve çıktı kartını bunlarla çözer; stok bu modülü ithal edemez, bağı sunucu/kablolama.ts kurar.
export { adimCiktisi, adimStatusu } from './servis.ts';
import { kayitGetir } from './sorgular.ts';

// Bağlamada (Aşama 2) başka modül bu modülün kaydını yalnız buradan okur; yazma dışarı açılmaz. Prototipin durumu
// `recete-rota-motoru-v1` anahtarındadır (alanları ORTAKLIK-recete-rota.md'de).
export const DURUM_ANAHTARI = 'recete-rota-motoru-v1';
// Planlama sayfasının ortak çalışma kaydı (S): plan, senaryolar, kilitler, ağırlıklar.
export const PLANLAMA_ANAHTARI = `${DURUM_ANAHTARI}:planlama`;

export async function receteRotaDurumu(db: Db): Promise<Kayit | null> {
  return kayitGetir(db, DURUM_ANAHTARI);
}

// 525 2 b: haftalık ek mesai bütçesinin tek kaynağı planlama çalışmasıdır (Kısıtlar sayfası, param.mesaiHafta). Girilmemişse motorun
// varsayılanı (motor/engine.betik W0.mesaiHafta, 8 saat); 0 sınırsızdır (525 3 a). Hafta, motordaki gibi çalışmanın başlangıç gününden
// 7 günlük dilimdir. Çalışma yoksa ya da başlangıcı okunamazsa null: plan kendi varsayılanını kullanır.
const MOTOR_MESAI_HAFTA = 8;
export async function ekMesaiButcesi(db: Db): Promise<{ saat: number; haftaBasi: string } | null> {
  const k = await kayitGetir(db, PLANLAMA_ANAHTARI);
  if (k === null) return null;
  let c: unknown = k.deger;
  if (k.bicim === 'metin' && typeof c === 'string') { try { c = JSON.parse(c) as unknown; } catch { return null; } }
  const x = c as { param?: { mesaiHafta?: unknown }; D?: { meta?: { baslangic?: unknown } } } | null;
  const haftaBasi = x?.D?.meta?.baslangic;
  if (typeof haftaBasi !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(haftaBasi)) return null;
  const b = x?.param?.mesaiHafta;
  // Motorla aynı okuma (girdi.betik stKur): yoksa varsayılan, sayı değilse 0.
  const saat = b === undefined || b === null ? MOTOR_MESAI_HAFTA : Number(b);
  return { saat: Number.isFinite(saat) && saat > 0 ? saat : 0, haftaBasi };
}

// Rotanın statülü adımlarından açılan statü tanımları (ad, renk, tür, malzeme no); statülü stok bunlara bağlanır (kart #1108).
export async function receteRotaStatuleri(db: Db): Promise<Statu[]> {
  return statuListesi(db);
}

// Ortak plan motoru (ADR 0018): plan modülünün çözücüsü ve kıyas testi buradan çalıştırır; motorun girdisi bu modülün iç biçimidir.
export { motorYukle, planCoz, SUNUCU_KIPLERI } from './plan-motoru.ts';
export type { Motor, MotorDurumu, MotorPlani, MotorYerlesimi, PlanIstegi, SunucuKipi } from './plan-motoru.ts';
// plan/disari.ts planMotoruCozucusu kaydının karşılığı; bağ sunucu/kablolama.ts'te kurulur.
export { sunucuPlanCozucusu } from './plan-cozucusu.ts';

// Satış teklifi denemesi (Y4): siparişlerin teklif çözücüsü kaydının karşılığı; bağ sunucu/kablolama.ts'te kurulur.
export { teklifDene } from './servis.ts';
export type { SatisTaslagiGirdisi, TeklifDenemeGirdisi, TeklifDenemeSonucu, TeklifIslemi, TeklifKalemiGirdisi, TeklifKalemiSonucu } from './servis.ts';
