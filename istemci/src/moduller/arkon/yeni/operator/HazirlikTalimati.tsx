import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import type { AdimCevabi, AdimNotuGovdesi, AdimTamamlaGovdesi, EmirAdimi, EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { TalimatAdimi, TalimatlarCevabi } from '#paylasilan/sozlesme/rota.ts';
import { DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../ortak/veri/istek-kimligi.ts';
import { dosyaYukle } from '../../../belge-merkezi/disari.ts';
import {
  ASAMA_BILGISI, BOS_GIRIS, eksikZorunlular, hazirlikAdimlari, kanitGovdesi, medyaAdresi, olcumHali, sinirMetni, tamamOlur,
  type HazirlikAdimi, type HazirlikAsamasi, type KanitGirisi,
} from './hazirlik-talimati.ts';
import './hazirlik-talimati.css';

// Tam sayfa hazırlık talimatı (kart 2098c, prototip v5): operatör kaydırmaz; sığmayan adımda önce yazı, sonra medya sıkışır.
// İşaret, kanıt ve not iş emrine kişi ve saatle yazılır; resim ve video rotadaki talimattan, emrin sabitlediği sürümle okunur.

export const YANLIS_NEDENLERI = ['Görsel yanlış ya da eski', 'Adım eksik', 'Sıra yanlış', 'Takım ya da aparat farklı', 'Diğer'] as const;
const KAYDIR = 60;

type Katman = 'medya' | 'gecen' | 'not' | 'bayrak' | 'iletildi' | 'uyari' | null;

function useTalimatVerisi(emirId: number | null) {
  const [adimlar, adimlarYaz] = useState<EmirAdimi[] | null>(null);
  const [talimat, talimatYaz] = useState<TalimatAdimi[] | null>(null);
  const [hata, hataYaz] = useState<unknown>(null);
  useEffect(() => {
    adimlarYaz(null); talimatYaz(null); hataYaz(null);
    if (emirId === null) { adimlarYaz([]); return; }
    let canli = true;
    api.get<EmirAyrintiCevabi>(`/uretim-emirleri/${String(emirId)}`).then((c) => {
      if (!canli) return;
      const l = c.adimlar ?? [];
      adimlarYaz(l);
      const k = l.find((a) => a.talimat !== null)?.talimat;
      if (!k) return;
      // Medya okunamazsa adımlar yine gösterilir; görsel alanı boş kalır.
      api.get<TalimatlarCevabi>(`/rota/urunler/${String(k.urunId)}/talimatlar/${String(k.opNo)}`)
        .then((t) => { if (canli) talimatYaz(t.surumler.find((s) => s.surum === k.surum)?.adimlar ?? null); }, () => undefined);
    }, (e: unknown) => { if (canli) { hataYaz(e); adimlarYaz([]); } });
    return () => { canli = false; };
  }, [emirId]);
  return { adimlar, talimat, hata, adimlarYaz };
}

export function HazirlikTalimati({ emirId, asama, baslik, canli, otomatik = false, kapat, baslat, bildir }: {
  emirId: number | null; asama: HazirlikAsamasi; baslik: string; canli: string | null; otomatik?: boolean;
  kapat: () => void; baslat: (() => void) | null; bildir: ((not: string) => void) | null;
}) {
  const { adimlar, talimat, hata, adimlarYaz } = useTalimatVerisi(emirId);
  const L = adimlar ? hazirlikAdimlari(adimlar, talimat, asama) : null;
  const [sec, secYaz] = useState(0);
  const [medya, medyaYaz] = useState(0);
  const [katman, katmanYaz] = useState<Katman>(null);
  const [girisler, girislerYaz] = useState<Record<number, KanitGirisi>>({});
  const [yaziyor, yaziyorYaz] = useState(false);
  const [ileti, iletiYaz] = useState<string | null>(null);
  const [iletilen, iletilenYaz] = useState('');
  const [notMetni, notMetniYaz] = useState('');
  const [yukleme, yuklemeYaz] = useState<number | null>(null);
  const kok = useRef<HTMLElement>(null);
  const icerik = useRef<HTMLDivElement>(null);
  const foto = useRef<HTMLInputElement>(null);
  const tutus = useRef<{ x: number; y: number } | null>(null);
  const bilgi = ASAMA_BILGISI[asama];

  // Kendiliğinden açılan liste (ayar başlayınca) adımı yoksa ekranı kapatmaz, hiç açılmamış sayılır.
  const bos = L !== null && L.length === 0;
  useEffect(() => { if (otomatik && bos && hata === null) kapat(); }, [otomatik, bos, hata]);
  // Açılışta ilk işaretlenmemiş adım gösterilir; hepsi işaretliyse bitiş sayfası.
  const acildi = useRef(false);
  useEffect(() => {
    if (acildi.current || !L || !L.length) return;
    acildi.current = true;
    const i = L.findIndex((a) => !a.tamam);
    secYaz(i < 0 ? L.length : i);
  }, [L]);

  const a: HazirlikAdimi | null = L?.[sec] ?? null;
  const g = a ? girisler[a.id] ?? BOS_GIRIS : BOS_GIRIS;
  const gir = (p: Partial<KanitGirisi>) => { if (a) girislerYaz((x) => ({ ...x, [a.id]: { ...(x[a.id] ?? BOS_GIRIS), ...p } })); };
  const git = useCallback((i: number) => {
    if (!L) return;
    secYaz(Math.max(0, Math.min(L.length, i))); medyaYaz(0); katmanYaz(null); iletiYaz(null);
  }, [L]);

  useLayoutEffect(() => {
    const k = kok.current; const ic = icerik.current;
    if (!k) return undefined;
    const sigdir = () => {
      delete k.dataset['sik'];
      if (!ic) return;
      const tasar = () => ic.scrollHeight > ic.clientHeight + 1;
      if (tasar()) k.dataset['sik'] = '1';
      if (tasar()) k.dataset['sik'] = '2';
    };
    sigdir();
    addEventListener('resize', sigdir);
    return () => removeEventListener('resize', sigdir);
  });

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { if (katman) katmanYaz(null); else kapat(); }
      if (katman) return;
      if (e.key === 'ArrowRight') git(sec + 1);
      if (e.key === 'ArrowLeft') git(sec - 1);
    };
    addEventListener('keydown', tus);
    return () => removeEventListener('keydown', tus);
  }, [katman, sec, git, kapat]);

  // Not ucu tekrar korumalıdır: istek kimliğiyle gider, cevabı kaybolan gönderim aynı kimlikle yinelenir, not iki kez yazılmaz.
  const yaz = async (yol: string, govde: unknown, sonra?: () => void, korumali = false) => {
    if (emirId === null || yaziyor) return;
    yaziyorYaz(true); iletiYaz(null);
    const adres = `/uretim-emirleri/${String(emirId)}/adimlar/${yol}`;
    try {
      const c = korumali
        ? await tekrarKorumaliGonder((d) => api.post<AdimCevabi>(adres, govde, {
          istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}),
        }))
        : await api.post<AdimCevabi>(adres, govde);
      adimlarYaz(c.adimlar);
      sonra?.();
    } catch (e: unknown) {
      iletiYaz(hataIletisi(e, 'Kaydedilmedi'));
    } finally { yaziyorYaz(false); }
  };
  const isaretle = () => {
    if (!a) return;
    if (a.tamam) { void yaz(`${String(a.id)}/tamamla`, { tamam: false } satisfies AdimTamamlaGovdesi); return; }
    if (!tamamOlur(a, g)) return;
    const kanit = kanitGovdesi(a, g);
    void yaz(`${String(a.id)}/tamamla`, { tamam: true, ...(kanit ? { kanit } : {}) } satisfies AdimTamamlaGovdesi, () => git(sec + 1));
  };
  const notYaz = () => {
    if (!a || !notMetni.trim()) return;
    void yaz(`${String(a.id)}/not`, { metin: notMetni.trim() } satisfies AdimNotuGovdesi, () => { notMetniYaz(''); katmanYaz(null); }, true);
  };
  const fotoSecildi = async (e: ChangeEvent<HTMLInputElement>) => {
    const d = e.target.files?.[0];
    e.target.value = '';
    if (!d) return;
    yuklemeYaz(0); iletiYaz(null);
    try {
      const ozet = await dosyaYukle(new Uint8Array(await d.arrayBuffer()), yuklemeYaz);
      gir({ foto: ozet });
    } catch (x: unknown) {
      iletiYaz(hataIletisi(x, 'Fotoğraf yüklenmedi'));
    } finally { yuklemeYaz(null); }
  };
  const eksikler = L ? eksikZorunlular(L) : [];
  const baslatIste = (zorla: boolean) => {
    if (!baslat) return;
    if (!zorla && eksikler.length) { katmanYaz('uyari'); return; }
    baslat();
  };

  const tamamSayisi = L ? L.filter((x) => x.tamam).length : 0;
  const ust = (
    <header className="tc-ay1-ht-ust">
      <span className="tc-ay1-ht-asama" data-asama={asama}><Simge ad={asama === 'hazirlik' ? 'wrench' : 'layers'} boyut="k" /><span className="tc-ay1-ht-uzun">{bilgi.ad}</span></span>
      <div className="tc-ay1-ht-baslik"><h2 id="tc-ay1-ht-baslik">{baslik}</h2><span className="tc-ay1-ht-alt">{bilgi.alt}</span></div>
      {canli ? <span className="tc-ay1-ht-canli"><i aria-hidden="true" />{canli}</span> : null}
      {L && L.length ? <span className="tc-ay1-ht-sayi">{`${String(tamamSayisi)} / ${String(L.length)}`}</span> : null}
      <button type="button" className="tc-ay1-ht-kare" onClick={kapat} aria-label="Kapat"><Simge ad="x" /></button>
    </header>
  );

  let govde;
  if (L === null) govde = <div className="tc-ay1-ht-bos"><DurumKutusu durum="yukleniyor" mesaj="Hazırlık adımları yükleniyor" /></div>;
  else if (hata !== null) govde = <div className="tc-ay1-ht-bos"><DurumKutusu durum="hata" hata={hata} mesaj="Hazırlık adımları alınamadı" /></div>;
  else if (!L.length) {
    govde = (
      <div className="tc-ay1-ht-bos">
        <Simge ad="layers" boyut="b" /><h3>{emirId === null ? 'Bu iş CORE iş emri değil; hazırlık talimatı yok' : bilgi.bos}</h3>
        <span>Reçete ve Rota'da talimat adımına bu aşama verilince burada görünür.</span>
        <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={kapat}>Kapat</button>
      </div>
    );
  } else if (!a) {
    const hepsi = tamamSayisi === L.length;
    govde = (
      <div className="tc-ay1-ht-bos" data-bitti="">
        <span data-ton={hepsi ? 'tamam' : 'uyari'}><Simge ad={hepsi ? 'check' : 'alert'} boyut="b" /></span>
        <h3>{hepsi ? `${bilgi.ad} tamam` : `${String(L.length - tamamSayisi)} adım işaretlenmedi`}</h3>
        <span>{asama === 'on_hazirlik' ? 'İş bitince sıradaki işe hemen geçebilirsin.' : 'Başlat ile üretime geç.'}</span>
        <span className="tc-ay1-ht-satir">
          <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={() => git(Math.max(0, L.findIndex((x) => !x.tamam)))}><Simge ad="chev-left" boyut="k" />Adımlara dön</button>
          {baslat
            ? <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" data-tur="calis" onClick={() => baslatIste(false)}><Simge ad="play" boyut="k" />Başlat</button>
            : <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" data-tur="ana" onClick={kapat}>Kapat</button>}
        </span>
      </div>
    );
  } else {
    const m = a.medya[Math.min(medya, a.medya.length - 1)] ?? null;
    const oh = olcumHali(a.kontrol, g.deger);
    const son = sec === L.length - 1;
    govde = (
      <>
        <div className="tc-ay1-ht-sahne"
          onPointerDown={(e) => { tutus.current = { x: e.clientX, y: e.clientY }; }}
          onPointerUp={(e) => {
            const t = tutus.current; tutus.current = null;
            if (!t) return;
            const dx = e.clientX - t.x;
            if (Math.abs(dx) > KAYDIR && Math.abs(dx) > Math.abs(e.clientY - t.y) * 2) git(sec + (dx < 0 ? 1 : -1));
          }}>
          <div className="tc-ay1-ht-sahne-ic">
            {m ? <Medya m={m} /> : <span className="tc-ay1-ht-gorselsiz"><Simge ad="eye" boyut="b" />Bu adımda resim ya da video yok</span>}
            {m && a.medya.length > 1 ? (
              <button type="button" className="tc-ay1-ht-cip tc-ay1-ht-tur" onClick={() => medyaYaz((x) => (x + 1) % a.medya.length)} aria-label="Sonraki medya">
                <Simge ad={m.tur === 'video' ? 'play' : 'eye'} boyut="k" />{`${m.tur === 'video' ? 'Video' : 'Resim'} · ${String(medya + 1)}/${String(a.medya.length)}`}
              </button>
            ) : null}
            {m ? <button type="button" className="tc-ay1-ht-kare tc-ay1-ht-buyut" onClick={() => katmanYaz('medya')} aria-label="Medyayı büyüt"><Simge ad="expand" /></button> : null}
          </div>
        </div>
        <div className="tc-ay1-ht-yon">
          <div className="tc-ay1-ht-yon-ust">
            <span className="tc-ay1-ht-no">{`ADIM ${String(sec + 1)} / ${String(L.length)}${a.zorunlu ? ' · ZORUNLU' : ''}`}</span>
            <h3>{a.baslik}</h3>
          </div>
          <div className="tc-ay1-ht-icerik" ref={icerik}>
            {a.yonerge.length ? <ol className="tc-ay1-ht-yonerge">{a.yonerge.map((s, j) => <li key={j}><span className="tc-ay1-ht-balon">{j + 1}</span><span>{s}</span></li>)}</ol> : null}
            <Eylem a={a} g={g} oh={oh} gir={gir} fotoAc={() => foto.current?.click()} yukleme={yukleme} />
            {a.gecenNot ? (
              <button type="button" className="tc-ay1-ht-gecen" onClick={() => katmanYaz('gecen')}>
                <Simge ad="clock" boyut="k" /><span><b>Geçen sefer:</b> “{a.gecenNot.metin}”</span>
              </button>
            ) : null}
            {ileti ? <p className="tc-ay1-ht-hata" role="alert">{ileti}</p> : null}
          </div>
          <div className="tc-ay1-ht-yon-alt">
            <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" disabled={sec === 0} onClick={() => git(sec - 1)} aria-label="Önceki adım"><Simge ad="chev-left" /></button>
            <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" data-genis="" {...(a.tamam ? {} : { 'data-tur': 'ana' })}
              disabled={yaziyor || yukleme !== null || (!a.tamam && !tamamOlur(a, g))} onClick={isaretle}>
              <Simge ad={a.tamam ? 'rotate' : 'check'} />{a.tamam ? 'Geri al' : <>Tamam<span className="tc-ay1-ht-uzun">{son ? ' · bitir' : ' · sonraki'}</span></>}
            </button>
            <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={() => git(sec + 1)} aria-label="Sonraki adım"><Simge ad="chev-right" /></button>
            <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={() => katmanYaz('not')} aria-label="Sonraki sefere not bırak" title="Sonraki sefere not bırak"><Simge ad="edit" /></button>
            {bildir ? <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={() => katmanYaz('bayrak')} aria-label="Bu adım yanlış ya da eksik" title="Bu adım yanlış ya da eksik"><Simge ad="flag" /></button> : null}
          </div>
        </div>
      </>
    );
  }

  let ustKatman = null;
  if (katman === 'uyari') {
    ustKatman = (
      <div className="tc-ay1-ht-uyari" role="alert">
        <Simge ad="alert" />
        <div>
          <b>{`${String(eksikler.length)} zorunlu adım işaretlenmedi`}</b>
          <span>{eksikler.map((x) => x.baslik).join(' · ')}</span>
          <span className="tc-ay1-ht-soluk">İş başlar; eksik adımlar iş emrinin kaydında işaretsiz kalır.</span>
          <span className="tc-ay1-ht-satir">
            <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={() => { katmanYaz(null); git(L ? L.indexOf(eksikler[0]!) : 0); }}>Adımlara dön</button>
            <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" data-tur="calis" onClick={() => { katmanYaz(null); baslatIste(true); }}><Simge ad="play" boyut="k" />Yine de başlat</button>
          </span>
        </div>
      </div>
    );
  } else if (a && katman) {
    const m = a.medya[Math.min(medya, a.medya.length - 1)] ?? null;
    ustKatman = (
      <div className="tc-ay1-ht-katman" data-tur={katman}>
        <div className="tc-ay1-ht-katman-ic" role="dialog" aria-label={a.baslik}>
          {katman === 'medya' && m ? <>
            <span className="tc-ay1-ht-satir" data-iki-yana=""><b>{a.baslik}</b><button type="button" className="tc-ay1-ht-kare" onClick={() => katmanYaz(null)} aria-label="Kapat"><Simge ad="x" /></button></span>
            <Medya m={m} />
          </> : null}
          {katman === 'gecen' && a.gecenNot ? <>
            <h3><Simge ad="clock" />{`Geçen sefer · ${a.gecenNot.yazan.ad} · ${new Date(a.gecenNot.zaman).toLocaleDateString('tr-TR')}`}</h3>
            <p>“{a.gecenNot.metin}”</p>
            <span className="tc-ay1-ht-satir">
              <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={() => katmanYaz('not')}><Simge ad="edit" boyut="k" />Sonraki sefere not bırak</button>
              <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" data-tur="ana" onClick={() => katmanYaz(null)}>Kapat</button>
            </span>
          </> : null}
          {katman === 'not' ? <>
            <h3><Simge ad="edit" />Sonraki sefere not</h3>
            {a.buNot ? <span className="tc-ay1-ht-soluk">{`Bu iş emrindeki son not: “${a.buNot.metin}”`}</span> : null}
            <label className="tc-ay1-ht-not">
              <span>Bu adımı bir dahaki sefere yapacak kişi görür</span>
              <textarea value={notMetni} maxLength={300} rows={3} onChange={(e) => notMetniYaz(e.target.value)} />
            </label>
            {ileti ? <p className="tc-ay1-ht-hata" role="alert">{ileti}</p> : null}
            <span className="tc-ay1-ht-satir">
              <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={() => katmanYaz(null)}>Vazgeç</button>
              <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" data-tur="ana" disabled={yaziyor || !notMetni.trim()} onClick={notYaz}>Notu kaydet</button>
            </span>
          </> : null}
          {katman === 'bayrak' && bildir ? <>
            <h3><Simge ad="flag" />Bu adımda ne yanlış?</h3>
            <span className="tc-ay1-ht-satir">
              {YANLIS_NEDENLERI.map((n) => (
                <button key={n} type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={() => { bildir(`Talimat · ${baslik} · adım ${String(sec + 1)} ${a.baslik}: ${n}`); iletilenYaz(n); katmanYaz('iletildi'); }}>{n}</button>
              ))}
            </span>
            <span className="tc-ay1-ht-soluk">Vardiya amirine çağrı olarak gider.</span>
            <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={() => katmanYaz(null)}>Vazgeç</button>
          </> : null}
          {katman === 'iletildi' ? <>
            <h3><Simge ad="check" />Vardiya amirine iletildi</h3>
            <p>{`${iletilen} · çağrı açıldı`}</p>
            <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" data-tur="ana" onClick={() => katmanYaz(null)}>Tamam</button>
          </> : null}
        </div>
      </div>
    );
  }

  return (
    <section ref={kok} className="tc-ay1-ht" data-asama={asama} role="dialog" aria-modal="true" aria-labelledby="tc-ay1-ht-baslik">
      {ust}
      {L && L.length ? (
        <nav className="tc-ay1-ht-serit" aria-label="Adımlar">
          {L.map((x, j) => (
            <button key={x.id} type="button" onClick={() => git(j)} {...(j === sec ? { 'aria-current': 'step' as const } : {})} {...(x.tamam ? { 'data-tamam': '' } : {})}
              aria-label={`Adım ${String(j + 1)}: ${x.baslik}${x.tamam ? ' · tamam' : ''}`}>
              <span className="tc-ay1-ht-serit-no">{x.tamam ? <Simge ad="check" boyut="k" /> : j + 1}</span>
              <span className="tc-ay1-ht-serit-ad">{x.baslik}</span>
              {x.zorunlu && !x.tamam ? <span className="tc-ay1-ht-z" title="Zorunlu" /> : null}
            </button>
          ))}
        </nav>
      ) : <span />}
      <div className="tc-ay1-ht-govde">
        {govde}
        {ustKatman}
      </div>
      <input ref={foto} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void fotoSecildi(e); }} />
    </section>
  );
}

