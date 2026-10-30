# guvenlik: çekirdek istekleri

1. KAPANDI (1369): ana menü rozeti `IkinciMenuTanimi.anaMenuSayaci` ile.
2. KAPANDI (Aşama 1): HTTPS ve sertifika bitişi `#cekirdek/https-durumu.ts`; önde HTTPS'i bitiren ters vekil varsa onun sertifikası görünmez.
3. Ortak zaman biçimleyici (istemci): modüller `toLocaleString('tr-TR', ...)` ile kendi biçimini yazıyor (`guvenlik/gorunum.ts zamanMetni`).
4. Ortak durum bandı parçası (renkli genel durum şeridi): bugün modül CSS'inde (`tc-guvenlik-bant`), tasarım değişkenleriyle.
