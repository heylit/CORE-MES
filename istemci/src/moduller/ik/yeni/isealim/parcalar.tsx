import { useMemo, useState, type ReactNode } from 'react';
import {
  CokSatir, Dugme, DurumKutusu, Girdi, IsaretKutusu, Pencere, Rozet, Secim, Simge, useBildirim, type RozetTonu, type Secenek,
} from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { adSoyad } from '../bicim.ts';
import { ikSabitleri, MOTOR_HAZIRLANIYOR, type IkMotoru, type IkSabitleri } from '../motor.ts';
import type { Aday, Kayit, Personel, Pozisyon } from '../tipler.ts';
import { useIkKomutu, type IkDeposu } from '../veri.ts';
import { varsayilanDeger, type FormAlani } from './alanlar.ts';
import { adayAdi, puanMetni, satirlar, sayi, sorulariEkle, soruSetleri, surecteMi, type IlanKanali } from './kurallar.ts';
import './isealim.css';

export const bugun = (): string => tesisGunu(Date.now());
export const secenek = (t: string): Secenek => ({ deger: t, baslik: t });

/* ---------------- Ayarlardan gelen listeler ---------------- */

// Ayar değeri: motor varsa dönemin geçerli ayarı, yoksa kayıtlı ayar ya da motorun varsayılanı.
export function ayar(depo: IkDeposu, motor: IkMotoru | null, ad: string): unknown {
  if (motor) return motor.S()[ad];
  return depo.ayarlar[ad] ?? ikSabitleri()?.DEFAULT_SETTINGS[ad];
}
export const performansKriterleri = (depo: IkDeposu, motor: IkMotoru | null): string[] => satirlar(ayar(depo, motor, 'perfKriterler'));
export const mulakatKriterleri = (depo: IkDeposu, motor: IkMotoru | null): string[] => satirlar(ayar(depo, motor, 'mulakatKriterler'));
export function ilanKanallari(depo: IkDeposu, motor: IkMotoru | null): IlanKanali[] {
  const l = ayar(depo, motor, 'ilanKanallari');
  return (Array.isArray(l) ? l : []).filter((k): k is IlanKanali => typeof k === 'object' && k !== null && typeof (k as IlanKanali).id === 'string')
    .filter((k) => k.aktif !== false);
}
export const setler = (depo: IkDeposu) => soruSetleri(depo.ayarlar, ikSabitleri()?.QSETS ?? []);

// Aktif çalışan: çıkışı yok ya da çıkış tarihi gelmemiş (bugünkü `isActive`).
export const aktifMi = (p: Personel, gun: string): boolean => !p.cikisTarihi || p.cikisTarihi >= gun;
export const siraliPersonel = (l: readonly Personel[]): Personel[] => [...l].sort((a, b) => adSoyad(a).localeCompare(adSoyad(b), 'tr'));

/* ---------------- Görünüm parçaları ---------------- */

export interface BaslikDugmesi { anahtar: string; etiket: string; simge: SimgeAdi; yap: () => void; birincil?: boolean; tehlikeli?: boolean; pasif?: boolean }

// Bugünkü sayfa başlığı: ad ve açıklama solda, bütün düğmeler sağda görünür.
export function Baslik({ baslik, simge, alt, dugmeler, geri }: {
  baslik: ReactNode; simge: SimgeAdi; alt?: ReactNode; dugmeler: readonly BaslikDugmesi[]; geri?: { etiket: string; yap: () => void };
}) {
  return (
    <header className="tc-ika-baslik">
      <div className="tc-ika-baslik-bas">
        {geri && <Dugme simge="chev-left" onClick={geri.yap}>{geri.etiket}</Dugme>}
        <h2 className="tc-ika-baslik-ad"><Simge ad={simge} /><span>{baslik}</span></h2>
        {alt && <div className="tc-ika-baslik-alt">{alt}</div>}
      </div>
      {dugmeler.length > 0 && (
        <div className="tc-ika-eylemler">
          {dugmeler.map((d) => (
            <Dugme key={d.anahtar} tur={d.birincil ? 'birincil' : d.tehlikeli ? 'tehlike' : 'ikincil'} simge={d.simge} disabled={d.pasif} onClick={d.yap}>{d.etiket}</Dugme>
          ))}
        </div>
      )}
    </header>
  );
}

