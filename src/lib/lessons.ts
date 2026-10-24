export interface LessonExercise {
  prompt: string;
  placeholder: string;
  answers: string[];
  /** Full-sentence forms accepted for fill-in-the-blank exercises. */
  sentences?: string[];
  hint: string;
  explanation: string;
  note: string;
}

export interface LessonStep {
  title: string;
  body: string[];
  examples: string[];
  exercise: LessonExercise;
}

export interface Lesson {
  id: string;
  title: string;
  goal: string;
  level: "A1" | "A2" | "B1" | "B2";
  focus: string;
  steps: LessonStep[];
}

export const BEGINNER_LEVELS = ["A1", "A2"];

export const isBeginnerLevel = (level: string) => BEGINNER_LEVELS.includes(level);

export const STUDY_FOCUSES = [
  ["free", "Livre"],
  ["to_be", "To be"],
  ["present_simple", "Presente"],
  ["past_simple", "Passado"],
  ["questions", "Perguntas"],
  ["articles", "Artigos"],
  ["prepositions", "Preposições"],
  ["vocabulary", "Vocabulário"],
  ["present_perfect", "Present perfect"],
  ["conditionals", "Condicionais"],
  ["passive", "Voz passiva"],
] as const;

export const focusLabel = (focus: string) =>
  STUDY_FOCUSES.find(([value]) => value === focus)?.[1] ?? "Livre";

/** Answers are stored lowercase for comparison; fix the pronoun for display. */
export const displayAnswer = (answer: string) => answer.trim().replace(/\bi\b/g, "I");

