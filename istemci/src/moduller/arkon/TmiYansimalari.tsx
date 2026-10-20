import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { YansimaSatiri, YansimaSonucu, YansimaYenidenCevabi, YansimalarCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { Dugme, DurumKutusu, IsaretKutusu, Kart, Rozet, Secim, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import './arkon.css';

// Arkon'un yazdığı ama TMI üretim emrine geçmeyen olay ve sayımlar (kart #243). Bekleyen yeniden denenir; hatalı olan işlemle yeniden kuyruğa alınır; ötekiler kalıcıdır.
export const SONUC_ADLARI: Record<YansimaSonucu, { ad: string; ton: RozetTonu }> = {
  bekliyor: { ad: 'Bekliyor', ton: 'bilgi' },
  reddedildi: { ad: 'Reddedildi', ton: 'hata' },
  eslenemedi: { ad: 'Eşlenemedi', ton: 'uyari' },
  hatali: { ad: 'Hatalı', ton: 'hata' },
};
const TUR_ADLARI: Record<string, string> = { events: 'Durum', counts: 'Sayım' };
const SECENEKLER = Object.entries(SONUC_ADLARI).map(([deger, { ad }]) => ({ deger, baslik: ad }));
const SAYFA_BOYU = 50;

const zaman = (z: string) => new Date(z).toLocaleString('tr-TR');

const SUTUNLAR: readonly Sutun<YansimaSatiri>[] = [
  { anahtar: 'zaman', baslik: 'Kayıt zamanı', kirilmaz: true, hucre: (y) => zaman(y.kayit.zaman) },
  {
    anahtar: 'sonuc',
    baslik: 'Durum',
    hucre: (y) => (
      <span className="tc-arkon-yansima-durum">
        <Rozet ton={SONUC_ADLARI[y.sonuc].ton}>{SONUC_ADLARI[y.sonuc].ad}</Rozet>
        {y.gizliTur !== null && <Rozet ton="pasif">{`Gizlenen: ${y.gizliTur}`}</Rozet>}
      </span>
    ),
  },
  { anahtar: 'emir', baslik: 'Emir', mono: true, hucre: (y) => y.kayit.emirNo ?? (y.emirId === null ? null : `#${y.emirId}`) },
  { anahtar: 'tur', baslik: 'Kayıt', hucre: (y) => TUR_ADLARI[y.kayit.tur] ?? y.kayit.tur },
  { anahtar: 'neden', baslik: 'Neden', hucre: (y) => (y.neden !== null && y.sonuc === 'bekliyor' && y.deneme > 0 ? `${y.neden} (deneme ${y.deneme})` : y.neden) },
];

// Kullanıcının düzeltebileceği eşlenemeyen satır: emri açar (kart #1285). Neden metinleri sunucudadır (arkon/kurallar.ts PAKET_ADIM_SIRASI,
// paketIstasyonuReddi); başı eşleşir. Adım sırası satırında emrin adımları sıradaki adımı gösterir.
const EMIR_BAGLANTILARI: readonly { bas: string; etiket: string }[] = [
  { bas: 'Paket başka adımın', etiket: 'Sıradaki adımı aç' },
  { bas: 'Paket başka istasyonun', etiket: 'Emri aç' },
];

export function emirBaglantisi(y: Pick<YansimaSatiri, 'sonuc' | 'neden' | 'emirId'>): { etiket: string; yol: string } | null {
  if (y.sonuc !== 'eslenemedi' || y.emirId === null || y.neden === null) return null;
  const neden = y.neden;
  const b = EMIR_BAGLANTILARI.find((x) => neden.startsWith(x.bas));
  return b === undefined ? null : { etiket: b.etiket, yol: `/uretim-emirleri/${y.emirId}` };
}

// Yeniden deneme sonucu: yazılan satır listeden düşer, ötekinde yeni durum ve neden.
const yenidenSonucu = (c: YansimaYenidenCevabi): string =>
  c.sonuc === 'yazildi' ? 'Kayıt TMI\'ye yazıldı.' : `Kayıt yeniden denendi: ${SONUC_ADLARI[c.sonuc].ad}${c.neden === null ? '' : ` (${c.neden})`}.`;

export function TmiYansimalari() {
  const istemci = useQueryClient();
  const oturum = useOturum();
  // Yeniden kuyruğa alma ayrı işlemdir (#243): listeyi okuyan herkes yeniden deneyemez.
  const yenileyebilir = oturum.data?.islemler.includes('arkon.yansima-yeniden') ?? false;
  const yeniden = useMutation({
    mutationFn: (id: number) => api.post<YansimaYenidenCevabi>(`/arkon/tmi-yansimalari/${id}/yeniden-dene`),
    onSettled: () => { void istemci.invalidateQueries({ queryKey: anahtarlar.yansimalar }); },
  });
  const emirAcabilir = oturum.data?.islemler.includes('sayfa.uretim-emirleri') ?? false;
  const sutunlar: readonly Sutun<YansimaSatiri>[] = yenileyebilir || emirAcabilir ? [...SUTUNLAR, {
    anahtar: 'islem',
    baslik: 'İşlem',
    hucre: (y) => {
      if (yenileyebilir && y.sonuc === 'hatali') {
        return (
          <Dugme simge="rotate" onClick={() => yeniden.mutate(y.id)} yukleniyor={yeniden.isPending && yeniden.variables === y.id} disabled={yeniden.isPending}>
            Yeniden dene
          </Dugme>
        );
      }
      const b = emirAcabilir ? emirBaglantisi(y) : null;
      return b === null ? null : <Link to={b.yol}>{b.etiket}</Link>;
    },
  }] : SUTUNLAR;
  const [sonuc, sonucYaz] = useState<YansimaSonucu | ''>('');
  const [sayfa, sayfaYaz] = useState(1);
  // Beklenen ve kendiliğinden çözülecek satırlar varsayılan olarak gizlenir; kayıtta kalır, türü ve sayısı listenin üstünde yazar.
  const [gizlenenler, gizlenenlerYaz] = useState(false);
  const sorgu = new URLSearchParams({
    sayfa: String(sayfa), sayfaBoyu: String(SAYFA_BOYU), ...(sonuc === '' ? {} : { sonuc }), ...(gizlenenler ? { gizlenenler: 'true' } : {}),
  });
  const liste = useQuery({
    queryKey: [...anahtarlar.yansimalar, sonuc, sayfa, gizlenenler],
    queryFn: () => api.get<YansimalarCevabi>(`/arkon/tmi-yansimalari?${sorgu.toString()}`),
    placeholderData: keepPreviousData,
  });
  return (
    <Kart baslik="TMI'ye yazılamayan terminal kayıtları">
      <div className="tc-arkon-yansima">
        <Secim
          etiket="Durum"
          bosSecenek="Hepsi"
          secenekler={SECENEKLER}
          value={sonuc}
          onChange={(e) => { sonucYaz(e.target.value as YansimaSonucu | ''); sayfaYaz(1); }}
        />
        <IsaretKutusu etiket="Gizlenenleri göster" checked={gizlenenler} onChange={(e) => { gizlenenlerYaz(e.target.checked); sayfaYaz(1); }} />
        {liste.data && (
          <ul className="tc-arkon-gizlenenler" aria-label={gizlenenler ? 'Gizlenen türler (gösteriliyor)' : 'Gizlenen türler'}>
            {liste.data.gizlenenler.map((g) => <li key={g.kod}>{`${g.ad}: ${g.adet}`}</li>)}
          </ul>
        )}
        {yeniden.isSuccess && <p role="status">{yenidenSonucu(yeniden.data)}</p>}
        {yeniden.isError && <p role="alert">{hataIletisi(yeniden.error, 'Kayıt yeniden denenemedi.')}</p>}
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />}
        {liste.data && (
          <Tablo
            etiket="TMI'ye yazılamayan kayıtlar"
            sutunlar={sutunlar}
            satirlar={liste.data.satirlar}
            satirAnahtari={(y) => y.id}
            bosMesaj="TMI'ye yazılamayan kayıt yok"
            mesgul={liste.isPlaceholderData}
            sayfalama={{ sayfa: liste.data.sayfa, sayfaBoyu: liste.data.sayfaBoyu, toplam: liste.data.toplam, degistir: sayfaYaz }}
          />
        )}
      </div>
    </Kart>
  );
}
