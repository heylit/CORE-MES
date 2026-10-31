import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Dugme, Kart, Rozet, Sekmeler, Simge, Tablo, type RozetTonu, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useDenetim } from '../baglam.tsx';
import { csvMetni, guvenliAd, icsKatla, indir, yazdir } from '../disa-aktar.ts';
import { KDUR, KSON, KTUR } from '../icerik/kalibrasyon.ts';
import {
  cihazCevrimi, cihazDurumu, cihazListesi, cihazVadesi, kalibrasyonIstatistigi, type CihazDurumu,
} from '../kurallar/kalibrasyon.ts';
import { profilAdi } from '../kurallar/profil.ts';
import { aylar, bugunTarihi, gunEkle, isoTarih, pazartesi, tarihMetni } from '../tarih.ts';
import type { Cihaz } from '../tipler.ts';
import { OLCU_ALETI_YOLU } from '../veri.ts';
import { basimHtml } from '../kys/dokuman-uretici.tsx';
import { dokumanBul } from '../kys/dokuman-metni.ts';
import '../kys/kys.css';
import '../ic-denetim/p3-ortak.css';
import './kalibrasyon.css';

// Kalibrasyon bölümü (ISO 9001 7.1.5): cihaz listesi Kalibrasyon modülünden salt okunur gelir (329 a). Ekleme, düzenleme, kayıt,
// silme ve içe aktarma düğmesi yoktur; satırda "Kalibrasyonda aç" Kalibrasyon sayfasına gider (T13).

const TON: Record<CihazDurumu['ton'], RozetTonu> = { kotu: 'hata', uyari: 'uyari', iyi: 'tamam', soluk: 'pasif' };
const SUZGECLER: readonly { deger: string; baslik: string }[] = [
  { deger: 'all', baslik: 'Tümü' }, { deger: 'gec', baslik: 'Gecikmiş' }, { deger: 'yak', baslik: '30 gün içinde' },
  { deger: 'ok', baslik: 'Güncel' }, { deger: 'pasif', baslik: 'Kullanım dışı' },
];
const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function Durum({ d }: { d: Cihaz }) {
  const st = cihazDurumu(d);
  const oran = st.k === 'pasif' || !d.last ? null : Math.round(cihazCevrimi(d) * 100);
  return (
    <span className="tc-dhd-kdurum">
      <Rozet ton={TON[st.ton]}>{st.t}</Rozet>
      {oran !== null && (
        <progress className={`tc-dhd-kcubuk tc-dhd-k-${st.ton}`} max={100} value={oran} aria-label={`Periyodun yüzde ${String(oran)} geçti`} />
      )}
    </span>
  );
}

const KalibrasyondaAc = ({ metin = 'Kalibrasyonda aç' }: { metin?: string }) => (
  <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to={OLCU_ALETI_YOLU}><Simge ad="ruler" />{metin}</Link>
);

function csvIndir(liste: readonly Cihaz[], firma: string) {
  const basliklar = ['Cihaz no', 'Cihaz', 'Marka / model', 'Seri no', 'Ölçüm aralığı', 'Çözünürlük', 'Yer', 'Sorumlu', 'Tür', 'Kalibrasyonu yapan', 'Periyot (ay)',
    'Son kalibrasyon', 'Sonraki kalibrasyon', 'Kalan gün', 'Durum', 'Son sonuç', 'Sertifika no', 'Kabul kriteri'];
  const satirlar = liste.slice().sort((a, b) => (a.no < b.no ? -1 : 1)).map((d) => {
    const st = cihazDurumu(d);
    return [d.no, d.ad, d.marka, d.seri, d.aralik, d.coz, d.yer, d.sorumlu, KTUR[d.tur], d.lab, d.per, d.last, cihazVadesi(d), st.dd,
      st.k === 'pasif' ? KDUR[d.st] : st.t, d.res ? KSON[d.res] : '', d.cert, d.kabul];
  });
  indir(`${guvenliAd(`kalibrasyon-listesi-${firma || 'firma'}`)}.csv`, csvMetni([basliklar, ...satirlar]), 'text/csv');
}

