import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { DurumKutusu } from '../../../ortak/arayuz/DurumKutusu.tsx';
import { Menu, type MenuOgesi } from '../../../ortak/arayuz/Menu.tsx';
import { Sekmeler } from '../../../ortak/arayuz/Sekmeler.tsx';
import { Dugme } from '../../../ortak/arayuz/Dugme.tsx';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { BOLUMLER, ESKI_YOL, GORUNUMLER, gorunumTanimi, gorunumYolu, type KmBolumu, type KmGecis, type KmGorunum } from './sekmeler.ts';
import { ArsivGorunumuSaglayici } from './ArsivGorunumu.tsx';
import { TerimIsaretleri } from './TerimIsaretleri.tsx';
import { OnizlemeSaglayici } from './Onizleme.tsx';
import { kmTercihi, tercihYaz, useKmVerisi, type KmVerisi } from './veri.ts';
import { useKmYetkisi } from './yetki.ts';
import './kalite-merkezi-yeni.css';

type Sayilar = Partial<Record<KmGorunum, { n: number; kotu: boolean }>>;

function sayilariHesapla(veri: KmVerisi): Sayilar {
  const s: Sayilar = {};
  for (const g of GORUNUMLER) {
    const c = g.sayac?.(veri);
    if (c) s[g.anahtar] = c;
  }
  return s;
}

// Uygulamanın secCounts'u: Parçalar, Resim ve modeller, Raporlar bölümünde sayı yoktur (alt sekmede olsa da).
const SAYISIZ_BOLUMLER: ReadonlySet<KmBolumu> = new Set(['parca', 'resim', 'rapor']);

const rozetli = (baslik: string, c: { n: number } | undefined) => (c && c.n > 0 ? `${baslik} · ${c.n}` : baslik);

// Uygulamanın "Yeni" hızlı kayıt sayfası (NEW_ACTS): yazma yetkisi olana tek düğme ve açılır liste.
const YENI_ISLER: readonly { anahtar: string; baslik: string; gorunum: KmGorunum; gecis?: KmGecis; eski?: string }[] = [
  { anahtar: 'giris', baslik: 'Giriş muayenesi', gorunum: 'muayeneler', gecis: { ac: 'yeni', on: { tur: 'Giriş' } } },
  { anahtar: 'lot', baslik: 'Lot kabul (AQL)', gorunum: 'lot-kabul', gecis: { ac: 'yeni' } },
  { anahtar: 'fai', baslik: 'İlk parça (FAI)', gorunum: 'muayeneler', gecis: { ac: 'yeni', on: { tur: 'FAI' } } },
  { anahtar: 'final', baslik: 'Proses / final muayene', gorunum: 'muayeneler', gecis: { ac: 'yeni', on: { tur: 'Final' } } },
  { anahtar: 'ncr', baslik: 'Uygunsuzluk (NCR)', gorunum: 'uygunsuzluklar', gecis: { ac: 'yeni' } },
  { anahtar: 'dof', baslik: 'DÖF / 8D', gorunum: 'dof', gecis: { ac: 'yeni' } },
  { anahtar: 'kf08', baslik: 'FOD kontrol listesi', gorunum: 'formlar', gecis: { ac: 'yeni', on: { kod: 'KF-08' } } },
  { anahtar: 'kf16', baslik: 'Proses denetimi', gorunum: 'formlar', gecis: { ac: 'yeni', on: { kod: 'KF-16' } } },
  { anahtar: 'kf19', baslik: 'Ürün durum etiketi', gorunum: 'formlar', gecis: { ac: 'yeni', on: { kod: 'KF-19' } } },
  { anahtar: 'aql', baslik: 'AQL planı belirle', gorunum: 'lot-kabul', gecis: { ac: 'plan' } },
  { anahtar: 'balon', baslik: 'Teknik resim balonla', gorunum: 'resimler', eski: `${ESKI_YOL}/resimler` },
  { anahtar: 'spc', baslik: 'Ölçüm serisi (SPC)', gorunum: 'olcum-analizi', gecis: { ac: 'yeni' } },
  { anahtar: 'kal', baslik: 'Kalibrasyon kaydı', gorunum: 'cihazlar' },
  { anahtar: 'formlar', baslik: 'Diğer formlar', gorunum: 'formlar' },
];

