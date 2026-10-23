export interface LessonExercise {
  prompt: string;
  placeholder: string;
  answers: string[];
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
  level: "A1" | "A2";
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
] as const;

export const focusLabel = (focus: string) =>
  STUDY_FOCUSES.find(([value]) => value === focus)?.[1] ?? "Livre";

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
        examples: ["I am a developer.", "She is tired.", "They are at home."],
        exercise: {
          prompt: "Traduza: Eu sou desenvolvedor.",
          placeholder: "I am...",
          answers: ["i am a developer", "i'm a developer"],
          note: "to be: I am",
        },
      },
      {
        title: "Negando com to be",
        body: [
          "Para negar, coloque not depois do verbo. As contrações são comuns: isn't, aren't.",
          "I am not ready. / He isn't here.",
        ],
        examples: ["I am not ready.", "He isn't here.", "We aren't late."],
        exercise: {
          prompt: "Complete no negativo: She ___ my boss.",
          placeholder: "isn't...",
          answers: ["isn't", "is not", "isnt"],
          note: "to be negativo: is not / isn't",
        },
      },
      {
        title: "Perguntas com to be",
        body: [
          "Para perguntar, inverta o verbo e o sujeito: Are you...? Is he...?",
          "Respostas curtas: Yes, I am. / No, I'm not.",
        ],
        examples: ["Are you tired?", "Is she a teacher?", "Are they here?"],
        exercise: {
          prompt: "Traduza: Você está cansado?",
          placeholder: "Are you...",
          answers: ["are you tired"],
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
        ],
        examples: ["I work every day.", "She works at a bank.", "They live in Brazil."],
        exercise: {
          prompt: "Complete: He ___ here. (work)",
          placeholder: "work...",
          answers: ["works"],
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
          placeholder: "doesn't...",
          answers: ["doesn't like", "does not like", "doesnt like"],
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
          placeholder: "Do you...",
          answers: ["do you work here"],
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
          "O passado costuma aparecer com yesterday, last week e ago.",
        ],
        examples: [
          "I worked late yesterday.",
          "She called me last night.",
          "We visited our family.",
        ],
        exercise: {
          prompt: "Complete: I ___ late yesterday. (work)",
          placeholder: "work...",
          answers: ["worked"],
          note: "past simple regular: verbo + ed",
        },
      },
      {
        title: "Irregulares comuns",
        body: [
          "Muitos verbos comuns são irregulares: go → went, see → saw, have → had, do → did, eat → ate.",
          "Não use -ed nesses verbos.",
        ],
        examples: ["I went to the beach yesterday.", "We ate pizza.", "She saw a movie."],
        exercise: {
          prompt: "Traduza: Eu fui à praia ontem.",
          placeholder: "I went...",
          answers: ["i went to the beach", "yesterday i went to the beach"],
          note: "past simple irregular: go → went",
        },
      },
      {
        title: "Negando e perguntando no passado",
        body: [
          "Use didn't + verbo base para negar. Para perguntar, use Did + sujeito + verbo base.",
          "O verbo principal não vai para o passado quando did aparece.",
        ],
        examples: ["I didn't go to the party.", "Did you see the game?", "She didn't call me."],
        exercise: {
          prompt: "Complete no negativo: I ___ to the party. (not / go)",
          placeholder: "didn't...",
          answers: ["didn't go", "did not go", "didnt go"],
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
        examples: ["Do you like pizza?", "Does he work here?", "Did they call you?"],
        exercise: {
          prompt: "Complete: ___ you like pizza?",
          placeholder: "Do...",
          answers: ["do", "do you like pizza"],
          note: "pergunta no presente: Do + sujeito",
        },
      },
      {
        title: "Perguntas com wh-",
        body: [
          "What, where, when, who, why e how pedem uma informação específica.",
          "A ordem é: palavra + auxiliar + sujeito + verbo.",
        ],
        examples: ["Where do you live?", "What did you eat?", "Why are you tired?"],
        exercise: {
          prompt: "Traduza: Onde você mora?",
          placeholder: "Where...",
          answers: ["where do you live"],
          note: "wh-question: where + do + sujeito",
        },
      },
      {
        title: "Montando a pergunta",
        body: [
          "Coloque as palavras na ordem certa. O auxiliar vem antes do sujeito.",
          "Where do you work? / When did she arrive?",
        ],
        examples: ["Where do you work?", "When did she arrive?", "What do you do?"],
        exercise: {
          prompt: "Ordene: you / where / do / work",
          placeholder: "Where...",
          answers: ["where do you work"],
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
          note: "artigo: an antes de som de vogal",
        },
      },
      {
        title: "Plural",
        body: [
          "Normalmente acrescente -s. Terminando em -s, -sh, -ch, -x ou -o, use -es.",
          "Alguns plurais são irregulares: man → men, child → children, woman → women.",
        ],
        examples: ["two books", "three boxes", "two children"],
        exercise: {
          prompt: "Complete: There are two ___ here. (child)",
          placeholder: "child...",
          answers: ["children"],
          note: "plural irregular: child → children",
        },
      },
      {
        title: "a/an e the na frase",
        body: [
          "Na primeira menção, use a/an. Quando repetir, use the.",
          "I saw a dog. The dog was big.",
        ],
        examples: ["I saw a dog. The dog was big.", "She bought a car. The car is new."],
        exercise: {
          prompt: "Traduza: Eu vi um cachorro. O cachorro era grande.",
          placeholder: "I saw...",
          answers: ["i saw a dog the dog was big", "i saw a dog and the dog was big"],
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
          "in July, on Monday, at 8 o'clock",
        ],
        examples: ["My birthday is in July.", "The meeting is on Monday.", "I wake up at 7."],
        exercise: {
          prompt: "Complete: The meeting is ___ Monday.",
          placeholder: "in / on / at",
          answers: ["on", "on monday"],
          note: "preposição de tempo: on + dia",
        },
      },
      {
        title: "in, on e at para lugar",
        body: [
          "in + cidade, país ou espaço fechado; on + superfície; at + ponto ou lugar específico.",
          "in Brazil, on the table, at home",
        ],
        examples: ["She lives in Brazil.", "The book is on the table.", "I am at home."],
        exercise: {
          prompt: "Complete: I am ___ home.",
          placeholder: "in / on / at",
          answers: ["at", "at home"],
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
          "We met at the station on Friday.",
          "They live in a small city.",
          "The keys are on the desk.",
        ],
        exercise: {
          prompt: "Complete: She lives ___ Brazil.",
          placeholder: "in / on / at",
          answers: ["in", "in brazil"],
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
        examples: ["I wake up at 7.", "I have breakfast at home.", "I go to work by bus."],
        exercise: {
          prompt: "Traduza: Eu acordo às 7.",
          placeholder: "I wake up...",
          answers: ["i wake up at 7", "i wake up at seven"],
          note: "rotina: wake up at + hora",
        },
      },
      {
        title: "No trabalho",
        body: [
          "Palavras úteis: meeting, deadline, colleague, project.",
          "Para dizer que tem algo: I have a meeting.",
        ],
        examples: ["I have a meeting at 10.", "My deadline is today.", "She is a colleague."],
        exercise: {
          prompt: "Traduza: Eu tenho uma reunião às 10.",
          placeholder: "I have...",
          answers: ["i have a meeting at 10", "i have a meeting at ten"],
          note: "trabalho: have a meeting at + hora",
        },
      },
      {
        title: "Comida e café",
        body: [
          "Palavras úteis: breakfast, lunch, dinner, coffee, water.",
          "Use I drink / I eat no presente.",
        ],
        examples: [
          "I drink coffee in the morning.",
          "I eat lunch at noon.",
          "I have dinner at home.",
        ],
        exercise: {
          prompt: "Traduza: Eu bebo café de manhã.",
          placeholder: "I drink...",
          answers: ["i drink coffee in the morning"],
          note: "comida: drink coffee in the morning",
        },
      },
    ],
  },
];
