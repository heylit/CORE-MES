import { Pencere } from '../../../../ortak/arayuz/index.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { adSoyad, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import type { IkMotoru } from '../motor.ts';
import type { Personel } from '../tipler.ts';
import {
  ayMetni, BORDRO_LISTESI_BASLIKLARI, bordroListesiSatiri, FIS_BASLIKLARI, muhasebeFisi, MUHSGK_BASLIKLARI, muhsgkSatiri, type FisHesaplari,
} from './kurallar.ts';
import { ayar, bordroHesapla, bordroluPersonel, cikisKodu, otoGun, type BordroSonucu } from './motor-yuzu.ts';
import { Not } from './parcalar.tsx';

// Bordro dışa aktarma (app.js payExport): ekranda görünen değerlerle (kaydedilmemiş taslak dahil) üç CSV.
export function DisaAktar({ o, m, ay, kapat }: { o: IkEkranOzellikleri; m: IkMotoru; ay: string; kapat: () => void }) {
  const satirlar = bordroluPersonel(m, ay).map((p) => [p, bordroHesapla(m, p, ay)] as const)
    .filter((s): s is readonly [Personel, BordroSonucu] => s[1] !== null);
  const dep = (id: string | undefined) => o.depo.tur('dept').find((d) => d.id === id);
  const depAdi = (id: string | undefined) => dep(id)?.ad ?? YOK;

  const liste = () => csvIndir(`bordro-${ay}`, BORDRO_LISTESI_BASLIKLARI, satirlar.map(([p, n]) => bordroListesiSatiri(adSoyad(p), p.sicilNo ?? '', depAdi(p.departmanId), n)));
  const muhsgk = () => csvIndir(`muhsgk-hazirlik-${ay}`, MUHSGK_BASLIKLARI, satirlar.map(([p, n]) => muhsgkSatiri(ay, p, n, otoGun(m, p, ay), cikisKodu(m, p.cikisKodu))));
  const fis = () => {
    const h = Object.fromEntries((['hesapGider', 'hesapPersonel', 'hesapVergi', 'hesapSgk', 'hesapDiger'] as const).map((k) => [k, String(ayar(m, k) ?? '')])) as unknown as FisHesaplari;
    csvIndir(`muhasebe-fisi-${ay}`, FIS_BASLIKLARI, muhasebeFisi(ay, h, satirlar.map(([p, n]) => ({ giderHesabi: dep(p.departmanId)?.giderHesabi, departman: depAdi(p.departmanId), n }))));
  };
  const secenekler = [
    { anahtar: 'liste', baslik: 'Bordro listesi (CSV)', alt: 'Tüm kazanç, kesinti, yan hak ve işveren maliyeti sütunları; Excel’de açılır.', yap: liste },
    { anahtar: 'muhsgk', baslik: 'MUHSGK hazırlık listesi (CSV)', alt: 'T.C. kimlik no, prim günü, eksik gün nedeni, prime esas kazanç, teşvik kanunu, GV ve DV bilgileri.', yap: muhsgk },
    { anahtar: 'fis', baslik: 'Muhasebe fişi (CSV)', alt: 'Gider, personel, vergi ve SGK hesaplarına dengeli yevmiye kaydı.', yap: fis },
  ];
  return (
    <Pencere acik baslik={`${ayMetni(ay)}: dışa aktar`} kapat={kapat}>
      <div className="tc-ikb-menu">
        {secenekler.map((s) => (
          <button key={s.anahtar} type="button" className="tc-ikb-menu-dugme" onClick={s.yap}><b>{s.baslik}</b><small>{s.alt}</small></button>
        ))}
      </div>
      <Not>Önce dönemi kaydetmeniz önerilir; aktarım ekranda görünen (kaydedilmemiş değişiklikler dahil) değerlerle yapılır.</Not>
    </Pencere>
  );
}
