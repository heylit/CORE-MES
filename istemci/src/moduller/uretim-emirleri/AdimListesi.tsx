import { useState } from 'react';
import type { AdimDurumuCevabi, ListeKanitiGirdisi, ListeKontrolu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Girdi, IsaretKutusu, Simge } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { DosyaHatasi, dosyaYukle } from '../belge-merkezi/disari.ts';
import { FOTO_KABUL, fotografHazirla } from './foto-hazirla.ts';

// 3249-2 a: Adım Durumu'nun türlü kontrol adımları ve ofisten kanıt. Komutları AdimDurumu.tsx
// gönderir (aynı kanca, aynı "Geri al"); bu dosya yalnız görünüm ve girdi tutar.
type Adim = AdimDurumuCevabi['adimlar'][number];
export type ListeMaddesi = Adim['liste'][number];
type KontrolTuru = ListeKontrolu['tur'];

export const sayiMetni = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
// Ondalık virgül ya da nokta kabul edilir; boş ya da sayı olmayan null'dır.
export const sayiOku = (t: string): number | null => {
  const s = t.trim().replace(/\s/g, '').replace(',', '.');
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
};

const TUR: Readonly<Record<KontrolTuru, { ad: string; simge: SimgeAdi }>> = {
  onay: { ad: 'Onay', simge: 'check' },
  olcum: { ad: 'Ölçüm', simge: 'ruler' },
  foto: { ad: 'Fotoğraf', simge: 'camera' },
  secim: { ad: 'Seçim', simge: 'list' },
};

const sinirMetni = (k: Extract<ListeKontrolu, { tur: 'olcum' }>): string => {
  const b = k.birim === '' ? '' : ` ${k.birim}`;
  if (k.alt !== null && k.ust !== null) return `${sayiMetni(k.alt)}–${sayiMetni(k.ust)}${b}`;
  if (k.alt !== null) return `en az ${sayiMetni(k.alt)}${b}`;
  if (k.ust !== null) return `en çok ${sayiMetni(k.ust)}${b}`;
  return k.birim;
};

// Kanıt isteyen madde (ölçüm, fotoğraf, seçim); kontrolü olmayan eski madde onaydır.
export const kanitGerekir = (m: ListeMaddesi): boolean => m.kontrol !== null && m.kontrol.tur !== 'onay';

// İşaretli maddenin kanıtı: "Geri al" işareti aynı değerle geri koyar. Fotoğraf zaten bağlıdır, ad yeniden kullanılmaz.
export const eskiKanit = (m: ListeMaddesi): ListeKanitiGirdisi | null => {
  if (m.olcum !== null) return { olcum: m.olcum };
  if (m.secim !== null) return { secim: m.secim };
  if (m.fotoOzet !== null) return { foto: { ozet: m.fotoOzet, ad: 'fotograf' } };
  return null;
};

// Sınır dışı farkı ("+0,02"); sınır içi ya da sınırsızda null. Bayrağı sunucu hesaplar, burada yalnız metin.
export const sinirFarki = (k: ListeKontrolu | null, olcum: number | null): string | null => {
  if (k?.tur !== 'olcum' || olcum === null) return null;
  const y = (n: number) => sayiMetni(Math.round(n * 1e6) / 1e6);
  if (k.ust !== null && olcum > k.ust) return `+${y(olcum - k.ust)}`;
  if (k.alt !== null && olcum < k.alt) return `-${y(k.alt - olcum)}`;
  return null;
};

export function KontrolEtiketi({ k }: { k: ListeKontrolu | null }) {
  if (k === null) return null;
  const t = TUR[k.tur];
  return (
    <span className="tc-ad-tur">
      <Simge ad={t.simge} boyut="k" />{t.ad}{k.tur === 'olcum' && sinirMetni(k) !== '' ? ` ${sinirMetni(k)}` : ''}
    </span>
  );
}

