import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';
import { Dugme, Girdi, IsaretKutusu, Rozet, Secim, Simge, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { fmtN } from '../bicim.ts';
import { HAM_ETIKETI, HAM_ORIG, boxTxt, type HamOrijini, type HamSecenekleri } from './kaynak.ts';
import { fmtT } from '../hesap/gkod.ts';
import { renkSinifi } from './takim.ts';
import type { Karsilastirma } from './talas.ts';
import type { HamKaynagi, HamKutu, Program, TakimBilgisi, TakimNo } from './tipler.ts';

// G-Kod Sim. yan paneli: prototipin #gSide adimlari (Program, Ham parca, Takimlar, Kontrol, Takim degisimleri, Gelismis ayarlar).

export type ProgramEylemi = 'open' | 'sh' | 'si';
export interface Cip { metin: string; ton: RozetTonu }

function Adim({ no, baslik, cip, children }: { no: ReactNode; baslik: string; cip?: Cip | null; children: ReactNode }) {
  return (
    <section className="tc-ch-adim" aria-label={baslik}>
      <header className="tc-ch-adim-ust"><i>{no}</i><b>{baslik}</b>{cip && <Rozet ton={cip.ton}>{cip.metin}</Rozet>}</header>
      {children}
    </section>
  );
}

// Adim basliklarindaki durum cipleri (gStatus, gWarnRender).
export function programCipi(p: Program): Cip { return { metin: (p.heid ? 'Heidenhain' : 'ISO') + ' · ' + fmtT(p.total), ton: 'tamam' }; }
export function hamCipi(kullanilan: HamKaynagi, kutu: HamKutu | null): Cip {
  return kutu ? { metin: HAM_ETIKETI[kullanilan] + ' · ' + boxTxt(kutu, fmtN), ton: 'tamam' } : { metin: 'Yok', ton: 'uyari' };
}
export function takimCipi(p: Program, bilgi: (T: TakimNo) => TakimBilgisi): Cip {
  const bad = p.tools.filter((T) => bilgi(T).src !== 'mag').length;
  return bad ? { metin: bad + ' takım uyumsuz', ton: 'uyari' } : { metin: p.tools.length + ' takım · magazinle uyumlu', ton: 'tamam' };
}

export interface ProgramBolumuOzellikleri {
  p: Program | null; cip: Cip | null; mesaj: ReactNode; ayristirma: string; eylem: (a: ProgramEylemi) => void;
}

export function ProgramBolumu({ p, cip, mesaj, eylem }: ProgramBolumuOzellikleri) {
  const s = p?.stat;
  return (
    <Adim no="1" baslik="Program" cip={cip}>
      <div className="tc-ch-dugmeler">
        <Dugme tur="birincil" simge="upload" onClick={() => { eylem('open'); }}>Program yükle</Dugme>
        <Dugme onClick={() => { eylem('sh'); }}>Örnek Heidenhain</Dugme>
        <Dugme onClick={() => { eylem('si'); }}>Örnek ISO</Dugme>
      </div>
      {mesaj && <div className="tc-ch-mesaj" role="status">{mesaj}</div>}
      {p && s && (
        <>
          <div className="tc-ch-pad">{p.name || '—'}</div>
          <div className="tc-ch-kutular">
            <div><small>Çevrim süresi</small><b>{fmtT(p.total)}</b><i>dk:sn / parça</i></div>
            <div><small>Kesme</small><b>{fmtT(s.feedT)}</b><i>{fmtN(s.feedLen / 1000, 2)} m</i></div>
            <div><small>Hızlı</small><b>{fmtT(s.rapidT)}</b><i>{fmtN(s.rapidLen / 1000, 2)} m</i></div>
          </div>
          <p className="tc-ch-not">{p.heid ? 'Heidenhain Klartext' : 'ISO G-kod'} · {fmtN(p.moves.length)} hareket. Süre ivmelenme ve takım değişimini içermez.</p>
        </>
      )}
    </Adim>
  );
}

export interface HamBolumuOzellikleri {
  secenekler: HamSecenekleri; kullanilan: HamKaynagi; orijin: HamOrijini; parcaKarsilastirmasi: boolean; cip: Cip | null;
  sec: (k: HamKaynagi) => void; orijinSec: (o: HamOrijini) => void; elleDegistir: (k: 'x0' | 'y0' | 'z0' | 'x1' | 'y1' | 'z1', v: number) => void;
  hamSayfasi: () => void;
}

const ELLE = ['x0', 'y0', 'z0', 'x1', 'y1', 'z1'] as const;

// Prototip bu alanlari 'change' olayinda okur (odak cikinca ya da Enter): yazarken her tusta yeniden hesaplanmaz.
function tamamlaninca(f: (deger: string) => void) {
  return {
    onBlur: (e: FocusEvent<HTMLInputElement>) => { f(e.currentTarget.value); },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') f(e.currentTarget.value); },
  };
}

export function HamBolumu({ secenekler: o, kullanilan: u, orijin, parcaKarsilastirmasi, cip, sec, orijinSec, elleDegistir, hamSayfasi }: HamBolumuOzellikleri) {
  const secenek = (k: HamKaynagi, baslik: string, alt: ReactNode, kapali: boolean) => (
    <label className={'tc-ch-secenek' + (u === k ? ' tc-ch-secenek-secili' : '') + (kapali ? ' tc-ch-secenek-kapali' : '')}>
      <input type="radio" name="gsrc" value={k} checked={u === k} disabled={kapali} onChange={() => { sec(k); }} />
      <span><b>{baslik}</b><small>{alt}</small></span>
    </label>
  );
  return (
    <Adim no="2" baslik="Ham parça" cip={cip}>
      <div className="tc-ch-secenekler" role="radiogroup" aria-label="Ham parça kaynağı">
        {secenek('blk', 'Programdaki BLK FORM', o.blk ? boxTxt(o.blk, fmtN) : 'programda tanımlı değil', !o.blk)}
        {secenek('ham', 'Ham Malzeme sayfasından', o.ham ? o.ham.label + (o.ham.file ? ' · ' + o.ham.file + ' (parça modeliyle)' : '') : 'Ham Malzeme sayfasında hesap yok', !o.ham)}
        {u === 'ham' && o.ham && (
          <div className="tc-ch-alt">
            <Secim
              etiket="Program sıfırı (preset) ham parçanın neresinde?" value={orijin} onChange={(e) => { orijinSec(e.target.value as HamOrijini); }}
              secenekler={(Object.keys(HAM_ORIG) as HamOrijini[]).map((k) => ({ deger: k, baslik: HAM_ORIG[k] }))}
            />
            {o.ham.bar && <p className="tc-ch-not">Yuvarlak çubuk 3 eksen simülasyonda kutu olarak gösterilir.</p>}
          </div>
        )}
        {secenek('auto', 'Takım yolundan otomatik', o.auto ? boxTxt(o.auto, fmtN) : '—', !o.auto)}
        {secenek('man', 'Elle gir', u === 'man' ? 'program sıfırına göre min / maks' : boxTxt(o.man, fmtN), false)}
        {u === 'man' && (
          <div className="tc-ch-alt tc-ch-izgara3">
            {ELLE.map((k) => (
              <Girdi
                key={k + o.man[k]} etiket={k.charAt(0).toUpperCase() + (k.charAt(1) === '0' ? ' min' : ' maks')} type="number" step="any"
                defaultValue={+(+o.man[k]).toFixed(2)} {...tamamlaninca((v) => { elleDegistir(k, parseFloat(v.replace(',', '.')) || 0); })}
              />
            ))}
          </div>
        )}
      </div>
      {u === 'ham' && parcaKarsilastirmasi && (
        <p className="tc-ch-not">Yeşil yarı saydam: bitmiş parça. "Karşılaştır" açıkken talaş yüzeyi renklenir — <span className="tc-ch-renk-tamam">yeşil</span> parça yüzeyinde, <span className="tc-ch-renk-fazla">turuncu</span> fazla malzeme, <span className="tc-ch-renk-dalma">kırmızı</span> parçaya dalma.</p>
      )}
      {u === 'ham' && !parcaKarsilastirmasi && o.ham && !o.ham.file && <p className="tc-ch-not">STEP yüklenirse bitmiş parça da gösterilir ve dalma kontrolü yapılır.</p>}
      {!o.ham && (
        <p className="tc-ch-not">
          <button type="button" className="tc-ch-bag" onClick={hamSayfasi}>Ham Malzeme</button> sayfasında STEP yükleyip hammaddeyi hesaplarsan burada parça modeliyle birlikte kullanabilirsin.
        </p>
      )}
    </Adim>
  );
}

export interface TakimSatiri { T: TakimNo; bilgi: TakimBilgisi; sure: number; seciliId: string }
export interface TakimSecenegi { id: string; name: string }

export interface TakimBolumuOzellikleri {
  satirlar: readonly TakimSatiri[]; kutuphane: readonly TakimSecenegi[]; tezgahAdi: string; cip: Cip | null; uygulanabilir: boolean;
  takimSec: (T: TakimNo, id: string) => void; capGir: (T: TakimNo, d: string) => void; uygula: () => void;
}

function takimDurumu(b: TakimBilgisi): { metin: string; ton: RozetTonu } {
  switch (b.src) {
    case 'mag': return { metin: 'Magazin cep ' + b.T, ton: 'tamam' };
    case 'ov': return { metin: 'Simülasyon için değiştirildi', ton: 'bilgi' };
    case 'empty': return { metin: 'Cep ' + b.T + ' boş — takım seçin', ton: 'uyari' };
    case 'nopocket': return { metin: 'Magazinde ' + b.T + '. cep yok', ton: 'uyari' };
    default: return { metin: 'İsimle çağrıldı — takım seçin', ton: 'uyari' };
  }
}

export function TakimBolumu({ satirlar, kutuphane, tezgahAdi, cip, uygulanabilir, takimSec, capGir, uygula }: TakimBolumuOzellikleri) {
  return (
    <Adim no="3" baslik="Takımlar" cip={cip}>
      {satirlar.map(({ T, bilgi, sure, seciliId }) => {
        const d = takimDurumu(bilgi);
        return (
          <div key={String(T)} className={'tc-ch-takim ' + renkSinifi(bilgi.col) + (bilgi.src === 'mag' ? '' : ' tc-ch-takim-uyumsuz')}>
            <div className="tc-ch-takim-ust">
              <b>T{T}</b>
              <Secim
                etiket={'T' + T + ' takımı'} value={seciliId} onChange={(e) => { takimSec(T, e.target.value); }}
                bosSecenek={bilgi.magT ? 'Magazindeki: ' + bilgi.magT.name : '— takım seçin —'}
                secenekler={kutuphane.map((t) => ({ deger: t.id, baslik: t.name }))}
              />
            </div>
            <div className="tc-ch-takim-alt">
              <Rozet ton={d.ton}>{d.metin}</Rozet>
              <Girdi key={bilgi.d} etiket="Ø" type="number" step="0.1" min="0.1" defaultValue={bilgi.d} {...tamamlaninca((v) => { capGir(T, v); })} />
              <span className="tc-ch-soluk">{fmtT(sure)}</span>
            </div>
          </div>
        );
      })}
      {!satirlar.length && <p className="tc-ch-not">Programda takım çağrısı yok — Ø10 kabul edildi.</p>}
      <p className="tc-ch-not">Takımlar {tezgahAdi} magazininden cep numarasıyla eşleşir. Takımı burada değiştirirsen simülasyon hemen yeni çapla baştan hesaplanır.</p>
      {uygulanabilir && <div className="tc-ch-dugmeler"><Dugme tur="birincil" simge="check" onClick={uygula}>Bu seçimi kurulum magazinine uygula</Dugme></div>}
    </Adim>
  );
}

export interface KontrolSatiri { metin: ReactNode; ton: 'uyari' | 'tamam' | 'bilgi' | 'soluk'; satir?: number }

// Kontrol bolumu satirlari (gWarnRender): magazinde olmayan takim, hizli harekette temas, dalma, kalan malzeme, ayristirici bilgileri.
export function kontrolSatirlari(p: Program, bilgi: (T: TakimNo) => TakimBilgisi, carpma: { ln: number }[], cmp: Karsilastirma | null, karsilastirmaAcik: boolean,
  ilerleme: number, bitti: boolean): { satirlar: KontrolSatiri[]; uyari: number; cip: Cip } {
  const satirlar: KontrolSatiri[] = [];
  let nWarn = 0;
  const bad = p.tools.filter((T) => { const s = bilgi(T).src; return s === 'empty' || s === 'nopocket' || s === 'name'; });
  if (bad.length) { nWarn++; satirlar.push({ ton: 'uyari', metin: bad.map((T) => 'T' + T).join(', ') + ' magazinde yok — çap varsayıldı, talaş yanlış olabilir.' }); }
  if (carpma.length) {
    nWarn++;
    satirlar.push({ ton: 'uyari', metin: 'Hızlı harekette malzemeye temas: ' + carpma.slice(0, 8).map((c) => 'satır ' + (c.ln + 1)).join(', ') + (carpma.length > 8 ? ' …' : ''), satir: carpma[0]!.ln });
  }
  if (cmp && karsilastirmaAcik) {
    if (cmp.gouge) { nWarn++; satirlar.push({ ton: 'uyari', metin: 'Parçaya dalma: ' + fmtN(cmp.gouge) + ' noktada, en fazla ' + fmtN(cmp.gmax, 2) + ' mm. Sıfır noktası yanlışsa tüm yüzey kırmızı görünür.' }); }
    else satirlar.push({ ton: 'tamam', metin: 'Parçaya dalma yok' + (ilerleme < 100 ? ' (şu ana kadar)' : '') });
    if (ilerleme >= 99 && !bitti) satirlar.push({ ton: 'soluk', metin: 'Kalan malzeme hesaplanıyor…' });
    if (bitti) {
      satirlar.push({
        ton: cmp.left ? 'bilgi' : 'tamam',
        metin: cmp.left ? 'Fazla malzeme kalan bölge: %' + fmtN(cmp.left / Math.max(1, cmp.cells) * 100, 0) + ', en fazla ' + fmtN(cmp.lmax, 1) + ' mm (matkap uç konisi dahil; yan duvarlar 3 eksende görünmez)' : 'Üstten görülen tüm yüzeyler işlenmiş',
      });
    }
  }
  p.warn.slice(0, 12).forEach((w) => { satirlar.push({ ton: 'bilgi', metin: w.msg, satir: w.line }); });
  if (!satirlar.length) satirlar.push({ ton: 'tamam', metin: 'Sorun bulunmadı' });
  const cip: Cip = nWarn ? { metin: nWarn + ' uyarı', ton: 'hata' } : p.warn.length ? { metin: p.warn.length + ' bilgi', ton: 'bilgi' } : { metin: 'Temiz', ton: 'tamam' };
  return { satirlar, uyari: nWarn, cip };
}

export function KontrolBolumu({ satirlar, cip, satiraGit }: { satirlar: readonly KontrolSatiri[]; cip: Cip | null; satiraGit: (ln: number) => void }) {
  return (
    <Adim no="4" baslik="Kontrol" cip={cip}>
      {satirlar.map((s, i) => (
        <div key={i} className={'tc-ch-uyari tc-ch-uyari-' + s.ton}>
          {s.ton === 'uyari' && <Simge ad="alert" boyut="k" />}{s.ton === 'tamam' && <Simge ad="check" boyut="k" />}
          <span>{s.metin}</span>
          {s.satir != null && <button type="button" className="tc-ch-bag" onClick={() => { satiraGit(s.satir!); }}>satır {s.satir + 1}</button>}
        </div>
      ))}
    </Adim>
  );
}

export interface DegisimSatiri { ln: number; sira: number; baslik: string; zaman: number | null; renk: number | null }

export function DegisimBolumu({ satirlar, git }: { satirlar: readonly DegisimSatiri[]; git: (ln: number) => void }) {
  return (
    <Adim no={<Simge ad="rotate" boyut="k" />} baslik="Takım değişimleri">
      {satirlar.map((d) => (
        <button key={d.ln} type="button" className={'tc-ch-degisim' + (d.renk != null ? ' ' + renkSinifi(d.renk) : '')} onClick={() => { git(d.ln); }}>
          <b>{d.sira}. değişim</b><span>{d.baslik}</span><em>satır {d.ln + 1}{d.zaman != null ? ' · ' + fmtT(d.zaman) : ''}</em>
        </button>
      ))}
      {!satirlar.length && <p className="tc-ch-not">Takım değişimi bulunamadı.</p>}
      <p className="tc-ch-not">Tıkla: simülasyon o takım değişimine gider.</p>
    </Adim>
  );
}

export interface GelismisOzellikleri {
  dialect: string; rapid: number | string; lathe: boolean;
  dilSec: (d: string) => void; hizliGir: (v: string) => void; tornaSec: (v: boolean) => void;
}

export function GelismisAyarlar({ dialect, rapid, lathe, dilSec, hizliGir, tornaSec }: GelismisOzellikleri) {
  return (
    <details className="tc-ch-gelismis">
      <summary>Gelişmiş ayarlar</summary>
      <div className="tc-ch-izgara2">
        <Secim
          etiket="Program dili" value={dialect} onChange={(e) => { dilSec(e.target.value); }}
          secenekler={[{ deger: 'auto', baslik: 'Otomatik algıla' }, { deger: 'heid', baslik: 'Heidenhain Klartext' }, { deger: 'iso', baslik: 'ISO G-kod' }]}
        />
        <Girdi etiket="Hızlı ilerleme (mm/dk)" type="number" min="1000" step="1000" defaultValue={rapid} {...tamamlaninca(hizliGir)} />
      </div>
      <IsaretKutusu etiket="Torna programı (X çap olarak)" checked={lathe} onChange={(e) => { tornaSec(e.target.checked); }} />
    </details>
  );
}
