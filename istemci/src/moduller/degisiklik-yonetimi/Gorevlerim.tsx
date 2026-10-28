import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { HAT_ASAMALARI, type GorevKapsami } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import { islemAdi } from '#paylasilan/islem-adlari.ts';
import type { GorevlerimCevabi, GorevSatiri } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Dugme, DurumKutusu, Kart, Rozet, SayfaBasligi, SayiKarti, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AciliyetMetni, HAT_ADLARI, KOK, kayitYolu } from './gosterim.tsx';
import { YeniTalep } from './talep/YeniTalep.tsx';
import './degisiklik-yonetimi.css';

const SUTUNLAR: readonly Sutun<GorevSatiri>[] = [
  { anahtar: 'is', baslik: 'İş', hucre: (g) => <div><strong>{g.adim}</strong><div className="tc-dy-kucuk tc-dy-soluk">{g.baslik}</div></div>, csv: (g) => `${g.adim}: ${g.baslik}` },
  { anahtar: 'kayit', baslik: 'Kayıt', hucre: (g) => g.no, mono: true, kirilmaz: true },
  { anahtar: 'aciliyet', baslik: 'Aciliyet', hucre: (g) => <AciliyetMetni aciliyet={g.aciliyet} />, csv: (g) => g.aciliyet },
  {
    anahtar: 'bekleme', baslik: 'Bekleme', hizala: 'sag', kirilmaz: true,
    hucre: (g) => {
      const metin = `${g.yasIsGunu} / ${g.hedefIsGunu} iş günü`;
      if (g.gecikti) return <Rozet ton="hata">{metin}</Rozet>;
      // Hedefe bir gün kala uyarı; prototipteki "near" hâli.
      return g.yasIsGunu >= g.hedefIsGunu - 1 ? <Rozet ton="uyari">{metin}</Rozet> : <span className="tc-dy-mono">{metin}</span>;
    },
    csv: (g) => `${g.yasIsGunu}/${g.hedefIsGunu}`,
  },
];
// Tüm ekip görünümünde adımı yapacak işlem (1146 b); rol adı Aşama 2'de ortak yetki matrisinden gelir.
const SORUMLU: Sutun<GorevSatiri> = { anahtar: 'sorumlu', baslik: 'Sorumlu', hucre: (g) => islemAdi(g.islem) };
const EKIP_SUTUNLARI: readonly Sutun<GorevSatiri>[] = [...SUTUNLAR.slice(0, 2), SORUMLU, ...SUTUNLAR.slice(2)];

const icerir = (g: GorevSatiri, ara: string): boolean => {
  const q = ara.toLocaleLowerCase('tr');
  return [g.adim, g.baslik, g.no].some((m) => m.toLocaleLowerCase('tr').includes(q));
};

