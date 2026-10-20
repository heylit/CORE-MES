// Kontrol planı ve numune planı üzerinde saf işlemler. Numune kuralının `items` alanı 'all', 'crit' ya da ölçü kimliği listesidir.
type Kimlik = string | number;
export type NumuneKurali = { id: string; when: string; n?: number; who?: string[]; items?: 'all' | 'crit' | Kimlik[]; gate?: boolean };
type Olcu = { id: Kimlik };

// Silinen ölçü numune kurallarından da düşer; listesi boşalan kural kalırsa "0 ölçü" numune isteği açardı, o yüzden o da silinir.
export function olculeriSil<T extends Olcu>(plan: readonly T[], kurallar: readonly NumuneKurali[], kimlikler: readonly Kimlik[]): { plan: T[]; samp: NumuneKurali[] } {
  const sil = new Set(kimlikler);
  const samp = kurallar.flatMap((r) => {
    if (!Array.isArray(r.items)) return [r];
    const items = r.items.filter((i) => !sil.has(i));
    return items.length ? [{ ...r, items }] : [];
  });
  return { plan: plan.filter((b) => !sil.has(b.id)), samp };
}

// Ölçüyü "her n parçada bir" ölçülür yapar: ölçü öteki "her N parça" kurallarından çıkar (iki sıklık çakışmasın), aynı n'li ve aynı
// ölçeni olan kural varsa ona eklenir, yoksa kalitenin ölçtüğü yeni kural açılır. İlk parça, süre ve vardiya kuralları değişmez.
export function herNParcaYap(kurallar: readonly NumuneKurali[], olcu: Kimlik, n: number, yeniKimlik: () => string): NumuneKurali[] {
  const adet = Math.max(1, Math.floor(n));
  const ayni = (r: NumuneKurali) => r.when === 'every' && r.n === adet && Array.isArray(r.items) && (r.who ?? ['q']).join() === 'q';
  const temiz = kurallar.flatMap((r) => {
    if (r.when !== 'every' || !Array.isArray(r.items) || ayni(r)) return [r];
    const items = r.items.filter((i) => i !== olcu);
    return items.length ? [{ ...r, items }] : [];
  });
  const hedef = temiz.find(ayni);
  if (hedef) return temiz.map((r) => (r === hedef && Array.isArray(r.items) && !r.items.includes(olcu) ? { ...r, items: [...r.items, olcu] } : r));
  return [...temiz, { id: yeniKimlik(), when: 'every', n: adet, who: ['q'], items: [olcu] }];
}

// Operatörün zamanı gelmeden istediği numune: zamanı gelen ölçü yoksa planın bütün ölçüleri, kritikler önde.
export function elleNumuneOlculeri<T extends Olcu & { crit?: boolean }>(plan: readonly T[]): T[] {
  return [...plan.filter((b) => b.crit), ...plan.filter((b) => !b.crit)];
}
