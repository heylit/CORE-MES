import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GelecekSepetCevabi, IsMalzemeleriCevabi, IsMalzemesiIsteGovdesi, IstasyonSepetiCevabi, IstasyonSepetiSatiri, IstekAcGovdesi, SepettenCekGovdesi, SepettenKullanGovdesi, IstekMalzemeleriCevabi, KisiKoduCevabi, MalzemeYerleriCevabi, OkutCozCevabi, Teslim, TeslimAlGovdesi, TeslimGonderGovdesi, TeslimKutusuCevabi, TeslimReddetGovdesi, TeslimYeri, YerdekiStokCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Dugme, Girdi, KodOkuyucu, Pencere, Rozet, Secim, Sekmeler, Simge, useBildirim, type Secenek, type Sekme } from '../../ortak/arayuz/index.ts';
import type { UstEylem } from '../../ortak/rota/ust-eylemler.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { durumMetni, isMalzemeDurumu, isMalzemeleriAnahtari, TESLIM_KUTUSU } from './is-malzeme-durumu.ts';
import { teslimAlIstasyonu } from './teslim-yeri.ts';
import { OkutAlani } from './OkutPaneli.tsx';
import { ELDEN_NOTU, okutulanHedef, type OkutulanHedef } from './okut-akisi.ts';
import { Qr } from './Qr.tsx';
import { MALZEME_TESLIM_AC, type MalzemeTeslimOdagi } from './disari.ts';
import { birimliMiktar, istekDurumu, miktarGirdisi, miktarMetni, zamanMetni } from './gorunum.ts';
import { AlinanSatir, IstasyonIstekleri } from './IstasyonIstekleri.tsx';
import { OkutarakAl } from './OkutarakAl.tsx';
import { OkutmaSonucu, type Okunan, type SonucEylemi } from './OkutmaSonucu.tsx';
import { hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import { bekleyenPanelIstegi, MALZEME_PANELI_AC, type PanelIstegi, type PanelSekmesi } from './panel-olayi.ts';
import { PanelMalKabul } from './PanelMalKabul.tsx';
import { PanelSevk } from './PanelSevk.tsx';
import { DepoSepeti } from './Sepet.tsx';
import { GelenTeslim, OncekiSepetSatiri, SepetSatiri } from './sepet-satirlari.tsx';
import { TeslimSatiri } from './TeslimSatiri.tsx';
import { useStatuAdi } from './statu.ts';
import { TasimaYolu, tasimaYolu } from './TasimaYolu.tsx';
import { sutunAdi } from './yerlesim.ts';
import './stok.css';

// Malzeme · Teslim (kart #1208): her sayfanın üst çubuğunda; teslim et, teslim al, malzeme iste. 372 a: ayrı QR tuşu yok; okuyucu bu
// pencerenin üstündedir. Okuma yalnız stok.istek ister; tam stok okuması (sayfa.stok) açılmaz.
const KUTU = TESLIM_KUTUSU;
const yeniKimlik = yeniIstekKimligi;

// Okut-önce, üç düğme (751 b): okuyucu üstte; Bana gelen, Gönder, İste. İstasyon sepeti Gönder'in "Elimdekiler" bölümüdür; eski
// "sepet" isteği Gönder'i açar. Bana gelen bekleyen gelen sayısını taşır (545 T2).
type SekmeAnahtari = Exclude<PanelSekmesi, 'sepet'>;
const sekmeler = (gelen: number): readonly Sekme<SekmeAnahtari>[] => [
  { anahtar: 'al', baslik: 'Bana gelen', simge: 'download', sayi: gelen },
  { anahtar: 'et', baslik: 'Gönder', simge: 'upload' },
  { anahtar: 'iste', baslik: 'İste', simge: 'plus' },
];
const panelSekmesi = (s: PanelSekmesi | undefined): SekmeAnahtari => (s === undefined ? 'al' : s === 'sepet' ? 'et' : s);

// Seçim değeri "i:<id>" istasyon, "k:<id>" stok konumu.
const yerDegeri = (y: TeslimYeri): string => ('istasyonId' in y ? `i:${y.istasyonId}` : `k:${y.konumId}`);
function yerCoz(deger: string): TeslimYeri | null {
  const [tur, id] = deger.split(':');
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return tur === 'i' ? { istasyonId: n } : tur === 'k' ? { konumId: n } : null;
}
const yerSorgusu = (y: TeslimYeri | null): Record<string, string> =>
  (y === null ? {} : 'istasyonId' in y ? { istasyonId: String(y.istasyonId) } : { konumId: String(y.konumId) });
function yerAdi(kutu: TeslimKutusuCevabi, y: TeslimYeri): string {
  if ('istasyonId' in y) return [...kutu.istasyonlar, ...kutu.hedefIstasyonlar].find((i) => i.id === y.istasyonId)?.ad ?? `İstasyon #${y.istasyonId}`;
  const k = [...kutu.depoKonumlari, ...kutu.araAlanlar].find((x) => x.id === y.konumId);
  return k ? k.ad ?? k.kod : `Konum #${y.konumId}`;
}

function TeslimDugmesi() {
  const [acik, setAcik] = useState(false);
  const [odak, setOdak] = useState<MalzemeTeslimOdagi | null>(null);
  const [istek, setIstek] = useState<PanelIstegi | null>(null);
  // Terminal başlatırken girdi eksikse panel Bana gelen'de o malzemeyle açılır (kart #1289).
  useEffect(() => {
    const ac = (o: Event) => { setOdak((o as CustomEvent<MalzemeTeslimOdagi>).detail); setIstek(null); setAcik(true); };
    // Eski Okut adresleri ve Stok Merkezi düğmeleri (soru 90 a): bekleyen istek kurulurken de alınır.
    const sekmeyle = () => { const b = bekleyenPanelIstegi(); if (b) { setOdak(null); setIstek(b); setAcik(true); } };
    sekmeyle();
    window.addEventListener(MALZEME_TESLIM_AC, ac);
    window.addEventListener(MALZEME_PANELI_AC, sekmeyle);
    return () => { window.removeEventListener(MALZEME_TESLIM_AC, ac); window.removeEventListener(MALZEME_PANELI_AC, sekmeyle); };
  }, []);
  const sayac = useQuery({
    queryKey: [...KUTU, 'sayac'],
    queryFn: () => api.get<{ gelen: number }>('/stok/teslim-kutusu/sayac'),
    refetchInterval: 60_000,
    retry: false,
  });
  const gelen = sayac.data?.gelen ?? 0;
  const etiket = gelen > 0 ? `Malzeme ve teslim, ${gelen} gelen teslim` : 'Malzeme ve teslim';
  return (
    <>
      <button type="button" className="tc-kabuk-tema tc-stok-teslim-dugme" onClick={() => setAcik(true)} aria-haspopup="dialog" aria-label={etiket} title={etiket}>
        <Simge ad="scan" />
        {gelen > 0 && <span className="tc-stok-teslim-sayac" aria-hidden="true">{gelen > 99 ? '99+' : gelen}</span>}
      </button>
      {acik && <TeslimPaneli key={istek ? `${istek.sekme}-${istek.depoSepeti ?? false}` : 'olagan'} odak={odak} istek={istek} kapat={() => { setAcik(false); setOdak(null); setIstek(null); }} />}
    </>
  );
}

const SONUC_SEKMESI: Record<SonucEylemi, SekmeAnahtari> = { kabul: 'al', sevk: 'et', 'okutarak-al': 'iste' };

function TeslimPaneli({ odak, istek, kapat }: { odak: MalzemeTeslimOdagi | null; istek: PanelIstegi | null; kapat: () => void }) {
  const [sekme, setSekme] = useState<SekmeAnahtari>(panelSekmesi(istek?.sekme));
  // Okuyucuda ilk okutulan kişi kodu Teslim et'i o kişiye hedefli açar; her okutma formu yeniden kurar.
  const [kisiHedefi, setKisiHedefi] = useState<{ hedef: OkutulanHedef; sira: number } | null>(null);
  // Soru 89: okutulan malzeme ya da yer; sonuç kartı ve sekmelerin ilgili bölümleri bunu okur. Sorgula sekmesi yoktur.
  const [okunan, setOkunan] = useState<(Okunan & { sira: number }) | null>(null);
  const [sifir, setSifir] = useState(0);
  const kutu = useQuery({ queryKey: KUTU, queryFn: () => api.get<TeslimKutusuCevabi>('/stok/teslim-kutusu') });
  const okundu = (kod: string, cevap: OkutCozCevabi) => {
    if (cevap.tur === 'kisi') return;
    setOkunan((o) => (cevap.tur === 'bilinmiyor' ? null : { kod, cevap, sira: (o?.sira ?? 0) + 1 }));
  };
  const sonucSecildi = (e: SonucEylemi) => { setSifir((n) => n + 1); setKisiHedefi(null); setSekme(SONUC_SEKMESI[e]); };
  const sonuc = okunan && <OkutmaSonucu key={okunan.sira} okunan={okunan} sec={sonucSecildi} kapat={() => setOkunan(null)} />;
  return (
    <Pencere acik kapat={kapat} baslik="Malzeme · Teslim" tur="yan">
      <div className="tc-stok-form">
        <OkutAlani teslimEteGec={(hedef) => { setSekme('et'); setKisiHedefi((k) => ({ hedef, sira: (k?.sira ?? 0) + 1 })); }} okundu={okundu} sifir={sifir} sonuc={sonuc}>
          <div className="tc-stok-sekmeler-sar"><Sekmeler etiket="Malzeme ve teslim" sekmeler={sekmeler(kutu.data?.gelenler.length ?? 0)} secili={sekme} sec={(s) => { setSekme(s); setKisiHedefi(null); }} /></div>
          {kutu.isPending ? <DurumKutusu durum="yukleniyor" />
            : kutu.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(kutu.error)} yenile={() => { void kutu.refetch(); }} />
            : sekme === 'al' ? <TeslimAl kutu={kutu.data} odak={odak} okunan={okunan} sepeteGec={() => setSekme('et')} />
            : sekme === 'et' ? <TeslimEt key={kisiHedefi?.sira ?? 0} kutu={kutu.data} baslangic={kisiHedefi?.hedef ?? null} okunan={okunan} odak={odak} depoSepeti={istek?.depoSepeti ?? false} />
            : <MalzemeIste key={okunan?.sira ?? 0} kutu={kutu.data} okunan={okunan} />}
        </OkutAlani>
      </div>
    </Pencere>
  );
}