export function Bolum({ baslik, eylem, children }: { baslik: string; eylem?: ReactNode; children: ReactNode }) {
  return (
    <section className="tc-ika-kutu">
      <div className="tc-ika-kutu-bas"><h3>{baslik}</h3>{eylem}</div>
      {children}
    </section>
  );
}

export function Tanimlar({ satirlar: s }: { satirlar: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="tc-ika-tanim">
      {s.map(([e, d]) => <div key={e}><dt>{e}</dt><dd>{d ?? '—'}</dd></div>)}
    </dl>
  );
}

export const Not = ({ children }: { children: ReactNode }) => <p className="tc-ika-not">{children}</p>;

// Beş bölmeli puan göstergesi ve puan; puan yoksa çizgi.
export function Puan({ deger }: { deger: number | null }) {
  if (!deger) return <span className="tc-ika-soluk">—</span>;
  return (
    <span className="tc-ika-puan">
      <span className="tc-ika-olcek" role="img" aria-label={`${puanMetni(deger)} / 5`}>
        {[1, 2, 3, 4, 5].map((i) => <i key={i} data-dolu={deger >= i - 0.25 ? '' : undefined} />)}
      </span>
      <b>{puanMetni(deger)}</b>
    </span>
  );
}

// Yatay çubuk listesi (sonuç dağılımı, ortalamalar, kaynaklar).
export function Cubuklar({ satirlar: s, enCok }: { satirlar: readonly { etiket: string; deger: number; metin?: string }[]; enCok?: number }) {
  const ust = enCok ?? Math.max(1, ...s.map((x) => x.deger));
  if (s.length === 0) return <p className="tc-ika-soluk">Kayıt yok.</p>;
  return (
    <ul className="tc-ika-cubuklar">
      {s.map((x) => (
        <li key={x.etiket}>
          <span>{x.etiket}</span>
          <meter min={0} max={ust} value={x.deger} aria-label={x.etiket} />
          <b>{x.metin ?? String(x.deger)}</b>
        </li>
      ))}
    </ul>
  );
}

// Kanalın işveren paneli adresi yalnız metin olarak gösterilir; uygulama dış adrese bağlantı vermez (soru 1457 b).
export function KanalBaglantisi({ kanal }: { kanal: IlanKanali }) {
  if (!kanal.url) return null;
  return <span className="tc-ika-adres">{kanal.url}</span>;
}

export function OneriRozeti({ oneri }: { oneri: string | undefined }) {
  if (!oneri) return null;
  const c = ikSabitleri()?.REC_CLS[oneri];
  const ton: RozetTonu = c === 'ok' ? 'tamam' : c === 'warn' ? 'uyari' : c === 'bad' ? 'hata' : 'bilgi';
  return <Rozet ton={ton}>{oneri}</Rozet>;
}
export function AsamaRozeti({ asama }: { asama: string | undefined }) {
  const a = asama || 'Başvuru';
  const ton: RozetTonu = a === 'İşe alındı' ? 'tamam' : a === 'Reddedildi' ? 'hata' : a === 'Teklif' ? 'uyari' : 'bilgi';
  return <Rozet ton={ton}>{a}</Rozet>;
}

/* ---------------- Kayıt formu ---------------- */

export interface FormBaglami { depo: IkDeposu; motor: IkMotoru | null }

type Degerler = Record<string, unknown>;

