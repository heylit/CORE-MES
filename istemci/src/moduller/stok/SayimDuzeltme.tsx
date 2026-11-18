// Sayım ve düzeltme (3417 a): göz sayımı, kartı sıfırlama, onay bekleyen farklar ve son düzeltmeler tek sayfada. Stok yalnız ikinci yetkilinin
// onayıyla değişir (eşik içindeki göz sayımı hariç); sıfırlama eşikten bağımsız her zaman onaya gider. Düzeltme yalnız sıfıradır; başka
// miktara düzeltme kör sayımla yapılır.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  KonumAyrintiCevabi, KonumlarCevabi, SayimCevabi, SayimGovdesi, SifirlamaAdaylariCevabi,
  SifirlamaCevabi, SifirlamaGovdesi, SifirlamaNedeni, SifirlamaSatiri, SonDuzeltmelerCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Sekmeler, Tablo, useBildirim, type Sekme, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarGirdisi, miktarMetni, SAYIM_KAYNAGI, SIFIRLAMA_NEDENI, zamanMetni } from './gorunum.ts';
import { MalzemeSecici, useMalzemeOzeti } from './MalzemeSecici.tsx';
import { hataMetni, korumaliPost, SayfaBasi, useIslem, useStokKomutu } from './ortak.tsx';
import { farkMetni, SayimOnayPaneli } from './SayimOnaylari.tsx';
import './stok.css';

type SekmeAnahtari = 'say' | 'sifirla' | 'onay' | 'gecmis';
const SEKMELER: readonly (Sekme<SekmeAnahtari> & { sayim: boolean })[] = [
  { anahtar: 'say', baslik: 'Göz say', simge: 'list', sayim: true },
  { anahtar: 'sifirla', baslik: 'Kartı sıfırla', simge: 'x', sayim: true },
  { anahtar: 'onay', baslik: 'Onay bekleyen', simge: 'check', sayim: false },
  { anahtar: 'gecmis', baslik: 'Son düzeltmeler', simge: 'clock', sayim: false },
];
// Sunucudaki sonDuzeltmelerSorgusu ile aynı dönemler (istemci sözleşmeden yalnız tip alır).
const SON_DUZELTME_GUNLERI = [7, 30, 90] as const;
const anahtar = (malzemeId: number, partiId: number | null) => `${malzemeId}:${partiId ?? ''}`;

export function SayimDuzeltme() {
  const sayabilir = useIslem('stok.sayim');
  const [parametre, setParametre] = useSearchParams();
  // Yetkiye göre sekme: sayım yetkisi olmayan (yalnız onaylayan) sayma ve sıfırlama sekmelerini görmez.
  const sekmeler = SEKMELER.filter((s) => sayabilir || !s.sayim);
  const istenen = parametre.get('sekme');
  const secili = sekmeler.find((s) => s.anahtar === istenen)?.anahtar ?? sekmeler[0]!.anahtar;
  const sec = (s: SekmeAnahtari) => setParametre((p) => { const y = new URLSearchParams(p); y.set('sekme', s); if (s !== 'sifirla') y.delete('malzeme'); return y; }, { replace: true });
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Sayım ve düzeltme" aciklama="Gözü sayın ya da kartın stoğunu sıfırlayın; fark ikinci yetkilinin onayıyla stoğa yazılır." />
      <Sekmeler etiket="Sayım ve düzeltme" sekmeler={sekmeler} secili={secili} sec={sec} />
      {secili === 'say' && <GozSay />}
      {secili === 'sifirla' && <KartiSifirla />}
      {secili === 'onay' && <SayimOnayPaneli />}
      {secili === 'gecmis' && <SonDuzeltmeler />}
    </section>
  );
}

// ---- Göz say: kör sayım (1279 a). Sistem miktarı çizilmez; sistemde satırı olmayan malzeme eklenebilir. -------------------------
interface SayimSatiri { malzemeId: number; malzemeAd: string; partiId: number | null; partiEtiketi: string | null; kayitYok: boolean }

