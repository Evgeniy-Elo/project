#include <ESP8266WiFi.h>
#include <WiFiClient.h>
#include <ESP8266HTTPClient.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <TimeLib.h>
#include <ArduinoJson.h>
#include <EEPROM.h>

// ============= НАСТРОЙКИ =============
// WiFi
const char* ssid = "Mikola.Local";
const char* password = "Mikola.Local";

// Сервер (измените на IP вашего сервера)
const char* serverHost = "192.168.5.95"; // IP адрес сервера
const int serverPort = 8000;               // Порт сервера

// Устройство
const char* deviceId = "esp8266_001";       // Уникальный ID устройства
const char* deviceName = "Островского 71";   // Название устройства
const char* deviceLocation = "Дзержинск";       // Расположение

// Пины реле (4 канала - для NodeMCU/ESP8266)
// D1 = GPIO5, D2 = GPIO4, D3 = GPIO0, D4 = GPIO2
const int relayPins[] = {D1, D2, D3, D4};
const int relayCount = 4;

// Настройки времени
const long utcOffset = 10800; // UTC+3 (Москва)
const unsigned long syncInterval = 300000; // 5 минут

// ============= НОВЫЕ ПЕРЕМЕННЫЕ ДЛЯ РУЧНОГО УПРАВЛЕНИЯ =============
bool manualMode = false;
bool manualOverride[4] = {false, false, false, false};
unsigned long manualModeTimeout = 0;
const unsigned long manualModeDuration = 3600000; // 1 час (можно изменить)
bool forceSync = false; // Флаг принудительной синхронизации (НОВЫЙ)

// ============= НОВЫЙ ЭНДПОЙНТ ДЛЯ РУЧНОГО УПРАВЛЕНИЯ =============
#include <ESP8266WebServer.h>
ESP8266WebServer server(80);

// ============= СТРУКТУРЫ =============
struct Schedule {
  bool enabled;
  int channel;
  int startHour;
  int startMinute;
  int endHour;
  int endMinute;
  bool monday;
  bool tuesday;
  bool wednesday;
  bool thursday;
  bool friday;
  bool saturday;
  bool sunday;
};

// ============= ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =============
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", utcOffset, 60000);
WiFiClient wifiClient;
HTTPClient http;

Schedule schedules[20]; // Максимум 20 расписаний
int scheduleCount = 0;
bool relayStates[4] = {false, false, false, false};
unsigned long lastSyncTime = 0;
unsigned long lastRegisterTime = 0;
bool deviceRegistered = false;

// ============= ФУНКЦИИ =============
void setup() {
  Serial.begin(115200);
  Serial.println("\n\n=== Запуск устройства ===");
  Serial.print("Device ID: ");
  Serial.println(deviceId);
  
  // Инициализация пинов реле
  for (int i = 0; i < relayCount; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], HIGH); // Реле выключено (активный LOW)
    Serial.printf("Пин %d инициализирован\n", relayPins[i]);
  }
  
  // Инициализация EEPROM
  EEPROM.begin(512);
  loadSchedules();
  Serial.printf("Загружено %d расписаний из EEPROM\n", scheduleCount);
  
  // Подключение к WiFi
  connectToWiFi();
  
  // Инициализация NTP
  timeClient.begin();
  
  // Настройка HTTP сервера для ручного управления
  server.on("/manual", HTTP_POST, handleManualControl);
  server.on("/manual/reset", HTTP_POST, handleManualReset);
  server.on("/sync", HTTP_POST, handleSync); // НОВЫЙ ОБРАБОТЧИК
  server.begin();
  Serial.println("HTTP сервер для ручного управления запущен");
  
  // Регистрация на сервере
  registerDevice();
}