// Bir form alanı: türüne göre ortak alan parçası. Değer kaydın kendi biçimindedir (sayı alanı boşsa '').
function AlanGirdisi({ f, deger, degistir, hata, b, sabitler, degerler, hepsiDegistir }: {
  f: FormAlani; deger: unknown; degistir: (v: unknown) => void; hata: string | undefined; b: FormBaglami; sabitler: IkSabitleri | null;
  degerler: Degerler; hepsiDegistir: (y: Degerler) => void;
}) {
  const metin = deger === undefined || deger === null ? '' : String(deger);
  const ortak = { etiket: f.l, ipucu: f.ipucu, hata, required: f.zorunlu, name: f.k };
  const gun = bugun();
  const personeller = siraliPersonel(b.depo.tur('emp'));
  const sec = (s: Secenek[], bos = 'Seçiniz') => <Secim {...ortak} value={metin} secenekler={s} bosSecenek={bos} onChange={(o) => { degistir(o.target.value); }} />;
  switch (f.tur) {
    case 'cok':
      return <CokSatir {...ortak} value={metin} onChange={(o) => { degistir(o.target.value); }} />;
    case 'tarih':
      return <Girdi {...ortak} type="date" value={metin} onChange={(o) => { degistir(o.target.value); }} />;
    case 'saat':
      return <Girdi {...ortak} type="time" value={metin} onChange={(o) => { degistir(o.target.value); }} />;
    case 'sayi':
    case 'para':
      return (
        <Girdi
          {...ortak} type="number" inputMode="decimal" step={f.tur === 'para' ? '0.01' : 'any'} min={f.tur === 'para' ? 0 : undefined} value={metin}
          onChange={(o) => { degistir(o.target.value === '' ? '' : sayi(o.target.value)); }}
        />
      );
    case 'eposta':
      return <Girdi {...ortak} type="email" value={metin} onChange={(o) => { degistir(o.target.value.trim()); }} />;
    case 'tel':
      return <Girdi {...ortak} type="tel" value={metin} onChange={(o) => { degistir(o.target.value); }} />;
    case 'isaret':
      return <div className="tc-ika-genis"><IsaretKutusu etiket={f.l} name={f.k} checked={Boolean(deger)} onChange={(o) => { degistir(o.target.checked); }} /></div>;
    case 'secim': {
      const kaynak = f.secenekler ?? [];
      const liste = typeof kaynak === 'function' ? (sabitler ? kaynak(sabitler) : null) : kaynak;
      if (!liste) return <Girdi {...ortak} value={metin} onChange={(o) => { degistir(o.target.value); }} ipucu={MOTOR_HAZIRLANIYOR} />;
      const s = liste.map(secenek);
      if (metin && !liste.includes(metin)) s.push(secenek(metin));
      return sec(s);
    }
    case 'personel':
      return sec(personeller.filter((p) => aktifMi(p, gun) || p.id === metin).map((p) => ({ deger: p.id, baslik: adSoyad(p) + (p.pozisyon ? ` – ${p.pozisyon}` : '') })));
    case 'departman':
      return sec(b.depo.tur('dept').map((d) => ({ deger: d.id, baslik: d.ad ?? '' })));
    case 'pozisyon':
      return sec(b.depo.tur('job').map((j) => ({ deger: j.id, baslik: (j.baslik ?? '') + (j.durum !== 'Açık' ? ` (${j.durum ?? 'Taslak'})` : '') })));
    case 'aday':
      return sec(b.depo.tur('cand').filter((a) => surecteMi(a) || a.id === metin).sort((x, y) => adayAdi(x).localeCompare(adayAdi(y), 'tr'))
        .map((a) => { const j = b.depo.al(a.jobId ?? '') as Pozisyon | undefined; return { deger: a.id, baslik: adayAdi(a) + (j ? ` – ${j.baslik ?? ''}` : '') }; }));
    case 'kanal': {
      const l = [...new Set([...ilanKanallari(b.depo, b.motor).map((k) => k.ad), 'Referans', 'Üniversite', 'Diğer'])];
      if (metin && !l.includes(metin)) l.push(metin);
      return sec(l.map(secenek));
    }
    case 'ismerkezi': {
      const s = b.depo.ben.secenekler.isMerkezleri.map((m) => ({ deger: String(m.id), baslik: m.ad + (m.kod ? ` (${m.kod})` : '') }));
      if (metin && !s.some((x) => x.deger === metin)) s.push({ deger: metin, baslik: `İş merkezi ${metin}` });
      return (
        <Secim
          {...ortak} value={metin} secenekler={s} bosSecenek={s.length === 1 ? undefined : 'Seçin'}
          onChange={(o) => { degistir(o.target.value === '' ? '' : Number(o.target.value)); }}
        />
      );
    }
    case 'personeller': {
      const secili = new Set(Array.isArray(deger) ? (deger as string[]) : []);
      const l = personeller.filter((p) => aktifMi(p, gun) || secili.has(p.id));
      const departman = (id: string | undefined) => b.depo.tur('dept').find((d) => d.id === id)?.ad ?? '';
      return (
        <fieldset className="tc-ika-genis tc-ika-coklu">
          <legend>{f.l}</legend>
          {l.length === 0 ? <p className="tc-ika-soluk">Önce personel ekleyin.</p> : l.map((p) => (
            <IsaretKutusu
              key={p.id} etiket={`${adSoyad(p)}${departman(p.departmanId) ? ` (${departman(p.departmanId)})` : ''}`} checked={secili.has(p.id)}
              onChange={(o) => { const y = new Set(secili); if (o.target.checked) y.add(p.id); else y.delete(p.id); degistir(l.filter((x) => y.has(x.id)).map((x) => x.id)); }}
            />
          ))}
        </fieldset>
      );
    }
    case 'puanlar': {
      const kriterler = f.kriter === 'mulakat' ? mulakatKriterleri(b.depo, b.motor) : performansKriterleri(b.depo, b.motor);
      const p = (deger && typeof deger === 'object' ? deger : {}) as Record<string, number>;
      return (
        <fieldset className="tc-ika-genis tc-ika-puanlar">
          <legend>{f.l}</legend>
          {kriterler.length === 0 && <p className="tc-ika-soluk">Kriter tanımlı değil (Ayarlar).</p>}
          {kriterler.map((k) => (
            <div key={k} className="tc-ika-puan-satir" role="radiogroup" aria-label={k}>
              <span>{k}</span>
              <span className="tc-ika-puan-secim">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n}>
                    <input type="radio" name={`${f.k}-${k}`} value={n} checked={sayi(p[k]) === n} onChange={() => { degistir({ ...p, [k]: n }); }} />
                    <span>{n}</span>
                  </label>
                ))}
              </span>
            </div>
          ))}
        </fieldset>
      );
    }
    case 'soruSeti':
      return <SoruSetiEkle depo={b.depo} ekle={(s) => { hepsiDegistir({ mulakatSorulari: sorulariEkle(String(degerler['mulakatSorulari'] ?? ''), s) }); }} />;
    default:
      return <Girdi {...ortak} value={metin} onChange={(o) => { degistir(o.target.value); }} />;
  }
}

