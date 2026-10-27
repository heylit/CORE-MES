import { useState } from 'react';
import {
  Dugme, IsaretKutusu, Kart, OnayPenceresi, Rozet, SayfaBasligi, Secim, Simge, useBildirim,
} from '../../../../ortak/arayuz/index.ts';
import { M, gunEtiketi, isoGun, saatDakika } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { IletiMetni } from '../sohbet/IletiMetni.tsx';
import type { Kayit, Kural, Zamanli } from '../tipler.ts';
import { duzenleyebilir } from '../yetki.ts';
import { BEKLEYEN_TUR, KURAL_TURLERI, TEKRARLAR, kuralParametresi, kuralTuruMu } from '../otomasyon/kurallar.ts';
import { KISISIZ, eskiCsv } from './csv.ts';
import { dosyaIndir, takvimimMetni } from './takvim-dosyasi.ts';
import './ayarlar.css';

export { KuralFormu } from './KuralFormu.tsx';

export const HATIRLATMA_SECENEKLERI = [
  [0, 'Hatırlatma yok'], [5, '5 dakika önce'], [10, '10 dakika önce'], [15, '15 dakika önce'], [30, '30 dakika önce'], [60, '1 saat önce'], [1440, '1 gün önce'],
] as const;

const SIPARIS_DURUMU = { sirada: 'Sırada', uretimde: 'Üretimde', hazir: 'Hazır', sevk: 'Sevk edildi' } as const;
const GOREV_DURUMU = { todo: 'Yapılacak', doing: 'Yapılıyor', done: 'Bitti' } as const;

type Silinecek = { tur: 'zamanli' | 'kural'; id: string } | null;

