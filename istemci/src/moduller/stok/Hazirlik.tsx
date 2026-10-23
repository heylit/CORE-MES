import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type {
  AdimToplaGovdesi, CikisOnerisiCevabi, IstekTeslimGovdesi, LotBekleyenKartlarCevabi, MalzemeIstegi, MalzemeIstegiDurumu, MalzemeIstekleriCevabi, TeslimGonderGovdesi, TeslimKutusuCevabi, ToplamaAcGovdesi,
  ToplamaAyrintiCevabi, ToplamaKapatGovdesi, ToplamalarCevabi, YerdekiStokCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Sayfalama, Secim, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { belirsizMiktarVar, birimliMiktar, ISTEK_ACIK as ACIK, ISTEK_DURUMU, istekDurumu, miktarGirdisi, miktarMetni, zamanMetni } from './gorunum.ts';
import { RefakatKartPenceresi } from './RefakatKarti.tsx';
import { KonumSecici, type KonumSecimi } from './KonumSecici.tsx';
import { MalzemeSecici } from './MalzemeSecici.tsx';
import { hataMetni, korumaliPost, SayfaBasi, useIslem, useStokKomutu } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';
import './stok.css';

// Hazırlık: üretimden gelen malzeme istekleri ile toplama listeleri tek ekranda. Depocu istekleri seçip bir liste açar; liste
// en eski girişli gözlerden raf sırasıyla toplanır ve toplanan teslim yerine taşınır. Tek istek listesiz de teslim edilebilir.
type Suzgec = '' | MalzemeIstegiDurumu;
const SEKMELER: { anahtar: Suzgec; baslik: string }[] = [
  ...(['acik', 'stok_yok', 'hazirlaniyor', 'teslim', 'iptal'] as const).map((d) => ({ anahtar: d, baslik: ISTEK_DURUMU[d].etiket })),
  { anahtar: '', baslik: 'Tümü' },
];
const LISTE_DURUMU = { topluyor: { etiket: 'Topluyor', ton: 'bilgi' }, bitti: { etiket: 'Bitti', ton: 'tamam' }, iptal: { etiket: 'İptal', ton: 'pasif' } } as const;

type Hedef = { tur: 'istasyon'; istasyonId: string } | { tur: 'konum'; konum: KonumSecimi | null } | { tur: 'sevk' };
const hedefGovdesi = (h: Hedef): ToplamaAcGovdesi['hedef'] =>
  h.tur === 'istasyon' ? (h.istasyonId ? { istasyonId: Number(h.istasyonId) } : null) : h.tur === 'konum' ? (h.konum ? { konumId: h.konum.id } : null) : null;
const hedefHazir = (h: Hedef) => h.tur === 'sevk' || hedefGovdesi(h) !== null;

// Toplananın gideceği yer: istasyon (istasyonun stok konumu), depo içi bir konum ya da sevkiyat (stoktan düşer).
function HedefSecimi({ deger, degistir, sevkOlur }: { deger: Hedef; degistir: (h: Hedef) => void; sevkOlur: boolean }) {
  const kutu = useQuery({ queryKey: anahtarlar.liste('teslim-kutusu', {}), queryFn: () => api.get<TeslimKutusuCevabi>('/stok/teslim-kutusu') });
  const turler = [
    { tur: 'istasyon', baslik: 'İstasyona', alt: 'Tezgahın stok konumuna taşınır' },
    { tur: 'konum', baslik: 'Konuma', alt: 'Raf gözü, zemin, kabul' },
    ...(sevkOlur ? [{ tur: 'sevk', baslik: 'Sevk çıkışı', alt: 'Toplanan stoktan düşer' }] : []),
  ] as const;
  return (
    <div className="tc-stok-form">
      <div className="tc-stok-ambalajlar" role="group" aria-label="Teslim yeri türü">
        {turler.map((t) => (
          <button key={t.tur} type="button" className="tc-stok-ambalaj" aria-pressed={deger.tur === t.tur}
            onClick={() => degistir(t.tur === 'istasyon' ? { tur: 'istasyon', istasyonId: '' } : t.tur === 'konum' ? { tur: 'konum', konum: null } : { tur: 'sevk' })}>
            <strong>{t.baslik}</strong><span>{t.alt}</span>
          </button>
        ))}
      </div>
      {deger.tur === 'istasyon' && <Secim etiket="İstasyon" bosSecenek="Seçin" value={deger.istasyonId} onChange={(e) => degistir({ tur: 'istasyon', istasyonId: e.target.value })}
        secenekler={(kutu.data?.hedefIstasyonlar ?? []).map((i) => ({ deger: String(i.id), baslik: `${i.ad} (${i.kod})` }))} required />}
      {deger.tur === 'konum' && <KonumSecici etiket="Konum" deger={deger.konum} degistir={(konum) => degistir({ tur: 'konum', konum })} zorunlu />}
    </div>
  );
}

function ListeAcPenceresi({ istekler, kapat }: { istekler: MalzemeIstegi[]; kapat: () => void }) {
  const yonlendir = useNavigate();
  const istasyonlar = [...new Set(istekler.map((i) => i.istasyonId))];
  const tekIstasyon = istasyonlar.length === 1 && istasyonlar[0] !== null ? istasyonlar[0]! : null;
  const [ad, setAd] = useState(tekIstasyon !== null ? `${istekler[0]!.istasyonAd ?? 'İstasyon'} hazırlığı` : `${istekler.length} istek`);
  const [hedef, setHedef] = useState<Hedef>(tekIstasyon !== null ? { tur: 'istasyon', istasyonId: String(tekIstasyon) } : { tur: 'konum', konum: null });
  const { komut, onayPenceresi } = useStokKomutu((g: ToplamaAcGovdesi) => korumaliPost<ToplamaAyrintiCevabi>('/stok/toplamalar', g).then((c) => { kapat(); void yonlendir(`/stok/hazirlik/${c.toplama.id}`); return c; }), 'Hazırlık listesi açıldı.');
  return (
    <Pencere acik kapat={kapat} baslik={`${istekler.length} istek için liste`} tur="yan"
      alt={<Dugme tur="birincil" disabled={!ad.trim() || !hedefHazir(hedef)} yukleniyor={komut.isPending} onClick={() => komut.mutate({ ad, istekIdler: istekler.map((i) => i.id), hedef: hedefGovdesi(hedef) })}>Listeyi aç</Dugme>}>
      <div className="tc-stok-form">
        <ul className="tc-stok-satirlar">
          {istekler.map((i) => <li key={i.id}><strong className="tc-stok-mono">{i.no}</strong><span className="tc-stok-not">{i.malzemeAd ?? `Kart ${i.malzemeId}`} · {miktarMetni(i.miktar)} · {i.istasyonAd ?? i.kisiAd ?? '—'}</span></li>)}
        </ul>
        <Girdi etiket="Liste adı" value={ad} onChange={(e) => setAd(e.target.value)} required />
        <HedefSecimi deger={hedef} degistir={setHedef} sevkOlur={false} />
        <p className="tc-stok-not">Aynı malzemenin istekleri tek kalemde toplanır. Liste bitince toplanan isteklere açılış sırasıyla dağıtılır; karşılanmayan istek açık kalır.</p>
      </div>
      {onayPenceresi}
    </Pencere>
  );
}

function YeniListePenceresi({ kapat }: { kapat: () => void }) {
  const yonlendir = useNavigate();
  const [ad, setAd] = useState('');
  const [hedef, setHedef] = useState<Hedef>({ tur: 'sevk' });
  const [kalemler, setKalemler] = useState([{ k: 1, kart: '', miktar: '' }]);
  const { komut, onayPenceresi } = useStokKomutu((g: ToplamaAcGovdesi) => korumaliPost<ToplamaAyrintiCevabi>('/stok/toplamalar', g).then((c) => { kapat(); void yonlendir(`/stok/hazirlik/${c.toplama.id}`); return c; }), 'Hazırlık listesi açıldı.');
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    komut.mutate({ ad, hedef: hedefGovdesi(hedef), kalemler: kalemler.filter((x) => x.kart).map((x) => ({ malzemeId: Number(x.kart), miktar: miktarGirdisi(x.miktar) })) });
  };
  return (
    <Pencere acik kapat={kapat} baslik="Yeni liste" tur="yan">
      <form className="tc-stok-form" onSubmit={gonder}>
        <Girdi etiket="Liste adı" placeholder="Örn. Sipariş 7781, hat 2" value={ad} onChange={(e) => setAd(e.target.value)} required />
        {kalemler.map((x) => (
          <div key={x.k} className="tc-stok-iki">
            <MalzemeSecici etiket="Malzeme" deger={x.kart} degistir={(kart) => setKalemler((l) => l.map((y) => (y.k === x.k ? { ...y, kart } : y)))} />
            <Girdi etiket="Miktar" inputMode="decimal" value={x.miktar} onChange={(e) => setKalemler((l) => l.map((y) => (y.k === x.k ? { ...y, miktar: e.target.value } : y)))} />
          </div>
        ))}
        <Dugme tur="ikincil" simge="plus" onClick={() => setKalemler((l) => [...l, { k: Math.max(...l.map((y) => y.k)) + 1, kart: '', miktar: '' }])}>Kalem ekle</Dugme>
        <HedefSecimi deger={hedef} degistir={setHedef} sevkOlur />
        <div className="tc-stok-sag"><Dugme tur="birincil" type="submit" disabled={!hedefHazir(hedef)} yukleniyor={komut.isPending}>Listeyi aç ve rotayı çıkar</Dugme></div>
        <p className="tc-stok-not">Her kalem en eski girişli gözlerden ayrılır ve adımlar raf sırasıyla, koridorda yılan düzeninde dizilir.</p>
      </form>
      {onayPenceresi}
    </Pencere>
  );
}

