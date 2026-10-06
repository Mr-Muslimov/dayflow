# DayFlow

Персональный планировщик задач на React, TypeScript, Vite, Tailwind CSS v4, FullCalendar и Supabase.

## Локальный запуск

```sh
npm install
npm run dev
```

В новом браузере DayFlow запускается без задач и привычек. Без ключей Supabase добавленные данные сохраняются только в этом браузере. Чтобы подключить проект Supabase:

1. Выполните `supabase/migrations/202609300001_dayflow_state.sql` в SQL Editor проекта Supabase.
2. Скопируйте `.env.example` в `.env.local` и укажите Project URL и publishable/anon key из Supabase Project Settings > API. Не добавляйте `.env.local` в Git.
3. В Supabase Authentication > Providers включите Email и Google.
4. Создайте в Google Cloud OAuth-клиент типа Web application. Добавьте callback URL Supabase, указанный в настройках Google-провайдера (обычно `https://<project-ref>.supabase.co/auth/v1/callback`), в список Authorized redirect URIs. Введите Google client ID и client secret только в настройках Supabase; не добавляйте client secret в этот репозиторий.
5. В Supabase Authentication > URL Configuration разрешите `http://localhost:5173`, `http://localhost:5174` и URL опубликованного сайта. Если порт 5173 занят, Vite может запуститься на 5174; укажите точный адрес из строки браузера.
6. Перезапустите Vite. На компьютере нажмите кнопку профиля в правом верхнем углу, на телефоне откройте профиль в боковом меню, затем выберите вход по email или через Google.

Отправка Email OTP ограничена лимитами Supabase Auth. Если появляется ошибка `email rate limit exceeded`, дождитесь сброса лимита. Для регулярной отправки настройте проверенный custom SMTP sender в Supabase Authentication > SMTP Settings и скорректируйте лимиты email/OTP в Authentication > Rate Limits. Подтвердите домен отправителя у SMTP-провайдера, включая SPF/DKIM. Встроенная почтовая отправка Supabase предназначена для тестирования и имеет строгие квоты; обходить их на стороне приложения нельзя.

Задачи, привычки и списки гостя хранятся локально в этом браузере. После входа локальный кэш разделяется по Supabase user ID и синхронизируется со строкой `dayflow_state` этого пользователя, защищённой с помощью RLS. После выхода снова открывается гостевое пространство. История завершения задач используется для расчёта процента выполнения за сегодня и статистики за неделю, месяц и год. В календаре для задач можно задавать локализованные время начала и конца, а также индивидуальный цвет.

Личные данные можно экспортировать в формате JSON из календаря.

Если DayFlow открыт и браузеру разрешены уведомления, напоминания появляются за 10 минут до начала задачи. Для push-доставки при закрытом приложении нужны push subscription endpoint и серверный отправитель; в эту MVP-версию они не входят.

## Проверки

```sh
npm run lint
npm run build
```

## Деплой на GitHub Pages

1. Создайте GitHub repository и отправьте ветку `main`.
2. В repository откройте Settings > Pages и выберите GitHub Actions как источник деплоя.
3. В Settings > Secrets and variables > Actions добавьте secrets `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`, если на опубликованном сайте нужна авторизация и синхронизация.
4. Workflow `.github/workflows/deploy.yml` соберёт `dist` и опубликует сайт после push в `main`. Vite автоматически выставит base path по имени репозитория.
5. Добавьте опубликованный адрес `https://<owner>.github.io/<repository>/` в Supabase Authentication > URL Configuration и в разрешённые redirect URLs для Google/Email.

Без Supabase secrets сайт опубликуется, но будет работать только в гостевом режиме. `VITE_SUPABASE_ANON_KEY` — publishable key для клиента; не сохраняйте `service_role` или Google client secret в GitHub Actions secrets, если они не нужны для frontend build.

