import { fmt } from '../../bicim.ts';
import * as K from '../../kurallar/index.ts';
import * as S from '../../sabitler/index.ts';
import { useSihirbaz } from '../baglam.ts';
import type { Taslak } from '../durum.ts';
import { girdiler } from '../turler.ts';
import type { Alan, Kategori, TakvimKaydi } from '../../kurallar/index.ts';
import { KatalogSimgesi } from '../../ortak/KatalogSimgesi.tsx';
import { Alanlar, Cip, CipGrubu, CokSatirAlani, MetinAlani, SecenekGrubu, Yardim } from '../parcalar.tsx';
import { Belgeler, TedarikciAlani } from './TicariAdimi.tsx';
import { TurKartlari } from './Baslangic.tsx';

// Öteki türlerin ilk adımı (prototipte `gStep0`): tür ve kategori.
export function GenelBaslangic() {
  const { taslak: d, b, kurVeGit } = useSihirbaz();
  const katSec = (k: string) => {
    const y: Taslak = { ...d, g: { ...d.g } };
    if (d.g.kat !== k) {
      y.g = { kat: k };
      const c = S.DB_KAT[k];
      if (d.tur === 'demirbas' && c) {
        Object.assign(y.g, {
          durum: 'Kullanımda', omur: c.omur, yontem: 'Normal (doğrusal)', bakimAy: c.bakim || '',
          kalibrasyon: c.kal ? 'Gerekli' : 'Gerekli değil', kalAy: c.kal ? 12 : '',
        });
      }
    }
    kurVeGit(y, 1);
  };
  const kat = d.tur === 'sarf' ? { baslik: 'Sarf kategorisi', l: S.SARF_KAT }
    : d.tur === 'demirbas' ? { baslik: 'Demirbaş kategorisi', l: S.DB_KAT }
      : d.tur === 'hizmet' ? { baslik: 'Hizmet grubu', l: S.HZ_KAT } : null;
  return (
    <>
      <h4 className="tc-my-bas">Ne oluşturuyorsun?</h4>
      <TurKartlari />
      {kat ? (
        <>
          <h4 className="tc-my-bas">{kat.baslik}</h4>
          <div className="tc-my-kartlar">
            {girdiler<Kategori>(kat.l).filter(([k, c]) => !c.gizli || k === d.g.kat).map(([k, c]) => (
              <button key={k} type="button" className="tc-my-kart tc-my-kart-kat" data-tur={d.tur} aria-pressed={d.g.kat === k} onClick={() => { katSec(k); }}>
                <span className="tc-my-kart-ikon"><KatalogSimgesi yol={K.katIkon(d.tur, k, b) ?? S.OPT_ICON[c.ikon ?? 'box'] ?? S.OPT_ICON.box} /></span>
                <span className="tc-my-kart-ad">{c.ad}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <Yardim>
          {d.tur === 'ticari_mal'
            ? 'Ticari mal kartı tanım ve ticari bilgilerden (tedarikçi, depo yeri, barkod, GTİP) oluşur; operasyon ve reçete yoktur.'
            : d.tur === 'yarimamul'
              ? 'Yarı mamul kartı tanım, operasyon rotası (no + operasyon kodu), ölçü-kalite ve ticari bilgilerden oluşur.'
              : 'Mamul kartı tanım, operasyonlar, ambalaj ve uygunluk ile ticari bilgilerden (barkod, GTİP) oluşur.'}
        </Yardim>
      )}
    </>
  );
}

// Seçimli alan (prototipte `gAlanHTML` sec/coklu kolu).
export function GenelSecim({ a }: { a: Alan }) {
  const { taslak: d, b, degistir } = useSihirbaz();
  const v = d.g[a.k];
  const cur = a.tip === 'sec' ? (v ? [String(v)] : []) : (Array.isArray(v) ? v.map(String) : []);
  const etiket = a.ad + (K.alanZorunlu(d, a, b) ? ' *' : '');
  const sec = (x: string) => {
    if (a.tip === 'sec') {
      // Hizmette çeşit zorunlu: seçili çeşide yeniden basmak seçimi kaldırmaz (kaldırıp aynısını seçmek isterleri silerdi).
      if (d.tur === 'hizmet' && a.k === 'cesit') {
        if (d.g.cesit === x) return;
        degistir((t) => { (S.HZ_CESIT_ANAHTARLARI as string[]).forEach((k) => { delete t.g[k]; }); t.g.cesit = x; });
        return;
      }
      degistir((t) => { t.g[a.k] = t.g[a.k] === x ? '' : x; });
      return;
    }
    degistir((t) => {
      const s = new Set(Array.isArray(t.g[a.k]) ? (t.g[a.k] as string[]) : []);
      if (s.has(x)) s.delete(x); else s.add(x);
      t.g[a.k] = [...s];
    });
  };
  return (
    <SecenekGrubu baslik={etiket} ikon={K.gAlanIkon(a, d, b)} ikonAcik={cur.length > 0} sayac={a.tip === 'coklu' ? cur.length : undefined}>
      <CipGrubu etiket={a.ad} radyo={a.tip === 'sec'}>
        {(a.opts ?? []).map((x) => (
          <Cip key={x} radyo={a.tip === 'sec'} basili={cur.includes(x)} ipucu={!!S.INFO[x]} baslik={S.INFO[x]?.split('||')[0]} tikla={() => { sec(x); }}>{x}</Cip>
        ))}
      </CipGrubu>
    </SecenekGrubu>
  );
}

// Metin, sayı ve tarih alanı; öneri çipleri varsa altında (prototipte `gAlanHTML` öteki kolu).
function GenelAlan({ a }: { a: Alan }) {
  const { taslak: d, b, degistir } = useSihirbaz();
  const v = d.g[a.k];
  const etiket = a.ad + (K.alanZorunlu(d, a, b) ? ' *' : '');
  const yaz = (x: string | number) => { degistir((t) => { t.g[a.k] = x; }); };
  return (
    <MetinAlani
      etiket={etiket} deger={v} sayi={a.tip === 'num'} tip={a.tip === 'tarih' ? 'date' : 'text'} birim={a.u} ipucu={a.ph} genis={!!a.genis} yaz={yaz}
      alt={a.oneri ? (
        <CipGrubu etiket={`${a.ad} önerileri`}>
          {a.oneri.map((o) => (
            <Cip
              key={String(o)} basili={String(v) === String(o)}
              tikla={() => {
                const n = typeof o === 'string' && /^-?\d+(\.\d+)?$/.test(o) ? Number(o) : o;
                degistir((t) => { t.g[a.k] = String(t.g[a.k]) === String(n) ? '' : n; });
              }}
            >{typeof o === 'number' ? fmt(o) : o}
            </Cip>
          ))}
        </CipGrubu>
      ) : undefined}
    />
  );
}

// Prototipte `gAlanlarHTML`: seçimli alanlar kendi satırında, ötekiler alan ızgarasında, sıra korunur.
export function GenelAlanlar({ alanlar }: { alanlar: readonly Alan[] }) {
  const { taslak: d, b } = useSihirbaz();
  const gorunen = alanlar.filter((a) => K.gAlanGorunur(d, a, b));
  const parcalar: (Alan | Alan[])[] = [];
  gorunen.forEach((a) => {
    if (a.tip === 'sec' || a.tip === 'coklu') parcalar.push(a);
    else {
      const son = parcalar[parcalar.length - 1];
      if (Array.isArray(son)) son.push(a); else parcalar.push([a]);
    }
  });
  return (
    <>
      {parcalar.map((p) => (Array.isArray(p)
        ? <Alanlar key={p.map((a) => a.k).join('|')}>{p.map((a) => <GenelAlan key={a.k} a={a} />)}</Alanlar>
        : <GenelSecim key={p.k} a={p} />))}
    </>
  );
}

// Demirbaş "Bakım ve kalibrasyon": sonraki tarihler.
export function BakimTarihleri() {
  const { taslak: d, b } = useSihirbaz();
  const l = K.gTarihler(d, b);
  if (!l.length) return <div className="tc-my-canli"><div className="tc-my-canli-not">Son bakım veya kalibrasyon tarihini girince sonraki tarih hesaplanır.</div></div>;
  return (
    <div className="tc-my-canli">
      {l.map((x) => (
        <div key={x.ad} className={x.kalanGun < 0 ? 'tc-my-gecti' : x.kalanGun <= 30 ? 'tc-my-yakin' : undefined}>
          <small>{x.ad}{x.bitis ? ' bitiş' : ' (sonraki)'}</small>
          <b>{K.tStr(x.sonraki, b)}</b>
          <small>{x.kalanGun < 0 ? `${String(-x.kalanGun)} gün geçti` : `${String(x.kalanGun)} gün kaldı`}</small>
        </div>
      ))}
    </div>
  );
}

// Adım tanımına göre öteki türlerin alan adımları (prototipte `gRender`'ın alan, alis, bakim ve belge kolları).
export function GenelAdim({ adim }: { adim: { ozel?: string; alanlar?: readonly Alan[] } }) {
  const { taslak: d, degistir } = useSihirbaz();
  if (adim.ozel === 'belge') {
    return (
      <>
        <Belgeler />
        <CokSatirAlani etiket="Notlar" deger={d.com.not} ipucu="Kullanım talimatı, özel uyarılar" yaz={(v) => { degistir((t) => { t.com.not = v; }); }} />
      </>
    );
  }
  return (
    <>
      {adim.ozel === 'alis' && <Alanlar><TedarikciAlani /></Alanlar>}
      <GenelAlanlar alanlar={adim.alanlar ?? []} />
      {adim.ozel === 'bakim' && <BakimTarihleri />}
    </>
  );
}
