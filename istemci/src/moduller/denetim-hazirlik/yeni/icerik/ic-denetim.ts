import type { IcSonucu } from '../tipler.ts';

// İç denetim ve saha kontrolü içeriği (ISO 9001 9.2; prototipten olduğu gibi).
export const ICR: Record<Exclude<IcSonucu, ''>, string> = { u: 'Uygun', g: 'Gözlem', m: 'Minör', M: 'Majör', na: 'N/A' };
// Her iç denetimde sorulan genel madde: [soru, madde, grup, bakılacak kanıt].
export type IcGenelMadde = [string, string, string, string];
// f: kontrol sıklığı (gün).
export interface SahaSablonu { id: string; n: string; c: string; f: number; items: string[] }
export const ICG: readonly IcGenelMadde[] = [
 ["Süreç kartı güncel mi? Sahibi, girdi ve çıktıları, göstergesi tanımlı mı?","4.4","4","Süreç kartı, süreç haritası"],
 ["Süreç göstergesi hedefi tutuyor mu? Sapmada aksiyon alınmış mı?","9.1","9","Son 6 ayın gösterge verisi, aksiyon kaydı"],
 ["Sürecin riskleri ve önlemleri güncel mi, önlemler uygulanmış mı?","6.1","6","Risk ve fırsat tablosu"],
 ["Kullanılan talimat ve dokümanlar güncel revizyon mu, sahada erişilebilir mi?","7.5","7","Doküman ana listesi ile sahadaki kopyaların karşılaştırması"],
 ["Süreçte çalışanlar yetkin mi, yetkinlik kaydı var mı?","7.2","7","Yetkinlik matrisi, eğitim kayıtları"],
 ["Süreç kayıtları eksiksiz, okunaklı ve izlenebilir mi?","7.5","7","Son işlerden örneklenen kayıtlar"],
 ["Süreçte kullanılan ölçüm cihazları kalibreli ve etiketli mi?","7.1.5","7","Kalibrasyon listesi, cihaz etiketleri"],
 ["Önceki denetim bulguları kapatılmış ve etkinliği doğrulanmış mı?","10.2","10","DÖF kayıtları, etkinlik doğrulaması"],
 ["Uygunsuz çıktı tanımlanıp ayrılıyor ve kararı kayıt altına alınıyor mu?","8.7","8","Uygunsuzluk kayıtları, karantina alanı"],
 ["Süreçte son dönemde veriyle gösterilebilen bir iyileştirme var mı?","10.3","10","İyileştirme kaydı, önce/sonra verisi"]];
export const SAHA: readonly SahaSablonu[] = [
 {id:"dok",n:"Doküman revizyon turu",c:"7.5",f:7,items:["Tezgâhlardaki resim ve talimatlar ana listedeki son revizyonla aynı","Sahada kontrolsüz kopya yok","Talimatlar okunaklı ve kullanıldığı yerde erişilebilir","Eski revizyonlar toplanmış veya “GEÇERSİZ” işaretli"]},
 {id:"krn",n:"Uygunsuz ürün ve karantina alanı",c:"8.7",f:7,items:["Karantinadaki her ürün etiketli","Etikette uygunsuzluk veya DÖF numarası var","Alan ayrılmış ve işaretli; karışma riski yok","Karar bekleyen ürün 7 günden eski değil"]},
 {id:"kal",n:"Kalibrasyon etiketleri",c:"7.1.5",f:14,items:["Kullanımdaki her cihazda geçerli kalibrasyon etiketi var","Süresi geçmiş cihaz sahada kullanılmıyor","Kişisel ölçü aletleri de listede","Hasarlı veya ayarı bozulmuş cihaz yok"]},
 {id:"ss",n:"5S ve düzen",c:"7.1.4",f:7,items:["Çalışma alanında gereksiz malzeme yok","Malzeme ve takımların yeri belli ve etiketli","Temizlik planına uyuluyor","Yangın dolabı ve acil çıkışlar açık"]},
 {id:"dep",n:"Depo ve izlenebilirlik",c:"8.5.2",f:30,items:["Malzemeler lot ve sertifika ile eşleşiyor","İlk giren ilk çıkar uygulanıyor","Müşteri mülkü ayrı ve tanımlı","Raf ömürlü malzemelerin son kullanma takibi var"]},
 {id:"fod",n:"FOD kontrolü (AS9100)",c:"8.5.1",f:7,items:["Takım panosu tam, eksik takım yok","Çalışma ve montaj alanında yabancı madde yok","Vardiya sonu FOD kontrol kaydı tutulmuş","Çalışanların FOD eğitimi güncel"]}];
export const MONS: readonly string[] = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
