import type { Db } from '#cekirdek/db.ts';
import type { Kayit, Statu } from '#paylasilan/sozlesme/recete-rota.ts';
import { statuListesi } from './servis.ts';

// Stok üretim sayımında adımın statüsünü ve çıktı kartını bunlarla çözer; stok bu modülü ithal edemez, bağı sunucu/kablolama.ts kurar.
export { adimCiktisi, adimStatusu } from './servis.ts';
import { kayitGetir } from './sorgular.ts';

// Bağlamada (Aşama 2) başka modül bu modülün kaydını yalnız buradan okur; yazma dışarı açılmaz. Prototipin durumu
// `recete-rota-motoru-v1` anahtarındadır (alanları ORTAKLIK-recete-rota.md'de).
export const DURUM_ANAHTARI = 'recete-rota-motoru-v1';

export async function receteRotaDurumu(db: Db): Promise<Kayit | null> {
  return kayitGetir(db, DURUM_ANAHTARI);
}

// Rotanın statülü adımlarından açılan statü tanımları (ad, renk, tür, malzeme no); statülü stok bunlara bağlanır (kart #1108).
export async function receteRotaStatuleri(db: Db): Promise<Statu[]> {
  return statuListesi(db);
}

// Ortak plan motoru (ADR 0018): plan modülünün çözücüsü ve kıyas testi buradan çalıştırır; motorun girdisi bu modülün iç biçimidir.
export { motorYukle, planCoz, SUNUCU_KIPLERI } from './plan-motoru.ts';
export type { Motor, MotorDurumu, MotorPlani, MotorYerlesimi, PlanIstegi, SunucuKipi } from './plan-motoru.ts';