function GonderilenTeslim({ t }: { t: Teslim }) {
  const iptal = useStokKomutu((g: { surum: number }) => api.post(`/stok/teslimler/${t.id}/iptal-et`, g), `${t.no} geri çekildi.`);
  return (
    <TeslimSatiri t={t}>
      {t.durum === 'yolda' && (
        <div className="tc-stok-dugmeler">
          <Dugme simge="back" yukleniyor={iptal.komut.isPending} onClick={() => iptal.komut.mutate({ surum: t.surum })}>Geri çek</Dugme>
        </div>
      )}
    </TeslimSatiri>
  );
}

// Akış A provası D2: kişinin bulunduğu istasyon bilinmiyorsa panel ilk istasyonu değil, aynı kişinin bu sekmede son seçtiğini ya da
// gelen teslimin istasyonunu açar. Yalnız bellekte durur; sayfa yenilenince sıfırlanır.
let sonSecilen: { kisiId: number; istasyonId: number } | null = null;
function TeslimAl({ kutu, odak, okunan, sepeteGec }: { kutu: TeslimKutusuCevabi; odak: MalzemeTeslimOdagi | null; okunan: Okunan | null; sepeteGec: () => void }) {
  const giris = useIslem('stok.giris');
  const kisiId = useOturum().data?.id ?? null;
  const son = sonSecilen !== null && sonSecilen.kisiId === kisiId ? sonSecilen.istasyonId : null;
  const [istasyon, setIstasyon] = useState(() => String(teslimAlIstasyonu(kutu, odak?.istasyonId ?? null, son) ?? ''));
  const istasyonSec = (deger: string) => { setIstasyon(deger); sonSecilen = kisiId === null || deger === '' ? null : { kisiId, istasyonId: Number(deger) }; };
  useEffect(() => { if (odak) setIstasyon(String(odak.istasyonId)); }, [odak]);
  const istasyonId = Number(istasyon);
  const eldenAlinanlar = (kutu.okutarakAlinanlar ?? []).filter((t) => hedefTarafi(kutu, t));
  // 618 (615-1 b): terminalden gelince önce o işin malzemesi; işin gelenleri aşağıda yinelenmez.
  const buIs = odak !== null && odak.istasyonId === istasyonId ? odak : null;
  const buIsinGelenleri = buIs === null ? [] : kutu.gelenler.filter((t) => t.uretimEmriId === buIs.uretimEmriId && t.hedef.istasyonId === buIs.istasyonId);
  const gelenler = kutu.gelenler.filter((t) => !buIsinGelenleri.includes(t));
  // 545 T3, 618: önce bekleyen iş (gelenler, itiraz edilebilecekler), sonra istasyonun işlerinin malzemesi; kişi kodu en altta, kapalı.
  return (
    <>
      {giris && okunan?.cevap.tur === 'malzeme' && <PanelMalKabul key={okunan.kod} kod={okunan.kod} />}
      {buIs && <BuIs odak={buIs} gelenler={buIsinGelenleri} sepeteGec={sepeteGec} />}
      <BanaGelenler gelenler={gelenler} istasyonId={istasyonId} buIs={buIs !== null} />
      {eldenAlinanlar.length > 0 && (
        <>
          <div className="tc-stok-bolum-bas">
            <h3 className="tc-stok-teslim-baslik">Elden alınanlar</h3>
            <span className="tc-stok-not">Vardiya sonuna kadar itiraz</span>
          </div>
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Elden alınanlar">{eldenAlinanlar.map((t) => <AlinanSatir key={t.id} t={t} />)}</ul>
        </>
      )}
      {kutu.istasyonlar.length > 1 && (
        <Secim etiket="İstasyon" secenekler={kutu.istasyonlar.map((i) => ({ deger: String(i.id), baslik: `${i.ad} (${i.kod})` }))} value={istasyon}
          onChange={(o) => istasyonSec(o.target.value)} />
      )}
      {istasyonId > 0 && <IsMalzemeleri istasyonId={istasyonId} odak={odak?.istasyonId === istasyonId ? odak : null} haric={buIs?.uretimEmriId ?? null} />}
      <KisiKodum buradakiIstasyonId={kutu.buradakiIstasyonId} istasyonAdi={kutu.istasyonlar.find((i) => i.id === kutu.buradakiIstasyonId)?.ad ?? null} />
    </>
  );
}

