// Şoför kimlik no alanı (kart 3694, önizleme A): "İrsaliye no" penceresinde. Yazma sevkiyat.is-yaz, tam okuma yalnız sevkiyat.sofor-kimlik-oku ile.
// Sunucuda anahtar tanımlı değilse (acik=false) alan hiç çizilmez. Tam değer yalnız ekranda, yalnız bu bileşenin durumunda tutulur: önbelleğe, adrese ve günlüğe girmez.
import { useEffect, useState } from 'react';
import { kimlikGecerliMi } from '#paylasilan/kimlik-no.ts';
import { Dugme, Girdi, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { useSoforKimligi, useSoforKimligiKomutu } from './veri.ts';

export const KIMLIK_HANE = 11;

// Yalnız rakam; yazarken boşluk ve tire atılır, 11 haneyi aşan kesilir.
export const kimlikGirdisi = (ham: string): string => ham.replace(/\D/g, '').slice(0, KIMLIK_HANE);

export function kimlikHatasi(deger: string): string | null {
  if (deger === '') return null;
  if (deger.length < KIMLIK_HANE) return `${deger.length} / ${KIMLIK_HANE} hane`;
  return kimlikGecerliMi(deger) ? null : 'Geçersiz kimlik numarası: 11 hane olmalı ve sağlama rakamları tutmalı. Kontrol edip yeniden yazın.';
}

// bekleyenDegisti: yazılmış ama henüz kaydedilmemiş kimlik var mı (üst pencerenin Kaydet'i bunu bilir ve sessizce yutmaz).
export function SoforKimligiAlani({ isId, yazabilir, okuyabilir, bekleyenDegisti }: {
  isId: number; yazabilir: boolean; okuyabilir: boolean; bekleyenDegisti?: (bekliyor: boolean) => void;
}) {
  const durum = useSoforKimligi(isId);
  const { kaydet, sil, oku } = useSoforKimligiKomutu(isId);
  const { bildir } = useBildirim();
  const [deger, setDeger] = useState('');
  const [tam, setTam] = useState<string | null>(null);
  const [silOnayi, setSilOnayi] = useState(false);
  // Başka işe geçince ve pencere kapanınca tam değer bırakılır.
  // Tam değer ve yazılan değer her çıkışta bırakılır: durum, mutation önbelleği (oku.reset, kaydet.reset) ve alan.
  const { reset: okuReset } = oku, { reset: kaydetReset } = kaydet;
  useEffect(() => { setTam(null); setDeger(''); okuReset(); kaydetReset(); }, [isId, okuReset, kaydetReset]);
  useEffect(() => () => { okuReset(); kaydetReset(); }, [okuReset, kaydetReset]);
  const gizle = () => { setTam(null); okuReset(); };
  useEffect(() => { bekleyenDegisti?.(deger !== ''); return () => bekleyenDegisti?.(false); }, [deger, bekleyenDegisti]);
  if (!durum.data?.acik) return null;
  const kayitli = durum.data.var;
  const hata = kimlikHatasi(deger);
  const kaydedebilir = yazabilir && deger.length === KIMLIK_HANE && hata === null;
  const kaydetKomutu = () => kaydet.mutate(deger, {
    onSuccess: () => { setDeger(''); kaydet.reset(); bildir('tamam', 'Şoför kimlik no kaydedildi.'); },
    onError: (h) => { kaydet.reset(); bildir('hata', hataIletisi(h, 'Kimlik no kaydedilemedi')); },
  });
  const goster = () => oku.mutate(undefined, {
    onSuccess: (c) => setTam(c.kimlik),
    onError: (h) => { oku.reset(); bildir('hata', hataIletisi(h, 'Kimlik no okunamadı')); },
  });
  const silKomutu = () => sil.mutate(undefined, {
    onSuccess: () => { setSilOnayi(false); gizle(); bildir('tamam', 'Şoför kimlik no silindi.'); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Kimlik no silinemedi')),
  });
  return (
    <div className="tc-sevkiyat-kimlik">
      {kayitli ? (
        <>
          <Girdi etiket="Şoför kimlik no" value={tam ?? durum.data.maskeli ?? ''} readOnly className="tc-sevkiyat-kimlik-deger" />
          <div className="tc-sevkiyat-kimlik-satir">
            {okuyabilir && (tam === null
              ? <Dugme simge="eye" yukleniyor={oku.isPending} onClick={goster}>Kimliği göster</Dugme>
              : <Dugme onClick={gizle}>Gizle</Dugme>)}
            {yazabilir && <Dugme tur="tehlike" simge="trash" onClick={() => { gizle(); setSilOnayi(true); }}>Sil</Dugme>}
          </div>
          {silOnayi && (
            <div className="tc-sevkiyat-kimlik-onay" role="alertdialog" aria-label="Silme onayı">
              <b>Kimlik numarası silinsin mi?</b>
              <span>Geri alınamaz. E-irsaliye için gerekirse yeniden yazılır.</span>
              <div className="tc-sevkiyat-kimlik-satir">
                <Dugme onClick={() => setSilOnayi(false)} disabled={sil.isPending} data-ilk-odak>Vazgeç</Dugme>
                <Dugme tur="tehlike" yukleniyor={sil.isPending} onClick={silKomutu}>Evet, sil</Dugme>
              </div>
            </div>
          )}
          {tam !== null && <p className="tc-sevkiyat-ince">Gösterim denetim kaydına yazıldı. Pencereyi kapatınca yeniden maskelenir.</p>}
        </>
      ) : yazabilir ? (
        <>
          <Girdi etiket="Şoför kimlik no" inputMode="numeric" autoComplete="off" maxLength={KIMLIK_HANE + 4} value={deger} placeholder="11 haneli kimlik numarası"
            onChange={(e) => setDeger(kimlikGirdisi(e.target.value))} hata={deger.length === KIMLIK_HANE ? hata ?? undefined : undefined}
            ipucu={deger === '' ? 'Boş bırakılabilir; e-irsaliye kesilmeden önce girilmesi gerekir.' : deger.length < KIMLIK_HANE ? `${deger.length} / ${KIMLIK_HANE} hane` : undefined}
            onKeyDown={(e) => { if (e.key === 'Enter' && kaydedebilir) kaydetKomutu(); }} />
          <div className="tc-sevkiyat-kimlik-satir">
            <Dugme disabled={!kaydedebilir} yukleniyor={kaydet.isPending} onClick={kaydetKomutu}>Kimliği kaydet</Dugme>
            <span className="tc-sevkiyat-ince">Kimlik, irsaliye no'dan ayrı kaydedilir.</span>
          </div>
        </>
      ) : <p className="tc-sevkiyat-ince">Şoför kimlik no girilmemiş.</p>}
      <div className="tc-sevkiyat-kimlik-not">
        <b>Neden isteniyor</b>
        <span>E-irsaliyede sürücünün kimlik numarası zorunlu alandır; yalnız bu sevkin irsaliyesi için kullanılır.</span>
        <span>Şifreli saklanır, kayıtlara ve hata mesajlarına yazılmaz. Sevk tarihinden 90 gün sonra kendiliğinden silinir.</span>
        <span>{okuyabilir
          ? 'Tam numarayı yalnız bu yetkisi tanımlı kişiler görür; sizde bu yetki var, her gösterim denetim kaydına yazılır.'
          : 'Tam numarayı yalnız bu yetkisi tanımlı kişiler görür; sizde yok, yalnız son üç hane görünür.'}</span>
      </div>
    </div>
  );
}
