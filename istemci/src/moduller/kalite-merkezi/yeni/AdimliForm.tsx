import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CokSatir, Girdi, IsaretKutusu, Secim } from '../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../ortak/arayuz/Dugme.tsx';
import { OnayPenceresi } from '../../../ortak/arayuz/OnayPenceresi.tsx';
import { Pencere } from '../../../ortak/arayuz/Pencere.tsx';
import { Rozet } from '../../../ortak/arayuz/Rozet.tsx';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { GecmisPenceresi } from './GecmisPenceresi.tsx';
import type { KmKoleksiyonu } from './tipler.ts';
import {
  gunEkle, hizliTarihler, maddeNotu, maddeYaniti, oneriler, otomatikMi, secimDugmeleri, sorular, soruGorunur, yanitMetni, zorunluSoru, type KmSoru,
} from './tektek.ts';
import { kisileriHatirla, kmTercihi, tercihYaz, useKmVerisi } from './veri.ts';

export type KmSecenek = string | number | readonly [string | number, string];

export interface KmAlan {
  k: string;
  etiket: string;
  tur?: 'metin' | 'sayi' | 'tarih' | 'secim' | 'cokSatir' | 'isaretler' | 'evet';
  secenekler?: readonly KmSecenek[];
  zorunlu?: boolean;
  ipucu?: string;
  yerTutucu?: string;
  // Yarım ya da tam satır (uygulamadaki w: 'h' | 'f').
  genis?: 'yarim' | 'tam';
  liste?: 'parca' | 'kisi' | 'emir';
  varsayilan?: unknown | (() => unknown);
  evetMetni?: string;
  satir?: number;
  enAz?: number;
  enCok?: number;
  adim?: string;
}

export type FormVerisi = Record<string, unknown>;

export interface KmMadde { k: string; metin: string }
export const MADDE_YANITLARI = ['Evet', 'Hayır', 'UD'] as const;

export interface KmAdim {
  baslik: string;
  alanlar?: readonly string[];
  // Evet / Hayır / UD kontrol maddeleri (uygulamadaki ckRow); "Hayır"da not istenir.
  maddeler?: readonly KmMadde[];
  ipucu?: string;
  icerik?: (d: FormVerisi, degistir: (alan: string, deger: unknown) => void) => ReactNode;
}

export interface KmSorun { metin: string; adim: number; alan?: string }

interface Ozellikler {
  baslik: string;
  alanlar: readonly KmAlan[];
  ilk?: FormVerisi | null;
  adimlar?: readonly KmAdim[];
  kaydet: (d: FormVerisi) => Promise<void> | void;
  topla?: (d: FormVerisi) => FormVerisi;
  denetle?: (d: FormVerisi) => readonly KmSorun[];
  sonuc?: (d: FormVerisi) => ReactNode;
  onizleme?: (d: FormVerisi) => ReactNode;
  gecmis?: { kol: KmKoleksiyonu; kimlik: string } | null;
  // Yeni kayıtta yarım form bu anahtarla 7 gün saklanır; null ya da düzenlemede saklanmaz.
  taslak?: string | null;
  kapat: () => void;
  // Zorunlu alan denetimi olmadan kaydeden ikinci düğme (Formlar'daki "Taslak kaydet").
  ikinciKaydet?: { etiket: string; yap: (d: FormVerisi) => Promise<void> | void };
  kaydetMetni?: string;
  pencere?: 'yan' | 'tam';
}

export const TASLAK_ONEKI = 'kym-taslak:';
export const TASLAK_SURESI_MS = 7 * 24 * 3600 * 1000;

const deger = (s: KmSecenek): string => String(Array.isArray(s) ? s[0] : s);
const baslikOf = (s: KmSecenek): string => String(Array.isArray(s) ? s[1] : s);
const bosMu = (v: unknown): boolean => (Array.isArray(v) ? v.length === 0 : String(v ?? '').trim() === '');

export interface KmTaslak { t: number; d: FormVerisi; c: number }

export function taslakOku(anahtar: string, simdi = Date.now()): KmTaslak | null {
  try {
    const o = JSON.parse(localStorage.getItem(TASLAK_ONEKI + anahtar) ?? 'null') as Partial<KmTaslak> | null;
    if (!o || typeof o.t !== 'number' || simdi - o.t > TASLAK_SURESI_MS || !o.d || !Object.keys(o.d).length) return null;
    return { t: o.t, d: o.d, c: typeof o.c === 'number' ? o.c : -1 };
  } catch {
    return null;
  }
}

function taslakYaz(anahtar: string, d: FormVerisi | null, c = -1): void {
  try {
    if (d === null) localStorage.removeItem(TASLAK_ONEKI + anahtar);
    else localStorage.setItem(TASLAK_ONEKI + anahtar, JSON.stringify({ t: Date.now(), d, c }));
  } catch {
    /* depolama kapalıysa taslak tutulmaz */
  }
}

