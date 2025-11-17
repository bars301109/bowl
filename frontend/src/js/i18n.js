(function(){
  const DICTS = {
    ru: {
      'nav.home': 'Главная',
      'nav.register': 'Зарегистрироваться',
      'nav.login': 'Войти',
      'nav.admin': 'Админ',
      'hero.title1': 'Akylman Quiz Bowl',
      'hero.subtitle': 'Для учеников средней и старшей школы',
      'hero.cta': 'Зарегистрироваться',
      'status.reg_open': 'Регистрация открыта!',
      'status.practice': 'Сдайте тест в кабинете.',
      'status.ceremony': 'Удачи!',
      'about.title': 'О соревновании',
      'about.prelim': 'Отборочный этап',
      'about.prelim.desc': 'На этом этапе команды проходят онлайн-тестирование по выбранным категориям.',
      'about.semi': 'Полуфинал',
      'about.semi.desc': 'Этап выявляет лучшие команды среди уже успешных. На этом этапе проводится онлайн-тестирование.',
      'about.final': 'Финал',
      'about.final.desc': 'Финал проводится в оффлайн формате в городе Чолпон-Ата, в Президентской школе "Акылман". Итоговый тест между лучшими командами по результатам полуфинала.',
      'how.title': 'Как это работает',
      'how.team': 'Размер команды',
      'how.team.desc': '* Команда должна состоять из учеников 8-10 классов. * Все члены команды должны быть из одной школы. * В команде должно быть от 3 до 6 человек.',
      'how.cats': 'Категории',
      'how.format': 'Формат соревнования',
      'how.format.desc': 'Этапы 1 и 2 проводятся в онлайн-формате с использованием тестовых вопросов по выбранным категориям. Третий этап (Финал) проводится в оффлайн-формате в Президентской школе "Акылман".',
      'how.time': 'Время',
      'how.time.desc': '60 минут. Окно доступа задается организатором.',
      'timeline.title': 'Таймлайн',
      'timeline.day1': 'День 1',
      'timeline.day2': 'День 2',
      'timeline.day3': 'День 3',
      'timeline.final': 'Финал',
      'cats.title': 'Категории',
      'cat.kg': 'Кыргызстан',
      'cat.history': 'История',
      'cat.stem': 'Илим/STEM',
      'cat.lit': 'Адабият',
      'cat.kg.desc': 'Глубокое изучение Кыргызстана: история государства, географические особенности, культурное наследие, традиции и обычаи. Основы государственного устройства и Конституции. Знаменитые личности и их вклад в развитие нации. Экономика, природные ресурсы и перспективы развития страны. Воспитание патриотизма и гражданской ответственности.',
      'cat.history.desc': 'История Кыргызстана: от древних времен до современности. История мировых цивилизаций, великих империй и ключевых исторических событий. Биографии выдающихся исторических личностей, их роль в развитии общества. Анализ причин и следствий важных событий. Развитие критического и аналитического мышления через изучение исторических процессов.',
      'cat.stem.desc': 'Интегрированное изучение наук: физика, химия, биология и математика. Практическое применение знаний в информационных технологиях и программировании. Логическое и алгоритмическое мышление. Научный метод и экспериментирование. Современные открытия и инновации в STEM-областях. Развитие навыков решения сложных научных задач.',
      'cat.lit.desc': 'Русский язык: грамматика, пунктуация, орфография и стилистика. Кыргызский язык и его особенности. Классическая и современная литература обоих языков. Анализ произведений, их тематика и идейное содержание. Авторское мастерство и литературные приемы. Развитие языковой культуры, речевых навыков и литературного вкуса.',
      'cat.art.desc': 'Спорт и искусство: виды спорта, спортсмены, музыка, театр, живопись, кино. Ценность творчества и развития.',
      'login.title': 'Вход',
      'login.login': 'Логин',
      'login.password': 'Пароль',
      'login.submit': 'Войти',
      'register.title': 'Регистрация команды',
      'register.team_name': 'Название команды',
      'register.login': 'Логин команды',
      'register.password': 'Пароль',
      'register.password2': 'Повтор пароля',
      'register.captain_name': 'ФИО капитана',
      'register.captain_email': 'Email капитана',
      'register.captain_phone': 'Телефон капитана',
      'register.school': 'Школа',
      'register.city': 'Город',
      'register.members_count': 'Количество участников',
      'register.submit': 'Зарегистрироваться',
      'team.title': 'Кабинет команды',
      'team.tab.home': 'Главная',
      'team.tab.tests': 'Тесты',
      'team.tab.results': 'Результаты',
      'team.tab.settings': 'Настройки',
      'team.tab.rules': 'Правила',
      'team.tab.practice': 'Практика',
      'team.rules.hidden_note': 'Правила доступны здесь.',
      'team.timer': 'Осталось времени',
      'team.prev': 'Назад',
      'team.next': 'Далее',
      'team.submitting': 'Отправка...'
    },
    ky: {
      'nav.home': 'Башкы бет',
      'nav.register': 'Катталуу',
      'nav.login': 'Кирүү',
      'nav.admin': 'Админ',
      'hero.title1': 'Akylman Quiz Bowl',
      'hero.subtitle': 'Орто жана жогорку класстын окуучулары үчүн',
      'hero.cta': 'Команданы каттоо',
      'status.reg_open': 'Каттоо ачык!',
      'status.practice': 'Кабинетте тест тапшырыңыз.',
      'status.ceremony': 'Ийгилик!',
      'about.title': 'Турнир жөнүндө',
      'about.prelim': 'Тандоо этабы',
      'about.prelim.desc': 'Бул кадамда топторду онлайн-тестирлөө аркылуу, бөлүнгөн категориялар боюнча сынак күтөт.',
      'about.semi': 'Жарым финал',
      'about.semi.desc': 'Бул этап эң алдынкы топтордун арасында дагы да алдыңкы топторду аныктайт. Бул кадамда сиздерди онлайн-тестирлөө аркылуу сынак күтөт.',
      'about.final': 'Финал',
      'about.final.desc': 'Финал оффлайн форматында, Чолпон-Ата шаары, "Акылман" Президенттик лицейинде өткөрүлөт. Жарым финалдын натыйжасындагы эң алдыңкы топтор арасында жыйынтыктоочу сынак.',
      'how.title': 'Сынактын жүрүшү',
      'how.team': 'Топтордун курамы',
      'how.team.desc': '* Топтордун курамы 8-10 класстардын окуучуларынан туруусу зарыл. * Топтун мүчөлөрү бир мектептен болуусу зарыл. * Бир топто 3-6га чейин мүчө болуу керек.',
      'how.cats': 'Категориялар',
      'how.format': 'Сынактын форматы',
      'how.format.desc': '1 жана 2-этаптар онлайн форматта тестирлөө аркылуу өтөт. 3-этап (Финал) оффлайн түрүндө "Акылман" Президенттик лицейинде өтөт.',
      'how.time': 'Убакыт',
      'how.time.desc': '60 мүнөт. Кирүү терезесин уюштуруучу коёт.',
      'timeline.title': 'Жүгүтмө',
      'timeline.day1': '15-декабрь, 2025-жыл',
      'timeline.day2': '20-декабрь, 2025-жыл',
      'timeline.day3': '25-декабрь, 2025-жыл',
      'timeline.final': '5-январь, 2026-жыл',
      'cats.title': 'Категориялар',
      'cat.kg': 'Кыргызстан',
      'cat.history': 'Тарых',
      'cat.stem': 'Илим/STEM',
      'cat.lit': 'Адабият',
      'cat.kg.desc': 'Кыргызстан боюнча билим: география, маданият, Конституция, мамлекеттик түзүлүш. Мекенге кызыгуу жана жарандык аң-сезим.',
      'cat.history.desc': 'Кыргызстан жана дүйнө тарыхы: доорлор, инсандар, окуялар. Тарыхый ой жүгүртүү.',
      'cat.stem.desc': 'Илим жана технология: физика, химия, биология, математика, ИТ. Логика жана изилдөөгө кызыгуу.',
      'cat.lit.desc': 'Кыргызский язык: грамматика, пунктуация, орфография и стилистика. Русский язык и его особенности. Классическая и современная кыргызская и русская литература. Анализ произведений, их тематика и идейное содержание. Авторское мастерство и литературные приемы. Развитие языковой культуры и речевых навыков.',
      'login.title': 'Кирүү',
      'login.login': 'Логин',
      'login.password': 'Сырсөз',
      'login.submit': 'Кирүү',
      'register.title': 'Команданы каттоо',
      'register.team_name': 'Команданын аталышы',
      'register.login': 'Команданын логини',
      'register.password': 'Сырсөз',
      'register.password2': 'Сырсөздү кайталоо',
      'register.captain_name': 'Капитандын ФИО',
      'register.captain_email': 'Капитандын Email',
      'register.captain_phone': 'Капитандын телефону',
      'register.school': 'Мектеп',
      'register.city': 'Шаар',
      'register.members_count': 'Катышуучулардын саны',
      'register.submit': 'Катталуу',
      'team.title': 'Команданын кабинети',
      'team.tab.home': 'Башкы',
      'team.tab.tests': 'Тесттер',
      'team.tab.results': 'Жыйынтыктар',
      'team.tab.settings': 'Орнотуулар',
      'team.tab.rules': 'Эреже',
      'team.tab.practice': 'Практика',
      'team.rules.hidden_note': 'Эрежелер бул жерде жеткиликтүү.',
      'team.timer': 'Калган убакыт',
      'team.prev': 'Артка',
      'team.next': 'Кийинки',
      'team.submitting': 'Жиберүү...'
    }
  };
  function applyI18n(lang, root){
    const dict = DICTS[lang] || DICTS.ru;
    (root||document).querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.getAttribute('data-i18n');
      if(dict[key]) {
        const text = dict[key];
        if(text.includes('*')){
          const items = text.split('*').filter(s=>s.trim());
          el.innerHTML = '<ul>' + items.map(item=>`<li>${item.trim()}</li>`).join('') + '</ul>';
        } else {
          el.textContent = text;
        }
      }
    });
    (root||document).querySelectorAll('[data-i18n-ph]').forEach(el=>{
      const key = el.getAttribute('data-i18n-ph');
      if(dict[key]) el.setAttribute('placeholder', dict[key]);
    });
  }
  function getLang(){ return localStorage.getItem('akylman_lang') || 'ru'; }
  function setLang(l){ localStorage.setItem('akylman_lang', l); applyI18n(l); try{ window.dispatchEvent(new CustomEvent('akyl-langchange',{ detail:{ lang:l } })); }catch(e){} }
  function initSwitcher(){
    document.querySelectorAll('.lang-switch button, .lang-switcher button').forEach(b=>{ b.onclick = ()=> setLang(b.dataset.lang); });
    applyI18n(getLang());
  }
  function t(key){ const d = DICTS[getLang()]||DICTS.ru; return d[key]||key; }
  window.AkylI18n = { applyI18n, getLang, setLang, initSwitcher, t };
  window.t = t;
})();
