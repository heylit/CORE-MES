import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { GozHucresi, RafMatrisiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Sekmeler } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { doluluk } from './ambalaj.ts';
import { anahtarlar } from './anahtarlar.ts';
import { NUMARA, RAF_TURU, miktarMetni } from './gorunum.ts';
import { hataMetni, useIslem } from './ortak.tsx';
import { EtiketPenceresi } from './Etiketler.tsx';
import { HaritaLinki } from './HaritaBagi.tsx';
import './stok.css';

const iki = (n: number): string => String(n).padStart(2, '0');
type Gorunum = 'urunler' | 'doluluk' | 'sayim';
const GORUNUMLER = [{ anahtar: 'urunler', baslik: 'Ürünler' }, { anahtar: 'doluluk', baslik: 'Doluluk' }, { anahtar: 'sayim', baslik: 'Sayım yaşı' }] as const;
const GUN_MS = 86_400_000;
const ACIKLAMA: Record<Gorunum, string> = {
  urunler: 'Gözde ilk giren malzeme ve miktarı; birden çok satır varsa +n. Göze dokununca konum ve sayım açılır.',
  doluluk: 'Gözdeki ambalajların göz genişliğinden kapladığı pay. Ambalajı girilmemiş dolu gözde hesap yapılmaz (?).',
  sayim: 'Yeşil: son 7 gün, sarı: 7-30 gün, kırmızı: 30 günden eski ya da hiç sayılmadı.',
};

function Hucre({ g, gorunum, bolmeGenislikM }: { g: GozHucresi; gorunum: Gorunum; bolmeGenislikM: string }) {
  const dolu = g.satirSayisi > 0;
  let ton = '', icerik = null;
  if (gorunum === 'urunler' && dolu) {
    icerik = <><span className="tc-stok-goz-ad">{g.ilkMalzemeAd ?? '—'}</span><span className="tc-stok-goz-alt">{miktarMetni(g.ilkMiktar)}{g.satirSayisi > 1 ? ` · +${g.satirSayisi - 1}` : ''}</span></>;
  } else if (gorunum === 'doluluk' && dolu) {
    const o = doluluk(g.ambalajlar, bolmeGenislikM);
    ton = o === null ? '' : o >= 0.95 ? 'tc-stok-goz-ton-hata' : o >= 0.6 ? 'tc-stok-goz-ton-uyari' : 'tc-stok-goz-ton-tamam';
    icerik = <><strong className="tc-stok-goz-buyuk">{o === null ? '?' : `%${Math.round(o * 100)}`}</strong><span className="tc-stok-goz-alt">{g.satirSayisi} satır</span></>;
  } else if (gorunum === 'sayim' && dolu) {
    const gun = g.sonSayim === null ? null : Math.floor((Date.now() - Date.parse(g.sonSayim)) / GUN_MS);
    ton = gun === null || gun >= 30 ? 'tc-stok-goz-ton-hata' : gun >= 7 ? 'tc-stok-goz-ton-uyari' : 'tc-stok-goz-ton-tamam';
    icerik = <><strong className="tc-stok-goz-buyuk">{gun === null ? 'Sayılmadı' : gun === 0 ? 'Bugün' : `${gun} gün`}</strong><span className="tc-stok-goz-alt">{g.satirSayisi} satır</span></>;
  }
  return (
    <Link to={`/stok/konumlar/${g.konumId}`} className={`tc-stok-goz ${dolu ? 'tc-stok-goz-dolu' : ''} ${ton}`} aria-label={`${g.kod}${dolu ? '' : ' boş'}`}>
      <span className="tc-stok-goz-kod">{iki(g.bolmeNo)}-{iki(g.katNo)}</span>{icerik}
    </Link>
  );
}

// Önizlemedeki raf matrisi: satırlar kat (üstten alta), sütunlar bölme; üç görünüm.
export function RafMatrisiGovdesi({ id }: { id: number }) {
  const tanimlar = useIslem('stok.tanim');
  const [gorunum, setGorunum] = useState<Gorunum>('urunler');
  const [etiket, setEtiket] = useState(false);
  const m = useQuery({ queryKey: anahtarlar.ayrinti('raf', id), queryFn: () => api.get<RafMatrisiCevabi>(`/stok/raflar/${id}`) });
  if (m.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (m.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(m.error)} yenile={() => void m.refetch()} />;
  const { raf, gozler } = m.data;
  const bolmeler = [...new Set(gozler.map((g) => g.bolmeNo))].sort((a, b) => a - b);
  const katlar = [...new Set(gozler.map((g) => g.katNo))].sort((a, b) => b - a);
  const goz = (b: number, k: number): GozHucresi | undefined => gozler.find((g) => g.bolmeNo === b && g.katNo === k);
  return (
    <div className="tc-stok-matris-kutu">
      <div className="tc-stok-bas">
        <div>
          <h3 className="tc-stok-alt-baslik">Raf {raf.kod} <span className="tc-stok-not">{RAF_TURU[raf.tur]}</span></h3>
          <p className="tc-stok-not">{raf.bolmeSayisi} bölme × {raf.katSayisi} kat · göz {miktarMetni(raf.bolmeGenislikM)}×{miktarMetni(raf.derinlikM)}×{miktarMetni(raf.katAraligiM)} m · {NUMARA[raf.numaralama]} · {raf.doluGoz}/{raf.toplamGoz} göz dolu</p>
        </div>
        <div className="tc-stok-eylem">
          <Link to={`/stok/konumlar?rafId=${raf.id}`}><Dugme>Gözler listesi</Dugme></Link>
          <Dugme simge="scan" onClick={() => setEtiket(true)}>Etiketler</Dugme>
          {tanimlar && <HaritaLinki metin="Haritada düzenle" />}
        </div>
      </div>
      <Sekmeler etiket="Görünüm" sekmeler={GORUNUMLER} secili={gorunum} sec={setGorunum} />
      <div className="tc-stok-kaydir">
        <table className="tc-stok-matris">
          <thead><tr><th scope="col">Kat \ Bölme</th>{bolmeler.map((b) => <th key={b} scope="col">{iki(b)}</th>)}</tr></thead>
          <tbody>
            {katlar.map((k) => (
              <tr key={k}>
                <th scope="row"><span className={`tc-stok-kat tc-stok-kat-${((k - 1) % 6) + 1}`} />{raf.tur === 'zemin' ? 'Zemin' : `Kat ${k}`}</th>
                {bolmeler.map((b) => { const g = goz(b, k); return <td key={b}>{g ? <Hucre g={g} gorunum={gorunum} bolmeGenislikM={raf.bolmeGenislikM} /> : null}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tc-stok-not">{ACIKLAMA[gorunum]} Ön yüzden bakış: soldan sağa.</p>
      {etiket && <EtiketPenceresi baslik={`Raf ${raf.kod} etiketleri`} kapat={() => setEtiket(false)}
        ogeler={[...gozler].sort((a, b) => a.bolmeNo - b.bolmeNo || a.katNo - b.katNo).map((g) => ({ tur: 'konum' as const, kod: g.kod, katNo: g.katNo, alt: `Raf ${raf.kod} · Bölme ${iki(g.bolmeNo)} · Kat ${g.katNo}` }))} />}
    </div>
  );
}
