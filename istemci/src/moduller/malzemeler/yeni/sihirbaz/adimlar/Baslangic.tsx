import { useEffect, useMemo, useState } from 'react';
import { Dugme } from '../../../../../ortak/arayuz/index.ts';
import { fmt } from '../../bicim.ts';
import * as K from '../../kurallar/index.ts';
import * as S from '../../sabitler/index.ts';
import type { KuralBaglami } from '../../kurallar/index.ts';
import type { SonKullanilan } from '../../tercihler.ts';
import type { KartKaydi } from '../../tipler.ts';
import { aileler, formlar, girdiler } from '../turler.ts';
import type { Aile, Tur } from '../../kurallar/index.ts';
import { useSihirbaz } from '../baglam.ts';
import { kopyala, type Taslak } from '../durum.ts';
import { AktifSuzgecler, Suzgecler } from '../../katalog/Suzgecler.tsx';
import { suzulmus, type FiltreSecimi } from '../../katalog/liste.ts';
import { KatalogSimgesi } from '../../ortak/KatalogSimgesi.tsx';
import { OnayRozeti } from '../OnayRozeti.tsx';
import { BagDugmesi, Cip, CipGrubu, Tamam, Yardim } from '../parcalar.tsx';

// Hammadde ilk adımı (prototipte `s0`): katalogda hızlı arama, tür kartları, son kullanılan kaliteler, aile kartları.
export function Baslangic() {
  const s = useSihirbaz();
  const { taslak: d, b, kurVeGit, sonKullanilanlar } = s;
  const yakinlar = yakinKaliteler(sonKullanilanlar, b);

  const aileSec = (k: string) => {
    let y: Taslak = d;
    if (d.fam !== k) {
      y = { ...K.newDraft(b), fam: k, id: d.id };
      y.com = { ...K.newDraft(b).com, ted: d.com.ted, tedId: d.com.tedId, not: d.com.not };
      y.cls = Object.keys(b.t.FAMS[k]?.classes ?? {})[0] ?? null;
      if (k === 'diger') y.grade = '__ozel';
    }
    kurVeGit(y, 1);
  };

  return (
    <>
      <HizliArama />
      <h4 className="tc-my-bas">Ya da türünü seçerek başla</h4>
      <TurKartlari />
      {yakinlar.length > 0 && (
        <section className="tc-my-bolum">
          <h4>Son kullanılan kaliteler</h4>
          <SonKullanilanCipleri liste={yakinlar} ilerle />
        </section>
      )}
      <h4 className="tc-my-bas">Hammadde ailesi</h4>
      <div className="tc-my-kartlar">
        {girdiler<Aile>(b.t.FAMS).filter(([k, f]) => !f.gizli || d.fam === k).map(([k, f]) => (
          <button key={k} type="button" className="tc-my-kart" data-aile={k} aria-pressed={d.fam === k} onClick={() => { aileSec(k); }}>
            <span className="tc-my-kart-ikon"><KatalogSimgesi yol={S.FAM_ICON[k]} /></span>
            <span className="tc-my-kart-ad">{f.ad}</span>
            <span className="tc-my-kart-aciklama">{f.desc}</span>
          </button>
        ))}
      </div>
      <Yardim>
        Hazır ve kayıtlı şablonların için <BagDugmesi tikla={() => { s.git.sablonlar(); }}>Şablonlar</BagDugmesi> sayfasını kullanabilirsin.
      </Yardim>
    </>
  );
}

// Prototipte `turKartlari` ve tür seçimi: tür değişince taslak sıfırlanır, düzenlenen kartın kimliği kalır.
export function TurKartlari() {
  const { taslak: d, b, yenisiniKur, kurVeGit } = useSihirbaz();
  const cur = d.tur || 'hammadde';
  const sec = (k: string) => {
    let y: Taslak = d;
    if (cur !== k) {
      y = { ...K.newDraft(b), tur: k as Taslak['tur'] };
      if (d.id) y.id = d.id;
    }
    if (k === 'yarimamul' || k === 'mamul') kurVeGit(y, 1);
    else yenisiniKur(y);
  };
  void b;
  return (
    <div className="tc-my-turler">
      {girdiler<Tur>(S.TURLER).map(([k, t]) => (
        <button key={k} type="button" className="tc-my-kart" data-tur={k} aria-pressed={cur === k} onClick={() => { sec(k); }}>
          <span className="tc-my-kart-ikon"><KatalogSimgesi yol={S.TUR_ICON[k]} /></span>
          <span className="tc-my-kart-ad">{t.ad}</span>
          <span className="tc-my-kart-aciklama">{t.desc}</span>
        </button>
      ))}
    </div>
  );
}

