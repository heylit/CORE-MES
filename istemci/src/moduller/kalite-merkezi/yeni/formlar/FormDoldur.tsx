import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CokSatir, Girdi, IsaretKutusu, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { Rozet } from '../../../../ortak/arayuz/Rozet.tsx';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { Damga } from '../KayitListesi.tsx';
import { bugun } from '../kurallar.ts';
import type { FormKaydi } from '../tipler.ts';
import { kisileriHatirla, kmTercihi, useKmKomutu, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import {
  alanAnahtari, dslCoz, formEksikleri, formIlerlemesi, formSonucu, LISTE_YANITLARI, sonucTonu, tabloSatirlari, type DslAlani, type FormIcerigi,
} from './dsl.ts';
import { FormKaydiBelgesi } from './FormBelgesi.tsx';

export interface DoldurulanSablon {
  kod: string;
  ad: string;
  rev: string;
  std: string;
  dsl: string;
  etiket: boolean;
  yurur?: string;
}

interface Ozellikler {
  veri: KmVerisi;
  yetki: KmYetkisi;
  sablon: DoldurulanSablon;
  // Düzenlenen kayıt; yeni kayıtta null. Kayıt kendi tasarım metnini taşır (doldurulduğu revizyon).
  rec: FormKaydi | null;
  kapat: () => void;
}

type Bas = { tarih: string; dolduran: string; bolum: string };
type Tablolar = Record<string, Record<string, string>[]>;

const metin = (v: unknown) => (typeof v === 'string' ? v : '');
const sozluk = (v: unknown): Record<string, string> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {});
const SONUC_TONU = { hata: 'kotu', tamam: 'iyi', uyari: 'uyari' } as const;