// Prototipin "Ayarlar ve otomasyon" görünümü. E-posta bölümü, cihaz bildirimi (208 a) ve içe aktarma (212 a) yoktur.
export function Ayarlar() {
  const m = useMesaj();
  const { bildir } = useBildirim();
  const [silinecek, silinecekYaz] = useState<Silinecek>(null);
  const [siliniyor, siliniyorYaz] = useState(false);
  const yaz = m.yetki.yaz;
  const notif = m.tercihler.notif;
  const kanalAdi = (id: string) => m.veri.kanallar.find((c) => c.id === id)?.name;

  const tercih = (yama: Partial<typeof notif>) => {
    m.tercihleriGuncelle({ notif: { ...notif, ...yama } });
    bildir('tamam', 'Ayar kaydedildi.');
  };

  const takvimeAktar = () => {
    const metin = takvimimMetni({ toplantilar: m.veri.toplantilar, gorevler: m.veri.gorevler, ben: m.ben.id, ad: m.ad, simdi: Date.now() });
    if (metin === null) { bildir('bilgi', 'Takvime aktarılacak yaklaşan toplantı ya da görev yok.'); return; }
    dosyaIndir('mesai-takvimim.ics', metin, 'text/calendar;charset=utf-8');
  };

  const siparisleriAktar = () => {
    dosyaIndir(`siparisler-${isoGun(Date.now())}.csv`, eskiCsv(['Sipariş no', 'Müşteri', 'Ürün', 'Miktar', 'Üretilen', 'Birim', 'Teslim', 'Durum'], (m.siparisler ?? []).map((o) => [
      o.no, o.musteri, o.urun, o.hedef, o.uretilen, o.birim, o.teslim ? isoGun(o.teslim) : '', o.durum ? SIPARIS_DURUMU[o.durum] : '',
    ])), 'text/csv;charset=utf-8');
  };

  const gorevleriAktar = () => {
    dosyaIndir(`gorevler-${isoGun(Date.now())}.csv`, eskiCsv(['Görev', 'Kime', 'Veren', 'Durum', 'Ne zamana', 'Sipariş', 'Açıldı'], m.veri.gorevler.map((t) => [
      t.title, t.to ? m.ad(t.to) : KISISIZ, t.by ? m.ad(t.by) : KISISIZ, GOREV_DURUMU[t.status], t.due ? isoGun(t.due) : '',
      (m.siparisler ?? []).find((o) => o.id === t.orderId)?.no ?? '', isoGun(t.createdAt || Date.now()),
    ])), 'text/csv;charset=utf-8');
  };

  const sil = async () => {
    if (!silinecek) return;
    siliniyorYaz(true);
    try {
      await m.yaz.sil(`${silinecek.tur === 'zamanli' ? 'zamanli' : 'kurallar'}/${silinecek.id}`);
      if (silinecek.tur === 'zamanli') bildir('tamam', 'İptal edildi.');
      silinecekYaz(null);
    } catch {
      // Hata yazıcının ortak iletisiyle gösterildi; pencere açık kalır.
    } finally {
      siliniyorYaz(false);
    }
  };

  const bekleyen = m.veri.zamanli.filter((z) => z.status === 'bekliyor').sort((a, b) => a.sendAt - b.sendAt);
  const kurallar = m.veri.kurallar.slice().sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="tc-mb-ayarlar">
      <SayfaBasligi baslik="Ayarlar ve otomasyon" simge="gear" alt="Bildirimler, takvim, otomatik uyarılar, ERP" />

      <Kart baslik="Bildirim ve hatırlatmalar">
        <div className="tc-mb-satirlar">
          <div className="tc-mb-ayar">
            <IsaretKutusu etiket="Sesli hatırlatma" checked={notif.sound !== false} onChange={(o) => tercih({ sound: o.target.checked })} />
            <p className="tc-mb-ipucu">Toplantı ve görev hatırlatmalarında kısa bir ses çalar.</p>
          </div>
          <Secim
            etiket="Varsayılan toplantı hatırlatması"
            value={String(notif.remind ?? 10)}
            onChange={(o) => tercih({ remind: Number(o.target.value) })}
            secenekler={HATIRLATMA_SECENEKLERI.map(([d, b]) => ({ deger: String(d), baslik: b }))}
          />
        </div>
      </Kart>

      <Kart baslik="Telefon ve takvim senkronu">
        <div className="tc-mb-satirlar">
          <div className="tc-mb-ayar tc-mb-ayar-yan">
            <div>
              <p className="tc-mb-ad">Toplantılarımı ve görevlerimi takvime aktar</p>
              <p className="tc-mb-ipucu">.ics dosyası iPhone, Android, Google ve Outlook takvimine hatırlatmalarıyla eklenir.</p>
            </div>
            <Dugme tur="birincil" simge="download" onClick={takvimeAktar}>İndir</Dugme>
          </div>
          <div className="tc-mb-ayar">
            <p className="tc-mb-ad">Tek tek ekleme</p>
            <p className="tc-mb-ipucu">Her toplantı ve görevin sayfasında “Takvime ekle” düğmesi var.</p>
          </div>
        </div>
      </Kart>

      <Kart baslik="Zamanlanmış mesajlar">
        {bekleyen.length
          ? <ul className="tc-mb-liste">{bekleyen.map((z) => (
            <ZamanliSatiri key={z.id} z={z} kanal={kanalAdi(z.cid)} iptal={() => silinecekYaz({ tur: 'zamanli', id: z.id })} />
          ))}</ul>
          : <p className="tc-mb-bos">Bekleyen zamanlanmış mesaj yok. Vardiya hatırlatması, haftalık toplantı notu gibi tekrarlayan mesajları buradan kur.</p>}
        {yaz && <div className="tc-mb-alt"><Dugme simge="plus" onClick={() => m.formAc({ tur: 'zamanla' })}>Mesaj zamanla</Dugme></div>}
      </Kart>

      <Kart baslik="Otomatik uyarılar">
        <p className="tc-mb-bos">Bir olay gerçekleşince Mesai kanala kendiliğinden yazar. Kontroller, Mesai’yi açık tutan herhangi bir cihazda dakikada bir yapılır.</p>
        {kurallar.length > 0 && (
          <ul className="tc-mb-liste">{kurallar.map((r) => (
            <KuralSatiri key={r.id} r={r} kanal={kanalAdi(r.cid)} sil={() => silinecekYaz({ tur: 'kural', id: r.id })} />
          ))}</ul>
        )}
        {yaz && <div className="tc-mb-alt"><Dugme simge="plus" onClick={() => m.formAc({ tur: 'kural' })}>Uyarı ekle</Dugme></div>}
      </Kart>

      <Kart baslik="ERP ve MES bağlantısı">
        <div className="tc-mb-aktar">
          <button type="button" className="tc-mb-aktar-dugme" onClick={siparisleriAktar}>
            <Simge ad="download" />
            <span className="tc-mb-ad">Siparişleri dışa aktar</span>
            <span className="tc-mb-ipucu">ERP’ye geri yüklemek için CSV</span>
          </button>
          <button type="button" className="tc-mb-aktar-dugme" onClick={gorevleriAktar}>
            <Simge ad="download" />
            <span className="tc-mb-ad">Görevleri dışa aktar</span>
            <span className="tc-mb-ipucu">Raporlama için CSV</span>
          </button>
        </div>
      </Kart>

      <OnayPenceresi
        acik={silinecek !== null}
        baslik={silinecek?.tur === 'kural' ? 'Uyarı silinsin mi?' : 'Zamanlanmış mesaj iptal edilsin mi?'}
        onayMetni={silinecek?.tur === 'kural' ? 'Sil' : 'İptal et'}
        tehlikeli
        yukleniyor={siliniyor}
        onayla={() => { void sil(); }}
        vazgec={() => silinecekYaz(null)}
      >
        <p>{silinecek?.tur === 'kural' ? 'Bu otomatik uyarı artık çalışmaz.' : 'Mesaj gönderilmeyecek.'}</p>
      </OnayPenceresi>
    </div>
  );
}