export function Gorevlerim() {
  const oturum = useOturum();
  const gezin = useNavigate();
  const [ara, araYaz] = useState('');
  const [yeni, yeniYaz] = useState(false);
  const talepAcabilir = oturum.data?.islemler.includes('degisiklik-yonetimi.talep-ac') === true;
  const [adres, adresYaz] = useSearchParams();
  const kapsam: GorevKapsami = adres.get('kapsam') === 'ekip' ? 'ekip' : 'benim';
  const kapsamSec = (k: GorevKapsami) => { adresYaz((a) => { const y = new URLSearchParams(a); y.set('kapsam', k); return y; }, { replace: true }); };
  // Kapsam değişirken düğme sayıları ve tablo boşalmasın diye önceki cevap gösterilir.
  const s = useQuery({
    queryKey: anahtarlar.gorevlerim(kapsam), queryFn: () => api.get<GorevlerimCevabi>(`${KOK}/gorevlerim?kapsam=${kapsam}`), placeholderData: keepPreviousData,
  });
  const gorevler = s.data?.gorevler ?? [];
  const gorunen = useMemo(() => (ara.trim() === '' ? gorevler : gorevler.filter((g) => icerir(g, ara.trim()))), [gorevler, ara]);
  // Geciken sayısı yalnız kişinin listesinden bilinir; ekip görünümünde başlıkta yazılmaz.
  const geciken = kapsam === 'benim' ? gorevler.filter((g) => g.gecikti).length : 0;
  const benim = s.data?.benimSayisi ?? 0;
  const hat = new Map(s.data?.hat.map((h) => [h.asama, h.adet]));
  const acikEmir = s.data ? HAT_ASAMALARI.filter((a) => a !== 'talep').reduce((t, a) => t + (hat.get(a) ?? 0), 0) : undefined;
  const ad = oturum.data?.ad;

  const alt = s.data === undefined ? null
    : `${ad ? `${ad}. ` : ''}${benim > 0 ? `${benim} iş sizi bekliyor${geciken > 0 ? `, ${geciken} tanesi hedef süreyi aştı` : ''}.` : 'Sizi bekleyen iş yok.'}`;

  return (
    <section className="tc-dy">
      <SayfaBasligi
        baslik="Görevlerim" simge="bell" alt={alt}
        birincil={talepAcabilir ? { etiket: 'Yeni değişiklik talebi', simge: 'plus', yap: () => { yeniYaz(true); } } : undefined}
      />
      {s.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(s.error, 'Görevler alınamadı')} yenile={() => { void s.refetch(); }} />}
      {/* Karantina, frozen zone, bekleyen ilk parça ve konfigürasyon uyumu sahibi modüllerden gelir; Aşama 1'de bağlı değil (null). */}
      <div className="tc-dy-sayilar">
        <SayiKarti baslik="Açık talep" simge="edit" sayi={s.data ? (hat.get('talep') ?? 0) : undefined} hata={s.isError} />
        <SayiKarti baslik="Açık değişiklik emri" simge="rotate" sayi={acikEmir} hata={s.isError} />
        <SayiKarti baslik="Karantinadaki emir" simge="lock" sayi={null} ton="hata" altMetin="Üretim emirleri bağlanınca" />
        <SayiKarti baslik="Frozen zone’daki emir" simge="clock" sayi={null} altMetin="Plan bağlanınca" />
        <SayiKarti baslik="Bekleyen ilk parça kontrolü" simge="clipboard-check" sayi={null} ton="uyari" altMetin="Rota bağlanınca" />
        <SayiKarti baslik="Konfigürasyon uyumu" simge="layers" sayi={null} ton="hata" altMetin="Markalama bağlanınca" />
      </div>
      <div className="tc-dy-iki-bir">
        <Kart
          baslik="İş kuyruğu"
          sag={(
            <div className="tc-dy-satir-ic" role="group" aria-label="Kuyruk kapsamı">
              <Dugme tur={kapsam === 'benim' ? 'birincil' : 'ikincil'} aria-pressed={kapsam === 'benim'} onClick={() => { kapsamSec('benim'); }}>
                Benim işlerim{s.data ? ` (${s.data.benimSayisi})` : ''}
              </Dugme>
              <Dugme tur={kapsam === 'ekip' ? 'birincil' : 'ikincil'} aria-pressed={kapsam === 'ekip'} onClick={() => { kapsamSec('ekip'); }}>
                Tüm ekip{s.data ? ` (${s.data.ekipSayisi})` : ''}
              </Dugme>
            </div>
          )}
        >
          <Tablo
            etiket="İş kuyruğu" sutunlar={kapsam === 'ekip' ? EKIP_SUTUNLARI : SUTUNLAR} satirlar={gorunen} satirAnahtari={(g) => `${g.tur}-${g.id}-${g.adim}`}
            satirSec={(g) => { void gezin(kayitYolu(g.tur, g.id)); }} mesgul={s.isPending || s.isPlaceholderData}
            bosMesaj={s.isPending ? 'Yükleniyor' : ara.trim() !== '' ? 'Aramaya uyan iş yok.' : kapsam === 'ekip' ? 'Ekipte bekleyen iş yok.' : 'Sizi bekleyen iş yok. Ekibin işlerini görmek için “Tüm ekip”i seçin.'}
            arac={{ arama: { deger: ara, degistir: araYaz, yerTutucu: 'İşlerde ara' } }}
          />
          <p className="tc-dy-kucuk tc-dy-soluk">Hedef süre aciliyete göre: acil 1, yüksek 3, normal 5 iş günü. Kırmızı satırlar hedefi aştı.</p>
        </Kart>
        <div className="tc-dy-yan">
          <Kart baslik="Değişiklik hattı">
            <ol className="tc-dy-hat" aria-label="Değişiklik hattı">
              {HAT_ASAMALARI.map((a) => {
                const adet = s.data ? (hat.get(a) ?? 0) : null;
                return (
                  <li key={a} className={adet ? 'tc-dy-hat-dolu' : undefined}>
                    <span className="tc-dy-hat-sayi">{adet ?? '—'}</span>
                    <span className="tc-dy-hat-ad">{HAT_ADLARI[a]}</span>
                  </li>
                );
              })}
              {/* 1149 b: son 90 günde kapananlar; aşama değil, sayaç (vurgulanmaz). */}
              <li>
                <span className="tc-dy-hat-sayi">{s.data ? s.data.kapanan90Gun : '—'}</span>
                <span className="tc-dy-hat-ad">Kapandı (90 gün)</span>
              </li>
            </ol>
          </Kart>
          <Kart baslik="Son kayıtlar">
            {s.data && s.data.sonKayitlar.length === 0 && <DurumKutusu durum="bos" mesaj="Kayıt yok." />}
            <ul className="tc-dy-akis">
              {s.data?.sonKayitlar.slice(0, 8).map((k) => (
                <li key={`${k.tur}-${k.id}-${k.zaman}-${k.olay}`}>
                  <Link to={kayitYolu(k.tur, k.id)} className="tc-dy-akis-bag">
                    <span className="tc-dy-kucuk"><span className="tc-dy-mono">{k.kayitNo}</span> <span className="tc-dy-soluk">{zamanMetni(k.zaman)}</span></span>
                    <span>{k.ozet}</span>
                    <span className="tc-dy-kucuk tc-dy-soluk">{k.kisiAdi ?? '—'}{k.imzaAnlami !== null && ', e-imzalı'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Kart>
        </div>
      </div>
      {yeni && <YeniTalep kapat={() => { yeniYaz(false); }} />}
    </section>
  );
}
