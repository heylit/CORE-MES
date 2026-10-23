import { useQuery } from '@tanstack/react-query';
import type { KmGecmisCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { DurumKutusu } from '../../../ortak/arayuz/DurumKutusu.tsx';
import { Pencere } from '../../../ortak/arayuz/Pencere.tsx';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { zamanKisa } from './bicim.ts';
import { KOL_AD } from './sabitler.ts';
import type { IzKaydi, KmKoleksiyonu } from './tipler.ts';
import { useKmVerisi } from './veri.ts';

export function IzTablosu({ satirlar, kisa = false }: { satirlar: readonly IzKaydi[]; kisa?: boolean }) {
  return (
    <div className="tc-km-tablo-kap">
      <table className="tc-km-tablo">
        <thead><tr><th>Zaman</th><th>Kim</th><th>İşlem</th>{!kisa && <th>Kayıt</th>}<th>Değişenler</th></tr></thead>
        <tbody>
          {satirlar.map((x) => (
            <tr key={x._id}>
              <td>{zamanKisa(x.t)}</td>
              <td>{x.kim}<span className="tc-km-iki">{x.rol ?? ''}</span></td>
              <td>{x.islem}</td>
              {!kisa && <td>{KOL_AD[x.col as KmKoleksiyonu] ?? x.col}<span className="tc-km-iki">{x.no ?? ''}</span></td>}
              <td className="tc-km-kucuk">
                {(x.degisen ?? []).map((d) => <div key={d.alan}><b>{d.alan}</b>: {d.eski} → {d.yeni}</div>)}
                {x.gerekce && <div><b>Gerekçe:</b> {x.gerekce}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Kaydın değişiklik geçmişi: istemcinin yazdığı iz ve sunucudaki önceki sürümler (326 a, salt okunur).
export function GecmisPenceresi({ kol, kimlik, kapat }: { kol: KmKoleksiyonu; kimlik: string; kapat: () => void }) {
  const { veri } = useKmVerisi();
  const surumler = useQuery({
    queryKey: ['kalite-merkezi', 'gecmis', kol, kimlik],
    queryFn: () => api.get<KmGecmisCevabi>(`/kalite-merkezi/kayitlar/${encodeURIComponent(kol)}/${encodeURIComponent(kimlik)}/gecmis`),
  });
  const iz = (veri?.iz ?? []).filter((x) => x.col === kol && x.id === kimlik).sort((a, b) => (b.t ?? '').localeCompare(a.t ?? ''));
  return (
    <Pencere acik kapat={kapat} baslik="Değişiklik geçmişi" tur="yan">
      {iz.length ? <IzTablosu satirlar={iz} kisa /> : <p className="tc-km-soluk">Bu kayıt için iz bulunmuyor (izleme bu sürümle başladı).</p>}
      <h3 className="tc-km-soru">Önceki sürümler</h3>
      {surumler.isPending && <DurumKutusu durum="yukleniyor" />}
      {surumler.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(surumler.error, 'Önceki sürümler alınamadı.')} />}
      {surumler.data && (surumler.data.surumler.length
        ? (
          <ul className="tc-km-surumler">
            {surumler.data.surumler.map((s) => (
              <li key={s.surum}>
                <b>Sürüm {s.surum}</b> {zamanKisa(s.yazildi)} {s.yazan ?? '—'}; yerine yazan {s.degistiren ?? '—'} {zamanKisa(s.degisti)}
              </li>
            ))}
          </ul>
        )
        : <p className="tc-km-soluk">Önceki sürüm yok.</p>)}
    </Pencere>
  );
}
