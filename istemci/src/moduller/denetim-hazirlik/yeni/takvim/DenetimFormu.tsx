import { CokSatir, Dugme, FormPenceresi, Girdi, Secim } from '../../../../ortak/arayuz/index.ts';
import { useForm, type AlanHatalari } from '../../../../ortak/veri/form.ts';
import { useDenetim } from '../baglam.tsx';
import { CL_EY, EY_KEYS } from '../icerik/eydep.ts';
import { TYPES_EY } from '../icerik/iso9001.ts';
import { PROGRAMLAR, PROGRAM_SIRASI, eyGrade } from '../icerik/programlar.ts';
import { belgeSonGunuEsitle, devamiVar, dofSonGunuEsitle } from '../kurallar/denetim-takvimi.ts';
import { profilAdi } from '../kurallar/profil.ts';
import { yeniDenetim } from '../normalize.ts';
import { ISO_TARIH, bugunTarihi } from '../tarih.ts';
import type { Bulgu, Denetim, Profil, ProgramKodu, Seviye } from '../tipler.ts';

// Takvim kaydı formu (prototip aform): yeni denetim, düzenleme ve sonuç girişi. Takvim ve Performans aynı formu açar.
// Kayıt başka bir profildeyse (takvim bütün profilleri gösterir) bütün kayıt değişir; geri alma yalnız açık profilde vardır.

export type FormKipi = 'new' | 'edit' | 'done';
export interface FormAcilisi { mode: FormKipi; pid: string; id: string; prog: ProgramKodu; type?: string; date?: string; cb?: string }

interface Degerler {
  prog: ProgramKodu;
  type: string;
  date: string;
  end: string;
  cb: string;
  note: string;
  major: string;
  minor: string;
  obs: string;
  score: string;
  items: Bulgu[];
  areas: Record<string, string>;
}

// Kayıt sonrası takvimin yapacağı iş: sonuç formu ya da sonraki denetim önerisi.
export type KayitSonucu = { sonra: 'sonuc'; pid: string; id: string; prog: ProgramKodu } | { sonra: 'oneri'; pid: string; id: string } | { sonra: 'yok' };

const SEVIYELER: { deger: Seviye; baslik: string }[] = [{ deger: 'major', baslik: 'Majör' }, { deger: 'minor', baslik: 'Minör' }, { deger: 'obs', baslik: 'Gözlem' }];
const yazi = (n: number | ''): string => (n === '' || n === 0 ? '' : String(n));
const sinirli = (v: string): number | null => (v === '' || Number.isNaN(Number(v)) ? null : Math.max(0, Math.min(100, Math.round(Number(v)))));

// Kaydı değiştirecek profil: açık profilse geri alınabilir değişiklik, değilse bütün kayıt.
export function useProfilDegistir() {
  const d = useDenetim();
  return (pid: string, etiket: string | null, f: (p: Profil) => void) => {
    if (pid === d.depo.active) { d.degistir(etiket, f); return; }
    d.depoDegistir(etiket, (t) => { const p = t.data[pid]; if (p) f(p); });
  };
}

function ilkDegerler(acilis: FormAcilisi, a: Denetim | undefined, varsayilanKurulus: string): Degerler {
  const pg = PROGRAMLAR[acilis.prog];
  if (!a) {
    return {
      prog: acilis.prog, type: acilis.type ?? (acilis.prog === 'eydep' ? TYPES_EY[1] ?? '' : pg.types[2] ?? ''), date: acilis.date ?? '', end: '',
      cb: acilis.cb ?? (acilis.prog === 'eydep' ? '' : varsayilanKurulus), note: '', major: '', minor: '', obs: '', score: '', items: [], areas: {},
    };
  }
  const areas: Record<string, string> = {};
  for (const [k, v] of Object.entries(a.res.areas)) if (v != null) areas[k] = String(v);
  return {
    prog: a.prog, type: a.type, date: a.date, end: a.end, cb: a.cb, note: a.note, major: yazi(a.res.major), minor: yazi(a.res.minor), obs: yazi(a.res.obs),
    score: a.res.score === '' ? '' : String(a.res.score), items: structuredClone(a.res.items), areas,
  };
}

function SeviyeKutusu({ puan }: { puan: string }) {
  const p = sinirli(puan);
  if (p === null) return <span className="tc-dhd-soluk">Puan girin</span>;
  const g = eyGrade(p);
  return g ? <b className={g === 'A' ? 'tc-dhy-ton-iyi' : g === 'B' ? 'tc-dhy-ton-bilgi' : 'tc-dhy-ton-uyari'}>{`${g} seviyesi`}</b> : <b className="tc-dhy-ton-kotu">Sertifika eşiği altı</b>;
}