function OlcumDegeri({ m }: { m: ListeMaddesi }) {
  if (m.olcum === null || m.kontrol?.tur !== 'olcum') return null;
  const fark = sinirFarki(m.kontrol, m.olcum);
  const birim = m.kontrol.birim === '' ? '' : ` ${m.kontrol.birim}`;
  return (
    <span className={`tc-ad-deger${m.sinirDisi === true ? ' tc-ad-deger-disi' : ''}`}>
      {m.sinirDisi === true && <Simge ad="alert" boyut="k" />}
      {sayiMetni(m.olcum)}{birim}{m.sinirDisi === true ? ` · sınır dışı${fark === null ? '' : ` (${fark})`}` : ''}
    </span>
  );
}

// Seçim düğmeleri tek seçimli gruptur; seçili seçenek yeniden basılınca bir şey olmaz (kaldırmak tik kutusundandır).
function SecimDugmeleri({ m, secenekler, secili, yaz, sec }: {
  m: ListeMaddesi; secenekler: readonly string[]; secili: string | null; yaz: boolean; sec: (s: string) => void;
}) {
  return (
    <span className="tc-ad-secimler" role="radiogroup" aria-label={m.ad}>
      {secenekler.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={secili === s} disabled={!yaz}
          onClick={(o) => { o.stopPropagation(); if (secili !== s) sec(s); }}>{s}</button>
      ))}
    </span>
  );
}

// Açılan satırın kanıt hücresi: değer, seçim düğmeleri ya da fotoğraf; altında kim, ne zaman, nereden.
export function KanitHucresi({ m, yaz, ac, secimYap, fotoAdresi, not }: {
  m: ListeMaddesi; yaz: boolean; ac: () => void; secimYap: (s: string) => void; fotoAdresi: string | null; not: string;
}) {
  const k = m.kontrol;
  return (
    <span className="tc-ad-kanit">
      {k?.tur === 'olcum' && <OlcumDegeri m={m} />}
      {k?.tur === 'secim' && <SecimDugmeleri m={m} secenekler={k.secenekler} secili={m.secim} yaz={yaz} sec={secimYap} />}
      {k?.tur === 'foto' && m.fotoOzet !== null && fotoAdresi !== null && (
        <>
          <img className="tc-ad-kucukresim" src={fotoAdresi} alt={`${m.ad} fotoğrafı`} loading="lazy" />
          <a className="tc-dugme tc-dugme-ikincil tc-dugme-normal" href={fotoAdresi} target="_blank" rel="noopener" onClick={(o) => o.stopPropagation()}>
            <Simge ad="eye" boyut="k" />Görüntüle
          </a>
        </>
      )}
      {k?.tur === 'foto' && m.fotoOzet === null && k.aciklama !== null && <span className="tc-ad-kanit-not">{k.aciklama}</span>}
      <span className="tc-ad-kanit-not">{not}</span>
      {yaz && k?.tur === 'olcum' && <Dugme simge="edit" onClick={(o) => { o.stopPropagation(); ac(); }}>{m.olcum === null ? 'Değer gir' : 'Değiştir'}</Dugme>}
      {yaz && k?.tur === 'foto' && <Dugme simge="camera" onClick={(o) => { o.stopPropagation(); ac(); }}>{m.fotoOzet === null ? 'Fotoğraf ekle' : 'Değiştir'}</Dugme>}
    </span>
  );
}

// Kanıt girişi (pencerede ya da yan pencerede): ölçüm, seçim ya da fotoğraf. Kaydet maddeyi kanıtla işaretler.
export function KanitGirisi({ m, mesgul, gonder, kapat }: {
  m: ListeMaddesi; mesgul: boolean; gonder: (k: ListeKanitiGirdisi) => void; kapat: () => void;
}) {
  const k = m.kontrol;
  if (k?.tur === 'olcum') return <OlcumGirisi m={m} k={k} mesgul={mesgul} gonder={gonder} kapat={kapat} />;
  if (k?.tur === 'secim') return <SecimGirisi m={m} secenekler={k.secenekler} mesgul={mesgul} gonder={gonder} kapat={kapat} />;
  if (k?.tur === 'foto') return <FotoGirisi aciklama={k.aciklama} mesgul={mesgul} gonder={gonder} kapat={kapat} />;
  return <p className="tc-emir-not">Bu madde kanıt istemez.</p>;
}

