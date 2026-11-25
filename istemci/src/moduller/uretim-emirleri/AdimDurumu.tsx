import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { AdimDurumuCevabi, AdimliListeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Sekmeler, Simge, type Sekme } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { adimDurumuUcu } from './adim-durumu.ts';
import { ACIK, gecikti } from './adim-tablosu.ts';
import { AdimTablosu } from './AdimTablosu.tsx';
import { AdimMatrisi } from './AdimMatrisi.tsx';
import { EmreOzelSablon } from './EmreOzelSablon.tsx';
import { HazirlikSablonu } from './HazirlikSablonu.tsx';
import { gorunumOku, type Gorunum } from './adim-matrisi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ETIKETI } from './gorunum.ts';
import './uretim-emirleri.css';
import './adim-durumu.css';

type Emir = AdimliListeCevabi['emirler'][number];

function Cubuk({ yuzde, etiket }: { yuzde: number; etiket: string }) {
  return (
    <span className="tc-emir-ilerleme-cubuk">
      <progress max={100} value={yuzde} aria-label={`${etiket} yüzde ${String(yuzde)}`} />
      <b>%{yuzde}</b>
    </span>
  );
}

// Adım Durumu (2893, tasarım 2955, 3581): solda açık emirler, sağda seçili emrin tek tablosu (adım, durum, hazırlık, ayrıntı). Emir sayfasındaki
// "Adımlar ve hazırlık" sekmesiyle aynı bileşendir; statüyü sunucu türetir, elle işlemler ayrıntıda ve yetkilidir.
// 3604: görünüm anahtarı. Emir bugünkü sayfadır; Matris ve Tablo bütün açık emirlerin adımlarını tek ekranda gösterir. Görünüm adreste (`?gorunum=`).
const GORUNUM_SEKMELERI: readonly Sekme<Gorunum>[] = [
  { anahtar: 'emir', baslik: 'Emir', simge: 'list' },
  { anahtar: 'matris', baslik: 'Matris', simge: 'grid' },
  { anahtar: 'tablo', baslik: 'Tablo', simge: 'kanban' },
  { anahtar: 'sablon', baslik: 'Hazırlık şablonu', simge: 'gear' },
];
export function AdimDurumu() {
  const [adres, adresYaz] = useSearchParams();
  const gorunum = gorunumOku(adres.get('gorunum'));
  const gorunumSec = (g: Gorunum) => {
    adresYaz((a) => { const y = new URLSearchParams(a); if (g === 'emir') y.delete('gorunum'); else y.set('gorunum', g); return y; }, { replace: true });
  };
  return (
    <div className="tc-ad-kok">
      <Sekmeler etiket="Adım Durumu görünümü" sekmeler={GORUNUM_SEKMELERI} secili={gorunum} sec={gorunumSec} />
      {gorunum === 'emir' ? <EmirGorunumu /> : gorunum === 'sablon' ? <HazirlikSablonu /> : <AdimMatrisi gorunum={gorunum} />}
    </div>
  );
}

