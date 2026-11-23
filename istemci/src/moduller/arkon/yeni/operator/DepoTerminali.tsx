import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Dugme, DurumKutusu, Orb, OrbGrubu, Pencere, Sekmeler, Simge, type MakineDurumu } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { sayi } from '../cekirdek/bicim.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { GecenSure } from './DurumSuresi.tsx';
import { SayacKadrani, SayimTuslari, type CevrimOlcer, type SayimTusu } from './Parcalar.tsx';
import type { Is } from './tipler.ts';

// 3388 a, 3389 a: depo işleri (mal kabul, yükleme) üretim terminalinin standart düzenindedir: üstte sıradaki işler, işin alanları,
// durum şeridi, kadran ve sayım tuşları, Başlat / Durdur / Duraklat / Bitir, sağda sekmeler. "Üretim girişi yerine kabul" (kullanıcı
// 17.11 14:50): İyi +1 yerine Kabul +1 (ya da Yüklendi +1), Hurda +1 yerine Eksik +1 (yalnız yüklemede); mal kabulde yan sayı yoktur, ret GKK'nindir (kullanıcı 17.11 17:34). Kayıt Stok'un ve Sevkiyat'ındır; terminal
// iş kaydına (sr) yazmaz. İşin durumu (başladı, duraklatıldı) ve terminalde tutulan sayım bu cihazdadır (VARSAYIM: depo işinin sunucuda
// durum kaydı yok; kayıt Bitir'de yazılır).

export type DepoDurumu = 'queued' | 'running' | 'paused' | 'stopped' | 'done';
export interface DepoSayimi { durum: DepoDurumu; since: number | null; sayilan: number; yan: number }
export const BOS_SAYIM: DepoSayimi = { durum: 'queued', since: null, sayilan: 0, yan: 0 };

export interface DepoAlani { etiket: string; deger: string | null; mono?: boolean }
export interface DepoAdimi { t: string; d: string; r: boolean }
export interface DepoIsi {
  anahtar: string;
  no: string;
  ad: string;
  tur: string;
  alanlar: readonly DepoAlani[];
  // Sayılabilecek en çok adet; bilinmiyorsa null (kadranda "—").
  hedef: number | null;
  // Sayı sunucudaysa (yüklemede çıkışı yazılan kalem) o; değilse terminalin sayımı.
  sunucuSayisi: number | null;
  sunucuYan?: number | null;
  // Sunucuya göre iş bitti (örn. durağın bütün kalemleri çıktı, irsaliye yazıldı); terminalin durumundan önce gelir.
  bitti?: boolean;
  adimlar: readonly DepoAdimi[];
  // Şeritteki iş kartının alt satırı (örn. termin ve kalan); yoksa çizilmez.
  kartSatiri?: string | null;
}
export interface DepoMetinleri {
  // birim: şeritteki iş birimi (kabul, durak); olcu: sayılanın birimi (adet, kalem).
  serit: string; birim: string; olcu: string; calisiyor: string; sayac: string; arti: string; yan?: string; yanArti?: string; basla: string; bos: string;
}
export interface DepoBaglami {
  is: DepoIsi; sayim: DepoSayimi; guncelle: (p: Partial<DepoSayimi>) => void;
  ac: (baslik: string, icerik: ReactNode) => void; kapat: () => void; bildir: (metin: string, ton?: 'iyi' | 'kotu') => void;
  // İş bitti; acikKalir: kayıt yazıldı ama iş listede sürer (kısmi kabul), sayım sıfırlanır ve iş sıraya döner.
  bitti: (acikKalir?: boolean) => void;
}
export interface DepoSekmesi { anahtar: string; baslik: string; simge: SimgeAdi; icerik: ReactNode }
// 3583 Y3: sayacın altında iki sabit düğme yuvası (örn. Kabul et, Etiket bas). null: yuva ayrılmış ama bu işte yok (görünmez, yer tutar);
// tikla null: yuva görünür ve pasif; birincil: sıradaki eylem dolu çizilir.
// 3584: alt, düğmenin ikinci satırıdır (örn. bekleyen sayısı ve lot kodu; yuva boyu değişmez); ad, erişilebilir ad (görünen adı içerir);
// neden, yuvanın işi yapamama nedenidir ve ileti satırında kapalı nedeninden önce gelir.
export interface DepoYuvasi {
  etiket: string; simge: SimgeAdi; tikla: (() => void) | null; birincil?: boolean;
  alt?: string | null; ad?: string; neden?: string | null; yukleniyor?: boolean;
}

