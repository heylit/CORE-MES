import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { SiparisAyrintisi, SiparisSatiri } from '#paylasilan/sozlesme/siparisler.ts';
import { Dugme, DurumKutusu, CokSatir, Kart, OnayPenceresi, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { SIPARIS_DURUMU, fiyatMetni, kalanGun, miktarMetni, paraMetni, tarihMetni, zamanMetni } from './gorunum.ts';
import { SayfaBasligi } from './SayfaBasligi.tsx';
import { SiparisCarpani } from './SiparisCarpani.tsx';
import { SiparisProjeleri } from './SiparisProjeleri.tsx';
import { surumCakismasiMi, useFiyatGorur, useOnaylayabilir, useYazabilir, yazmaIletisi } from './yazma.ts';
import './siparisler.css';

type Komut = 'onayla' | 'kapat' | 'iptal';

const KOMUT_METNI: Record<Komut, { baslik: string; dugme: string; basari: string; govde: string }> = {
  onayla: { baslik: 'Siparişi onayla', dugme: 'Onayla', basari: 'Sipariş onaylandı.', govde: 'Onaylanınca satırlar ve tutarlar değişmez.' },
  kapat: { baslik: 'Siparişi kapat', dugme: 'Siparişi kapat', basari: 'Sipariş kapandı.', govde: 'Kapanan sipariş yeniden açılmaz.' },
  iptal: { baslik: 'Siparişi iptal et', dugme: 'İptal et', basari: 'Sipariş iptal edildi.', govde: 'İptal edilen sipariş yeniden açılmaz. Nedeni yazın.' },
};

function Ozellik({ ad, children }: { ad: string; children: ReactNode }) {
  return (
    <div className="tc-sp-ozellik">
      <dt>{ad}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function SiparisAyrinti() {
  const id = Number(useParams()['id']);
  const gezin = useNavigate();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yazabilir = useYazabilir();
  const onaylayabilir = useOnaylayabilir();
  const fiyatGorur = useFiyatGorur();
  const [komut, komutYaz] = useState<Komut | null>(null);
  const [neden, nedenYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);

  const siparis = useQuery({
    queryKey: anahtarlar.siparis(id),
    queryFn: () => api.get<SiparisAyrintisi>(`/siparisler/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });

  const kapat = () => { komutYaz(null); nedenYaz(''); hataYaz(null); };
  const gonder = useMutation({
    mutationFn: ({ k, surum }: { k: Komut; surum: number }) =>
      api.post<SiparisAyrintisi>(`/siparisler/${id}/${k}`, k === 'iptal' ? { surum, neden: neden.trim() } : { surum }),
    onSuccess: (cevap, { k }) => {
      istemci.setQueryData(anahtarlar.siparis(id), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisListeleri });
      bildir('tamam', KOMUT_METNI[k].basari);
      kapat();
    },
    onError: (h) => {
      hataYaz(yazmaIletisi(h, 'İşlem yapılamadı.'));
      if (surumCakismasiMi(h)) void istemci.invalidateQueries({ queryKey: anahtarlar.siparis(id) });
    },
  });

  if (siparis.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (siparis.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(siparis.error, 'Sipariş alınamadı')} yenile={() => { void siparis.refetch(); }} />;
  const s = siparis.data;
  const durum = SIPARIS_DURUMU[s.durum];
  const acik = s.durum === 'taslak' || s.durum === 'onayli';
  const kalan = acik ? kalanGun(s.termin) : null;

  const tumSutunlar: Sutun<SiparisSatiri>[] = [
    // 224: emir açılırken satır bu numarayla seçilir.
    { anahtar: 'sira', baslik: 'No', mono: true, kirilmaz: true, hucre: (m) => m.sira },
    { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (m) => m.malzemeKodu ?? `Kart ${m.malzemeNo}` },
    { anahtar: 'ad', baslik: 'Kalem', hucre: (m) => m.malzemeAdi ?? '—' },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (m) => `${miktarMetni(m.miktar)}${m.birim ? ` ${m.birim}` : ''}` },
    { anahtar: 'fiyat', baslik: 'Birim fiyat', hizala: 'sag', kirilmaz: true, hucre: (m) => fiyatMetni(m.birimFiyat, s.paraBirimi) },
    { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (m) => (m.termin === null ? 'Sipariş termini' : tarihMetni(m.termin)) },
    { anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', kirilmaz: true, hucre: (m) => paraMetni(m.tutar, s.paraBirimi) },
  ];
  const sutunlar = fiyatGorur ? tumSutunlar : tumSutunlar.filter((k) => k.anahtar !== 'fiyat' && k.anahtar !== 'tutar');
  const fiyatsizKalem = s.satirlar.filter((m) => m.birimFiyat === null).length;

  const duzenlenebilir = yazabilir && s.durum === 'taslak';
  const islemler = (
    <>
      {duzenlenebilir && <Dugme simge="edit" onClick={() => { void gezin(`/siparisler/${s.id}/duzenle`); }}>Düzenle</Dugme>}
      {onaylayabilir && s.durum === 'taslak' && <Dugme tur="birincil" simge="check" onClick={() => komutYaz('onayla')}>Onayla</Dugme>}
      {onaylayabilir && s.durum === 'onayli' && <Dugme tur="birincil" simge="check" onClick={() => komutYaz('kapat')}>Kapat</Dugme>}
      {onaylayabilir && acik && <Dugme tur="tehlike" simge="x" onClick={() => komutYaz('iptal')}>İptal et</Dugme>}
    </>
  );

  return (
    <section className="tc-sp">
      <SayfaBasligi
        baslik={s.no}
        alt={`${s.firmaAd ?? `Firma ${s.firmaId}`}, ${tarihMetni(s.siparisTarihi)} tarihli sipariş.`}
        ek={<Rozet ton={durum.ton}>{durum.etiket}</Rozet>}
        geriYol="/siparisler"
        geriMetni="Siparişlere dön"
        islemler={islemler}
      />

      {s.durum === 'taslak' && (
        <p className="tc-sp-bildirim" role="status"><strong>Taslak sipariş</strong> Onaylanana kadar düzenlenebilir; onaylanınca satırlar değişmez.</p>
      )}
      {fiyatGorur && s.durum === 'taslak' && fiyatsizKalem > 0 && (
        <p className="tc-sp-bildirim tc-sp-bildirim-hata" role="status"><strong>{`${fiyatsizKalem} kalemin fiyatı yok`}</strong> Fiyatlar girilmeden sipariş onaylanamaz.</p>
      )}
      {s.durum === 'onayli' && (
        <p className="tc-sp-bildirim" role="status"><strong>Sipariş onaylandı</strong> {s.onayZamani === null ? '' : zamanMetni(s.onayZamani)}</p>
      )}
      {s.durum === 'kapandi' && <p className="tc-sp-bildirim" role="status"><strong>Sipariş kapandı</strong></p>}
      {s.durum === 'iptal' && (
        <p className="tc-sp-bildirim tc-sp-bildirim-hata" role="status"><strong>Sipariş iptal edildi</strong> {s.iptalNedeni ?? ''}</p>
      )}

      <Kart baslik="Sipariş bilgileri">
        <dl className="tc-sp-ozellikler">
          <Ozellik ad="Firma">{s.firmaAd ?? `Firma ${s.firmaId}`}</Ozellik>
          <Ozellik ad="Müşteri sipariş no">{s.musteriSiparisNo ?? '—'}</Ozellik>
          <Ozellik ad="Sipariş tarihi">{tarihMetni(s.siparisTarihi)}</Ozellik>
          <Ozellik ad="Termin">
            {tarihMetni(s.termin)}
            {kalan && <span className={kalan.gecikti ? 'tc-sp-gecikme' : 'tc-sp-soluk'}> · {kalan.metin}</span>}
          </Ozellik>
          <Ozellik ad="Para birimi">{s.paraBirimi}</Ozellik>
          <Ozellik ad="KDV oranı">{`%${miktarMetni(s.kdvOrani)}`}</Ozellik>
          <Ozellik ad="Ödeme koşulu">{s.odemeKosulu ?? '—'}</Ozellik>
          <Ozellik ad="Ödeme vadesi">{s.odemeVadesiGun === null ? '—' : `${s.odemeVadesiGun} gün`}</Ozellik>
          <Ozellik ad="Gecikme cezası">{s.cezaOraniGun === null ? '—' : `%${miktarMetni(s.cezaOraniGun)} / gün`}</Ozellik>
          <Ozellik ad="Ceza tavanı">{s.cezaTavaniOrani === null ? '—' : `%${miktarMetni(s.cezaTavaniOrani)}`}</Ozellik>
          <Ozellik ad="Açıklama">{s.aciklama ?? '—'}</Ozellik>
        </dl>
      </Kart>

      <Kart baslik="Kalemler">
        <Tablo etiket="Sipariş kalemleri" sutunlar={sutunlar} satirlar={s.satirlar} satirAnahtari={(m) => m.id} bosMesaj="Satır yok." />
        {fiyatGorur && (
          <dl className="tc-sp-toplamlar">
            <div><dt>Ara toplam</dt><dd>{paraMetni(s.araToplam, s.paraBirimi)}</dd></div>
            <div><dt>{`KDV (%${miktarMetni(s.kdvOrani)})`}</dt><dd>{paraMetni(s.kdvTutari, s.paraBirimi)}</dd></div>
            <div className="tc-sp-genel"><dt>Genel toplam</dt><dd>{paraMetni(s.genelToplam, s.paraBirimi)}</dd></div>
          </dl>
        )}
      </Kart>

      <SiparisCarpani siparis={s} />

      <SiparisProjeleri siparis={s} />

      {komut !== null && (
        <OnayPenceresi
          acik
          baslik={KOMUT_METNI[komut].baslik}
          onayMetni={KOMUT_METNI[komut].dugme}
          tehlikeli={komut === 'iptal'}
          yukleniyor={gonder.isPending}
          vazgec={kapat}
          onayla={() => {
            if (komut === 'iptal' && neden.trim() === '') { hataYaz('İptal nedeni zorunlu.'); return; }
            hataYaz(null);
            gonder.mutate({ k: komut, surum: s.surum });
          }}
        >
          <div className="tc-sp-yigin">
            <p>{`${s.no}: ${KOMUT_METNI[komut].govde}`}</p>
            {komut === 'iptal' && <CokSatir etiket="İptal nedeni" required value={neden} onChange={(o) => nedenYaz(o.target.value)} maxLength={500} />}
            {hata !== null && <p className="tc-sp-hata" role="alert">{hata}</p>}
          </div>
        </OnayPenceresi>
      )}
    </section>
  );
}
