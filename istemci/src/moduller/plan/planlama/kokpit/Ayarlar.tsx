import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, IsaretKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { AYAR_SECENEKLERI, degerAdi, surumMetni } from '../../motor-ayarlari/kurallar.ts';
import { altEkranAdresi } from '../gorunumler.ts';
import { kisitBul } from '../ic/veri/kurallar.ts';
import { bekleyenListesi, type CalismaKomutu } from '../kayit.ts';
import { hesapSuruyor, koy, uygulananiAl } from '../motor/coz.ts';
import { degerlendirmeHatasi, degerlendirmeIste } from '../siparis/degerlendirme.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  AYAR_ALANLARI, PANEL_KISITLARI, alanDegeri, alanYaz, ayarTaslagi, ayarlariYaz, etkiSatirlari, farklar, kisitYaz, ozetOku, sayiOku,
  type AyarAlani, type AyarTaslagi, type PlanOzeti,
} from './ayarlar.ts';

// Kokpit'in ayarlar paneli (3282 1b): Kokpit'in motorunun okuduğu çalışma ayarları. Değişiklik önce etkisiyle gösterilir: ayar çalışmaya
// bekleyen değişiklik olarak yazılır, sunucu planı bekleyenlerle yeniden dizer (plan-uygula, ADR 0018), panel önce ve sonrayı gösterir.
// "Uygula" hesaplanan planı alır, "Vazgeç" ayarı geri alır. Plan yoksa ayar yalnız yazılır. Motor ayarı ve dört göz kendi sayfalarındadır.

type Etki = { plan: Record<string, unknown>; dataVer: number; once: PlanOzeti | null; sonra: PlanOzeti; ayarIdleri: string[]; oteki: number };
type Durum = { tur: 'duzen' } | { tur: 'hesap' } | { tur: 'etki'; e: Etki } | { tur: 'hata'; ileti: string };

export interface AyarlarOzellikleri {
  c: PlanlamaCalismasi;
  komut: CalismaKomutu | null;
  yazabilir: boolean;
  kim: string;
  kapat: () => void;
  iste?: typeof degerlendirmeIste;
}

