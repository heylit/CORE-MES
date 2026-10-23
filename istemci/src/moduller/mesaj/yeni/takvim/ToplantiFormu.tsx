import { CokSatir, FormPenceresi, Girdi, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { H, isoGun } from '../bicim.ts';
import { useMesaj, type FormIstegi } from '../durum.tsx';
import { iz, useIsEylemleri } from '../kartlar/eylemler.ts';
import { SecimGrubu } from '../kartlar/parcalar.tsx';
import { AlanGrubu, KanaldaPaylas } from '../isler/form-parcalari.tsx';
import { CokluKisiSecici } from '../ortak/index.ts';
import type { Toplanti } from '../tipler.ts';
import './takvim.css';

export const HATIRLATMALAR: readonly [number, string][] = [
  [0, 'Hatırlatma yok'], [5, '5 dakika önce'], [10, '10 dakika önce'], [15, '15 dakika önce'], [30, '30 dakika önce'],
  [60, '1 saat önce'], [1440, '1 gün önce'],
];
type Sure = '15' | '30' | '45' | '60' | '90' | '120';
const SURELER: { anahtar: Sure; baslik: string }[] = (['15', '30', '45', '60', '90', '120'] as const)
  .map((m) => ({ anahtar: m, baslik: Number(m) < 60 ? `${m} dk` : `${Number(m) / 60} sa` }));

interface Degerler {
  konu: string;
  tarih: string;
  saat: string;
  sure: Sure;
  katilimcilar: string[];
  yer: string;
  baglanti: string;
  gundem: string;
  hatirlat: string;
  paylas: boolean;
  kanal: string;
}

const saatMetni = (ts: number) => `${String(new Date(ts).getHours()).padStart(2, '0')}:${String(new Date(ts).getMinutes()).padStart(2, '0')}`;
// Varsayılan başlangıç bir saat sonrasının ilk yarım ya da tam saati.
const varsayilanBaslangic = (simdi: number) => {
  const x = new Date(simdi + H);
  x.setMinutes(x.getMinutes() < 30 ? 30 : 60, 0, 0);
  return x.getTime();
};

// Prototipin openMeetForm'u. E-posta daveti yok (208 a); davet kanalda kartla ve takvim dosyasıyla gider.
export function ToplantiFormu({ istek, kapat }: { istek: Extract<FormIstegi, { tur: 'toplanti' }>; kapat: () => void }) {
  const { ben, veri, yaz, gonder, tercihler } = useMesaj();
  const { bildir } = useBildirim();
  const { toplantiIcs } = useIsEylemleri();
  const eski = istek.duzenle ? veri.toplantilar.find((t) => t.id === istek.duzenle) : undefined;
  const ilk = istek.ilk ?? {};
  const baslangic = eski?.start ?? ilk.start ?? varsayilanBaslangic(Date.now());
  const sure = String(eski?.dur ?? 30) as Sure;
  const form = useForm<Degerler, string>({
    ilk: {
      konu: eski?.title ?? ilk.title ?? '', tarih: isoGun(baslangic), saat: saatMetni(baslangic),
      sure: SURELER.some((s) => s.anahtar === sure) ? sure : '30', katilimcilar: eski?.attendees ?? ilk.attendees ?? [],
      yer: eski?.loc ?? '', baglanti: eski?.link ?? '', gundem: eski?.agenda ?? ilk.agenda ?? '',
      hatirlat: String(eski ? eski.remind : tercihler.notif.remind ?? 10),
      paylas: Boolean(ilk.cid), kanal: ilk.cid ?? veri.kanallar[0]?.id ?? '',
    },
    dogrula: (d) => ({
      ...(d.konu.trim() ? {} : { konu: 'Konuyu yaz.' }),
      ...(Number.isNaN(new Date(`${d.tarih}T${d.saat}`).getTime()) ? { tarih: 'Tarih ve saat seç.' } : {}),
    }),
    hataIletisi: 'Toplantı kaydedilemedi.',
    kaydet: async (d) => {
      let baglanti = d.baglanti.trim();
      if (baglanti && !/^https?:\/\//.test(baglanti)) baglanti = `https://${baglanti}`;
      const alanlar = {
        title: d.konu.trim(), start: new Date(`${d.tarih}T${d.saat}`).getTime(), dur: Number(d.sure), attendees: d.katilimcilar,
        loc: d.yer.trim(), link: baglanti, agenda: d.gundem.trim(), remind: Number(d.hatirlat),
      };
      if (eski) {
        await yaz.guncelle(`toplantilar/${eski.id}`, { ...alanlar, last: iz(ben.id, 'toplantıyı güncelledi') });
        return eski.id;
      }
      const kayit: Toplanti = { ...alanlar, by: ben.id, rsvp: {}, createdAt: Date.now(), cid: null, mid: null, last: iz(ben.id, 'toplantı planladı') };
      const id = await yaz.ekle('toplantilar', kayit);
      if (d.paylas && d.kanal) {
        const mid = await gonder({ kanal: d.kanal, metin: '', bahisler: d.katilimcilar, ek: { kind: 'meeting', ref: id } });
        await yaz.guncelle(`toplantilar/${id}`, { cid: d.kanal, mid });
      }
      return id;
    },
    basarili: (id) => {
      bildir('tamam', eski ? 'Toplantı güncellendi.' : 'Toplantı oluşturuldu.', { eylem: { etiket: 'Takvimime ekle', yap: () => toplantiIcs(id) } });
      kapat();
    },
  });
  const d = form.degerler;
  return (
    <FormPenceresi acik kapat={kapat} baslik={eski ? 'Toplantıyı düzenle' : 'Toplantı planla'} form={form} kaydetMetni={eski ? 'Kaydet' : 'Toplantıyı oluştur'}>
      <Girdi etiket="Konu" required maxLength={120} placeholder="ör. Haftalık üretim toplantısı" {...form.alan('konu')} />
      <div className="tc-mi-iki">
        <Girdi etiket="Tarih" type="date" required {...form.alan('tarih')} />
        <Girdi etiket="Saat" type="time" required {...form.alan('saat')} />
      </div>
      <AlanGrubu etiket="Süre">
        <SecimGrubu<Sure> etiket="Süre" secenekler={SURELER} secili={d.sure} sec={(s) => form.degistir({ sure: s })} />
      </AlanGrubu>
      <AlanGrubu etiket="Katılımcılar">
        <CokluKisiSecici etiket="Katılımcılar" degerler={d.katilimcilar} degisti={(katilimcilar) => form.degistir({ katilimcilar })} />
      </AlanGrubu>
      <div className="tc-mi-iki">
        <Girdi etiket="Yer" maxLength={80} placeholder="ör. Toplantı odası 2" {...form.alan('yer')} />
        <Girdi etiket="Çevrim içi bağlantı" type="url" maxLength={300} placeholder="https://…" {...form.alan('baglanti')} />
      </div>
      <CokSatir etiket="Gündem" maxLength={3000} rows={3} placeholder={'- Madde 1\n- Madde 2'} {...form.alan('gundem')} />
      <Secim
        etiket="Hatırlatma" {...form.alan('hatirlat')}
        secenekler={HATIRLATMALAR.map(([v, b]) => ({ deger: String(v), baslik: b }))}
      />
      {!eski && <KanaldaPaylas etiket="Kanalda davet kartı paylaş" paylas={d.paylas} kanal={d.kanal} degisti={(y) => form.degistir(y)} />}
    </FormPenceresi>
  );
}
