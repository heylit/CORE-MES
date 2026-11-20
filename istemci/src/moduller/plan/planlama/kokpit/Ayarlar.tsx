import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MotorAyarlari, MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, IsaretKutusu, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { ACIL_PAY, ACIL_PAY_SINIRI, AYAR_SECENEKLERI, FASON_GUN, degerAdi, gunMetni, gunOku, secilebilir, secimDegeri, surumMetni, yuzdeMetni, yuzdeOku, type SecimAyari } from '../../motor-ayarlari/kurallar.ts';
import { altEkranAdresi } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  AYAR_ALANLARI, PANEL_KISITLARI, panelKisitAdi, alanDegeri, alanYaz, ayarTaslagi, farklar, kisitYaz, planYonu, sayiOku,
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
  // Üst şeritteki yön düğmesinden açılınca taslak o yönle başlar ve etkisi sorulmadan hesaplanır.
  yon?: 'ileri' | 'geri' | null;
  // Etki ekrandayken (Uygula ya da Vazgeç bekliyor) true: sayfa ikinci bir birincil düğmeyi kapatır.
  etkiBekliyor?: (bekliyor: boolean) => void;
  // 3487: motor ayarını değiştirebilen kişi (plan.motor-ayari) panelde değiştirir; kayıt bütün planlar içindir, sonra çalışma yeniden okunur.
  motorYazabilir?: boolean;
  motorDegisti?: () => void;
}

const YON_ADI = { ileri: 'İleriye', geri: 'Teslimden geriye' } as const;