function Icerik() {
  const { gorunum } = useParams<{ gorunum?: string }>();
  const konum = useLocation();
  const gitAdres = useNavigate();
  const { veri, hata, yukleniyor } = useKmVerisi();
  const yetki = useKmYetkisi();
  const [atolye, atolyeYaz] = useState(() => kmTercihi().shop === true);
  const tanim = gorunumTanimi(gorunum);
  const sayilar = useMemo(() => (veri ? sayilariHesapla(veri) : {}), [veri]);

  const git = (g: KmGorunum, gecis?: KmGecis) => {
    const t = gorunumTanimi(g);
    if (t && t.ekran === null) {
      void gitAdres(`${ESKI_YOL}/${g}`);
      return;
    }
    void gitAdres(gorunumYolu(g), { state: gecis ?? null });
  };
  const gecis = (konum.state as KmGecis | null) ?? null;
  const gecisTamam = () => { void gitAdres(konum.pathname, { replace: true, state: null }); };

  if (!tanim) return <DurumKutusu durum="bos" mesaj="Böyle bir görünüm yok." />;
  if (!yetki.hazir || yukleniyor) return <DurumKutusu durum="yukleniyor" />;
  if (!yetki.oku) return <DurumKutusu durum="bos" mesaj="Kalite Merkezi'ni görme yetkiniz yok." />;
  if (hata || !veri) return <DurumKutusu durum="hata" mesaj={hataIletisi(hata, 'Kalite kayıtları alınamadı.')} />;

  const bolum = tanim.bolum;
  const bolumGorunumleri = GORUNUMLER.filter((g) => g.bolum === bolum);
  const bolumSayisi = (b: KmBolumu) => {
    if (SAYISIZ_BOLUMLER.has(b)) return undefined;
    const l = GORUNUMLER.filter((g) => g.bolum === b).map((g) => sayilar[g.anahtar]).filter((c) => c !== undefined);
    return l.length ? { n: l.reduce((a, c) => a + c.n, 0), kotu: l.some((c) => c.kotu) } : undefined;
  };
  const yeniIsler: MenuOgesi[] = YENI_ISLER.map((i) => ({
    anahtar: i.anahtar, baslik: i.baslik, sec: () => (i.eski ? void gitAdres(i.eski) : git(i.gorunum, i.gecis)),
  }));
  const Ekran = tanim.ekran;
  const atolyeDegistir = () => {
    tercihYaz({ shop: !atolye });
    atolyeYaz(!atolye);
  };

  return (
    <div className={`tc-km${atolye ? ' tc-km-atolye' : ''}`}>
      <div className="tc-km-ust">
        <Sekmeler<KmBolumu>
          etiket="Kalite Merkezi bölümleri"
          sekmeler={BOLUMLER.map((b) => ({ anahtar: b.anahtar, baslik: rozetli(b.baslik, bolumSayisi(b.anahtar)), simge: b.simge }))}
          secili={bolum}
          sec={(b) => { const ilk = GORUNUMLER.find((g) => g.bolum === b); if (ilk) git(ilk.anahtar); }}
        />
        <div className="tc-km-ust-eylem">
          <Dugme tur="ikincil" simge="tool" aria-pressed={atolye} onClick={atolyeDegistir}>Atölye modu</Dugme>
          {yetki.yaz && <Menu etiket="Yeni kayıt" metin="Yeni" simge="plus" ogeler={yeniIsler} />}
        </div>
      </div>
      {bolumGorunumleri.length > 1 && (
        <Sekmeler<KmGorunum>
          etiket={BOLUMLER.find((b) => b.anahtar === bolum)?.baslik ?? 'Bölüm'}
          sekmeler={bolumGorunumleri.map((g) => ({ anahtar: g.anahtar, baslik: rozetli(g.baslik, sayilar[g.anahtar]) }))}
          secili={tanim.anahtar}
          sec={(g) => git(g)}
        />
      )}
      <div className="tc-km-govde">
        {Ekran
          ? <Ekran key={tanim.anahtar} veri={veri} yetki={yetki} gecis={gecis} gecisTamam={gecisTamam} git={git} atolye={atolye} />
          : <DurumKutusu durum="bos" mesaj="Bu görünüm eski ekranda açılır." />}
      </div>
      <TerimIsaretleri kapali={veri.ayarlar.terimKapali === true} />
    </div>
  );
}

// TS geçişinin yeni Kalite Merkezi ekranı (199 b): alıma kadar ikinci yolda ve yalnız yöneticide (YeniEkranKapisi).
export function KaliteMerkeziYeni() {
  return (
    <YeniEkranKapisi>
      <OnizlemeSaglayici>
        <ArsivGorunumuSaglayici>
          <Icerik />
        </ArsivGorunumuSaglayici>
      </OnizlemeSaglayici>
    </YeniEkranKapisi>
  );
}
