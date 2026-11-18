import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LogoBaglanabilirTur, LogoBelgeBagCevabi, LogoBelgeBulgusu } from '#paylasilan/sozlesme/logo.ts';
import { api, hataIletisi } from '../veri/api.ts';
import { yeniIstekKimligi } from '../veri/istek-kimligi.ts';
import { useYetki } from '../veri/yetki.ts';
import { useBildirim } from './Bildirim.tsx';
import { Dugme } from './Dugme.tsx';
import { DOVIZ, LOGO_BAGLAMA_YETKISI, LogoBelgeAramasi, tarihMetni, tutarMetni, type LogoBaglanacakHedef } from './LogoBelgeAramasi.tsx';
import type { LogoRozetBilgisi } from './LogoRozeti.tsx';
import { OnayPenceresi } from './OnayPenceresi.tsx';
import './logo-rozeti.css';

// Yanlış kayda bağlamayı en çok tutar yakalar. Logo net toplamının KDV'li olup olmadığı belge ayarına bağlıdır; CORE'un KDV hariç ya da
// (siparişte) KDV dahil tutarından birine eşitse aynı sayılır. Para birimi farklıysa kur bilinmez, karşılaştırılmaz.
const LOGO_DOVIZ_KODU: Record<string, number | null> = { TRY: null, USD: 1, EUR: 20, GBP: 17 };
const logoDoviz = (d: number | null): number | null => (d === 0 ? null : d);
export function tutarKarsilastirmasi(hedef: LogoBaglanacakHedef['tutar'], b: Pick<LogoBelgeBulgusu, 'tutar' | 'dovizTuru'>): { metin: string; fark: boolean } | null {
  if (hedef === null) return null;
  const kod = LOGO_DOVIZ_KODU[hedef.paraBirimi];
  if (b.tutar === null) return { metin: 'Tutar karşılaştırılamadı: Logo kaydında tutar yok.', fark: true };
  if (kod === undefined || kod !== logoDoviz(b.dovizTuru)) {
    const logo = logoDoviz(b.dovizTuru);
    return { metin: `Tutar karşılaştırılamadı: para birimi farklı (CORE ${hedef.paraBirimi === 'TRY' ? 'TL' : hedef.paraBirimi}, Logo ${logo === null ? 'TL' : (DOVIZ[logo] ?? `döviz ${String(logo)}`)}).`, fark: true };
  }
  const logo = Number(b.tutar);
  const esit = [hedef.kdvHaric, hedef.kdvDahil].some((x) => x !== null && Math.abs(Number(x) - logo) < 0.005);
  if (esit) return { metin: `Tutar aynı (${tutarMetni(b.tutar, kod)}).`, fark: false };
  const coreMetni = `${tutarMetni(hedef.kdvHaric, kod)} KDV hariç${hedef.kdvDahil === null ? '' : ` (${tutarMetni(hedef.kdvDahil, kod)} KDV dahil)`}`;
  return { metin: `Tutar farklı: CORE ${coreMetni}, Logo ${tutarMetni(b.tutar, kod)}.`, fark: true };
}

