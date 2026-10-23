import type { ReactNode } from 'react';
import { Girdi, IsaretKutusu, Secim } from '../../../../ortak/arayuz/index.ts';
import { D, isoGun } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { SecimGrubu } from '../kartlar/parcalar.tsx';

// Görünen etiket ve hata: içerideki seçici kendi erişilebilir adını taşır (seçim yapılınca etiket gizlenmesin diye).
export function AlanGrubu({ etiket, hata, children }: { etiket: string; hata?: string | undefined; children: ReactNode }) {
  return (
    <div className="tc-mi-alan">
      <span className="tc-mi-alan-etiket" aria-hidden="true">{etiket}</span>
      {children}
      {hata && <p className="tc-mi-alan-hata" role="alert">{hata}</p>}
    </div>
  );
}

// Prototipin orderOpts'u: sevk edilmemiş siparişler ve kayıttaki sipariş; liste yoksa alan çizilmez.
export function SiparisSecimi({ deger, degisti }: { deger: string; degisti: (id: string) => void }) {
  const { siparisler } = useMesaj();
  if (!siparisler || siparisler.length === 0) return null;
  const secenekler = siparisler.filter((o) => o.durum !== 'sevk' || o.id === deger).map((o) => ({ deger: o.id, baslik: `#${o.no} ${o.musteri}` }));
  return (
    <Secim
      etiket="Sipariş (isteğe bağlı)" bosSecenek="Yok" secenekler={secenekler} value={deger}
      onChange={(o) => degisti(o.target.value)}
    />
  );
}

// "Kanalda da paylaş" ve kanal seçimi; kanal yoksa çizilmez.
export function KanaldaPaylas({ etiket, paylas, kanal, degisti }: {
  etiket: string; paylas: boolean; kanal: string; degisti: (y: { paylas?: boolean; kanal?: string }) => void;
}) {
  const { veri } = useMesaj();
  if (veri.kanallar.length === 0) return null;
  return (
    <div className="tc-mi-paylas">
      <IsaretKutusu etiket={etiket} checked={paylas} onChange={(o) => degisti({ paylas: o.target.checked })} />
      <Secim
        etiket="Kanal" value={kanal} disabled={!paylas} onChange={(o) => degisti({ kanal: o.target.value })}
        secenekler={veri.kanallar.map((c) => ({ deger: c.id, baslik: `${c.emoji ?? '#'} ${c.name}` }))}
      />
    </div>
  );
}

type Hazir = '0' | '1' | '3' | '7';
const HAZIR: { anahtar: Hazir; baslik: string }[] = [
  { anahtar: '0', baslik: 'Bugün' }, { anahtar: '1', baslik: 'Yarın' }, { anahtar: '3', baslik: '3 gün' }, { anahtar: '7', baslik: '1 hafta' },
];

// Prototipin dueChips'i: hazır seçenek tarihi doldurur.
export function TeslimSecimi({ deger, degisti }: { deger: string; degisti: (gun: string) => void }) {
  const secili = HAZIR.find((h) => isoGun(Date.now() + Number(h.anahtar) * D) === deger)?.anahtar ?? ('' as Hazir);
  return (
    <AlanGrubu etiket="Ne zamana?">
      <SecimGrubu<Hazir>
        etiket="Hazır tarih" secenekler={HAZIR} secili={secili}
        sec={(h) => degisti(isoGun(Date.now() + Number(h) * D))}
      />
      <Girdi etiket="Tarih" type="date" value={deger} onChange={(o) => degisti(o.target.value)} />
    </AlanGrubu>
  );
}

// datetime-local değeri yerel saattir.
export const yerelZaman = (ts: number | null | undefined) => {
  if (!ts) return '';
  const d = new Date(ts);
  const iki = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}T${iki(d.getHours())}:${iki(d.getMinutes())}`;
};
export const yereldenZaman = (v: string) => (v ? new Date(v).getTime() : null);