const icsKacis = (v: string): string => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Her kullanımdaki cihazın sonraki kalibrasyonu tam gün olay; geçmişse bugüne konur. 14 ve 1 gün önce hatırlatma (prototip kIcs).
function icsMetni(liste: readonly Cihaz[], firma: string, profilId: string): { metin: string; n: number } {
  const t = bugunTarihi();
  const damga = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Denetim Hazirlik//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  let n = 0;
  for (const d of liste) {
    if (d.st !== 'aktif') continue;
    const nx = cihazVadesi(d);
    if (!nx) continue;
    const gun = nx < t ? t : nx;
    n++;
    const baslik = icsKacis(`Kalibrasyon: ${d.no} ${d.ad}${firma ? ` · ${firma}` : ''}`);
    const aciklama = [d.yer ? `Yer: ${d.yer}` : '', d.sorumlu ? `Sorumlu: ${d.sorumlu}` : '', d.lab ? `Kalibrasyonu yapan: ${d.lab}` : '',
      d.last ? `Son kalibrasyon: ${tarihMetni(d.last)}` : '', nx < t ? `GECİKMİŞ (planlanan: ${tarihMetni(nx)})` : ''].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', `UID:kal-${profilId}-${d.id}@denetim-hazirlik`, `DTSTAMP:${damga}`, `DTSTART;VALUE=DATE:${gun.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${gunEkle(gun, 1).replace(/-/g, '')}`, `SUMMARY:${baslik}`, `DESCRIPTION:${icsKacis(aciklama)}`, 'TRANSP:TRANSPARENT');
    for (const tr of ['-P14D', '-P1D']) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${tr}`, `DESCRIPTION:${baslik}`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return { metin: `${L.map(icsKatla).join('\r\n')}\r\n`, n };
}

interface SayiOzellikleri { simge: SimgeAdi; deger: string; baslik: string; alt: string; ton: string; suzgec: string }

function SayiDugmesi({ simge, deger, baslik, alt, ton, suzgec }: SayiOzellikleri) {
  const d = useDenetim();
  const secili = d.ekran.kal.filter === suzgec;
  return (
    <button
      type="button" className="tc-dhd-ksayi" aria-pressed={secili}
      onClick={() => {
        d.ekranDegistir((e) => {
          e.kal.filter = e.kal.filter === suzgec && suzgec !== 'all' ? 'all' : suzgec;
          if (e.kal.view === 'takvim' && e.kal.filter !== 'all') e.kal.view = 'tablo';
        });
      }}
    >
      <span className={`tc-dhd-ksayi-deger ${ton}`}>{deger}</span>
      <span className="tc-dhd-ksayi-baslik"><Simge ad={simge} boyut="k" />{baslik}</span>
      {alt && <span className="tc-dhd-ksayi-alt">{alt}</span>}
    </button>
  );
}

export function Kalibrasyon() {
  const d = useDenetim();
  const K = d.ekran.kal;
  const s = kalibrasyonIstatistigi(d.cihazlar);
  const firma = d.profil.profile.firma;
  const gorunumSec = (v: string) => { d.ekranDegistir((e) => { e.kal.view = v; }); };
  const takvimde = K.view === 'takvim';

  const araclar = (
    <div className="tc-dhd-karac">
      <KalibrasyondaAc metin="Cihaz ekle ya da kaydet" />
      <Dugme simge="download" onClick={() => { csvIndir(d.cihazlar, firma); d.bildir('Kalibrasyon listesi indirildi', { ton: 'bilgi' }); }}>Excel (.csv)</Dugme>
      <Dugme
        simge="clock"
        onClick={() => {
          const r = icsMetni(d.cihazlar, firma, d.depo.active);
          if (!r.n) { d.bildir('Takvime eklenecek kalibrasyon tarihi yok', { ton: 'bilgi' }); return; }
          indir(`${guvenliAd(`kalibrasyon-takvimi-${firma || 'firma'}`)}.ics`, r.metin, 'text/calendar');
          d.bildir(`${String(r.n)} cihazın kalibrasyon tarihi takvim dosyasına eklendi (14 ve 1 gün önce hatırlatma)`, { ton: 'bilgi' });
        }}
      >
        Takvime ekle
      </Dugme>
      <Dugme
        simge="printer"
        onClick={() => {
          // Prototip kprint: KYS'deki "Ölçüm cihazları ve kalibrasyon takip listesi" formu (f_kal) yazdırılır.
          const dok = dokumanBul(d.profil.kys, 'f_kal');
          if (dok) yazdir(basimHtml([dok], d.profil, d.cihazlar), dok.name);
        }}
      >
        Yazdır
      </Dugme>
    </div>
  );

  return (
    <div className="tc-dhd">
      {d.ekran.ux !== 'uzman' && (
        <p className="tc-dhd-aciklama">Ölçüm cihazları, araç ve gereçler: son ve sonraki kalibrasyon, geri sayım, geçmiş kayıtlar. ISO 9001 madde 7.1.5. Cihaz listesi Kalibrasyon modülünden gelir; kayıt orada yapılır.</p>
      )}
      <Sekmeler
        etiket="Kalibrasyon görünümü" secili={takvimde ? 'takvim' : 'tablo'} sec={gorunumSec}
        sekmeler={[{ anahtar: 'tablo', baslik: 'Tablo', simge: 'list' }, { anahtar: 'takvim', baslik: 'Takvim', simge: 'clock' }]}
      />
      <div className="tc-dhd-ksayilar">
        <SayiDugmesi simge="layers" deger={String(s.n)} baslik="Kullanımdaki cihaz" alt={s.pasif ? `${String(s.pasif)} kullanım dışı / yedek` : ''} ton="" suzgec="all" />
        <SayiDugmesi simge="alert" deger={String(s.gec)} baslik="Gecikmiş" alt={s.yok ? `${String(s.yok)} cihazın kaydı yok` : 'Kalibrasyonu geçmiş'} ton={s.gec ? 'tc-dhy-ton-kotu' : 'tc-dhy-ton-iyi'} suzgec="gec" />
        <SayiDugmesi simge="clock" deger={String(s.yak)} baslik="30 gün içinde" alt="Planlama zamanı" ton={s.yak ? 'tc-dhy-ton-uyari' : ''} suzgec="yak" />
        <SayiDugmesi
          simge="check" deger={s.uyum == null ? '–' : `%${String(s.uyum)}`} baslik="Güncel oran" alt="Süresi geçmemiş cihazlar"
          ton={s.uyum == null ? '' : s.uyum >= 85 ? 'tc-dhy-ton-iyi' : s.uyum >= 70 ? 'tc-dhy-ton-uyari' : 'tc-dhy-ton-kotu'} suzgec="ok"
        />
      </div>
      {takvimde ? <TakvimGorunumu araclar={araclar} /> : <TabloGorunumu araclar={araclar} />}
    </div>
  );
}

function TabloGorunumu({ araclar }: { araclar: ReactNode }) {
  const d = useDenetim();
  const K = d.ekran.kal;
  if (!d.cihazlar.length) {
    return (
      <Kart>
        <div className="tc-dhd-bos">
          <Simge ad="ruler" boyut="b" />
          <h3>Cihaz listesi boş</h3>
          <p>Ürün uygunluğunu doğrulamak için kullandığınız her ölçüm cihazı, mastar ve test ekipmanı kalibrasyon takibinde olmalı; kişisel ölçü aletleri de dahil. Cihazlar Kalibrasyon modülünde eklenir.</p>
          <KalibrasyondaAc metin="Kalibrasyona git" />
        </div>
      </Kart>
    );
  }
  const liste = cihazListesi(d.cihazlar, K.filter, K.q);
  const sutunlar: Sutun<Cihaz>[] = [
    { anahtar: 'durum', baslik: 'Durum', hucre: (x) => <Durum d={x} /> },
    { anahtar: 'no', baslik: 'Cihaz no', mono: true, hucre: (x) => <b>{x.no}</b> },
    {
      anahtar: 'ad', baslik: 'Cihaz',
      hucre: (x) => <span className="tc-dhd-iki"><b>{x.ad}</b><small>{[x.marka, x.seri ? `SN ${x.seri}` : '', x.aralik].filter(Boolean).join(' · ')}</small></span>,
    },
    { anahtar: 'yer', baslik: 'Yer / sorumlu', hucre: (x) => <span className="tc-dhd-iki"><span>{x.yer || '–'}</span><small>{x.sorumlu}</small></span> },
    {
      anahtar: 'son', baslik: 'Son kalibrasyon', kirilmaz: true,
      hucre: (x) => (x.last ? <span className="tc-dhd-iki"><span>{tarihMetni(x.last)}</span>{x.res && <small>{KSON[x.res]}</small>}</span> : <span className="tc-dhd-soluk">–</span>),
    },
    {
      anahtar: 'sonraki', baslik: 'Sonraki', kirilmaz: true,
      hucre: (x) => {
        const n = cihazVadesi(x);
        return <span className="tc-dhd-iki"><b>{n ? tarihMetni(n) : '–'}</b><small>{x.nx ? 'elle girildi' : `${String(x.per)} ay · ${{ dis: 'dış lab', ic: 'iç', dog: 'doğrulama' }[x.tur]}`}</small></span>;
      },
    },
    { anahtar: 'eylem', baslik: 'İşlem', csv: false, hucre: () => <KalibrasyondaAc /> },
  ];
  return (
    <Kart>
      <Tablo
        etiket="Cihazlar" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(x) => x.id} bosMesaj="Bu filtrede cihaz yok."
        arac={{
          arama: { deger: K.q, degistir: (v) => { d.ekranDegistir((e) => { e.kal.q = v.slice(0, 80); }); }, etiket: 'Cihaz ara', yerTutucu: 'Ara: cihaz no, ad, yer, sorumlu' },
          suzgec: { etiket: 'Durum süzgeci', secenekler: SUZGECLER, secili: K.filter, sec: (v) => { d.ekranDegistir((e) => { e.kal.filter = v; }); } },
          sag: araclar,
        }}
      />
      <p className="tc-dhd-not">{`${String(liste.length)} cihaz gösteriliyor. Sonraki kalibrasyon = son kalibrasyon + periyot; Kalibrasyon modülünde elle de girilebilir.`}</p>
    </Kart>
  );
}

const ayAdi = (ym: string, uzun = false): string =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('tr-TR', uzun ? { month: 'long', year: 'numeric' } : { month: 'short' });
const ayKaydir = (ym: string, n: number): string => isoTarih(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).slice(0, 7);

function TakvimGorunumu({ araclar }: { araclar: ReactNode }) {
  const d = useDenetim();
  const K = d.ekran.kal;
  const t = bugunTarihi();
  const ym = K.month || t.slice(0, 7);
  const ilk = `${ym}-01`;
  const bas = pazartesi(ilk);
  const q = K.q.toLocaleLowerCase('tr');
  const aktif = d.cihazlar.filter((x) => x.st === 'aktif');
  const gunde: Record<string, Cihaz[]> = {};
  for (const x of aktif) {
    if (q && ![x.no, x.ad, x.yer, x.sorumlu].join(' ').toLocaleLowerCase('tr').includes(q)) continue;
    const n = cihazVadesi(x);
    if (n) (gunde[n] ??= []).push(x);
  }
  const geciken = aktif.filter((x) => { const k = cihazDurumu(x).k; return k === 'gec' || k === 'yok'; });
  const yil = aylar(12, true).map((k) => ({ k, c: aktif.filter((x) => cihazVadesi(x).slice(0, 7) === k).length }));
  const mx = Math.max(1, ...yil.map((x) => x.c));
  const gunler: string[] = [];
  for (let j = 0; j < 42; j++) {
    const gun = gunEkle(bas, j);
    if (j >= 35 && gun.slice(0, 7) !== ym && gun > gunEkle(ilk, 27)) break;
    gunler.push(gun);
  }
  const buAy = aktif.filter((x) => cihazVadesi(x).slice(0, 7) === ym).sort((a, b) => (cihazVadesi(a) < cihazVadesi(b) ? -1 : 1));
  const aySec = (k: string) => { d.ekranDegistir((e) => { e.kal.month = k; }); };

  return (
    <Kart>
      <div className="tc-dhd-ktakvim-arac">
        <label className="tc-dhd-kara">
          <span className="tc-dhd-gizli">Cihaz ara</span>
          <input type="search" value={K.q} placeholder="Ara: cihaz no, ad, yer, sorumlu" onChange={(o) => { const v = o.target.value; d.ekranDegistir((e) => { e.kal.q = v.slice(0, 80); }); }} />
        </label>
        {araclar}
      </div>
      {geciken.length > 0 && (
        <div className="tc-dhd-kuyari" role="note">
          <Simge ad="alert" />
          <span><b>{`${String(geciken.length)} cihazın kalibrasyonu gecikmiş veya kaydı yok: `}</b>{geciken.slice(0, 8).map((x) => x.no).join(', ')}{geciken.length > 8 ? ' …' : ''}</span>
        </div>
      )}
      <div className="tc-dhd-kyil" role="group" aria-label="Önümüzdeki 12 ay">
        {yil.map((x) => (
          <button key={x.k} type="button" aria-pressed={x.k === ym} aria-label={`${ayAdi(x.k, true)}: ${String(x.c)} cihaz`} onClick={() => { aySec(x.k); }}>
            <svg className="tc-dhd-kyil-cubuk" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">
              <rect x="0" y={100 - Math.round((x.c / mx) * 100)} width="10" height={Math.round((x.c / mx) * 100)} />
            </svg>
            <b>{x.c}</b>
            <small>{ayAdi(x.k)}</small>
          </button>
        ))}
      </div>
      <div className="tc-dhd-kay">
        <Dugme simge="chev-left" aria-label="Önceki ay" onClick={() => { aySec(ayKaydir(ym, -1)); }} />
        <h3>{ayAdi(ym, true)}</h3>
        <Dugme simge="chev-right" aria-label="Sonraki ay" onClick={() => { aySec(ayKaydir(ym, 1)); }} />
        <Dugme onClick={() => { aySec(t.slice(0, 7)); }}>Bugün</Dugme>
      </div>
      <div className="tc-dhd-kizgara" role="grid" aria-label={`${ayAdi(ym, true)} kalibrasyon takvimi`}>
        {GUNLER.map((g) => <span key={g} className="tc-dhd-kgun-adi" role="columnheader">{g}</span>)}
        {gunler.map((gun) => {
          const its = gunde[gun] ?? [];
          const sinif = ['tc-dhd-kgun', gun.slice(0, 7) === ym ? '' : 'tc-dhd-kgun-dis', gun === t ? 'tc-dhd-kgun-bugun' : ''].filter(Boolean).join(' ');
          return (
            <div key={gun} className={sinif} role="gridcell">
              <span className="tc-dhd-kgun-no">{Number(gun.slice(8, 10))}</span>
              {its.slice(0, 3).map((x) => {
                const st = cihazDurumu(x);
                return <span key={x.id} className={`tc-dhd-kolay tc-dhd-k-${st.ton}`} title={`${x.no} ${x.ad} · ${st.t}${x.yer ? ` · ${x.yer}` : ''}`}>{x.no}</span>;
              })}
              {its.length > 3 && <small>{`+${String(its.length - 3)}`}</small>}
            </div>
          );
        })}
      </div>
      <div className="tc-dhd-kliste">
        <h3>{`Bu ay kalibrasyonu dolan cihazlar · ${String(buAy.length)}`}</h3>
        {buAy.length ? buAy.map((x) => (
          <div key={x.id} className="tc-dhd-ksatir">
            <span className="tc-dhd-mono">{tarihMetni(cihazVadesi(x))}</span>
            <b>{x.no}</b>
            <span>{x.ad}</span>
            <span className="tc-dhd-soluk">{x.yer}</span>
            <Durum d={x} />
          </div>
        )) : <p className="tc-dhd-not">Bu ay kalibrasyonu dolan cihaz yok.</p>}
      </div>
    </Kart>
  );
}
