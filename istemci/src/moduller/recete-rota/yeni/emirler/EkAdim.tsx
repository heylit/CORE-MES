import { useState } from 'react';
import { Dugme, Girdi, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import type { RrDurumu } from '../veri.ts';
import { EK_TURLERI, type EkAdimSecimi } from './Bolme.tsx';
import type { useEmirKomutu } from './komut.ts';
import { sureMetni, type Emir } from './kurallar.ts';

// 2530 a: emre özel rework, tamir ya da ek adım; emir bölünmüş olsun olmasın. Yer bekleyen bir adımın arkasıdır ya da emrin başı; op
// numarasını köprü komşu adımların arasından önerir. Başlamışlık, alt parti ve yetki kuralları Üretim Emirleri'nin ucundadır; ret iletisi
// çerçevede görünür. Ekran yalnız adımlarını gördüğü yerleri sunar: biten ya da süren adımın arkası başlamamış adım değilse sahibi reddeder.
export interface EkYeri { opNo: number; baslik: string }

type Form = Omit<EkAdimSecimi, 'sonra'> & { sonra: string };
const BOS: Form = { tur: 'rework', sonra: '', opId: '', ad: '', ayar: '', birim: '', aciklama: '' };

// Açık alt partisi (iptal edilmemiş alt emri, parti ya da kol) olan emrin adımı sahibinin kuralıyla değişmez: kök emre eklenen adım alt
// partilerin kopyalanmış rotasına geçmez. Ekran bunu baştan söyler ve kullanıcıyı ilgili alt emre yönlendirir; kararı yine sahibi verir.
export function acikAltEmirler(d: RrDurumu, o: Emir): string[] {
  return (d.emirler?.orders ?? []).filter((x) => x.parentId === o.id && x.status !== 'iptal').map((x) => x.no);
}

// `ilkYer` (3039): adım listesinde "sonrasına adım ekle" ile açılınca yer seçili gelir.
export function EkAdimPaneli({ durum: d, emir: o, yerler, komut, kapat, ilkYer = null }: {
  durum: RrDurumu; emir: Emir; yerler: readonly EkYeri[]; komut: ReturnType<typeof useEmirKomutu>; kapat: () => void; ilkYer?: number | null;
}) {
  // ilkYer 0: emrin başı (sunucuda "önceki adım yok").
  const [f, setF] = useState<Form>(ilkYer === null ? BOS : { ...BOS, tur: 'ek', sonra: ilkYer === 0 ? '' : String(ilkYer) });
  const altlar = acikAltEmirler(d, o);
  const degistir = (p: Partial<Form>) => { setF({ ...f, ...p }); };
  const gonder = () => {
    const op = d.opdefs?.find((x) => x.id === f.opId);
    if (!op) { komut.bildir('hata', 'Önce operasyonu seçin.'); return; }
    const ad = f.ad.trim() || op.name;
    void komut.calistir('emir-ek-adim', {
      id: o.id, surum: o.surum, tur: f.tur, oncekiOpNo: f.sonra === '' ? null : Number(f.sonra), ad, operasyonTipiId: op.id,
      ayarSuresiDk: sureMetni(f.ayar), birimSureDk: sureMetni(f.birim), aciklama: f.aciklama,
    }, `${ad} adımı ${o.no} emrine eklendi.`).then((c) => { if (c.tamam) { setF(BOS); kapat(); } });
  };
  return (
    <div className="tc-rr3-ek" role="group" aria-label="Ek operasyon">
      <h4>{ilkYer === null ? 'Ek operasyon' : ilkYer === 0 ? 'Emrin başına adım' : `OP ${String(ilkYer)} sonrasına adım`}</h4>
      <p className="tc-rr3-ipucu">
        Bu emir rotada olmayan bir adım yapacaksa ekleyin; rota değişmez. Adı boşsa operasyonun adı kullanılır, açıklamayı operatör görür.
      </p>
      {altlar.length > 0 && (
        <div className="tc-rr3-uyari-kutu" data-ton="bilgi" role="note">
          <Simge ad="layers" />
          <span>Emrin açık alt partileri var ({altlar.join(', ')}); ek adımı ilgili partiye ekleyin.</span>
        </div>
      )}
      <div className="tc-rr3-satir">
        <Secim etiket="Tür" secenekler={EK_TURLERI} value={f.tur} onChange={(e) => { degistir({ tur: e.target.value as Form['tur'] }); }} />
        <Secim
          etiket="Yeri" value={f.sonra} bosSecenek="Emrin başına"
          secenekler={yerler.map((y) => ({ deger: String(y.opNo), baslik: `${y.baslik} sonrasına` }))}
          onChange={(e) => { degistir({ sonra: e.target.value }); }}
        />
        <Secim
          etiket="Operasyon" value={f.opId} bosSecenek="Seçin"
          secenekler={(d.opdefs ?? []).filter((x) => x.aktif || x.id === f.opId).map((x) => ({ deger: x.id, baslik: `${x.abbr ?? x.code} ${x.name}` }))}
          onChange={(e) => { degistir({ opId: e.target.value }); }}
        />
        <Girdi etiket="Adı" placeholder="Boşsa operasyon adı" value={f.ad} onChange={(e) => { degistir({ ad: e.target.value }); }} />
        <Girdi etiket="Hazırlık dk" inputMode="decimal" value={f.ayar} onChange={(e) => { degistir({ ayar: e.target.value }); }} />
        <Girdi etiket="Birim dk" inputMode="decimal" value={f.birim} onChange={(e) => { degistir({ birim: e.target.value }); }} />
        <Girdi etiket="Açıklama" value={f.aciklama} onChange={(e) => { degistir({ aciklama: e.target.value }); }} />
      </div>
      <div className="tc-rr3-satir">
        <Dugme tur="birincil" simge="plus" yukleniyor={komut.mesgul} onClick={gonder}>Ek operasyonu ekle</Dugme>
        <Dugme onClick={() => { setF(BOS); kapat(); }}>Vazgeç</Dugme>
      </div>
    </div>
  );
}
