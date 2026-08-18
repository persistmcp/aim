// Guide: choosing a training split. Targets `best workout split` (0.35 of the Hevy brand,
// docs/SEO_PLAN.md K.10). Maps onto the SplitType enum the product already models:
// push_pull, upper_lower, full_body, bro_split, ppl, custom.
// Copy rules: no em dashes, no invented social proof, honest claims, prompts first.

export default {
  slug: "best-workout-split",

  en: {
    title: "The best workout split is the one that fits your week",
    description:
      "Full body, upper lower, push pull legs or a bro split: what each one suits, and why the days you can actually train, three, four, five or six, decide the best workout split for you.",
    lead: "There is no single best split, and anyone who tells you otherwise is selling something. There is a best split for the number of days you can genuinely train. Two or three days: full body. Four: upper lower. Five: upper lower plus a day. Six: push pull legs run twice. The rest of this page is the reasoning, so you can trust the row you land on.",
    sections: [
      {
        h2: "Start with the only variable that matters",
        html: `        <p>Before comparing splits, answer one question honestly: how many days a week will you train, on a bad week rather than a good one? Not how many you would like to. The split follows from that number, and almost every bad split choice comes from answering it optimistically.</p>
        <p>The reason it decides everything is muscle frequency. Hypertrophy research on training frequency broadly agrees that hitting a muscle twice a week beats once, given the same total sets. A split that spreads your body over six days only works if you actually turn up six times. Miss two and you have skipped entire muscle groups for the week.</p>`,
      },
      {
        h2: "The short answer",
        html: `        <table>
        <tr><th>Days a week</th><th>Sensible choice</th><th>Muscle frequency</th></tr>
        <tr><td>2</td><td>Full body</td><td>2x</td></tr>
        <tr><td>3</td><td>Full body</td><td>3x</td></tr>
        <tr><td>4</td><td>Upper lower, or push pull</td><td>2x</td></tr>
        <tr><td>5</td><td>Upper lower plus a PPL day, or a bro split</td><td>1 to 2x</td></tr>
        <tr><td>6</td><td>Push pull legs, twice through</td><td>2x</td></tr>
        </table>
        <p>Notice that most rows land on twice a week per muscle. That is not a coincidence, it is the thing the splits are arranged around.</p>`,
      },
      {
        h2: "Full body",
        html: `        <p>Every session trains the whole body, usually one or two exercises per major muscle group.</p>
        <p><strong>Suits:</strong> two or three days a week, beginners, and anyone whose schedule collapses regularly. If you can only train twice, this is not a compromise, it is the correct answer.</p>
        <p><strong>Why it works:</strong> every muscle gets trained two or three times a week even on a small number of sessions, and missing one day costs you a fraction of each muscle's volume rather than all of one muscle's.</p>
        <p><strong>The catch:</strong> sessions get long if you add too much, and the muscles you train last are always the tired ones. Rotate which body part opens the session.</p>`,
      },
      {
        h2: "Upper and lower",
        html: `        <p>Alternating upper body and lower body days.</p>
        <p><strong>Suits:</strong> four days a week, and it is arguably the best default for most intermediate lifters.</p>
        <p><strong>Why it works:</strong> four sessions gives every muscle two exposures a week, which is the frequency the evidence supports, with enough room per session to do real volume without a two hour workout.</p>
        <p><strong>The catch:</strong> upper days carry a lot: chest, back, shoulders and arms all want attention. Expect them to run longer than leg days, and be willing to let arms ride on the compound work some weeks.</p>`,
      },
      {
        h2: "Push, pull, legs",
        html: `        <p>Pushing muscles (chest, shoulders, triceps), pulling muscles (back, biceps), then legs. Run once through for three days a week, or twice for six.</p>
        <p><strong>Suits:</strong> six days a week if you want the frequency, or three if you accept training each muscle once.</p>
        <p><strong>Why it works:</strong> muscles that work together are trained together, so nothing is asked to perform twice while still sore. It is also easy to remember and hard to get wrong.</p>
        <p><strong>The catch:</strong> at three days a week each muscle is trained once, which is the frequency the evidence likes least. At six days it is excellent and it is also six days. Be honest about which version you are actually running.</p>`,
      },
      {
        h2: "Push and pull",
        html: `        <p>Two rotating days: everything that pushes, then everything that pulls, with legs folded into whichever day suits the exercise.</p>
        <p><strong>Suits:</strong> four days a week, and people who dislike dedicated leg days enough to skip them.</p>
        <p><strong>Why it works:</strong> the same logical grouping as PPL with fewer session types to schedule, so it survives an irregular week better.</p>
        <p><strong>The catch:</strong> legs get less focused attention than on any split with a dedicated lower day. If your goal is lower body, choose something else.</p>`,
      },
      {
        h2: "The bro split",
        html: `        <p>One muscle group per day: chest Monday, back Tuesday, and so on across five days.</p>
        <p><strong>Suits:</strong> five days a week, advanced lifters with high volume per muscle, and anyone who genuinely enjoys it enough to keep showing up.</p>
        <p><strong>Why it works:</strong> you can pile a lot of volume onto one muscle and then leave it alone for a week to recover fully. It has a poor reputation online and it has built plenty of muscle on people who trained hard.</p>
        <p><strong>The catch:</strong> once a week per muscle is the lowest useful frequency, and it punishes a missed session hard. Skip Thursday and your shoulders got nothing for seven days. It also needs five sessions to work at all.</p>`,
      },
      {
        h2: "The split matters less than what you do inside it",
        html: `        <p>Worth saying plainly, because the question gets far more attention than it deserves. Split choice is a scheduling decision. It decides when you train a muscle, not how much it grows. What decides that is total hard sets per week, whether you add load over time, and whether you keep turning up.</p>
        <p>Two people running different splits with the same weekly sets, the same effort and the same consistency will get similar results. The frequency edge this page keeps pointing at is real, but it is a small lever next to those three. Someone who switches split every six weeks looking for the optimal one will get worse results than either, because they never stay anywhere long enough to add weight to the bar.</p>
        <p>Pick the row that matches your real week, run it for a few months, and spend your attention on progression instead. The <a href="/guides/en/progressive-overload/">progressive overload guide</a> covers the pacing and the volume numbers, and the <a href="/guides/en/one-rep-max-calculator/">1RM calculator</a> turns any set into a comparable strength number.</p>`,
      },
      {
        h2: "Checking it is working",
        html: `        <p>The useful check is not whether you picked the fashionable split, it is whether each muscle is getting enough hard sets across the week. That is arithmetic, and it is the kind of arithmetic nobody does by hand for long.</p>
        <div class="prompt"><span class="who">You</span>I train four days a week, upper lower. Build me a program and tell me if any muscle is short on volume.</div>
        <p>With AIm connected, the assistant builds the split around your real availability and equipment, and the app shows a muscle map of the week's sets against the recommended range for each muscle, so an undertrained group is visible rather than theoretical.</p>`,
      },
    ],
    faq: [
      {
        q: "What is the best workout split for muscle gain?",
        a: "The one matching the days you reliably train. Two or three days: full body. Four: upper lower. Six: push pull legs run twice. Most of these land on training each muscle twice a week, which the evidence supports over once.",
      },
      {
        q: "What is the best workout split for fat loss?",
        a: "The same split you would run for muscle gain. Fat loss is decided by the calorie deficit, not by the split, and the job of lifting in a deficit is to keep the muscle you have. Pick the split that matches your days, keep the weights heavy, and put cardio after lifting or on rest days rather than redesigning the week around it.",
      },
      {
        q: "Is push pull legs better than upper lower?",
        a: "Only if you train six days. At six days PPL gives every muscle two sessions, the same as upper lower at four. Run PPL over three days and each muscle is trained once a week, which is worse than a four day upper lower.",
      },
      {
        q: "Is the bro split bad?",
        a: "No, it is just demanding. It needs five sessions a week to cover the body once, so it has the lowest frequency of the common splits and a missed day costs a whole muscle group for the week. Trained hard and attended consistently, it works.",
      },
      {
        q: "What is the best workout split for beginners?",
        a: "Full body, three days a week. It teaches the main lifts fastest because you practice them every session, each muscle is trained three times a week, and a missed day costs you a third of the week instead of a whole muscle group.",
      },
      {
        q: "What is the best workout split for women?",
        a: "The same logic applies: pick by the days you actually have. What usually differs is emphasis, not structure. If glutes and legs are the priority, a four day upper lower with the lower days first in the week fits that goal without inventing a special split.",
      },
      {
        q: "What is the best workout split for an aesthetic physique?",
        a: "There is no special aesthetics split. Proportions come from biasing volume toward the muscles that set the look, usually shoulders, upper chest, lats and arms. Pick the split by your days, then give those muscles the first slot in the session and a couple of extra sets each week.",
      },
      {
        q: "What is the best 3 day split?",
        a: "Full body. Three full body days train each muscle three times a week. Push pull legs run once through also fits three days but trains each muscle once, so it only wins if the variety is what keeps you showing up.",
      },
      {
        q: "What is the best 5 day split?",
        a: "An upper lower plus push pull legs hybrid covers every muscle twice in five days. The classic bro split also takes five days but covers each muscle once, so the hybrid is the stronger default unless you specifically enjoy one muscle per day.",
      },
      {
        q: "How often should I change my split?",
        a: "Rarely. A split is worth keeping for months, because the progress comes from adding load within it. Change when your available days change, not because progress slowed for two weeks.",
      },
    ],
    cta: {
      title: "Get a split built around your actual week",
      text: "Tell the AI coach how many days you have and what equipment you own. It builds the program, and AIm shows whether every muscle is getting enough.",
    },
  },

  ru: {
    title: "Лучший сплит тренировок это тот, который подходит вашей неделе",
    description:
      "Фулбоди, верх-низ, push pull legs или сплит по группам мышц: что это такое, кому подходит и почему число реальных тренировочных дней решает всё.",
    lead: "Единственно лучшего сплита не существует. Существует лучший сплит под то количество дней, которое вы реально тренируетесь. На этот вопрос ответ есть.",
    sections: [
      {
        h2: "Начните с единственной важной переменной",
        html: `        <p>Прежде чем сравнивать сплиты, честно ответьте: сколько дней в неделю вы будете тренироваться на плохой неделе, а не на хорошей? Не сколько хотелось бы. Сплит следует из этого числа, и почти все неудачные выборы идут от оптимистичного ответа.</p>
        <p>Дело в частоте. Исследования частоты в целом сходятся: две тренировки мышцы в неделю лучше одной при равном общем числе подходов. Сплит на шесть дней работает, только если вы действительно приходите шесть раз. Пропустили два, и целые группы мышц остались без работы.</p>`,
      },
      {
        h2: "Фулбоди",
        html: `        <p>Каждая тренировка на всё тело, обычно одно-два упражнения на крупную группу.</p>
        <p><strong>Кому:</strong> два-три дня в неделю, новичкам и всем, у кого расписание регулярно рушится. Если можете только дважды, это не компромисс, а правильный ответ.</p>
        <p><strong>Почему работает:</strong> каждая мышца получает две-три нагрузки в неделю даже при малом числе тренировок, а пропуск дня стоит доли объёма каждой мышцы, а не всего объёма одной.</p>
        <p><strong>Минус:</strong> тренировки удлиняются, а те мышцы, что идут последними, всегда достаются уставшему телу. Меняйте порядок.</p>`,
      },
      {
        h2: "Верх и низ",
        html: `        <p>Чередование дней верха и низа тела.</p>
        <p><strong>Кому:</strong> четыре дня в неделю, и это, пожалуй, лучший вариант по умолчанию для среднего уровня.</p>
        <p><strong>Почему работает:</strong> четыре тренировки дают каждой мышце две нагрузки в неделю при достаточном объёме за сессию и без двухчасовых тренировок.</p>
        <p><strong>Минус:</strong> на дни верха приходится много: грудь, спина, плечи и руки. Они будут длиннее, чем дни ног.</p>`,
      },
      {
        h2: "Push, pull, legs",
        html: `        <p>Жимовые мышцы, тяговые мышцы, ноги. Один круг это три дня в неделю, два круга шесть.</p>
        <p><strong>Кому:</strong> шесть дней, если нужна частота, или три, если согласны на одну нагрузку в неделю на мышцу.</p>
        <p><strong>Почему работает:</strong> мышцы, работающие вместе, тренируются вместе, и ни одной не приходится работать второй раз уже забитой.</p>
        <p><strong>Минус:</strong> на трёх днях каждая мышца работает раз в неделю, а эту частоту исследования поддерживают слабее всего. На шести отлично, но это шесть дней. Будьте честны, какую версию вы реально ведёте.</p>`,
      },
      {
        h2: "Сплит по группам мышц",
        html: `        <p>Одна группа в день: понедельник грудь, вторник спина и так далее на пять дней.</p>
        <p><strong>Кому:</strong> пять дней в неделю, опытным, с большим объёмом на мышцу.</p>
        <p><strong>Почему работает:</strong> можно дать одной мышце много работы и оставить её восстанавливаться на неделю. В интернете у него плохая репутация, но тем, кто тренировался тяжело, он дал немало мышц.</p>
        <p><strong>Минус:</strong> раз в неделю на мышцу это нижняя полезная граница, и пропуск бьёт больно. Пропустили четверг, и плечи семь дней не получили ничего.</p>`,
      },
      {
        h2: "Так что выбрать",
        html: `        <table>
        <tr><th>Дней в неделю</th><th>Разумный выбор</th><th>Частота на мышцу</th></tr>
        <tr><td>2</td><td>Фулбоди</td><td>2 раза</td></tr>
        <tr><td>3</td><td>Фулбоди</td><td>3 раза</td></tr>
        <tr><td>4</td><td>Верх-низ или push pull</td><td>2 раза</td></tr>
        <tr><td>5</td><td>Верх-низ плюс день, или сплит по группам</td><td>1-2 раза</td></tr>
        <tr><td>6</td><td>Push pull legs в два круга</td><td>2 раза</td></tr>
        </table>
        <p>Почти все строки сходятся к двум разам в неделю на мышцу. Это не совпадение, вокруг этого сплиты и построены.</p>`,
      },
      {
        h2: "Сплит не главное",
        html: `        <p>Скажем прямо, потому что вопросу уделяют больше внимания, чем он заслуживает. Выбор сплита это вопрос расписания. Он решает, когда вы тренируете мышцу, а не насколько она вырастет. Это решают общее число тяжёлых подходов за неделю, прогрессия нагрузки и то, приходите ли вы вообще.</p>
        <p>Двое на разных сплитах с одинаковым недельным объёмом и одинаковой регулярностью получат очень похожий результат. А тот, кто меняет сплит каждые шесть недель в поисках идеального, получит хуже обоих, потому что нигде не задерживается достаточно, чтобы добавить вес на штангу.</p>`,
      },
      {
        h2: "Как проверить, что работает",
        html: `        <p>Полезная проверка не в модности сплита, а в том, хватает ли каждой мышце тяжёлых подходов за неделю. Это арифметика, и вручную её долго никто не ведёт.</p>
        <div class="prompt"><span class="who">Вы</span>Тренируюсь четыре дня, верх-низ. Собери программу и скажи, каким мышцам не хватает объёма.</div>
        <p>С подключённым AIm ассистент соберёт сплит под вашу реальную занятость и оборудование, а приложение покажет карту мышц с недельными подходами относительно рекомендованного диапазона.</p>`,
      },
    ],
    faq: [
      {
        q: "Какой сплит лучший для набора мышц?",
        a: "Тот, что совпадает с числом дней, которые вы стабильно тренируетесь. Два-три дня фулбоди, четыре верх-низ, шесть push pull legs в два круга. Почти все они дают две нагрузки в неделю на мышцу, а две исследования поддерживают сильнее, чем одну.",
      },
      {
        q: "Push pull legs лучше, чем верх-низ?",
        a: "Только если вы тренируетесь шесть дней. На шести PPL даёт каждой мышце две тренировки, столько же, сколько верх-низ на четырёх. На трёх днях PPL даёт одну, и это хуже.",
      },
      {
        q: "Сплит по группам мышц это плохо?",
        a: "Нет, он просто требовательный. Ему нужно пять тренировок, чтобы обойти тело один раз, поэтому частота самая низкая, а пропуск стоит целой группы. При тяжёлой работе и регулярности он работает.",
      },
    ],
    cta: {
      title: "Сплит под вашу реальную неделю",
      text: "Скажите AI тренеру, сколько у вас дней и какое оборудование. Он соберёт программу, а AIm покажет, всем ли мышцам хватает объёма.",
    },
  },

  pt: {
    title: "A melhor divisão de treino é a que cabe na sua semana",
    description:
      "Corpo inteiro, superior e inferior, push pull legs ou divisão por grupo muscular: o que é cada uma, para quem serve e por que os dias que você treina de verdade decidem a resposta.",
    lead: "Não existe uma única melhor divisão. Existe a melhor divisão para o número de dias que você treina de verdade, e essa pergunta tem resposta clara.",
    sections: [
      {
        h2: "Comece pela única variável que importa",
        html: `        <p>Antes de comparar divisões, responda com honestidade: quantos dias por semana você vai treinar numa semana ruim, não numa boa? A divisão decorre desse número, e quase toda escolha ruim vem de uma resposta otimista.</p>
        <p>O motivo é a frequência. As pesquisas em geral concordam: treinar um músculo duas vezes por semana supera uma vez, com o mesmo total de séries. Uma divisão espalhada por seis dias só funciona se você aparecer seis vezes.</p>`,
      },
      {
        h2: "Corpo inteiro",
        html: `        <p>Cada sessão treina o corpo todo, em geral um ou dois exercícios por grupo grande.</p>
        <p><strong>Para quem:</strong> dois ou três dias por semana, iniciantes e qualquer pessoa cuja agenda desmorona com frequência. Se você só consegue duas vezes, isso não é um remendo, é a resposta correta.</p>
        <p><strong>Por que funciona:</strong> todo músculo é treinado duas ou três vezes por semana mesmo com poucas sessões, e perder um dia custa uma fração do volume de cada músculo.</p>`,
      },
      {
        h2: "Superior e inferior",
        html: `        <p>Alternando dias de membros superiores e inferiores.</p>
        <p><strong>Para quem:</strong> quatro dias por semana, provavelmente a melhor escolha padrão no nível intermediário.</p>
        <p><strong>Por que funciona:</strong> quatro sessões dão a cada músculo duas exposições semanais, com espaço suficiente por sessão para volume real.</p>
        <p><strong>O porém:</strong> os dias de superior carregam muito: peito, costas, ombros e braços. Serão mais longos que os de perna.</p>`,
      },
      {
        h2: "Push, pull, legs",
        html: `        <p>Músculos de empurrar, de puxar e pernas. Uma volta dá três dias, duas voltas dão seis.</p>
        <p><strong>Para quem:</strong> seis dias se você quer a frequência, ou três se aceita treinar cada músculo uma vez.</p>
        <p><strong>O porém:</strong> em três dias cada músculo é treinado uma vez por semana, a frequência menos apoiada pelas evidências. Em seis dias é excelente, e são seis dias.</p>`,
      },
      {
        h2: "Divisão por grupo muscular",
        html: `        <p>Um grupo por dia: segunda peito, terça costas, e assim por cinco dias.</p>
        <p><strong>Para quem:</strong> cinco dias por semana e praticantes avançados com muito volume por músculo.</p>
        <p><strong>O porém:</strong> uma vez por semana é a frequência útil mais baixa e uma sessão perdida custa caro. Pulou quinta e os ombros ficaram sete dias sem nada.</p>`,
      },
      {
        h2: "Então, qual delas",
        html: `        <table>
        <tr><th>Dias por semana</th><th>Escolha sensata</th><th>Frequência por músculo</th></tr>
        <tr><td>2</td><td>Corpo inteiro</td><td>2x</td></tr>
        <tr><td>3</td><td>Corpo inteiro</td><td>3x</td></tr>
        <tr><td>4</td><td>Superior e inferior</td><td>2x</td></tr>
        <tr><td>5</td><td>Superior e inferior mais um dia, ou por grupo</td><td>1 a 2x</td></tr>
        <tr><td>6</td><td>Push pull legs, duas voltas</td><td>2x</td></tr>
        </table>
        <p>Quase todas as linhas caem em duas vezes por semana por músculo. Não é coincidência, é em torno disso que as divisões são organizadas.</p>`,
      },
      {
        h2: "A divisão não é o mais importante",
        html: `        <p>Vale dizer com clareza, porque a pergunta recebe muito mais atenção do que merece. Escolher a divisão é uma decisão de calendário: decide quando você treina um músculo, não quanto ele cresce. Isso é decidido pelo total de séries difíceis por semana, pela progressão de carga e pela sua constância.</p>
        <p>Quem troca de divisão a cada seis semanas procurando a ideal tende a obter resultados piores, porque nunca fica tempo suficiente para colocar peso na barra.</p>
        <p>Escolha a linha que combina com a sua semana real e gaste a atenção na progressão: o <a href="/guides/pt/progressive-overload/">guia de sobrecarga progressiva</a> cobre o ritmo e o volume, e a <a href="/guides/pt/one-rep-max-calculator/">calculadora de 1RM</a> transforma qualquer série num número comparável.</p>`,
      },
      {
        h2: "Conferir se está funcionando",
        html: `        <p>A checagem útil não é se você escolheu a divisão da moda, é se cada músculo recebe séries difíceis suficientes na semana. Isso é aritmética, e ninguém faz à mão por muito tempo.</p>
        <div class="prompt"><span class="who">Você</span>Treino quatro dias, superior e inferior. Monte um programa e diga se algum músculo está com pouco volume.</div>
        <p>Com o AIm conectado, o assistente monta a divisão conforme a sua disponibilidade real e o app mostra o mapa muscular da semana em comparação com a faixa recomendada.</p>`,
      },
    ],
    faq: [
      {
        q: "Qual a melhor divisão de treino para ganhar músculo?",
        a: "A que combina com os dias em que você treina de forma confiável. Dois ou três dias: corpo inteiro. Quatro: superior e inferior. Seis: push pull legs em duas voltas. Quase todas acabam treinando cada músculo duas vezes por semana.",
      },
      {
        q: "Push pull legs é melhor que superior e inferior?",
        a: "Só se você treinar seis dias. Em seis dias o PPL dá duas sessões por músculo, o mesmo que superior e inferior em quatro. Em três dias o PPL dá apenas uma.",
      },
      {
        q: "Divisão por grupo muscular é ruim?",
        a: "Não, é exigente. Precisa de cinco sessões para cobrir o corpo uma vez, então tem a frequência mais baixa e perder um dia custa um grupo inteiro na semana.",
      },
    ],
    cta: {
      title: "Uma divisão montada para a sua semana real",
      text: "Diga ao treinador de IA quantos dias você tem e qual equipamento. Ele monta o programa, e o AIm mostra se cada músculo está recebendo o suficiente. Grátis.",
    },
  },
  es: {
    title: "La mejor rutina de entrenamiento es la que encaja en tu semana",
    description:
      "Cuerpo completo, torso pierna, push pull legs o rutina por grupos: qué es cada una, a quién le sirve y por qué los días que entrenas de verdad deciden la respuesta.",
    lead: "No existe una única mejor rutina. Existe la mejor rutina para el número de días que entrenas de verdad, y esa pregunta sí tiene respuesta clara.",
    sections: [
      {
        h2: "Empieza por la única variable que importa",
        html: `        <p>Antes de comparar rutinas, responde con honestidad: ¿cuántos días a la semana vas a entrenar en una semana mala, no en una buena? La rutina se deduce de ese número, y casi todas las malas elecciones vienen de responder con optimismo.</p>
        <p>La razón es la frecuencia. La investigación coincide en general: entrenar un músculo dos veces por semana supera a una vez con el mismo total de series. Una rutina repartida en seis días solo funciona si apareces seis veces.</p>`,
      },
      {
        h2: "Cuerpo completo",
        html: `        <p>Cada sesión entrena todo el cuerpo, normalmente uno o dos ejercicios por grupo grande.</p>
        <p><strong>Para quién:</strong> dos o tres días por semana, principiantes y cualquiera con una agenda que se rompe. Si solo puedes dos días, no es un parche, es la respuesta correcta.</p>
        <p><strong>Por qué funciona:</strong> cada músculo recibe dos o tres estímulos semanales incluso con pocas sesiones, y perder un día cuesta una fracción del volumen de cada músculo.</p>`,
      },
      {
        h2: "Torso y pierna",
        html: `        <p>Alternar días de tren superior e inferior.</p>
        <p><strong>Para quién:</strong> cuatro días por semana, probablemente la mejor opción por defecto en nivel intermedio.</p>
        <p><strong>Por qué funciona:</strong> cuatro sesiones dan a cada músculo dos estímulos semanales con volumen suficiente por sesión.</p>
        <p><strong>El pero:</strong> los días de torso cargan mucho: pecho, espalda, hombros y brazos. Serán más largos que los de pierna.</p>`,
      },
      {
        h2: "Push, pull, legs",
        html: `        <p>Músculos de empuje, de tirón y piernas. Una vuelta son tres días, dos vueltas seis.</p>
        <p><strong>Para quién:</strong> seis días si quieres la frecuencia, o tres si aceptas entrenar cada músculo una vez.</p>
        <p><strong>El pero:</strong> a tres días cada músculo se entrena una vez por semana, la frecuencia menos respaldada. A seis es excelente, y son seis días.</p>`,
      },
      {
        h2: "Rutina por grupos musculares",
        html: `        <p>Un grupo por día: lunes pecho, martes espalda y así cinco días.</p>
        <p><strong>Para quién:</strong> cinco días por semana y gente avanzada con mucho volumen por músculo.</p>
        <p><strong>El pero:</strong> una vez por semana es la frecuencia útil más baja y castiga mucho una sesión perdida.</p>`,
      },
      {
        h2: "Entonces, ¿cuál?",
        html: `        <table>
        <tr><th>Días por semana</th><th>Opción sensata</th><th>Frecuencia por músculo</th></tr>
        <tr><td>2</td><td>Cuerpo completo</td><td>2x</td></tr>
        <tr><td>3</td><td>Cuerpo completo</td><td>3x</td></tr>
        <tr><td>4</td><td>Torso pierna o push pull</td><td>2x</td></tr>
        <tr><td>5</td><td>Torso pierna más un día, o por grupos</td><td>1 a 2x</td></tr>
        <tr><td>6</td><td>Push pull legs, dos vueltas</td><td>2x</td></tr>
        </table>`,
      },
      {
        h2: "La rutina no es lo importante",
        html: `        <p>Elegir rutina es una decisión de calendario: decide cuándo entrenas un músculo, no cuánto crece. Eso lo deciden las series duras semanales, la progresión de carga y la constancia.</p>
        <p>Quien cambia de rutina cada seis semanas buscando la óptima obtiene peores resultados, porque nunca se queda lo suficiente como para añadir peso a la barra.</p>`,
      },
      {
        h2: "Comprobar que funciona",
        html: `        <div class="prompt"><span class="who">Tú</span>Entreno cuatro días, torso pierna. Ármame un programa y dime si algún músculo se queda corto de volumen.</div>
        <p>Con AIm conectado, el asistente arma la rutina según tu disponibilidad real y la app muestra el mapa muscular de la semana frente al rango recomendado.</p>`,
      },
    ],
    faq: [
      {
        q: "¿Cuál es la mejor rutina para ganar músculo?",
        a: "La que encaja con los días que entrenas de forma fiable. Dos o tres días: cuerpo completo. Cuatro: torso pierna. Seis: push pull legs dos veces. Casi todas acaban entrenando cada músculo dos veces por semana.",
      },
      {
        q: "¿Es mejor push pull legs que torso pierna?",
        a: "Solo si entrenas seis días. A seis días PPL da dos sesiones por músculo, lo mismo que torso pierna a cuatro. A tres días PPL da una sola.",
      },
      {
        q: "¿Es mala la rutina por grupos musculares?",
        a: "No, es exigente. Necesita cinco sesiones para cubrir el cuerpo una vez, así que tiene la frecuencia más baja y perder un día cuesta un grupo entero.",
      },
    ],
    cta: {
      title: "Una rutina hecha para tu semana real",
      text: "Dile al entrenador de IA cuántos días tienes y qué equipo. Él arma el programa y AIm muestra si cada músculo recibe suficiente.",
    },
  },

  fr: {
    title: "Le meilleur split est celui qui tient dans votre semaine",
    description:
      "Full body, haut bas, push pull legs ou split par groupe musculaire : ce que chacun est, à qui il convient, et pourquoi le nombre de jours réellement disponibles décide de la réponse.",
    lead: "Il n'existe pas un meilleur split. Il existe le meilleur split pour le nombre de jours où vous vous entraînez réellement, et cette question a une réponse claire.",
    sections: [
      {
        h2: "Commencez par la seule variable qui compte",
        html: `        <p>Avant de comparer les splits, répondez honnêtement : combien de jours par semaine allez-vous vous entraîner lors d'une mauvaise semaine, pas d'une bonne ? Le split découle de ce nombre, et presque tous les mauvais choix viennent d'une réponse optimiste.</p>
        <p>La raison tient à la fréquence. La recherche s'accorde globalement : solliciter un muscle deux fois par semaine vaut mieux qu'une, à volume total égal. Un split réparti sur six jours ne fonctionne que si vous venez six fois.</p>`,
      },
      {
        h2: "Full body",
        html: `        <p>Chaque séance travaille tout le corps, en général un ou deux exercices par groupe majeur.</p>
        <p><strong>Pour qui :</strong> deux à trois jours par semaine, les débutants, et tous ceux dont l'agenda s'effondre régulièrement. Si vous ne pouvez venir que deux fois, ce n'est pas un compromis, c'est la bonne réponse.</p>
        <p><strong>Pourquoi ça marche :</strong> chaque muscle reçoit deux ou trois stimuli par semaine même avec peu de séances.</p>`,
      },
      {
        h2: "Haut et bas",
        html: `        <p>Alternance de séances haut du corps et bas du corps.</p>
        <p><strong>Pour qui :</strong> quatre jours par semaine, sans doute le meilleur choix par défaut au niveau intermédiaire.</p>
        <p><strong>Pourquoi ça marche :</strong> quatre séances donnent à chaque muscle deux expositions hebdomadaires avec assez de volume par séance.</p>
        <p><strong>Le bémol :</strong> les jours haut du corps sont bien chargés : pectoraux, dos, épaules et bras. Ils seront plus longs que les jours de jambes.</p>`,
      },
      {
        h2: "Push, pull, legs",
        html: `        <p>Muscles de poussée, muscles de tirage, jambes. Un tour fait trois jours, deux tours en font six.</p>
        <p><strong>Pour qui :</strong> six jours si vous voulez la fréquence, ou trois si vous acceptez une séance par muscle et par semaine.</p>
        <p><strong>Le bémol :</strong> à trois jours, chaque muscle est travaillé une fois par semaine, la fréquence la moins soutenue par les données.</p>`,
      },
      {
        h2: "Le split par groupe musculaire",
        html: `        <p>Un groupe par jour : lundi pectoraux, mardi dos, et ainsi de suite sur cinq jours.</p>
        <p><strong>Pour qui :</strong> cinq jours par semaine, pratiquants avancés avec beaucoup de volume par muscle.</p>
        <p><strong>Le bémol :</strong> une fois par semaine est la fréquence utile la plus basse, et une séance manquée coûte cher.</p>`,
      },
      {
        h2: "Alors lequel",
        html: `        <table>
        <tr><th>Jours par semaine</th><th>Choix raisonnable</th><th>Fréquence par muscle</th></tr>
        <tr><td>2</td><td>Full body</td><td>2x</td></tr>
        <tr><td>3</td><td>Full body</td><td>3x</td></tr>
        <tr><td>4</td><td>Haut bas, ou push pull</td><td>2x</td></tr>
        <tr><td>5</td><td>Haut bas plus un jour, ou split par groupe</td><td>1 à 2x</td></tr>
        <tr><td>6</td><td>Push pull legs, deux tours</td><td>2x</td></tr>
        </table>`,
      },
      {
        h2: "Le split n'est pas l'essentiel",
        html: `        <p>Choisir un split est une décision de calendrier : cela détermine quand vous travaillez un muscle, pas combien il grossit. La croissance, elle, dépend du nombre de séries dures par semaine, de la progression de charge et de votre régularité.</p>
        <p>Celui qui change de split toutes les six semaines pour trouver l'optimal obtient de moins bons résultats, faute de rester assez longtemps pour ajouter du poids sur la barre.</p>`,
      },
      {
        h2: "Vérifier que ça fonctionne",
        html: `        <div class="prompt"><span class="who">Vous</span>Je m'entraîne quatre jours, haut bas. Construis-moi un programme et dis-moi si un muscle manque de volume.</div>
        <p>Avec AIm connecté, l'assistant construit le split selon votre disponibilité réelle et l'application affiche la carte musculaire de la semaine face à la fourchette recommandée.</p>`,
      },
    ],
    faq: [
      {
        q: "Quel est le meilleur split pour prendre du muscle ?",
        a: "Celui qui correspond aux jours où vous vous entraînez réellement. Deux ou trois jours : full body. Quatre : haut bas. Six : push pull legs deux fois. La plupart aboutissent à deux séances par muscle et par semaine.",
      },
      {
        q: "Push pull legs vaut-il mieux que haut bas ?",
        a: "Seulement à six jours. À six jours, PPL donne deux séances par muscle, autant que haut bas à quatre. À trois jours, PPL n'en donne qu'une.",
      },
      {
        q: "Le split par groupe musculaire est-il mauvais ?",
        a: "Non, il est exigeant. Il lui faut cinq séances pour couvrir le corps une fois, donc la fréquence la plus basse, et une séance manquée coûte un groupe entier.",
      },
    ],
    cta: {
      title: "Un split construit pour votre vraie semaine",
      text: "Dites au coach IA combien de jours vous avez et quel matériel. Il construit le programme, et AIm montre si chaque muscle en reçoit assez.",
    },
  },
};