export function DenetimFormu({ acilis, kapat, kaydedildi }: { acilis: FormAcilisi; kapat: () => void; kaydedildi: (s: KayitSonucu) => void }) {
  const d = useDenetim();
  const profilDegistir = useProfilDegistir();
  const st = d.depo.data[acilis.pid] ?? d.profil;
  const a = acilis.id ? st.audits.find((x) => x.id === acilis.id) : undefined;
  const sonGun = a?.kind === 'deadline';
  const kip = acilis.mode;
  const sonuc = kip === 'done';

  const form = useForm<Degerler, KayitSonucu>({
    ilk: ilkDegerler(acilis, a, st.profile.kurulus),
    hataIletisi: 'Kaydedilemedi.',
    dogrula: (v) => {
      const h: AlanHatalari = {};
      if (sonuc) return h;
      if (!ISO_TARIH.test(v.date)) h['date'] = 'Tarih girin';
      else if (v.end && (!ISO_TARIH.test(v.end) || v.end < v.date)) h['end'] = 'Bitiş tarihi başlangıçtan önce olamaz';
      return h;
    },
    kaydet: (v) => {
      let s = { sonra: 'yok' } as KayitSonucu;
      if (sonuc) {
        profilDegistir(acilis.pid, null, (p) => {
          const x = p.audits.find((y) => y.id === acilis.id);
          if (!x) return;
          x.status = 'done';
          x.note = v.note;
          const its = v.items.filter((i) => i.t || i.g || i.c);
          x.res.items = its.map((i) => ({ lvl: i.lvl, g: i.g, c: i.c.slice(0, 20), t: i.t.slice(0, 400) }));
          if (x.prog === 'eydep') {
            const sc = sinirli(v.score);
            x.res.score = sc ?? '';
            const ar: Partial<Record<string, number>> = {};
            for (const k of EY_KEYS) { const n = sinirli(v.areas[k] ?? ''); if (n !== null) ar[k] = n; }
            x.res.areas = ar;
          }
          if (x.prog !== 'eydep' || its.length) {
            if (its.length) {
              x.res.major = its.filter((i) => i.lvl === 'major').length;
              x.res.minor = its.filter((i) => i.lvl === 'minor').length;
              x.res.obs = its.filter((i) => i.lvl === 'obs').length;
            } else {
              x.res.major = Math.max(0, Number(v.major) || 0);
              x.res.minor = Math.max(0, Number(v.minor) || 0);
              x.res.obs = Math.max(0, Number(v.obs) || 0);
            }
          }
          dofSonGunuEsitle(x, p);
          s = devamiVar({ pid: acilis.pid, a: x, st: p }) ? { sonra: 'yok' } : { sonra: 'oneri', pid: acilis.pid, id: x.id };
        });
        d.bildir('Sonuç kaydedildi');
      } else if (kip === 'new') {
        profilDegistir(acilis.pid, null, (p) => {
          const n = yeniDenetim({ prog: v.prog, type: v.type, date: v.date, end: v.end, cb: v.cb, note: v.note });
          p.audits.push(n);
          belgeSonGunuEsitle(n, p);
          if ((n.end || n.date) <= bugunTarihi()) s = { sonra: 'sonuc', pid: acilis.pid, id: n.id, prog: n.prog };
        });
        d.bildir(s.sonra === 'sonuc' ? 'Kaydedildi; şimdi sonucu girin' : 'Takvime kaydedildi');
      } else {
        profilDegistir(acilis.pid, null, (p) => {
          const e = p.audits.find((y) => y.id === acilis.id);
          if (!e) return;
          e.type = v.type;
          e.date = v.date;
          e.end = e.kind === 'audit' && v.end > v.date ? v.end : '';
          e.cb = v.cb;
          e.note = v.note;
          if (e.kind === 'audit') { belgeSonGunuEsitle(e, p); dofSonGunuEsitle(e, p); }
        });
        d.bildir('Takvime kaydedildi');
      }
      return Promise.resolve(s);
    },
    basarili: (s) => { kaydedildi(s); },
  });

  const v = form.degerler;
  const pg = PROGRAMLAR[v.prog];
  const baslik = kip === 'new' ? 'Yeni denetim' : sonuc ? 'Denetim sonucu' : sonGun ? 'Son günü düzenle' : 'Denetimi düzenle';
  const gruplar = v.prog === 'eydep' ? EY_KEYS : ['4', '5', '6', '7', '8', '9', '10'];
  const turler = pg.types.includes(v.type) || !v.type ? pg.types : [...pg.types, v.type];
  const bulguDegistir = (i: number, yama: Partial<Bulgu>) => { form.degistir({ items: v.items.map((x, j) => (j === i ? { ...x, ...yama } : x)) }); };

  return (
    <FormPenceresi acik kapat={kapat} baslik={`${baslik} · ${profilAdi(st)}`} form={form}>
      {sonuc ? (
        <>
          {v.prog === 'eydep' && (
            <>
              <Girdi etiket="EYDEP puanı (0–100)" type="number" min={0} max={100} inputMode="numeric" {...form.alan('score')} />
              <div className="tc-dhd-seviye"><span>Sertifika seviyesi</span><SeviyeKutusu puan={v.score} /></div>
              <fieldset className="tc-dhd-alanlar">
                <legend>Alan puanları (raporda varsa, isteğe bağlı)</legend>
                {EY_KEYS.map((k) => (
                  <Girdi
                    key={k} etiket={CL_EY[k]?.s ?? k} type="number" min={0} max={100} inputMode="numeric" value={v.areas[k] ?? ''}
                    onChange={(e) => { form.degistir({ areas: { ...v.areas, [k]: e.target.value } }); }}
                  />
                ))}
              </fieldset>
            </>
          )}
          <fieldset className="tc-dhd-bulgular">
            <legend>{v.prog === 'eydep' ? 'Gelişim alanları / bulgular' : 'Bulgular'}</legend>
            <p className="tc-dhd-not">Madde belirtirseniz ortak grafikte madde bazında karşılaştırılır.</p>
            {v.items.map((it, i) => (
              <div key={String(i)} className="tc-dhd-bulgu">
                <Secim etiket="Seviye" secenekler={SEVIYELER} value={it.lvl} onChange={(e) => { bulguDegistir(i, { lvl: e.target.value as Seviye }); }} />
                <Secim
                  etiket={pg.unit} bosSecenek={`${pg.unit}…`} value={it.g} onChange={(e) => { bulguDegistir(i, { g: e.target.value }); }}
                  secenekler={gruplar.map((g) => ({ deger: g, baslik: `${v.prog === 'eydep' ? '' : `${g} `}${pg.CL[g]?.s ?? g}` }))}
                />
                <Girdi etiket="Madde no" value={it.c} maxLength={20} onChange={(e) => { bulguDegistir(i, { c: e.target.value }); }} />
                <Girdi etiket="Bulgunun kısa tanımı" value={it.t} maxLength={400} onChange={(e) => { bulguDegistir(i, { t: e.target.value }); }} />
                <Dugme simge="x" aria-label={`${String(i + 1)}. bulguyu sil`} onClick={() => { form.degistir({ items: v.items.filter((_, j) => j !== i) }); }} />
              </div>
            ))}
            <Dugme simge="plus" onClick={() => { form.degistir({ items: [...v.items, { lvl: 'minor', g: '', c: '', t: '' }] }); }}>Bulgu ekle</Dugme>
          </fieldset>
          {v.prog !== 'eydep' && v.items.length > 0 && <p className="tc-dhd-not">Sayılar bulgu listesinden hesaplanır.</p>}
          {v.prog !== 'eydep' && v.items.length === 0 && (
            <>
              <Girdi etiket="Majör bulgu" type="number" min={0} inputMode="numeric" {...form.alan('major')} />
              <Girdi etiket="Minör bulgu" type="number" min={0} inputMode="numeric" {...form.alan('minor')} />
              <Girdi etiket="Gözlem / iyileştirme fırsatı" type="number" min={0} inputMode="numeric" {...form.alan('obs')} />
            </>
          )}
          <Girdi etiket="Not" placeholder="Örn. Baş denetçi, kapanış toplantısı notu" {...form.alan('note')} />
        </>
      ) : (
        <>
          <Secim
            etiket="Program" disabled={kip !== 'new'} value={v.prog} secenekler={PROGRAM_SIRASI.map((k) => ({ deger: k, baslik: PROGRAMLAR[k].n }))}
            onChange={(e) => {
              const p = e.target.value as ProgramKodu;
              const t = PROGRAMLAR[p].types;
              form.degistir({ prog: p, type: t.includes(v.type) ? v.type : (p === 'eydep' ? TYPES_EY[1] : t[2]) ?? '', cb: p === 'eydep' ? '' : v.cb || st.profile.kurulus });
            }}
          />
          {sonGun
            ? <Girdi etiket="Başlık" {...form.alan('type')} />
            : <Secim etiket="Denetim türü" secenekler={turler.map((t) => ({ deger: t, baslik: t }))} {...form.alan('type')} />}
          <Girdi etiket={sonGun ? 'Tarih' : 'Başlangıç tarihi'} type="date" required {...form.alan('date')} />
          {!sonGun && (
            <>
              <Girdi etiket="Bitiş tarihi (birden çok gün sürüyorsa)" type="date" {...form.alan('end')} />
              <Girdi etiket={v.prog === 'eydep' ? 'Değerlendiren' : 'Belgelendirme kuruluşu'} placeholder={v.prog === 'eydep' ? 'SSB değerlendirme heyeti' : 'Örn. TSE, TÜV, BV'} {...form.alan('cb')} />
            </>
          )}
          <CokSatir etiket="Not" rows={2} placeholder="Örn. Denetim planı geldi, baş denetçi" {...form.alan('note')} />
          {v.prog === 'eydep' && !sonGun && v.type !== TYPES_EY[0] && (
            <p className="tc-dhd-not">Kaydedince belgelerin SSB&apos;ye son teslim günü (15 gün önce) takvime otomatik eklenir.</p>
          )}
        </>
      )}
    </FormPenceresi>
  );
}
