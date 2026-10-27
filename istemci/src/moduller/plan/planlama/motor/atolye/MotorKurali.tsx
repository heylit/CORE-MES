import { useEffect, useState } from 'react';
import type { MotorAyarlari, MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Secim, Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../../ortak/veri/istek-kimligi.ts';
import { AYAR_SECENEKLERI, degerAdi, surumMetni } from '../../../motor-ayarlari/kurallar.ts';
import type { SunucuSenaryosu } from './kurallar.ts';

// Kart 811 (833 a): seçili taslağın motor ayarı sürümü ve taslağa özel sıralama kuralı (830 a). Taslak açıldığı sürümde kalır (774 a);
// açan kişi güncel ayarlara geçirebilir ve kuralı seçebilir. Boş kural sürümdeki kuralı kullanır.
export function MotorKurali({ s, yazabilir, degisti }: { s: SunucuSenaryosu; yazabilir: boolean; degisti: () => void }) {
  const { bildir } = useBildirim();
  const [gidiyor, setGidiyor] = useState(false);
  // Atölye react-query kullanmaz; taslak sürümü değişince (kural ya da güncel ayara geçiş) yeniden okunur.
  const [c, setC] = useState<{ anahtar: string; t: MotorAyarlariCevabi['taslak'] } | { anahtar: string; hata: unknown } | null>(null);
  const anahtar = `${String(s.id)}:${String(s.surum)}`;
  useEffect(() => {
    let canli = true;
    api.get<MotorAyarlariCevabi>(`/plan/motor-ayarlari?taslak=${String(s.id)}`)
      .then((x) => { if (canli) setC({ anahtar, t: x.taslak }); }, (hata: unknown) => { if (canli) setC({ anahtar, hata }); });
    return () => { canli = false; };
  }, [anahtar, s.id]);
  const okunan = c?.anahtar === anahtar ? c : null;
  const t = okunan && 't' in okunan ? okunan.t : null;
  const yaz = async (yol: string, govde: Record<string, unknown>, tamam: string) => {
    setGidiyor(true);
    try {
      await tekrarKorumaliGonder((d) => api.post(`/plan/senaryolar/${String(s.id)}/${yol}`, { surum: s.surum, ...govde }, d));
      bildir('tamam', tamam);
    } catch (e) {
      bildir('hata', e instanceof ApiHatasi && e.durum === 409 ? 'Plan bu arada değişti; liste yenilendi, yeniden deneyin.' : hataIletisi(e, 'Motor ayarı değiştirilemedi.'));
    } finally { setGidiyor(false); degisti(); }
  };
  const acik = yazabilir && s.durum === 'acik';
  return (
    <section className="tc-pym-pa-bolum" aria-label="Motor ayarı">
      <h3><Simge ad="gear" boyut="k" /> Motor ayarı</h3>
      {okunan === null ? <p className="tc-pym-pa-kucuk">Yükleniyor.</p>
        : t === null ? <p className="tc-pym-pa-kucuk">{'hata' in okunan ? hataIletisi(okunan.hata, 'Motor ayarı alınamadı.') : 'Motor ayarı yok.'}</p>
          : (
            <>
              <p className="tc-pym-pa-kucuk">{`${surumMetni(t.surum)} ${t.farkli ? 'Güncel ayarlardan farklı.' : 'Güncel ayarlarla aynı.'}`}</p>
              {acik ? (
                <Secim etiket={AYAR_SECENEKLERI.kural.baslik} value={t.kural ?? ''} disabled={gidiyor}
                  bosSecenek={`Ayardaki kural: ${degerAdi('kural', t.surum.degerler.kural)}`} secenekler={AYAR_SECENEKLERI.kural.secenekler}
                  onChange={(e) => void yaz('motor-kurali', { kural: (e.target.value || null) as MotorAyarlari['kural'] | null }, 'Taslağın sıralama kuralı kaydedildi.')} />
              ) : (
                <p className="tc-pym-pa-kucuk">{`${AYAR_SECENEKLERI.kural.baslik}: ${t.kural === null ? `ayardaki (${degerAdi('kural', t.surum.degerler.kural)})` : degerAdi('kural', t.kural)}`}</p>
              )}
              {acik && t.farkli && (
                <button type="button" className="tc-dugme tc-pym-kucuk" disabled={gidiyor}
                  onClick={() => void yaz('motor-ayari-guncelle', {}, 'Taslak güncel motor ayarlarına geçti.')}><Simge ad="rotate" boyut="k" />Güncel ayarları uygula</button>
              )}
            </>
          )}
    </section>
  );
}
