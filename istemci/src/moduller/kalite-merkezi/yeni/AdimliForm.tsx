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
import { kisileriHatirla, kmTercihi, useKmVerisi } from './veri.ts';

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

export interface KmAdim {
  baslik: string;
  alanlar?: readonly string[];
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
}

export const TASLAK_ONEKI = 'kym-taslak:';
export const TASLAK_SURESI_MS = 7 * 24 * 3600 * 1000;

const deger = (s: KmSecenek): string => String(Array.isArray(s) ? s[0] : s);
const baslikOf = (s: KmSecenek): string => String(Array.isArray(s) ? s[1] : s);
const bosMu = (v: unknown): boolean => (Array.isArray(v) ? v.length === 0 : String(v ?? '').trim() === '');

export function taslakOku(anahtar: string, simdi = Date.now()): FormVerisi | null {
  try {
    const o = JSON.parse(localStorage.getItem(TASLAK_ONEKI + anahtar) ?? 'null') as { t?: number; d?: FormVerisi } | null;
    if (!o || typeof o.t !== 'number' || simdi - o.t > TASLAK_SURESI_MS || !o.d) return null;
    return o.d;
  } catch {
    return null;
  }
}

function taslakYaz(anahtar: string, d: FormVerisi | null): void {
  try {
    if (d === null) localStorage.removeItem(TASLAK_ONEKI + anahtar);
    else localStorage.setItem(TASLAK_ONEKI + anahtar, JSON.stringify({ t: Date.now(), d }));
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
export function AdimliForm({ baslik, alanlar, ilk, adimlar, kaydet, topla, denetle, sonuc, onizleme, gecmis, taslak = null, kapat }: Ozellikler) {
  const { bildir } = useBildirim();
  const { veri } = useKmVerisi();
  const kimlik = useId();
  const yeni = !(ilk && typeof ilk._id === 'string');
  const taslakAnahtari = yeni ? taslak : null;
  // Açılış değerleri pencere açıkken sabittir: kirlilik ve taslak silme buna göre.
  const [acilis] = useState(() => ilkDegerler(alanlar, ilk));
  const geriYuklenen = useMemo(() => (taslakAnahtari ? taslakOku(taslakAnahtari) : null), [taslakAnahtari]);
  const [d, dYaz] = useState<FormVerisi>(() => (geriYuklenen ? { ...acilis, ...geriYuklenen } : acilis));
  const [taslakNotu, taslakNotuYaz] = useState(geriYuklenen !== null);
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
  const [adim, adimYaz] = useState(0);

  const alanAdimi = useMemo(() => {
    const m = new Map<string, number>();
    isAdimlari.forEach((s, i) => (s.alanlar ?? []).forEach((k) => m.set(k, i)));
    alanlar.forEach((a) => { if (!m.has(a.k)) m.set(a.k, 0); });
    return m;
  }, [isAdimlari, alanlar]);

  useEffect(() => {
    if (!taslakAnahtari) return;
    const z = setTimeout(() => taslakYaz(taslakAnahtari, d), 400);
    return () => clearTimeout(z);
  }, [d, taslakAnahtari]);

  const toplanan = (): FormVerisi => (topla ? topla(d) : d);
  const eksik = eksikler(alanlar, d);
  const ekSorun = denetle ? denetle(toplanan()) : [];
  const zorunluSayisi = alanlar.filter((a) => a.zorunlu).length;
  const kirli = JSON.stringify(d) !== JSON.stringify(acilis);

  const degistir = (k: string, v: unknown) => {
    dYaz((o) => ({ ...o, [k]: v }));
    if (hatali.has(k)) hataliYaz((h) => new Set([...h].filter((x) => x !== k)));
  };
  const git = (i: number, alan?: string) => {
    adimYaz(Math.max(0, Math.min(sonAdim, i)));
    govde.current?.scrollTo?.({ top: 0 });
    if (alan) setTimeout(() => govde.current?.querySelector<HTMLElement>(`[name="${alan}"]`)?.focus(), 0);
  };
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

  const tus = (o: KeyboardEvent) => {
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
    const sinif = `tc-km-alan${a.genis === 'tam' ? ' tc-km-alan-tam' : a.genis === 'yarim' ? ' tc-km-alan-yarim' : ''}`;
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
    return <div key={a.k} className={sinif}>{ic}</div>;
  };

  const adimEksigi = (i: number) => eksik.filter((a) => alanAdimi.get(a.k) === i).length + ekSorun.filter((s) => s.adim === i).length;
  const sorunlar: KmSorun[] = [...eksik.map((a) => ({ metin: `${a.etiket} boş`, adim: alanAdimi.get(a.k) ?? 0, alan: a.k })), ...ekSorun];
  const dolu = zorunluSayisi - eksik.length;
  const adimlarCubugu = [...isAdimlari.map((s) => s.baslik), ...(kontrolVar ? ['Kontrol ve kaydet'] : [])];

  const alt = (
    <>
      <Dugme tur="ikincil" onClick={kapatmayiDene}>Vazgeç</Dugme>
      {gecmis && <Dugme tur="ikincil" simge="clock" onClick={() => gecmisAcikYaz(true)}>Geçmiş</Dugme>}
      {onizleme && <Dugme tur="ikincil" simge="eye" aria-pressed={onizlemeAcik} onClick={() => onizlemeAcikYaz(!onizlemeAcik)}>Önizle</Dugme>}
      <span className="tc-km-bosluk" />
      {!tekAdim && <Dugme tur="ikincil" simge="chev-left" disabled={adim === 0} onClick={() => git(adim - 1)}>Geri</Dugme>}
      {adim < sonAdim && <Dugme simge="chev-right" onClick={() => git(adim + 1)}>İleri</Dugme>}
      <Dugme tur={adim === sonAdim ? 'birincil' : 'ikincil'} yukleniyor={kaydediliyor} onClick={() => void kaydetDene()}>Kaydet</Dugme>
    </>
  );

  return (
    <>
      <Pencere acik kapat={kapatmayiDene} baslik={baslik} tur="yan" alt={alt}>
        <div ref={govde} className="tc-km-form" onKeyDown={tus}>
          {!tekAdim && (
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
          {taslakNotu && (
            <div className="tc-km-not">
              <span>Yarım kalan taslak geri yüklendi.</span>
              <Dugme tur="ikincil" onClick={() => { dYaz(acilis); taslakNotuYaz(false); if (taslakAnahtari) taslakYaz(taslakAnahtari, null); }}>Taslağı sil</Dugme>
            </div>
          )}
          {isAdimlari.map((s, i) => (
            <section key={s.baslik} hidden={i !== adim} className="tc-km-adim">
              {!tekAdim && <h3 className="tc-km-soru">{s.baslik}</h3>}
              {s.ipucu && <p className="tc-km-ipucu">{s.ipucu}</p>}
              <div className="tc-km-alanlar">{alanlar.filter((a) => alanAdimi.get(a.k) === i).sort((x, y) => {
                const K = s.alanlar ?? [];
                const a = K.indexOf(x.k);
                const b = K.indexOf(y.k);
                return (a < 0 ? 999 : a) - (b < 0 ? 999 : b);
              }).map(alanCiz)}</div>
              {s.icerik?.(d, degistir)}
            </section>
          ))}
          {kontrolVar && adim === sonAdim && (
            <section className="tc-km-adim">
              <h3 className="tc-km-soru">Kontrol ve kaydet</h3>
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