// Kaynak göz ve parti: uzun konum listesi yerine kod ya da adla arama; o gözde istenen malzemenin serbest satırları seçilir.
// Konum boş açılmaz: en eski girişli konum önerilir (çıkış önerisi), tek parti satırı kendiliğinden seçilir; kullanıcı konumu bırakırsa öneri yeniden kurulmaz.
// Seçim satırın sırasıyla değil parti ve statüsüyle tutulur: liste yeniden gelip sırası değişse de seçilen parti değişmez.
const kaynakAnahtari = (r: YerdekiStokCevabi['satirlar'][number]): string => `${r.partiId ?? '-'}:${r.statuId ?? '-'}`;
function KaynakSecimi({ malzemeId, istenen, konum, setKonum, satir, setSatir, denendi }: { malzemeId: number; istenen: string; konum: KonumSecimi | null; setKonum: (k: KonumSecimi | null) => void; satir: string; setSatir: (s: string) => void; denendi: boolean }) {
  const statuAdi = useStatuAdi();
  const onerildi = useRef(false);
  const oneri = useQuery({
    queryKey: anahtarlar.liste('cikis-onerisi', { malzemeId, istenen }),
    queryFn: () => api.get<CikisOnerisiCevabi>(`/stok/malzemeler/${malzemeId}/cikis-onerisi?miktar=${encodeURIComponent(istenen)}`),
    retry: false,
  });
  useEffect(() => {
    const ilk = oneri.data?.oneriler[0];
    if (onerildi.current || ilk === undefined) return;
    onerildi.current = true;
    if (konum === null) setKonum({ id: ilk.konumId, etiket: ilk.konumKod });
  }, [oneri.data, konum, setKonum]);
  const yerdeki = useQuery({
    queryKey: anahtarlar.liste('yerdeki-stok', { konum: konum?.id }),
    queryFn: () => api.get<YerdekiStokCevabi>(`/stok/teslim-kutusu/yerdeki-stok?konumId=${konum!.id}`),
    enabled: konum !== null,
  });
  const satirlar = (yerdeki.data?.satirlar ?? []).filter((r) => r.malzemeId === malzemeId);
  const tekAnahtar = satirlar.length === 1 ? kaynakAnahtari(satirlar[0]!) : null;
  useEffect(() => { if (tekAnahtar !== null && satir === '') setSatir(tekAnahtar); }, [tekAnahtar, satir, setSatir]);
  return (
    <>
      <KonumSecici etiket="Hangi konumdan" deger={konum} degistir={(k) => { setKonum(k); setSatir(''); }} zorunlu hata={denendi && konum === null ? 'Teslimin çıkacağı konumu seçin.' : undefined} />
      {konum !== null && (yerdeki.isPending ? <DurumKutusu durum="yukleniyor" />
        : yerdeki.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(yerdeki.error)} />
        : satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu konumda istenen malzeme yok" />
        : <Secim etiket="Parti ve statü" bosSecenek="Seçin" value={satir} onChange={(o) => setSatir(o.target.value)} required
            hata={denendi && satir === '' ? 'Parti ve statüyü seçin.' : undefined}
            secenekler={satirlar.map((r) => ({ deger: kaynakAnahtari(r), baslik: `${miktarMetni(r.miktar)} · ${statuAdi(r.statuId)}${r.partiEtiketi ? ` · ${r.partiEtiketi}` : ''}` }))} />)}
    </>
  );
}
function useKaynakSatiri(malzemeId: number, konum: KonumSecimi | null, satir: string) {
  const yerdeki = useQuery({
    queryKey: anahtarlar.liste('yerdeki-stok', { konum: konum?.id }),
    queryFn: () => api.get<YerdekiStokCevabi>(`/stok/teslim-kutusu/yerdeki-stok?konumId=${konum!.id}`),
    enabled: konum !== null,
  });
  return satir === '' ? undefined : (yerdeki.data?.satirlar ?? []).find((r) => r.malzemeId === malzemeId && kaynakAnahtari(r) === satir);
}