function EmirGorunumu() {
  const [adres, adresYaz] = useSearchParams();
  const secili = Number(adres.get('emir')) || null;
  const [arama, aramaYaz] = useState('');
  const liste = useQuery({ queryKey: anahtarlar.adimliListe, queryFn: () => api.get<AdimliListeCevabi>('/adimli-emirler') });
  const acik = (liste.data?.emirler ?? []).filter((e) => ACIK.has(e.durum));
  const aranan = arama.trim().toLocaleLowerCase('tr');
  const emirler = aranan === '' ? acik
    : acik.filter((e) => `${e.emirNo} ${e.urun.kod} ${e.urun.ad}`.toLocaleLowerCase('tr').includes(aranan));
  const sec = (id: number | null) => {
    adresYaz((a) => { const y = new URLSearchParams(a); if (id === null) y.delete('emir'); else y.set('emir', String(id)); return y; }, { replace: true });
  };
  return (
    <div className={`tc-ad${secili === null ? '' : ' tc-ad-secili'}`}>
      <div className="tc-ad-liste">
        <Kart baslik="Açık emirler" simge="list" baslikEki={liste.data && <Rozet ton="pasif">{acik.length}</Rozet>}>
          {liste.isPending && <DurumKutusu durum="yukleniyor" />}
          {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Emirler alınamadı.')} yenile={() => { void liste.refetch(); }} />}
          {liste.data && (
            <>
              <Girdi etiket="Ara" type="search" placeholder="Emir no, ürün" value={arama} onChange={(e) => aramaYaz(e.target.value)} />
              {emirler.length === 0 ? <DurumKutusu durum="bos" mesaj={acik.length === 0 ? 'Açık emir yok.' : 'Aramaya uyan emir yok.'} /> : (
                <ul className="tc-ad-emirler" aria-label="Açık emirler">
                  {emirler.map((e) => <EmirSatiri key={e.id} emir={e} secili={e.id === secili} sec={() => sec(e.id)} />)}
                </ul>
              )}
            </>
          )}
        </Kart>
      </div>
      <div className="tc-ad-ayrinti">
        {secili === null
          ? <Kart><DurumKutusu durum="bos" mesaj="Soldan bir emir seçin; adımları, bekleme nedenleri ve hazırlık burada görünür." /></Kart>
          : <EmrinAdimDurumu id={secili} geri={() => sec(null)} />}
      </div>
    </div>
  );
}

function EmirSatiri({ emir, secili, sec }: { emir: Emir; secili: boolean; sec: () => void }) {
  const yuzde = emir.adimSayisi === 0 ? 0 : Math.round((emir.tamamAdim / emir.adimSayisi) * 100);
  return (
    <li>
      <button type="button" className="tc-ad-emir" aria-current={secili ? 'true' : undefined} onClick={sec}>
        <span className="tc-ad-emir-ust">
          <span className="tc-emir-kod">{emir.emirNo}</span>
          <Rozet ton={emir.durum === 'basladi' ? 'bilgi' : 'pasif'}>{DURUM_ETIKETI[emir.durum]}</Rozet>
        </span>
        <span className="tc-ad-emir-urun">{emir.urun.ad}</span>
        <span className="tc-ad-emir-alt">
          <span>{emir.tamamAdim}/{emir.adimSayisi} adım</span>
          <progress max={100} value={yuzde} aria-hidden="true" />
          {emir.teslim !== null && (
            <span className={gecikti(emir.teslim) ? 'tc-ad-gec' : undefined}>
              <Simge ad="calendar" boyut="k" />{tarihMetni(emir.teslim)}{gecikti(emir.teslim) ? ' · gecikti' : ''}
            </span>
          )}
        </span>
        {emir.siradaki && <span className="tc-ad-emir-sira">Sıradaki: OP {emir.siradaki.opNo} {emir.siradaki.ad}</span>}
      </button>
    </li>
  );
}

function EmrinAdimDurumu({ id, geri }: { id: number; geri: () => void }) {
  const d = useQuery({ queryKey: anahtarlar.adimDurumu(id), queryFn: () => api.get<AdimDurumuCevabi>(adimDurumuUcu(id)) });
  const geriDugmesi = <Dugme simge="chev-left" className="tc-ad-geri" onClick={geri}>Emirler</Dugme>;
  if (d.isPending) return <Kart>{geriDugmesi}<DurumKutusu durum="yukleniyor" /></Kart>;
  if (d.isError) return <Kart>{geriDugmesi}<DurumKutusu durum="hata" mesaj={hataIletisi(d.error, 'Adım durumu alınamadı.')} yenile={() => { void d.refetch(); }} /></Kart>;
  const v = d.data;
  return (
    <Kart baslik={v.emirNo} baslikEki={<Rozet ton="bilgi">{DURUM_ETIKETI[v.durum]}</Rozet>}>
      {geriDugmesi}
      <p className="tc-ad-ozet">
        <b>{v.urun.ad}</b> <span className="tc-emir-kod">{v.urun.kod}</span>
        <span>{v.adet} adet</span>
        {v.teslim !== null && <span className={gecikti(v.teslim) ? 'tc-ad-gec' : undefined}>teslim {tarihMetni(v.teslim)}{gecikti(v.teslim) ? ' · gecikti' : ''}</span>}
      </p>
      {v.rotaYuzde !== null && <Cubuk yuzde={v.rotaYuzde} etiket="Rota" />}
      <AdimTablosu emirId={id} />
      <EmreOzelSablon emirId={id} />
    </Kart>
  );
}
