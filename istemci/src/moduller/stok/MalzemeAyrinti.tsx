import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { BakiyeSatiri, CikisGovdesi, CikisOnerisiCevabi, HareketCevabi, MalzemeAyarGovdesi, MalzemeAyrintiCevabi, RezerveEtGovdesi, RezerveKaldirGovdesi, RezervelerCevabi, SonPartilerCevabi, TasimaGovdesi, UretimGirisiGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { birimliMiktar, CIKIS_NEDENI, CIKIS_NEDENLERI, DURUM_ETIKETI, MALZEME_TURU, miktarGirdisi, miktarMetni, zamanMetni } from './gorunum.ts';
import { HareketTablosu } from './Hareketler.tsx';
import { useKonumSecenekleri } from './MalKabul.tsx';
import { hataMetni, KaliteRozeti, korumaliPost, SayfaBasi, useIslem, useStokKomutu } from './ortak.tsx';
import { SepeteEklePenceresi } from './SepeteEkle.tsx';
import { EtiketPenceresi } from './Etiketler.tsx';
import { AmbalajIkonu } from './AmbalajIkonu.tsx';
import { EmirSecici } from './EmirSecici.tsx';
import { LotEtiketPenceresi } from './LotEtiketi.tsx';
import { PartiBelgeleri } from './PartiBelgeleri.tsx';
import { PartiIziPenceresi } from './PartiIzi.tsx';
import { useStatuAdi } from './statu.ts';
import './stok.css';

type Rezerve = MalzemeAyrintiCevabi['rezerveler'][number];
type Islem = { tur: 'cikis' | 'tasima'; b: BakiyeSatiri } | { tur: 'uretim' } | { tur: 'ayar' } | { tur: 'sepet'; konumId?: number } | { tur: 'etiket' }
  | { tur: 'rezerve-et' } | { tur: 'rezerve-kaldir'; r: Rezerve };

type SonParti = SonPartilerCevabi['partiler'][number];
const PARTI_SUTUNLARI: Sutun<SonParti>[] = [
  { anahtar: 'lot', baslik: 'Lot no', mono: true, hucre: (p) => <Link to={`/stok/hareketler?partiId=${p.partiId}`}>{p.lotNo}</Link> },
  { anahtar: 'parti', baslik: 'Tedarikçi parti', hucre: (p) => p.tedarikciPartiNo ?? '—' },
  { anahtar: 'dokum', baslik: 'Döküm no', mono: true, hucre: (p) => p.dokumNo ?? '—' },
  { anahtar: 'sertifikaNo', baslik: 'Sertifika no', mono: true, hucre: (p) => p.sertifikaNo ?? '—' },
  { anahtar: 'zaman', baslik: 'Geliş', hucre: (p) => zamanMetni(p.kayitZamani) },
  { anahtar: 'belge', baslik: 'Sertifika', hucre: (p) => (p.belgeler.length === 0 ? '—' : <PartiBelgeleri partiId={p.partiId} belgeler={p.belgeler} />) },
];

// Kartın son partileri ve bağlı sertifikaları (#1013); hammadde izlenebilirliği.
function SonPartiler({ malzemeId }: { malzemeId: number }) {
  const p = useQuery({ queryKey: [...anahtarlar.hepsi, 'son-partiler', malzemeId], queryFn: () => api.get<SonPartilerCevabi>(`/stok/malzemeler/${malzemeId}/son-partiler`) });
  // Kaybolan ya da yıpranan etiket buradan yeniden basılır (#1060).
  const [etiket, setEtiket] = useState<SonParti | null>(null);
  const [iz, setIz] = useState<SonParti | null>(null);
  const sutunlar: Sutun<SonParti>[] = [...PARTI_SUTUNLARI, { anahtar: 'etiket', baslik: '', hucre: (x) => <>
    <Dugme tur="ikincil" simge="truck" onClick={() => setIz(x)}>İz</Dugme>
    <Dugme tur="ikincil" simge="tag" onClick={() => setEtiket(x)}>Lot etiketi</Dugme>
  </> }];
  if (p.isError) return <Kart baslik="Partiler ve sertifikalar"><DurumKutusu durum="hata" mesaj={hataMetni(p.error)} yenile={() => void p.refetch()} /></Kart>;
  if (p.data && p.data.partiler.length === 0) return null;
  return (
    <Kart baslik="Partiler ve sertifikalar">
      <Tablo etiket="Partiler ve sertifikalar" sutunlar={sutunlar} satirlar={p.data?.partiler ?? []} satirAnahtari={(x) => x.partiId} mesgul={p.isPending} />
      {etiket && <LotEtiketPenceresi baslik={`${etiket.lotNo} lot etiketi`} yol={`/stok/partiler/${etiket.partiId}/etiket`} kapat={() => setEtiket(null)} />}
      {iz && <PartiIziPenceresi partiId={iz.partiId} lotNo={iz.lotNo} kapat={() => setIz(null)} />}
    </Kart>
  );
}

const rezerveToplami = (rezerveler: readonly Rezerve[], statuId: number | null): number =>
  rezerveler.filter((r) => r.statuId === statuId).reduce((t, r) => t + Number(r.miktar), 0);

function RezerveEtFormu({ malzemeId, statuler, kapat }: { malzemeId: number; statuler: number[]; kapat: () => void }) {
  const statuAdi = useStatuAdi();
  const [statu, setStatu] = useState(statuler.length === 1 ? String(statuler[0]) : '');
  const [emir, setEmir] = useState('');
  const [miktar, setMiktar] = useState('');
  const { komut, onayPenceresi } = useStokKomutu((g: RezerveEtGovdesi) => korumaliPost<RezervelerCevabi>('/stok/rezerve-et', g), 'Emre ayrıldı.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik="Rezerve et" tur="yan"
      alt={<Dugme tur="birincil" yukleniyor={komut.isPending} onClick={() => komut.mutate({ malzemeId, statuId: Number(statu), uretimEmriId: Number(emir), miktar: miktarGirdisi(miktar) })}>Rezerve et</Dugme>}>
      <div className="tc-stok-form">
        <Secim etiket="Statü" value={statu} onChange={(e) => setStatu(e.target.value)} bosSecenek="Seçin" required secenekler={statuler.map((x) => ({ deger: String(x), baslik: statuAdi(x) }))} />
        <EmirSecici deger={emir} degistir={setEmir} zorunlu ipucu="Statü bu emrin rotasında olmalı (aynı ürün ve OP)." />
        <Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} required ipucu="En çok statüde kimseye ayrılmamış kadar." />
      </div>
      {onayPenceresi}
    </Pencere>
  );
}