function Medya({ m }: { m: HazirlikAdimi['medya'][number] }) {
  return m.tur === 'video'
    ? <video className="tc-ay1-ht-medya" src={medyaAdresi(m.ozet)} controls playsInline preload="metadata" aria-label={m.ad} />
    : <img className="tc-ay1-ht-medya" src={medyaAdresi(m.ozet)} alt={m.ad} />;
}

// Tek kutu: ne yapılacağı ve kanıt (ölçüm, fotoğraf ya da seçim).
function Eylem({ a, g, oh, gir, fotoAc, yukleme }: {
  a: HazirlikAdimi; g: KanitGirisi; oh: ReturnType<typeof olcumHali>; gir: (p: Partial<KanitGirisi>) => void; fotoAc: () => void; yukleme: number | null;
}) {
  const k = a.kontrol;
  if (a.tamam) {
    const kn = a.kanit;
    const ek = kn ? [kn.olcum !== null ? String(kn.olcum).replace('.', ',') : null, kn.secim, kn.foto ? 'fotoğraf eklendi' : null].filter(Boolean).join(' · ') : '';
    return <div className="tc-ay1-ht-eylem"><span className="tc-ay1-ht-okundu"><Simge ad="check" />{`İşaretlendi${ek ? ` · ${ek}` : ''}`}</span></div>;
  }
  if (k.tur === 'yok' || k.tur === 'onay') return null;
  let ipucu: { hal: string; metin: string } | null = null;
  if (k.tur === 'olcum') {
    if (oh === 'uygun') ipucu = { hal: 'uygun', metin: 'Sınır içinde' };
    else if (oh === 'disinda') ipucu = { hal: 'disinda', metin: `Sınır dışında · ${sinirMetni(k)}` };
    else ipucu = { hal: '', metin: `${sinirMetni(k)}${a.zorunlu ? ' · zorunlu' : ''}` };
  }
  if (k.tur === 'foto') ipucu = { hal: '', metin: `${k.aciklama ?? 'Fotoğrafla kanıtla'}${a.zorunlu ? ' · fotoğrafsız tamamlanmaz' : ''}` };
  if (k.tur === 'secim' && a.zorunlu) ipucu = { hal: '', metin: 'Seçmeden tamamlanmaz' };
  return (
    <div className="tc-ay1-ht-eylem">
      <div className="tc-ay1-ht-satir">
        {k.tur === 'olcum' ? (
          <label className="tc-ay1-ht-satir">
            <span>{k.ad}</span>
            <input inputMode="decimal" placeholder="0,00" value={g.deger} aria-label={k.ad} data-hal={oh ?? ''} onChange={(e) => gir({ deger: e.target.value })} />
            <b>{k.birim}</b>
          </label>
        ) : null}
        {k.tur === 'foto' ? (
          yukleme !== null
            ? <span className="tc-ay1-ht-okundu"><Simge ad="upload" />{`Yükleniyor · %${String(Math.round(yukleme * 100))}`}</span>
            : g.foto
              ? <><span className="tc-ay1-ht-okundu"><Simge ad="camera" />Fotoğraf eklendi</span><button type="button" className="tc-ay1-ht-dugme" onClick={fotoAc}>Yeniden çek</button></>
              : <button type="button" className="tc-ay1-ht-dugme" data-buyuk="" onClick={fotoAc}><Simge ad="camera" />Fotoğraf çek</button>
        ) : null}
        {k.tur === 'secim' ? k.secenekler.map((s) => (
          <button key={s} type="button" className="tc-ay1-ht-dugme" data-buyuk="" aria-pressed={g.secim === s} onClick={() => gir({ secim: g.secim === s ? null : s })}>{s}</button>
        )) : null}
      </div>
      {ipucu ? <span className="tc-ay1-ht-ipucu" data-hal={ipucu.hal}>{ipucu.metin}</span> : null}
    </div>
  );
}