function ZamanliSatiri({ z, kanal, iptal }: { z: Kayit<Zamanli>; kanal: string | undefined; iptal: () => void }) {
  const m = useMesaj();
  const simdi = Date.now();
  const degisir = duzenleyebilir(z, m.yetki, m.ben.id);
  return (
    <li className="tc-mb-oge">
      <span className="tc-mb-oge-simge"><Simge ad="clock" /></span>
      <div className="tc-mb-oge-govde">
        <div className="tc-mb-metin">
          {z.ann && <Rozet ton="uyari">Duyuru</Rozet>}
          <IletiMetni metin={z.text} />
        </div>
        <p className="tc-mb-bilgi">
          <b>{gunEtiketi(z.sendAt, simdi)} {saatDakika(z.sendAt)}</b>
          {kanal !== undefined && <span>#{kanal}</span>}
          {z.repeat && z.repeat !== 'none' && <Rozet ton="bilgi">{TEKRARLAR[z.repeat]}</Rozet>}
          <span>{m.ilkAd(z.by)}</span>
          {z.sendAt < simdi - 2 * M && <span className="tc-mb-gec">Gecikti, ilk açılışta gidecek</span>}
        </p>
        {degisir && (
          <div className="tc-mb-eylemler">
            <Dugme simge="edit" onClick={() => m.formAc({ tur: 'zamanla', duzenle: z.id })}>Düzenle</Dugme>
            <Dugme tur="tehlike" onClick={iptal}>İptal et</Dugme>
          </div>
        )}
      </div>
    </li>
  );
}

function KuralSatiri({ r, kanal, sil }: { r: Kayit<Kural>; kanal: string | undefined; sil: () => void }) {
  const m = useMesaj();
  if (!kuralTuruMu(r.type)) return null;
  const tanim = KURAL_TURLERI[r.type];
  const degisir = duzenleyebilir(r, m.yetki, m.ben.id);
  const parametreler = Object.entries(tanim.parametreler);
  return (
    <li className={`tc-mb-oge${r.on ? '' : ' tc-mb-oge-kapali'}`}>
      <span className="tc-mb-oge-simge"><Simge ad={tanim.simge} /></span>
      <div className="tc-mb-oge-govde">
        <p className="tc-mb-ad">{tanim.baslik}</p>
        <p className="tc-mb-bilgi">
          <span>{kanal !== undefined ? `#${kanal} kanalına` : 'Kanal silinmiş'}</span>
          {parametreler.map(([ad, p]) => <span key={ad}>{p.etiket}: <b>{String(kuralParametresi(r, ad))}</b></span>)}
          {!tanim.calisir && <span className="tc-mb-gec">{BEKLEYEN_TUR}</span>}
        </p>
        {degisir && (
          <div className="tc-mb-eylemler">
            <IsaretKutusu
              etiket={r.on ? 'Açık' : 'Kapalı'}
              checked={r.on}
              onChange={(o) => { void m.yaz.guncelle(`kurallar/${r.id}`, { on: o.target.checked }).catch(() => undefined); }}
            />
            <Dugme simge="edit" onClick={() => m.formAc({ tur: 'kural', duzenle: r.id })}>Düzenle</Dugme>
            <Dugme tur="tehlike" onClick={sil}>Sil</Dugme>
          </div>
        )}
      </div>
    </li>
  );
}
