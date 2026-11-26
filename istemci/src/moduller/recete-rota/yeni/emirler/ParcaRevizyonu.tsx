import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Dugme, Pencere, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { ParcaRevizyonlariCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { parcaRevMetni } from '../../../uretim-emirleri/disari.ts';
import { tarih } from '../bicim.ts';
import { RR_ANAHTARI } from '../veri.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { useEmirKomutu } from './komut.ts';
import { acikMi, type Emir } from './kurallar.ts';

// 3755: "Rev" emrin parça (çizim) revizyonudur; rota revizyonu ayrı ve ikincil "Rota B" yazılır. Kod sunucudan gösterim kuralıyla gelir ("R01" -> "01").
export const revMetni = parcaRevMetni;
export const rotaHarfMetni = (harf: string | null | undefined): string | null => (harf ? `Rota ${harf}` : null);

export function useParcaRevizyonlari(malzemeNo: number | null, rotaRevizyonId: number | null, etkin = true) {
  return useQuery({
    queryKey: [...RR_ANAHTARI, 'parca-revizyonlari', malzemeNo, rotaRevizyonId] as const,
    enabled: etkin && malzemeNo !== null && malzemeNo > 0,
    queryFn: () => api.get<ParcaRevizyonlariCevabi>(
      `/adimli-emirler/parca-revizyonlari?malzemeNo=${String(malzemeNo)}${rotaRevizyonId === null ? '' : `&rotaRevizyonId=${String(rotaRevizyonId)}`}`),
    retry: false,
  });
}

// Seçenek metni: "Rev 01 · yayında · 20.11.2026".
export const revizyonSecenegi = (r: ParcaRevizyonlariCevabi['revizyonlar'][number]) => ({
  deger: String(r.revizyonId), baslik: `${revMetni(r.kod)} · ${r.durum === 'yayinda' ? 'yayında' : 'eski'} · ${tarih(r.yayinlandi.slice(0, 10))}`,
});

// Başlıktaki rozet: "Rev 00" ve yanında ikincil "Rota B"; seçilmemişte kesikli "Rev —".
export function ParcaRevRozeti({ emir: o, rotaHarfi }: { emir: Emir; rotaHarfi: string | null }) {
  const secildi = o.parcaRevId != null;
  return (
    <span className="tc-rr3-rev">
      <b className="tc-rr3-rev-kod" data-bos={secildi ? undefined : ''}>{revMetni(secildi ? o.parcaRev : null)}</b>
      {rotaHarfMetni(rotaHarfi) && <small className="tc-rr3-rev-rota">{rotaHarfMetni(rotaHarfi)}</small>}
    </span>
  );
}

// Ayrıntıdaki uyarı: kartta yeni revizyon yayında (emir değişmez) ya da açık emirde revizyon seçilmemiş (seçim düğmesi, emir düzenleme yetkisi).
export function ParcaRevizyonuUyarisi({ emir: o, yetki, komut }: {
  emir: Emir; yetki: EkranOzellikleri['yetki']; komut: ReturnType<typeof useEmirKomutu>;
}) {
  const [secim, setSecim] = useState<string | null>(null);
  const urunNo = Number(o.itemId);
  const liste = useParcaRevizyonlari(Number.isInteger(urunNo) ? urunNo : null, null).data;
  if (liste === undefined || liste.revizyonlar.length === 0) return null;
  const secildi = o.parcaRevId != null;
  const yayinda = liste.revizyonlar.find((r) => r.durum === 'yayinda') ?? null;
  const yeni = secildi && yayinda !== null && String(yayinda.revizyonId) !== o.parcaRevId ? yayinda : null;
  if (yeni !== null) {
    const bu = revMetni(o.parcaRev);
    return (
      <div className="tc-rr3-uyari-kutu" data-ton="bilgi" role="status">
        <Simge ad="file" />
        <span><b>Kartta yeni revizyon var: {revMetni(yeni.kod)}.</b> Bu emir {bu} ile açıldı ve {bu}&apos;da kalır; refakat kartı {bu} basar.</span>
      </div>
    );
  }
  if (secildi || !acikMi(o)) return null;
  const kapat = () => { setSecim(null); };
  return (
    <>
      <div className="tc-rr3-uyari-kutu" role="status">
        <Simge ad="alert" />
        <span><b>Parça revizyonu seçilmemiş.</b> Üretimi durdurmaz; refakat kartı ve etiketler kartın güncel çizim revizyonunu basar.</span>
        {yetki.emirDuzenle && <Dugme simge="file" onClick={() => { setSecim(''); }}>Revizyonu seç</Dugme>}
      </div>
      <Pencere
        acik={secim !== null} kapat={kapat} baslik={`Parça revizyonu seç · ${o.no}`}
        alt={(
          <>
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme
              tur="birincil" simge="check" disabled={!secim} yukleniyor={komut.mesgul}
              onClick={() => {
                void komut.calistir('emir-parca-revizyonu', { id: o.id, revizyonId: secim ?? '', surum: o.surum }, `${o.no}: parça revizyonu sabitlendi.`)
                  .then((c) => { if (c.tamam) kapat(); });
              }}
            >
              Kaydet
            </Dugme>
          </>
        )}
      >
        <Secim
          etiket="Parça revizyonu (çizim)" bosSecenek="Revizyon seçin" value={secim ?? ''} onChange={(e) => { setSecim(e.target.value); }}
          secenekler={liste.revizyonlar.map(revizyonSecenegi)} ipucu="Seçim sonradan değişmez ve emrin geçmişine yazılır."
        />
      </Pencere>
    </>
  );
}
