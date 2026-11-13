import { useQuery } from '@tanstack/react-query';
import type { EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import './kart-emir-ozeti.css';

// 3155: refakat kartı okutulunca emrin özeti (adım, rota, gidişat). Emri okuyamayan kişide (403) ya da ağ yokken hiç çizilmez;
// okutma sonucu beklemez. Gidişat sunucunun rota yüzdesidir (1944/1945 esası); ekran kendi ortalamasını hesaplamaz.
// 3162: okutma ekranındaki malzeme akışı sıradaki adımı yazmak için aynı okumayı kullanır (aynı önbellek, ikinci istek yok).
export function useEmirAdimlari(uretimEmriId: number): NonNullable<EmirAyrintiCevabi['ilerleme']>['adimlar'] {
  const q = useQuery({ queryKey: anahtarlar.ayrinti(uretimEmriId), queryFn: () => api.get<EmirAyrintiCevabi>(`/uretim-emirleri/${uretimEmriId}`), retry: false });
  return q.data?.ilerleme?.adimlar ?? [];
}

// adetli (3162): adımın altında yüzde yerine yapılan / hedef adet.
export function KartEmirOzeti({ uretimEmriId, etiket, adetli = false }: { uretimEmriId: number; etiket: string; adetli?: boolean }) {
  const q = useQuery({
    queryKey: anahtarlar.ayrinti(uretimEmriId),
    queryFn: () => api.get<EmirAyrintiCevabi>(`/uretim-emirleri/${uretimEmriId}`),
    retry: false,
  });
  if (!q.data) return null;
  const { emir, ilerleme } = q.data;
  const adimlar = ilerleme?.adimlar ?? [];
  const biten = adimlar.filter((a) => a.durum === 'tamam').length;
  const simdi = adimlar.find((a) => a.durum !== 'tamam') ?? null;
  return (
    <section className="tc-ue-kart-ozet" aria-label="Emir özeti">
      <div className="tc-ue-kart-ozet-bas">
        <strong className="tc-ue-kod">{etiket}</strong>
        {ilerleme && adimlar.length > 0 && <span className="tc-ue-kart-ozet-gidis">{biten}/{adimlar.length} adım bitti · %{ilerleme.rota}</span>}
      </div>
      <p className="tc-ue-kart-ozet-satir">
        {emir.adet} adet{simdi ? ` · Şu an: OP${simdi.opNo} ${simdi.ad}` : ' · Bütün adımlar bitti'}
      </p>
      {adimlar.length > 0 && (
        <ol className="tc-ue-kart-rota" aria-label="Rota">
          {adimlar.map((a) => (
            <li key={a.opNo} data-durum={a === simdi ? 'simdi' : a.durum === 'tamam' ? 'bitti' : 'sonra'}>
              <span className="tc-ue-kart-rota-op">OP{a.opNo}</span>
              <span className="tc-ue-kart-rota-ad">{a.ad}</span>
              <progress max={100} value={a.yuzde} aria-label={`OP${String(a.opNo)} yüzde ${String(a.yuzde)}`} />
              <span className="tc-ue-kart-rota-y">{adetli ? `${a.yapilan} / ${a.hedef}` : a.durum === 'tamam' ? 'Bitti' : a.yuzde > 0 ? `%${a.yuzde}` : 'Bekliyor'}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
