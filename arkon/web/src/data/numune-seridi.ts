// Numune planı şeridi (566, 559 1): Üretim Terminali'nde Hazırlık'ın numune planı kural kural, işin ilerlemesiyle görünür. Plan paketten,
// ilerleme terminalin kendi hesabından (ölçümler, kontrol takvimi, kalitedeki numune) gelir; ilk parçanın kararı Kalite Merkezi'nindir
// (521 1 a). Şerit yalnız gösterir; eylem "Şimdi" kartındadır.

export type SeritDurumu = 'kalitede' | 'zamani' | 'red' | 'tamam' | 'siradaki' | 'bekliyor';

// Sayıyla ya da süreyle tekrarlanan kuralın şimdiki aralığı (664): `gecen` aralığın başından bu yana sayılan parça ya da geçen dakika;
// `hedef` sıradaki numunenin parça sırası (süreli kuralda yok).
export interface SeritAraligi { n: number; birim: 'parça' | 'dk'; gecen: number; hedef: number | null }

export interface SeritKurali {
  id: string; etiket: string; olcen: string; ilk: boolean; olculer: readonly number[]; aralik?: SeritAraligi | null;
}

export interface SeritGirdisi {
  kurallar: readonly SeritKurali[];
  meas: Readonly<Record<number, { ok?: boolean; dev?: boolean } | undefined>>;
  bekleyen: readonly number[];
  zamani: readonly number[];
  siradaki: { olcu: number; v: number; u: string } | null;
  ilkKarar: 'onay' | 'ret' | null;
}

// Numuneye yaklaşma (664): `oran` aralığın dolan payı (zamanı geldiyse ve numune kalitedeyse 1), `kalan` sıradaki numuneye kalan.
export interface SeritIlerlemesi { oran: number; kalan: number; birim: 'parça' | 'dk'; hedef: number | null }

export interface SeritParcasi {
  id: string; etiket: string; olcen: string; durum: SeritDurumu; metin: string; gecen: number; toplam: number; ilerleme: SeritIlerlemesi | null;
}

const gecti = (m: { ok?: boolean; dev?: boolean } | undefined): boolean => !!(m && (m.ok || m.dev));

export function numuneSeridi(g: SeritGirdisi): SeritParcasi[] {
  return g.kurallar.filter((r) => r.olculer.length > 0).map((r) => {
    const gecen = r.olculer.filter((id) => gecti(g.meas[id])).length;
    const a = r.aralik ?? null;
    const ilerleme = (durum: SeritDurumu): SeritIlerlemesi | null => {
      if (a === null || !(a.n > 0)) return null;
      const dolu = durum === 'zamani' || durum === 'kalitede';
      const say = Math.min(a.n, Math.max(0, a.gecen));
      return { oran: dolu ? 1 : say / a.n, kalan: dolu ? 0 : a.n - say, birim: a.birim, hedef: a.hedef };
    };
    const parca = (durum: SeritDurumu, metin: string): SeritParcasi => ({ id: r.id, etiket: r.etiket, olcen: r.olcen, durum, metin, gecen, toplam: r.olculer.length, ilerleme: ilerleme(durum) });
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