interface Yakin { fam: string; cls: string | null; kod: string; ad: string }

// Ayarda gizlenen ya da kaldırılan kalite son kullanılanlarda görünmez.
export function yakinKaliteler(liste: readonly SonKullanilan[], b: KuralBaglami): Yakin[] {
  return liste.flatMap((r) => {
    const g = b.t.FAMS[r.fam] ? K.grade({ ...K.newDraft(b), fam: r.fam, cls: r.cls, grade: r.grade }, b) : null;
    return g ? [{ fam: r.fam, cls: r.cls, kod: r.grade, ad: g.ad }] : [];
  });
}

export function SonKullanilanCipleri({ liste, ilerle }: { liste: readonly Yakin[]; ilerle: boolean }) {
  const { kaliteSec } = useSihirbaz();
  return (
    <CipGrubu etiket="Son kullanılan kaliteler">
      {liste.map((x) => (
        <Cip key={`${x.fam}|${x.kod}`} basili={false} tikla={() => { kaliteSec(x.fam, x.cls, x.kod, ilerle ? 2 : undefined); }}>
          <i className="tc-my-nokta" data-aile={x.fam} aria-hidden="true" />{x.ad}
        </Cip>
      ))}
    </CipGrubu>
  );
}

// Malzeme ayarındaki sık kullanılan kaliteler (prototipte `favoriChips`).
export function FavoriCipleri() {
  const { b, ortam, taslak: d, yenisiniKur, kaliteSec } = useSihirbaz();
  const liste = (ortam.malzemeAyari.favoriler ?? []).flatMap((k): Yakin[] => {
    const [fam = '', cls = '', kod = ''] = k.split('|');
    const g = aileler(b)[fam] ? K.grade({ ...K.newDraft(b), fam, cls, grade: kod }, b) : null;
    return g ? [{ fam, cls, kod, ad: g.ad }] : [];
  });
  if (!liste.length) return null;
  return (
    <CipGrubu etiket="Sık kullanılan kaliteler">
      {liste.map((x) => (
        <Cip
          key={`${x.fam}|${x.kod}`} basili={false}
          tikla={() => {
            if (x.fam !== d.fam) yenisiniKur({ ...K.newDraft(b), fam: x.fam });
            kaliteSec(x.fam, x.cls, x.kod, 2);
          }}
        >
          <i className="tc-my-nokta" data-aile={x.fam} aria-hidden="true" />★ {x.ad}
        </Cip>
      ))}
    </CipGrubu>
  );
}

function KartSatiri({ x, neden, vurgu }: { x: KartKaydi; neden?: string; vurgu?: boolean }) {
  const { kartiAc } = useSihirbaz();
  return (
    <li className={vurgu ? 'tc-my-hz-kart tc-my-hz-ayni' : 'tc-my-hz-kart'}>
      <span><b className="tc-my-kod">{x.com.kod}</b> <OnayRozeti x={x} /></span>
      <span className="tc-my-hz-ad">{x.com.ad}{neden && <small>{neden}</small>}</span>
      <Dugme tur={vurgu ? 'birincil' : 'ikincil'} onClick={() => { kartiAc(String(x.id)); }}>{vurgu ? 'Bu kartı kullan' : 'Aç'}</Dugme>
    </li>
  );
}

