import { useQuery } from '@tanstack/react-query';
import type { KmGirisBekleyenCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { Dugme, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';

export const GIRIS_ANAHTARI = ['kalite-merkezi', 'giris', 'bekleyenler'] as const;
const YOKLAMA_MS = 15_000;
const sayi = (m: string | null): string => (m === null ? '' : Number(m).toLocaleString('tr-TR', { maximumFractionDigits: 3 }));

// 1246 (1251 a, 1252, 1253 a): kartı GKK isteyen satın alma lotu karantinada bekler. Bugün bekleyenleri sayar ve listeler; GKK ve
// hatalının kararı GKK formunda verilir (3117: tek form, iki yol farklı sonuç vermesin). Liste yalnız onaylayabilen kişide istenir.
export function GirisKarari({ ac, tumu }: { ac: (malKabulSatirId: number) => void; tumu: () => void }) {
  const liste = useQuery({
    queryKey: GIRIS_ANAHTARI,
    queryFn: () => api.get<KmGirisBekleyenCevabi>('/kalite-merkezi/giris/bekleyenler'),
    refetchInterval: YOKLAMA_MS,
  });
  const kayitlar = liste.data?.kayitlar ?? [];
  if (kayitlar.length === 0) return null;

  return (
    <section className="tc-km1-grup" aria-label="Giriş kontrolü">
      <h3 className="tc-km1-grup-baslik">
        <Simge ad="box" /> Giriş kontrolü <span className="tc-km1-soluk">{kayitlar.length}</span>
        <span className="tc-km1-grup-tumu"><Dugme tur="ikincil" simge="list" onClick={tumu}>Tümü</Dugme></span>
      </h3>
      <ul className="tc-km1-liste">
        {kayitlar.map((x) => (
          <li key={x.malKabulSatirId} className="tc-km1-gorev" data-oncelik={x.durum === 'karar_bekliyor' ? '1' : '2'}>
            <div className="tc-km1-gorev-metin">
              <b>{x.malKabulNo} | {x.malzemeKod ?? `#${String(x.malzemeId)}`} {x.malzemeAd ?? ''}</b>
              <small>
                Lot {x.partiEtiketi ?? '-'} | {sayi(x.miktar)} {x.birim ?? ''}{x.tedarikciAdi ? ` | ${x.tedarikciAdi}` : ''}{x.siparisNo ? ` | ${x.siparisNo}` : ''}
                {x.durum === 'karar_bekliyor' ? ` | ${sayi(x.hataliMiktar)} hatalı` : ''}
              </small>
            </div>
            <span className="tc-km1-gorev-eylem">
              {!x.sertifikaVar && <Rozet ton="uyari">Sertifika yok</Rozet>}
              <Dugme tur="birincil" onClick={() => { ac(x.malKabulSatirId); }}>{x.durum === 'gkk_bekliyor' ? 'GKK' : 'Karar ver'}</Dugme>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
