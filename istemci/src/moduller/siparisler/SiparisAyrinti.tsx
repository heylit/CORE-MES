import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { SiparisAyrintisi, SiparisSatiri } from '#paylasilan/sozlesme/siparisler.ts';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import { LogoBagi, CokSatir, Dugme, DurumKutusu, Kart, KilitliDeger, KilitliSutunNotu, KlasorBaglantisi, OnayPenceresi, Rozet, Tablo, YETKI_ADI, useBildirim, type Sutun, LogoRozeti, useLogoRozetleri } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { GecmisDugmesi } from '../denetim/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { SIPARIS_DURUMU, fiyatMetni, kalanGun, miktarMetni, paraMetni, tarihMetni, zamanMetni } from './gorunum.ts';
import { LogoCariHazirligi } from './LogoCariHazirligi.tsx';
import { SayfaBasligi } from './SayfaBasligi.tsx';
import { SiparisCarpani } from './SiparisCarpani.tsx';
import { SiparisProjeleri } from './SiparisProjeleri.tsx';
import { GeriAlmaUyarisi, SiparisOnayPenceresi } from './SiparisAcilisi.tsx';
import { KalemMetni } from './MalzemeSecici.tsx';
import { surumCakismasiMi, useFiyatGorur, useOnaylayabilir, useYazabilir, yazmaIletisi } from './yazma.ts';
import './siparisler.css';

type Komut = 'onayla' | 'kapat' | 'iptal' | 'onay-geri-al';