// Prototipte `hzBolumHTML` + `hzSonucHTML`: metni kalite, form, ölçü ve seçimlere ayırır; katalogdaki aynı, benzer ve
// yakın kartları gösterir; yoksa bilgileri doldurulmuş yeni kart açar.
export function HizliArama() {
  const s = useSihirbaz();
  const { b, bildir, yenisiniKur, sonaKoy } = s;
  const [metin, metinYaz] = useState('');
  const [gecikmeli, gecikmeliYaz] = useState('');
  useEffect(() => {
    const z = setTimeout(() => { gecikmeliYaz(metin); }, 200);
    return () => { clearTimeout(z); };
  }, [metin]);

  const yeniKart = () => {
    const p = K.metinAyristir(gecikmeli, b);
    if (!p.grade) return;
    const t = K.hizliTaslak(p, b);
    const d: Taslak = { ...K.newDraft(b), fam: t.fam, cls: t.cls, grade: t.grade, stds: [], opts: kopyala(t.opts) };
    if (t.form) {
      d.form = t.form;
      d.dims = t.dims;
    }
    if (d.fam && d.grade) sonaKoy(d.fam, d.cls, d.grade);
    metinYaz('');
    yenisiniKur(d, d.form ? (p.varsayilanOlcu.length ? 2 : 3) : 2);
    bildir(p.varsayilanOlcu.length ? 'Bilgiler dolduruldu; varsayılan ölçüleri kontrol et.' : 'Bilgiler dolduruldu; kontrol edip devam et.');
  };

  return (
    <section className="tc-my-hz">
      <h4 className="tc-my-bas">Önce katalogda ara</h4>
      <Yardim>Malzemeyi aklındaki gibi yaz; varsa mevcut kartı gösteririm, yoksa bilgileri doldurulmuş yeni kart açarsın.</Yardim>
      <span className="tc-my-girdi tc-my-hz-girdi">
        <input
          type="search" aria-label="Katalogda ara" value={metin} autoComplete="off" enterKeyHint="search"
          placeholder="ör. 316L 2B 3x1250x2500 · 42CrMo4 Ø50 ıslah · ST37 lama 40x5 · 304 boru 48,3x2"
          onChange={(e) => { metinYaz(e.target.value); }}
        />
      </span>
      <div aria-live="polite">
        {gecikmeli.trim() ? <HizliSonuc metin={gecikmeli} yeniKart={yeniKart} /> : (
          <FavoriBolumu />
        )}
      </div>
      <SecerekSuz />
    </section>
  );
}

const SUZ_SINIRI = 25;

// Prototipte `hzFiltreHTML`: katalog süzgeçleriyle kart bulma; ilk 25 kart listelenir, seçim yokken yalnız yol gösterilir.
function SecerekSuz() {
  const { b, kartlar } = useSihirbaz();
  const [sec, secYaz] = useState<FiltreSecimi>({});
  const kayitlar = useMemo(() => kartlar.map((k) => k.kayit), [kartlar]);
  const aktif = K.filtreEtiketleri(sec, b).length > 0;
  const sonuc = useMemo(() => suzulmus(kartlar, '', sec, b), [kartlar, sec, b]);
  const etkinSayi = aktif ? sonuc.length : kayitlar.filter((x) => K.onayDurum(x, b) !== 'pasif').length;
  return (
    <details className="tc-my-hzf" open={aktif || undefined}>
      <summary>Seçerek süz ve kart bul</summary>
      {kartlar.length === 0 ? <p className="tc-my-kucuk">Katalog henüz boş.</p> : (
        <>
          <AktifSuzgecler sec={sec} adet={etkinSayi} degistir={secYaz} b={b} />
          <div className="tc-my-hzf-g">
            <Suzgecler liste={kayitlar} sec={sec} degistir={secYaz} b={b} />
            <div>
              {!aktif ? <p className="tc-my-kucuk">Sol taraftan özellik seçerek katalogdaki kartları daralt; bulduğun kartı açıp kullanabilirsin.</p>
                : sonuc.length ? (
                  <>
                    <ul className="tc-my-hz-liste">{sonuc.slice(0, SUZ_SINIRI).map((k) => <KartSatiri key={k.kimlik} x={k.kayit} />)}</ul>
                    {sonuc.length > SUZ_SINIRI && <p className="tc-my-kucuk">İlk 25 kart; süzgeci daralt ya da katalogda gör.</p>}
                  </>
                ) : <Tamam>Bu süzgeçle katalogda kart yok.</Tamam>}
            </div>
          </div>
        </>
      )}
    </details>
  );
}

function FavoriBolumu() {
  const { ortam } = useSihirbaz();
  if (!(ortam.malzemeAyari.favoriler ?? []).length) return null;
  return (
    <div className="tc-my-hz-fav">
      <span className="tc-my-etiket">Sık kullanılan kaliteler</span>
      <FavoriCipleri />
    </div>
  );
}

