import { Belge, Imza, kutu } from '../Belge.tsx';
import { trd } from '../bicim.ts';
import { D8 } from '../sabitler.ts';
import type { FormKaydi } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';
import { BOS_FORMLAR, type BosEk } from './bos-formlar.ts';
import { alanAnahtari, dslCoz, formSonucu, LISTE_YANITLARI, type DslBolumu } from './dsl.ts';
import type { ListedekiForm } from './sablonlar.ts';

type Ayar = Pick<KmVerisi, 'ayarlar'>;

// Uygulamanın docHead'i. Kayıt belgesinde revizyon kaydın doldurulduğu revizyondur (şablonun bugünkü revizyonu değil).
export function FormBasi({ veri, kod, ad, rev, yurur }: { veri: Ayar; kod: string; ad: string; rev?: string; yurur?: string }) {
  const g = veri.ayarlar;
  return (
    <table className="dh">
      <tbody>
        <tr>
          <td className="dh-f" rowSpan={2}><b>{g.firma || 'FİRMA ADI'}</b>{g.adres && <><br /><small>{g.adres}</small></>}</td>
          <td className="dh-t" rowSpan={2}>{ad}</td>
          <td className="dh-m">Doküman no: <b>{kod}</b></td>
        </tr>
        <tr><td className="dh-m">Rev: <b>{rev || '00'}</b> | Yürürlük: {yurur ? trd(yurur) : '—'}</td></tr>
      </tbody>
    </table>
  );
}

export interface KayitIcerigi {
  veri?: Record<string, unknown>;
  liste?: Record<string, string>;
  listeNot?: Record<string, string>;
  tablo?: Record<string, Record<string, string>[]>;
}

const kutular = (secenekler: readonly string[], secili?: (s: string) => boolean) =>
  secenekler.map((o) => `${kutu(secili?.(o) ?? false)} ${o}`).join('   ');