function RezerveKaldirFormu({ malzemeId, r, kapat }: { malzemeId: number; r: Rezerve; kapat: () => void }) {
  const statuAdi = useStatuAdi();
  const [miktar, setMiktar] = useState('');
  const [neden, setNeden] = useState('');
  const { komut, onayPenceresi } = useStokKomutu((g: RezerveKaldirGovdesi) => korumaliPost<RezervelerCevabi>('/stok/rezerve-kaldir', g), 'Rezerve kaldırıldı.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik={`Rezerveyi kaldır: ${r.emirNo ?? `#${r.uretimEmriId}`}`} tur="yan"
      alt={<Dugme tur="birincil" yukleniyor={komut.isPending} onClick={() => komut.mutate({
        malzemeId, statuId: r.statuId, uretimEmriId: r.uretimEmriId, neden, ...(miktar ? { miktar: miktarGirdisi(miktar) } : {}),
      })}>Rezerveyi kaldır</Dugme>}>
      <div className="tc-stok-form">
        <p className="tc-stok-not">{statuAdi(r.statuId)} · ayrılan {miktarMetni(r.miktar)}. Malzeme statüsünü korur; aynı ürün ve OP'nin başka emri kullanabilir.</p>
        <Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} ipucu="Boşsa ayrılanın tamamı kalkar." />
        <Girdi etiket="Neden" value={neden} onChange={(e) => setNeden(e.target.value)} required maxLength={200} />
      </div>
      {onayPenceresi}
    </Pencere>
  );
}

