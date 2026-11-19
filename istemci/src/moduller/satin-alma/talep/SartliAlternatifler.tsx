import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AlternatifIzniYazimi, Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, Girdi, Rozet } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { SURE, anahtarlar, cagri, gunYaz } from './ortak.ts';

type Sartli = NonNullable<Talebim['kalemler'][number]['sartliAlternatifler']>[number];

// Teklif edilen nitelikler; boş alan istenenle aynıdır (fiyat ve tedarikçi talep edene gelmez).
export const alternatifYaz = (a: Sartli['alternatif']): string => [
  a.kalite && `Kalite ${a.kalite}`, a.durum && `Durum ${a.durum}`, a.yuzey && `Yüzey ${a.yuzey}`,
  ...Object.entries(a.olcu).map(([k, v]) => `${k} ${v.toLocaleString('tr-TR')} mm`),
].filter(Boolean).join(' · ') || 'İstenenle aynı';

export const bekleyenSartli = (t: Talebim): number =>
  t.kalemler.reduce((n, k) => n + (k.sartliAlternatifler ?? []).filter((x) => x.izin === null).length, 0);

// 3437-3b-1: talepte şartlı muadil işaretlenmediyse satın alma şartlı alternatifi talep edenin onayıyla seçer.
// İzin gördüğü alternatife bağlıdır: teklif değişirse yeniden sorulur.
function Satir({ talepId, kalemId, s }: { talepId: string; kalemId: string; s: Sartli }) {
  const istemci = useQueryClient();
  const [notu, notuYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [kimlik, kimlikYaz] = useState(yeniIstekKimligi);
  const [degistir, degistirYaz] = useState(false);
  const yaz = useMutation({
    mutationFn: (karar: AlternatifIzniYazimi['karar']) => tekrarKorumaliGonder((deneme) => cagri.post('/satin-alma-talepleri/:id/alternatif-izni', {
      parametre: { id: talepId }, govde: { teklifId: s.teklifId, kalemId, karar, notu: notu.trim(), alternatif: s.alternatif }, ...deneme, ...SURE,
    }), { ...SURE, istekKimligi: kimlik }),
    onSuccess: () => {
      hataYaz(null);
      notuYaz('');
      degistirYaz(false);
      kimlikYaz(yeniIstekKimligi());
      void istemci.invalidateQueries({ queryKey: anahtarlar.taleplerimHepsi });
    },
    onError: (h) => hataYaz(h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Kaydedilemedi; yeniden deneyin.'),
  });
  const durum = s.izin === 'soru' ? <Rozet ton="tamam">Onayladınız {gunYaz(s.izinZaman)}</Rozet>
    : s.izin === 'ret' ? <Rozet ton="hata">Reddettiniz {gunYaz(s.izinZaman)}</Rozet>
      : s.izin === 'talep' ? <Rozet ton="pasif">Talepte şartlı kabul edildi</Rozet>
        : <Rozet ton="uyari">Onayınızı bekliyor</Rozet>;
  return (
    <div className="sa-talep-sartli">
      <div className="sa-talep-sartli-ust">
        <span>Şartlı alternatif: <b>{alternatifYaz(s.alternatif)}</b></span>
        {durum}
      </div>
      {s.nedenler.length > 0 && <span className="sa-talep-not">{s.nedenler.join(' · ')}</span>}
      {s.izinNotu && <span className="sa-talep-not">Notunuz: {s.izinNotu}</span>}
      {(s.izin === 'soru' || s.izin === 'ret') && !degistir && (
        <div className="sa-talep-sartli-karar"><Dugme simge="edit" onClick={() => degistirYaz(true)}>Kararı değiştir</Dugme></div>
      )}
      {(s.izin === null || degistir) && (
        <div className="sa-talep-sartli-karar">
          <Girdi etiket={s.izin === 'soru' ? 'Ret nedeni (isteğe bağlı)' : 'Not (isteğe bağlı)'} value={notu} maxLength={500} onChange={(e) => notuYaz(e.target.value)} />
          {s.izin !== 'soru' && <Dugme simge="check" tur="birincil" disabled={yaz.isPending} onClick={() => yaz.mutate('onay')}>Onayla</Dugme>}
          {s.izin !== 'ret' && <Dugme simge="x" disabled={yaz.isPending} onClick={() => yaz.mutate('ret')}>Reddet</Dugme>}
          {degistir && <Dugme onClick={() => { degistirYaz(false); notuYaz(''); }}>Vazgeç</Dugme>}
        </div>
      )}
      {hata && <span className="sa-talep-hata" role="alert">{hata}</span>}
    </div>
  );
}

export function SartliAlternatifler({ talepId, kalem }: { talepId: string; kalem: Talebim['kalemler'][number] }) {
  const l = kalem.sartliAlternatifler ?? [];
  const id = kalem.id;
  if (l.length === 0 || id === undefined) return null;
  return <>{l.map((s) => <Satir key={s.teklifId} talepId={talepId} kalemId={id} s={s} />)}</>;
}
