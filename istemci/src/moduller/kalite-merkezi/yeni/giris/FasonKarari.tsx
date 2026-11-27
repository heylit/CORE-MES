import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { KmFasonGkkKararCevabi, KmFasonGkkKararGovdesi, KmFasonGkkSatiri } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { CokSatir, Dugme, Girdi, Pencere } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { GIRIS_ANAHTARI } from '../bugun/GirisKarari.tsx';
import { YOK, zamanKisa } from '../bicim.ts';
import { GIRIS_KAYITLARI_ANAHTARI, fasonKararIhlali, miktarMetni } from './ortak.ts';

type Alan = 'serbest' | 'sartli' | 'red';
const ALANLAR: { ad: Alan; etiket: string; ipucu: string }[] = [
  { ad: 'serbest', etiket: 'Serbest', ipucu: 'Karantinadan mal kabul alanına çıkar.' },
  { ad: 'sartli', etiket: 'Şartlı', ipucu: 'Şartlı kabulle çıkar; notu yazın.' },
  { ad: 'red', etiket: 'Red', ipucu: 'Karantinada red kalır (NCR, iade).' },
];
const sayi = (m: string): number => (m.trim() === '' ? 0 : Number(m));

// 3809: fason dönüşünün GKK kararı. Karar adetle ve parça parça verilir; üç sonucun toplamı bekleyeni aşamaz. Serbest ve şartlı
// adet sonraki adıma girdi olur; bekleyen kalmayınca emrin GKK adımı kendiliğinden kapanır (sunucu).
export function FasonKarari({ satir, kapat }: { satir: KmFasonGkkSatiri; kapat: () => void }) {
  const istemci = useQueryClient();
  const formKimligi = useId();
  const [degerler, degerYaz] = useState<Record<Alan, string>>({ serbest: '', sartli: '', red: '' });
  const [not, notYaz] = useState('');
  const [kimlik, kimlikYaz] = useState(yeniIstekKimligi);
  const bekleyen = satir.bekleyenAdet;
  const adetler = { serbest: sayi(degerler.serbest), sartli: sayi(degerler.sartli), red: sayi(degerler.red) };
  const toplam = adetler.serbest + adetler.sartli + adetler.red;
  const ihlal = fasonKararIhlali(adetler, bekleyen);
  const yaz = useMutation({
    mutationFn: (g: KmFasonGkkKararGovdesi) => tekrarKorumaliGonder(
      (d) => api.post<KmFasonGkkKararCevabi>(`/kalite-merkezi/giris/fason/${String(satir.fasonIsEmriId)}/karar`, g, d), { istekKimligi: kimlik }),
    onSuccess: async () => {
      kimlikYaz(yeniIstekKimligi());
      await Promise.all([istemci.invalidateQueries({ queryKey: GIRIS_ANAHTARI }), istemci.invalidateQueries({ queryKey: GIRIS_KAYITLARI_ANAHTARI })]);
      kapat();
    },
  });
  const gonder = () => {
    if (ihlal !== null || yaz.isPending) return;
    yaz.mutate({ ...adetler, not: not.trim() === '' ? null : not.trim() });
  };
  const ozetId = `${formKimligi}-ozet`;
  return (
    <Pencere
      acik kapat={() => { if (!yaz.isPending) kapat(); }} baslik={`Fason dönüşü kararı · ${satir.emirNo} · OP ${String(satir.opNo)}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={yaz.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={formKimligi} yukleniyor={yaz.isPending} disabled={ihlal !== null}
            aria-describedby={ozetId}>
            {toplam > 0 ? `Kararı yaz (${String(toplam)} adet)` : 'Kararı yaz'}
          </Dugme>
        </>
      )}
    >
      <form id={formKimligi} className="tc-km-gkk-alanlar" onSubmit={(e) => { e.preventDefault(); gonder(); }} noValidate>
        <dl className="tc-km-gkk-bilgi">
          <div><dt>Parça</dt><dd><b>{satir.parcaNo}</b> {satir.parcaAd}</dd></div>
          <div><dt>Firma</dt><dd>{satir.firmaAdi ?? YOK}</dd></div>
          <div><dt>Gelen</dt><dd>{satir.gelenAdet === null ? YOK : `${String(satir.gelenAdet)} adet`} {satir.birim !== 'adet' && <small>({miktarMetni(satir.gelen)} {satir.birim ?? ''})</small>}</dd></div>
          <div><dt>Bekleyen</dt><dd><b>{bekleyen === null ? YOK : `${String(bekleyen)} adet`}</b></dd></div>
          <div><dt>Son mal kabul</dt><dd className="tc-km-gkk-mono">{satir.malKabulNo ?? YOK} <small>{zamanKisa(satir.sonZaman)}</small></dd></div>
        </dl>
        {!satir.gkkAdimi && (
          <p className="tc-km-gkk-soluk">Bu emirde GKK adımı yok (eski emir): karar yalnız stoğu değiştirir.</p>
        )}
        <div className="tc-km-gkk-ikili">
          {ALANLAR.map((a) => (
            <Girdi
              key={a.ad} etiket={a.etiket} type="number" inputMode="numeric" min={0} step={1} max={bekleyen ?? undefined}
              value={degerler[a.ad]} disabled={yaz.isPending || bekleyen === null} ipucu={a.ipucu}
              onChange={(e) => { const v = e.target.value; degerYaz((d) => ({ ...d, [a.ad]: v })); }}
            />
          ))}
        </div>
        <CokSatir etiket="Not" maxLength={500} value={not} disabled={yaz.isPending} onChange={(e) => { notYaz(e.target.value); }}
          ipucu="İsteğe bağlı; şartlı kabulde şartı yazın." />
        <p id={ozetId} className={ihlal !== null && toplam > 0 ? 'tc-km-gkk-hata' : 'tc-km-gkk-soluk'} role={ihlal !== null && toplam > 0 ? 'alert' : undefined}>
          {ihlal ?? `${String(toplam)} adet karar yazılır; ${String((bekleyen ?? 0) - toplam)} adet bekler.`}
        </p>
        {yaz.isError && <p className="tc-km-gkk-hata" role="alert">{hataIletisi(yaz.error, 'Karar yazılamadı; yeniden deneyin.')}</p>}
      </form>
    </Pencere>
  );
}