// Uygulamanın form doldurma penceresi (openFormFill): kayıt bilgileri, bölüm başına adım, kontrol ve kaydet; geniş ekranda canlı önizleme.
// Taslak her zaman kaydedilir; onaya göndermek için zorunlu alan, bütün maddeler ve "Hayır" yanıtlarının açıklaması gerekir.
export function FormDoldur({ veri, yetki, sablon, rec, kapat }: Ozellikler) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const kimlik = useId();
  const bolumler = useMemo(() => dslCoz(sablon.dsl), [sablon.dsl]);
  const tercih = kmTercihi();
  const [bas, basYaz] = useState<Bas>(() => ({
    tarih: metin(rec?.tarih) || bugun(),
    dolduran: metin(rec?.dolduran) || metin(tercih.dolduran),
    bolum: metin(rec?.bolum) || '',
  }));
  const [icerik, icerikYaz] = useState<FormIcerigi>(() => ({
    veri: { ...(rec?.veri ?? {}) },
    liste: { ...sozluk(rec?.liste) },
    listeNot: { ...sozluk(rec?.listeNot) },
    tablo: Object.fromEntries(bolumler.flatMap((b, si) => (b.tablo ? [[String(si), [...((rec?.tablo as Tablolar | undefined)?.[String(si)] ?? [{}, {}])]]] : []))),
  }));
  const acilis = useRef(JSON.stringify({ bas, icerik }));
  const [adim, adimYaz] = useState(0);
  const [hatali, hataliYaz] = useState<ReadonlySet<string>>(new Set());
  const [onizleme, onizlemeYaz] = useState(false);
  const [soruyor, soruyorYaz] = useState(false);
  const [kaydediliyor, kaydediliyorYaz] = useState(false);

  const adimlar = ['Kayıt bilgileri', ...bolumler.map((b, i) => b.baslik || `Bölüm ${i + 1}`), 'Kontrol ve kaydet'];
  const son = adimlar.length - 1;
  const temiz: FormIcerigi = { ...icerik, tablo: Object.fromEntries(Object.entries(icerik.tablo).map(([k, v]) => [k, tabloSatirlari(v)])) };
  const eksikler = formEksikleri(bolumler, bas, temiz);
  const ilerleme = formIlerlemesi(bolumler, eksikler);
  const sonuc = formSonucu(bolumler, temiz.veri, temiz.liste);
  const kirli = JSON.stringify({ bas, icerik }) !== acilis.current;

  const kayit = (durum: string): Partial<FormKaydi> => ({
    ...(rec ?? {}), kod: sablon.kod, ad: sablon.ad, rev: sablon.rev || '00', std: sablon.std, dsl: sablon.dsl, etiket: sablon.etiket,
    tarih: bas.tarih, dolduran: bas.dolduran, bolum: bas.bolum, veri: temiz.veri, liste: temiz.liste, listeNot: temiz.listeNot, tablo: temiz.tablo, sonuc, durum,
  });

  const git = (i: number, alan?: string) => {
    adimYaz(Math.max(0, Math.min(son, i)));
    if (alan) setTimeout(() => document.querySelector<HTMLElement>(`[data-kimlik="${kimlik}"] [name="${alan}"]`)?.focus(), 0);
  };
  const kapatmayiDene = () => (kirli && !kaydediliyor ? soruyorYaz(true) : kapat());

  const veriYaz = (k: string, v: unknown) => {
    icerikYaz((o) => ({ ...o, veri: { ...o.veri, [k]: v } }));
    if (hatali.has(k)) hataliYaz((h) => new Set([...h].filter((x) => x !== k)));
  };
  const yanitla = (k: string, y: string) => icerikYaz((o) => {
    const listeNot = { ...o.listeNot };
    if (y !== 'Hayır') delete listeNot[k];
    return { ...o, liste: { ...o.liste, [k]: y }, listeNot };
  });
  const notYaz = (k: string, n: string) => icerikYaz((o) => ({ ...o, listeNot: { ...o.listeNot, [k]: n } }));
  const hepsiEvet = (si: number) => icerikYaz((o) => {
    const liste = { ...o.liste };
    bolumler[si]?.liste.forEach((_, mi) => { const k = alanAnahtari(si, mi); if (!liste[k]) liste[k] = 'Evet'; });
    return { ...o, liste };
  });
  const tabloYaz = (si: number, f: (rows: Record<string, string>[]) => Record<string, string>[]) =>
    icerikYaz((o) => ({ ...o, tablo: { ...o.tablo, [String(si)]: f(o.tablo[String(si)] ?? []) } }));

  const kaydet = async (durum: 'Taslak' | 'Onay bekliyor') => {
    if (durum !== 'Taslak' && eksikler.length) {
      hataliYaz(new Set(eksikler.flatMap((e) => (e.alan ? [e.alan] : []))));
      git(son);
      bildir('hata', 'Eksikleri tamamlayın ya da taslak olarak kaydedin.');
      return;
    }
    if (durum === 'Taslak' && !bas.dolduran.trim()) {
      hataliYaz(new Set(['dolduran']));
      git(0, 'dolduran');
      bildir('hata', 'Taslak için en az "Dolduran" girin.');
      return;
    }
    kaydediliyorYaz(true);
    try {
      await komut.kaydet('frm', kayit(durum));
      kisileriHatirla({ dolduran: bas.dolduran, bolum: bas.bolum });
      bildir('tamam', durum === 'Taslak' ? 'Taslak kaydedildi' : 'Kaydedildi ve onaya gönderildi');
      kapat();
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Form kaydedilemedi. Bağlantıyı kontrol edip yeniden deneyin.'));
    } finally {
      kaydediliyorYaz(false);
    }
  };

  const tus = (o: KeyboardEvent) => {
    if ((o.ctrlKey || o.metaKey) && o.key === 'Enter') {
      o.preventDefault();
      if (adim < son) git(adim + 1);
      else void kaydet('Onay bekliyor');
    }
  };

  const adimEksigi = (i: number) => eksikler.filter((e) => e.adim === i).length;
  const hata = (k: string) => (hatali.has(k) ? 'Bu alan zorunlu.' : undefined);

  const alanCiz = (a: DslAlani, si: number, ai: number) => {
    const k = alanAnahtari(si, ai);
    const v = icerik.veri[k];
    const ortak = { etiket: a.etiket, name: k, required: a.zorunlu, hata: hata(k) };
    const sinif = `tc-km-alan${a.tur === 'cokSatir' || a.tur === 'isaretler' ? ' tc-km-alan-tam' : ''}`;
    if (a.tur === 'secim') {
      return <div key={k} className={sinif}><Secim {...ortak} value={metin(v)} onChange={(o) => veriYaz(k, o.target.value)} secenekler={(a.secenekler ?? []).map((s) => ({ deger: s, baslik: s || '—' }))} /></div>;
    }
    if (a.tur === 'isaretler') {
      const secili = Array.isArray(v) ? (v as string[]) : [];
      return (
        <fieldset key={k} className={`tc-km-isaretler ${sinif}`}>
          <legend>{a.etiket}{a.zorunlu ? ' *' : ''}</legend>
          {(a.secenekler ?? []).map((s) => (
            <IsaretKutusu key={s} etiket={s} name={k} checked={secili.includes(s)}
              onChange={(o) => veriYaz(k, o.target.checked ? [...secili, s] : secili.filter((x) => x !== s))} />
          ))}
        </fieldset>
      );
    }
    if (a.tur === 'cokSatir') return <div key={k} className={sinif}><CokSatir {...ortak} value={metin(v)} onChange={(o) => veriYaz(k, o.target.value)} /></div>;
    const tip = a.tur === 'tarih' ? 'date' : a.tur === 'sayi' ? 'number' : 'text';
    return (
      <div key={k} className={sinif}>
        <Girdi {...ortak} type={tip} inputMode={a.tur === 'sayi' ? 'decimal' : undefined} value={v === undefined || v === null ? '' : String(v)}
          list={/parça no/i.test(a.etiket) ? `${kimlik}-parca` : undefined} onChange={(o) => veriYaz(k, o.target.value)} />
      </div>
    );
  };

  const parcalar = useMemo(() => {
    const m = new Map<string, string>();
    [...veri.ncr, ...veri.insp, ...veri.lot].forEach((r) => { if (r.parcaNo && !m.has(r.parcaNo)) m.set(r.parcaNo, r.parcaAdi || ''); });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [veri]);

  const belge = <FormKaydiBelgesi veri={veri} r={kayit(metin(rec?.durum) || 'Taslak')} yurur={sablon.yurur} />;

  const alt = (
    <>
      <Dugme yukleniyor={kaydediliyor} onClick={() => void kaydet('Taslak')}>Taslak kaydet</Dugme>
      <Dugme simge="eye" className="tc-km3-dar" aria-pressed={onizleme} onClick={() => onizlemeYaz(!onizleme)}>{onizleme ? 'Önizlemeyi gizle' : 'Önizle'}</Dugme>
      <span className="tc-km-bosluk" />
      <Dugme simge="chev-left" disabled={adim === 0} onClick={() => git(adim - 1)}>Geri</Dugme>
      {adim < son
        ? <Dugme simge="chev-right" onClick={() => git(adim + 1)}>İleri<span className="tc-km3-genis-metin">: {adimlar[adim + 1]}</span></Dugme>
        : <Dugme tur="birincil" yukleniyor={kaydediliyor} onClick={() => void kaydet('Onay bekliyor')}>Kaydet ve onaya gönder</Dugme>}
    </>
  );

  return (
    <>
      <Pencere acik kapat={kapatmayiDene} baslik={`${sablon.kod} ${sablon.ad}${rec ? ' (düzenleme)' : ''}`} tur="tam" alt={alt}>
        <div className={`tc-km3-doldur${onizleme ? ' tc-km3-onizlemeli' : ''}`} data-kimlik={kimlik} onKeyDown={tus}>
          <div className="tc-km3-doldur-ana">
            <div className="tc-km-form-ust">
              <p className="tc-km-ilerleme">{ilerleme.toplam ? `${ilerleme.tamam} / ${ilerleme.toplam} zorunlu alan ve madde tamamlandı` : 'Zorunlu alan yok'}</p>
              <progress className="tc-km3-cubuk" max={ilerleme.toplam || 1} value={ilerleme.toplam ? ilerleme.tamam : 1} />
              <ol className="tc-km-adimlar">
                {adimlar.map((b, i) => {
                  const n = i < son ? adimEksigi(i) : 0;
                  const tamam = i < son ? n === 0 : eksikler.length === 0;
                  return (
                    <li key={`${b}-${i}`}>
                      <button type="button" aria-current={i === adim ? 'step' : undefined} data-tamam={tamam || undefined} onClick={() => git(i)}>
                        <span className="tc-km-adim-no">{i + 1}</span>{b}{n > 0 && <Rozet ton="uyari">{n}</Rozet>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <section hidden={adim !== 0} className="tc-km-adim">
              <h3 className="tc-km-soru">Kayıt bilgileri</h3>
              <p className="tc-km-ipucu">Formu kimin, ne zaman ve hangi alanda doldurduğu. Adınız bir sonraki formda hatırlanır.</p>
              <div className="tc-km-alanlar">
                <div className="tc-km-alan"><Girdi etiket="Tarih" type="date" name="tarih" required hata={hata('tarih')} value={bas.tarih} onChange={(o) => basYaz({ ...bas, tarih: o.target.value })} /></div>
                <div className="tc-km-alan">
                  <Girdi etiket="Dolduran" name="dolduran" required hata={hata('dolduran')} value={bas.dolduran}
                    onChange={(o) => { basYaz({ ...bas, dolduran: o.target.value }); hataliYaz(new Set()); }} />
                </div>
                <div className="tc-km-alan"><Girdi etiket="Alan / bölüm" name="bolum" value={bas.bolum} onChange={(o) => basYaz({ ...bas, bolum: o.target.value })} /></div>
              </div>
            </section>

            {bolumler.map((b, si) => (
              <section key={si} hidden={adim !== si + 1} className="tc-km-adim">
                <div className="tc-km3-bolum-ust">
                  <h3 className="tc-km-soru">{b.baslik || `Bölüm ${si + 1}`}</h3>
                  {b.liste.length > 0 && <Dugme simge="check" onClick={() => hepsiEvet(si)}>Yanıtsızları "Evet" yap</Dugme>}
                </div>
                {b.alanlar.length > 0 && <div className="tc-km-alanlar">{b.alanlar.map((a, ai) => alanCiz(a, si, ai))}</div>}
                {b.liste.length > 0 && (
                  <div className="tc-km3-maddeler">
                    {b.liste.map((m, mi) => {
                      const k = alanAnahtari(si, mi);
                      const y = icerik.liste[k] ?? '';
                      return (
                        <div key={k} className="tc-km3-madde" data-hayir={y === 'Hayır' || undefined}>
                          <p className="tc-km3-madde-metin">{mi + 1}. {m}</p>
                          <div className="tc-km3-yanitlar" role="radiogroup" aria-label={`Madde ${mi + 1}`}>
                            {LISTE_YANITLARI.map((o) => (
                              <label key={o} className="tc-km3-yanit" data-yanit={o}>
                                <input type="radio" name={`q_${k}`} value={o} checked={y === o} onChange={() => yanitla(k, o)} />
                                <span>{o}</span>
                              </label>
                            ))}
                          </div>
                          {y === 'Hayır' && (
                            <Girdi etiket={`Madde ${mi + 1} açıklaması`} placeholder="Ne bulundu, ne yapıldı? (zorunlu)" value={icerik.listeNot[k] ?? ''}
                              onChange={(o) => notYaz(k, o.target.value)} autoFocus />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {b.tablo && (
                  <div className="tc-km3-tablo">
                    <div className="tc-km-tablo-kap">
                      <table className="tc-km-tablo">
                        <thead><tr>{b.tablo.sutunlar.map((s) => <th key={s} scope="col">{s}</th>)}<th><span className="tc-km3-gizli">Satır</span></th></tr></thead>
                        <tbody>
                          {(icerik.tablo[String(si)] ?? []).map((r, ri) => (
                            <tr key={ri}>
                              {b.tablo!.sutunlar.map((s, ci) => (
                                <td key={s}>
                                  <input className="tc-alan-kutu" aria-label={s} value={r[`c${ci}`] ?? ''}
                                    onChange={(o) => tabloYaz(si, (rows) => rows.map((x, j) => (j === ri ? { ...x, [`c${ci}`]: o.target.value } : x)))} />
                                </td>
                              ))}
                              <td><Dugme tur="tehlike" simge="trash" onClick={() => tabloYaz(si, (rows) => rows.filter((_, j) => j !== ri))}>Satırı sil</Dugme></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Dugme simge="plus" onClick={() => tabloYaz(si, (rows) => [...rows, {}])}>Satır ekle</Dugme>
                  </div>
                )}
              </section>
            ))}

            <section hidden={adim !== son} className="tc-km-adim">
              <h3 className="tc-km-soru">Kontrol ve kaydet</h3>
              <p>Kaydın sonucu: <Damga ton={SONUC_TONU[sonucTonu(sonuc)]}>{sonuc}</Damga></p>
              {eksikler.length
                ? (
                  <div className="tc-km-not tc-km-not-kotu">
                    <p><b>Onaya göndermeden önce {eksikler.length} eksik var.</b> Taslak olarak her zaman kaydedebilirsiniz.</p>
                    <ul className="tc-km-sorunlar">
                      {eksikler.map((e) => <li key={`${e.adim}-${e.metin}`}><span>{e.metin}</span><Dugme onClick={() => git(e.adim, e.alan)}>Düzelt</Dugme></li>)}
                    </ul>
                  </div>
                )
                : <div className="tc-km-not tc-km-not-iyi"><b>Form eksiksiz.</b> Onaya gönderebilirsiniz; onaylanan kayıt kilitlenir.</div>}
            </section>
          </div>
          <aside className="tc-km3-doldur-onizleme" aria-label="Canlı önizleme">
            <p className="tc-km-soluk">Canlı önizleme: yazdıkça güncellenir</p>
            <div className="tc-km-onizleme">{belge}</div>
          </aside>
          <datalist id={`${kimlik}-parca`}>{parcalar.map(([no, ad]) => <option key={no} value={no}>{ad}</option>)}</datalist>
        </div>
      </Pencere>
      <OnayPenceresi acik={soruyor} baslik="Kaydedilmemiş değişiklikler" tehlikeli onayMetni="Kaydetmeden kapat"
        onayla={() => { soruyorYaz(false); kapat(); }} vazgec={() => soruyorYaz(false)}>
        Girdiğiniz bilgiler kaydedilmedi. Pencere kapatılırsa kaybolur.
      </OnayPenceresi>
    </>
  );
}