// İstenenden fazla verilebilir (kullanıcı kararı "Uyarıyla izin", kart #1413): veren uyarılır, sunucu kayda yazar.
function IstenenFazlaNotu({ istenen, girilen }: { istenen: string; girilen: string }) {
  const g = Number(miktarGirdisi(girilen));
  if (!Number.isFinite(g) || g <= Number(istenen)) return null;
  return <p className="tc-stok-not" role="status">İstenenden ({miktarMetni(istenen)}) fazla; teslim kaydına "istenenden fazla" yazılır.</p>;
}

// İstasyonsuz istek kişiye verilir: malzeme kişinin bulunduğu istasyona taşınır ve istek kapanır.
function KisiyeTeslim({ istek, kapat }: { istek: MalzemeIstegi; kapat: () => void }) {
  const [konum, setKonum] = useState<KonumSecimi | null>(null);
  const [satir, setSatir] = useState('');
  const [istasyon, setIstasyon] = useState('');
  const [miktar, setMiktar] = useState(miktarMetni(istek.miktar).replace(/\./g, ''));
  const kutu = useQuery({ queryKey: anahtarlar.liste('teslim-kutusu', {}), queryFn: () => api.get<TeslimKutusuCevabi>('/stok/teslim-kutusu') });
  const [denendi, setDenendi] = useState(false);
  const s = useKaynakSatiri(istek.malzemeId, konum, satir);
  const teslim = useStokKomutu((g: IstekTeslimGovdesi) => api.post(`/stok/malzeme-istekleri/${istek.id}/teslim-et`, g), `${istek.no} teslim edildi; malzeme istasyona taşındı.`, kapat);
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    setDenendi(true);
    if (s === undefined || konum === null || miktar.trim() === '') return;
    teslim.komut.mutate({ surum: istek.surum, karsilanan: miktarGirdisi(miktar), kaynakKonumId: konum.id, partiId: s.partiId, statuId: s.statuId, istasyonId: istasyon === '' ? null : Number(istasyon) });
  };
  return (
    <Pencere acik kapat={kapat} baslik={`${istek.no} · kişiye teslim`}>
      <form className="tc-stok-form" onSubmit={gonder} noValidate>
        <p className="tc-stok-not">{istek.malzemeAd ?? `Kart ${istek.malzemeId}`} · {istek.kisiAd ?? '—'}. Malzeme kişinin bulunduğu istasyona taşınır.</p>
        <KaynakSecimi malzemeId={istek.malzemeId} istenen={istek.miktar} konum={konum} setKonum={setKonum} satir={satir} setSatir={setSatir} denendi={denendi} />
        <Secim etiket="Hangi istasyona" bosSecenek="Kişinin bulunduğu istasyon" value={istasyon} onChange={(o) => setIstasyon(o.target.value)}
          secenekler={(kutu.data?.hedefIstasyonlar ?? []).map((i) => ({ deger: String(i.id), baslik: `${i.ad} (${i.kod})` }))} />
        <Girdi etiket="Verilen miktar" inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} required hata={denendi && miktar.trim() === '' ? 'Miktarı girin.' : undefined} />
        <IstenenFazlaNotu istenen={istek.miktar} girilen={miktar} />
        <div className="tc-stok-sag"><Dugme tur="birincil" type="submit" simge="check" yukleniyor={teslim.komut.isPending}>Teslim edildi</Dugme></div>
      </form>
      {teslim.onayPenceresi}
    </Pencere>
  );
}

