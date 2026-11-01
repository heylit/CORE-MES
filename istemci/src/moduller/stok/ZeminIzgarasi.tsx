import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { AlanTuru, HucreAtaGovdesi } from '#paylasilan/sozlesme/atolye.ts';
import type { KonumAyrintiCevabi, ZeminCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { ALAN_TURU_ADI, ZeminSimgesi } from '../atolye/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EtiketMerkeziDugmesi } from './Etiketler.tsx';
import { KONUM_ETIKETI, miktarMetni } from './gorunum.ts';
import { hataMetni, useIslem, useStokKomutu } from './ortak.tsx';
import './stok.css';

type Bolum = ZeminCevabi['bolumler'][number];
const NESNE_ADI = { raf: 'Raf', istasyon: 'İstasyon', makine: 'Makine', alan: 'Alan' } as const;
const ISTASYON = 'istasyon';
const ALAN_TURLERI = Object.keys(ALAN_TURU_ADI) as AlanTuru[];

// Zemin ızgarası (kart #1304): kareler Fabrika Haritası'nın bölüm ızgarasıdır (harf sütun, numara satır); karedeki raf,
// istasyon, makine ve alan haritadaki simgesiyle görünür, kareye düşen stok konumları sayılır. Haritayı düzenleyen kareye
// alan türü ya da istasyon atar; atama haritaya yazılır, ardından stok konumları haritadan eşlenir.
export function ZeminIzgarasi() {
  const atolyeYazar = useIslem('atolye.yaz');
  const tanimlar = useIslem('stok.tanim');
  const [salonId, setSalonId] = useState<number | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const z = useQuery({ queryKey: [...anahtarlar.hepsi, 'zemin'], queryFn: () => api.get<ZeminCevabi>('/stok/zemin') });
  if (z.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (z.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(z.error)} yenile={() => void z.refetch()} />;
  const bolum = z.data.bolumler.find((b) => b.salonId === salonId) ?? z.data.bolumler[0];
  if (!bolum) return <DurumKutusu durum="bos" mesaj="Fabrika Haritası'nda bölüm yok; kareler bölüm çizilince gelir." />;
  const sec = (id: number) => { setSalonId(id); setSecili(null); };
  return (
    <div className="tc-stok-dama-duzen">
      <Kart baslik={`${bolum.kod} · ${bolum.sutunlar.length} × ${bolum.satirlar.length} kare`}
        sag={<Secim etiket="Bölüm" value={String(bolum.salonId)} onChange={(e) => sec(Number(e.target.value))}
          secenekler={z.data.bolumler.map((b) => ({ deger: String(b.salonId), baslik: `${b.kod} · ${b.ad}${b.depoKod ? ' (depo)' : ''}` }))} />}>
        <div className="tc-stok-kaydir">
          <table className="tc-stok-dama" aria-label={`${bolum.kod} zemin ızgarası`}>
            <thead><tr><th />{bolum.sutunlar.map((s) => <th key={s} scope="col">{s}</th>)}</tr></thead>
            <tbody>
              {bolum.satirlar.map((satir) => (
                <tr key={satir}>
                  <th scope="row">{satir}</th>
                  {bolum.sutunlar.map((sutun) => <Kare key={sutun} bolum={bolum} hucre={`${sutun}${satir}`} secili={secili} sec={setSecili} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tc-stok-not">Kareler ve harfler Fabrika Haritası'ndan gelir; haritada eklenen raf, makine ve alan burada aynı karede görünür.</p>
      </Kart>
      <Kart baslik={secili ? `Kare ${bolum.kod} ${secili}` : 'Kare seç'}>
        {secili
          ? <KarePaneli key={`${bolum.salonId}-${secili}`} bolum={bolum} hucre={secili} istasyonlar={z.data.istasyonlar} atayabilir={atolyeYazar} eslesin={tanimlar} />
          : <p className="tc-stok-not">Bir kareye dokun: içindeki öğeleri ve stok konumlarını gör{atolyeYazar ? ', alan türü ya da istasyon ata' : ''}.</p>}
      </Kart>
    </div>
  );
}

function Kare({ bolum, hucre, secili, sec }: { bolum: Bolum; hucre: string; secili: string | null; sec: (h: string) => void }) {
  const nesneler = bolum.nesneler.filter((n) => n.hucre === hucre);
  const konumlar = bolum.konumlar.filter((k) => k.hucre === hucre);
  const dolu = konumlar.reduce((t, k) => t + k.satirSayisi, 0);
  return (
    <td>
      <button type="button" className={`tc-stok-kare ${konumlar.length ? 'tc-stok-kare-konum' : ''} ${dolu > 0 ? 'tc-stok-kare-dolu' : ''}`} aria-pressed={secili === hucre} onClick={() => sec(hucre)}
        aria-label={`Kare ${hucre}${nesneler.length ? `, ${nesneler.length} öğe` : ''}${dolu ? `, ${dolu} stok satırı` : ''}`}>
        <span className="tc-stok-mono">{hucre}</span>
        {nesneler.length > 0 && (
          <span className="tc-stok-kare-simgeler">
            {nesneler.slice(0, 3).map((n) => <ZeminSimgesi key={`${n.tur}${n.id}`} tur={n.tur} altTur={n.altTur} ad={n.ad} />)}
            {nesneler.length > 3 && <span>+{nesneler.length - 3}</span>}
          </span>
        )}
        {dolu > 0 && <strong>{dolu}</strong>}
      </button>
    </td>
  );
}

function KarePaneli({ bolum, hucre, istasyonlar, atayabilir, eslesin }: {
  bolum: Bolum; hucre: string; istasyonlar: ZeminCevabi['istasyonlar']; atayabilir: boolean; eslesin: boolean;
}) {
  const nesneler = bolum.nesneler.filter((n) => n.hucre === hucre);
  const konumlar = bolum.konumlar.filter((k) => k.hucre === hucre);
  const [ata, setAta] = useState<AlanTuru | typeof ISTASYON | ''>('');
  const [istasyonId, setIstasyonId] = useState('');
  // Atama haritaya yazılır; stok konumu açılıp kapanması için ardından eşleme koşar (stok tanımı olan kişide).
  const { komut } = useStokKomutu(async (g: HucreAtaGovdesi) => {
    await api.post(`/atolye/salonlar/${bolum.salonId}/hucre-ata`, g);
    if (eslesin) await api.post('/stok/konumlar/haritadan-esle', {});
  }, 'Kare atandı.', () => { setAta(''); setIstasyonId(''); });
  const gonder = () => {
    if (ata === ISTASYON) komut.mutate({ surum: bolum.surum, hucre, atama: { tur: 'istasyon', istasyonId: Number(istasyonId) } });
    else if (ata !== '') komut.mutate({ surum: bolum.surum, hucre, atama: { tur: 'alan', alanTuru: ata } });
  };
  return (
    <div className="tc-stok-form">
      {nesneler.length === 0 ? <p className="tc-stok-not">Bu karede haritada öğe yok.</p> : (
        <ul className="tc-stok-zemin-liste" aria-label="Karedeki öğeler">
          {nesneler.map((n) => (
            <li key={`${n.tur}${n.id}`}><ZeminSimgesi tur={n.tur} altTur={n.altTur} ad={n.ad} />
              <span>{n.kod ? <strong className="tc-stok-mono">{n.kod}</strong> : null} {n.ad}</span>
              <small>{n.tur === 'alan' && n.altTur in ALAN_TURU_ADI ? ALAN_TURU_ADI[n.altTur as AlanTuru] : NESNE_ADI[n.tur]}</small></li>
          ))}
        </ul>
      )}
      {konumlar.length === 0 ? <p className="tc-stok-not">Bu karede stok konumu yok.</p> : (
        <ul className="tc-stok-zemin-liste" aria-label="Karedeki stok konumları">
          {konumlar.map((k) => (
            <KareKonumu key={k.id} konum={k} />
          ))}
        </ul>
      )}
      {atayabilir && (
        <form className="tc-stok-form" onSubmit={(e) => { e.preventDefault(); gonder(); }}>
          <Secim etiket="Kareye ata" value={ata} onChange={(e) => setAta(e.target.value as typeof ata)} bosSecenek="Seçiniz"
            secenekler={[{ deger: ISTASYON, baslik: 'İstasyon' }, ...ALAN_TURLERI.map((t) => ({ deger: t, baslik: ALAN_TURU_ADI[t] }))]} />
          {ata === ISTASYON && (
            <Secim etiket="İstasyon" value={istasyonId} onChange={(e) => setIstasyonId(e.target.value)} bosSecenek="Seçiniz" required
              secenekler={istasyonlar.map((i) => ({ deger: String(i.id), baslik: `${i.kod} · ${i.ad}${i.salonId !== null && i.salonId !== bolum.salonId ? ' (başka bölümde)' : ''}` }))} />
          )}
          <p className="tc-stok-not">Karede alan varsa türü değişir, yoksa kare boyunda alan açılır. İstasyon bu bölümdeyse kareye taşınır.</p>
          <Dugme type="submit" tur="birincil" disabled={ata === '' || (ata === ISTASYON && istasyonId === '')} yukleniyor={komut.isPending}>Ata</Dugme>
        </form>
      )}
    </div>
  );
}

// Karedeki konumun stoğu ve etiketi panelde görünür: depocu ayrıntıya gitmeden gözde ne olduğunu görür, etiketi buradan basar.
const KAREDE_EN_COK = 5;
function KareKonumu({ konum }: { konum: Bolum['konumlar'][number] }) {
  const a = useQuery({
    queryKey: anahtarlar.ayrinti('konum', konum.id), queryFn: () => api.get<KonumAyrintiCevabi>(`/stok/konumlar/${konum.id}`), enabled: konum.satirSayisi > 0,
  });
  const bakiyeler = a.data?.bakiyeler ?? [];
  return (
    <li>
      <Link to={`/stok/konumlar/${konum.id}`} className="tc-stok-mono">{konum.kod}</Link>
      <small>{KONUM_ETIKETI[konum.tur]} · {konum.satirSayisi ? `${konum.satirSayisi} stok satırı` : 'boş'}</small>
      <EtiketMerkeziDugmesi tur="konum" simge="scan" idler={[konum.id]}>Etiket</EtiketMerkeziDugmesi>
      {konum.satirSayisi > 0 && (a.isError ? <small>{hataMetni(a.error)}</small> : a.isPending ? <small>Stok okunuyor</small> : (
        <ul className="tc-stok-zemin-stok" aria-label={`${konum.kod} stoğu`}>
          {bakiyeler.slice(0, KAREDE_EN_COK).map((b) => <li key={b.id}><span>{b.malzemeAd ?? `Kart ${b.malzemeId}`}</span><strong>{miktarMetni(b.miktar)}</strong></li>)}
          {bakiyeler.length > KAREDE_EN_COK && <li><Link to={`/stok/konumlar/${konum.id}`}>+{bakiyeler.length - KAREDE_EN_COK} satır daha</Link></li>}
        </ul>
      ))}
    </li>
  );
}
