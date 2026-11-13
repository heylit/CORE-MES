import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ETIKET_MERKEZI_SINIRI, etiketMerkeziAdresi } from '#paylasilan/etiket-sabitleri.ts';
import { Dugme } from './Dugme.tsx';
import { panoyaYaz } from './Kopyala.tsx';
import { Pencere } from './Pencere.tsx';
import { Simge } from './Simge.tsx';
import { useBildirim } from './Bildirim.tsx';
import './kod-degisim.css';

// Kodu değişen stok konumu: stok ve atölye aynı pencereyi açar (3135 a), metin iki yerde ayrışmasın.
export interface KoduDegisenYer { konumId: number; eskiKod: string; yeniKod: string; satirSayisi: number }

const LISTE_SINIRI = 60;
export const kodDegisimMetni = (degisenler: readonly KoduDegisenYer[]): string =>
  degisenler.map((d) => `${d.eskiKod} -> ${d.yeniKod}`).join('\n');

// 94 a: eski etiketin QR'ı eski kodu taşır ve artık okunmaz; kayıttan sonra kodu değişen konumların etiketi yeniden basılır.
// Etiket Merkezi bir kerede ETIKET_MERKEZI_SINIRI konum açar; fazlası parça parça yeni sekmede açılır ki pencere ve liste kaybolmasın.
// Etiket Merkezi'ni açamayan kişi listeyi kopyalar. `basDugmesi` tek parçalı basmayı değiştirir (stok: varsayılan yazıcıya doğrudan basım).
export function KodDegisimPenceresi({ degisenler, kapat, etiketMerkezi, basDugmesi, ekUyari }: {
  // 3168: yeniden numaralamada eski kod başka gözde yaşar (eski etiket okunur ve yanlış göze gider); ilk satır bu tehlike uyarısı olur.
  ekUyari?: string;
  degisenler: readonly KoduDegisenYer[]; kapat: () => void; etiketMerkezi: boolean; basDugmesi?: (idler: readonly number[]) => ReactNode;
}) {
  const { bildir } = useBildirim();
  const stoklu = degisenler.filter((d) => d.satirSayisi > 0).length;
  const parcalar = Array.from({ length: Math.ceil(degisenler.length / ETIKET_MERKEZI_SINIRI) },
    (_, i) => degisenler.slice(i * ETIKET_MERKEZI_SINIRI, (i + 1) * ETIKET_MERKEZI_SINIRI));
  const idler = (l: readonly KoduDegisenYer[]) => l.map((d) => d.konumId);
  const kopyala = () => {
    void panoyaYaz(kodDegisimMetni(degisenler)).then((oldu) => {
      bildir(oldu ? 'tamam' : 'hata', oldu ? 'Liste kopyalandı.' : 'Liste kopyalanamadı; listeyi seçip kopyalayın.');
    });
  };
  const alt = !etiketMerkezi ? <Dugme tur="birincil" simge="clipboard-check" onClick={kopyala}>Listeyi kopyala</Dugme>
    : parcalar.length <= 1 ? (basDugmesi?.(idler(degisenler))
      ?? <Link to={etiketMerkeziAdresi('konum', idler(degisenler))}><Dugme tur="birincil" simge="tag">Etiketleri bas</Dugme></Link>)
    : <span className="tc-kod-degisim-dugmeler">{parcalar.map((l, i) => (
        <a key={i} href={etiketMerkeziAdresi('konum', idler(l))} target="_blank" rel="noopener">
          <Dugme tur={i === 0 ? 'birincil' : 'ikincil'} simge="tag">{`Etiketleri bas (${i * ETIKET_MERKEZI_SINIRI + 1}-${i * ETIKET_MERKEZI_SINIRI + l.length})`}</Dugme>
        </a>
      ))}</span>;
  return (
    <Pencere acik kapat={kapat} baslik="Konum kodu değişti" tur="yan" alt={alt}>
      <div className="tc-kod-degisim">
        {ekUyari
          ? <p className="tc-kod-degisim-bilgi tc-kod-degisim-tehlike" role="alert"><Simge ad="alert" boyut="k" /><span>{degisenler.length} gözün kodu değişti. {ekUyari}</span></p>
          : <p className="tc-kod-degisim-bilgi tc-kod-degisim-uyari" role="status">{degisenler.length} konumun kodu değişti; eski etiketler artık okunmaz. Yeniden basın.</p>}
        {stoklu > 0 && <p className="tc-kod-degisim-bilgi"><Simge ad="box" boyut="k" /><span>Bunlardan {stoklu} konumda stok var; stok yerinde kalır, yalnız etiket değişir.</span></p>}
        {!etiketMerkezi && <p className="tc-kod-degisim-not">Etiketler Etiket Merkezi'nden basılır; o sayfayı açabilen birine bastırın. Listeyi kopyalayıp iletebilirsiniz.</p>}
        {etiketMerkezi && parcalar.length > 1 && <p className="tc-kod-degisim-not">Etiket Merkezi bir kerede {ETIKET_MERKEZI_SINIRI} konum açar; her parça yeni sekmede açılır, bu pencere açık kalır.</p>}
        <ul className="tc-kod-degisim-liste">{degisenler.slice(0, LISTE_SINIRI).map((d) => (
          <li key={d.konumId}><span className="tc-kod-degisim-satir">{d.eskiKod} → <strong>{d.yeniKod}</strong>{d.satirSayisi > 0 && <span title="Stoklu" aria-label="Stoklu"><Simge ad="box" boyut="k" /></span>}</span></li>
        ))}</ul>
        {degisenler.length > LISTE_SINIRI && <p className="tc-kod-degisim-not">ve {degisenler.length - LISTE_SINIRI} konum daha.</p>}
      </div>
    </Pencere>
  );
}