function SoruSetiEkle({ depo, ekle }: { depo: IkDeposu; ekle: (s: ReturnType<typeof setler>[number]) => void }) {
  const [secili, seciliYaz] = useState('');
  const l = setler(depo);
  return (
    <div className="tc-ika-genis tc-ika-satir">
      <Secim
        etiket="Soru bankasından ekle" value={secili} bosSecenek="Soru seti seçin" onChange={(o) => { seciliYaz(o.target.value); }}
        secenekler={l.map((s) => ({ deger: s.id, baslik: `${s.ad} (${satirlar(s.sorular).length} soru)` }))}
      />
      <Dugme simge="plus" disabled={!secili} onClick={() => { const s = l.find((x) => x.id === secili); if (s) ekle(s); }}>Sorulara ekle</Dugme>
    </div>
  );
}

export interface KayitFormuOzellikleri<K extends Kayit> {
  b: FormBaglami;
  baslik: string;
  alanlar: readonly FormAlani[];
  kayit: K | null;
  yeni: () => K;
  onDolu?: Partial<K>;
  giris?: ReactNode;
  kaydetMetni?: string;
  // Kayıttan önce son düzen (görüşme değerlendirmesi, ret, ilan kodu).
  once?: (k: K) => K;
  dogrula?: (k: K) => Record<string, string>;
  sonra?: (k: K) => Promise<void> | void;
  bildirim?: string;
  kapat: () => void;
}

