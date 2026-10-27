import type { ProjeYonetimiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { Kart } from '../../ortak/arayuz/index.ts';
import { tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { bugun, sapmaMetni, tarihMetni } from './gosterim.ts';
import { Ilerleme, gorevGecikiyor } from './ProjeGorevleri.tsx';
import { StatuCipi } from './StatuPenceresi.tsx';
import { tasSapmasi } from './KilometreTaslari.tsx';

const SIRADAKI_TAS = 3;
const SON_NOT = 3;

// Özet yalnız yönetim verisinden kurulur; plan ve gerçekleşen planlamadadır (908), maliyet kendi sekmesindedir.
export function ProjeOzeti({ yonetim }: { yonetim: ProjeYonetimiCevabi }) {
  const gun = bugun();
  const acikGorevler = yonetim.gorevler.filter((g) => g.durum !== 'bitti' && g.durum !== 'iptal');
  const gecikenler = acikGorevler.filter((g) => gorevGecikiyor(g, gun));
  const siradaki = yonetim.kilometreTaslari.filter((t) => t.etkin && t.gercekTarih === null).slice(0, SIRADAKI_TAS);
  const notlar = yonetim.statuGecmisi.filter((k) => k.not !== null).slice(0, SON_NOT);

  return (
    <div className="tc-prj-ozet">
      <Kart baslik="Durum" simge="chart">
        <dl className="tc-prj-bilgi">
          <dt>Statü</dt><dd><StatuCipi statu={yonetim.statu} /></dd>
          <dt>İlerleme</dt><dd><Ilerleme deger={yonetim.ilerleme} /></dd>
          <dt>Açık görev</dt><dd>{acikGorevler.length}</dd>
          <dt>Geciken görev</dt><dd className={gecikenler.length > 0 ? 'tc-prj-gec' : undefined}>{gecikenler.length}</dd>
        </dl>
      </Kart>
      <Kart baslik="Sıradaki kilometre taşları" simge="flag">
        {siradaki.length === 0
          ? <p className="tc-prj-soluk">Bekleyen kilometre taşı yok</p>
          : (
            <ul className="tc-prj-liste">
              {siradaki.map((t) => {
                const s = tasSapmasi(t, gun);
                return (
                  <li key={t.id}>
                    <strong>{t.ad}</strong>
                    <span className="tc-prj-soluk">{tarihMetni(t.tabanTarih)}</span>
                    {s !== null && <span className="tc-prj-gec">{sapmaMetni(s)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
      </Kart>
      <Kart baslik="Son statü notları" simge="book">
        {notlar.length === 0
          ? <p className="tc-prj-soluk">Not yok</p>
          : (
            <ul className="tc-prj-liste">
              {notlar.map((k) => (
                <li key={k.id}>
                  <StatuCipi statu={k} />
                  <span>{k.not}</span>
                  <span className="tc-prj-soluk">{k.kisiAd ?? '—'} · {tarihSaatMetni(k.an)}</span>
                </li>
              ))}
            </ul>
          )}
      </Kart>
    </div>
  );
}
