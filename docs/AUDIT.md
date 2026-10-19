# Ревизия Grok Personal AI — 1 октября 2026

Проверены исходные файлы проекта, каталог из 16 моделей, локальные руководства установленного Next.js 16.3.6, официальные руководства и REST-схемы xAI. Исходная рабочая директория уже содержала незакоммиченные изменения; работа продолжена поверх них без сброса.

## Исправленные ошибки

| Область | До ревизии | Исправление |
| --- | --- | --- |
| TypeScript | Импорт несуществующего `GrokModel` | Согласованный тип `AIModel`; строгие типы параметров, файлов, результатов и ошибок |
| ESLint | FlatCompat несовместим с flat config Next.js, circular JSON | Нативные flat configs Next.js; восстановлены проверки TypeScript и React |
| TTS | `/audio/speech`, fallback только после 404, поля model/input/text/voice | Сразу `/tts`, text/voice_id/language/output_format; без неподдерживаемых полей |
| TTS ответ | Только бинарный `audio/*`, JSON с таймкодами не читался | Бинарное аудио, octet-stream, JSON audio/content_type/audio_timestamps; ошибки проверяются до обработки аудио |
| Видео | Все файлы в `images`, без разделения режимов | image/reference_images/reference_audios/last_frame/keyframes/video с правильными endpoints |
| Выбор голоса видео | Скрыт за референсным режимом и кнопкой добавления | Видимый селектор Video 1.5; автоматический переход в reference-to-video, сохранение первого кадра, понижение 1080p до 720p |
| Видео ответ | Не извлекался `video.url`, истечение задания не завершало цикл | Нормализация nested URL; обработка pending/done/failed/expired и moderation |
| Видео ожидание | Одна серверная POST-сессия до 5 минут, незавершённый ответ считался успешным | Немедленный 202 + отдельные GET-проверки; повтор временных ошибок, отмена и продолжение по ID |
| Видео ограничения | Референсы с 1080p, произвольные вложения, настройки генерации при редактировании | Правила режимов; роли кадров, лимиты референсов и голосов, сетка ключевых кадров, проверки длительности MP4 |
| STT | Модель с текстовым выходом шла в chat; альтернативный audio endpoint получал JSON | `/stt`, multipart с реальными байтами, file последним; текст/слова/каналы результата |
| Realtime voice | Неподходящий REST endpoint, отсутствие голосового результата | Временный токен, browser WebSocket, session.updated, ручной turn, текст/PCM вход, WAV + transcript выход |
| Изображения | Даже с исходными изображениями использовался generations, показывался только первый результат | edits с image или images; галерея 1–10 результатов; URL/base64 |
| Текст | `reasoningEffort` вместо API поля; multi-agent через неподходящий общий маршрут | Responses API, reasoning.effort, output message/content; JSON/Schema и инструменты |
| Reasoning | Необоснованный effort selector для Grok 4.20 Reasoning; xhigh у 4.5 | Только документированные значения: 4.7/4.6 — low/medium/high/xhigh; 4.5 — low/medium/high; 4.3 — none/low/medium/high/xhigh; multi-agent — low/medium/high/xhigh |
| Настройки | Значения сбрасывались эффектом и могли попасть в запрос новой модели | Отдельный черновик каждой модели, общая схема для UI/сервера, удаление скрытых несовместимых полей |
| Sampling | Отсутствие top_p и проверки сочетаний | Явный выбор default / temperature / top_p; одновременно оба поля не отправляются |
| Сохранение | Медиа-URL сохранялся как `.md`, object URLs не освобождались | Получение изображений/видео через сервер, скачивание файлов с расширением, освобождение Blob URL |
| Ошибки | Пустые/неверные ответы отображались как успех | Проверка структуры и наличия результата; JSON/HTML/HTTP ошибки, Retry-After, прерывание запросов |
| Справка | Неверные цены и единицы TTS/STT/voice/video/quality; неподтверждённые даты | Актуализированные базовые тарифы и единицы; убраны неподтверждённые даты; ссылки на xAI |
| Storage/журнал | Ошибка storage могла сломать интерфейс; неограниченный журнал с base64 | Обработка недоступного localStorage; журнал максимум 100 записей без ключей и base64 |
| Сборка | dev использовал Webpack, build — Turbopack; Turbopack падал в текущей среде | Оба режима используют документированный `--webpack`; production-сборка проходит |

## Уточнения и ограничения