const KOMUT_METNI: Record<Komut, { baslik: string; dugme: string; basari: string; govde: string }> = {
  onayla: { baslik: 'Siparişi onayla', dugme: 'Onayla', basari: 'Sipariş onaylandı.', govde: 'Onaylanınca satırlar ve tutarlar değişmez.' },
  // Kapatma işin bittiğini, iptal hiç yapılmayacağını söyler; ikisi de "pencereyi kapat / formdan vazgeç" ile karışmasın diye adları sonucu anar.
  kapat: {
    baslik: 'Siparişi tamamlandı olarak kapat', dugme: 'Tamamlandı olarak kapat', basari: 'Sipariş tamamlandı olarak kapandı.',
    govde: 'Teslimat ve fatura bittiyse kullanın. Sipariş satış raporlarında ve beklenen tahsilatta kalır; yeniden açılmaz.',
  },
  iptal: {
    baslik: 'Siparişi iptal et', dugme: 'Siparişi iptal et', basari: 'Sipariş iptal edildi.',
    govde: 'Sipariş yapılmayacaksa kullanın. Satış raporlarından ve beklenen tahsilattan çıkar; taslaktaki üretim emirleri iptal olur. Planlanmış, başlamış ya da malzeme bağlanmış emir varsa iptal edilemez, önce o emirleri kapatın. Yeniden açılmaz. Nedeni yazın.',
  },
  // SIP-19 (3254 a): onay geri alınır, sipariş taslağa döner; emre bağlı kalemde yalnız termin değişir.
  'onay-geri-al': {
    baslik: 'Onayı geri al', dugme: 'Onayı geri al', basari: 'Onay geri alındı; sipariş taslakta.',
    govde: 'Sipariş taslağa döner. Üretim emri açılmış kalemlerde yalnız termin değişir. Yeniden onaylanınca bağlı proje bitişi ve başlamamış emir teslimi yeni termine kayar. Nedeni yazın.',
  },
};
const GEREKCELI: ReadonlySet<Komut> = new Set(['iptal', 'onay-geri-al']);

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
      api.post<SiparisAyrintisi>(`/siparisler/${id}/${k}`, GEREKCELI.has(k) ? { surum, neden: neden.trim() } : { surum }),
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

  // 3344: Logo'ya gidiş rozeti başlıkta; nedeni rozetin ipucunda ve listede.
  const logo = useLogoRozetleri('satis-siparisi', Number.isSafeInteger(id) && id > 0 ? [id] : []);
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
    { anahtar: 'ad', baslik: 'Kalem', hucre: (m) => <KalemMetni ad={m.malzemeAdi} aciklamalar={m.aciklamalar} /> },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (m) => `${miktarMetni(m.miktar)}${m.birim ? ` ${m.birim}` : ''}` },
    { anahtar: 'fiyat', baslik: 'Birim fiyat', hizala: 'sag', kirilmaz: true, hucre: (m) => fiyatMetni(m.birimFiyat, s.paraBirimi) },
    // 3244 b: kalem termini hep tarihle görünür; siparişten geliyorsa işaretlidir, elle verildiyse "Elle".
    {
      anahtar: 'termin', baslik: 'Termin', kirilmaz: true,
      hucre: (m) => (
        <span className="tc-sp-kalem-termin">
          {tarihMetni(m.termin ?? s.termin)}
          {m.termin === null || m.termin === s.termin ? <Rozet ton="pasif" gorunum="cizgi">Sipariş termini</Rozet> : <Rozet ton="uyari" gorunum="cizgi">Elle</Rozet>}
          {m.emreBagli && <Rozet ton="bilgi" gorunum="cizgi">Emre bağlı</Rozet>}
        </span>
      ),
    },
    {
      anahtar: 'parti', baslik: 'Üretim çeşidi',
      hucre: (m) => (m.partiler.length === 0
        ? EMIR_TURU_ADLARI.seri
        : <span className="tc-sp-parti-cipleri">{m.partiler.map((p) => <Rozet key={p.id} ton="bilgi" gorunum="cizgi">{`${miktarMetni(p.adet)} ${EMIR_TURU_ADLARI[p.emirTuru]}`}</Rozet>)}</span>),
    },
    { anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', kirilmaz: true, hucre: (m) => paraMetni(m.tutar, s.paraBirimi) },
  ];
  const sutunlar = fiyatGorur ? tumSutunlar : tumSutunlar.filter((k) => k.anahtar !== 'fiyat' && k.anahtar !== 'tutar');
  const fiyatsizKalem = s.satirlar.filter((m) => m.birimFiyat === null).length;
  const sifirFiyatliKalem = s.satirlar.filter((m) => m.birimFiyat !== null && Number(m.birimFiyat) === 0).length;

  const duzenlenebilir = yazabilir && s.durum === 'taslak';
  const emreBagliVar = s.satirlar.some((m) => m.emreBagli);
  const islemler = (
    <>
      <KlasorBaglantisi tur="siparis" id={s.id} />
      {duzenlenebilir && <Dugme simge="edit" onClick={() => { void gezin(`/siparisler/${s.id}/duzenle`); }}>Düzenle</Dugme>}
      {onaylayabilir && s.durum === 'taslak' && <Dugme tur="birincil" simge="check" onClick={() => komutYaz('onayla')}>Onayla</Dugme>}
      {onaylayabilir && s.durum === 'onayli' && <Dugme simge="rotate" onClick={() => komutYaz('onay-geri-al')}>Onayı geri al</Dugme>}
      {onaylayabilir && s.durum === 'onayli' && <Dugme tur="birincil" simge="flag" title="Teslimat ve fatura bitti; sipariş tamamlandı sayılır" onClick={() => komutYaz('kapat')}>Tamamlandı olarak kapat</Dugme>}
      {onaylayabilir && acik && <Dugme tur="tehlike" simge="stop" title="Sipariş yapılmayacak; raporlardan ve tahsilattan çıkar" onClick={() => komutYaz('iptal')}>Siparişi iptal et</Dugme>}
    </>
  );

  return (
    <section className="tc-sp">
      <SayfaBasligi
        baslik={s.no}
        alt={`${s.firmaAd ?? `Firma ${s.firmaId}`}, ${tarihMetni(s.siparisTarihi)} tarihli sipariş.`}
        ek={<><Rozet ton={durum.ton}>{durum.etiket}</Rozet><LogoRozeti bilgi={logo.durum(id)} hata={logo.hata} baslik /><LogoCariHazirligi firmaId={s.firmaId} logoda={logo.hazir || logo.hata ? logo.durum(id)?.durum === 'logoda' : null} crm={false} /><LogoBagi tur="satis-siparisi" id={id} bilgi={logo.durum(id)} /></>}
        geriYol="/siparisler"
        geriMetni="Siparişlere dön"
        islemler={islemler}
      />

      {s.durum === 'taslak' && !emreBagliVar && (
        <p className="tc-sp-bildirim" role="status"><strong>Taslak sipariş</strong> Onaylanana kadar düzenlenebilir; onaylanınca satırlar değişmez.</p>
      )}
      {s.durum === 'taslak' && emreBagliVar && (
        <p className="tc-sp-bildirim tc-sp-bildirim-uyari" role="status">
          <strong>Onay geri alındı</strong> Üretim emri açılmış kalemlerde yalnız termin değişir. Yeniden onaylanana kadar bu siparişten proje ya da emir açılmaz.
        </p>
      )}
      {fiyatGorur && s.durum === 'taslak' && sifirFiyatliKalem > 0 && (
        <p className="tc-sp-bildirim" role="status"><strong>{`${sifirFiyatliKalem} kalemin fiyatı 0`}</strong> Onaylamadan önce kalemin bedelsiz olduğunu doğrulayın.</p>
      )}
      {fiyatGorur && s.durum === 'taslak' && fiyatsizKalem > 0 && (
        <p className="tc-sp-bildirim tc-sp-bildirim-hata" role="status"><strong>{`${fiyatsizKalem} kalemin fiyatı yok`}</strong> Fiyatlar girilmeden sipariş onaylanamaz.</p>
      )}
      {s.durum === 'onayli' && (
        <p className="tc-sp-bildirim" role="status"><strong>Sipariş onaylandı</strong> {s.onayZamani === null ? '' : zamanMetni(s.onayZamani)}</p>
      )}
      {s.durum === 'kapandi' && <p className="tc-sp-bildirim" role="status"><strong>Sipariş tamamlandı olarak kapandı</strong></p>}
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
          <Ozellik ad="Ödeme vadesi">{!fiyatGorur ? <KilitliDeger yetki={YETKI_ADI.siparisFiyati} /> : s.odemeVadesiGun === null ? '—' : `${s.odemeVadesiGun} gün`}</Ozellik>
          <Ozellik ad="Gecikme cezası">{!fiyatGorur ? <KilitliDeger yetki={YETKI_ADI.siparisFiyati} /> : s.cezaOraniGun === null ? '—' : `%${miktarMetni(s.cezaOraniGun)} / gün`}</Ozellik>
          <Ozellik ad="Ceza tavanı">{!fiyatGorur ? <KilitliDeger yetki={YETKI_ADI.siparisFiyati} /> : s.cezaTavaniOrani === null ? '—' : `%${miktarMetni(s.cezaTavaniOrani)}`}</Ozellik>
          <Ozellik ad="Açıklama">{s.aciklama ?? '—'}</Ozellik>
        </dl>
      </Kart>

      <Kart
        baslik="Kalemler"
        sag={<GecmisDugmesi kayitlar={s.satirlar.map((m) => ({ tablo: 'siparisler_siparis_satiri', anahtar: { id: m.id } }))} />}
      >
        {!fiyatGorur && <KilitliSutunNotu ne="Birim fiyat ve tutar sütunları" yetki={YETKI_ADI.siparisFiyati} />}
        <Tablo etiket="Sipariş kalemleri" sutunlar={sutunlar} satirlar={s.satirlar} satirAnahtari={(m) => m.id} bosMesaj="Satır yok." />
        {!fiyatGorur ? (
          <dl className="tc-sp-toplamlar">
            <div className="tc-sp-genel"><dt>Genel toplam</dt><dd><KilitliDeger yetki={YETKI_ADI.siparisFiyati} /></dd></div>
          </dl>
        ) : (
          <dl className="tc-sp-toplamlar">
            <div><dt>Ara toplam</dt><dd>{paraMetni(s.araToplam, s.paraBirimi)}</dd></div>
            <div><dt>{`KDV (%${miktarMetni(s.kdvOrani)})`}</dt><dd>{paraMetni(s.kdvTutari, s.paraBirimi)}</dd></div>
            <div className="tc-sp-genel"><dt>Genel toplam</dt><dd>{paraMetni(s.genelToplam, s.paraBirimi)}</dd></div>
          </dl>
        )}
      </Kart>

      <SiparisCarpani siparis={s} />

      <SiparisProjeleri siparis={s} />

      {komut === 'onayla' && <SiparisOnayPenceresi siparis={s} kapat={kapat} />}
      {komut !== null && komut !== 'onayla' && (
        <OnayPenceresi
          acik
          baslik={KOMUT_METNI[komut].baslik}
          onayMetni={KOMUT_METNI[komut].dugme}
          tehlikeli={GEREKCELI.has(komut)}
          yukleniyor={gonder.isPending}
          vazgec={kapat}
          onayla={() => {
            if (GEREKCELI.has(komut) && neden.trim() === '') { hataYaz(komut === 'iptal' ? 'İptal nedeni zorunlu.' : 'Onayı geri alma nedeni zorunlu.'); return; }
            hataYaz(null);
            gonder.mutate({ k: komut, surum: s.surum });
          }}
        >
          <div className="tc-sp-yigin">
            <p>{`${s.no}: ${KOMUT_METNI[komut].govde}`}</p>
            {GEREKCELI.has(komut) && <GeriAlmaUyarisi siparisId={s.id} iptal={komut === 'iptal'} />}
            {GEREKCELI.has(komut) && (
              <CokSatir etiket={komut === 'iptal' ? 'İptal nedeni' : 'Geri alma nedeni'} required value={neden} onChange={(o) => nedenYaz(o.target.value)} maxLength={500} />
            )}
            {hata !== null && <p className="tc-sp-hata" role="alert">{hata}</p>}
          </div>
        </OnayPenceresi>
      )}
    </section>
  );
}