export function Ayarlar({ c, taslak, yazabilir, kapat, yon = null, etkiBekliyor, motorYazabilir = false, motorDegisti }: AyarlarOzellikleri) {
  const [t, setT] = useState<AyarTaslagi>(() => {
    const t0 = ayarTaslagi(c), a = AYAR_ALANLARI.find((x) => x.k === 'yon');
    return yon !== null && a ? alanYaz(t0, a, yon) : t0;
  });
  // Yön paneli açıldığı andaki yönü yazar: komut taslağa girince plan yeni yönü gösterir, başlık "eski → yeni" kalmalıdır.
  const [oncekiYon] = useState(() => planYonu(c));
  const [tazele, setTazele] = useState(false);
  useEffect(() => { if (tazele) { setT(ayarTaslagi(c)); setTazele(false); } }, [c, tazele]);
  const { durum, setDurum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: (x) => { if (x === 'uygulandi' || yon !== null) kapat(); else setTazele(true); } });
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [motor, setMotor] = useState<MotorAyarlariCevabi['guncel'] | { hata: string } | null>(null);
  useEffect(() => {
    let canli = true;
    api.get<MotorAyarlariCevabi>('/plan/motor-ayarlari').then((x) => { if (canli) setMotor(x.guncel); }, (h: unknown) => { if (canli) setMotor({ hata: hataIletisi(h, 'Motor ayarı okunamadı.') }); });
    return () => { canli = false; };
  }, []);
  const etkide = durum.tur === 'etki';
  useEffect(() => { etkiBekliyor?.(etkide); return () => { etkiBekliyor?.(false); }; }, [etkide, etkiBekliyor]);
  const degisen = farklar(c, t);
  const kilitli = !yazabilir || taslak === null || durum.tur === 'hesap' || durum.tur === 'etki';
  const hataVar = Object.keys(hatalar).length > 0;

  const etkisiniGor = async () => {
    if (degisen.length === 0 || hataVar) return;
    const k = ayarKomutu(c, t, degisen.join('; '));
    if (k !== null) await dene(k);
  };
  // Yön düğmesi tek dokunuşta sonucunu gösterir: kişi "Etkisini gör"ü aramaz, Uygula ya da Vazgeç der.
  const yonDenendi = useRef(false);
  useEffect(() => {
    if (yonDenendi.current || yon === null || yon === planYonu(c) || !yazabilir || taslak === null) return;
    yonDenendi.current = true;
    void etkisiniGor();
  });

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
        <small className={h ? 'tc-pyq-ayar-hata' : undefined} role={h ? 'alert' : undefined}>{h ?? (a.tur === 'sec' && typeof v === 'string' ? a.ipucuSecim?.[v] : undefined) ?? a.ipucu}</small>
      </div>
    );
  };

  // Yön düğmesinden açılan panelde etki ve Uygula en üsttedir: uzun ayar listesinin altında aranmaz.
  const eylem = durum.tur === 'etki' ? (
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
  );

  // Üst şeritteki Yön seçiminden açıldıysa (3304 a) panel yalnız yönün etkisini taşır: öteki ayarlar Araçlar > Ayarlar'dadır.
  if (yon !== null) {
    return (
      <aside className="tc-pyq-ayrinti tc-pyq-ayarlar" aria-label="Tüm planın yönü">
        <header>
          <div><b>Tüm planın yönü</b><small>{YON_ADI[oncekiYon]} → {YON_ADI[yon]}</small></div>
          <button type="button" className="tc-pyq-simge-dugme" aria-label="Yönü kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
        </header>
        {eylem}
      </aside>
    );
  }
  return (
    <aside className="tc-pyq-ayrinti tc-pyq-ayarlar" aria-label="Plan ayarları">
      <header>
        <div><b>Plan ayarları</b><small>Bu planın motoru bu ayarlarla dizer.</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Ayarları kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {!yazabilir && <p className="tc-pyq-not">Ayarları yalnız planı yazabilen kişi değiştirir.</p>}
      <h3>Zaman, süre ve tampon</h3>
      {AYAR_ALANLARI.filter((a) => a.k !== 'mat' && a.k !== 'yon').map(alan)}
      <h3>Kısıtlar</h3>
      {PANEL_KISITLARI.map((k) => (
        <IsaretKutusu key={k} etiket={panelKisitAdi(k)} checked={t.acik[k] === true} disabled={kilitli} onChange={(ev) => { setT(kisitYaz(t, k, ev.target.checked)); }} />
      ))}
      {AYAR_ALANLARI.filter((a) => a.k === 'mat').map(alan)}
      <p className="tc-pyq-not">Aç kapa olmayanlar: tezgâhta aynı anda tek iş (tezgâh iki işi birden yapamaz) ve vardiya saatleri (Takvim sayfasından değişir). Süren iş de taşınır: durdurulmuş sayılır, yapılan kısım yerinde kalır, kalan adet yeni yerine planlanır; biten iş taşınmaz. Elle taşıdığınız işin yeri sizin kararınızdır; Geri al ile kalkar. Açıklamalar <Link to={altEkranAdresi({ ekran: 'veri', bolum: 'kisitlar' })}>Kısıtlar</Link> sayfasında.</p>

      <h3>Motor ve onay</h3>
      {motor === null ? <dl><div><dt>Motor ayarı</dt><dd>okunuyor</dd></div></dl>
        : 'hata' in motor ? <dl><div><dt>Motor ayarı</dt><dd>{motor.hata}</dd></div></dl>
          : motorYazabilir ? <MotorFormu key={motor.surumId ?? 0} g={motor} kaydedildi={(x) => { setMotor(x); motorDegisti?.(); }} />
            : (
              <dl>
                <div><dt>{AYAR_SECENEKLERI.kural.baslik}</dt><dd>{degerAdi('kural', motor.degerler.kural)}</dd></div>
                <div><dt>{AYAR_SECENEKLERI.amac.baslik}</dt><dd>{degerAdi('amac', motor.degerler.amac)}</dd></div>
                <div><dt>{AYAR_SECENEKLERI.bolmeKip.baslik}</dt><dd>{degerAdi('bolmeKip', motor.degerler.bolmeKip)} (en çok {motor.degerler.bolmeMaks} pay)</dd></div>
                <div><dt>{AYAR_SECENEKLERI.eksikStok.baslik}</dt><dd>{degerAdi('eksikStok', motor.degerler.eksikStok)}</dd></div>
                <div><dt>{ACIL_PAY.baslik}</dt><dd>{yuzdeMetni(motor.degerler.acilPay)}</dd></div>
              </dl>
            )}
      {motor !== null && !('hata' in motor) && <p className="tc-pyq-not">{surumMetni(motor)} Sıralama kuralı ve öteki motor ayarları bütün planlar içindir{motorYazabilir ? '; kaydedince yeni ayar bir sonraki Planla ya da Planı kur ile plana girer' : ''}: <Link to="/plan/motor-ayarlari">Motor ayarları</Link>.</p>}
      <p className="tc-pyq-not">Dört göz (onaylayan gönderenden başkası olsun) <Link to="/ayarlar">Sistem Ayarları</Link> &gt; Plan altındadır.</p>
      {eylem}
    </aside>
  );
}


