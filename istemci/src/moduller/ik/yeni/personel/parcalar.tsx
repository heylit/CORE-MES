import type { ReactNode } from 'react';
import type { IkBen } from '#paylasilan/sozlesme/ik.ts';
import { CokSatir, Girdi, IsaretKutusu, Secim, type Secenek } from '../../../../ortak/arayuz/Alan.tsx';
import type { IkMotoru, IkSabitleri } from '../motor.ts';
import type { Departman, Personel } from '../tipler.ts';
import type { FormAlani } from './alanlar.ts';
import { adSoyadMetni, ibanBicimi, sayi } from './kurallar.ts';
import { varsayilanTesvik } from './motor-yuzu.ts';

// Kişi sayfası bölümü: başlık, sağda düğmeler, içerik.
export function Bolum({ baslik, eylem, children }: { baslik: string; eylem?: ReactNode; children: ReactNode }) {
  return (
    <section className="tc-ikp-bolum" aria-label={baslik}>
      <header className="tc-ikp-bolum-ust">
        <h3>{baslik}</h3>
        {eylem && <div className="tc-ikp-bolum-eylem">{eylem}</div>}
      </header>
      {children}
    </section>
  );
}

export interface Tanim { etiket: string; deger: ReactNode; genis?: boolean }

// Boş değer "Girilmedi" yazar; sıfır uydurulmaz.
export function Tanimlar({ satirlar }: { satirlar: readonly (Tanim | null | false)[] }) {
  return (
    <dl className="tc-ikp-tanimlar">
      {satirlar.filter((s): s is Tanim => Boolean(s)).map((s) => {
        const bos = s.deger === null || s.deger === undefined || s.deger === '';
        return (
          <div key={s.etiket} className={s.genis ? 'tc-ikp-genis' : undefined}>
            <dt>{s.etiket}</dt>
            <dd className={bos ? 'tc-ikp-yok' : undefined}>{bos ? 'Girilmedi' : s.deger}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function Not({ children }: { children: ReactNode }) {
  return <p className="tc-ikp-not">{children}</p>;
}

export interface AlanBaglami {
  sabitler: IkSabitleri | null;
  motor: IkMotoru | null;
  personeller: readonly Personel[];
  departmanlar: readonly Departman[];
  secenekler: IkBen['secenekler'];
  // Personel seçiminde kayıt kendisini yönetici seçemez.
  kayitKimligi: string | null;
  // Formdaki güncel değerler (prim varsayılanı yaka tipine bağlıdır).
  kayit: Personel | null;
  aktifMi: (p: Personel) => boolean;
}

const secenek = (d: string): Secenek => ({ deger: d, baslik: d });

function secenekler(f: FormAlani, b: AlanBaglami, deger: string): Secenek[] | null {
  const kaynak = f.secenekler;
  if (!kaynak) return [];
  const liste = typeof kaynak === 'function' ? (b.sabitler ? kaynak(b.sabitler) : null) : kaynak;
  if (!liste) return null;
  const s = liste.map(secenek);
  // Listeden kalkmış eski değer kaybolmasın.
  if (deger && !liste.includes(deger)) s.push(secenek(deger));
  return s;
}

// Bir form alanı: türüne göre ortak alan parçası. Değer kaydın kendi biçimindedir (sayı alanı boşsa '').
export function AlanGirdisi({ f, deger, degistir, hata, b }: {
  f: FormAlani; deger: unknown; degistir: (v: unknown) => void; hata: string | undefined; b: AlanBaglami;
}) {
  const metin = deger === undefined || deger === null ? '' : String(deger);
  const ortak = { etiket: f.l, ipucu: f.ipucu, hata, required: f.zorunlu, name: f.k };
  switch (f.tur) {
    case 'cok':
      return <CokSatir {...ortak} value={metin} onChange={(o) => { degistir(o.target.value); }} />;
    case 'tarih':
      return <Girdi {...ortak} type="date" value={metin} onChange={(o) => { degistir(o.target.value); }} />;
    case 'sayi':
    case 'para':
      return (
        <Girdi
          {...ortak} type="number" inputMode="decimal" step={f.tur === 'para' ? '0.01' : 'any'} min={f.tur === 'para' ? 0 : undefined} value={metin}
          onChange={(o) => { degistir(o.target.value === '' ? '' : sayi(o.target.value)); }}
        />
      );
    case 'isaret':
      return (
        <div className="tc-ikp-genis">
          <IsaretKutusu etiket={f.l} name={f.k} checked={Boolean(deger)} onChange={(o) => { degistir(o.target.checked); }} />
          {f.ipucu && <p className="tc-ikp-ipucu">{f.ipucu}</p>}
        </div>
      );
    case 'secim': {
      const s = secenekler(f, b, metin);
      // Sabit liste motorla gelir; motor yokken değer serbest yazılır.
      if (s === null) return <Girdi {...ortak} value={metin} onChange={(o) => { degistir(o.target.value); }} ipucu="Seçenekler hesap motoruyla gelir." />;
      return <Secim {...ortak} value={metin} secenekler={s} bosSecenek="Seçiniz" onChange={(o) => { degistir(o.target.value); }} />;
    }
    case 'personel': {
      const liste = b.personeller.filter((p) => (b.aktifMi(p) || p.id === metin) && p.id !== b.kayitKimligi)
        .map((p) => ({ deger: p.id, baslik: adSoyadMetni(p) + (p.pozisyon ? ` – ${p.pozisyon}` : '') }));
      return <Secim {...ortak} value={metin} secenekler={liste} bosSecenek="Seçiniz" onChange={(o) => { degistir(o.target.value); }} />;
    }
    case 'departman':
      return (
        <Secim
          {...ortak} value={metin} bosSecenek="Seçiniz" onChange={(o) => { degistir(o.target.value); }}
          secenekler={b.departmanlar.map((d) => ({ deger: d.id, baslik: d.ad ?? '' }))}
        />
      );
    case 'ismerkezi': {
      const s = b.secenekler.isMerkezleri.map((m) => ({ deger: String(m.id), baslik: m.ad + (m.kod ? ` (${m.kod})` : '') }));
      if (metin && !s.some((x) => x.deger === metin)) s.push({ deger: metin, baslik: `İş merkezi ${metin}` });
      return (
        <Secim
          {...ortak} value={metin} secenekler={s} bosSecenek={s.length === 1 ? undefined : 'Seçin'}
          onChange={(o) => { degistir(o.target.value === '' ? '' : Number(o.target.value)); }}
        />
      );
    }
    case 'tmikisi': {
      const s = b.secenekler.kisiler.map((k) => ({ deger: String(k.id), baslik: k.ad + (k.sicilNo ? ` (${k.sicilNo})` : '') }));
      if (metin && !s.some((x) => x.deger === metin)) s.push({ deger: metin, baslik: `Kullanıcı ${metin}` });
      return (
        <Secim
          {...ortak} value={metin} secenekler={s} bosSecenek="Bağlı değil"
          onChange={(o) => { degistir(o.target.value === '' ? '' : Number(o.target.value)); }}
        />
      );
    }
    case 'tckn':
      return <Girdi {...ortak} inputMode="numeric" maxLength={11} pattern="\d{11}" value={metin} onChange={(o) => { degistir(o.target.value.trim()); }} />;
    case 'iban':
      return (
        <Girdi
          {...ortak} value={ibanBicimi(metin)} placeholder="TR00 0000 0000 0000 0000 0000 00"
          onChange={(o) => { degistir(o.target.value.replace(/\s+/g, '').toUpperCase()); }}
        />
      );
    case 'eposta':
      return <Girdi {...ortak} type="email" value={metin} onChange={(o) => { degistir(o.target.value.trim()); }} />;
    case 'tel':
      return <Girdi {...ortak} type="tel" value={metin} onChange={(o) => { degistir(o.target.value); }} />;
    case 'tesvik': {
      if (!b.motor) return <Girdi {...ortak} value={metin} disabled ipucu="Teşvik listesi hesap motoruyla gelir." />;
      const varsayilan = varsayilanTesvik(b.motor);
      return (
        <Secim
          {...ortak} value={metin} bosSecenek={`Genel ayar (${varsayilan ? varsayilan.ad : 'Teşvik yok'})`}
          secenekler={b.motor.settingsList('tesvikler').map((t) => ({ deger: t.id, baslik: t.ad }))} onChange={(o) => { degistir(o.target.value); }}
        />
      );
    }
    case 'primler':
      return <PrimDuzenleyici f={f} deger={deger} degistir={degistir} b={b} />;
    default:
      return <Girdi {...ortak} value={metin} onChange={(o) => { degistir(o.target.value); }} />;
  }
}

type PrimDegeri = Record<string, { aktif: boolean; deger?: number }>;

// Prim türleri Ayarlar'dadır; kişide yalnız varsayılandan farkı saklanır (bugünkü biçim).
function PrimDuzenleyici({ f, deger, degistir, b }: { f: FormAlani; deger: unknown; degistir: (v: unknown) => void; b: AlanBaglami }) {
  if (!b.motor) return <div className="tc-ikp-genis"><p className="tc-ikp-ipucu">{f.l}: hesap motoru hazırlanıyor.</p></div>;
  const motor = b.motor;
  const ps = motor.settingsList('primler');
  const kendi = (deger && typeof deger === 'object' ? deger : {}) as PrimDegeri;
  const kayit: Personel = b.kayit ?? { id: '', kind: 'emp' };
  if (ps.length === 0) return <div className="tc-ikp-genis"><p className="tc-ikp-ipucu">Ayarlar’da tanımlı prim yok.</p></div>;
  const yaz = (id: string, aktif: boolean, ozel: string, varsayilan: boolean) => {
    const yeni: PrimDegeri = { ...kendi };
    if (aktif !== varsayilan || ozel !== '') yeni[id] = { aktif, ...(ozel !== '' ? { deger: sayi(ozel) } : {}) };
    else delete yeni[id];
    degistir(yeni);
  };
  return (
    <fieldset className="tc-ikp-genis tc-ikp-primler">
      <legend>{f.l}</legend>
      {ps.map((p) => {
        const o = kendi[p.id];
        const varsayilan = motor.primDefaultOn(p, kayit);
        const acik = o && o.aktif !== undefined ? o.aktif : varsayilan;
        const ozel = o && o.deger !== undefined ? String(o.deger) : '';
        return (
          <div key={p.id} className="tc-ikp-prim">
            <IsaretKutusu
              etiket={`${p.ad} (${motor.primDesc(p)}${p.kidem ? ', kıdeme dahil' : ''})`} checked={acik}
              onChange={(e) => { yaz(p.id, e.target.checked, ozel, varsayilan); }}
            />
            <Girdi
              etiket={`${p.ad} özel değer`} type="number" inputMode="decimal" step="any" value={ozel} placeholder={String(sayi(p.deger))}
              onChange={(e) => { yaz(p.id, acik, e.target.value.trim(), varsayilan); }}
            />
          </div>
        );
      })}
      <p className="tc-ikp-ipucu">Değer alanını boş bırakırsanız Ayarlar’daki değer kullanılır. Prim türleri Ayarlar &gt; Yemek, yol ve prim bölümünden yönetilir.</p>
    </fieldset>
  );
}
