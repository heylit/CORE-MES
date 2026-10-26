// Numune planı şeridi (566, 559 1): Üretim Terminali'nde Hazırlık'ın numune planı kural kural, işin ilerlemesiyle görünür. Plan paketten,
// ilerleme terminalin kendi hesabından (ölçümler, kontrol takvimi, kalitedeki numune) gelir; ilk parçanın kararı Kalite Merkezi'nindir
// (521 1 a). Şerit yalnız gösterir; eylem "Şimdi" kartındadır.

export type SeritDurumu = 'kalitede' | 'zamani' | 'red' | 'tamam' | 'siradaki' | 'bekliyor';

export interface SeritKurali {
  id: string; etiket: string; olcen: string; ilk: boolean; olculer: readonly number[];
}

export interface SeritGirdisi {
  kurallar: readonly SeritKurali[];
  meas: Readonly<Record<number, { ok?: boolean; dev?: boolean } | undefined>>;
  bekleyen: readonly number[];
  zamani: readonly number[];
  siradaki: { olcu: number; v: number; u: string } | null;
  ilkKarar: 'onay' | 'ret' | null;
}

export interface SeritParcasi {
  id: string; etiket: string; olcen: string; durum: SeritDurumu; metin: string; gecen: number; toplam: number;
}

const gecti = (m: { ok?: boolean; dev?: boolean } | undefined): boolean => !!(m && (m.ok || m.dev));

export function numuneSeridi(g: SeritGirdisi): SeritParcasi[] {
  return g.kurallar.filter((r) => r.olculer.length > 0).map((r) => {
    const gecen = r.olculer.filter((id) => gecti(g.meas[id])).length;
    const parca = (durum: SeritDurumu, metin: string): SeritParcasi => ({ id: r.id, etiket: r.etiket, olcen: r.olcen, durum, metin, gecen, toplam: r.olculer.length });
    if (r.olculer.some((id) => g.bekleyen.includes(id))) return parca('kalitede', 'Numune kalitede');
    if (r.ilk && g.ilkKarar === 'ret') return parca('red', 'Kalite Merkezi reddetti · yeni numune');
    const zamani = r.olculer.filter((id) => g.zamani.includes(id)).length;
    if (zamani > 0) return parca('zamani', `Zamanı geldi · ${zamani} ölçü`);
    if (r.ilk && g.ilkKarar === 'onay') return parca('tamam', 'Kalite Merkezi onayladı');
    if (g.siradaki && r.olculer.includes(g.siradaki.olcu)) return parca('siradaki', `${g.siradaki.v} ${g.siradaki.u} sonra`);
    if (gecen === r.olculer.length) return parca('tamam', 'Ölçüldü');
    return parca('bekliyor', 'Sırası gelmedi');
  });
}