export function Ayarlar({ c, komut, yazabilir, kim, kapat, iste = degerlendirmeIste }: AyarlarOzellikleri) {
  const [t, setT] = useState<AyarTaslagi>(() => ayarTaslagi(c));
  // Hesap beklenirken çalışma değişir; sonuç en son çalışmayla eşlenir.
  const son = useRef(c); son.current = c;
  // Yazma ya da geri almadan sonra taslak yeni çalışmadan kurulur (o an elimizdeki çalışma eskidir).
  const [tazele, setTazele] = useState(false);
  useEffect(() => { if (tazele) { setT(ayarTaslagi(c)); setTazele(false); } }, [c, tazele]);
  const [durum, setDurum] = useState<Durum>({ tur: 'duzen' });
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [motor, setMotor] = useState<MotorAyarlariCevabi['guncel'] | { hata: string } | null>(null);
  useEffect(() => {
    let canli = true;
    api.get<MotorAyarlariCevabi>('/plan/motor-ayarlari').then((x) => { if (canli) setMotor(x.guncel); }, (h: unknown) => { if (canli) setMotor({ hata: hataIletisi(h, 'Motor ayarı okunamadı.') }); });
    return () => { canli = false; };
  }, []);
  const degisen = farklar(c, t);
  const kilitli = !yazabilir || komut === null || durum.tur === 'hesap' || durum.tur === 'etki';
  const hataVar = Object.keys(hatalar).length > 0;

  const etkisiniGor = async () => {
    if (komut === null || degisen.length === 0 || hataVar || hesapSuruyor()) return;
    const once = c.plan === null ? null : ozetOku(c.plan);
    const onceki = new Set(bekleyenListesi(c).map((b) => b.id));
    if (!komut.degistir('Plan ayarı değişti', (x) => ayarlariYaz(x, t), { ayrinti: degisen.join('; ') })) return;
    // Plan yoksa yeniden dizilecek plan da yoktur: ayar yazıldı, plan kurulunca etkir.
    if (c.plan === null) { setTazele(true); setDurum({ tur: 'duzen' }); return; }
    setDurum({ tur: 'hesap' }); koy(true);
    try {
      const surum = await komut.kaydet();
      if (surum === null) { setDurum({ tur: 'hata', ileti: 'Çalışma kaydedilemedi; etki hesaplanmadı. Ayar bekleyen değişiklik olarak kaldı.' }); return; }
      const cv = await iste(surum, { tur: 'plan-uygula', isler: ['*'] });
      const sonra = cv.sonuc.tur === 'plan-uygula' ? ozetOku(cv.sonuc.plan) : null;
      if (cv.sonuc.tur !== 'plan-uygula' || sonra === null) { setDurum({ tur: 'hata', ileti: 'Plan hesaplanırken veri değişti; etki gösterilemedi.' }); return; }
      const tum = bekleyenListesi(son.current).map((b) => b.id);
      setDurum({ tur: 'etki', e: { plan: cv.sonuc.plan, dataVer: cv.dataVer, once, sonra, ayarIdleri: tum.filter((id) => !onceki.has(id)), oteki: onceki.size } });
    } catch (h) {
      setDurum({ tur: 'hata', ileti: degerlendirmeHatasi(h).metin });
    } finally { koy(false); }
  };
  const uygula = (e: Etki) => {
    if (komut === null) return;
    let alindi = false;
    komut.degistir('Plan ayarı uygulandı', (x) => (alindi = uygulananiAl(x, e.plan, e.dataVer, bekleyenListesi(x).map((b) => b.id), kim, Date.now())), { planKoru: true, ayrinti: 'Bütün işler' });
    if (alindi) { setDurum({ tur: 'duzen' }); kapat(); } else setDurum({ tur: 'hata', ileti: 'Plan bu arada değişti; ayar bekleyen değişiklik olarak kaldı. Plan çubuğundan uygulanabilir.' });
  };
  const vazgec = (e: Etki) => {
    const geri = e.ayarIdleri.length > 0 && komut?.bekleyeniReddet ? komut.bekleyeniReddet(e.ayarIdleri, 'Ayarın etkisi görüldü; vazgeçildi') === null : komut?.geriAl() ?? false;
    if (geri) { setTazele(true); setDurum({ tur: 'duzen' }); } else setDurum({ tur: 'hata', ileti: 'Ayar geri alınamadı; Geri ile ya da plan çubuğundaki bekleyenlerden geri alın.' });
  };

  const alan = (a: AyarAlani) => {
    const v = alanDegeri(t, a); const h = hatalar[`${a.yer}.${a.k}`];
    if (a.tur === 'acik') return <IsaretKutusu key={a.k} etiket={a.etiket} checked={v === true} disabled={kilitli} onChange={(ev) => { setT(alanYaz(t, a, ev.target.checked)); }} />;
    const id = `tc-pyq-ayar-${a.k}`;
    return (
      <div key={a.k} className="tc-pyq-ayar-alan">
        <label htmlFor={id}>{a.etiket}{a.tur === 'sayi' && a.birim ? <small> ({a.birim})</small> : null}</label>
        {a.tur === 'sec' ? (
          <select id={id} className="tc-alan-kutu" value={typeof v === 'string' ? v : ''} disabled={kilitli} onChange={(ev) => { setT(alanYaz(t, a, ev.target.value)); }}>
            {a.secenekler.map(([d, ad]) => <option key={d} value={d}>{ad}</option>)}
          </select>
        ) : (
          <input
            id={id} className="tc-alan-kutu" type="number" inputMode="decimal" min={a.min} max={a.max} step={a.adim} disabled={kilitli} aria-invalid={h ? true : undefined}
            key={String(v)} defaultValue={typeof v === 'number' ? String(v) : ''} placeholder={v === null ? 'Motor varsayılanı' : undefined}
            onBlur={(ev) => {
              const r = sayiOku(a, ev.target.value); const k = `${a.yer}.${a.k}`;
              if ('hata' in r) { setHatalar({ ...hatalar, [k]: r.hata }); return; }
              const { [k]: _, ...kalan } = hatalar; setHatalar(kalan); setT(alanYaz(t, a, r.deger));
            }}
          />
        )}
        <small className={h ? 'tc-pyq-ayar-hata' : undefined} role={h ? 'alert' : undefined}>{h ?? a.ipucu}</small>
      </div>
    );
  };

  return (
    <aside className="tc-pyq-ayrinti tc-pyq-ayarlar" aria-label="Plan ayarları">
      <header>
        <div><b>Plan ayarları</b><small>Bu planın motoru bu ayarlarla dizer.</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Ayarları kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {!yazabilir && <p className="tc-pyq-not">Ayarları yalnız planı yazabilen kişi değiştirir.</p>}
      <h3>Zaman ve tampon</h3>
      {AYAR_ALANLARI.filter((a) => a.k !== 'mat').map(alan)}
      <h3>Kısıtlar</h3>
      {PANEL_KISITLARI.map((k) => (
        <IsaretKutusu key={k} etiket={kisitBul(k)?.ad ?? k} checked={t.acik[k] === true} disabled={kilitli} onChange={(ev) => { setT(kisitYaz(t, k, ev.target.checked)); }} />
      ))}
      {AYAR_ALANLARI.filter((a) => a.k === 'mat').map(alan)}
      <p className="tc-pyq-not">Öteki kısıtlar <Link to={altEkranAdresi({ ekran: 'veri', bolum: 'kisitlar' })}>Kısıtlar</Link> sayfasında.</p>

      <h3>Motor ve onay</h3>
      <dl>
        {motor === null ? <div><dt>Motor ayarı</dt><dd>okunuyor</dd></div>
          : 'hata' in motor ? <div><dt>Motor ayarı</dt><dd>{motor.hata}</dd></div>
            : (
              <>
                <div><dt>{AYAR_SECENEKLERI.kural.baslik}</dt><dd>{degerAdi('kural', motor.degerler.kural)}</dd></div>
                <div><dt>{AYAR_SECENEKLERI.amac.baslik}</dt><dd>{degerAdi('amac', motor.degerler.amac)}</dd></div>
                <div><dt>{AYAR_SECENEKLERI.bolmeKip.baslik}</dt><dd>{degerAdi('bolmeKip', motor.degerler.bolmeKip)}</dd></div>
              </>
            )}
      </dl>
      {motor !== null && !('hata' in motor) && <p className="tc-pyq-not">{surumMetni(motor)} Sıralama kuralı ve öteki motor ayarları bütün planlar içindir: <Link to="/plan/motor-ayarlari">Motor ayarları</Link>.</p>}
      <p className="tc-pyq-not">Dört göz (onaylayan gönderenden başkası olsun) <Link to="/ayarlar">Sistem Ayarları</Link> &gt; Plan altındadır.</p>
      {durum.tur === 'etki' ? (
        <section className="tc-pyq-ayar-etki" aria-label="Ayarın etkisi">
          <h3>Etkisi</h3>
          <dl>
            {etkiSatirlari(durum.e.once, durum.e.sonra).map((s) => (
              <div key={s.ad}><dt>{s.ad}</dt><dd data-yon={s.yon}>{s.once === null ? s.sonra : `${s.once} → ${s.sonra}`}</dd></div>
            ))}
          </dl>
          {durum.e.oteki > 0 && <p className="tc-pyq-not">{`Plan çubuğunda bekleyen ${String(durum.e.oteki)} değişiklik de bu hesaba katıldı; Uygula onları da uygular.`}</p>}
          <div className="tc-pyq-ayar-dugmeler">
            <Dugme tur="birincil" simge="check" onClick={() => { uygula(durum.e); }}>Uygula</Dugme>
            <Dugme tur="ikincil" simge="x" onClick={() => { vazgec(durum.e); }}>Vazgeç</Dugme>
          </div>
        </section>
      ) : (
        <section className="tc-pyq-ayar-etki" aria-label="Değişiklik">
          {degisen.length > 0 && <ul className="tc-pyq-ayar-fark">{degisen.map((d) => <li key={d}>{d}</li>)}</ul>}
          {durum.tur === 'hata' && <p className="tc-pyq-ayar-hata" role="alert">{durum.ileti}</p>}
          {yazabilir && (
            <div className="tc-pyq-ayar-dugmeler">
              <Dugme tur="ikincil" simge="play" disabled={kilitli || degisen.length === 0 || hataVar} onClick={() => { void etkisiniGor(); }}>
                {durum.tur === 'hesap' ? 'Hesaplanıyor' : c.plan === null ? 'Kaydet' : 'Etkisini gör'}
              </Dugme>
              {degisen.length > 0 && durum.tur !== 'hesap' && <Dugme tur="ikincil" onClick={() => { setT(ayarTaslagi(c)); setHatalar({}); setDurum({ tur: 'duzen' }); }}>Sıfırla</Dugme>}
            </div>
          )}
        </section>
      )}
    </aside>
  );
}

