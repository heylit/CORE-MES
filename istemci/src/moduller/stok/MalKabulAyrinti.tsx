import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { BaslangicGeriAlmaDurumu, MalKabulAyrintiCevabi, MalKabulCevabi, MalKabulDuzeltGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart, OnayPenceresi, Pencere, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { CIKIS_NEDENI, HAREKET_ETIKETI, LOGO_ETIKETI, miktarMetni, zamanMetni } from './gorunum.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { SatirListesi, bosSatir, satirGovdesi, type Satir } from './MalKabul.tsx';
import { EtiketMerkeziDugmesi } from './Etiketler.tsx';
import { IrsaliyeBelgeleri } from './IrsaliyeBelgesi.tsx';
import { PartiBelgeleri } from './PartiBelgeleri.tsx';
import { SayfaBasi, hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import './stok.css';

type Satiri = MalKabulAyrintiCevabi['satirlar'][number];
// Her satır tek satır (2940 a): bilgiler ayrı sütunda, uzun ad kesilir; tablo yana kayar, Malzeme solda kalır.
const SUTUNLAR: Sutun<Satiri>[] = [
  { anahtar: 'malzeme', baslik: 'Malzeme', sabit: 'sol', kes: true, csv: (s) => s.malzemeAd ?? `Kart ${s.malzemeId}`, hucre: (s) => (
    <Link to={`/stok/malzemeler/${s.malzemeId}`}>{s.malzemeAd ?? `Kart ${s.malzemeId}`}</Link>
  ) },
  { anahtar: 'sira', baslik: '#', hizala: 'sag', hucre: (s) => s.sira },
  { anahtar: 'miktar', baslik: 'Sayılan', hizala: 'sag', hucre: (s) => miktarMetni(s.sayilanMiktar) },
  { anahtar: 'parti', baslik: 'Parti', kes: true, hucre: (s) => (s.hareketId === null ? '—' : s.partiEtiketi ?? 'Parti bilinmiyor') },
  { anahtar: 'belgeler', baslik: 'Belgeler', hucre: (s) => (s.partiId === null || s.partiBelgeleri.length === 0 ? null : <PartiBelgeleri partiId={s.partiId} belgeler={s.partiBelgeleri} />) },
  { anahtar: 'konum', baslik: 'Konum', mono: true, hucre: (s) => s.konumKod ?? 'Hizmet: stoğa girmez' },
  { anahtar: 'fason', baslik: 'Fasondan dönüş', kes: true, hucre: (s) => (s.fason ? `Giden ${s.fason.malzemeAd ?? `Kart ${s.fason.malzemeId}`} × ${miktarMetni(s.fason.miktar)} (${s.fason.konumKod})` : null) },
  { anahtar: 'logo', baslik: 'Logo irsaliyesi', hucre: (s) => <Rozet ton={LOGO_ETIKETI[s.logoDurumu].ton}>{LOGO_ETIKETI[s.logoDurumu].etiket}</Rozet> },
  { anahtar: 'irsaliyede', baslik: 'İrsaliyede', hizala: 'sag', hucre: (s) => (s.logoIrsaliyeMiktari === null ? null : miktarMetni(s.logoIrsaliyeMiktari)) },
];

type Duzeltme = NonNullable<MalKabulAyrintiCevabi['baslangic']>['duzeltmeler'][number];
const DUZELTME_ALANI: Record<Duzeltme['alan'], string> = {
  malzeme: 'Malzeme', konum: 'Konum', miktar: 'Miktar', lotNo: 'Lot no', tedarikciPartiNo: 'Tedarikçi parti no', dokumNo: 'Döküm no', sertifikaNo: 'Sertifika no',
  tedarikci: 'Tedarikçi', sonKullanma: 'Son kullanma', not: 'Not', haric: 'Hariç tutuldu',
};
const DUZELTME_SUTUNLARI: Sutun<Duzeltme & { i: number }>[] = [
  { anahtar: 'sira', baslik: 'Satır', hizala: 'sag', hucre: (d) => d.sira },
  { anahtar: 'alan', baslik: 'Alan', hucre: (d) => DUZELTME_ALANI[d.alan] },
  { anahtar: 'dosyada', baslik: 'Dosyada', mono: true, kes: true, hucre: (d) => d.dosyada ?? '—' },
  { anahtar: 'girilen', baslik: 'Girilen', mono: true, kes: true, hucre: (d) => (d.alan === 'haric' ? '—' : d.girilen ?? '—') },
  { anahtar: 'toplu', baslik: 'Toplu eşleme', hucre: (d) => (d.toplu ? 'Evet' : '') },
];
const hareketAdi = (h: BaslangicGeriAlmaDurumu['hareketGorenler'][number]): string =>
  (h.tur === 'cikis' && h.cikisNedeni ? CIKIS_NEDENI[h.cikisNedeni] : HAREKET_ETIKETI[h.tur]).toLocaleLowerCase('tr-TR');

// Başlangıç stoğu belgesi (3129) düzeltilmez; bütün olarak geri alınır. Lotlardan biri yüklemeden sonra hareket gördüyse geri alma durur.
function BaslangicGeriAl({ id, kapali }: { id: number; kapali: boolean }) {
  const { bildir } = useBildirim();
  const istemci = useQueryClient();
  const [durum, setDurum] = useState<BaslangicGeriAlmaDurumu | null>(null);
  const [bakiliyor, setBakiliyor] = useState(false);
  const bak = async () => {
    setBakiliyor(true);
    try { setDurum(await api.get<BaslangicGeriAlmaDurumu>(`/stok/baslangic-stogu/${id}/geri-alma`)); } catch (e) { bildir('hata', hataMetni(e)); } finally { setBakiliyor(false); }
  };
  const geriAl = useMutation({
    mutationFn: () => korumaliPost<MalKabulCevabi>(`/stok/baslangic-stogu/${id}/geri-al`, {}),
    onSuccess: async () => { setDurum(null); bildir('tamam', 'Belge geri alındı; hareketleri ters çevrildi.'); await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); },
    onError: (e) => { setDurum(null); bildir('hata', hataMetni(e)); },
  });
  if (kapali) return null;
  const engel = durum !== null && durum.hareketGorenler.length > 0;
  return (
    <>
      <Dugme simge="rotate" yukleniyor={bakiliyor} onClick={() => void bak()}>Belgeyi geri al</Dugme>
      <Pencere acik={engel} kapat={() => setDurum(null)} baslik="Belge geri alınamıyor" alt={<Dugme onClick={() => setDurum(null)}>Kapat</Dugme>}>
        <p>Şu lotlar yüklemeden sonra hareket gördü:</p>
        <ul>{durum?.hareketGorenler.map((h) => <li key={`${h.etiket}-${h.zaman}`}><span className="tc-baslangic-kod">{h.etiket}</span> ({hareketAdi(h)}, {zamanMetni(h.zaman)})</li>)}</ul>
        <p>Önce bu hareketleri geri alın ya da satırları tek tek düzeltin.</p>
      </Pencere>
      <OnayPenceresi acik={durum !== null && !engel} baslik="Belgeyi geri al" onayMetni="Geri al" tehlikeli yukleniyor={geriAl.isPending}
        onayla={() => geriAl.mutate()} vazgec={() => setDurum(null)}>
        <p>{durum?.satirSayisi} satır ve {durum?.lotSayisi} lot geri alınacak. Emin misiniz?</p>
      </OnayPenceresi>
    </>
  );
}

export function MalKabulAyrinti() {
  const id = Number(useParams().id);
  const duzeltebilir = useIslem('stok.geri-al');
  const [acik, setAcik] = useState(false);
  const [duzeltmelerAcik, setDuzeltmelerAcik] = useState(false);
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
  const baslangic = belge.tur === 'baslangic' ? b.data.baslangic ?? null : null;
  const lotSayisi = new Set(b.data.satirlar.flatMap((s) => (s.partiId === null ? [] : [s.partiId]))).size;
  return (
    <section className="tc-stok">
      {belge.tur === 'baslangic' ? (
        <SayfaBasi baslik={belge.no}
          alt={<><Rozet ton="bilgi">Başlangıç stoğu</Rozet> {zamanMetni(belge.zaman)} · {belge.kisiAd ?? '—'} · {belge.satirSayisi} satır · {lotSayisi} lot açıldı
            {baslangic?.dosyaAdi ? ` · Asıl dosya: ${baslangic.dosyaAdi}` : ''}
            {baslangic && <> · <button type="button" className="tc-stok-bag" onClick={() => setDuzeltmelerAcik(true)}>Düzeltmeler ({baslangic.duzeltmeler.length})</button></>}</>}
          sag={<>
            {b.data.satirlar.some((s) => s.partiId !== null) && <EtiketMerkeziDugmesi tur="mal-kabul" idler={[id]}>Lot etiketlerini bas</EtiketMerkeziDugmesi>}
            {duzeltebilir && <BaslangicGeriAl id={id} kapali={belge.duzeltenId !== null || belge.duzeltilenId !== null} />}
          </>} />
      ) : (
        <SayfaBasi baslik={`Mal kabul ${belge.no}`} alt={`${zamanMetni(belge.zaman)} · ${belge.kisiAd ?? '—'}${belge.irsaliyeNo ? ` · irsaliye ${belge.irsaliyeNo}` : ''}${belge.irsaliyeTarihi ? ` · irsaliye tarihi ${tarihMetni(belge.irsaliyeTarihi)}` : ''}`}
          sag={<>
            {b.data.satirlar.some((s) => s.partiId !== null) && <EtiketMerkeziDugmesi tur="mal-kabul" idler={[id]}>Lot etiketlerini bas</EtiketMerkeziDugmesi>}
            {duzeltebilir && belge.duzeltenId === null && <Dugme simge="edit" onClick={duzeltAc}>Düzelt</Dugme>}
          </>} />
      )}
      {belge.tur === 'baslangic' && belge.duzeltenId !== null && <p className="tc-stok-not">Bu belge geri alındı: <Link to={`/stok/mal-kabul/${belge.duzeltenId}`}>geri alma belgesine git</Link>. Hareketleri ters çevrildi.</p>}
      {belge.tur !== 'baslangic' && belge.duzeltenId !== null && <p className="tc-stok-not">Bu belge düzeltildi: <Link to={`/stok/mal-kabul/${belge.duzeltenId}`}>düzeltme belgesine git</Link>. Hareketleri ters çevrildi.</p>}
      {belge.tur === 'baslangic' && belge.duzeltilenId !== null && <p className="tc-stok-not">Bu belge <Link to={`/stok/mal-kabul/${belge.duzeltilenId}`}>başlangıç stoğu belgesini</Link> geri alır.</p>}
      {belge.tur !== 'baslangic' && belge.duzeltilenId !== null && <p className="tc-stok-not">Bu belge <Link to={`/stok/mal-kabul/${belge.duzeltilenId}`}>önceki belgeyi</Link> düzeltir.</p>}
      <IrsaliyeBelgeleri malKabulId={id} />
      <Kart baslik="Satırlar"><Tablo etiket="Mal kabul satırları" kip="kaydir" sutunlar={SUTUNLAR} satirlar={b.data.satirlar} satirAnahtari={(s) => s.sira} /></Kart>
      <Pencere acik={acik} kapat={() => setAcik(false)} baslik={`${belge.no} düzeltmesi`} tur="yan"
        alt={<>
          <Dugme tur="tehlike" simge="trash" yukleniyor={komut.isPending} onClick={() => komut.mutate({ satirlar: [] })}>Belgeyi tamamen iptal et</Dugme>
          <Dugme tur="birincil" yukleniyor={komut.isPending} disabled={satirlar.some((s) => s.sertifikaYukleniyor)} onClick={() => komut.mutate({ satirlar: satirlar.map(satirGovdesi) })}>Düzeltme belgesi aç</Dugme>
        </>}>
        <p className="tc-stok-not">Belge değişmez. Eski belgenin bütün hareketleri ters çevrilir ve doğru satırlarla yeni belge açılır. Gelmeyen kalemin miktarını 0 yazın; tamamen iptalde yeni belge satırsız açılır. Eski satırların Logo durumu olduğu gibi kalır.</p>
        <div className="tc-stok-form"><SatirListesi satirlar={satirlar} setSatirlar={setSatirlar} /></div>
      </Pencere>
      {baslangic && (
        <Pencere acik={duzeltmelerAcik} kapat={() => setDuzeltmelerAcik(false)} baslik={`Düzeltmeler (${baslangic.duzeltmeler.length})`} tur="yan" genis>
          <p className="tc-stok-not">Yükleme öncesi tabloda yapılan düzeltmeler; dosyadaki değer yükleyenin tarayıcısında okunan değerdir.</p>
          <Tablo etiket="Düzeltmeler" kip="kaydir" sutunlar={DUZELTME_SUTUNLARI} satirlar={baslangic.duzeltmeler.map((d, i) => ({ ...d, i }))} satirAnahtari={(d) => d.i} bosMesaj="Düzeltme yapılmadı." />
        </Pencere>
      )}
      {onayPenceresi}
    </section>
  );
}
