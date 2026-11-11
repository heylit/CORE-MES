import { useQuery } from '@tanstack/react-query';
import type { DepoSevkCevabi, DepoSevkSatiri, IsKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { MiniPanoIzgarasi, MiniPanoKutucugu } from '../../ortak/arayuz/MiniPano.tsx';
import type { MiniPano } from '../../ortak/rota/mini-pano.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

// Stok mini panosu: depo ve sevk işleri sıfıra inmesi gereken sayılardır; tıklanınca ana pencerede o liste açılır.
// Kabuk bu dosyayı açılışta yükler: stok ekranlarının ortak dosyaları (ortak.tsx, depo-sevk.ts) ithal edilmez, sorgu anahtarları aynıdır.
// Sayılar yalnız var olan uçlardan gelir (iş kutusu, depo sevk); yetkisi olmayana uç null döner ya da çağrılmaz, "—" görünür.
const YENILEME_MS = 60_000;
const SURE = { zamanAsimiMs: 15_000 };

interface StokPanoVerisi {
  // undefined: yükleniyor; null: yetki ya da veri yok.
  kutu: IsKutusuCevabi | null | undefined;
  sevk: readonly DepoSevkSatiri[] | null | undefined;
  guncelleme: number | undefined;
}

function useStokPanoVerisi(): StokPanoVerisi {
  const islemler = useOturum().data?.islemler ?? [];
  const sevkYetkisi = islemler.includes('stok.cikis') || islemler.includes('stok.giris');
  const k = useQuery({
    queryKey: anahtarlar.isKutusu,
    queryFn: () => api.get<IsKutusuCevabi>('/stok/is-kutusu', SURE),
    refetchInterval: YENILEME_MS,
    refetchIntervalInBackground: true,
  });
  // Depo sevk ekranıyla aynı anahtar: liste orada açıksa tek istek.
  const s = useQuery({
    queryKey: anahtarlar.liste('depo-sevk', {}),
    queryFn: () => api.get<DepoSevkCevabi>('/stok/depo-sevk', SURE),
    enabled: sevkYetkisi,
    select: (c) => c.satirlar,
    refetchInterval: YENILEME_MS,
    refetchIntervalInBackground: true,
  });
  return {
    kutu: k.isError ? null : k.data,
    sevk: !sevkYetkisi || s.isError ? null : s.data,
    guncelleme: Math.max(k.dataUpdatedAt, s.dataUpdatedAt) || undefined,
  };
}

function toplam(...degerler: (number | null | undefined)[]): number | null | undefined {
  if (degerler.some((d) => d === undefined)) return undefined;
  const sayilar = degerler.filter((d): d is number => typeof d === 'number');
  return sayilar.length === 0 ? null : sayilar.reduce((a, b) => a + b, 0);
}

function sevkSayisi(sevk: StokPanoVerisi['sevk'], is: DepoSevkSatiri['is']): number | null | undefined {
  return sevk === undefined || sevk === null ? sevk : sevk.filter((r) => r.is === is).length;
}

export function gecenSure(zaman: string, simdi: number): string {
  const dakika = Math.max(0, Math.round((simdi - new Date(zaman).getTime()) / 60_000));
  if (dakika < 60) return `${dakika} dk`;
  const saat = Math.round(dakika / 60);
  return saat < 24 ? `${saat} sa` : `${Math.round(saat / 24)} gün`;
}

function enEskiMetni(sevk: StokPanoVerisi['sevk'], is: DepoSevkSatiri['is'], metin: string): string {
  if (!sevk) return metin;
  const zamanlar = sevk.filter((r) => r.is === is).map((r) => r.tetiklendi).sort();
  return zamanlar[0] === undefined ? metin : `en eskisi ${gecenSure(zamanlar[0], Date.now())}`;
}

// Düzeltilecek: eksi bakiye, defter farkı ve Logo'ya gidemeyen hareket; üçü de stoğun doğruluğunu bozar.
const duzeltilecek = (k: StokPanoVerisi['kutu']) =>
  k === undefined || k === null ? k : toplam(k.eksiBakiye, k.defterFarki ?? null, k.logoHatasi);

function SevkeCikacak({ v }: { v: StokPanoVerisi }) {
  return <MiniPanoKutucugu baslik="Sevke çıkacak" simge="truck" sayi={sevkSayisi(v.sevk, 'cikis')} altMetin={enEskiMetni(v.sevk, 'cikis', 'son çıkış bekliyor')} ton="uyari" yol="/stok/depo-sevk" />;
}
function GelenKabul({ v }: { v: StokPanoVerisi }) {
  return <MiniPanoKutucugu baslik="Gelen sevk" simge="down" sayi={sevkSayisi(v.sevk, 'kabul')} altMetin={enEskiMetni(v.sevk, 'kabul', 'kabul bekliyor')} yol="/stok/depo-sevk" />;
}
function IstekTeslim({ v }: { v: StokPanoVerisi }) {
  return <MiniPanoKutucugu baslik="Malzeme isteği" simge="list" sayi={v.kutu === undefined || v.kutu === null ? v.kutu : (v.kutu.teslimBekleyenIstek ?? null)} altMetin="teslim bekliyor" ton="uyari" yol="/stok/hazirlik" />;
}
function RafaYerlesecek({ v }: { v: StokPanoVerisi }) {
  return <MiniPanoKutucugu baslik="Rafa yerleşecek" simge="pallet" sayi={v.kutu === null ? null : v.kutu?.kabuldeBekleyen} altMetin="mal kabul alanında" yol="/stok/malzemeler?durum=kabulde" />;
}
function SayimBekleyen({ v }: { v: StokPanoVerisi }) {
  return <MiniPanoKutucugu baslik="Sayım bekleyen" simge="target" sayi={v.kutu === null ? null : v.kutu?.sayimBekleyen} altMetin="dolu konum" yol="/stok?sayim=1" />;
}
function Duzeltilecek({ v }: { v: StokPanoVerisi }) {
  return <MiniPanoKutucugu baslik="Düzeltilecek" simge="alert" sayi={duzeltilecek(v.kutu)} altMetin="eksi, defter, Logo" ton="dikkat" yol="/stok" />;
}

// Satın alma panosu gibi tek ızgara, riskten işe (3016 a).
export function StokPanosu() {
  const v = useStokPanoVerisi();
  return (
    <MiniPanoIzgarasi guncelleme={v.guncelleme}>
      <Duzeltilecek v={v} />
      <SevkeCikacak v={v} />
      <IstekTeslim v={v} />
      <GelenKabul v={v} />
      <RafaYerlesecek v={v} />
      <SayimBekleyen v={v} />
    </MiniPanoIzgarasi>
  );
}

export const miniPanolar: readonly MiniPano[] = [{
  anahtar: 'stok', sira: 110, baslik: 'Stok ve sevk', simge: 'box',
  islem: 'sayfa.stok', veya: ['stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.toplama'],
  ekran: StokPanosu,
}];