// İstasyona giden istek teslimle karşılanır; istasyon teslim alınca stok taşınır ve istek kapanır.
function IstasyonaTeslim({ istek, istasyonId, kapat }: { istek: MalzemeIstegi; istasyonId: number; kapat: () => void }) {
  const [konum, setKonum] = useState<KonumSecimi | null>(null);
  const [satir, setSatir] = useState('');
  const [miktar, setMiktar] = useState(miktarMetni(istek.miktar).replace(/\./g, ''));
  const [kimlik] = useState(yeniIstekKimligi);
  const [denendi, setDenendi] = useState(false);
  const s = useKaynakSatiri(istek.malzemeId, konum, satir);
  const gonderKomutu = useStokKomutu((g: TeslimGonderGovdesi) => korumaliPost('/stok/teslimler/gonder', g), `${istek.no} için teslim gönderildi; istasyon alınca kapanır.`, kapat);
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    setDenendi(true);
    if (s === undefined || konum === null || miktar.trim() === '') return;
    gonderKomutu.komut.mutate({
      malzemeId: istek.malzemeId, miktar: miktarGirdisi(miktar), partiId: s.partiId, statuId: s.statuId, kaynak: { konumId: konum.id },
      hedef: { istasyonId }, istekId: istek.id, not: null, kaynakKimligi: kimlik,
    });
  };
  return (
    <Pencere acik kapat={kapat} baslik={`${istek.no} · ${istek.istasyonAd ?? 'istasyona'} teslim`}>
      <form className="tc-stok-form" onSubmit={gonder} noValidate>
        <p className="tc-stok-not">{istek.malzemeAd ?? `Kart ${istek.malzemeId}`} · istenen {miktarMetni(istek.miktar)}</p>
        <KaynakSecimi malzemeId={istek.malzemeId} istenen={istek.miktar} konum={konum} setKonum={setKonum} satir={satir} setSatir={setSatir} denendi={denendi} />
        <Girdi etiket="Gönderilen miktar" inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} required hata={denendi && miktar.trim() === '' ? 'Miktarı girin.' : undefined} />
        <IstenenFazlaNotu istenen={istek.miktar} girilen={miktar} />
        <div className="tc-stok-sag"><Dugme tur="birincil" type="submit" simge="truck" yukleniyor={gonderKomutu.komut.isPending}>Teslim et</Dugme></div>
      </form>
      {gonderKomutu.onayPenceresi}
    </Pencere>
  );
}

