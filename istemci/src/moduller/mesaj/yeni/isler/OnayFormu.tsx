import { CokSatir, FormPenceresi, Girdi, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { useMesaj, type FormIstegi } from '../durum.tsx';
import { iz } from '../kartlar/eylemler.ts';
import { CokluKisiSecici } from '../ortak/index.ts';
import type { Onay } from '../tipler.ts';
import { AlanGrubu, KanaldaPaylas, SiparisSecimi } from './form-parcalari.tsx';
import './isler.css';

interface Degerler {
  baslik: string;
  aciklama: string;
  onaylayanlar: string[];
  siparis: string;
  paylas: boolean;
  kanal: string;
}

// Prototipin openApprovalForm'u: "Onay iste", "Mesajı onaya sun" ya da reddedilen isteği düzenleyip yeniden gönderme
// (tur artar, eski oylar sayılmaz). E-posta bildirimi yok (208 a).
export function OnayFormu({ istek, kapat }: { istek: Extract<FormIstegi, { tur: 'onay' }>; kapat: () => void }) {
  const { ben, veri, yaz, gonder } = useMesaj();
  const { bildir } = useBildirim();
  const eski = istek.duzenle ? veri.onaylar.find((a) => a.id === istek.duzenle) : undefined;
  const ilk = istek.ilk ?? {};
  const form = useForm<Degerler, 'yeni' | 'yeniden'>({
    ilk: {
      baslik: eski?.title ?? ilk.title ?? '', aciklama: eski?.note ?? ilk.note ?? '', onaylayanlar: eski?.approvers ?? ilk.approvers ?? [],
      siparis: eski?.orderId ?? ilk.orderId ?? '', paylas: Boolean(ilk.cid), kanal: ilk.cid ?? veri.kanallar[0]?.id ?? '',
    },
    dogrula: (d) => ({
      ...(d.baslik.trim() ? {} : { baslik: 'Neyin onaylanacağını yaz.' }),
      ...(d.onaylayanlar.length ? {} : { onaylayanlar: 'En az bir kişi seç.' }),
    }),
    hataIletisi: 'Onaya gönderilemedi.',
    kaydet: async (d) => {
      const alanlar = { title: d.baslik.trim(), note: d.aciklama.trim(), approvers: d.onaylayanlar, orderId: d.siparis || null };
      if (eski) {
        await yaz.guncelle(`approvals/${eski.id}`, { ...alanlar, round: (eski.round || 1) + 1, last: iz(ben.id, 'yeniden onaya sundu') });
        return 'yeniden';
      }
      const kayit: Onay = {
        ...alanlar, by: ben.id, round: 1, votes: {}, createdAt: Date.now(), cid: null, mid: null, last: iz(ben.id, 'onay istedi'),
      };
      const id = await yaz.ekle('approvals', kayit);
      if (d.paylas && d.kanal) {
        const mid = await gonder({
          kanal: d.kanal, metin: '', bahisler: d.onaylayanlar,
          ek: { kind: 'approval', ref: id, ...(ilk.reply ? { replyTo: ilk.reply } : {}) },
        });
        await yaz.guncelle(`approvals/${id}`, { cid: d.kanal, mid });
      }
      return 'yeni';
    },
    basarili: (sonuc) => { bildir('tamam', sonuc === 'yeniden' ? 'Yeniden onaya gönderildi.' : 'Onaya gönderildi.'); kapat(); },
  });
  const d = form.degerler;
  const baslik = eski ? 'Düzenle ve yeniden gönder' : ilk.mid ? 'Mesajı onaya sun' : 'Onay iste';
  return (
    <FormPenceresi acik kapat={kapat} baslik={baslik} form={form} kaydetMetni={eski ? 'Yeniden gönder' : 'Onaya gönder'}>
      <Girdi etiket="Ne onaylansın?" required maxLength={140} placeholder="ör. 45.000 ₺ malzeme alımı" {...form.alan('baslik')} />
      <CokSatir etiket="Açıklama (isteğe bağlı)" maxLength={2000} rows={3} {...form.alan('aciklama')} />
      <AlanGrubu etiket="Kim onaylayacak?" hata={form.hata('onaylayanlar')}>
        <CokluKisiSecici etiket="Kim onaylayacak?" degerler={d.onaylayanlar} degisti={(onaylayanlar) => form.degistir({ onaylayanlar })} />
      </AlanGrubu>
      <SiparisSecimi deger={d.siparis} degisti={(siparis) => form.degistir({ siparis })} />
      {!eski && <KanaldaPaylas etiket="Kanalda da paylaş" paylas={d.paylas} kanal={d.kanal} degisti={(y) => form.degistir(y)} />}
    </FormPenceresi>
  );
}
