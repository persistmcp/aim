// Guide: progressive overload. Targets the largest measured query in the niche (docs/SEO_PLAN.md
// Part K.13), whose intent is definitional: "what is", "how to", "meaning". Written from the
// volume landmarks and the estimated-1RM formula the product already implements, so the numbers
// on the page are the numbers in backend/src/workout_storage/landmarks.py and stats.py.
// Copy rules: no em dashes, no invented social proof, honest claims, prompts first.

export default {
  slug: "progressive-overload",

  en: {
    title: "Progressive overload: what it means and how to actually apply it",
    description:
      "Progressive overload explained in plain words: the four ways to add load, how fast to add it, how many sets per muscle per week, and how to tell whether you are actually progressing.",
    lead: "Progressive overload means gradually giving a muscle more work than it is used to, so it keeps adapting. It is the one principle every training program is built on. The definition takes a sentence. Applying it without stalling or getting hurt is the part worth reading about.",
    sections: [
      {
        h2: "What progressive overload means",
        html: `        <p>Progressive overload means gradually increasing the demand you place on a muscle over time, so it has a reason to keep adapting. Do the same workout with the same weight for a year and your body has no reason to change: it is already comfortably able to do that.</p>
        <p>That is the whole definition. Everything else is detail about <em>which</em> demand you increase and <em>how fast</em>.</p>
        <p>Worth clearing up a common confusion: progressive overload is not the same as adding weight every session. Weight is the most obvious variable but it is one of several, and for most people past the first few months it is not the one that moves most often.</p>`,
      },
      {
        h2: "How to apply progressive overload: the four ways to add load",
        html: `        <p>In rough order of how often you will use them:</p>
        <ul>
        <li><strong>Reps.</strong> Same weight, more repetitions. The gentlest increment and the one that works when adding a plate would wreck your form. Going from 3x8 to 3x10 at the same weight is real progress.</li>
        <li><strong>Weight.</strong> The classic. Once you hit the top of your rep range across all sets, add the smallest increment available and drop back down the range.</li>
        <li><strong>Sets.</strong> More total work for a muscle across the week. Powerful and the easiest to overdo, which is what the volume section below is about.</li>
        <li><strong>Quality.</strong> Same numbers, better execution: fuller range of motion, controlled lowering, less bouncing. Hard to measure and genuinely counts, especially when the other three have stalled.</li>
        </ul>
        <p>A practical pattern that works for most people: hold the weight and climb the rep range, then add weight and restart the range. Repeat. This is often called double progression and it removes most of the guesswork.</p>`,
      },
      {
        h2: "How fast should you add weight?",
        html: `        <p>Slower than feels satisfying. A useful rule of thumb is roughly 5 to 10 percent over 8 to 12 weeks on a given lift, not per session. Beginners move faster than that for the first few months because much of the early gain is the nervous system learning the movement rather than new muscle.</p>
        <p>The practical test is not the calendar, it is whether you completed your target reps with technique you would be happy to show someone. If the last set fell apart, repeat the weight next time. A repeated week is not a lost week.</p>`,
      },
      {
        h2: "How many sets per muscle per week",
        html: `        <p>This is where adding load usually goes wrong, because more is intuitive and wrong past a point. Two numbers are worth knowing per muscle: a floor below which it barely grows, and a ceiling past which extra sets mostly buy fatigue.</p>
        <p>The floor and ceiling here are what the hypertrophy literature calls minimum effective volume and maximum adaptive volume, following the Renaissance Periodization guides and the Schoenfeld dose-response meta-analyses. Growth climbs steeply toward about 10 hard sets a week and flattens out somewhere past 20. They are also the exact numbers AIm uses to color its muscle map.</p>
        <table>
        <tr><th>Muscle</th><th>Floor (sets/week)</th><th>Productive ceiling</th></tr>
        <tr><td>Chest</td><td>8</td><td>20</td></tr>
        <tr><td>Lats</td><td>8</td><td>20</td></tr>
        <tr><td>Upper back</td><td>8</td><td>20</td></tr>
        <tr><td>Quads</td><td>8</td><td>18</td></tr>
        <tr><td>Side delts</td><td>8</td><td>20</td></tr>
        <tr><td>Calves</td><td>8</td><td>16</td></tr>
        <tr><td>Hamstrings</td><td>6</td><td>16</td></tr>
        <tr><td>Biceps</td><td>6</td><td>16</td></tr>
        <tr><td>Triceps</td><td>6</td><td>14</td></tr>
        <tr><td>Rear delts</td><td>6</td><td>18</td></tr>
        <tr><td>Front delts</td><td>6</td><td>12</td></tr>
        <tr><td>Glutes</td><td>4</td><td>16</td></tr>
        <tr><td>Lower back</td><td>4</td><td>12</td></tr>
        </table>
        <p>Two things about this table. Front delts and lower back sit low because they already take a beating as helpers on pressing and on most compound lifts, so they rarely need much direct work. And a set only counts if it was genuinely hard: three sets taken close to failure beat six comfortable ones.</p>
        <p>How you spread those sets across the week is a scheduling question, which is what <a href="/guides/en/best-workout-split/">choosing a workout split</a> is actually about.</p>`,
      },
      {
        h2: "How to tell whether you are actually progressing",
        html: `        <p>Session to session, progress is noisy. Sleep, food and stress move your numbers as much as training does, so a single bad session means nothing. What you want is a trend over weeks.</p>
        <p>The most useful single number is an estimated one rep max, because it lets you compare sets that used different weights and reps. The common formula is Epley:</p>
        <p><strong>estimated 1RM = weight x (1 + reps / 30)</strong></p>
        <p>So 100 kg for 5 reps estimates to about 117 kg, and 90 kg for 10 reps estimates to about 120 kg. The second set was the better performance even though the weight on the bar was lower. Without that conversion it is easy to think you have stalled when you have not.</p>
        <p>If you would rather not do the arithmetic, the <a href="/guides/en/one-rep-max-calculator/">1RM calculator</a> runs the same formula and gives you a percentage table for planning working sets.</p>
        <p>Treat the estimate as a comparison tool, not a prediction. It is least accurate above about 10 reps and it is not a number you should walk up to a bar and attempt.</p>`,
      },
      {
        h2: "When it stalls",
        html: `        <p>Everyone stalls. In rough order of what to try:</p>
        <ul>
        <li><strong>Check the obvious first.</strong> Sleep, food, and whether life got heavier. Most stalls are recovery, not programming.</li>
        <li><strong>Switch variable.</strong> If neither reps nor weight has moved in three sessions, add a set, or switch which variable you are pushing.</li>
        <li><strong>Take a lighter week.</strong> Cutting volume roughly in half for a week while keeping the weights where they are often lets progress resume immediately afterwards.</li>
        <li><strong>Change the movement.</strong> A close variant loads the same muscle with a fresh stimulus and a fresh set of numbers to beat.</li>
        </ul>
        <p>What rarely works is simply pushing harder on a lift that has been flat for a month.</p>`,
      },
      {
        h2: "Tracking it without a spreadsheet",
        html: `        <p>None of the above works without a record. You cannot add reps to last week's set if you do not know what last week's set was, and memory is not up to the job past a few exercises.</p>
        <p>Most people start with a spreadsheet and abandon it. The alternative is to describe the session to an AI assistant and let it keep the log:</p>
        <div class="prompt"><span class="who">You</span>Bench 3x8 at 70, all sets clean. What should I do next session?</div>
        <p>With AIm connected, the assistant writes the session to your log, reads your history back, and can answer that question with your actual numbers: your estimated 1RM trend for that lift, how many hard sets your chest got this week against the floor and ceiling above, and what to change.</p>`,
      },
    ],
    faq: [
      {
        q: "What is progressive overload in simple terms?",
        a: "Gradually giving a muscle more work than it is used to, so it has a reason to adapt. In practice that means adding reps, weight, sets or better execution over time rather than repeating the same workout indefinitely.",
      },
      {
        q: "What is an example of progressive overload?",
        a: "Bench press 60 kg for 3x8 this week, work up to 3x10 over the next few weeks, then move to 62.5 kg and start again at 3x8. Reps climbed, then weight, then reps again. The bodyweight version is going from knee push-ups to full push-ups to feet elevated.",
      },
      {
        q: "How often should I increase the weight?",
        a: "When you can complete all your target reps with technique you are happy with. Roughly 5 to 10 percent over 8 to 12 weeks on a given lift is a realistic pace for anyone past the beginner phase, which is much slower than most people expect.",
      },
      {
        q: "Does progressive overload work for bodyweight training?",
        a: "Yes. The weight is fixed, so you progress with reps, sets, harder variations and slower tempo. Moving from knee push-ups to full push-ups to elevated feet is progressive overload.",
      },
      {
        q: "Do I have to track every set to make it work?",
        a: "You need to know what you did last time for the exercises you are trying to progress. That does not have to be a spreadsheet: describing the session to an assistant connected to AIm records it and gives you the trend back.",
      },
    ],
    cta: {
      title: "Let your AI coach handle the arithmetic",
      text: "Describe your session in a sentence. AIm records it, tracks your estimated 1RM per exercise and shows weekly sets per muscle against the numbers above.",
    },
  },

  ru: {
    title: "Прогрессия нагрузки: что это и как её применять",
    description:
      "Прогрессия нагрузки простыми словами: четыре способа добавить нагрузку, с какой скоростью её добавлять, сколько подходов на мышцу в неделю и как понять, что вы действительно растёте.",
    lead: "Прогрессия нагрузки лежит в основе любой тренировочной программы. Определение умещается в одну фразу. Интересна другая часть: как применять её и не встать в тупик.",
    sections: [
      {
        h2: "Что такое прогрессия нагрузки",
        html: `        <p>Это постепенное увеличение требований к мышце, чтобы у неё была причина продолжать адаптироваться. Если год делать одну и ту же тренировку с одним и тем же весом, телу меняться незачем: оно уже спокойно справляется.</p>
        <p>Весь принцип в этом. Дальше только детали: <em>какое</em> требование увеличивать и <em>как быстро</em>.</p>
        <p>Частая путаница: прогрессия не равна «добавлять вес каждую тренировку». Вес самая заметная переменная, но не единственная, и после первых месяцев чаще меняется не он.</p>`,
      },
      {
        h2: "Четыре способа добавить нагрузку",
        html: `        <ul>
        <li><strong>Повторения.</strong> Тот же вес, больше повторов. Самый мягкий шаг, работает там, где лишний блин ломает технику.</li>
        <li><strong>Вес.</strong> Классика. Дошли до верха диапазона во всех подходах, добавили минимальный шаг и вернулись вниз диапазона.</li>
        <li><strong>Подходы.</strong> Больше общей работы на мышцу за неделю. Мощный способ и легче всего переборщить, об этом раздел ниже.</li>
        <li><strong>Качество.</strong> Те же цифры, но полная амплитуда, контролируемое опускание, меньше раскачки. Измерить сложно, но это настоящий прогресс.</li>
        </ul>
        <p>Рабочая схема для большинства: держите вес и растите в повторениях, потом добавляйте вес и начинайте диапазон заново.</p>`,
      },
      {
        h2: "Сколько подходов на мышцу в неделю",
        html: `        <p>Именно здесь обычно ошибаются, потому что «больше» интуитивно, но после какого-то предела неверно. Полезно знать два числа на мышцу: пол, ниже которого роста почти нет, и потолок, за которым лишние подходы приносят в основном усталость.</p>
        <p>Это те числа, которыми AIm раскрашивает карту мышц. Они опираются на гайды Renaissance Periodization и мета-анализы Schoenfeld: рост быстро прибавляется примерно до 10 тяжёлых подходов в неделю и почти останавливается где-то после 20.</p>
        <table>
        <tr><th>Мышца</th><th>Нижняя граница (подходов в неделю)</th><th>Продуктивный потолок</th></tr>
        <tr><td>Грудь</td><td>8</td><td>20</td></tr>
        <tr><td>Широчайшие</td><td>8</td><td>20</td></tr>
        <tr><td>Верх спины</td><td>8</td><td>20</td></tr>
        <tr><td>Квадрицепс</td><td>8</td><td>18</td></tr>
        <tr><td>Средние дельты</td><td>8</td><td>20</td></tr>
        <tr><td>Икры</td><td>8</td><td>16</td></tr>
        <tr><td>Бицепс бедра</td><td>6</td><td>16</td></tr>
        <tr><td>Бицепс</td><td>6</td><td>16</td></tr>
        <tr><td>Трицепс</td><td>6</td><td>14</td></tr>
        <tr><td>Задние дельты</td><td>6</td><td>18</td></tr>
        <tr><td>Передние дельты</td><td>6</td><td>12</td></tr>
        <tr><td>Ягодицы</td><td>4</td><td>16</td></tr>
        <tr><td>Поясница</td><td>4</td><td>12</td></tr>
        </table>
        <p>Передние дельты и поясница стоят низко, потому что и так много получают как помощники в жимах и базовых движениях. И подход считается, только если он был действительно тяжёлым.</p>`,
      },
      {
        h2: "Как понять, что прогресс есть",
        html: `        <p>От тренировки к тренировке цифры шумят: сон, еда и стресс двигают их не меньше, чем сама тренировка. Смотреть надо на тренд за недели.</p>
        <p>Полезнее всего одно число: расчётный разовый максимум. Он позволяет сравнивать подходы с разными весами и повторами. Обычная формула Эпли:</p>
        <p><strong>расчётный 1ПМ = вес x (1 + повторы / 30)</strong></p>
        <p>100 кг на 5 повторов дают около 116 кг, а 90 кг на 10 повторов около 120 кг. Второй подход сильнее, хотя на штанге было меньше. Без такого пересчёта легко решить, что вы встали, когда это не так.</p>`,
      },
      {
        h2: "Если прогресс встал",
        html: `        <ul>
        <li><strong>Сначала очевидное.</strong> Сон, еда, нагрузка в жизни. Большинство остановок это восстановление, а не программа.</li>
        <li><strong>Смените переменную.</strong> Вес не идёт три тренировки подряд, растите повторения или добавьте подход.</li>
        <li><strong>Разгрузочная неделя.</strong> Урезать объём примерно вдвое, веса оставить.</li>
        <li><strong>Смените движение.</strong> Близкий вариант даёт свежий стимул и свежие цифры.</li>
        </ul>`,
      },
      {
        h2: "Как это вести без таблицы",
        html: `        <p>Ничего из перечисленного не работает без записей: нельзя добавить повтор к прошлому подходу, если вы его не помните. Таблицу заводят многие, забрасывают почти все.</p>
        <div class="prompt"><span class="who">Вы</span>Жим лёжа 3x8 по 70, все подходы чисто. Что делать в следующий раз?</div>
        <p>С подключённым AIm ассистент запишет тренировку, прочитает историю и ответит вашими цифрами: тренд расчётного 1ПМ, сколько тяжёлых подходов получила грудь за неделю относительно пола и потолка выше.</p>`,
      },
    ],
    faq: [
      {
        q: "Что такое прогрессия нагрузки простыми словами?",
        a: "Постепенно давать мышце больше работы, чем она привыкла, чтобы у неё была причина адаптироваться. На практике это добавление повторов, веса, подходов или качества выполнения вместо бесконечного повторения одной тренировки.",
      },
      {
        q: "Как часто увеличивать вес?",
        a: "Когда выполняете все целевые повторения с техникой, которая вас устраивает. Реалистичный темп после новичкового этапа примерно 5-10% за 8-12 недель на упражнение, это заметно медленнее, чем ожидают.",
      },
      {
        q: "Работает ли это с собственным весом?",
        a: "Да. Вес фиксирован, поэтому прогрессируете повторениями, подходами, усложнением варианта и темпом. Переход от отжиманий с колен к обычным и потом к ногам на возвышении это и есть прогрессия.",
      },
    ],
    cta: {
      title: "Пусть арифметику ведёт AI тренер",
      text: "Опишите тренировку одной фразой. AIm запишет её, посчитает расчётный 1ПМ по каждому упражнению и покажет недельные подходы по мышцам относительно чисел выше.",
    },
  },

  pt: {
    title: "Sobrecarga progressiva: o que é e como aplicar de verdade",
    description:
      "Sobrecarga progressiva explicada em palavras simples: as quatro formas de adicionar carga, em que velocidade, quantas séries por músculo por semana e como saber se você está progredindo.",
    lead: "A sobrecarga progressiva é o princípio sobre o qual todo programa é construído. A definição cabe numa frase. O interessante é aplicá-la sem travar.",
    sections: [
      {
        h2: "O que significa sobrecarga progressiva",
        html: `        <p>Significa aumentar aos poucos a exigência sobre um músculo, para que ele tenha motivo de continuar se adaptando. Se você repetir o mesmo treino com a mesma carga por um ano, o seu corpo não tem razão para mudar: ele já dá conta com folga.</p>
        <p>Todo o princípio é esse. O resto é detalhe sobre <em>qual</em> exigência aumentar e <em>com que rapidez</em>.</p>
        <p>Uma confusão comum: não é a mesma coisa que colocar peso toda sessão. A carga é a variável mais óbvia, mas é uma entre várias, e depois dos primeiros meses raramente é a que mais se move.</p>`,
      },
      {
        h2: "As quatro formas de adicionar carga",
        html: `        <ul>
        <li><strong>Repetições.</strong> Mesma carga, mais repetições. O incremento mais suave, e o que funciona quando somar uma anilha destrói a técnica.</li>
        <li><strong>Carga.</strong> O clássico. Ao chegar no topo da faixa em todas as séries, some o menor incremento disponível e volte ao fim da faixa.</li>
        <li><strong>Séries.</strong> Mais trabalho total por músculo na semana. Poderoso e o mais fácil de exagerar.</li>
        <li><strong>Qualidade.</strong> Os mesmos números com execução melhor: amplitude completa, descida controlada, menos embalo.</li>
        </ul>
        <p>Um padrão que funciona para a maioria: segure a carga e suba nas repetições, depois adicione peso e recomece a faixa.</p>`,
      },
      {
        h2: "Quantas séries por músculo por semana",
        html: `        <p>É aqui que normalmente se erra, porque "mais" é intuitivo e, passado certo ponto, falso. Vale conhecer dois números por músculo: um piso abaixo do qual ele quase não cresce e um teto além do qual as séries extras trazem sobretudo fadiga.</p>
        <p>São os números com que o AIm colore o seu mapa muscular, apoiados nos guias da Renaissance Periodization e nas meta-análises de dose-resposta de Schoenfeld.</p>
        <table>
        <tr><th>Músculo</th><th>Piso (séries/semana)</th><th>Teto produtivo</th></tr>
        <tr><td>Peito</td><td>8</td><td>20</td></tr>
        <tr><td>Dorsais</td><td>8</td><td>20</td></tr>
        <tr><td>Quadríceps</td><td>8</td><td>18</td></tr>
        <tr><td>Deltoide lateral</td><td>8</td><td>20</td></tr>
        <tr><td>Posteriores de coxa</td><td>6</td><td>16</td></tr>
        <tr><td>Bíceps</td><td>6</td><td>16</td></tr>
        <tr><td>Tríceps</td><td>6</td><td>14</td></tr>
        <tr><td>Glúteos</td><td>4</td><td>16</td></tr>
        </table>
        <p>E uma série só conta se foi realmente difícil: três séries perto da falha valem mais que seis confortáveis.</p>`,
      },
      {
        h2: "Como saber se você está progredindo",
        html: `        <p>De sessão para sessão os números têm ruído: sono, comida e estresse mexem tanto quanto o treino. O que importa é a tendência ao longo de semanas.</p>
        <p>O número mais útil é um 1RM estimado, porque permite comparar séries com cargas e repetições diferentes. A fórmula comum é a de Epley:</p>
        <p><strong>1RM estimado = carga x (1 + repetições / 30)</strong></p>
        <p>100 kg por 5 repetições estimam cerca de 117 kg, e 90 kg por 10 estimam cerca de 120 kg. A segunda série foi melhor mesmo com menos peso na barra.</p>
        <p>Se preferir não fazer a conta, a <a href="/guides/pt/one-rep-max-calculator/">calculadora de 1RM</a> usa a mesma fórmula e converte a estimativa em porcentagens de trabalho.</p>`,
      },
      {
        h2: "Quando trava",
        html: `        <ul>
        <li><strong>Cheque o óbvio primeiro.</strong> Sono, comida e se a vida ficou mais pesada. A maioria dos platôs é problema de recuperação, não de programação.</li>
        <li><strong>Troque de variável.</strong> Se a carga não sai do lugar há três sessões, tente subir as repetições ou adicione uma série.</li>
        <li><strong>Semana leve.</strong> Corte o volume pela metade e mantenha as cargas.</li>
        <li><strong>Mude o movimento.</strong> Uma variação próxima dá estímulo novo e números novos para bater.</li>
        </ul>`,
      },
      {
        h2: "Acompanhar sem planilha",
        html: `        <p>Nada disso funciona sem registro: não dá para somar uma repetição à série da semana passada se você não sabe qual foi.</p>
        <div class="prompt"><span class="who">Você</span>Supino 3x8 com 70, todas limpas. O que faço na próxima sessão?</div>
        <p>Com o AIm conectado, o assistente grava a sessão, lê o seu histórico e responde com os seus números reais.</p>`,
      },
    ],
    faq: [
      {
        q: "O que é sobrecarga progressiva em palavras simples?",
        a: "Dar aos poucos a um músculo mais trabalho do que ele está acostumado, para que tenha motivo de se adaptar. Na prática: adicionar repetições, carga, séries ou melhor execução ao longo do tempo.",
      },
      {
        q: "De quanto em quanto tempo devo aumentar a carga?",
        a: "Quando você completa todas as repetições alvo com uma técnica de que você gosta. Um ritmo realista depois da fase de iniciante é de 5 a 10 por cento em 8 a 12 semanas por exercício.",
      },
      {
        q: "Funciona com peso do corpo?",
        a: "Sim. A carga é fixa, então você progride com repetições, séries, variações mais difíceis e tempo sob tensão.",
      },
    ],
    cta: {
      title: "Deixe a aritmética com o seu treinador de IA",
      text: "Descreva a sessão em uma frase. O AIm registra, acompanha o 1RM estimado por exercício e mostra as séries semanais por músculo. Grátis.",
    },
  },
  es: {
    title: "Sobrecarga progresiva: qué es y cómo aplicarla",
    description:
      "La sobrecarga progresiva explicada con palabras sencillas: las cuatro formas de añadir carga, a qué velocidad, cuántas series por músculo a la semana y cómo saber si de verdad progresas.",
    lead: "La sobrecarga progresiva es el principio sobre el que se construye cualquier programa. La definición cabe en una frase. Lo interesante es aplicarla sin estancarse.",
    sections: [
      {
        h2: "Qué significa sobrecarga progresiva",
        html: `        <p>Significa aumentar poco a poco la exigencia sobre un músculo para que tenga motivo de seguir adaptándose. Si repites un año el mismo entrenamiento con el mismo peso, tu cuerpo no tiene razón para cambiar: ya lo hace con comodidad.</p>
        <p>Ese es todo el principio. El resto son detalles sobre <em>qué</em> exigencia aumentas y <em>a qué ritmo</em>.</p>
        <p>Una confusión habitual: no equivale a subir el peso cada sesión. El peso es la variable más visible, pero no la única, y pasados los primeros meses no suele ser la que más se mueve.</p>`,
      },
      {
        h2: "Las cuatro formas de añadir carga",
        html: `        <ul>
        <li><strong>Repeticiones.</strong> Mismo peso, más repeticiones. El incremento más suave y el que funciona cuando añadir un disco te rompe la técnica.</li>
        <li><strong>Peso.</strong> El clásico. Al llegar al tope del rango en todas las series, añade el incremento mínimo y vuelve abajo del rango.</li>
        <li><strong>Series.</strong> Más trabajo total por músculo a la semana. Potente, y donde es más fácil pasarse.</li>
        <li><strong>Calidad.</strong> Las mismas cifras con mejor ejecución: recorrido completo, bajada controlada, menos impulso.</li>
        </ul>
        <p>Un patrón que funciona para la mayoría: mantén el peso y sube en repeticiones, luego añade peso y reinicia el rango.</p>`,
      },
      {
        h2: "Cuántas series por músculo a la semana",
        html: `        <p>Aquí es donde se suele fallar, porque "más" es intuitivo y a partir de cierto punto es falso. Conviene conocer dos números por músculo: un suelo por debajo del cual apenas crece y un techo a partir del cual las series extra aportan sobre todo fatiga.</p>
        <p>Son los números con los que AIm colorea su mapa muscular, apoyados en las guías de Renaissance Periodization y los metaanálisis de dosis-respuesta de Schoenfeld.</p>
        <table>
        <tr><th>Músculo</th><th>Suelo (series/semana)</th><th>Techo productivo</th></tr>
        <tr><td>Pecho</td><td>8</td><td>20</td></tr>
        <tr><td>Dorsales</td><td>8</td><td>20</td></tr>
        <tr><td>Cuádriceps</td><td>8</td><td>18</td></tr>
        <tr><td>Deltoides lateral</td><td>8</td><td>20</td></tr>
        <tr><td>Isquiotibiales</td><td>6</td><td>16</td></tr>
        <tr><td>Bíceps</td><td>6</td><td>16</td></tr>
        <tr><td>Tríceps</td><td>6</td><td>14</td></tr>
        <tr><td>Glúteos</td><td>4</td><td>16</td></tr>
        </table>
        <p>Y una serie solo cuenta si fue realmente dura: tres series cerca del fallo valen más que seis cómodas.</p>`,
      },
      {
        h2: "Cómo saber si progresas",
        html: `        <p>De sesión a sesión los números tienen ruido: el sueño, la comida y el estrés los mueven tanto como el entrenamiento. Lo que importa es la tendencia por semanas.</p>
        <p>El número más útil es un 1RM estimado, porque permite comparar series con pesos y repeticiones distintos. La fórmula habitual es la de Epley:</p>
        <p><strong>1RM estimado = peso x (1 + repeticiones / 30)</strong></p>
        <p>100 kg a 5 repeticiones estiman unos 116 kg, y 90 kg a 10 estiman unos 120 kg. La segunda serie fue mejor aunque la barra pesara menos.</p>`,
      },
      {
        h2: "Cuando te estancas",
        html: `        <ul>
        <li><strong>Primero lo evidente.</strong> Sueño, comida y si la vida se ha puesto más dura. La mayoría de estancamientos son recuperación, no programación.</li>
        <li><strong>Cambia de variable.</strong> Si el peso no se mueve en tres sesiones, persigue repeticiones o añade una serie.</li>
        <li><strong>Semana ligera.</strong> Recorta el volumen a la mitad y mantén los pesos.</li>
        <li><strong>Cambia el ejercicio.</strong> Una variante cercana da un estímulo nuevo y cifras nuevas que batir.</li>
        </ul>`,
      },
      {
        h2: "Registrarlo sin hoja de cálculo",
        html: `        <p>Nada de lo anterior funciona sin registro: no puedes añadir una repetición a la serie de la semana pasada si no sabes cuál fue.</p>
        <div class="prompt"><span class="who">Tú</span>Press de banca 3x8 con 70, todas limpias. ¿Qué hago la próxima sesión?</div>
        <p>Con AIm conectado, el asistente guarda la sesión, lee tu historial y responde con tus cifras reales.</p>`,
      },
    ],
    faq: [
      {
        q: "¿Qué es la sobrecarga progresiva en palabras sencillas?",
        a: "Dar poco a poco a un músculo más trabajo del que está acostumbrado para que tenga motivo de adaptarse. En la práctica, añadir repeticiones, peso, series o mejor ejecución con el tiempo.",
      },
      {
        q: "¿Cada cuánto subo el peso?",
        a: "Cuando completas todas las repeticiones objetivo con una técnica que te convence. Un ritmo realista pasada la fase de principiante es un 5 a 10 por ciento en 8 a 12 semanas por ejercicio.",
      },
      {
        q: "¿Funciona con peso corporal?",
        a: "Sí. El peso es fijo, así que progresas con repeticiones, series, variantes más difíciles y tempo más lento.",
      },
    ],
    cta: {
      title: "Deja la aritmética a tu entrenador de IA",
      text: "Describe la sesión en una frase. AIm la registra, calcula tu 1RM estimado por ejercicio y muestra las series semanales por músculo frente a las cifras de arriba.",
    },
  },

  fr: {
    title: "Surcharge progressive : ce que c'est et comment l'appliquer",
    description:
      "La surcharge progressive expliquée simplement : les quatre façons d'ajouter de la charge, à quelle vitesse, combien de séries par muscle par semaine et comment savoir si vous progressez vraiment.",
    lead: "La surcharge progressive est le principe sur lequel repose tout programme. La définition tient en une phrase. Le sujet intéressant, c'est de l'appliquer sans stagner.",
    sections: [
      {
        h2: "Ce que signifie la surcharge progressive",
        html: `        <p>Cela consiste à augmenter progressivement l'exigence imposée à un muscle, pour qu'il ait une raison de continuer à s'adapter. Répétez un an le même entraînement avec la même charge et votre corps n'a aucune raison de changer : il y arrive déjà confortablement.</p>
        <p>Tout le principe est là. Le reste n'est que détail sur <em>quelle</em> exigence augmenter et <em>à quelle vitesse</em>.</p>
        <p>Une confusion fréquente : ce n'est pas la même chose qu'ajouter du poids à chaque séance. Le poids est la variable la plus visible, pas la seule.</p>`,
      },
      {
        h2: "Les quatre façons d'ajouter de la charge",
        html: `        <ul>
        <li><strong>Répétitions.</strong> Même charge, plus de répétitions. L'incrément le plus doux, celui qui marche quand ajouter un disque casse la technique.</li>
        <li><strong>Charge.</strong> Le classique. Une fois le haut de la fourchette atteint sur toutes les séries, ajoutez le plus petit incrément et repartez du bas.</li>
        <li><strong>Séries.</strong> Plus de travail total par muscle sur la semaine. Puissant et le plus facile à surdoser.</li>
        <li><strong>Qualité.</strong> Les mêmes chiffres mieux exécutés : amplitude complète, descente contrôlée, moins d'élan.</li>
        </ul>
        <p>Un schéma qui marche pour la plupart : gardez la charge et montez dans les répétitions, puis ajoutez du poids et recommencez la fourchette.</p>`,
      },
      {
        h2: "Combien de séries par muscle par semaine",
        html: `        <p>C'est là que l'on se trompe le plus souvent, parce que « plus » est intuitif et faux au-delà d'un certain point. Deux nombres par muscle sont utiles : un plancher sous lequel il ne grossit presque pas, et un plafond au-delà duquel les séries en trop apportent surtout de la fatigue.</p>
        <p>Ce sont les nombres avec lesquels AIm colore sa carte musculaire, fondés sur les guides Renaissance Periodization et les méta-analyses dose-réponse de Schoenfeld.</p>
        <table>
        <tr><th>Muscle</th><th>Plancher (séries/semaine)</th><th>Plafond productif</th></tr>
        <tr><td>Pectoraux</td><td>8</td><td>20</td></tr>
        <tr><td>Dorsaux</td><td>8</td><td>20</td></tr>
        <tr><td>Quadriceps</td><td>8</td><td>18</td></tr>
        <tr><td>Deltoïde latéral</td><td>8</td><td>20</td></tr>
        <tr><td>Ischio-jambiers</td><td>6</td><td>16</td></tr>
        <tr><td>Biceps</td><td>6</td><td>16</td></tr>
        <tr><td>Triceps</td><td>6</td><td>14</td></tr>
        <tr><td>Fessiers</td><td>4</td><td>16</td></tr>
        </table>
        <p>Et une série ne compte que si elle a été réellement difficile.</p>`,
      },
      {
        h2: "Comment savoir si vous progressez",
        html: `        <p>D'une séance à l'autre, les chiffres sont bruités : le sommeil, l'alimentation et le stress les déplacent autant que l'entraînement. Ce qui compte, c'est la tendance sur plusieurs semaines.</p>
        <p>Le nombre le plus utile est un 1RM estimé, car il permet de comparer des séries avec des charges et des répétitions différentes. La formule usuelle est celle d'Epley :</p>
        <p><strong>1RM estimé = charge x (1 + répétitions / 30)</strong></p>
        <p>100 kg à 5 répétitions donnent environ 116 kg, et 90 kg à 10 donnent environ 120 kg. La deuxième série était la meilleure performance.</p>`,
      },
      {
        h2: "Quand ça stagne",
        html: `        <ul>
        <li><strong>D'abord l'évident.</strong> Sommeil, alimentation, charge de vie. La plupart des stagnations relèvent de la récupération.</li>
        <li><strong>Changez de variable.</strong> Si la charge ne bouge pas depuis trois séances, visez les répétitions ou ajoutez une série.</li>
        <li><strong>Semaine allégée.</strong> Réduisez le volume de moitié en gardant les charges.</li>
        <li><strong>Changez de mouvement.</strong> Une variante proche donne un stimulus neuf.</li>
        </ul>`,
      },
      {
        h2: "Un suivi sans tableur",
        html: `        <p>Rien de tout cela ne fonctionne sans trace écrite : impossible d'ajouter une répétition à la série de la semaine dernière si vous ne savez plus ce qu'elle était.</p>
        <div class="prompt"><span class="who">Vous</span>Développé couché 3x8 à 70, toutes propres. Je fais quoi la prochaine fois ?</div>
        <p>Avec AIm connecté, l'assistant enregistre la séance, relit votre historique et répond avec vos vrais chiffres.</p>`,
      },
    ],
    faq: [
      {
        q: "Qu'est-ce que la surcharge progressive, simplement ?",
        a: "Donner progressivement à un muscle plus de travail qu'il n'en a l'habitude, pour qu'il ait une raison de s'adapter. En pratique : ajouter des répétitions, de la charge, des séries ou de la qualité d'exécution.",
      },
      {
        q: "À quelle fréquence augmenter la charge ?",
        a: "Quand vous réalisez toutes vos répétitions cibles avec une technique qui vous satisfait. Un rythme réaliste après la phase débutant est de 5 à 10 pour cent sur 8 à 12 semaines par mouvement.",
      },
      {
        q: "Est-ce que ça marche au poids du corps ?",
        a: "Oui. La charge est fixe, donc vous progressez par les répétitions, les séries, des variantes plus difficiles et un tempo plus lent.",
      },
    ],
    cta: {
      title: "Laissez l'arithmétique à votre coach IA",
      text: "Décrivez votre séance en une phrase. AIm l'enregistre, calcule votre 1RM estimé par exercice et affiche les séries hebdomadaires par muscle face aux chiffres ci-dessus.",
    },
  },
};