function Istekler() {
  const yazabilir = useIslem('stok.transfer');
  const [durum, setDurum] = useState<Suzgec>('acik');
  const [sayfa, setSayfa] = useState(1);
  const [secim, setSecim] = useState<Record<number, MalzemeIstegi>>({});
  const [liste, setListe] = useState(false);
  const [teslim, setTeslim] = useState<MalzemeIstegi | null>(null);
  const sorgu = new URLSearchParams({ sayfa: String(sayfa), ...(durum === '' ? {} : { durum }) });
  const l = useQuery({ queryKey: anahtarlar.liste('malzeme-istekleri', { durum, sayfa }), queryFn: () => api.get<MalzemeIstekleriCevabi>(`/stok/malzeme-istekleri?${sorgu}`) });
  const iptal = useStokKomutu((g: { id: number; surum: number }) => api.post(`/stok/malzeme-istekleri/${g.id}/iptal-et`, { surum: g.surum }), 'İstek iptal edildi.');
  const secilebilir = (i: MalzemeIstegi) => yazabilir && ACIK.includes(i.durum) && i.toplamaId === null && !i.yoldaTeslim;
  const secililer = Object.values(secim);
  const degistir = (i: MalzemeIstegi) => setSecim((s) => { const y = { ...s }; if (y[i.id]) delete y[i.id]; else y[i.id] = i; return y; });
  const sutunlar: Sutun<MalzemeIstegi>[] = [
    ...(yazabilir ? [{ anahtar: 'sec', baslik: '', hucre: (i: MalzemeIstegi) => (secilebilir(i)
      ? <input type="checkbox" aria-label={`${i.no} seç`} checked={secim[i.id] !== undefined} onChange={() => degistir(i)} /> : <span />) }] : []),
    { anahtar: 'no', baslik: 'İstek', mono: true, kirilmaz: true, hucre: (i) => i.no },
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (i) => <span className="tc-stok-ad"><strong>{i.malzemeAd ?? `Kart ${i.malzemeId}`}</strong>{i.aciklama && <span>{i.aciklama}</span>}</span> },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (i) => <>{miktarMetni(i.miktar)}{i.karsilanan !== null && <span className="tc-stok-not"> / {miktarMetni(i.karsilanan)}</span>}</> },
    { anahtar: 'yer', baslik: 'Nereye', hucre: (i) => i.istasyonAd ?? `${i.kisiAd ?? '—'} (kişiye)` },
    { anahtar: 'kim', baslik: 'İsteyen', hucre: (i) => <span className="tc-stok-ad"><span>{i.kisiAd ?? '—'}</span><span>{zamanMetni(i.acilis)}</span></span> },
    { anahtar: 'durum', baslik: 'Durum', hucre: (i) => <span className="tc-stok-dugmeler">
      <Rozet ton={istekDurumu(i).ton}>{istekDurumu(i).etiket}</Rozet>
      {i.toplamaId !== null && <Link to={`/stok/hazirlik/${i.toplamaId}`}>{i.toplamaNo}</Link>}</span> },
    ...(yazabilir ? [{
      anahtar: 'eylem', baslik: '', hucre: (i: MalzemeIstegi) => (secilebilir(i) ? (
        <span className="tc-stok-dugmeler">
          <Dugme simge="truck" onClick={() => setTeslim(i)}>Teslim et</Dugme>
          <Dugme tur="tehlike" onClick={() => iptal.komut.mutate({ id: i.id, surum: i.surum })}>İptal</Dugme>
        </span>
      ) : <span />),
    }] : []),
  ];
  return (
    <Kart baslik="Malzeme istekleri">
      <div className="tc-stok-form">
        <Sekmeler etiket="Durum" sekmeler={SEKMELER} secili={durum} sec={(d) => { setDurum(d); setSayfa(1); setSecim({}); }} />
        {secililer.length > 0 && (
          <div className="tc-stok-eylem">
            <span className="tc-stok-not"><strong>{secililer.length}</strong> istek seçildi</span>
            <Dugme tur="birincil" simge="list" onClick={() => setListe(true)}>Liste aç</Dugme>
            <Dugme tur="ikincil" onClick={() => setSecim({})}>Seçimi bırak</Dugme>
          </div>
        )}
        {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />
          : l.isPending ? <DurumKutusu durum="yukleniyor" />
          : <Tablo etiket="Malzeme istekleri" sutunlar={sutunlar} satirlar={l.data.satirlar} satirAnahtari={(i) => i.id} bosMesaj="Bu durumda istek yok." />}
        {l.data && l.data.satirlar.length > 0 && <Sayfalama sayfa={l.data.sayfa} sayfaBoyu={l.data.sayfaBoyu} toplam={l.data.toplam} degistir={setSayfa} satirSayisi={l.data.satirlar.length} />}
      </div>
      {liste && <ListeAcPenceresi istekler={secililer} kapat={() => { setListe(false); setSecim({}); }} />}
      {teslim && (teslim.istasyonId === null
        ? <KisiyeTeslim istek={teslim} kapat={() => setTeslim(null)} />
        : <IstasyonaTeslim istek={teslim} istasyonId={teslim.istasyonId} kapat={() => setTeslim(null)} />)}
      {iptal.onayPenceresi}
    </Kart>
  );
}

