import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Toplanti, ToplantiKapsami, ToplantiListesiCevabi, ToplantiOzeti } from '#paylasilan/sozlesme/toplantilar.ts';
import { KONU_TUR_ADLARI, TOPLANTI_DURUM_ADLARI, TOPLANTI_TUR_ADLARI } from '#paylasilan/sozlesme/toplanti-sabitleri.ts';
import { DurumKutusu, Kart, Rozet, Sekmeler, Tablo, Dugme, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_TONU, zamanMetni } from './gosterim.ts';
import { ToplantiFormu } from './ToplantiFormu.tsx';
import './toplantilar.css';

const SUTUNLAR: Sutun<ToplantiOzeti>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (t) => zamanMetni(t.baslangic, t.bitis), mono: true, kirilmaz: true },
  {
    anahtar: 'baslik', baslik: 'Toplantı', hucre: (t) => (
      <span className="tc-top-ad-yer">
        <span className={t.durum === 'iptal' ? 'tc-top-cizik' : undefined}>{t.baslik}</span>
        <span className="tc-top-soluk">{[TOPLANTI_TUR_ADLARI[t.tur], t.yer].filter((x) => x !== null).join(' · ')}</span>
      </span>
    ), csv: (t) => t.baslik,
  },
  { anahtar: 'konu', baslik: 'Konu', hucre: (t) => KONU_TUR_ADLARI[t.konuTuru] },
  { anahtar: 'duzenleyen', baslik: 'Düzenleyen', hucre: (t) => t.duzenleyen.ad },
  { anahtar: 'katilimci', baslik: 'Katılımcı', hucre: (t) => t.katilimciSayisi, hizala: 'sag' },
  { anahtar: 'aksiyon', baslik: 'Açık aksiyon', hucre: (t) => t.acikAksiyon, hizala: 'sag' },
  { anahtar: 'durum', baslik: 'Durum', hucre: (t) => <Rozet ton={DURUM_TONU[t.durum]}>{TOPLANTI_DURUM_ADLARI[t.durum]}</Rozet>, csv: (t) => TOPLANTI_DURUM_ADLARI[t.durum] },
];

// Yönetim sayfası (/toplantilar, ikinci menü yaklaşan ve geçmiş) ile katılımcının sayfası (/profil/toplantilarim, Profilim altı) aynı listedir;
// katılımcı kendi toplantılarını görür, yazma düğmesi yalnız `toplantilar.yaz` ile gelir (sunucunun izni).
export function Toplantilar({ kapsam: verilen, kok = '/toplantilar', yeni = false }: { kapsam?: ToplantiKapsami; kok?: string; yeni?: boolean }) {
  const git = useNavigate();
  const [secilen, secilenYaz] = useState<ToplantiKapsami>('yaklasan');
  const kapsam = verilen ?? secilen;
  const [formAcik, formAcikYaz] = useState(yeni);
  const liste = useQuery({
    queryKey: anahtarlar.liste(kapsam),
    queryFn: () => api.get<ToplantiListesiCevabi>(`/toplantilar?kapsam=${kapsam}`),
    placeholderData: keepPreviousData,
  });
  const izin = liste.data?.izinler;
  const ac = (id: number) => { void git(`${kok}/${String(id)}`); };

  return (
    <Kart
      baslik={kok === '/profil/toplantilarim' ? 'Toplantılarım' : kapsam === 'gecmis' ? 'Geçmiş toplantılar' : 'Yaklaşan toplantılar'} simge="calendar"
      sag={izin?.yaz === true && <Dugme tur="birincil" simge="plus" onClick={() => formAcikYaz(true)}>Toplantı ekle</Dugme>}
    >
      <div className="tc-top-icerik">
        {verilen === undefined && (
          <Sekmeler
            etiket="Toplantılar" secili={kapsam} sec={secilenYaz}
            sekmeler={[{ anahtar: 'yaklasan', baslik: 'Yaklaşan', simge: 'calendar' }, { anahtar: 'gecmis', baslik: 'Geçmiş', simge: 'clock' }]}
          />
        )}
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Toplantılar alınamadı')} yenile={() => { void liste.refetch(); }} />}
        {liste.data && (
          <Tablo
            etiket="Toplantılar" sutunlar={SUTUNLAR} satirlar={liste.data.toplantilar} satirAnahtari={(t) => t.id} satirSec={(t) => ac(t.id)}
            bosMesaj={kapsam === 'gecmis' ? 'Geçmiş toplantı yok' : 'Yaklaşan toplantı yok'}
          />
        )}
        {kapsam === 'gecmis' && <p className="tc-top-ipucu">Son 200 toplantı gösterilir.</p>}
      </div>
      {formAcik && izin?.yaz === true && (
        <ToplantiFormu toplanti={null} eposta={izin.eposta} kapat={() => formAcikYaz(false)} kaydedildi={(t: Toplanti) => { formAcikYaz(false); ac(t.id); }} />
      )}
    </Kart>
  );
}

export const YaklasanToplantilar = () => <Toplantilar kapsam="yaklasan" />;
export const GecmisToplantilar = () => <Toplantilar kapsam="gecmis" />;
export const YeniToplanti = () => <Toplantilar kapsam="yaklasan" yeni />;
export const Toplantilarim = () => <Toplantilar kok="/profil/toplantilarim" />;
