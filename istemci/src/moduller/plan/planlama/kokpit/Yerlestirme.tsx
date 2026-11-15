import { useEffect, useMemo, useRef, useState } from 'react';
import { Dugme, Rozet, Simge, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { planaAlOnizle, type PlanaAlOnizlemesi } from './plana-al.ts';
import { adimSecimleri, durumYazisi, fasonMu, tasimaSaati, type AdimSecimi, type EmirDurumu, type KokpitEmri, type KokpitModeli, type TurAdayi } from './kurallar.ts';
import { adimYeri, bosYerler, siradakiAdim, uygunTezgahlar, type BosYer, type SiraKarti } from './yerlestirme.ts';
import './yerlestirme.css';

// Kokpit'in yukarıdan aşağı düzeninin üst iki bölümü (3297 a): 1 sıra kartları, 2 seçilen kartın emirleri ve adımları. Plansız emirde
// kişi adım adım tezgâh seçer (adıma basar, boş yere basar); seçimler ekranda birikir, son tezgâh adımı seçilince emir tek değişiklik
// olarak taslağa yazılır (plana alma bir emrin bütün adımlarını tek komutla yerleştirir). Yerleri sunucu önizlemesi verir.

const TON: Record<EmirDurumu, RozetTonu> = { gec: 'hata', risk: 'uyari', plansiz: 'uyari', iyi: 'tamam' };
const KART_ADI: Record<EmirDurumu, string> = { gec: 'Geç', risk: 'Riskli', plansiz: 'Yeni', iyi: 'Planlı' };

export interface SiraSeridiOzellikleri {
  kartlar: readonly SiraKarti[];
  secili: string | null;
  sec: (kok: string) => void;
  // "28.10 Çar 17:00" biçiminde yazar (Kokpit'in zaman yazıcısı).
  zaman: (t: number) => string;
}

export function SiraSeridi({ kartlar, secili, sec, zaman }: SiraSeridiOzellikleri) {
  return (
    <section className="tc-pyq-bolum" aria-label="Emirler, sırasıyla">
      <h2><b className="tc-pyq-bolum-no">1</b>Emirler, sırasıyla<small>Sıra: termin</small></h2>
      {kartlar.length === 0 ? <p className="tc-pyq-not">Planda ve sırada emir yok.</p> : (
        <ul className="tc-pyq-sira">
          {kartlar.map((k, i) => {
            const bas = k.emirler[0];
            const kismi = k.yerlesen > 0 && k.yerlesen < k.adim;
            return (
              <li key={k.kok}>
                <button type="button" data-kart={k.kok} aria-pressed={secili === k.kok} onClick={() => { sec(k.kok); }}>
                  <span className="tc-pyq-sira-bas">
                    <b className="tc-pyq-sira-no">{i + 1}</b><b className="tc-pyq-mono">{bas?.no ?? k.kok}</b>
                    <Rozet ton={kismi ? 'bilgi' : TON[k.durum]} gorunum="cizgi">{kismi ? `${String(k.yerlesen)} / ${String(k.adim)}` : KART_ADI[k.durum]}</Rozet>
                  </span>
                  <small>{bas?.urun}{k.termin === null ? ' · termin yok' : ` · termin ${zaman(k.termin).slice(0, 9)}`}</small>
                  <progress max={Math.max(1, k.adim)} value={k.yerlesen} aria-hidden="true" />
                  <small>{`${String(k.yerlesen)} / ${String(k.adim)} operasyon yerleşti`}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type Onizleme = { tezgah: string; oz: PlanaAlOnizlemesi };
// Bir adım için en çok bu kadar aday tezgâha sorulur (her soru sunucuda bütün çalışmayı okur); rota sırasındaki ilkler alınır.
export const ADAY_SINIRI = 6;
// Plansız emrin seç-yerleştir durumu. `etkin` değilken sunucuya sorulmaz (kartta birden çok emir olabilir; yalnız biri çalışır).
export function useYerlestirme(m: KokpitModeli, e: KokpitEmri, surum: number | null, etkin: boolean) {
  const [sec, setSec] = useState<Record<string, AdimSecimi>>({});
  const [adim, setAdim] = useState<string | null>(null);
  // Sistem seçimi: ilk adımın adayları sırayla denenir, emri en erken bitiren alınır (adım adım plana almayla aynı yol).
  const [sistem, setSistem] = useState<Onizleme | 'okunamadi' | null>(null);
  const [yerler, setYerler] = useState<{ adim: string; l: BosYer[]; oz: Onizleme[] } | null>(null);
  const ilk = e.adimlar[0];
  const plansiz = e.durum === 'plansiz';
  const ilkSaat = tasimaSaati(m.simdi, m.simdi);
  const secili = adim !== null && e.adimlar.some((a) => a.id === adim && adimYeri(m, a, {}) !== 'fason' && adimYeri(m, a, {}) !== 'yerli') ? adim : siradakiAdim(m, e, sec);
  // Emir ya da ortak çalışmanın sürümü değişince birikmiş seçimler düşer: eski plana göre seçilmiş yer yazılmaz. Önizlemeler sürüm
  // başına bellekte tutulur; aynı soru ikinci kez sunucuya gitmez.
  const bellek = useRef(new Map<string, Promise<PlanaAlOnizlemesi | null>>());
  useEffect(() => { setSec({}); setAdim(null); setSistem(null); setYerler(null); bellek.current.clear(); }, [e.id, surum]);
  // Süren soru da paylaşılır: iki etki aynı anda aynı tezgâhı sorarsa tek istek gider.
  const sor = (g: Parameters<typeof planaAlOnizle>[0], v: number): Promise<PlanaAlOnizlemesi | null> => {
    const k = JSON.stringify(g);
    const var_ = bellek.current.get(k);
    if (var_) return var_;
    const soz = planaAlOnizle(g, v).then((oz) => {
      // Okunamayan önizleme bellekte tutulmaz: sonraki denemede yeniden sorulur.
      if (oz === null && bellek.current.get(k) === soz) bellek.current.delete(k);
      return oz;
    });
    bellek.current.set(k, soz);
    return soz;
  };

  const calisir = etkin && plansiz && surum !== null && ilk !== undefined;
  useEffect(() => {
    if (!calisir) return undefined;
    let gecerli = true;
    void (async () => {
      let en: Onizleme | null = null;
      const bitis = (x: PlanaAlOnizlemesi): number => (x.gecerli ? x.bitis ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY);
      for (const tezgah of ilk.adaylar.filter((t) => !fasonMu(t)).slice(0, ADAY_SINIRI)) {
        const oz = await sor({ emirId: e.id, tezgah, baslangic: ilkSaat }, surum);
        if (!gecerli) return;
        if (oz !== null && (en === null || (!en.oz.gecerli && oz.gecerli) || bitis(oz) < bitis(en.oz) - 0.01)) en = { tezgah, oz };
      }
      setSistem(en ?? 'okunamadi');
    })();
    return () => { gecerli = false; };
    // Emir, sürüm ve ilk saat değişince yeniden sorulur; aday listesi emre bağlıdır.
  }, [calisir, e.id, surum, ilkSaat]);

  const sistemIlk = sistem !== null && sistem !== 'okunamadi' ? sistem.tezgah : null;
  const anahtar = JSON.stringify([e.id, secili, sec, sistemIlk, ilkSaat]);
  useEffect(() => {
    if (!calisir || secili === null || !ilk) { setYerler(null); return undefined; }
    const ilkMi = secili === ilk.id;
    const ilkTezgah = sec[ilk.id]?.tezgah ?? sistemIlk;
    if (!ilkMi && ilkTezgah === null) return undefined;
    let gecerli = true;
    setYerler(null);
    void (async () => {
      const oz: Onizleme[] = [];
      for (const t of uygunTezgahlar(e, secili).slice(0, ADAY_SINIRI)) {
        const deneme = { ...sec, [secili]: { ...sec[secili], tezgah: t } };
        const adimlar = adimSecimleri(e, deneme);
        const x = await sor({ emirId: e.id, tezgah: ilkMi ? t : ilkTezgah ?? t, baslangic: ilkSaat, ...(adimlar.length > 0 ? { adimlar } : {}) }, surum);
        if (!gecerli) return;
        if (x !== null) oz.push({ tezgah: t, oz: x });
      }
      setYerler({ adim: secili, l: bosYerler(secili, oz.map((o) => ({ tezgah: o.tezgah, gecerli: o.oz.gecerli, isler: o.oz.isler }))), oz });
    })();
    return () => { gecerli = false; };
    // Seçimler anahtarda toplanır; nesneler her çizimde yenidir.
  }, [anahtar, calisir, surum]);

  // Tezgâh seçimi: seçim birikir; tezgâhı seçilmemiş adım kalmadıysa hazır hamle döner (çağıran taslağa yazar), kaldıysa null.
  const tezgahSec = (tezgah: string): { aday: TurAdayi; gecBirakir: boolean } | null => {
    if (secili === null || !ilk) return null;
    const yeni = { ...sec, [secili]: { ...sec[secili], tezgah } };
    setSec(yeni); setAdim(null);
    if (siradakiAdim(m, e, yeni) !== null) return null;
    const ilkTezgah = yeni[ilk.id]?.tezgah ?? sistemIlk;
    if (ilkTezgah === null) return null;
    const adimlar = adimSecimleri(e, yeni);
    const bitis = yerler?.oz.find((o) => o.tezgah === tezgah)?.oz.bitis ?? null;
    return { aday: { isId: ilk.id, tezgah: ilkTezgah, baslangic: ilkSaat, planaAl: e.id, ...(adimlar.length > 0 ? { adimlar } : {}) }, gecBirakir: bitis !== null && e.termin !== null && bitis - e.termin > 0.01 };
  };
  // Hepsini en erken yere: seçimsiz plana alma; tezgâhı sistem seçer.
  const hepsi = (): { aday: TurAdayi; gecBirakir: boolean } | null => {
    if (!ilk || sistem === null || sistem === 'okunamadi' || !sistem.oz.gecerli) return null;
    const bitis = sistem.oz.bitis;
    return { aday: { isId: ilk.id, tezgah: sistem.tezgah, baslangic: ilkSaat, planaAl: e.id }, gecBirakir: bitis !== null && e.termin !== null && bitis - e.termin > 0.01 };
  };
  return { sec, secili, adimSec: setAdim, sistem, yerler: yerler !== null && yerler.adim === secili ? yerler.l : null, tezgahSec, hepsi, sifirla: () => { setSec({}); setAdim(null); } };
}

export interface EmirAdimlariOzellikleri {
  m: KokpitModeli;
  kart: SiraKarti;
  zaman: (t: number) => string;
  // Yazamayan kişide ve komut sürerken null: adımlar görünür, yerleştirilemez.
  uygula: ((a: TurAdayi, gecBirakir: boolean) => void) | null;
  surum: number | null;
  // Planda yeri olan adıma basılınca (tahtada gösterilir, ayrıntısı açılır).
  adimAc: (emirId: string, isId: string) => void;
  // Seçili adımın uygun tezgâhları ve boş yerleri (tahta işaretler); seçim yoksa null.
  hedef?: (h: { emirId: string; adimId: string; tezgahlar: string[]; yerler: BosYer[] } | null) => void;
  // Kişinin taslağında değişiklik varsa true: önizleme ortak plandan hesaplanır, taslaktaki değişiklikleri görmez; kişiye söylenir.
  taslakVar?: boolean;
}

export function EmirAdimlari({ m, kart, zaman, uygula, surum, adimAc, hedef, taslakVar = false }: EmirAdimlariOzellikleri) {
  // Kartta birden çok plansız emir varsa (çok katmanlı emir) sırayla çalışılır: etkin olan, kişinin dokunduğu ya da ilk plansız emirdir.
  const [dokunulan, setDokunulan] = useState<string | null>(null);
  const etkin = kart.emirler.find((e) => e.id === dokunulan && e.durum === 'plansiz')?.id ?? kart.emirler.find((e) => e.durum === 'plansiz')?.id ?? null;
  const bas = kart.emirler[0];
  return (
    <section className="tc-pyq-bolum" aria-label="Emirler ve operasyonlar">
      <h2><b className="tc-pyq-bolum-no">2</b>{bas?.no ?? kart.kok} · operasyonlar</h2>
      <div className="tc-pyq-emirler">
        {kart.emirler.map((e) => (
          <EmirSatiri key={e.id} m={m} e={e} zaman={zaman} uygula={uygula} surum={surum} adimAc={adimAc} etkin={etkin === e.id} etkinlestir={() => { setDokunulan(e.id); }} taslakVar={taslakVar} {...(hedef ? { hedef } : {})} />
        ))}
      </div>
    </section>
  );
}

interface EmirSatiriOzellikleri extends Omit<EmirAdimlariOzellikleri, 'kart'> { e: KokpitEmri; etkin: boolean; etkinlestir: () => void }

function EmirSatiri({ m, e, zaman, uygula, surum, adimAc, hedef, etkin, etkinlestir, taslakVar = false }: EmirSatiriOzellikleri) {
  const y = useYerlestirme(m, e, surum, etkin);
  const kod = useMemo(() => new Map(m.tezgahlar.map((t) => [t.id, t.kod])), [m]);
  const tz = (id: string): string => kod.get(id) ?? id;
  const an = (a: number, b: number): string => `${zaman(a).slice(6)} → ${zaman(b).slice(-5)}`;
  const plansiz = e.durum === 'plansiz';
  const seciliAdim = etkin && plansiz ? y.secili : null;
  const tezgahlar = useMemo(() => uygunTezgahlar(e, seciliAdim), [e, seciliAdim]);
  const hedefAnahtari = seciliAdim === null ? null : JSON.stringify([e.id, seciliAdim, y.yerler]);
  useEffect(() => {
    if (!hedef || !etkin) return undefined;
    hedef(seciliAdim === null ? null : { emirId: e.id, adimId: seciliAdim, tezgahlar, yerler: y.yerler ?? [] });
    return () => { hedef(null); };
    // Hedef anahtarda toplanır; yer listesi her hesapta yeni dizidir.
  }, [hedefAnahtari, etkin, hedef]);

  const yaz = (h: { aday: TurAdayi; gecBirakir: boolean } | null): void => { if (h && uygula) { uygula(h.aday, h.gecBirakir); y.sifirla(); } };
  const seciliAd = e.adimlar.find((a) => a.id === seciliAdim)?.ad;
  const sistemHazir = y.sistem !== null && y.sistem !== 'okunamadi' && y.sistem.oz.gecerli;
  return (
    <div className="tc-pyq-emir" data-emir={e.id} data-etkin={etkin ? '' : undefined}>
      <div className="tc-pyq-emir-ad">
        <b className="tc-pyq-mono">{e.no}</b> {e.urun}
        <small>{`${String(e.adet)} adet · ${durumYazisi(e)}`}</small>
      </div>
      <ol className="tc-pyq-adimlar">
        {e.adimlar.map((a) => {
          const yer = adimYeri(m, a, y.sec), x = m.isler[a.id], s = y.sec[a.id]?.tezgah;
          const secildi = seciliAdim === a.id;
          return (
            <li key={a.id}>
              <button
                type="button" data-adim={a.id} data-yer={yer} aria-pressed={secildi} disabled={yer === 'fason' || (yer !== 'yerli' && !uygula)}
                onClick={() => { if (x) adimAc(e.id, a.id); else { etkinlestir(); y.adimSec(a.id); } }}
              >
                <b>{a.ad}</b>
                <small>{x ? `${x.fason ? 'Fason' : tz(x.m)} · ${an(x.S, x.C)}` : yer === 'fason' ? 'Fason · sistem yerleştirir' : s !== undefined ? `${tz(s)} seçildi` : 'yerleşmedi'}</small>
              </button>
            </li>
          );
        })}
      </ol>
      {plansiz && etkin && (
        <div className="tc-pyq-yerler" role="group" aria-label={seciliAd ? `${seciliAd} için boş yerler` : 'Boş yerler'}>
          {!uygula ? <p className="tc-pyq-not">Emri yalnız planı yazabilen kişi yerleştirir.</p>
            : seciliAdim === null ? null
              : y.yerler === null ? <p className="tc-pyq-not" role="status">Boş yerler hesaplanıyor</p>
                : y.yerler.length === 0 ? <p className="tc-pyq-not" role="status">Bu adım için uygun boş yer bulunamadı; "Hepsini en erken yere yerleştir" sistemin seçimini dener.</p>
                  : (
                    <>
                      <p className="tc-pyq-not"><Simge ad="check" boyut="k" /> <b>{seciliAd}</b> seçili. Yere basın.</p>
                      <ul>
                        {y.yerler.map((b) => (
                          <li key={b.tezgah} data-ilk={b.enErken ? '' : undefined}>
                            <span><b className="tc-pyq-mono">{tz(b.tezgah)}</b> · {an(b.S, b.C)}</span>
                            <small>{b.enErken ? 'En erken biten yer' : 'Sonraki boş yer'}</small>
                            <Dugme tur="ikincil" simge="check" data-yer-tezgah={b.tezgah} onClick={() => { yaz(y.tezgahSec(b.tezgah)); }}>Yerleştir</Dugme>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
          {uygula && taslakVar && <p className="tc-pyq-not" data-taslak-notu="">Taslağınızdaki değişiklikler bu boş yerlerde hesaba katılmadı; yerleştirince plan taslağınızla yeniden dizilir ve sonucu tahtada görünür.</p>}
          {uygula && (
            <span className="tc-pyq-yerler-alt">
              <Dugme tur="ikincil" simge="play" disabled={!sistemHazir} title={y.sistem === 'okunamadi' ? 'Önizleme okunamadı' : undefined} onClick={() => { yaz(y.hepsi()); }}>Hepsini en erken yere yerleştir</Dugme>
              {Object.keys(y.sec).length > 0 && <Dugme tur="ikincil" simge="x" onClick={y.sifirla}>Seçimleri sil</Dugme>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
