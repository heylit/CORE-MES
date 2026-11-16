import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dugme, Rozet, Simge, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { isTasiOnizle } from '../motor/atolye/gonder.ts';
import { EmirYonu, type EmirYonuOzellikleri } from './EmirYonu.tsx';
import { planaAlOnizle, type PlanaAlOnizlemesi } from './plana-al.ts';
import { adimSecimleri, durumYazisi, enCokBekleyen, fasonMu, onizlemeBitisi, sureYaz, tasimaSaati, tasinabilir, type AdimSecimi, type EmirDurumu, type KokpitEmri, type KokpitModeli, type TurAdayi } from './kurallar.ts';
import { adimYeri, bosYerler, siradakiAdim, tasimaAdaylari, uygunTezgahlar, type BosYer, type SiraKarti } from './yerlestirme.ts';
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
  // Karta bağlı saha olaylarının sayısı (kök kimliğiyle); kartta rozet olur.
  olay?: ReadonlyMap<string, number>;
  // Başlığın sağındaki yer (bütün gelenleri açan düğme).
  sag?: ReactNode;
  // Sipariş bağı okunabildiyse true: siparişe bağlı olmayan emrin kartında "Siparişsiz" yazar. Okunamadıysa hiçbir kart öyle işaretlenmez.
  bagVar?: boolean;
}