// Durum düğmeleri üretimdekinin aynısıdır; Duraklat ve Bitir basılı tutulur (2000 b). Durdur depo işinde neden sormaz (VARSAYIM).
interface DepoDugmesi { eylem: 'start' | 'stop' | 'pause' | 'resume' | 'finish'; simge: SimgeAdi; etiket: string; ton: MakineDurumu; ana?: boolean; tut?: boolean; kapali?: true }
export function depoDugmeleri(durum: DepoDurumu, basla: string): DepoDugmesi[] {
  const bitir: DepoDugmesi = { eylem: 'finish', simge: 'flag', etiket: 'Bitir', ton: 'bitti', tut: true };
  if (durum === 'queued') return [{ eylem: 'start', simge: 'play', etiket: basla, ton: 'calisiyor', ana: true }];
  if (durum === 'running') return [{ eylem: 'stop', simge: 'stop', etiket: 'Durdur', ton: 'durdu', ana: true }, { eylem: 'pause', simge: 'pause', etiket: 'Duraklat', ton: 'durakli', tut: true }, bitir];
  if (durum === 'paused') return [{ eylem: 'stop', simge: 'stop', etiket: 'Durdur', ton: 'durdu' }, { eylem: 'resume', simge: 'play', etiket: 'Devam Et', ton: 'calisiyor', ana: true }, bitir];
  if (durum === 'stopped') return [{ eylem: 'resume', simge: 'rotate', etiket: 'Yeniden Başlat', ton: 'calisiyor', ana: true }, bitir];
  return [];
}
// 3583 Y4: üretim terminaliyle aynı üç sabit yuva (Başlat ya da Durdur · Duraklat ya da Durdur · Bitir); durumun düğmesi olmayan yuva pasif ve yerinde kalır.
export type DepoYuvaAdi = 'ana' | 'ara' | 'bitir';
export function sabitDepoDugmeleri(durum: DepoDurumu, basla: string): (DepoDugmesi & { yuva: DepoYuvaAdi })[] {
  const l = depoDugmeleri(durum, basla);
  const ana: DepoDugmesi = l.find((d) => d.ana) ?? { eylem: 'start', simge: 'play', etiket: basla, ton: 'calisiyor', ana: true, kapali: true };
  const bitir: DepoDugmesi = l.find((d) => d.eylem === 'finish') ?? { eylem: 'finish', simge: 'flag', etiket: 'Bitir', ton: 'bitti', tut: true, kapali: true };
  const ara: DepoDugmesi = l.find((d) => d !== ana && d.eylem !== 'finish') ?? { eylem: 'pause', simge: 'pause', etiket: 'Duraklat', ton: 'durakli', tut: true, kapali: true };
  return [{ ...ana, yuva: 'ana' }, { ...ara, yuva: 'ara' }, { ...bitir, yuva: 'bitir' }];
}
const BOS_IS: DepoIsi = { anahtar: '', no: '', ad: '', tur: '', alanlar: [], hedef: null, sunucuSayisi: null, adimlar: [] };
const SONRAKI: Record<DepoDugmesi['eylem'], DepoDurumu | null> = { start: 'running', resume: 'running', pause: 'paused', stop: 'stopped', finish: null };
const DURUM_RENGI: Record<DepoDurumu, MakineDurumu> = { queued: 'sirada', running: 'calisiyor', paused: 'ayar', stopped: 'durdu', done: 'calisiyor' };
const durumKelimesi = (d: DepoDurumu, m: DepoMetinleri): string =>
  ({ queued: 'Başlamadı', running: m.calisiyor, paused: 'Duraklatıldı', stopped: 'Duruş', done: 'Tamamlandı' })[d];