// Uygulamanın secPrint'i: bölüm başlığı, alanlar, kontrol maddeleri (Evet / Hayır / UD), tablo. Kayıt yoksa boş form.
export function BolumBaskisi({ b, si, kayit }: { b: DslBolumu; si: number; kayit: KayitIcerigi | null }) {
  const deger = (k: string) => kayit?.veri?.[k];
  return (
    <>
      {b.baslik && <h3>{b.baslik}</h3>}
      {b.alanlar.length > 0 && (
        <table>
          <tbody>
            {b.alanlar.map((a, ai) => {
              const v = deger(alanAnahtari(si, ai));
              let hucre: string;
              if (!kayit) hucre = a.tur === 'secim' || a.tur === 'isaretler' ? kutular((a.secenekler ?? []).filter(Boolean)) : '';
              else if (a.tur === 'isaretler') hucre = kutular(a.secenekler ?? [], (o) => Array.isArray(v) && v.includes(o));
              else if (a.tur === 'tarih') hucre = v ? trd(String(v)) : '';
              else hucre = v === undefined || v === null ? '' : String(v);
              return (
                <tr key={`${a.etiket}-${ai}`}>
                  <th className="tc-km3-belge-ad">{a.etiket}</th>
                  <td className={!kayit && a.tur === 'cokSatir' ? 'tc-km3-belge-bos-uzun' : 'tc-km3-uzun'}>{hucre}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {b.liste.length > 0 && (
        <table>
          <thead><tr><th>#</th><th>Kontrol maddesi</th><th>Evet</th><th>Hayır</th><th>UD</th></tr></thead>
          <tbody>
            {b.liste.map((m, mi) => {
              const k = alanAnahtari(si, mi);
              const y = kayit?.liste?.[k] ?? '';
              const not = kayit?.listeNot?.[k];
              return (
                <tr key={`${m}-${mi}`}>
                  <td>{mi + 1}</td>
                  <td>{m}{not && <><br /><small>Bulgu: {not}</small></>}</td>
                  {LISTE_YANITLARI.map((o) => <td key={o} className="tc-km3-belge-isaret">{y === o ? '☒' : kayit ? '' : '☐'}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {b.tablo && (() => {
        const satirlar = kayit ? (kayit.tablo?.[String(si)] ?? []) : Array.from({ length: 6 }, () => ({}));
        const L: Record<string, string>[] = satirlar.length ? satirlar : [{}];
        return (
          <table>
            <thead><tr>{b.tablo.sutunlar.map((s) => <th key={s}>{s}</th>)}</tr></thead>
            <tbody>{L.map((r, ri) => <tr key={ri}>{b.tablo!.sutunlar.map((s, ci) => <td key={s} className="tc-km3-belge-satir">{r[`c${ci}`] ?? ''}</td>)}</tr>)}</tbody>
          </table>
        );
      })()}
    </>
  );
}

// Uygulamanın formRecordHTML'i: etiket formu tek kart, öteki formlar başlık, bölümler ve imza; tasarım dili olmayan eski kayıt soru-cevap.
export function FormKaydiBelgesi({ veri, r, yurur }: { veri: Ayar; r: Partial<FormKaydi>; yurur?: string }) {
  const kod = r.kod ?? '';
  const dsl = typeof r.dsl === 'string' ? r.dsl : '';
  if (!dsl) {
    const cevaplar = (r.cevaplar ?? {}) as Record<string, unknown>;
    return (
      <Belge>
        <FormBasi veri={veri} kod={kod} ad={r.ad ?? ''} rev={r.rev} />
        <table><tbody><tr><th>Tarih</th><td>{trd(r.tarih)}</td><th>Dolduran</th><td>{r.dolduran ?? ''}</td></tr></tbody></table>
        <table><tbody>{Object.entries(cevaplar).map(([k, v]) => <tr key={k}><th>{k}</th><td>{Array.isArray(v) ? v.join(', ') : String(v ?? '')}</td></tr>)}</tbody></table>
        <p>{typeof r.aciklama === 'string' ? r.aciklama : ''}</p>
      </Belge>
    );
  }
  const bolumler = dslCoz(dsl);
  const icerik = r as KayitIcerigi;
  if (r.etiket === true) {
    const durum = formSonucu(bolumler, icerik.veri ?? {}, icerik.liste ?? {});
    const alanlar = bolumler.flatMap((b, si) => b.alanlar.map((a, ai) => [a.etiket, icerik.veri?.[alanAnahtari(si, ai)]] as const)).filter(([e]) => !/^durum/i.test(e));
    return (
      <Belge>
        <div className="tagp">
          <div className="tag-h"><b>{veri.ayarlar.firma || 'FİRMA ADI'}</b><span>{kod} rev {r.rev || '00'}</span></div>
          <div className="tag-st">{durum}</div>
          <table>
            <tbody>
              {alanlar.map(([e, v], i) => <tr key={`${e}-${i}`}><th>{e}</th><td>{v === undefined || v === null ? '' : String(v)}</td></tr>)}
              <tr><th>Tarih / muayeneci</th><td>{trd(r.tarih)} / {r.dolduran ?? ''}</td></tr>
            </tbody>
          </table>
          <div className="sigline">İmza / kaşe</div>
        </div>
      </Belge>
    );
  }
  return (
    <Belge>
      <FormBasi veri={veri} kod={kod} ad={r.ad ?? ''} rev={r.rev} yurur={yurur} />
      <table>
        <tbody>
          <tr><th>Tarih</th><td>{trd(r.tarih)}</td><th>Dolduran</th><td>{r.dolduran ?? ''}</td><th>Alan / bölüm</th><td>{typeof r.bolum === 'string' ? r.bolum : ''}</td></tr>
          <tr><th>Sonuç</th><td colSpan={2}><b>{typeof r.sonuc === 'string' ? r.sonuc : ''}</b></td><th>Onay durumu</th><td colSpan={2}>{r.durum ?? ''}</td></tr>
        </tbody>
      </table>
      {bolumler.map((b, si) => <BolumBaskisi key={si} b={b} si={si} kayit={icerik} />)}
      <Imza hazirlayan={r.dolduran ?? ''} onaylayan={r.onaylayan ?? ''} onayTarihi={typeof r.onayTarih === 'string' ? r.onayTarih : undefined} hazirlamaTarihi={r.tarih} />
    </Belge>
  );
}

// Tasarım dilindeki formun boş çıktısı (blankDSL).
export function BosDslFormu({ veri, form }: { veri: Ayar; form: ListedekiForm }) {
  return (
    <Belge>
      <FormBasi veri={veri} kod={form.kod} ad={form.ad} rev={form.rev} yurur={form.yurur} />
      <table><tbody><tr><th>Tarih</th><td /><th>Dolduran</th><td /><th>Alan / bölüm</th><td /></tr></tbody></table>
      {dslCoz(form.dsl).map((b, si) => <BolumBaskisi key={si} b={b} si={si} kayit={null} />)}
      <Imza />
    </Belge>
  );
}

function BosEkTablosu({ ek }: { ek: BosEk }) {
  if (ek.tur === 'd8') {
    return <table><tbody>{D8.map((d, i) => <tr key={d}><th className="tc-km3-belge-ad">D{i + 1}: {d}</th><td className="tc-km3-belge-bos-uzun" /></tr>)}</tbody></table>;
  }
  if (ek.tur === 'kalibrasyon') {
    return (
      <table>
        <thead><tr><th>Kalibrasyon tarihi</th><th>Sonuç</th><th>Sertifika no</th><th>Laboratuvar</th><th>Sonraki tarih</th><th>İmza</th></tr></thead>
        <tbody>{Array.from({ length: 6 }, (_, i) => <tr key={i}>{Array.from({ length: 6 }, (__, j) => <td key={j} className="tc-km3-belge-satir" />)}</tr>)}</tbody>
      </table>
    );
  }
  return (
    <table>
      <thead><tr><th>Sınıf</th><th>AQL</th><th>Kod</th><th>n</th><th>Ac</th><th>Re</th><th>Bulunan</th><th>Sonuç</th></tr></thead>
      <tbody>{['Kritik', 'Majör', 'Minör'].map((c) => <tr key={c}><td>{c}</td>{Array.from({ length: 7 }, (_, j) => <td key={j} />)}</tr>)}</tbody>
    </table>
  );
}

// Modül formunun boş çıktısı (blankFields, blankInsp).
export function BosModulFormu({ veri, form }: { veri: Ayar; form: ListedekiForm }) {
  const t = BOS_FORMLAR[form.kod];
  if (!t) return null;
  return (
    <Belge>
      <FormBasi veri={veri} kod={form.kod} ad={form.ad} rev={form.rev} yurur={form.yurur} />
      {t.tur === 'alanlar'
        ? (
          <>
            <table>
              <tbody>
                {t.satirlar.map((s) => (
                  <tr key={s.etiket}><th className="tc-km3-belge-ad">{s.etiket}</th><td className={s.uzun ? 'tc-km3-belge-bos-uzun' : undefined}>{s.kutular ? kutular(s.kutular) : ''}</td></tr>
                ))}
              </tbody>
            </table>
            {t.ek && <BosEkTablosu ek={t.ek} />}
          </>
        )
        : (
          <>
            <table>
              <tbody>
                <tr><th>Muayene no</th><td /><th>Tarih</th><td /></tr>
                <tr><th>Parça no / rev</th><td /><th>Lot / seri</th><td /></tr>
                <tr><th>Parti / numune</th><td /><th>Tedarikçi</th><td /></tr>
                <tr><th>AQL planı (seviye, AQL, n, Ac/Re)</th><td colSpan={3} /></tr>
              </tbody>
            </table>
            {t.maddeler.length > 0 && (
              <table><tbody>{t.maddeler.map((m) => <tr key={m}><td>{m}</td><td className="tc-km3-belge-eh">{kutu()} Evet {kutu()} Hayır</td></tr>)}</tbody></table>
            )}
            <table>
              <thead><tr><th>#</th><th>Karakteristik</th><th>Nominal</th><th>Tolerans</th><th>Ölçülen</th><th>Cihaz kodu</th><th>Sonuç</th></tr></thead>
              <tbody>{Array.from({ length: 12 }, (_, i) => <tr key={i}><td>{i + 1}</td>{Array.from({ length: 6 }, (__, j) => <td key={j} className="tc-km3-belge-satir" />)}</tr>)}</tbody>
            </table>
            <p>Sonuç: {kutu()} Kabul {' '} {kutu()} Beklemede {' '} {kutu()} Ret (NCR no: ________)</p>
          </>
        )}
      <Imza />
    </Belge>
  );
}