function GozSay() {
  const { bildir } = useBildirim();
  const [konum, setKonum] = useState('');
  const [sayilan, setSayilan] = useState<Record<string, string>>({});
  const [ekler, setEkler] = useState<SayimSatiri[]>([]);
  const [eklenecek, setEklenecek] = useState('');
  const ozet = useMalzemeOzeti(eklenecek).data?.ozet;
  const konumlar = useQuery({ queryKey: anahtarlar.liste('konum-secimi-tum', {}), queryFn: () => api.get<KonumlarCevabi>('/stok/konumlar?sayfaBoyu=200') });
  const k = useQuery({ queryKey: anahtarlar.ayrinti('konum', Number(konum)), queryFn: () => api.get<KonumAyrintiCevabi>(`/stok/konumlar/${konum}`), enabled: konum !== '' });
  const temizle = () => { setSayilan({}); setEkler([]); setEklenecek(''); };
  const { komut } = useStokKomutu(async (g: SayimGovdesi) => {
    const c = await korumaliPost<SayimCevabi>('/stok/sayim', g);
    if (c.onayaGiden > 0) bildir('bilgi', `${c.onayaGiden} fark onaya gitti; ikinci yetkili onaylayınca stoğa yazılır.`);
    return c;
  }, 'Sayım kaydedildi.', temizle);
  // Sayım yalnız serbest stoğu sayar (STK-S3): statüdeki ya da kalitesi serbest olmayan satır sayıma girmez.
  const sistem: SayimSatiri[] = (k.data?.bakiyeler ?? []).filter((b) => b.statuId === null && (b.kaliteDurumu ?? 'serbest') === 'serbest')
    .map((b) => ({ malzemeId: b.malzemeId, malzemeAd: b.malzemeAd ?? `Kart ${b.malzemeId}`, partiId: b.partiId, partiEtiketi: b.partiEtiketi, kayitYok: false }));
  const satirlar = [...sistem, ...ekler];
  const ekle = () => {
    if (!ozet) return;
    if (satirlar.some((s) => anahtar(s.malzemeId, s.partiId) === anahtar(ozet.id, null))) { bildir('hata', 'Bu malzeme gözde zaten listede; miktarını o satıra yazın.'); return; }
    setEkler((l) => [...l, { malzemeId: ozet.id, malzemeAd: ozet.ad ?? ozet.kod, partiId: null, partiEtiketi: null, kayitYok: true }]);
    setEklenecek('');
  };
  const sutunlar: Sutun<SayimSatiri>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', sabit: 'sol', kes: true, hucre: (s) => <span>{s.malzemeAd} {s.kayitYok && <Rozet ton="bilgi">Kayıt yok</Rozet>}</span>, csv: (s) => s.malzemeAd },
    { anahtar: 'parti', baslik: 'Parti', kes: true, hucre: (s) => s.partiEtiketi ?? 'Parti bilinmiyor' },
    { anahtar: 'sayilan', baslik: 'Sayılan', hucre: (s) => (
      <Girdi etiket={`Sayılan ${s.malzemeAd}${s.partiEtiketi ? ` ${s.partiEtiketi}` : ''}`} inputMode="decimal" value={sayilan[anahtar(s.malzemeId, s.partiId)] ?? ''}
        onChange={(e) => setSayilan((x) => ({ ...x, [anahtar(s.malzemeId, s.partiId)]: e.target.value }))} />
    ) },
  ];
  const gonder = () => komut.mutate({
    konumId: Number(konum),
    satirlar: satirlar.filter((s) => (sayilan[anahtar(s.malzemeId, s.partiId)] ?? '') !== '')
      .map((s) => ({ malzemeId: s.malzemeId, partiId: s.partiId, sayilanMiktar: miktarGirdisi(sayilan[anahtar(s.malzemeId, s.partiId)] ?? '') })),
  });
  const girilen = satirlar.filter((s) => (sayilan[anahtar(s.malzemeId, s.partiId)] ?? '') !== '').length;
  const secenekler = (konumlar.data?.satirlar ?? []).map((x) => ({ deger: String(x.id), baslik: `${x.depoKod} · ${x.kod}${x.ad ? ` · ${x.ad}` : ''}` }));
  return (
    <Kart baslik="Göz say" sag={<Link to="/stok/okutarak-sayim"><Dugme simge="scan">Okutarak say</Dugme></Link>}>
      <div className="tc-stok-form">
        <Secim etiket="Göz" value={konum} onChange={(e) => { setKonum(e.target.value); temizle(); }} secenekler={secenekler} bosSecenek="Göz seçin" />
        {k.data && <p className="tc-stok-not">Son sayım {zamanMetni(k.data.konum.sonSayim)} · Kör sayım: sistem miktarı gösterilmez.</p>}
      </div>
      {konum !== '' && k.isPending && <DurumKutusu durum="yukleniyor" />}
      {k.isError && <DurumKutusu durum="hata" mesaj={hataMetni(k.error)} yenile={() => void k.refetch()} />}
      {k.data && (
        <>
          <Tablo etiket="Sayılacak satırlar" kip="kaydir" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => anahtar(s.malzemeId, s.partiId)} bosMesaj="Bu gözde serbest stok yok; bulduğunuz malzemeyi aşağıdan ekleyin." />
          <div className="tc-stok-form">
            <MalzemeSecici etiket="Sistemde olmayan malzeme ekle" deger={eklenecek} degistir={setEklenecek} />
            <span className="tc-stok-dugmeler"><Dugme simge="plus" disabled={!ozet} onClick={ekle}>Sayıma ekle</Dugme></span>
          </div>
          <p className="tc-stok-not">Boş bırakılan satır sayılmamış sayılır. Eşiği aşan fark onaya gider; sayımı yapan kişi kendi farkını onaylayamaz.</p>
          <div className="tc-stok-dugmeler">
            <Dugme simge="x" onClick={temizle}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="check" disabled={girilen === 0} yukleniyor={komut.isPending} onClick={gonder}>Sayımı kaydet</Dugme>
          </div>
        </>
      )}
    </Kart>
  );
}