void loop() {
  // Обновление времени
  timeClient.update();

  // Обработка HTTP запросов
  server.handleClient();
  
  // Проверка таймаута ручного режима
  if (manualMode && millis() > manualModeTimeout) {
    manualMode = false;
    Serial.println("Ручной режим отключен по таймауту");
    
    // Сбрасываем ручные переопределения
    for (int i = 0; i < relayCount; i++) {
      manualOverride[i] = false;
    }
  }
  
  // Проверка и выполнение расписаний (ТОЛЬКО если не ручной режим)
  if (!manualMode) {
    checkSchedules();
  }
  
  // Регистрация на сервере (если ещё не зарегистрировались)
  if (!deviceRegistered && (millis() - lastRegisterTime > 10000)) {
    registerDevice();
    lastRegisterTime = millis();
  }
  
  // Синхронизация с сервером (ИСПРАВЛЕНО - добавлен forceSync)
  if (deviceRegistered) {
    // По расписанию или по принудительному сигналу
    if ((millis() - lastSyncTime > syncInterval) || forceSync) {
      if (forceSync) {
        Serial.println("⏰ Принудительная синхронизация по сигналу сервера");
        forceSync = false;
      }
      syncWithServer();
      lastSyncTime = millis();
    }
  }
  
  // Управление реле (всегда обновляем, функция сама выберет режим)
  updateRelays();
  
  // Диагностика (раз в 30 секунд)
  static unsigned long lastDiag = 0;
  if (millis() - lastDiag > 30000) {
    if (manualMode) {
      // В ручном режиме показываем состояния из manualOverride
      Serial.printf("Режим: %s, Состояния: %d %d %d %d\n", 
                    "РУЧНОЙ",
                    manualOverride[0], manualOverride[1], manualOverride[2], manualOverride[3]);
    } else {
      // В автоматическом режиме показываем relayStates
      Serial.printf("Режим: %s, Состояния: %d %d %d %d\n", 
                    "АВТО",
                    relayStates[0], relayStates[1], relayStates[2], relayStates[3]);
    }
    lastDiag = millis();
  }
  
  delay(1000);
}

// ============= WiFi =============
void connectToWiFi() {
  Serial.print("Подключение к WiFi");
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 60) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi подключен");
    Serial.print("IP адрес: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ Ошибка подключения к WiFi");
  }
}

// ============= РЕГИСТРАЦИЯ НА СЕРВЕРЕ =============
void registerDevice() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ Нет WiFi, регистрация отложена");
    return;
  }
  
  Serial.println("Регистрация устройства на сервере...");
  
  String url = "http://" + String(serverHost) + ":" + String(serverPort) + "/relay/api/device/register";
  
  http.begin(wifiClient, url);
  http.addHeader("Content-Type", "application/json");
  
  // Создаем JSON для регистрации
  StaticJsonDocument<256> doc;
  doc["id"] = deviceId;
  doc["name"] = deviceName;
  doc["location"] = deviceLocation;
  doc["firmware"] = "1.0.0";
  doc["ip"] = WiFi.localIP().toString();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.print("Отправка: ");
  Serial.println(jsonString);
  
  int httpCode = http.POST(jsonString);
  
  if (httpCode > 0) {
    Serial.printf("HTTP код ответа: %d\n", httpCode);
    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
      String response = http.getString();
      Serial.println("✅ Устройство зарегистрировано");
      Serial.println("Ответ: " + response);
      deviceRegistered = true;
    } else {
      Serial.println("❌ Ошибка регистрации");
      Serial.println("Ответ: " + http.getString());
    }
  } else {
    Serial.printf("❌ Ошибка HTTP запроса: %s\n", http.errorToString(httpCode).c_str());
  }
  
  http.end();
}

// ============= СИНХРОНИЗАЦИЯ =============
void syncWithServer() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ Нет WiFi, синхронизация отложена");
    connectToWiFi();
    return;
  }
  
  Serial.println("Синхронизация с сервером...");
  
  String url = "http://" + String(serverHost) + ":" + String(serverPort) + "/relay/api/schedules/" + String(deviceId);
  
  http.begin(wifiClient, url);
  http.addHeader("Content-Type", "application/json");
  
  int httpCode = http.GET();
  
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    Serial.println("✅ Получены расписания");
    Serial.println("Данные: " + payload);
    
    parseSchedulesFromJson(payload);
    saveSchedules();
    Serial.printf("Сохранено %d расписаний\n", scheduleCount);
  } else {
    Serial.printf("❌ Ошибка синхронизации, код: %d\n", httpCode);
    Serial.println("Ответ: " + http.getString());
  }
  
  http.end();
}

