import { useState } from 'react';
import type { MotorAyarlari, MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { ACIL_PAY, ACIL_PAY_SINIRI, AYAR_SECENEKLERI, FASON_GUN, degerAdi, gunMetni, gunOku, secilebilir, secimDegeri, surumMetni, yuzdeMetni, yuzdeOku, type SecimAyari } from '../../motor-ayarlari/kurallar.ts';

// Motor bölümü (811, 3487, 3561): bütün planlar içindir, kayıt yeni sürümdür. Okunan sürümle yazılır; arada başkası yazdıysa sunucu reddeder
// (1786), güncel ayar yeniden okunur. Açık taslak kendi sürümünde kalır; değişiklik sonraki Planı güncelle ile plana girer.
const MOTOR_SECIMLERI: readonly SecimAyari[] = ['kural', 'amac', 'bolmeKip', 'bolmeMaks', 'eksikStok', 'ogrenme'];
type Guncel = MotorAyarlariCevabi['guncel'];

export function MotorBolumu({ g, yazabilir, kaydedildi }: { g: Guncel; yazabilir: boolean; kaydedildi: (x: Guncel) => void }) {
  return (
    <>
      <p role="status" className="tc-pya-not">{surumMetni(g)}</p>
      {yazabilir ? <MotorFormu key={g.surumId ?? 0} g={g} kaydedildi={kaydedildi} /> : <MotorOkunur g={g} />}
      <p className="tc-pya-not">Değişiklik sonraki planları etkiler. Açık taslaklar açıldıkları ayarda kalır; planlamacı taslakta güncel ayarları uygulayabilir.</p>
    </>
  );
}

function MotorOkunur({ g }: { g: Guncel }) {
  const d = g.degerler;
  return (
    <dl className="tc-pya-salt">
      {MOTOR_SECIMLERI.map((k) => <div key={k}><dt>{AYAR_SECENEKLERI[k].baslik}</dt><dd>{degerAdi(k, d[k] as never)}</dd></div>)}
      <div><dt>{ACIL_PAY.baslik}</dt><dd>{yuzdeMetni(d.acilPay)}</dd></div>
      <div><dt>{FASON_GUN.baslik}</dt><dd>{gunMetni(d.fasonGun)}</dd></div>
    </dl>
  );
}

function MotorFormu({ g, kaydedildi }: { g: Guncel; kaydedildi: (x: Guncel) => void }) {
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
      bildir('tamam', 'Motor ayarları kaydedildi; bir sonraki Planı güncelle ile plana girer.');
      kaydedildi(c.guncel);
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Motor ayarları kaydedilemedi.'));
      try { kaydedildi((await api.get<MotorAyarlariCevabi>('/plan/motor-ayarlari')).guncel); } catch { /* okunamazsa form eldeki değerle kalır */ }
    } finally {
      setYaziyor(false);
    }
  };
  return (
    <div className="tc-pya-alanlar" role="group" aria-label="Motor ayarları">
      {MOTOR_SECIMLERI.map((k) => {
        const id = `tc-pya-motor-${k}`;
        return (
          <div key={k} className="tc-pya-alan">
            <label htmlFor={id}>{AYAR_SECENEKLERI[k].baslik}</label>
            <select id={id} className="tc-alan-kutu" aria-describedby={`${id}-ipucu`} value={String(f[k])} disabled={yaziyor} onChange={(ev) => { const v = secimDegeri(k, ev.target.value); if (v !== null) setF({ ...f, [k]: v }); }}>
              {secilebilir(k, d[k] as never).map((x) => <option key={x.deger} value={x.deger}>{x.baslik}</option>)}
            </select>
            <small id={`${id}-ipucu`}>{AYAR_SECENEKLERI[k].ipucu}</small>
          </div>
        );
      })}
      <div className="tc-pya-alan">
        <label htmlFor="tc-pya-motor-acilPay">{ACIL_PAY.baslik}</label>
        <input id="tc-pya-motor-acilPay" className="tc-alan-kutu" inputMode="decimal" value={pay} disabled={yaziyor} aria-invalid={payOrani === null ? true : undefined} aria-describedby="tc-pya-motor-acilPay-ipucu" onChange={(ev) => { setPay(ev.target.value); }} />
        <small id="tc-pya-motor-acilPay-ipucu" className={payOrani === null ? 'tc-pya-hata' : undefined} role={payOrani === null ? 'alert' : undefined}>{payOrani === null ? '0 ile 30 arasında bir sayı girin.' : ACIL_PAY.ipucu}</small>
      </div>
      <div className="tc-pya-alan">
        <label htmlFor="tc-pya-motor-fasonGun">{FASON_GUN.baslik}</label>
        <input id="tc-pya-motor-fasonGun" className="tc-alan-kutu" inputMode="numeric" value={gun} disabled={yaziyor} aria-invalid={fasonGun === null ? true : undefined} aria-describedby="tc-pya-motor-fasonGun-ipucu" onChange={(ev) => { setGun(ev.target.value); }} />
        <small id="tc-pya-motor-fasonGun-ipucu" className={fasonGun === null ? 'tc-pya-hata' : undefined} role={fasonGun === null ? 'alert' : undefined}>{fasonGun === null ? '1 ile 90 arasında bir tam sayı girin.' : `${FASON_GUN.ipucu} Şu an ${gunMetni(d.fasonGun)}.`}</small>
      </div>
      <div className="tc-pya-dugmeler">
        <Dugme tur="ikincil" simge="check" disabled={!degisti || payOrani === null || fasonGun === null} yukleniyor={yaziyor} onClick={() => { void kaydet(); }}>{yaziyor ? 'Kaydediliyor' : 'Motor ayarını kaydet'}</Dugme>
      </div>
    </div>
  );
}

export const KilitIsareti = () => <Simge ad="lock" boyut="k" />;