- В официальном [руководстве генерации изображений](https://docs.x.ai/developers/model-capabilities/images/generation) перечислены 1k/2k, а [REST-схема Images](https://docs.x.ai/developers/rest-api-reference/inference/images) содержит также 1.5k. В существующем каталоге 1.5k сохранён у 2.0 и Quality. Поддержку конкретной комбинации разрешения, модели и региона нужно подтвердить реальным запросом.
- Для старых Imagine Image/Quality лимит исходных изображений установлен в 3; для 2.0 — 5. Пропорции 21:9 и 5:2 доступны только у 2.0, согласно руководству миграции Quality. Для текстовых моделей проверяются JPEG/PNG и лимит 20 МиБ на изображение.
- Для edits/extensions документация показывает классическую `grok-imagine-video`, а [карточка Video 1.5](https://docs.x.ai/developers/models/grok-imagine-video-1.5) не объявляет video input. В UI эти режимы доступны у классической модели; неподтверждённая комбинация с 1.5 не предлагается.
- У Video 1.5 аудиофайлы-референсы доступны только отдельным партнёрам xAI. Общедоступный выбор встроенных голосов реализован через reference_audios.voice_id; загрузка произвольного аудио для видео не предлагается.
- Перепроверено разделение классических image/reference режимов: `reference_images` направляет содержание и стиль; `image` задаёт первый кадр. Документация отдельно запрещает классической модели комбинацию этих полей, последний и ключевые кадры; референсы изображений сохранены. Локальный максимум классического reference режима 10 с консервативен: новое руководство явно указывает 15 с у 1.5, но отдельный максимум классической модели не уточняет.
- У Grok 4.20 Reasoning и Grok Build в проверенных карточках моделей не объявлен набор настраиваемых efforts; приложение не отправляет предполагаемые значения. Модели сохраняют своё штатное reasoning поведение.
- API-каталог статический и проверен на указанную дату. Права команды, регион, баланс и фактическая доступность проверяются самим xAI; UI показывает соответствующую ошибку.
- `grok-imagine-image-quality` имеет объявленный переход на 2.0 начиная со 2 ноября 2026; в момент ревизии сохранён действующий ID. См. [руководство миграции](https://docs.x.ai/developers/migration/imagine-image-quality-nov-2).
- Лимиты загрузки 25/50 МБ и 50 изображений в текстовом запросе — ограничения приложения. STT xAI допускает файлы до 500 МБ, но этот интерфейс использует JSON/base64 для передачи до локального сервера.
- Голосовой интерфейс реализует один ответ на текст/аудиофайл; постоянная голосовая сессия с микрофоном не заявляется.
- В ревизии 1 октября ключ хранился в localStorage. Это поведение заменено 2 октября серверными HttpOnly-сессиями; актуальные меры и ограничения описаны в [отчёте безопасности](UI_SECURITY.md).

## Проверки

- Автоматические тесты (39 сценариев) выполняют настоящие функции формирования запросов, нормализации ответов и Next.js route handlers с подменой только внешнего fetch. Проверяются ошибки до отправки, структура TTS/STT/video/Responses, binary/JSON TTS, HTTP ошибки, multipart порядок, кадры, лимиты, переключение настроек и WAV заголовок. Дополнительные сценарии проверяют 7 классических референсов, voice-only Video 1.5, сохранение первого кадра при выборе/удалении голоса, очистку голосов при отключении звука и передачу референсов через route handler.
- Дополнительно моделируется Realtime WebSocket: ожидание session.updated, последовательность отправки, audio/transcript deltas, completion, ошибки, закрытие и отмена. Проверяются готовое видео и отмена pending polling.
- Проверены TypeScript, ESLint и production-сборка Webpack.
- Проверены настройки в работающем браузере: WAV скрывает MP3 bitrate; переход из 1080p в reference-video убирает неподдерживаемое разрешение. Дополнительно проверены формы STT и классического video edit/extend.
- При повторной проверке видео в браузере подтверждены видимость выбора голоса в текстовом режиме 1.5, переход с 1080p на 720p при выборе `leo`, лимит 3 голосов, очистка голосов и возврат в текстовый режим при отключении звука. У классической модели проверены режим референсов и кнопка прикрепления изображений. [Снимок интерфейса выбора голоса](video-voice-ui.jpg).
- `npm audit` не выявил известных уязвимостей установленного дерева зависимостей.
- Платные запросы генерации к xAI не выполнялись. Проверки с моделированными ответами не подтверждают доступность моделей по конкретному ключу, качество генерации, региональные ограничения и полный живой Realtime transport.

## Первичные источники

- [Каталог и цены](https://docs.x.ai/developers/models)
- [Responses API](https://docs.x.ai/developers/rest-api-reference/inference/responses)
- [Reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning)
- [Grok 4.3](https://docs.x.ai/developers/models/grok-4.3)
- [Grok 4.20 Reasoning](https://docs.x.ai/developers/models/grok-4.20-0309-reasoning)
- [Grok Build](https://docs.x.ai/developers/models/grok-build-0.1)
- [Image generation](https://docs.x.ai/developers/model-capabilities/images/generation), [Image edits](https://docs.x.ai/developers/model-capabilities/images/editing), [REST Images](https://docs.x.ai/developers/rest-api-reference/inference/images)
- [Video generation](https://docs.x.ai/developers/model-capabilities/video/generation), [References and frames](https://docs.x.ai/developers/model-capabilities/video/reference-to-video), [Editing](https://docs.x.ai/developers/model-capabilities/video/editing), [Extension](https://docs.x.ai/developers/model-capabilities/video/extension)
- [TTS](https://docs.x.ai/developers/model-capabilities/audio/text-to-speech), [STT](https://docs.x.ai/developers/model-capabilities/audio/speech-to-text), [Voice REST](https://docs.x.ai/developers/rest-api-reference/inference/voice)
- [Realtime speech](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech), [Ephemeral tokens](https://docs.x.ai/developers/model-capabilities/audio/ephemeral-tokens)
