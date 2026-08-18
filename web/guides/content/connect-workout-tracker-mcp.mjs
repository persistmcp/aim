// TODO when the public persistmcp GitHub repo lands (docs/DISTRIBUTION_PLAN.md), link it from
// the EN sections "Where AIm fits next to the bridges" / "Other MCP clients".
// Guide: what MCP is and how to connect a workout tracker to Claude. RU is the source
// copy; en/es/fr are translations. Copy rules: no em dashes, honest claims, prompts first.

export default {
  slug: "connect-workout-tracker-mcp",

  en: {
    title:
      "Garmin MCP, Apple Health MCP and Strava: connect a workout tracker to Claude or ChatGPT",
    description:
      "Which MCP servers exist today for Garmin, Apple Health, Strava and Hevy, official and community, plus a step-by-step way to connect a writable workout log to Claude or ChatGPT.",
    lead: "MCP is the reason your AI chat can suddenly do things: read your training log, write to it, fix a set. Here is what it is, what actually exists today for Garmin, Apple Health and Strava, and how to connect a tracker to Claude or ChatGPT in a few minutes.",
    sections: [
      {
        h2: "MCP in plain words",
        html: `        <p>MCP, the Model Context Protocol, is an open standard that lets AI assistants use external services as tools. A connector is a service speaking MCP: you add its address in the assistant settings, and the assistant gains new abilities in every chat.</p>
        <p>Without a connector, a chat can only talk. With a workout connector, it can store your bench press session, read last week back and compute your progress.</p>`,
      },
      {
        h2: "Garmin MCP",
        html: `        <p>There is no official Garmin MCP server today. What exists is a healthy set of open source servers built by individual developers that read Garmin Connect data, which you run yourself and point at your own account. They work, and several are actively maintained, but they assume you are comfortable cloning a repository and handling your own API keys. The same landscape applies to Whoop and Hevy: community servers, no official connector.</p>
        <p>If you want to try one, two examples people actually use are <a href="https://github.com/taxuspt/garmin_mcp" rel="noopener">taxuspt/garmin_mcp</a> and <a href="https://github.com/eddmann/garmin-connect-mcp" rel="noopener">eddmann/garmin-connect-mcp</a>. These are independent projects, not ours: read how each one handles your Garmin login before you hand it over.</p>`,
      },
      {
        h2: "Apple Health MCP",
        html: `        <p>Apple does not publish a connector either. The available options are community built MCP servers that read an Apple Health export from your own machine, so nothing reaches an assistant unless you set that up yourself. Practical today, but it is a bridge you run, not a service you sign into. One example worth starting from is <a href="https://github.com/neiltron/apple-health-mcp" rel="noopener">neiltron/apple-health-mcp</a>, which queries an Apple Health export with natural language; several similar projects exist. Your health data stays on your machine until you choose to connect it.</p>`,
      },
      {
        h2: "Strava MCP",
        html: `        <p>Strava is the exception: it has shipped its own official connector for Claude, available to Strava subscribers. Today it is read only. The assistant can look at your activities and talk about them, but it cannot write anything back.</p>`,
      },
      {
        h2: "Where AIm fits next to the bridges",
        html: `        <p><strong>AIm is a different layer,</strong> and it is worth being clear about the difference. It is not a bridge to your watch. It is the place your training actually lives: <a href="/guides/en/claude-remember-workouts/">a private log the assistant can write to as well as read</a>, plus the coaching context, the program and the progress charts on top of it. A read-only bridge lets your assistant discuss last Sunday's run. A writable log lets it plan next week and record what you did.</p>
        <p>The two combine well. Nothing stops you connecting a Garmin or Strava server for your cardio data and AIm for your training log and coaching, in the same assistant. And if you already have history somewhere else, you can hand the assistant a CSV or a text export and ask it to import:</p>
        <div class="prompt"><span class="who">You</span>Here is my workout export from the last six months. Import it into my log.</div>`,
      },
      {
        h2: "What a workout connector adds to your assistant",
        html: `        <ul>
        <li>Log a full session from a plain sentence: exercises, sets, weights, cardio, body weight.</li>
        <li>Fix any single set later: reps, weight, a note.</li>
        <li>Read history back: last workout, per exercise progress, records.</li>
        <li>Coaching: goal setting, a program that fits your equipment, weekly reviews.</li>
        </ul>`,
      },
      {
        h2: "Connect to Claude, step by step",
        html: `        <ol>
        <li>Sign up on <a href="/">the AIm landing page</a> with your email. No password needed; a magic link arrives in your inbox.</li>
        <li>The email contains two personal links: one opens the app, the other is the connector address ending in <strong>/mcp</strong>.</li>
        <li>In Claude: Settings, then Connectors, then Add custom connector. Paste the /mcp address from the email.</li>
        <li>Open a new chat. The workout tools are now available in the mobile apps and on the web, including on the free plan.</li>
        </ol>
        <p>First message to try:</p>
        <div class="prompt"><span class="who">You</span>Check my workout tracker and help me plan the next session.</div>`,
      },
      {
        h2: "Connect to ChatGPT, step by step",
        html: `        <p>ChatGPT can connect to the same address, through its Developer mode. It takes a couple more steps than Claude, and Developer mode is only available on paid ChatGPT accounts (Pro, Plus, Business, Enterprise and Education), so Claude stays the simpler option if you have a choice: its custom connectors work on the free plan.</p>
        <ol>
        <li>Open the profile menu (bottom left) and choose Settings.</li>
        <li>Go to Security and login and turn on Developer mode. ChatGPT shows a red "elevated risk" warning here: that is standard for any custom connector, not specific to AIm.</li>
        <li>In the left menu, open Plugins, then click the plus button next to Search plugins.</li>
        <li>Type a name, for example Aim, paste the /mcp address from the email into Server URL, leave Authentication as No Auth, accept the risk notice and click Create.</li>
        <li>Reload the page. Open a chat, press plus next to the message box, and make sure Aim is turned on.</li>
        </ol>
        <img src="/instructions/chatgpt/01.png" alt="Open Settings from the profile menu" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/02.png" alt="Turn on Developer mode" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/03.png" alt="Open Plugins" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/04.png" alt="Add a new plugin" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/05.png" alt="Fill in the plugin form" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/06.png" alt="Confirm the plugin is on after reload" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />`,
      },
      {
        h2: "Keep your link private",
        html: `        <p>Your personal link contains a secret key: whoever has it can read and write your journal. Do not publish it, do not share screenshots with the full address. If a link leaks, write to <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a> and the key will be rotated.</p>`,
      },
      {
        h2: "If the tools do not show up",
        html: `        <ul>
        <li>Check the address ends with <strong>/mcp</strong> and comes from the latest email. Old links stop working after the key is rotated.</li>
        <li>Start a new chat: an existing conversation keeps the old connector state.</li>
        <li>Reload the page or restart the app after adding the connector.</li>
        <li>Open the Connect screen in the AIm app: it shows a live status card that reads "waiting for your first message" until the assistant actually calls a tool, then switches to connected. Say something to your assistant to trigger it, no page reload needed.</li>
        </ul>`,
      },
      {
        h2: "Other MCP clients",
        html: `        <p>Claude is the primary client, but AIm speaks standard MCP, so any MCP-compatible client can connect the same way. AIm is also listed on <a href="https://smithery.ai/servers/aim-journal/aim">Smithery</a>: <a href="https://smithery.ai/servers/aim-journal/aim"><img src="https://smithery.ai/badge/aim-journal/aim" alt="AIm on Smithery" width="200" height="20" style="vertical-align:middle" /></a></p>`,
      },
    ],
    faq: [
      {
        q: "Is MCP safe to use?",
        a: "MCP itself is an open protocol backed by major AI vendors. The practical question is the connector: AIm scopes all data to your personal secret link and keeps it in private storage with daily backups.",
      },
      {
        q: "What data does the assistant see?",
        a: "Only your own training data: sessions, exercises, goals, body metrics. Every request is scoped by your personal key, there is no shared or public data.",
      },
      {
        q: "Can I disconnect later?",
        a: "Yes. Remove the connector in the assistant settings at any moment. Your data is not deleted: download it as JSON from Tools in the app, or ask the assistant to export it into the chat.",
      },
      {
        q: "Is there a Garmin MCP server?",
        a: "Not an official one from Garmin. There are several open source MCP servers from independent developers that read Garmin Connect data; you run one yourself and point it at your account. AIm is a separate writable layer for your own training log, and the two can sit in the same assistant.",
      },
      {
        q: "Is there a Strava MCP server?",
        a: "Yes, and it is the official one: Strava has shipped its own connector for Claude. It is read only, so the assistant can see and discuss your activities but cannot write anything back. For a writable training log next to it, that is the layer AIm covers.",
      },
      {
        q: "Can ChatGPT or Claude read my Apple Health data?",
        a: "Only through a connector you set up. Apple does not publish one, so the available options are community built MCP servers that read an Apple Health export from your own machine. Nothing reaches an assistant unless you connect it yourself.",
      },
      {
        q: "Does AIm import my history from another app?",
        a: "Yes. Export your history from the other app and hand the file to the assistant, asking it to import. It reads the sessions and writes them into your log with their original dates.",
      },
    ],
    cta: {
      title: "Try it with your own tracker",
      text: "Free, signup takes a minute. Enter your email and connect your personal workout tracker to Claude.",
    },
  },

  ru: {
    title: "Что такое MCP и как подключить трекер тренировок к Claude",
    description:
      "MCP простыми словами и пошаговая инструкция: как подключить трекер тренировок к Claude как кастомный коннектор, плюс разбор типичных проблем.",
    lead: "MCP это то, благодаря чему ваш AI чат умеет не только говорить, но и действовать: читать дневник тренировок, писать в него, исправлять подход. Разбираем, что это и как подключить за несколько минут.",
    sections: [
      {
        h2: "MCP простыми словами",
        html: `        <p>MCP, Model Context Protocol, это открытый стандарт, который позволяет AI ассистентам пользоваться внешними сервисами как инструментами. Коннектор это сервис, говорящий на MCP: вы добавляете его адрес в настройках ассистента, и у ассистента появляются новые возможности в каждом чате.</p>
        <p>Без коннектора чат умеет только разговаривать. С коннектором тренировок он может сохранить тренировку с жимом, прочитать прошлую неделю и посчитать прогресс.</p>`,
      },
      {
        h2: "Что коннектор тренировок даёт ассистенту",
        html: `        <ul>
        <li>Записать целую сессию по одной обычной фразе: упражнения, подходы, веса, кардио, вес тела.</li>
        <li>Исправить любой отдельный подход позже: повторы, вес, заметку.</li>
        <li>Прочитать историю: прошлая тренировка, прогресс по упражнению, рекорды.</li>
        <li>Тренерство: постановка цели, программа под ваше оборудование, разбор недели.</li>
        </ul>`,
      },
      {
        h2: "Подключение к Claude по шагам",
        html: `        <ol>
        <li>Зарегистрируйтесь на <a href="/ru/">лендинге AIm</a>, указав почту. Пароля нет: на почту придёт ссылка для входа.</li>
        <li>В письме две личные ссылки: приложение и адрес коннектора, который заканчивается на <strong>/mcp</strong>.</li>
        <li>В Claude: Settings, затем Connectors, затем Add custom connector. Вставьте адрес /mcp из письма.</li>
        <li>Откройте новый чат. Инструменты тренировок уже доступны в приложениях на телефоне и в вебе, в том числе на бесплатном тарифе.</li>
        </ol>
        <p>Первое сообщение для проверки:</p>
        <div class="prompt"><span class="who">Вы</span>Загляни в мой трекер тренировок и помоги спланировать следующую сессию.</div>`,
      },
      {
        h2: "Подключение к ChatGPT по шагам",
        html: `        <p>ChatGPT тоже умеет подключаться на тот же адрес, через режим разработчика. Это на пару шагов сложнее, чем в Claude, и режим разработчика доступен только на платных тарифах ChatGPT (Pro, Plus, Business, Enterprise, Education), так что Claude остаётся более простым вариантом, если есть выбор: кастомные коннекторы там работают и на бесплатном тарифе.</p>
        <ol>
        <li>Откройте меню профиля (внизу слева) и выберите Settings.</li>
        <li>Перейдите в Security and login и включите Developer mode. ChatGPT покажет красное предупреждение «elevated risk»: это стандартное поведение для любого стороннего коннектора, не что-то специфичное для AIm.</li>
        <li>В левом меню откройте Plugins, затем нажмите кнопку плюс рядом с Search plugins.</li>
        <li>Впишите название, например Aim, вставьте адрес /mcp из письма в поле Server URL, оставьте Authentication как No Auth, примите предупреждение о риске и нажмите Create.</li>
        <li>Перезагрузите страницу. Откройте чат, нажмите плюс рядом с полем сообщения и убедитесь, что Aim включён.</li>
        </ol>
        <img src="/instructions/chatgpt/01.png" alt="Открыть Settings из меню профиля" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/02.png" alt="Включить Developer mode" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/03.png" alt="Открыть Plugins" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/04.png" alt="Добавить новый плагин" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/05.png" alt="Заполнить форму плагина" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/06.png" alt="Подтвердить, что плагин включён после перезагрузки" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />`,
      },
      {
        h2: "Держите ссылку в секрете",
        html: `        <p>Личная ссылка содержит секретный ключ: кто владеет ею, тот может читать ваш дневник и писать в него. Не публикуйте её и не делитесь скриншотами с полным адресом. Если ссылка утекла, напишите на <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a>, ключ заменят.</p>`,
      },
      {
        h2: "Если инструменты не появились",
        html: `        <ul>
        <li>Проверьте, что адрес заканчивается на <strong>/mcp</strong> и взят из последнего письма. Старые ссылки перестают работать после замены ключа.</li>
        <li>Начните новый чат: открытый разговор держит старое состояние коннектора.</li>
        <li>Перезагрузите страницу или перезапустите приложение после добавления коннектора.</li>
        <li>Откройте экран подключения в приложении AIm. Там живой статус: сначала «ждём первое сообщение», а после первого вызова инструмента «подключено». Скажите что-нибудь ассистенту, чтобы проверить, перезагружать страницу не нужно.</li>
        </ul>`,
      },
      {
        h2: "Другие MCP-клиенты",
        html: `        <p>Claude основной клиент, но AIm говорит на стандартном MCP, так что подключить можно любой MCP-совместимый клиент тем же способом. AIm также есть в каталоге <a href="https://smithery.ai/servers/aim-journal/aim">Smithery</a>: <a href="https://smithery.ai/servers/aim-journal/aim"><img src="https://smithery.ai/badge/aim-journal/aim" alt="AIm в Smithery" width="200" height="20" style="vertical-align:middle" /></a></p>`,
      },
    ],
    faq: [
      {
        q: "MCP это безопасно?",
        a: "Сам MCP это открытый протокол, который поддерживают крупные AI разработчики. Практический вопрос всегда к коннектору: AIm ограничивает все данные вашей личной секретной ссылкой и хранит их в базе, где каждая запись привязана только к вашему аккаунту, с ежедневными резервными копиями.",
      },
      {
        q: "Какие данные видит ассистент?",
        a: "Только ваши тренировочные данные: сессии, упражнения, цели, замеры тела. Каждый запрос ограничен вашим личным ключом, общих или публичных данных нет.",
      },
      {
        q: "Можно потом отключить?",
        a: "Да. Удалите коннектор в настройках ассистента в любой момент. Данные остаются в вашем хранилище: скачайте их в формате Excel или JSON в разделе Инструменты приложения или попросите ассистента вывести историю прямо в чат.",
      },
    ],
    cta: {
      title: "Попробуйте со своим трекером",
      text: "Бесплатно, регистрация за минуту. Введите почту и подключите личный трекер тренировок к Claude.",
    },
  },

  pt: {
    title:
      "Conectar um registro de treinos ao Claude ou ChatGPT: MCP, Garmin, Strava e Apple Health",
    description:
      "Como conectores MCP permitem que uma IA leia os seus dados de treino, o que existe hoje para Garmin, Strava, Apple Health e Hevy, e a configuração passo a passo.",
    lead: "Um conector liga o seu assistente ao seu diário de treinos. Aqui está o que é o MCP, o que existe para cada aparelho e como configurar em alguns minutos.",
    sections: [
      {
        h2: "MCP em palavras simples",
        html: `        <p>MCP é um protocolo aberto que permite a assistentes de IA usarem ferramentas externas. Em vez de o assistente apenas conversar, ele ganha um conjunto de ações: registrar um treino, ler o histórico, calcular estatísticas.</p>
        <p>Na prática você cola um endereço nas configurações do assistente e ele passa a ter essas ações. O endereço contém uma chave secreta que aponta para os seus dados e só para eles.</p>`,
      },
      {
        h2: "O que um conector de treino acrescenta",
        html: `        <p>Sem conector, o assistente sabe apenas o que está na conversa atual. Com conector, ele escreve o treino de hoje e lê tudo o que você já fez, então a resposta sobre qual carga usar vem dos seus números e não de uma média.</p>`,
      },
      {
        h2: "Conectar ao Claude, passo a passo",
        html: `        <ol>
        <li>Cadastre-se na <a href="/pt/">página do AIm</a> com o seu e-mail. Sem senha: um link mágico chega na sua caixa de entrada.</li>
        <li>Abra o link e copie o endereço de conexão em Ferramentas.</li>
        <li>No Claude: Settings → Connectors → Add custom connector.</li>
        <li>Dê um nome, cole o endereço, confirme.</li>
        <li>Em Tool permissions escolha Always allow para não confirmar cada registro.</li>
        </ol>`,
      },
      {
        h2: "Conectar ao ChatGPT, passo a passo",
        html: `        <ol>
        <li>Settings → Security and login → ative o Developer mode.</li>
        <li>Settings → Plugins → o botão de mais ao lado de Search plugins.</li>
        <li>Dê um nome, cole o endereço em Server URL, deixe Authentication como No Auth, aceite o aviso e crie.</li>
        <li>Recarregue a página, abra um chat e confira se o conector aparece no botão de mais ao lado do campo de mensagem.</li>
        </ol>
        <p>O ChatGPT exige o Developer mode, disponível nas contas Pro, Plus, Business, Enterprise e Education. O plano gratuito não consegue adicionar um conector personalizado hoje.</p>`,
      },
      {
        h2: "E quanto a Garmin, Strava, Apple Health e Hevy?",
        html: `        <p>Essa é a pergunta mais comum, então segue o cenário honesto.</p>
        <p><strong>Strava</strong> lançou o próprio conector oficial para o Claude, disponível para assinantes do Strava. Ele é somente leitura: o assistente vê as suas atividades e conversa sobre elas, mas não escreve nada de volta.</p>
        <p><strong>Garmin, Apple Health, Whoop e Hevy</strong> não têm conector oficial. O que existe é um bom punhado de servidores MCP de código aberto feitos por desenvolvedores independentes, que você mesmo roda apontando para a sua conta ou para o seu export. Funcionam, e vários são mantidos ativamente, mas assumem que você se sente confortável clonando um repositório e cuidando das suas chaves de API.</p>
        <p><strong>O AIm é outra camada.</strong> Ele não é uma ponte para o seu relógio. É o lugar onde o seu treino realmente vive: um diário privado no qual o assistente escreve além de ler, com o contexto de treinador, o programa e os gráficos em cima. Uma ponte somente leitura deixa o assistente comentar a corrida de domingo. Um diário com escrita deixa ele planejar a próxima semana.</p>
        <p>Os dois combinam bem, e se você já tem histórico em outro lugar, entregue o arquivo ao assistente:</p>
        <div class="prompt"><span class="who">Você</span>Aqui está o export dos meus treinos dos últimos seis meses. Importa para o meu diário.</div>`,
      },
      {
        h2: "Mantenha o seu link privado",
        html: `        <p>O endereço contém a sua chave. Quem tiver o link lê e escreve o seu diário, então trate como senha. Se vazar, escreva para <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a> e trocaremos a chave.</p>`,
      },
      {
        h2: "Se as ferramentas não aparecerem",
        html: `        <ul>
        <li>Confira se colou o endereço inteiro, incluindo o final.</li>
        <li>No ChatGPT, recarregue a página depois de adicionar: ele não mostra o conector até o recarregamento.</li>
        <li>Diga algo ao assistente para disparar uma chamada; alguns clientes só mostram a conexão como ativa depois da primeira ferramenta usada.</li>
        </ul>`,
      },
    ],
    faq: [
      {
        q: "O MCP é seguro de usar?",
        a: "O MCP em si é um protocolo aberto apoiado pelos principais fornecedores de IA. A questão prática é o conector: o AIm limita todos os dados ao seu link secreto pessoal e os mantém em armazenamento privado com backups diários.",
      },
      {
        q: "Quais dados o assistente vê?",
        a: "Apenas os seus dados de treino: sessões, exercícios, metas, métricas corporais. Cada requisição é limitada pela sua chave pessoal, não existe dado compartilhado ou público.",
      },
      {
        q: "Existe um servidor MCP para Garmin?",
        a: "Não um oficial da Garmin. Existem vários servidores MCP de código aberto feitos por desenvolvedores independentes que leem dados do Garmin Connect e que você mesmo roda. O AIm é uma camada separada: guarda o seu diário e o contexto de treinador em vez de fazer ponte com o relógio.",
      },
      {
        q: "O AIm importa o meu histórico de outro app?",
        a: "Sim. Exporte o histórico do outro app e entregue o arquivo ao assistente pedindo a importação. Ele lê as sessões e grava no seu diário com as datas originais.",
      },
    ],
    cta: {
      title: "Conecte em alguns minutos",
      text: "Informe o e-mail, receba o seu endereço pessoal e cole no assistente. Grátis.",
    },
  },
  es: {
    title: "Qué es MCP y cómo conectar un registro de entrenamientos a Claude",
    description:
      "MCP explicado en palabras simples, más una guía paso a paso para conectar un registro de entrenamientos a Claude como conector personalizado, con solución de problemas.",
    lead: "MCP es la razón por la que tu chat de IA de pronto puede hacer cosas: leer tu diario de entrenamiento, escribir en él, corregir una serie. Te explicamos qué es y cómo conectarlo en pocos minutos.",
    sections: [
      {
        h2: "MCP en palabras simples",
        html: `        <p>MCP, el Model Context Protocol, es un estándar abierto que permite a los asistentes de IA usar servicios externos como herramientas. Un conector es un servicio que habla MCP: añades su dirección en la configuración del asistente y este gana nuevas capacidades en cada chat.</p>
        <p>Sin conector, un chat solo puede conversar. Con un conector de entrenamientos puede guardar tu sesión de press de banca, repasar lo que hiciste la semana pasada y calcular tu progreso.</p>`,
      },
      {
        h2: "Qué añade un conector de entrenamientos a tu asistente",
        html: `        <ul>
        <li>Registrar una sesión completa a partir de una frase normal: ejercicios, series, pesos, cardio, peso corporal.</li>
        <li>Corregir cualquier serie después: repeticiones, peso, una nota.</li>
        <li>Leer el historial: último entrenamiento, progreso por ejercicio, récords.</li>
        <li>Entrenamiento guiado: objetivos, un programa según tu equipo, revisiones semanales.</li>
        </ul>`,
      },
      {
        h2: "Conectar a Claude, paso a paso",
        html: `        <ol>
        <li>Regístrate en <a href="/es/">la página de AIm</a> con tu correo. Sin contraseña, llega un enlace mágico al correo.</li>
        <li>El correo contiene dos enlaces personales: la aplicación y la dirección del conector, que termina en <strong>/mcp</strong>.</li>
        <li>En Claude: Settings, luego Connectors, luego Add custom connector. Pega la dirección /mcp del correo.</li>
        <li>Abre un chat nuevo. Las herramientas de entrenamiento ya están disponibles en las apps del teléfono y en la web, incluso en el plan gratuito.</li>
        </ol>
        <p>Primer mensaje para probar:</p>
        <div class="prompt"><span class="who">Tú</span>Mira mi registro de entrenamientos y ayúdame a planificar la próxima sesión.</div>`,
      },
      {
        h2: "Conectar a ChatGPT, paso a paso",
        html: `        <p>ChatGPT también puede conectarse a la misma dirección, mediante su modo desarrollador. Requiere un par de pasos más que Claude, y el modo desarrollador solo está disponible en las cuentas de pago de ChatGPT (Pro, Plus, Business, Enterprise y Education), así que Claude sigue siendo la opción más simple si puedes elegir: sus conectores personalizados funcionan incluso en el plan gratuito.</p>
        <ol>
        <li>Abre el menú de perfil (abajo a la izquierda) y elige Settings.</li>
        <li>Ve a Security and login y activa Developer mode. ChatGPT muestra una advertencia roja de «elevated risk»: es normal para cualquier conector personalizado, no algo específico de AIm.</li>
        <li>En el menú izquierdo, abre Plugins, luego pulsa el botón de más (+) junto a Search plugins.</li>
        <li>Escribe un nombre, por ejemplo Aim, pega la dirección /mcp del correo en Server URL, deja Authentication como No Auth, acepta el aviso de riesgo y pulsa Create.</li>
        <li>Recarga la página. Abre un chat, pulsa el + junto al campo de mensaje y comprueba que AIm está activado.</li>
        </ol>
        <img src="/instructions/chatgpt/01.png" alt="Abrir Settings desde el menú de perfil" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/02.png" alt="Activar Developer mode" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/03.png" alt="Abrir Plugins" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/04.png" alt="Añadir un nuevo plugin" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/05.png" alt="Rellenar el formulario del plugin" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/06.png" alt="Confirmar que el plugin está activo tras recargar" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />`,
      },
      {
        h2: "Mantén tu enlace en secreto",
        html: `        <p>Tu enlace personal contiene una clave secreta: quien lo tenga puede leer y escribir tu diario. No lo publiques ni compartas capturas con la dirección completa. Si el enlace se filtra, escribe a <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a> y rotaremos la clave.</p>`,
      },
      {
        h2: "Si las herramientas no aparecen",
        html: `        <ul>
        <li>Comprueba que la dirección termina en <strong>/mcp</strong> y proviene del último correo. Los enlaces viejos dejan de funcionar cuando se rota la clave.</li>
        <li>Empieza un chat nuevo: una conversación abierta conserva el estado antiguo del conector.</li>
        <li>Recarga la página o reinicia la app después de añadir el conector.</li>
        <li>Abre la pantalla de conexión en la app de AIm: muestra el estado en vivo: primero esperando tu primer mensaje y, en cuanto el asistente llama a una herramienta, conectado. Dile algo a tu asistente para probarlo, no hace falta recargar la página.</li>
        </ul>`,
      },
      {
        h2: "Otros clientes MCP",
        html: `        <p>Claude es el cliente principal, pero AIm habla MCP estándar, así que cualquier cliente compatible con MCP puede conectarse igual. AIm también está en <a href="https://smithery.ai/servers/aim-journal/aim">Smithery</a>: <a href="https://smithery.ai/servers/aim-journal/aim"><img src="https://smithery.ai/badge/aim-journal/aim" alt="AIm en Smithery" width="200" height="20" style="vertical-align:middle" /></a></p>`,
      },
    ],
    faq: [
      {
        q: "¿Es seguro usar MCP?",
        a: "MCP es un protocolo abierto respaldado por los principales proveedores de IA. En la práctica, lo que importa es el conector: AIm limita todos los datos a tu enlace secreto personal y los guarda en un almacenamiento privado con copias de seguridad diarias.",
      },
      {
        q: "¿Qué datos ve el asistente?",
        a: "Solo tus datos de entrenamiento: sesiones, ejercicios, objetivos, métricas corporales. Cada solicitud está limitada por tu clave personal, no hay datos compartidos ni públicos.",
      },
      {
        q: "¿Puedo desconectarlo después?",
        a: "Sí. Elimina el conector en la configuración del asistente cuando quieras. Tus datos permanecen en tu almacenamiento: descárgalos en JSON desde Herramientas en la app, o pídeselo a tu asistente en el chat.",
      },
    ],
    cta: {
      title: "Pruébalo con tu propio registro",
      text: "Gratis, crear tu cuenta toma un minuto. Escribe tu correo y conecta tu almacenamiento personal de entrenamientos a Claude.",
    },
  },

  fr: {
    title: "Qu'est-ce que MCP et comment connecter un journal d'entraînement à Claude",
    description:
      "MCP expliqué simplement, avec un guide pas à pas pour connecter un journal d'entraînement à Claude comme connecteur personnalisé, et le dépannage des cas courants.",
    lead: "MCP est la raison pour laquelle votre chat IA sait soudain faire des choses : lire votre journal d'entraînement, y écrire, corriger une série. Voici ce que c'est et comment le connecter en quelques minutes.",
    sections: [
      {
        h2: "MCP expliqué simplement",
        html: `        <p>MCP, le Model Context Protocol, est un standard ouvert qui permet aux assistants IA d'utiliser des services externes comme outils. Un connecteur est un service qui parle MCP : vous ajoutez son adresse dans les réglages de l'assistant, et celui-ci gagne de nouvelles capacités dans chaque chat.</p>
        <p>Sans connecteur, un chat ne sait que discuter. Avec un connecteur d'entraînement, il peut enregistrer votre séance de développé couché, relire la semaine passée et calculer votre progression.</p>`,
      },
      {
        h2: "Ce qu'un connecteur d'entraînement ajoute à votre assistant",
        html: `        <ul>
        <li>Enregistrer une séance complète à partir d'une phrase normale : exercices, séries, charges, cardio, poids du corps.</li>
        <li>Corriger n'importe quelle série plus tard : répétitions, charge, une note.</li>
        <li>Relire l'historique : dernière séance, progression par exercice, records.</li>
        <li>Coaching : définition d'objectif, programme adapté à votre matériel, bilans hebdomadaires.</li>
        </ul>`,
      },
      {
        h2: "Connexion à Claude, pas à pas",
        html: `        <ol>
        <li>Inscrivez-vous sur <a href="/fr/">la page d'AIm</a> avec votre email. Pas de mot de passe, un lien magique arrive par mail.</li>
        <li>Le mail contient deux liens personnels : l'application et l'adresse du connecteur, qui se termine par <strong>/mcp</strong>.</li>
        <li>Dans Claude : Settings, puis Connectors, puis Add custom connector. Collez l'adresse /mcp du mail.</li>
        <li>Ouvrez un nouveau chat. Les outils d'entraînement sont disponibles sur les applications mobiles et sur le web, y compris avec le plan gratuit.</li>
        </ol>
        <p>Premier message à essayer :</p>
        <div class="prompt"><span class="who">Vous</span>Regarde mon journal d'entraînement et aide-moi à planifier la prochaine séance.</div>`,
      },
      {
        h2: "Connexion à ChatGPT, pas à pas",
        html: `        <p>ChatGPT peut aussi se connecter à la même adresse, via son mode développeur. Cela prend quelques étapes de plus qu'avec Claude, et le mode développeur n'est disponible que sur les comptes ChatGPT payants (Pro, Plus, Business, Enterprise et Education) : Claude reste donc l'option la plus simple si vous avez le choix, ses connecteurs personnalisés fonctionnent même sur le forfait gratuit.</p>
        <ol>
        <li>Ouvrez le menu de profil (en bas à gauche) et choisissez Settings.</li>
        <li>Allez dans Security and login et activez Developer mode. ChatGPT affiche ici un avertissement rouge « elevated risk » : c'est normal pour tout connecteur personnalisé, rien de spécifique à AIm.</li>
        <li>Dans le menu de gauche, ouvrez Plugins, puis cliquez sur le bouton plus à côté de Search plugins.</li>
        <li>Saisissez un nom, par exemple Aim, collez l'adresse /mcp du mail dans Server URL, laissez Authentication sur No Auth, acceptez l'avertissement de risque et cliquez sur Create.</li>
        <li>Rechargez la page. Ouvrez un chat, cliquez sur le plus à côté du champ de message et vérifiez qu'AIm est activé.</li>
        </ol>
        <img src="/instructions/chatgpt/01.png" alt="Ouvrir Settings depuis le menu de profil" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/02.png" alt="Activer Developer mode" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/03.png" alt="Ouvrir Plugins" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/04.png" alt="Ajouter un nouveau plugin" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/05.png" alt="Remplir le formulaire du plugin" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />
        <img src="/instructions/chatgpt/06.png" alt="Confirmer que le plugin est actif après rechargement" loading="lazy" style="max-width:420px;width:100%;border-radius:12px;border:1px solid var(--border);display:block;margin:10px 0" />`,
      },
      {
        h2: "Gardez votre lien privé",
        html: `        <p>Votre lien personnel contient une clé secrète : quiconque le possède peut lire votre journal et y écrire. Ne le publiez pas, ne partagez pas de captures d'écran avec l'adresse complète. En cas de fuite, écrivez à <a href="mailto:contact@aim-journal.com">contact@aim-journal.com</a> pour faire changer la clé.</p>`,
      },
      {
        h2: "Si les outils n'apparaissent pas",
        html: `        <ul>
        <li>Vérifiez que l'adresse se termine par <strong>/mcp</strong> et vient du dernier mail. Les anciens liens cessent de fonctionner après un changement de clé.</li>
        <li>Ouvrez un nouveau chat : une conversation en cours garde l'ancien état du connecteur.</li>
        <li>Rechargez la page ou relancez l'application après l'ajout du connecteur.</li>
        <li>Ouvrez l'écran de connexion dans l'application AIm : il affiche un statut en direct : « en attente de votre premier message » tant qu'aucun outil n'a été appelé, puis « connecté ». Dites quelque chose à votre assistant pour le tester, pas besoin de recharger la page.</li>
        </ul>`,
      },
      {
        h2: "Autres clients MCP",
        html: `        <p>Claude est le client principal, mais AIm parle le MCP standard, donc tout client compatible MCP peut se connecter de la même façon. AIm est aussi listé sur <a href="https://smithery.ai/servers/aim-journal/aim">Smithery</a> : <a href="https://smithery.ai/servers/aim-journal/aim"><img src="https://smithery.ai/badge/aim-journal/aim" alt="AIm sur Smithery" width="200" height="20" style="vertical-align:middle" /></a></p>`,
      },
    ],
    faq: [
      {
        q: "MCP est-il sûr ?",
        a: "MCP est un protocole ouvert soutenu par les grands acteurs de l'IA. La vraie question porte sur le connecteur : AIm limite toutes les données à votre lien secret personnel et les stocke dans un espace privé, avec des sauvegardes quotidiennes.",
      },
      {
        q: "Quelles données l'assistant voit-il ?",
        a: "Uniquement vos données d'entraînement : séances, exercices, objectifs, mesures corporelles. Chaque requête est limitée par votre clé personnelle, il n'y a aucune donnée partagée ou publique.",
      },
      {
        q: "Puis-je le déconnecter plus tard ?",
        a: "Oui. Supprimez le connecteur dans les réglages de l'assistant à tout moment. Vos données restent dans votre stockage : téléchargez-les en JSON depuis Outils dans l'application, ou demandez à votre assistant dans le chat.",
      },
    ],
    cta: {
      title: "Essayez avec votre propre journal",
      text: "Gratuit, inscription en une minute. Entrez votre email et connectez votre stockage personnel d'entraînements à Claude.",
    },
  },
};
