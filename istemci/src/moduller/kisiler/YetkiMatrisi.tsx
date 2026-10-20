import { useQuery } from '@tanstack/react-query';
import type { RolIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { DurumKutusu, Simge } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

interface Grup { ad: string; islemler: string[] }

// Satırlar işlemin modül önekine göre gruplanır; sayfa işlemleri (`sayfa.*`) yalnız menü görünürlüğüdür, ayrı grup olur.
function grupla(islemler: readonly string[]): Grup[] {
  const gruplar = new Map<string, string[]>();
  for (const islem of islemler) {
    const onek = islem.split('.')[0] ?? islem;
    gruplar.set(onek, [...(gruplar.get(onek) ?? []), islem]);
  }
  return [...gruplar].map(([ad, liste]) => ({ ad: ad === 'sayfa' ? 'Sayfalar' : ad, islemler: liste }));
}

// Tablo kartlara dönmez: rol sütunları yan yana kalır, kap yatay kayar, işlem sütunu sabit durur.
export function YetkiMatrisi() {
  const matris = useQuery({ queryKey: anahtarlar.rolIslemleri, queryFn: () => api.get<RolIslemleriCevabi>('/rol-islemleri') });

  if (matris.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (matris.isError) {
    return <DurumKutusu durum="hata" mesaj={hataIletisi(matris.error, 'Yetki matrisi alınamadı')} yenile={() => { void matris.refetch(); }} />;
  }
  const { roller } = matris.data;
  if (roller.length === 0) return <DurumKutusu durum="bos" mesaj="Rol yok" />;
  const kumeler = new Map(roller.map((r) => [r.id, new Set(r.islemler)]));

  return (
    <div className="tc-personel-matris-kap">
      <table className="tc-personel-matris" aria-label="Yetki matrisi">
        <thead>
          <tr>
            <th scope="col">İşlem</th>
            {roller.map((r) => <th key={r.id} scope="col">{r.ad}</th>)}
          </tr>
        </thead>
        {grupla(matris.data.islemler).map((g) => (
          <tbody key={g.ad}>
            <tr className="tc-personel-matris-grup">
              <th scope="rowgroup" colSpan={roller.length + 1}><span>{g.ad}</span></th>
            </tr>
            {g.islemler.map((islem) => (
              <tr key={islem}>
                <th scope="row" className="mono">{islem}</th>
                {roller.map((r) => (
                  <td key={r.id}>
                    {kumeler.get(r.id)?.has(islem)
                      ? <span className="tc-personel-var"><Simge ad="check" boyut="k" /><span className="tc-personel-gizli">Var</span></span>
                      : <span className="tc-personel-gizli">Yok</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
