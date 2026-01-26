# 🔧 Исправление ошибки подключения к PostgreSQL на Render

## Ошибка
```
❌ PostgreSQL connection failed: getaddrinfo ENOTFOUND dpg-d4e7mni4d50c73dpnjk0-a
```

## Причина
Используется **Internal Database URL**, который может не работать из-за проблем с DNS на Render.

## Решение (2 минуты)

### Шаг 1: Получите External Database URL

1. Зайдите на https://dashboard.render.com
2. Откройте вашу **PostgreSQL базу данных**
3. Найдите секцию **"Connections"** или **"Database URL"**
4. Скопируйте **"External Database URL"** (НЕ Internal!)
   - Формат: `postgresql://user:password@dpg-xxx-a.oregon-postgres.render.com:5432/database?sslmode=require`
   - Должен содержать `.render.com` в домене

### Шаг 2: Обновите переменную окружения

1. Откройте ваш **Web Service** на Render
2. Перейдите в **"Environment"** → **"Environment Variables"**
3. Найдите `DATABASE_URL`
4. Замените значение на **External Database URL** из Шага 1
5. Нажмите **"Save Changes"**

### Шаг 3: Передеплойте

1. После сохранения переменных, нажмите **"Manual Deploy"**
2. Или сделайте `git push` для автоматического деплоя
3. Подождите завершения деплоя

### Шаг 4: Проверьте логи

После деплоя в логах должно быть:
```
✅ Connected to PostgreSQL
✅ Akylman Quiz Bowl Server Started
```

## Разница между Internal и External URL

| Тип URL | Формат | Когда использовать |
|---------|--------|-------------------|
| **Internal** | `postgresql://...@dpg-xxx-a/database` | Только для сервисов внутри Render (может не работать) |
| **External** | `postgresql://...@dpg-xxx-a.oregon-postgres.render.com:5432/database` | Всегда работает, требует SSL |

**Рекомендация**: Всегда используйте **External Database URL** для надежности.

## Если проблема осталась

1. **Проверьте формат URL**:
   - Должен начинаться с `postgresql://`
   - Должен содержать полный домен с `.render.com`
   - Должен заканчиваться на `?sslmode=require`

2. **Проверьте, что база данных запущена**:
   - На странице PostgreSQL базы должно быть "Status: Available"

3. **Попробуйте пересоздать базу**:
   - Удалите старую базу
   - Создайте новую
   - Скопируйте новый External URL

4. **Проверьте переменные окружения**:
   - Убедитесь, что `DATABASE_URL` установлен в вашем Web Service
   - Не в PostgreSQL базе, а в Web Service!

## Пример правильного DATABASE_URL

```
postgresql://akylman:password123@dpg-d4e7mni4d50c73dpnjk0-a.oregon-postgres.render.com:5432/akylman?sslmode=require
```

Обратите внимание:
- ✅ Полный домен с `.oregon-postgres.render.com`
- ✅ Порт `:5432`
- ✅ Параметр `?sslmode=require` в конце