// ============= ПАРСИНГ JSON =============
void parseSchedulesFromJson(String json) {
  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, json);
  
  if (error) {
    Serial.print("❌ Ошибка парсинга JSON: ");
    Serial.println(error.c_str());
    return;
  }
  
  JsonArray schedulesArray = doc.as<JsonArray>();
  scheduleCount = 0;
  
  for (JsonObject s : schedulesArray) {
    if (scheduleCount >= 20) break;
    
    Schedule &schedule = schedules[scheduleCount];
    schedule.enabled = s["enabled"] | true;
    schedule.channel = s["channel"] | 0;
    schedule.startHour = s["startHour"] | 0;
    schedule.startMinute = s["startMinute"] | 0;
    schedule.endHour = s["endHour"] | 23;
    schedule.endMinute = s["endMinute"] | 59;
    schedule.monday = s["monday"] | false;
    schedule.tuesday = s["tuesday"] | false;
    schedule.wednesday = s["wednesday"] | false;
    schedule.thursday = s["thursday"] | false;
    schedule.friday = s["friday"] | false;
    schedule.saturday = s["saturday"] | false;
    schedule.sunday = s["sunday"] | false;
    
    scheduleCount++;
  }
  
  Serial.printf("Распарсено %d расписаний\n", scheduleCount);
}

// ============= ПРОВЕРКА РАСПИСАНИЙ =============
void checkSchedules() {
  // В ручном режиме полностью пропускаем проверку расписаний
  if (manualMode) {
    return;
  }
  
  time_t now = timeClient.getEpochTime();
  struct tm *timeinfo = localtime(&now);
  
  int currentHour = timeinfo->tm_hour;
  int currentMinute = timeinfo->tm_min;
  int currentWeekday = timeinfo->tm_wday; // 0 = воскресенье
  
  // Преобразование в формат (0 = понедельник)
  currentWeekday = (currentWeekday == 0) ? 6 : currentWeekday - 1;
  
  // Сбрасываем все состояния перед проверкой
  bool newRelayStates[4] = {false, false, false, false};
  
  for (int i = 0; i < scheduleCount; i++) {
    Schedule &s = schedules[i];
    
    if (!s.enabled) continue;
    if (s.channel < 0 || s.channel >= relayCount) continue;
    
    // Проверка дня недели
    bool dayMatch = false;
    switch(currentWeekday) {
      case 0: dayMatch = s.monday; break;
      case 1: dayMatch = s.tuesday; break;
      case 2: dayMatch = s.wednesday; break;
      case 3: dayMatch = s.thursday; break;
      case 4: dayMatch = s.friday; break;
      case 5: dayMatch = s.saturday; break;
      case 6: dayMatch = s.sunday; break;
    }
    
    if (!dayMatch) continue;
    
    // Проверка времени
    int currentTime = currentHour * 60 + currentMinute;
    int startTime = s.startHour * 60 + s.startMinute;
    int endTime = s.endHour * 60 + s.endMinute;
    
    if (startTime <= endTime) {
      // Обычный интервал
      if (currentTime >= startTime && currentTime < endTime) {
        newRelayStates[s.channel] = true;
      }
    } else {
      // Интервал через полночь
      if (currentTime >= startTime || currentTime < endTime) {
        newRelayStates[s.channel] = true;
      }
    }
  }
  
  // Обновляем relayStates ТОЛЬКО если не в ручном режиме
  for (int i = 0; i < relayCount; i++) {
    if (relayStates[i] != newRelayStates[i]) {
      relayStates[i] = newRelayStates[i];
      Serial.printf("Канал %d изменен на %s\n", i+1, relayStates[i] ? "ВКЛ" : "ВЫКЛ");
    }
  }
}

// Обработчик ручного управления
void handleManualControl() {
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"No data\"}");
    return;
  }
  
  String json = server.arg("plain");
  Serial.print("Получена команда ручного управления: ");
  Serial.println(json);
  
  StaticJsonDocument<128> doc;
  DeserializationError error = deserializeJson(doc, json);
  
  if (error) {
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }
  
  int channel = doc["channel"] | -1;
  bool state = doc["state"] | false;
  
  if (channel < 0 || channel >= relayCount) {
    server.send(400, "application/json", "{\"error\":\"Invalid channel\"}");
    return;
  }
  
  // Включаем ручной режим
  manualMode = true;
  manualOverride[channel] = state;
  manualModeTimeout = millis() + manualModeDuration;
  
  Serial.printf("Ручное управление: канал %d %s\n", channel + 1, state ? "ВКЛ" : "ВЫКЛ");
  
  // Немедленно обновляем состояние
  digitalWrite(relayPins[channel], state ? HIGH : LOW);
  
  // Отправляем подтверждение
  StaticJsonDocument<64> response;
  response["success"] = true;
  response["manualMode"] = true;
  response["channel"] = channel;
  response["state"] = state;
  
  String responseStr;
  serializeJson(response, responseStr);
  server.send(200, "application/json", responseStr);
}

