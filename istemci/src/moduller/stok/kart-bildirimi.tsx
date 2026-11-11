import { useInRouterContext, useNavigate } from 'react-router-dom';
import type { AcilanKart, RefakatPartileriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useIslem } from './ortak.tsx';

// 2931 a: emre giden teslimde kart sunucuda kendiliğinden açılır (pencere sorulmaz). Kâğıt şimdilik kendiliğinden basılmaz (kullanıcı,
// kart 2944'e yazılı yanıt): kullanıcıya kart söylenir ve bildirimdeki düğme Etiket Merkezi'ni o kart seçili açar; kopya sayısı oradadır.
// Etiket Merkezi'ni göremeyene düğme gösterilmez ve "Etiket Merkezi'nden basın" denmez. Kart okunamazsa sessiz kalınmaz.
export type KartTeslimi = { uretimEmriId: number | null; partiId: number | null; malzemeId: number };
type Kart = RefakatPartileriCevabi['partiler'][number];

const kartlariOku = (uretimEmriId: number): Promise<Kart[]> =>
  api.get<RefakatPartileriCevabi>(`/stok/uretim-emirleri/${uretimEmriId}/refakat-partileri`).then((c) => c.partiler);
const kullanilir = (k: Kart): boolean => k.durum === 'acik' && k.birlestigi === null;

// Etiket Merkezi'ni göremeyene kâğıdı kimin bastığı rol adıyla söylenir (sayfa izni yerleşik rollerden Depo ve Vardiya Sorumlusu'nda).
const YETKILI_BASAR = 'kâğıdı Depo ya da Vardiya Sorumlusu basar.';
// gidiyor: teslimi gönderen söyler; geliyor: teslimi isteyen (istasyondan alan) söyler.
export type KartYonu = 'gidiyor' | 'geliyor';

function useKartIletisi(): { soyle: (kartlar: readonly AcilanKart[], acildi: boolean, yon: KartYonu) => void; okunamadi: () => void } {
  const { bildir } = useBildirim();
  // Üst çubuk ve sepet satırı yönlendiricisiz de çizilir (kabuk dışı görünüm, testler); orada düğme yoktur. Bir bileşen ömrü boyunca
  // yönlendiricinin içine girip çıkmadığından kanca sırası değişmez.
  const git = useInRouterContext() ? useNavigate() : null;
  const merkez = useIslem('sayfa.etiket-merkezi');
  const basan = merkez ? "kâğıdı Etiket Merkezi'nden basın." : YETKILI_BASAR;
  return {
    // Çok parçalı teslimde kartlar tek iletide söylenir; düğme hepsini seçili açar.
    soyle: (kartlar, acildi, yon) => {
      if (kartlar.length === 0) return;
      const ad = kartlar.length === 1 ? `Refakat kartı ${kartlar[0]!.etiket}` : `Refakat kartları ${kartlar.map((k) => k.etiket).join(', ')}`;
      bildir('bilgi', `${ad} ${acildi ? 'açıldı ve ' : ''}bu teslimle ${yon}; ${basan}`,
        merkez && git !== null ? { eylem: { etiket: 'Etiketlere git', yap: () => { void git(`/etiket-merkezi?tur=refakat-partisi&id=${kartlar.map((k) => k.id).join(',')}`); } } } : undefined);
    },
    okunamadi: () => bildir('hata', `Refakat kartı okunamadı; ${merkez ? "kâğıdı Etiket Merkezi'nin bekleyenlerinden basın." : YETKILI_BASAR}`),
  };
}

// Depo teslimi: emrin o lottaki açık kartı (lotsuzda aynı malzemenin istisna kartı) teslimle gider.
export function useKartBildirimi(): (t: KartTeslimi) => Promise<void> {
  const ileti = useKartIletisi();
  return async (t) => {
    if (t.uretimEmriId === null) return;
    const kartlar = await kartlariOku(t.uretimEmriId).catch(() => null);
    if (kartlar === null) { ileti.okunamadi(); return; }
    const kart = kartlar.find((p) => kullanilir(p) && (t.partiId === null ? p.partiId === null && p.malzemeId === t.malzemeId : p.partiId === t.partiId));
    if (kart) ileti.soyle([kart], false, 'gidiyor');
  };
}

// İstasyondan alma ve emirli gönderim: lotu sunucu seçer ve kart çoğu kez zaten vardır (malzeme kartıyla gelmiştir). Yalnız bu istekle
// açılan kart söylenir; sunucu onu cevapta verir (yalnız kimlik ve etiket), bu yüzden stok okuması olmayan operatöre de söylenir.
export function useAcilanKartBildirimi(yon: KartYonu): (kartlar: readonly AcilanKart[] | undefined) => void {
  const ileti = useKartIletisi();
  return (kartlar) => { ileti.soyle(kartlar ?? [], true, yon); };
}
