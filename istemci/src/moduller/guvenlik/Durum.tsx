import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Alarm, AlarmListeCevabi, AyarDenetimiCevabi, KorumaCevabi, OzetCevabi } from '#paylasilan/sozlesme/guvenlik.ts';
import { DurumKutusu, Simge } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import {
  CizgiGrafik, Gidisat, SaglikKutulari, TeknikAyrintilar, girisYorumu, saglikGeneli, saglikKararlari, useSistemSagligi, type SaglikTonu,
} from '../sistem/disari.ts';
import { AlarmAyrintisi } from './Alarmlar.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { KORUMA_ADI, saatMetni } from './gorunum.ts';
import { KararKarti } from './KararKarti.tsx';
import { alarmKarari, kararSirasi, korumaKararlari, korumaListesi, olayAkisi, type Karar } from './karar.ts';
import './guvenlik.css';

// Panoya bakan elle yenilemek zorunda kalmasın; tarama dakikada bir koşar.
export const YENILEME_MS = 30_000;

type Genel = 'iyi' | 'dikkat' | 'alarm';

// Yüksek ya da kritik açık alarm "alarm"dır; öbür açık ya da onaylanmış alarm, kilitli hesap ve duran tarama "dikkat".
export function genelDurum(o: OzetCevabi): Genel {
  if (o.acikAlarm.kritik + o.acikAlarm.yuksek > 0) return 'alarm';
  if (o.acikAlarm.orta + o.onaylanmisAlarm + o.kilitliHesap > 0 || o.taramaDurdu) return 'dikkat';
  return 'iyi';
}

const GENEL_TONU: Record<Genel, SaglikTonu> = { alarm: 'hata', dikkat: 'uyari', iyi: 'tamam' };

function guvenlikBasligi(o: OzetCevabi, durum: Genel): string {
  const acik = o.acikAlarm.kritik + o.acikAlarm.yuksek + o.acikAlarm.orta;
  if (durum === 'iyi') return 'Sorun yok';
  if (acik > 0) return `${acik} alarm bakılmalı`;
  return 'Dikkat edilecek bir şey var';
}

function guvenlikAltMetni(o: OzetCevabi): string {
  const parcalar: string[] = [];
  const acik = o.acikAlarm.kritik + o.acikAlarm.yuksek + o.acikAlarm.orta;
  if (acik > 0) parcalar.push(`${o.acikAlarm.kritik + o.acikAlarm.yuksek} yüksek önemli, ${o.acikAlarm.orta} orta önemli açık alarm.`);
  if (o.onaylanmisAlarm > 0) parcalar.push(`${o.onaylanmisAlarm} onaylanmış alarm kapatılmayı bekliyor.`);
  if (o.kilitliHesap > 0) parcalar.push(`${o.kilitliHesap} hesap kilitli.`);
  if (o.taramaDurdu) parcalar.push('Güvenlik taraması son 5 dakikada koşmadı.');
  parcalar.push(o.girisler.hatali === 0 ? 'Hatalı giriş yok.' : `Son 24 saatte ${o.girisler.hatali} hatalı giriş.`);
  return acik + o.onaylanmisAlarm + o.kilitliHesap === 0 && !o.taramaDurdu ? `Açık alarm yok; tarama çalışıyor. ${parcalar.join(' ')}` : parcalar.join(' ');
}

const ISIK_SIMGESI: Record<SaglikTonu, SimgeAdi> = { tamam: 'check', uyari: 'alert', hata: 'alert', pasif: 'clock' };

function Isik({ ust, ton, baslik, alt }: { ust: string; ton: SaglikTonu; baslik: string; alt: string }) {
  return (
    <section className="tc-guvenlik-isik-kart" data-ton={ton} aria-label={`${ust} özeti`}>
      <span className="tc-guvenlik-isik" aria-hidden="true"><Simge ad={ISIK_SIMGESI[ton]} /></span>
      <div>
        <span className="tc-guvenlik-isik-ust">{ust}</span>
        <h2>{baslik}</h2>
        <p>{alt}</p>
      </div>
    </section>
  );
}

