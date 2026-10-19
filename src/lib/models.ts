export type Modality = 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO';

export interface AIModel {
  kind?: "chat" | "image" | "video" | "tts" | "stt" | "realtime";
  id: string;
  name: string;
  provider: string; // e.g. 'xAI', 'OpenAI', 'Anthropic'
  description: string;
  inputModalities: Modality[];
  outputModalities: Modality[];
  pricing?: {
    prompt?: number;
    completion?: number;
    image?: number;
    video?: number;
    audio?: number;
    audioUnit?: string;
    textInput?: number;
    characters?: number;
    dynamic?: boolean; // Флаг того, что цена меняется от настроек
  };
  contextWindow?: number;
  maxAttachments?: number; // if undefined, practically unlimited
  supportedParams?: {
    reasoningEfforts?: string[];
    resolutions?: string[];
  };
}

export const xaiModels: AIModel[] = [
  // Language & Reasoning Models
  {
    id: 'grok-4.7',
    name: 'Grok 4.7',
    provider: 'xAI',
    description: 'Самая передовая мультимодальная модель для сложных задач.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['TEXT'],
    pricing: { prompt: 2.00, completion: 6.00, dynamic: true },
    contextWindow: 500000,
    maxAttachments: 50,
    supportedParams: { reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  },
  {
    id: 'grok-4.6',
    name: 'Grok 4.6',
    provider: 'xAI',
    description: 'Оптимизированная мощная мультимодальная модель.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['TEXT'],
    pricing: { prompt: 2.00, completion: 6.00, dynamic: true },
    contextWindow: 500000,
    maxAttachments: 50,
    supportedParams: { reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  },
  {
    id: 'grok-4.5',
    name: 'Grok 4.5',
    provider: 'xAI',
    description: 'Популярная текстовая и мультимодальная модель.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['TEXT'],
    pricing: { prompt: 2.00, completion: 6.00, dynamic: true },
    contextWindow: 500000,
    maxAttachments: 50,
    supportedParams: { reasoningEfforts: ['low', 'medium', 'high'] },
  },
  {
    id: 'grok-4.3',
    name: 'Grok 4.3',
    provider: 'xAI',
    description: 'Быстрая и эффективная текстовая модель.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['TEXT'],
    pricing: { prompt: 1.25, completion: 2.50, dynamic: true },
    contextWindow: 1000000,
    maxAttachments: 50,
    supportedParams: { reasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh'] },
  },
  {
    id: 'grok-4.20-0309-reasoning',
    name: 'Grok 4.20 Reasoning',
    provider: 'xAI',
    description: 'Продвинутая модель с глубокой цепочкой рассуждений (Reasoning) для математики и логики.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['TEXT'],
    pricing: { prompt: 1.25, completion: 2.50, dynamic: true },
    contextWindow: 1000000,
    maxAttachments: 50,
  },
  {
    id: 'grok-4.20-0309-non-reasoning',
    name: 'Grok 4.20 Non-Reasoning',
    provider: 'xAI',
    description: 'Быстрая версия Grok 4.20 без глубоких цепочек рассуждений.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['TEXT'],
    pricing: { prompt: 1.25, completion: 2.50, dynamic: true },
    contextWindow: 1000000,
    maxAttachments: 50,
  },
  {
    id: 'grok-4.20-multi-agent-0309',
    name: 'Grok 4.20 Multi-Agent',
    provider: 'xAI',
    description: 'Специальная версия для координации нескольких ИИ-агентов.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['TEXT'],
    pricing: { prompt: 1.25, completion: 2.50, dynamic: true },
    contextWindow: 1000000,
    maxAttachments: 50,
    supportedParams: { reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  },
  {
    id: 'grok-build-0.1',
    name: 'Grok Build 0.1',
    provider: 'xAI',
    description: 'Специализированная и сверхбыстрая модель для генерации кода (Grok Code Fast).',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['TEXT'],
    pricing: { prompt: 1.00, completion: 2.00, dynamic: true },
    contextWindow: 256000,
    maxAttachments: 50,
  },
  
  // Image Generation Models
  {
    id: 'grok-imagine-image-quality',
    name: 'Grok Imagine Pro',
    provider: 'xAI',
    description: 'Создание изображений максимального качества и реализма.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['IMAGE'],
    pricing: { image: 0.05, dynamic: true },
    maxAttachments: 3,
    supportedParams: { resolutions: ['1k', '1.5k', '2k'] },
  },
  {
    id: 'grok-imagine-image-2.0',
    name: 'Grok Imagine 2.0',
    provider: 'xAI',
    description: 'Генерация высококачественных изображений 2-го поколения.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['IMAGE'],
    pricing: { image: 0.04, dynamic: true },
    maxAttachments: 5,
    supportedParams: { resolutions: ['1k', '1.5k', '2k'] },
  },
  {
    id: 'grok-imagine-image',
    name: 'Grok Imagine',
    provider: 'xAI',
    description: 'Классическая модель для создания изображений.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['IMAGE'],
    pricing: { image: 0.02, dynamic: true },
    maxAttachments: 3,
    supportedParams: { resolutions: ['1k', '2k'] },
  },
  
  // Video Generation Models
  {
    id: 'grok-imagine-video-1.5',
    name: 'Grok Imagine Video 1.5',
    provider: 'xAI',
    description: 'Генерация видео по тексту и изображениям. Поддерживает закреплённые кадры и встроенные голоса; аудиофайлы-референсы доступны отдельным партнёрам xAI.',
    inputModalities: ['TEXT', 'IMAGE', 'AUDIO'],
    outputModalities: ['VIDEO'],
    pricing: { video: 0.08, dynamic: true },
    maxAttachments: 13,
  },
  {
    id: 'grok-imagine-video-1.5-lite',
    name: 'Grok Imagine Video 1.5 Lite',
    provider: 'xAI',
    description: 'Быстрая генерация видео со звуком по тексту и одному изображению (до 1080p апскейлом с 720p). Референсы, ключевые кадры и редактирование не поддерживаются.',
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['VIDEO'],
    pricing: { video: 0.02, dynamic: true },
    maxAttachments: 1,
    supportedParams: { resolutions: ['480p', '720p', '1080p'] },
  },
  {
    id: 'grok-imagine-video',
    name: 'Grok Imagine Video',
    provider: 'xAI',
    description: 'Базовая генерация видео.',
    inputModalities: ['TEXT', 'IMAGE', 'VIDEO'],
    outputModalities: ['VIDEO'],
    pricing: { video: 0.05, dynamic: true },
    maxAttachments: 7,
  },

  // Audio Models
  {
    id: 'grok-voice-think-fast-2.0',
    kind: 'realtime',
    name: 'Grok Voice Think Fast 2.0',
    provider: 'xAI',
    description: 'Быстрая двусторонняя потоковая аудио-коммуникация.',
    inputModalities: ['TEXT', 'AUDIO'],
    outputModalities: ['TEXT', 'AUDIO'],
    pricing: { audio: 4.80, audioUnit: 'час', textInput: 0.004 },
    maxAttachments: 1,
  },
  {
    id: 'grok-voice-transcribe-2.0',
    kind: 'stt',
    name: 'Grok Voice Transcribe 2.0',
    provider: 'xAI',
    description: 'Точное распознавание речи и транскрибация аудио (2-е поколение).',
    inputModalities: ['AUDIO'],
    outputModalities: ['TEXT'],
    pricing: { audio: 0.10, audioUnit: 'час' },
    maxAttachments: 1,
  },
  {
    id: 'grok-tts',
    kind: 'tts',
    name: 'Grok TTS (Text-to-Speech)',
    provider: 'xAI',
    description: 'Преобразование текста в реалистичную речь. Поддерживает инлайн-теги экспрессии (например, <whisper>, <emphasis>, [pause]).',
    inputModalities: ['TEXT'],
    outputModalities: ['AUDIO'],
    pricing: { characters: 15 },
    maxAttachments: 0, 
  }
];

export function modelKind(model: AIModel) {
  return model.kind ?? (model.outputModalities.includes("VIDEO") ? "video" : model.outputModalities.includes("IMAGE") ? "image" : "chat");
}
