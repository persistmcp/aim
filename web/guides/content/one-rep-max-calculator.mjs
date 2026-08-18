// Guide: a working one-rep-max calculator. Targets the only large tool-intent query measured
// (docs/SEO_PLAN.md K.13/K.14: `1rm calculator`, 0.39 of the Hevy brand, confirmed three times).
//
// This is the one guide page that carries JavaScript, deliberately breaking the JS-free rule in
// template.mjs: a calculator that does not calculate is not the thing people searched for. The
// script is inline, dependency-free and progressive - the formula, the worked examples and the
// percentage table are all in the static HTML, so a crawler or a JS-less reader still gets the
// full answer. The maths is the same Epley formula the product uses in stats.epley_1rm, so the
// public page and the app can never disagree.
// Copy rules: no em dashes, no invented social proof, honest claims, prompts first.

// The widget markup is shared across languages but its labels are not: a Portuguese reader must
// not meet an English calculator. Pass the six visible strings per locale.
const CALCULATOR = (t) => `        <div class="calc">
          <div class="calc-row">
            <label for="orm-weight">${t.weight}</label>
            <input id="orm-weight" type="number" inputmode="decimal" min="0" step="0.5" value="100" />
          </div>
          <div class="calc-row">
            <label for="orm-reps">${t.reps}</label>
            <input id="orm-reps" type="number" inputmode="numeric" min="1" max="20" step="1" value="5" />
          </div>
          <p class="calc-out" id="orm-out">${t.result}: <strong>116.7</strong></p>
          <table id="orm-table">
            <tr><th>${t.pctHeader}</th><th>${t.weightHeader}</th><th>${t.repsHeader}</th></tr>
            <tr><td>95%</td><td data-pct="95">110.8</td><td>2</td></tr>
            <tr><td>90%</td><td data-pct="90">105.0</td><td>4</td></tr>
            <tr><td>85%</td><td data-pct="85">99.2</td><td>6</td></tr>
            <tr><td>80%</td><td data-pct="80">93.3</td><td>8</td></tr>
            <tr><td>75%</td><td data-pct="75">87.5</td><td>10</td></tr>
            <tr><td>70%</td><td data-pct="70">81.7</td><td>12</td></tr>
          </table>
        </div>
        <script>
        (function () {
          var w = document.getElementById("orm-weight");
          var r = document.getElementById("orm-reps");
          var out = document.getElementById("orm-out");
          if (!w || !r || !out) return;
          var strong = out.querySelector("strong");
          var cells = document.querySelectorAll("#orm-table td[data-pct]");
          function round(n) { return Math.round(n * 10) / 10; }
          function update() {
            var weight = parseFloat(w.value);
            var reps = parseInt(r.value, 10);
            if (!isFinite(weight) || weight <= 0 || !isFinite(reps) || reps < 1) return;
            if (reps > 20) reps = 20;
            // Mirrors stats.epley_1rm on the backend, including its single-rep case: a set of one
            // IS the max, so it is returned as-is rather than inflated by the formula.
            var orm = reps <= 1 ? weight : weight * (1 + reps / 30);
            strong.textContent = round(orm);
            for (var i = 0; i < cells.length; i++) {
              var pct = parseFloat(cells[i].getAttribute("data-pct"));
              cells[i].textContent = round((orm * pct) / 100);
            }
          }
          w.addEventListener("input", update);
          r.addEventListener("input", update);
          update();
        })();
        </script>`;

