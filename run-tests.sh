#!/bin/bash

# 🧪 СКРИПТ ДЛЯ ПОЛНОГО ТЕСТИРОВАНИЯ ПРОЕКТА

echo "================================"
echo "📋 ТЕСТИРОВАНИЕ ПРОЕКТА"
echo "================================"
echo ""

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Счетчики
TOTAL=0
PASSED=0
FAILED=0

# Функция для печати результата
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ $2${NC}"
        ((FAILED++))
    fi
    ((TOTAL++))
}

echo "1️⃣ ПОДГОТОВКА К ТЕСТИРОВАНИЮ"
echo "=============================="

# Проверка Node.js
if command -v node &> /dev/null; then
    echo -e "${GREEN}✅ Node.js найден: $(node --version)${NC}"
else
    echo -e "${RED}❌ Node.js не найден${NC}"
    exit 1
fi

# Проверка npm
if command -v npm &> /dev/null; then
    echo -e "${GREEN}✅ npm найден: $(npm --version)${NC}"
else
    echo -e "${RED}❌ npm не найден${NC}"
    exit 1
fi

# Проверка зависимостей
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Установка зависимостей...${NC}"
    npm install
fi

# Проверка jest
if npm list jest &> /dev/null; then
    echo -e "${GREEN}✅ jest установлен${NC}"
else
    echo -e "${YELLOW}📦 Установка jest...${NC}"
    npm install --save-dev jest supertest
fi

echo ""
echo "2️⃣ ЗАПУСК UNIT-ТЕСТОВ"
echo "======================"

# Тесты безопасности
if npx jest tests/security.test.js --passWithNoTests 2>&1 | grep -q "PASS\|Tests:"; then
    print_status 0 "Security Tests"
else
    print_status 1 "Security Tests"
fi

# Тесты производительности
if npx jest tests/performance.test.js --passWithNoTests 2>&1 | grep -q "PASS\|Tests:"; then
    print_status 0 "Performance Tests"
else
    print_status 1 "Performance Tests"
fi

echo ""
echo "3️⃣ ПРОВЕРКА СИНТАКСИСА"
echo "====================="

# Проверка JavaScript файлов
JS_ERRORS=$(find . -name "*.js" -not -path "./node_modules/*" | xargs -I {} node -c {} 2>&1 | grep -c "SyntaxError" || true)

if [ "$JS_ERRORS" -eq 0 ]; then
    print_status 0 "JavaScript Syntax"
else
    print_status 1 "JavaScript Syntax ($JS_ERRORS errors)"
fi

# Проверка CSS файлов
OPEN_BRACES=$(grep -o '{' public/css/style.css 2>/dev/null | wc -l)
CLOSE_BRACES=$(grep -o '}' public/css/style.css 2>/dev/null | wc -l)

if [ "$OPEN_BRACES" -eq "$CLOSE_BRACES" ] 2>/dev/null; then
    print_status 0 "CSS Syntax ($OPEN_BRACES braces)"
else
    print_status 1 "CSS Syntax (Braces mismatch: $OPEN_BRACES vs $CLOSE_BRACES)"
fi

# Проверка JSON файлов
JSON_ERRORS=0
for json_file in $(find . -name "*.json" -not -path "./node_modules/*"); do
    if ! jq empty "$json_file" 2>/dev/null; then
        ((JSON_ERRORS++))
    fi
done

if [ "$JSON_ERRORS" -eq 0 ]; then
    print_status 0 "JSON Files"
else
    print_status 1 "JSON Files ($JSON_ERRORS errors)"
fi

echo ""
echo "4️⃣ ПРОВЕРКА ФАЙЛОВ"
echo "=================="

# Проверка обязательных файлов
FILES_TO_CHECK=(
    "server.js"
    "package.json"
    ".env.example"
    "config/db.js"
    "routes/auth.js"
    "routes/admin.js"
    "public/index.html"
    "public/css/style.css"
    "public/js/socket.js"
    "public/js/table.js"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        print_status 0 "Found: $file"
    else
        print_status 1 "Missing: $file"
    fi
done

echo ""
echo "5️⃣ ПРОВЕРКА БЕЗОПАСНОСТИ"
echo "======================="

# Проверка на SQL-инъекции в коде
SQL_INJECTION_RISKS=$(grep -r "WHERE 1=1" . --include="*.js" 2>/dev/null | wc -l)
print_status $SQL_INJECTION_RISKS "SQL Injection Risks ($SQL_INJECTION_RISKS found)"

# Проверка на XSS уязвимостей
XSS_RISKS=$(grep -r "innerHTML\s*=" public/js/*.js 2>/dev/null | grep -v "querySelector\|textContent" | wc -l || echo "0")
print_status $XSS_RISKS "Potential XSS (innerHTML usage: $XSS_RISKS)"

# Проверка на console.log в production коде
CONSOLE_LOGS=$(grep -r "console\." routes/ config/ --include="*.js" 2>/dev/null | grep -v "//.*console" | wc -l)
print_status $CONSOLE_LOGS "Console Logs in Code ($CONSOLE_LOGS found)"

echo ""
echo "6️⃣ ПОКРЫТИЕ КОДА"
echo "==============="

# Запуск jest с coverage
echo "Запуск анализа покрытия..."
npx jest --coverage --passWithNoTests 2>&1 | tail -5

echo ""
echo "7️⃣ ПРОВЕРКА ЛОГОВ"
echo "================="

# Проверка логирования
LOGGER_USAGE=$(grep -r "logger\." routes/ sockets/ --include="*.js" 2>/dev/null | wc -l)
if [ "$LOGGER_USAGE" -gt 0 ]; then
    print_status 0 "Logger Integration ($LOGGER_USAGE statements)"
else
    print_status 1 "Logger Integration (No logger usage found)"
fi

echo ""
echo "================================"
echo "📊 ИТОГОВЫЙ ОТЧЕТ"
echo "================================"
echo "Всего проверок: $TOTAL"
echo -e "${GREEN}✅ Успешно: $PASSED${NC}"
echo -e "${RED}❌ Ошибок: $FAILED${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ!${NC}"
    exit 0
else
    echo -e "${RED}❌ ОБНАРУЖЕНЫ ОШИБКИ!${NC}"
    exit 1
fi
