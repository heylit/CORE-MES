import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { MalKabulAyrintiCevabi, MalKabulCevabi, MalKabulDuzeltGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart, Pencere, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { LOGO_ETIKETI, miktarMetni, zamanMetni } from './gorunum.ts';
import { SatirListesi, bosSatir, satirGovdesi, type Satir } from './MalKabul.tsx';
import { EtiketMerkeziDugmesi } from './Etiketler.tsx';
import { PartiBelgeleri } from './PartiBelgeleri.tsx';
import { SayfaBasi, hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import './stok.css';

type Satiri = MalKabulAyrintiCevabi['satirlar'][number];
const SUTUNLAR: Sutun<Satiri>[] = [
  { anahtar: 'sira', baslik: '#', hizala: 'sag', hucre: (s) => s.sira },
  { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (s) => (
    <span className="tc-stok-ad"><Link to={`/stok/malzemeler/${s.malzemeId}`}>{s.malzemeAd ?? `Kart ${s.malzemeId}`}</Link>
      {s.fason && <span>Fasondan dönüş · giden {s.fason.malzemeAd ?? `Kart ${s.fason.malzemeId}`} × {miktarMetni(s.fason.miktar)} ({s.fason.konumKod})</span>}</span>
  ) },
  { anahtar: 'miktar', baslik: 'Sayılan', hizala: 'sag', hucre: (s) => miktarMetni(s.sayilanMiktar) },
  { anahtar: 'parti', baslik: 'Parti', hucre: (s) => (s.hareketId === null ? '—' : (
    <span className="tc-stok-ad">{s.partiEtiketi ?? 'Parti bilinmiyor'}{s.partiId !== null && <PartiBelgeleri partiId={s.partiId} belgeler={s.partiBelgeleri} />}</span>
  )) },
  { anahtar: 'konum', baslik: 'Konum', mono: true, hucre: (s) => s.konumKod ?? 'Hizmet: stoğa girmez' },
  { anahtar: 'logo', baslik: 'Logo irsaliyesi', hucre: (s) => (
    <><Rozet ton={LOGO_ETIKETI[s.logoDurumu].ton}>{LOGO_ETIKETI[s.logoDurumu].etiket}</Rozet>
      {s.logoIrsaliyeMiktari !== null && <span className="tc-stok-not"> irsaliyede {miktarMetni(s.logoIrsaliyeMiktari)}</span>}</>
  ) },
];

export function MalKabulAyrinti() {
  const id = Number(useParams().id);
  const duzeltebilir = useIslem('stok.geri-al');
  const [acik, setAcik] = useState(false);
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const b = useQuery({ queryKey: anahtarlar.ayrinti('mal-kabul', id), queryFn: () => api.get<MalKabulAyrintiCevabi>(`/stok/mal-kabuller/${id}`) });
  const { komut, onayPenceresi } = useStokKomutu(
    (g: MalKabulDuzeltGovdesi) => korumaliPost<MalKabulCevabi>(`/stok/mal-kabuller/${id}/duzelt`, g), 'Düzeltme belgesi açıldı; eski belgenin hareketleri ters çevrildi.', () => setAcik(false));
  const duzeltAc = () => {
    if (!b.data) return;
    setSatirlar(b.data.satirlar.map((s) => ({ ...bosSatir(), kart: String(s.malzemeId), miktar: miktarMetni(s.sayilanMiktar).replace(/\./g, ''),
      ...(s.siparisSatirId === null ? {} : { siparisSatirId: String(s.siparisSatirId), siparisEtiketi: `Sipariş satırı ${s.siparisSatirId}` }),
      ...(s.hareketId === null ? { hizmetKarti: String(s.malzemeId), donus: 'hizmet' as const } : {}),
      ...(s.fason ? { hizmetKarti: s.fason.hizmetMalzemeId === null ? '' : String(s.fason.hizmetMalzemeId), donus: 'fason' as const, gidenKart: String(s.fason.malzemeId), fasonKonumId: String(s.fason.konumId), gidenMiktar: miktarMetni(s.fason.miktar).replace(/\./g, '') } : {}) })));
    setAcik(true);
  };
  if (b.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (b.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(b.error)} yenile={() => void b.refetch()} />;
  const belge = b.data.belge;
  return (
    <section className="tc-stok">
      <SayfaBasi baslik={`Mal kabul ${belge.no}`} alt={`${zamanMetni(belge.zaman)} · ${belge.kisiAd ?? '—'}${belge.irsaliyeNo ? ` · irsaliye ${belge.irsaliyeNo}` : ''}`}
        sag={<>
          {b.data.satirlar.some((s) => s.partiId !== null) && <EtiketMerkeziDugmesi tur="mal-kabul" idler={[id]}>Lot etiketlerini bas</EtiketMerkeziDugmesi>}
          {duzeltebilir && belge.duzeltenId === null && <Dugme simge="edit" onClick={duzeltAc}>Düzelt</Dugme>}
        </>} />
      {belge.duzeltenId !== null && <p className="tc-stok-not">Bu belge düzeltildi: <Link to={`/stok/mal-kabul/${belge.duzeltenId}`}>düzeltme belgesine git</Link>. Hareketleri ters çevrildi.</p>}
      {belge.duzeltilenId !== null && <p className="tc-stok-not">Bu belge <Link to={`/stok/mal-kabul/${belge.duzeltilenId}`}>önceki belgeyi</Link> düzeltir.</p>}
      <Kart baslik="Satırlar"><Tablo etiket="Mal kabul satırları" sutunlar={SUTUNLAR} satirlar={b.data.satirlar} satirAnahtari={(s) => s.sira} /></Kart>
      <Pencere acik={acik} kapat={() => setAcik(false)} baslik={`${belge.no} düzeltmesi`} tur="yan"
        alt={<>
          <Dugme tur="tehlike" simge="trash" yukleniyor={komut.isPending} onClick={() => komut.mutate({ satirlar: [] })}>Belgeyi tamamen iptal et</Dugme>
          <Dugme tur="birincil" yukleniyor={komut.isPending} disabled={satirlar.some((s) => s.sertifikaYukleniyor)} onClick={() => komut.mutate({ satirlar: satirlar.map(satirGovdesi) })}>Düzeltme belgesi aç</Dugme>
        </>}>
        <p className="tc-stok-not">Belge değişmez. Eski belgenin bütün hareketleri ters çevrilir ve doğru satırlarla yeni belge açılır. Gelmeyen kalemin miktarını 0 yazın; tamamen iptalde yeni belge satırsız açılır. Eski satırların Logo durumu olduğu gibi kalır.</p>
        <div className="tc-stok-form"><SatirListesi satirlar={satirlar} setSatirlar={setSatirlar} /></div>
      </Pencere>
      {onayPenceresi}
    </section>
  );
}