function Listeler() {
  const yetkili = useIslem('stok.toplama');
  const [yeni, setYeni] = useState(false);
  const l = useQuery({ queryKey: anahtarlar.liste('toplamalar', {}), queryFn: () => api.get<ToplamalarCevabi>('/stok/toplamalar?sayfaBoyu=20') });
  return (
    <Kart baslik="Listeler">
      <div className="tc-stok-form">
        {yetkili && <div className="tc-stok-eylem"><Dugme tur="ikincil" simge="plus" onClick={() => setYeni(true)}>Yeni liste</Dugme></div>}
        {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} /> : (
          <Tablo etiket="Hazırlık listeleri" satirlar={l.data?.satirlar ?? []} satirAnahtari={(t) => t.id} mesgul={l.isPending} bosMesaj="Henüz liste yok."
            sutunlar={[
              { anahtar: 'no', baslik: 'Liste', mono: true, hucre: (t) => <Link to={`/stok/hazirlik/${t.id}`}>{t.no}</Link> },
              { anahtar: 'ad', baslik: 'Ad', hucre: (t) => t.ad },
              { anahtar: 'z', baslik: 'Açılış', hucre: (t) => zamanMetni(t.acilis) },
              { anahtar: 'i', baslik: 'İlerleme', hizala: 'sag', hucre: (t) => `${t.toplanan}/${t.adimSayisi}` },
              { anahtar: 'd', baslik: 'Durum', hucre: (t) => <><Rozet ton={LISTE_DURUMU[t.durum].ton}>{LISTE_DURUMU[t.durum].etiket}</Rozet>{t.eksikVar && <Rozet ton="uyari">Eksik</Rozet>}</> },
            ]} />
        )}
      </div>
      {yeni && <YeniListePenceresi kapat={() => setYeni(false)} />}
    </Kart>
  );
}

// Okutma isteğe bağlıdır: okunan kod göz koduyla ya da parti etiketiyle eşleşmezse adım toplanmaz.
const okunanKod = (k: string) => k.trim().toUpperCase().replace(/^LOC[:\s-]*/, '');
function okutmaUyar(okunan: string, konumKod: string, parti: string | null): boolean {
  const k = okunanKod(okunan);
  return k !== '' && k !== konumKod.toUpperCase() && !(parti !== null && parti.toUpperCase().includes(k));
}