// 3487: Kokpit'te motor ayarı (Motor ayarları sayfasıyla aynı uç ve yetki, plan.motor-ayari). Okunan sürümle yazılır; arada başkası
// yazdıysa sunucu reddeder (1786), panel güncel ayarı yeniden okur.
const MOTOR_SECIMLERI: readonly SecimAyari[] = ['kural', 'amac', 'bolmeKip', 'bolmeMaks', 'eksikStok', 'ogrenme'];
function MotorFormu({ g, kaydedildi }: { g: MotorAyarlariCevabi['guncel']; kaydedildi: (x: MotorAyarlariCevabi['guncel']) => void }) {
  const { bildir } = useBildirim();
  const d = g.degerler;
  const [f, setF] = useState<MotorAyarlari>(d);
  const [pay, setPay] = useState(yuzdeMetni(d.acilPay));
  const [gun, setGun] = useState(String(d.fasonGun));
  const [yaziyor, setYaziyor] = useState(false);
  const payOrani = yuzdeOku(pay, ACIL_PAY_SINIRI), fasonGun = gunOku(gun);
  const degisti = MOTOR_SECIMLERI.some((k) => f[k] !== d[k]) || (payOrani !== null && payOrani !== d.acilPay) || (fasonGun !== null && fasonGun !== d.fasonGun);
  const kaydet = async (): Promise<void> => {
    if (payOrani === null || fasonGun === null) return;
    setYaziyor(true);
    try {
      const c = await api.post<MotorAyarlariCevabi>('/plan/motor-ayarlari', { ...f, acilPay: payOrani, fasonGun, surumId: g.surumId });
      bildir('tamam', 'Motor ayarları kaydedildi; bir sonraki Planla ile plana girer.');
      kaydedildi(c.guncel);
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Motor ayarları kaydedilemedi.'));
      try { kaydedildi((await api.get<MotorAyarlariCevabi>('/plan/motor-ayarlari')).guncel); } catch { /* okunamazsa form eldeki değerle kalır */ }
    } finally {
      setYaziyor(false);
    }
  };
  return (
    <div className="tc-pyq-ayar-motor" role="group" aria-label="Motor ayarları">
      {MOTOR_SECIMLERI.map((k) => {
        const id = `tc-pyq-motor-${k}`;
        return (
          <div key={k} className="tc-pyq-ayar-alan">
            <label htmlFor={id}>{AYAR_SECENEKLERI[k].baslik}</label>
            <select id={id} className="tc-alan-kutu" value={String(f[k])} disabled={yaziyor} onChange={(ev) => { const v = secimDegeri(k, ev.target.value); if (v !== null) setF({ ...f, [k]: v }); }}>
              {secilebilir(k, d[k]).map((x) => <option key={x.deger} value={x.deger}>{x.baslik}</option>)}
            </select>
            <small>{AYAR_SECENEKLERI[k].ipucu}</small>
          </div>
        );
      })}
      <div className="tc-pyq-ayar-alan">
        <label htmlFor="tc-pyq-motor-acilPay">{ACIL_PAY.baslik}</label>
        <input id="tc-pyq-motor-acilPay" className="tc-alan-kutu" inputMode="decimal" value={pay} disabled={yaziyor} aria-invalid={payOrani === null ? true : undefined} onChange={(ev) => { setPay(ev.target.value); }} />
        <small className={payOrani === null ? 'tc-pyq-ayar-hata' : undefined} role={payOrani === null ? 'alert' : undefined}>{payOrani === null ? '0 ile 30 arasında bir sayı girin.' : ACIL_PAY.ipucu}</small>
      </div>
      <div className="tc-pyq-ayar-alan">
        <label htmlFor="tc-pyq-motor-fasonGun">{FASON_GUN.baslik}</label>
        <input id="tc-pyq-motor-fasonGun" className="tc-alan-kutu" inputMode="numeric" value={gun} disabled={yaziyor} aria-invalid={fasonGun === null ? true : undefined} onChange={(ev) => { setGun(ev.target.value); }} />
        <small className={fasonGun === null ? 'tc-pyq-ayar-hata' : undefined} role={fasonGun === null ? 'alert' : undefined}>{fasonGun === null ? '1 ile 90 arasında bir tam sayı girin.' : `${FASON_GUN.ipucu} Şu an ${gunMetni(d.fasonGun)}.`}</small>
      </div>
      <div className="tc-pyq-ayar-dugmeler">
        <Dugme tur="ikincil" simge="check" disabled={!degisti || payOrani === null || fasonGun === null} yukleniyor={yaziyor} onClick={() => { void kaydet(); }}>{yaziyor ? 'Kaydediliyor' : 'Motor ayarını kaydet'}</Dugme>
      </div>
    </div>
  );
}