export default {
  slug: "one-rep-max-calculator",

  en: {
    title: "1RM calculator: Epley one rep max with a percentage table",
    description:
      "Work out your estimated 1RM from any set, right on the page: enter the weight and reps. Includes the Epley formula, a training percentage table, and an honest note on how accurate the estimate is.",
    lead: "Enter what you actually lifted and get an estimated one rep max, plus the working percentages you would use to program around it. No need to test a true max.",
    sections: [
      {
        h2: "Calculator",
        html: CALCULATOR({
          weight: "Weight lifted",
          reps: "Reps completed",
          result: "Estimated one rep max",
          pctHeader: "Percent of 1RM",
          weightHeader: "Weight",
          repsHeader: "Typical reps",
        }),
      },
      {
        h2: "How to calculate 1RM: the Epley formula",
        html: `        <p>To calculate your one rep max, take a recent set done with good form and multiply the weight by (1 + reps / 30). That is the Epley formula, the most widely used estimate:</p>
        <p><strong>estimated 1RM = weight x (1 + reps / 30)</strong></p>
        <p>So a set of 100 kg for 5 reps estimates a one rep max of about 116.7 kg. You can do it on paper in a few seconds, which is worth knowing when you are standing in a gym without your phone.</p>
        <p>This is the same formula AIm uses internally, so an estimate on this page matches what the app shows for a logged set.</p>`,
      },
      {
        h2: "What the percentages are for",
        html: `        <p>Most published programs prescribe load as a percentage of your one rep max: five sets of three at 85 percent, or three sets of ten at 70. The table above converts your estimate into those working weights so you can follow such a program without ever testing a max.</p>
        <p>Round to whatever your gym actually has. If the table says 87.5 kg and the smallest plates give you 85 or 90, take 85 and aim to beat the reps.</p>
        <p>One caution on the rep column in that table. It is a typical correspondence, not a rule: how many reps you personally get at 80 percent depends on the lift and on how you train. Squats usually allow more reps at a given percentage than deadlifts do, and someone who lives in the 5 rep range will get fewer reps at 70 percent than someone who trains at 12.</p>`,
      },
      {
        h2: "Why estimate instead of testing",
        html: `        <p>Testing a true one rep max is useful occasionally and costly often. It is a maximal effort with a real injury risk, it needs a spotter on some lifts, and it leaves you too fatigued to train properly for a few days afterwards. For most people not competing in a strength sport, there is no reason to do it more than rarely.</p>
        <p>An estimate from a normal working set costs nothing and can be recalculated after every session. That makes it a better progress signal than a max test, because you get one every week instead of once a training block.</p>`,
      },
      {
        h2: "How accurate is it?",
        html: `        <p>Good in the middle, unreliable at the edges. Between roughly 3 and 8 reps the estimate is usually close. Above about 10 reps it drifts high, because at that point your set is limited by muscular endurance and technique breakdown rather than pure strength. A set of 20 will produce a number you almost certainly cannot lift.</p>
        <p>It is also individual. Two people with the same 5 rep performance can have genuinely different true maxes, depending on fibre type and how practised they are at heavy singles. Someone who trains mostly in the 8 to 12 range will usually under-perform their estimate on the day.</p>
        <p>The practical framing: treat it as a way to compare your own sets over time, not as a prediction of what you would lift today. A rising estimate means you are getting stronger, which is the question that actually matters.</p>`,
      },
      {
        h2: "Epley, Brzycki and the others",
        html: `        <p>Epley is not the only formula. The two other common ones are Brzycki and Lombardi:</p>
        <ul>
        <li><strong>Epley:</strong> weight x (1 + reps / 30)</li>
        <li><strong>Brzycki:</strong> weight / (1.0278 - 0.0278 x reps)</li>
        <li><strong>Lombardi:</strong> weight x reps to the power of 0.10</li>
        </ul>
        <p>At 5 reps they agree closely. Take 100 kg for 5: Epley gives 116.7, Brzycki 112.5, Lombardi 117.5. By 10 reps they have spread out, and past 12 the disagreement between them is larger than the difference a month of training would make.</p>
        <p>Which means the choice matters less than the consistency. Pick one, use it for every set, and compare the number against your own past numbers rather than against someone else's. Switching formulas halfway through a training block will show you a jump or a drop that never happened in the gym.</p>`,
      },
      {
        h2: "Bench, squat and deadlift",
        html: `        <p>The formula is the same for every lift, but its accuracy is not. Bench press estimates are the most reliable, because the set usually ends when the chest and triceps fail rather than anything else. Squat estimates run slightly optimistic from high rep sets, because legs handle high reps better than the formula assumes: you get more reps at a given percentage, so the arithmetic reads that endurance as extra strength. Deadlift estimates drift the most: grip and lower back fatigue end a long set early, so a 10 rep pull understates what you could lift once.</p>
        <p>The practical rule: estimate from sets of 3 to 6 reps where you can, especially on the deadlift, and compare estimates from the same rep range over time. An estimate from your 5 rep squat this month against your 5 rep squat last month is a clean comparison. Against your 12 rep squat it is not.</p>`,
      },
      {
        h2: "If you log RPE",
        html: `        <p>RPE folds into the same formula through reps in reserve. RPE 8 means you had about 2 reps left in the tank, RPE 9 about 1. Add those reps to the reps you actually did and enter the total in the calculator above: 100 kg for 5 at RPE 8 counts as a 7 rep effort, which estimates about 123 kg.</p>
        <p>This is an estimate stacked on an estimate, since RPE itself is a judgement call, so expect a wider error than from a set taken close to failure. The trade is worth it when you want a max number without grinding out the last reps.</p>`,
      },
      {
        h2: "Using it to drive progression",
        html: `        <p>The reason an estimated max is worth tracking at all is that it makes different sets comparable. Consider two weeks:</p>
        <ul>
        <li>Week one: 100 kg x 5. Estimate about 116.7.</li>
        <li>Week two: 95 kg x 8. Estimate about 120.</li>
        </ul>
        <p>The bar was lighter in week two and the performance was better. Judged by weight alone you would think you had gone backwards. This is the single most common reason people believe they have stalled when they have not.</p>
        <p>The <a href="/guides/en/progressive-overload/">progressive overload guide</a> covers what to change when the trend really has flattened.</p>
        <p>Tracking it by hand across every exercise gets old fast. If you would rather not, describe the set to an AI assistant and let it keep the log:</p>
        <div class="prompt"><span class="who">You</span>Squats 5x5 at 100 today. What is my estimated max and is it moving?</div>
        <p>With AIm connected, the assistant records the session and answers from your actual history: the estimate for that lift and its trend over the last weeks.</p>`,
      },
    ],
    faq: [
      {
        q: "How do I calculate my one rep max?",
        a: "Take a set you completed with good form and apply the Epley formula: weight multiplied by (1 + reps divided by 30). A set of 100 kg for 5 reps gives about 116.7 kg. The calculator above does it for you and also converts the result into working percentages.",
      },
      {
        q: "How accurate is a 1RM calculator?",
        a: "Reasonably accurate between about 3 and 8 reps. Above 10 reps it tends to overestimate, because the set becomes limited by endurance rather than strength. Use it to compare your own sets over time rather than as a prediction of what you could lift today.",
      },
      {
        q: "Should I test my actual one rep max?",
        a: "Rarely, and only if you have a reason such as competing. It carries injury risk and costs several days of quality training afterwards. An estimate from a normal working set gives you the same trend information every week at no cost.",
      },
      {
        q: "Which formula is this?",
        a: "Epley, the most common of several. Brzycki and Lombardi give slightly different numbers, particularly at higher reps. No formula is exact, so consistency matters more than the choice: pick one and compare against itself.",
      },
    ],
    cta: {
      title: "Track the estimate automatically",
      text: "Describe your sets to Claude or ChatGPT and AIm records them, calculating the estimated 1RM for every exercise and charting the trend.",
    },
  },

  ru: {
    title: "Калькулятор разового максимума (формула Эпли) с таблицей процентов",
    description:
      "Рассчитайте разовый максимум по любому подходу: введите вес и повторения. Формула Эпли, таблица рабочих процентов и честная оценка точности.",
    lead: "Введите то, что реально подняли, и получите расчётный разовый максимум вместе с рабочими процентами. Проверять настоящий максимум не нужно.",
    sections: [
      {
        h2: "Калькулятор",
        html: CALCULATOR({
          weight: "Поднятый вес",
          reps: "Сделано повторений",
          result: "Расчётный разовый максимум",
          pctHeader: "Процент от 1ПМ",
          weightHeader: "Вес",
          repsHeader: "Обычно повторений",
        }),
      },
      {
        h2: "Формула",
        html: `        <p>Калькулятор считает по формуле Эпли, самой распространённой:</p>
        <p><strong>расчётный 1ПМ = вес x (1 + повторы / 30)</strong></p>
        <p>Подход 100 кг на 5 повторов даёт около 116.7 кг. Считается в уме за пару секунд, что удобно, когда вы в зале без телефона.</p>
        <p>Это та же формула, которую использует AIm внутри, поэтому расчёт на странице совпадает с тем, что покажет приложение.</p>`,
      },
      {
        h2: "Зачем считать, а не проверять",
        html: `        <p>Проверка настоящего максимума изредка полезна, но обходится дорого: это предельное усилие с реальным риском травмы, на части упражнений нужна страховка, и после неё несколько дней не потренируешься нормально. Если вы не выступаете в силовом спорте, делать это регулярно незачем.</p>
        <p>Расчёт по обычному рабочему подходу бесплатен и обновляется после каждой тренировки. Как сигнал прогресса он лучше: вы получаете его каждую неделю, а не раз в цикл.</p>`,
      },
      {
        h2: "Насколько это точно",
        html: `        <p>Хорошо в середине и ненадёжно по краям. Примерно между 3 и 8 повторениями оценка обычно близка. Выше 10 повторов она завышает, потому что подход упирается в выносливость и технику, а не в силу. Подход на 20 даст число, которое вы почти наверняка не поднимете.</p>
        <p>Есть и индивидуальность: два человека с одинаковой пятёркой могут иметь разный настоящий максимум. Тот, кто тренируется в основном в диапазоне 8-12, обычно не дотягивает до своей расчётной цифры.</p>
        <p>Практический вывод: это способ сравнивать свои подходы во времени, а не предсказание на сегодня. Оценка растёт, значит, растёт и сила. А это единственное, что нужно знать.</p>`,
      },
      {
        h2: "Зачем нужны проценты",
        html: `        <p>Большинство программ задают нагрузку в процентах от разового максимума: пять троек по 85 процентов или три десятки по 70. Таблица выше переводит вашу оценку в рабочие веса, так что программу можно вести, ни разу не проверяя максимум.</p>
        <p>Округляйте под то, что есть в зале. Если в таблице 87.5 кг, а блины дают 85 или 90, берите 85 и старайтесь выиграть в повторениях.</p>`,
      },
      {
        h2: "Как это помогает прогрессии",
        html: `        <p>Смысл отслеживать расчётный максимум в том, что он делает разные подходы сравнимыми:</p>
        <ul>
        <li>Неделя первая: 100 кг на 5. Оценка около 116.7.</li>
        <li>Неделя вторая: 90 кг на 10. Оценка около 120.</li>
        </ul>
        <p>Штанга легче, результат лучше. По одному весу показалось бы, что вы откатились. Это самая частая причина решить, что прогресс встал, когда он не вставал.</p>
        <div class="prompt"><span class="who">Вы</span>Приседания 5x5 по 100. Какой расчётный максимум и растёт ли он?</div>
        <p>С подключённым AIm ассистент запишет подход и ответит по вашей реальной истории.</p>`,
      },
    ],
    faq: [
      {
        q: "Как рассчитать разовый максимум?",
        a: "Возьмите подход, выполненный с хорошей техникой, и примените формулу Эпли: вес умножить на (1 + повторы делить на 30). Подход 100 кг на 5 даёт около 116.7 кг. Калькулятор выше считает это сам и переводит результат в рабочие проценты.",
      },
      {
        q: "Насколько точен калькулятор 1ПМ?",
        a: "Достаточно точен между 3 и 8 повторениями. Выше 10 повторов он завышает, потому что подход ограничивает выносливость, а не сила. Используйте его для сравнения своих подходов во времени, а не как предсказание.",
      },
      {
        q: "Стоит ли проверять настоящий максимум?",
        a: "Редко и только если есть причина, например соревнования. Это риск травмы и несколько потерянных тренировочных дней. Расчёт по рабочему подходу даёт ту же информацию о тренде каждую неделю и бесплатно.",
      },
    ],
    cta: {
      title: "Считайте оценку автоматически",
      text: "Описывайте подходы Claude или ChatGPT, а AIm запишет их, посчитает расчётный максимум по каждому упражнению и построит тренд.",
    },
  },

  pt: {
    title: "Calculadora de 1RM (fórmula de Epley) com tabela de porcentagens",
    description:
      "Calcule o seu 1RM estimado a partir de qualquer série: informe a carga e as repetições. Inclui a fórmula de Epley, tabela de porcentagens de treino e uma nota honesta sobre precisão.",
    lead: "Informe o que você realmente levantou e receba um 1RM estimado, junto com as porcentagens de trabalho para montar o programa. Não precisa testar um máximo real.",
    sections: [
      {
        h2: "Calculadora",
        html: CALCULATOR({
          weight: "Carga levantada",
          reps: "Repetições feitas",
          result: "1RM estimado",
          pctHeader: "Porcentagem do 1RM",
          weightHeader: "Carga",
          repsHeader: "Repetições típicas",
        }),
      },
      {
        h2: "A fórmula",
        html: `        <p>A calculadora usa a fórmula de Epley, a estimativa mais difundida:</p>
        <p><strong>1RM estimado = carga x (1 + repetições / 30)</strong></p>
        <p>Uma série de 100 kg por 5 repetições estima um máximo de cerca de 116.7 kg. Dá para fazer de cabeça em segundos, o que é útil quando você está na academia sem o celular.</p>
        <p>É a mesma fórmula que o AIm usa internamente, então a estimativa desta página bate com a que o app mostra.</p>`,
      },
      {
        h2: "Por que estimar em vez de testar",
        html: `        <p>Testar um máximo real é útil de vez em quando e caro com frequência: é um esforço máximo com risco real de lesão, precisa de alguém dando segurança em alguns exercícios e deixa você alguns dias sem treinar direito. Se você não compete em um esporte de força, não há motivo para fazer isso com frequência.</p>
        <p>Uma estimativa a partir de uma série normal não custa nada e é recalculada depois de cada sessão, então você a tem toda semana em vez de uma vez por bloco.</p>`,
      },
      {
        h2: "Qual a precisão",
        html: `        <p>Boa no meio, pouco confiável nas pontas. Entre 3 e 8 repetições a estimativa costuma ficar perto. Acima de 10 ela sobe demais, porque a série passa a ser limitada por resistência e quebra de técnica em vez de força pura.</p>
        <p>Também é individual: quem treina sobretudo na faixa de 8 a 12 costuma ficar abaixo da própria estimativa no dia do teste.</p>
        <p>Encare como um jeito de comparar as suas próprias séries ao longo do tempo, não como previsão do que você levantaria hoje.</p>`,
      },
      {
        h2: "Epley, Brzycki e as outras",
        html: `        <p>Epley não é a única fórmula. As outras duas comuns são Brzycki e Lombardi:</p>
        <ul>
        <li><strong>Epley:</strong> carga x (1 + reps / 30)</li>
        <li><strong>Brzycki:</strong> carga / (1.0278 - 0.0278 x reps)</li>
        <li><strong>Lombardi:</strong> carga x reps elevado a 0.10</li>
        </ul>
        <p>Em 5 repetições elas concordam bem. Com 100 kg por 5: Epley dá 116.7, Brzycki 112.5, Lombardi 117.5. Em 10 repetições elas já se distanciam.</p>
        <p>Ou seja, a escolha importa menos que a consistência. Escolha uma, use em todas as séries e compare com os seus próprios números anteriores.</p>`,
      },
      {
        h2: "Para que servem as porcentagens",
        html: `        <p>A maioria dos programas prescreve a carga como porcentagem do máximo: cinco séries de três a 85 por cento, ou três de dez a 70. A tabela acima converte a sua estimativa nessas cargas de trabalho.</p>
        <p>Arredonde para o que a sua academia tem de verdade. Se a tabela diz 87.5 kg e com as anilhas você só monta 85 ou 90, pegue 85 e tente ganhar nas repetições.</p>`,
      },
      {
        h2: "Usando para guiar a progressão",
        html: `        <p>O motivo de acompanhar um máximo estimado é que ele torna séries diferentes comparáveis:</p>
        <ul>
        <li>Semana um: 100 kg x 5. Estimativa cerca de 116.7.</li>
        <li>Semana dois: 90 kg x 10. Estimativa cerca de 120.</li>
        </ul>
        <p>A barra estava mais leve e o desempenho foi melhor. Olhando só a carga, você acharia que regrediu.</p>
        <div class="prompt"><span class="who">Você</span>Agachamento 5x5 com 100 hoje. Qual o meu máximo estimado e ele está subindo?</div>
        <p>Com o AIm conectado, o assistente registra a sessão e responde a partir do seu histórico real.</p>`,
      },
    ],
    faq: [
      {
        q: "Como calcular o meu 1RM?",
        a: "Pegue uma série feita com boa técnica e aplique a fórmula de Epley: carga multiplicada por (1 + repetições divididas por 30). Uma série de 100 kg por 5 dá cerca de 116.7 kg. A calculadora acima faz isso e ainda converte em porcentagens de trabalho.",
      },
      {
        q: "Uma calculadora de 1RM é confiável?",
        a: "Razoavelmente entre 3 e 8 repetições. Acima de 10 ela superestima, porque a série passa a ser limitada pela resistência e não pela força. Use para comparar as suas próprias séries ao longo do tempo.",
      },
      {
        q: "Devo testar o meu máximo real?",
        a: "Raramente, e só se tiver um motivo como competir. Envolve risco de lesão e custa vários dias de treino de qualidade. Uma estimativa a partir de uma série normal dá a mesma informação de tendência toda semana.",
      },
    ],
    cta: {
      title: "Acompanhe a estimativa automaticamente",
      text: "Descreva as suas séries ao Claude ou ao ChatGPT e o AIm registra, calcula o 1RM estimado de cada exercício e mostra a tendência em gráfico.",
    },
  },
  es: {
    title: "Calculadora de 1RM (fórmula de Epley) con tabla de porcentajes",
    description:
      "Calcula tu 1RM estimado a partir de cualquier serie: introduce el peso y las repeticiones. Incluye la fórmula de Epley, una tabla de porcentajes de entrenamiento y una nota honesta sobre su precisión.",
    lead: "Introduce lo que realmente levantaste y obtén un 1RM estimado, junto con los porcentajes de trabajo para programar. No hace falta probar un máximo real.",
    sections: [
      {
        h2: "Calculadora",
        html: CALCULATOR({
          weight: "Peso levantado",
          reps: "Repeticiones hechas",
          result: "1RM estimado",
          pctHeader: "Porcentaje del 1RM",
          weightHeader: "Peso",
          repsHeader: "Repeticiones típicas",
        }),
      },
      {
        h2: "La fórmula",
        html: `        <p>La calculadora usa la fórmula de Epley, la estimación más extendida:</p>
        <p><strong>1RM estimado = peso x (1 + repeticiones / 30)</strong></p>
        <p>Una serie de 100 kg a 5 repeticiones estima un máximo de unos 116.7 kg. Se hace mentalmente en unos segundos, algo útil cuando estás en el gimnasio sin el teléfono.</p>
        <p>Es la misma fórmula que AIm usa internamente, así que la estimación de esta página coincide con la que muestra la aplicación.</p>`,
      },
      {
        h2: "Por qué estimar en vez de probar",
        html: `        <p>Probar un máximo real es útil de vez en cuando y caro a menudo: es un esfuerzo máximo con riesgo de lesión, necesita ayuda en algunos ejercicios y te deja varios días sin poder entrenar bien. Si no compites en un deporte de fuerza, no hay motivo para hacerlo con frecuencia.</p>
        <p>Una estimación a partir de una serie normal no cuesta nada y se recalcula tras cada sesión, así que la tienes cada semana en lugar de una vez por bloque.</p>`,
      },
      {
        h2: "¿Qué precisión tiene?",
        html: `        <p>Buena en el centro, poco fiable en los extremos. Entre 3 y 8 repeticiones suele acercarse. Por encima de 10 tiende a sobreestimar, porque la serie pasa a estar limitada por la resistencia y la técnica más que por la fuerza pura.</p>
        <p>También es individual: quien entrena sobre todo en el rango de 8 a 12 suele quedarse por debajo de su estimación el día de la verdad.</p>
        <p>Tómalo como una forma de comparar tus propias series a lo largo del tiempo, no como una predicción de lo que levantarías hoy.</p>`,
      },
      {
        h2: "Para qué sirven los porcentajes",
        html: `        <p>La mayoría de programas prescriben la carga como porcentaje del máximo: cinco series de tres al 85 por ciento, o tres de diez al 70. La tabla de arriba convierte tu estimación en esos pesos de trabajo.</p>
        <p>Redondea a lo que haya en tu gimnasio. Si la tabla dice 87.5 kg y solo puedes hacer 85 o 90, elige 85 e intenta ganar en repeticiones.</p>`,
      },
      {
        h2: "Cómo ayuda a progresar",
        html: `        <p>Sirve porque hace comparables series distintas:</p>
        <ul>
        <li>Semana uno: 100 kg x 5. Estimación de unos 116.7.</li>
        <li>Semana dos: 90 kg x 10. Estimación de unos 120.</li>
        </ul>
        <p>La barra pesaba menos y el rendimiento fue mejor. Mirando solo el peso parecería un retroceso.</p>
        <div class="prompt"><span class="who">Tú</span>Sentadillas 5x5 con 100. ¿Cuál es mi máximo estimado y está subiendo?</div>
        <p>Con AIm conectado, el asistente registra la serie y responde con tu historial real.</p>`,
      },
    ],
    faq: [
      {
        q: "¿Cómo calculo mi 1RM?",
        a: "Toma una serie hecha con buena técnica y aplica la fórmula de Epley: peso por (1 + repeticiones entre 30). Una serie de 100 kg a 5 da unos 116.7 kg. La calculadora de arriba lo hace y además convierte el resultado en porcentajes de trabajo.",
      },
      {
        q: "¿Es fiable una calculadora de 1RM?",
        a: "Razonablemente entre 3 y 8 repeticiones. Por encima de 10 sobreestima, porque la serie la limita la resistencia y no la fuerza. Úsala para comparar tus propias series en el tiempo.",
      },
      {
        q: "¿Debo probar mi máximo real?",
        a: "Rara vez, y solo si tienes un motivo como competir. Implica riesgo de lesión y varios días de entrenamiento perdidos. Una estimación desde una serie normal da la misma información de tendencia cada semana.",
      },
    ],
    cta: {
      title: "Sigue la estimación automáticamente",
      text: "Describe tus series a Claude o ChatGPT y AIm las registra, calcula el 1RM estimado de cada ejercicio y dibuja la tendencia.",
    },
  },

  fr: {
    title: "Calculateur de 1RM (formule d'Epley) avec table de pourcentages",
    description:
      "Calculez votre 1RM estimé à partir de n'importe quelle série : entrez la charge et les répétitions. Formule d'Epley, table de pourcentages d'entraînement et note honnête sur la précision.",
    lead: "Entrez ce que vous avez réellement soulevé et obtenez un 1RM estimé, ainsi que les pourcentages de travail pour programmer. Pas besoin de tester un maximum réel.",
    sections: [
      {
        h2: "Calculateur",
        html: CALCULATOR({
          weight: "Charge soulevée",
          reps: "Répétitions réalisées",
          result: "1RM estimé",
          pctHeader: "Pourcentage du 1RM",
          weightHeader: "Charge",
          repsHeader: "Répétitions typiques",
        }),
      },
      {
        h2: "La formule",
        html: `        <p>Le calculateur utilise la formule d'Epley, l'estimation la plus répandue :</p>
        <p><strong>1RM estimé = charge x (1 + répétitions / 30)</strong></p>
        <p>Une série de 100 kg à 5 répétitions estime un maximum d'environ 116.7 kg. Cela se calcule de tête en quelques secondes, pratique quand vous êtes à la salle sans téléphone.</p>
        <p>C'est la formule qu'AIm utilise en interne, donc l'estimation de cette page correspond à ce qu'affiche l'application.</p>`,
      },
      {
        h2: "Pourquoi estimer plutôt que tester",
        html: `        <p>Tester un maximum réel est utile de temps en temps et coûteux souvent : effort maximal avec un vrai risque de blessure, un pareur nécessaire sur certains mouvements, et plusieurs jours sans pouvoir s'entraîner correctement ensuite. Si vous ne faites pas de compétition de force, aucune raison de le faire souvent.</p>
        <p>Une estimation à partir d'une série normale ne coûte rien et se recalcule après chaque séance.</p>`,
      },
      {
        h2: "Quelle précision ?",
        html: `        <p>Bonne au milieu, peu fiable aux extrémités. Entre 3 et 8 répétitions l'estimation est en général proche. Au-delà de 10 elle surestime, car la série est alors limitée par l'endurance et la technique plutôt que par la force pure.</p>
        <p>C'est aussi individuel : quelqu'un qui s'entraîne surtout entre 8 et 12 répétitions reste souvent en dessous de son estimation le jour venu.</p>
        <p>Voyez-le comme un moyen de comparer vos propres séries dans le temps, pas comme une prédiction pour aujourd'hui.</p>`,
      },
      {
        h2: "À quoi servent les pourcentages",
        html: `        <p>La plupart des programmes prescrivent la charge en pourcentage du maximum : cinq séries de trois à 85 pour cent, ou trois séries de dix à 70. La table ci-dessus convertit votre estimation en charges de travail.</p>
        <p>Arrondissez à ce que propose votre salle. Si la table indique 87.5 kg et que vous ne pouvez faire que 85 ou 90, prenez 85 et cherchez à gagner en répétitions.</p>`,
      },
      {
        h2: "Comment cela sert la progression",
        html: `        <p>L'intérêt est de rendre comparables des séries différentes :</p>
        <ul>
        <li>Semaine une : 100 kg x 5. Estimation environ 116.7.</li>
        <li>Semaine deux : 90 kg x 10. Estimation environ 120.</li>
        </ul>
        <p>La barre était plus légère et la performance meilleure. En ne regardant que la charge, vous croiriez avoir reculé.</p>
        <div class="prompt"><span class="who">Vous</span>Squat 5x5 à 100. Quel est mon max estimé et est-ce qu'il monte ?</div>
        <p>Avec AIm connecté, l'assistant enregistre la série et répond à partir de votre historique réel.</p>`,
      },
    ],
    faq: [
      {
        q: "Comment calculer mon 1RM ?",
        a: "Prenez une série réalisée avec une bonne technique et appliquez la formule d'Epley : charge multipliée par (1 + répétitions divisées par 30). Une série de 100 kg à 5 donne environ 116.7 kg. Le calculateur ci-dessus le fait et convertit le résultat en pourcentages de travail.",
      },
      {
        q: "Un calculateur de 1RM est-il fiable ?",
        a: "Raisonnablement entre 3 et 8 répétitions. Au-delà de 10 il surestime, car la série est limitée par l'endurance et non par la force. Utilisez-le pour comparer vos propres séries dans le temps.",
      },
      {
        q: "Faut-il tester son maximum réel ?",
        a: "Rarement, et seulement avec une raison comme la compétition. Cela comporte un risque de blessure et coûte plusieurs jours d'entraînement de qualité. Une estimation depuis une série normale donne la même tendance chaque semaine.",
      },
    ],
    cta: {
      title: "Suivez l'estimation automatiquement",
      text: "Décrivez vos séries à Claude ou ChatGPT et AIm les enregistre, calcule le 1RM estimé de chaque exercice et trace la tendance.",
    },
  },
};