// Açılıştaki değerler: kayıttaki değer, yoksa alanın varsayılanı, yoksa son girilen kişi (dolduran, muayeneci...).
export function ilkDegerler(alanlar: readonly KmAlan[], ilk: FormVerisi | null | undefined, tercih: FormVerisi = kmTercihi()): FormVerisi {
  const d: FormVerisi = { ...(ilk ?? {}) };
  for (const a of alanlar) {
    if (d[a.k] !== undefined && d[a.k] !== null) continue;
    const v = typeof a.varsayilan === 'function' ? (a.varsayilan as () => unknown)() : a.varsayilan;
    d[a.k] = v ?? tercih[a.k] ?? (a.tur === 'isaretler' ? [] : a.tur === 'evet' ? false : a.tur === 'sayi' ? null : '');
  }
  return d;
}

export function eksikler(alanlar: readonly KmAlan[], d: FormVerisi): KmAlan[] {
  return alanlar.filter((a) => a.zorunlu && bosMu(d[a.k]));
}

// Uygulamanın adımlı penceresi (steppedModal): adım çubuğu, zorunlu sayacı, kontrol ve kaydet adımı, taslak, Ctrl+Enter, Geçmiş.
// Dört alandan az tek adımlı formda kontrol adımı yoktur (uygulamadaki kısa form).
export function AdimliForm({ baslik, alanlar, ilk, adimlar, kaydet, topla, denetle, sonuc, onizleme, gecmis, taslak = null, kapat, ikinciKaydet, kaydetMetni = 'Kaydet', pencere = 'yan' }: Ozellikler) {
  const { bildir } = useBildirim();
  const { veri } = useKmVerisi();
  const kimlik = useId();
  const yeni = !(ilk && typeof ilk._id === 'string');
  const taslakAnahtari = yeni ? taslak : null;
  // Açılış değerleri pencere açıkken sabittir: kirlilik ve taslak silme buna göre.
  const [acilis] = useState(() => {
    const o = ilkDegerler(alanlar, ilk);
    if (adimlar?.some((s) => s.maddeler?.length)) {
      o.liste = { ...((o.liste as object | undefined) ?? {}) };
      o.listeNot = { ...((o.listeNot as object | undefined) ?? {}) };
    }
    return o;
  });
  const [d, dYaz] = useState<FormVerisi>(acilis);
  const kirli = JSON.stringify(d) !== JSON.stringify(acilis);
  // Yarım kalan taslak bugünkü gibi sorulur: "Devam et" soru yerine döner, "Yoksay" siler.
  const [taslakTeklifi, taslakTeklifiYaz] = useState(() => (taslakAnahtari ? taslakOku(taslakAnahtari) : null));
  const [sallanan, sallananYaz] = useState<string | null>(null);
  const [hatali, hataliYaz] = useState<ReadonlySet<string>>(new Set());
  const [kaydediliyor, kaydediliyorYaz] = useState(false);
  const [soruyor, soruyorYaz] = useState(false);
  const [gecmisAcik, gecmisAcikYaz] = useState(false);
  const [onizlemeAcik, onizlemeAcikYaz] = useState(false);
  const govde = useRef<HTMLDivElement>(null);

  const tekAdim = !adimlar && alanlar.length < 4;
  const isAdimlari: readonly KmAdim[] = adimlar ?? [{ baslik: baslik.replace(/ düzenle$/, ''), alanlar: alanlar.map((a) => a.k) }];
  const kontrolVar = !tekAdim;
  const sonAdim = kontrolVar ? isAdimlari.length : isAdimlari.length - 1;

  const alanAdimi = useMemo(() => {
    const m = new Map<string, number>();
    isAdimlari.forEach((s, i) => (s.alanlar ?? []).forEach((k) => m.set(k, i)));
    alanlar.forEach((a) => { if (!m.has(a.k)) m.set(a.k, 0); });
    return m;
  }, [isAdimlari, alanlar]);

  // "Tek tek sor": bugünkü gibi adımlı formda varsayılan açık; kişinin seçimi `kym-me` formMode'da kalır.
  const soruListesi = useMemo(() => sorular(isAdimlari, alanlar, alanAdimi), [isAdimlari, alanlar, alanAdimi]);
  const OZET = soruListesi.length;
  const onDolgu = ilk && typeof ilk._id !== 'string' ? ilk : null;
  const [otomatik] = useState(() => new Set(soruListesi.flatMap((q, i) => (otomatikMi(q, yeni, acilis, onDolgu) ? [i] : []))));
  const sira = soruListesi.flatMap((q, i) => (soruGorunur(q, d) && !otomatik.has(i) ? [i] : []));
  const [tekTek, tekTekYaz] = useState(() => !tekAdim && kmTercihi().formMode !== 'liste');
  const [soru, soruYaz] = useState(() => (tekTek ? (yeni ? sira[0] ?? OZET : OZET) : -1));
  const siradaki = sira.indexOf(soru);
  const [adim, adimYaz] = useState(() => (soru === OZET ? sonAdim : soru >= 0 ? soruListesi[soru]?.adim ?? 0 : 0));

  useEffect(() => {
    if (!taslakAnahtari || taslakTeklifi || !kirli) return;
    const z = setTimeout(() => taslakYaz(taslakAnahtari, d, soru), 500);
    return () => clearTimeout(z);
  }, [d, soru, taslakAnahtari, taslakTeklifi, kirli]);

  const toplanan = (): FormVerisi => (topla ? topla(d) : d);
  const eksik = eksikler(alanlar, d);
  const ekSorun = denetle ? denetle(toplanan()) : [];
  const zorunluSayisi = alanlar.filter((a) => a.zorunlu).length;

  const degistir = (k: string, v: unknown) => {
    dYaz((o) => ({ ...o, [k]: v }));
    if (hatali.has(k)) hataliYaz((h) => new Set([...h].filter((x) => x !== k)));
  };
  const git = (i: number, alan?: string) => {
    adimYaz(Math.max(0, Math.min(sonAdim, i)));
    govde.current?.scrollTo?.({ top: 0 });
    if (alan) setTimeout(() => govde.current?.querySelector<HTMLElement>(`[name="${alan}"]`)?.focus(), 0);
  };
  const soruyaGit = (i: number) => {
    const n = Math.max(0, Math.min(OZET, i));
    soruYaz(n);
    const q = soruListesi[n];
    adimYaz(n === OZET || !q ? sonAdim : q.adim);
    govde.current?.scrollTo?.({ top: 0 });
    const ad = q?.tur === 'alan' && !secimDugmeleri(q.alan) ? q.alan.k : q?.tur === 'madde' ? `q_${q.madde.k}` : null;
    if (ad) {
      setTimeout(() => {
        const el = govde.current?.querySelector<HTMLInputElement>(`[name="${ad}"]:checked`) ?? govde.current?.querySelector<HTMLElement>(`[name="${ad}"]`);
        el?.focus({ preventScroll: true });
      }, 30);
    }
  };
  const notaOdaklan = (k: string) => setTimeout(() => govde.current?.querySelector<HTMLElement>(`[name="qn_${k}"]`)?.focus(), 60);
  const sonraki = (oto = false) => {
    if (soru === OZET) return;
    const q = soruListesi[soru];
    if (!oto && q?.tur === 'alan' && zorunluSoru(q) && !yanitMetni(q, d)) {
      hataliYaz((h) => new Set([...h, q.alan.k]));
      sallananYaz(q.alan.k);
      setTimeout(() => sallananYaz(null), 400);
      bildir('hata', `"${q.alan.etiket}" zorunlu.`);
      return;
    }
    if (q?.tur === 'madde' && maddeYaniti(d, q.madde.k) === 'Hayır' && !maddeNotu(d, q.madde.k).trim()) {
      if (!oto) { notaOdaklan(q.madde.k); bildir('hata', '"Hayır" için ne bulunduğunu kısaca yazın.'); }
      return;
    }
    soruyaGit(siradaki >= 0 && siradaki < sira.length - 1 ? sira[siradaki + 1]! : OZET);
  };
  const onceki = () => {
    if (soru === OZET) soruyaGit(sira[sira.length - 1] ?? 0);
    else if (siradaki > 0) soruyaGit(sira[siradaki - 1]!);
  };
  const atla = () => soruyaGit(siradaki < sira.length - 1 ? sira[siradaki + 1]! : OZET);
  const kipDegistir = (acik: boolean) => {
    tekTekYaz(acik);
    tercihYaz({ formMode: acik ? 'tek' : 'liste' });
    if (acik) soruyaGit(soru < 0 ? 0 : soru);
  };
  // Seçim düğmesine basınca bugünkü gibi kısa bir gecikmeyle sonraki soruya geçilir.
  const secVeIlerle = (k: string, v: unknown) => { degistir(k, v); setTimeout(() => sonrakiRef.current(true), 170); };
  const sonrakiRef = useRef(sonraki);
  sonrakiRef.current = sonraki;
  const maddeYanitla = (k: string, y: string) => {
    dYaz((o) => {
      const listeNot = { ...((o.listeNot as Record<string, string> | undefined) ?? {}) };
      if (y !== 'Hayır') delete listeNot[k];
      return { ...o, liste: { ...((o.liste as Record<string, string> | undefined) ?? {}), [k]: y }, listeNot };
    });
    if (!tekTek) return;
    if (y === 'Hayır') notaOdaklan(k);
    else setTimeout(() => sonrakiRef.current(true), 170);
  };
  const maddeNotuYaz = (k: string, n: string) => dYaz((o) => ({ ...o, listeNot: { ...((o.listeNot as Record<string, string> | undefined) ?? {}), [k]: n } }));
  const hepsiEvet = (s: KmAdim) => dYaz((o) => {
    const liste = { ...((o.liste as Record<string, string> | undefined) ?? {}) };
    (s.maddeler ?? []).forEach((m) => { if (!liste[m.k]) liste[m.k] = 'Evet'; });
    return { ...o, liste };
  });
  const taslakDevam = () => {
    const o = taslakTeklifi;
    if (!o) return;
    dYaz({ ...acilis, ...o.d });
    taslakTeklifiYaz(null);
    bildir('bilgi', 'Taslaktan devam ediliyor');
    const c = o.c >= 0 ? o.c : 0;
    if (tekTek) soruyaGit(c);
    else git(soruListesi[c]?.adim ?? 0);
  };
  const taslakYoksay = () => { if (taslakAnahtari) taslakYaz(taslakAnahtari, null); taslakTeklifiYaz(null); };

  const kapatmayiDene = () => (kirli && !kaydediliyor ? soruyorYaz(true) : kapat());

  const kaydetDene = async () => {
    if (eksik.length) {
      hataliYaz(new Set(eksik.map((a) => a.k)));
      const ilkEksik = eksik[0]!;
      git(alanAdimi.get(ilkEksik.k) ?? 0, ilkEksik.k);
      bildir('hata', eksik.length === 1 ? `"${ilkEksik.etiket}" alanını doldurun.` : `${eksik.length} zorunlu alan boş.`);
      return;
    }
    kaydediliyorYaz(true);
    try {
      const son = toplanan();
      await kaydet(son);
      kisileriHatirla(son);
      if (taslakAnahtari) taslakYaz(taslakAnahtari, null);
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Kayıt kaydedilemedi. Bağlantıyı kontrol edip yeniden deneyin.'));
    } finally {
      kaydediliyorYaz(false);
    }
  };

  const ikinciKaydetDene = async () => {
    if (!ikinciKaydet) return;
    kaydediliyorYaz(true);
    try {
      await ikinciKaydet.yap(toplanan());
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Kayıt kaydedilemedi. Bağlantıyı kontrol edip yeniden deneyin.'));
    } finally {
      kaydediliyorYaz(false);
    }
  };

  const tus = (o: KeyboardEvent) => {
    if (tekTek && !o.nativeEvent.isComposing) {
      const t = o.target as HTMLElement;
      if (o.key === 'Enter' && !o.altKey) {
        if ((t.tagName === 'TEXTAREA' && !(o.ctrlKey || o.metaKey)) || t.tagName === 'BUTTON' || t.closest('.tc-km-fq-ust')) return;
        o.preventDefault();
        if (o.shiftKey) onceki();
        else if (soru === OZET) void kaydetDene();
        else sonraki();
        return;
      }
      if (/^[1-9]$/.test(o.key) && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && soru < OZET) {
        const n = Number(o.key) - 1;
        const b = govde.current?.querySelectorAll<HTMLButtonElement>('.tc-km-fq-cur .tc-km-fq-secim:not(.tc-km-fq-kisa) button')[n];
        const q = soruListesi[soru];
        if (b) { o.preventDefault(); b.click(); }
        else if (q?.tur === 'madde' && MADDE_YANITLARI[n]) { o.preventDefault(); maddeYanitla(q.madde.k, MADDE_YANITLARI[n]); }
      }
      return;
    }
    if ((o.ctrlKey || o.metaKey) && o.key === 'Enter') {
      o.preventDefault();
      if (adim < sonAdim) git(adim + 1);
      else void kaydetDene();
    }
  };

  const listeKimligi = (l: KmAlan['liste']) => (l ? `${kimlik}-${l}` : undefined);
  const listeler = useMemo(() => {
    if (!veri) return { parca: [], kisi: [], emir: [] };
    const parca = new Map<string, string>();
    [...veri.ncr, ...veri.insp, ...veri.lot].forEach((r) => { if (r.parcaNo && !parca.has(r.parcaNo)) parca.set(r.parcaNo, r.parcaAdi || ''); });
    const kisi = new Set<string>();
    [...veri.ncr, ...veri.capa].forEach((r) => { if (r.sorumlu) kisi.add(r.sorumlu); });
    [...veri.insp, ...veri.lot].forEach((r) => { if (r.muayeneci) kisi.add(r.muayeneci); });
    veri.frm.forEach((r) => { if (r.dolduran) kisi.add(r.dolduran); if (r.onaylayan) kisi.add(r.onaylayan); });
    return {
      parca: [...parca.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([deger, baslik]) => ({ deger, baslik })),
      kisi: [...kisi].sort((a, b) => a.localeCompare(b, 'tr')).map((deger) => ({ deger, baslik: '' })),
      emir: veri.emir.filter((e) => e.durum !== 'Kapalı').map((e) => ({ deger: e.no ?? '', baslik: `${e.tip ?? ''} ${e.parcaNo ?? ''}` })),
    };
  }, [veri]);

  // Parça no seçilince parça adı boşsa bilinen adla dolar (uygulamadaki PARTS).
  const parcaSecildi = (pn: string) => {
    const ad = listeler.parca.find((p) => p.deger === pn.trim())?.baslik;
    if (ad && alanlar.some((a) => a.k === 'parcaAdi') && bosMu(d.parcaAdi)) degistir('parcaAdi', ad);
  };

  const alanCiz = (a: KmAlan) => {
    const v = d[a.k];
    const hata = hatali.has(a.k) ? 'Bu alan zorunlu.' : undefined;
    const ortak = { etiket: a.etiket, ipucu: a.ipucu, hata, name: a.k, required: a.zorunlu };
    const q = soruListesi[soru];
    const simdiki = tekTek && q?.tur === 'alan' && q.alan.k === a.k;
    const dugmeler = simdiki ? secimDugmeleri(a) : null;
    const sinif = `tc-km-alan${a.genis === 'tam' ? ' tc-km-alan-tam' : a.genis === 'yarim' ? ' tc-km-alan-yarim' : ''}${simdiki ? ' tc-km-fq-cur' : ''}${dugmeler ? ' tc-km-fq-secmeli' : ''}${sallanan === a.k ? ' tc-km-fq-salla' : ''}`;
    let ic: ReactNode;
    switch (a.tur) {
      case 'secim':
        ic = <Secim {...ortak} value={String(v ?? '')} onChange={(o) => degistir(a.k, o.target.value)}
          secenekler={(a.secenekler ?? []).map((s) => ({ deger: deger(s), baslik: baslikOf(s) }))} />;
        break;
      case 'cokSatir':
        ic = <CokSatir {...ortak} rows={a.satir ?? 3} value={String(v ?? '')} onChange={(o) => degistir(a.k, o.target.value)} />;
        break;
      case 'isaretler': {
        const secili = Array.isArray(v) ? (v as string[]) : [];
        ic = (
          <fieldset className="tc-km-isaretler">
            <legend>{a.etiket}{a.zorunlu ? ' *' : ''}</legend>
            {(a.secenekler ?? []).map((s) => (
              <IsaretKutusu key={deger(s)} etiket={baslikOf(s)} name={a.k} checked={secili.includes(deger(s))}
                onChange={(o) => degistir(a.k, o.target.checked ? [...secili, deger(s)] : secili.filter((x) => x !== deger(s)))} />
            ))}
          </fieldset>
        );
        break;
      }
      case 'evet':
        ic = <IsaretKutusu etiket={a.evetMetni ?? 'Evet'} name={a.k} checked={v === true} onChange={(o) => degistir(a.k, o.target.checked)} />;
        break;
      case 'sayi':
        ic = <Girdi {...ortak} type="number" inputMode="decimal" min={a.enAz} max={a.enCok} placeholder={a.yerTutucu}
          value={v === null || v === undefined ? '' : String(v)} onChange={(o) => degistir(a.k, o.target.value === '' ? null : Number(o.target.value))} />;
        break;
      case 'tarih':
        ic = <Girdi {...ortak} type="date" value={String(v ?? '')} onChange={(o) => degistir(a.k, o.target.value)} />;
        break;
      default:
        ic = <Girdi {...ortak} value={String(v ?? '')} placeholder={a.yerTutucu} list={listeKimligi(a.liste ?? (a.k === 'parcaNo' ? 'parca' : undefined))}
          autoComplete={a.liste ? 'off' : undefined} onChange={(o) => degistir(a.k, o.target.value)}
          onBlur={a.k === 'parcaNo' ? (o) => parcaSecildi(o.target.value) : undefined} />;
    }
    const liste = a.liste ?? (a.k === 'parcaNo' ? 'parca' : undefined);
    return (
      <div key={a.k} className={sinif}>
        {simdiki && a.tur === 'evet' && <span className="tc-km-fq-baslik">{a.etiket}</span>}
        {ic}
        {dugmeler && (
          <div className="tc-km-fq-secim">
            {dugmeler.map((b, j) => {
              const secili = a.tur === 'evet' ? (v === true) === (b.deger === '1') : String(v ?? '') === b.deger;
              return (
                <button key={b.deger} type="button" aria-pressed={secili} onClick={() => secVeIlerle(a.k, a.tur === 'evet' ? b.deger === '1' : b.deger)}>
                  {j < 9 && <kbd>{j + 1}</kbd>}{b.baslik}
                </button>
              );
            })}
          </div>
        )}
        {simdiki && a.tur === 'tarih' && (
          <div className="tc-km-fq-secim tc-km-fq-kisa">
            {hizliTarihler(a.k).map((t) => <button key={t.gun} type="button" onClick={() => secVeIlerle(a.k, gunEkle(t.gun))}>{t.baslik}</button>)}
          </div>
        )}
        {simdiki && liste && (
          <div className="tc-km-fq-secim tc-km-fq-kisa">
            {oneriler(listeler[liste].map((o) => o.deger), String(v ?? '')).map((o) => (
              <button key={o} type="button" onClick={() => { if (a.k === 'parcaNo') parcaSecildi(o); secVeIlerle(a.k, o); }}>{o}</button>
            ))}
          </div>
        )}
        {simdiki && a.tur === 'cokSatir' && <small className="tc-km-fq-ipucu">Bitince İleri düğmesine basın (Ctrl+Enter).</small>}
      </div>
    );
  };

  const eksikGorunur = soruListesi.filter((q) => zorunluSoru(q) && soruGorunur(q, d) && !yanitMetni(q, d)).length;
  const adimEksigi = (i: number) => eksik.filter((a) => alanAdimi.get(a.k) === i).length + ekSorun.filter((s) => s.adim === i).length;
  const sorunlar: KmSorun[] = [...eksik.map((a) => ({ metin: `${a.etiket} boş`, adim: alanAdimi.get(a.k) ?? 0, alan: a.k })), ...ekSorun];
  const dolu = zorunluSayisi - eksik.length;
  const adimlarCubugu = [...isAdimlari.map((s) => s.baslik), ...(kontrolVar ? ['Kontrol ve kaydet'] : [])];

  const alt = (
    <>
      <Dugme tur="ikincil" onClick={kapatmayiDene} className={tekTek ? 'tc-km-fq-dar-gizli' : undefined}>Vazgeç</Dugme>
      {ikinciKaydet && <Dugme tur="ikincil" yukleniyor={kaydediliyor} onClick={() => void ikinciKaydetDene()}>{ikinciKaydet.etiket}</Dugme>}
      {gecmis && <Dugme tur="ikincil" simge="clock" onClick={() => gecmisAcikYaz(true)} className={tekTek ? 'tc-km-fq-dar-gizli' : undefined}>Geçmiş</Dugme>}
      {onizleme && <Dugme tur="ikincil" simge="eye" aria-pressed={onizlemeAcik} onClick={() => onizlemeAcikYaz(!onizlemeAcik)}
        className={tekTek ? 'tc-km-fq-dar-gizli' : undefined}>Önizle</Dugme>}
      <span className="tc-km-bosluk" />
      {!tekAdim && !tekTek && <Dugme tur="ikincil" simge="chev-left" disabled={adim === 0} onClick={() => git(adim - 1)}>Geri</Dugme>}
      {!tekTek && adim < sonAdim && <Dugme simge="chev-right" onClick={() => git(adim + 1)}>İleri</Dugme>}
      <Dugme tur={adim === sonAdim ? 'birincil' : 'ikincil'} yukleniyor={kaydediliyor} onClick={() => void kaydetDene()}
        className={tekTek && soru !== OZET ? 'tc-km-fq-dar-gizli' : undefined}>{kaydetMetni}</Dugme>
      {tekTek && (
        <span className="tc-km-fq-gezinme">
          <Dugme tur="ikincil" disabled={soru !== OZET && siradaki <= 0} onClick={onceki}>‹ Geri</Dugme>
          {soru !== OZET && !zorunluSoru(soruListesi[soru]) && <Dugme tur="ikincil" onClick={atla}>Atla</Dugme>}
          {soru !== OZET && <Dugme tur="birincil" onClick={() => sonraki()}>{siradaki === sira.length - 1 ? 'Özete geç ›' : 'İleri ›'}</Dugme>}
        </span>
      )}
    </>
  );

  const taslakBandi = taslakTeklifi && (
    <div className="tc-km-fq-taslak">
      Yarım kalmış bir taslak var ({new Date(taslakTeklifi.t).toLocaleDateString('tr-TR')} {new Date(taslakTeklifi.t).toTimeString().slice(0, 5)}).{' '}
      <Dugme tur="ikincil" onClick={taslakDevam}>Devam et</Dugme>{' '}
      <button type="button" className="tc-km-fq-kip" onClick={taslakYoksay}>Yoksay</button>
    </div>
  );

  return (
    <>
      <Pencere acik kapat={kapatmayiDene} baslik={baslik} tur={pencere} alt={alt}>
        <div ref={govde} className={`tc-km-form${tekTek ? ' tc-km-fq-acik' : ''}`} onKeyDown={tus}>
          {!tekAdim && (
            <div className="tc-km-fq-ust">
              <div className="tc-km-fq-durum">
                <span className="tc-km-fq-bolum">{soru === OZET ? 'Özet ve kaydet' : soruListesi[soru] ? isAdimlari[soruListesi[soru]!.adim]?.baslik : ''}</span>
                <span className="tc-km-fq-sayi">
                  {soru === OZET ? `${sira.length} soru` : `Soru ${siradaki + 1} / ${sira.length}`}
                  {eksikGorunur > 0 && <> | <b className="tc-km-fq-kotu">{eksikGorunur} zorunlu boş</b></>}
                </span>
              </div>
              <button type="button" className="tc-km-fq-kip" onClick={() => kipDegistir(!tekTek)}>{tekTek ? 'Tüm alanları göster' : 'Tek tek sor'}</button>
              <div className="tc-km-fq-noktalar">
                {sira.map((i, n) => {
                  const q = soruListesi[i]!;
                  const y = yanitMetni(q, d);
                  const durum = i === soru ? 'simdi' : zorunluSoru(q) && !y ? 'eksik' : y && q.tur !== 'ek' ? 'tamam' : undefined;
                  return (
                    <button key={i} type="button" data-durum={durum} aria-current={i === soru ? 'step' : undefined}
                      title={q.tur === 'alan' ? q.alan.etiket : q.tur === 'madde' ? 'Kontrol maddesi' : 'Ek bilgiler'} onClick={() => { if (!tekTek) kipDegistir(true); soruyaGit(i); }}>{n + 1}</button>
                  );
                })}
                <button type="button" className="tc-km-fq-ozet" data-durum={soru === OZET ? 'simdi' : undefined}
                  onClick={() => { if (!tekTek) kipDegistir(true); soruyaGit(OZET); }}>Özet</button>
              </div>
              {taslakBandi}
            </div>
          )}
          {tekAdim && taslakBandi}
          {!tekAdim && !tekTek && (
            <div className="tc-km-form-ust">
              <p className="tc-km-ilerleme">{zorunluSayisi ? `${dolu} / ${zorunluSayisi} zorunlu alan dolu` : 'Zorunlu alan yok'}</p>
              <ol className="tc-km-adimlar">
                {adimlarCubugu.map((b, i) => {
                  const n = i < isAdimlari.length ? adimEksigi(i) : 0;
                  const tamam = i < isAdimlari.length ? n === 0 : sorunlar.length === 0;
                  return (
                    <li key={b}>
                      <button type="button" aria-current={i === adim ? 'step' : undefined} data-tamam={tamam || undefined} onClick={() => git(i)}>
                        <span className="tc-km-adim-no">{i + 1}</span>{b}{n > 0 && <Rozet ton="uyari">{n}</Rozet>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {isAdimlari.map((s, i) => (
            <section key={s.baslik} hidden={i !== adim} className="tc-km-adim">
              {!tekAdim && (
                <div className="tc-km-adim-bas">
                  <h3 className="tc-km-soru">{s.baslik}</h3>
                  {!!s.maddeler?.length && <Dugme tur="ikincil" onClick={() => hepsiEvet(s)}>Yanıtsızları "Evet" yap</Dugme>}
                </div>
              )}
              {s.ipucu && <p className="tc-km-ipucu">{s.ipucu}</p>}
              <div className="tc-km-alanlar">{alanlar.filter((a) => alanAdimi.get(a.k) === i).sort((x, y) => {
                const K = s.alanlar ?? [];
                const a = K.indexOf(x.k);
                const b = K.indexOf(y.k);
                return (a < 0 ? 999 : a) - (b < 0 ? 999 : b);
              }).map(alanCiz)}</div>
              {!!s.maddeler?.length && (
                <div className="tc-km-maddeler">
                  {s.maddeler.map((m, no) => {
                    const y = maddeYaniti(d, m.k);
                    const q = soruListesi[soru];
                    const simdi = tekTek && q?.tur === 'madde' && q.madde.k === m.k;
                    return (
                      <div key={m.k} className={`tc-km-madde${simdi ? ' tc-km-fq-cur' : ''}`} data-hayir={y === 'Hayır' || undefined}>
                        <div className="tc-km-madde-metin">{no + 1}. {m.metin}</div>
                        <div className="tc-km-madde-yanit" role="radiogroup" aria-label={`Madde ${no + 1}`}>
                          {MADDE_YANITLARI.map((o) => (
                            <label key={o} data-yanit={o}>
                              <input type="radio" name={`q_${m.k}`} value={o} checked={y === o} onChange={() => maddeYanitla(m.k, o)} />
                              <span>{o}</span>
                            </label>
                          ))}
                        </div>
                        <input className="tc-km-madde-not" name={`qn_${m.k}`} placeholder="Ne bulundu, ne yapıldı? (zorunlu)" aria-label={`Madde ${no + 1} açıklaması`}
                          hidden={y !== 'Hayır'} value={maddeNotu(d, m.k)} onChange={(e) => maddeNotuYaz(m.k, e.target.value)} />
                      </div>
                    );
                  })}
                </div>
              )}
              {s.icerik && (
                <div className={`tc-km-fq-ek${tekTek && soruListesi[soru]?.tur === 'ek' && soruListesi[soru]?.adim === i ? ' tc-km-fq-cur' : ''}`}>{s.icerik(d, degistir)}</div>
              )}
            </section>
          ))}
          {kontrolVar && adim === sonAdim && (
            <section className="tc-km-adim">
              <h3 className="tc-km-soru">Kontrol ve kaydet</h3>
              {tekTek && <Ozet sorular={soruListesi} d={d} adimlar={isAdimlari} otomatik={otomatik} sec={soruyaGit} />}
              {sonuc && <div className="tc-km-sonuc">{sonuc(toplanan())}</div>}
              {sorunlar.length
                ? (
                  <div className="tc-km-not tc-km-not-kotu">
                    <p><b>Kaydetmeden önce kontrol edin: {sorunlar.length} madde.</b> Zorunlu alanlar tamamlanmadan kayıt oluşmaz.</p>
                    <ul className="tc-km-sorunlar">
                      {sorunlar.map((s) => (
                        <li key={`${s.adim}-${s.metin}`}><span>{s.metin}</span><Dugme tur="ikincil" onClick={() => git(s.adim, s.alan)}>Düzelt</Dugme></li>
                      ))}
                    </ul>
                  </div>
                )
                : <div className="tc-km-not tc-km-not-iyi"><b>Her şey tamam.</b> Kaydet ile kaydı oluşturun.</div>}
            </section>
          )}
          {onizleme && onizlemeAcik && <div className="tc-km-onizleme">{onizleme(toplanan())}</div>}
          {(['parca', 'kisi', 'emir'] as const).map((l) => (
            <datalist key={l} id={listeKimligi(l)}>
              {listeler[l].map((o) => <option key={o.deger} value={o.deger}>{o.baslik}</option>)}
            </datalist>
          ))}
        </div>
      </Pencere>
      <OnayPenceresi acik={soruyor} baslik="Kaydedilmemiş değişiklikler" tehlikeli onayMetni="Kaydetmeden kapat"
        onayla={() => { soruyorYaz(false); kapat(); }} vazgec={() => soruyorYaz(false)}>
        Girdiğiniz bilgiler kaydedilmedi. Pencere kapatılırsa kaybolur.
      </OnayPenceresi>
      {gecmis && gecmisAcik && <GecmisPenceresi kol={gecmis.kol} kimlik={gecmis.kimlik} kapat={() => gecmisAcikYaz(false)} />}
    </>
  );
}

// Tek tek sor özeti: yanıtlar adım adım; satıra dokununca o soruya dönülür.
function Ozet({ sorular: q, d, adimlar, otomatik, sec }: {
  sorular: readonly KmSoru[]; d: FormVerisi; adimlar: readonly KmAdim[]; otomatik: ReadonlySet<number>; sec: (i: number) => void;
}) {
  const gruplar = adimlar.map((s, ai) => ({ baslik: s.baslik, satirlar: q.flatMap((x, i) => (x.adim === ai && soruGorunur(x, d) ? [i] : [])) }))
    .filter((g) => g.satirlar.length);
  return (
    <div className="tc-km-fq-yanitlar">
      <h4>Yanıtlarınız <span className="tc-km-soluk">değiştirmek için dokunun</span></h4>
      {gruplar.map((g) => (
        <div key={g.baslik} className="tc-km-fq-grup">
          <b>{g.baslik}</b>
          {g.satirlar.map((i) => {
            const x = q[i]!;
            const y = yanitMetni(x, d);
            const eksik = zorunluSoru(x) && !y;
            return (
              <button key={i} type="button" className="tc-km-fq-satir" data-eksik={eksik || undefined} onClick={() => sec(i)}>
                <span>{x.tur === 'alan' ? x.alan.etiket : x.tur === 'madde' ? `${x.no + 1}. ${x.madde.metin}` : 'Tablo / ek bilgiler'}{otomatik.has(i) && <small className="tc-km-soluk"> otomatik</small>}</span>
                <span className="tc-km-fq-deger">
                  {x.tur === 'ek' ? 'Görüntüle / düzenle' : y ? (y.length > 120 ? `${y.slice(0, 117)}…` : y) : eksik ? <b>Boş (zorunlu)</b> : <span className="tc-km-soluk">—</span>}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