const DURUM_SIMGESI: Record<DepoDurumu, SimgeAdi> = { queued: 'clock', running: 'play', paused: 'pause', stopped: 'stop', done: 'check' };
// Kadran, üretimdeki İş biçimini okur (iyi, yan, hedef, durum); döngü halkası çizilmez.
const CEVRIMSIZ: CevrimOlcer = { gecen: () => 0, son: () => 0, sayac: () => 0 };
export const kadranIsi = (is: DepoIsi, sayilan: number, yan: number, durum: DepoDurumu): Is =>
  ({ no: is.no, part: is.ad, op: is.tur, target: is.hedef ?? 0, good: sayilan, scrap: yan, state: durum, cycle: 0 }) as unknown as Is;

// Sayım, sayılabilecek en çok adedi aşmaz (hedef bilinmiyorsa sınır yok).
export const sayimEklenir = (sayilan: number, hedef: number | null, n = 1): boolean => n > 0 && (hedef === null || sayilan + n <= hedef);

function useDepoSayimlari(kip: string) {
  const anahtar = `depo:${kip}`;
  const [hepsi, hepsiYaz] = useState<Record<string, DepoSayimi>>(() => yerel.oku<Record<string, DepoSayimi>>(anahtar) ?? {});
  useEffect(() => { yerel.yaz(anahtar, Object.keys(hepsi).length ? hepsi : null); }, [anahtar, hepsi]);
  const guncelle = (is: string, p: Partial<DepoSayimi>) => hepsiYaz((h) => ({ ...h, [is]: { ...BOS_SAYIM, ...h[is], ...p } }));
  // Listeden düşen işin sayımı silinir (kayıt yazıldı ya da iş kapandı).
  const temizle = (kalan: ReadonlySet<string>) => hepsiYaz((h) => {
    const yeni = Object.fromEntries(Object.entries(h).filter(([k]) => kalan.has(k)));
    return Object.keys(yeni).length === Object.keys(h).length ? h : yeni;
  });
  return { hepsi, guncelle, temizle };
}

