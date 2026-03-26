#!/bin/bash

# 📋 ИНТЕРАКТИВНОЕ МЕНЮ ТЕСТИРОВАНИЯ

clear
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              🧪  ТЕСТИРОВАНИЕ ПРОЕКТА TRANSFERS               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Выберите тип тестирования:"
echo ""
echo "  1️⃣  Быстрое тестирование (Security + Performance)"
echo "  2️⃣  Полное юнит-тестирование (с coverage)"
echo "  3️⃣  Только Security тесты"
echo "  4️⃣  Только Performance тесты"
echo "  5️⃣  Запустить приложение для ручного тестирования"
echo "  6️⃣  Инициализация тестовой БД"
echo "  7️⃣  Показать отчет о покрытии"
echo "  8️⃣  Проверка синтаксиса всех файлов"
echo "  9️⃣  Аудит безопасности (npm audit)"
echo " 🔟  Запустить все тесты (как в CI)"
echo "  0️⃣  Выход"
echo ""
read -p "Ваш выбор: " choice

case $choice in
    1)
        echo ""
        echo "⏳ Запуск Security + Performance тестов..."
        npm run test:security
        npm run test:performance
        ;;
    2)
        echo ""
        echo "⏳ Запуск полного юнит-тестирования..."
        npm test -- --coverage
        ;;
    3)
        echo ""
        echo "🔐 Запуск Security тестов..."
        npm run test:security
        ;;
    4)
        echo ""
        echo "⚡ Запуск Performance тестов..."
        npm run test:performance
        ;;
    5)
        echo ""
        echo "🚀 Запуск приложения..."
        echo "Приложение будет доступно на: http://localhost:3000"
        echo ""
        npm run dev
        ;;
    6)
        echo ""
        echo "🗄️  Инициализация тестовой БД..."
        read -p "MySQL пароль для root: " mysql_pass
        mysql -u root -p"$mysql_pass" << EOF
CREATE DATABASE IF NOT EXISTS transfers_test;
CREATE USER IF NOT EXISTS 'test_user'@'localhost' IDENTIFIED BY 'test_password';
GRANT ALL PRIVILEGES ON transfers_test.* TO 'test_user'@'localhost';
FLUSH PRIVILEGES;
EOF
        mysql -u test_user -ptest_password transfers_test < sql/init.sql
        mysql -u test_user -ptest_password transfers_test < sql/relay_tables.sql
        echo "✅ Тестовая БД создана!"
        ;;
    7)
        echo ""
        echo "📊 Показание отчета о покрытии..."
        npm test -- --coverage --collectCoverageFrom='routes/**/*.js,config/**/*.js'
        ;;
    8)
        echo ""
        echo "🔍 Проверка синтаксиса JavaScript файлов..."
        ERROR_COUNT=0
        for file in $(find . -name "*.js" -not -path "./node_modules/*"); do
            if ! node -c "$file" 2>/dev/null; then
                echo "❌ Синтаксис ошибка: $file"
                ((ERROR_COUNT++))
            fi
        done
        
        if [ $ERROR_COUNT -eq 0 ]; then
            echo "✅ Все файлы валидны!"
        else
            echo "❌ Найдена $ERROR_COUNT ошибка синтаксиса"
        fi
        ;;
    9)
        echo ""
        echo "🔒 Запуск npm audit..."
        npm audit --color
        ;;
    10)
        echo ""
        echo "🔄 Запуск тестирования как в CI..."
        npm install
        npm run test:security
        npm run test:performance
        npm test -- --ci --coverage
        echo ""
        echo "================================"
        echo "✅ ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ"
        echo "================================"
        ;;
    0)
        echo ""
        echo "До встречи! 👋"
        exit 0
        ;;
    *)
        echo ""
        echo "❌ Неверный выбор, пожалуйста выберите 0-10"
        ;;
esac

echo ""
read -p "Нажмите Enter для продолжения..."