function OlcumGirisi({ m, k, mesgul, gonder, kapat }: {
  m: ListeMaddesi; k: Extract<ListeKontrolu, { tur: 'olcum' }>; mesgul: boolean; gonder: (k: ListeKanitiGirdisi) => void; kapat: () => void;
}) {
  const [metin, metinYaz] = useState(m.olcum === null ? '' : sayiMetni(m.olcum));
  const deger = sayiOku(metin);
  const fark = sinirFarki(k, deger);
  const kaydet = () => { if (deger !== null) gonder({ olcum: deger }); };
  return (
    <div className="tc-ad-hucre-pencere">
      <p className="tc-emir-not">Hazırlık · kontrol{sinirMetni(k) === '' ? '' : ` · sınır ${sinirMetni(k)}`}</p>
      <Girdi etiket={`Ölçülen değer${k.birim === '' ? '' : ` (${k.birim})`}`} inputMode="decimal" className="tc-ad-sayi" value={metin} autoFocus
        onChange={(e) => metinYaz(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') kaydet(); }}
        {...(metin.trim() !== '' && deger === null ? { hata: 'Sayı girin; ondalık için virgül.' } : {})} />
      {fark !== null && (
        <div className="tc-ad-uyari" role="status">
          <Simge ad="alert" boyut="k" />
          <span><b>Sınır dışı.</b> Değer sınırın {fark.startsWith('+') ? `${fark.slice(1)} üstünde` : `${fark.slice(1)} altında`}. Kaydedilir ve madde işaretlenir; satırda uyarıyla görünür.</span>
        </div>
      )}
      <p className="tc-emir-not">Kayıt "Adım Durumu'ndan" notunu, adınızı ve zamanı taşır.</p>
      <div className="tc-emir-ust">
        <Dugme tur="birincil" simge="check" disabled={deger === null || mesgul} onClick={kaydet}>Kaydet ve işaretle</Dugme>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </div>
    </div>
  );
}

function SecimGirisi({ m, secenekler, mesgul, gonder, kapat }: {
  m: ListeMaddesi; secenekler: readonly string[]; mesgul: boolean; gonder: (k: ListeKanitiGirdisi) => void; kapat: () => void;
}) {
  const [secili, seciliYaz] = useState<string | null>(m.secim);
  return (
    <div className="tc-ad-hucre-pencere">
      <SecimDugmeleri m={m} secenekler={secenekler} secili={secili} yaz={!mesgul} sec={seciliYaz} />
      <p className="tc-emir-not">Tek seçenek işaretlenir. Kayıt "Adım Durumu'ndan" notunu taşır.</p>
      <div className="tc-emir-ust">
        <Dugme tur="birincil" simge="check" disabled={secili === null || mesgul} onClick={() => { if (secili !== null) gonder({ secim: secili }); }}>Kaydet ve işaretle</Dugme>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </div>
    </div>
  );
}

// Fotoğraf önce dosya ucuna yüklenir (özet), işaret komutu bağı kurar. Yükleme bitmeden ya da kesilirse madde işaretlenmez.
function FotoGirisi({ aciklama, mesgul, gonder, kapat }: {
  aciklama: string | null; mesgul: boolean; gonder: (k: ListeKanitiGirdisi) => void; kapat: () => void;
}) {
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const [oran, oranYaz] = useState<number | null>(null);
  const [hazir, hazirYaz] = useState<{ ozet: string; ad: string } | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const yukle = async (d: File | null): Promise<void> => {
    hataYaz(null);
    hazirYaz(null);
    dosyaYaz(d);
    if (d === null) return;
    oranYaz(0);
    try {
      const { veri, ad } = await fotografHazirla(d);
      const ozet = await dosyaYukle(veri, oranYaz);
      hazirYaz({ ozet, ad });
    } catch (e) {
      hataYaz(e instanceof DosyaHatasi ? e.message : `Yükleme kesildi. Bağlantıyı denetleyip "Yeniden dene"ye basın; madde işaretlenmedi. (${hataIletisi(e, 'Hata')})`);
    } finally {
      oranYaz(null);
    }
  };
  return (
    <div className="tc-ad-hucre-pencere">
      {aciklama !== null && <p className="tc-emir-not">{aciklama}</p>}
      <Girdi etiket="Fotoğraf" type="file" accept={FOTO_KABUL} capture="environment" disabled={oran !== null || mesgul}
        onChange={(e) => { void yukle(e.target.files?.[0] ?? null); }}
        ipucu={hazir !== null ? `${hazir.ad} yüklendi.` : 'Bilgisayarda dosya seçilir, telefonda kamera açılır; en çok 10 MB resim. Konum bilgisi silinir.'} />
      {oran !== null && (
        <span className="tc-ad-yukleme">
          <progress max={1} value={oran} aria-label="Yükleniyor" />Yükleniyor %{Math.round(oran * 100)}
        </span>
      )}
      {hata !== null && <div className="tc-ad-uyari tc-ad-uyari-hata" role="alert"><Simge ad="alert" boyut="k" /><span>{hata}</span></div>}
      <div className="tc-emir-ust">
        <Dugme tur="birincil" simge="check" disabled={hazir === null || mesgul} onClick={() => { if (hazir !== null) gonder({ foto: hazir }); }}>Kaydet ve işaretle</Dugme>
        {hata !== null && dosya !== null && <Dugme simge="rotate" onClick={() => { void yukle(dosya); }}>Yeniden dene</Dugme>}
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </div>
    </div>
  );
}

// "Kontrol adımı" penceresinin tür alanları. Taslak metin tutar; kontrolü göndermeden önce taslaktanKontrol çevirir.
export interface KontrolTaslagi { tur: KontrolTuru; alt: string; ust: string; birim: string; aciklama: string; secenekler: string[] }
export const BOS_TASLAK: KontrolTaslagi = { tur: 'onay', alt: '', ust: '', birim: 'mm', aciklama: '', secenekler: ['', ''] };
const AZAMI_SECENEK = 10;

export function taslaktanKontrol(t: KontrolTaslagi, ad: string): { kontrol: ListeKontrolu } | { hata: string } {
  if (t.tur === 'onay') return { kontrol: { tur: 'onay' } };
  if (t.tur === 'foto') return { kontrol: { tur: 'foto', aciklama: t.aciklama.trim() === '' ? null : t.aciklama.trim().slice(0, 120) } };
  if (t.tur === 'olcum') {
    const alt = t.alt.trim() === '' ? null : sayiOku(t.alt);
    const ust = t.ust.trim() === '' ? null : sayiOku(t.ust);
    if ((t.alt.trim() !== '' && alt === null) || (t.ust.trim() !== '' && ust === null)) return { hata: 'Sınırlar sayı olmalı; ondalık için virgül.' };
    if (alt !== null && ust !== null && alt > ust) return { hata: 'Alt sınır üst sınırdan büyük.' };
    return { kontrol: { tur: 'olcum', ad: ad.trim().slice(0, 60), alt, ust, birim: t.birim.trim().slice(0, 12) } };
  }
  const secenekler = t.secenekler.map((s) => s.trim()).filter((s) => s !== '');
  if (secenekler.length < 2) return { hata: 'Seçimde en az iki seçenek olur.' };
  if (new Set(secenekler.map((s) => s.toLocaleLowerCase('tr'))).size !== secenekler.length) return { hata: 'Seçenekler birbirinden farklı olmalı.' };
  return { kontrol: { tur: 'secim', secenekler } };
}

export function KontrolAlanlari({ t, degistir, hata }: { t: KontrolTaslagi; degistir: (t: KontrolTaslagi) => void; hata: string | null }) {
  const yaz = (p: Partial<KontrolTaslagi>) => degistir({ ...t, ...p });
  return (
    <>
      <div className="tc-ad-turler" role="radiogroup" aria-label="Kontrol türü">
        {(Object.keys(TUR) as KontrolTuru[]).map((tur) => (
          <button key={tur} type="button" role="radio" aria-checked={t.tur === tur} onClick={() => yaz({ tur })}>
            <Simge ad={TUR[tur].simge} boyut="k" />{TUR[tur].ad}
          </button>
        ))}
      </div>
      {t.tur === 'olcum' && (
        <div className="tc-ad-sinirlar">
          <Girdi etiket="Alt sınır" inputMode="decimal" className="tc-ad-sayi" value={t.alt} onChange={(e) => yaz({ alt: e.target.value })} />
          <Girdi etiket="Üst sınır" inputMode="decimal" className="tc-ad-sayi" value={t.ust} onChange={(e) => yaz({ ust: e.target.value })} />
          <Girdi etiket="Birim" maxLength={12} value={t.birim} onChange={(e) => yaz({ birim: e.target.value })} />
        </div>
      )}
      {t.tur === 'foto' && (
        <Girdi etiket="Ne görünsün (açıklama, isteğe bağlı)" maxLength={120} value={t.aciklama} onChange={(e) => yaz({ aciklama: e.target.value })}
          ipucu="Fotoğraf terminalden ya da buradan eklenir; en çok 10 MB resim." />
      )}
      {t.tur === 'secim' && (
        <fieldset className="tc-ad-secenekler">
          <legend>Seçenekler (2-10)</legend>
          {t.secenekler.map((s, i) => (
            <span key={i} className="tc-ad-secenek">
              <Girdi etiket={`Seçenek ${String(i + 1)}`} maxLength={60} value={s}
                onChange={(e) => yaz({ secenekler: t.secenekler.map((x, j) => (j === i ? e.target.value : x)) })} />
              <Dugme simge="x" aria-label={`Seçenek ${String(i + 1)} sil`} disabled={t.secenekler.length <= 2}
                onClick={() => yaz({ secenekler: t.secenekler.filter((_, j) => j !== i) })} />
            </span>
          ))}
          <span>
            <Dugme simge="plus" disabled={t.secenekler.length >= AZAMI_SECENEK} onClick={() => yaz({ secenekler: [...t.secenekler, ''] })}>Seçenek</Dugme>
          </span>
          <small className="tc-emir-not">Operatör ve ofis tek seçenek işaretler.</small>
        </fieldset>
      )}
      {hata !== null && <p className="tc-ad-uyari tc-ad-uyari-hata" role="alert"><Simge ad="alert" boyut="k" />{hata}</p>}
    </>
  );
}

// "Şablona da ekle" (Risk K2): yalnız talimat yazma yetkisi de olana ve adımın tipinin emre gelen şablonu varsa görünür; varsayılan kapalı.
export function SablonSecenegi({ sablon, secili, degistir }: { sablon: { kod: string; ad: string }; secili: boolean; degistir: (s: boolean) => void }) {
  return (
    <div className="tc-ad-sablon">
      <IsaretKutusu etiket="Şablona da ekle" checked={secili} onChange={(e) => degistir(e.target.checked)} />
      <small className="tc-emir-not">
        {sablon.kod} şablonuna ({sablon.ad}) yeni sürüm olarak eklenir; bu tipin sonraki bütün emirlerine gelir. Açık emirler değişmez.
      </small>
    </div>
  );
}