function HizliSonuc({ metin, yeniKart }: { metin: string; yeniKart: () => void }) {
  const { b } = useSihirbaz();
  const sonuc = K.hizliAra(metin, undefined, b);
  const p = sonuc.p;
  const anl: [string, string, string][] = [];
  if (p.grade && p.fam) {
    const g = K.grade({ ...K.newDraft(b), fam: p.fam, cls: p.cls, grade: p.grade }, b);
    const f = aileler(b)[p.fam];
    anl.push(['Kalite', g ? g.ad : p.grade, f ? `${f.ad} › ${f.classes[p.cls ?? '']?.ad ?? ''}` : '']);
  }
  const fm = p.form ? formlar()[p.form] : undefined;
  if (fm) anl.push(['Form', fm.ad, '']);
  if (fm && Object.keys(p.dims).length) {
    anl.push(['Ölçü', fm.dims.map(([k, ad, u]) => `${ad} ${fmt(p.dims[k])}${u && u !== 'mm' ? ` ${u}` : ''}${p.varsayilanOlcu.includes(k) ? ' (varsayılan)' : ''}`).join(' · '), '']);
  }
  Object.entries(p.opts).forEach(([k, v]) => {
    const o = p.fam ? aileler(b)[p.fam]?.opts.find((x) => x.k === k) : undefined;
    anl.push([o ? o.ad : k, Array.isArray(v) ? v.join(', ') : String(v), '']);
  });
  const hicYok = !sonuc.ayni.length && !sonuc.benzer.length && !sonuc.yakin.length && !sonuc.metin.length;
  return (
    <>
      {anl.length ? (
        <div className="tc-my-hz-anl">
          <span className="tc-my-etiket">Anladığım</span>
          <div className="tc-my-hz-anl-l">
            {anl.map(([a, c, e]) => <span key={a} className="tc-my-hz-c"><small>{a}</small><b>{c}</b>{e && <em>{e}</em>}</span>)}
          </div>
          {p.kalan.length > 0 && <p className="tc-my-kucuk">Anlaşılamayan: {p.kalan.join(', ')}</p>}
          {p.varsayilanOlcu.length > 0 && <p className="tc-my-kucuk">Varsayılan ölçüleri kart açarken kontrol et.</p>}
          {p.adaylar.length > 1 && (
            <p className="tc-my-kucuk">"{p.adaylar.map((a) => a.kod).join(', ')}" kalitelerinden {p.grade} seçildi; farklıysa kalite adını daha açık yaz.</p>
          )}
        </div>
      ) : <p className="tc-my-kucuk">Bir kalite tanıyamadım. Katalogdaki metin eşleşmelerine bak ya da aşağıdan türü seçerek devam et.</p>}
      {sonuc.ayni.length > 0 && (
        <div className="tc-my-hz-blok tc-my-hz-blok-ayni">
          <b>Bu malzeme katalogda var</b>
          <p className="tc-my-kucuk">Yeni kart açmak yerine mevcut kartı kullan.</p>
          <ul>{sonuc.ayni.map((r) => <KartSatiri key={r.x.id} x={r.x} neden={r.neden} vurgu />)}</ul>
        </div>
      )}
      {sonuc.benzer.length > 0 && (
        <div className="tc-my-hz-blok"><b>Benzer kartlar</b><ul>{sonuc.benzer.map((r) => <KartSatiri key={r.x.id} x={r.x} neden={r.neden} />)}</ul></div>
      )}
      {sonuc.yakin.length > 0 && (
        <div className="tc-my-hz-blok">
          <b>{p.form ? 'Aynı kalite ve formda diğer ölçüler' : 'Bu kalitedeki kartlar'}</b>
          <ul>{sonuc.yakin.map((x) => <KartSatiri key={x.id} x={x} />)}</ul>
        </div>
      )}
      {sonuc.metin.length > 0 && (
        <div className="tc-my-hz-blok"><b>Metinde geçen kartlar</b><ul>{sonuc.metin.map((x) => <KartSatiri key={x.id} x={x} />)}</ul></div>
      )}
      {hicYok && <Tamam>Katalogda bu malzeme yok.</Tamam>}
      {p.grade && (
        <div className="tc-my-eylemler">
          <Dugme tur={sonuc.ayni.length ? 'ikincil' : 'birincil'} simge="plus" onClick={yeniKart}>
            {sonuc.ayni.length ? 'Yine de yeni kart aç' : p.form ? 'Bu bilgilerle yeni kart aç' : 'Bu kaliteyle yeni kart aç'}
          </Dugme>
          {sonuc.ayni.length > 0 && <span className="tc-my-kucuk">Kaydederken mükerrer gerekçesi istenecek.</span>}
        </div>
      )}
    </>
  );
}