// 3360-2 a: ayrıntıda Logo rozetinin yanı. Logo'ya gitmemiş belgede (rozeti olan) yazabilene "Logo'da ara ve bağla"; elle bağlanmış
// belgede "elle bağlandı" ve yöneticiye (Sistem Ayarları yazma) "Bağı kaldır". Rozeti olmayan belge Logo'ya gitmez, düğme çizilmez.
// Bağlanınca rozet "Logo'da" olur ve bu bileşen arama penceresini kaldırır.
export function LogoBagi({ tur, id, bilgi }: { tur: LogoBaglanabilirTur; id: number; bilgi: LogoRozetBilgisi | null }) {
  const yetki = useYetki();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [secim, secimYaz] = useState<{ b: LogoBelgeBulgusu; hedef: LogoBaglanacakHedef } | null>(null);
  const [soru, soruYaz] = useState(false);
  const bitti = (ileti: string) => { void istemci.invalidateQueries({ queryKey: ['logo'] }); bildir('tamam', ileti); };
  const bagla = useMutation({
    mutationFn: (b: LogoBelgeBulgusu) => api.post<LogoBelgeBagCevabi>(
      '/logo/belge-bagla', { tur, belgeId: id, logoKayitNo: b.logoKayitNo }, { istekKimligi: yeniIstekKimligi() },
    ),
    onSuccess: () => { secimYaz(null); bitti('Belge Logo kaydına bağlandı; CORE onu bir daha göndermez.'); },
  });
  const kaldir = useMutation({
    mutationFn: () => api.post<LogoBelgeBagCevabi>('/logo/belge-bag-kaldir', { tur, belgeId: id }, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: () => { soruYaz(false); bitti("Bağ kaldırıldı; belge yeniden Logo'ya gidecek."); },
  });
  if (bilgi === null) return null;
  if (bilgi.durum === 'logoda') {
    if (!bilgi.elle) return null;
    return (
      <span className="tc-logo-bagi">
        <span className="tc-logo-rozet-neden">elle bağlandı</span>
        {yetki.var('ayarlar.yaz') && <Dugme onClick={() => { kaldir.reset(); soruYaz(true); }}>Bağı kaldır</Dugme>}
        <OnayPenceresi
          acik={soru}
          baslik="Logo bağı kaldırılsın mı?"
          onayMetni="Bağı kaldır"
          tehlikeli
          yukleniyor={kaldir.isPending}
          onayla={() => kaldir.mutate()}
          vazgec={() => soruYaz(false)}
        >
          <p>Belge yeniden "Logo'ya gitmedi" olur; gönderim açıksa CORE onu Logo'ya gönderir. Logo'daki elle girilmiş kayıt olduğu gibi kalır.</p>
          {kaldir.isError && <p className="tc-logo-ara-ileti" role="alert">{hataIletisi(kaldir.error, 'Bağ kaldırılamadı.')}</p>}
        </OnayPenceresi>
      </span>
    );
  }
  if (!yetki.var(LOGO_BAGLAMA_YETKISI[tur])) return null;
  const s = secim;
  const tarihFarki = s !== null && s.hedef.tarih !== null && s.b.tarih !== null && s.b.tarih !== s.hedef.tarih
    ? `tarih CORE ${tarihMetni(s.hedef.tarih)}, Logo ${tarihMetni(s.b.tarih)}.` : null;
  const tutar = s === null ? null : tutarKarsilastirmasi(s.hedef.tutar, s.b);
  const farkVar = tarihFarki !== null || tutar?.fark === true;
  const satirlar = [tarihFarki, tutar?.metin ?? null].filter((x) => x !== null);
  const fark = satirlar.length === 0 ? null : `${farkVar ? 'Fark var: ' : ''}${satirlar.join(' ')}`;
  return (
    <>
      <LogoBelgeAramasi tur={tur} dugmeMetni="Logo'da ara ve bağla" baglanacak={{ tur, id, sec: (b, hedef) => { bagla.reset(); secimYaz({ b, hedef }); } }} />
      <OnayPenceresi
        acik={s !== null}
        baslik={`${s?.hedef.no ?? 'Belge'} ↔ ${s?.b.no ?? `#${String(s?.b.logoKayitNo ?? '')}`} bağlansın mı?`}
        onayMetni="Bağla"
        yukleniyor={bagla.isPending}
        onayla={() => { if (s !== null) bagla.mutate(s.b); }}
        vazgec={() => secimYaz(null)}
      >
        <p>CORE belgesi bu Logo kaydına bağlanır ve rozeti "Logo'da" olur. CORE onu bir daha göndermez; sonraki değişiklik Logo'da elle yapılır. Logo'ya yazılmaz.</p>
        {fark !== null && <p className={farkVar ? 'tc-logo-ara-fark' : 'tc-logo-rozet-neden'} role="status">{fark}</p>}
        {bagla.isError && <p className="tc-logo-ara-ileti" role="alert">{hataIletisi(bagla.error, 'Bağlanamadı.')}</p>}
      </OnayPenceresi>
    </>
  );
}
