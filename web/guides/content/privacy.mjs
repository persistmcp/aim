// Privacy policy, one page per language. EN lives at /privacy/, translations at /privacy/<lang>/.
// Required for the Claude Connectors Directory listing (missing policy = immediate rejection) and
// linked from the landing footer. Plain honest language, no legalese padding. Facts to keep true:
// DB is Supabase (EU, Frankfurt), hosting Vercel, email Resend, analytics PostHog (US, tokens
// scrubbed), tool-call telemetry kept 90 days, daily backups, deletion/export via contact email.

const EFFECTIVE = "2026-07-11";

export default {
  effective: EFFECTIVE,

  en: {
    title: "AIm privacy policy",
    description:
      "What data AIm collects (email, training log, body metrics), where it is stored, who processes it, how long it is kept and how to export or delete it.",
    lead: "AIm is a personal workout tracker you connect to your AI assistant. This page explains what data we store, where, and what control you have over it.",
    sections: [
      {
        h2: "What we collect",
        html: `        <ul>
        <li><strong>Email address.</strong> Used to send your personal access link and occasional service messages. No marketing lists.</li>
        <li><strong>Training data you tell your assistant.</strong> Sessions, exercises, sets, weights, cardio, training goals and your coach profile: experience, schedule, equipment, injury notes.</li>
        <li><strong>Body metrics.</strong> Body weight and measurements, if you log them. This is health-related data; we treat it as such and never share or sell it.</li>
        <li><strong>Technical logs.</strong> Request records with an internal user id, status and timing, kept to debug the service. Tool-call records are kept for 90 days.</li>
        <li><strong>Product analytics.</strong> Usage events (page views, signups, tool-call counts) in PostHog, tied to an internal user id but never to the content of your training log. Your secret link token is scrubbed from analytics.</li>
        </ul>`,
      },
      {
        h2: "How your data is used",
        html: `        <p>Only to run the service: store your log, show it in the app, compute your stats and let your AI assistant read and write it through your personal connector. We do not sell data, we do not show ads, we do not share your data with anyone beyond the processors listed below.</p>`,
      },
      {
        h2: "Where it lives",
        html: `        <p>Your data is stored in a database hosted by Supabase in the EU (Frankfurt). The site and API run on Vercel. Emails are delivered through Resend. Analytics run on PostHog (US). These providers process data on our behalf to operate the service.</p>`,
      },
      {
        h2: "AI assistants",
        html: `        <p>AIm does not send your data to AI providers itself. Your assistant (Claude, ChatGPT or another MCP client) reads and writes your log through the connector under your own account, on that provider's terms. What you type into the assistant is governed by its privacy policy, not this one.</p>`,
      },
      {
        h2: "Retention and deletion",
        html: `        <p>Your training data is kept while you use the service. Tool-call records are deleted after 90 days. A full automatic backup of the database is made once a day. Older backups are currently kept without a fixed expiry; when you request account deletion, we remove your data from backups as well.</p>
        <p>To delete your account and all data, or to rotate your secret link, write to <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>. To export everything, download an Excel or JSON file from Tools in the app, or ask your assistant to output your history right in the chat.</p>`,
      },
      {
        h2: "Security",
        html: `        <p>Access to your data goes only through your personal secret link, over HTTPS, and every request is scoped to your account. Keep the link private: anyone who has it can read and write your journal. If it leaks, contact us and we will rotate the key.</p>`,
      },
      {
        h2: "Contact and changes",
        html: `        <p>Questions and requests: <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>. If this policy changes, we update this page and the date above.</p>`,
      },
    ],
  },

  ru: {
    title: "Политика конфиденциальности AIm",
    description:
      "Какие данные хранит AIm (почта, дневник тренировок, замеры тела), где они лежат, кто их обрабатывает, сколько хранятся и как их выгрузить или удалить.",
    lead: "AIm это личный трекер тренировок, который вы подключаете к своему AI ассистенту. Эта страница объясняет, какие данные мы храним, где они лежат и как вы ими управляете.",
    sections: [
      {
        h2: "Что мы собираем",
        html: `        <ul>
        <li><strong>Адрес почты.</strong> Нужен, чтобы отправить личную ссылку доступа и редкие служебные письма. Никаких рассылок.</li>
        <li><strong>Тренировочные данные, которые вы сообщаете ассистенту.</strong> Сессии, упражнения, подходы, веса, кардио, цели и тренерский профиль: опыт, график, оборудование, заметки о травмах.</li>
        <li><strong>Замеры тела.</strong> Вес и обхваты, если вы их записываете. Это данные о здоровье, мы относимся к ним как к чувствительным и никогда никому их не передаём и не продаём.</li>
        <li><strong>Технические логи.</strong> Записи запросов с внутренним id пользователя, статусом и временем: они нужны для отладки сервиса. Записи вызовов инструментов хранятся 90 дней.</li>
        <li><strong>Продуктовая аналитика.</strong> События использования (просмотры, регистрации, количество вызовов инструментов) в PostHog: они привязаны к внутреннему id пользователя, но не к содержимому дневника. Секретный токен вашей ссылки в аналитику не попадает.</li>
        </ul>`,
      },
      {
        h2: "Как используются данные",
        html: `        <p>Только для работы сервиса: хранить дневник, показывать его в приложении, считать статистику и давать вашему AI ассистенту читать его и писать в него через личный коннектор. Мы не продаём данные, не показываем рекламу и не передаём данные никому, кроме перечисленных ниже обработчиков.</p>`,
      },
      {
        h2: "Где лежат данные",
        html: `        <p>Данные хранятся в базе данных Supabase в ЕС (Франкфурт). Сайт и API работают на Vercel. Письма доставляет Resend. Аналитика работает на PostHog (США). Эти провайдеры обрабатывают данные по нашему поручению для работы сервиса.</p>`,
      },
      {
        h2: "AI ассистенты",
        html: `        <p>Сам AIm не отправляет ваши данные AI провайдерам. Ваш ассистент (Claude, ChatGPT или другой MCP-клиент) читает дневник и пишет в него через коннектор под вашим собственным аккаунтом и на условиях своего провайдера. Всё, что вы пишете ассистенту, регулируется его политикой конфиденциальности, а не этой.</p>`,
      },
      {
        h2: "Хранение и удаление",
        html: `        <p>Тренировочные данные хранятся, пока вы пользуетесь сервисом. Записи вызовов инструментов удаляются через 90 дней. Полная резервная копия базы создаётся автоматически раз в день. Старые копии пока не удаляются автоматически; при удалении аккаунта мы удалим ваши данные и из резервных копий.</p>
        <p>Чтобы удалить аккаунт и все данные или заменить секретную ссылку, напишите на <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>. Чтобы выгрузить всё, скачайте Excel- или JSON-файл в разделе Инструменты в приложении или попросите ассистента вывести историю прямо в чат.</p>`,
      },
      {
        h2: "Безопасность",
        html: `        <p>Доступ к данным идёт только через вашу личную секретную ссылку по HTTPS, и каждый запрос ограничен вашим аккаунтом. Держите ссылку в тайне: кто владеет ею, тот может читать ваш дневник и писать в него. Если она утекла, свяжитесь с нами, и мы заменим ключ.</p>`,
      },
      {
        h2: "Контакт и изменения",
        html: `        <p>Вопросы и запросы: <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>. Если политика меняется, мы обновляем эту страницу и дату наверху.</p>`,
      },
    ],
  },

  pt: {
    title: "Política de privacidade do AIm",
    description:
      "Quais dados o AIm guarda (e-mail, diário de treinos, métricas corporais), onde ficam armazenados, quem os processa, por quanto tempo e como exportar ou apagar.",
    lead: "O AIm é um registro pessoal de treinos que você conecta ao seu assistente de IA. Esta página explica quais dados guardamos, onde e qual controle você tem sobre eles.",
    sections: [
      {
        h2: "O que coletamos",
        html: `        <ul>
        <li><strong>E-mail.</strong> Serve para enviar o seu link pessoal de acesso e alguma mensagem de serviço ocasional. Sem listas de marketing.</li>
        <li><strong>Dados de treino que você conta ao seu assistente.</strong> Sessões, exercícios, séries, pesos, cardio, objetivos e o seu perfil de treino: experiência, agenda, equipamento, notas sobre lesões.</li>
        <li><strong>Métricas corporais.</strong> Peso e medidas, se você registrar. São dados relacionados à saúde; tratamos como tal e nunca compartilhamos nem vendemos.</li>
        <li><strong>Registros técnicos.</strong> Logs das requisições com um id interno de usuário, status e tempos, para depurar o serviço. Os registros de chamadas de ferramentas são mantidos por 90 dias.</li>
        <li><strong>Analytics de produto.</strong> Eventos de uso (visitas, cadastros, número de chamadas de ferramentas) no PostHog, ligados a um id interno de usuário, mas nunca ao conteúdo do seu diário. O token secreto do seu link é removido dos analytics.</li>
        </ul>`,
      },
      {
        h2: "Como os seus dados são usados",
        html: `        <p>Apenas para operar o serviço: guardar o seu diário, mostrá-lo no aplicativo, calcular as suas estatísticas e permitir que o seu assistente de IA leia e escreva nele através do seu conector pessoal. Não vendemos dados, não exibimos publicidade e não compartilhamos os seus dados com ninguém além dos processadores listados abaixo.</p>`,
      },
      {
        h2: "Onde ficam armazenados",
        html: `        <p>Os seus dados vivem em um banco de dados hospedado pela Supabase na UE (Frankfurt). O site e a API rodam na Vercel. Os e-mails são enviados pela Resend. Os analytics rodam no PostHog (EUA). Esses fornecedores processam os dados em nosso nome para operar o serviço.</p>`,
      },
      {
        h2: "Assistentes de IA",
        html: `        <p>O AIm não envia os seus dados a provedores de IA por conta própria. O seu assistente (Claude, ChatGPT ou outro cliente MCP) lê e escreve o seu diário através do conector, com a sua própria conta e sob os termos do provedor. O que você escreve ao assistente é regido pela política de privacidade dele, não por esta.</p>`,
      },
      {
        h2: "Retenção e exclusão",
        html: `        <p>Os seus dados de treino são mantidos enquanto você usar o serviço. Os registros de chamadas de ferramentas são apagados após 90 dias. Uma cópia de segurança completa do banco é criada automaticamente todos os dias. Por ora as cópias antigas não são removidas automaticamente; se você pedir a exclusão da conta, apagamos os seus dados também das cópias.</p>
        <p>Para apagar a sua conta e todos os dados, ou para trocar o seu link secreto, escreva para <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>. Para exportar tudo, baixe um arquivo JSON em Ferramentas no app, ou peça ao seu assistente no chat.</p>`,
      },
      {
        h2: "Segurança",
        html: `        <p>O acesso aos seus dados passa unicamente pelo seu link secreto pessoal, por HTTPS, e cada requisição é limitada à sua conta. Mantenha o link em segredo: quem o tiver pode ler e escrever no seu diário. Se vazar, entre em contato e trocaremos a chave.</p>`,
      },
      {
        h2: "Contato e mudanças",
        html: `        <p>Dúvidas e pedidos: <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>. Se esta política mudar, atualizamos esta página e a data acima.</p>`,
      },
    ],
  },
  es: {
    title: "Política de privacidad de AIm",
    description:
      "Qué datos guarda AIm (correo, diario de entrenamientos, métricas corporales), dónde se almacenan, quién los procesa, cuánto se conservan y cómo exportarlos o borrarlos.",
    lead: "AIm es un registro personal de entrenamientos que conectas a tu asistente de IA. Esta página explica qué datos guardamos, dónde y qué control tienes sobre ellos.",
    sections: [
      {
        h2: "Qué recopilamos",
        html: `        <ul>
        <li><strong>Correo electrónico.</strong> Sirve para enviarte tu enlace personal de acceso y algún mensaje de servicio ocasional. Sin listas de marketing.</li>
        <li><strong>Datos de entrenamiento que le cuentas a tu asistente.</strong> Sesiones, ejercicios, series, pesos, cardio, objetivos y tu perfil de entrenamiento: experiencia, horario, equipo, notas sobre lesiones.</li>
        <li><strong>Métricas corporales.</strong> Peso y medidas, si las registras. Son datos relacionados con la salud; los tratamos como tales y nunca los compartimos ni vendemos.</li>
        <li><strong>Registros técnicos.</strong> Trazas de las solicitudes con un id interno de usuario, estado y tiempos, para depurar el servicio. Los registros de llamadas a herramientas se conservan 90 días.</li>
        <li><strong>Analítica de producto.</strong> Eventos de uso (visitas, registros, número de llamadas a herramientas) en PostHog, vinculados a un id interno de usuario, pero nunca al contenido de tu diario. El token secreto de tu enlace se elimina de la analítica.</li>
        </ul>`,
      },
      {
        h2: "Cómo se usan tus datos",
        html: `        <p>Solo para operar el servicio: guardar tu diario, mostrarlo en la aplicación, calcular tus estadísticas y permitir que tu asistente de IA lo lea y escriba a través de tu conector personal. No vendemos datos, no mostramos publicidad y no compartimos tus datos con nadie más allá de los procesadores listados abajo.</p>`,
      },
      {
        h2: "Dónde se almacenan",
        html: `        <p>Tus datos viven en una base de datos alojada por Supabase en la UE (Fráncfort). El sitio y la API funcionan en Vercel. Los correos se envían con Resend. La analítica funciona en PostHog (EE. UU.). Estos proveedores procesan los datos en nuestro nombre para operar el servicio.</p>`,
      },
      {
        h2: "Asistentes de IA",
        html: `        <p>AIm no envía tus datos a proveedores de IA por sí mismo. Tu asistente (Claude, ChatGPT u otro cliente MCP) lee y escribe tu diario a través del conector con tu propia cuenta y bajo las condiciones de su proveedor. Lo que escribes al asistente se rige por su política de privacidad, no por esta.</p>`,
      },
      {
        h2: "Conservación y eliminación",
        html: `        <p>Tus datos de entrenamiento se conservan mientras uses el servicio. Los registros de llamadas a herramientas se borran a los 90 días. Una copia de seguridad completa de la base se crea automáticamente cada día. Por ahora las copias antiguas no se eliminan automáticamente; si solicitas eliminar tu cuenta, eliminamos también tus datos de las copias.</p>
        <p>Para borrar tu cuenta y todos los datos, o para rotar tu enlace secreto, escribe a <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>. Para exportar todo, descarga un archivo JSON desde Herramientas en la app, o pídeselo a tu asistente en el chat.</p>`,
      },
      {
        h2: "Seguridad",
        html: `        <p>El acceso a tus datos pasa únicamente por tu enlace secreto personal, mediante HTTPS, y cada solicitud está limitada a tu cuenta. Mantén el enlace en secreto: quien lo tenga puede leer y escribir tu diario. Si se filtra, contáctanos y rotaremos la clave.</p>`,
      },
      {
        h2: "Contacto y cambios",
        html: `        <p>Preguntas y solicitudes: <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>. Si esta política cambia, actualizamos esta página y la fecha de arriba.</p>`,
      },
    ],
  },

  fr: {
    title: "Politique de confidentialité d'AIm",
    description:
      "Quelles données AIm conserve (email, journal d'entraînement, mesures corporelles), où elles sont stockées, qui les traite, combien de temps et comment les exporter ou les supprimer.",
    lead: "AIm est un journal d'entraînement personnel que vous connectez à votre assistant IA. Cette page explique quelles données nous conservons, où, et quel contrôle vous en avez.",
    sections: [
      {
        h2: "Ce que nous collectons",
        html: `        <ul>
        <li><strong>Adresse email.</strong> Sert à envoyer votre lien d'accès personnel et de rares messages de service. Aucune liste marketing.</li>
        <li><strong>Données d'entraînement que vous confiez à votre assistant.</strong> Séances, exercices, séries, charges, cardio, objectifs et profil coach : expérience, emploi du temps, matériel, notes sur les blessures.</li>
        <li><strong>Mesures corporelles.</strong> Poids et mensurations, si vous les enregistrez. Ce sont des données liées à la santé ; nous les traitons comme telles et ne les partageons ni ne les vendons jamais.</li>
        <li><strong>Journaux techniques.</strong> Traces des requêtes avec un identifiant utilisateur interne, statut et durée, pour déboguer le service. Les traces d'appels d'outils sont conservées 90 jours.</li>
        <li><strong>Statistiques produit.</strong> Événements d'usage (visites, inscriptions, nombre d'appels d'outils) dans PostHog, liés à un identifiant utilisateur interne mais jamais au contenu de votre journal. Le jeton secret de votre lien est retiré des statistiques.</li>
        </ul>`,
      },
      {
        h2: "Comment vos données sont utilisées",
        html: `        <p>Uniquement pour faire fonctionner le service : stocker votre journal, l'afficher dans l'application, calculer vos statistiques et permettre à votre assistant IA de le lire et d'y écrire via votre connecteur personnel. Nous ne vendons pas de données, n'affichons pas de publicité et ne partageons rien au-delà des prestataires listés ci-dessous.</p>`,
      },
      {
        h2: "Où elles sont stockées",
        html: `        <p>Vos données sont stockées dans une base hébergée par Supabase dans l'UE (Francfort). Le site et l'API tournent sur Vercel. Les emails partent via Resend. Les statistiques tournent sur PostHog (États-Unis). Ces prestataires traitent les données pour notre compte afin d'assurer le fonctionnement du service.</p>`,
      },
      {
        h2: "Assistants IA",
        html: `        <p>AIm n'envoie pas lui-même vos données aux fournisseurs d'IA. Votre assistant (Claude, ChatGPT ou un autre client MCP) lit et écrit votre journal via le connecteur avec votre propre compte, selon les conditions de son fournisseur. Ce que vous tapez dans l'assistant relève de sa politique de confidentialité, pas de celle-ci.</p>`,
      },
      {
        h2: "Conservation et suppression",
        html: `        <p>Vos données d'entraînement sont conservées tant que vous utilisez le service. Les traces d'appels d'outils sont supprimées après 90 jours. Une sauvegarde complète de la base est créée automatiquement une fois par jour. Les anciennes sauvegardes ne sont pas supprimées automatiquement pour le moment ; si vous demandez la suppression de votre compte, nous supprimons aussi vos données des sauvegardes.</p>
        <p>Pour supprimer votre compte et toutes les données, ou faire changer votre lien secret, écrivez à <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>. Pour tout exporter, téléchargez un fichier JSON depuis Outils dans l'application, ou demandez à votre assistant dans le chat.</p>`,
      },
      {
        h2: "Sécurité",
        html: `        <p>L'accès à vos données passe uniquement par votre lien secret personnel, en HTTPS, et chaque requête est limitée à votre compte. Gardez le lien privé : quiconque le possède peut lire et écrire votre journal. En cas de fuite, contactez-nous et nous changerons la clé.</p>`,
      },
      {
        h2: "Contact et modifications",
        html: `        <p>Questions et demandes : <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>. Si cette politique évolue, nous mettons à jour cette page et la date ci-dessus.</p>`,
      },
    ],
  },
};