function Bolum({ baslik, ek, children }: { baslik: string; ek?: string; children: ReactNode }) {
  const kimlik = `tc-guvenlik-bolum-${baslik.toLocaleLowerCase('tr').replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className="tc-guvenlik-bolum" aria-labelledby={kimlik}>
      <h2 id={kimlik}>{baslik}{ek !== undefined && <span className="tc-guvenlik-not"> {ek}</span>}</h2>
      {children}
    </section>
  );
}

function Korumalar({ koruma, ayar }: { koruma: KorumaCevabi | null; ayar: AyarDenetimiCevabi | null }) {
  const satirlar = korumaListesi(koruma, ayar);
  if (satirlar.length === 0) return <DurumKutusu durum="yukleniyor" />;
  const acik = satirlar.filter((s) => s.durum === 'acik').length;
  const kapali = satirlar.filter((s) => s.durum === 'kapali').length;
  return (
    <>
      <p className="tc-guvenlik-sayac"><b>{acik}</b> / {satirlar.length} koruma açık · <b>{kapali}</b> kapalı</p>
      <ul className="tc-guvenlik-korumalar">
        {satirlar.map((s) => (
          <li key={s.anahtar} data-durum={s.durum}>
            <span className="tc-guvenlik-koruma-simge" aria-hidden="true">
              <Simge ad={s.durum === 'acik' ? 'check' : s.durum === 'kapali' ? 'x' : s.durum === 'uyari' ? 'alert' : 'help'} boyut="k" />
            </span>
            <div>
              <b>{s.ad}</b>
              <span>{s.ne}</span>
              {s.durum !== 'acik' && <span className="tc-guvenlik-not">{s.ayrinti}</span>}
            </div>
            <em>{s.durum === 'uyari' ? 'Bakılmalı' : KORUMA_ADI[s.durum]}</em>
          </li>
        ))}
      </ul>
    </>
  );
}

// Girişler güvenlikten gelir; gidişatın üst grubunda durur. Aralık seçiciden bağımsız, her zaman son 24 saattir.
function GirislerGrafigi({ o }: { o: OzetCevabi }) {
  const nokta = (oku: (s: OzetCevabi['saatlik'][number]) => number) => o.saatlik.map((s) => ({ an: new Date(s.saat), deger: oku(s) }));
  return (
    <CizgiGrafik
      baslik="Girişler" aciklama="son 24 saat, saatlik; aralık seçiciden bağımsız" birim="" etiket={(an) => saatMetni(an.toISOString())}
      yorum={girisYorumu(o.girisler.basarili, o.girisler.hatali)}
      seriler={[{ ad: 'Başarılı', ton: 'birinci', noktalar: nokta((s) => s.basarili) }, { ad: 'Hatalı', ton: 'ikinci', noktalar: nokta((s) => s.hatali) }]}
    />
  );
}

const BAGLANTILAR: readonly { yol: string; simge: SimgeAdi; baslik: string; alt: string }[] = [
  { yol: '/guvenlik/alarmlar', simge: 'bell', baslik: 'Alarmlar', alt: 'Bütün alarmlar ve geçmişi' },
  { yol: '/guvenlik/girisler', simge: 'login', baslik: 'Girişler', alt: 'Kim ne zaman girdi' },
  { yol: '/guvenlik/oturumlar', simge: 'users', baslik: 'Oturumlar ve kilitler', alt: 'Açık oturumu kapat, kilidi aç' },
  { yol: '/guvenlik/reddedilen', simge: 'lock', baslik: 'Reddedilen istekler', alt: 'Yetkisi olmayan denemeler' },
  { yol: '/guvenlik/koruma', simge: 'check', baslik: 'Koruma durumu', alt: 'Sunucu günlüğü, son hatalar, ayar denetimi' },
  { yol: '/guvenlik/kurallar', simge: 'book', baslik: 'Kurallar', alt: 'Hangi durumda alarm açılır' },
];

// Sistem ve Güvenlik (2231): sağlığa ve güvenliğe tek yerden bakıp karar verilir. Önce iki ışık, sonra karar bekleyenler (en önemlisi
// üstte), korumalar, sağlık kutuları, yorumlu grafikler, son 24 saat ve ayrıntı sayfaları. Ayrıntı ve işlemler bugünkü alt sayfalardadır.
export function GuvenlikDurum() {
  const git = useNavigate();
  const oturum = useOturum();
  const yonetir = oturum.data?.islemler.includes('guvenlik.yonet') ?? false;
  const [secili, seciliYaz] = useState<Alarm | null>(null);
  const saglik = useSistemSagligi(YENILEME_MS);
  const ozet = useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<OzetCevabi>('/guvenlik/ozet'), refetchInterval: YENILEME_MS });
  const alarmlar = useQuery({
    queryKey: anahtarlar.alarmlar('etkin', 1),
    queryFn: () => api.get<AlarmListeCevabi>('/guvenlik-alarmlari?gorunum=etkin&sayfa=1'),
    refetchInterval: YENILEME_MS,
  });
  const koruma = useQuery({ queryKey: anahtarlar.koruma, queryFn: () => api.get<KorumaCevabi>('/guvenlik/koruma'), refetchInterval: YENILEME_MS });
  const ayar = useQuery({
    queryKey: anahtarlar.ayarDenetimi, queryFn: () => api.get<AyarDenetimiCevabi>('/guvenlik/ayar-denetimi'), refetchInterval: YENILEME_MS,
  });

  if (ozet.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (ozet.isError) return <DurumKutusu durum="hata" yenile={() => { void ozet.refetch(); }} />;
  const o = ozet.data;
  const durum = genelDurum(o);
  const ayrinti = saglik.ayrinti?.data ?? null;
  const genel = saglikGeneli(saglik.saglikli, ayrinti);

  const kararlar: Karar[] = kararSirasi([
    ...(alarmlar.data?.satirlar ?? []).map(alarmKarari),
    ...(koruma.data ? korumaKararlari(koruma.data) : []),
    ...(ayrinti ? saglikKararlari(ayrinti).map((k) => ({ ...k, alan: 'Sistem' as const, alarm: null })) : []),
  ]);
  const toplamAlarm = alarmlar.data?.toplam ?? 0;
  const gorunmeyen = toplamAlarm - (alarmlar.data?.satirlar.length ?? 0);
  const olaylar = olayAkisi(o, ayrinti?.calismaSuresiSn ?? null, new Date());

  return (
    <div className="tc-guvenlik tc-guvenlik-merkez">
      <p className="tc-guvenlik-not">Sistem sağlıklı mı, veriler korunuyor mu? Karar gereken her şey bu sayfada.</p>
      <div className="tc-guvenlik-isiklar" aria-live="polite">
        <Isik ust="Sistem sağlığı" ton={genel.ton} baslik={genel.baslik} alt={saglik.ayrintiGorur ? genel.alt : 'Sağlık ayrıntısını görme yetkiniz yok.'} />
        <Isik ust="Güvenlik" ton={GENEL_TONU[durum]} baslik={guvenlikBasligi(o, durum)} alt={guvenlikAltMetni(o)} />
      </div>

      <Bolum baslik="Karar bekleyenler" ek={kararlar.length === 0 ? undefined : `${kararlar.length} konu · önce en önemlisi`}>
        {alarmlar.isPending ? <DurumKutusu durum="yukleniyor" />
          : kararlar.length === 0 ? <p className="tc-guvenlik-bos"><Simge ad="check" boyut="k" /> Karar bekleyen konu yok.</p>
            : <div className="tc-guvenlik-kararlar">{kararlar.map((k, i) => <KararKarti key={k.anahtar} karar={k} yonetir={yonetir} incele={seciliYaz} oncelikli={i === 0} />)}</div>}
        {gorunmeyen > 0 && (
          <p className="tc-guvenlik-not">
            {gorunmeyen} alarm daha var.{' '}
            <button type="button" className="tc-guvenlik-bag" onClick={() => { void git('/guvenlik/alarmlar'); }}>Bütün alarmlar</button>
          </p>
        )}
      </Bolum>

      <Bolum baslik="Korumalar" ek="açık olanlar sizi neyden korur">
        {koruma.isError ? <DurumKutusu durum="hata" yenile={() => { void koruma.refetch(); }} /> : <Korumalar koruma={koruma.data ?? null} ayar={ayar.data ?? null} />}
      </Bolum>

      {saglik.ayrintiGorur && (
        <Bolum baslik="Sistem sağlığı">
          {ayrinti === null
            ? (saglik.ayrinti?.isError ? <DurumKutusu durum="hata" yenile={saglik.yenile} /> : <DurumKutusu durum="yukleniyor" />)
            : <SaglikKutulari saglikli={saglik.saglikli} ayrinti={ayrinti} sonDakika={saglik.sonDakika} />}
        </Bolum>
      )}

      {saglik.ayrintiGorur && <Gidisat ek={<GirislerGrafigi o={o} />} />}

      <Bolum baslik="Son 24 saatte olanlar">
        <ul className="tc-guvenlik-akis">
          {olaylar.map((a) => (
            <li key={a.anahtar} data-ton={a.ton}>
              {a.zaman === null ? <span className="mono">gün boyu</span> : <time className="mono" dateTime={a.zaman}>{saatMetni(a.zaman)}</time>}
              <i aria-hidden="true" />
              <div><b>{a.baslik}</b><span className="tc-guvenlik-not">{a.alt}</span></div>
            </li>
          ))}
        </ul>
      </Bolum>

      <Bolum baslik="Ayrıntılar" ek="destek ve inceleme için">
        <nav className="tc-guvenlik-baglar" aria-label="Ayrıntı sayfaları">
          {BAGLANTILAR.map((b) => (
            <button key={b.yol} type="button" onClick={() => { void git(b.yol); }}>
              <Simge ad={b.simge} boyut="k" />
              <span><b>{b.baslik}</b><span className="tc-guvenlik-not">{b.alt}</span></span>
              <Simge ad="chev-right" boyut="k" />
            </button>
          ))}
        </nav>
        {ayrinti !== null && (
          <details className="tc-guvenlik-katli">
            <summary>Teknik ayrıntılar</summary>
            <TeknikAyrintilar ayrinti={ayrinti} saglikli={saglik.saglikli === true} />
          </details>
        )}
      </Bolum>

      {secili !== null && <AlarmAyrintisi alarm={secili} degisti={seciliYaz} kapat={() => seciliYaz(null)} />}
    </div>
  );
}