export function CikisFormu({ b, kapat }: { b: BakiyeSatiri; kapat: () => void }) {
  const [miktar, setMiktar] = useState('');
  const [neden, setNeden] = useState<(typeof CIKIS_NEDENLERI)[number]>('uretime_sarf');
  const [emir, setEmir] = useState('');
  const { komut, onayPenceresi } = useStokKomutu((g: CikisGovdesi) => korumaliPost<HareketCevabi>('/stok/cikis', g), 'Çıkış yazıldı.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik={`Çıkış: ${b.konumKod}`} tur="yan"
      alt={<Dugme tur="birincil" yukleniyor={komut.isPending} onClick={() => komut.mutate({
        malzemeId: b.malzemeId, konumId: b.konumId, partiId: b.partiId, miktar: miktarGirdisi(miktar), cikisNedeni: neden, ...(emir ? { uretimEmriId: Number(emir) } : {}),
      })}>Stoktan düş</Dugme>}>
      <div className="tc-stok-form">
        <p className="tc-stok-not">Gözde {miktarMetni(b.miktar)}{b.partiEtiketi ? ` · parti ${b.partiEtiketi}` : ''}.</p>
        <Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} required />
        <Secim etiket="Neden" value={neden} onChange={(e) => setNeden(e.target.value as typeof neden)} secenekler={CIKIS_NEDENLERI.map((n) => ({ deger: n, baslik: CIKIS_NEDENI[n] }))} />
        {neden === 'uretime_sarf' && <EmirSecici deger={emir} degistir={setEmir} ipucu="Sarf emre bağlanır; otomatik düşüm üretim kaydı gelince açılır." />}
      </div>
      {onayPenceresi}
    </Pencere>
  );
}

export function TasimaFormu({ b, kapat }: { b: BakiyeSatiri; kapat: () => void }) {
  const konumlar = useKonumSecenekleri().filter((k) => k.deger !== String(b.konumId));
  const [miktar, setMiktar] = useState(miktarMetni(b.miktar).replace(/\./g, ''));
  const [hedef, setHedef] = useState('');
  const { komut, onayPenceresi } = useStokKomutu((g: TasimaGovdesi) => korumaliPost<HareketCevabi>('/stok/tasima', g), 'Taşındı.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik={`Taşı: ${b.konumKod}`} tur="yan"
      alt={<Dugme tur="birincil" yukleniyor={komut.isPending} disabled={hedef === ''} onClick={() => komut.mutate({ malzemeId: b.malzemeId, kaynakKonumId: b.konumId, partiId: b.partiId, hedefKonumId: Number(hedef), miktar: miktarGirdisi(miktar) })}>Taşı</Dugme>}>
      <div className="tc-stok-form">
        <Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} required />
        <Secim etiket="Hedef konum" value={hedef} onChange={(e) => setHedef(e.target.value)} secenekler={konumlar} bosSecenek="Seçin" required />
      </div>
      {onayPenceresi}
    </Pencere>
  );
}

function UretimGirisiFormu({ malzemeId, kapat }: { malzemeId: number; kapat: () => void }) {
  const [miktar, setMiktar] = useState('');
  const [emir, setEmir] = useState('');
  const { komut } = useStokKomutu((g: UretimGirisiGovdesi) => korumaliPost<HareketCevabi>('/stok/uretim-girisi', g), 'Üretim girişi yazıldı.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik="Üretimden giriş" tur="yan"
      alt={<Dugme tur="birincil" yukleniyor={komut.isPending} disabled={emir === ''} onClick={() => komut.mutate({ malzemeId, uretimEmriId: Number(emir), miktar: miktarGirdisi(miktar) })}>Girişi yaz</Dugme>}>
      <div className="tc-stok-form">
        <p className="tc-stok-not">Biten mamul üretim çıkış alanına (URETIM) girer; partisi üretim emridir. Üretim sayımı TMI'ya yazılana kadar giriş elle yapılır.</p>
        <EmirSecici deger={emir} degistir={setEmir} zorunlu />
        <Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} required />
      </div>
    </Pencere>
  );
}

function AyarFormu({ id, ayar, kapat }: { id: number; ayar: MalzemeAyrintiCevabi['ayar']; kapat: () => void }) {
  const [kritik, setKritik] = useState(ayar.kritikSeviye === null ? '' : miktarMetni(ayar.kritikSeviye).replace(/\./g, ''));
  const [konum, setKonum] = useState(ayar.varsayilanKonum === null ? '' : String(ayar.varsayilanKonum.id));
  const konumlar = useKonumSecenekleri();
  const { komut } = useStokKomutu((g: MalzemeAyarGovdesi) => api.post('/stok/malzemeler/' + id + '/ayar-duzenle', g), 'Stok ayarı kaydedildi.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik="Stok ayarı" tur="yan"
      alt={<Dugme tur="birincil" yukleniyor={komut.isPending} onClick={() => komut.mutate({
        surum: ayar.surum, kritikSeviye: kritik === '' ? null : miktarGirdisi(kritik), varsayilanAmbalaj: ayar.varsayilanAmbalaj, varsayilanKonumId: konum === '' ? null : Number(konum),
        ambalajlar: ayar.ambalajlar.map((a) => ({ tur: a.tur, olcu: a.olcu, iciMiktar: a.iciMiktar })),
      })}>Kaydet</Dugme>}>
      <div className="tc-stok-form">
        <Girdi etiket="Kritik seviye" inputMode="decimal" value={kritik} onChange={(e) => setKritik(e.target.value)} ipucu="Boş bırakılırsa kritik durum hesaplanmaz. Malzeme kartında sipariş noktası olarak görünür." />
        <Secim etiket="Varsayılan konum" value={konum} onChange={(e) => setKonum(e.target.value)} secenekler={konumlar} bosSecenek="Yok" ipucu="Malzeme kartında depo yeri olarak görünür." />
      </div>
    </Pencere>
  );
}

