import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Firma, FirmaAyrintiCevabi, FirmaCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Dugme, DurumKutusu, Kart, OnayPenceresi, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../../../ortak/veri/api.ts';
import { YOK } from '../bicim.ts';
import { firmaEtiketi } from '../donustur.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { CariHesap } from './CariHesap.tsx';
import { FirmaFormu } from './FirmaFormu.tsx';
import { FIRMA_TUR_ADI, firmaTarafi, LOGO_DURUM_ADI, pasifOnKontrol } from './kurallar.ts';

// Firma kartı (prototipte VIEWS.firmad; tam kipte altında cari hesap). Kart musteri-tedarikci'den okunur; aktiflik geçişi
// finansın ucundadır (FNS-60: açık kayıt varken pasife alınmaz). Düzenleme ve durum düğmeleri musteri-tedarikci.yaz ister.

const kartAnahtari = (id: number) => ['finans', 'yeni', 'firma', id] as const;

function Alan({ ad, deger }: { ad: string; deger: string | number | null | undefined }) {
  return (
    <div className="tc-fk-alan">
      <span className="tc-fk-not">{ad}</span>
      <b>{deger === null || deger === undefined || deger === '' ? YOK : String(deger)}</b>
    </div>
  );
}

export function FirmaKarti({ id, finans, yetki, kayitGir, geri }: EkranOzellikleri & { id: number; geri: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [duzenle, duzenleYaz] = useState(false);
  const [soruyor, soruyorYaz] = useState(false);
  const [uyari, uyariYaz] = useState<string | null>(null);
  const kart = useQuery({ queryKey: kartAnahtari(id), queryFn: () => api.get<FirmaAyrintiCevabi>(`/musteri-tedarikci/firmalar/${id}`) });
  const durum = useMutation({
    mutationFn: (f: Firma) => api.post<FirmaCevabi>(`/finans/firmalar/${f.id}/${f.aktif ? 'pasif' : 'aktif'}`, { surum: f.surum }),
    onSettled: () => istemci.invalidateQueries({ queryKey: ['finans'] }),
  });

  const ust = <div className="tc-fk-dugmeler"><Dugme simge="chev-left" onClick={geri}>Firmalar</Dugme></div>;
  if (kart.isError) return <div className="tc-fk">{ust}<DurumKutusu durum="hata" mesaj={hataIletisi(kart.error, 'Firma kartı alınamadı')} yenile={() => { void kart.refetch(); }} /></div>;
  if (!kart.data) return <div className="tc-fk">{ust}<DurumKutusu durum="yukleniyor" /></div>;
  const f = kart.data.firma;

  const durumIste = () => {
    // Kalan kayıt önceden hesaplanır; varsa onay yerine neden çıkar (rakam yetkisi olmayanda sunucu söyler).
    const on = f.aktif && finans ? pasifOnKontrol(finans.V, f.id) : null;
    if (on) { uyariYaz(on); return; }
    soruyorYaz(true);
  };
  const durumDegistir = () => {
    durum.mutate(f, {
      onSuccess: (c) => {
        soruyorYaz(false); uyariYaz(null);
        istemci.setQueryData(kartAnahtari(id), { ...kart.data, firma: c.firma });
        bildir('tamam', c.firma.aktif ? 'Firma aktif yapıldı.' : 'Firma pasife alındı.');
      },
      onError: (h) => {
        soruyorYaz(false);
        if (h instanceof ApiHatasi && h.govde.kod === 'CAKISMA') { bildir('bilgi', 'Kart başka biri tarafından değiştirilmiş; yenilendi.'); void kart.refetch(); return; }
        // FNS-60: sunucunun nedeni kartta kalır (kapanmamış fatura, ödeme ya da çek).
        if (h instanceof ApiHatasi && h.govde.kod === 'GECERSIZ') { uyariYaz(h.message); return; }
        bildir('hata', hataIletisi(h, 'Firma durumu değiştirilemedi.'));
      },
    });
  };
  // Cari hesap firmanın finanstaki etiketiyle bulunur (aynı adlı iki firma kodla ayrılır).
  const etiket = finans ? firmaEtiketi(finans.V, f.id) : null;
  const tarih = (s: string) => new Date(s).toLocaleString('tr-TR');

  return (
    <div className="tc-fk">
      {ust}
      <Kart
        baslik={f.ad}
        baslikEki={f.aktif ? <Rozet ton="tamam">Aktif</Rozet> : <Rozet ton="pasif">Pasif</Rozet>}
        sag={yetki.firmaYaz ? (
          <div className="tc-fk-dugmeler">
            <Dugme simge="edit" onClick={() => duzenleYaz(true)}>Düzenle</Dugme>
            <Dugme simge={f.aktif ? 'lock' : 'check'} onClick={durumIste}>{f.aktif ? 'Pasife al' : 'Aktif yap'}</Dugme>
          </div>
        ) : undefined}
      >
        <p className="tc-fk-not">{FIRMA_TUR_ADI[f.tur]}{f.fason ? ' · fason' : ''} · {f.aktif ? 'aktif' : 'pasif'}{f.kod ? ` · kod ${f.kod}` : ''}</p>
      </Kart>
      {!f.aktif && <DurumKutusu durum="bos" mesaj="Bu firma pasif: yeni belge, ödeme ve çek açılamaz; var olan kayıtları görünür kalır." />}
      {uyari && <DurumKutusu durum="hata" mesaj={uyari} />}
      <div className="tc-fk-iki">
        <Kart baslik="Kimlik">
          <Alan ad="Kod" deger={f.kod} />
          <Alan ad="Ad" deger={f.ad} />
          <Alan ad="Tür" deger={FIRMA_TUR_ADI[f.tur]} />
          <Alan ad="Fason" deger={f.fason ? 'Evet' : 'Hayır'} />
          <Alan ad="Ülke" deger={f.ulkeKodu} />
          <Alan ad="Vergi no" deger={f.vergiNo} />
          <Alan ad="Vergi dairesi" deger={f.vergiDairesi} />
          <Alan ad="Varsayılan para birimi" deger={f.paraBirimi} />
          <Alan ad="Varsayılan vade (gün)" deger={f.vadeGunu} />
        </Kart>
        <div className="tc-fk">
          <Kart baslik="Adres ve iletişim">
            <Alan ad="Adres" deger={f.adres} />
            <Alan ad="İlçe" deger={f.ilce} />
            <Alan ad="İl" deger={f.il} />
            <Alan ad="Posta kodu" deger={f.postaKodu} />
            <Alan ad="Telefon" deger={f.telefon} />
            <Alan ad="E-posta" deger={f.ePosta} />
          </Kart>
          <Kart baslik="Logo">
            <p className="tc-fk-not">Logo köprüsü yazar; elle değişmez</p>
            <Alan ad="Logo cari kodu" deger={f.logoCariKodu} />
            <Alan ad="Logo kayıt no" deger={f.logoKayitNo} />
            <Alan ad="Logo gönderim durumu" deger={f.logoGonderimDurumu ? LOGO_DURUM_ADI[f.logoGonderimDurumu] : null} />
            {f.logoKayitNo !== null && <p className="tc-fk-not">Logo'ya gönderildiği için kod ve Logo cari kodu değiştirilemez.</p>}
          </Kart>
        </div>
      </div>
      <p className="tc-fk-not">Açılış {tarih(f.olusturma)}{f.guncelleme ? ` · son değişiklik ${tarih(f.guncelleme)}` : ''}</p>
      {finans && etiket && <CariHesap finans={finans} yetki={yetki} kayitGir={kayitGir} party={etiket} side={firmaTarafi(f.tur)} />}
      <OnayPenceresi
        acik={soruyor} baslik={f.aktif ? 'Firma pasife alınsın mı?' : 'Firma aktif yapılsın mı?'}
        onayMetni={f.aktif ? 'Pasife almayı onayla' : 'Aktif yapmayı onayla'} tehlikeli={f.aktif} yukleniyor={durum.isPending}
        onayla={durumDegistir} vazgec={() => soruyorYaz(false)}
      >
        <p>{f.aktif ? 'Pasif firmaya yeni belge, ödeme ve çek açılamaz; var olan kayıtları görünür kalır.' : 'Firma yeniden kayıtlarda seçilebilir olur.'}</p>
      </OnayPenceresi>
      {duzenle && (
        <FirmaFormu
          firma={f} kapat={() => duzenleYaz(false)}
          kaydedildi={(yeni) => { duzenleYaz(false); istemci.setQueryData(kartAnahtari(id), { ...kart.data, firma: yeni }); }}
          yenile={async () => { const r = await kart.refetch(); return r.data?.firma ?? null; }}
        />
      )}
    </div>
  );
}
