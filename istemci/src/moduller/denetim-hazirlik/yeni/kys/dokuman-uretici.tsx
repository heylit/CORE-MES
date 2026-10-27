import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CokSatir, Dugme, Girdi, Rozet, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { guvenliAd, htmlKacis, indir, yazdir } from '../disa-aktar.ts';
import { KYSB } from '../icerik/kys-yapi.ts';
import { tarihMetni } from '../tarih.ts';
import type { Cihaz, Kys, Profil, UretilenDokuman } from '../tipler.ts';
import {
  bloklar, bolumMetni, bosUretilen, butunDokumanlar, DGROUPS, dokumanBul, dokumanDurumu, dokumanKullaniliyor, duzenleyiciAc, duzenleyiciAcikMi,
  kodlariEksik, kodOneki, sablonKodlariniVer, STAMPS, turAdi, uretilen, yayinla, type Blok, type DokumanSablonu, type SatirParcasi,
} from './dokuman-metni.ts';
import { SemaCizimi } from './sema-cizim.tsx';
import { akisSemasi } from './semalar.ts';
import { Bolum, htmlUret, KISI_LISTESI, KysBaglantisi, rolSatiri, useKysGecisi } from './ortak.tsx';

// Doküman üretici (prototip kysUret, docEditor, docFull, printDocs, wordDoc): kütüphane, düzenleyici, kâğıt görünümü, basım ve Word.

const LOGO_SINIRI = 250000;
const DURUM_TONU = { yok: 'pasif', taslak: 'uyari', yayin: 'tamam' } as const;

export function DokumanUretici() {
  const d = useDenetim();
  const [gecis, gecisYaz] = useKysGecisi();
  // Başka görünümden gelen doküman (git kys dokuman, prototip docOpen): bir kez açılır, ekran durumundan silinir.
  const disaridan = d.ekran.kys.dok;
  useEffect(() => {
    if (!disaridan) return;
    gecisYaz({ dokuman: disaridan });
    d.ekranDegistir((e) => { delete e.kys.dok; });
  }, [disaridan]);
  const acik = gecis.dokuman ? dokumanBul(d.profil.kys, gecis.dokuman) : undefined;
  return acik
    ? <Duzenleyici key={acik.id} dok={acik} kapat={() => { gecisYaz({ dokuman: '' }); }} />
    : <Kutuphane ac={(id) => { gecisYaz({ dokuman: id }); }} />;
}

// --- Kâğıt (docFull): ekranda düzenlenebilir, basımda ve Word'de salt okunur. Bağlamsız çizilir (htmlUret ayrık kökte çizer). ---

interface KagitOzellikleri {
  dok: DokumanSablonu;
  g: UretilenDokuman;
  profil: Profil;
  cihazlar: readonly Cihaz[];
  word?: boolean;
  duzen?: { acik: string; ac: (s: string) => void; yaz: (s: string, v: string) => void; sifirla: (s: string) => void } | null;
}

function Parcalar({ p }: { p: SatirParcasi[] }) {
  return <>{p.map((x, i) => (x.kalin ? <b key={i}>{x.t}</b> : <span key={i}>{x.t}</span>))}</>;
}

function Bloklar({ metin, K, word }: { metin: string; K: Kys; word: boolean }) {
  const ciz = (b: Blok, i: number): ReactNode => {
    switch (b.tur) {
      case 'baslik': return <h4 key={i}><Parcalar p={b.satir} /></h4>;
      case 'madde': return <ul key={i}>{b.satirlar.map((s, j) => <li key={j}><Parcalar p={s} /></li>)}</ul>;
      case 'sira': return <ol key={i}>{b.satirlar.map((s, j) => <li key={j}><Parcalar p={s} /></li>)}</ol>;
      case 'tablo':
        return (
          <table key={i} className="tc-dhk-dtablo">
            <thead><tr>{b.bas.map((c, j) => <th key={j}><Parcalar p={c} /></th>)}</tr></thead>
            <tbody>{b.satirlar.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c.length ? <Parcalar p={c} /> : ' '}</td>)}</tr>)}</tbody>
          </table>
        );
      case 'paragraf': return <p key={i}>{b.satirlar.map((s, j) => <span key={j}>{j > 0 && <br />}<Parcalar p={s} /></span>)}</p>;
      case 'akis': {
        if (word) return <p key={i}><i>Akış şeması dokümanın PDF / basılı sürümünde yer alır.</i></p>;
        const sema = akisSemasi(b.anahtar, rolSatiri(K));
        return sema ? <div key={i} className="tc-dhk-dakis"><SemaCizimi sema={sema} /></div> : null;
      }
    }
  };
  return <div className="tc-dhk-dbolum-govde">{bloklar(metin).map(ciz)}</div>;
}

