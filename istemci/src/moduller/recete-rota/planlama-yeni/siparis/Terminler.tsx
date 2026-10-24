import { useState, type KeyboardEvent } from 'react';
import { Dugme, Kart, Rozet, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { Fasoncu, Malzeme, PlanVerisi, PlanlamaCalismasi } from '../tipler.ts';
import { DegerlendirmeKarti, MalzemeTerminleri, gorunumDegerlendiricisi } from './Degerlendirme.tsx';
import { Acilim, BosHarita, GorunumBasligi, IsiIzgarasi, Lejant, MotorKapali, TumSatirlar, izinYok, type Secim } from './IsiHaritasi.tsx';
import {
  AYAR_SINIRI, KAT_SINIRI, fasonDurumu, fasonKalemleri, fasonSatirlari, fasonTerminiYaz, gunYaz, katsayi, kayitliPlan, sayi, sinirliSayi,
  saatYaz, tarihGirdisi, tedarikliMalzemeler, terminAyari, terminIsisi, type FasonSatiri, type TerminAyari, type TerminSatiri,
} from './kurallar.ts';

// Terminler: fason kalemi × gün (zz30-isi ISI.terminler), satırın altında dönüş tarihi formu (zz25-sade-takvim SADE.terminler fason),
// "Tüm satırlar"da varsayılan termin, katsayılar ve fason dönüş terminleri (zv-termin sTerminler). Malzeme kalemleri motorun satın alma
// listesinden gelir ve kapalıdır (357 b). İşi ileri atma siparişin başlama tarihini yazar; o tarih Üretim emirlerindendir (222 a).

const GUN_TAHMIN = 'Tedarikçi tarih vermeden önce geliş, malzemenin tedarik süresinden tahmin edilir.';

// Sayı girdisi: değer alandan çıkınca ya da Enter'da yazılır (eski sayfanın change olayı).
function SayiGirdisi({ deger, etiket, min, max, adim, yer, yaz }: {
  deger: number | null; etiket: string; min: number; max: number; adim: number; yer?: string; yaz: (metin: string) => void;
}) {
  const [metin, metinYaz] = useState(deger == null ? '' : String(deger));
  const [onceki, oncekiYaz] = useState(deger);
  if (onceki !== deger) { oncekiYaz(deger); metinYaz(deger == null ? '' : String(deger)); }
  const bitir = () => { if (metin !== (deger == null ? '' : String(deger))) yaz(metin); };
  return (
    <input
      className="tc-alan-kutu tc-pys-sayi" type="number" min={min} max={max} step={adim} value={metin} placeholder={yer} aria-label={etiket}
      onChange={(e) => { metinYaz(e.target.value); }} onBlur={bitir}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') bitir(); }}
    />
  );
}

const tarih = (D: PlanVerisi, t: number | null | undefined) => (t == null || !Number.isFinite(t) ? '—' : <span className="mono">{gunYaz(D, t)}</span>);

function AyarKarti({ D, komut, uyar }: { D: PlanVerisi; komut: CalismaKomutu | null; uyar: (ileti: string) => void }) {
  const A = terminAyari(D);
  const orn = tedarikliMalzemeler(D)[0];
  const yaz = (k: keyof TerminAyari, metin: string) => {
    const s = AYAR_SINIRI[k]; const x = sinirliSayi(metin, s.min, s.max);
    if (x === null) { uyar('Geçerli bir sayı girin.'); return; }
    if (x === A[k] || !komut) return;
    komut.degistir('Varsayılan termin ayarı', (t) => {
      (t.D as Record<string, unknown>).terminAyar = { ...(typeof t.D.terminAyar === 'object' && t.D.terminAyar ? t.D.terminAyar : {}), [k]: x };
    }, { ayrinti: `${k}: ${A[k]} → ${x}` });
  };
  return (
    <Kart baslik="Varsayılan termin">
      <div className="tc-pys-alanlar">
        {(Object.keys(AYAR_SINIRI) as (keyof TerminAyari)[]).map((k) => (
          <label key={k} className="tc-pys-alan">
            <span>{AYAR_SINIRI[k].ad}</span>
            {komut
              ? <SayiGirdisi deger={A[k]} etiket={AYAR_SINIRI[k].ad} min={AYAR_SINIRI[k].min} max={AYAR_SINIRI[k].max} adim={AYAR_SINIRI[k].adim} yaz={(m) => { yaz(k, m); }} />
              : <b className="mono">{sayi(A[k], 2)}</b>}
          </label>
        ))}
      </div>
      <p className="tc-pys-kucuk">
        Katsayının iki işi var: termin gelene kadar planda boşluk kalmasın diye malzemenin ve fasonun ne zaman geleceğini varsayar, ve satın almaya referans
        termin verir (tedarikçiden en geç bu tarih istenir). Referans siparişle birlikte saklanır; tedarikçinin verdiği termin referanstan geçse durum "plan
        güncellenmeli" olur. Hesap: malzemede tedarik süresi × katsayı + miktarla orantılı ek gün, fasonda fasoncunun süresi × katsayı + adetle orantılı ek gün.
        {orn && ` Örnek: ${orn.kod} tedarik ${sayi(orn.tedarikGun, 0)} gün × ${sayi(A.katMal, 2)}${A.ekMal ? ` + 100 birim başına ${sayi(A.ekMal, 1)} gün` : ''} = ${sayi((orn.tedarikGun ?? 0) * A.katMal, 1)} gün${A.ekMal ? ' + miktar payı' : ''}.`}
        {' '}Girilen termin kesinleşen süredir ve katsayının yerine geçer. Plana girmesine {sayi(A.esik, 0)} gün kalmış ve termini olmayan malzeme siparişi yok
        sayılır, fason için uyarı çıkar.
      </p>
    </Kart>
  );
}

type KatSatiri = { tur: 'mal'; x: Malzeme } | { tur: 'fas'; x: Fasoncu };

function KatsayiKarti({ D, komut, uyar }: { D: PlanVerisi; komut: CalismaKomutu | null; uyar: (ileti: string) => void }) {
  const A = terminAyari(D);
  const yaz = (r: KatSatiri, k: 'terminKat' | 'terminEk', metin: string) => {
    const s = KAT_SINIRI[k]; const x = metin.trim() === '' ? null : sinirliSayi(metin, s.min, s.max);
    if (metin.trim() !== '' && x === null) { uyar('Geçerli bir sayı girin.'); return; }
    if (!komut) return;
    const kimlik = r.tur === 'mal' ? r.x.kod : r.x.id; const once = r.x[k];
    komut.degistir(r.tur === 'mal' ? 'Malzeme termin katsayısı' : 'Fasoncu termin katsayısı', (t) => {
      const l = (r.tur === 'mal' ? t.D.malzemeler : t.D.fasoncular) ?? [];
      const o = (l as (Malzeme | Fasoncu)[]).find((y) => (r.tur === 'mal' ? (y as Malzeme).kod : (y as Fasoncu).id) === kimlik) as Record<string, unknown> | undefined;
      if (!o) return false;
      if (x == null) delete o[k]; else o[k] = x;
      return true;
    }, { ayrinti: `${kimlik} ${k === 'terminKat' ? 'katsayı' : 'ek gün'}: ${once == null ? 'genel' : String(once as number)} → ${x ?? 'genel'}` });
  };
  const gir = (r: KatSatiri, k: 'terminKat' | 'terminEk', genel: number, ad: string) => {
    const v = r.x[k] == null ? null : Number(r.x[k]);
    return komut
      ? <SayiGirdisi deger={v} etiket={ad} min={KAT_SINIRI[k].min} max={KAT_SINIRI[k].max} adim={0.1} yer={sayi(genel, 2)} yaz={(m) => { yaz(r, k, m); }} />
      : <span className="mono">{v == null ? '—' : sayi(v, 2)}</span>;
  };
  const mal: KatSatiri[] = tedarikliMalzemeler(D).map((x) => ({ tur: 'mal', x }));
  const fas: KatSatiri[] = (D.fasoncular ?? []).map((x) => ({ tur: 'fas', x }));
  const malSut: Sutun<KatSatiri>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (r) => r.tur === 'mal' && <><b className="mono">{r.x.kod}</b> <span className="tc-pys-kucuk">{r.x.ad ?? ''}</span></> },
    { anahtar: 'tedarik', baslik: 'Tedarik', hizala: 'sag', hucre: (r) => r.tur === 'mal' && <span className="mono">{sayi(r.x.tedarikGun, 0)} gün</span> },
    { anahtar: 'kat', baslik: 'Katsayı ×', hizala: 'sag', hucre: (r) => r.tur === 'mal' && gir(r, 'terminKat', A.katMal, `${r.x.kod} katsayı`) },
    { anahtar: 'ek', baslik: 'Ek gün / 100 birim', hizala: 'sag', hucre: (r) => r.tur === 'mal' && gir(r, 'terminEk', A.ekMal, `${r.x.kod} ek gün`) },
    { anahtar: 'sure', baslik: 'Varsayılan süre', hizala: 'sag', hucre: (r) => r.tur === 'mal' && (
      <><b className="mono">{sayi((r.x.tedarikGun ?? 0) * katsayi(r.x, 'terminKat', A.katMal), 1)} gün</b><small className="tc-pys-not">{r.x.terminKat != null ? 'malzemenin kendi' : 'genel'}</small></>) },
  ];
  const fasSut: Sutun<KatSatiri>[] = [
    { anahtar: 'fasoncu', baslik: 'Fasoncu', hucre: (r) => r.tur === 'fas' && <><b>{r.x.ad ?? r.x.id}</b><small className="tc-pys-not mono">{r.x.id}</small></> },
    { anahtar: 'sure', baslik: 'Süre', hizala: 'sag', hucre: (r) => r.tur === 'fas' && <span className="mono">{sayi(+(r.x.sureGun ?? 0) || 1, 1)} gün</span> },
    { anahtar: 'kat', baslik: 'Katsayı ×', hizala: 'sag', hucre: (r) => r.tur === 'fas' && gir(r, 'terminKat', A.katFas, `${r.x.ad ?? r.x.id} katsayı`) },
    { anahtar: 'ek', baslik: 'Ek gün / 100 adet', hizala: 'sag', hucre: (r) => r.tur === 'fas' && gir(r, 'terminEk', A.ekFas, `${r.x.ad ?? r.x.id} ek gün`) },
    { anahtar: 'donus', baslik: 'Varsayılan dönüş', hizala: 'sag', hucre: (r) => r.tur === 'fas' && (
      <><b className="mono">{sayi((+(r.x.sureGun ?? 0) || 1) * katsayi(r.x, 'terminKat', A.katFas), 1)} gün</b><small className="tc-pys-not">{r.x.terminKat != null ? 'firmanın kendi' : 'genel'}</small></>) },
  ];
  return (
    <Kart baslik="Malzeme ve fasoncu başına katsayı">
      <p className="tc-pys-kucuk">Varsayılan termin malzemeye ve fason firmasına göre değişir. Boş bırakılan alan genel katsayıyı kullanır (gri yazılan değer).</p>
      <Tablo etiket="Malzeme katsayıları" sutunlar={malSut} satirlar={mal} satirAnahtari={(r) => (r.tur === 'mal' ? r.x.kod : r.x.id)} bosMesaj="Tedarik süresi girilmiş malzeme yok." />
      <Tablo etiket="Fasoncu katsayıları" sutunlar={fasSut} satirlar={fas} satirAnahtari={(r) => (r.tur === 'mal' ? r.x.kod : r.x.id)} bosMesaj="Fasoncu yok." />
    </Kart>
  );
}

