import { Navigate, useLocation } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Ayarlar } from './Ayarlar.tsx';
import { BaslangicStogu } from './BaslangicStogu.tsx';
import { Depo } from './Depo.tsx';
import { DepoSevk } from './DepoSevk.tsx';
import { Fis } from './Fis.tsx';
import { Hareketler } from './Hareketler.tsx';
import { MalzemeFisi } from './MalzemeFisi.tsx';
import { MalzemeFisleri } from './MalzemeFisleri.tsx';
import { EskiToplamaYolu, Hazirlik } from './Hazirlik.tsx';
import { IsKutusu } from './IsKutusu.tsx';
import { KomutKarti } from './KomutKarti.tsx';
import { KonumAyrinti } from './KonumAyrinti.tsx';
import { Konumlar } from './Konumlar.tsx';
import { MalKabul } from './MalKabul.tsx';
import { MalKabulAyrinti } from './MalKabulAyrinti.tsx';
import { kuyrukDinleyicisiKur } from './irsaliye-kuyrugu.ts';
import { MalzemeAyrinti } from './MalzemeAyrinti.tsx';
import { OkutYonlendir } from './OkutYonlendir.tsx';
import { Malzemeler } from './Malzemeler.tsx';
import { MALZEME_SEKME_YOLLARI } from './MalzemeSekmeleri.tsx';
import { Aparatlar, KesiciTakimlar, Kimyasallar } from './TurListesi.tsx';
import { Raflar } from './Raflar.tsx';
import { RefakatKartlari } from './RefakatKartlari.tsx';
import { SayimOnaylari } from './SayimOnaylari.tsx';
import { DefterFarklari } from './DefterFarklari.tsx';
import { SahipsizStatulu } from './SahipsizStatulu.tsx';
import { Sepet } from './Sepet.tsx';
import { SeriListeler } from './SeriListeler.tsx';
import { YerlesimDuzenleyici } from './YerlesimDuzenleyici.tsx';

// 3063 dilim 2: cihazda bekleyen irsaliye, hangi sayfa açık olursa olsun bağlantı gelince gider.
kuyrukDinleyicisiKur();

const SayimYonlendir = () => <OkutYonlendir sabitKip="say" />;
// Tür listelerinin eski adresleri (ikinci menü maddeleriydi, 2896'da Malzemeler sekmesi oldu): yer imi yeni adrese gider, sorgu korunur.
const eskiTurAdresi = (yol: string) => function EskiTurAdresi() {
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: yol, search, hash }} />;
};

// Alt yollar `/stok` sayfasına aittir; ikinci menüyü kabuk `STOK_IKINCI_MENU` verisinden çizer.
export const rotalar: ModulRotasi[] = [
  { yol: '/stok', ekran: IsKutusu },
  { yol: '/stok/okut', ekran: OkutYonlendir },
  { yol: '/stok/sepet', ekran: Sepet },
  { yol: '/stok/fisler/:id', ekran: Fis },
  { yol: '/stok/hazirlik', ekran: Hazirlik },
  { yol: '/stok/hazirlik/:id', ekran: Hazirlik },
  { yol: '/stok/toplama', ekran: EskiToplamaYolu },
  { yol: '/stok/depo', ekran: Depo },
  { yol: '/stok/yerlesim', ekran: YerlesimDuzenleyici },
  { yol: '/stok/toplama/:id', ekran: EskiToplamaYolu },
  { yol: '/stok/mal-kabul', ekran: MalKabul },
  { yol: '/stok/baslangic-stogu', ekran: BaslangicStogu },
  { yol: '/stok/depo-sevk', ekran: DepoSevk },
  { yol: '/stok/istekler', ekran: EskiToplamaYolu },
  { yol: '/stok/mal-kabul/:id', ekran: MalKabulAyrinti },
  { yol: '/stok/malzemeler', ekran: Malzemeler },
  // Sabit sekme yolları :id'den önce eşlenir.
  { yol: MALZEME_SEKME_YOLLARI.kimyasallar, ekran: Kimyasallar },
  { yol: MALZEME_SEKME_YOLLARI['kesici-takimlar'], ekran: KesiciTakimlar },
  { yol: MALZEME_SEKME_YOLLARI.aparatlar, ekran: Aparatlar },
  { yol: '/stok/malzemeler/:id', ekran: MalzemeAyrinti },
  { yol: '/stok/kimyasallar', ekran: eskiTurAdresi(MALZEME_SEKME_YOLLARI.kimyasallar) },
  { yol: '/stok/kesici-takimlar', ekran: eskiTurAdresi(MALZEME_SEKME_YOLLARI['kesici-takimlar']) },
  { yol: '/stok/aparatlar', ekran: eskiTurAdresi(MALZEME_SEKME_YOLLARI.aparatlar) },
  { yol: '/stok/hareketler', ekran: Hareketler },
  { yol: '/stok/refakat-kartlari', ekran: RefakatKartlari },
  { yol: '/stok/malzeme-fisleri', ekran: MalzemeFisleri },
  { yol: '/stok/malzeme-fisleri/:id', ekran: MalzemeFisi },
  { yol: '/stok/okutarak-sayim', ekran: SayimYonlendir },
  { yol: '/stok/seri-listeler', ekran: SeriListeler },
  { yol: '/stok/komut-karti', ekran: KomutKarti },
  { yol: '/stok/sayim-onaylari', ekran: SayimOnaylari },
  { yol: '/stok/defter-farklari', ekran: DefterFarklari },
  { yol: '/stok/sahipsiz-statulu', ekran: SahipsizStatulu },
  { yol: '/stok/konumlar', ekran: Konumlar },
  { yol: '/stok/konumlar/:id', ekran: KonumAyrinti },
  { yol: '/stok/raflar', ekran: Raflar },
  { yol: '/stok/raflar/:id', ekran: Raflar },
  { yol: '/stok/ayarlar', ekran: Ayarlar },
];
