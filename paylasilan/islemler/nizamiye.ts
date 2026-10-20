// Ev sahibinin kendi ön kaydı ve kendi ziyaretçileri işlem istemez (karar 173 a): yalnız oturum, kişi sunucuda oturumdan alınır.
// nizamiye.oku: kapı listesi, kart rafı, geçmiş ve acil durum listesi. nizamiye.yaz: giriş, çıkış, habersiz ziyaretçi, iptal,
// geri alma ve kartın kayıp ya da hasarlı bildirimi. nizamiye.kart-yonet: kart ekleme ve kayıp/hasarlı kartı rafa geri alma.
// nizamiye.pdks-aktar: PDKS giriş-çıkış dosyasını aktarma; yalnız insan kaynakları (karar 259 a), kapı görevlisi listeyi yalnız görür.
export const NIZAMIYE_ISLEMLERI = ['nizamiye.oku', 'nizamiye.yaz', 'nizamiye.kart-yonet', 'nizamiye.pdks-aktar'] as const;
