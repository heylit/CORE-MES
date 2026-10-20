import { useState } from 'react';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { Dugme, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { GUNLER } from './gosterim.ts';
import { IkiAdimli } from './IkiAdimli.tsx';
import type { useVardiyaYaz } from './komut.ts';
import { GUN_KISAYOLLARI, degistir, reddedilenler } from './secim.ts';

type Yaz = ReturnType<typeof useVardiyaYaz>;

// Seçilen iş merkezlerine tek komut (kart #1305): sunucu hepsini ya da hiçbirini yazar; kapsam dışı merkezler satırda işaretlenir.
// Gün ve vardiya seçimi komutlar arasında korunur: aynı düzen başka merkez grubuna da art arda uygulanabilir.
export function TopluMatris({ t, secili, y, bitti, reddedildi }: {
  t: TakvimCevabi; secili: readonly number[]; y: Yaz; bitti: () => void; reddedildi: (idler: number[]) => void;
}) {
  const [gunler, gunlerYaz] = useState<ReadonlySet<number>>(new Set([1, 2, 3, 4, 5]));
  const [vardiyalar, vardiyalarYaz] = useState<ReadonlySet<number>>(new Set());
  const [kaynak, kaynakYaz] = useState('');
  const { bildir } = useBildirim();
  const aktif = t.vardiyalar.filter((v) => v.aktif);
  const kaynaklar = t.isMerkezleri.filter((m) => m.aktif && !secili.includes(m.id));
  const sirali = (k: ReadonlySet<number>) => [...k].sort((a, b) => a - b);
  const sonuc = {
    onSuccess: () => { reddedildi([]); bildir('tamam', `${secili.length.toLocaleString('tr-TR')} iş merkezine uygulandı.`); },
    onError: (e: Error) => reddedildi(reddedilenler(e, 'isMerkeziIdleri')),
  };
  const yaz = (kip: 'ekle' | 'kaldir' | 'ayarla') => y.mutate(
    { yol: '/vardiya-matrisi/toplu-yaz', govde: { isMerkeziIdleri: [...secili], gunler: sirali(gunler), vardiyaIdleri: sirali(vardiyalar), kip } },
    sonuc,
  );
  const gunYok = gunler.size === 0;
  const vardiyaYok = vardiyalar.size === 0;
  return (
    <section className="tc-vr-toplu" aria-label="Toplu düzenleme">
      <div className="tc-vr-baslik-satiri">
        <strong>{secili.length.toLocaleString('tr-TR')} iş merkezi seçili</strong>
        <Dugme simge="x" onClick={bitti}>Seçimi bırak</Dugme>
      </div>
      <div className="tc-vr-satir" role="group" aria-label="Günler">
        <span className="tc-vr-toplu-etiket">Günler</span>
        {GUNLER.map((g, i) => (
          <button key={g} type="button" className="tc-vr-vd tc-vr-cip" aria-pressed={gunler.has(i + 1)} onClick={() => gunlerYaz(degistir(gunler, i + 1))}>{g}</button>
        ))}
        {GUN_KISAYOLLARI.map((k) => (
          <button key={k.baslik} type="button" className="tc-vr-kisayol" onClick={() => gunlerYaz(new Set(k.gunler))}>{k.baslik}</button>
        ))}
      </div>
      <div className="tc-vr-satir" role="group" aria-label="Vardiyalar">
        <span className="tc-vr-toplu-etiket">Vardiyalar</span>
        {aktif.map((v) => (
          <button key={v.id} type="button" className="tc-vr-vd tc-vr-cip" aria-pressed={vardiyalar.has(v.id)} onClick={() => vardiyalarYaz(degistir(vardiyalar, v.id))}>
            {v.ad} <small>{v.baslangic}–{v.bitis}</small>
          </button>
        ))}
      </div>
      <div className="tc-vr-satir">
        <Dugme tur="birincil" simge="plus" disabled={gunYok || vardiyaYok || y.isPending} onClick={() => yaz('ekle')}>Ekle</Dugme>
        <Dugme simge="minus" disabled={gunYok || vardiyaYok || y.isPending} onClick={() => yaz('kaldir')}>Kaldır</Dugme>
        <IkiAdimli etiket={vardiyaYok ? 'Günleri boşalt' : 'Yalnız bunlar olsun'} onayEtiketi="Emin misin? Seçili günler yeniden yazılır"
          disabled={gunYok || y.isPending} gonder={() => yaz('ayarla')} />
      </div>
      {kaynaklar.length > 0 && (
        <div className="tc-vr-satir">
          <Secim etiket="Haftasını kopyala" value={kaynak} bosSecenek="İş merkezi seç" onChange={(e) => kaynakYaz(e.target.value)}
            secenekler={kaynaklar.map((m) => ({ deger: String(m.id), baslik: `${m.kod} ${m.ad}` }))} />
          <IkiAdimli etiket="Seçilenlere kopyala" onayEtiketi="Emin misin? Seçilenlerin haftası değişir" disabled={kaynak === '' || y.isPending}
            gonder={() => y.mutate({ yol: '/vardiya-matrisi/kopyala', govde: { kaynakIsMerkeziId: Number(kaynak), hedefIsMerkeziIdleri: [...secili] } }, sonuc)} />
        </div>
      )}
      <p className="tc-vr-ipucu">
        Ekle seçili günlere vardiyayı açar, Kaldır kapatır; öbür vardiyalar değişmez. &quot;Yalnız bunlar olsun&quot; seçili günlerde yalnız seçilen vardiyaları bırakır.
        Komut hepsine birden uygulanır; yetkin olmayan bir iş merkezi varsa hiçbiri değişmez ve satırında yazar.
      </p>
    </section>
  );
}
