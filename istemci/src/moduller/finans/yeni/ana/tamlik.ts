import { diffDays, real, type FinansMotoru } from '../motor.ts';

// "Sistemin size doğru öneri vermesi için" kartı (prototip completeness): yedi madde, eksik olanın yanında tek düğme.
// Düğme alanın girildiği yere gider: bakiye ve fatura kayıt formuna, düzenli ödeme ve CSV Ayarlar'a, bilanço Durum ve
// önerilere, bütçe Bütçe'ye.
export type TamlikHedefi = { olay: 'banka' | 'secici' } | { ayar: 'nakit' | 'veri' } | { sekme: 'butce' | 'durum' };
export interface TamlikMaddesi { ok: boolean; baslik: string; neden: string; dugme: string; hedef: TamlikHedefi }

export function veriTamligi(motor: FinansMotoru): TamlikMaddesi[] {
  const s = motor.durum, b = s.balance, bugun = motor.bugun;
  const aylar = new Set(s.tx.filter((t) => t.type === 'gelir' && real(t)).map((t) => t.date.slice(0, 7))).size;
  const sonKayit = s.tx.reduce((a, t) => (t.date > a ? t.date : a), '');
  return [
    { ok: !!(Number(s.company.openingCash) || s.cashChecks.length), baslik: 'Bugünkü kasa ve banka bakiyesi', neden: 'Nakit tahmini doğru noktadan başlar', dugme: 'Bakiyeyi gir', hedef: { olay: 'banka' } },
    { ok: s.recurring.length > 0, baslik: 'Düzenli aylık ödemeler (maaş, SGK, kira, kredi)', neden: 'Nakit tahmininde sabit çıkışlar görünür', dugme: 'Tanımla', hedef: { ayar: 'nakit' } },
    { ok: motor.openItems('gelir').length + motor.openItems('gider').length > 0 || s.tx.length > 20, baslik: 'Tahsil edilmemiş ve ödenmemiş faturalar', neden: 'Alacak/borç takibi ve tahsilat takvimi çalışır', dugme: 'Ekle', hedef: { olay: 'secici' } },
    { ok: !!sonKayit && diffDays(bugun, sonKayit) <= 14, baslik: 'Son iki haftanın kayıtları', neden: 'Analizler güncel kalır', dugme: 'Kayıt gir', hedef: { olay: 'secici' } },
    { ok: aylar >= 3, baslik: 'En az 3 aylık satış geçmişi', neden: 'Satış tahmini, müşteri risk notları ve simülasyon güvenilir olur', dugme: 'CSV aktar', hedef: { ayar: 'veri' } },
    { ok: !!(Number(b.donen) && Number(b.kvb) && Number(b.ozkaynak)), baslik: 'Bilanço özeti (mali müşavirden)', neden: 'Finansal sağlık oranları ve Altman skoru hesaplanır', dugme: 'Gir', hedef: { sekme: 'durum' } },
    { ok: Object.values(s.budget).some((v) => v > 0), baslik: 'Aylık gider bütçesi', neden: 'Bütçe aşımı uyarıları çalışır', dugme: 'Bütçe', hedef: { sekme: 'butce' } },
  ];
}