function SiradakiAdim({ id, t }: { id: number; t: ToplamaAyrintiCevabi }) {
  const sira = t.adimlar.find((a) => !a.toplandi)!;
  const [miktar, setMiktar] = useState(miktarMetni(sira.miktar).replace(/\./g, ''));
  const [okunan, setOkunan] = useState('');
  const topla = useStokKomutu((g: AdimToplaGovdesi & { adimId: number }) => {
    const { adimId, ...govde } = g;
    return korumaliPost<ToplamaAyrintiCevabi>(`/stok/toplamalar/${id}/adimlar/${adimId}/topla`, govde).then((c) => { setOkunan(''); return c; });
  }, 'Toplandı.');
  const yanlis = okutmaUyar(okunan, sira.konumKod, sira.partiEtiketi);
  const m = miktarGirdisi(miktar);
  return (
    <Kart baslik={`Sıradaki adım ${sira.sira}`}>
      <div className="tc-stok-form">
        <div className="tc-stok-adim">
          <strong className="tc-stok-adim-konum tc-stok-mono">{sira.konumKod}</strong>
          <div><strong>{sira.malzemeAd ?? `Kart ${sira.malzemeId}`}</strong><p className="tc-stok-not">{sira.partiEtiketi ?? 'Parti bilinmiyor'}</p></div>
          <strong className="tc-stok-buyuk-miktar">{miktarMetni(sira.miktar)}</strong>
        </div>
        <div className="tc-stok-iki">
          <Girdi etiket="Okut (isteğe bağlı)" autoComplete="off" placeholder="Göz ya da lot" value={okunan} onChange={(e) => setOkunan(e.target.value)}
            ipucu={yanlis ? `Yanlış göz ya da lot: beklenen ${sira.konumKod}` : okunan.trim() ? 'Doğru göz.' : 'Okutursanız göz ya da lot denetlenir.'} />
          <Girdi etiket="Alınan miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} ipucu="Azı kısmi toplamadır; eksik listede görünür." />
        </div>
        {yanlis && <p className="tc-stok-bilgi tc-stok-bilgi-uyari">Okunan kod bu adımın gözüyle ya da lotuyla eşleşmiyor.</p>}
        <div className="tc-stok-sag">
          <Dugme tur="birincil" simge="check" disabled={yanlis || !(Number(m) > 0 || belirsizMiktarVar(m))} yukleniyor={topla.komut.isPending}
            onClick={() => topla.komut.mutate({ adimId: sira.id, surum: t.toplama.surum, ...(Number(m) !== Number(sira.miktar) ? { miktar: m } : {}) })}>Toplandı</Dugme>
        </div>
      </div>
      {topla.onayPenceresi}
    </Kart>
  );
}

