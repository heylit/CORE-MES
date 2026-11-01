import type { PlanSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';

// Plan sağlığı ekranının saf yardımcıları (1478).

const sayi = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
export const yuzdeMetni = (n: number | null) => (n === null ? 'Veri yok' : `%${sayi(n)}`);
export const saatMetni = (n: number | null) => {
  if (n === null) return 'Veri yok';
  const mutlak = Math.abs(n);
  const metin = mutlak >= 48 ? `${sayi(mutlak / 24)} gün` : `${sayi(mutlak)} saat`;
  return n === 0 ? '0 saat' : `${n > 0 ? '+' : '-'}${metin}`;
};
export const tarihMetni = (iso: string | null) =>
  (iso === null ? '-' : new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));

// Eğilim dizisi grafiğin noktalarına: ölçülemeyen hafta atlanır, etiket haftanın başıdır.
export function egilimNoktalari(c: PlanSagligiCevabi, egilim: readonly (number | null)[]): { etiket: string; deger: number }[] {
  return egilim.flatMap((d, i) => (d === null ? [] : [{ etiket: `${c.haftalar[i]!.baslangic.slice(8, 10)}.${c.haftalar[i]!.baslangic.slice(5, 7)} haftası`, deger: d }]));
}

// Müdür yalnız kartları görür (rapor 2.3); yönetici ya da planlama rolü de taşıyan müdür tabloları da görür.
export const tablolarGorunur = (roller: readonly string[] | undefined) => !(roller !== undefined && roller.length > 0 && roller.every((r) => r === 'mudur'));

// Ölçüm kaydı (1470) hiç yoksa kayma ve tutarlılık kartları bunu söyler; boşluk "sıfır değişim" sanılmasın.
export const olcumYok = (c: PlanSagligiCevabi) => c.veri.sonOlcum === null && c.soz.izlenenEmir === 0;