// Обработчик сброса ручного режима
void handleManualReset() {
  manualMode = false;
  
  // Сбрасываем все ручные переопределения
  for (int i = 0; i < relayCount; i++) {
    manualOverride[i] = false;
  }
  
  Serial.println("Ручной режим отключен, возврат к автоматическому");
  
  // Немедленно применяем автоматические расписания
  timeClient.update();
  checkSchedules();
  updateRelays();
  
  server.send(200, "application/json", "{\"success\":true}");
}

// НОВЫЙ ОБРАБОТЧИК для принудительной синхронизации
void handleSync() {
  Serial.println("📡 Получен сигнал синхронизации с сервером");
  forceSync = true;
  server.send(200, "application/json", "{\"success\":true,\"message\":\"Sync triggered\"}");
}

// ============= УПРАВЛЕНИЕ РЕЛЕ =============
void updateRelays() {
  for (int i = 0; i < relayCount; i++) {
    if (manualMode) {
      // В ручном режиме используем manualOverride
      digitalWrite(relayPins[i], manualOverride[i] ? HIGH : LOW);
    } else {
      // В автоматическом режиме используем relayStates
      digitalWrite(relayPins[i], relayStates[i] ? HIGH : LOW);
    }
  }
}

// ============= РАБОТА С EEPROM =============
void saveSchedules() {
  EEPROM.write(0, scheduleCount);
  int addr = 1;
  
  for (int i = 0; i < scheduleCount; i++) {
    Schedule &s = schedules[i];
    EEPROM.write(addr++, s.enabled ? 1 : 0);
    EEPROM.write(addr++, s.channel);
    EEPROM.write(addr++, s.startHour);
    EEPROM.write(addr++, s.startMinute);
    EEPROM.write(addr++, s.endHour);
    EEPROM.write(addr++, s.endMinute);
    EEPROM.write(addr++, s.monday ? 1 : 0);
    EEPROM.write(addr++, s.tuesday ? 1 : 0);
    EEPROM.write(addr++, s.wednesday ? 1 : 0);
    EEPROM.write(addr++, s.thursday ? 1 : 0);
    EEPROM.write(addr++, s.friday ? 1 : 0);
    EEPROM.write(addr++, s.saturday ? 1 : 0);
    EEPROM.write(addr++, s.sunday ? 1 : 0);
  }
  
  EEPROM.commit();
  Serial.println("✅ Расписания сохранены в EEPROM");
}

void loadSchedules() {
  scheduleCount = EEPROM.read(0);
  if (scheduleCount > 20 || scheduleCount < 0) {
    scheduleCount = 0;
    return;
  }
  
  int addr = 1;
  
  for (int i = 0; i < scheduleCount; i++) {
    Schedule &s = schedules[i];
    s.enabled = EEPROM.read(addr++) == 1;
    s.channel = EEPROM.read(addr++);
    s.startHour = EEPROM.read(addr++);
    s.startMinute = EEPROM.read(addr++);
    s.endHour = EEPROM.read(addr++);
    s.endMinute = EEPROM.read(addr++);
    s.monday = EEPROM.read(addr++) == 1;
    s.tuesday = EEPROM.read(addr++) == 1;
    s.wednesday = EEPROM.read(addr++) == 1;
    s.thursday = EEPROM.read(addr++) == 1;
    s.friday = EEPROM.read(addr++) == 1;
    s.saturday = EEPROM.read(addr++) == 1;
    s.sunday = EEPROM.read(addr++) == 1;
  }
  
  Serial.printf("✅ Загружено %d расписаний из EEPROM\n", scheduleCount);
}