// ---- Kartı sıfırla: kartın bütün gözleri; seçilen serbest satırlar sıfırlanmak üzere onaya gider. ---------------------------------
const ENGEL: Record<NonNullable<SifirlamaSatiri['engel']>, string> = {
  statude: 'Statüde (emre ayrılmış)', kalite: 'Kalite kararı bekliyor', bekleyen_fark: 'Onay bekleyen farkı var',
};
const KALITE_ADI: Record<SifirlamaSatiri['kaliteDurumu'], string> = { serbest: 'Serbest', karar_bekliyor: 'Kalite kararı bekliyor', sartli: 'Şartlı', red: 'Red' };
const satirAnahtari = (s: SifirlamaSatiri) => `${s.konumId}:${s.partiId ?? ''}:${s.statuId ?? ''}:${s.kaliteDurumu}`;

function KartiSifirla() {
  const [parametre, setParametre] = useSearchParams();
  const malzeme = parametre.get('malzeme') ?? '';
  const malzemeSec = (v: string) => setParametre((p) => { const y = new URLSearchParams(p); if (v === '') y.delete('malzeme'); else y.set('malzeme', v); return y; }, { replace: true });
  const [arama, setArama] = useState(malzeme);
  const id = /^\d{1,9}$/.test(malzeme) ? Number(malzeme) : null;
  const a = useQuery({ queryKey: anahtarlar.ayrinti('sifirlama', id ?? 0), queryFn: () => api.get<SifirlamaAdaylariCevabi>(`/stok/malzemeler/${id}/sifirlama`), enabled: id !== null });
  const [disarida, setDisarida] = useState<Record<string, true>>({});
  const [neden, setNeden] = useState<SifirlamaNedeni | ''>('');
  const [aciklama, setAciklama] = useState('');
  const sifirla = () => { setDisarida({}); setNeden(''); setAciklama(''); };
  const { komut } = useStokKomutu(async (g: SifirlamaGovdesi) => korumaliPost<SifirlamaCevabi>('/stok/sifirla', g), 'Satırlar onaya gönderildi; ikinci yetkili onaylayınca sıfırlanır.', sifirla);
  const d = a.data;
  const gonderilebilir = (d?.satirlar ?? []).filter((s) => s.engel === null);
  const secili = gonderilebilir.filter((s) => !disarida[satirAnahtari(s)]);
  const serbestAyrilan = (d?.rezerveler ?? []).filter((r) => r.statuId === null);
  const kartEngeli = serbestAyrilan.length > 0
    ? `Serbest stok emre ayrılmış (${serbestAyrilan.map((r) => r.emirNo ?? `emir ${r.uretimEmriId}`).join(', ')}); önce ayırma kaldırılır.`
    : (d?.ayirmaIstekleri.length ?? 0) > 0 ? `Açık stoktan karşılama isteği var (${d!.ayirmaIstekleri.map((x) => x.talepNo).join(', ')}); önce istek kapanır.` : null;
  const statuAyrilan = (s: SifirlamaSatiri) => (d?.rezerveler ?? []).filter((r) => r.statuId !== null && r.statuId === s.statuId);
  const toplam = (d?.satirlar ?? []).reduce((t, s) => t + Number(s.miktar), 0);
  const sutunlar: Sutun<SifirlamaSatiri>[] = [
    { anahtar: 'sec', baslik: '', sabit: 'sol', hucre: (s) => (
      <input type="checkbox" aria-label={`${s.konumKod} ${s.partiEtiketi ?? ''} seç`} disabled={s.engel !== null || kartEngeli !== null}
        checked={s.engel === null && !disarida[satirAnahtari(s)]}
        onChange={() => setDisarida((x) => { const y = { ...x }; if (y[satirAnahtari(s)]) delete y[satirAnahtari(s)]; else y[satirAnahtari(s)] = true; return y; })} />
    ) },
    { anahtar: 'goz', baslik: 'Göz', mono: true, hucre: (s) => <Link to={`/stok/konumlar/${s.konumId}`}>{s.konumKod}</Link>, csv: (s) => s.konumKod },
    { anahtar: 'depo', baslik: 'Depo', hucre: (s) => s.depoKod },
    { anahtar: 'parti', baslik: 'Parti', kes: true, hucre: (s) => s.partiEtiketi ?? 'Parti bilinmiyor' },
    { anahtar: 'sistem', baslik: 'Sistemde', hizala: 'sag', hucre: (s) => miktarMetni(s.miktar) },
    { anahtar: 'yeni', baslik: 'Yeni miktar', hizala: 'sag', hucre: (s) => (s.engel === null ? <strong>0</strong> : '—') },
    { anahtar: 'durum', baslik: '', kes: true, hucre: (s) => {
      if (s.engel === null) return <span />;
      const ayrilan = s.engel === 'statude' ? statuAyrilan(s) : [];
      const ek = ayrilan.length > 0 ? ` · ${ayrilan.map((r) => `${miktarMetni(r.miktar)} ${r.emirNo ?? `emir ${r.uretimEmriId}`}`).join(', ')}` : '';
      return <Rozet ton="uyari">{s.engel === 'kalite' ? KALITE_ADI[s.kaliteDurumu] : ENGEL[s.engel]}{ek}</Rozet>;
    } },
  ];
  return (
    <Kart baslik="Kartı sıfırla">
      <div className="tc-stok-form">
        <MalzemeSecici etiket="Malzeme kartı" deger={arama} degistir={(v) => { setArama(v); sifirla(); malzemeSec(/^\d{1,9}$/.test(v) ? v : ''); }} />
      </div>
      {id !== null && a.isPending && <DurumKutusu durum="yukleniyor" />}
      {a.isError && <DurumKutusu durum="hata" mesaj={hataMetni(a.error)} yenile={() => void a.refetch()} />}
      {d && (
        <>
          <p className="tc-stok-not">{d.malzemeAd ?? d.kod} · {d.satirlar.length} satır · {miktarMetni(String(toplam))}{d.birim ? ` ${d.birim}` : ''} · {gonderilebilir.length} gönderilebilir</p>
          <Tablo etiket="Kartın bulunduğu gözler" kip="kaydir" sutunlar={sutunlar} satirlar={d.satirlar} satirAnahtari={satirAnahtari} bosMesaj="Bu kartın stoğu yok; sıfırlanacak satır yok." />
          {kartEngeli !== null && <p className="tc-stok-not tc-stok-uyari-yazi" role="alert">{kartEngeli}</p>}
          <div className="tc-stok-form">
            <Secim etiket="Neden" value={neden} onChange={(e) => setNeden(e.target.value as SifirlamaNedeni | '')} bosSecenek="Neden seçin" required
              secenekler={(Object.keys(SIFIRLAMA_NEDENI) as SifirlamaNedeni[]).map((n) => ({ deger: n, baslik: SIFIRLAMA_NEDENI[n] }))} />
            <Girdi etiket="Açıklama (onaylayan görür)" value={aciklama} maxLength={200} onChange={(e) => setAciklama(e.target.value)} />
          </div>
          <p className="tc-stok-not">Stok hemen düşmez. Seçilen satırlar Onay bekleyen sekmesine gider; sizden başka bir yetkili onaylayınca sayım eksiği fişiyle sıfırlanır. Ayrılmış ya da kalite kararı bekleyen satır gönderilmez.</p>
          <div className="tc-stok-dugmeler">
            <Dugme tur="birincil" simge="x" disabled={secili.length === 0 || neden === '' || kartEngeli !== null} yukleniyor={komut.isPending}
              onClick={() => neden !== '' && komut.mutate({
                malzemeId: d.malzemeId, neden, aciklama,
                satirlar: secili.map((s) => ({ konumId: s.konumId, partiId: s.partiId, beklenenMiktar: s.miktar })),
              })}>
              {`${secili.length} satırı sıfırlamaya gönder`}
            </Dugme>
          </div>
        </>
      )}
    </Kart>
  );
}