function FasonDonusu({ D, x, komut }: { D: PlanVerisi; x: FasonSatiri; komut: CalismaKomutu | null }) {
  if (!komut) return tarih(D, x.T);
  return (
    <input
      className="tc-alan-kutu tc-pys-tarih" type="date" value={tarihGirdisi(D, x.T)} aria-label={`${x.id} fason dönüş termini`}
      onChange={(e) => {
        const v = e.target.value;
        komut.degistir(v ? 'Fason dönüş termini girildi' : 'Fason dönüş termini silindi', (t) => { fasonTerminiYaz(t, x.id, v); }, { ayrinti: `${x.id}: ${v || '—'}` });
      }}
    />
  );
}

export function FasonTerminKarti({ c, L, komut, sadeceBos }: { c: PlanlamaCalismasi; L: FasonSatiri[]; komut: CalismaKomutu | null; sadeceBos: boolean }) {
  const D = c.D; const A = terminAyari(D);
  const l = sadeceBos ? L.filter((x) => x.T == null) : L;
  const sut: Sutun<FasonSatiri>[] = [
    { anahtar: 'is', baslik: 'İş', hucre: (x) => <><b className="mono">{x.id}</b><small className="tc-pys-not">{x.s.ad ?? ''} · {sayi(x.adet, 0)} adet</small></> },
    { anahtar: 'fasoncu', baslik: 'Fasoncu', hucre: (x) => x.f?.ad ?? x.r.m },
    { anahtar: 'durum', baslik: 'Durum', hucre: (x) => { const [d, ton] = fasonDurumu(x); return <Rozet ton={ton}>{d}</Rozet>; } },
    { anahtar: 'cikis', baslik: 'Çıkış', kirilmaz: true, hucre: (x) => tarih(D, x.r.S) },
    { anahtar: 'gerekli', baslik: 'Gerekli dönüş', kirilmaz: true, hucre: (x) => tarih(D, x.ger) },
    { anahtar: 'engec', baslik: 'En geç', kirilmaz: true, hucre: (x) => tarih(D, x.enGec) },
    { anahtar: 'termin', baslik: 'Dönüş termini', hucre: (x) => <><FasonDonusu D={D} x={x} komut={komut} /><small className="tc-pys-not">referans {saatYaz(D, x.ref ?? x.tahmini).slice(0, 9)}</small></> },
    { anahtar: 'planda', baslik: 'Planda dönüş', kirilmaz: true, hucre: (x) => <>{tarih(D, x.r.C)}<small className="tc-pys-not">{x.T == null ? 'referans terminden' : 'terminden'}</small></> },
  ];
  return (
    <Kart baslik="Fason dönüş terminleri">
      <Tablo etiket="Fason dönüş terminleri" sutunlar={sut} satirlar={l} satirAnahtari={(x) => x.id} bosMesaj={sadeceBos ? 'Termini beklenen fason yok.' : 'Planda fason yok.'} />
      <p className="tc-pys-kucuk">
        Gerekli dönüş: işin sonraki adımının planlanan başlangıcı (son adımsa sipariş termini). En geç: siparişin terminini kaçırmadan dönebileceği son gün.
        Termin girilmeyen fasonda dönüş, fasoncunun süresi × katsayısından (fasoncunun kendi katsayısı, yoksa genel {sayi(A.katFas, 2)})
        {A.ekFas ? ` + 100 adet başına ${sayi(A.ekFas, 1)} gün` : ''} tahmin edilir; girilen termin kesin süredir ve plan onu kullanır.
      </p>
    </Kart>
  );
}