export function DepoTerminali({ kip, dar, metin, isler, yukleniyor, hata, yenile, arti, yanArti, bitir, artiKapali, toplu, sekmeler, yuvalar, rozet }: {
  kip: string; dar: boolean; metin: DepoMetinleri; isler: readonly DepoIsi[] | null; yukleniyor: boolean; hata: string | null; yenile: () => void;
  arti: (b: DepoBaglami) => void; yanArti?: (b: DepoBaglami) => void; bitir: (b: DepoBaglami) => void;
  // Sayım tuşu kapalıysa nedeni (örn. okutmayla kabul edilen satın alma).
  artiKapali?: (is: DepoIsi) => string | null; toplu?: boolean;
  sekmeler: (b: DepoBaglami) => DepoSekmesi[]; yuvalar?: (b: DepoBaglami) => readonly [DepoYuvasi | null, DepoYuvasi | null];
  // Durum şeridindeki rozet (3584 Y3: örn. "Etiket bekliyor"); metin ve simge, yalnız renk değil.
  rozet?: (is: DepoIsi) => { metin: string; simge: SimgeAdi } | null;
}) {
  const s = useDepoSayimlari(kip);
  const [secili, seciliYaz] = useState<string | null>(null);
  const [pencere, pencereYaz] = useState<{ baslik: string; icerik: ReactNode } | null>(null);
  const [ileti, iletiYaz] = useState<{ metin: string; ton: 'iyi' | 'kotu' } | null>(null);
  const [sekme, sekmeYaz] = useState<string>('adimlar');
  const [gorunum, gorunumYaz] = useState<string>('is');
  const anahtarlar = useMemo(() => new Set((isler ?? []).map((x) => x.anahtar)), [isler]);
  useEffect(() => { if (isler) s.temizle(anahtarlar); }, [anahtarlar]);
  // 3583: yükleniyor, hata ve iş yok durumunda da iskelet çizilir; bölgeler yerinde kalır, yalnız içerikleri değişir.
  const liste = isler ?? [];
  const sayimi = (x: DepoIsi): DepoSayimi => (x.bitti ? { ...BOS_SAYIM, ...s.hepsi[x.anahtar], durum: 'done' } : s.hepsi[x.anahtar] ?? BOS_SAYIM);
  const ilkAcik = liste.find((x) => sayimi(x).durum === 'running') ?? liste.find((x) => sayimi(x).durum !== 'done') ?? liste[0] ?? null;
  const secilen = liste.find((x) => x.anahtar === secili) ?? ilkAcik;
  // Liste henüz gelmediyse (isler null) iş yok demek yanlış olur: o da yükleniyor sayılır.
  const bekliyor = yukleniyor || (isler === null && !hata);
  const bos = bekliyor || !!hata || !secilen;
  const is = secilen ?? BOS_IS;
  const sayim = bos ? BOS_SAYIM : sayimi(is);
  const sayilan = is.sunucuSayisi ?? sayim.sayilan;
  const yan = is.sunucuYan ?? sayim.yan;
  const sira = liste.indexOf(is);
  const b: DepoBaglami = {
    is, sayim, guncelle: (p) => s.guncelle(is.anahtar, p),
    ac: (baslik, icerik) => pencereYaz({ baslik, icerik }), kapat: () => pencereYaz(null),
    bildir: (m, ton = 'iyi') => iletiYaz({ metin: m, ton }),
    bitti: (acikKalir = false) => {
      pencereYaz(null);
      s.guncelle(is.anahtar, acikKalir ? BOS_SAYIM : { durum: 'done', since: Date.now() });
      if (acikKalir) return;
      const sonraki = liste.find((x, i) => i > sira && sayimi(x).durum !== 'done') ?? liste.find((x) => x !== is && sayimi(x).durum !== 'done');
      if (sonraki) seciliYaz(sonraki.anahtar);
    },
  };
  const calisiyor = !bos && sayim.durum === 'running';
  const kapaliNeden = bos ? null : artiKapali?.(is) ?? null;
  const tuslar: SayimTusu[] = [
    { etiket: metin.arti, simge: 'plus', ton: 'iyi', kapali: !calisiyor || kapaliNeden !== null || !sayimEklenir(sayilan, is.hedef), bas: () => { iletiYaz(null); arti(b); } },
    ...(metin.yanArti && yanArti ? [{ etiket: metin.yanArti, simge: 'trash' as const, ton: 'hurda' as const, kapali: !calisiyor || kapaliNeden !== null, bas: () => { iletiYaz(null); yanArti(b); } }] : []),
    ...(toplu ? [{ etiket: 'Toplu giriş', simge: 'layers' as const, ton: 'duz' as const, kapali: !calisiyor || kapaliNeden !== null, bas: () => pencereYaz({
      baslik: 'Toplu giriş', icerik: <DepoTopluGiris metin={metin} kalan={is.hedef === null ? null : is.hedef - sayilan} kaydet={(n, r) => { s.guncelle(is.anahtar, { sayilan: sayim.sayilan + n, yan: sayim.yan + r }); pencereYaz(null); }} />,
    }) }] : []),
  ];
  const eylem = (d: DepoDugmesi) => {
    iletiYaz(null);
    if (d.eylem === 'finish') { bitir(b); return; }
    s.guncelle(is.anahtar, { durum: SONRAKI[d.eylem]!, since: Date.now() });
  };
  const dugmeler = sabitDepoDugmeleri(sayim.durum, metin.basla);
  const seritCizgisi = (
    <section className="tc-ay1-sira" aria-label={metin.serit} data-depo="">
      <span className="tc-ay1-sira-ust">
        <Simge ad="list" boyut="k" /><b>{metin.serit}</b>
        <small className="tc-ay1-mono">{liste.filter((x) => sayimi(x).durum !== 'done').length} {metin.birim}{bos ? '' : ` · ${String(sira + 1)}/${String(liste.length)}`}</small>
      </span>
      <div className="tc-ay1-sira-govde">
        {bos ? <p className="tc-ay1-soluk tc-ay1-sira-bos" role="status">{bekliyor ? 'Yükleniyor…' : hata ? 'Okunamadı' : metin.bos}</p> : null}
        <ol>
          {liste.map((x) => {
            const d = sayimi(x).durum;
            const n = x.sunucuSayisi ?? sayimi(x).sayilan;
            return (
              <li key={x.anahtar} data-bitti={d === 'done' ? '' : undefined}>
                <button type="button" aria-pressed={x === is} aria-label={`${x.no} · ${x.ad}${x === is ? ' · ekranda' : ''}`} onClick={() => { iletiYaz(null); seciliYaz(x.anahtar); }}>
                  <article className="tc-ay1-tcark-kart" data-durum={DURUM_RENGI[d]} data-ekranda={x === is || undefined}>
                    <span className="tc-ay1-tcark-etiketler">
                      <span className="tc-ay1-cip" data-durum={DURUM_RENGI[d]}><i aria-hidden="true" />{d === 'queued' ? 'Sırada' : durumKelimesi(d, metin)}</span>
                      {x === is ? <span className="tc-ay1-etiket tc-ay1-tcark-ekranda">Ekranda</span> : null}
                    </span>
                    <b className="tc-ay1-mono">{x.no}</b>
                    <span className="tc-ay1-tcark-ad">{x.ad}</span>
                    <small>{x.tur}</small>
                    {x.hedef !== null ? <progress className="tc-ay1-tcark-ilerleme" max={1} value={x.hedef > 0 ? Math.min(1, n / x.hedef) : 0} aria-label="İlerleme" /> : null}
                    <small className="tc-ay1-mono">{x.hedef === null ? x.tur : `${sayi(n)} / ${sayi(x.hedef)} ${metin.olcu}`}</small>
                    {x.kartSatiri ? <small className="tc-ay1-tcark-satir">{x.kartSatiri}</small> : null}
                  </article>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
  const alanlar = (
    <section className="tc-ay1-aktif tc-ay1-kimlik" aria-label="Aktif iş">
      <div>
        <span className="tc-ay1-is-alanlari">
          {is.alanlar.map((a, i) => (
            <span key={a.etiket} className={a.mono ? 'tc-ay1-is-alan tc-ay1-mono' : 'tc-ay1-is-alan'}>
              <span className="tc-ay1-ust-yazi">{a.etiket}</span>
              {i === 0 ? <h2 className="tc-ay1-is-baslik">{a.deger || '—'}</h2> : <b>{a.deger || '—'}</b>}
            </span>
          ))}
          {bos ? <span className="tc-ay1-is-alan"><span className="tc-ay1-ust-yazi">Aktif iş</span><h2 className="tc-ay1-is-baslik">—</h2></span> : null}
        </span>
      </div>
    </section>
  );
  const durumRozeti = bos || !rozet ? null : rozet(is);
  const kelime = bos ? (bekliyor ? 'Yükleniyor' : hata ? 'Okunamadı' : 'İş yok') : durumKelimesi(sayim.durum, metin);
  const durumSeridi = (
    <div className="tc-ay1-ds" data-durum={bos ? 'sirada' : DURUM_RENGI[sayim.durum]} role="status" aria-label={[kelime, is.tur, is.hedef === null ? null : `${sayi(sayilan)} / ${sayi(is.hedef)}`].filter(Boolean).join(' · ')}>
      <span className="tc-ay1-ds-durum">
        <Simge ad={bos ? 'clock' : DURUM_SIMGESI[sayim.durum]} /><b>{kelime}</b>
        <span className="tc-ay1-ds-alt">
          {bos ? null : sayim.durum === 'queued' ? <small>sırada</small> : <GecenSure since={sayim.since} />}
          <span className="tc-ay1-ds-adim"><span data-uzun="">{is.tur}</span><span data-kisa="">{is.tur}</span></span>
          {durumRozeti ? <span className="tc-ay1-etiket tc-ay1-ds-rozet"><Simge ad={durumRozeti.simge} boyut="k" />{durumRozeti.metin}</span> : null}
        </span>
      </span>
      {is.hedef === null ? null : <span className="tc-ay1-ds-adet"><b>{sayi(sayilan)} / {sayi(is.hedef)}</b><small>{sayi(Math.max(0, is.hedef - sayilan))} kaldı{yan > 0 && metin.yan ? ` · ${sayi(yan)} ${metin.yan.toLocaleLowerCase('tr')}` : ''}</small></span>}
    </div>
  );
  const yuvaDizisi = bos || !yuvalar ? (yuvalar ? ([null, null] as const) : null) : yuvalar(b);
  const yuvaNedeni = yuvaDizisi?.find((y) => y?.neden)?.neden ?? null;
  // 3583 Y3: ileti bölgesi tek satır ve yalnız metindir (öncelik: bu işin iletisi, yükleniyor ya da hata, yuvanın nedeni (3584 K1), kapalı
  // nedeni); hep vardır, yükseklik sabittir.
  const iletiMetni = ileti ? ileti.metin : bekliyor ? null : hata ? hata : yuvaNedeni ? yuvaNedeni : kapaliNeden && sayim.durum !== 'done' ? kapaliNeden : null;
  const iletiSimgesi: SimgeAdi | null = ileti ? (ileti.ton === 'iyi' ? 'check' : 'alert') : bekliyor ? null : hata ? 'alert' : yuvaNedeni ? 'printer' : kapaliNeden && sayim.durum !== 'done' ? 'scan' : null;
  const iletiSatiri = (
    <div className="tc-ay1-depo-ileti" data-ton={ileti?.ton} data-bos={iletiMetni === null ? '' : undefined} role="status">
      {iletiSimgesi ? <Simge ad={iletiSimgesi} /> : null}<span role={ileti?.ton === 'kotu' ? 'alert' : undefined}>{iletiMetni}</span>
    </div>
  );
  const yuvaSatiri = yuvaDizisi ? (
    <div className="tc-ay1-yuvalar" role="group" aria-label="İş adımları">
      {yuvaDizisi.map((y, i) => (y
        ? <Dugme key={i} tur={y.birincil ? 'birincil' : 'ikincil'} simge={y.simge} disabled={y.tikla === null} yukleniyor={!!y.yukleniyor} aria-label={y.ad ?? y.etiket}
            onClick={() => { iletiYaz(null); y.tikla?.(); }}>
            {y.alt ? <span className="tc-ay1-yuva-yazi"><span>{y.etiket}</span><small className="tc-ay1-mono">{y.alt}</small></span> : y.etiket}
          </Dugme>
        : <span key={i} className="tc-ay1-yuva-bos" aria-hidden="true" />))}
    </div>
  ) : null;
  const sayac = (
    <div className="tc-ay1-sayac">
      <div className="tc-ay1-kadran-kanat">
        <SayacKadrani is={kadranIsi(is, sayilan, yan, sayim.durum)} etiket={metin.sayac} birim={metin.olcu} cevrim={CEVRIMSIZ} duzelt={null} yanEtiket={metin.yan ?? null} />
      </div>
      <SayimTuslari tuslar={dar ? tuslar.filter((t) => t.simge === 'layers') : tuslar} />
    </div>
  );
  const orblar = (yuvaAdlari?: readonly DepoYuvaAdi[]) => (
    <OrbGrubu etiket="İş durumu">
      {dugmeler.filter((d) => !yuvaAdlari || yuvaAdlari.includes(d.yuva)).map((d) => (
        <Orb key={d.yuva} simge={d.simge} etiket={d.etiket} ton={d.ton} ana={!!d.ana} disabled={bos || !!d.kapali} {...(d.tut ? { basiliTutMs: 1200 } : {})}
          tetikle={() => eylem(d)} erkenBirakinca={() => iletiYaz({ metin: `${d.etiket} için 1,2 sn basılı tut`, ton: 'kotu' })} />
      ))}
    </OrbGrubu>
  );
  const tumSekmeler: DepoSekmesi[] = [
    { anahtar: 'adimlar', baslik: `Adımlar (${String(is.adimlar.filter((a) => a.r).length)})`, simge: 'list', icerik: <DepoAdimlari adimlar={is.adimlar} /> },
    ...sekmeler(b),
    { anahtar: 'bilgi', baslik: 'Bilgi', simge: 'file', icerik: (
      <dl className="tc-ay1-depo-bilgi">{is.alanlar.map((a) => <div key={a.etiket}><dt>{a.etiket}</dt><dd>{a.deger || '—'}</dd></div>)}</dl>
    ) },
  ];
  const bolmeIcerigi = (anahtar: string): ReactNode => (bekliyor ? <DurumKutusu durum="yukleniyor" /> : hata ? <DurumKutusu durum="hata" mesaj={hata} yenile={yenile} /> : tumSekmeler.find((t) => t.anahtar === anahtar)?.icerik);
  const pencereOgesi = <Pencere acik={pencere !== null} kapat={() => pencereYaz(null)} baslik={pencere?.baslik ?? ''}>{pencere?.icerik}</Pencere>;

  if (dar) {
    const gor = gorunum === 'is' || tumSekmeler.some((t) => t.anahtar === gorunum) ? gorunum : 'is';
    const cubukYuvalari = dugmeler.filter((d) => d.yuva !== 'bitir');
    return (
      <>
        <div className="tc-ay1-gorunum">
          {gor === 'is' ? (
            <div className="tc-ay1-uretim">
              {seritCizgisi}
              <div className="tc-ay1-is-baslik">
                <button type="button" className="tc-ay1-is-satiri" disabled={bos} onClick={() => gorunumYaz('bilgi')} aria-label={bos ? 'Aktif iş yok' : `Aktif iş: ${is.no} · ${is.ad} · bilgileri aç`}>
                  <span>
                    <span className="tc-ay1-ust-yazi">Aktif iş</span>
                    <b className="tc-ay1-is-ozet-satir">{bos ? '—' : [is.no, is.ad].join(' · ')}</b>
                  </span>
                  <Simge ad="layers" boyut="k" />
                </button>
              </div>
              {durumSeridi}
              {iletiSatiri}
              {yuvaSatiri}
              {sayac}
              {orblar(['bitir'])}
            </div>
          ) : <div className="tc-ay1-bolme" role="region" tabIndex={0} aria-label="İş ayrıntısı içeriği">{bolmeIcerigi(gor)}</div>}
        </div>
        <div className="tc-ay1-alt">
          {gor === 'is' ? (
            <div className="tc-ay1-cubuk" role="group" aria-label="İş eylemleri">
              {cubukYuvalari.map((d) => (
                <button key={d.yuva} type="button" className="tc-ay1-cubuk-dugme" data-durum={d.ton} data-ana={d.ana || undefined} disabled={bos || !!d.kapali} onClick={() => eylem(d)}><Simge ad={d.simge} />{d.etiket}</button>
              ))}
              {tuslar.filter((t) => t.simge !== 'layers').map((t) => (
                <button key={t.etiket} type="button" className="tc-ay1-cubuk-dugme" data-tur={t.ton} disabled={t.kapali} onClick={t.bas}><Simge ad={t.simge} />{t.etiket}</button>
              ))}
            </div>
          ) : null}
          <nav className="tc-ay1-alt-gezinme" aria-label="Terminal görünümleri">
            {[{ anahtar: 'is', baslik: metin.sayac, simge: 'gauge' as SimgeAdi }, ...tumSekmeler].map((t) => (
              <button key={t.anahtar} type="button" aria-current={gor === t.anahtar ? 'page' : undefined} onClick={() => gorunumYaz(t.anahtar)}>
                <span className="tc-ay1-alt-simge"><Simge ad={t.simge} /></span>{t.baslik.replace(/ \(\d+\)$/, '')}
              </button>
            ))}
          </nav>
        </div>
        {pencereOgesi}
      </>
    );
  }
  const acikSekme = tumSekmeler.some((t) => t.anahtar === sekme) ? sekme : tumSekmeler[0]!.anahtar;
  return (
    <>
      {seritCizgisi}
      {alanlar}
      {durumSeridi}
      <div className="tc-ay1-izgara">
        <div className="tc-ay1-orta tc-ay1-sutun">
          <section className="tc-ay1-sahne" aria-label={metin.sayac}>
            {iletiSatiri}
            {yuvaSatiri}
            {sayac}
            {orblar()}
          </section>
        </div>
        <div className="tc-ay1-sag tc-ay1-sutun">
          <Sekmeler etiket="İş ayrıntısı" secili={acikSekme} sec={sekmeYaz} sekmeler={tumSekmeler.map((t) => ({ anahtar: t.anahtar, baslik: t.baslik, simge: t.simge }))} />
          <div className="tc-ay1-bolme" role="tabpanel" tabIndex={0} aria-label="İş ayrıntısı içeriği">{bolmeIcerigi(acikSekme)}</div>
        </div>
      </div>
      {pencereOgesi}
    </>
  );
}

function DepoAdimlari({ adimlar }: { adimlar: readonly DepoAdimi[] }) {
  return (
    <ol className="tc-ay1-depo-adimlar" aria-label="Adımlar">
      {adimlar.map((a, i) => (
        <li key={a.t}><span className="tc-ay1-depo-adim-no">{i + 1}</span><span><b>{a.t}</b>{a.d ? <small>{a.d}</small> : null}</span>{a.r ? <em className="tc-ay1-etiket">Zorunlu</em> : null}</li>
      ))}
    </ol>
  );
}

// Toplu giriş: sayılan (ve varsa yan) adet bir seferde; sayılan kalan adedi aşamaz.
function DepoTopluGiris({ metin, kalan, kaydet }: { metin: DepoMetinleri; kalan: number | null; kaydet: (n: number, r: number) => void }) {
  const [n, nYaz] = useState('');
  const [r, rYaz] = useState('');
  const sayiOku = (v: string) => (v.trim() === '' ? 0 : Number(v));
  const a = sayiOku(n);
  const y = sayiOku(r);
  const hata = !Number.isInteger(a) || !Number.isInteger(y) || a < 0 || y < 0 ? 'Tam sayı girin.'
    : kalan !== null && a > kalan ? `En çok ${sayi(Math.max(0, kalan))} ${metin.sayac.toLocaleLowerCase('tr')} girilir.` : null;
  const alan = (l: string, v: string, yaz: (s: string) => void, tur: 'iyi' | 'hurda') => (
    <label className="tc-ay1-toplu-alan" data-tur={tur}>
      <span className="tc-ay1-ust-yazi">{l}</span>
      <input className="tc-ay1-mono" inputMode="numeric" pattern="[0-9]*" value={v} placeholder="0" aria-label={`Toplu ${l.toLocaleLowerCase('tr-TR')}`} onChange={(e) => yaz(e.target.value)} />
    </label>
  );
  return (
    <div className="tc-ay1-toplu" role="group" aria-label="Toplu giriş">
      <div className="tc-ay1-toplu-ust"><Simge ad="layers" boyut="k" /><span className="tc-ay1-ust-yazi">Toplu giriş</span>{kalan !== null ? <small className="tc-ay1-soluk">{metin.sayac} en çok {sayi(Math.max(0, kalan))}</small> : null}</div>
      <div className="tc-ay1-toplu-satir">
        {alan(metin.sayac, n, nYaz, 'iyi')}{metin.yan ? alan(metin.yan, r, rYaz, 'hurda') : null}
        <button type="button" className="tc-ay1-tus" data-tur="iyi" disabled={!!hata || a + y === 0} onClick={() => kaydet(a, y)}><Simge ad="check" />Kaydet</button>
      </div>
      {hata ? <small className="tc-ay1-hata" role="alert">{hata}</small> : null}
    </div>
  );
}