export function MalzemeAyrinti() {
  const id = Number(useParams().id);
  const cikabilir = useIslem('stok.cikis');
  const tasiyabilir = useIslem('stok.transfer');
  const girebilir = useIslem('stok.giris');
  const tanimlar = useIslem('stok.tanim');
  const sepetYetkisi = useIslem('stok.transfer');
  const ayirabilir = useIslem('stok.statu-degistir');
  const [islem, setIslem] = useState<Islem | null>(null);
  const [oneriMiktari, setOneriMiktari] = useState('');
  const statuAdi = useStatuAdi();
  const m = useQuery({ queryKey: anahtarlar.ayrinti('malzeme', id), queryFn: () => api.get<MalzemeAyrintiCevabi>(`/stok/malzemeler/${id}`) });
  const oneriMetni = miktarGirdisi(oneriMiktari);
  const oneri = useQuery({
    queryKey: anahtarlar.cikisOnerisi(id, oneriMetni), enabled: /^\d+(\.\d{1,3})?$/.test(oneriMetni) && Number(oneriMetni) > 0,
    queryFn: () => api.get<CikisOnerisiCevabi>(`/stok/malzemeler/${id}/cikis-onerisi?miktar=${oneriMetni}`),
  });
  if (m.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (m.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(m.error)} yenile={() => void m.refetch()} />;
  const s = m.data.satir;
  // Statülü stok çıkışa, taşımaya ve sepete kapalıdır (STK-S3); işlemler yalnız serbest satırda görünür.
  const serbestBakiyeler = m.data.bakiyeler.filter((b) => b.statuId === null);
  // Rota tanımında açılmış ama stoğu olmayan statü salt okunur satırdır: miktar uydurulmaz, işlem yoktur.
  type Kirilim = { statuId: number | null; miktar: string | null; ilkGiris: string | null };
  const kirilim: Kirilim[] = [...m.data.statuKirilimi, ...m.data.tanimliStatuler.map((t) => ({ statuId: t.statuId, miktar: null, ilkGiris: null }))];
  const statuluVar = kirilim.some((k) => k.statuId !== null);
  const kirilimSutunlari: Sutun<Kirilim>[] = [
    { anahtar: 'statu', baslik: 'Statü', hucre: (k) => (k.statuId === null ? 'Serbest' : <Rozet ton={k.miktar === null ? 'pasif' : 'bilgi'}>{statuAdi(k.statuId)}</Rozet>) },
    { anahtar: 'giris', baslik: 'Statüye giriş', kirilmaz: true, hucre: (k) => (k.ilkGiris === null ? '—' : zamanMetni(k.ilkGiris)) },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (k) => (k.miktar === null ? <span className="tc-stok-alt">Tanımlı, stok yok</span> : <strong>{miktarMetni(k.miktar)}</strong>) },
    { anahtar: 'rezerve', baslik: 'Rezerve', hizala: 'sag', hucre: (k) => (k.miktar === null ? '—' : miktarMetni(String(rezerveToplami(m.data.rezerveler, k.statuId)))) },
  ];
  const rezerveSutunlari: Sutun<Rezerve>[] = [
    { anahtar: 'statu', baslik: 'Statü', hucre: (r) => <Rozet>{statuAdi(r.statuId)}</Rozet> },
    { anahtar: 'emir', baslik: 'Üretim emri', mono: true, hucre: (r) => r.emirNo ?? `#${r.uretimEmriId}` },
    { anahtar: 'miktar', baslik: 'Ayrılan', hizala: 'sag', hucre: (r) => <strong>{miktarMetni(r.miktar)}</strong> },
    ...(ayirabilir ? [{ anahtar: 'eylem', baslik: '', hucre: (r: Rezerve) => <Dugme simge="x" onClick={() => setIslem({ tur: 'rezerve-kaldir', r })}>Rezerveyi kaldır</Dugme> }] : []),
  ];
  const bekleyenSutunlari: Sutun<MalzemeAyrintiCevabi['bekleyenler'][number]>[] = [
    { anahtar: 'sira', baslik: 'Sıra', hizala: 'sag', hucre: (e) => String(m.data.bekleyenler.indexOf(e) + 1) },
    { anahtar: 'emir', baslik: 'Üretim emri', mono: true, hucre: (e) => e.emirNo },
    { anahtar: 'miktar', baslik: 'Bekliyor', hizala: 'sag', hucre: (e) => <strong>{miktarMetni(e.miktar)}</strong> },
  ];
  const rezerveVar = statuluVar || m.data.rezerveler.length > 0 || m.data.bekleyenler.length > 0;
  const sutunlar: Sutun<BakiyeSatiri>[] = [
    { anahtar: 'konum', baslik: 'Konum', mono: true, hucre: (b) => <Link to={`/stok/konumlar/${b.konumId}`}>{b.konumKod}</Link> },
    { anahtar: 'zemin', baslik: 'Zemin', mono: true, hucre: (b) => b.zemin ?? '—' },
    ...(statuluVar ? [{ anahtar: 'statu', baslik: 'Statü', hucre: (b: BakiyeSatiri) => (b.statuId === null ? 'Serbest' : <Rozet>{statuAdi(b.statuId)}</Rozet>) }] : []),
    { anahtar: 'parti', baslik: 'Parti', hucre: (b) => <>{b.partiId === null ? 'Parti bilinmiyor' : <Link to={`/stok/hareketler?partiId=${b.partiId}`}>{b.partiEtiketi}</Link>}<KaliteRozeti durum={b.kaliteDurumu} /></> },
    { anahtar: 'giris', baslik: 'İlk giriş', kirilmaz: true, hucre: (b) => zamanMetni(b.ilkGiris) },
    { anahtar: 'ambalaj', baslik: 'Ambalaj', hucre: (b) => (b.ambalaj ? <span className="tc-stok-ambalaj-hucre"><AmbalajIkonu tur={b.ambalaj.tur} />{`${b.ambalaj.olcu}${b.ambalaj.adet ? ` × ${b.ambalaj.adet}` : ''}`}</span> : '—') },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (b) => <strong className={b.miktar.startsWith('-') ? 'tc-stok-eksi' : ''}>{miktarMetni(b.miktar)}</strong> },
    { anahtar: 'eylem', baslik: '', hucre: (b) => (b.statuId !== null || (b.kaliteDurumu ?? 'serbest') !== 'serbest' ? <span /> :
      <span className="tc-stok-dugmeler">
        {tasiyabilir && <Dugme onClick={() => setIslem({ tur: 'tasima', b })}>Taşı</Dugme>}
        {cikabilir && <Dugme onClick={() => setIslem({ tur: 'cikis', b })}>Çıkış</Dugme>}
        {sepetYetkisi && !b.miktar.startsWith('-') && <Dugme onClick={() => setIslem({ tur: 'sepet', konumId: b.konumId })}>Sepete</Dugme>}
      </span>
    ) },
  ];
  return (
    <section className="tc-stok">
      <SayfaBasi baslik={s.ad ?? `Kart ${s.malzemeId}`}
        alt={<>{s.stokKodu ?? `no ${s.malzemeId}`} · {s.tur ? MALZEME_TURU[s.tur] : '—'} · <strong>{birimliMiktar(s.toplam, s.birim)}</strong> <Rozet ton={DURUM_ETIKETI[s.durum].ton}>{DURUM_ETIKETI[s.durum].etiket}</Rozet></>}
        sag={<>
          {girebilir && (s.tur === 'mamul' || s.tur === 'yarimamul') && <Dugme tur="birincil" onClick={() => setIslem({ tur: 'uretim' })}>Üretimden giriş</Dugme>}
          {sepetYetkisi && <Dugme simge="box" onClick={() => setIslem({ tur: 'sepet' })}>Sepete ekle</Dugme>}
          <Dugme simge="scan" onClick={() => setIslem({ tur: 'etiket' })}>QR etiketi</Dugme>
          {tanimlar && <Dugme simge="tool" onClick={() => setIslem({ tur: 'ayar' })}>Stok ayarı</Dugme>}
        </>} />
      <Kart baslik="Bakiye satırları"><Tablo etiket="Bakiye satırları" sutunlar={sutunlar} satirlar={m.data.bakiyeler} satirAnahtari={(b) => b.id} bosMesaj="Bu malzemenin stoğu yok." /></Kart>
      {statuluVar && <Kart baslik="Statü kırılımı"><Tablo etiket="Statü kırılımı" sutunlar={kirilimSutunlari} satirlar={kirilim} satirAnahtari={(k) => k.statuId ?? 0} /></Kart>}
      {rezerveVar && (
        <Kart baslik="Rezerve" sag={ayirabilir ? <Dugme simge="lock" onClick={() => setIslem({ tur: 'rezerve-et' })}>Rezerve et</Dugme> : undefined}>
          <p className="tc-stok-not">Emir açılırken ya da statüye geçerken ayrılan malzeme yalnız o emirde kullanılır. Emir kapanınca ya da iptal edilince ayrılan kalkar.</p>
          <Tablo etiket="Rezerve" sutunlar={rezerveSutunlari} satirlar={m.data.rezerveler} satirAnahtari={(r) => `${r.statuId}-${r.uretimEmriId}`} bosMesaj="Bu malzemede emre ayrılmış stok yok." />
          {m.data.bekleyenler.length > 0 && <Tablo etiket="Malzeme bekleyen emirler" sutunlar={bekleyenSutunlari} satirlar={m.data.bekleyenler} satirAnahtari={(e) => e.uretimEmriId} />}
        </Kart>
      )}
      <Kart baslik="Çıkış önerisi">
        <div className="tc-stok-iki"><Girdi etiket="Ne kadar çıkacak?" inputMode="decimal" value={oneriMiktari} onChange={(e) => setOneriMiktari(e.target.value)} ipucu="Sistem en eski girişi önerir; başka göz seçebilirsiniz." /></div>
        {oneri.data?.veriYetersiz && <p className="tc-stok-not">Veri yetersiz: kullanılabilir bakiye yok.</p>}
        {oneri.data && !oneri.data.veriYetersiz && (
          <ul className="tc-stok-oneri">
            {oneri.data.oneriler.map((o) => <li key={o.bakiyeId}><span className="tc-stok-mono">{o.konumKod}</span> {o.partiEtiketi ?? ''} <strong>{miktarMetni(o.miktar)}</strong></li>)}
            {!oneri.data.yeterli && <li className="tc-stok-eksi">Yetmiyor: mevcut {miktarMetni(oneri.data.mevcut)}</li>}
          </ul>
        )}
      </Kart>
      <SonPartiler malzemeId={id} />
      <Kart baslik="Son hareketler" sag={<Link to={`/stok/hareketler?malzemeId=${id}`}>Tümü</Link>}><HareketTablosu satirlar={m.data.sonHareketler} /></Kart>
      {islem?.tur === 'rezerve-et' && <RezerveEtFormu malzemeId={id} statuler={m.data.statuKirilimi.flatMap((k) => (k.statuId === null ? [] : [k.statuId]))} kapat={() => setIslem(null)} />}
      {islem?.tur === 'rezerve-kaldir' && <RezerveKaldirFormu malzemeId={id} r={islem.r} kapat={() => setIslem(null)} />}
      {islem?.tur === 'cikis' && <CikisFormu b={islem.b} kapat={() => setIslem(null)} />}
      {islem?.tur === 'tasima' && <TasimaFormu b={islem.b} kapat={() => setIslem(null)} />}
      {islem?.tur === 'uretim' && <UretimGirisiFormu malzemeId={id} kapat={() => setIslem(null)} />}
      {islem?.tur === 'etiket' && <EtiketPenceresi baslik="Malzeme etiketi" kapat={() => setIslem(null)} ogeler={[{ tur: 'malzeme', no: id, ad: s.ad ?? `Kart ${id}`, kod: s.stokKodu ?? '' }]} />}
      {islem?.tur === 'ayar' && <AyarFormu id={id} ayar={m.data.ayar} kapat={() => setIslem(null)} />}
      {islem?.tur === 'sepet' && <SepeteEklePenceresi malzemeId={id} ad={s.ad ?? `Kart ${id}`} bakiyeler={serbestBakiyeler} {...(islem.konumId ? { kaynakKonumId: islem.konumId } : {})} kapat={() => setIslem(null)} />}
    </section>
  );
}