export function SiraSeridi({ kartlar, secili, sec, zaman, olay, sag, bagVar = false }: SiraSeridiOzellikleri) {
  // Seçili kart şeritte görünür kalır (dar ekranda şerit yatay kayar; seçim tahtadan da gelebilir).
  const liste = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const k = liste.current, el = secili === null ? null : k?.querySelector<HTMLElement>('[aria-pressed="true"]');
    // Kart yarım kesilmesin diye seçili kart şeridin başına hizalanır.
    if (k && el && typeof k.scrollTo === 'function') k.scrollTo({ left: Math.max(0, (el.parentElement?.offsetLeft ?? el.offsetLeft) - (k.firstElementChild as HTMLElement | null ?? el).offsetLeft) });
  }, [secili, kartlar.length]);
  return (
    <section className="tc-pyq-bolum" aria-label="Siparişler, sırasıyla">
      <h2><b className="tc-pyq-bolum-no">1</b>Siparişler, sırasıyla<small>Sıra: termin</small>{sag}</h2>
      {kartlar.length === 0 ? <p className="tc-pyq-not">Planda ve sırada sipariş ya da emir yok.</p> : (
        <ul className="tc-pyq-sira" ref={liste}>
          {kartlar.map((k, i) => {
            const bas = k.emirler[0];
            const kismi = k.yerlesen > 0 && k.yerlesen < k.adim;
            const termin = k.termin === null ? 'termin yok' : `termin ${zaman(k.termin).slice(0, 9)}`;
            const siparissiz = k.siparis === null && bagVar;
            return (
              <li key={k.kok}>
                <button type="button" data-kart={k.kok} data-siparis={k.siparis ? '' : undefined} aria-pressed={secili === k.kok} title={siparissiz ? 'Siparişe bağlı değil (stok ya da elle açılan emir)' : undefined} onClick={() => { sec(k.kok); }}>
                  <span className="tc-pyq-sira-bas">
                    <b className="tc-pyq-sira-no">{i + 1}</b><b className="tc-pyq-mono">{k.siparis?.no ?? bas?.no ?? k.kok}</b>
                    <Rozet ton={kismi ? 'bilgi' : TON[k.durum]} gorunum="cizgi">{kismi ? `${String(k.yerlesen)} / ${String(k.adim)}` : KART_ADI[k.durum]}</Rozet>
                  </span>
                  <small>{k.siparis ? `${k.siparis.musteri !== null ? `${k.siparis.musteri} · ` : ''}${String(k.emirler.length)} emir` : `${siparissiz ? 'Siparişsiz · ' : ''}${bas?.urun ?? ''}`} · {termin}</small>
                  <progress max={Math.max(1, k.adim)} value={k.yerlesen} aria-hidden="true" />
                  <small>{`${String(k.yerlesen)} / ${String(k.adim)} operasyon yerleşti`}{(olay?.get(k.kok) ?? 0) > 0 ? <b data-olay=""> · {String(olay?.get(k.kok))} olay</b> : null}</small>
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
  // Tabloda ilk adımın saati elle girilebilir (3318); girilmediyse şimdi.
  const ilkBas = (ilk ? sec[ilk.id]?.baslangic : undefined) ?? ilkSaat;
  const [ongoru, setOngoru] = useState<{ anahtar: string; oz: PlanaAlOnizlemesi | null } | null>(null);
  const secili = adim !== null && e.adimlar.some((a) => a.id === adim && adimYeri(m, a, {}) !== 'fason' && adimYeri(m, a, {}) !== 'yerli') ? adim : siradakiAdim(m, e, sec);
  // Emir ya da ortak çalışmanın sürümü değişince birikmiş seçimler düşer: eski plana göre seçilmiş yer yazılmaz. Önizlemeler sürüm
  // başına bellekte tutulur; aynı soru ikinci kez sunucuya gitmez.
  const bellek = useRef(new Map<string, Promise<PlanaAlOnizlemesi | null>>());
  useEffect(() => { setSec({}); setAdim(null); setSistem(null); setYerler(null); setOngoru(null); bellek.current.clear(); }, [e.id, surum]);
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
        const x = await sor({ emirId: e.id, tezgah: ilkMi ? t : ilkTezgah ?? t, baslangic: ilkBas, ...(adimlar.length > 0 ? { adimlar } : {}) }, surum);
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
    return { aday: { isId: ilk.id, tezgah: ilkTezgah, baslangic: ilkBas, planaAl: e.id, ...(adimlar.length > 0 ? { adimlar } : {}) }, gecBirakir: bitis !== null && e.termin !== null && bitis - e.termin > 0.01 };
  };
  // Tablodan giriş (3318): tezgâh ve saat satırda yazılır, seçim birikir ama kendiliğinden yazılmaz; birikenin sonucu sunucuya sorulur
  // (öngörü), kişi "Seçimlerle yerleştir" ile yazar. Boş bırakılan alanı sistem doldurur.
  const alanYaz = (adimId: string, alan: AdimSecimi): void => {
    setSec((o) => {
      const yeni = { ...o[adimId], ...alan }, hepsi = { ...o };
      if (yeni.tezgah === undefined && yeni.baslangic === undefined) delete hepsi[adimId]; else hepsi[adimId] = yeni;
      return hepsi;
    });
    setAdim(adimId);
  };
  const secimVar = Object.keys(sec).length > 0;
  const ongoruAnahtari = JSON.stringify([e.id, sec, sistemIlk, ilkSaat]);
  useEffect(() => {
    if (!calisir || !secimVar || !ilk) { setOngoru(null); return undefined; }
    const ilkTezgah = sec[ilk.id]?.tezgah ?? sistemIlk;
    if (ilkTezgah === null) return undefined;
    let gecerli = true;
    const adimlar = adimSecimleri(e, sec);
    void sor({ emirId: e.id, tezgah: ilkTezgah, baslangic: ilkBas, ...(adimlar.length > 0 ? { adimlar } : {}) }, surum).then((oz) => { if (gecerli) setOngoru({ anahtar: ongoruAnahtari, oz }); });
    return () => { gecerli = false; };
    // Seçimler anahtarda toplanır.
  }, [ongoruAnahtari, calisir, surum]);
  const guncelOngoru = ongoru !== null && ongoru.anahtar === ongoruAnahtari ? ongoru.oz : null;
  const secimle = (): { aday: TurAdayi; gecBirakir: boolean } | null => {
    if (!ilk || !secimVar || guncelOngoru === null || !guncelOngoru.gecerli) return null;
    const ilkTezgah = sec[ilk.id]?.tezgah ?? sistemIlk;
    if (ilkTezgah === null) return null;
    const adimlar = adimSecimleri(e, sec), bitis = guncelOngoru.bitis;
    return { aday: { isId: ilk.id, tezgah: ilkTezgah, baslangic: ilkBas, planaAl: e.id, ...(adimlar.length > 0 ? { adimlar } : {}) }, gecBirakir: bitis !== null && e.termin !== null && bitis - e.termin > 0.01 };
  };
  // Hepsini en erken yere: seçimsiz plana alma; tezgâhı sistem seçer.
  const hepsi = (): { aday: TurAdayi; gecBirakir: boolean } | null => {
    if (!ilk || sistem === null || sistem === 'okunamadi' || !sistem.oz.gecerli) return null;
    const bitis = sistem.oz.bitis;
    return { aday: { isId: ilk.id, tezgah: sistem.tezgah, baslangic: ilkSaat, planaAl: e.id }, gecBirakir: bitis !== null && e.termin !== null && bitis - e.termin > 0.01 };
  };
  return { sec, secili, adimSec: setAdim, sistem, yerler: yerler !== null && yerler.adim === secili ? yerler.l : null, tezgahSec, hepsi, sifirla: () => { setSec({}); setAdim(null); }, alanYaz, ongoru: guncelOngoru, ongoruBekliyor: secimVar && guncelOngoru === null, secimle, sonAlan: adim };
}

// Planlı adımın taşınabileceği yerler (3297-4): aday yerler sırayla sunucu önizlemesine sorulur, geçersiz yer listeye girmez. Sorular
// sürüm başına bellekte tutulur; adım, plan ya da sürüm değişince kalan sorular düşer. `isId` null iken sorulmaz.
// bitis: taşımadan sonra emrin biteceği an (itilen adımlarla); hesaplanamıyorsa null.
export interface TasimaYeri extends BosYer { baslangic: number; bitis: number | null }
export function useTasima(m: KokpitModeli, e: KokpitEmri, isId: string | null, surum: number | null): TasimaYeri[] | null {
  const [yerler, setYerler] = useState<{ anahtar: string; l: TasimaYeri[] } | null>(null);
  const bellek = useRef(new Map<string, ReturnType<typeof isTasiOnizle>>());
  useEffect(() => { bellek.current.clear(); }, [e.id, surum]);
  const adaylar = useMemo(() => (isId === null ? [] : tasimaAdaylari(m, e, isId, ADAY_SINIRI)), [m, e, isId]);
  const anahtar = JSON.stringify([isId, adaylar]);
  useEffect(() => {
    if (isId === null) { setYerler(null); return undefined; }
    let gecerli = true;
    setYerler(null);
    void (async () => {
      const oz: { tezgah: string; gecerli: boolean; isler: { isId: string; tezgah: string; S: number; C: number }[] }[] = [];
      for (const a of adaylar) {
        const k = `${isId}|${a.tezgah}|${String(a.baslangic)}`;
        let soz = bellek.current.get(k);
        if (!soz) {
          const yeni = isTasiOnizle({ isId, tezgah: a.tezgah, baslangic: a.baslangic }).then((x) => {
            if (x === null && bellek.current.get(k) === yeni) bellek.current.delete(k);
            return x;
          });
          bellek.current.set(k, yeni); soz = yeni;
        }
        const x = await soz;
        if (!gecerli) return;
        if (x !== null) oz.push({ tezgah: a.tezgah, gecerli: x.gecerli, isler: x.isler });
      }
      const baslangic = new Map(adaylar.map((a) => [a.tezgah, a.baslangic]));
      const bitis = (t: string): number | null => onizlemeBitisi(m, e, oz.find((o) => o.tezgah === t)?.isler ?? []);
      setYerler({ anahtar, l: bosYerler(isId, oz).map((b) => ({ ...b, baslangic: baslangic.get(b.tezgah) ?? b.S, bitis: bitis(b.tezgah) })) });
    })();
    return () => { gecerli = false; };
    // Aday yerler anahtarda toplanır; liste her hesapta yeni dizidir.
  }, [anahtar, surum]);
  return yerler !== null && yerler.anahtar === anahtar ? yerler.l : null;
}

export interface EmirAdimlariOzellikleri {
  m: KokpitModeli;
  kart: SiraKarti;
  zaman: (t: number) => string;
  // Yazamayan kişide ve komut sürerken null: adımlar görünür, yerleştirilemez.
  uygula: ((a: TurAdayi, gecBirakir: boolean) => void) | null;
  surum: number | null;
  // Planda yeri olan adıma basılınca (tahtada gösterilir, taşınacak yerler listelenir).
  adimAc: (emirId: string, isId: string) => void;
  // Seçili adımın uygun tezgâhları ve boş yerleri (tahta işaretler); seçim yoksa null.
  hedef?: (h: YerlestirmeHedefi | null) => void;
  // Emrin planlama yönü (3282 1c, 3304 a): emrin satırında tek satır; verilmezse gösterilmez.
  yon?: Omit<EmirYonuOzellikleri, 'emirId' | 'no'>;
  // Tahtadan ya da Matristen seçilen iş: operasyonu bölümde işaretlenir (liste açılmaz).
  vurgu?: string | null;
  // Geç ya da riskli emrin en çok beklediği adım satırda yazılsın mı (Matris ve 3B: çözüm aranan görünümler).
  neden?: boolean;
  // Kişinin taslağında değişiklik varsa true: önizleme ortak plandan hesaplanır, taslaktaki değişiklikleri görmez; kişiye söylenir.
  taslakVar?: boolean;
  // Seçili planlı adım (3297-4): taşınabileceği yerler listelenir ve tahtada işaretlenir. `tasi` yazamayan kişide ve turda null.
  secIs?: string | null;
  tasi?: ((isId: string, tezgah: string, baslangic: number) => void) | null;
  // Planlı adım seçiliyken yerleşmemiş adıma basılınca seçimi bırakır (yerleştirme öne geçer).
  birak?: () => void;
  // Tablodaki başlangıç alanı (3318): planın eksenindeki saat ile gün-saat girdisi arasındaki çeviri. Verilmezse saat girilemez, yalnız okunur.
  saatGirdisi?: SaatGirdisi;
  // Bölümün açılış görünümü; verilmezse tablo.
  ilkGorunum?: OperasyonGorunumu;
}
export interface SaatGirdisi { yaz: (t: number) => string; oku: (v: string) => number | null }
export type OperasyonGorunumu = 'tablo' | 'akis';
const GORUNUMLER: readonly (readonly [OperasyonGorunumu, string])[] = [['tablo', 'Tablo'], ['akis', 'Akış']];

export function EmirAdimlari({ m, kart, zaman, uygula, surum, adimAc, hedef, taslakVar = false, secIs = null, tasi = null, birak, yon, vurgu = null, neden = false, saatGirdisi, ilkGorunum = 'tablo' }: EmirAdimlariOzellikleri) {
  const [gorunum, setGorunum] = useState<OperasyonGorunumu>(ilkGorunum);
  // Kartta birden çok plansız emir varsa (çok katmanlı emir) sırayla çalışılır: etkin olan, kişinin dokunduğu ya da ilk plansız emirdir.
  const [dokunulan, setDokunulan] = useState<string | null>(null);
  // Planlı adım seçiliyken tahtadaki işaretler onundur; plansız emrin yerleştirmesi bekler (tahtada tek hedef olur).
  const tasinan = secIs !== null && m.isler[secIs] ? kart.emirler.find((e) => e.adimlar.some((a) => a.id === secIs))?.id ?? null : null;
  const etkin = tasinan !== null ? null : kart.emirler.find((e) => e.id === dokunulan && e.durum === 'plansiz')?.id ?? kart.emirler.find((e) => e.durum === 'plansiz')?.id ?? null;
  const bas = kart.emirler[0];
  return (
    <section className="tc-pyq-bolum" aria-label="Emirler ve operasyonlar">
      <h2>
        <b className="tc-pyq-bolum-no">2</b>{kart.siparis ? `${kart.siparis.no ?? bas?.no ?? ''} · ${String(kart.emirler.length)} emir ve operasyonları` : `${bas?.no ?? kart.kok} · operasyonlar`}
        <span className="tc-pyq-seg tc-pyq-bolum-sag" role="group" aria-label="Operasyon görünümü">
          {GORUNUMLER.map(([k, ad]) => <button type="button" key={k} aria-pressed={gorunum === k} onClick={() => { setGorunum(k); }}>{ad}</button>)}
        </span>
      </h2>
      <div className="tc-pyq-emirler">
        {kart.emirler.map((e) => (
          <EmirSatiri key={e.id} m={m} e={e} zaman={zaman} uygula={uygula} surum={surum} adimAc={adimAc} etkin={etkin === e.id} etkinlestir={() => { setDokunulan(e.id); birak?.(); }} taslakVar={taslakVar} secIs={tasinan === e.id ? secIs : null} tasi={tasi} vurgu={vurgu} neden={neden} gorunum={gorunum} {...(saatGirdisi ? { saatGirdisi } : {})} {...(yon ? { yon } : {})} {...(hedef ? { hedef } : {})} />
        ))}
      </div>
    </section>
  );
}

// Seçili adımın uygun tezgâhları ve boş yerleri; tahta bunları işaretler, boş yere basınca `yerlestir` çağrılır.
// fiil: yer planlı operasyonun taşınacağı yerse 'tasi' (tahtadaki yazı ona göre).
export interface YerlestirmeHedefi { emirId: string; adimId: string; tezgahlar: string[]; yerler: BosYer[]; yerlestir: (tezgah: string) => void; fiil?: 'tasi' }
interface EmirSatiriOzellikleri extends Omit<EmirAdimlariOzellikleri, 'kart' | 'ilkGorunum'> { e: KokpitEmri; etkin: boolean; etkinlestir: () => void; gorunum: OperasyonGorunumu }

function EmirSatiri({ m, e, zaman, uygula, surum, adimAc, hedef, etkin, etkinlestir, taslakVar = false, secIs = null, tasi = null, yon, vurgu = null, neden = false, gorunum, saatGirdisi }: EmirSatiriOzellikleri) {
  const y = useYerlestirme(m, e, surum, etkin);
  // Tabloda yerleşmiş operasyonun tezgâhı ya da saati değiştirilince (3318) önce sunucuya sorulur; uygunsa "Taşı", değilse nedeni satırda.
  const [duzen, setDuzen] = useState<{ isId: string; tezgah: string; baslangic: number } | null>(null);
  const [duzenOz, setDuzenOz] = useState<{ gecerli: boolean; ileti: string | null; bitis: number | null } | 'hesap' | 'okunamadi' | null>(null);
  useEffect(() => { setDuzen(null); }, [e.id, surum]);
  const duzenAnahtari = duzen ? `${duzen.isId}|${duzen.tezgah}|${String(duzen.baslangic)}` : null;
  useEffect(() => {
    if (!duzen) { setDuzenOz(null); return undefined; }
    let gecerli = true;
    setDuzenOz('hesap');
    void isTasiOnizle(duzen).then((x) => { if (gecerli) setDuzenOz(x === null ? 'okunamadi' : { gecerli: x.gecerli, ileti: x.ileti, bitis: onizlemeBitisi(m, e, x.isler) }); });
    return () => { gecerli = false; };
    // Düzenleme anahtarda toplanır.
  }, [duzenAnahtari, surum]);
  const tasinanIs = secIs !== null ? m.isler[secIs] : undefined;
  const engel = tasinanIs ? tasinabilir(tasinanIs) : null;
  const tasima = useTasima(m, e, tasinanIs && engel === null && tasi ? tasinanIs.id : null, surum);
  const kod = useMemo(() => new Map(m.tezgahlar.map((t) => [t.id, t.kod])), [m]);
  const tz = (id: string): string => kod.get(id) ?? id;
  const an = (a: number, b: number): string => `${zaman(a).slice(6)} → ${zaman(b).slice(-5)}`;
  const plansiz = e.durum === 'plansiz';
  const bekleyen = neden && (e.durum === 'gec' || e.durum === 'risk') ? enCokBekleyen(m, e) : null;
  const seciliAdim = etkin && plansiz ? y.secili : null;
  const tezgahlar = useMemo(() => uygunTezgahlar(e, seciliAdim), [e, seciliAdim]);
  const tasimaTezgahlari = useMemo(() => uygunTezgahlar(e, tasinanIs && engel === null ? tasinanIs.id : null), [e, tasinanIs?.id, engel]);
  const hedefAnahtari = tasinanIs ? JSON.stringify([e.id, tasinanIs.id, tasima, engel]) : seciliAdim === null ? null : JSON.stringify([e.id, seciliAdim, y.yerler]);
  useEffect(() => {
    if (!hedef || (!etkin && !tasinanIs)) return undefined;
    if (tasinanIs) hedef(engel !== null || !tasi ? null : { emirId: e.id, adimId: tasinanIs.id, tezgahlar: tasimaTezgahlari, yerler: tasima ?? [], yerlestir: (t) => { yerlestir.current(t); }, fiil: 'tasi' });
    else hedef(seciliAdim === null || !uygula ? null : { emirId: e.id, adimId: seciliAdim, tezgahlar, yerler: y.yerler ?? [], yerlestir: (t) => { yerlestir.current(t); } });
    return () => { hedef(null); };
    // Hedef anahtarda toplanır; yer listesi her hesapta yeni dizidir.
  }, [hedefAnahtari, etkin, hedef, uygula === null, tasi === null]);

  const yaz = (h: { aday: TurAdayi; gecBirakir: boolean } | null): void => { if (h && uygula) { uygula(h.aday, h.gecBirakir); y.sifirla(); } };
  // Tahtadaki boş yere basılınca çağrılır; her çizimde güncel seçimleri görür.
  const yerlestir = useRef<(t: string) => void>(() => undefined);
  const tasiYere = (t: string): void => { const b = tasima?.find((x) => x.tezgah === t); if (b && tasinanIs && tasi) tasi(tasinanIs.id, t, b.baslangic); };
  useEffect(() => { yerlestir.current = tasinanIs ? tasiYere : (t) => { yaz(y.tezgahSec(t)); }; });
  // Taşımanın emre etkisi: yeni bitiş, bugünkü bitişe göre kazanç ve termine göre durum.
  const etki = (bitis: number | null): string => {
    if (bitis === null) return '';
    const kazanc = e.bitis !== null ? e.bitis - bitis : null, gec = e.termin !== null ? bitis - e.termin : null;
    return ` · emir ${zaman(bitis).slice(6)} biter${kazanc !== null && kazanc > 0.01 ? ` · ${sureYaz(kazanc)} erken` : ''}${gec === null ? '' : gec > 0.01 ? ` · ${sureYaz(gec)} geç` : ' · termine yetişir'}`;
  };
  const seciliAd = e.adimlar.find((a) => a.id === seciliAdim)?.ad;
  const sistemHazir = y.sistem !== null && y.sistem !== 'okunamadi' && y.sistem.oz.gecerli;
  return (
    <div className="tc-pyq-emir" data-emir={e.id} data-etkin={etkin ? '' : undefined} data-gorunum={gorunum}>
      <div className="tc-pyq-emir-ad">
        <b className="tc-pyq-mono">{e.no}</b> {e.urun}
        <small data-emir-ozet="">
          {`${String(e.adet)} adet · `}<b data-d={e.durum}>{durumYazisi(e)}</b>
          {e.termin !== null && ` · termin ${zaman(e.termin)}`}{e.bitis !== null && ` · biter ${zaman(e.bitis)}`}
        </small>
        {bekleyen && <small data-emir-neden="">Neden {e.durum === 'gec' ? 'geç' : 'riskli'}: {bekleyen.k + 1}. adım ({e.adimlar[bekleyen.k]?.ad}) {tz(bekleyen.tezgah)} tezgâhında {sureYaz(bekleyen.bekleme.sure)} sıra bekliyor.</small>}
      </div>
      {gorunum === 'akis' ? (
        <ol className="tc-pyq-rota">
          {e.adimlar.map((a) => {
            const yer = adimYeri(m, a, y.sec), x = m.isler[a.id], s = y.sec[a.id]?.tezgah;
            const secildi = seciliAdim === a.id || (tasinanIs?.id === a.id);
            return (
              <li key={a.id}>
                <button
                  type="button" data-adim={a.id} data-yer={yer} aria-pressed={secildi} aria-current={vurgu === a.id && !secildi ? 'true' : undefined} disabled={yer === 'fason' || (yer !== 'yerli' && !uygula)}
                  onClick={() => { if (x) adimAc(e.id, a.id); else { etkinlestir(); y.adimSec(a.id); } }}
                >
                  <b>{a.ad}</b>
                  <small>{x ? `${x.fason ? 'Fason' : tz(x.m)} · ${an(x.S, x.C)}` : yer === 'fason' ? 'Fason · sistem yerleştirir' : s !== undefined ? `${tz(s)} seçildi` : 'yerleşmedi'}</small>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <table className="tc-pyq-optablo">
          <thead><tr><th scope="col">#</th><th scope="col">Operasyon</th><th scope="col">Süre</th><th scope="col">Tezgâh</th><th scope="col">Başlangıç</th><th scope="col">Bitiş</th><th scope="col">Durum</th></tr></thead>
          <tbody>
            {e.adimlar.map((a, sira) => {
              const yer = adimYeri(m, a, y.sec), x = m.isler[a.id], s = y.sec[a.id];
              const secildi = seciliAdim === a.id || (tasinanIs?.id === a.id);
              const duzenli = x !== undefined && duzen?.isId === a.id ? duzen : null;
              const kilit = x ? tasinabilir(x) : null;
              // Yerleşmemiş adımda sistemin ya da birikmiş seçimin öngördüğü yer (yazılmamış; motor dizerken değiştirebilir).
              const og = y.ongoru ?? (y.sistem !== null && y.sistem !== 'okunamadi' && Object.keys(y.sec).length === 0 ? y.sistem.oz : null);
              const tahmin = !x && og?.gecerli ? og.isler.find((i) => i.isId === a.id) : undefined;
              const adaylar = uygunTezgahlar(e, a.id);
              const girilir = yer !== 'fason' && (x ? tasi !== null && kilit === null : plansiz && uygula !== null);
              const hata = duzenli && duzenOz !== null && duzenOz !== 'hesap' ? (duzenOz === 'okunamadi' ? 'Önizleme okunamadı; yeniden deneyin.' : duzenOz.gecerli ? null : duzenOz.ileti ?? 'Bu yer uygun değil.')
                : !x && y.sonAlan === a.id && y.ongoru !== null && !y.ongoru.gecerli ? y.ongoru.ileti ?? 'Bu seçimle emir yerleşmiyor.' : null;
              const saatDegisti = (v: string): void => {
                const h = saatGirdisi?.oku(v) ?? null, c = h === null ? null : Math.round(h * 4) / 4;
                if (x) { if (c !== null) setDuzen(c === x.S && (duzenli?.tezgah ?? x.m) === x.m ? null : { isId: a.id, tezgah: duzenli?.tezgah ?? x.m, baslangic: c }); } else { etkinlestir(); y.alanYaz(a.id, { baslangic: c ?? undefined }); }
              };
              const notKimligi = `tc-pyq-not-${a.id}`;
              const tezgahDegisti = (v: string): void => {
                if (x) { const b0 = duzenli?.baslangic ?? x.S; setDuzen(v === x.m && b0 === x.S ? null : { isId: a.id, tezgah: v, baslangic: b0 }); } else { etkinlestir(); y.alanYaz(a.id, { tezgah: v === '' ? undefined : v }); }
              };
              return (
                <Fragment key={a.id}>
                <tr data-adim-satir={a.id} data-secili={secildi ? '' : undefined} data-degisti={duzenli || s ? '' : undefined}>
                  <td data-ad="#">{sira + 1}</td>
                  <td data-ad="Operasyon">
                    <button
                      type="button" data-adim={a.id} data-yer={yer} aria-pressed={secildi} aria-current={vurgu === a.id && !secildi ? 'true' : undefined} disabled={yer === 'fason' || (yer !== 'yerli' && !uygula)}
                      onClick={() => { if (x) adimAc(e.id, a.id); else { etkinlestir(); y.adimSec(a.id); } }}
                    ><b>{a.ad}</b></button>
                  </td>
                  <td data-ad="Süre" title="Yerleşimin başından sonuna geçen süre; vardiya dışı saatler içindedir.">{x ? sureYaz(x.C - x.S) : tahmin ? sureYaz(tahmin.C - tahmin.S) : '—'}</td>
                  <td data-ad="Tezgâh">
                    {yer === 'fason' || x?.fason ? <span className="tc-pyq-not">Fason</span> : (
                      <select className="tc-alan-kutu" aria-label={`${a.ad} tezgâhı`} aria-invalid={hata !== null || undefined} aria-describedby={hata !== null ? notKimligi : undefined} disabled={!girilir} title={kilit ?? undefined} value={x ? duzenli?.tezgah ?? x.m : s?.tezgah ?? ''} onChange={(ev) => { tezgahDegisti(ev.target.value); }}>
                        {!x && <option value="">Sistem seçsin</option>}
                        {(x && !adaylar.includes(x.m) ? [x.m, ...adaylar] : adaylar).map((t) => <option key={t} value={t}>{tz(t)}</option>)}
                      </select>
                    )}
                  </td>
                  <td data-ad="Başlangıç">
                    {yer === 'fason' || x?.fason ? <span className="tc-pyq-not">{x ? zaman(x.S) : 'sistem yerleştirir'}</span>
                      : saatGirdisi ? <input className="tc-alan-kutu" type="datetime-local" step={900} aria-label={`${a.ad} başlangıcı`} aria-invalid={hata !== null || undefined} aria-describedby={hata !== null ? notKimligi : undefined} disabled={!girilir} title={kilit ?? undefined} value={x ? saatGirdisi.yaz(duzenli?.baslangic ?? x.S) : s?.baslangic !== undefined ? saatGirdisi.yaz(s.baslangic) : ''} onChange={(ev) => { saatDegisti(ev.target.value); }} />
                        : <span>{x ? zaman(x.S) : '—'}</span>}
                    {!x && tahmin && s?.baslangic === undefined && <small data-ongoru="">öngörü {tz(tahmin.tezgah)} · {zaman(tahmin.S)}</small>}
                  </td>
                  <td data-ad="Bitiş" className="tc-pyq-mono">{x ? zaman(x.C) : tahmin ? <span data-ongoru="" title="Öngörü: yazılmadı">{zaman(tahmin.C)}</span> : '—'}</td>
                  <td data-ad="Durum">
                    <Rozet ton={yer === 'yerli' ? 'tamam' : yer === 'fason' ? 'bilgi' : 'hata'} gorunum="cizgi">{yer === 'yerli' ? 'Yerleşti' : yer === 'fason' ? 'Fason' : 'Yerleşmedi'}</Rozet>
                    {!x && s && <small data-yazilmadi="">seçim yazılmadı</small>}
                  </td>
                </tr>
                {(hata !== null || duzenli) && (
                  <tr className="tc-pyq-optablo-alt" data-satir-notu={a.id}>
                    <td colSpan={7}>
                      <div className="tc-pyq-optablo-not">
                      {hata !== null ? <><Simge ad="alert" boyut="k" /><span className="tc-pyq-ayar-hata" role="alert" id={notKimligi}>{hata}</span></>
                        : duzenOz === 'hesap' || duzenOz === null ? <span className="tc-pyq-not" role="status">Hesaplanıyor</span>
                          : (
                            <>
                              <span className="tc-pyq-not">{tz(duzenli?.tezgah ?? '')} · {zaman(duzenli?.baslangic ?? 0)}{duzenOz !== 'okunamadi' ? etki(duzenOz.bitis) : ''}</span>
                              <Dugme tur="ikincil" simge="check" data-satir-tasi={a.id} onClick={() => { if (duzenli && tasi) { tasi(duzenli.isId, duzenli.tezgah, duzenli.baslangic); setDuzen(null); } }}>Taşı</Dugme>
                            </>
                          )}
                      {duzenli && <Dugme tur="ikincil" simge="x" onClick={() => { setDuzen(null); }}>Vazgeç</Dugme>}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {yon && e.termin !== null && <EmirYonu key={e.id} {...yon} emirId={e.id} no={e.no} />}
      {tasinanIs && (
        <div className="tc-pyq-yerler" role="group" aria-label={`${tasinanIs.ad} için taşınacak yerler`}>
          {!tasi ? <p className="tc-pyq-not">Operasyonu yalnız planı yazabilen kişi taşır.</p>
            : engel !== null ? <p className="tc-pyq-not">{engel}.</p>
              : tasima === null ? <p className="tc-pyq-not" role="status">Taşınacak yerler hesaplanıyor</p>
                : tasima.length === 0 ? <p className="tc-pyq-not" role="status">Bu operasyon için başka uygun boş yer bulunamadı.</p>
                  : (
                    <>
                      <p className="tc-pyq-not"><b>{tasinanIs.ad}</b> seçili ({tz(tasinanIs.m)} · {an(tasinanIs.S, tasinanIs.C)}). Taşımak için bir yer seçin.</p>
                      <ul>
                        {tasima.map((b) => (
                          <li key={b.tezgah} data-ilk={b.enErken ? '' : undefined}>
                            <span><b className="tc-pyq-mono">{tz(b.tezgah)}</b> · {an(b.S, b.C)}</span>
                            <small>{b.tezgah === tasinanIs.m ? 'Aynı tezgâh' : 'Başka tezgâh'}{b.enErken ? ' · en erken biten yer' : ''}{etki(b.bitis)}</small>
                            <Dugme tur="ikincil" simge="check" data-tasi-tezgah={b.tezgah} onClick={() => { tasiYere(b.tezgah); }}>Taşı</Dugme>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
          {tasi && engel === null && taslakVar && <p className="tc-pyq-not" data-taslak-notu="">Taslağınızdaki değişiklikler bu yerlerde hesaba katılmadı; taşıyınca plan taslağınızla yeniden dizilir ve sonucu tahtada görünür.</p>}
        </div>
      )}
      {plansiz && etkin && (
        <div className="tc-pyq-yerler" role="group" aria-label={seciliAd ? `${seciliAd} için boş yerler` : 'Boş yerler'}>
          {!uygula ? <p className="tc-pyq-not">Emri yalnız planı yazabilen kişi yerleştirir.</p>
            : seciliAdim === null ? null
              : y.yerler === null ? <p className="tc-pyq-not" role="status">Boş yerler hesaplanıyor</p>
                : y.yerler.length === 0 ? <p className="tc-pyq-not" role="status">Bu adım için uygun boş yer bulunamadı; "Hepsini en erken yere yerleştir" sistemin seçimini dener.</p>
                  : (
                    <>
                      <p className="tc-pyq-not"><b>{seciliAd}</b> seçili. Yere basın.</p>
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
              {gorunum === 'tablo' && Object.keys(y.sec).length > 0 && <Dugme tur="ikincil" simge="check" disabled={y.ongoru === null || !y.ongoru.gecerli} aria-busy={y.ongoruBekliyor || undefined} onClick={() => { yaz(y.secimle()); }}>Seçimlerle yerleştir</Dugme>}
              {Object.keys(y.sec).length > 0 && <Dugme tur="ikincil" simge="x" onClick={y.sifirla}>Seçimleri sil</Dugme>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
