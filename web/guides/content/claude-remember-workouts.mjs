// Guide: how to make Claude remember your workouts. RU is the source copy; en/es/fr are
// translations. Copy rules: no em dashes, no invented social proof, honest claims, prompts first.

export default {
  slug: "claude-remember-workouts",

  en: {
    title: "Workout tracker app for Claude and ChatGPT: log workouts by chat",
    description:
      "A free workout tracker app where Claude or ChatGPT is the interface: log a session in one sentence and get charts, records and a history every new chat can read.",
    lead: "AIm is a free workout tracker app with an unusual interface: the chat assistant you already use. You tell Claude or ChatGPT what you lifted in one sentence, the app keeps the structured log, the charts and the records, and every future chat can read your history back.",
    sections: [
      {
        h2: "Logging by sentence instead of by form",
        html: `        <p>This is the part that decides whether a log survives past week three. A traditional tracker asks you to find the exercise in a list, add a set, type a number, repeat. It is accurate and it is friction, and friction between sets is what kills logging habits.</p>
        <p>Describing the session costs one message:</p>
        <div class="prompt"><span class="who">You</span>Squats 5x5 at 80, last set was grindy. Then leg press 3x12 at 140.</div>
        <p>The assistant does the structuring: exercise names, sets, reps, weights, the note that the last set was hard. You never open a form. If you got something wrong, you say so in words rather than hunting for the row to edit.</p>
        <p>The tradeoff is honest: typing a sentence is slower than tapping a familiar app if you are logging mid workout, set by set. It is much faster if you log once at the end, which many people do anyway.</p>`,
      },
      {
        h2: "Your history follows you into every new chat",
        html: `        <div class="prompt"><span class="who">You</span>Bench press 4x12 at 24 kg, then rows 3x10 at 30. Body weight 92.9 today.</div>
        <p>Claude stores the session: exercises, sets, weights, body weight. A week later, in a brand new chat:</p>
        <div class="prompt"><span class="who">You</span>What did I bench last time and what should I try today?</div>
        <p>Claude reads your history through the connector and answers with your real numbers. Mistakes are fixed the same way:</p>
        <div class="prompt"><span class="who">You</span>Set 3 was actually 10 reps, not 12.</div>`,
      },
      {
        h2: "Charts, records and a program in a real app",
        html: `        <p>Everything the assistant logs shows up in a mobile web app: a muscle map of your weekly volume, progression charts per exercise, personal records, body metrics, your current program and progress toward the goal you set with the coach. You talk to the assistant, the app keeps the picture. And the data stays yours: export everything as Excel or JSON whenever you want.</p>
        <p>That split matters more than it sounds. Chat is a good interface for writing and for questions, and a bad one for looking at a trend across four months. A screen is the opposite. Putting the assistant in front of a real app gives you both, instead of asking one of them to be something it is not.</p>
        <p>AIm works in English, Portuguese, Russian, Spanish and French.</p>`,
      },
      {
        h2: "How the connection works",
        html: `        <p>Claude supports <a href="/guides/en/connect-workout-tracker-mcp/">connectors built on MCP</a>, an open protocol that lets the assistant use external tools. AIm is a workout storage connector: it gives Claude tools to write and read your training log, kept in private storage that only your link can reach.</p>
        <p>After connecting, you just talk. Claude logs each session through the connector, and every future chat can read the full history back.</p>`,
      },
      {
        h2: "Why the chat forgets your training",
        html: `        <p>Every chat is a separate conversation. When you close it, the sets, weights and pain notes you described stay behind in that chat. The next conversation starts blank.</p>
        <p>Most people training seriously end up with two things open. A workout tracker app, where you tap in the exercise, the set and the weight. And a chat assistant, where you ask what to do next and why your bench has stalled.</p>
        <p>Neither knows the other exists. The tracker holds a clean history no assistant can read. The assistant gives advice built on whatever you remembered to type into that particular conversation. You end up as the integration layer, copying numbers between two apps, which is exactly the job software should be doing.</p>
        <ul>
        <li><strong>Pasting history into each chat.</strong> Works for a week, then the wall of text grows, eats the context window and drifts out of date.</li>
        <li><strong>Keeping a spreadsheet.</strong> Now you maintain two systems by hand and the assistant still cannot write to it.</li>
        <li><strong>Projects with attached files.</strong> Better, but the file does not update itself after every workout, and there are no charts or records.</li>
        <li><strong>The built-in memory feature.</strong> Both ChatGPT and Claude now remember things about you across chats, and people reasonably assume this solves it. It does not, because it is designed for preferences rather than records. It will happily remember that you train four times a week. It will not reliably hold sixty sessions of exercise, set, rep and weight, and you cannot chart what it stores.</li>
        </ul>
        <p>There are two ways out. Either your tracker learns to expose its data to an assistant, which is what the community bridge servers in the <a href="/guides/en/connect-workout-tracker-mcp/">connector guide</a> do, or your assistant gets a place to write. This page is about the second, because it takes about a minute to set up and the assistant can log new sessions, not just discuss old ones.</p>`,
      },
      {
        h2: "What to look for in a workout tracker app that works with AI",
        html: `        <p>If you are comparing options rather than taking a recommendation, these are the questions that actually separate them.</p>
        <ul>
        <li><strong>Can the assistant write, or only read?</strong> A read-only connection can discuss your history. It cannot log today's session, which is most of the value.</li>
        <li><strong>Is the data structured?</strong> Free text notes cannot drive progression. Exercise, set, rep and weight need to be separate fields for anything to compute an estimated one rep max or a weekly volume.</li>
        <li><strong>Does it work with the assistant you already pay for?</strong> A tracker with its own built in AI is a second subscription and a second place your history lives.</li>
        <li><strong>Can you get your data out?</strong> Export should be one click or one sentence, not a support request.</li>
        </ul>`,
      },
    ],
    faq: [
      {
        q: "Is there a free workout tracker app with no subscription?",
        a: "AIm is free with all features included. On Claude the connector works on the free plan too, so the whole setup can cost nothing. ChatGPT requires Developer mode, which is available on its paid tiers.",
      },
      {
        q: "Does this work on the free Claude plan?",
        a: "Custom connectors are available on the free Claude plan. Check the connector settings for your plan and region.",
      },
      {
        q: "Can I use this instead of my current workout app?",
        a: "Yes, and you can bring your history with you: export it from the other app and ask the assistant to import the file. Some people keep both for a while, logging in whichever is closer to hand.",
      },
      {
        q: "Is my training data safe?",
        a: "Your log lives in private storage reachable only through your secret link, with automatic daily backups. Download it as Excel or JSON from Tools in the app, or ask the assistant to export it right into the chat.",
      },
    ],
    cta: {
      title: "Get your free workout tracker",
      text: "Free, signup takes a minute. Enter your email, get a personal link, add it to Claude as a connector.",
    },
  },

  ru: {
    title: "Как научить Claude запоминать ваши тренировки",
    description:
      "Claude хорошо советует по тренировкам, но к следующему чату забывает ваши подходы и веса. Разбираем, почему так происходит и как дать AI тренеру настоящую память.",
    lead: "Claude может собрать отличную тренировку. Проблема начинается через неделю: новый чат ничего не знает о ваших весах, и советы обнуляются.",
    sections: [
      {
        h2: "Почему Claude забывает ваши тренировки",
        html: `        <p>Каждый чат живёт отдельно. Закрыли переписку, и подходы, веса и заметки о самочувствии остались в ней. Следующий разговор начинается с чистого листа.</p>
        <p>Встроенная память помогает с общими фактами о вас, но хранит короткие заметки, а не структурированные данные тренировок. Тренеру нужны точные цифры: какое упражнение, в какой день, сколько повторов и с каким весом. Заметка вида <strong>пользователь ходит в зал</strong> прогрессию не построит.</p>`,
      },
      {
        h2: "Что обычно пробуют сначала",
        html: `        <ul>
        <li><strong>Вставлять историю в каждый чат.</strong> Неделю работает, потом простыня растёт, съедает контекст и устаревает.</li>
        <li><strong>Вести таблицу.</strong> Теперь у вас две системы, обе руками, и ассистент всё равно не может в неё писать.</li>
        <li><strong>Проекты с прикреплённым файлом.</strong> Уже лучше, но файл не обновляется сам после каждой тренировки, а графиков и рекордов в нём нет.</li>
        </ul>`,
      },
      {
        h2: "Настоящее решение: дать Claude место для хранения",
        html: `        <p>Claude поддерживает коннекторы на базе MCP, открытого протокола, через который ассистент пользуется внешними инструментами. AIm как раз такой коннектор: он даёт Claude инструменты, чтобы вести ваш дневник тренировок в личном хранилище и читать его.</p>
        <p>После подключения вы просто разговариваете. Claude записывает каждую сессию через коннектор, и любой будущий чат может прочитать всю историю.</p>`,
      },
      {
        h2: "Как это выглядит на практике",
        html: `        <div class="prompt"><span class="who">Вы</span>Жим лёжа 4x12 по 24 кг, потом тяга 3x10 по 30. Вес сегодня 92,9.</div>
        <p>Claude сохраняет сессию: упражнения, подходы, веса, вес тела. Через неделю, уже в новом чате:</p>
        <div class="prompt"><span class="who">Вы</span>Сколько я жал в прошлый раз и что пробовать сегодня?</div>
        <p>Claude читает историю через коннектор и отвечает вашими реальными цифрами. Ошибки исправляются так же:</p>
        <div class="prompt"><span class="who">Вы</span>В третьем подходе было 10 повторов, а не 12.</div>`,
      },
      {
        h2: "Больше, чем память: графики, рекорды, программа",
        html: `        <p>Всё, что записал Claude, видно в мобильном веб-приложении: карта мышц с недельной нагрузкой, графики прогресса по каждому упражнению, личные рекорды, замеры тела, текущая программа и прогресс к цели, которую вы поставили вместе с тренером. Вы разговариваете с ассистентом, приложение собирает полную картину.</p>
        <p>AIm работает на русском, английском, португальском, испанском и французском.</p>`,
      },
    ],
    faq: [
      {
        q: "Работает на бесплатном тарифе Claude?",
        a: "Кастомные коннекторы доступны и на бесплатном тарифе Claude. Проверьте настройки коннекторов для вашего тарифа и региона.",
      },
      {
        q: "Мои данные в безопасности?",
        a: "Дневник лежит в личном хранилище, доступ только по вашей секретной ссылке, резервные копии делаются автоматически каждый день. Скачайте его в формате Excel или JSON в разделе Инструменты приложения или попросите ассистента вывести историю прямо в чат.",
      },
    ],
    cta: {
      title: "Дайте вашему AI тренеру память",
      text: "Бесплатно, регистрация за минуту. Введите почту, получите личную ссылку и добавьте её в Claude как коннектор.",
    },
  },

  pt: {
    title: "App de registro de treino para Claude e ChatGPT: memória de verdade para a sua IA",
    description:
      "Assistentes de chat dão bons conselhos de treino mas esquecem as suas séries na conversa seguinte, e apps de treino comuns não falam com eles. Veja como ter os dois.",
    lead: "Claude e ChatGPT montam um ótimo treino. O problema começa na semana seguinte: um chat novo não sabe nada do que você levantou, e o conselho volta ao zero.",
    sections: [
      {
        h2: "Duas ferramentas que deveriam conversar e não conversam",
        html: `        <p>Quem treina a sério acaba com duas coisas abertas. Um app de registro, onde você toca no exercício, na série e no peso. E um assistente de chat, onde você pergunta o que fazer agora e por que o seu supino travou.</p>
        <p>Nenhum sabe que o outro existe. O app guarda um histórico limpo que nenhuma IA consegue ler. A IA dá conselhos com base no que você lembrou de digitar naquela conversa. Você vira a camada de integração, copiando números entre dois apps.</p>`,
      },
      {
        h2: "Por que o chat esquece os seus treinos",
        html: `        <p>Cada conversa é separada. Quando você fecha, as séries, os pesos e as observações ficam para trás. A conversa seguinte começa em branco.</p>
        <p>Os recursos de memória embutidos ajudam com fatos gerais sobre você, mas guardam notas curtas, não dados estruturados de treino. Um treinador precisa de números exatos: qual exercício, qual dia, quantas repetições com que peso.</p>`,
      },
      {
        h2: "O que as pessoas tentam primeiro",
        html: `        <ul>
        <li><strong>Colar o histórico em cada chat.</strong> Funciona por uma semana, depois o muro de texto cresce e fica desatualizado.</li>
        <li><strong>Manter uma planilha.</strong> Agora são dois sistemas na mão e o assistente ainda não consegue escrever nela.</li>
        <li><strong>Projetos com arquivos anexados.</strong> Melhor, mas o arquivo não se atualiza depois de cada treino, e não há gráficos nem recordes.</li>
        <li><strong>O recurso de memória embutido.</strong> Foi feito para preferências, não para registros. Ele lembra que você treina quatro vezes por semana. Não segura sessenta sessões de exercício, série, repetição e peso, e você não consegue ver em gráfico o que ele guarda.</li>
        </ul>`,
      },
      {
        h2: "A solução real: dar ao assistente um lugar para guardar",
        html: `        <p>O Claude suporta conectores construídos sobre MCP, um protocolo aberto que deixa o assistente usar ferramentas externas. O AIm é um conector de armazenamento de treinos: dá ao Claude ferramentas para escrever e ler o seu diário, guardado num armazenamento privado que só o seu link alcança.</p>
        <p>O passo a passo da conexão, no Claude e no ChatGPT, está no <a href="/guides/pt/connect-workout-tracker-mcp/">guia de conectores</a>.</p>
        <p>Depois de conectar, é só conversar.</p>`,
      },
      {
        h2: "Registrar por frase em vez de formulário",
        html: `        <p>É essa parte que decide se o registro sobrevive à terceira semana. Um app tradicional pede que você ache o exercício numa lista, adicione uma série e digite um número. É preciso e é atrito, e atrito entre séries mata o hábito.</p>
        <div class="prompt"><span class="who">Você</span>Agachamento 5x5 com 80, última série puxada. Depois leg press 3x12 com 140.</div>
        <p>O assistente faz a estruturação. Você nunca abre um formulário. Se errou algo, corrige falando.</p>`,
      },
      {
        h2: "Além da memória: gráficos, recordes, programa",
        html: `        <p>Tudo o que o assistente registra aparece num app web feito para o celular: mapa muscular do volume da semana, gráficos de progressão por exercício, recordes pessoais, métricas corporais, o seu programa atual e o progresso rumo à meta.</p>
        <p>Chat é uma boa interface para escrever e perguntar, e ruim para olhar uma tendência de quatro meses. Uma tela é o contrário. Colocar o assistente na frente de um app de verdade dá os dois.</p>`,
      },
      {
        h2: "O que procurar num registro compatível com IA",
        html: `        <ul>
        <li><strong>O assistente escreve ou só lê?</strong> Uma conexão somente leitura conversa sobre o histórico, mas não registra o treino de hoje.</li>
        <li><strong>Os dados são estruturados?</strong> Notas soltas não sustentam progressão. Exercício, série, repetição e peso precisam ser campos separados.</li>
        <li><strong>Funciona com o assistente que você já paga?</strong> Um app com IA própria é uma segunda assinatura e um segundo lugar onde o seu histórico mora.</li>
        <li><strong>Dá para tirar os seus dados?</strong> A exportação deve ser um clique ou uma frase.</li>
        </ul>`,
      },
    ],
    faq: [
      {
        q: "Funciona no plano gratuito do Claude?",
        a: "Conectores personalizados estão disponíveis no plano gratuito do Claude. Confira as configurações de conector para o seu plano e região.",
      },
      {
        q: "Existe um app de treino grátis que funcione com IA?",
        a: "O AIm é grátis com todos os recursos. No Claude o conector funciona no plano gratuito também. O ChatGPT exige o Developer mode, disponível nos planos pagos.",
      },
      {
        q: "Posso usar no lugar do meu app atual?",
        a: "Pode, e dá para levar o histórico junto: exporte do outro app e peça ao assistente para importar o arquivo.",
      },
      {
        q: "Os meus dados estão seguros?",
        a: "O seu diário fica num armazenamento privado alcançável apenas pelo seu link secreto, com backups diários automáticos. Baixe em Excel ou JSON pelas Ferramentas do app, ou peça a exportação ao assistente no chat.",
      },
    ],
    cta: {
      title: "Dê memória ao seu treinador de IA",
      text: "Grátis, o cadastro leva um minuto. Informe o e-mail, receba um link pessoal, adicione ao Claude como conector.",
    },
  },
  es: {
    title: "Cómo hacer que Claude recuerde tus entrenamientos",
    description:
      "Claude da buenos consejos de entrenamiento, pero olvida tus series y pesos en el siguiente chat. Te explicamos por qué pasa y cómo darle memoria real a tu entrenador de IA.",
    lead: "Claude puede planificar un gran entrenamiento. El problema llega la semana siguiente: un chat nuevo no sabe nada de tus pesos y los consejos vuelven a cero.",
    sections: [
      {
        h2: "Por qué Claude olvida tu entrenamiento",
        html: `        <p>Cada chat es una conversación separada. Al cerrarla, las series, los pesos y las notas se quedan dentro. La siguiente conversación empieza en blanco.</p>
        <p>Las funciones de memoria integradas ayudan con datos generales sobre ti, pero guardan notas cortas, no datos estructurados de entrenamiento. Un entrenador necesita números exactos: qué ejercicio, qué día, cuántas repeticiones y con qué peso. Una nota tipo <strong>el usuario va al gimnasio</strong> no sirve para construir progresión.</p>`,
      },
      {
        h2: "Lo que la gente prueba primero",
        html: `        <ul>
        <li><strong>Pegar el historial en cada chat.</strong> Funciona una semana, luego el texto crece, consume el contexto y queda desactualizado.</li>
        <li><strong>Llevar una hoja de cálculo.</strong> Ahora llevas dos sistemas a mano y el asistente sigue sin poder escribir en la hoja.</li>
        <li><strong>Proyectos con archivos adjuntos.</strong> Mejor, pero el archivo no se actualiza solo después de cada sesión, y no hay gráficos ni récords.</li>
        </ul>`,
      },
      {
        h2: "La solución real: darle a Claude un lugar donde guardar tus entrenamientos",
        html: `        <p>Claude admite conectores basados en MCP, un protocolo abierto que permite al asistente usar herramientas externas. AIm es un conector de almacenamiento de entrenamientos: le da a Claude herramientas para escribir y leer tu diario, guardado en un almacenamiento privado al que solo se accede con tu enlace.</p>
        <p>Después de conectarlo, solo hablas. Claude registra cada sesión a través del conector y cualquier chat futuro puede leer todo el historial.</p>`,
      },
      {
        h2: "Cómo se ve en la práctica",
        html: `        <div class="prompt"><span class="who">Tú</span>Press de banca 4x12 con 24 kg, luego remo 3x10 con 30. Peso corporal 92.9 hoy.</div>
        <p>Claude guarda la sesión: ejercicios, series, pesos, peso corporal. Una semana después, en un chat totalmente nuevo:</p>
        <div class="prompt"><span class="who">Tú</span>¿Cuánto levanté en banca la última vez y qué pruebo hoy?</div>
        <p>Claude lee tu historial a través del conector y responde con tus números reales. Los errores se corrigen igual:</p>
        <div class="prompt"><span class="who">Tú</span>En la tercera serie fueron 10 repeticiones, no 12.</div>`,
      },
      {
        h2: "Más que memoria: gráficos, récords, un programa",
        html: `        <p>Todo lo que Claude registra aparece en una aplicación web móvil: un mapa muscular con tu volumen semanal, gráficos de progresión por ejercicio, récords personales, métricas corporales, tu programa actual y el progreso hacia el objetivo que fijaste con el entrenador. Tú hablas con el asistente y la app conserva el panorama completo.</p>
        <p>AIm funciona en español, inglés, portugués, ruso y francés.</p>`,
      },
    ],
    faq: [
      {
        q: "¿Funciona con el plan gratuito de Claude?",
        a: "Los conectores personalizados están disponibles en el plan gratuito de Claude. Revisa la configuración de conectores según tu plan y región.",
      },
      {
        q: "¿Mis datos están seguros?",
        a: "Tu diario vive en un almacenamiento personal accesible solo con tu enlace secreto, con copias de seguridad automáticas diarias. Descárgalo en JSON desde Herramientas en la app, o pídeselo al asistente en el chat.",
      },
    ],
    cta: {
      title: "Dale memoria a tu entrenador de IA",
      text: "Gratis, crear tu cuenta toma un minuto. Escribe tu correo, recibe un enlace personal y añádelo a Claude como conector.",
    },
  },

  fr: {
    title: "Comment faire en sorte que Claude retienne vos entraînements",
    description:
      "Claude donne de bons conseils d'entraînement, mais oublie vos séries et vos charges au chat suivant. Voici pourquoi et comment donner une vraie mémoire à votre coach IA.",
    lead: "Claude sait construire une bonne séance. Le problème arrive la semaine suivante : un nouveau chat ignore tout de vos charges et les conseils repartent de zéro.",
    sections: [
      {
        h2: "Pourquoi Claude oublie vos séances",
        html: `        <p>Chaque chat est une conversation séparée. Une fois la conversation fermée, les séries, les charges et les notes y restent. La conversation suivante démarre de zéro.</p>
        <p>Les fonctions de mémoire intégrées aident pour des faits généraux, mais elles stockent des notes courtes, pas des données d'entraînement structurées. Un coach a besoin de chiffres exacts : quel exercice, quel jour, combien de répétitions, à quelle charge. Une note du type <strong>l'utilisateur va à la salle</strong> ne permet pas de construire une progression.</p>`,
      },
      {
        h2: "Ce que l'on essaie en premier",
        html: `        <ul>
        <li><strong>Coller l'historique dans chaque chat.</strong> Ça marche une semaine, puis le pavé grossit, consomme le contexte et se périme.</li>
        <li><strong>Tenir un tableur.</strong> Vous entretenez alors deux systèmes à la main, et l'assistant ne peut toujours pas y écrire.</li>
        <li><strong>Des projets avec fichiers joints.</strong> Mieux, mais le fichier ne se met pas à jour tout seul après chaque séance, et il n'y a ni graphiques ni records.</li>
        </ul>`,
      },
      {
        h2: "La vraie solution : donner à Claude un endroit où stocker",
        html: `        <p>Claude prend en charge les connecteurs basés sur MCP, un protocole ouvert qui permet à l'assistant d'utiliser des outils externes. AIm est un connecteur de stockage d'entraînements : il donne à Claude des outils pour écrire et lire votre journal, conservé dans un espace privé accessible uniquement via votre lien.</p>
        <p>Une fois le connecteur ajouté, vous parlez, c'est tout. Claude enregistre chaque séance via le connecteur, et chaque futur chat peut relire tout l'historique.</p>`,
      },
      {
        h2: "À quoi ça ressemble en pratique",
        html: `        <div class="prompt"><span class="who">Vous</span>Développé couché 4x12 à 24 kg, puis rowing 3x10 à 30. Poids du corps 92,9 aujourd'hui.</div>
        <p>Claude enregistre la séance : exercices, séries, charges, poids du corps. Une semaine plus tard, dans un chat tout neuf :</p>
        <div class="prompt"><span class="who">Vous</span>Combien j'ai poussé au couché la dernière fois, et je tente quoi aujourd'hui ?</div>
        <p>Claude lit votre historique via le connecteur et répond avec vos vrais chiffres. Les erreurs se corrigent pareil :</p>
        <div class="prompt"><span class="who">Vous</span>La troisième série, c'était 10 répétitions, pas 12.</div>`,
      },
      {
        h2: "Au-delà de la mémoire : graphiques, records, programme",
        html: `        <p>Tout ce que Claude enregistre apparaît dans une application web mobile : carte musculaire du volume hebdomadaire, graphiques de progression par exercice, records personnels, mesures corporelles, programme en cours et progression vers l'objectif fixé avec le coach. Vous parlez à l'assistant, l'application garde la vue d'ensemble.</p>
        <p>AIm fonctionne en français, anglais, portugais, russe et espagnol.</p>`,
      },
    ],
    faq: [
      {
        q: "Ça marche avec le plan gratuit de Claude ?",
        a: "Les connecteurs personnalisés sont disponibles sur le plan gratuit de Claude. Vérifiez les réglages des connecteurs selon votre plan et votre région.",
      },
      {
        q: "Mes données sont-elles en sécurité ?",
        a: "Votre journal est conservé dans un espace de stockage personnel accessible uniquement via votre lien secret, avec des sauvegardes automatiques quotidiennes. Téléchargez-le en JSON depuis Outils dans l'application, ou demandez à votre assistant dans le chat.",
      },
    ],
    cta: {
      title: "Donnez de la mémoire à votre coach IA",
      text: "Gratuit, inscription en une minute. Entrez votre email, recevez un lien personnel et ajoutez-le à Claude comme connecteur.",
    },
  },
};