// "Bu iş" (618, karar 615-1 b): terminalin malzeme çipinden açılır. Al: bu işe gelenler; İste: bu işin eksik girdisi (tek dokunuş);
// Gönder: üretilen parça sepette rotadaki sonraki istasyona gider. Uçlar ve yetkiler panelin öteki bölümleriyle aynıdır.
function BuIs({ odak, gelenler, sepeteGec }: { odak: MalzemeTeslimOdagi; gelenler: Teslim[]; sepeteGec: () => void }) {
  const liste = useQuery({
    queryKey: isMalzemeleriAnahtari(odak.istasyonId),
    queryFn: () => api.get<IsMalzemeleriCevabi>(`/stok/teslim-kutusu/is-malzemeleri?istasyonId=${odak.istasyonId}`),
  });
  const isler = liste.data?.isler.filter((x) => x.uretimEmriId === odak.uretimEmriId) ?? [];
  const durum = liste.data ? isMalzemeDurumu(liste.data, gelenler, odak.istasyonId, odak.uretimEmriId) : null;
  const ozet = durum && durum.girdi > 0 ? durumMetni(durum) : null;
  return (
    <section className="tc-stok-bu-is" aria-label="Bu iş">
      <div className="tc-stok-bolum-bas">
        <h3 className="tc-stok-teslim-baslik">Bu iş{isler[0] ? ` · ${isler[0].emirNo}` : ''}</h3>
        {ozet && <Rozet ton={ozet.ton}>{ozet.metin}</Rozet>}
      </div>
      {gelenler.length > 0 && (
        <>
          {gelenler.length > 1 && <div className="tc-stok-eylem"><HepsiniAl gelenler={gelenler} /></div>}
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Bu işe gelenler">{gelenler.map((t) => <GelenTeslim key={t.id} t={t} />)}</ul>
        </>
      )}
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => { void liste.refetch(); }} />
        : isler.length === 0 ? <p className="tc-stok-not">Bu işin bu istasyonda stoklanan girdisi yok.</p>
        : <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Bu işin malzemeleri">{isler.flatMap((is) => is.malzemeler.map((m) => <IsMalzemesiSatiri key={`${is.opNo}-${m.malzemeId}`} istasyonId={odak.istasyonId} is={is} m={m} secili={odak.malzemeId === m.malzemeId} />))}</ul>}
      <div className="tc-stok-eylem">
        <Dugme simge="upload" onClick={sepeteGec}>Parçayı gönder</Dugme>
      </div>
    </section>
  );
}

// 545 T5: elden ve bırakılarak gelen (hedefi kapsamımdaki istasyon) Bana gelen'de itiraz edilir; okutarak alınana kaynak taraf Gönder'de itiraz eder.
const hedefTarafi = (kutu: TeslimKutusuCevabi, t: Teslim): boolean => t.hedef.istasyonId !== null && kutu.istasyonlar.some((i) => i.id === t.hedef.istasyonId);

