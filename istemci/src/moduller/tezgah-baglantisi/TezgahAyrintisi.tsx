import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { TezgahAyrintisiCevabi, TezgahBaglantisiDurumCevabi, TezgahTuru } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { DurumKutusu, Kart, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { CanliGosterge } from './CanliGosterge.tsx';
import { Egri, ZamanCizgisi, ZamanEkseni } from './Egri.tsx';
import { Simulasyon } from './Simulasyon.tsx';
import { BILESEN_SIRASI, BOSLUK_NEDENI, DURUM, KOSUL_ADI, KOSUL_TONU, YOK, bilesenMetni, degerAdi, degerMetni, gunSaatMetni, saatMetni, sayiMetni, sorunaGoreSirala, turAdi } from './gosterim.ts';
import './tezgah-baglantisi.css';

type Ayrinti = TezgahAyrintisiCevabi;
type Alan = Ayrinti['alanlar'][number];

const VARLIK_METNI = {
  bekleniyor: 'Takım verisi henüz okunmadı.',
  yok: 'Veri yok: servis takım verisi (/assets) vermiyor.',
  hata: 'Takım verisi son okumada alınamadı.',
} as const;

// Bileşene göre gruplanır; bilinen bileşenler sıralı, diğerleri adıyla.
function grupla(alanlar: readonly Alan[]): { anahtar: string; baslik: string; alanlar: Alan[] }[] {
  const harita = new Map<string, { anahtar: string; baslik: string; sira: number; alanlar: Alan[] }>();
  for (const a of alanlar) {
    const anahtar = `${a.bilesen ?? ''}|${a.bilesenAdi ?? ''}`;
    const g = harita.get(anahtar) ?? { anahtar, baslik: bilesenMetni(a.bilesen, a.bilesenAdi), sira: BILESEN_SIRASI.indexOf(a.bilesen ?? ''), alanlar: [] };
    g.alanlar.push(a);
    harita.set(anahtar, g);
  }
  return [...harita.values()].sort((x, y) => (x.sira < 0 ? 99 : x.sira) - (y.sira < 0 ? 99 : y.sira) || x.baslik.localeCompare(y.baslik, 'tr'));
}

function AlanSatiri({ a, ayrinti }: { a: Alan; ayrinti: Ayrinti }) {
  return (
    <li className="tc-tzb-alan">
      <span className="tc-tzb-alan-ad" title={a.tur}>{turAdi(a.tur)}</span>
      <span className="tc-tzb-alan-deger tc-tzb-mono" title={a.deger ?? undefined}>{degerMetni(degerAdi(a.tur, a.deger), a.birim)}</span>
      <span className="tc-tzb-alan-egri">
        {a.egri.length > 0 && <Egri nokta={a.egri} basi={ayrinti.egriBasi} sonu={ayrinti.egriSonu} bosluklar={ayrinti.bosluklar} />}
      </span>
      <span className="tc-tzb-alan-zaman tc-tzb-alt">
        {a.sonDegisme === null ? YOK : `Değişti ${saatMetni(a.sonDegisme)}`}
        {a.egri.length > 0 && ` · son 1 sa ${degerMetni(String(Math.min(...a.egri.map((p) => p.deger))), a.birim)} – ${degerMetni(String(Math.max(...a.egri.map((p) => p.deger))), a.birim)}`}
      </span>
    </li>
  );
}

const OMUR_TURU = { MINUTES: ['Süre', ' dk'], PART_COUNT: ['Parça', ' adet'], WEAR: ['Aşınma', ''] } as const;

// DOWN: değer kalandır, sınır genelde 0'dır ve yazılmaz; UP: değer kullanılandır, sınır üst sınırdır.
function OmurMetni({ o }: { o: Ayrinti['varliklar'][number]['omurler'][number] }) {
  const [ad, birim] = (o.tur !== null && o.tur in OMUR_TURU ? OMUR_TURU[o.tur as keyof typeof OMUR_TURU] : [o.tur ?? 'Ömür', '']) as readonly [string, string];
  const yon = o.yon === 'DOWN' ? 'kalan' : o.yon === 'UP' ? 'kullanılan' : '';
  const sinirYaz = o.sinir !== null && !(o.yon === 'DOWN' && o.sinir === 0);
  const ayrinti = [o.baslangic === null ? null : `başlangıç ${sayiMetni(o.baslangic)}${birim}`, o.uyari === null ? null : `uyarı ${sayiMetni(o.uyari)}${birim}`, sinirYaz ? `sınır ${sayiMetni(o.sinir)}${birim}` : null].filter((x) => x !== null);
  return (
    <span className="tc-tzb-omur">
      <span>{ad} {yon}: {o.deger === null ? YOK : `${sayiMetni(o.deger)}${birim}`}</span>
      {o.deger !== null && o.baslangic !== null && o.baslangic > 0 && <progress className="tc-tzb-omur-cubuk" max={o.baslangic} value={Math.min(o.baslangic, Math.max(0, o.deger))} aria-label={`${ad} ${yon}`} />}
      {ayrinti.length > 0 && <span className="tc-tzb-alt">{ayrinti.join(' · ')}</span>}
    </span>
  );
}

function Bolum({ simge, baslik, children }: { simge: 'cpu' | 'alert' | 'tool' | 'clock'; baslik: string; children: React.ReactNode }) {
  return (
    <section className="tc-tzb-bolum" aria-label={baslik}>
      <h3 className="tc-tzb-bolum-baslik"><Simge ad={simge} boyut="k" />{baslik}</h3>
      {children}
    </section>
  );
}

function Icerik({ a }: { a: Ayrinti }) {
  const gruplar = grupla(a.alanlar);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const turDegisimi = useMutation({
    mutationFn: (tur: TezgahTuru | null) => api.post<{ tezgahTuru: TezgahTuru | null }>(`/tezgah-baglantisi/tezgahlar/${encodeURIComponent(a.cihazAdi)}/tur`, { tur }),
    onSuccess: (c) => {
      istemci.setQueryData<Ayrinti>(anahtarlar.tezgah(a.cihazAdi), (eski) => (eski === undefined ? eski : { ...eski, tezgahTuru: c.tezgahTuru }));
      bildir('tamam', 'Tezgâh türü kaydedildi.');
    },
    onError: (hata) => bildir('hata', hataIletisi(hata, 'Tezgâh türü kaydedilemedi.')),
  });
  return (
    <>
      <p className="tc-tzb-not">
        <CanliGosterge okundu={a.okundu} aralikSaniye={a.aralikSaniye} />
      </p>
      <Bolum simge="cpu" baslik="Canlı tezgâh görünümü">
        <Simulasyon a={a} turSec={(t) => turDegisimi.mutate(t)} turKaydediliyor={turDegisimi.isPending} />
      </Bolum>
      <Bolum simge="clock" baslik="Zaman çizgisi">
        <ZamanCizgisi basi={a.egriBasi} sonu={a.egriSonu} bosluklar={a.bosluklar} />
        <ZamanEkseni basi={a.egriBasi} sonu={a.egriSonu} />
        <p className="tc-tzb-not">
          Çizgi son bir saati gösterir; kesikli dikey işaret veri boşluğudur (servis tamponundan düşen ya da servisin yeniden başladığı an).
          {' '}Son bir saatte {a.bosluklar.filter((g) => new Date(g.zaman) >= new Date(a.egriBasi)).length}, son 24 saatte {a.bosluklar.length} veri boşluğu.
        </p>
        {a.bosluklar.length > 0 && (
          <ul className="tc-tzb-yalin" aria-label="Veri boşlukları">
            {a.bosluklar.map((g) => <li key={g.zaman}><Rozet ton="uyari">Veri boşluğu</Rozet> {gunSaatMetni(g.zaman)} · {BOSLUK_NEDENI[g.neden]}</li>)}
          </ul>
        )}
      </Bolum>
      <Bolum simge="cpu" baslik="Alanlar">
        <p className="tc-tzb-not">Eğriler son bir saatin dakikalık ortalamasıdır; kesikli dikey çizgi veri boşluğudur. Ham MTConnect adı üzerine gelince görünür.</p>
        {gruplar.length === 0 && <p className="tc-tzb-not">Tezgâh henüz alan yayınlamadı.</p>}
        <div className="tc-tzb-gruplar">
          {gruplar.map((g) => (
            <div key={g.anahtar} className="tc-tzb-grup" role="group" aria-label={g.baslik}>
              <h4 className="tc-tzb-grup-baslik">{g.baslik}</h4>
              <ul className="tc-tzb-alanlar">{g.alanlar.map((x) => <AlanSatiri key={`${x.kimlik ?? ''}-${x.tur}-${x.ad ?? ''}`} a={x} ayrinti={a} />)}</ul>
            </div>
          ))}
        </div>
      </Bolum>
      <Bolum simge="alert" baslik="Koşullar">
        {a.kosullar.length === 0 ? <p className="tc-tzb-not">Koşul kaydı yok.</p> : (
          <ul className="tc-tzb-yalin" aria-label="Koşul kayıtları">
            {a.kosullar.map((k) => (
              <li key={`${k.kimlik}-${k.baslangic}`} className="tc-tzb-kosul">
                <Rozet ton={KOSUL_TONU[k.hal]}>{KOSUL_ADI[k.hal]}</Rozet>
                <span className="tc-tzb-mono">{k.tur ?? k.kimlik}</span>
                {k.ileti !== null && k.ileti !== '' && <span>{k.ileti}</span>}
                <span className="tc-tzb-alt">{saatMetni(k.baslangic)} – {k.bitis === null ? 'sürüyor' : saatMetni(k.bitis)}</span>
              </li>
            ))}
          </ul>
        )}
      </Bolum>
      <Bolum simge="tool" baslik="Takımlar">
        {a.varliklar.length === 0
          ? <p role="status" className="tc-tzb-not">{a.varlikDurumu === 'okundu' ? 'Servis takım listesi boş.' : VARLIK_METNI[a.varlikDurumu]}</p>
          : (
            <ul className="tc-tzb-yalin" aria-label="Takımlar">
              {a.varliklar.map((v) => (
                <li key={v.kimlik} className="tc-tzb-takim">
                  <span className="tc-tzb-mono">{v.takimNo === null ? v.kimlik : `Takım ${v.takimNo}`}</span>
                  <span className="tc-tzb-alt">{v.tur}{v.takimNo === null ? '' : ` · ${v.kimlik}`}</span>
                  {v.omurler.length === 0 ? <span className="tc-tzb-alt">Ömür verisi yok</span> : v.omurler.map((o, i) => <OmurMetni key={`${o.tur ?? ''}-${i}`} o={o} />)}
                </li>
              ))}
            </ul>
          )}
      </Bolum>
    </>
  );
}

// Keşif ekranı: tezgahın yayınladığı bütün alanlar bileşene göre; birimi, son değişme zamanı ve son saatin eğrisiyle.
export function TezgahAyrintisi() {
  const [parametre, parametreYaz] = useSearchParams();
  const [secilen, secilenYaz] = useState<string | null>(parametre.get('tezgah'));
  const liste = useQuery({
    queryKey: anahtarlar.durum,
    queryFn: () => api.get<TezgahBaglantisiDurumCevabi>('/tezgah-baglantisi/durum'),
    refetchInterval: (q) => (q.state.data?.aralikSaniye ?? 5) * 1000,
    refetchIntervalInBackground: false,
  });
  const tezgahlar = sorunaGoreSirala(liste.data?.tezgahlar ?? []);
  const cihazAdi = secilen ?? tezgahlar[0]?.cihazAdi ?? null;
  const ayrinti = useQuery({
    queryKey: anahtarlar.tezgah(cihazAdi ?? ''),
    queryFn: () => api.get<TezgahAyrintisiCevabi>(`/tezgah-baglantisi/tezgahlar/${encodeURIComponent(cihazAdi ?? '')}`),
    enabled: cihazAdi !== null,
    refetchInterval: (liste.data?.aralikSaniye ?? 5) * 1000,
    refetchIntervalInBackground: false,
  });
  const a = ayrinti.data;

  return (
    <Kart baslik="Tezgâh ayrıntısı">
      <div className="tc-tzb">
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Tezgâhlar alınamadı')} yenile={() => { void liste.refetch(); }} />}
        {liste.data && tezgahlar.length === 0 && <p role="status" className="tc-tzb-not">Henüz okunmuş tezgâh yok.</p>}
        {tezgahlar.length > 0 && (
          <div className="tc-tzb-iki">
            <ul className="tc-tzb-liste" aria-label="Tezgâhlar">
              {tezgahlar.map((t) => (
                <li key={t.cihazAdi}>
                  <button type="button" className="tc-tzb-sec" aria-pressed={t.cihazAdi === cihazAdi} onClick={() => { secilenYaz(t.cihazAdi); parametreYaz({ tezgah: t.cihazAdi }, { replace: true }); }}>
                    <span className="tc-tzb-kod">{t.cihazAdi}</span><Rozet ton={DURUM[t.durum].ton}>{DURUM[t.durum].metin}</Rozet>
                  </button>
                </li>
              ))}
            </ul>
            <section className="tc-tzb" aria-label={cihazAdi ?? undefined}>
              {ayrinti.isPending && <DurumKutusu durum="yukleniyor" />}
              {ayrinti.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(ayrinti.error, 'Tezgâh ayrıntısı alınamadı')} yenile={() => { void ayrinti.refetch(); }} />}
              {a && <Icerik a={a} />}
            </section>
          </div>
        )}
      </div>
    </Kart>
  );
}
