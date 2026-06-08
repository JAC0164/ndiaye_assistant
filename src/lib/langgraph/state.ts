import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';

export const dayOfWeekSchema = z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

export const sessionTypeSchema = z.enum(['td', 'review', 'break']);

export const generatedSeanceSchema = z.object({
  day_of_week: dayOfWeekSchema.describe('Jour de la semaine cyclique.'),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .describe('Heure locale de début au format HH:mm.'),
  end_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .describe('Heure locale de fin au format HH:mm.'),
  subject: z.string().min(1).describe('Matière officielle ou activité.'),
  session_type: sessionTypeSchema.describe('Type de séance.'),
  pedagogical_note: z.string().describe('Note pédagogique courte pour guider la séance.'),
});

export const visionAgentOutputSchema = z.object({
  isValid: z.boolean(),
  timetableMarkdown: z.string(),
});

export const profileAgentOutputSchema = z.object({
  studentProfileContext: z.string(),
});

export const plannerAgentOutputSchema = z.object({
  sessions: z.array(generatedSeanceSchema),
});

export type GeneratedSeance = z.infer<typeof generatedSeanceSchema>;

export interface PlanningGraphState {
  timetableImage: Buffer | string;
  timetableImageMimeType: string;
  onboardingData: unknown;
  extractedTimetableMarkdown: string;
  studentProfileContext: string;
  subjectCoefficients: string;
  weeklyStats: string;
  upcomingEcheances: string;
  isValidTimetable: boolean;
  validationErrorMessage?: string;
  generatedPlanning: GeneratedSeance[];
}

export const PlanningGraphAnnotation = Annotation.Root({
  timetableImage: Annotation<Buffer | string>(),
  timetableImageMimeType: Annotation<string>({
    reducer: (_current, update) => update ?? _current,
    default: () => 'image/jpeg',
  }),
  onboardingData: Annotation<unknown>(),
  extractedTimetableMarkdown: Annotation<string>({
    value: (_current, update) => update,
    default: () => '',
  }),
  studentProfileContext: Annotation<string>({
    value: (_current, update) => update,
    default: () => '',
  }),
  subjectCoefficients: Annotation<string>({
    value: (_current, update) => update,
    default: () => '',
  }),
  weeklyStats: Annotation<string>({
    value: (_current, update) => update,
    default: () => '',
  }),
  upcomingEcheances: Annotation<string>({
    value: (_current, update) => update,
    default: () => '',
  }),
  isValidTimetable: Annotation<boolean>({
    value: (_current, update) => update,
    default: () => true,
  }),
  validationErrorMessage: Annotation<string | undefined>({
    value: (_current, update) => update,
    default: () => undefined,
  }),
  generatedPlanning: Annotation<GeneratedSeance[]>({
    value: (_current, update) => update,
    default: () => [] satisfies GeneratedSeance[],
  }),
});

export type PlanningGraphAnnotationState = typeof PlanningGraphAnnotation.State;

export type PlanningGraphAnnotationUpdate = typeof PlanningGraphAnnotation.Update;