// 545 T4: bekleyen her teslim gönderilen miktarla, sırayla ve ayrı kayıt olarak alınır; biri reddedilirse ötekiler alınmış kalır ve söylenir.
function HepsiniAl({ gelenler }: { gelenler: Teslim[] }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const al = useMutation({
    mutationFn: async (liste: Teslim[]) => {
      let alinan = 0;
      const hatalar: string[] = [];
      for (const t of liste) {
        try { await api.post(`/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan: t.miktar }); alinan++; } catch (h) { hatalar.push(`${t.no}: ${hataMetni(h)}`); }
      }
      return { alinan, hatalar };
    },
    onSuccess: ({ alinan, hatalar }) => {
      if (hatalar.length === 0) bildir('tamam', `${alinan} teslim alındı.`);
      else bildir('hata', `${alinan} teslim alındı; ${hatalar.length} alınamadı. ${hatalar.join(' · ')}`);
    },
    onSettled: () => istemci.invalidateQueries({ queryKey: KUTU }),
  });
  return <Dugme tur="ikincil" simge="check" yukleniyor={al.isPending} onClick={() => al.mutate(gelenler)}>Hepsini al</Dugme>;
}

// Kişiye teslim (299 b): teslim edecek kişi bu kodu okutur. Kod sunucuda imzalanır ve kısa sürelidir; ekran süresi dolmadan yenisini alır.
// Kod kişinin bulunduğu istasyona çözülür; istasyonda değilken okutulsa reddedilir, bu yüzden QR yerine yol gösterilir (537 a).
// 618: kod en altta ve kapalı durur; açılınca alınır (dar ekranda işin malzemesini aşağı itmesin).
function KisiKodum({ buradakiIstasyonId, istasyonAdi }: { buradakiIstasyonId: number | null; istasyonAdi: string | null }) {
  const [acik, setAcik] = useState(false);
  const [buyuk, setBuyuk] = useState(false);
  const kod = useQuery({
    queryKey: [...KUTU, 'kisi-kodu'],
    queryFn: () => api.get<KisiKoduCevabi>('/stok/teslim-kutusu/kisi-kodu'),
    refetchInterval: 30_000,
    gcTime: 0,
    enabled: buradakiIstasyonId !== null && acik,
  });
  if (buradakiIstasyonId === null) {
    return <p className="tc-stok-not">İstasyonda açık oturumunuz yok; kişi kodunuz yalnız istasyondayken çalışır. Teslim edecek kişi istasyon, raf ya da alan etiketini okutsun.</p>;
  }
  if (!acik) {
    return <div className="tc-stok-eylem"><Dugme simge="scan" aria-expanded={false} onClick={() => setAcik(true)}>Elden teslim için kodumu göster</Dugme></div>;
  }
  const yer = istasyonAdi ? `${istasyonAdi} istasyonuna` : 'istasyonunuza';
  // 545 T6: küçük kart; kalan süre çubuğu ve tam ekran gösterim (uzaktan ya da telefonla okutmak için).
  return (
    <section className="tc-stok-kisi-kodu" aria-label="Elden teslim için kodum">
      {kod.isPending ? <DurumKutusu durum="yukleniyor" />
        : kod.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(kod.error)} yenile={() => { void kod.refetch(); }} />
        : <Qr metin={kod.data.kod} boyut={112} />}
      <div className="tc-stok-kisi-kodu-ic">
        <strong>Elden teslim için kodum</strong>
        <p className="tc-stok-not">Teslim eden bu kodu okutunca malzeme hemen {yer} geçer. Yanlışsa vardiya sonuna kadar buradan itiraz edin.</p>
        {kod.data && <KalanSure son={kod.data.gecerlilikSonu} />}
        {kod.data && <Dugme simge="expand" onClick={() => setBuyuk(true)}>Büyük göster</Dugme>}
      </div>
      {buyuk && kod.data && (
        <Pencere acik kapat={() => setBuyuk(false)} baslik="Elden teslim için kodum">
          <div className="tc-stok-kisi-kodu-buyuk"><Qr metin={kod.data.kod} boyut={320} /><p className="tc-stok-not">Teslim {yer} gider. Kod kendiliğinden yenilenir.</p></div>
        </Pencere>
      )}
    </section>
  );
}

const KOD_SURESI_SN = 120;
const kalanSaniye = (son: string): number => Math.max(0, Math.round((Date.parse(son) - Date.now()) / 1000));
function KalanSure({ son }: { son: string }) {
  const [kalan, setKalan] = useState(() => kalanSaniye(son));
  useEffect(() => {
    setKalan(kalanSaniye(son));
    const z = window.setInterval(() => setKalan(kalanSaniye(son)), 1000);
    return () => window.clearInterval(z);
  }, [son]);
  return <progress className="tc-stok-geri-sayim" max={KOD_SURESI_SN} value={Math.min(kalan, KOD_SURESI_SN)} aria-label={`Kod ${kalan} saniye daha geçerli`} />;
}

// İstasyondaki işlerin malzemeleri (kart #1289): bitmemiş her adımın girdisi, kalan iş için gereken, istasyondaki ve bulunduğu yer; adım
// bitene kadar durur. "Bu iş" açıksa o emir burada yinelenmez.
function IsMalzemeleri({ istasyonId, odak, haric }: { istasyonId: number; odak: MalzemeTeslimOdagi | null; haric: number | null }) {
  const liste = useQuery({
    queryKey: isMalzemeleriAnahtari(istasyonId),
    queryFn: () => api.get<IsMalzemeleriCevabi>(`/stok/teslim-kutusu/is-malzemeleri?istasyonId=${istasyonId}`),
  });
  const isler = liste.data?.isler.filter((is) => is.uretimEmriId !== haric) ?? [];
  return (
    <>
      <h3 className="tc-stok-teslim-baslik">{haric === null ? 'İşlerin malzemeleri' : 'Öteki işlerin malzemeleri'}</h3>
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => { void liste.refetch(); }} />
        : isler.length === 0 ? <p className="tc-stok-not">Bu istasyondaki işlerin stoklanan girdisi yok.</p>
        : (
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="İşlerin malzemeleri">
            {isler.flatMap((is) => is.malzemeler.map((m) => (
              <IsMalzemesiSatiri key={`${is.uretimEmriId}-${is.opNo}-${m.malzemeId}`} istasyonId={istasyonId} is={is} m={m}
                secili={odak !== null && odak.uretimEmriId === is.uretimEmriId && odak.malzemeId === m.malzemeId} />
            )))}
          </ul>
        )}
    </>
  );
}

type IsSatiri = IsMalzemeleriCevabi['isler'][number];
// Terminalden gelinince eksik malzeme işaretlenir ve görünür alana kaydırılır.
function IsMalzemesiSatiri({ istasyonId, is, m, secili }: { istasyonId: number; is: IsSatiri; m: IsSatiri['malzemeler'][number]; secili: boolean }) {
  const satir = useRef<HTMLLIElement | null>(null);
  useEffect(() => { if (secili) satir.current?.scrollIntoView?.({ block: 'center' }); }, [secili]);
  const yer = m.yerler.slice(0, 4).map((y) => `${y.konum} ${y.istasyonId === null ? 'depo' : 'istasyon'} · ${y.buEmrin ? 'bu emrin' : 'emirsiz'} (${miktarMetni(y.miktar)})`).join(', ');
  return (
    <li className="tc-stok-is tc-stok-teslim-satir" aria-current={secili ? 'true' : undefined} ref={satir}>
      <div>
        <strong>{m.ad ?? m.kod ?? `Malzeme #${m.malzemeId}`}</strong>
        <span className="tc-stok-mono">{is.emirNo} · OP {is.opNo} · {is.adimAd}{is.calisiyor ? ' · çalışıyor' : ''}</span>
        <span>Kalan {is.kalanAdet} adet için {birimliMiktar(m.gereken, m.birim)} · istasyonda {birimliMiktar(m.istasyonda, m.birim)}</span>
        <span>{yer === '' ? 'Başka yerde yok' : `Bulunduğu yer: ${yer}`}</span>
        {m.istek && <span>İstek {m.istek.no} · {istekDurumu(m.istek).etiket}</span>}
        <IsMalzemesiIste istasyonId={istasyonId} is={is} m={m} />
      </div>
      {m.eksik ? <Rozet ton="hata">Eksik</Rozet> : <Rozet ton="tamam">İstasyonda</Rozet>}
    </li>
  );
}

// Eksik malzemeyi tek dokunuşla iste (kart #1418): depodaysa eksik miktarla istek açılır, emrin rotasındaki başka istasyondaysa oradan alınır.
function IsMalzemesiIste({ istasyonId, is, m }: { istasyonId: number; is: IsMalzemeleriCevabi['isler'][number]; m: IsMalzemeleriCevabi['isler'][number]['malzemeler'][number] }) {
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const iste = useStokKomutu((g: IsMalzemesiIsteGovdesi) => korumaliPost('/stok/teslim-kutusu/is-malzemeleri/iste', g), 'Malzeme istendi.', () => setKimlik(yeniKimlik()));
  if (Number(m.gereken) <= Number(m.istasyonda)) return null;
  const istekAcik = m.istek !== null && m.istek.durum !== 'teslim' && m.istek.durum !== 'iptal';
  const depo = m.yerler.find((y) => y.istasyonId === null) ?? null;
  const istasyonlar = m.yerler.filter((y) => y.istasyonId !== null).slice(0, 4);
  const gonder = (kaynakKonumId: number | null, buEmrin: boolean | null) =>
    iste.komut.mutate({ istasyonId, uretimEmriId: is.uretimEmriId, opNo: is.opNo, malzemeId: m.malzemeId, kaynakKonumId, buEmrin, kaynakKimligi: kimlik });
  return (
    <span className="tc-stok-eylem" role="group" aria-label="Malzemeyi iste">
      {!istekAcik && <Dugme tur="birincil" simge="download" yukleniyor={iste.komut.isPending} onClick={() => gonder(depo?.konumId ?? null, null)}>Depodan iste</Dugme>}
      {istasyonlar.map((y) => (
        <Dugme key={`${y.konumId}-${y.buEmrin}`} tur="ikincil" simge="download" yukleniyor={iste.komut.isPending} onClick={() => gonder(y.konumId, y.buEmrin)}>
          {y.konum} istasyonundan al · {y.buEmrin ? 'bu emrin' : 'emirsiz'}
        </Dugme>
      ))}
    </span>
  );
}

// Bana gelenler tek liste (752 b): onay bekleyen gelen teslimler ve rotada sonraki adımı bu istasyon olan, önceki istasyonun sepetinde
// bekleyen parça (kart #1289; "Teslim al" çeker, hemen geçer). İkisi de aynı yerde alınır.
function BanaGelenler({ gelenler, istasyonId, buIs }: { gelenler: Teslim[]; istasyonId: number; buIs: boolean }) {
  const gelecek = useQuery({
    queryKey: [...KUTU, 'gelecek', istasyonId],
    queryFn: () => api.get<GelecekSepetCevabi>(`/stok/teslim-kutusu/sepet/gelecek?istasyonId=${istasyonId}`),
    enabled: istasyonId > 0,
  });
  const onceki = istasyonId > 0 ? gelecek.data?.satirlar ?? [] : [];
  return (
    <>
      <div className="tc-stok-bolum-bas">
        <h3 className="tc-stok-teslim-baslik">Bana gelenler</h3>
        {gelenler.length > 1 && <HepsiniAl gelenler={gelenler} />}
      </div>
      {gelenler.length + onceki.length === 0 ? <DurumKutusu durum="bos" mesaj={buIs ? 'Başka teslim almanızı bekleyen malzeme yok' : 'Teslim almanızı bekleyen malzeme yok'} />
        : (
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Bana gelenler">
            {gelenler.map((t) => <GelenTeslim key={t.id} t={t} />)}
            {onceki.map((x) => <OncekiSepetSatiri key={`${x.kaynak.id}-${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`} istasyonId={istasyonId} x={x} />)}
          </ul>
        )}
    </>
  );
}

// Gönder (751 b): önce istenenler, sonra elimdekiler (istasyon sepeti; "Sonraki istasyona" burada, 752 b), sonra serbest teslim formu.
// Terminalden açılınca istasyon terminalinkidir (#24).
function TeslimEt(o: { kutu: TeslimKutusuCevabi; baslangic: OkutulanHedef | null; okunan: Okunan | null; odak: MalzemeTeslimOdagi | null; depoSepeti: boolean }) {
  const buradaki = o.odak?.istasyonId ?? o.kutu.buradakiIstasyonId;
  return (
    <>
      <IstasyonIstekleri istenenler={o.kutu.bendenIstenenler ?? []} alinanlar={(o.kutu.okutarakAlinanlar ?? []).filter((t) => !hedefTarafi(o.kutu, t))} />
      {o.okunan?.cevap.tur === 'malzeme' && <PanelSevk key={o.okunan.kod} okunan={o.okunan} />}
      <h3 className="tc-stok-teslim-baslik">Elimdekiler</h3>
      <Sepet kutu={o.kutu} depoSepeti={o.depoSepeti} buradaki={buradaki} />
      <h3 className="tc-stok-teslim-baslik">Başka yere teslim et</h3>
      <MalzemeTeslimEt kutu={o.kutu} baslangic={o.baslangic} buradaki={buradaki} />
      <h3 className="tc-stok-teslim-baslik">Gönderdiklerim</h3>
      {o.kutu.gonderdiklerim.length === 0 ? <p className="tc-stok-not">Son gönderiminiz yok.</p>
        : <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Gönderdiklerim">{o.kutu.gonderdiklerim.map((t) => <GonderilenTeslim key={t.id} t={t} />)}</ul>}
    </>
  );
}

function MalzemeTeslimEt({ kutu, baslangic, buradaki }: { kutu: TeslimKutusuCevabi; baslangic: OkutulanHedef | null; buradaki: number | null }) {
  const statuAdi = useStatuAdi();
  // Depodan gönderim depo işlemidir (stok.transfer); sunucu da denetler.
  const depocu = useIslem('stok.transfer');
  const [kaynak, setKaynak] = useState(() => (buradaki === null ? '' : yerDegeri({ istasyonId: buradaki })));
  const [hedef, setHedef] = useState(() => (baslangic === null ? '' : yerDegeri(baslangic.yer)));
  const [satir, setSatir] = useState('');
  const [miktar, setMiktar] = useState('');
  const [not, setNot] = useState('');
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const [haritaAcik, setHaritaAcik] = useState(false);
  const [okutAcik, setOkutAcik] = useState(false);
  // Okutulan kişi kodu (299 b): hedef elle değişince düşer; gönderimde sunucu kodu yeniden doğrular.
  const [alici, setAlici] = useState<OkutulanHedef['alici']>(() => baslangic?.alici ?? null);
  const hedefSec = (deger: string) => { setHedef(deger); setAlici(null); };
  // Son gönderimin yeri ve sırası: aynı yere yeni gönderim taşıma yolunu yeniden oynatır.
  const [gonderilen, setGonderilen] = useState<{ yer: string; sira: number } | null>(null);
  const kaynakYeri = yerCoz(kaynak);
  // İstasyondan gönderimde sepet okunur: satır, emrin rotasındaki sonraki istasyonu da taşır.
  const istasyondan = kaynakYeri !== null && 'istasyonId' in kaynakYeri;
  const yerdeki = useQuery<{ satirlar: (YerdekiStokCevabi['satirlar'][number] & Partial<Pick<IstasyonSepetiSatiri, 'sonraki'>>)[] }>({
    queryKey: istasyondan ? sepetAnahtari(kaynakYeri.istasyonId) : [...KUTU, 'yerdeki', kaynak],
    queryFn: () => (istasyondan
      ? api.get<IstasyonSepetiCevabi>(`/stok/teslim-kutusu/sepet?istasyonId=${kaynakYeri.istasyonId}`)
      : api.get<YerdekiStokCevabi>(`/stok/teslim-kutusu/yerdeki-stok?${new URLSearchParams(yerSorgusu(kaynakYeri))}`)),
    enabled: kaynakYeri !== null,
  });
  const araAlanaMi = kutu.araAlanlar.some((a) => yerDegeri({ konumId: a.id }) === hedef);
  const gonder = useStokKomutu((g: TeslimGonderGovdesi) => korumaliPost('/stok/teslimler/gonder', g),
    araAlanaMi ? 'Ara alana bırakıldı; stok oraya taşındı.' : alici ? `${alici.ad ?? 'Alıcıya'} elden teslim edildi; stok istasyonuna geçti.` : 'Teslim gönderildi; alan taraf onaylayınca stok taşınır.', () => {
    setSatir(''); setMiktar(''); setNot(''); setKimlik(yeniKimlik()); setAlici(null);
    setGonderilen((g) => ({ yer: `${kaynak}>${hedef}`, sira: (g?.sira ?? 0) + 1 }));
  });
  const satirlar = yerdeki.data?.satirlar ?? [];
  const secili = satirlar.find((s, i) => String(i) === satir);
  const depoSecenekleri: Secenek[] = kutu.depoKonumlari.map((k) => ({ deger: yerDegeri({ konumId: k.id }), baslik: `Depo · ${k.ad ? `${k.ad} (${k.kod})` : k.kod}` }));
  const araAlanSecenekleri: Secenek[] = kutu.araAlanlar.map((k) => ({ deger: yerDegeri({ konumId: k.id }), baslik: `Ara alan · ${k.ad ? `${k.ad} (${k.kod})` : k.kod}` }));
  const kaynaklar: Secenek[] = [
    ...kutu.istasyonlar.map((i) => ({ deger: yerDegeri({ istasyonId: i.id }), baslik: `İstasyon · ${i.ad} (${i.kod})` })),
    ...araAlanSecenekleri,
    ...(depocu ? depoSecenekleri : []),
  ];
  const hedefler: Secenek[] = [
    ...kutu.hedefIstasyonlar.map((i) => ({ deger: yerDegeri({ istasyonId: i.id }), baslik: `İstasyon · ${i.ad} (${i.kod})` })),
    ...araAlanSecenekleri,
    ...depoSecenekleri,
  ].filter((s) => s.deger !== kaynak);
  const hedefYeri = yerCoz(hedef);
  const yol = tasimaYolu(kutu.zemin, kaynakYeri, hedefYeri);
  const gitti = gonderilen?.yer === `${kaynak}>${hedef}`;
  // Okutulan kişinin istasyonu buradan gönderilebilecek yerlerde değilse hedef boş sayılır; gerisini sunucu yine denetler.
  const hedefGecerli = hedefler.some((h) => h.deger === hedef);
  const gonderilebilir = kaynakYeri !== null && hedefYeri !== null && hedefGecerli && secili !== undefined && miktar.trim() !== '';
  const gonderiliyor = (o: FormEvent) => {
    o.preventDefault();
    if (!gonderilebilir) return;
    gonder.komut.mutate({
      malzemeId: secili.malzemeId, miktar: miktarGirdisi(miktar), partiId: secili.partiId, statuId: secili.statuId,
      kaynak: kaynakYeri, hedef: hedefYeri, not: not.trim() === '' ? null : not, kaynakKimligi: kimlik, aliciKodu: alici?.kod ?? null,
    });
  };
  if (kaynaklar.length === 0) {
    return <DurumKutusu durum="bos" mesaj="Gönderebileceğiniz istasyon yok. Depodan malzeme için İste'yi kullanın." />;
  }
  return (
    <form className="tc-stok-form" onSubmit={gonderiliyor}>
      <Secim etiket="Nereden" bosSecenek="Yer seçin" secenekler={kaynaklar} value={kaynak} onChange={(o) => { setKaynak(o.target.value); setSatir(''); }} required />
      {kaynakYeri !== null && (
        yerdeki.isPending ? <DurumKutusu durum="yukleniyor" />
          : yerdeki.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(yerdeki.error)} />
          : satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu yerde stok görünmüyor" />
          : (
            <Secim
              etiket="Malzeme"
              bosSecenek="Malzeme seçin"
              secenekler={satirlar.map((s, i) => ({
                deger: String(i),
                baslik: `${s.ad ?? s.kod ?? `#${s.malzemeId}`} · ${miktarMetni(s.miktar)} · ${statuAdi(s.statuId)}${s.partiEtiketi ? ` · ${s.partiEtiketi}` : ''}`,
              }))}
              value={satir}
              onChange={(o) => {
                setSatir(o.target.value); setMiktar('');
                // En kolay yol: rotadaki sonraki istasyon hedefe kendiliğinden yazılır; kişi isterse değiştirir.
                const s = satirlar[Number(o.target.value)]?.sonraki;
                if (s) hedefSec(yerDegeri({ istasyonId: s.istasyonId }));
              }}
              required
            />
          )
      )}
      {secili?.sonraki && (
        <p className="tc-stok-bilgi" role="status">
          <Simge ad="route" /> Rotada sonraki: {secili.sonraki.ad} (OP {secili.sonraki.opNo})
          {hedef !== yerDegeri({ istasyonId: secili.sonraki.istasyonId }) && (
            <Dugme onClick={() => hedefSec(yerDegeri({ istasyonId: secili.sonraki!.istasyonId }))}>Hedef yap</Dugme>
          )}
        </p>
      )}
      <div className="tc-stok-iki">
        <Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} required
          ipucu={secili ? `Burada ${miktarMetni(secili.miktar)} var; statü değişmez.` : undefined} />
        <Secim etiket="Nereye" bosSecenek="Hedef seçin" secenekler={hedefler} value={hedef} onChange={(o) => hedefSec(o.target.value)} required
        />
      </div>
      {alici && hedefGecerli && <p className="tc-stok-bilgi" role="status">{ELDEN_NOTU(alici.ad)}</p>}
      {alici && hedef !== '' && !hedefGecerli && (
        <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{alici.ad ?? 'Okutulan kişi'} buradan teslim edilebilecek bir istasyonda değil; listeden bir hedef seçin.</p>
      )}
      {yol && kaynakYeri && hedefYeri && (
        <TasimaYolu key={`${kaynak}>${hedef}>${gitti ? gonderilen?.sira : 0}`} yol={yol} kaynakAd={yerAdi(kutu, kaynakYeri)} hedefAd={yerAdi(kutu, hedefYeri)}
          etiket={!gitti ? 'taşıma yolu' : araAlanaMi ? 'bırakıldı' : 'gönderildi; teslim alınınca sepette görünür'} />
      )}
      <div className="tc-stok-eylem">
        <Dugme simge="scan" onClick={() => setOkutAcik(true)}>Nereye: QR okut</Dugme>
        {kutu.harita && <Dugme simge="grid" onClick={() => setHaritaAcik(true)}>Haritadan seç</Dugme>}
      </div>
      {okutAcik && <HedefOkutucu hedefler={hedefler} kapat={() => setOkutAcik(false)} sec={(d, a) => { setHedef(d); setAlici(a); setOkutAcik(false); }} />}
      {haritaAcik && kutu.harita && (
        <HaritaSecici kutu={kutu} haritasi={kutu.harita} kapat={() => setHaritaAcik(false)} sec={(konumId) => { hedefSec(yerDegeri({ konumId })); setHaritaAcik(false); }} />
      )}
      <Girdi etiket="Not" maxLength={200} value={not} onChange={(o) => setNot(o.target.value)} />
      <div className="tc-stok-sag">
        <Dugme tur="birincil" simge="upload" type="submit" disabled={!gonderilebilir} yukleniyor={gonder.komut.isPending}>Teslim et</Dugme>
      </div>
      {gonder.onayPenceresi}
    </form>
  );
}

const sepetAnahtari = (istasyonId: number) => [...KUTU, 'sepet', istasyonId] as const;
// İstasyon sepeti (kart #1353): istasyona teslim alınan ve orada üretilen malzeme, getiren ya da üreten kişiyle. Kapsamdaki
// herkes görür ve gönderebilir; sayımla statü dönüşümü de burada görünür (stok aynı istasyon konumundadır).
// Soru 89 ve 95 a: sepette hepsi görünür; Üretilen ve Teslim alınan süzer (satıra son giren hareket). Sepetim herkesin kendi sepetidir (Soru 133).
type SepetSuzgeci = 'hepsi' | 'uretim' | 'teslim' | 'depo';
const SUZGECLER: readonly { anahtar: SepetSuzgeci; baslik: string }[] = [
  { anahtar: 'hepsi', baslik: 'Hepsi' }, { anahtar: 'uretim', baslik: 'Üretilen' }, { anahtar: 'teslim', baslik: 'Teslim alınan' }, { anahtar: 'depo', baslik: 'Sepetim' },
];
function Sepet({ kutu, depoSepeti, buradaki }: { kutu: TeslimKutusuCevabi; depoSepeti: boolean; buradaki: number | null }) {
  const depocu = useIslem('stok.transfer');
  const [suzgec, setSuzgec] = useState<SepetSuzgeci>(depoSepeti ? 'depo' : 'hepsi');
  const [istasyon, setIstasyon] = useState(() => String(buradaki ?? kutu.istasyonlar[0]?.id ?? ''));
  const istasyonId = Number(istasyon);
  const sepet = useQuery({
    queryKey: sepetAnahtari(istasyonId),
    queryFn: () => api.get<IstasyonSepetiCevabi>(`/stok/teslim-kutusu/sepet?istasyonId=${istasyonId}`),
    enabled: istasyonId > 0 && suzgec !== 'depo',
  });
  const suzgecler = (
    <div className="tc-stok-eylem" role="group" aria-label="Sepet süzgeci">
      {SUZGECLER.map((x) => (
        <Dugme key={x.anahtar} tur={suzgec === x.anahtar ? 'birincil' : 'ikincil'} aria-pressed={suzgec === x.anahtar} onClick={() => setSuzgec(x.anahtar)}>{x.baslik}</Dugme>
      ))}
    </div>
  );
  if (suzgec === 'depo') return <>{suzgecler}<DepoSepeti /></>;
  if (kutu.istasyonlar.length === 0) return <>{suzgecler}<DurumKutusu durum="bos" mesaj="Kapsamınızda istasyon yok; sepet istasyona bağlıdır." /></>;
  const satirlar = (sepet.data?.satirlar ?? []).filter((x) => suzgec === 'hepsi' || x.koken === suzgec);
  return (
    <>
      {suzgecler}
      {kutu.istasyonlar.length > 1 && (
        <Secim etiket="İstasyon" secenekler={kutu.istasyonlar.map((i) => ({ deger: String(i.id), baslik: `${i.ad} (${i.kod})` }))} value={istasyon}
          onChange={(o) => setIstasyon(o.target.value)} />
      )}
      {sepet.isPending ? <DurumKutusu durum="yukleniyor" />
        : sepet.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(sepet.error)} yenile={() => { void sepet.refetch(); }} />
        : satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj={suzgec === 'hepsi' ? `${sepet.data.istasyon.ad} sepeti boş` : `${sepet.data.istasyon.ad} sepetinde bu süzgece uyan satır yok`} />
        : (
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label={`${sepet.data.istasyon.ad} sepeti`}>
            {satirlar.map((x) => <SepetSatiri key={`${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`} istasyonId={istasyonId} x={x} emirler={sepet.data.emirler} />)}
          </ul>
        )}
    </>
  );
}

// Teslim et'te hedef seçimi için depo zemini dama tahtası: konum olarak açılmış kare seçilir.
// Teslim yerinin etiketi okutulur; yalnız buradan gönderilebilecek hedeflerden biri seçilir, gerisini sunucu yine denetler.
function HedefOkutucu({ hedefler, kapat, sec }: { hedefler: Secenek[]; kapat: () => void; sec: (deger: string, alici: OkutulanHedef['alici']) => void }) {
  const [ileti, setIleti] = useState<string | null>(null);
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<OkutCozCevabi>(`/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`),
    onSuccess: (c) => {
      const y = okutulanHedef(c);
      if (typeof y === 'string') { setIleti(y); return; }
      const deger = yerDegeri(y.yer);
      if (hedefler.some((h) => h.deger === deger)) { sec(deger, y.alici); return; }
      setIleti(`${c.tur === 'yer' ? c.yer.ad ?? c.yer.kod : c.tur === 'kisi' ? c.istasyon.ad : 'Bu yer'} buradan teslim edilebilecek yerlerde yok; listeden bir hedef seçin.`);
    },
  });
  return (
    <Pencere acik kapat={kapat} baslik="Nereye: QR okut">
      <div className="tc-stok-form">
        <KodOkuyucu okundu={(kod) => { setIleti(null); coz.mutate(kod); }} bekliyor={coz.isPending} ipucu="Teslim yerinin etiketi (istasyon, raf, alan) ya da alacak kişinin ekrandaki kodu." />
        {coz.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(coz.error)}</p>}
        {ileti && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{ileti}</p>}
      </div>
    </Pencere>
  );
}