export function Kagit({ dok, g, profil, cihazlar, word = false, duzen = null }: KagitOzellikleri) {
  const K = profil.kys;
  const P = profil.profile;
  const firma = P.firma;
  let n = 0;
  const damga = K.stamp === 'kontrolsuz' || !K.stamp ? 'Basılı kopyalar kontrolsüzdür; güncel sürüm doküman ana listesindedir.' : STAMPS[K.stamp];
  const gecmis = g.hist.length ? g.hist : g.pub ? [{ rev: '00', date: g.pub, note: 'İlk yayın' }] : [];
  return (
    <div className="tc-dhk-pdok" data-yatay={dok.land ? true : undefined}>
      <table className="tc-dhk-dsarma">
        <thead><tr><td>
          <table className="tc-dhk-dbas">
            <tbody>
              <tr>
                <td rowSpan={4} className="tc-dhk-dbas-logo">{K.logo && !word ? <img src={K.logo} alt="" /> : <b>{firma || 'Firma'}</b>}</td>
                <td rowSpan={4} className="tc-dhk-dbas-ad"><b>{dok.name.toLocaleUpperCase('tr')}</b><small>{turAdi(dok.type)}</small></td>
                <td className="tc-dhk-dbas-k">Doküman No</td><td className="tc-dhk-dbas-v">{g.code || '—'}</td>
              </tr>
              <tr><td className="tc-dhk-dbas-k">Yayın Tarihi</td><td className="tc-dhk-dbas-v">{g.pub ? tarihMetni(g.pub) : '—'}</td></tr>
              <tr><td className="tc-dhk-dbas-k">Revizyon No</td><td className="tc-dhk-dbas-v">{g.rev || '00'}</td></tr>
              <tr><td className="tc-dhk-dbas-k">Revizyon Tarihi</td><td className="tc-dhk-dbas-v">{g.date && g.rev !== '00' ? tarihMetni(g.date) : '—'}</td></tr>
            </tbody>
          </table>
        </td></tr></thead>
        <tbody><tr><td className="tc-dhk-dicerik">
          {duzen && dok.hint && <div className="tc-dhk-dipucu"><Simge ad="help" boyut="k" /><span>{dok.hint}</span></div>}
          {dok.secs.map((s) => {
            const bas = s[1] ? (dok.nosec ? s[1] : `${String(++n)}. ${s[1]}`) : '';
            const duzenlendi = typeof g.secs[s[0]] === 'string';
            const metin = bolumMetni(dok, s, { profil, cihazlar });
            const acik = duzen?.acik === s[0];
            return (
              <section key={s[0]} className="tc-dhk-dbolum" data-duzenleniyor={acik || undefined}>
                {bas && <h3>{bas}</h3>}
                {duzen && acik ? (
                  <>
                    <CokSatir etiket={`${s[1] || 'Bölüm'} metni`} className="tc-dhk-dmetin" value={metin} autoFocus
                      rows={Math.min(24, Math.max(5, metin.split('\n').length + 2))} onChange={(e) => { duzen.yaz(s[0], e.target.value); }} />
                    <p className="tc-dhk-dyardim">
                      Biçim: &quot;- &quot; madde, &quot;1. &quot; numaralı adım, &quot;| a | b |&quot; tablo, &quot;**kalın**&quot;, &quot;## alt başlık&quot;, &quot;[ ]&quot; kutucuk. Boş satır paragraf ayırır.
                    </p>
                    <div className="tc-dhk-arac">
                      <Dugme tur="birincil" simge="check" onClick={() => { duzen.ac(''); }}>Bitti</Dugme>
                      {duzenlendi && <Dugme onClick={() => { duzen.sifirla(s[0]); }}>Varsayılana döndür</Dugme>}
                    </div>
                  </>
                ) : (
                  <>
                    <Bloklar metin={metin} K={K} word={word} />
                    {duzen && !dok.dyn && (
                      <Dugme className="tc-dhk-dduzenle" simge="edit" aria-label={`${s[1] || 'Bölüm'}: düzenle`} onClick={() => { duzen.ac(s[0]); }}>
                        {duzenlendi ? 'Düzenlendi' : 'Düzenle'}
                      </Dugme>
                    )}
                  </>
                )}
              </section>
            );
          })}
          {dok.g !== 'form' && (
            <table className="tc-dhk-dimza">
              <tbody>
                <tr><th>Hazırlayan</th><th>Onaylayan</th></tr>
                <tr><td>{g.prep}</td><td>{g.appr}</td></tr>
                <tr><td className="tc-dhk-dimza-yer">İmza / Tarih</td><td className="tc-dhk-dimza-yer">İmza / Tarih</td></tr>
              </tbody>
            </table>
          )}
          {gecmis.length > 0 && (
            <div className="tc-dhk-dgecmis">
              <h3>Revizyon geçmişi</h3>
              <table className="tc-dhk-dtablo">
                <thead><tr><th>Rev.</th><th>Tarih</th><th>Açıklama</th></tr></thead>
                <tbody>{gecmis.map((r, i) => <tr key={i}><td>{r.rev}</td><td>{tarihMetni(r.date)}</td><td>{r.note}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </td></tr></tbody>
        <tfoot><tr><td>
          <div className="tc-dhk-dalt">
            <span>{firma}</span>
            <span>{g.code ? `${g.code} · Rev. ${g.rev || '00'}` : ''}</span>
            <span>{damga}</span>
          </div>
        </td></tr></tfoot>
      </table>
    </div>
  );
}

// printDocs: seçilen dokümanlar açık temada, damga filigranıyla yazdırma alanına çizilir.
function basimHtml(dokumanlar: readonly DokumanSablonu[], profil: Profil, cihazlar: readonly Cihaz[]): string {
  const K = profil.kys;
  return htmlUret(
    <div className="tc-dhk-baski" data-theme="light">
      {K.stamp && <div className="tc-dhk-filigran">{STAMPS[K.stamp]}</div>}
      {dokumanlar.map((x) => <Kagit key={x.id} dok={x} g={K.gd[x.id] ?? bosUretilen()} profil={profil} cihazlar={cihazlar} />)}
    </div>,
  );
}

// wordDoc: Word'ün açtığı HTML belgesi; şema yerine not, logo yerine firma adı. Renkler Word'e özgü adlandırılmış renklerdir.
const WORD_CSS = 'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:black}table{border-collapse:collapse;width:100%}'
  + 'td,th{border:1px solid black;padding:4pt 6pt;vertical-align:top}.tc-dhk-dbas-ad{text-align:center}.tc-dhk-dbas-ad b{font-size:13pt}'
  + '.tc-dhk-dbas-ad small{display:block;font-size:9pt}.tc-dhk-dbas-k{font-size:9pt;width:22%}.tc-dhk-dbas-v{font-size:9pt;width:18%}'
  + 'h3{font-size:12pt;margin:14pt 0 6pt}h4{font-size:11pt}th{background:whitesmoke;text-align:left}.tc-dhk-dalt span{margin-right:18pt;font-size:8pt}'
  + '.tc-dhk-dimza td{height:40pt}';
function wordMetni(dok: DokumanSablonu, profil: Profil, cihazlar: readonly Cihaz[]): string {
  const g = profil.kys.gd[dok.id] ?? bosUretilen();
  const govde = htmlUret(<Kagit dok={dok} g={g} profil={profil} cihazlar={cihazlar} word />);
  return '\ufeff<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    + `<head><meta charset="utf-8"><title>${htmlKacis(dok.name)}</title><style>${WORD_CSS}</style></head><body>${govde}</body></html>`;
}

// --- Kütüphane ---

function Kutuphane({ ac }: { ac: (id: string) => void }) {
  const d = useDenetim();
  const K = d.profil.kys;
  const yaz = d.yetki.yazabilir;
  const [secili, seciliYaz] = useState<Record<string, true>>({});
  const logoGirdisi = useRef<HTMLInputElement>(null);
  const dokumanlar = butunDokumanlar(K);
  const sec = dokumanlar.filter((x) => secili[x.id]);
  const sayi = { yok: 0, taslak: 0, yayin: 0 };
  for (const x of dokumanlar) if (dokumanKullaniliyor(x, d.profil, d.program)) sayi[dokumanDurumu(K, x.id).k]++;
  const as9100 = dokumanKullaniliyor({ id: '', type: '', name: '', bl: '', g: 'as', secs: [] }, d.profil, d.program);

  // Kütüphane açılınca kodu olmayan şablonlara sıradaki kod verilir (prototip kysUret).
  useEffect(() => {
    if (yaz && kodlariEksik(K)) d.degistir(null, (t) => { sablonKodlariniVer(t.kys); });
  // Yalnız açılışta.
  }, []);

  const logoSec = (f: File | undefined) => {
    if (!f) return;
    if (f.size > LOGO_SINIRI) { d.bildir("Logo 250 KB'tan küçük olmalı", { ton: 'hata' }); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const v = typeof fr.result === 'string' ? fr.result : '';
      if (/^data:image\//.test(v)) d.degistir('Logo', (t) => { t.kys.logo = v; }, { bildirim: 'Logo eklendi' });
    };
    fr.readAsDataURL(f);
  };

  return (
    <>
      <Bolum baslik="Doküman üretici ve basım" simge="printer" sag={(
        <div className="tc-dhk-cipler">
          <Rozet ton="tamam">{`${String(sayi.yayin)} yürürlükte`}</Rozet>
          <Rozet ton="uyari">{`${String(sayi.taslak)} taslak`}</Rozet>
          <Rozet ton="pasif">{`${String(sayi.yok)} oluşturulmadı`}</Rozet>
        </div>
      )}>
        <p className="tc-dhk-not">
          Şablonlar firma bilgileri, görev tanımları, süreçler ve doküman kodlarıyla otomatik doldurulur. Açıp bölümleri düzenleyin, &quot;Yürürlüğe al&quot; ile
          yayınlayın; doküman ana listeye ve ilgili yapı taşına işlenir. Prosedürler ISO 9001:2015 şartlarına göre hazırlanmış başlangıç metinleridir; firmanızın
          gerçek uygulamasına göre düzenleyin.
        </p>
        <div className="tc-dhk-form">
          <Secim etiket="Basım damgası" value={K.stamp} disabled={!yaz}
            secenekler={(Object.keys(STAMPS) as Kys['stamp'][]).map((k) => ({ deger: k, baslik: STAMPS[k] }))}
            onChange={(e) => { const v = e.target.value as Kys['stamp']; d.degistir(null, (t) => { t.kys.stamp = v; }); }} />
          <div className="tc-dhk-alan">
            <span className="tc-dhk-etiket">Logo (başlıkta görünür)</span>
            <div className="tc-dhk-arac">
              {K.logo && <img src={K.logo} alt="Logo" className="tc-dhk-logo" />}
              {yaz && (K.logo
                ? <Dugme onClick={() => { d.degistir('Logo', (t) => { t.kys.logo = ''; }, { bildirim: 'Logo kaldırıldı' }); }}>Kaldır</Dugme>
                : <Dugme simge="upload" onClick={() => { if (logoGirdisi.current) { logoGirdisi.current.value = ''; logoGirdisi.current.click(); } }}>Logo yükle</Dugme>)}
              {!K.logo && !yaz && <span className="tc-dhk-soluk">Logo yok</span>}
              <input ref={logoGirdisi} type="file" hidden aria-label="Logo dosyası" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={(e) => { logoSec(e.target.files?.[0]); }} />
            </div>
          </div>
          <div className="tc-dhk-alan">
            <span className="tc-dhk-etiket">Çoklu basım</span>
            <div className="tc-dhk-arac">
              <Dugme onClick={() => {
                const y: Record<string, true> = {};
                for (const x of dokumanlar) if (dokumanDurumu(K, x.id).k === 'yayin') y[x.id] = true;
                if (!Object.keys(y).length) d.bildir('Yürürlükte doküman yok', { ton: 'bilgi' });
                seciliYaz(y);
              }}>Yürürlüktekileri seç</Dugme>
              <Dugme tur="birincil" simge="printer" disabled={!sec.length}
                onClick={() => { yazdir(basimHtml(sec, d.profil, d.cihazlar), `${d.profil.profile.firma || 'KYS'} dokümanları`); }}>
                {`Seçilenleri yazdır (${String(sec.length)})`}
              </Dugme>
            </div>
          </div>
        </div>
      </Bolum>
      {DGROUPS.map(([gk, gad]) => {
        const ds = dokumanlar.filter((x) => x.g === gk);
        if (!ds.length && gk !== 'surec') return null;
        return (
          <Bolum key={gk} baslik={gad} simge="file" sag={gk === 'as' && !as9100 ? <span className="tc-dhk-soluk">Firma AS9100 kullanmıyorsa isteğe bağlı</span> : undefined}>
            {!ds.length && (
              <p className="tc-dhk-not">Süreçler sekmesinde süreç tanımladığınızda her süreç için süreç kartı burada oluşur. <KysBaglantisi hedef="surec" /></p>
            )}
            <ul className="tc-dhk-kutuphane">
              {ds.map((x) => {
                const s = dokumanDurumu(K, x.id);
                const g = K.gd[x.id];
                const bl = x.bl ? KYSB.find((b) => b.id === x.bl)?.c ?? '' : '';
                return (
                  <li key={x.id} className="tc-dhk-dokuman" data-durum={s.k} data-kapali={dokumanKullaniliyor(x, d.profil, d.program) ? undefined : true}>
                    <label className="tc-dhk-dsec" title="Toplu basım için seç">
                      <input type="checkbox" checked={!!secili[x.id]} aria-label={`${x.name}: basım için seç`}
                        onChange={(e) => {
                          const v = e.target.checked;
                          seciliYaz((o) => { const y = { ...o }; if (v) y[x.id] = true; else delete y[x.id]; return y; });
                        }} />
                    </label>
                    <button type="button" className="tc-dhk-dac" onClick={() => { ac(x.id); }}>
                      <span className="tc-dhk-dkod mono">{g?.code || `${kodOneki(K)}-${x.type}-···`}</span>
                      <b>{x.name}</b>
                      <small><Rozet ton={DURUM_TONU[s.k]}>{s.t}</Rozet>{bl && ` · ${bl}`}{x.dyn ? ' · otomatik' : ''}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Bolum>
        );
      })}
    </>
  );
}

// --- Düzenleyici ---

function Duzenleyici({ dok, kapat }: { dok: DokumanSablonu; kapat: () => void }) {
  const d = useDenetim();
  const K = d.profil.kys;
  const yaz = d.yetki.yazabilir;
  const g = K.gd[dok.id] ?? bosUretilen();
  const s = dokumanDurumu(K, dok.id);
  const bl = dok.bl ? KYSB.find((b) => b.id === dok.bl) : undefined;
  const [bolum, bolumYaz] = useState('');
  const [rev, revYaz] = useState<string | null>(null);

  // Açılışta kod, taslak durumu, hazırlayan ve onaylayan atanır (prototip docEditor); salt okurda kayda yazılmaz.
  useEffect(() => {
    if (yaz && !duzenleyiciAcikMi(K, dok)) d.degistir(null, (t) => { duzenleyiciAc(t.kys, dok); });
  // Yalnız açılışta.
  }, []);

  const meta = (ad: 'code' | 'rev' | 'prep' | 'appr', v: string) => {
    const x = v.slice(0, 100);
    d.degistir(null, (t) => { uretilen(t.kys, dok.id)[ad] = x; });
  };
  const sonrakiRev = () => { const n = parseInt(g.rev, 10); return String(Number.isNaN(n) ? 1 : n + 1).padStart(2, '0'); };
  const surecAdi = dok.g === 'surec' ? 'Süreçler' : dok.g === 'gorev' ? 'Görev tanımları' : 'KYS';

  return (
    <>
      <div className="tc-dhk-kart tc-dhk-dcubuk">
        <Dugme simge="back" onClick={kapat}>Kütüphane</Dugme>
        <div className="tc-dhk-dcubuk-ad">
          <b>{dok.name}</b>
          <small><Rozet ton={DURUM_TONU[s.k]}>{s.t}</Rozet>{bl && ` · Yapı taşı: ${bl.c} ${bl.n}`}</small>
        </div>
        <div className="tc-dhk-arac">
          <Dugme tur="birincil" simge="printer" onClick={() => { yazdir(basimHtml([dok], d.profil, d.cihazlar), dok.name); }}>Yazdır / PDF</Dugme>
          <Dugme simge="download" onClick={() => {
            indir(`${guvenliAd(`${g.code || dok.type}-${dok.name}`)}.doc`, wordMetni(dok, d.profil, d.cihazlar), 'application/msword');
            d.bildir('Word dosyası indirildi');
          }}>Word</Dugme>
        </div>
      </div>
      <section className="tc-dhk-kart">
        <div className="tc-dhk-form">
          <Girdi etiket="Doküman no" value={g.code} readOnly={!yaz} onChange={(e) => { meta('code', e.target.value); }} />
          <Girdi etiket="Revizyon" value={g.rev} maxLength={6} readOnly={!yaz} onChange={(e) => { meta('rev', e.target.value); }} />
          <Girdi etiket="Hazırlayan" value={g.prep} placeholder="Ad soyad, görev" list={KISI_LISTESI} readOnly={!yaz} onChange={(e) => { meta('prep', e.target.value); }} />
          <Girdi etiket="Onaylayan" value={g.appr} placeholder="Ad soyad, görev" list={KISI_LISTESI} readOnly={!yaz} onChange={(e) => { meta('appr', e.target.value); }} />
        </div>
        <div className="tc-dhk-arac">
          {yaz && g.st !== 'yayin' && (
            <Dugme tur="birincil" simge="check" onClick={() => {
              d.degistir('Yürürlüğe alma', (t) => { yayinla(t.kys, dok, ''); }, { bildirim: `${g.code} yürürlüğe alındı; ana listeye işlendi` });
            }}>Yürürlüğe al</Dugme>
          )}
          {yaz && g.st === 'yayin' && (rev === null
            ? <Dugme simge="rotate" onClick={() => { revYaz(''); }}>Revizyon yap</Dugme>
            : (
              <form className="tc-dhk-arac" aria-label="Revizyon" onSubmit={(e) => {
                e.preventDefault();
                const not = rev.trim() || 'Revizyon';
                d.degistir('Revizyon', (t) => { yayinla(t.kys, dok, not); }, { bildirim: `Rev. ${sonrakiRev()} yayınlandı` });
                revYaz(null);
              }}>
                <Girdi etiket="Revizyon açıklaması" placeholder="Ne değişti?" value={rev} autoFocus onChange={(e) => { revYaz(e.target.value); }} />
                <Dugme tur="birincil" type="submit">Revizyonu yayınla</Dugme>
                <Dugme onClick={() => { revYaz(null); }}>Vazgeç</Dugme>
              </form>
            ))}
          {yaz && Object.keys(g.secs).length > 0 && (
            <Dugme onClick={() => {
              bolumYaz('');
              d.degistir('Doküman varsayılana', (t) => { uretilen(t.kys, dok.id).secs = {}; }, { bildirim: 'Tüm bölümler varsayılana döndü' });
            }}>Tüm bölümleri varsayılana döndür</Dugme>
          )}
          {dok.dyn ? <span className="tc-dhk-soluk">{`Bu doküman ${surecAdi} verilerinden otomatik üretilir; içeriği oradan güncelleyin.`}</span> : null}
        </div>
      </section>
      <div className="tc-dhk-kagit-yeri">
        <div className="tc-dhk-kagit" data-theme="light">
          <Kagit dok={dok} g={g} profil={d.profil} cihazlar={d.cihazlar} duzen={yaz ? {
            acik: bolum,
            ac: bolumYaz,
            yaz: (k, v) => { d.degistir(null, (t) => { uretilen(t.kys, dok.id).secs[k] = v; }); },
            sifirla: (k) => { bolumYaz(''); d.degistir('Bölüm varsayılana', (t) => { delete uretilen(t.kys, dok.id).secs[k]; }, { bildirim: 'Bölüm varsayılana döndü' }); },
          } : null} />
        </div>
      </div>
    </>
  );
}
