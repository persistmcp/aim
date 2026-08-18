// Guide: using Claude as a personal trainer. RU is the source copy; en/es/fr are
// translations. Copy rules: no em dashes, no invented social proof, honest claims, prompts first.

export default {
  slug: "ai-personal-trainer",

  en: {
    title: "AI personal trainer: a free coach inside ChatGPT or Claude",
    description:
      "Turn ChatGPT or Claude into a free AI personal trainer: the first interview prompt, a saved workout log, weekly reviews and honest limits. Setup takes three steps.",
    lead: "AIm is a free AI personal trainer that runs inside the assistant you already use. Connect it to Claude or ChatGPT, answer a short interview, and it plans, logs and reviews your training with real memory between chats. Setup takes three steps. This guide walks through them, and is honest about what an AI coach still cannot do.",
    sections: [
      {
        h2: "The prompt to start with",
        html: `        <p>If you came for a copy-paste prompt, here it is. Paste this into ChatGPT or Claude:</p>
        <div class="prompt"><span class="who">You</span>Act as my personal trainer. Interview me about my goal, experience, schedule, equipment and past injuries before you plan anything.</div>
        <p>That one prompt fixes the most common failure, a plan written for the average person instead of you. The failure it cannot fix is memory: next week the chat forgets you existed. The rest of this page is about closing that gap.</p>`,
      },
      {
        h2: "What an AI coach genuinely does well",
        html: `        <p>A language model knows training methodology, explains the why behind a plan without getting annoyed, adapts a plan when your day falls apart and never rolls its eyes at a beginner question. Available at 6 am and at midnight.</p>
        <p>It is also patient with the boring parts. You can ask it to explain progressive overload for the fifth time, to justify why it put rows before curls, or to rebuild tomorrow's session because the squat rack is taken. A human coach charges by the hour and reasonably expects you to remember. An assistant does not care.</p>
        <p>And it is good at translation. Most training advice online is written for someone else: a lifter with a full gym, five free evenings and no history of back pain. An assistant can take a published template and adapt it to three sessions a week, a pair of dumbbells and a knee you do not trust.</p>
        <p>One clarification on words: some products sold as AI personal trainers are hardware, a smart mirror or a camera equipped machine. This page is about software coaching inside a chat assistant, which needs nothing beyond the phone or laptop you already have.</p>`,
      },
      {
        h2: "Is ChatGPT good for workout plans?",
        html: `        <p>For a first plan, yes, with a caveat worth understanding. Both ChatGPT and Claude will produce a sensible, well structured program if you tell them enough about yourself. The methodology in a generated plan is usually reasonable because the underlying material it was trained on is reasonable.</p>
        <p>The caveat is that a plan is the easy half of coaching. The hard half is what happens over the following weeks: noticing that your bench has not moved in three sessions, that you keep skipping Friday, that the weight you called "heavy" last month is now your warm-up. That part needs a record, and a chat window does not keep one.</p>
        <p>So the honest answer is that a chatbot is good at writing programs and bad at running them. The rest of this guide is about closing that gap.</p>`,
      },
      {
        h2: "Where it breaks down",
        html: `        <p>Ask for a program with no context and you get a plan for the average person: generic exercises, guessed weights, no relation to your schedule or your knees. And next week the chat forgets you exist. Two things fix this: context and memory.</p>
        <p>The memory problem is the one people notice second and it is the more annoying of the two. You can paste your history into every conversation, and some people do, but it grows every week and you will eventually stop. The assistant does not need you to repeat yourself. It needs somewhere to read from.</p>`,
      },
      {
        h2: "Step 1: give it your context",
        html: `        <p>A real coach starts with questions, and your assistant should too. Tell it your goal, experience, schedule, equipment and injuries, or ask it to interview you:</p>
        <div class="prompt"><span class="who">You</span>Act as my personal trainer. Interview me about my goal, experience, schedule, equipment and past injuries before you plan anything.</div>
        <p>With AIm connected, this happens on its own: the connector hands the assistant an interview script for new users, and the answers are saved to your coach profile instead of dying with the chat.</p>`,
      },
      {
        h2: "Step 2: give it memory",
        html: `        <p>Progression is the core of training: <a href="/guides/en/progressive-overload/">progressive overload</a> means adding weight, reps or sets based on what you actually did. Without your log, the assistant can only guess. Connect a workout tracker like AIm and every session you describe is written to your private log:</p>
        <div class="prompt"><span class="who">You</span>Squats 5x5 at 80 kg, felt heavy on the last set. Log it.</div>
        <p>Next planning conversation, the assistant reads your real numbers and progresses from them, not from an average.</p>`,
      },
      {
        h2: "Step 3: build a weekly rhythm",
        html: `        <p>Coaching is a loop, not a one-time plan. Three prompts cover it:</p>
        <div class="prompt"><span class="who">You</span>Plan my next workout based on my program and recent sessions.</div>
        <div class="prompt"><span class="who">You</span>Review my week: what went well, what should change?</div>
        <div class="prompt"><span class="who">You</span>Monthly check-in: am I on track for my goal?</div>
        <p>AIm gives the assistant coaching context for each of these tasks, so the assistant follows a consistent methodology instead of improvising every time.</p>`,
      },
      {
        h2: "What it costs",
        html: `        <p>AIm itself is free, with every feature included and no paid tier at the moment. What you do need is a subscription to the assistant you already use, and here the two clients differ.</p>
        <p>In Claude, <a href="/guides/en/connect-workout-tracker-mcp/">custom connectors</a> work on the free plan, so the whole setup can cost nothing. In ChatGPT, connecting a custom MCP server requires Developer mode, which OpenAI documents as available on Pro, Plus, Business, Enterprise and Education accounts. The free ChatGPT tier cannot add one today.</p>
        <p>That is the entire cost picture. There is no per month fee from us and no upsell inside the app.</p>`,
      },
      {
        h2: "Can an AI replace a personal trainer?",
        html: `        <p>Partly, and it is worth being precise about which parts. A personal trainer does at least four separate jobs: they design the program, they correct your technique in the room, they hold you accountable, and they adjust everything as you change.</p>
        <p>An assistant is strong at the first job and at the fourth, provided it can see your history. It is genuinely useful for accountability in a weak sense: it will notice a missed week if it has the data, but it will not phone you. It cannot do the second job at all. Nothing that reads text can tell you your knee is caving on the third rep.</p>
        <p>The realistic framing is not replacement. If you were never going to hire a coach, an assistant with your training history is a large upgrade over improvising. If you have a good coach and a technique problem, keep the coach. Many people end up using both: a human for periodic technique checks, an assistant for the weekly running of the plan.</p>`,
      },
      {
        h2: "An AI coach or a workout app?",
        html: `        <p>A traditional workout tracker is a form: you tap the exercise, the set, the weight. Precise, and a chore. An assistant is the opposite. You describe the session in a sentence and it does the structuring.</p>
        <div class="prompt"><span class="who">You</span>Bench 3x8 at 60, then rows 3x10 at 50, felt easy today.</div>
        <p>The tradeoff is that a chat window alone has no charts, no history and no memory. That is why AIm is both: the assistant is the interface, and the app behind it holds the log, the progress charts and the muscle map. You are not choosing between a coach and an app. You are putting one in front of the other.</p>
        <p>There is also a middle category: dedicated AI trainer apps that run their own model behind their own monthly subscription. Some are good. The tradeoff is that you pay for intelligence twice, once for the app and once for the assistant you already have. AIm takes the other route: no model of its own and no second subscription, it adds memory and coaching structure to the assistant you already pay for, or to Claude on its free plan.</p>
        <p>How that looks day to day is the subject of the <a href="/guides/en/claude-remember-workouts/">workout tracker app guide</a>.</p>`,
      },
      {
        h2: "What an AI coach cannot do",
        html: `        <p>Honest limits: it cannot watch your form the way a coach in the room can, it is not a doctor, and it only knows what you tell it. Sharp pain means a human specialist, not a chatbot. Use the AI for planning, logging and analysis, and keep your own judgment in the gym.</p>
        <p>It will also occasionally be confidently wrong, which is the failure mode worth watching for. If a suggested jump in weight looks unreasonable to you, it probably is. Treat the assistant as a well read training partner rather than an authority, and the arrangement works well.</p>`,
      },
    ],
    faq: [
      {
        q: "What is a good AI personal trainer prompt?",
        a: "Start with an interview, not a plan request. Ask the assistant to act as your personal trainer and interview you about your goal, experience, schedule, equipment and past injuries before it plans anything. The top of this page has the exact prompt to copy. A plan built from your answers beats any template.",
      },
      {
        q: "Can it be my AI personal trainer and nutritionist?",
        a: "In the chat, yes: the assistant can discuss nutrition and estimate a meal you describe. AIm itself currently stores training, body metrics and goals rather than food logs, so nutrition advice stays in the conversation instead of your charts.",
      },
      {
        q: "Do I need to be experienced to use this?",
        a: "No. The first interview is built for beginners too: the coach asks about your level and builds a plan for the gym, home equipment or bodyweight only.",
      },
      {
        q: "Is there a free AI personal trainer?",
        a: "AIm is free, with all features included. On Claude the custom connector also works on the free plan, so the whole setup can cost nothing. ChatGPT requires a paid tier for custom connectors.",
      },
      {
        q: "Is ChatGPT or Claude better for workout plans?",
        a: "Both write good programs. The practical difference today is access: Claude allows custom connectors on its free plan, while ChatGPT needs Developer mode on a paid account. AIm works with either.",
      },
      {
        q: "Can AI replace a personal trainer?",
        a: "For programming and weekly adjustment it does a lot of the job. For technique correction it does none of it, because it cannot see you lift. Many people use an assistant for the plan and a human for occasional form checks.",
      },
      {
        q: "Is AIm really free?",
        a: "Yes, all features are free.",
      },
    ],
    cta: {
      title: "Set up your AI coach in a minute",
      text: "Enter your email, get a personal link, connect it to Claude. Goal setting, programs, logging and weekly reviews included.",
    },
  },

  ru: {
    title: "Как использовать Claude как персонального тренера",
    description:
      "AI ассистент может неплохо тренировать, но только если знает вашу цель, оборудование и историю. Практичная схема: знакомство, память тренировок, разбор недели, честные ограничения.",
    lead: "Попросить чат-бота о программе можно одним сообщением. Чтобы ассистент тренировал именно вас, а не среднего человека, нужна небольшая настройка. Вот что работает.",
    sections: [
      {
        h2: "Что AI тренер делает действительно хорошо",
        html: `        <p>Языковая модель знает методологию тренировок, отвечает на вопрос «почему» без раздражения, перестраивает план, когда день пошёл не так, и не закатывает глаза на вопрос новичка. Доступна в шесть утра и в полночь.</p>`,
      },
      {
        h2: "Где всё ломается",
        html: `        <p>Попросите программу без контекста, и получите план для среднего человека: типовые упражнения, угаданные веса, ноль связи с вашим графиком и вашими коленями. А через неделю чат вообще забудет о вашем существовании. Это чинится двумя вещами: контекстом и памятью.</p>`,
      },
      {
        h2: "Шаг 1: дайте ему контекст",
        html: `        <p>Настоящий тренер начинает с вопросов, и ассистент должен так же. Расскажите цель, опыт, график, оборудование и травмы, или попросите провести опрос:</p>
        <div class="prompt"><span class="who">Вы</span>Будь моим персональным тренером. Сначала расспроси меня о цели, опыте, графике, оборудовании и травмах, потом планируй.</div>
        <p>С подключённым AIm это происходит само: коннектор передаёт ассистенту сценарий знакомства для новых пользователей, а ответы сохраняются в тренерский профиль, а не умирают вместе с чатом.</p>`,
      },
      {
        h2: "Шаг 2: дайте ему память",
        html: `        <p>Ядро тренировок это прогрессия: добавлять вес, повторы или подходы на основе того, что вы реально сделали. Без вашего дневника ассистент может только гадать. Подключите хранилище вроде AIm, и каждая сессия записывается в вашу личную базу:</p>
        <div class="prompt"><span class="who">Вы</span>Приседания 5x5 по 80 кг, последний подход дался тяжело. Запиши.</div>
        <p>В следующем разговоре о плане ассистент читает ваши реальные цифры и строит прогрессию от них, а не от среднего.</p>`,
      },
      {
        h2: "Шаг 3: постройте недельный ритм",
        html: `        <p>Тренерство это цикл, а не одноразовый план. Три промпта закрывают его:</p>
        <div class="prompt"><span class="who">Вы</span>Спланируй следующую тренировку по моей программе и последним сессиям.</div>
        <div class="prompt"><span class="who">Вы</span>Разбери мою неделю: что получилось, что поменять?</div>
        <div class="prompt"><span class="who">Вы</span>Месячный чек-ин: двигаюсь ли я к цели?</div>
        <p>AIm передаёт ассистенту тренерский контекст под каждую из этих задач, поэтому он следует единой методологии, а не импровизирует каждый раз заново.</p>`,
      },
      {
        h2: "Чего AI тренер не может",
        html: `        <p>Честные ограничения: он не видит вашу технику так, как тренер в зале, он не врач, и он знает только то, что вы ему рассказали. Резкая боль это повод идти к живому специалисту, а не к чат-боту. Используйте ИИ для планирования, записи и анализа, а голову в зале держите свою.</p>`,
      },
    ],
    faq: [
      {
        q: "Нужен ли опыт тренировок?",
        a: "Нет. Знакомство рассчитано и на новичков: тренер спросит про уровень и соберёт план под зал, домашнее оборудование или только собственный вес.",
      },
      {
        q: "AIm правда бесплатный?",
        a: "Да, все возможности бесплатны.",
      },
    ],
    cta: {
      title: "Настройте своего AI тренера за минуту",
      text: "Введите почту, получите личную ссылку, подключите её к Claude. Постановка цели, программа, запись тренировок и разбор недели уже включены.",
    },
  },

  pt: {
    title: "IA que monta treino: como usar o ChatGPT ou o Claude como personal trainer",
    description:
      "Como usar uma IA que monta treino de graça no Claude ou no ChatGPT: 3 passos, a primeira entrevista, memória dos treinos, revisões semanais e onde um treinador humano ainda é melhor.",
    lead: "Sim, existe IA que monta treino de graça: o Claude e o ChatGPT montam o seu plano no chat que você já usa, para academia ou para casa. Este guia mostra os 3 passos para sair de um plano genérico e chegar a um acompanhamento que progride com você.",
    sections: [
      {
        h2: "O que uma IA faz bem de verdade",
        html: `        <p>A resposta curta: você não precisa de um app novo nem de pagar nada para começar. O assistente que você já usa monta o treino hoje, e os três passos deste guia fazem dele um treinador que acompanha você de verdade.</p>
        <p>Um modelo de linguagem conhece metodologia de treino, explica o porquê de um plano sem se irritar, adapta o treino quando o seu dia desanda e nunca revira os olhos para uma pergunta de iniciante. Disponível às 6 da manhã e à meia-noite.</p>
        <p>Ele também é bom em tradução. A maior parte do conteúdo de treino foi escrita para outra pessoa: alguém com academia completa, cinco noites livres e nenhum histórico de dor nas costas. Uma IA pega um modelo publicado e adapta para três sessões por semana, um par de halteres e um joelho em que você não confia.</p>`,
      },
      {
        h2: "O ChatGPT é bom para montar treino?",
        html: `        <p>Para um primeiro plano, sim, com uma ressalva que vale entender. Tanto o ChatGPT quanto o Claude produzem um programa sensato e bem estruturado se você contar o suficiente sobre você.</p>
        <p>A ressalva é que o plano é a metade fácil. A metade difícil é o que acontece nas semanas seguintes: perceber que o seu supino não sai do lugar há três sessões, que você sempre pula a sexta-feira, que o peso que era pesado mês passado agora é aquecimento. Essa parte precisa de registro, e uma janela de chat não guarda nenhum.</p>`,
      },
      {
        h2: "Onde quebra",
        html: `        <p>Peça um programa sem contexto e você recebe um plano para a pessoa média: exercícios genéricos, pesos chutados, nada a ver com a sua agenda ou com os seus joelhos. E na semana seguinte o chat esquece que você existe. Duas coisas resolvem: contexto e memória.</p>`,
      },
      {
        h2: "Passo 1: dê o seu contexto",
        html: `        <p>Um treinador de verdade começa com perguntas, e o seu assistente deveria também. Conte a meta, a experiência, a agenda, o equipamento e as lesões, ou peça que ele entreviste você:</p>
        <div class="prompt"><span class="who">Você</span>Aja como meu personal trainer. Me entreviste sobre meta, experiência, agenda, equipamento e lesões antes de montar qualquer coisa.</div>
        <p>Com o AIm conectado isso acontece sozinho: o conector entrega ao assistente um roteiro de entrevista para novos usuários, e as respostas ficam salvas no seu perfil em vez de morrerem com o chat.</p>`,
      },
      {
        h2: "Passo 2: dê memória a ele",
        html: `        <p>A progressão é o núcleo do treino: adicionar peso, repetições ou séries com base no que você realmente fez. Sem o seu registro, o assistente só pode chutar. Conecte um armazenamento como o AIm, explicado no <a href="/guides/pt/claude-remember-workouts/">guia de memória de treinos</a>, e cada sessão que você descrever é escrita no seu diário privado:</p>
        <div class="prompt"><span class="who">Você</span>Agachamento 5x5 com 80 kg, a última série foi puxada. Registra aí.</div>
        <p>Na próxima conversa de planejamento, o assistente lê os seus números reais e progride a partir deles.</p>`,
      },
      {
        h2: "Passo 3: crie um ritmo semanal",
        html: `        <p>Acompanhamento é um ciclo, não um plano único. Três prompts cobrem isso:</p>
        <div class="prompt"><span class="who">Você</span>Monte o meu próximo treino com base no programa e nas sessões recentes.</div>
        <div class="prompt"><span class="who">Você</span>Revise a minha semana: o que foi bem, o que devo mudar?</div>
        <div class="prompt"><span class="who">Você</span>Checagem mensal: estou no caminho da minha meta?</div>`,
      },
      {
        h2: "A IA pode substituir um personal trainer?",
        html: `        <p>Em parte, e vale ser preciso sobre quais partes. Um personal faz pelo menos quatro trabalhos: monta o programa, corrige a sua técnica na sala, cobra a sua presença e ajusta tudo conforme você muda.</p>
        <p>Uma IA é forte no primeiro e no quarto, desde que enxergue o seu histórico. O segundo ela não faz de jeito nenhum: nada que leia texto consegue ver o seu joelho cedendo na terceira repetição.</p>
        <p>O enquadramento realista não é substituição. Se você nunca ia contratar um treinador, uma IA com o seu histórico é um salto grande em relação a improvisar. Se você tem um bom treinador e um problema de técnica, mantenha o treinador.</p>`,
      },
      {
        h2: "Quanto custa",
        html: `        <p>O AIm é grátis, com todos os recursos incluídos e sem plano pago no momento. O que você precisa é de uma assinatura do assistente que já usa, e aqui os dois clientes diferem.</p>
        <p>No Claude, conectores personalizados funcionam no plano gratuito, então tudo pode custar zero. O passo a passo da conexão está no <a href="/guides/pt/connect-workout-tracker-mcp/">guia de conectores</a>. No ChatGPT, conectar um servidor MCP personalizado exige o Developer mode, que a OpenAI documenta como disponível nas contas Pro, Plus, Business, Enterprise e Education. O plano gratuito do ChatGPT não permite adicionar um conector personalizado hoje.</p>`,
      },
      {
        h2: "O que uma IA não consegue fazer",
        html: `        <p>Limites honestos: ela não é médica e só sabe o que você conta. Dor aguda pede um profissional humano, não um chatbot.</p>
        <p>Ela também vai errar com confiança de vez em quando. Se um salto de carga sugerido parecer absurdo para você, provavelmente é. Trate a IA como um parceiro de treino bem lido, não como autoridade.</p>`,
      },
    ],
    faq: [
      {
        q: "Preciso ter experiência para usar isso?",
        a: "Não. A primeira entrevista foi feita para iniciantes também: o treinador pergunta o seu nível e monta um plano para a academia, para equipamento de casa ou só com o peso do corpo.",
      },
      {
        q: "Existe uma IA personal trainer grátis?",
        a: "O AIm é grátis, com todos os recursos. No Claude o conector também funciona no plano gratuito, então a configuração inteira pode custar zero. O ChatGPT exige um plano pago para conectores personalizados.",
      },
      {
        q: "Qual IA monta treino de academia?",
        a: "O Claude e o ChatGPT montam. O que muda o resultado é o contexto: diga os aparelhos da sua academia, os dias disponíveis e a meta, ou conecte o AIm para o assistente entrevistar você e guardar tudo no seu perfil. O mesmo vale para treino em casa com halteres ou só com o peso do corpo.",
      },
      {
        q: "Preciso de um app para montar treino com IA?",
        a: "Não precisa instalar nada novo. O AIm conecta ao assistente que você já usa, e o programa, os gráficos e o mapa muscular ficam num app web que abre no celular. O cadastro é um e-mail e tudo é grátis.",
      },
      {
        q: "A IA pode substituir um personal trainer?",
        a: "Para montar o programa e ajustar semana a semana ela faz boa parte do trabalho. Para corrigir técnica ela não faz nada, porque não vê você treinar. Muita gente usa a IA para o plano e um humano para checagens de técnica.",
      },
      {
        q: "O AIm é mesmo grátis?",
        a: "Sim, todos os recursos são gratuitos.",
      },
    ],
    cta: {
      title: "Configure o seu treinador de IA em um minuto",
      text: "Grátis: informe o seu e-mail, receba um link pessoal, conecte ao Claude. Definição de meta, programas, registro e revisões semanais incluídos.",
    },
  },
  es: {
    title: "Cómo usar Claude como tu entrenador personal",
    description:
      "Un asistente de IA puede entrenarte bien, pero solo si conoce tu objetivo, tu equipo y tu historial. Un método práctico: entrevista inicial, memoria de entrenamientos, revisión semanal y límites honestos.",
    lead: "Pedirle un plan a un chatbot cuesta un solo mensaje. Conseguir un entrenamiento que de verdad se adapte a ti requiere algo de preparación. Esto es lo que funciona.",
    sections: [
      {
        h2: "Lo que un entrenador de IA hace realmente bien",
        html: `        <p>Un modelo de lenguaje conoce la metodología del entrenamiento, responde a cada porqué sin perder la paciencia, adapta el plan cuando el día se complica y nunca pone mala cara ante una pregunta de principiante. Disponible a las 6 de la mañana y a medianoche.</p>`,
      },
      {
        h2: "Dónde se rompe",
        html: `        <p>Pide un programa sin contexto y recibirás un plan para la persona promedio: ejercicios genéricos, pesos adivinados y cero relación con tu horario o tus rodillas. Y la semana siguiente el chat olvida que existes. Dos cosas lo arreglan: contexto y memoria.</p>`,
      },
      {
        h2: "Paso 1: dale tu contexto",
        html: `        <p>Un entrenador de verdad empieza con preguntas, y tu asistente debería hacer lo mismo. Cuéntale tu objetivo, experiencia, horario, equipo y lesiones, o pídele que te entreviste:</p>
        <div class="prompt"><span class="who">Tú</span>Actúa como mi entrenador personal. Entrevístame sobre mi objetivo, experiencia, horario, equipo y lesiones antes de planificar nada.</div>
        <p>Con AIm conectado, esto ocurre solo: el conector le entrega al asistente una conversación de entrevista para usuarios nuevos, y las respuestas se guardan en tu perfil de entrenamiento en lugar de morir con el chat.</p>`,
      },
      {
        h2: "Paso 2: dale memoria",
        html: `        <p>La progresión es el núcleo del entrenamiento: añadir peso, repeticiones o series según lo que realmente hiciste. Sin tu diario, el asistente solo puede adivinar. Conecta un almacenamiento como AIm y cada sesión que describas se escribe en tu diario privado:</p>
        <div class="prompt"><span class="who">Tú</span>Sentadillas 5x5 con 80 kg, la última serie me costó mucho. Regístralo.</div>
        <p>En la siguiente conversación de planificación, el asistente lee tus números reales y progresa desde ahí, no desde un promedio.</p>`,
      },
      {
        h2: "Paso 3: construye un ritmo semanal",
        html: `        <p>El entrenamiento es un ciclo, no un plan de una sola vez. Tres prompts lo cubren:</p>
        <div class="prompt"><span class="who">Tú</span>Planifica mi próximo entrenamiento según mi programa y mis últimas sesiones.</div>
        <div class="prompt"><span class="who">Tú</span>Revisa mi semana: ¿qué salió bien y qué debería cambiar?</div>
        <div class="prompt"><span class="who">Tú</span>Chequeo mensual: ¿voy bien hacia mi objetivo?</div>
        <p>AIm entrega al asistente contexto de entrenamiento para cada una de estas tareas, así sigue una metodología consistente en lugar de improvisar cada vez.</p>`,
      },
      {
        h2: "Lo que un entrenador de IA no puede hacer",
        html: `        <p>Límites honestos: no puede observar tu técnica como un entrenador que te ve en persona, no es un médico y solo sabe lo que tú le cuentas. Ante un dolor agudo, acude a un especialista humano, no a un chatbot. Usa la IA para planificar, registrar y analizar, y mantén tu propio criterio en el gimnasio.</p>`,
      },
    ],
    faq: [
      {
        q: "¿Necesito experiencia para usarlo?",
        a: "No. La entrevista inicial también está pensada para principiantes: el entrenador pregunta tu nivel y arma un plan para gimnasio, equipo de casa o solo peso corporal.",
      },
      {
        q: "¿AIm es realmente gratis?",
        a: "Sí, todas las funciones son gratuitas. En Claude el conector funciona incluso en el plan gratuito, así que todo el montaje puede no costar nada. ChatGPT requiere el modo desarrollador, disponible en sus planes de pago.",
      },
    ],
    cta: {
      title: "Configura tu entrenador de IA en un minuto",
      text: "Escribe tu correo, recibe un enlace personal y conéctalo a Claude. Objetivos, programas, registro y revisión semanal incluidos.",
    },
  },

  fr: {
    title: "Comment utiliser Claude comme coach sportif personnel",
    description:
      "Un assistant IA peut bien vous coacher, mais seulement s'il connaît votre objectif, votre matériel et votre historique. Une méthode concrète : entretien initial, mémoire des séances, bilan hebdomadaire, limites honnêtes.",
    lead: "Demander un plan à un chatbot prend un message. Obtenir un coaching qui vous correspond vraiment demande un peu de préparation. Voici ce qui marche.",
    sections: [
      {
        h2: "Ce qu'un coach IA fait vraiment bien",
        html: `        <p>Un modèle de langage connaît la méthodologie de l'entraînement, explique le pourquoi sans s'agacer, adapte le plan quand la journée déraille et ne lève jamais les yeux au ciel devant une question de débutant. Disponible à 6 h du matin comme à minuit.</p>`,
      },
      {
        h2: "Là où ça casse",
        html: `        <p>Demandez un programme sans contexte et vous recevez un plan pour la personne moyenne : exercices génériques, charges devinées, aucun lien avec votre emploi du temps ou vos genoux. Et la semaine suivante, le chat a oublié votre existence. Deux choses corrigent cela : le contexte et la mémoire.</p>`,
      },
      {
        h2: "Étape 1 : donnez-lui votre contexte",
        html: `        <p>Un vrai coach commence par des questions, et votre assistant devrait faire pareil. Donnez-lui votre objectif, votre expérience, votre emploi du temps, votre matériel et vos blessures, ou demandez-lui de vous interroger :</p>
        <div class="prompt"><span class="who">Vous</span>Agis comme mon coach personnel. Interroge-moi d'abord sur mon objectif, mon expérience, mon emploi du temps, mon matériel et mes blessures avant de planifier.</div>
        <p>Avec AIm connecté, cela se fait tout seul : le connecteur fournit à l'assistant un entretien d'accueil pour les nouveaux utilisateurs, et les réponses sont enregistrées dans votre profil coach au lieu de disparaître avec le chat.</p>`,
      },
      {
        h2: "Étape 2 : donnez-lui de la mémoire",
        html: `        <p>La progression est le cœur de l'entraînement : ajouter de la charge, des répétitions ou des séries selon ce que vous avez réellement fait. Sans votre journal, l'assistant ne peut que deviner. Connectez un stockage comme AIm et chaque séance décrite s'écrit dans votre journal privé :</p>
        <div class="prompt"><span class="who">Vous</span>Squat 5x5 à 80 kg, dernière série difficile. Enregistre.</div>
        <p>À la prochaine conversation de planification, l'assistant lit vos vrais chiffres et progresse à partir d'eux, pas d'une moyenne.</p>`,
      },
      {
        h2: "Étape 3 : installez un rythme hebdomadaire",
        html: `        <p>Le coaching est une boucle, pas un plan unique. Trois prompts suffisent :</p>
        <div class="prompt"><span class="who">Vous</span>Planifie ma prochaine séance selon mon programme et mes dernières séances.</div>
        <div class="prompt"><span class="who">Vous</span>Fais le bilan de ma semaine : qu'est-ce qui a marché, que changer ?</div>
        <div class="prompt"><span class="who">Vous</span>Point mensuel : suis-je sur la bonne voie pour atteindre mon objectif ?</div>
        <p>AIm fournit à l'assistant un contexte de coaching pour chacune de ces tâches, il suit donc une méthodologie cohérente au lieu d'improviser à chaque fois.</p>`,
      },
      {
        h2: "Ce qu'un coach IA ne peut pas faire",
        html: `        <p>Limites honnêtes : il ne voit pas votre technique comme un coach présent dans la salle, il n'est pas médecin, et il ne sait que ce que vous lui dites. Une douleur aiguë, c'est un spécialiste humain, pas un chatbot. Utilisez l'IA pour planifier, enregistrer et analyser, et gardez votre propre jugement à la salle.</p>`,
      },
    ],
    faq: [
      {
        q: "Faut-il de l'expérience pour l'utiliser ?",
        a: "Non. L'entretien d'accueil est aussi pensé pour les débutants : le coach demande votre niveau et construit un plan pour la salle, le matériel de la maison ou le poids du corps seul.",
      },
      {
        q: "AIm est-il vraiment gratuit ?",
        a: "Oui, toutes les fonctionnalités sont gratuites.",
      },
    ],
    cta: {
      title: "Installez votre coach IA en une minute",
      text: "Entrez votre email, recevez un lien personnel, connectez-le à Claude. Objectifs, programmes, journal et bilans hebdomadaires inclus.",
    },
  },
};
