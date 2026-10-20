import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AletAyrintiCevabi, Tur } from '#paylasilan/sozlesme/kalibrasyon.ts';
import { Dugme, DurumKutusu, OnayPenceresi, Pencere, Rozet } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { AletTuru } from './alet-simgeleri.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { AletFormu, KalibrasyonFormu, KullanimDisiFormu } from './formlar.tsx';
import { DURUM_TONU, SONUC_METNI, durumMetni, tarihMetni } from './gosterim.ts';
import { useKomut } from './komut.ts';

type Acik = 'kalibrasyon' | 'duzenle' | 'disi' | 'sil' | null;

const YOK = 'yok';

function Silme({ alet, kapat, bitti }: { alet: AletAyrintiCevabi; kapat: () => void; bitti: () => void }) {
  const komut = useKomut<undefined>(`/olcu-aletleri/${alet.id}/sil`, bitti, 'Alet silinemedi');
  return (
    <OnayPenceresi acik baslik="Aleti sil" tehlikeli onayMetni="Sil" yukleniyor={komut.yukleniyor} onayla={() => { komut.gonder(); }} vazgec={kapat}>
      <p>{alet.no} silinecek. Bu işlem geri alınamaz.</p>
      {komut.hata !== null && <p className="tc-kal-hata" role="alert">{komut.hata}</p>}
    </OnayPenceresi>
  );
}

export function AletAyrinti({ id, yazabilir, turler, kapat }: {
  id: number; yazabilir: boolean; turler: readonly Tur[]; kapat: () => void;
}) {
  const [acik, acikYaz] = useState<Acik>(null);
  const sorgu = useQuery({
    queryKey: anahtarlar.ayrinti(id),
    queryFn: () => api.get<AletAyrintiCevabi>(`/olcu-aletleri/${id}`),
  });
  const alet = sorgu.data;
  const kapatForm = () => { acikYaz(null); };

  return (
    <>
      <Pencere
        acik
        tur="yan"
        kapat={kapat}
        baslik={alet ? `${alet.no}${alet.ad ? ` · ${alet.ad}` : ''}` : 'Ölçü aleti'}
        alt={alet && yazabilir && (
          <>
            {alet.kayitSayisi === 0 && <Dugme tur="tehlike" simge="trash" onClick={() => { acikYaz('sil'); }}>Sil</Dugme>}
            {!alet.kullanimDisi && <Dugme onClick={() => { acikYaz('disi'); }}>Kullanım dışı bırak</Dugme>}
            <Dugme simge="edit" onClick={() => { acikYaz('duzenle'); }}>Düzenle</Dugme>
            <Dugme tur="birincil" simge="check" onClick={() => { acikYaz('kalibrasyon'); }}>Kalibrasyon kaydet</Dugme>
          </>
        )}
      >
        {sorgu.isPending && <DurumKutusu durum="yukleniyor" />}
        {sorgu.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Alet alınamadı')} yenile={() => { void sorgu.refetch(); }} />}
        {alet && (
          <>
            <dl className="tc-kal-liste">
              <dt>Durum</dt>
              <dd><Rozet ton={DURUM_TONU[alet.durum]}>{durumMetni(alet)}</Rozet></dd>
              {alet.kullanimDisiNedeni !== null && (<><dt>Kullanım dışı nedeni</dt><dd>{alet.kullanimDisiNedeni}</dd></>)}
              <dt>Tür</dt><dd><AletTuru tur={alet.tur} /></dd>
              <dt>Ölçme aralığı</dt><dd>{alet.olcmeAraligi ?? YOK}</dd>
              <dt>Yer / zimmet</dt><dd>{alet.yer ?? YOK}</dd>
              <dt>Periyot</dt><dd>{alet.periyotGun} gün</dd>
              <dt>Son kalibrasyon</dt><dd>{tarihMetni(alet.sonKalibrasyon) ?? YOK}</dd>
              <dt>Sonraki vade</dt><dd>{tarihMetni(alet.vade) ?? YOK}</dd>
            </dl>
            <h3 className="tc-kal-alt-baslik">Son kalibrasyon kayıtları</h3>
            {alet.sonKayitlar.length === 0
              ? <DurumKutusu durum="bos" mesaj="Kalibrasyon kaydı yok" />
              : (
                <ul className="tc-kal-kayitlar">
                  {alet.sonKayitlar.map((k) => (
                    <li key={k.id}>
                      <span className="mono">{tarihMetni(k.tarih)}</span>
                      <Rozet ton={k.sonuc === 'uygun' ? 'tamam' : 'hata'}>{SONUC_METNI[k.sonuc]}</Rozet>
                      <span className="tc-kal-kayit-ek">
                        {[k.sertifikaNo, k.aciklama, k.kisiAd].filter((m) => m !== null && m !== '').join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            {alet.kayitSayisi > alet.sonKayitlar.length && (
              <p className="tc-kal-ipucu">Toplam {alet.kayitSayisi} kayıt; son {alet.sonKayitlar.length} tanesi gösteriliyor.</p>
            )}
            {alet.kayitSayisi > 0 && yazabilir && <p className="tc-kal-ipucu">Kalibrasyon kaydı olan alet silinmez; kullanım dışı bırakılır.</p>}
          </>
        )}
      </Pencere>
      {alet && acik === 'kalibrasyon' && <KalibrasyonFormu aletId={alet.id} aletNo={alet.no} kapat={kapatForm} />}
      {alet && acik === 'disi' && <KullanimDisiFormu aletId={alet.id} aletNo={alet.no} kapat={kapatForm} />}
      {alet && acik === 'duzenle' && <AletFormu alet={alet} turler={turler} kapat={kapatForm} />}
      {alet && acik === 'sil' && <Silme alet={alet} kapat={kapatForm} bitti={kapat} />}
    </>
  );
}
