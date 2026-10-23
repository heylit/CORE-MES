import { Pencere, Simge } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { useMesaj, type FormIstegi, type FormOzellikleri } from './durum.tsx';

interface Secenek { tur: Exclude<FormIstegi['tur'], 'yeni' | 'zamanla' | 'kanal' | 'kural'>; simge: SimgeAdi; baslik: string; aciklama: string }

// "Sipariş aç" 212 a ile yoktur: sipariş Siparişler modülünde açılır.
export const YENI_SECENEKLERI: readonly Secenek[] = [
  { tur: 'gorev', simge: 'clipboard-check', baslik: 'Görev ver', aciklama: 'Birine iş ver, bitince haberin olsun' },
  { tur: 'onay', simge: 'check', baslik: 'Onay iste', aciklama: 'Karar gerekenleri onaya sun' },
  { tur: 'toplanti', simge: 'clock', baslik: 'Toplantı planla', aciklama: 'Davet et, takvime ve telefona eklensin' },
  { tur: 'duyuru', simge: 'bell', baslik: 'Duyuru yap', aciklama: 'Herkes okudum desin' },
];

export function YeniSecici({ kapat }: FormOzellikleri<'yeni'>) {
  const { formAc } = useMesaj();
  return (
    <Pencere acik kapat={kapat} baslik="Ne yapmak istiyorsun?">
      <div className="tc-my-yeni">
        {YENI_SECENEKLERI.map((s) => (
          <button key={s.tur} type="button" className="tc-my-yeni-secenek" onClick={() => { formAc({ tur: s.tur }); }}>
            <Simge ad={s.simge} boyut="b" />
            <b>{s.baslik}</b>
            <span>{s.aciklama}</span>
          </button>
        ))}
      </div>
    </Pencere>
  );
}