export const LESSONS: Lesson[] = [
  {
    id: "to_be",
    title: "Verbo to be",
    goal: "Ser, estar e se apresentar com am, is e are.",
    level: "A1",
    focus: "to_be",
    steps: [
      {
        title: "O verbo to be",
        body: [
          "O verbo to be significa ser ou estar. No presente, ele muda conforme a pessoa.",
          "I am, you are, he/she/it is, we are, they are.",
        ],
        examples: ["I am tired.", "She is a teacher.", "They are at home."],
        exercise: {
          prompt: "Traduza: Eu sou desenvolvedor.",
          placeholder: "Comece com I am...",
          answers: ["i am a developer", "i'm a developer"],
          hint: "Comece com I am. A profissão precisa do artigo a antes dela.",
          explanation:
            "Em inglês, 'eu sou' vira I am. O verbo to be muda conforme a pessoa, e para I a forma é am. Antes de uma profissão no singular, usamos a: a developer.",
          note: "to be: I am",
        },
      },
      {
        title: "Negando com to be",
        body: [
          "Para negar, coloque not depois do verbo. As contrações são comuns: isn't, aren't.",
          "I am not ready. / He isn't here.",
        ],
        examples: ["He isn't here.", "We aren't late.", "I am not ready."],
        exercise: {
          prompt: "Complete no negativo: She ___ my boss.",
          placeholder: "Verbo to be + not",
          answers: ["isn't", "is not", "isnt"],
          sentences: ["She isn't my boss.", "She is not my boss."],
          hint: "O sujeito é she. Use o verbo to be no negativo e contraia se quiser.",
          explanation:
            "Para negar com to be, colocamos not depois do verbo: she is not. A contração is not → isn't é a forma mais comum na fala.",
          note: "to be negativo: is not / isn't",
        },
      },
      {
        title: "Perguntas com to be",
        body: [
          "Para perguntar, inverta o verbo e o sujeito: Are you...? Is he...?",
          "Respostas curtas: Yes, I am. / No, I'm not.",
        ],
        examples: ["Are you ready?", "Is she a teacher?", "Are they here?"],
        exercise: {
          prompt: "Traduza: Você está cansado?",
          placeholder: "Comece com Are you...",
          answers: ["are you tired"],
          hint: "Pergunta com to be: coloque o verbo antes do sujeito. 'Cansado' em inglês é tired.",
          explanation:
            "Em perguntas com to be, o verbo vem antes do sujeito: are you. O adjetivo tired vem depois, formando Are you tired?.",
          note: "to be pergunta: Are you...?",
        },
      },
    ],
  },
  {
    id: "present_simple",
    title: "Presente simples",
    goal: "Rotina, hábitos e o -s da terceira pessoa.",
    level: "A1",
    focus: "present_simple",
    steps: [
      {
        title: "Rotina e fatos",
        body: [
          "Use o presente simples para rotina, hábitos e fatos.",
          "Com I, you, we e they, o verbo fica igual. Com he, she e it, acrescente -s.",
          "He teaches at a school. / They live in Brazil.",
        ],
        examples: ["She reads every night.", "They live in Brazil.", "He studies here."],
        exercise: {
          prompt: "Complete: He ___ here. (work)",
          placeholder: "Verbo com -s",
          answers: ["works"],
          sentences: ["He works here."],
          hint: "O sujeito é he. No presente simples, a terceira pessoa ganha -s.",
          explanation:
            "Com he, she e it, o verbo recebe -s no presente simples: work → works. Com I, you, we e they, ele fica igual: work.",
          note: "present simple: he/she/it + s",
        },
      },
      {
        title: "Negando no presente",
        body: [
          "Use don't ou doesn't antes do verbo base. O verbo volta à forma normal.",
          "I don't like coffee. / She doesn't live here.",
        ],
        examples: ["I don't like coffee.", "She doesn't live here.", "We don't work on Sundays."],
        exercise: {
          prompt: "Complete no negativo: He ___ tea. (not / like)",
          placeholder: "Auxiliar + verbo base",
          answers: ["doesn't like", "does not like", "doesnt like"],
          sentences: ["He doesn't like tea.", "He does not like tea."],
          hint: "Negativa com he: use doesn't antes do verbo e deixe o verbo na forma base.",
          explanation:
            "Para negar no presente com he, she ou it, usamos doesn't + verbo base. O -s sai do verbo e vai para o auxiliar: he doesn't like.",
          note: "present simple negativo: doesn't + verbo base",
        },
      },
      {
        title: "Perguntas no presente",
        body: [
          "Para perguntar, use Do ou Does no começo. Depois, o verbo base.",
          "Do you speak English? / Does she work here?",
        ],
        examples: ["Do you speak English?", "Does she work here?", "Do they live near you?"],
        exercise: {
          prompt: "Traduza: Você trabalha aqui?",
          placeholder: "Comece com Do you...",
          answers: ["do you work here"],
          hint: "Pergunta no presente com you: comece com Do e use o verbo base.",
          explanation:
            "Perguntas de sim ou não no presente começam com Do ou Does. Com you, usamos Do + you + verbo base: do you work.",
          note: "present simple pergunta: Do you + verbo",
        },
      },
    ],
  },
  {
    id: "past_simple",
    title: "Passado simples",
    goal: "Ontem, semana passada e os irregulares mais comuns.",
    level: "A2",
    focus: "past_simple",
    steps: [
      {
        title: "O passado regular",
        body: [
          "Para verbos regulares, acrescente -ed ao verbo.",
          "O passado costuma aparecer com yesterday, last week e ago. I finished the report yesterday.",
        ],
        examples: ["She called me last night.", "We visited our family.", "They played outside."],
        exercise: {
          prompt: "Complete: I ___ late yesterday. (work)",
          placeholder: "Verbo no passado",
          answers: ["worked"],
          sentences: ["I worked late yesterday."],
          hint: "O verbo é regular. Para o passado, acrescente -ed.",
          explanation:
            "No passado simples, verbos regulares recebem -ed: work → worked. O passado fica igual para todas as pessoas.",
          note: "past simple regular: verbo + ed",
        },
      },
      {
        title: "Irregulares comuns",
        body: [
          "Muitos verbos comuns são irregulares: go → went, see → saw, have → had, do → did, eat → ate.",
          "Não use -ed nesses verbos.",
        ],
        examples: ["We ate pizza.", "She saw a movie.", "They went home early."],
        exercise: {
          prompt: "Traduza: Eu fui à praia ontem.",
          placeholder: "Comece com I...",
          answers: ["i went to the beach", "yesterday i went to the beach"],
          hint: "O verbo go é irregular no passado. Ele não recebe -ed.",
          explanation:
            "Go é irregular: o passado é went. Frases de passado costumam trazer uma marca de tempo, como yesterday.",
          note: "past simple irregular: go → went",
        },
      },
      {
        title: "Negando e perguntando no passado",
        body: [
          "Use didn't + verbo base para negar. Para perguntar, use Did + sujeito + verbo base.",
          "O verbo principal não vai para o passado quando did aparece. I didn't call him last night.",
        ],
        examples: ["I didn't call him.", "She didn't come.", "They didn't stay."],
        exercise: {
          prompt: "Complete no negativo: I ___ to the party. (not / go)",
          placeholder: "Auxiliar + verbo base",
          answers: ["didn't go", "did not go", "didnt go"],
          sentences: ["I didn't go to the party.", "I did not go to the party."],
          hint: "Negativa no passado: didn't + verbo base. O verbo não vai para o passado.",
          explanation:
            "Para negar no passado, usamos didn't + verbo base. Como did já marca o passado, go continua go: didn't go.",
          note: "past simple negativo: didn't + verbo base",
        },
      },
    ],
  },
  {
    id: "questions",
    title: "Perguntas",
    goal: "Do, does, did e a ordem das perguntas com wh-.",
    level: "A2",
    focus: "questions",
    steps: [
      {
        title: "Perguntas de sim ou não",
        body: [
          "No presente, comece com Do ou Does. No passado, comece com Did.",
          "A ordem é: auxiliar + sujeito + verbo.",
        ],
        examples: ["Do you speak English?", "Does he work here?", "Did they call you?"],
        exercise: {
          prompt: "Complete: ___ you like pizza?",
          placeholder: "Auxiliar",
          answers: ["do", "do you like pizza"],
          sentences: ["Do you like pizza?"],
          hint: "A pergunta é sobre gostar. Use o auxiliar Do no começo.",
          explanation:
            "Perguntas de sim ou não no presente começam com Do ou Does. Com you, o auxiliar é Do e o verbo fica na forma base.",
          note: "pergunta no presente: Do + sujeito",
        },
      },
      {
        title: "Perguntas com wh-",
        body: [
          "What, where, when, who, why e how pedem uma informação específica.",
          "A ordem é: palavra + auxiliar + sujeito + verbo.",
        ],
        examples: ["Where do you work?", "What did you eat?", "Why are you tired?"],
        exercise: {
          prompt: "Traduza: Onde você mora?",
          placeholder: "Comece com Where...",
          answers: ["where do you live"],
          hint: "A palavra de lugar é where. A pergunta usa do + sujeito + verbo.",
          explanation:
            "Em perguntas com wh-, a ordem é palavra + auxiliar + sujeito + verbo. Para morar, usamos live: where do you live.",
          note: "wh-question: where + do + sujeito",
        },
      },
      {
        title: "Montando a pergunta",
        body: [
          "Coloque as palavras na ordem certa. O auxiliar vem antes do sujeito.",
          "Where does she live? / When did they arrive?",
        ],
        examples: ["Where does she live?", "When did they arrive?", "What do you do?"],
        exercise: {
          prompt: "Ordene: you / where / do / work",
          placeholder: "Comece com Where...",
          answers: ["where do you work"],
          hint: "Comece pela palavra where. O auxiliar do vem antes do sujeito you.",
          explanation:
            "A ordem da pergunta é where + do + you + work. O auxiliar vem antes do sujeito e o verbo fica na forma base.",
          note: "ordem da pergunta: where + do + you + work",
        },
      },
    ],
  },
  {
    id: "articles",
    title: "Artigos e plural",
    goal: "A, an, the e o plural das palavras comuns.",
    level: "A1",
    focus: "articles",
    steps: [
      {
        title: "a, an e the",
        body: [
          "Use a antes de som de consoante e an antes de som de vogal.",
          "Use the quando a coisa é específica ou já foi mencionada.",
        ],
        examples: ["I need a pen.", "She is an engineer.", "The pen is on the table."],
        exercise: {
          prompt: "Complete: I need ___ umbrella.",
          placeholder: "a / an / the",
          answers: ["an", "an umbrella"],
          sentences: ["I need an umbrella."],
          hint: "Pense no som da primeira letra de umbrella. Ela começa com som de vogal.",
          explanation:
            "Usamos an antes de som de vogal e a antes de som de consoante. Umbrella começa com som de vogal, então an.",
          note: "artigo: an antes de som de vogal",
        },
      },
      {
        title: "Plural",
        body: [
          "Normalmente acrescente -s. Terminando em -s, -sh, -ch, -x ou -o, use -es.",
          "Alguns plurais são irregulares: man → men, child → children, woman → women.",
        ],
        examples: ["two books", "three boxes", "two women"],
        exercise: {
          prompt: "Complete: There are two ___ here. (child)",
          placeholder: "Plural de child",
          answers: ["children"],
          sentences: ["There are two children here."],
          hint: "Child tem plural irregular. Ele não termina em -s.",
          explanation:
            "Alguns plurais são irregulares e não seguem a regra do -s. Child vira children.",
          note: "plural irregular: child → children",
        },
      },
      {
        title: "a/an e the na frase",
        body: [
          "Na primeira menção, use a/an. Quando repetir, use the.",
          "I saw a car. The car was new.",
        ],
        examples: [
          "I saw a car. The car was new.",
          "She bought a dress. The dress is beautiful.",
          "He met a friend. The friend was late.",
        ],
        exercise: {
          prompt: "Traduza: Eu vi um cachorro. O cachorro era grande.",
          placeholder: "Comece com I saw...",
          answers: ["i saw a dog the dog was big", "i saw a dog and the dog was big"],
          hint: "Na primeira menção, use a. Quando falar do mesmo cachorro de novo, use the.",
          explanation:
            "Usamos a/an na primeira vez que mencionamos algo e the quando a coisa já é conhecida. Assim, a dog na primeira frase e the dog na segunda.",
          note: "a/an na primeira menção, the depois",
        },
      },
    ],
  },
  {
    id: "prepositions",
    title: "Preposições",
    goal: "In, on e at para tempo e lugar.",
    level: "A1",
    focus: "prepositions",
    steps: [
      {
        title: "in, on e at para tempo",
        body: [
          "in + mês, ano ou período; on + dia ou data; at + hora.",
          "in July, on Tuesday, at 8 o'clock",
        ],
        examples: ["My birthday is in July.", "I wake up at 7.", "My English class is on Tuesday."],
        exercise: {
          prompt: "Complete: The meeting is ___ Monday.",
          placeholder: "in / on / at",
          answers: ["on", "on monday"],
          sentences: ["The meeting is on Monday."],
          hint: "Monday é um dia da semana. Para dias, use on.",
          explanation:
            "Para tempo, usamos in com meses e anos, on com dias e datas, e at com horas. Monday pede on.",
          note: "preposição de tempo: on + dia",
        },
      },
      {
        title: "in, on e at para lugar",
        body: [
          "in + cidade, país ou espaço fechado; on + superfície; at + ponto ou lugar específico.",
          "in Japan, on the table, at work",
        ],
        examples: ["She lives in Brazil.", "The book is on the table.", "He is at work."],
        exercise: {
          prompt: "Complete: I am ___ home.",
          placeholder: "in / on / at",
          answers: ["at", "at home"],
          sentences: ["I am at home."],
          hint: "Home é um ponto de referência, não um espaço fechado. Use at.",
          explanation:
            "At aparece em expressões fixas de lugar, como at home e at work. In indica dentro de um espaço e on uma superfície.",
          note: "preposição de lugar: at home",
        },
      },
      {
        title: "Escolhendo a preposição",
        body: [
          "Pense no tipo de lugar ou tempo antes de escolher.",
          "in = dentro/área; on = superfície/dia; at = ponto/hora.",
        ],
        examples: [
          "They live in a small city.",
          "The keys are on the desk.",
          "We met at the station.",
        ],
        exercise: {
          prompt: "Complete: She lives ___ Brazil.",
          placeholder: "in / on / at",
          answers: ["in", "in brazil"],
          sentences: ["She lives in Brazil."],
          hint: "Brazil é um país. Para países, use in.",
          explanation:
            "Usamos in antes de cidades, países e espaços fechados: in Brazil, in Japan. On fica para superfícies e at para pontos específicos.",
          note: "preposição de lugar: in + país",
        },
      },
    ],
  },
  {
    id: "vocabulary",
    title: "Vocabulário do dia a dia",
    goal: "Rotina, trabalho e comida com frases curtas.",
    level: "A1",
    focus: "vocabulary",
    steps: [
      {
        title: "Sua rotina",
        body: [
          "Comece pelo que você faz todo dia: wake up, have breakfast, go to work.",
          "Use o presente simples para a rotina.",
        ],
        examples: ["I wake up early.", "I have breakfast at home.", "I go to work by bus."],
        exercise: {
          prompt: "Traduza: Eu acordo às 7.",
          placeholder: "Comece com I wake up...",
          answers: ["i wake up at 7", "i wake up at seven"],
          hint: "Acordar é wake up. A hora usa at.",
          explanation:
            "Para rotina, usamos o presente simples: I wake up. A hora entra com at: at 7.",
          note: "rotina: wake up at + hora",
        },
      },
      {
        title: "No trabalho",
        body: [
          "Palavras úteis: meeting, deadline, colleague, project.",
          "Para dizer que tem algo: I have a meeting.",
        ],
        examples: ["I have a meeting today.", "My deadline is today.", "She is a colleague."],
        exercise: {
          prompt: "Traduza: Eu tenho uma reunião às 10.",
          placeholder: "Comece com I have...",
          answers: ["i have a meeting at 10", "i have a meeting at ten"],
          hint: "Reunião é meeting. Para dizer a hora, use at.",
          explanation:
            "I have a meeting significa 'eu tenho uma reunião'. A hora entra com at: at 10.",
          note: "trabalho: have a meeting at + hora",
        },
      },
      {
        title: "Comida e café",
        body: [
          "Palavras úteis: breakfast, lunch, dinner, coffee, water.",
          "Use I drink / I eat no presente.",
        ],
        examples: ["I drink water after lunch.", "I eat lunch at noon.", "I have dinner at home."],
        exercise: {
          prompt: "Traduza: Eu bebo café de manhã.",
          placeholder: "Comece com I drink...",
          answers: ["i drink coffee in the morning"],
          hint: "Beber é drink. 'De manhã' é in the morning.",
          explanation:
            "Usamos o presente simples para hábitos: I drink coffee. O período do dia leva in the morning.",
          note: "comida: drink coffee in the morning",
        },
      },
    ],
  },
  {
    id: "present_perfect",
    title: "Present perfect",
    goal: "Experiências, resultados e a diferença entre for e since.",
    level: "B1",
    focus: "present_perfect",
    steps: [
      {
        title: "Experiências e resultados",
        body: [
          "Use have/has + particípio para falar de experiências e de resultados que importam agora.",
          "Com I, you, we e they: have. Com he, she e it: has.",
        ],
        examples: ["I have visited London.", "They have eaten already.", "He has lost his keys."],
        exercise: {
          prompt: "Complete: She ___ (finish) the report.",
          placeholder: "has + particípio",
          answers: ["has finished"],
          sentences: ["She has finished the report."],
          hint: "O sujeito é she. Use has e o particípio de finish.",
          explanation:
            "Com she, usamos has + particípio. O particípio de finish é finished, então a frase fica has finished.",
          note: "present perfect: has + particípio",
        },
      },
      {
        title: "For e since",
        body: [
          "Use for com um período (for three years) e since com um ponto no tempo (since 2019).",
          "Os dois aparecem com o present perfect para falar de algo que começou no passado e continua.",
        ],
        examples: [
          "I have worked here for three years.",
          "She has known him since school.",
          "We have lived here since 2020.",
        ],
        exercise: {
          prompt: "Complete: I have lived here ___ 2019.",
          placeholder: "for / since",
          answers: ["since"],
          sentences: ["I have lived here since 2019."],
          hint: "2019 é um ponto de partida, não um período.",
          explanation:
            "Since marca quando algo começou; for marca quanto tempo durou. 2019 é um ponto no tempo, então usamos since.",
          note: "for + período, since + ponto",
        },
      },
      {
        title: "Negativas e perguntas",
        body: [
          "Negue com haven't/hasn't + particípio. Pergunte com Have/Has + sujeito + particípio.",
          "I haven't seen it. / Has she called you?",
        ],
        examples: [
          "I haven't seen that movie.",
          "Has she called you?",
          "They haven't arrived yet.",
        ],
        exercise: {
          prompt: "Complete: ___ you ever eaten sushi?",
          placeholder: "Have / Has",
          answers: ["have"],
          sentences: ["Have you ever eaten sushi?"],
          hint: "O sujeito é you. O auxiliar do present perfect é have.",
          explanation:
            "Perguntas no present perfect começam com Have ou Has. Com you, usamos Have: Have you ever eaten sushi?",
          note: "present perfect pergunta: Have you...?",
        },
      },
    ],
  },
  {
    id: "conditionals",
    title: "Condicionais",
    goal: "If, will, would e unless em situações reais e imaginárias.",
    level: "B1",
    focus: "conditionals",
    steps: [
      {
        title: "Primeira condicional",
        body: [
          "Use if + presente para uma condição possível, e will + verbo base para o resultado.",
          "A condição acontece primeiro; o resultado vem depois.",
        ],
        examples: [
          "If you study, you will pass.",
          "She will call if she needs help.",
          "If it is sunny, we will walk.",
        ],
        exercise: {
          prompt: "Complete: If it rains, I ___ (stay) home.",
          placeholder: "will + verbo base",
          answers: ["will stay"],
          sentences: ["If it rains, I will stay home."],
          hint: "A condição está no presente. O resultado usa will + verbo base.",
          explanation:
            "Na primeira condicional, a parte com if fica no presente e a consequência usa will + verbo base: will stay.",
          note: "1st conditional: if + presente, will + base",
        },
      },
      {
        title: "Segunda condicional",
        body: [
          "Use if + passado simples para uma situação imaginária, e would + verbo base no resultado.",
          "A situação não é real agora, mas imaginamos o que aconteceria.",
        ],
        examples: [
          "If I knew the answer, I would tell you.",
          "She would move if she found a job.",
          "If we had a car, we would drive.",
        ],
        exercise: {
          prompt: "Complete: If I ___ (have) more time, I would travel.",
          placeholder: "Passado de have",
          answers: ["had"],
          sentences: ["If I had more time, I would travel."],
          hint: "A consequência usa would. A condição imaginária pede o passado de have.",
          explanation:
            "Na segunda condicional, a parte com if vai para o passado simples: I had. O resultado usa would + verbo base.",
          note: "2nd conditional: if + passado, would + base",
        },
      },
      {
        title: "Unless e condição negativa",
        body: [
          "Unless significa 'a menos que' e já carrega a ideia de if not.",
          "Unless you leave now = if you do not leave now.",
        ],
        examples: [
          "Unless we leave now, we will be late.",
          "You will be late unless you leave now.",
          "Unless she calls, I will not go.",
        ],
        exercise: {
          prompt: "Complete: You will miss the bus ___ you hurry.",
          placeholder: "if / unless",
          answers: ["unless"],
          sentences: ["You will miss the bus unless you hurry."],
          hint: "A frase diz que você perde o ônibus se não correr. Use a palavra que significa 'a menos que'.",
          explanation:
            "Unless introduz a condição negativa: unless you hurry = if you do not hurry.",
          note: "unless = if not",
        },
      },
    ],
  },
  {
    id: "passive",
    title: "Voz passiva",
    goal: "Falar da ação sem começar por quem a fez.",
    level: "B2",
    focus: "passive",
    steps: [
      {
        title: "Presente passivo",
        body: [
          "No passivo, o foco está na ação ou no objeto. A forma é am/is/are + particípio.",
          "O agente só aparece se for importante.",
        ],
        examples: [
          "English is spoken here.",
          "The emails are sent daily.",
          "This room is cleaned every morning.",
        ],
        exercise: {
          prompt: "Complete: The report ___ (write) every week.",
          placeholder: "is + particípio",
          answers: ["is written"],
          sentences: ["The report is written every week."],
          hint: "O sujeito é the report, singular. Use is e o particípio de write.",
          explanation:
            "No presente passivo, usamos is + particípio com sujeito singular. O particípio de write é written.",
          note: "passive present: is + particípio",
        },
      },
      {
        title: "Passado passivo",
        body: [
          "No passado, a forma é was/were + particípio.",
          "Was para sujeito singular; were para plural.",
        ],
        examples: [
          "The cake was made yesterday.",
          "The letters were delivered.",
          "The house was painted last year.",
        ],
        exercise: {
          prompt: "Complete: The bridge ___ (build) in 1990.",
          placeholder: "was + particípio",
          answers: ["was built"],
          sentences: ["The bridge was built in 1990."],
          hint: "O sujeito é singular e o tempo é passado. Use was e o particípio de build.",
          explanation:
            "No passado passivo, usamos was + particípio para sujeito singular. Build é irregular: build → built.",
          note: "passive past: was + particípio",
        },
      },
      {
        title: "Passivo com agente",
        body: [
          "Quando queremos dizer quem fez a ação, usamos by + agente no fim.",
          "The song was composed by her.",
        ],
        examples: [
          "The book was written by a teacher.",
          "The song was composed by her.",
          "The window was broken by the kids.",
        ],
        exercise: {
          prompt: "Complete: My bike ___ (steal) yesterday.",
          placeholder: "was + particípio",
          answers: ["was stolen"],
          sentences: ["My bike was stolen yesterday."],
          hint: "O sujeito é my bike, singular, e o tempo é passado. Use was e o particípio de steal.",
          explanation:
            "My bike sofre a ação, então usamos o passivo: was stolen. Steal é irregular: steal → stole → stolen.",
          note: "passive: was + particípio (+ by ...)",
        },
      },
    ],
  },
];