function DonusFormu({ D, x, kaydet }: { D: PlanVerisi; x: FasonSatiri; kaydet: (t: string) => void }) {
  const [t, tYaz] = useState(tarihGirdisi(D, x.T));
  const [hata, hataYaz] = useState<string | null>(null);
  return (
    <form className="tc-pys-f" aria-label="Fason dönüş tarihi" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) { hataYaz('Dönüş tarihini girin.'); return; }
      kaydet(t);
    }}>
      <label className="tc-pys-alan">
        <span>Dönüş tarihi</span>
        <input className="tc-alan-kutu" type="date" required value={t} aria-label="Dönüş tarihi" onChange={(e) => { tYaz(e.target.value); hataYaz(null); }} />
        <small className="tc-pys-not">Sonraki adım {gunYaz(D, x.ger)} başlıyor; sipariş gecikmeden en geç {gunYaz(D, x.enGec)}</small>
      </label>
      {hata && <p className="tc-pys-hata" role="alert">{hata}</p>}
      <Dugme tur="birincil" type="submit" simge="check">Kaydet</Dugme>
    </form>
  );
}

export function Terminler({ calisma, komut, yetki, git, depo, yenile }: PlanlamaEkranOzellikleri) {
  const [secim, secimYaz] = useState<Secim | null>(null);
  const [son, sonYaz] = useState<string | null>(null);
  const { bildir } = useBildirim();
  const uyar = (ileti: string) => { bildir('hata', ileti); };
  const p = kayitliPlan(calisma);
  const L = calisma && p ? fasonSatirlari(calisma, p) : [];

  const tum = calisma && (
    <TumSatirlar>
      <AyarKarti D={calisma.D} komut={komut} uyar={uyar} />
      <KatsayiKarti D={calisma.D} komut={komut} uyar={uyar} />
      {p
        ? (
          <>
            <MotorKapali baslik="Malzeme: termin bekleyenler" ne={`${GUN_TAHMIN} Termini bekleyen malzemeler, tedarikçi termini girişi ve termin girerek sipariş verme motorun satın alma listesinden gelir.`} />
            <FasonTerminKarti c={calisma} L={L} komut={komut} sadeceBos />
          </>
        )
        : <Kart baslik="Terminler"><p className="tc-pys-kucuk">Önce plan kurulmalı.</p></Kart>}
    </TumSatirlar>
  );

  if (!calisma || !p) {
    return (
      <div className="tc-pys" data-parca="terminler">
        <GorunumBasligi simge="flag" baslik="Malzeme ve fason terminleri" />
        <BosHarita metin="Henüz plan yok; malzemenin ve fasonun ne zaman gerektiği plandan çıkar.">
          {yetki.planYaz && <Dugme tur="birincil" simge="play" onClick={() => { git('plan'); }}>Planı kur</Dugme>}
        </BosHarita>
        {tum}
      </div>
    );
  }

  const c = calisma;
  const V = terminIsisi(c, fasonKalemleri(c.D, L));
  const sec = (s: Secim | null) => { secimYaz(s); sonYaz(null); };
  const acilim = (r: TerminSatiri) => {
    const x = r.kalem.x;
    const kaydet = (t: string) => {
      if (!komut) return;
      if (komut.degistir('Fason dönüş termini girildi', (taslak) => { fasonTerminiYaz(taslak, x.id, t); }, { ayrinti: `${x.id}: ${t}` })) sonYaz(`${x.id} dönüşü ${t} oldu`);
    };
    const form = !komut ? izinYok : son
      ? <p className="tc-pys-son" role="status"><Simge ad="check" boyut="k" /><span><b>{son}</b> {planGuncel(c) ? 'Kaydedildi.' : 'İş plana bu dönüş tarihiyle yeni çözümde girer.'}</span></p>
      : <DonusFormu key={x.id} D={c.D} x={x} kaydet={kaydet} />;
    return (
      <Acilim
        baslik={`${r.ad} · ${r.kalem.durum}`} ton={r.ton} neden={r.kalem.neden} bilgi={r.kalem.bilgi.slice(0, 4)} form={form} kapat={() => { sec(null); }}
      />
    );
  };

  return (
    <div className="tc-pys" data-parca="terminler">
      <GorunumBasligi
        simge="flag" baslik="Malzeme ve fason terminleri" alt="Kalem × gün, neyi bekliyor" ust={V.ust}
        eylem={!planGuncel(c) && yetki.planYaz ? <Dugme tur="birincil" simge="play" onClick={() => { git('plan'); }}>Planı iyileştir</Dugme> : undefined}
      />
      <section className="tc-pys-ana" aria-label="Isı haritası">
        <Lejant
          ogeler={[{ tur: 'kd', kd: 2, ad: 'Bekleme' }, { tur: 'kd', kd: 4, ad: 'İşi kaydıran bekleme' }, { tur: 'iyi', ad: 'Zamanında geliş' }, { tur: 'is', ad: 'Yolda / fasoncuda' }, { tur: 'tahmin', ad: 'Tahmini tarih' }, { tur: 'bayrak', ad: 'Plan istiyor' }]}
          simgeler={[['truck', 'Fason']]}
        />
        {V.satirlar.length
          ? <IsiIzgarasi etiket="Kalem × gün, neyi bekliyor" satirAd="Kalem" genis="gun" sutunlar={V.sutunlar} satirlar={V.satirlar} secim={secim} sec={sec} gizliAd="zamanında gelenler" acilim={acilim} />
          : <BosHarita simge="truck" metin="Planda fason yok." />}
      </section>
      <DegerlendirmeKarti baslik="Malzeme kalemleri" ne="Satın alınan malzemenin plana göre ne zaman gerektiği ve ne zaman geleceği motorun satın alma listesinden çıkar." istek={{ tur: 'malzeme-terminleri' }} degerlendir={gorunumDegerlendiricisi(depo)} yenile={yenile}>
        {(x) => <MalzemeTerminleri cevap={x} />}
      </DegerlendirmeKarti>
      {tum}
    </div>
  );
}
