import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, IsaretKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { AYAR_SECENEKLERI, degerAdi, surumMetni } from '../../motor-ayarlari/kurallar.ts';
import { altEkranAdresi } from '../gorunumler.ts';
import { kisitBul } from '../ic/veri/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  AYAR_ALANLARI, PANEL_KISITLARI, YON_ALANLARI, alanDegeri, alanYaz, ayarTaslagi, farklar, kisitYaz, sayiOku,
  type AyarAlani, type AyarTaslagi,
} from './ayarlar.ts';
import { EtkiBolumu, useEtki } from './etki.tsx';
import { ayarKomutu, type TaslakYazici } from './taslak.ts';

// Kokpit'in ayarlar paneli (3282 1b): Kokpit'in motorunun okuduğu çalışma ayarları. Değişiklik kişinin taslağına yazılır ve önce
// etkisiyle gösterilir (etki.tsx).
// Motor ayarı ve dört göz kendi sayfalarındadır.

export interface AyarlarOzellikleri {
  c: PlanlamaCalismasi;
  taslak: TaslakYazici | null;
  yazabilir: boolean;
  kim: string;
  kapat: () => void;
  // Üst şeritteki yön düğmesinden açılınca taslak o yönle başlar.
  yon?: 'ileri' | 'geri' | null;
}

export function Ayarlar({ c, taslak, yazabilir, kapat, yon = null }: AyarlarOzellikleri) {
  const [t, setT] = useState<AyarTaslagi>(() => {
    const t0 = ayarTaslagi(c), a = AYAR_ALANLARI.find((x) => x.k === 'yon');
    return yon !== null && a ? alanYaz(t0, a, yon) : t0;
  });
  const [tazele, setTazele] = useState(false);
  useEffect(() => { if (tazele) { setT(ayarTaslagi(c)); setTazele(false); } }, [c, tazele]);
  const { durum, setDurum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: (x) => { if (x === 'uygulandi') kapat(); else setTazele(true); } });
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [motor, setMotor] = useState<MotorAyarlariCevabi['guncel'] | { hata: string } | null>(null);
  useEffect(() => {
    let canli = true;
    api.get<MotorAyarlariCevabi>('/plan/motor-ayarlari').then((x) => { if (canli) setMotor(x.guncel); }, (h: unknown) => { if (canli) setMotor({ hata: hataIletisi(h, 'Motor ayarı okunamadı.') }); });
    return () => { canli = false; };
  }, []);
  const degisen = farklar(c, t);
  const kilitli = !yazabilir || taslak === null || durum.tur === 'hesap' || durum.tur === 'etki';
  const hataVar = Object.keys(hatalar).length > 0;

  const etkisiniGor = async () => {
    if (degisen.length === 0 || hataVar) return;
    const k = ayarKomutu(c, t, degisen.join('; '));
    if (k !== null) await dene(k);
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
      <h3>Yön</h3>
      {AYAR_ALANLARI.filter((a) => YON_ALANLARI.has(a.k)).map(alan)}
      <h3>Zaman ve tampon</h3>
      {AYAR_ALANLARI.filter((a) => a.k !== 'mat' && !YON_ALANLARI.has(a.k)).map(alan)}
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
        <EtkiBolumu ad="Ayarın etkisi" e={durum.e} uygula={() => { void uygula(durum.e); }} vazgec={() => { void vazgec(); }} />
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