// ---- Son düzeltmeler: sayım fazlası ve eksiği hareketleri. ------------------------------------------------------------------------
type DuzeltmeSatiri = SonDuzeltmelerCevabi['satirlar'][number];

function SonDuzeltmeler() {
  const [gun, setGun] = useState('30');
  const l = useQuery({ queryKey: anahtarlar.liste('sayim-duzeltmeleri', { gun }), queryFn: () => api.get<SonDuzeltmelerCevabi>(`/stok/sayim-duzeltmeleri?gun=${gun}`) });
  const sutunlar: Sutun<DuzeltmeSatiri>[] = [
    { anahtar: 'fis', baslik: 'Fiş', mono: true, sabit: 'sol', hucre: (h) => h.fisNo ?? `#${h.hareketId}` },
    { anahtar: 'zaman', baslik: 'Zaman', hucre: (h) => zamanMetni(h.zaman) },
    { anahtar: 'goz', baslik: 'Göz', mono: true, hucre: (h) => <Link to={`/stok/konumlar/${h.konumId}`}>{h.konumKod}</Link>, csv: (h) => h.konumKod },
    { anahtar: 'malzeme', baslik: 'Malzeme', kes: true, hucre: (h) => <Link to={`/stok/malzemeler/${h.malzemeId}`}>{h.malzemeAd ?? `Kart ${h.malzemeId}`}</Link>, csv: (h) => h.malzemeAd ?? `Kart ${h.malzemeId}` },
    { anahtar: 'fark', baslik: 'Fark', hizala: 'sag', hucre: (h) => <strong>{farkMetni(h.fark)}</strong> },
    { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (h) => SAYIM_KAYNAGI[h.kaynak] },
    { anahtar: 'neden', baslik: 'Neden', hucre: (h) => (h.neden ? SIFIRLAMA_NEDENI[h.neden] : '—') },
    { anahtar: 'sayan', baslik: 'Sayan', kes: true, hucre: (h) => h.sayanAd ?? '—' },
    { anahtar: 'onaylayan', baslik: 'Onaylayan', kes: true, hucre: (h) => h.onaylayanAd ?? '— (eşik içi)' },
    { anahtar: 'durum', baslik: '', hucre: (h) => (h.geriAlindi ? <Rozet ton="pasif">Geri alındı</Rozet> : <span />) },
  ];
  return (
    <Kart baslik="Son düzeltmeler" sag={
      <Secim etiket="Dönem" value={gun} onChange={(e) => setGun(e.target.value)} secenekler={SON_DUZELTME_GUNLERI.map((g) => ({ deger: String(g), baslik: `Son ${g} gün` }))} />
    }>
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.isError && <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />}
      {l.data && (
        <>
          <Tablo etiket="Son düzeltmeler" kip="kaydir" sutunlar={sutunlar} satirlar={l.data.satirlar} satirAnahtari={(h) => h.hareketId} bosMesaj="Bu dönemde sayım düzeltmesi yok." />
          {l.data.kesildi && <p className="tc-stok-not">İlk 500 satır gösteriliyor; daha eskiler için Hareketler sayfasını kullanın.</p>}
        </>
      )}
    </Kart>
  );
}