// Kayıt formu: bugünkü form penceresinin bölümleri ve alan sırası. Yazma ucu ve yetki denetimi sunucudadır.
export function KayitFormu<K extends Kayit>(z: KayitFormuOzellikleri<K>) {
  const sabitler = ikSabitleri();
  const gun = bugun();
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const ilk = useMemo<Degerler>(() => {
    const kaynak = (z.kayit ?? {}) as Degerler;
    const on = (z.onDolu ?? {}) as Degerler;
    return Object.fromEntries(z.alanlar.filter((f) => f.tur !== 'soruSeti').map((f) => [f.k, kaynak[f.k] ?? on[f.k] ?? (z.kayit ? (f.tur === 'personeller' ? [] : '') : varsayilanDeger(f, gun))]));
  }, []);
  const kayitKur = (d: Degerler): K => {
    const temel = (z.kayit ?? { ...z.yeni(), ...(z.onDolu ?? {}) }) as Degerler;
    const k = { ...temel, ...d } as Degerler;
    for (const [a, v] of Object.entries(d)) if (v === '') delete k[a];
    return (z.once ? z.once(k as K) : k) as K;
  };
  const form = useForm<Degerler, K>({
    ilk,
    hataIletisi: 'Kaydedilemedi.',
    dogrula: (d) => {
      const h: Record<string, string> = {};
      for (const f of z.alanlar) {
        const v = d[f.k];
        if (f.zorunlu && (v === '' || v === undefined || v === null)) h[f.k] = `${f.l} gerekli.`;
      }
      return { ...h, ...(z.dogrula ? z.dogrula(kayitKur(d)) : {}) };
    },
    kaydet: async (d) => { const k = kayitKur(d); await komut.kaydet(k); return k; },
    basarili: (k) => {
      bildir('tamam', z.bildirim ?? (z.kayit ? 'Değişiklikler kaydedildi.' : 'Kaydedildi.'));
      z.kapat();
      void Promise.resolve(z.sonra?.(k)).catch(() => { bildir('hata', 'Bağlı kayıtlar güncellenemedi; sayfayı yenileyip kontrol edin.'); });
    },
  });
  const bolumler = [...new Set(z.alanlar.map((f) => f.bolum ?? ''))];
  const alt = (
    <div className="tc-ika-form-alt">
      <Dugme tur="ikincil" onClick={z.kapat}>Vazgeç</Dugme>
      <Dugme tur="birincil" simge="check" disabled={form.gonderiliyor} onClick={() => { form.gonder(); }}>{z.kaydetMetni ?? 'Kaydet'}</Dugme>
    </div>
  );
  return (
    <Pencere acik kapat={z.kapat} baslik={z.baslik} tur="yan" alt={alt}>
      <form className="tc-ika-form" onSubmit={(o) => { form.gonder(o); }} noValidate>
        {z.giris}
        {form.genelHata && <DurumKutusu durum="hata" mesaj={form.genelHata} />}
        {bolumler.map((bo) => (
          <fieldset key={bo || 'tek'} className="tc-ika-form-bolum">
            {bo && bolumler.length > 1 && <legend>{bo}</legend>}
            <div className="tc-ika-alanlar">
              {z.alanlar.filter((f) => (f.bolum ?? '') === bo).map((f) => (
                <AlanGirdisi
                  key={f.k} f={f} deger={form.degerler[f.k]} degistir={(v) => { form.degistir({ [f.k]: v }); }} hata={form.hata(f.k)} b={z.b}
                  sabitler={sabitler} degerler={form.degerler} hepsiDegistir={(y) => { form.degistir(y); }}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </form>
    </Pencere>
  );
}

export const adayBul = (depo: IkDeposu, id: string | null | undefined): Aday | null => {
  const k = id ? depo.al(id) : undefined;
  return k && k.kind === 'cand' ? (k as Aday) : null;
};
export const pozisyonBul = (depo: IkDeposu, id: string | null | undefined): Pozisyon | null => {
  const k = id ? depo.al(id) : undefined;
  return k && k.kind === 'job' ? (k as Pozisyon) : null;
};