function HaritaSecici({ kutu, haritasi, kapat, sec }: { kutu: TeslimKutusuCevabi; haritasi: NonNullable<TeslimKutusuCevabi['harita']>; kapat: () => void; sec: (konumId: number) => void }) {
  const { bina, kareBoyu } = haritasi;
  const nSut = Math.ceil((bina.x1 - bina.x0) / kareBoyu - 0.01), nSat = Math.ceil((bina.z1 - bina.z0) / kareBoyu - 0.01);
  const konumlar = new Map(kutu.depoKonumlari.map((k) => [k.kod, k]));
  return (
    <Pencere acik kapat={kapat} baslik="Haritadan seç">
      <div className="tc-stok-kaydir">
        <table className="tc-stok-dama">
          <tbody>
            {Array.from({ length: nSat }, (_, jj) => nSat - 1 - jj).map((j) => (
              <tr key={j}>
                <th scope="row">{j + 1}</th>
                {Array.from({ length: nSut }, (_, i) => {
                  const kare = `${sutunAdi(i)}${j + 1}`, kn = konumlar.get(`D-${kare}`);
                  return (
                    <td key={i}>
                      <button type="button" className={`tc-stok-kare ${kn ? 'tc-stok-kare-konum' : ''}`} disabled={!kn} onClick={() => kn && sec(kn.id)}
                        aria-label={`Kare ${kare}${kn ? '' : ', konum değil'}`}>
                        <span className="tc-stok-mono">{kare}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr><th />{Array.from({ length: nSut }, (_, i) => <th key={i} scope="col">{sutunAdi(i)}</th>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="tc-stok-not">Harfler giriş kenarı boyunca, numaralar içeri. Yalnız konum olarak açılmış kare seçilir.</p>
    </Pencere>
  );
}

// Malzeme iste (soru 89, 96): depodan ya da malzemenin bulunduğu istasyondan istenir; istasyondan istenen o istasyonun yetkilisine düşer.
// Malzeme başka birindeyse Okutarak al bölümü onay beklemeden alır.
function MalzemeIste({ kutu, okunan }: { kutu: TeslimKutusuCevabi; okunan: Okunan | null }) {
  const statuAdi = useStatuAdi();
  const [kaynak, setKaynak] = useState('');
  const [ara, setAra] = useState('');
  const [malzemeId, setMalzemeId] = useState<number | null>(null);
  const [miktar, setMiktar] = useState('');
  const [istasyon, setIstasyon] = useState(() => String(kutu.buradakiIstasyonId ?? ''));
  const [not, setNot] = useState('');
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const aranan = ara.trim();
  const malzemeler = useQuery({
    queryKey: [...KUTU, 'malzemeler', aranan],
    queryFn: () => api.get<IstekMalzemeleriCevabi>(`/stok/istek-malzemeleri?${new URLSearchParams({ ara: aranan })}`),
    enabled: aranan.length >= 2,
  });
  const yerler = useQuery({
    queryKey: [...KUTU, 'malzeme-yerleri', malzemeId ?? 0],
    queryFn: () => api.get<MalzemeYerleriCevabi>(`/stok/teslim-kutusu/malzeme-yerleri?malzemeId=${malzemeId}`),
    enabled: malzemeId !== null,
  });
  // Aynı istasyon birden çok statüyle gelebilir; kaynak seçimi istasyon başınadır, statüyü kabul eden seçer.
  const kaynakIstasyonlar = [...new Map((yerler.data?.istasyonlar ?? []).filter((y) => String(y.istasyonId) !== istasyon).map((y) => [y.istasyonId, y])).values()];
  const kaynakAd = kaynakIstasyonlar.find((y) => String(y.istasyonId) === kaynak)?.ad;
  const iste = useStokKomutu((g: IstekAcGovdesi) => korumaliPost('/stok/malzeme-istekleri/ac', g), kaynakAd ? `İstek ${kaynakAd} istasyonuna gönderildi.` : 'İstek depoya gönderildi.', () => {
    setMalzemeId(null); setMiktar(''); setNot(''); setKaynak(''); setKimlik(yeniKimlik());
  });
  const secili = malzemeler.data?.malzemeler.find((m) => m.id === malzemeId);
  // İstasyondan istenen istek bir istasyona teslim edilir; sunucu da denetler.
  const istasyondan = kaynak !== '' && kaynakAd !== undefined;
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    if (secili === undefined || miktar.trim() === '' || (istasyondan && istasyon === '')) return;
    iste.komut.mutate({
      malzemeId: secili.id, miktar: miktarGirdisi(miktar), istasyonId: istasyon === '' ? null : Number(istasyon),
      not: not.trim() === '' ? null : not, kaynakKimligi: kimlik, ...(istasyondan ? { kaynakIstasyonId: Number(kaynak) } : {}),
    });
  };
  const okutulan = okunan?.cevap.tur === 'malzeme' ? { kod: okunan.kod } : okunan?.cevap.tur === 'yer' ? { yerKodu: okunan.kod } : {};
  return (
    <>
      <form className="tc-stok-form" onSubmit={gonder}>
        <Girdi etiket="Malzeme ara" type="search" placeholder="Kod ya da ad (en az 2 harf)" value={ara} onChange={(o) => { setAra(o.target.value); setMalzemeId(null); }} />
        {aranan.length >= 2 && (
          malzemeler.isPending ? <DurumKutusu durum="yukleniyor" />
            : malzemeler.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(malzemeler.error)} />
            : malzemeler.data.malzemeler.length === 0 ? <DurumKutusu durum="bos" mesaj="Katalogda eşleşen malzeme yok" />
            : (
              <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Malzemeler">
                {/* Seçilince yalnız seçilen kalır; "Değiştir" listeyi geri açar. */}
                {malzemeler.data.malzemeler.filter((m) => malzemeId === null || m.id === malzemeId).map((m) => {
                  const yok = Number(m.kullanilabilir) <= 0;
                  return (
                    <li key={m.id}>
                      <button type="button" className="tc-stok-is tc-stok-teslim-secim" aria-pressed={m.id === malzemeId} onClick={() => { setMalzemeId(m.id); setKaynak(''); }}>
                        <div>
                          <strong>{m.ad ?? m.kod}</strong>
                          <span className="tc-stok-mono">{m.kod}</span>
                          {m.statuler.map((s) => <span key={s.statuId}>{statuAdi(s.statuId)}: {birimliMiktar(s.miktar, m.birim)}</span>)}
                        </div>
                        {yok ? <Rozet ton="hata">Stokta yok</Rozet> : <Rozet ton="tamam">{birimliMiktar(m.kullanilabilir, m.birim)}</Rozet>}
                      </button>
                      {m.id === malzemeId && <Dugme simge="edit" onClick={() => setMalzemeId(null)}>Değiştir</Dugme>}
                    </li>
                  );
                })}
              </ul>
            )
        )}
        {secili !== undefined && (
          <>
            {Number(secili.kullanilabilir) <= 0 && kaynakIstasyonlar.length === 0 && <p className="tc-stok-not">Stokta yok: istek açılır, depo ve satın alma görür.</p>}
            <Secim etiket="Nereden" value={kaynak} onChange={(o) => setKaynak(o.target.value)}
              secenekler={[
                { deger: '', baslik: `Depo · ${birimliMiktar(yerler.data?.depo ?? secili.kullanilabilir, secili.birim)}` },
                ...kaynakIstasyonlar.map((y) => ({ deger: String(y.istasyonId), baslik: `${y.ad} (${y.kod}) · ${birimliMiktar(y.miktar, secili.birim)}` })),
              ]}
              ipucu={istasyondan ? 'İstek o istasyonun yetkilisine düşer; kabul edince teslim gelir.' : undefined} />
            <div className="tc-stok-iki">
              <Girdi etiket={`Miktar${secili.birim ? ` (${secili.birim})` : ''}`} inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} required />
              <Secim
                etiket="Teslim yeri"
                bosSecenek={istasyondan ? 'İstasyon seçin' : 'Bana (istasyonsuz)'}
                secenekler={kutu.istasyonlar.map((i) => ({ deger: String(i.id), baslik: `${i.ad} (${i.kod})` }))}
                value={istasyon}
                onChange={(o) => setIstasyon(o.target.value)}
              />
            </div>
            <Girdi etiket="Not" maxLength={200} value={not} onChange={(o) => setNot(o.target.value)} />
            <div className="tc-stok-sag">
              <Dugme tur="birincil" simge="plus" type="submit" disabled={miktar.trim() === '' || (istasyondan && istasyon === '')} yukleniyor={iste.komut.isPending}>İste</Dugme>
            </div>
          </>
        )}
      </form>
      <OkutarakAl kutu={kutu} baslangic={okutulan} />
      <h3 className="tc-stok-teslim-baslik">İsteklerim</h3>
      {kutu.isteklerim.length === 0 ? <p className="tc-stok-not">Açık isteğiniz yok.</p> : (
        <ul className="tc-stok-isler tc-stok-teslim-liste tc-stok-isteklerim">
          {kutu.isteklerim.map((i) => (
            <li key={i.id} className="tc-stok-is">
              <div>
                <strong>{i.malzemeAd ?? `Malzeme #${i.malzemeId}`} · {i.durum === 'teslim' && i.karsilanan !== null ? `${miktarMetni(i.karsilanan)} / ${miktarMetni(i.miktar)} teslim` : miktarMetni(i.miktar)}</strong>
                <span>{i.kaynakIstasyonAd ? `${i.kaynakIstasyonAd} → ` : ''}{i.istasyonAd ?? 'Bana'} · {zamanMetni(i.acilis)}</span>
                {i.redNedeni && <span>Red: {i.redNedeni}</span>}
                <span className="tc-stok-mono">{i.no}</span>
              </div>
              <Rozet ton={istekDurumu(i).ton}>{istekDurumu(i).etiket}</Rozet>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export const ustEylemler: readonly UstEylem[] = [
  { anahtar: 'malzeme-teslim', sira: 100, islem: 'stok.istek', dugme: TeslimDugmesi },
];
