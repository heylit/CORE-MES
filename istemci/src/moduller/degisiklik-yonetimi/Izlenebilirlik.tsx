import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  IzlenebilirlikCevabi, RevizyonStokSatiri, SapmaSatiri, SeriListeCevabi, SeriListeSatiri, SoyOperasyonu, StokHali,
} from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { DurumKutusu, Kart, Rozet, SayfaBasligi, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni } from '../../ortak/veri/liste-durumu.ts';
import { tarihMetni, tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { analizAnahtarlari } from './analiz-anahtarlari.ts';
import { DURUM_ADLARI, UYUM_ADLARI, UYUM_TONLARI, malzemeEtiketi, miktarMetni, revizyonEtiketi } from './analiz.ts';
import { KOK, kimlikOku, useKonfigurasyon } from './Konfigurasyon.tsx';
import './analiz.css';

const uyumRozeti = (u: SeriListeSatiri['uyum']) => <Rozet ton={UYUM_TONLARI[u]}>{UYUM_ADLARI[u]}</Rozet>;

const SERI_SUTUNLARI: readonly Sutun<SeriListeSatiri>[] = [
  { anahtar: 'seri', baslik: 'Seri', mono: true, kirilmaz: true, hucre: (s) => s.seriNo },
  { anahtar: 'urun', baslik: 'Ürün', hucre: (s) => s.sonUrun.kod ?? malzemeEtiketi(s.sonUrun), csv: (s) => malzemeEtiketi(s.sonUrun) },
  { anahtar: 'revizyon', baslik: 'Revizyon', hucre: (s) => `${revizyonEtiketi(s.revizyon)}${s.mod !== null ? `, mod ${s.mod}` : ''}` },
  { anahtar: 'durum', baslik: 'Durum', hucre: (s) => (s.durum ? DURUM_ADLARI[s.durum] : '—') },
  { anahtar: 'uyum', baslik: 'Uyum', hucre: (s) => uyumRozeti(s.uyum), csv: (s) => UYUM_ADLARI[s.uyum] },
];

const SAPMA_SUTUNLARI: readonly Sutun<SapmaSatiri>[] = [
  { anahtar: 'no', baslik: 'No', mono: true, kirilmaz: true, hucre: (s) => s.degisiklikNo },
  {
    anahtar: 'kalem', baslik: 'Kalem',
    hucre: (s) => (s.kalem === null ? '—' : `${malzemeEtiketi(s.kalem)}${s.revizyon !== null ? `, ${revizyonEtiketi(s.revizyon)}` : ''}`),
  },
  { anahtar: 'emir', baslik: 'Emir', mono: true, kirilmaz: true, hucre: (s) => s.emirNo ?? '—' },
  { anahtar: 'kapsam', baslik: 'Kapsam', hucre: (s) => s.kapsam ?? '—' },
  { anahtar: 'referans', baslik: 'Onay ref.', mono: true, kirilmaz: true, hucre: (s) => s.referans },
  { anahtar: 'bitis', baslik: 'Bitiş', mono: true, kirilmaz: true, hucre: (s) => (s.bitis === null ? '—' : tarihMetni(s.bitis)), csv: (s) => s.bitis },
];

const STOK_HALI: Readonly<Record<StokHali, { ad: string; ton: RozetTonu }>> = {
  serbest: { ad: 'Serbest', ton: 'tamam' }, eski_yedek: { ad: 'Eski konfigürasyon yedeği', ton: 'pasif' },
  hurda: { ad: 'Hurda', ton: 'hata' }, rework: { ad: 'Rework', ton: 'pasif' },
};

const STOK_SUTUNLARI: readonly Sutun<RevizyonStokSatiri>[] = [
  { anahtar: 'kalem', baslik: 'Kalem', hucre: (s) => `${malzemeEtiketi(s.malzeme)}, ${revizyonEtiketi(s.revizyon)}` },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', mono: true, hucre: (s) => miktarMetni(s.miktar), csv: (s) => s.miktar },
  { anahtar: 'yer', baslik: 'Yer', hucre: (s) => s.yer ?? '—' },
  {
    anahtar: 'durum', baslik: 'Durum',
    hucre: (s) => (s.durum === null ? '—' : <Rozet ton={STOK_HALI[s.durum].ton}>{STOK_HALI[s.durum].ad}</Rozet>),
    csv: (s) => (s.durum === null ? null : STOK_HALI[s.durum].ad),
  },
];

function Operasyon({ o }: { o: SoyOperasyonu }) {
  const kim = [o.kisiAdi, o.zaman === null ? null : tarihSaatMetni(o.zaman)].filter(Boolean).join(', ');
  return (
    <span className="tc-dy-dugum">
      <span className="mono">{o.adimKodu}</span>
      {o.aciklama && <span>{o.aciklama}</span>}
      {o.isMerkezi && <span className="tc-dy-soluk">{o.isMerkezi}</span>}
      {o.ncProgrami && <Rozet ton="pasif" gorunum="cizgi">{o.ncProgrami}</Rozet>}
      {o.ncOzeti && <span className="tc-dy-soluk mono">{o.ncOzeti}</span>}
      {kim && <span className="tc-dy-soluk">{kim}</span>}
    </span>
  );
}

// Seri, revizyon ve mod kökte; altında bileşenler ve operasyonlar. null bağlı değil, boş dizi kayıt yok (geçiş öncesi).
function SoyAgaci({ veri }: { veri: IzlenebilirlikCevabi }) {
  const { bilesenler, operasyonlar } = veri.soyAgaci;
  return (
    <ul className="tc-dy-agac" aria-label="Soy ağacı">
      <li>
        <span className="tc-dy-dugum">
          <strong className="mono">{veri.seriNo}</strong> {malzemeEtiketi(veri.sonUrun)}
          {veri.modSeviyesi !== null && <Rozet ton="pasif" gorunum="cizgi">mod {veri.modSeviyesi}</Rozet>}
        </span>
        <ul>
          <li>
            <span className="tc-dy-dugum"><strong>Bileşenler</strong></span>
            <ul>
              {bilesenler === null ? <li className="tc-dy-soluk">Bağlı değil</li>
                : bilesenler.length === 0 ? <li className="tc-dy-soluk">Kayıt yok (geçiş öncesi)</li>
                  : bilesenler.map((b) => <li key={b}><span className="tc-dy-dugum">{b}</span></li>)}
            </ul>
          </li>
          <li>
            <span className="tc-dy-dugum"><strong>Operasyonlar</strong></span>
            <ul>
              {operasyonlar === null ? <li className="tc-dy-soluk">Bağlı değil</li>
                : operasyonlar.length === 0 ? <li className="tc-dy-soluk">Kayıt yok (geçiş öncesi, kâğıt kayıt)</li>
                  : operasyonlar.map((o, i) => <li key={`${o.adimKodu}-${i}`}><Operasyon o={o} /></li>)}
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  );
}

function SeriAyrintisi({ urunId, seriNo }: { urunId: number; seriNo: string }) {
  const sorgu = useQuery({
    queryKey: analizAnahtarlari.izlenebilirlik(urunId, seriNo),
    queryFn: () => api.get<IzlenebilirlikCevabi>(`${KOK}/izlenebilirlik${sorguMetni({ sonUrunMalzemeId: urunId, seriNo })}`),
  });
  if (sorgu.isPending) return <Kart><DurumKutusu durum="yukleniyor" /></Kart>;
  if (sorgu.isError) return <Kart><DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Seri alınamadı')} yenile={() => { void sorgu.refetch(); }} /></Kart>;
  const v = sorgu.data;
  const sapma = [...new Set(v.sapmalar.map((s) => s.referans))].join(', ');
  return (
    <>
      <Kart baslik={v.seriNo} simge="tag" baslikEki={uyumRozeti(v.uyum)}>
        <dl className="tc-dy-dl">
          <dt>Uyum</dt><dd>{UYUM_ADLARI[v.uyum]}</dd>
          <dt>Mod seviyesi</dt><dd>{v.modSeviyesi ?? '—'}</dd>
          <dt>Üretim emri</dt>
          <dd className="mono">{v.iplik?.find((d) => d.katman === 'emir')?.etiket ?? '—'}{v.emirRevizyonu !== null && `, emir rev ${v.emirRevizyonu}`}</dd>
          <dt>Sapma</dt><dd className="mono">{sapma || '—'}</dd>
          {v.not && <><dt>Not</dt><dd>{v.not}</dd></>}
        </dl>
        <h3 className="tc-dy-ara-baslik">Soy ağacı</h3>
        <SoyAgaci veri={v} />
      </Kart>
      <Kart baslik="Sapmalar" simge="alert">
        <Tablo etiket="Sapmalar" sutunlar={SAPMA_SUTUNLARI} satirlar={v.sapmalar} satirAnahtari={(s) => `${s.degisiklikNo}-${s.referans}`} bosMesaj="Aktif sapma yok." />
      </Kart>
    </>
  );
}

function RevizyonStogu({ urunId }: { urunId: number }) {
  const konfig = useKonfigurasyon(urunId);
  if (konfig.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(konfig.error, 'Stok alınamadı')} yenile={() => { void konfig.refetch(); }} />;
  if (konfig.data?.revizyonStogu === null) return <p className="tc-dy-bos">Revizyon bazlı stok bağlı değil.</p>;
  return (
    <Tablo
      etiket="Revizyon bazlı stok" sutunlar={STOK_SUTUNLARI} satirlar={konfig.data?.revizyonStogu ?? []}
      satirAnahtari={(s) => `${s.malzeme.malzemeId}-${s.revizyon ?? ''}-${s.yer ?? ''}-${s.durum ?? ''}`}
      mesgul={konfig.isPending} bosMesaj={konfig.isPending ? 'Yükleniyor' : 'Stok kaydı yok.'}
    />
  );
}

export function Izlenebilirlik() {
  const [adres, adresYaz] = useSearchParams();
  const urunId = kimlikOku(adres.get('urun'));
  const seriNo = adres.get('seri');
  const [arama, aramaYaz] = useState('');
  const [sayfa, sayfaYaz] = useState(1);
  const ara = arama.trim();
  const sorgu = { sayfa, ...(ara ? { ara } : {}) };
  const liste = useQuery({
    queryKey: analizAnahtarlari.seriler(sorgu),
    queryFn: () => api.get<SeriListeCevabi>(`${KOK}/seriler${sorguMetni(sorgu)}`),
    placeholderData: keepPreviousData,
  });
  const sec = (s: SeriListeSatiri) => adresYaz(new URLSearchParams({ urun: String(s.sonUrun.malzemeId), seri: s.seriNo }));
  return (
    <div className="tc-dy">
      <SayfaBasligi
        baslik="İzlenebilirlik" simge="search"
        alt="Seri bazlı as-built: üretildiği revizyon, mod seviyesi, bileşenler, fiilen çalışan NC programları ve sapmalar. Konfigürasyonu uyumsuz seri sevk edilemez."
      />
      <div className="tc-dy-liste-ayrinti">
        <Kart baslik="Seriler" simge="list">
          {liste.isError && !liste.data
            ? <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Seriler alınamadı')} yenile={() => { void liste.refetch(); }} />
            : (
              <Tablo
                etiket="Seriler" sutunlar={SERI_SUTUNLARI} satirlar={liste.data?.satirlar ?? []} satirAnahtari={(s) => `${s.sonUrun.malzemeId}-${s.seriNo}`}
                satirSec={sec} mesgul={liste.isFetching} bosMesaj={liste.isPending ? 'Yükleniyor' : ara ? 'Aramaya uyan seri yok.' : 'Seri kaydı yok.'}
                arac={{ arama: { deger: arama, degistir: (d) => { aramaYaz(d); sayfaYaz(1); }, etiket: 'Seri ara', yerTutucu: 'Seri numarası ara' } }}
                {...(liste.data ? { sayfalama: { sayfa: liste.data.sayfa, sayfaBoyu: liste.data.sayfaBoyu, toplam: liste.data.toplam, degistir: sayfaYaz, etiket: 'Seri sayfaları' } } : {})}
              />
            )}
        </Kart>
        <div className="tc-dy-ayrinti">
          {urunId !== null && seriNo
            ? <SeriAyrintisi key={`${urunId}-${seriNo}`} urunId={urunId} seriNo={seriNo} />
            : <Kart><p className="tc-dy-bos">Soy ağacını görmek için soldan bir seri seçin.</p></Kart>}
          <Kart baslik="Revizyon bazlı stok" simge="box">
            {urunId !== null
              ? <RevizyonStogu urunId={urunId} />
              : <p className="tc-dy-bos">Seri seçilince o ürünün revizyon bazlı stoku görünür. <Link to={`${KOK}/konfigurasyon`}>Konfigürasyon</Link></p>}
          </Kart>
        </div>
      </div>
    </div>
  );
}
