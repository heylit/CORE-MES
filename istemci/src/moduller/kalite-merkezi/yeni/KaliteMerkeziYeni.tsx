import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { DurumKutusu } from '../../../ortak/arayuz/DurumKutusu.tsx';
import { Menu, type MenuOgesi } from '../../../ortak/arayuz/Menu.tsx';
import { Dugme } from '../../../ortak/arayuz/Dugme.tsx';
import { useBildirim } from '../../../ortak/arayuz/Bildirim.tsx';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { gorunumTanimi, gorunumYolu, STUDYO_YOLU, type KmGecis, type KmGorunum } from './sekmeler.ts';
import { ArsivGorunumuSaglayici } from './ArsivGorunumu.tsx';
import { TerimIsaretleri } from './TerimIsaretleri.tsx';
import { OnizlemeSaglayici } from './Onizleme.tsx';
import { kmTercihi, tercihYaz, useKmVerisi } from './veri.ts';
import { useKmYetkisi } from './yetki.ts';
import './kalite-merkezi-yeni.css';

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
  { anahtar: 'balon', baslik: 'Teknik resim balonla', gorunum: 'resimler', eski: STUDYO_YOLU },
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

  const git = (g: KmGorunum, gecis?: KmGecis) => { void gitAdres(gorunumYolu(g), { state: gecis ?? null }); };
  const gecis = (konum.state as KmGecis | null) ?? null;
  const gecisTamam = () => { void gitAdres(konum.pathname, { replace: true, state: null }); };

  // Eski sayfadaki gibi (openSettings: need('ayar')): ayar yetkisi olmayana Ayarlar açılmaz, uyarı çıkar, kişi Bugün'de kalır.
  const { bildir } = useBildirim();
  const ayarKapali = yetki.hazir && yetki.oku && tanim?.anahtar === 'ayarlar' && !yetki.ayar;
  useEffect(() => {
    if (!ayarKapali) return;
    bildir('hata', 'Bu işlem için yetkiniz yok (ayarları değiştirme).');
    void gitAdres(gorunumYolu('bugun'), { replace: true });
  }, [ayarKapali, bildir, gitAdres]);

  if (!tanim) return <DurumKutusu durum="bos" mesaj="Böyle bir görünüm yok." />;
  if (!yetki.hazir || yukleniyor || ayarKapali) return <DurumKutusu durum="yukleniyor" />;
  if (!yetki.oku) return <DurumKutusu durum="bos" mesaj="Kalite Merkezi'ni görme yetkiniz yok." />;
  if (hata || !veri) return <DurumKutusu durum="hata" mesaj={hataIletisi(hata, 'Kalite kayıtları alınamadı.')} />;

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
        <div className="tc-km-ust-eylem">
          <Dugme tur="ikincil" simge="tool" aria-pressed={atolye} onClick={atolyeDegistir}>Atölye modu</Dugme>
          {yetki.yaz && <Menu etiket="Yeni kayıt" metin="Yeni" simge="plus" ogeler={yeniIsler} />}
        </div>
      </div>
      <div className="tc-km-govde">
        <Ekran key={tanim.anahtar} veri={veri} yetki={yetki} gecis={gecis} gecisTamam={gecisTamam} git={git} atolye={atolye} />
      </div>
      <TerimIsaretleri kapali={veri.ayarlar.terimKapali === true} />
    </div>
  );
}

// TS geçişinin Kalite Merkezi ekranı (199 b). Eski adresine geçti (582, 527 1 a): sayfayı gören herkes açar, eski çerçeve bir süre
// /kalite-merkezi/eski altındadır. Gezinme kabuğun ikinci menü şeridindedir; ekran kendi bölüm sekmesini çizmez (553 1 a).
export function KaliteMerkeziYeni() {
  return (
    <OnizlemeSaglayici>
      <ArsivGorunumuSaglayici>
        <Icerik />
      </ArsivGorunumuSaglayici>
    </OnizlemeSaglayici>
  );
}
