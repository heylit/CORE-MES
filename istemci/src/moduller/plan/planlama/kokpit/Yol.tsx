import { useEffect, useState } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import type { OkunanPlan } from '../motor/kurallar.ts';
import { Hamleler, type HamleOzellikleri } from './Hamleler.tsx';
import { eksikAdimlar, kismiPlanli, type KokpitModeli } from './kurallar.ts';
import type { PlanlaDurumu } from './Yerlestirme.tsx';
import type { SiraKarti } from './yerlestirme.ts';
import { YOL_ADIMLARI, kartSonucu, yolAdimi } from './yol.ts';

// Planlama yolu (3414): dört adım, her adımda tek birincil düğme ve yapılanın sonucu cümleyle.
export interface YolOzellikleri {
  m: KokpitModeli; p: OkunanPlan | null;
  // Seçili kart ve açıkça seçilip seçilmediği (ilk kart kendiliğinden gösterilirken seçim sayılmaz).
  kart: SiraKarti | null; vurgu: boolean;
  zaman: (t: number) => string;
  // Seçili kartın sıradaki plansız emrinin durumu (operasyon bölümü bildirir).
  pd: PlanlaDurumu | null;
  plansiz: number; taslakVar: boolean; mesgul: boolean;
  malzemeBekleyen?: Readonly<Record<string, number>>;
  oner: (yon: 'ileri' | 'geri') => void;
  // Kısmen planlı emrin eksik adımlarını sistem yerleştirir (plana alma böyle emri reddeder).
  eksikPlanla: () => void;
  hepsiniPlanla: () => void;
  yenidenPlanla: () => void;
  onayaGec: () => void;
  hamle: HamleOzellikleri['uygula']; surum: number | null;
}

export function Yol({ m, p, kart, vurgu, zaman, pd, plansiz, taslakVar, mesgul, malzemeBekleyen, oner, eksikPlanla, hepsiniPlanla, yenidenPlanla, onayaGec, hamle, surum }: YolOzellikleri) {
  const adim = yolAdimi(kart, vurgu);
  const sira = YOL_ADIMLARI.findIndex(([k]) => k === adim);
  const ad = kart ? kart.siparis?.no ?? kart.emirler[0]?.no ?? '' : '';
  const sonuc = adim === 'duzelt' && kart ? kartSonucu(m, p, kart, zaman, malzemeBekleyen) : null;
  // Seçenekler istenince hesaplanır: her seçeneğin sonucu sunucu önizlemesidir, sipariş seçmek tek başına istek atmaz.
  const [secenekAcik, setSecenekAcik] = useState(false);
  useEffect(() => { setSecenekAcik(false); }, [kart?.kok]);
  const kismi = adim === 'oner' && kart ? kart.emirler.filter((e) => kismiPlanli(m, e)) : [];
  const eksik = kismi.reduce((n, e) => n + eksikAdimlar(m, e).length, 0);
  // Hiç planlanmamış emir plana alınır; kısmen planlı emir yeniden planlanır.
  const bekleyen = adim === 'oner' && kart ? kart.emirler.filter((e) => e.durum === 'plansiz').length - kismi.length : 0;
  return (
    <section className="tc-pyq-yol" aria-label="Planlama yolu" data-adim={adim} data-akis="">
      <ol className="tc-pyq-onay-adimlar" aria-label="Plan adımları">
        {YOL_ADIMLARI.map(([k, yazi], i) => (
          <li key={k} aria-current={k === adim ? 'step' : undefined} data-bitti={i < sira ? '' : undefined}><b>{i + 1}</b> {yazi}</li>
        ))}
      </ol>
      <small className="tc-pyq-yol-not">Değişiklikleriniz canlıya alınana kadar sizde kalır, Geri al ile alınır; atölyenin gördüğü plan yalnız Canlıya al ile değişir.</small>
      {adim === 'sec' && (
        <div className="tc-pyq-yol-govde">
          <p><b>Sıradan bir sipariş seçin.</b><small>Seçtiğiniz siparişin operasyonları altında açılır; tahta bugünkü planı gösterir.</small></p>
          {plansiz > 0 && <Dugme simge="play" disabled={mesgul} onClick={hepsiniPlanla}>Plansızların hepsini planla ({plansiz})</Dugme>}
        </div>
      )}
      {adim === 'oner' && kismi.length > 0 && (
        <div className="tc-pyq-yol-govde" data-tur="risk" data-kismi="">
          <p role="status"><b>{ad}: {String(eksik)} adımın planda yeri yok; öteki adımlar planda.</b><small>Sistem eksik adımlara yer bulur; bu emrin planda olan adımları da yeniden dizilebilir, öteki emirler yerinde kalır.</small></p>
          <Dugme tur={bekleyen > 0 ? 'ikincil' : 'birincil'} simge="play" disabled={mesgul} onClick={eksikPlanla}>Eksik adımları planla</Dugme>
        </div>
      )}
      {adim === 'oner' && bekleyen > 0 && (
        <div className="tc-pyq-yol-govde" data-tur="risk">
          <p role="status"><b>{ad}: {bekleyen > 1 ? `${String(bekleyen)} emir` : `${String(pd?.adim ?? 0)} adım`} planlanmayı bekliyor.</b><small>Sistem yerleştirir, sonucu ve nedenini burada yazar.</small></p>
          <Dugme tur="birincil" simge="play" disabled={mesgul || !pd?.ileriHazir} onClick={() => { oner('ileri'); }}>Sistem önersin</Dugme>
          <Dugme disabled={mesgul || !pd?.terminVar} title={pd && !pd.terminVar ? 'Emrin termini yok; geriye yerleştirilemez.' : 'Termine yetişecek en geç saate yerleştirir'} onClick={() => { oner('geri'); }}>Teslimden geriye</Dugme>
        </div>
      )}
      {sonuc && kart && (
        <div className="tc-pyq-yol-govde" data-tur={sonuc.tur}>
          <p role="status"><b>{ad}: {sonuc.baslik}</b>{sonuc.neden !== null && <small>Neden: {sonuc.neden}</small>}</p>
          {taslakVar && <Dugme tur={sonuc.tur === 'iyi' ? 'birincil' : 'ikincil'} simge="check" disabled={mesgul} onClick={onayaGec}>Onaya geç</Dugme>}
          <Dugme simge="play" disabled={mesgul} title="Sistem bu siparişin işlerini yeniden dizer; başlamış ve kilitli iş yerinde kalır" onClick={yenidenPlanla}>Sistem yeniden dizsin</Dugme>
          {sonuc.emir && !secenekAcik && <Dugme tur={taslakVar ? 'ikincil' : 'birincil'} simge="route" onClick={() => { setSecenekAcik(true); }}>Seçenekleri göster</Dugme>}
          {sonuc.emir && secenekAcik && (
            <div className="tc-pyq-yol-secenek" role="group" aria-label="Düzeltme seçenekleri">
              <small>Seçenekler (sonucu basmadan önce yazılıdır); tahtada sürükleyerek de değiştirebilirsiniz</small>
              <Hamleler m={m} e={sonuc.emir} isId={null} zaman={zaman} uygula={hamle} surum={surum} bekle={mesgul} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
