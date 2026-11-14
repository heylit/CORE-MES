import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { GozOzetleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Pencere, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { sayiMetni } from './kurallar.ts';
import { rafGozleriOku, stokOkurMu } from './veri.ts';

export interface SilinecekRaf { id: number; kod: string; aktif: boolean; gozAdedi: number }
interface Satir { adres: string; malzeme: string; miktar: string }

// Rafın stoklu gözleri, göz adresi sırasıyla. Yalnız stok okuma yetkisiyle çağrılır.
async function rafMalzemeleriOku(rafId: number): Promise<Satir[]> {
  const gozler = await rafGozleriOku(rafId);
  const adres = new Map(gozler.map((g) => [g.id, g.adres]));
  const satirlar: Satir[] = [];
  for (let i = 0; i < gozler.length; i += 500) {
    const idler = gozler.slice(i, i + 500).map((g) => g.id).join(',');
    for (const g of (await api.get<GozOzetleriCevabi>(`/stok/goz-ozetleri?gozIdler=${idler}`)).gozler) {
      for (const m of g.malzemeler) {
        satirlar.push({
          adres: adres.get(g.gozId) ?? '',
          malzeme: m.ad ?? `Malzeme ${m.malzemeId}`,
          miktar: `${sayiMetni(Number(m.miktar))}${m.birim ? ` ${m.birim.toLocaleLowerCase('tr')}` : ''}`,
        });
      }
    }
  }
  return satirlar.sort((a, b) => a.adres.localeCompare(b.adres, 'tr', { numeric: true }));
}

interface Ozellikler {
  raf: SilinecekRaf | null;
  vazgec: () => void;
  sil: () => void;
  pasifeAl: () => void;
}

// 3230 a: kayıtlı raf silinmeden önce sorulur. Malzemeli raf silinmez: pencere hangi gözde ne olduğunu gösterir. Asıl denetim
// sunucudadır (kayıt anında, açık işler dahil); stok göremeyen kişiye burada liste gösterilmez, kayıt reddederse ihlal olarak görür.
export function RafSilmePenceresi({ raf, vazgec, sil, pasifeAl }: Ozellikler) {
  const oturum = useOturum();
  const okur = oturum.data?.islemler.some(stokOkurMu) === true;
  const stok = useQuery({
    queryKey: [...anahtarlar.rafOzeti(raf?.id ?? 0), 'silme'],
    queryFn: () => rafMalzemeleriOku(raf!.id),
    enabled: raf !== null && okur,
    staleTime: 0,
  });
  if (raf === null) return null;
  const satirlar = stok.data ?? [];
  // Oturum okunmadan stok yetkisi bilinmez: o ana kadar silme düğmesi çıkmaz.
  if (oturum.isPending || (okur && stok.isPending)) {
    return (
      <Pencere acik kapat={vazgec} baslik={`Raf ${raf.kod}`} alt={<Dugme onClick={vazgec} data-ilk-odak>Vazgeç</Dugme>}>
        <p className="tc-atolye-ipucu">Raftaki stok denetleniyor…</p>
      </Pencere>
    );
  }
  if (satirlar.length > 0) {
    return (
      <Pencere
        acik
        kapat={vazgec}
        baslik={`Raf ${raf.kod} silinemez`}
        alt={(
          <div className="tc-atolye-raf-sil-dugmeler">
            <Dugme onClick={vazgec} data-ilk-odak>Kapat</Dugme>
            {raf.aktif && <Dugme simge="minus" onClick={pasifeAl}>Pasife al</Dugme>}
            <Link className="tc-dugme tc-dugme-birincil tc-dugme-normal" to={`/atolye?ara=${encodeURIComponent(raf.kod)}`} target="_blank" rel="noreferrer">
              <Simge ad="pin" />Depoda göster
            </Link>
          </div>
        )}
      >
        <div className="tc-atolye-raf-sil">
          <p className="tc-atolye-raf-sil-uyari" data-ton="hata" role="alert">
            <Simge ad="alert" />
            <span>Bu rafta malzeme var. Önce malzemeleri başka rafa taşıyın, sonra silin.</span>
          </p>
          <table className="tc-atolye-raf-sil-tablo">
            <thead><tr><th scope="col">Göz</th><th scope="col">Malzeme</th><th scope="col">Miktar</th></tr></thead>
            <tbody>
              {satirlar.map((s, i) => (
                <tr key={i}><td className="mono">{s.adres}</td><td>{s.malzeme}</td><td className="mono">{s.miktar}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="tc-atolye-ipucu">Rafı şimdilik kullanım dışı bırakmak için "Pasife al" yeterlidir.</p>
        </div>
      </Pencere>
    );
  }
  return (
    <Pencere
      acik
      kapat={vazgec}
      baslik={`Raf ${raf.kod} silinsin mi?`}
      alt={(
        <>
          <Dugme onClick={vazgec} data-ilk-odak>Vazgeç</Dugme>
          <Dugme tur="tehlike" simge="trash" onClick={sil}>Rafı sil</Dugme>
        </>
      )}
    >
      <div className="tc-atolye-raf-sil">
        <p>
          {okur && !stok.isError ? 'Rafta malzeme yok. ' : 'Rafta malzeme ya da açık iş varsa silme kayıt sırasında reddedilir. '}
          Raf ve {raf.gozAdedi} gözü haritadan tamamen kalkar; gözlere elle girilmiş kalemler de silinir, geri gelmez.
        </p>
        <p className="tc-atolye-raf-sil-uyari" data-ton="uyari">
          <Simge ad="alert" />
          <span>Bu rafın basılı etiketleri geçersiz kalır. Silme, "Kaydet"e basınca kesinleşir; o ana kadar geri alabilirsiniz.</span>
        </p>
      </div>
    </Pencere>
  );
}