function ListeAyrintisi({ id }: { id: number }) {
  const yetkili = useIslem('stok.toplama');
  const t = useQuery({ queryKey: anahtarlar.ayrinti('toplama', id), queryFn: () => api.get<ToplamaAyrintiCevabi>(`/stok/toplamalar/${id}`) });
  const kapat = useStokKomutu((g: ToplamaKapatGovdesi) => korumaliPost<ToplamaAyrintiCevabi>(`/stok/toplamalar/${id}/kapat`, g), 'Liste kapatıldı.');
  if (t.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (t.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(t.error)} yenile={() => void t.refetch()} />;
  const { toplama, adimlar, kalemler, hedef, istekler } = t.data;
  const sira = adimlar.find((a) => !a.toplandi);
  const acik = toplama.durum === 'topluyor';
  return (
    <section className="tc-stok">
      <SayfaBasi baslik={`Hazırlık ${toplama.no}`} alt={`${toplama.ad} · ${zamanMetni(toplama.acilis)} · ${toplama.kisiAd ?? '—'}`}
        sag={<>
          <Rozet ton={LISTE_DURUMU[toplama.durum].ton}>{LISTE_DURUMU[toplama.durum].etiket}</Rozet>
          {acik && yetkili && <Dugme tur="birincil" onClick={() => kapat.komut.mutate({ surum: toplama.surum, durum: 'bitti' })}>Bitir</Dugme>}
          {acik && yetkili && <Dugme onClick={() => kapat.komut.mutate({ surum: toplama.surum, durum: 'iptal' })}>İptal</Dugme>}
        </>} />
      <p className="tc-stok-not">Teslim yeri: <strong>{hedef ? (hedef.ad ? `${hedef.kod} · ${hedef.ad}` : hedef.kod) : 'Sevk çıkışı (toplanan stoktan düşer)'}</strong>
        <Link to="/stok/hazirlik"> · Hazırlığa dön</Link></p>
      <div className="tc-stok-ilerleme" role="progressbar" aria-valuemin={0} aria-valuemax={toplama.adimSayisi} aria-valuenow={toplama.toplanan} aria-label="Toplanan adım">
        <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="6" rx="3" className="tc-stok-cubuk-zemin" /><rect width={toplama.adimSayisi ? (toplama.toplanan / toplama.adimSayisi) * 100 : 0} height="6" rx="3" className="tc-stok-cubuk-dolu" /></svg>
        <span className="tc-stok-not">{toplama.toplanan} / {toplama.adimSayisi} adım</span>
      </div>
      {toplama.eksikVar && <p className="tc-stok-bilgi tc-stok-bilgi-uyari">Bazı kalemler depoda yetmedi: {kalemler.filter((k) => Number(k.eksik) > 0).map((k) => `${k.malzemeAd ?? `kart ${k.malzemeId}`} ${miktarMetni(k.eksik)} eksik`).join(', ')}. Eksik için göz uydurulmadı.</p>}
      {acik && sira && yetkili && <SiradakiAdim key={sira.id} id={id} t={t.data} />}
      {acik && !sira && <DurumKutusu durum="bos" mesaj="Bütün adımlar toplandı; listeyi bitirebilirsin." />}
      <Kart baslik="Rota">
        <Tablo etiket="Toplama adımları" satirlar={adimlar} satirAnahtari={(a) => a.id}
          sutunlar={[
            { anahtar: 's', baslik: '#', hizala: 'sag', hucre: (a) => a.sira },
            { anahtar: 'k', baslik: 'Konum', mono: true, hucre: (a) => <Link to={`/stok/konumlar/${a.konumId}`}>{a.konumKod}</Link> },
            { anahtar: 'm', baslik: 'Malzeme', hucre: (a) => a.malzemeAd ?? `Kart ${a.malzemeId}` },
            { anahtar: 'p', baslik: 'Parti', hucre: (a) => a.partiEtiketi ?? '—' },
            { anahtar: 'q', baslik: 'Miktar', hizala: 'sag', hucre: (a) => <strong>{a.toplanan !== null && a.toplanan !== a.miktar ? `${miktarMetni(a.toplanan)} / ` : ''}{miktarMetni(a.miktar)}</strong> },
            { anahtar: 'd', baslik: '', hucre: (a) => (a.toplandi ? <Rozet ton="tamam">Toplandı</Rozet> : a.id === sira?.id ? <Rozet ton="bilgi">Sırada</Rozet> : <span />) },
          ]} />
      </Kart>
      {istekler.length > 0 && (
        <Kart baslik="Karşılanan istekler">
          <ul className="tc-stok-satirlar">
            {istekler.map((i) => <li key={i.id}><strong className="tc-stok-mono">{i.no}</strong>
              <span className="tc-stok-not">{miktarMetni(i.miktar)}{i.karsilanan !== null ? ` · verilen ${miktarMetni(i.karsilanan)}` : ''} · {ISTEK_DURUMU[i.durum].etiket}</span></li>)}
          </ul>
          {acik && <p className="tc-stok-not">Liste bitince toplanan isteklere açılış sırasıyla dağıtılır; karşılanmayan istek açık kalır.</p>}
        </Kart>
      )}
      {kapat.onayPenceresi}
    </section>
  );
}

// Lot bekleyen kartlar (Soru 129): malzeme stokta yokken yapılan sayımın istisna kartları. Kart açılır, lota bağlanır ya da basılır.
function LotBekleyenKartlar() {
  const [acik, setAcik] = useState<number | null>(null);
  const l = useQuery({ queryKey: [...anahtarlar.hepsi, 'lot-bekleyen-kartlar'], queryFn: () => api.get<LotBekleyenKartlarCevabi>('/stok/lot-bekleyen-kartlar') });
  if (l.isPending || (l.isSuccess && l.data.kartlar.length === 0)) return null;
  type Satir = LotBekleyenKartlarCevabi['kartlar'][number];
  return (
    <Kart baslik="Lot bekleyen kartlar">
      {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /> : (
        <Tablo etiket="Lot bekleyen kartlar" satirlar={l.data.kartlar} satirAnahtari={(x: Satir) => x.refakat.id} bosMesaj="Lot bekleyen kart yok."
          sutunlar={[
            { anahtar: 'kart', baslik: 'Kart', mono: true, kirilmaz: true, hucre: (x: Satir) => x.refakat.etiket },
            { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (x: Satir) => x.refakat.malzemeAd ?? x.refakat.malzemeKod ?? `Kart ${x.refakat.malzemeId}` },
            { anahtar: 'bekleyen', baslik: 'Lotsuz düşülen', hizala: 'sag', hucre: (x: Satir) => birimliMiktar(x.bekleyen, x.refakat.birim) },
            { anahtar: 'zaman', baslik: 'Açıldı', hucre: (x: Satir) => zamanMetni(x.refakat.kayitZamani) },
            { anahtar: 'eylem', baslik: '', hucre: (x: Satir) => <Dugme simge="tag" onClick={() => setAcik(x.refakat.id)}>Aç</Dugme> },
          ]} />
      )}
      {acik !== null && <RefakatKartPenceresi id={acik} kapat={() => { setAcik(null); void l.refetch(); }} />}
    </Kart>
  );
}

export function Hazirlik() {
  const { id } = useParams();
  if (id) return <ListeAyrintisi id={Number(id)} />;
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Hazırlık" alt="Üretimden gelen istekler ve toplama listeleri tek yerde. İstekleri seç, liste aç, raf sırasıyla topla; toplanan teslim yerine taşınır." />
      <LotBekleyenKartlar />
      <Istekler />
      <Listeler />
    </section>
  );
}

// Eski yollar (sipariş toplama, malzeme istekleri) yer imlerinde kalmış olabilir.
export function EskiToplamaYolu() {
  const { id } = useParams();
  return <Navigate to={id ? `/stok/hazirlik/${id}` : '/stok/hazirlik'} replace />;
}
